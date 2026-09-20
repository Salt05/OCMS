/**
 * Odoo API Routes.
 * Provides endpoints to fetch customer details and check Odoo connectivity.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { odooService } from './odoo-service.js';
import { directusService } from '../directus/directus-service.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { routerClient } from '../../shared/services/router-client.js';

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

  // GET /api/v1/odoo/customers/search — search customers by name, phone, email, or ID
  app.get('/api/v1/odoo/customers/search', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { query = '' } = request.query as { query?: string };
      if (!query || !query.trim()) {
        return reply.send({ success: true, customers: [] });
      }

      const customers = await odooService.searchCustomers(query.trim(), 15);
      return reply.send({ success: true, customers });
    } catch (err: any) {
      logger.error('[odoo-routes] search customers error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi tìm kiếm khách hàng Odoo' });
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

  // POST /api/v1/odoo/customers — create a new customer in Odoo (qua Router)
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

      // Điều phối qua RouterClient (Router toàn quyền quyết định Odoo Test hay Prod)
      const routerResult = await routerClient.createCustomer({
        customer: customerData,
        contact_id: data.contactId || data.contact_id,
      });

      const newId = routerResult.customerId;

      // Lấy thông tin khách hàng từ Odoo đích theo Router
      const activeOdoo = await routerClient.getActiveOdooConfig();
      const customer = newId ? await odooService.getCustomerById(newId, activeOdoo || undefined) : null;

      return reply.status(201).send({ success: true, id: newId, customer, target: routerResult.target });
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
   * Helper to sync and enrich products from Directus, disk cache, and Odoo.
   * Merges Directus products and Odoo products; if duplicate, prioritizes Directus data.
   */
  async function getOrSyncProducts(force = false): Promise<any[]> {
    const now = Date.now();
    if (productsCache && !force && now - productsCacheTime < CACHE_DURATION) {
      return productsCache;
    }

    // 1. Load rich products from Directus (or persistent disk cache)
    let directusProducts: any[] = [];
    try {
      directusProducts = await directusService.getProducts(force);
      if (directusProducts && directusProducts.length > 0) {
        directusService.saveDiskCache(directusProducts).catch(() => {});
      }
    } catch (err: any) {
      logger.warn('[odoo-routes] Failed fetching Directus products, falling back to disk cache:', err.message);
      directusProducts = directusService.loadDiskCache() || [];
    }

    // 2. Fetch sellable products from Odoo ERP (with fallback to prisma.productCache)
    let odooProducts: any[] = [];
    try {
      odooProducts = await odooService.getAllSellableProducts();
      logger.info(`[odoo-routes] Fetched ${odooProducts.length} sellable products from Odoo ERP.`);
    } catch (err: any) {
      logger.warn('[odoo-routes] Failed fetching Odoo products directly:', err.message);
    }

    // If live Odoo products empty, fallback to DB ProductCache
    if (!odooProducts || odooProducts.length === 0) {
      try {
        const dbCache = await prisma.productCache.findMany({
          where: { isActive: true },
        });
        if (dbCache && dbCache.length > 0) {
          odooProducts = dbCache.map((cp: any) => ({
            id: cp.odooId,
            name: cp.name,
            default_code: cp.sku || '',
            display_name: cp.displayName || (cp.sku ? `[${cp.sku}] ${cp.name}` : cp.name),
            list_price: cp.listPrice || 0,
            wholesale_price: cp.wholesalePrice || cp.listPrice || 0,
            retail_price: cp.retailPrice || 0,
            uom_name: cp.uomName || 'Gói',
            specification: cp.specification || null,
            image_url: cp.imageUrl || null,
            ingredients: cp.ingredients || null,
            description: cp.description || null,
            weight: cp.weight || null,
            categ_name: cp.category || 'Sản phẩm Odoo ERP',
          }));
          logger.info(`[odoo-routes] Loaded ${odooProducts.length} products from PostgreSQL productCache fallback.`);
        }
      } catch (err: any) {
        logger.warn('[odoo-routes] Failed loading DB productCache fallback:', err.message);
      }
    }

    // 3. Build lookup maps for Directus products (by odoo_id and by SKU)
    const directusByOdooId = new Map<number, any>();
    const directusBySku = new Map<string, any>();

    for (const dp of directusProducts) {
      const numId = Number(dp.odoo_id || dp.id);
      if (numId) directusByOdooId.set(numId, dp);
      const skuKey = (dp.sku || dp.default_code || '').trim().toLowerCase();
      if (skuKey) directusBySku.set(skuKey, dp);
    }

    const processedDirectus = new Set<any>();
    const unifiedList: any[] = [];

    // 4. Process Odoo products: if duplicate with Directus, PRIORITIZE DIRECTUS
    for (const op of odooProducts) {
      const opId = Number(op.id || op.odooId);
      const opSku = (op.default_code || op.sku || '').trim().toLowerCase();
      const dp = (opId ? directusByOdooId.get(opId) : null) || (opSku ? directusBySku.get(opSku) : null);

      if (dp) {
        processedDirectus.add(dp);
        // Prioritize Directus rich information, ensure Odoo ID is mapped correctly
        const sku = dp.sku || dp.default_code || op.default_code || op.sku || '';
        const name = dp.name || op.name || '';
        const uomName = dp.uom_name || op.uom_name || op.uomName || 'Gói';
        const wholesalePrice = Number(dp.wholesale_price || dp.list_price || op.list_price || op.wholesale_price || 0);
        const listPrice = Number(dp.list_price || dp.wholesale_price || op.list_price || 0);
        const retailPrice = Number(dp.retail_price || op.retail_price || 0);
        const odooId = opId || Number(dp.odoo_id || dp.id);

        unifiedList.push({
          ...dp,
          id: dp.id || odooId,
          odoo_id: odooId,
          sku,
          default_code: sku,
          name,
          display_name: dp.display_name || (sku ? `[${sku}] ${name}` : (op.display_name || name)),
          list_price: listPrice > 0 ? listPrice : wholesalePrice,
          wholesale_price: wholesalePrice,
          retail_price: retailPrice,
          uom_id: dp.uom_id || op.uom_id || null,
          uom_name: uomName,
          weight: dp.weight || op.weight || null,
          specification: dp.specification || op.specification || null,
          image_url: dp.image_url || op.image_url || null,
          description: dp.description || op.description || null,
          ingredients: dp.ingredients || op.ingredients || null,
          nutritional_info: dp.nutritional_info || null,
          target: dp.target || op.target || null,
          preservation: dp.preservation || op.preservation || null,
          product_group_id: dp.product_group_id || null,
          product_group_name: dp.product_group_name || null,
          product_groups: dp.product_groups || (dp.product_group_name ? [{ id: dp.product_group_id || 1, name: dp.product_group_name }] : []),
          source: 'directus',
        });
      } else {
        // Odoo only product
        const sku = op.default_code || op.sku || '';
        const name = op.name || '';
        const uomName = op.uom_name || op.uomName || 'Gói';
        const listPrice = Number(op.list_price || 0);
        const wholesalePrice = Number(op.wholesale_price || listPrice);
        const retailPrice = Number(op.retail_price || 0);
        const rawCategory = op.categ_name || op.category || '';
        const categoryName = rawCategory
          ? (rawCategory.includes('/') ? rawCategory.split('/').pop()!.trim() : rawCategory.trim())
          : 'Sản phẩm Odoo ERP';
        const categoryId = op.categ_id || 'odoo';

        unifiedList.push({
          id: opId,
          odoo_id: opId,
          sku,
          default_code: sku,
          name,
          display_name: op.display_name || (sku ? `[${sku}] ${name}` : name),
          list_price: listPrice,
          wholesale_price: wholesalePrice,
          retail_price: retailPrice,
          uom_id: op.uom_id || null,
          uom_name: uomName,
          weight: op.weight || null,
          specification: op.specification || null,
          image_url: op.image_url || null,
          description: op.description || null,
          ingredients: op.ingredients || null,
          nutritional_info: null,
          target: null,
          preservation: null,
          product_group_id: categoryId,
          product_group_name: categoryName,
          product_groups: [{ id: categoryId, name: categoryName }],
          source: 'odoo',
        });
      }
    }

    // 5. Append remaining Directus products not matched with any Odoo product
    for (const dp of directusProducts) {
      if (processedDirectus.has(dp)) continue;

      const odooId = Number(dp.odoo_id || dp.id);
      const sku = dp.sku || dp.default_code || '';
      const name = dp.name || '';
      const wholesalePrice = Number(dp.wholesale_price || dp.list_price || 0);
      const listPrice = Number(dp.list_price || dp.wholesale_price || 0);
      const retailPrice = Number(dp.retail_price || 0);

      unifiedList.push({
        ...dp,
        id: dp.id || odooId,
        odoo_id: odooId,
        sku,
        default_code: sku,
        name,
        display_name: dp.display_name || (sku ? `[${sku}] ${name}` : name),
        list_price: listPrice > 0 ? listPrice : wholesalePrice,
        wholesale_price: wholesalePrice,
        retail_price: retailPrice,
        uom_name: dp.uom_name || 'Gói',
        product_groups: dp.product_groups || (dp.product_group_name ? [{ id: dp.product_group_id || 1, name: dp.product_group_name }] : []),
        source: 'directus',
      });
    }

    productsCache = unifiedList;
    productsCacheTime = now;
    logger.info(`[odoo-routes] Unified product catalog ready: ${unifiedList.length} items (${processedDirectus.size} enriched with Directus, ${unifiedList.length - directusProducts.length} from Odoo only).`);
    return unifiedList;
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

      // ── Determine salesperson (NV CSKH) for this order ──
      // Quy tắc nghiệp vụ:
      // 1: Nhân viên 1 tạo đơn, khách A CHƯA CÓ nhân viên Sale -> gán NV 1 (cả đơn hàng và khách hàng)
      // 2: Nhân viên 1 tạo đơn, khách A ĐÃ CÓ nhân viên Sale (ví dụ NV 2) -> KHÔNG gán/sửa lại cho NV 1, giữ nguyên NV 2 của khách

      // Cache danh sách nhân viên Odoo
      if (!salespersonsCache || Date.now() - salespersonsCacheTime > CACHE_DURATION) {
        try {
          salespersonsCache = await odooService.getSalespersons();
          salespersonsCacheTime = Date.now();
        } catch (e: any) {
          logger.warn('[odoo-routes] Failed to refresh salespersons cache:', e.message);
        }
      }

      const findOdooUserIdByName = (name?: string | null): number | undefined => {
        if (!name || !salespersonsCache) return undefined;
        const trimmed = name.trim().toLowerCase();
        const found = salespersonsCache.find((s: any) => s.name && s.name.trim().toLowerCase() === trimmed);
        return found?.id;
      };

      // 1. Tìm thông tin Contact & Partner hiện tại của khách hàng
      let contactRecord = null;
      if (body.contactId) {
        contactRecord = await prisma.contact.findFirst({
          where: { id: body.contactId },
          select: {
            id: true,
            customerId: true,
            fullName: true,
            phone: true,
            email: true,
            address: true,
            salesperson: true,
            assignedUserId: true,
            assignedUser: { select: { id: true, odooId: true, fullName: true } },
          },
        });
      } else if (body.partner_id) {
        contactRecord = await prisma.contact.findFirst({
          where: { customerId: String(body.partner_id), orgId: user.orgId },
          select: {
            id: true,
            customerId: true,
            fullName: true,
            phone: true,
            email: true,
            address: true,
            salesperson: true,
            assignedUserId: true,
            assignedUser: { select: { id: true, odooId: true, fullName: true } },
          },
        });
      }

      const partnerIdNum = parseInt(String(body.partner_id || contactRecord?.customerId || 0), 10);

      // Lấy thông tin partner trên Odoo để kiểm tra khách đã có salesperson chưa
      let odooCustomer: any = null;
      if (partnerIdNum > 0) {
        try {
          odooCustomer = await odooService.getCustomerById(partnerIdNum);
        } catch (err: any) {
          logger.warn('[odoo-routes] Failed to fetch customer from Odoo:', err.message);
        }
      }

      // Lấy customerProfile trong DB local nếu có
      let customerProfile = null;
      if (partnerIdNum > 0) {
        customerProfile = await prisma.customerProfile.findFirst({
          where: { orgId: user.orgId, odooPartnerId: partnerIdNum },
          select: { salesperson: true, salespersonId: true },
        });
      }

      // 2. Xác định xem Khách A đã có nhân viên Sale hay chưa
      let existingOdooUserId: number | undefined = undefined;
      let existingSalespersonName: string | undefined = undefined;

      // 2.1. ƯU TIÊN CAO NHẤT: Kiểm tra trực tiếp từ đối tác Odoo (nguồn chuẩn Odoo ERP)
      if (odooCustomer) {
        if (odooCustomer.salespersonId) {
          existingOdooUserId = odooCustomer.salespersonId;
        }
        if (odooCustomer.salesperson?.trim()) {
          existingSalespersonName = odooCustomer.salesperson.trim();
        }
        if (!existingOdooUserId && existingSalespersonName) {
          existingOdooUserId = findOdooUserIdByName(existingSalespersonName);
        }
      }

      // 2.2. Kiểm tra từ customerProfile local (nếu Odoo chưa có)
      if (!existingOdooUserId && customerProfile) {
        if (customerProfile.salespersonId) {
          existingOdooUserId = customerProfile.salespersonId;
        }
        if (!existingSalespersonName && customerProfile.salesperson?.trim()) {
          existingSalespersonName = customerProfile.salesperson.trim();
        }
        if (!existingOdooUserId && existingSalespersonName) {
          existingOdooUserId = findOdooUserIdByName(existingSalespersonName);
        }
      }

      // 2.3. Kiểm tra từ Contact trong CRM (nếu Odoo và profile đều chưa có)
      if (!existingOdooUserId && contactRecord) {
        if (contactRecord.assignedUser?.odooId) {
          existingOdooUserId = parseInt(contactRecord.assignedUser.odooId, 10);
        }
        if (!existingSalespersonName && contactRecord.assignedUser?.fullName) {
          existingSalespersonName = contactRecord.assignedUser.fullName;
        }
        if (!existingSalespersonName && contactRecord.salesperson?.trim()) {
          existingSalespersonName = contactRecord.salesperson.trim();
        }
        if (!existingOdooUserId && existingSalespersonName) {
          existingOdooUserId = findOdooUserIdByName(existingSalespersonName);
        }
      }

      // Nếu trên Odoo đã có thông tin nhân viên sale (ví dụ Huỳnh Thị Thu Thảo) nhưng Contact CRM bị lệch, tự đồng bộ cập nhật lại Contact
      if (contactRecord && existingSalespersonName && (contactRecord.salesperson !== existingSalespersonName || (contactRecord.assignedUser?.odooId && contactRecord.assignedUser.odooId !== String(existingOdooUserId)))) {
        let matchingLocalUserId: string | null = null;
        if (existingOdooUserId) {
          const matchUser = await prisma.user.findFirst({
            where: { orgId: user.orgId, odooId: String(existingOdooUserId) },
            select: { id: true },
          });
          if (matchUser) matchingLocalUserId = matchUser.id;
        }
        await prisma.contact.update({
          where: { id: contactRecord.id },
          data: {
            salesperson: existingSalespersonName,
            assignedUserId: matchingLocalUserId,
          },
        }).catch(e => logger.warn('[odoo-routes] Failed to sync contact salesperson with Odoo:', e.message));
      }

      // Đảm bảo customerProfile cũng được lưu/cập nhật với salesperson của Odoo
      if (partnerIdNum > 0 && existingSalespersonName) {
        await prisma.customerProfile.upsert({
          where: { orgId_odooPartnerId: { orgId: user.orgId, odooPartnerId: partnerIdNum } },
          update: {
            salesperson: existingSalespersonName,
            salespersonId: existingOdooUserId || null,
          },
          create: {
            orgId: user.orgId,
            odooPartnerId: partnerIdNum,
            name: odooCustomer?.name || contactRecord?.fullName || '',
            phone: odooCustomer?.phone || contactRecord?.phone || null,
            email: odooCustomer?.email || contactRecord?.email || null,
            salesperson: existingSalespersonName,
            salespersonId: existingOdooUserId || null,
          },
        }).catch(e => logger.warn('[odoo-routes] Failed to upsert customerProfile:', e.message));
      }

      const customerAlreadyHasSalesperson = Boolean(
        existingOdooUserId ||
        (existingSalespersonName && existingSalespersonName.trim().length > 0) ||
        contactRecord?.assignedUserId
      );

      let orderOdooUserId: number | undefined = undefined;
      let shouldAssignCustomerToCreator = false;
      let creatorOdooUserId: number | undefined = undefined;
      let creatorName = user.email;

      const dbCreator = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, odooId: true, fullName: true },
      });
      if (dbCreator?.odooId) {
        creatorOdooUserId = parseInt(dbCreator.odooId, 10);
      }
      if (dbCreator?.fullName) {
        creatorName = dbCreator.fullName;
      }

      if (customerAlreadyHasSalesperson) {
        // TRƯỜNG HỢP 2: Khách A ĐÃ CÓ nhân viên Sale -> KHÔNG gán lại cho NV 1
        logger.info(`[odoo-routes] Khách A ĐÃ CÓ nhân viên Sale (${existingSalespersonName || ''} - Odoo #${existingOdooUserId || 'N/A'}). KHÔNG gán khách sang NV tạo đơn (${creatorName}).`);
        orderOdooUserId = existingOdooUserId;
        shouldAssignCustomerToCreator = false;
      } else {
        // TRƯỜNG HỢP 1: Khách A CHƯA CÓ nhân viên Sale -> Gán cho NV 1 (người tạo đơn)
        logger.info(`[odoo-routes] Khách A CHƯA CÓ nhân viên Sale -> Gán cho NV tạo đơn: ${creatorName} (Odoo #${creatorOdooUserId})`);
        orderOdooUserId = creatorOdooUserId;
        shouldAssignCustomerToCreator = true;
      }

      // Validate orderOdooUserId in salespersonsCache
      if (orderOdooUserId) {
        const isValid = salespersonsCache?.some((s: any) => s.id === orderOdooUserId);
        if (!isValid) {
          logger.warn(`[odoo-routes] orderOdooUserId ${orderOdooUserId} not found in Odoo active salespersons list. Set to undefined.`);
          orderOdooUserId = undefined;
        }
      }

      // Tính toán danh sách sản phẩm và tổng tiền ước tính
      const items = (body.order_line || []).map((line: any) => ({
        sku: line.sku || `PROD-${line.product_id}`,
        odoo_product_id: line.product_id,
        quantity: Number(line.product_uom_qty) || 1,
        price: Number(line.price_unit) || 0,
        discount: Number(line.discount) || 0,
      }));

      const totalAmount = items.reduce(
        (sum: number, it: any) => sum + it.price * it.quantity * (1 - (it.discount || 0) / 100),
        0
      );

      const orderCode = `CHAT-${Date.now().toString().slice(-6)}`;

      // CHỈ gán khách hàng nếu khách hàng CHƯA CÓ nhân viên sale trước đó (Rule 1)
      if (shouldAssignCustomerToCreator) {
        // Gán trên Odoo thông qua Router (bất đồng bộ để không chặn phản hồi)
        if (creatorOdooUserId && partnerIdNum > 0) {
          routerClient.updateCustomer({
            partner_id: partnerIdNum,
            data: { user_id: creatorOdooUserId },
          }).catch(err => logger.warn('[odoo-routes] Failed to update customer salesperson on Odoo via Router:', err.message));
        }

        // Gán trong CRM Contact
        const targetContactId = body.contactId || contactRecord?.id;
        if (targetContactId) {
          await prisma.contact.update({
            where: { id: targetContactId },
            data: {
              assignedUserId: user.id,
              salesperson: creatorName,
            },
          }).catch(e => logger.warn('[odoo-routes] Failed to update local contact assignedUser/salesperson:', e.message));
        }

        // Cập nhật customerProfile nếu có
        if (partnerIdNum > 0) {
          await prisma.customerProfile.updateMany({
            where: { orgId: user.orgId, odooPartnerId: partnerIdNum },
            data: {
              salesperson: creatorName,
              salespersonId: creatorOdooUserId || null,
            },
          }).catch(e => logger.warn('[odoo-routes] Failed to update customerProfile:', e.message));
        }
      }

      // Lưu trạng thái ban đầu trong Prisma Orders
      if (body.contactId) {
        await prisma.order.create({
          data: {
            id: randomUUID(),
            orgId: user.orgId,
            contactId: body.contactId,
            createdByUserId: user.id,
            conversationId: body.conversationId || null,
            orderCode,
            totalAmount,
            status: 'processing',
            notes: body.notes || 'Tạo từ tích hợp Odoo',
          }
        }).catch(e => logger.warn('[odoo-routes] Failed to create local order record:', e.message));

        // Clear draftOrder in ConversationAiState on order creation
        if (body.conversationId) {
          await prisma.conversationAiState.update({
            where: { conversationId: body.conversationId },
            data: {
              draftOrder: { items: [] },
            }
          }).catch(e => logger.warn('[odoo-routes] Failed to clear draftOrder in ConversationAiState:', e.message));
        }
      }

      // Điều phối tạo đơn qua Universal Router Queue (100% Asynchronous & Event-Driven)
      const customerName = contactRecord?.fullName || odooCustomer?.name || 'Khách hàng';
      const customerPhone = contactRecord?.phone || odooCustomer?.phone || '';
      const shippingAddress = contactRecord?.address || 'Giao tại cửa hàng / Chưa cập nhật';

      try {
        await routerClient.submitOrderAsync({
          order_code: orderCode,
          source: 'zalo_chat',
          partner_id: partnerIdNum,
          customer_name: customerName,
          customer_phone: customerPhone,
          shipping_address: shippingAddress,
          validity_date: body.validity_date,
          payment_term_id: body.payment_term_id,
          user_id: orderOdooUserId,
          note: body.notes,
          items,
          total_amount: totalAmount,
          contactId: body.contactId,
          conversationId: body.conversationId,
        });
      } catch (routerErr: any) {
        logger.warn(`[odoo-routes] Router từ chối đơn hàng [${orderCode}]: ${routerErr.message}`);
        await prisma.order.updateMany({
          where: { orderCode, orgId: user.orgId },
          data: {
            status: 'failed',
            notes: `${body.notes || ''} [LỖI ROUTER]: ${routerErr.message}`.trim(),
          },
        }).catch(() => {});

        return reply.status(422).send({
          success: false,
          orderCode,
          status: 'failed',
          error: routerErr.message,
          message: `Đơn hàng ${orderCode} chưa được tạo trên Odoo: ${routerErr.message}`,
        });
      }

      // Phản hồi siêu tốc (< 30ms) cho giao diện người dùng
      return reply.status(201).send({
        success: true,
        orderCode,
        status: 'processing',
        message: `Đơn hàng ${orderCode} đã được tiếp nhận và đang đồng bộ sang Odoo...`,
        totalAmount,
      });
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

  // GET /api/v1/odoo/users — list/search Odoo internal users (res.users)
  app.get('/api/v1/odoo/users', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { query = '' } = request.query as { query?: string };
      const users = await odooService.searchOdooUsers(query, 30);
      return reply.send({ success: true, users });
    } catch (err: any) {
      logger.error('[odoo-routes] search odoo users error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi tìm kiếm tài khoản Odoo' });
    }
  });

  // GET /api/v1/odoo/users/:id — get Odoo user by ID
  app.get('/api/v1/odoo/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      if (!id) {
        return reply.status(400).send({ error: 'Missing user ID' });
      }
      const odooUser = await odooService.getOdooUserById(id);
      if (!odooUser) {
        return reply.status(404).send({ error: 'Không tìm thấy tài khoản trên Odoo' });
      }
      return reply.send({ success: true, user: odooUser });
    } catch (err: any) {
      logger.error('[odoo-routes] get odoo user error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi truy vấn Odoo' });
    }
  });
}
