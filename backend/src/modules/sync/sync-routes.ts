/**
 * Sync API Routes.
 * Provides endpoints to trigger and monitor Odoo data synchronization.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { odooSyncService } from './odoo-sync-service.js';
import { logger } from '../../shared/utils/logger.js';
import { authMiddleware } from '../auth/auth-middleware.js';

export async function syncRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // POST /api/v1/sync/full — Trigger a full sync of all Odoo data
  app.post('/api/v1/sync/full', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      if (user.role !== 'owner' && user.role !== 'admin') {
        return reply.status(403).send({ error: 'Chỉ admin mới có quyền chạy đồng bộ toàn bộ' });
      }

      logger.info(`[sync-routes] Full sync triggered by user ${user.email}`);

      // Run async — don't block the response
      const resultPromise = odooSyncService.runFullSync(user.orgId);

      // Return immediately, sync runs in background
      reply.status(202).send({
        success: true,
        message: 'Đã bắt đầu đồng bộ toàn bộ dữ liệu. Quá trình chạy nền, vui lòng kiểm tra trạng thái sau.',
      });

      // Log results when done
      resultPromise.then(results => {
        logger.info('[sync-routes] Full sync completed:', results);
      }).catch(err => {
        logger.error('[sync-routes] Full sync failed:', err.message);
      });
    } catch (err: any) {
      logger.error('[sync-routes] Full sync trigger error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi khi bắt đầu đồng bộ' });
    }
  });

  // POST /api/v1/sync/incremental — Trigger an incremental sync
  app.post('/api/v1/sync/incremental', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      if (user.role !== 'owner' && user.role !== 'admin') {
        return reply.status(403).send({ error: 'Chỉ admin mới có quyền chạy đồng bộ' });
      }

      const results = await odooSyncService.runIncrementalSync(user.orgId);
      return reply.send({
        success: true,
        message: 'Đồng bộ gia tăng hoàn tất',
        results,
      });
    } catch (err: any) {
      logger.error('[sync-routes] Incremental sync error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi đồng bộ gia tăng' });
    }
  });

  // GET /api/v1/sync/status — Get current sync status for all models
  app.get('/api/v1/sync/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const states = await odooSyncService.getSyncStatus(user.orgId);

      return reply.send({
        success: true,
        syncStates: states.map(s => ({
          model: s.modelName,
          status: s.status,
          lastSyncedAt: s.lastSyncedAt,
          lastWriteDate: s.lastWriteDate,
          recordCount: s.recordCount,
          errorMessage: s.errorMessage,
        })),
      });
    } catch (err: any) {
      logger.error('[sync-routes] Get sync status error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi lấy trạng thái đồng bộ' });
    }
  });

  // POST /api/v1/sync/products — Sync only products
  app.post('/api/v1/sync/products', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const result = await odooSyncService.syncProducts(user.orgId);
      return reply.send({
        success: true,
        ...result,
      });
    } catch (err: any) {
      logger.error('[sync-routes] Product sync error:', err);
      return reply.status(500).send({ success: false, error: err.message || 'Lỗi đồng bộ sản phẩm' });
    }
  });

  // POST /api/v1/sync/customers — Sync only customers
  app.post('/api/v1/sync/customers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const count = await odooSyncService.syncCustomers(user.orgId);
      return reply.send({
        success: true,
        message: `Đã đồng bộ ${count} khách hàng`,
        count,
      });
    } catch (err: any) {
      logger.error('[sync-routes] Customer sync error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi đồng bộ khách hàng' });
    }
  });

  // POST /api/v1/sync/orders — Sync only orders
  app.post('/api/v1/sync/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const res = await odooSyncService.syncOrders(user.orgId);

      let message = 'Dữ liệu đơn hàng Odoo đã ở trạng thái mới nhất';
      if (res.newCount > 0 && res.updatedCount > 0) {
        message = `Đồng bộ thành công: ${res.newCount} đơn mới, ${res.updatedCount} đơn cập nhật từ Odoo`;
      } else if (res.newCount > 0) {
        message = `Đồng bộ thành công: ${res.newCount} đơn hàng mới từ Odoo`;
      } else if (res.updatedCount > 0) {
        message = `Đồng bộ thành công: Đã cập nhật ${res.updatedCount} đơn hàng từ Odoo`;
      }

      return reply.send({
        success: true,
        message,
        ...res,
      });
    } catch (err: any) {
      logger.error('[sync-routes] Order sync error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi đồng bộ đơn hàng' });
    }
  });

  // POST /api/v1/sync/orders/clean — Clean and re-sync all orders from Odoo
  app.post('/api/v1/sync/orders/clean', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      if (user.role !== 'owner' && user.role !== 'admin') {
        return reply.status(403).send({ error: 'Chỉ admin mới có quyền làm sạch và đồng bộ lại đơn hàng' });
      }

      const count = await odooSyncService.cleanAndSyncOrders(user.orgId);
      return reply.send({
        success: true,
        message: `Đã làm sạch dữ liệu cũ và đồng bộ thành công ${count} đơn hàng từ Odoo`,
        count,
      });
    } catch (err: any) {
      logger.error('[sync-routes] Clean order sync error:', err);
      return reply.status(500).send({ error: err.message || 'Lỗi làm sạch và đồng bộ đơn hàng' });
    }
  });
}
