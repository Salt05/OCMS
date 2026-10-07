import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { inventoryService, TransactionType, ChannelType } from './inventory-service.js';
import { logger } from '../../shared/utils/logger.js';
import { prisma } from '../../shared/database/prisma-client.js';

export async function inventoryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // 1. Get Dashboard Stats
  app.get('/api/v1/inventory/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    try {
      const stats = await inventoryService.getDashboardStats(user.orgId);
      return { success: true, data: stats };
    } catch (err: any) {
      logger.error('[inventory-routes] getDashboardStats error:', err);
      return reply.status(500).send({ error: 'Lỗi khi lấy thống kê kho' });
    }
  });

  // 1b. Get Product List from product_cache (for dropdown selection in UI)
  app.get('/api/v1/inventory/products', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const query = (request.query || {}) as any;
    const search = (query.search || '').trim();

    try {
      const where: any = { orgId: user.orgId, isActive: true };
      if (search) {
        where.OR = [
          { sku: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ];
      }

      const products = await prisma.productCache.findMany({
        where,
        select: {
          id: true,
          odooId: true,
          sku: true,
          name: true,
          displayName: true,
          uomName: true,
          listPrice: true,
          wholesalePrice: true,
          retailPrice: true,
          brand: true,
          category: true,
          imageUrl: true,
        },
        orderBy: { name: 'asc' },
        take: 200,
      });

      return { success: true, data: products };
    } catch (err: any) {
      logger.error('[inventory-routes] getProductList error:', err);
      return reply.status(500).send({ error: 'Lỗi khi lấy danh sách sản phẩm' });
    }
  });

  // 2. Get Inventory Items (List)
  app.get('/api/v1/inventory/items', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const query = (request.query || {}) as any;
    
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limitParam = parseInt(query.limit || '50', 10);
    const limit = limitParam >= 1000 ? 999999 : Math.min(1000, Math.max(1, limitParam));
    
    try {
      const data = await inventoryService.getInventoryItems(user.orgId, {
        search: query.search,
        status: query.status,
        category: query.category,
        brand: query.brand,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        page,
        limit
      });
      return { success: true, data };
    } catch (err: any) {
      logger.error('[inventory-routes] getInventoryItems error:', err);
      return reply.status(500).send({ error: 'Lỗi khi lấy danh sách tồn kho' });
    }
  });

  // 2b. Get returnable orders for given SKUs
  app.get('/api/v1/inventory/returnable-orders', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const query = (request.query || {}) as { skus?: string, search?: string };
    
    try {
      if (!query.skus) return { success: true, data: [] };
      const skus = query.skus.split(',').map(s => s.trim()).filter(Boolean);
      if (skus.length === 0) return { success: true, data: [] };
      
      const lines = await prisma.orderLineHistory.findMany({
        where: {
          orderHistory: { 
            orgId: user.orgId,
            ...(query.search ? {
              OR: [
                { orderCode: { contains: query.search } },
                { partnerName: { contains: query.search } }
              ]
            } : {})
          },
          productSku: { in: skus },
          qtyDelivered: { gt: 0 }
        },
        include: { orderHistory: true },
        take: 20
      });
      
      // Deduplicate by orderHistory.id
      const ordersMap = new Map();
      for (const line of lines) {
        if (!ordersMap.has(line.orderHistory.id)) {
          ordersMap.set(line.orderHistory.id, line.orderHistory);
        }
      }
      
      return { success: true, data: Array.from(ordersMap.values()) };
    } catch (err: any) {
      logger.error('[inventory-routes] get returnable orders error:', err);
      return reply.status(500).send({ error: 'Lỗi lấy đơn trả hàng' });
    }
  });

  // 2c. Get Orders (Sale/Purchase) by SKU
  app.get('/api/v1/inventory/stock-orders/:sku', async (request: FastifyRequest<{ Params: { sku: string } }>, reply: FastifyReply) => {
    const user = request.user!;
    const { sku } = request.params;
    
    try {
      const product = await prisma.productCache.findFirst({
        where: { orgId: user.orgId, sku }
      });
      const odooId = product?.odooId;

      const salesLines = await prisma.orderLineHistory.findMany({
        where: {
          orderHistory: { orgId: user.orgId },
          OR: [
            { productSku: sku },
            ...(odooId ? [{ odooProductId: odooId }] : [])
          ]
        },
        include: { orderHistory: true }
      });

      let purchaseLines: any[] = [];
      if (odooId) {
        purchaseLines = await prisma.purchaseOrderLine.findMany({
          where: {
            purchaseOrder: { orgId: user.orgId },
            productId: odooId
          },
          include: { 
            purchaseOrder: {
              include: { createdBy: true }
            } 
          }
        });
      }

      const salesOrders = salesLines.map(line => ({
        id: line.orderHistory.id,
        orderCode: line.orderHistory.orderCode,
        partnerName: line.orderHistory.partnerName || 'Khách hàng',
        dateOrder: line.orderHistory.dateOrder,
        state: line.orderHistory.state,
        type: 'SALE',
        quantity: line.quantity,
        priceUnit: line.priceUnit,
        priceSubtotal: line.priceSubtotal,
        note: line.orderHistory.note || line.orderHistory.activitySummary || ''
      }));

      const purchaseOrders = purchaseLines.map(line => ({
        id: line.purchaseOrder.id,
        orderCode: line.purchaseOrder.purchaseCode || line.purchaseOrder.id.substring(0,8),
        partnerName: line.purchaseOrder.createdBy?.fullName || line.purchaseOrder.createdBy?.email || 'Hệ thống',
        dateOrder: line.purchaseOrder.orderDeadline || line.purchaseOrder.createdAt,
        state: line.purchaseOrder.state,
        type: 'IMPORT',
        quantity: line.quantity,
        priceUnit: line.priceUnit,
        priceSubtotal: line.priceSubtotal,
        note: line.purchaseOrder.notes || line.purchaseOrder.activitySummary || ''
      }));

      const stockTakeLines = await prisma.stockTakeItem.findMany({
        where: {
          sku: sku,
          stockTake: { orgId: user.orgId }
        },
        include: { 
          stockTake: {
            include: { performedBy: true }
          } 
        }
      });

      const adjustmentOrders = stockTakeLines.map(line => ({
        id: line.stockTake.id,
        orderCode: line.stockTake.code,
        partnerName: line.stockTake.performedBy?.fullName || line.stockTake.performedBy?.email || 'Hệ thống (Kiểm kho)',
        dateOrder: line.stockTake.completedAt || line.stockTake.createdAt,
        state: line.stockTake.status,
        type: line.difference && line.difference > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
        quantity: Math.abs(line.difference || 0),
        priceUnit: 0,
        priceSubtotal: 0,
        note: line.stockTake.notes || line.reason || ''
      }));

      const allOrders = [...salesOrders, ...purchaseOrders, ...adjustmentOrders].sort((a, b) => 
        new Date(b.dateOrder).getTime() - new Date(a.dateOrder).getTime()
      );

      return { success: true, data: allOrders };
    } catch (err: any) {
      logger.error('[inventory-routes] get stock orders error:', err);
      return reply.status(500).send({ error: 'Lỗi khi lấy danh sách đơn hàng của sản phẩm' });
    }
  });

  // 3. Get Transactions History
  app.get('/api/v1/inventory/transactions', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const query = (request.query || {}) as any;
    
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
    
    try {
      const data = await inventoryService.getTransactions(user.orgId, {
        sku: query.sku,
        type: query.type,
        channel: query.channel,
        startDate: query.startDate,
        endDate: query.endDate,
        page,
        limit
      });
      return { success: true, data };
    } catch (err: any) {
      logger.error('[inventory-routes] getTransactions error:', err);
      return reply.status(500).send({ error: 'Lỗi khi lấy lịch sử biến động kho' });
    }
  });

  // 3b. Update Min Stock (Cảnh báo sắp hết hàng)
  app.post('/api/v1/inventory/min-stock', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = request.body as any;
    if (!body.sku || typeof body.minStock !== 'number' || body.minStock < 0) {
      return reply.status(400).send({ error: 'Thiếu hoặc sai thông tin bắt buộc: sku, minStock' });
    }
    
    try {
      await prisma.inventoryItem.update({
        where: { orgId_sku: { orgId: user.orgId, sku: body.sku } },
        data: { minStock: body.minStock }
      });
      // Clear cache so the new status reflects immediately
      inventoryService.clearCache();
      return { success: true };
    } catch (err: any) {
      logger.error('[inventory-routes] update minStock error:', err);
      return reply.status(500).send({ error: 'Lỗi khi cập nhật mức cảnh báo tồn kho' });
    }
  });

  // 3c. Bulk Update Min Stock
  app.post('/api/v1/inventory/bulk-min-stock', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = request.body as any;
    if (!Array.isArray(body.skus) || typeof body.minStock !== 'number' || body.minStock < 0) {
      return reply.status(400).send({ error: 'Thiếu hoặc sai thông tin bắt buộc: skus (array), minStock' });
    }
    
    try {
      await prisma.inventoryItem.updateMany({
        where: { orgId: user.orgId, sku: { in: body.skus } },
        data: { minStock: body.minStock }
      });
      inventoryService.clearCache();
      return { success: true };
    } catch (err: any) {
      logger.error('[inventory-routes] bulk update minStock error:', err);
      return reply.status(500).send({ error: 'Lỗi khi cập nhật mức cảnh báo tồn kho hàng loạt' });
    }
  });

  // 4. Create Transaction (Nhập/Xuất/Điều chỉnh)
  app.post('/api/v1/inventory/transactions', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    // Optionally check permission here
    // if (user.role !== 'admin' && user.role !== 'owner') return reply.status(403).send({error: 'Forbidden'});

    const body = request.body as any;
    const allowedManualTypes: TransactionType[] = [
      'INITIAL_STOCK',
      'RETURN_IN',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'DAMAGE',
    ];
    
    if (!body.sku || !body.type || typeof body.quantity !== 'number') {
      return reply.status(400).send({ error: 'Thiếu thông tin bắt buộc: sku, type, quantity' });
    }
    if (!allowedManualTypes.includes(body.type)) {
      return reply.status(400).send({ error: 'Loại biến động không hợp lệ cho phiếu thủ công' });
    }
    if (body.quantity === 0) {
      return reply.status(400).send({ error: 'Số lượng phải khác 0' });
    }
    if (body.type === 'RETURN_IN') {
      return reply.status(400).send({ error: 'Khách trả hàng phải được tạo từ đơn hàng gốc' });
    }

    try {
      const result = await inventoryService.createTransaction({
        orgId: user.orgId,
        sku: body.sku,
        productName: body.productName,
        type: body.type as TransactionType,
        channel: body.channel as ChannelType,
        quantity: body.quantity, // Must be correct sign (+/-) from frontend
        referenceType: body.referenceType,
        referenceId: body.referenceId,
        referenceCode: body.referenceCode,
        performedByUserId: user.id,
        reason: body.reason,
        notes: body.notes
      });
      return { success: true, data: result };
    } catch (err: any) {
      logger.error('[inventory-routes] createTransaction error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi khi tạo biến động kho' });
    }
  });

  // Search delivered orders for the customer-return form.
  app.get('/api/v1/inventory/return-orders', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { search = '', skus = '' } = (request.query || {}) as { search?: string, skus?: string };
    const normalizedSearch = search.trim();
    const skuList = skus.split(',').map(s => s.trim()).filter(Boolean);
    
    // Nếu không có search và cũng không có skus thì bỏ qua
    if (!normalizedSearch && skuList.length === 0) return { success: true, data: [] };

    try {
      const orders = await prisma.orderHistory.findMany({
        where: {
          orgId: user.orgId,
          state: { in: ['sale', 'done'] },
          ...(normalizedSearch ? { orderCode: { contains: normalizedSearch, mode: 'insensitive' } } : {}),
          ...(skuList.length > 0 ? {
            lines: {
              some: {
                productSku: { in: skuList },
                qtyDelivered: { gt: 0 }
              }
            }
          } : {})
        },
        select: {
          id: true,
          orderCode: true,
          partnerName: true,
          dateOrder: true,
          state: true,
          lines: {
            select: {
              id: true,
              productName: true,
              productSku: true,
              odooProductId: true,
              quantity: true,
              qtyDelivered: true,
              reservedQuantity: true,
              shippedQuantity: true,
              returnedQuantity: true,
            },
            orderBy: { odooLineId: 'asc' },
          },
        },
        orderBy: { dateOrder: 'desc' },
        take: 20,
      });

      const skus = orders.flatMap(order => order.lines.map(line => line.productSku).filter(Boolean)) as string[];
      const products = skus.length
        ? await prisma.productCache.findMany({
            where: { orgId: user.orgId, sku: { in: skus }, isActive: true },
            select: { sku: true, imageUrl: true },
          })
        : [];
      const imageBySku = new Map(products.map(product => [product.sku, product.imageUrl]));
      const result = orders.map(order => ({
        ...order,
        lines: order.lines.map(line => ({
          ...line,
          imageUrl: line.productSku ? imageBySku.get(line.productSku) || null : null,
        })),
      }));

      return { success: true, data: result };
    } catch (err: any) {
      logger.error('[inventory-routes] search return orders error:', err);
      return reply.status(500).send({ error: 'Lỗi khi tìm đơn hàng trả hàng' });
    }
  });

  // Process a customer return against a specific order.
  app.post('/api/v1/inventory/returns', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = request.body as any;
    if (!body.orderId || !Array.isArray(body.lines) || body.lines.length === 0) {
      return reply.status(400).send({ error: 'Thiếu đơn hàng hoặc sản phẩm trả hàng' });
    }

    try {
      const order = await prisma.orderHistory.findFirst({
        where: { id: body.orderId, orgId: user.orgId },
        include: { lines: true },
      });
      if (!order) return reply.status(404).send({ error: 'Không tìm thấy đơn hàng' });

      const orderLines = new Map(order.lines.map(line => [line.id, line]));
      const lines = body.lines.map((line: any) => {
        const orderLine = orderLines.get(line.id);
        const quantity = Number(line.quantity);
        if (!orderLine || !orderLine.productSku || !Number.isFinite(quantity) || quantity <= 0) {
          throw new Error('Dữ liệu sản phẩm trả hàng không hợp lệ');
        }
        return { id: orderLine.id, sku: orderLine.productSku, quantity };
      });

      const result = await inventoryService.returnStock(
        user.orgId,
        order.id,
        order.orderCode,
        lines,
        user.id,
      );
      return { success: true, data: result };
    } catch (err: any) {
      logger.error('[inventory-routes] return stock error:', err);
      return reply.status(400).send({ error: err.message || 'Không thể xử lý trả hàng' });
    }
  });

  // 5. Get stock info for a single SKU (for product detail popup)
  app.get('/api/v1/inventory/stock/:sku', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { sku } = request.params as { sku: string };
    try {
      const item = await prisma.inventoryItem.findUnique({
        where: { orgId_sku: { orgId: user.orgId, sku } },
        select: {
          onHand: true,
          reserved: true,
          soldQuantity: true,
          minStock: true,
          unit: true,
          updatedAt: true,
        },
      });
      const data = item
        ? { ...item, available: item.onHand - item.reserved }
        : { onHand: 0, reserved: 0, soldQuantity: 0, minStock: 0, unit: null, available: 0, updatedAt: null };
      return { success: true, data };
    } catch (err: any) {
      logger.error('[inventory-routes] getStock error:', err);
      return reply.status(500).send({ error: 'Lỗi khi lấy tồn kho' });
    }
  });

  // 6. Get transaction history for a single SKU (for product detail popup)
  app.get('/api/v1/inventory/transactions/by-sku/:sku', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { sku } = request.params as { sku: string };
    const query = (request.query || {}) as any;
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '30', 10)));
    const skip = (page - 1) * limit;

    try {
      const where: any = { orgId: user.orgId, sku };

      const [rawTransactions, total] = await Promise.all([
        prisma.inventoryTransaction.findMany({
          where,
          include: {
            performedBy: { select: { fullName: true } },
          },
          orderBy: { performedAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.inventoryTransaction.count({ where }),
      ]);

      const transactions = await Promise.all(rawTransactions.map(async (tx) => {
        let operatorName = tx.performedBy?.fullName || 'Hệ thống';
        let displayTime = tx.performedAt;

        // Nếu là đơn bộ từ Odoo
        if (tx.channel === 'ODOO') {
          // Ghi chú để trống
          tx.reason = null;
          tx.notes = null;

          // Nếu là đơn sale, lấy nhân viên sale và thời gian tạo đơn
          if (tx.type === 'SALE' && tx.referenceCode) {
            const order = await prisma.orderHistory.findFirst({
              where: { orgId: user.orgId, orderCode: tx.referenceCode },
              select: { salesperson: true, dateOrder: true }
            });
            if (order) {
              if (order.salesperson) operatorName = order.salesperson;
              if (order.dateOrder) displayTime = order.dateOrder;
            }
          }
        }

        return {
          ...tx,
          operatorName,
          displayTime,
        };
      }));

      // Sắp xếp thứ tự hiển thị theo ngày (mới nhất lên đầu)
      transactions.sort((a, b) => new Date(b.displayTime || b.performedAt).getTime() - new Date(a.displayTime || a.performedAt).getTime());

      return { success: true, data: { transactions, total, page, limit, totalPages: Math.ceil(total / limit) } };
    } catch (err: any) {
      logger.error('[inventory-routes] getTransactionsBySku error:', err);
      return reply.status(500).send({ error: 'Lỗi khi lấy lịch sử giao dịch' });
    }
  });

  // 7. Submit Stock Take
  app.post('/api/v1/inventory/stock-takes', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = request.body as any; // { items: [{ sku, actualQuantity, reason }] }
    
    if (!body.items || !Array.isArray(body.items)) {
      return reply.status(400).send({ error: 'Dữ liệu kiểm kê không hợp lệ' });
    }

    try {
      const code = `KK-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*1000)}`;
      const result = await inventoryService.processStockTake(user.orgId, user.id, code, body.items);
      return { success: true, data: result };
    } catch (err: any) {
      logger.error('[inventory-routes] processStockTake error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi khi xử lý kiểm kê' });
    }
  });
}
