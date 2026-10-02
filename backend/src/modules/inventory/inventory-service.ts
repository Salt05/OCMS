import { prisma } from '../../shared/database/prisma-client.js';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { directusService } from '../directus/directus-service.js';

export type TransactionType = 'INITIAL_STOCK' | 'IMPORT' | 'RETURN_IN' | 'SALE' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'OTHER';
export type ChannelType = 'CONTACT' | 'ODOO' | 'SHOPEE';

interface CreateTransactionParams {
  orgId: string;
  sku: string;
  productName?: string;
  type: TransactionType;
  channel?: ChannelType;
  quantity: number; // positive for IN, negative for OUT
  referenceType?: string;
  referenceId?: string;
  referenceCode?: string;
  performedByUserId?: string;
  reason?: string;
  notes?: string;
}

export class InventoryService {
  private itemsCache = new Map<string, { data: any; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 20000; // 20 giây cache để phản hồi siêu tốc

  clearCache() {
    this.itemsCache.clear();
  }
  /**
   * Creates an inventory transaction and updates the onHand stock.
   * Ensures atomicity using a database transaction.
   */
  async createTransaction(params: CreateTransactionParams) {
    const { orgId, sku, type, quantity } = params;

    this.clearCache();
    return await prisma.$transaction(async (tx) => {
      // 1. Find or create the InventoryItem for this SKU
      let item = await tx.inventoryItem.findUnique({
        where: {
          orgId_sku: { orgId, sku },
        },
      });

      if (!item) {
        // Try to fetch product details from ProductCache to enrich
        const productCache = await tx.productCache.findFirst({
          where: { orgId, sku, isActive: true },
        });

        item = await tx.inventoryItem.create({
          data: {
            orgId,
            sku,
            productName: params.productName || productCache?.name || sku,
            odooProductId: productCache?.odooId,
            unit: productCache?.uomName || 'Cái',
            onHand: 0,
            reserved: 0,
            soldQuantity: productCache?.soldQuantity || 0,
            minStock: 0,
          },
        });
      }

      // 2. Validate quantity for OUT transactions (optional strict check, but usually allowed to go negative if needed, though better to prevent if strict)
      // Let's allow negative for now, but in UI we will warn. 
      // If type is SALE or OUT, quantity should be passed as negative.
      
      const quantityBefore = item.onHand;
      const quantityAfter = quantityBefore + quantity;
      if (quantityAfter < 0) {
        throw new Error(`Không thể tạo biến động: tồn kho của ${sku} không đủ`);
      }

      // 3. Update the item
      const updatedItem = await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          onHand: quantityAfter,
        },
      });

      // 4. Create the transaction record
      const transaction = await tx.inventoryTransaction.create({
        data: {
          orgId,
          inventoryItemId: item.id,
          sku,
          type,
          channel: params.channel,
          quantity,
          quantityBefore,
          quantityAfter,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
          referenceCode: params.referenceCode,
          performedByUserId: params.performedByUserId,
          reason: params.reason,
          notes: params.notes,
        },
      });

      return { item: updatedItem, transaction };
    });
  }

  /**
   * Cập nhật reserved (giữ hàng) cho đơn hàng
   */
  async reserveStock(orgId: string, orderId: string, orderCode: string, lines: { id: string, sku: string, quantity: number }[], userId?: string) {
    this.clearCache();
    return await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        if (!line.sku) continue;
        let orderLine: any = await tx.orderLine.findUnique({ where: { id: line.id } });
        let isHistory = false;
        if (!orderLine) {
          orderLine = await tx.orderLineHistory.findUnique({ where: { id: line.id } });
          isHistory = true;
        }
        if (!orderLine) continue;

        const currentReserved = orderLine.reservedQuantity || 0;
        const qtyDiff = line.quantity - currentReserved;
        if (qtyDiff === 0) continue;

        let item = await tx.inventoryItem.findUnique({ where: { orgId_sku: { orgId, sku: line.sku } } });
        if (!item) {
          const p = await tx.productCache.findFirst({ where: { orgId, sku: line.sku, isActive: true } });
          item = await tx.inventoryItem.create({
            data: {
              orgId, sku: line.sku, productName: line.sku, odooProductId: p?.odooId,
              onHand: 0, reserved: 0, minStock: 0, unit: p?.uomName || 'Cái'
            }
          });
        }

        if (qtyDiff > 0) {
          if (item.onHand - item.reserved < qtyDiff) {
            throw new Error(`Không đủ tồn kho khả dụng cho sản phẩm ${line.sku}. Khả dụng: ${item.onHand - item.reserved}, Yêu cầu thêm: ${qtyDiff}`);
          }

          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { reserved: item.reserved + qtyDiff }
          });
        } else {
          // Giam so luong
          const releaseQty = Math.abs(qtyDiff);
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { reserved: Math.max(0, item.reserved - releaseQty) }
          });
        }

        if (isHistory) {
          await tx.orderLineHistory.update({
            where: { id: line.id },
            data: { reservedQuantity: currentReserved + qtyDiff }
          });
        } else {
          await tx.orderLine.update({
            where: { id: line.id },
            data: { reservedQuantity: currentReserved + qtyDiff }
          });
        }

        // Ghi nhận vào lịch sử kho (dù không đổi onHand) để dễ theo dõi
        const idempotencyKey = `RESERVE_${orderCode}_${line.sku}_${qtyDiff}_${Date.now()}`;
        await tx.inventoryTransaction.create({
          data: {
            orgId, inventoryItemId: item.id, sku: line.sku,
            type: 'RESERVE', channel: 'ODOO',
            quantity: -qtyDiff, // Số âm thể hiện việc hàng bị giữ, giảm khả dụng
            quantityBefore: item.onHand,
            quantityAfter: item.onHand, // onHand không đổi
            referenceType: 'ORDER', referenceId: orderId, referenceCode: orderCode,
            performedByUserId: userId, reason: qtyDiff > 0 ? 'Đặt giữ hàng' : 'Giảm giữ hàng',
            idempotencyKey
          }
        });
      }
    });
  }

  /**
   * Hủy giữ hàng (khi cancel order)
   */
  async releaseReservedStock(orgId: string, orderId: string, lines: { id: string, sku: string }[]) {
    this.clearCache();
    return await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        if (!line.sku) continue;
        let orderLine: any = await tx.orderLine.findUnique({ where: { id: line.id } });
        let isHistory = false;
        if (!orderLine) {
          orderLine = await tx.orderLineHistory.findUnique({ where: { id: line.id } });
          isHistory = true;
        }
        // History không lưu reserved, nên không thể release (vì chưa reserve qua line gốc hoặc đã reserve logic ảo). Tạm bỏ qua nếu là history.
        if (!orderLine || orderLine.reservedQuantity <= 0) continue;

        const qtyToRelease = orderLine.reservedQuantity;
        const item = await tx.inventoryItem.findUnique({ where: { orgId_sku: { orgId, sku: line.sku } } });
        
        if (item) {
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { reserved: Math.max(0, item.reserved - qtyToRelease) }
          });
        }

        if (isHistory) {
          await tx.orderLineHistory.update({ where: { id: line.id }, data: { reservedQuantity: 0 } });
        } else {
          await tx.orderLine.update({ where: { id: line.id }, data: { reservedQuantity: 0 } });
        }
      }
    });
  }

  /**
   * Xuất kho thực tế (shipped)
   */
  async shipStock(orgId: string, orderId: string, orderCode: string, lines: { id: string, sku: string, quantity: number }[], userId?: string) {
    this.clearCache();
    return await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        if (!line.sku) continue;
        let orderLine: any = await tx.orderLine.findUnique({ where: { id: line.id } });
        let isHistory = false;
        if (!orderLine) {
          orderLine = await tx.orderLineHistory.findUnique({ where: { id: line.id } });
          isHistory = true;
        }
        if (!orderLine) continue;

        let currentShipped = 0;
        currentShipped = orderLine.shippedQuantity || 0;

        // Với Odoo Sync (history), line.quantity được truyền vào là qtyDelivered (tổng đã giao)
        // Nên qtyToShip = qtyDelivered - currentShipped.
        const qtyToShip = line.quantity - currentShipped;
        if (qtyToShip <= 0) continue;

        const idempotencyKey = `SHIP_${orderCode}_${line.sku}_${line.quantity}_${currentShipped}`;
        const existingTx = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey } });
        if (existingTx) continue;

        let item = await tx.inventoryItem.findUnique({ where: { orgId_sku: { orgId, sku: line.sku } } });
        if (!item) {
          const p = await tx.productCache.findFirst({ where: { orgId, sku: line.sku, isActive: true } });
          item = await tx.inventoryItem.create({
            data: {
              orgId, sku: line.sku, productName: line.sku, odooProductId: p?.odooId,
              onHand: 0, reserved: 0, minStock: 0, unit: p?.uomName || 'Cái'
            }
          });
        }

        const currentReserved = orderLine.reservedQuantity || 0;
        const reservedToDeduct = Math.min(currentReserved, qtyToShip);
        const newOnHand = item.onHand - qtyToShip;
        if (newOnHand < 0) {
          throw new Error(`Không thể xuất kho: tồn kho thực tế của ${line.sku} bị âm (còn ${item.onHand}, xuất ${qtyToShip})`);
        }

        await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            onHand: newOnHand,
            reserved: Math.max(0, item.reserved - reservedToDeduct)
          }
        });

        const shippedData = {
          shippedQuantity: currentShipped + qtyToShip,
          reservedQuantity: Math.max(0, currentReserved - reservedToDeduct)
        };
        if (isHistory) {
          await tx.orderLineHistory.update({ where: { id: line.id }, data: shippedData });
        } else {
          await tx.orderLine.update({ where: { id: line.id }, data: shippedData });
        }

        await tx.inventoryTransaction.create({
          data: {
            orgId, inventoryItemId: item.id, sku: line.sku,
            type: 'SALE', channel: 'CONTACT',
            quantity: -qtyToShip,
            quantityBefore: item.onHand,
            quantityAfter: newOnHand,
            referenceType: 'ORDER', referenceId: orderId, referenceCode: orderCode,
            performedByUserId: userId, reason: 'Xuất kho giao hàng',
            idempotencyKey
          }
        });
      }
    });
  }

  /**
   * Trả hàng và cộng lại kho
   */
  async returnStock(orgId: string, orderId: string, orderCode: string, lines: { id: string, sku: string, quantity: number }[], userId?: string) {
    this.clearCache();
    return await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        if (!line.sku || line.quantity <= 0) continue;
        let orderLine: any = await tx.orderLine.findUnique({ where: { id: line.id } });
        let isHistory = false;
        if (!orderLine) {
          orderLine = await tx.orderLineHistory.findUnique({ where: { id: line.id } });
          isHistory = true;
        }
        if (!orderLine) continue;

        const currentReserved = orderLine.reservedQuantity || 0;
        const currentShipped = orderLine.shippedQuantity || 0;
        const currentReturned = orderLine.returnedQuantity || 0;
        if (currentReturned + line.quantity > currentShipped) {
          throw new Error(`Số lượng trả của ${line.sku} vượt quá số lượng đã giao`);
        }

        let reservedReleased = 0;
        if (currentReserved > 0) {
          reservedReleased = Math.min(currentReserved, line.quantity);
        }

        const returnToStock = line.quantity - reservedReleased;

        let item = await tx.inventoryItem.findUnique({ where: { orgId_sku: { orgId, sku: line.sku } } });
        if (!item) continue;

        const newOnHand = item.onHand + returnToStock;

        await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            onHand: newOnHand,
            reserved: Math.max(0, item.reserved - reservedReleased)
          }
        });

        const returnedData = {
          returnedQuantity: currentReturned + line.quantity,
          reservedQuantity: Math.max(0, currentReserved - reservedReleased)
        };
        if (isHistory) {
          await tx.orderLineHistory.update({ where: { id: line.id }, data: returnedData });
        } else {
          await tx.orderLine.update({ where: { id: line.id }, data: returnedData });
        }

        if (returnToStock > 0) {
          const idempotencyKey = `RETURN_${orderCode}_${line.sku}_${currentReturned + line.quantity}`;
          await tx.inventoryTransaction.create({
            data: {
              orgId, inventoryItemId: item.id, sku: line.sku,
              type: 'RETURN_IN', channel: 'CONTACT',
              quantity: returnToStock,
              quantityBefore: item.onHand,
              quantityAfter: newOnHand,
              referenceType: 'ORDER', referenceId: orderId, referenceCode: orderCode,
              performedByUserId: userId, reason: 'Khách trả hàng',
              idempotencyKey
            }
          });
        }
      }
    });
  }

  /**
   * Nhận hàng từ Purchase Order (nhập kho)
   */
  async receivePurchaseStock(orgId: string, purchaseOrderId: string, purchaseCode: string, lines: { id: string, productId: number, quantity: number }[], userId?: string) {
    this.clearCache();
    return await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        // Find sku from productId (Odoo ID)
        const pCache = await tx.productCache.findUnique({
          where: { orgId_odooId: { orgId, odooId: line.productId } }
        });
        if (!pCache || !pCache.sku) continue;
        const sku = pCache.sku;

        const idempotencyKey = `IMPORT_PO_${purchaseCode}_${sku}`;
        const existingTx = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey } });
        if (existingTx) continue; // Đã nhận kho trước đó

        let item = await tx.inventoryItem.findUnique({ where: { orgId_sku: { orgId, sku } } });
        if (!item) {
          item = await tx.inventoryItem.create({
            data: {
              orgId, sku, productName: pCache.name, odooProductId: line.productId,
              onHand: 0, reserved: 0, minStock: 0, unit: pCache.uomName || 'Cái'
            }
          });
        }

        const newOnHand = item.onHand + line.quantity;
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { onHand: newOnHand }
        });

        await tx.inventoryTransaction.create({
          data: {
            orgId, inventoryItemId: item.id, sku,
            type: 'IMPORT', channel: 'ODOO',
            quantity: line.quantity,
            quantityBefore: item.onHand,
            quantityAfter: newOnHand,
            referenceType: 'PURCHASE_ORDER', referenceId: purchaseOrderId, referenceCode: purchaseCode,
            performedByUserId: userId, reason: 'Nhập kho từ phiếu mua',
            idempotencyKey
          }
        });
      }
    });
  }

  /**
   * Fetch inventory items with pagination and filters
   */
  async getInventoryItems(orgId: string, options: { search?: string; status?: string; category?: string; brand?: string; sortBy?: string; sortOrder?: string; page?: number; limit?: number }) {
    const { search, status, category, brand, sortBy, sortOrder = 'desc', page = 1, limit = 50 } = options;
    const cacheKey = `${orgId}:${search || ''}:${status || ''}:${category || ''}:${brand || ''}:${sortBy || ''}:${sortOrder}:${page}:${limit}`;
    const cached = this.itemsCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const skip = (page - 1) * limit;

    const where: Prisma.InventoryItemWhereInput = { orgId, isActive: true };

    if (category && category !== 'Tất cả ngành hàng') {
      const catProducts = await prisma.productCache.findMany({
        where: { orgId, category, isActive: true },
        select: { sku: true },
      });
      const catSkus = catProducts.map(p => p.sku).filter(Boolean) as string[];
      where.sku = { in: catSkus };
    }

    if (brand && brand !== 'Tất cả hãng') {
      const brandProducts = await prisma.productCache.findMany({
        where: { orgId, brand, isActive: true },
        select: { sku: true },
      });
      const brandSkus = brandProducts.map(p => p.sku).filter(Boolean) as string[];
      if (where.sku && (where.sku as any).in) {
        where.sku = { in: (where.sku as any).in.filter((s: string) => brandSkus.includes(s)) };
      } else {
        where.sku = { in: brandSkus };
      }
    }

    if (search) {
      where.OR = [
        { sku: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Fetch matching base items
    let allItems = await prisma.inventoryItem.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });

    if (status === 'out_of_stock') {
      allItems = allItems.filter(i => (i.onHand - i.reserved) <= 0);
    } else if (status === 'low_stock') {
      allItems = allItems.filter(i => (i.onHand - i.reserved) > 0 && (i.onHand - i.reserved) <= i.minStock);
    } else if (status === 'in_stock') {
      allItems = allItems.filter(i => (i.onHand - i.reserved) > i.minStock);
    }

    if (sortBy) {
      allItems.sort((a, b) => {
        let valA = 0;
        let valB = 0;
        if (sortBy === 'available') {
          valA = a.onHand - a.reserved;
          valB = b.onHand - b.reserved;
        } else {
          valA = (a as any)[sortBy] || 0;
          valB = (b as any)[sortBy] || 0;
        }
        if (sortOrder === 'asc') {
          return valA > valB ? 1 : valA < valB ? -1 : 0;
        }
        return valA < valB ? 1 : valA > valB ? -1 : 0;
      });
    }

    const finalTotal = allItems.length;
    const finalItemsRaw = allItems.slice(skip, skip + limit);

    const skus = finalItemsRaw.map(i => i.sku);
    const productCaches = await prisma.productCache.findMany({
      where: { orgId, sku: { in: skus }, isActive: true },
    });
    const cacheMap = new Map(productCaches.map(p => [p.sku, p]));

    let directusMap = new Map<number, any>();
    try {
      const dProducts = await directusService.getProducts();
      for (const dp of dProducts) {
        const odooId = Number(dp.odoo_id || dp.id);
        if (odooId) directusMap.set(odooId, dp);
      }
    } catch {
      // Directus unavailable, fallback gracefully
    }

    const enrichItem = (item: any) => {
      const p = cacheMap.get(item.sku);
      const odooId = p?.odooId || item.odooProductId || null;
      const dp = odooId ? directusMap.get(odooId) || {} : {};

      const listPrice = Number(p?.listPrice || dp.list_price || dp.wholesale_price || 0);
      const wholesalePrice = Number(p?.wholesalePrice || dp.wholesale_price || listPrice || 0);
      const retailPrice = Number(p?.retailPrice || dp.retail_price || 0);
      const imageUrl = directusService.getAssetUrl(p?.imageUrl || dp.image_url) || p?.imageUrl || null;

      return {
        ...item,
        name: p?.name || item.productName,
        productName: item.productName || p?.name,
        odooId: odooId,
        odoo_id: odooId,
        imageUrl,
        image_url: imageUrl,
        category: dp.product_group_name || p?.category || null,
        product_group_name: dp.product_group_name || p?.category || null,
        brand: p?.brand || null,
        listPrice,
        list_price: listPrice,
        wholesalePrice,
        wholesale_price: wholesalePrice,
        retailPrice,
        retail_price: retailPrice,
        specification: p?.specification || dp.specification || null,
        ingredients: p?.ingredients || dp.ingredients || null,
        nutritional_info: dp.nutritional_info || null,
        target: p?.target || dp.target || null,
        preservation: p?.preservation || dp.preservation || null,
        description: p?.description || dp.description || null,
        weight: p?.weight || dp.weight || null,
        uomName: p?.uomName || dp.uom_name || item.unit || 'Cái',
        source: dp.id ? 'directus' : (p?.id ? 'odoo' : undefined),
        available: item.onHand - item.reserved,
        status: (item.onHand - item.reserved) <= 0 ? 'Hết hàng' : ((item.onHand - item.reserved) <= item.minStock ? 'Sắp hết' : 'Đủ hàng'),
      };
    };

    const finalItems = finalItemsRaw.map(enrichItem);

    const result = {
      items: finalItems,
      total: finalTotal,
      page,
      limit,
      totalPages: Math.ceil(finalTotal / limit),
    };

    this.itemsCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    return result;
  }

  /**
   * Get transaction history
   */
  async getTransactions(orgId: string, options: { sku?: string; type?: string; channel?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) {
    const { sku, type, channel, startDate, endDate, page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryTransactionWhereInput = { orgId };
    
    if (sku) where.sku = sku;
    if (type) where.type = type;
    if (channel) where.channel = channel;
    
    if (startDate || endDate) {
      where.performedAt = {};
      if (startDate) where.performedAt.gte = new Date(startDate);
      if (endDate) where.performedAt.lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    const [transactions, total] = await Promise.all([
      prisma.inventoryTransaction.findMany({
        where,
        include: {
          performedBy: { select: { fullName: true } },
          inventoryItem: { select: { productName: true, unit: true } }
        },
        orderBy: { performedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.inventoryTransaction.count({ where }),
    ]);

    return {
      transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get dashboard stats
   */
  async getDashboardStats(orgId: string) {
    const items = await prisma.inventoryItem.findMany({
      where: { orgId, isActive: true },
    });

    const totalProducts = items.length;
    const totalOnHand = items.reduce((sum, item) => sum + item.onHand, 0);
    const totalReserved = items.reduce((sum, item) => sum + item.reserved, 0);
    const totalAvailable = totalOnHand - totalReserved;
    
    const outOfStock = items.filter(i => i.onHand <= 0).length;
    const lowStock = items.filter(i => i.onHand > 0 && i.onHand <= i.minStock).length;

    // Get today's transactions for basic daily stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const recentTx = await prisma.inventoryTransaction.findMany({
      where: { orgId, performedAt: { gte: today } },
    });

    const todayImport = recentTx.filter(t => t.quantity > 0 && t.type !== 'INITIAL_STOCK').reduce((sum, t) => sum + t.quantity, 0);
    const todayExport = recentTx.filter(t => t.quantity < 0).reduce((sum, t) => sum + Math.abs(t.quantity), 0);
    
    // Total sold ever (from tx type SALE)
    const salesTx = await prisma.inventoryTransaction.aggregate({
      where: { orgId, type: 'SALE' },
      _sum: { quantity: true }
    });
    const totalSold = Math.abs(salesTx._sum.quantity || 0);

    return {
      totalProducts,
      totalOnHand,
      totalReserved,
      totalAvailable,
      outOfStock,
      lowStock,
      todayImport,
      todayExport,
      totalSold
    };
  }

  /**
   * Process a stock take session (Kiểm kê)
   */
  async processStockTake(orgId: string, userId: string, code: string, items: { sku: string, actualQuantity: number, reason?: string }[]) {
    if (items.some(item => !Number.isFinite(item.actualQuantity) || item.actualQuantity < 0)) {
      throw new Error('Số lượng kiểm kê không được nhỏ hơn 0');
    }
    this.clearCache();
    return await prisma.$transaction(async (tx) => {
      // 1. Create StockTake header
      const stockTake = await tx.stockTake.create({
        data: {
          orgId,
          code,
          status: 'COMPLETED', // Auto-complete for Phase 1 simplicity
          performedByUserId: userId,
          completedAt: new Date(),
        }
      });

      const results = [];

      // 2. Process each item
      for (const reqItem of items) {
        const invItem = await tx.inventoryItem.findUnique({
          where: { orgId_sku: { orgId, sku: reqItem.sku } }
        });

        if (!invItem) continue;

        const systemQty = invItem.onHand;
        const diff = reqItem.actualQuantity - systemQty;

        // Create StockTakeItem
        const stItem = await tx.stockTakeItem.create({
          data: {
            stockTakeId: stockTake.id,
            inventoryItemId: invItem.id,
            sku: reqItem.sku,
            systemQuantity: systemQty,
            actualQuantity: reqItem.actualQuantity,
            difference: diff,
            reason: reqItem.reason
          }
        });

        if (diff !== 0) {
          // 3. Create adjustment transaction if there's a difference
          const txType = diff > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
          const adjTx = await tx.inventoryTransaction.create({
            data: {
              orgId,
              inventoryItemId: invItem.id,
              sku: reqItem.sku,
              type: txType,
              quantity: diff,
              quantityBefore: systemQty,
              quantityAfter: reqItem.actualQuantity,
              referenceType: 'STOCK_TAKE',
              referenceId: stockTake.id,
              referenceCode: code,
              performedByUserId: userId,
              reason: reqItem.reason || 'Kiểm kê kho',
            }
          });

          // Update StockTakeItem with adjustment ID
          await tx.stockTakeItem.update({
            where: { id: stItem.id },
            data: { adjustmentTransactionId: adjTx.id }
          });

          // 4. Update InventoryItem onHand
          await tx.inventoryItem.update({
            where: { id: invItem.id },
            data: { onHand: reqItem.actualQuantity }
          });
        }

        results.push(stItem);
      }

      return { stockTake, items: results };
    });
  }
}

export const inventoryService = new InventoryService();
