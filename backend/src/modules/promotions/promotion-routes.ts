/**
 * promotion-routes.ts — Fastify routes for Promotion Management & Pricing Engine API.
 * Secured via authMiddleware.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { PromotionService } from './promotion-service.js';
import { logger } from '../../shared/utils/logger.js';
import { OrderEvaluationContext } from './promotion-types.js';

export async function promotionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // ── 1. List Promotions (Paginated, filtered by status & search) ───────────
  app.get('/api/v1/promotions', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const query = (request.query || {}) as {
      status?: 'all' | 'active' | 'upcoming' | 'expired' | 'paused';
      search?: string;
      page?: string;
      limit?: string;
    };

    try {
      const result = await PromotionService.listPromotions(user.orgId, {
        status: query.status,
        search: query.search,
        page: parseInt(query.page || '1', 10),
        limit: parseInt(query.limit || '25', 10),
      });
      return { success: true, ...result };
    } catch (err: any) {
      logger.error('[promotion-routes] list error:', err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 2. Get Single Promotion Detail ────────────────────────────────────────
  app.get('/api/v1/promotions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    try {
      const promotion = await PromotionService.getPromotionById(user.orgId, id);
      return { success: true, promotion };
    } catch (err: any) {
      logger.error('[promotion-routes] get by id error:', err);
      return reply.status(404).send({ success: false, error: err.message });
    }
  });

  function checkAdminPermission(user: any, reply: FastifyReply): boolean {
    if (!user || !['owner', 'admin'].includes(user.role)) {
      reply.status(403).send({
        success: false,
        error: 'Quyền hạn bị từ chối: Nhân viên chỉ có quyền xem chính sách ưu đãi, không được phép thêm, sửa, xóa hoặc thay đổi trạng thái. Vui lòng liên hệ Quản trị viên (Admin/Owner).',
      });
      return false;
    }
    return true;
  }

  // ── 3. Create Promotion Policy (Admin / Owner only) ───────────────────────
  app.post('/api/v1/promotions', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    if (!checkAdminPermission(user, reply)) return;

    const body = (request.body || {}) as any;

    try {
      const created = await PromotionService.createPromotion(user.orgId, user.id, body);
      return { success: true, message: 'Tạo chương trình ưu đãi thành công', promotion: created };
    } catch (err: any) {
      logger.warn('[promotion-routes] create error:', err);
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // ── 4. Update Promotion Policy (Admin / Owner only) ───────────────────────
  app.put('/api/v1/promotions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    if (!checkAdminPermission(user, reply)) return;

    const { id } = request.params as { id: string };
    const body = (request.body || {}) as any;

    try {
      const updated = await PromotionService.updatePromotion(user.orgId, user.id, id, body);
      return { success: true, message: 'Cập nhật chương trình thành công', promotion: updated };
    } catch (err: any) {
      logger.warn('[promotion-routes] update error:', err);
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // ── 5. Create New Version (Admin / Owner only) ────────────────────────────
  app.post('/api/v1/promotions/:id/new-version', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    if (!checkAdminPermission(user, reply)) return;

    const { id } = request.params as { id: string };
    const body = (request.body || {}) as any;

    try {
      const newVersion = await PromotionService.createNewVersion(
        user.orgId,
        user.id,
        id,
        body.newData,
        body.comment
      );
      return {
        success: true,
        message: `Đã tạo phiên bản mới v${newVersion.version}`,
        promotion: newVersion,
      };
    } catch (err: any) {
      logger.warn('[promotion-routes] new-version error:', err);
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // ── 6. Toggle Active Status (Admin / Owner only) ──────────────────────────
  app.patch('/api/v1/promotions/:id/toggle-status', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    if (!checkAdminPermission(user, reply)) return;

    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { isActive: boolean };

    try {
      const updated = await PromotionService.toggleStatus(user.orgId, user.id, id, !!body.isActive);
      return {
        success: true,
        message: body.isActive ? 'Đã kích hoạt chương trình' : 'Đã tạm dừng chương trình',
        promotion: updated,
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // ── 7. Clone Promotion (Admin / Owner only) ───────────────────────────────
  app.post('/api/v1/promotions/:id/clone', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    if (!checkAdminPermission(user, reply)) return;

    const { id } = request.params as { id: string };

    try {
      const cloned = await PromotionService.clonePromotion(user.orgId, user.id, id);
      return { success: true, message: 'Nhân bản chương trình thành công', promotion: cloned };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // ── 8. Delete Promotion (Soft Delete - Admin / Owner only) ────────────────
  app.delete('/api/v1/promotions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    if (!checkAdminPermission(user, reply)) return;

    const { id } = request.params as { id: string };

    try {
      const deleted = await PromotionService.deletePromotion(user.orgId, user.id, id);
      return { success: true, message: 'Đã xóa chương trình ưu đãi', promotion: deleted };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // ── 9. Get Audit History Logs (All roles can view) ────────────────────────
  app.get('/api/v1/promotions/:id/audit-logs', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    try {
      const logs = await PromotionService.getAuditLogs(user.orgId, id);
      return { success: true, logs };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 9. Interactive Pricing Engine Evaluation (Preview Tester & Cart) ─────
  app.post('/api/v1/pricing/evaluate', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = (request.body || {}) as any;

    try {
      const context: OrderEvaluationContext = {
        orgId: user.orgId,
        customerId: body.customerId || null,
        customerName: body.customerName || null,
        customerType: body.customerType || 'DEALER',
        orderDate: body.orderDate || new Date(),
        items: Array.isArray(body.items) ? body.items : [],
        salesStats: body.salesStats || undefined,
      };

      const result = await PromotionService.evaluateOrder(context);
      return { success: true, result };
    } catch (err: any) {
      logger.error('[promotion-routes] evaluate error:', err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 10. AI / Chatbot Consultation Endpoint ────────────────────────────────
  app.post('/api/v1/pricing/ai-promotions', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = (request.body || {}) as any;

    try {
      const context: OrderEvaluationContext = {
        orgId: user.orgId,
        customerId: body.customerId || null,
        customerName: body.customerName || null,
        customerType: body.customerType || 'DEALER',
        orderDate: body.currentDate || new Date(),
        items: Array.isArray(body.cart) ? body.cart : (Array.isArray(body.items) ? body.items : []),
        salesStats: body.salesStats || undefined,
      };

      const result = await PromotionService.evaluateOrder(context);

      // Structure conversational answer for LLM
      const summaryForAi = {
        eligible: result.appliedPromotions.length > 0,
        originalSubtotal: result.originalSubtotal,
        discountAmount: result.discountAmount,
        finalTotal: result.finalTotal,
        appliedPromotions: result.appliedPromotions.map((p) => ({
          promotionName: p.promotionName,
          code: p.promotionCode,
          discountAmount: p.discountAmount,
          freeGifts: p.freeItems,
          explanation: p.explanation,
        })),
        freeItems: result.freeItems,
        explanations: result.explanations,
        suggestions: result.suggestions,
        missedPromotions: result.missedPromotions,
      };

      return { success: true, data: summaryForAi };
    } catch (err: any) {
      logger.error('[promotion-routes] ai-promotions error:', err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
