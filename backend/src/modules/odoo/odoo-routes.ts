/**
 * Odoo API Routes.
 * Provides endpoints to fetch customer details and check Odoo connectivity.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { odooService } from './odoo-service.js';
import { directusService } from '../directus/directus-service.js';
import { logger } from '../../shared/utils/logger.js';
import { authMiddleware } from '../auth/auth-middleware.js';

export async function odooRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/odoo/health — check Odoo connection
  app.get('/api/v1/odoo/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await odooService.checkHealth();
      return reply.send(health);
    } catch (err: any) {
      logger.error('[odoo-routes] health check error:', err);
      return reply.status(500).send({ ok: false, error: err.message });
    }
  });

  // GET /api/v1/odoo/customers/:id — get customer by Odoo ID
  app.get('/api/v1/odoo/customers/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      if (!id) {
        return reply.status(400).send({ error: 'Missing customer ID' });
      }

      const [customer, orderStats] = await Promise.all([
        odooService.getCustomerById(id),
        odooService.getCustomerOrderStats(id),
      ]);

      if (!customer) {
        return reply.status(404).send({ error: 'Không tìm thấy khách hàng trên Odoo' });
      }

      return reply.send({
        success: true,
        customer: {
          ...customer,
          totalRevenue: orderStats.totalRevenue,
          totalOrders: orderStats.totalOrders,
          lastOrderDate: orderStats.lastOrderDate,
        },
        orderStats,
      });
    } catch (err: any) {
      logger.error('[odoo-routes] get customer error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi truy vấn Odoo' });
    }
  });

  // GET /api/v1/odoo/employees — list/search employees
  app.get('/api/v1/odoo/employees', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { query = '' } = request.query as { query?: string };
      const employees = await odooService.searchEmployees(query, 20);
      return reply.send({ success: true, employees });
    } catch (err: any) {
      logger.error('[odoo-routes] search employees error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi tìm kiếm nhân viên' });
    }
  });

  // GET /api/v1/odoo/employees/:id — get employee by Odoo ID
  app.get('/api/v1/odoo/employees/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      if (!id) {
        return reply.status(400).send({ error: 'Missing employee ID' });
      }

      const employee = await odooService.getEmployeeById(id);
      if (!employee) {
        return reply.status(404).send({ error: 'Không tìm thấy nhân viên trên Odoo' });
      }

      return reply.send({ success: true, employee });
    } catch (err: any) {
      logger.error('[odoo-routes] get employee error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi truy vấn Odoo' });
    }
  });

  // POST /api/v1/odoo/customers — create a new customer in Odoo
  app.post('/api/v1/odoo/customers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = request.body as any;
      if (!data || !data.name) {
        return reply.status(400).send({ error: 'Tên khách hàng là bắt buộc' });
      }

      const customerData = {
        is_company: !!data.is_company,
        name: data.name,
        street: data.street,
        city: data.city,
        phone: data.phone,
        email: data.email,
        salesperson: data.salesperson,
      };

      const newId = await odooService.createCustomer(customerData);
      
      // Fetch the created customer to return full details
      const customer = await odooService.getCustomerById(newId!);
      
      return reply.status(201).send({ success: true, id: newId, customer });
    } catch (err: any) {
      logger.error('[odoo-routes] create customer error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi tạo khách hàng Odoo' });
    }
  });

  // In-memory caches with 30-minute TTL to optimize Odoo calls
  let zonesCache: string[] | null = null;
  let zonesCacheTime = 0;
  let salespersonsCache: { id: number; name: string }[] | null = null;
  let salespersonsCacheTime = 0;
  let paymentTermsCache: any[] | null = null;
  let paymentTermsCacheTime = 0;
  let productsCache: any[] | null = null;
  let productsCacheTime = 0;
  const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

  /**
   * Helper to sync and enrich products from Directus, disk cache, and Odoo
   */
  async function getOrSyncProducts(force = false): Promise<any[]> {
    const now = Date.now();
    if (productsCache && !force && now - productsCacheTime < CACHE_DURATION) {
      return productsCache;
    }

    // 1. Load rich products from Directus / Persistent Disk Cache
    let richProducts = await directusService.getProducts(force);

    // 2. If Directus has products (official catalog), verify Odoo IDs and return official catalog
    if (richProducts && richProducts.length > 0) {
      productsCache = richProducts;
      productsCacheTime = now;
      directusService.saveDiskCache(richProducts).catch(() => {});
      logger.info(`[odoo-routes] Successfully loaded ${richProducts.length} official products from Directus catalog.`);
      return richProducts;
    }

    // 3. Fallback: Only if Directus and disk cache are completely empty, query Odoo
    let fallbackProducts: any[] = [];
    try {
      logger.info('[odoo-routes] Directus catalog empty, falling back to Odoo...');
      fallbackProducts = await odooService.getAllSellableProducts();
    } catch (err: any) {
      logger.warn('[odoo-routes] Failed fetching Odoo products fallback:', err.message);
    }

    productsCache = fallbackProducts;
    productsCacheTime = now;
    return fallbackProducts;
  }

  // GET /api/v1/odoo/products — get all products from multi-tier cache
  app.get('/api/v1/odoo/products', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { query = '', refresh } = request.query as { query?: string; refresh?: string };
      const prods = await getOrSyncProducts(refresh === 'true');

      let result = prods;
      const q = query.trim().toLowerCase();
      if (q) {
        result = prods.filter(p => {
          const code = (p.default_code || p.sku || '').toLowerCase();
          const name = (p.name || '').toLowerCase();
          const displayName = (p.display_name || '').toLowerCase();
          return code.includes(q) || name.includes(q) || displayName.includes(q);
        });
      }

      return reply.send({ success: true, products: result, total: prods.length });
    } catch (err: any) {
      logger.error('[odoo-routes] search products error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi tìm kiếm sản phẩm' });
    }
  });

  // POST /api/v1/odoo/products/sync — force refresh and save cache
  app.post('/api/v1/odoo/products/sync', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const prods = await getOrSyncProducts(true);
      return reply.send({
        success: true,
        message: `Đã đồng bộ và lưu cache thành công ${prods.length} sản phẩm`,
        total: prods.length,
        updated_at: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('[odoo-routes] sync products error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi đồng bộ sản phẩm' });
    }
  });

  // GET /api/v1/odoo/payment-terms — get payment terms (cached)
  app.get('/api/v1/odoo/payment-terms', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { refresh } = request.query as { refresh?: string };
      const now = Date.now();

      if (!paymentTermsCache || refresh === 'true' || now - paymentTermsCacheTime > CACHE_DURATION) {
        paymentTermsCache = await odooService.getPaymentTerms();
        paymentTermsCacheTime = now;
      }

      return reply.send({ success: true, terms: paymentTermsCache });
    } catch (err: any) {
      logger.error('[odoo-routes] get payment terms error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi lấy điều khoản thanh toán' });
    }
  });

  // POST /api/v1/odoo/orders
  app.post('/api/v1/odoo/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = request.body as any;
      if (!body.partner_id || !body.order_line || body.order_line.length === 0) {
        return reply.status(400).send({ error: 'Thiếu partner_id hoặc order_line' });
      }

      const { prisma } = await import('../../shared/database/prisma-client.js');
      const { randomUUID } = await import('node:crypto');

      // Fetch user to get their linked employee ID
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { odooId: true }
      });
      const employeeId = dbUser?.odooId ? parseInt(dbUser.odooId) : undefined;
      
      let odooUserId: number | undefined = undefined;
      let salespersonName: string | undefined = undefined;

      // Extract Odoo Salesperson (User) ID from Employee
      if (employeeId) {
        try {
          const employee = await odooService.getEmployeeById(employeeId);
          if (employee && employee.user_id && Array.isArray(employee.user_id) && employee.user_id.length > 0) {
            odooUserId = employee.user_id[0];
          } else {
            logger.warn(`[odoo-routes] Employee ${employeeId} does not have a linked user_id in Odoo. Cannot assign salesperson.`);
          }
        } catch (err: any) {
          logger.warn(`[odoo-routes] Failed to fetch employee ${employeeId}:`, err.message);
        }
      }

      // Check if customer already has a salesperson
      try {
        const customer = await odooService.getCustomerById(body.partner_id);
        if (customer && customer.salesperson) {
          // Customer already has a salesperson assigned in Odoo, do not override
          odooUserId = undefined;
        }
      } catch (err: any) {
        logger.warn('[odoo-routes] Failed to fetch customer to check salesperson:', err.message);
      }

      // Validate odooUserId and get salesperson name
      if (odooUserId) {
        try {
          if (!salespersonsCache || Date.now() - salespersonsCacheTime > CACHE_DURATION) {
            salespersonsCache = await odooService.getSalespersons();
            salespersonsCacheTime = Date.now();
          }
          const salespersonInfo = salespersonsCache.find((s: any) => s.id === odooUserId);
          if (salespersonInfo) {
            salespersonName = salespersonInfo.name;
          } else {
            logger.warn(`[odoo-routes] odooUserId ${odooUserId} not found in Odoo active salespersons. Ignoring.`);
            odooUserId = undefined;
          }
        } catch (err: any) {
          logger.warn('[odoo-routes] Failed to fetch salespersons cache:', err.message);
          odooUserId = undefined;
        }
      }

      const orderId = await odooService.createOrder({
        partner_id: body.partner_id,
        validity_date: body.validity_date,
        payment_term_id: body.payment_term_id,
        pricelist_id: body.pricelist_id,
        user_id: odooUserId,
        note: body.notes,
        order_line: body.order_line,
      });

      let orderCode = `ODOO-${orderId}`;
      let totalAmount = 0;

      // Fetch the created order to get its real name (e.g. SO001) and total
      const odooOrder = await odooService.getOrder(orderId!);
      if (odooOrder) {
        orderCode = odooOrder.name;
        totalAmount = odooOrder.amount_total || 0;
      }

      // If user has a valid Odoo ID, link the customer to this salesperson
      if (odooUserId) {
        try {
          await odooService.updateCustomer(body.partner_id, { user_id: odooUserId });
        } catch (err: any) {
          logger.warn('[odoo-routes] Failed to update customer salesperson:', err.message);
        }
      }

      // Save a summary in Prisma Orders & Record Message in conversation
      if (body.contactId) {
        await prisma.order.create({
          data: {
            id: randomUUID(),
            orgId: user.orgId,
            contactId: body.contactId,
            createdByUserId: user.id,
            conversationId: body.conversationId || null,
            orderCode,
            totalAmount: parseFloat(totalAmount as any),
            status: 'new',
            notes: body.notes || 'Tạo từ tích hợp Odoo',
          }
        });

        // Insert message record into conversation history
        if (body.conversationId) {
          const formattedAmount = Number(totalAmount).toLocaleString('vi-VN');
          await prisma.message.create({
            data: {
              id: randomUUID(),
              conversationId: body.conversationId,
              senderType: 'self',
              senderName: salespersonName || 'Nhân viên',
              content: `🎉 Đã tạo đơn hàng thành công trên Odoo: ${orderCode} (Tổng tiền: ${formattedAmount} đ)`,
              contentType: 'text',
              sentAt: new Date(),
              repliedByUserId: user.id,
              isNote: false,
            }
          }).catch(e => logger.warn('[odoo-routes] Failed to save order message in conversation:', e.message));

          await prisma.conversation.update({
            where: { id: body.conversationId },
            data: {
              lastMessageAt: new Date(),
              currentState: 'NEW',
            }
          }).catch(e => logger.warn('[odoo-routes] Failed to update conversation lastMessageAt:', e.message));

          // Clear draftOrder in ConversationAiState on order creation success
          await prisma.conversationAiState.update({
            where: { conversationId: body.conversationId },
            data: {
              draftOrder: { items: [] },
            }
          }).catch(e => logger.warn('[odoo-routes] Failed to clear draftOrder in ConversationAiState:', e.message));
        }

        if (salespersonName) {
          await prisma.contact.update({
            where: { id: body.contactId },
            data: { salesperson: salespersonName }
          }).catch(e => logger.warn('[odoo-routes] Failed to update local contact salesperson:', e.message));
        }
      }

      return reply.status(201).send({ success: true, id: orderId, orderCode, totalAmount });
    } catch (err: any) {
      logger.error('[odoo-routes] create order error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi tạo đơn hàng trên Odoo' });
    }
  });

  // GET /api/v1/odoo/zones
  app.get('/api/v1/odoo/zones', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = Date.now();
      if (!zonesCache || now - zonesCacheTime > CACHE_DURATION) {
        zonesCache = await odooService.getZones();
        zonesCacheTime = now;
      }
      return reply.send({ success: true, zones: zonesCache });
    } catch (err: any) {
      logger.error('[odoo-routes] get zones error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi lấy danh sách khu vực Odoo' });
    }
  });

  // GET /api/v1/odoo/salespersons
  app.get('/api/v1/odoo/salespersons', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = Date.now();
      if (!salespersonsCache || now - salespersonsCacheTime > CACHE_DURATION) {
        salespersonsCache = await odooService.getSalespersons();
        salespersonsCacheTime = now;
      }
      return reply.send({ success: true, salespersons: salespersonsCache });
    } catch (err: any) {
      logger.error('[odoo-routes] get salespersons error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi lấy danh sách nhân viên Odoo' });
    }
  });
}
