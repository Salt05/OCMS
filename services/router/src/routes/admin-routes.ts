import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAdminHtml } from '../admin/admin-page.js';
import { routingRegistry } from '../registry/routing-registry.js';
import {
  getQueueMetrics,
  getFailedJobs,
  retryFailedJob,
  removeFailedJob,
  getAllOrders,
  getOrderDetail,
  resetOrderQueues,
} from '../queue/queue-manager.js';
import { workerManager } from '../workers/worker-manager.js';
import { routerLogger } from '../logger/router-logger.js';

export async function adminRoutes(app: FastifyInstance) {
  /**
   * GET /admin
   * Giao diện trực quan: Bảng danh bạ định tuyến & Giám sát hàng đợi
   */
  app.get('/admin', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.type('text/html').send(getAdminHtml());
  });

  /**
   * GET /api/v1/routes
   * Lấy toàn bộ danh bạ định tuyến sự kiện hiện hành
   */
  app.get('/api/v1/routes', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      data: routingRegistry.getRules(),
    });
  });

  /**
   * POST /api/v1/routes/toggle
   * Bật / Tắt một đích phần mềm trong danh bạ
   */
  app.post('/api/v1/routes/toggle', async (request: FastifyRequest, reply: FastifyReply) => {
    const { event_id, target_id, enabled } = request.body as {
      event_id: string;
      target_id: string;
      enabled: boolean;
    };

    if (!event_id || !target_id || typeof enabled !== 'boolean') {
      return reply.status(400).send({
        success: false,
        error: 'Thiếu tham số: event_id, target_id hoặc enabled',
      });
    }

    const updated = routingRegistry.updateTargetStatus(event_id, target_id, enabled);

    if (!updated) {
      return reply.status(404).send({
        success: false,
        error: 'Không tìm thấy sự kiện hoặc điểm đích được chỉ định',
      });
    }

    return reply.send({
      success: true,
      message: `Đã ${enabled ? 'BẬT' : 'TẮT'} đích ${target_id} cho sự kiện ${event_id}`,
      data: {
        event_id,
        target_id,
        enabled,
      },
    });
  });

  /**
   * PUT /api/v1/routes
   * Cập nhật toàn bộ file danh bạ cấu hình
   */
  app.put('/api/v1/routes', async (request: FastifyRequest, reply: FastifyReply) => {
    const newConfig = request.body as any;
    if (!newConfig || !newConfig.events) {
      return reply.status(400).send({
        success: false,
        error: 'Cấu trúc cấu hình danh bạ không hợp lệ',
      });
    }

    routingRegistry.updateFullConfig(newConfig);
    return reply.send({
      success: true,
      message: 'Đã cập nhật toàn bộ danh bạ định tuyến thành công',
      data: routingRegistry.getRules(),
    });
  });

  /**
   * GET /api/v1/queues/stats
   * Lấy số liệu trạng thái hàng đợi realtime
   */
  app.get('/api/v1/queues/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const metrics = await getQueueMetrics();
    return reply.send({
      success: true,
      data: metrics,
    });
  });

  /**
   * GET /api/v1/queues/failed
   * Lấy danh sách các đơn hàng lỗi từ Dead-Letter Queue (Failed Jobs)
   */
  app.get('/api/v1/queues/failed', async (request: FastifyRequest, reply: FastifyReply) => {
    const failedJobs = await getFailedJobs();
    return reply.send({
      success: true,
      count: failedJobs.length,
      data: failedJobs,
    });
  });

  /**
   * POST /api/v1/queues/retry/:queueName/:jobId
   * Kích hoạt thử lại 1 đơn lỗi (1-Click Retry)
   */
  app.post('/api/v1/queues/retry/:queueName/:jobId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { queueName, jobId } = request.params as { queueName: string; jobId: string };

    if (!queueName || !jobId) {
      return reply.status(400).send({
        success: false,
        error: 'Thiếu queueName hoặc jobId',
      });
    }

    const retried = await retryFailedJob(queueName, jobId);
    if (!retried) {
      return reply.status(404).send({
        success: false,
        error: `Không tìm thấy Job #${jobId} trong hàng đợi ${queueName} để thử lại`,
      });
    }

    return reply.send({
      success: true,
      message: `Đã kích hoạt thử lại Job #${jobId} trên hàng đợi ${queueName}`,
    });
  });

  /**
   * DELETE /api/v1/queues/failed/:queueName/:jobId
   * Xóa bỏ 1 đơn lỗi khỏi Dead-Letter Queue
   */
  app.delete('/api/v1/queues/failed/:queueName/:jobId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { queueName, jobId } = request.params as { queueName: string; jobId: string };

    if (!queueName || !jobId) {
      return reply.status(400).send({
        success: false,
        error: 'Thiếu queueName hoặc jobId',
      });
    }

    const removed = await removeFailedJob(queueName, jobId);
    if (!removed) {
      return reply.status(404).send({
        success: false,
        error: `Không tìm thấy Job #${jobId} trong hàng đợi ${queueName} để xóa`,
      });
    }

    return reply.send({
      success: true,
      message: `Đã xóa Job #${jobId} khỏi hàng đợi ${queueName}`,
    });
  });

  /**
   * POST /api/v1/queues/reset
   * DELETE /api/v1/queues/reset
   * POST /api/v1/orders/reset
   * Reset sạch toàn bộ hàng đợi & lịch sử đơn hàng (BullMQ + Redis)
   * CAM KẾT GIỮ NGUYÊN 100% CẤU HÌNH HỆ THỐNG (Routing Rules, Odoo ERP, Systems Registry)
   */
  const handleResetQueues = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = (request.body as any) || {};
      const clearLogs = body.clearLogs !== false;

      const result = await resetOrderQueues({ clearLogs });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: `Lỗi khi reset hàng đợi: ${err.message}`,
      });
    }
  };

  app.post('/api/v1/queues/reset', handleResetQueues);
  app.delete('/api/v1/queues/reset', handleResetQueues);
  app.post('/api/v1/orders/reset', handleResetQueues);

  /**
   * GET /api/v1/workers/status
   * Lấy trạng thái hoạt động của các Workers và kết nối Odoo
   */
  app.get('/api/v1/workers/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const status = await workerManager.getStatus();
    return reply.send({
      success: true,
      data: status,
    });
  });

  /**
   * GET /api/v1/registry/systems
   * Danh bạ tất cả các hệ sinh thái và đích Odoo đang kích hoạt
   */
  app.get('/api/v1/registry/systems', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      data: routingRegistry.getSystems(),
    });
  });

  /**
   * GET /api/v1/registry/active-odoo
   * Trả về thông tin cấu hình Odoo đích đang được Router kích hoạt (Test hoặc Prod)
   */
  app.get('/api/v1/registry/active-odoo', async (request: FastifyRequest, reply: FastifyReply) => {
    const activeOdoo = routingRegistry.getActiveOdooConfig();
    return reply.send({
      success: true,
      data: activeOdoo,
    });
  });

  /**
   * POST /api/v1/registry/switch-odoo
   * Chuyển đổi đích đến Odoo ERP (odoo_test <-> odoo_prod)
   */
  app.post('/api/v1/registry/switch-odoo', async (request: FastifyRequest, reply: FastifyReply) => {
    const { target } = request.body as { target: string };
    if (!target) {
      return reply.status(400).send({
        success: false,
        error: 'Thiếu tham số target (vd: odoo_test hoặc odoo_prod)',
      });
    }

    const result = routingRegistry.switchOdooEnvironment(target);
    if (!result.success) {
      return reply.status(404).send({
        success: false,
        error: `Không tìm thấy cấu hình hệ thống đích: ${target}`,
      });
    }

    return reply.send({
      success: true,
      message: `Đã chuyển đổi đích đến Odoo thành công: ${result.system?.name || target}`,
      data: result,
    });
  });

  /**
   * POST /api/v1/registry/systems
   * Thêm hoặc cập nhật một hệ thống trong danh bạ
   */
  app.post('/api/v1/registry/systems', async (request: FastifyRequest, reply: FastifyReply) => {
    const system = request.body as any;
    if (!system || !system.id || !system.name || !system.url) {
      return reply.status(400).send({
        success: false,
        error: 'Thiếu thông tin bắt buộc: id, name, url',
      });
    }

    const saved = routingRegistry.upsertSystem(system);
    if (!saved) {
      return reply.status(400).send({
        success: false,
        error: 'Không thể lưu hệ thống vào danh bạ',
      });
    }

    return reply.send({
      success: true,
      message: `Đã lưu hệ thống [${system.name}] vào danh bạ thành công`,
      data: routingRegistry.getSystems(),
    });
  });

  /**
   * DELETE /api/v1/registry/systems/:systemId
   * Xóa một hệ thống khỏi danh bạ
   */
  app.delete('/api/v1/registry/systems/:systemId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { systemId } = request.params as { systemId: string };
    const deleted = routingRegistry.deleteSystem(systemId);
    if (!deleted) {
      return reply.status(400).send({
        success: false,
        error: `Không thể xóa hệ thống ${systemId} (hệ thống lõi hoặc không tồn tại)`,
      });
    }

    return reply.send({
      success: true,
      message: `Đã xóa hệ thống ${systemId} khỏi danh bạ`,
    });
  });

  /**
   * GET /api/v1/registry/ping/:systemId
   * Ping thử nghiệm kết nối đến một hệ thống
   */
  app.get('/api/v1/registry/ping/:systemId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { systemId } = request.params as { systemId: string };
    const systems = routingRegistry.getSystems().systems;
    const sys = systems[systemId];

    if (!sys) {
      return reply.status(404).send({ success: false, error: 'Hệ thống không tồn tại' });
    }

    const startTime = Date.now();
    const candidateUrls = [sys.url];
    if (sys.url.includes('localhost')) {
      candidateUrls.push(sys.url.replace('localhost', 'host.docker.internal'));
    }
    if (sys.url.includes('127.0.0.1')) {
      candidateUrls.push(sys.url.replace('127.0.0.1', 'host.docker.internal'));
    }

    let lastError: any = null;
    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(4000),
        });

        const latency = Date.now() - startTime;
        return reply.send({
          success: true,
          reachable: res.status < 500,
          status_code: res.status,
          latency_ms: latency,
        });
      } catch (err: any) {
        lastError = err;
      }
    }

    return reply.send({
      success: true,
      reachable: false,
      error: lastError?.message || 'Không thể kết nối',
      latency_ms: Date.now() - startTime,
    });
  });

  /**
   * POST /api/v1/registry/test-odoo
   * Kiểm tra kết nối và xác thực JSON-RPC trực tiếp tới Odoo ERP
   */
  app.post('/api/v1/registry/test-odoo', async (request: FastifyRequest, reply: FastifyReply) => {
    const { url, db, user, apiKey } = request.body as {
      url: string;
      db: string;
      user: string;
      apiKey: string;
    };

    if (!url || !db || !user || !apiKey) {
      return reply.status(400).send({
        success: false,
        error: 'Thiếu thông tin kết nối (URL, Database, User hoặc API Key)',
      });
    }

    const startTime = Date.now();
    try {
      const endpoint = `${url.replace(/\/+$/, '')}/jsonrpc`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            service: 'common',
            method: 'authenticate',
            args: [db, user, apiKey, {}],
          },
        }),
      });

      const latency = Date.now() - startTime;
      const data = (await res.json()) as any;

      if (data.error) {
        return reply.send({
          success: false,
          error: data.error.message || data.error.data?.message || 'Lỗi xác thực Odoo',
          latency_ms: latency,
        });
      }

      const uid = typeof data.result === 'number' ? data.result : null;
      if (!uid) {
        return reply.send({
          success: false,
          error: 'Xác thực thất bại: Sai tên Database, Tài khoản hoặc API Key',
          latency_ms: latency,
        });
      }

      return reply.send({
        success: true,
        uid,
        latency_ms: latency,
        message: `Kết nối thành công! Đã xác thực người dùng UID: ${uid} (${latency}ms)`,
      });
    } catch (err: any) {
      return reply.send({
        success: false,
        error: `Không thể kết nối tới máy chủ Odoo: ${err.message}`,
        latency_ms: Date.now() - startTime,
      });
    }
  });

  /**
   * GET /api/v1/orders
   * Lấy danh sách đơn hàng thực tế và chỉ số KPI điều hành
   */
  app.get('/api/v1/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      search?: string;
      status?: string;
      source?: string;
      page?: string;
      limit?: string;
    };
    const result = await getAllOrders({
      search: query.search,
      status: query.status,
      source: query.source,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 20,
    });
    return reply.send({
      success: true,
      ...result,
    });
  });

  /**
   * GET /api/v1/orders/:orderCode
   * Lấy chi tiết đơn hàng và timeline 6 bước cho Order Detail Drawer
   */
  app.get('/api/v1/orders/:orderCode', async (request: FastifyRequest, reply: FastifyReply) => {
    const { orderCode } = request.params as { orderCode: string };
    const order = await getOrderDetail(orderCode);
    if (!order) {
      return reply.status(404).send({
        success: false,
        error: `Không tìm thấy thông tin đơn hàng #${orderCode}`,
      });
    }
    return reply.send({
      success: true,
      data: order,
    });
  });

  /**
   * GET /api/v1/logs
   * Lấy danh sách logs hệ thống có phân trang và bộ lọc
   */
  app.get('/api/v1/logs', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      level?: string;
      service?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };
    const result = routerLogger.getLogs({
      level: query.level,
      service: query.service,
      search: query.search,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });
    return reply.send({
      success: true,
      ...result,
    });
  });

  /**
   * GET /api/v1/activity
   * Lấy nhật ký hoạt động gần nhất (Activity Timeline)
   */
  app.get('/api/v1/activity', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { limit?: string; filter?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const filter = query.filter || 'ALL';
    const activities = routerLogger.getRecentActivity(limit, filter);
    return reply.send({
      success: true,
      data: activities,
    });
  });
}


