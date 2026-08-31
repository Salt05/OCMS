/**
 * Order management routes — CRUD + stats + per-staff report.
 * All routes require authentication via authMiddleware.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { randomUUID } from 'node:crypto';
import { extractOrderFromConversation, extractOrderFromText, modifyOrderDraft } from './ai-order-service.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { odooService } from '../odoo/odoo-service.js';
import { odooSyncService } from '../sync/odoo-sync-service.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function orderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // Generate order code: ORD-YYYYMMDD-NNN
  async function generateOrderCode(orgId: string): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await prisma.order.count({
      where: { orgId, orderCode: { startsWith: `ORD-${today}` } },
    });
    return `ORD-${today}-${String(count + 1).padStart(3, '0')}`;
  }

  // ── AI-powered order extraction from chat messages ─────────────────────────
  app.post('/api/v1/orders/ai-extract', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = request.body as any;

    try {
      let draft;

      if (body.conversationId) {
        // Extract from customer's conversation messages in chat history (with optional staff instruction)
        draft = await extractOrderFromConversation(user.orgId, body.conversationId, body.text);
      } else if (body.text) {
        // Extract directly from staff's text input (without reading chat history)
        draft = await extractOrderFromText(user.orgId, body.text, {
          name: body.customerName,
          phone: body.customerPhone,
          address: body.customerAddress,
          customerId: body.customerId,
        });
      } else {
        return reply.status(400).send({
          error: 'Vui lòng cung cấp conversationId hoặc text để AI phân tích.',
        });
      }

      return { success: true, draft };
    } catch (err: any) {
      logger.error('[ai-order-route] extraction error:', err);
      return reply.status(500).send({
        error: err.message || 'Lỗi khi AI phân tích đơn hàng',
      });
    }
  });

  // Fetch the pre-saved AI draft order for a conversation directly from the database (no LLM call)
  app.get('/api/v1/orders/draft/:conversationId', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { conversationId } = request.params as { conversationId: string };

    try {
      const aiState = await prisma.conversationAiState.findUnique({
        where: { conversationId },
      });

      if (!aiState || !aiState.draftOrder) {
        return { success: true, draft: null };
      }

      // Check if the saved draft has items, otherwise return null
      const draft = aiState.draftOrder as any;
      if (!draft.items || draft.items.length === 0) {
        return { success: true, draft: null };
      }

      return { success: true, draft };
    } catch (err: any) {
      logger.error('[order-route] get draft error:', err);
      return reply.status(500).send({
        error: err.message || 'Lỗi khi lấy thông tin đơn nháp từ DB',
      });
    }
  });

  // Fetch AI draft orders needing staff confirmation (only conversations in CONFIRMATION state)
  app.get('/api/v1/orders/pending-ai', async (request: FastifyRequest) => {
    const user = request.user!;
    try {
      const conversations = await prisma.conversation.findMany({
        where: {
          orgId: user.orgId,
          currentState: 'CONFIRMATION',
        },
        include: {
          contact: {
            select: {
              fullName: true,
              phone: true,
              address: true,
              salesperson: true,
            }
          },
          aiState: {
            select: {
              draftOrder: true,
              updatedAt: true,
            }
          }
        }
      });

      const mappedOrders = conversations
        .map(c => {
          const draft = (c.aiState?.draftOrder as any) || { items: [] };
          const items = draft.items || [];
          const amountTotal = items.reduce((sum: number, item: any) => sum + ((item.quantity || item.qty || 1) * (item.priceUnit || item.price || 0)), 0);

          return {
            id: c.id,
            orderCode: `AI-${c.id.slice(0, 8).toUpperCase()}`,
            partnerName: draft.customer?.name || draft.recipientName || c.contact?.fullName || 'Khách hàng',
            salesperson: c.contact?.salesperson || 'Võ Tấn Dũng',
            customerProfile: {
              phone: draft.customer?.phone || draft.phone || c.contact?.phone || null,
              city: draft.customer?.shippingAddress || draft.address || c.contact?.address || null,
            },
            dateOrder: c.aiState?.updatedAt || c.lastMessageAt || c.createdAt,
            lines: items.map((it: any) => ({
              id: it.matchedProductOdooId || it.sku,
              productName: it.matchedProductName || it.productNameRaw || it.name || it.sku,
              qty: it.quantity || it.qty || 1,
              priceUnit: it.priceUnit || it.price || 0,
            })),
            amountTotal,
            state: 'draft',
            paymentTerm: draft.paymentTerm || draft.payment_term || 'Thanh toán ngay',
            isAiDraft: true,
            conversationId: c.id,
            note: draft.notes || null,
          };
        })
        .filter(o => o.lines.length > 0);

      return { orders: mappedOrders, total: mappedOrders.length };
    } catch (err: any) {
      logger.error('[order-route] get pending-ai error:', err);
      return { orders: [], total: 0 };
    }
  });

  // ── AI-powered conversational draft order modification ─────────────────────
  app.post('/api/v1/orders/ai-modify-draft', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = request.body as any;

    if (!body.currentDraft || !body.instruction) {
      return reply.status(400).send({ error: 'Thiếu currentDraft hoặc instruction' });
    }

    try {
      const result = await modifyOrderDraft(user.orgId, body.currentDraft, body.instruction);
      return { success: true, ...result };
    } catch (err: any) {
      logger.error('[ai-order-route] modify draft error:', err);
      return reply.status(500).send({
        error: err.message || 'Lỗi khi AI chỉnh sửa đơn hàng',
      });
    }
  });

  // ── List orders (paginated, filtered from OrderHistory) ───────────────────
  app.get('/api/v1/orders', async (request: FastifyRequest) => {
    const user = request.user!;
    const {
      page = '1',
      limit = '25',
      search = '',
      state = '',
      invoiceStatus = '',
      deliveryStatus = '',
      salesperson = '',
      customerProfileId = '',
      from = '',
      to = '',
      sortBy = 'dateOrder',
      sortOrder = 'desc',
    } = request.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const skip = (pageNum - 1) * take;

    const where: any = {
      orgId: user.orgId,
      NOT: [
        { orderCode: { startsWith: 'SO-AI-' } },
        { orderCode: { startsWith: 'AI-' } },
        { orderCode: { startsWith: 'ORD-' } },
      ],
    };

    if (state) where.state = state;
    if (invoiceStatus) where.invoiceStatus = invoiceStatus;
    if (deliveryStatus) where.deliveryStatus = deliveryStatus;
    if (salesperson) where.salesperson = { contains: salesperson, mode: 'insensitive' };
    if (customerProfileId) where.customerProfileId = customerProfileId;

    if (search) {
      where.OR = [
        { orderCode: { contains: search, mode: 'insensitive' } },
        { partnerName: { contains: search, mode: 'insensitive' } },
        { note: { contains: search, mode: 'insensitive' } },
        { salesperson: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (from || to) {
      where.dateOrder = {};
      if (from) where.dateOrder.gte = new Date(from);
      if (to) where.dateOrder.lte = new Date(to.includes('T') ? to : `${to}T23:59:59.999Z`);
    }

    const validSortFields = ['dateOrder', 'amountTotal', 'amountUntaxed', 'margin', 'createdAt', 'orderCode'];
    const orderByField = validSortFields.includes(sortBy) ? sortBy : 'dateOrder';
    const direction = sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc';

    const [orders, total] = await Promise.all([
      prisma.orderHistory.findMany({
        where,
        include: {
          customerProfile: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              city: true,
            },
          },
          _count: {
            select: { lines: true },
          },
        },
        orderBy: { [orderByField]: direction },
        skip,
        take,
      }),
      prisma.orderHistory.count({ where }),
    ]);

    return {
      orders,
      total,
      page: pageNum,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  });

  // ── Get single order details with all line items ───────────────────────────
  app.get('/api/v1/orders/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const isNumeric = /^\d+$/.test(id);

    const order = await prisma.orderHistory.findFirst({
      where: {
        orgId: user.orgId,
        OR: [
          { id },
          ...(isNumeric ? [{ odooOrderId: parseInt(id) }] : []),
          { orderCode: id },
        ],
      },
      include: {
        customerProfile: true,
        lines: {
          orderBy: { odooLineId: 'asc' },
        },
      },
    });

    if (!order) {
      // Check if this is an AI conversation draft order
      const rawConvId = id.replace(/^draft_/, '').replace(/^AI-/, '');
      const conv = await prisma.conversation.findFirst({
        where: {
          orgId: user.orgId,
          OR: [
            { id: id.replace(/^draft_/, '') },
            { id },
            { id: { startsWith: rawConvId.toLowerCase() } },
          ],
        },
        include: {
          contact: true,
          aiState: true,
        },
      });

      if (conv && conv.aiState?.draftOrder) {
        const draft = conv.aiState.draftOrder as any;
        const items = draft.items || [];
        const amountTotal = items.reduce(
          (sum: number, item: any) => sum + ((item.quantity || item.qty || 1) * (item.priceUnit || item.price || 0)),
          0
        );

        const aiDraftOrder = {
          id: conv.id,
          orderCode: `AI-${conv.id.slice(0, 8).toUpperCase()}`,
          odooOrderId: draft.odooOrderId || '—',
          odooPartnerId: conv.contact?.customerId ? parseInt(conv.contact.customerId, 10) : 17871,
          partnerName: draft.customer?.name || draft.recipientName || conv.contact?.fullName || 'Khách hàng',
          customerProfile: {
            id: conv.contact?.id || null,
            name: draft.customer?.name || draft.recipientName || conv.contact?.fullName || 'Khách hàng',
            phone: draft.customer?.phone || draft.phone || conv.contact?.phone || null,
            email: draft.customer?.email || conv.contact?.email || null,
            city: draft.customer?.shippingAddress || draft.address || conv.contact?.address || null,
          },
          dateOrder: conv.aiState.updatedAt || conv.lastMessageAt || conv.createdAt,
          state: 'draft',
          salesperson: conv.contact?.salesperson || 'Võ Tấn Dũng',
          warehouseName: 'Kho TPHCM',
          amountUntaxed: amountTotal,
          amountTax: 0,
          amountTotal: amountTotal,
          amountUndiscounted: amountTotal,
          margin: 0,
          marginPercent: 0,
          deliveryStatus: 'pending',
          invoiceStatus: 'no',
          pricelistName: 'Bảng giá sỉ đại lý',
          paymentTerm: draft.paymentTerm || draft.payment_term || 'Thanh toán ngay',
          note: draft.notes || 'Đơn hàng nháp tạo tự động từ Chatbot AI qua Zalo',
          isAiDraft: true,
          conversationId: conv.id,
          lines: items.map((it: any, idx: number) => {
            const qty = it.quantity || it.qty || 1;
            const price = it.priceUnit || it.price || 0;
            return {
              id: `${conv.id}_line_${idx}`,
              odooLineId: idx + 1,
              productName: it.matchedProductName || it.productNameRaw || it.name || it.sku,
              productSku: it.sku || it.productSku || null,
              uomName: it.unit || it.uom || 'Gói',
              quantity: qty,
              priceUnit: price,
              discount: it.discount || 0,
              priceSubtotal: qty * price,
            };
          }),
        };

        return { order: aiDraftOrder };
      }

      return reply.status(404).send({ error: 'Không tìm thấy đơn hàng' });
    }

    return { order };
  });

  // ── Distinct Salespersons for filter dropdown ─────────────────────────────
  app.get('/api/v1/orders/salespersons', async (request: FastifyRequest) => {
    const user = request.user!;

    const salespersons = await prisma.orderHistory.findMany({
      where: {
        orgId: user.orgId,
        salesperson: { not: null },
        NOT: [
          { orderCode: { startsWith: 'SO-AI-' } },
          { orderCode: { startsWith: 'AI-' } },
          { orderCode: { startsWith: 'ORD-' } },
        ],
      },
      select: { salesperson: true },
      distinct: ['salesperson'],
    });

    return {
      salespersons: salespersons.map(s => s.salesperson).filter(Boolean),
    };
  });

  // ── Order stats summary from OrderHistory ──────────────────────────────────
  app.get('/api/v1/orders/stats', async (request: FastifyRequest) => {
    const user = request.user!;
    const { from = '', to = '', salesperson = '' } = request.query as Record<string, string>;

    const where: any = {
      orgId: user.orgId,
      NOT: [
        { orderCode: { startsWith: 'SO-AI-' } },
        { orderCode: { startsWith: 'AI-' } },
        { orderCode: { startsWith: 'ORD-' } },
      ],
    };
    if (salesperson) where.salesperson = { contains: salesperson, mode: 'insensitive' };

    if (from || to) {
      where.dateOrder = {};
      if (from) where.dateOrder.gte = new Date(from);
      if (to) where.dateOrder.lte = new Date(to.includes('T') ? to : `${to}T23:59:59.999Z`);
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      total,
      confirmed,
      draft,
      cancelled,
      revenueAgg,
      todayRevenueAgg,
      marginAgg,
    ] = await Promise.all([
      prisma.orderHistory.count({ where }),
      prisma.orderHistory.count({ where: { ...where, state: { in: ['sale', 'done'] } } }),
      prisma.orderHistory.count({ where: { ...where, state: 'draft' } }),
      prisma.orderHistory.count({ where: { ...where, state: 'cancel' } }),
      prisma.orderHistory.aggregate({
        where: { ...where, state: { in: ['sale', 'done'] } },
        _sum: { amountTotal: true },
      }),
      prisma.orderHistory.aggregate({
        where: {
          ...where,
          state: { in: ['sale', 'done'] },
          dateOrder: { gte: todayStart },
        },
        _sum: { amountTotal: true },
      }),
      prisma.orderHistory.aggregate({
        where: { ...where, state: { in: ['sale', 'done'] } },
        _sum: { margin: true } as any,
      }),
    ]);

    const totalRevenue = revenueAgg._sum.amountTotal || 0;
    const avgOrderValue = confirmed > 0 ? Math.round(totalRevenue / confirmed) : 0;
    const totalMargin = (marginAgg._sum as any)?.margin || 0;

    return {
      totalOrders: total,
      confirmedOrders: confirmed,
      draftOrders: draft,
      cancelledOrders: cancelled,
      totalRevenue,
      todayRevenue: todayRevenueAgg._sum.amountTotal || 0,
      totalMargin,
      avgOrderValue,
    };
  });

  // ── Staff performance summary from OrderHistory ────────────────────────────
  app.get('/api/v1/orders/by-staff', async (request: FastifyRequest) => {
    const user = request.user!;

    // Query aggregated stats grouped by salesperson
    const staffGroup = await prisma.orderHistory.groupBy({
      by: ['salesperson'],
      where: {
        orgId: user.orgId,
        salesperson: { not: null },
        NOT: [
          { orderCode: { startsWith: 'SO-AI-' } },
          { orderCode: { startsWith: 'AI-' } },
          { orderCode: { startsWith: 'ORD-' } },
        ],
      },
      _count: { _all: true },
      _sum: {
        amountTotal: true,
        margin: true,
      } as any,
      orderBy: {
        _sum: {
          amountTotal: 'desc',
        },
      },
    });

    const staffStats = staffGroup.map((s: any) => ({
      salesperson: s.salesperson || 'Chưa phân công',
      orderCount: s._count?._all ?? s._count ?? 0,
      totalRevenue: s._sum?.amountTotal || 0,
      totalMargin: s._sum?.margin || 0,
    }));

    return { staffStats };
  });

  // ── Contact specific orders ───────────────────────────────────────────────
  app.get('/api/v1/contacts/:id/orders', async (request: FastifyRequest) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const orders = await prisma.orderHistory.findMany({
      where: {
        orgId: user.orgId,
        OR: [
          { customerProfileId: id },
          { customerProfile: { id } },
        ],
      },
      include: {
        lines: true,
      },
      orderBy: { dateOrder: 'desc' },
      take: 20,
    });

    return { orders };
  });

  // ── Helper: Format VND currency ───────────────────────────────────────────
  function formatVND(n?: number | null): string {
    if (!n) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
  }

  // ── Helper: Format order lines list for Zalo message ───────────────────────
  function buildLinesSummary(lines: any[]): string {
    if (!lines || lines.length === 0) return '• Sản phẩm theo thỏa thuận';
    return lines
      .slice(0, 5)
      .map((l, i) => {
        const name = l.productName || l.productSku || `Sản phẩm ${i + 1}`;
        const qty = l.quantity || 1;
        const uom = l.uomName ? ` ${l.uomName}` : '';
        const price = l.priceTotal ? ` - ${formatVND(l.priceTotal)}` : (l.priceUnit ? ` - ${formatVND(l.priceUnit * qty)}` : '');
        return `${i + 1}. ${name} (SL: ${qty}${uom})${price}`;
      })
      .join('\n') + (lines.length > 5 ? `\n... và ${lines.length - 5} sản phẩm khác` : '');
  }

  // ── Helper: Send Zalo notification message to customer conversation ────────
  async function sendOrderNotificationToCustomer(
    orgId: string,
    order: any,
    messageText: string,
    targetConversationId?: string
  ): Promise<{ sent: boolean; conversationId?: string; reason?: string }> {
    try {
      let conversation: any = null;

      // 0. Direct match by conversationId if provided
      if (targetConversationId) {
        conversation = await prisma.conversation.findFirst({
          where: { id: targetConversationId, orgId },
        });
      }

      // 1. Match by customerProfileId
      if (!conversation && order.customerProfileId) {
        const contact = await prisma.contact.findFirst({
          where: { orgId, customerId: order.customerProfileId },
          include: {
            conversations: {
              orderBy: { lastMessageAt: 'desc' },
              take: 1,
            },
          },
        });
        if (contact?.conversations?.length) {
          conversation = contact.conversations[0];
        }
      }

      // 2. Match by customer phone
      if (!conversation && order.customerProfile?.phone) {
        const cleanPhone = order.customerProfile.phone.replace(/\D/g, '');
        if (cleanPhone.length >= 9) {
          const contact = await prisma.contact.findFirst({
            where: {
              orgId,
              phone: { contains: cleanPhone.slice(-9) },
            },
            include: {
              conversations: {
                orderBy: { lastMessageAt: 'desc' },
                take: 1,
              },
            },
          });
          if (contact?.conversations?.length) {
            conversation = contact.conversations[0];
          }
        }
      }

      // 3. Match by partnerName
      if (!conversation && order.partnerName) {
        const contact = await prisma.contact.findFirst({
          where: {
            orgId,
            fullName: { contains: order.partnerName, mode: 'insensitive' },
          },
          include: {
            conversations: {
              orderBy: { lastMessageAt: 'desc' },
              take: 1,
            },
          },
        });
        if (contact?.conversations?.length) {
          conversation = contact.conversations[0];
        }
      }

      if (!conversation) {
        logger.info(`[order-routes] No active Zalo conversation found for customer ${order.partnerName || order.id}`);
        return { sent: false, reason: 'Chưa có hội thoại Zalo của khách hàng' };
      }

      // Persist outbound message in DB
      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'self',
          content: messageText,
          contentType: 'text',
          sentAt: new Date(),
        },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          isReplied: true,
        },
      });

      // Dispatch to real Zalo if connected and not a test conversation
      const instance = zaloPool.getInstance(conversation.zaloAccountId);
      if (instance && instance.api && conversation.externalThreadId && !conversation.externalThreadId.startsWith('test_')) {
        try {
          await instance.api.sendMessage(
            { msg: messageText },
            conversation.externalThreadId,
            conversation.threadType === 'group' ? 1 : 0
          );
          logger.info(`[order-routes] Order notification sent via Zalo to thread ${conversation.externalThreadId}`);
        } catch (err: any) {
          logger.warn(`[order-routes] Failed to deliver via Zalo API: ${err.message}`);
        }
      }

      // Emit Socket.IO message
      zaloPool.getIO()?.to(`conversation:${conversation.id}`).emit('chat:message', {
        message,
        conversationId: conversation.id,
      });

      return { sent: true, conversationId: conversation.id };
    } catch (err: any) {
      logger.error('[order-routes] Error sending order notification:', err);
      return { sent: false, reason: err.message };
    }
  }
  // ── Helper: Fetch PDF from Odoo with retries ──────────────────────────────
  async function fetchPdfWithRetry(
    odooOrderId: number,
    maxRetries = 3,
    delayMs = 2000
  ): Promise<{ buffer: Buffer; filename: string } | null> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const pdf = await odooService.getOrderReportPdf(odooOrderId);
        if (pdf && pdf.buffer && pdf.buffer.length > 0) return pdf;
      } catch (err: any) {
        logger.warn(`[order-routes] PDF fetch attempt ${i + 1}/${maxRetries} failed for Odoo order ${odooOrderId}: ${err.message}`);
      }
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
    return null;
  }

  // ── Helper: Send PDF file attachment to customer via Zalo ─────────────────
  async function sendPdfAttachmentToCustomer(
    orgId: string,
    order: any,
    reportPdf: { buffer: Buffer; filename: string },
    targetConversationId?: string
  ): Promise<{ sent: boolean; reason?: string }> {
    let tempFilePath: string | null = null;
    try {
      // Find conversation (reuse same logic as sendOrderNotificationToCustomer)
      let conversation: any = null;

      // 0. Direct match by conversationId if provided
      if (targetConversationId) {
        conversation = await prisma.conversation.findFirst({
          where: { id: targetConversationId, orgId },
        });
      }

      if (!conversation && order.customerProfileId) {
        const contact = await prisma.contact.findFirst({
          where: { orgId, customerId: order.customerProfileId },
          include: { conversations: { orderBy: { lastMessageAt: 'desc' }, take: 1 } },
        });
        if (contact?.conversations?.length) conversation = contact.conversations[0];
      }

      if (!conversation && order.customerProfile?.phone) {
        const cleanPhone = order.customerProfile.phone.replace(/\D/g, '');
        if (cleanPhone.length >= 9) {
          const contact = await prisma.contact.findFirst({
            where: { orgId, phone: { contains: cleanPhone.slice(-9) } },
            include: { conversations: { orderBy: { lastMessageAt: 'desc' }, take: 1 } },
          });
          if (contact?.conversations?.length) conversation = contact.conversations[0];
        }
      }

      if (!conversation && order.partnerName) {
        const contact = await prisma.contact.findFirst({
          where: { orgId, fullName: { contains: order.partnerName, mode: 'insensitive' } },
          include: { conversations: { orderBy: { lastMessageAt: 'desc' }, take: 1 } },
        });
        if (contact?.conversations?.length) conversation = contact.conversations[0];
      }

      if (!conversation) {
        return { sent: false, reason: 'Không tìm thấy hội thoại Zalo để gửi PDF' };
      }

      // Save PDF to temp file
      const safeCode = (order.orderCode || 'order').replace(/[^a-zA-Z0-9_-]/g, '_');
      const tempDir = path.join(os.tmpdir(), 'zalo-crm-pdf');
      await fs.promises.mkdir(tempDir, { recursive: true });
      tempFilePath = path.join(tempDir, `${safeCode}.pdf`);
      await fs.promises.writeFile(tempFilePath, reportPdf.buffer);

      // Send PDF via Zalo if real thread
      const instance = zaloPool.getInstance(conversation.zaloAccountId);
      if (instance && instance.api && conversation.externalThreadId && !conversation.externalThreadId.startsWith('test_')) {
        try {
          await instance.api.sendMessage(
            { msg: '', attachments: [tempFilePath] },
            conversation.externalThreadId,
            conversation.threadType === 'group' ? 1 : 0
          );
          logger.info(`[order-routes] PDF file sent via Zalo API to thread ${conversation.externalThreadId}`);
        } catch (zErr: any) {
          logger.warn(`[order-routes] Failed to deliver PDF via Zalo API: ${zErr.message}`);
        }
      }

      // Save PDF message to DB
      const savedFileMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'self',
          content: `[File PDF] ${reportPdf.filename || `${safeCode}.pdf`}`,
          contentType: 'file',
          attachments: [{ name: reportPdf.filename || `${safeCode}.pdf`, size: reportPdf.buffer.length, type: 'application/pdf' }],
          sentAt: new Date(),
        },
      });

      // Emit Socket.IO for UI update
      zaloPool.getIO()?.to(`conversation:${conversation.id}`).emit('chat:message', {
        message: savedFileMessage,
        conversationId: conversation.id,
      });

      logger.info(`[order-routes] PDF sent successfully for order ${order.orderCode} to conversation ${conversation.id}`);
      return { sent: true };
    } catch (err: any) {
      logger.error(`[order-routes] Error sending PDF to customer:`, err);
      return { sent: false, reason: err.message };
    } finally {
      if (tempFilePath) {
        await fs.promises.rm(tempFilePath, { force: true }).catch(() => {});
      }
    }
  }


  app.get('/api/v1/orders/pending-count', async (request: FastifyRequest) => {
    const user = request.user!;
    const confirmationConvsCount = await prisma.conversation.count({
      where: {
        orgId: user.orgId,
        currentState: 'CONFIRMATION',
        aiState: { isNot: null },
      },
    });
    return { count: confirmationConvsCount };
  });

  // ── Confirm Order & Dispatch Zalo Notification ────────────────────────────
  app.post('/api/v1/orders/:id/confirm', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { customNote?: string; customZaloMessage?: string };

    const isNumeric = /^\d+$/.test(id);

    const order = await prisma.orderHistory.findFirst({
      where: {
        orgId: user.orgId,
        OR: [
          { id },
          ...(isNumeric ? [{ odooOrderId: parseInt(id, 10) }] : []),
          { orderCode: id },
        ],
      },
      include: {
        customerProfile: true,
        lines: true,
      },
    });

    if (!order) {
      // Check if it is an AI conversation draft
      const conv = await prisma.conversation.findFirst({
        where: { id, orgId: user.orgId },
        include: { contact: true, aiState: true },
      });

      if (!conv || !conv.aiState?.draftOrder) {
        return reply.status(404).send({ error: 'Không tìm thấy đơn hàng hoặc đơn đã được xử lý' });
      }

      const draft = (conv.aiState.draftOrder as any) || {};
      const items = draft.items || [];
      if (!items.length) {
        return reply.status(400).send({ error: 'Đơn hàng không có sản phẩm nào' });
      }

      const odooPartnerId = parseInt(conv.contact?.customerId || '17871', 10) || 17871;
      let odooOrderId: number | null = null;
      let officialOrderCode = '';
      let officialTotal = 0;

      // 1. Resolve valid product IDs from ProductCache
      const odooLines: any[] = [];
      const resolvedLines: any[] = [];

      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        let odooPid = it.matchedProductOdooId || it.odooProductId;
        let pName = it.matchedProductName || it.productNameRaw || it.name || it.sku || '';
        let pPrice = it.priceUnit || it.price || 0;
        let pQty = it.quantity || it.qty || 1;

        if (!odooPid || odooPid === 1 || odooPid === 104) {
          const skuToMatch = (it.sku || '').trim();
          const nameToMatch = pName.trim();
          const orConditions: any[] = [];
          if (skuToMatch) orConditions.push({ sku: { equals: skuToMatch, mode: 'insensitive' } });
          if (nameToMatch) orConditions.push({ name: { contains: nameToMatch, mode: 'insensitive' } });
          
          const cacheProd = await prisma.productCache.findFirst({
            where: {
              orgId: user.orgId,
              ...(orConditions.length > 0 ? { OR: orConditions } : {}),
            },
          });
          if (cacheProd && cacheProd.odooId) {
            odooPid = cacheProd.odooId;
            if (!pPrice) pPrice = cacheProd.wholesalePrice || cacheProd.listPrice || 0;
            if (!pName) pName = cacheProd.name;
          }
        }

        if (odooPid) {
          odooLines.push({
            product_id: odooPid,
            product_uom_qty: pQty,
            price_unit: pPrice,
            discount: it.discount || 0,
          });
          resolvedLines.push({
            id: randomUUID(),
            odooLineId: idx + 1,
            productName: pName,
            quantity: pQty,
            priceUnit: pPrice,
            priceSubtotal: pQty * pPrice,
            priceTotal: pQty * pPrice,
            odooProductId: odooPid,
          });
        }
      }

      if (odooLines.length === 0) {
        return reply.status(400).send({
          success: false,
          message: 'Không tìm thấy sản phẩm hợp lệ khớp với CSDL Odoo. Vui lòng kiểm tra lại.',
        });
      }

      // ── CREATE REAL ORDER (QUOTATION) ON ODOO ERP ──
      try {
        const createdId = await odooService.createOrder({
          partner_id: odooPartnerId,
          note: body.customNote || draft.notes || 'Đơn hàng tạo từ Chatbot AI',
          order_line: odooLines,
        });
        if (!createdId) {
          throw new Error('Odoo trả về rỗng khi tạo đơn');
        }
        const numId = Array.isArray(createdId) ? (createdId as any)[0] : Number(createdId);
        odooOrderId = numId;
      } catch (err: any) {
        logger.error(`[order-routes] Failed to create order in Odoo: ${err.message}`);
        return reply.status(500).send({
          success: false,
          message: `Lỗi tạo đơn hàng trên Odoo: ${err.message}`,
        });
      }

      if (!odooOrderId) {
        return reply.status(500).send({
          success: false,
          message: 'Lỗi không xác định khi tạo đơn trên Odoo',
        });
      }

      const validOdooOrderId = odooOrderId;

      // Fetch official order code & total from Odoo
      try {
        const odooOrder = await odooService.getOrder(validOdooOrderId);
        officialOrderCode = odooOrder?.name || `SO-${validOdooOrderId}`;
        officialTotal = odooOrder?.amount_total || odooLines.reduce((s, l) => s + l.product_uom_qty * l.price_unit, 0);
      } catch (err: any) {
        officialOrderCode = `SO-${validOdooOrderId}`;
        officialTotal = odooLines.reduce((s, l) => s + l.product_uom_qty * l.price_unit, 0);
      }

      // Complete conversation state now that order is really created on Odoo
      await prisma.conversationAiState.updateMany({
        where: { conversationId: conv.id },
        data: { draftOrder: {} },
      });

      await prisma.conversation.update({
        where: { id: conv.id },
        data: { currentState: 'COMPLETED' },
      });

      zaloPool.getIO()?.emit('chat:order_draft_updated', { conversationId: conv.id, draftOrder: null });
      zaloPool.getIO()?.emit('chat:state_updated', { conversationId: conv.id, currentState: 'COMPLETED' });
      zaloPool.getIO()?.emit('order:updated');

      // Trigger instant Odoo sync to pull real lines & official state
      try {
        await odooSyncService.syncOrders(user.orgId);
      } catch (syncErr: any) {
        logger.warn(`[order-routes] Instant sync warning after creating order: ${syncErr.message}`);
      }

      // Fetch official synced OrderHistory record
      let created = await prisma.orderHistory.findFirst({
        where: {
          orgId: user.orgId,
          odooOrderId: validOdooOrderId,
        },
        include: { lines: true, customerProfile: true },
      });

      if (!created) {
        created = await prisma.orderHistory.upsert({
          where: {
            orgId_odooOrderId: {
              orgId: user.orgId,
              odooOrderId: validOdooOrderId,
            },
          },
          create: {
            id: randomUUID(),
            orgId: user.orgId,
            odooOrderId: validOdooOrderId,
            odooPartnerId,
            orderCode: officialOrderCode,
            partnerName: draft.customer?.name || draft.recipientName || conv.contact?.fullName || 'Khách hàng',
            dateOrder: new Date(),
            amountTotal: officialTotal,
            state: 'draft',
            note: body.customNote || draft.notes || 'Đơn hàng tạo từ Chatbot AI',
            salesperson: conv.contact?.salesperson || user.email,
            lines: {
              create: resolvedLines,
            },
          },
          update: {
            orderCode: officialOrderCode,
            amountTotal: officialTotal,
            state: 'draft',
            partnerName: draft.customer?.name || draft.recipientName || conv.contact?.fullName || 'Khách hàng',
            note: body.customNote || draft.notes || 'Đơn hàng tạo từ Chatbot AI',
          },
          include: { lines: true, customerProfile: true },
        });
      }

      const noteText = body.customNote ? `Ghi chú: ${body.customNote}\n` : '';
      const defaultZaloMsg = `Dạ đơn hàng ${officialOrderCode} của ${created.partnerName || 'mình'} đã được xác nhận và đang được chuyển sang bộ phận đóng gói ạ. Tổng giá trị đơn hàng là ${formatVND(officialTotal)}.
${noteText}
Em cảm ơn ${created.partnerName || 'mình'} đã ủng hộ shop ạ!`.trim();

      let finalZaloMessage = body.customZaloMessage?.trim() || defaultZaloMsg;
      finalZaloMessage = finalZaloMessage
        .replace(/#(?:SO-)?AI-[A-Za-z0-9]+/g, `#${officialOrderCode}`)
        .replace(/(?:SO-)?AI-[A-Za-z0-9]+/g, officialOrderCode);

      // Asynchronous non-blocking Zalo & PDF dispatch
      (async () => {
        try {
          // Fetch real PDF for this order from Odoo
          let reportPdf: { buffer: Buffer; filename: string } | null = null;
          if (odooOrderId && odooOrderId < 100000) {
            try {
              reportPdf = await fetchPdfWithRetry(odooOrderId);
            } catch (err: any) {
              logger.warn(`[order-routes] Could not fetch PDF for ${officialOrderCode} from Odoo: ${err.message}`);
            }
          }

          // Send confirmation text message
          await sendOrderNotificationToCustomer(user.orgId, created, finalZaloMessage, conv.id);

          // Send PDF attachment immediately after text
          if (reportPdf) {
            await sendPdfAttachmentToCustomer(user.orgId, created, reportPdf, conv.id);
            await prisma.orderHistory.update({
              where: { id: created.id },
              data: { pdfSentAt: new Date() },
            });
            logger.info(`[order-routes] Sent text and PDF together for AI draft order ${officialOrderCode}`);
          }

          // Emit event when delivery (text + PDF) is truly complete
          zaloPool.getIO()?.emit('order:delivery_complete', {
            orderCode: officialOrderCode,
            conversationId: conv.id,
            success: true,
          });
        } catch (zaloErr: any) {
          logger.warn(`[order-routes] Async Zalo notification error: ${zaloErr.message}`);
          zaloPool.getIO()?.emit('order:delivery_complete', {
            orderCode: officialOrderCode,
            conversationId: conv.id,
            success: false,
          });
        }
      })();

      return reply.send({
        success: true,
        message: `Đã xác nhận và tạo báo giá #${officialOrderCode}`,
        order: created,
      });
    }

    // 1. Update order state in PostgreSQL as 'draft' (Quotation / Báo giá)
    const updatedOrder = await prisma.orderHistory.update({
      where: { id: order.id },
      data: {
        state: 'draft',
        ...(body.customNote ? { note: body.customNote } : {}),
        updatedAt: new Date(),
      },
      include: {
        customerProfile: true,
        lines: true,
      },
    });

    let syncedOdooId = order.odooOrderId;
    let odooConfirmed = !!syncedOdooId;
    let officialOrderCode = order.orderCode;
    let officialTotal = order.amountTotal;

    if (!syncedOdooId) {
      try {
        const odooPartnerId = order.odooPartnerId || order.customerProfile?.odooPartnerId || 17871;
        const validLines: any[] = [];
        for (const l of (order.lines || [])) {
          let odooPid = l.odooProductId;
          if (!odooPid || odooPid === 1 || odooPid === 104) {
            const nameToMatch = (l.productName || '').trim();
            const cacheProd = await prisma.productCache.findFirst({
              where: {
                orgId: user.orgId,
                name: { contains: nameToMatch, mode: 'insensitive' },
              },
            });
            if (cacheProd && cacheProd.odooId) {
              odooPid = cacheProd.odooId;
            }
          }
          if (odooPid) {
            validLines.push({
              product_id: odooPid,
              product_uom_qty: l.quantity || 1,
              price_unit: l.priceUnit || 0,
              discount: l.discount || 0,
            });
          }
        }

        if (validLines.length > 0) {
          const createdOdooId = await odooService.createOrder({
            partner_id: odooPartnerId,
            note: order.note || undefined,
            order_line: validLines,
          });

          if (createdOdooId) {
            syncedOdooId = createdOdooId;
            odooConfirmed = true;
            const odooOrder = await odooService.getOrder(createdOdooId);
            if (odooOrder?.name) officialOrderCode = odooOrder.name;
            if (odooOrder?.amount_total) officialTotal = odooOrder.amount_total;

            await prisma.orderHistory.update({
              where: { id: order.id },
              data: { odooOrderId: createdOdooId, orderCode: officialOrderCode, amountTotal: officialTotal },
            });
            logger.info(`[order-routes] Created real Quotation in Odoo #${createdOdooId} (${officialOrderCode})`);
          }
        }
      } catch (err: any) {
        logger.warn(`[order-routes] Failed to create order in Odoo: ${err.message}`);
      }
    }

    // 3. Compose and dispatch Zalo confirmation message with PDF
    const customerName = order.partnerName || order.customerProfile?.name || 'Quý khách';
    const totalText = formatVND(officialTotal);

    const zaloMessage = `Dạ đơn hàng ${officialOrderCode} của ${customerName} đã được xác nhận và đang được chuyển sang bộ phận đóng gói ạ. Tổng giá trị đơn hàng là ${totalText}.

Em cảm ơn ${customerName} đã ủng hộ shop ạ!`.trim();

    let finalZaloMessage = body.customZaloMessage?.trim() || zaloMessage;
    finalZaloMessage = finalZaloMessage
      .replace(/#(?:SO-)?AI-[A-Za-z0-9]+/g, `#${officialOrderCode}`)
      .replace(/(?:SO-)?AI-[A-Za-z0-9]+/g, officialOrderCode);

    // Async: fetch PDF of the real order from Odoo, then send text + PDF together
    (async () => {
      try {
        let reportPdf: { buffer: Buffer; filename: string } | null = null;
        if (syncedOdooId && syncedOdooId < 100000) {
          try {
            reportPdf = await fetchPdfWithRetry(syncedOdooId);
          } catch (err: any) {
            logger.warn(`[order-routes] Could not fetch PDF for ${officialOrderCode} from Odoo: ${err.message}`);
          }
        }

        // Send confirmation text message
        await sendOrderNotificationToCustomer(user.orgId, order, finalZaloMessage);

        // Send PDF attachment immediately after text
        if (reportPdf) {
          await sendPdfAttachmentToCustomer(user.orgId, order, reportPdf);
          await prisma.orderHistory.update({
            where: { id: order.id },
            data: { pdfSentAt: new Date() },
          });
          logger.info(`[order-routes] Sent text and PDF together for order ${officialOrderCode}`);
        }

        // Emit event when delivery (text + PDF) is truly complete
        zaloPool.getIO()?.emit('order:delivery_complete', {
          orderCode: officialOrderCode,
          success: true,
        });
      } catch (err: any) {
        logger.warn(`[order-routes] Regular order delivery error: ${err.message}`);
        zaloPool.getIO()?.emit('order:delivery_complete', {
          orderCode: officialOrderCode,
          success: false,
        });
      }
    })();

    // Helper to clear draft from chat sidebar
    async function clearConversationDraft(targetOrder: NonNullable<typeof order>, state: 'CONFIRMED' | 'CANCELLED') {
      try {
        const contact = await prisma.contact.findFirst({
          where: {
            orgId: user.orgId,
            OR: [
              ...(targetOrder.customerProfileId ? [{ customerId: targetOrder.customerProfileId }] : []),
              ...(targetOrder.partnerName ? [{ fullName: targetOrder.partnerName }] : []),
            ],
          },
          include: { conversations: true },
        });

        if (contact && contact.conversations && contact.conversations.length > 0) {
          for (const conv of contact.conversations) {
            await prisma.conversationAiState.updateMany({
              where: { conversationId: conv.id },
              data: { draftOrder: {} },
            });
            await prisma.conversation.update({
              where: { id: conv.id },
              data: { currentState: state === 'CONFIRMED' ? 'CONFIRMATION' : 'CANCELLED' },
            });
            zaloPool.getIO()?.emit('chat:state_updated', {
              conversationId: conv.id,
              currentState: state,
            });
            zaloPool.getIO()?.emit('chat:order_draft_updated', {
              conversationId: conv.id,
              draft: null,
            });
          }
        }
      } catch (err: any) {
        logger.warn(`[order-routes] Error clearing conversation draft: ${err.message}`);
      }
    }

    await clearConversationDraft(order, 'CONFIRMED');

    // Emit socket update for order list & badges
    zaloPool.getIO()?.emit('order:updated', {
      orderId: order.id,
      state: 'sale',
    });

    return {
      success: true,
      message: `Đã xác nhận đơn hàng #${officialOrderCode}`,
      odooConfirmed,
      zaloSent: true,
      order: updatedOrder,
    };
  });

  // ── Reject Order & Dispatch Zalo Notification ─────────────────────────────
  app.post('/api/v1/orders/:id/reject', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const {
      reason = 'Hết hàng tạm thời hoặc thông tin đơn hàng chưa đầy đủ',
      customZaloMessage,
    } = (request.body || {}) as { reason?: string; customZaloMessage?: string };

    const isNumeric = /^\d+$/.test(id);

    const order = await prisma.orderHistory.findFirst({
      where: {
        orgId: user.orgId,
        OR: [
          { id },
          ...(isNumeric ? [{ odooOrderId: parseInt(id) }] : []),
          { orderCode: id },
        ],
      },
      include: {
        customerProfile: true,
        lines: true,
      },
    });

    if (!order) {
      // Check if it is an AI conversation draft
      const conv = await prisma.conversation.findFirst({
        where: { id, orgId: user.orgId },
        include: { contact: true, aiState: true },
      });

      if (!conv) {
        return reply.status(404).send({ error: 'Không tìm thấy đơn hàng hoặc phiên hội thoại' });
      }

      // Clear draft in conversation
      await prisma.conversationAiState.updateMany({
        where: { conversationId: conv.id },
        data: { draftOrder: {} },
      });
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { currentState: 'NEW' },
      });

      const customerName = conv.contact?.fullName || 'Quý khách';
      const defaultRejectMsg = customZaloMessage?.trim() || `⚠️ [OCMS] THÔNG BÁO VỀ ĐƠN HÀNG
Kính gửi Quý khách ${customerName},

Rất tiếc, đơn hàng tạm thời chưa thể xác nhận.
❌ Lý do từ chối: ${reason}

Quý khách vui lòng nhắn tin trực tiếp để nhân viên hỗ trợ tư vấn sản phẩm thay thế hoặc giải đáp thêm.
Trân trọng cảm ơn Quý khách!`;

      // Create a system note message in conversation
      await prisma.message.create({
        data: {
          id: randomUUID(),
          conversationId: conv.id,
          zaloMsgId: null,
          senderType: 'self',
          senderUid: user.id,
          senderName: user.email,
          content: defaultRejectMsg,
          contentType: 'text',
          attachments: [],
          isNote: true,
          isAi: false,
          sentAt: new Date(),
        },
      });

      zaloPool.getIO()?.emit('chat:message', {
        conversationId: conv.id,
        message: {
          id: randomUUID(),
          conversationId: conv.id,
          senderType: 'self',
          content: defaultRejectMsg,
          contentType: 'text',
          sentAt: new Date().toISOString(),
        }
      });
      zaloPool.getIO()?.emit('chat:state_updated', { conversationId: conv.id, currentState: 'NEW' });
      zaloPool.getIO()?.emit('chat:order_draft_updated', { conversationId: conv.id, draftOrder: null });
      zaloPool.getIO()?.emit('order:updated');

      return reply.send({
        success: true,
        message: `Đã từ chối đơn hàng AI (${reason})`,
      });
    }

    const rejectionNote = `[Từ chối ngày ${new Date().toLocaleDateString('vi-VN')}] Lý do: ${reason}`;

    // 1. Update order state in PostgreSQL
    const updatedOrder = await prisma.orderHistory.update({
      where: { id: order.id },
      data: {
        state: 'cancel',
        note: order.note ? `${order.note}\n${rejectionNote}` : rejectionNote,
        updatedAt: new Date(),
      },
      include: {
        customerProfile: true,
        lines: true,
      },
    });

    // 2. Sync cancellation to Odoo ERP if odooOrderId exists
    let odooCancelled = false;
    if (order.odooOrderId) {
      try {
        odooCancelled = await odooService.cancelOrder(order.odooOrderId);
      } catch (err: any) {
        logger.warn(`[order-routes] Odoo cancel warning: ${err.message}`);
      }
    }

    // 3. Compose and dispatch Zalo rejection template message
    const customerName = order.partnerName || order.customerProfile?.name || 'Quý khách';
    const linesText = buildLinesSummary(order.lines);

    const defaultRejectZalo =
`⚠️ [OCMS] THÔNG BÁO VỀ ĐƠN HÀNG #${order.orderCode}
Kính gửi Quý khách ${customerName},

Rất tiếc, đơn hàng #${order.orderCode} của Quý khách tạm thời chưa thể xác nhận.

📦 Danh sách sản phẩm:
${linesText}

❌ Lý do từ chối:
${reason}

Quý khách vui lòng nhắn tin trực tiếp để nhân viên hỗ trợ tư vấn sản phẩm thay thế hoặc giải đáp thêm.
Trân trọng cảm ơn Quý khách!`;

    const finalRejectZaloMessage = customZaloMessage?.trim() || defaultRejectZalo;
    const zaloResult = await sendOrderNotificationToCustomer(user.orgId, order, finalRejectZaloMessage);

    // Clear draft from chat sidebar
    try {
      const contact = await prisma.contact.findFirst({
        where: {
          orgId: user.orgId,
          OR: [
            ...(order.customerProfileId ? [{ customerId: order.customerProfileId }] : []),
            ...(order.partnerName ? [{ fullName: order.partnerName }] : []),
          ],
        },
        include: { conversations: true },
      });

      if (contact && contact.conversations && contact.conversations.length > 0) {
        for (const conv of contact.conversations) {
          await prisma.conversationAiState.updateMany({
            where: { conversationId: conv.id },
            data: { draftOrder: {} },
          });
          await prisma.conversation.update({
            where: { id: conv.id },
            data: { currentState: 'CANCELLED' },
          });
          zaloPool.getIO()?.emit('chat:state_updated', {
            conversationId: conv.id,
            currentState: 'CANCELLED',
          });
          zaloPool.getIO()?.emit('chat:order_draft_updated', {
            conversationId: conv.id,
            draft: null,
          });
        }
      }
    } catch (err: any) {
      logger.warn(`[order-routes] Error clearing conversation draft on reject: ${err.message}`);
    }

    // Emit socket update for order list & badges
    zaloPool.getIO()?.emit('order:updated', {
      orderId: order.id,
      state: 'cancel',
    });

    return {
      success: true,
      message: `Đã từ chối đơn hàng #${order.orderCode}`,
      odooCancelled,
      zaloSent: zaloResult.sent,
      zaloReason: zaloResult.reason,
      order: updatedOrder,
    };
  });

  // ── Processed AI Drafts List ──────────────────────────────────────────────
  app.get('/api/v1/orders/processed-ai', async (request: FastifyRequest) => {
    const user = request.user!;
    const query = (request.query || {}) as {
      page?: string;
      limit?: string;
      search?: string;
    };

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const where: any = {
      orgId: user.orgId,
      state: { in: ['sale', 'cancel'] },
      OR: [
        { activitySummary: { contains: 'AI', mode: 'insensitive' } },
        { note: { contains: 'Từ chối', mode: 'insensitive' } },
        { note: { contains: 'AI', mode: 'insensitive' } },
      ],
    };

    if (query.search) {
      const q = query.search.trim();
      where.AND = [
        {
          OR: [
            { orderCode: { contains: q, mode: 'insensitive' } },
            { partnerName: { contains: q, mode: 'insensitive' } },
            { note: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.orderHistory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          customerProfile: true,
          lines: true,
        },
      }),
      prisma.orderHistory.count({ where }),
    ]);

    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  });
}

