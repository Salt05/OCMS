/**
 * promotion-service.ts — Service layer for Data-Driven Promotion Management.
 * Handles CRUD, validation, immutability & versioning, audit trail, and evaluation orchestration.
 */

import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import {
  PricingPromotionEngine,
  PromotionPolicyRecord,
} from './pricing-promotion-engine.js';
import {
  OrderEvaluationContext,
  EvaluationResult,
} from './promotion-types.js';

// Type-safe accessor for Prisma client
const db = prisma as any;

export class PromotionService {
  /**
   * Validate promotion data before saving.
   */
  public static validatePromotionInput(data: any, isUpdate = false): void {
    if (!isUpdate && (!data.name || !data.name.trim())) {
      throw new Error('Tên chương trình khuyến mãi không được để trống.');
    }
    if (isUpdate && data.name !== undefined && !data.name.trim()) {
      throw new Error('Tên chương trình khuyến mãi không được để trống.');
    }
    if (!isUpdate && (!data.code || !data.code.trim())) {
      throw new Error('Mã chương trình không được để trống.');
    }
    if (isUpdate && data.code !== undefined && !data.code.trim()) {
      throw new Error('Mã chương trình không được để trống.');
    }
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      if (start > end) {
        throw new Error('Thời gian bắt đầu không được lớn hơn thời gian kết thúc.');
      }
    }

    const actions = data.actions || {};
    if (actions.discountPercent !== undefined && (actions.discountPercent < 0 || actions.discountPercent > 100)) {
      throw new Error('Tỷ lệ chiết khấu (%) phải nằm trong khoảng 0 - 100%.');
    }
    if (actions.discountAmount !== undefined && actions.discountAmount < 0) {
      throw new Error('Số tiền giảm không được là số âm.');
    }
    if (actions.specialUnitPrice !== undefined && actions.specialUnitPrice < 0) {
      throw new Error('Đơn giá đặc biệt không được là số âm.');
    }
    if (actions.buyQuantity !== undefined && actions.buyQuantity <= 0) {
      throw new Error('Số lượng mua trong ưu đãi phải lớn hơn 0.');
    }
    if (actions.getQuantity !== undefined && actions.getQuantity <= 0) {
      throw new Error('Số lượng tặng phải lớn hơn 0.');
    }

    if (data.targetScope === 'SPECIFIC_SKUS') {
      const skus = data.conditions?.applicableSkus || data.conditions?.requiredAllSkus || [];
      if (!Array.isArray(skus) || skus.length === 0) {
        throw new Error('Vui lòng chọn ít nhất một sản phẩm áp dụng ưu đãi.');
      }
    }

