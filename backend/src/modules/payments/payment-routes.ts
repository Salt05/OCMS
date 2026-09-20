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
import { zaloPool } from '../zalo/zalo-pool.js';
import { randomUUID } from 'node:crypto';

export async function paymentRoutes(app: FastifyInstance) {
  // ── 1. PUBLIC WEBHOOK: Tiếp nhận SMS từ điện thoại Android ──────────────────
  app.post('/api/v1/payments/sms-webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const body = (request.body || {}) as SmsPayloadInput & {
      secret?: string;
      api_key?: string;
      orgId?: string;
    };

    // Lấy secret token từ header hoặc body
    const incomingSecret =
      (request.headers['x-webhook-secret'] as string) ||
      (request.headers['x-api-key'] as string) ||
      body.secret ||
      body.api_key;

    if (!body.content || typeof body.content !== 'string') {
      return reply.status(400).send({
        success: false,
        error: 'Nội dung tin nhắn (content) không được để trống',
      });
    }

    try {
      // 1. Phân tích bóc tách SMS
      const parsed = parseIncomingSms(body);

      // 2. Tra cứu tài khoản ngân hàng trong CSDL
      let bankAccount = parsed.accountNumber
        ? await prisma.bankAccount.findFirst({
            where: { accountNumber: parsed.accountNumber, isActive: true },
          })
        : null;

      // Nếu không tìm thấy theo STK bóc tách, thử tìm theo SIM slot hoặc lấy tài khoản MB đầu tiên
      if (!bankAccount) {
        bankAccount = await prisma.bankAccount.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
        });
      }

      // Xác thực Token: Nếu tài khoản có cấu hình webhookSecret thì bắt buộc phải khớp
      if (bankAccount?.webhookSecret && incomingSecret) {
        if (bankAccount.webhookSecret !== incomingSecret) {
          logger.warn(`[sms-webhook] Sai secret token cho tài khoản ${bankAccount.accountNumber}`);
          return reply.status(401).send({
            success: false,
            error: 'Webhook secret token không hợp lệ',
          });
        }
      }

      const orgId = bankAccount?.orgId || body.orgId || (await prisma.organization.findFirst())?.id;
      if (!orgId) {
        return reply.status(500).send({ success: false, error: 'Chưa có tổ chức nào được cấu hình trong hệ thống' });
      }

      // 3. Kiểm tra chống trùng lặp (Anti-Duplicate / Idempotency Check)
      const existingTx = await prisma.bankTransaction.findUnique({
        where: { idempotencyHash: parsed.idempotencyHash },
      });

      if (existingTx) {
        logger.info(`[sms-webhook] Phát hiện tin nhắn trùng lặp (Idempotency Hash: ${parsed.idempotencyHash.slice(0, 10)}...) -> Bỏ qua`);
        return reply.status(200).send({
          success: true,
          message: 'Giao dịch đã được ghi nhận trước đó (Idempotent)',
          transactionId: existingTx.id,
          status: existingTx.status,
          isDuplicate: true,
        });
      }

      // 4. Đưa vào Bộ não Chấm điểm & So khớp Đơn hàng (Scoring Engine)
      const scoring = await evaluateAndMatchTransaction(orgId, parsed, bankAccount?.id);

      // 5. Lưu bản ghi BankTransaction vào PostgreSQL
      const newTx = await prisma.bankTransaction.create({
        data: {
          id: randomUUID(),
          orgId,
          bankAccountId: bankAccount?.id || null,
          bankCode: parsed.bankCode || 'MB',
          accountNumber: parsed.accountNumber || bankAccount?.accountNumber || 'UNKNOWN',
          deviceId: body.deviceId || null,
          amount: parsed.amount,
          type: parsed.type,
          balanceAfter: parsed.balanceAfter,
          transactionTime: parsed.transactionTime,
          refCode: parsed.refCode,
          senderNameRaw: parsed.senderNameRaw,
          description: parsed.description,
          rawSms: parsed.rawSms,
          idempotencyHash: parsed.idempotencyHash,
          confidenceScore: scoring.confidenceScore,
          scoringDetails: scoring.scoringDetails,
          status: scoring.status,
          suggestedOrderHistoryId: scoring.suggestedOrderHistoryId,
          suggestedOrderId: scoring.suggestedOrderId,
          matchedOrderCode: scoring.suggestedOrderCode,
          matchedBy: scoring.matchedBy || null,
        },
      });

      // 6. Nếu đủ điều kiện tự động duyệt (Giai đoạn 2), kích hoạt duyệt ngay lập tức!
      if (scoring.autoApproveEligible && scoring.status === 'MATCHED') {
        try {
          await executeOrderApproval(
            orgId,
            newTx.id,
            undefined, // Hệ thống tự duyệt
            scoring.suggestedOrderHistoryId || scoring.suggestedOrderId || undefined,
            !!scoring.suggestedOrderHistoryId
          );
          logger.info(`[sms-webhook] TỰ ĐỘNG DUYỆT THÀNH CÔNG đơn hàng #${scoring.suggestedOrderCode}`);
        } catch (autoErr: any) {
          logger.warn(`[sms-webhook] Lỗi khi tự động duyệt đơn: ${autoErr.message}`);
        }
      }

      // 7. Bắn Socket.IO realtime để giao diện hiển thị dòng mới ngay tức thì
      try {
        zaloPool.getIO()?.emit('payment:new_transaction', {
          transaction: newTx,
          scoring,
        });
      } catch (err) {}

      const durationMs = Date.now() - startTime;
      logger.info(`[sms-webhook] Xử lý SMS MB Bank thành công trong ${durationMs}ms - Số tiền: ${parsed.amount.toLocaleString('vi-VN')} đ - Điểm: ${scoring.confidenceScore}/100 - Trạng thái: ${scoring.status}`);

      return reply.send({
        success: true,
        transactionId: newTx.id,
        status: scoring.status,
        confidenceScore: scoring.confidenceScore,
        suggestedOrderCode: scoring.suggestedOrderCode,
        autoApproved: scoring.autoApproveEligible,
      });
    } catch (err: any) {
      logger.error('[sms-webhook] Lỗi xử lý SMS:', err);
      return reply.status(500).send({
        success: false,
        error: err.message || 'Lỗi xử lý tin nhắn SMS ngân hàng',
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
      };

      const page = Math.max(1, parseInt(query.page || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(query.limit || '25', 10)));
      const skip = (page - 1) * limit;

      const where: any = { orgId: user.orgId };

      if (query.status) {
        where.status = query.status;
      }
      if (query.bankAccountId) {
        where.bankAccountId = query.bankAccountId;
      }
      if (query.search) {
        const s = query.search.trim();
        where.OR = [
          { description: { contains: s, mode: 'insensitive' } },
          { matchedOrderCode: { contains: s, mode: 'insensitive' } },
          { senderNameRaw: { contains: s, mode: 'insensitive' } },
          { accountNumber: { contains: s } },
        ];
      }
      if (query.from || query.to) {
        where.transactionTime = {};
        if (query.from) where.transactionTime.gte = new Date(query.from);
        if (query.to) where.transactionTime.lte = new Date(query.to.includes('T') ? query.to : `${query.to}T23:59:59.999Z`);
      }

      const [transactions, total] = await Promise.all([
        prisma.bankTransaction.findMany({
          where,
          include: {
            bankAccount: { select: { bankName: true, accountNumber: true, accountHolder: true } },
            matchedOrderHistory: { select: { id: true, orderCode: true, partnerName: true, amountTotal: true, state: true } },
            matchedOrder: { select: { id: true, orderCode: true, totalAmount: true, status: true } },
          },
          orderBy: { transactionTime: 'desc' },
          skip,
          take: limit,
        }),
        prisma.bankTransaction.count({ where }),
      ]);

      return {
        transactions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
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

    // GET /api/v1/payments/accounts — Danh sách 2 tài khoản ngân hàng MB
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
      };

      if (!body.accountNumber || !body.accountHolder) {
        return reply.status(400).send({ error: 'Vui lòng cung cấp số tài khoản và tên chủ tài khoản' });
      }

      const secret = body.webhookSecret || randomUUID().replace(/-/g, '').slice(0, 16);

      const account = await prisma.bankAccount.upsert({
        where: {
          orgId_accountNumber: {
            orgId: user.orgId,
            accountNumber: body.accountNumber.trim(),
          },
        },
        create: {
          id: body.id || randomUUID(),
          orgId: user.orgId,
          bankName: body.bankName || 'MB Bank',
          bankCode: body.bankCode || 'MB',
          accountNumber: body.accountNumber.trim(),
          accountHolder: body.accountHolder.trim().toUpperCase(),
          branch: body.branch || null,
          webhookSecret: secret,
          autoApprove: body.autoApprove ?? false,
          minTrustScore: body.minTrustScore ?? 85,
        },
        update: {
          bankName: body.bankName,
          bankCode: body.bankCode,
          accountHolder: body.accountHolder.trim().toUpperCase(),
          branch: body.branch,
          ...(body.webhookSecret ? { webhookSecret: body.webhookSecret } : {}),
          ...(body.autoApprove !== undefined ? { autoApprove: body.autoApprove } : {}),
          ...(body.minTrustScore !== undefined ? { minTrustScore: body.minTrustScore } : {}),
        },
      });

      return { success: true, account };
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
