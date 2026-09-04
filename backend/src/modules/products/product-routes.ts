/**
 * product-routes.ts — Product Catalog & Classification Routes.
 * Manages ONLY official products from Directus catalog.
 * Allows managing category and brand metadata while keeping Odoo ERP core fields read-only.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { directusService } from '../directus/directus-service.js';
import { odooSyncService } from '../sync/odoo-sync-service.js';
import { logger } from '../../shared/utils/logger.js';

const db = prisma as any;

/**
 * Helper to retrieve official Directus products map
 */
async function getDirectusMap(): Promise<{ map: Map<number, any>; odooIds: number[] }> {
  const directusProducts = await directusService.getProducts();
  const map = new Map<number, any>();
  for (const dp of directusProducts) {
    const odooId = Number(dp.odoo_id || dp.id);
    if (odooId) map.set(odooId, dp);
  }
  return { map, odooIds: Array.from(map.keys()) };
}

export async function productRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // ── 1. List Products (Directus official catalog only) ────────────────────────
  app.get('/api/v1/products', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const query = (request.query || {}) as {
      page?: string;
      limit?: string;
      search?: string;
      category?: string;
      brand?: string;
      status?: 'all' | 'categorized' | 'uncategorized';
    };

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
    const skip = (page - 1) * limit;

    try {
      const { map: directusMap } = await getDirectusMap();

      // Manage all active products: Directus enriched first, Odoo products included seamlessly
      const where: any = {
        orgId: user.orgId,
        isActive: true,
      };

      // Search by SKU or Name
      if (query.search && query.search.trim()) {
        const s = query.search.trim();
        where.OR = [
          { sku: { contains: s, mode: 'insensitive' } },
          { name: { contains: s, mode: 'insensitive' } },
          { displayName: { contains: s, mode: 'insensitive' } },
        ];
      }

      // Filter by Category
      if (query.category) {
        if (query.category === '__NONE__') {
          where.OR = [{ category: null }, { category: '' }];
        } else {
          where.category = { equals: query.category, mode: 'insensitive' };
        }
      }

      // Filter by Brand
      if (query.brand) {
        if (query.brand === '__NONE__') {
          where.OR = [{ brand: null }, { brand: '' }];
        } else {
          where.brand = { equals: query.brand, mode: 'insensitive' };
        }
      }

      // Filter by classification status
      if (query.status === 'uncategorized') {
        where.AND = [
          { OR: [{ category: null }, { category: '' }] },
        ];
      } else if (query.status === 'categorized') {
        where.AND = [
          { category: { not: null } },
          { category: { not: '' } },
        ];
      }

      const [products, total, totalAll, uncategorizedCount] = await Promise.all([
        db.productCache.findMany({
          where,
          orderBy: [{ sku: 'asc' }, { updatedAt: 'desc' }],
          skip,
          take: limit,
        }),
        db.productCache.count({ where }),
        db.productCache.count({
          where: {
            orgId: user.orgId,
            isActive: true,
          },
        }),
        db.productCache.count({
          where: {
            orgId: user.orgId,
            isActive: true,
            OR: [{ category: null }, { category: '' }],
          },
        }),
      ]);

      // Enrich products with Directus rich details if available, otherwise keep Odoo details
      const enrichedProducts = products.map((p: any) => {
        const dp = directusMap.get(p.odooId) || {};
        return {
          ...p,
          imageUrl: directusService.getAssetUrl(p.imageUrl || dp.image_url) || null,
          weight: p.weight || dp.weight || null,
          specification: p.specification || dp.specification || null,
          ingredients: p.ingredients || dp.ingredients || null,
          nutritional_info: dp.nutritional_info || null,
          target: p.target || dp.target || null,
          preservation: p.preservation || dp.preservation || null,
          description: p.description || dp.description || null,
          product_group_name: dp.product_group_name || null,
          product_group_id: dp.product_group_id || null,
          retailPrice: p.retailPrice || dp.retail_price || 0,
          wholesalePrice: p.wholesalePrice || dp.wholesale_price || p.listPrice || 0,
          listPrice: p.listPrice || dp.list_price || dp.wholesale_price || 0,
          source: dp.id ? 'directus' : 'odoo',
        };
      });

      return {
        success: true,
        products: enrichedProducts,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        stats: {
          totalAll,
          categorizedCount: totalAll - uncategorizedCount,
          uncategorizedCount,
        },
      };
    } catch (err: any) {
      logger.error('[product-routes] list error:', err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 2. Autocomplete Suggestions (SELECT DISTINCT category, brand) ───────────
  app.get('/api/v1/products/suggestions', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;

    try {
      const [categoryRows, brandRows] = await Promise.all([
        db.productCache.findMany({
          where: {
            orgId: user.orgId,
            category: { not: null },
          },
          select: { category: true },
          distinct: ['category'],
        }),
        db.productCache.findMany({
          where: {
            orgId: user.orgId,
            brand: { not: null },
          },
          select: { brand: true },
          distinct: ['brand'],
        }),
      ]);

      const categories = categoryRows
        .map((r: any) => r.category?.trim())
        .filter((c: any) => !!c)
        .sort((a: string, b: string) => a.localeCompare(b, 'vi'));

      const brands = brandRows
        .map((r: any) => r.brand?.trim())
        .filter((b: any) => !!b)
        .sort((a: string, b: string) => a.localeCompare(b, 'vi'));

      return {
        success: true,
        categories: Array.from(new Set(categories)),
        brands: Array.from(new Set(brands)),
      };
    } catch (err: any) {
      logger.error('[product-routes] suggestions error:', err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 3. Update Product Classification (Strictly category and brand only) ─────
  app.patch('/api/v1/products/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as any;

    try {
      const existing = await db.productCache.findFirst({
        where: { id, orgId: user.orgId },
      });

      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Không tìm thấy sản phẩm' });
      }

      // STRICT SAFETY WHITELIST: Only allow updating category and brand!
      const updateData: any = {};
      if (body.category !== undefined) {
        updateData.category = body.category ? String(body.category).trim() : null;
      }
      if (body.brand !== undefined) {
        updateData.brand = body.brand ? String(body.brand).trim() : null;
      }

      const updated = await db.productCache.update({
        where: { id: existing.id },
        data: updateData,
      });

      logger.info(`[product-routes] User ${user.email} updated product ${existing.sku || existing.id}: category=${updated.category}, brand=${updated.brand}`);

      return {
        success: true,
        message: 'Cập nhật phân loại sản phẩm thành công',
        product: updated,
      };
    } catch (err: any) {
      logger.error('[product-routes] update error:', err);
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // ── 4. Bulk Update Classification for multiple products ─────────────────────
  app.patch('/api/v1/products/bulk-update', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = (request.body || {}) as {
      productIds: string[];
      category?: string | null;
      brand?: string | null;
    };

    if (!Array.isArray(body.productIds) || body.productIds.length === 0) {
      return reply.status(400).send({ success: false, error: 'Vui lòng chọn ít nhất một sản phẩm' });
    }

    try {
      const updateData: any = {};
      if (body.category !== undefined) {
        updateData.category = body.category ? String(body.category).trim() : null;
      }
      if (body.brand !== undefined) {
        updateData.brand = body.brand ? String(body.brand).trim() : null;
      }

      const result = await db.productCache.updateMany({
        where: {
          orgId: user.orgId,
          id: { in: body.productIds },
        },
        data: updateData,
      });

      logger.info(`[product-routes] Bulk updated ${result.count} products by ${user.email}`);

      return {
        success: true,
        count: result.count,
        message: `Đã cập nhật phân loại cho ${result.count} sản phẩm`,
      };
    } catch (err: any) {
      logger.error('[product-routes] bulk-update error:', err);
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // ── 5. Sync Products (Directus + Odoo with Directus Priority) ───────────────
  app.post('/api/v1/products/sync', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    try {
      const result = await odooSyncService.syncProducts(user.orgId);
      return reply.send({
        success: true,
        ...result,
      });
    } catch (err: any) {
      logger.error('[product-routes] Sync error:', err);
      return reply.status(500).send({ success: false, error: err.message || 'Lỗi khi đồng bộ sản phẩm' });
    }
  });
}
