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

      const mappedOrders = conversations.map(c => {
        const draft = (c.aiState?.draftOrder as any) || { items: [] };
        const items = draft.items || [];
        const amountTotal = items.reduce((sum: number, item: any) => sum + (item.quantity * item.priceUnit), 0);

        return {
          id: c.id,
          orderCode: `AI-${c.id.slice(0, 8).toUpperCase()}`,
          partnerName: draft.customer?.name || draft.recipientName || c.contact?.fullName || 'Khách hàng',
          customerProfile: {
            phone: draft.customer?.phone || draft.phone || c.contact?.phone || null,
            city: draft.customer?.shippingAddress || draft.address || c.contact?.address || null,
          },
          dateOrder: c.aiState?.updatedAt || c.lastMessageAt || c.createdAt,
          lines: items.map((it: any) => ({
            id: it.matchedProductOdooId,
            productName: it.matchedProductName || it.productNameRaw,
            qty: it.quantity,
            priceUnit: it.priceUnit,
          })),
          amountTotal,
          state: 'draft',
          isAiDraft: true,
          conversationId: c.id,
          note: draft.notes || null,
        };
      });

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

    const where: any = { orgId: user.orgId };

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

    const where: any = { orgId: user.orgId };
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
    messageText: string
  ): Promise<{ sent: boolean; conversationId?: string; reason?: string }> {
    try {
      let conversation: any = null;

      // 1. Match by customerProfileId
      if (order.customerProfileId) {
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

      // Dispatch to real Zalo if connected
      const instance = zaloPool.getInstance(conversation.zaloAccountId);
      if (instance && instance.api && conversation.externalThreadId) {
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

  // ── Pending Orders Count (draft/quotation) ─────────────────────────────────
  app.get('/api/v1/orders/pending-count', async (request: FastifyRequest) => {
    const user = request.user!;
    const [draftHistoryCount, confirmationConvsCount] = await Promise.all([
      prisma.orderHistory.count({
        where: {
          orgId: user.orgId,
          state: 'draft',
        },
      }),
      prisma.conversation.count({
        where: {
          orgId: user.orgId,
          currentState: 'CONFIRMATION',
        },
      }),
    ]);
    return { count: draftHistoryCount + confirmationConvsCount };
  });

  // ── Confirm Order & Dispatch Zalo Notification ────────────────────────────
  app.post('/api/v1/orders/:id/confirm', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { customNote?: string };

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
      return reply.status(404).send({ error: 'Không tìm thấy đơn hàng' });
    }

    // 1. Update order state in PostgreSQL
    const updatedOrder = await prisma.orderHistory.update({
      where: { id: order.id },
      data: {
        state: 'sale',
        ...(body.customNote ? { note: body.customNote } : {}),
        updatedAt: new Date(),
      },
      include: {
        customerProfile: true,
        lines: true,
      },
    });

    // 2. Sync / Create order in Odoo ERP
    let odooConfirmed = false;
    let syncedOdooId = order.odooOrderId;

    if (syncedOdooId) {
      try {
        odooConfirmed = await odooService.confirmOrder(syncedOdooId);
      } catch (err: any) {
        logger.warn(`[order-routes] Odoo confirm warning: ${err.message}`);
      }
    } else {
      // Order was created in OCMS (e.g. by AI/Staff) and not yet in Odoo -> Create and confirm in Odoo
      try {
        const odooPartnerId = order.odooPartnerId || order.customerProfile?.odooPartnerId;
        if (odooPartnerId) {
          const validLines = (order.lines || [])
            .filter((l: any) => l.odooProductId)
            .map((l: any) => ({
              product_id: l.odooProductId,
              product_uom_qty: l.quantity || 1,
              price_unit: l.priceUnit || 0,
              discount: l.discount || 0,
            }));

          if (validLines.length > 0) {
            const createdOdooId = await odooService.createOrder({
              partner_id: odooPartnerId,
              note: order.note || undefined,
              order_line: validLines,
            });

            if (createdOdooId) {
              syncedOdooId = createdOdooId;
              await prisma.orderHistory.update({
                where: { id: order.id },
                data: { odooOrderId: createdOdooId },
              });
              odooConfirmed = await odooService.confirmOrder(createdOdooId);
              logger.info(`[order-routes] Pushed OCMS order ${order.orderCode} to Odoo as sale.order #${createdOdooId}`);
            }
          }
        }
      } catch (err: any) {
        logger.warn(`[order-routes] Failed to create order in Odoo ERP: ${err.message}`);
      }
    }

    // 3. Compose and dispatch Zalo confirmation template message
    const customerName = order.partnerName || order.customerProfile?.name || 'Quý khách';
    const salesperson = order.salesperson || user.email || 'chuyên viên tư vấn';
    const linesText = buildLinesSummary(order.lines);
    const totalText = formatVND(order.amountTotal);

    const zaloMessage =
`🔔 [OCMS] XÁC NHẬN ĐƠN HÀNG #${order.orderCode}
Kính gửi Quý khách ${customerName},

Đơn hàng của Quý khách đã được xác nhận thành công!

📦 Danh sách sản phẩm:
${linesText}

💰 Tổng giá trị dự kiến: ${totalText}

Nhân viên ${salesperson} sẽ sớm liên hệ gửi báo giá chi tiết và tiến hành giao hàng.
Xin trân trọng cảm ơn Quý khách!`;

    const zaloResult = await sendOrderNotificationToCustomer(user.orgId, order, zaloMessage);

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
              data: { draftOrder: Prisma.JsonNull },
            });
            await prisma.conversation.update({
              where: { id: conv.id },
              data: { currentState: state },
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
      message: `Đã xác nhận đơn hàng #${order.orderCode}`,
      odooConfirmed,
      zaloSent: zaloResult.sent,
      zaloReason: zaloResult.reason,
      order: updatedOrder,
    };
  });

  // ── Reject Order & Dispatch Zalo Notification ─────────────────────────────
  app.post('/api/v1/orders/:id/reject', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { reason = 'Hết hàng tạm thời hoặc thông tin đơn hàng chưa đầy đủ' } = (request.body || {}) as { reason?: string };

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
      return reply.status(404).send({ error: 'Không tìm thấy đơn hàng' });
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

    const zaloMessage =
`⚠️ [OCMS] THÔNG BÁO VỀ ĐƠN HÀNG #${order.orderCode}
Kính gửi Quý khách ${customerName},

Rất tiếc, đơn hàng #${order.orderCode} của Quý khách tạm thời chưa thể xác nhận.

📦 Danh sách sản phẩm:
${linesText}

❌ Lý do từ chối:
${reason}

Quý khách vui lòng nhắn tin trực tiếp để nhân viên hỗ trợ tư vấn sản phẩm thay thế hoặc giải đáp thêm.
Trân trọng cảm ơn Quý khách!`;

    const zaloResult = await sendOrderNotificationToCustomer(user.orgId, order, zaloMessage);

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
            data: { draftOrder: Prisma.JsonNull },
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
        { odooOrderId: null },
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

