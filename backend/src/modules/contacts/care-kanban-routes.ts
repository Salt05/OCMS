/**
 * care-kanban-routes.ts — Fastify routes for CRM Customer Care Kanban.
 * Endpoint: GET /api/v1/crm/care-kanban
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { careKanbanService, type CareKanbanFilterQuery } from './care-kanban-service.js';
import { logger } from '../../shared/utils/logger.js';

export async function careKanbanRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/crm/care-kanban
   * Fetches the full aggregated Kanban board data with 4 KPIs, 5 Columns, and filter options.
   */
  app.get(
    '/api/v1/crm/care-kanban',
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user;
        const query = (request.query || {}) as Record<string, string>;

        const filter: CareKanbanFilterQuery = {
          search: query.search || undefined,
          zone: query.zone || undefined,
          salesperson: query.salesperson || undefined,
          tier: (['A', 'B', 'C'].includes(query.tier) ? query.tier : undefined) as any,
          refresh: query.refresh === 'true',
        };

        const data = await careKanbanService.getCareKanbanData(user.orgId, user, filter);
        return reply.send({ success: true, data });
      } catch (err: any) {
        logger.error(`[CareKanbanRoutes] Error fetching kanban data: ${err.message}`, err);
        return reply.status(500).send({
          success: false,
          error: 'Lỗi khi tải dữ liệu Kanban chăm sóc khách hàng',
          details: err.message,
        });
      }
    }
  );
}
