/**
 * integration-settings-routes.ts
 * REST API endpoints for viewing, updating, and testing integrations:
 * - AI (Gemini / Groq)
 * - Odoo ERP
 * - Directus CMS
 * 
 * Access is restricted to users with role 'admin' or 'owner'.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { integrationSettingsService } from './integration-settings-service.js';
import { logger } from '../../shared/utils/logger.js';

export async function integrationSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Authorization helper: Admin or Owner only
  const requireAdmin = (request: FastifyRequest, reply: FastifyReply) => {
    const role = request.user?.role;
    if (!role || !['admin', 'owner'].includes(role)) {
      reply.status(403).send({ error: 'Chỉ Quản trị viên (Admin/Owner) mới có quyền truy cập cấu hình hệ thống.' });
      return false;
    }
    return true;
  };

  // GET /api/v1/settings/integrations — Retrieve current integration configs (masked)
  app.get('/api/v1/settings/integrations', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;
    try {
      const orgId = request.user!.orgId;
      const data = await integrationSettingsService.getSettingsForUI(orgId);
      return reply.send(data);
    } catch (err: any) {
      logger.error('[integration-settings-routes] GET error:', err);
      return reply.status(500).send({ error: 'Không thể lấy thông tin cấu hình tích hợp: ' + err.message });
    }
  });

  // PUT /api/v1/settings/integrations — Save integration configs
  app.put('/api/v1/settings/integrations', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;
    try {
      const orgId = request.user!.orgId;
      const body = request.body as any;
      await integrationSettingsService.saveSettings(orgId, body || {});
      const updated = await integrationSettingsService.getSettingsForUI(orgId);
      return reply.send({ success: true, message: 'Đã lưu cấu hình tích hợp thành công', settings: updated });
    } catch (err: any) {
      logger.error('[integration-settings-routes] PUT error:', err);
      return reply.status(500).send({ error: 'Lỗi khi lưu cấu hình tích hợp: ' + err.message });
    }
  });

  // POST /api/v1/settings/integrations/test/ai — Test AI Connection
  app.post('/api/v1/settings/integrations/test/ai', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;
    try {
      const orgId = request.user!.orgId;
      const body = (request.body as any) || {};
      const result = await integrationSettingsService.testAiConnection(body, orgId);
      return reply.send(result);
    } catch (err: any) {
      logger.error('[integration-settings-routes] Test AI error:', err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/v1/settings/integrations/test/odoo — Test Odoo Connection
  app.post('/api/v1/settings/integrations/test/odoo', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;
    try {
      const orgId = request.user!.orgId;
      const body = (request.body as any) || {};
      const result = await integrationSettingsService.testOdooConnection(body, orgId);
      return reply.send(result);
    } catch (err: any) {
      logger.error('[integration-settings-routes] Test Odoo error:', err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/v1/settings/integrations/test/directus — Test Directus Connection
  app.post('/api/v1/settings/integrations/test/directus', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;
    try {
      const orgId = request.user!.orgId;
      const body = (request.body as any) || {};
      const result = await integrationSettingsService.testDirectusConnection(body, orgId);
      return reply.send(result);
    } catch (err: any) {
      logger.error('[integration-settings-routes] Test Directus error:', err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/v1/settings/integrations/ai-models — Fetch available models directly from AI provider
  app.post('/api/v1/settings/integrations/ai-models', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;
    try {
      const orgId = request.user!.orgId;
      const body = (request.body as any) || {};
      const result = await integrationSettingsService.fetchAvailableAiModels(body, orgId);
      return reply.send(result);
    } catch (err: any) {
      logger.error('[integration-settings-routes] Fetch AI models error:', err);
      return reply.status(500).send({ success: false, error: err.message, models: [] });
    }
  });
}
