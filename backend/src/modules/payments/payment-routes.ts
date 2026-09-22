/**
 * Payment & SMS Gateway Routes
 * Cổng API Webhook tiếp nhận SMS biến động số dư và các API quản lý đối soát thanh toán.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { parseIncomingSms, type SmsPayloadInput } from './sms-parser.js';
import { evaluateAndMatchTransaction, executeOrderApproval } from './payment-scoring-service.js';
import { reconcileTransaction, RECON_STATUS } from './reconciliation-service.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { randomUUID } from 'node:crypto';

export async function paymentRoutes(app: FastifyInstance) {
  // ── 0. HEALTH CHECK: Kiểm tra kết nối từ Android Gateway ────────────────────
  app.get('/api/v1/payments/sms-webhook/health', async (request: FastifyRequest, reply: FastifyReply) => {
    let token: string | undefined;
    const authHeader = request.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
    if (!token) {
      token =
        (request.headers['x-webhook-secret'] as string) ||
        (request.headers['x-api-key'] as string);
    }

    if (!token) {
      return reply.status(401).send({ status: 'unauthorized' });
    }

    const account = await prisma.bankAccount.findFirst({
      where: { webhookSecret: token, isActive: true },
    });

    if (!account) {
      return reply.status(401).send({ status: 'unauthorized' });
    }

    return reply.status(200).send({ status: 'healthy' });
  });

  // ── 1. PUBLIC WEBHOOK: Tiếp nhận SMS từ điện thoại Android ──────────────────
  app.post('/api/v1/payments/sms-webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const body = (request.body || {}) as SmsPayloadInput & {
      messageId?: string;
      message?: string;
      receivedAt?: string | number;
      secret?: string;
      api_key?: string;
      orgId?: string;
    };

    // Lấy secret token từ header Authorization (Bearer) hoặc header/body legacy
    let incomingSecret: string | undefined;
    const authHeader = request.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      incomingSecret = authHeader.slice(7).trim();
    }
    if (!incomingSecret) {
      incomingSecret =
        (request.headers['x-webhook-secret'] as string) ||
        (request.headers['x-api-key'] as string) ||
        body.secret ||
        body.api_key;
    }

    // Chuẩn hóa nội dung tin nhắn: hỗ trợ cả body.content và body.message (từ Android Gateway)
    const rawContent = (body.content ?? body.message ?? '').trim();
    if (!rawContent) {
      return reply.status(400).send({
        success: false,
        error: 'Nội dung tin nhắn (content hoặc message) không được để trống',
      });
    }

    // Chuẩn hóa thời gian: hỗ trợ cả body.timestamp (number) và body.receivedAt (chuỗi ISO-8601)
    let normalizedTimestamp = body.timestamp ?? body.receivedAt;
    if (typeof normalizedTimestamp === 'string' && isNaN(Number(normalizedTimestamp))) {
      const parsedTs = Date.parse(normalizedTimestamp);
      if (!isNaN(parsedTs)) {
        normalizedTimestamp = parsedTs;
      }
    }

    try {
      // 1. Phân tích bóc tách SMS
      const parsed = parseIncomingSms({
        ...body,
        content: rawContent,
        timestamp: normalizedTimestamp,
      });

      // 2. Xác thực Token & Tra cứu tài khoản ngân hàng trong CSDL
      let bankAccount = null;
      if (incomingSecret) {
        bankAccount = await prisma.bankAccount.findFirst({
          where: { webhookSecret: incomingSecret, isActive: true },
        });

        if (!bankAccount) {
          logger.warn('[sms-webhook] Webhook secret token không hợp lệ hoặc tài khoản không tồn tại/chưa kích hoạt');
          return reply.status(401).send({
            success: false,
            error: 'Webhook secret token không hợp lệ',
          });
        }
      } else {
        // Legacy fallback: Không có token gửi lên
        if (parsed.accountNumber) {
          bankAccount = await prisma.bankAccount.findFirst({
            where: { accountNumber: parsed.accountNumber, isActive: true },
          });
        }
        if (!bankAccount) {
          bankAccount = await prisma.bankAccount.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'asc' },
          });
        }
        // Nếu tài khoản yêu cầu webhookSecret mà request không gửi token
        if (bankAccount?.webhookSecret) {
          logger.warn(`[sms-webhook] Thiếu webhook secret token cho tài khoản ${bankAccount.accountNumber}`);
          return reply.status(401).send({
            success: false,
            error: 'Thiếu mã xác thực (Authorization: Bearer <TOKEN>)',
          });
        }
      }

      const orgId = bankAccount?.orgId || body.orgId || (await prisma.organization.findFirst())?.id;
      if (!orgId) {
        return reply.status(500).send({ success: false, error: 'Chưa có tổ chức nào được cấu hình trong hệ thống' });
      }

      // 3. Kiểm tra chống trùng lặp đa tầng (Multi-layer Anti-Duplicate)
      // Tầng 1: Kiểm tra theo gatewayMessageId (SHA-256 từ Android Gateway)
      if (body.messageId) {
        const existingByGatewayId = await prisma.bankTransaction.findUnique({
          where: { gatewayMessageId: body.messageId },
        });

        if (existingByGatewayId) {
          logger.info(`[sms-webhook] Phát hiện tin nhắn trùng lặp từ Gateway (gatewayMessageId: ${body.messageId.slice(0, 10)}...) -> Bỏ qua`);
          return reply.status(200).send({
            success: true,
            message: 'Giao dịch đã được ghi nhận trước đó (Idempotent by Gateway Message ID)',
            transactionId: existingByGatewayId.id,
            status: (existingByGatewayId as any).reconciliationStatus || existingByGatewayId.status,
            isDuplicate: true,
          });
        }
      }

      // Tầng 2: Kiểm tra chống trùng lặp nghiệp vụ (Idempotency Hash nội dung)
      const existingTx = await prisma.bankTransaction.findUnique({
        where: { idempotencyHash: parsed.idempotencyHash },
      });

      if (existingTx) {
        logger.info(`[sms-webhook] Phát hiện tin nhắn trùng lặp (Idempotency Hash: ${parsed.idempotencyHash.slice(0, 10)}...) -> Bỏ qua`);
        return reply.status(200).send({
          success: true,
          message: 'Giao dịch đã được ghi nhận trước đó (Idempotent)',
          transactionId: existingTx.id,
          status: (existingTx as any).reconciliationStatus || existingTx.status,
          isDuplicate: true,
        });
      }

      // 4. Chạy Reconciliation 2 tầng (Hard Rules + Scoring)
      const reconciliation = await reconcileTransaction(orgId, parsed, bankAccount?.id);

      // 5. Chạy Legacy Scoring Engine (backward-compatible, dùng cho các case không có order code)
      const scoring = await evaluateAndMatchTransaction(orgId, parsed, bankAccount?.id);

      // Merge: Reconciliation ưu tiên, legacy scoring làm fallback
      const finalStatus = reconciliation.legacyScoringStatus;
      const finalSuggestedHistoryId = reconciliation.matchedOrderHistoryId || scoring.suggestedOrderHistoryId;
      const finalSuggestedOrderId = reconciliation.matchedOrderId || scoring.suggestedOrderId;
      const finalSuggestedCode = reconciliation.matchedOrderCode || scoring.suggestedOrderCode;
      const finalMatchedBy = reconciliation.legacyMatchedBy || scoring.matchedBy || null;
      const finalAutoApprove = reconciliation.legacyAutoApproveEligible || scoring.autoApproveEligible;

      // 6. Lưu bản ghi BankTransaction vào PostgreSQL
      const newTx = await (prisma.bankTransaction.create as any)({
        data: {
          id: randomUUID(),
          orgId,
          bankAccountId: bankAccount?.id || null,
          bankCode: parsed.bankCode || 'MB',
          accountNumber: parsed.accountNumber || bankAccount?.accountNumber || 'UNKNOWN',
          deviceId: body.deviceId || null,
          gatewayMessageId: body.messageId || null,
          amount: parsed.amount,
          type: parsed.type,
          balanceAfter: parsed.balanceAfter,
          transactionTime: parsed.transactionTime,
          refCode: parsed.refCode,
          senderNameRaw: parsed.senderNameRaw,
          description: parsed.description,
          rawSms: parsed.rawSms,
          idempotencyHash: parsed.idempotencyHash,
          // Parsed data (raw SMS vẫn được giữ nguyên)
          parsedOrderCode: parsed.parsedOrderCode,
          parsedCustomerName: parsed.parsedCustomerName,
          // Reconciliation 2-tier results
          reconciliationStatus: reconciliation.status,
          reconciliationScore: reconciliation.score,
          reconciliationReasons: reconciliation.reasons,
          // Legacy scoring (backward-compatible)
          confidenceScore: scoring.confidenceScore,
          scoringDetails: scoring.scoringDetails,
          status: finalStatus,
          suggestedOrderHistoryId: finalSuggestedHistoryId,
          suggestedOrderId: finalSuggestedOrderId,
          matchedOrderCode: finalSuggestedCode,
          matchedBy: finalMatchedBy,
        },
      });

      // 7. Giao dịch mới nhận được chỉ ở trạng thái 'Khớp đề xuất / Chờ duyệt' (hoặc cần kiểm tra),
      // không tự ý đánh dấu đã thanh toán mà phải chờ nhân viên kế toán bấm 'Xác nhận thanh toán'.
      logger.info(
        `[sms-webhook] Nhận SMS giao dịch #${newTx.id} - Số tiền: ${parsed.amount.toLocaleString('vi-VN')} đ - Trạng thái: ${finalStatus} (Chờ kế toán xác nhận)`
      );

      // 8. Bắn Socket.IO realtime để giao diện hiển thị dòng mới ngay tức thì
      try {
        zaloPool.getIO()?.emit('payment:new_transaction', {
          transaction: newTx,
          scoring,
          reconciliation: {
            status: reconciliation.status,
            score: reconciliation.score,
            reasons: reconciliation.reasons,
          },
        });
      } catch (err) {}

      const durationMs = Date.now() - startTime;
      logger.info(`[sms-webhook] Xử lý SMS MB Bank thành công trong ${durationMs}ms - Số tiền: ${parsed.amount.toLocaleString('vi-VN')} đ - Reconciliation: ${reconciliation.status} (score: ${reconciliation.score}) - Legacy: ${finalStatus}`);

      return reply.send({
        success: true,
        transactionId: newTx.id,
        // Reconciliation 2-tier response
        status: reconciliation.status,
        score: reconciliation.score,
        reasons: reconciliation.reasons,
        orderCode: finalSuggestedCode,
        parsedOrderCode: parsed.parsedOrderCode,
        parsedCustomerName: parsed.parsedCustomerName,
        // Legacy fields (backward-compatible)
        confidenceScore: scoring.confidenceScore,
        suggestedOrderCode: finalSuggestedCode,
        autoApproved: finalAutoApprove && reconciliation.status === RECON_STATUS.AUTO_PAID,
      });
    } catch (err: any) {
      logger.error('[sms-webhook] Lỗi xử lý SMS:', err);
      return reply.status(500).send({
        success: false,
        error: err.message || 'Lỗi xử lý tin nhắn SMS ngân hàng',
      });
    }
  });

  // GET /api/v1/payments/simulator-accounts — Danh sách tài khoản ngân hàng phục vụ giả lập & test
  app.get('/api/v1/payments/simulator-accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const accounts = await prisma.bankAccount.findMany({
        where: { isActive: true },
        select: {
          id: true,
          bankCode: true,
          bankName: true,
          accountNumber: true,
          accountHolder: true,
          webhookSecret: true,
          autoApprove: true,
          minTrustScore: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      return reply.send({ success: true, accounts });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/v1/payments/test-parse — Trình giả lập bóc tách SMS (Dry-run parser & scoring preview)
  app.post('/api/v1/payments/test-parse', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as {
      sender?: string;
      content?: string;
      message?: string;
      timestamp?: number | string;
      receivedAt?: string;
      simAccountNumber?: string;
      bankAccountId?: string;
      orgId?: string;
    };

    const rawContent = (body.content ?? body.message ?? '').trim();
    if (!rawContent) {
      return reply.status(400).send({
        success: false,
        error: 'Nội dung tin nhắn không được để trống',
      });
    }

    try {
      // 1. Chuẩn hóa timestamp
      let normalizedTimestamp: any = body.timestamp ?? body.receivedAt ?? Date.now();
      if (typeof normalizedTimestamp === 'string' && isNaN(Number(normalizedTimestamp))) {
        const parsedTs = Date.parse(normalizedTimestamp);
        if (!isNaN(parsedTs)) {
          normalizedTimestamp = parsedTs;
        }
      }

      // 2. Phân tích bóc tách cú pháp SMS
      const parsed = parseIncomingSms({
        ...body,
        content: rawContent,
        timestamp: normalizedTimestamp,
      });

      // 3. Tra cứu tài khoản ngân hàng liên kết
      let incomingSecret: string | undefined;
      const authHeader = request.headers['authorization'];
      if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        incomingSecret = authHeader.slice(7).trim();
      }
      if (!incomingSecret) {
        incomingSecret =
          (request.headers['x-webhook-secret'] as string) ||
          (request.headers['x-api-key'] as string) ||
          (body as any).secret;
      }

      let bankAccount = null;
      if (body.bankAccountId) {
        bankAccount = await prisma.bankAccount.findUnique({
          where: { id: body.bankAccountId },
        });
      } else if (incomingSecret) {
        bankAccount = await prisma.bankAccount.findFirst({
          where: { webhookSecret: incomingSecret, isActive: true },
        });
      } else if (parsed.accountNumber || body.simAccountNumber) {
        bankAccount = await prisma.bankAccount.findFirst({
          where: {
            accountNumber: parsed.accountNumber || body.simAccountNumber,
            isActive: true,
          },
        });
      }

      const orgId = bankAccount?.orgId || body.orgId || (await prisma.organization.findFirst())?.id;
      if (!orgId) {
        return reply.status(500).send({ success: false, error: 'Chưa có tổ chức nào được cấu hình trong hệ thống' });
      }

      // 4. Đánh giá thử nghiệm qua Scoring Engine (Dry-run, không lưu DB)
      const scoring = await evaluateAndMatchTransaction(orgId, parsed, bankAccount?.id);

      return reply.send({
        success: true,
        dryRun: true,
        parsed,
        scoring,
        bankAccount: bankAccount ? {
          id: bankAccount.id,
          bankCode: bankAccount.bankCode,
          bankName: bankAccount.bankName,
          accountNumber: bankAccount.accountNumber,
          accountHolder: bankAccount.accountHolder,
          autoApprove: bankAccount.autoApprove,
          minTrustScore: bankAccount.minTrustScore,
        } : null,
      });
    } catch (err: any) {
      logger.error('[test-parse] Lỗi bóc tách thử nghiệm:', err);
      return reply.status(500).send({
        success: false,
        error: err.message || 'Lỗi bóc tách tin nhắn SMS',
      });
    }
  });

  // ── 2. CÁC API QUẢN TRỊ & ĐỐI SOÁT (Yêu Cầu Đăng Nhập) ────────────────────
  app.register(async (authGroup) => {
    authGroup.addHook('preHandler', authMiddleware);

    // GET /api/v1/payments/stats — Thống kê tổng quan thanh toán
    authGroup.get('/api/v1/payments/stats', async (request: FastifyRequest) => {
      const user = request.user!;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [
        totalInTodayAgg,
        totalMatchedToday,
        pendingReviewCount,
        accounts,
      ] = await Promise.all([
        prisma.bankTransaction.aggregate({
          where: {
            orgId: user.orgId,
            type: 'IN',
            transactionTime: { gte: todayStart },
          },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.bankTransaction.count({
          where: {
            orgId: user.orgId,
            status: 'MATCHED',
            transactionTime: { gte: todayStart },
          },
        }),
        prisma.bankTransaction.count({
          where: {
            orgId: user.orgId,
            status: { in: ['PENDING', 'SUGGESTED', 'PARTIAL', 'MANUAL_REVIEW'] },
          },
        }),
        prisma.bankAccount.findMany({
          where: { orgId: user.orgId, isActive: true },
          select: { id: true, bankName: true, accountNumber: true, accountHolder: true },
        }),
      ]);

      return {
        todayTotalAmount: totalInTodayAgg._sum.amount || 0,
        todayTxCount: totalInTodayAgg._count._all || 0,
        todayMatchedCount: totalMatchedToday,
        pendingReviewCount,
        accountsCount: accounts.length,
      };
    });

    // GET /api/v1/payments/transactions — Danh sách giao dịch đối soát
    authGroup.get('/api/v1/payments/transactions', async (request: FastifyRequest) => {
      const user = request.user!;
      const query = (request.query || {}) as {
        page?: string;
        limit?: string;
        status?: string;
        bankAccountId?: string;
        search?: string;
        from?: string;
        to?: string;
        tab?: 'pending' | 'approved' | 'all';
      };

      const page = Math.max(1, parseInt(query.page || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(query.limit || '25', 10)));
      const skip = (page - 1) * limit;

      const baseWhere: any = { orgId: user.orgId };

      if (query.bankAccountId) {
        baseWhere.bankAccountId = query.bankAccountId;
      }
      if (query.search) {
        const s = query.search.trim();
        baseWhere.OR = [
          { description: { contains: s, mode: 'insensitive' } },
          { matchedOrderCode: { contains: s, mode: 'insensitive' } },
          { senderNameRaw: { contains: s, mode: 'insensitive' } },
          { accountNumber: { contains: s } },
        ];
      }
      if (query.from || query.to) {
        baseWhere.transactionTime = {};
        if (query.from) baseWhere.transactionTime.gte = new Date(query.from);
        if (query.to) baseWhere.transactionTime.lte = new Date(query.to.includes('T') ? query.to : `${query.to}T23:59:59.999Z`);
      }

      // Đếm số lượng cho 2 tab: CHƯA DUYỆT và ĐÃ DUYỆT
      const [pendingCount, approvedCount] = await Promise.all([
        prisma.bankTransaction.count({
          where: { ...baseWhere, status: { not: 'MATCHED' } },
        }),
        prisma.bankTransaction.count({
          where: { ...baseWhere, status: 'MATCHED' },
        }),
      ]);

      const where: any = { ...baseWhere };

      if (query.tab === 'approved') {
        where.status = 'MATCHED';
      } else if (query.tab === 'pending') {
        if (query.status) {
          where.status = query.status;
        } else {
          where.status = { not: 'MATCHED' };
        }
      } else if (query.status) {
        where.status = query.status;
      }

      const [transactions, total] = await Promise.all([
        prisma.bankTransaction.findMany({
          where,
          include: {
            bankAccount: { select: { bankName: true, accountNumber: true, accountHolder: true } },
            matchedOrderHistory: { select: { id: true, orderCode: true, partnerName: true, amountTotal: true, state: true, paidAmount: true } },
            matchedOrder: { select: { id: true, orderCode: true, totalAmount: true, status: true, paidAmount: true } },
          },
          orderBy: { transactionTime: 'desc' },
          skip,
          take: limit,
        }),
        prisma.bankTransaction.count({ where }),
      ]);

      // Enrich: Tìm thông tin đơn đề xuất và người duyệt
      const suggestedHistoryIds = transactions
        .map((t) => t.suggestedOrderHistoryId)
        .filter(Boolean) as string[];
      const suggestedOrderIds = transactions
        .map((t) => t.suggestedOrderId)
        .filter(Boolean) as string[];
      const matchedUserIds = transactions
        .map((t) => t.matchedUserId)
        .filter(Boolean) as string[];

      const [suggestedHistories, suggestedCrmOrders, matchedUsers] = await Promise.all([
        suggestedHistoryIds.length > 0
          ? prisma.orderHistory.findMany({
              where: { id: { in: suggestedHistoryIds }, orgId: user.orgId },
              select: {
                id: true,
                orderCode: true,
                partnerName: true,
                amountTotal: true,
                state: true,
                paidAmount: true,
                customerProfile: { select: { name: true, phone: true } },
              },
            })
          : [],
        suggestedOrderIds.length > 0
          ? prisma.order.findMany({
              where: { id: { in: suggestedOrderIds }, orgId: user.orgId },
              select: {
                id: true,
                orderCode: true,
                totalAmount: true,
                status: true,
                paidAmount: true,
                contact: { select: { fullName: true, phone: true } },
              },
            })
          : [],
        matchedUserIds.length > 0
          ? prisma.user.findMany({
              where: { id: { in: matchedUserIds } },
              select: { id: true, fullName: true, email: true },
            })
          : [],
      ]);

      const historyMap = new Map(suggestedHistories.map((h) => [h.id, h]));
      const crmMap = new Map(suggestedCrmOrders.map((o) => [o.id, o]));
      const userMap = new Map(matchedUsers.map((u) => [u.id, u]));

      const enrichedTransactions = transactions.map((t) => {
        let suggestedOrder = null;
        if (t.suggestedOrderHistoryId && historyMap.has(t.suggestedOrderHistoryId)) {
          const h = historyMap.get(t.suggestedOrderHistoryId)!;
          suggestedOrder = {
            id: h.id,
            orderCode: h.orderCode,
            customerName: h.partnerName || h.customerProfile?.name || 'Khách hàng',
            customerPhone: h.customerProfile?.phone || null,
            amountTotal: h.amountTotal || 0,
            paidAmount: h.paidAmount || 0,
            status: h.state,
            isHistoryOrder: true,
          };
        } else if (t.suggestedOrderId && crmMap.has(t.suggestedOrderId)) {
          const o = crmMap.get(t.suggestedOrderId)!;
          suggestedOrder = {
            id: o.id,
            orderCode: o.orderCode,
            customerName: o.contact?.fullName || 'Khách hàng',
            customerPhone: o.contact?.phone || null,
            amountTotal: o.totalAmount || 0,
            paidAmount: o.paidAmount || 0,
            status: o.status,
            isHistoryOrder: false,
          };
        }

        const matchedUser = t.matchedUserId && userMap.has(t.matchedUserId) ? userMap.get(t.matchedUserId) : null;

        return {
          ...t,
          suggestedOrder,
          matchedUser,
        };
      });

      return {
        transactions: enrichedTransactions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        pendingCount,
        approvedCount,
      };
    });

    // POST /api/v1/payments/transactions/:id/approve — Kế toán duyệt khớp 1-Click
    authGroup.post('/api/v1/payments/transactions/:id/approve', async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = (request.body || {}) as { targetOrderId?: string; isHistoryOrder?: boolean };

      try {
        const result = await executeOrderApproval(
          user.orgId,
          id,
          user.id,
          body.targetOrderId,
          body.isHistoryOrder !== false
        );

        return reply.send(result);
      } catch (err: any) {
        logger.error('[payments-approve] Lỗi duyệt giao dịch:', err);
        return reply.status(400).send({ error: err.message || 'Lỗi khi xác nhận thanh toán' });
      }
    });

    // GET /api/v1/payments/orders-lookup — Tra cứu danh sách đơn hàng cho popup chọn đơn
    authGroup.get('/api/v1/payments/orders-lookup', async (request: FastifyRequest) => {
      const user = request.user!;
      const query = (request.query || {}) as {
        search?: string;
        status?: string;
        limit?: string;
      };

      const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
      const search = (query.search || '').trim();
      const statusFilter = (query.status || '').trim().toLowerCase();

      // 1. Tìm trong OrderHistory (đơn Odoo/hệ thống)
      const historyWhere: any = { orgId: user.orgId };
      if (search) {
        historyWhere.OR = [
          { orderCode: { contains: search, mode: 'insensitive' } },
          { partnerName: { contains: search, mode: 'insensitive' } },
          { customerProfile: { name: { contains: search, mode: 'insensitive' } } },
          { customerProfile: { phone: { contains: search } } },
        ];
      }
      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'pending') {
          historyWhere.state = { in: ['draft', 'sent', 'sale'] };
        } else if (statusFilter === 'done') {
          historyWhere.state = { in: ['done', 'paid'] };
        } else if (statusFilter === 'cancel') {
          historyWhere.state = 'cancel';
        } else {
          historyWhere.state = statusFilter;
        }
      }

      // 2. Tìm trong Order (đơn CRM nội bộ)
      const orderWhere: any = { orgId: user.orgId };
      if (search) {
        orderWhere.OR = [
          { orderCode: { contains: search, mode: 'insensitive' } },
          { contact: { fullName: { contains: search, mode: 'insensitive' } } },
          { contact: { phone: { contains: search } } },
        ];
      }
      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'pending') {
          orderWhere.status = { in: ['new', 'draft', 'pending', 'processing', 'confirmed'] };
        } else if (statusFilter === 'done') {
          orderWhere.status = { in: ['paid', 'completed'] };
        } else if (statusFilter === 'cancel') {
          orderWhere.status = 'cancelled';
        } else {
          orderWhere.status = statusFilter;
        }
      }

      const [histories, crmOrders] = await Promise.all([
        prisma.orderHistory.findMany({
          where: historyWhere,
          include: { customerProfile: true },
          orderBy: { dateOrder: 'desc' },
          take: limit,
        }),
        prisma.order.findMany({
          where: orderWhere,
          include: { contact: true },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
      ]);

      const unifiedOrders = [
        ...histories.map((h) => ({
          id: h.id,
          orderCode: h.orderCode,
          customerName: h.partnerName || h.customerProfile?.name || 'Khách hàng',
          customerPhone: h.customerProfile?.phone || null,
          orderDate: h.dateOrder || h.createdAt,
          status: h.state || 'sale',
          amountTotal: h.amountTotal || 0,
          isHistoryOrder: true,
          source: 'Hệ thống',
        })),
        ...crmOrders.map((o) => ({
          id: o.id,
          orderCode: o.orderCode,
          customerName: o.contact?.fullName || 'Khách hàng CRM',
          customerPhone: o.contact?.phone || null,
          orderDate: o.createdAt,
          status: o.status || 'new',
          amountTotal: o.totalAmount || 0,
          isHistoryOrder: false,
          source: 'CRM',
        })),
      ];

      unifiedOrders.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());

      return {
        success: true,
        orders: unifiedOrders.slice(0, limit),
      };
    });

    // GET /api/v1/payments/accounts — Danh sách tài khoản ngân hàng
    authGroup.get('/api/v1/payments/accounts', async (request: FastifyRequest) => {
      const user = request.user!;
      const accounts = await prisma.bankAccount.findMany({
        where: { orgId: user.orgId },
        include: {
          _count: { select: { transactions: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      return { accounts };
    });

    // POST /api/v1/payments/accounts — Thêm hoặc cập nhật tài khoản ngân hàng
    authGroup.post('/api/v1/payments/accounts', async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      if (!['owner', 'admin'].includes(user.role)) {
        return reply.status(403).send({ error: 'Chỉ quản trị viên mới có quyền quản lý tài khoản ngân hàng' });
      }

      const body = (request.body || {}) as {
        id?: string;
        bankName?: string;
        bankCode?: string;
        accountNumber: string;
        accountHolder: string;
        branch?: string;
        webhookSecret?: string;
        autoApprove?: boolean;
        minTrustScore?: number;
        isActive?: boolean;
      };

      if (!body.accountNumber || !body.accountHolder) {
        return reply.status(400).send({ error: 'Vui lòng cung cấp số tài khoản và tên chủ tài khoản' });
      }

      const accountNumberTrimmed = body.accountNumber.trim();
      const accountHolderTrimmed = body.accountHolder.trim().toUpperCase();

      // Trường hợp 1: Cập nhật tài khoản đã tồn tại theo ID
      if (body.id) {
        const existing = await prisma.bankAccount.findFirst({
          where: { id: body.id, orgId: user.orgId },
        });

        if (!existing) {
          return reply.status(404).send({ error: 'Không tìm thấy tài khoản ngân hàng' });
        }

        // Kiểm tra xem số tài khoản mới có bị trùng với tài khoản khác trong cùng org không
        const dupAcc = await prisma.bankAccount.findFirst({
          where: {
            orgId: user.orgId,
            accountNumber: accountNumberTrimmed,
            NOT: { id: body.id },
          },
        });
        if (dupAcc) {
          return reply.status(400).send({ error: 'Số tài khoản này đã được sử dụng bởi tài khoản khác' });
        }

        // Kiểm tra webhookSecret mới có bị trùng với tài khoản khác không
        const targetSecret = body.webhookSecret?.trim() || existing.webhookSecret;
        if (targetSecret !== existing.webhookSecret) {
          const dupSecret = await prisma.bankAccount.findUnique({
            where: { webhookSecret: targetSecret },
          });
          if (dupSecret) {
            return reply.status(400).send({ error: 'Mã Webhook Secret này đã tồn tại trong hệ thống' });
          }
        }

        const updated = await prisma.bankAccount.update({
          where: { id: body.id },
          data: {
            bankName: body.bankName?.trim() || existing.bankName,
            bankCode: body.bankCode?.trim() || existing.bankCode,
            accountNumber: accountNumberTrimmed,
            accountHolder: accountHolderTrimmed,
            branch: body.branch !== undefined ? body.branch : existing.branch,
            webhookSecret: targetSecret,
            autoApprove: body.autoApprove !== undefined ? body.autoApprove : existing.autoApprove,
            minTrustScore: body.minTrustScore !== undefined ? body.minTrustScore : existing.minTrustScore,
            isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
          },
        });

        return reply.send({ success: true, account: updated });
      }

      // Trường hợp 2: Thêm mới tài khoản
      const dupAcc = await prisma.bankAccount.findFirst({
        where: {
          orgId: user.orgId,
          accountNumber: accountNumberTrimmed,
        },
      });
      if (dupAcc) {
        return reply.status(400).send({ error: 'Số tài khoản này đã tồn tại trong tổ chức' });
      }

      const secret = (body.webhookSecret || randomUUID().replace(/-/g, '').slice(0, 16)).trim();
      const dupSecret = await prisma.bankAccount.findUnique({
        where: { webhookSecret: secret },
      });
      if (dupSecret) {
        return reply.status(400).send({ error: 'Mã Webhook Secret này đã được sử dụng, vui lòng đổi mã khác' });
      }

      const newAccount = await prisma.bankAccount.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          bankName: body.bankName?.trim() || 'MB Bank',
          bankCode: body.bankCode?.trim() || 'MB',
          accountNumber: accountNumberTrimmed,
          accountHolder: accountHolderTrimmed,
          branch: body.branch?.trim() || null,
          webhookSecret: secret,
          autoApprove: body.autoApprove ?? false,
          minTrustScore: body.minTrustScore ?? 85,
          isActive: body.isActive !== undefined ? body.isActive : true,
        },
      });

      return reply.send({ success: true, account: newAccount });
    });

    // DELETE /api/v1/payments/accounts/:id — Xóa tài khoản ngân hàng
    authGroup.delete('/api/v1/payments/accounts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      if (!['owner', 'admin'].includes(user.role)) {
        return reply.status(403).send({ error: 'Chỉ quản trị viên mới có quyền xóa tài khoản ngân hàng' });
      }

      const { id } = request.params as { id: string };
      const account = await prisma.bankAccount.findFirst({
        where: { id, orgId: user.orgId },
      });

      if (!account) {
        return reply.status(404).send({ error: 'Không tìm thấy tài khoản ngân hàng cần xóa' });
      }

      await prisma.bankAccount.delete({
        where: { id },
      });

      return reply.send({ success: true, message: 'Đã xóa tài khoản ngân hàng thành công' });
    });

    // GET /api/v1/payments/senders — Danh sách danh tính người chuyển đã học (Whitelist)
    authGroup.get('/api/v1/payments/senders', async (request: FastifyRequest) => {
      const user = request.user!;
      const senders = await prisma.senderIdentity.findMany({
        where: { orgId: user.orgId },
        include: {
          contact: { select: { id: true, fullName: true, phone: true } },
        },
        orderBy: { successMatchCount: 'desc' },
      });

      return { senders };
    });

    // PATCH /api/v1/payments/senders/:id — Cập nhật cờ tự động duyệt cho khách quen
    authGroup.patch('/api/v1/payments/senders/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = (request.body || {}) as { isAutoApproved?: boolean; trustLevel?: string };

      const updated = await prisma.senderIdentity.update({
        where: { id },
        data: {
          ...(body.isAutoApproved !== undefined ? { isAutoApproved: body.isAutoApproved } : {}),
          ...(body.trustLevel ? { trustLevel: body.trustLevel } : {}),
        },
      });

      return { success: true, sender: updated };
    });
  });
}