    if (data.type === 'CUSTOM_TEXT') {
      const text = actions.textContent || data.description;
      if (!text || !text.trim()) {
        throw new Error('Vui lòng nhập nội dung ưu đãi dạng văn bản.');
      }
    }
  }

  /**
   * List promotion policies with status filters & search.
   */
  public static async listPromotions(
    orgId: string,
    params: {
      status?: 'all' | 'active' | 'upcoming' | 'expired' | 'paused';
      search?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const now = new Date();
    const status = params.status || 'all';
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 50));
    const skip = (page - 1) * limit;

    const baseWhere: any = {
      orgId,
      deletedAt: null,
    };

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      baseWhere.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Apply status filter
    if (status === 'active') {
      baseWhere.isActive = true;
      baseWhere.AND = [
        { OR: [{ startDate: null }, { startDate: { lte: now } }] },
        { OR: [{ endDate: null }, { endDate: { gte: now } }] },
      ];
    } else if (status === 'upcoming') {
      baseWhere.isActive = true;
      baseWhere.startDate = { gt: now };
    } else if (status === 'expired') {
      baseWhere.endDate = { lt: now };
    } else if (status === 'paused') {
      baseWhere.isActive = false;
    }

    const [promotions, total, activeCount, upcomingCount, expiredCount, pausedCount] =
      await Promise.all([
        db.promotionPolicy.findMany({
          where: baseWhere,
          orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
          skip,
          take: limit,
          include: {
            _count: { select: { appliedPromotions: true } },
          },
        }),
        db.promotionPolicy.count({ where: baseWhere }),
        db.promotionPolicy.count({
          where: {
            orgId,
            deletedAt: null,
            isActive: true,
            AND: [
              { OR: [{ startDate: null }, { startDate: { lte: now } }] },
              { OR: [{ endDate: null }, { endDate: { gte: now } }] },
            ],
          },
        }),
        db.promotionPolicy.count({
          where: {
            orgId,
            deletedAt: null,
            isActive: true,
            startDate: { gt: now },
          },
        }),
        db.promotionPolicy.count({
          where: {
            orgId,
            deletedAt: null,
            endDate: { lt: now },
          },
        }),
        db.promotionPolicy.count({
          where: {
            orgId,
            deletedAt: null,
            isActive: false,
          },
        }),
      ]);

    return {
      promotions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      counts: {
        all: activeCount + upcomingCount + expiredCount + pausedCount,
        active: activeCount,
        upcoming: upcomingCount,
        expired: expiredCount,
        paused: pausedCount,
      },
    };
  }

  /**
   * Get single policy by ID.
   */
  public static async getPromotionById(orgId: string, id: string) {
    const policy = await db.promotionPolicy.findFirst({
      where: { id, orgId, deletedAt: null },
      include: {
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        _count: { select: { appliedPromotions: true } },
      },
    });

    if (!policy) {
      throw new Error('Không tìm thấy chính sách khuyến mãi');
    }

    return policy;
  }

  /**
   * Create a new promotion policy.
   */
  public static async createPromotion(orgId: string, userId: string | null, data: any) {
    this.validatePromotionInput(data);

    const cleanCode = data.code.trim().toUpperCase();

    // Auto-sync textContent and description for CUSTOM_TEXT promotions
    if (data.type === 'CUSTOM_TEXT') {
      if (data.actions?.textContent && !data.description) {
        data.description = data.actions.textContent;
      } else if (data.description && !data.actions?.textContent) {
        data.actions = { ...(data.actions || {}), textContent: data.description };
      }
    }

    // Check duplicate active code with version 1
    const existing = await db.promotionPolicy.findFirst({
      where: { orgId, code: cleanCode, deletedAt: null },
    });
    if (existing) {
      throw new Error(`Mã khuyến mãi "${cleanCode}" đã tồn tại trên hệ thống.`);
    }

    const created = await db.promotionPolicy.create({
      data: {
        orgId,
        code: cleanCode,
        name: data.name.trim(),
        description: data.description || null,
        type: data.type || 'PERCENT_DISCOUNT',
        targetScope: data.targetScope || 'ALL_PRODUCTS',
        priority: Number(data.priority) || 10,
        isStackable: data.isStackable !== false,
        isActive: data.isActive !== false,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        version: 1,
        conditions: data.conditions || {},
        actions: data.actions || {},
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    });

    // Create Audit Log
    await db.promotionAuditLog.create({
      data: {
        orgId,
        promotionId: created.id,
        version: 1,
        changedByUserId: userId,
        changeType: 'CREATE',
        snapshotAfter: created as any,
        comment: 'Tạo mới chương trình khuyến mãi',
      },
    });

    logger.info(`[promotion-service] Created promotion ${cleanCode} (v1) by user ${userId}`);
    return created;
  }

  /**
   * Update promotion policy.
   * If already used in orders, IMMUTABILITY kicks in -> automatically creates a new version.
   */
  public static async updatePromotion(orgId: string, userId: string | null, id: string, data: any) {
    this.validatePromotionInput(data, true);

    const existing = await this.getPromotionById(orgId, id);

    // Check if applied to any orders
    const usedCount = await db.orderAppliedPromotion.count({
      where: { promotionId: id },
    });

    if (usedCount > 0) {
      // Create new version to preserve immutability
      return this.createNewVersion(orgId, userId, id, data, 'Cập nhật chính sách đã được áp dụng trong đơn hàng cũ');
    }

    // Direct update allowed if no orders have used this version yet
    const cleanCode = data.code ? data.code.trim().toUpperCase() : existing.code;

    // Auto-sync textContent and description for CUSTOM_TEXT promotions
    const targetType = data.type || existing.type;
    let descToUpdate = data.description !== undefined ? data.description : existing.description;
    let actionsToUpdate = data.actions !== undefined ? data.actions : (existing.actions as any);

    if (targetType === 'CUSTOM_TEXT') {
      if (actionsToUpdate?.textContent && !descToUpdate) {
        descToUpdate = actionsToUpdate.textContent;
      } else if (descToUpdate && !actionsToUpdate?.textContent) {
        actionsToUpdate = { ...(actionsToUpdate || {}), textContent: descToUpdate };
      }
    }

    const updated = await db.promotionPolicy.update({
      where: { id: existing.id },
      data: {
        code: cleanCode,
        name: data.name ? data.name.trim() : existing.name,
        description: descToUpdate,
        type: targetType,
        targetScope: data.targetScope || existing.targetScope,
        priority: data.priority !== undefined ? Number(data.priority) : existing.priority,
        isStackable: data.isStackable !== undefined ? !!data.isStackable : existing.isStackable,
        isActive: data.isActive !== undefined ? !!data.isActive : existing.isActive,
        startDate: data.startDate !== undefined ? (data.startDate ? new Date(data.startDate) : null) : existing.startDate,
        endDate: data.endDate !== undefined ? (data.endDate ? new Date(data.endDate) : null) : existing.endDate,
        conditions: data.conditions !== undefined ? data.conditions : (existing.conditions as any),
        actions: data.actions !== undefined ? data.actions : (existing.actions as any),
        updatedByUserId: userId,
      },
    });

    // Create Audit Log
    await db.promotionAuditLog.create({
      data: {
        orgId,
        promotionId: updated.id,
        version: updated.version,
        changedByUserId: userId,
        changeType: 'UPDATE',
        snapshotBefore: existing as any,
        snapshotAfter: updated as any,
        comment: data.auditComment || 'Chỉnh sửa chính sách',
      },
    });

    logger.info(`[promotion-service] Updated promotion ${updated.code} (v${updated.version}) in-place`);
    return updated;
  }

  /**
   * Create a new version of a policy.
   * Supersedes old version, archives or pauses previous version, and preserves lineage.
   */
  public static async createNewVersion(
    orgId: string,
    userId: string | null,
    id: string,
    newData?: any,
    comment?: string
  ) {
    const oldPolicy = await this.getPromotionById(orgId, id);

    const mergedData = {
      ...oldPolicy,
      ...(newData || {}),
    };

    this.validatePromotionInput(mergedData);

    const newVersionNumber = oldPolicy.version + 1;

    // Deactivate previous version to avoid conflict
    await db.promotionPolicy.update({
      where: { id: oldPolicy.id },
      data: { isActive: false, updatedByUserId: userId },
    });

    if (mergedData.type === 'CUSTOM_TEXT') {
      if (mergedData.actions?.textContent && !mergedData.description) {
        mergedData.description = mergedData.actions.textContent;
      } else if (mergedData.description && !mergedData.actions?.textContent) {
        mergedData.actions = { ...(mergedData.actions || {}), textContent: mergedData.description };
      }
    }

    // Create new version
    const newPolicy = await db.promotionPolicy.create({
      data: {
        orgId,
        code: oldPolicy.code,
        name: mergedData.name.trim(),
        description: mergedData.description || null,
        type: mergedData.type || oldPolicy.type,
        targetScope: mergedData.targetScope || oldPolicy.targetScope,
        priority: Number(mergedData.priority) || oldPolicy.priority,
        isStackable: mergedData.isStackable !== false,
        isActive: mergedData.isActive !== false,
        startDate: mergedData.startDate ? new Date(mergedData.startDate) : null,
        endDate: mergedData.endDate ? new Date(mergedData.endDate) : null,
        version: newVersionNumber,
        parentPolicyId: oldPolicy.id,
        conditions: mergedData.conditions || oldPolicy.conditions,
        actions: mergedData.actions || oldPolicy.actions,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    });

    // Audit log
    await db.promotionAuditLog.create({
      data: {
        orgId,
        promotionId: newPolicy.id,
        version: newVersionNumber,
        changedByUserId: userId,
        changeType: 'NEW_VERSION',
        snapshotBefore: oldPolicy as any,
        snapshotAfter: newPolicy as any,
        comment: comment || `Tạo phiên bản mới (v${newVersionNumber}) kế thừa từ v${oldPolicy.version}`,
      },
    });

    logger.info(
      `[promotion-service] Created new version ${newPolicy.code} (v${newVersionNumber}) superseding v${oldPolicy.version}`
    );
    return newPolicy;
  }

  /**
   * Toggle active/inactive status.
   */
  public static async toggleStatus(orgId: string, userId: string | null, id: string, isActive: boolean) {
    const existing = await this.getPromotionById(orgId, id);

    const updated = await db.promotionPolicy.update({
      where: { id: existing.id },
      data: { isActive, updatedByUserId: userId },
    });

    await db.promotionAuditLog.create({
      data: {
        orgId,
        promotionId: updated.id,
        version: updated.version,
        changedByUserId: userId,
        changeType: isActive ? 'ACTIVATE' : 'DEACTIVATE',
        snapshotBefore: existing as any,
        snapshotAfter: updated as any,
        comment: isActive ? 'Kích hoạt chương trình' : 'Tạm dừng chương trình',
      },
    });

    return updated;
  }

  /**
   * Clone policy into a new draft program.
   */
  public static async clonePromotion(orgId: string, userId: string | null, id: string) {
    const source = await this.getPromotionById(orgId, id);
    const timestamp = Date.now().toString().slice(-4);
    const newCode = `${source.code}_COPY_${timestamp}`;
    const newName = `${source.name} (Bản sao)`;

    return this.createPromotion(orgId, userId, {
      ...source,
      code: newCode,
      name: newName,
      isActive: false, // Clone as draft / inactive by default
      version: 1,
      parentPolicyId: null,
    });
  }

  /**
   * Soft delete a promotion policy.
   */
  public static async deletePromotion(orgId: string, userId: string | null, id: string) {
    const existing = await this.getPromotionById(orgId, id);

    const updated = await db.promotionPolicy.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), isActive: false, updatedByUserId: userId },
    });

    await db.promotionAuditLog.create({
      data: {
        orgId,
        promotionId: updated.id,
        version: updated.version,
        changedByUserId: userId,
        changeType: 'DEACTIVATE',
        snapshotBefore: existing as any,
        snapshotAfter: updated as any,
        comment: 'Xóa chương trình khuyến mãi (Soft delete)',
      },
    });

    return updated;
  }

  /**
   * Fetch audit logs for a policy.
   */
  public static async getAuditLogs(orgId: string, promotionId: string) {
    return db.promotionAuditLog.findMany({
      where: { orgId, promotionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Evaluate order pricing against active policies for an organization.
   */
  public static async evaluateOrder(context: OrderEvaluationContext): Promise<EvaluationResult> {
    const policies = await db.promotionPolicy.findMany({
      where: {
        orgId: context.orgId,
        isActive: true,
        deletedAt: null,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    const policyRecords: PromotionPolicyRecord[] = policies.map((p: any) => ({
      id: p.id,
      orgId: p.orgId,
      code: p.code,
      name: p.name,
      description: p.description,
      type: p.type,
      targetScope: p.targetScope,
      priority: p.priority,
      isStackable: p.isStackable,
      isActive: p.isActive,
      startDate: p.startDate,
      endDate: p.endDate,
      version: p.version,
      parentPolicyId: p.parentPolicyId,
      conditions: p.conditions,
      actions: p.actions,
    }));

    // Auto-enrich items with brand and category from ProductCache if missing
    if (context.items && context.items.length > 0) {
      const missingItems = context.items.filter((it) => !it.brand || !it.category);
      if (missingItems.length > 0) {
        const skus = missingItems.map((it) => it.sku).filter(Boolean);
        const odooIds = missingItems.map((it) => it.odooProductId).filter(Boolean);
        if (skus.length > 0 || odooIds.length > 0) {
          const found = await db.productCache.findMany({
            where: {
              orgId: context.orgId,
              OR: [
                ...(skus.length ? [{ sku: { in: skus } }] : []),
                ...(odooIds.length ? [{ odooId: { in: odooIds } }] : []),
              ],
            },
            select: { sku: true, odooId: true, brand: true, category: true },
          });

          const skuMap = new Map();
          const odooMap = new Map();
          for (const p of found) {
            if (p.sku) skuMap.set(p.sku.toUpperCase(), p);
            if (p.odooId) odooMap.set(p.odooId, p);
          }

          for (const it of context.items) {
            const matched =
              (it.sku && skuMap.get(it.sku.toUpperCase())) ||
              (it.odooProductId && odooMap.get(it.odooProductId));
            if (matched) {
              if (!it.brand && matched.brand) it.brand = matched.brand;
              if (!it.category && matched.category) it.category = matched.category;
            }
          }
        }
      }
    }

    return PricingPromotionEngine.evaluateOrder(context, policyRecords);
  }
}
