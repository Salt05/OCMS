import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { routingRegistry } from '../registry/routing-registry.js';
import { dispatchEvent } from '../queue/queue-manager.js';
import { config } from '../config.js';
import { routerLogger } from '../logger/router-logger.js';

export async function mutationRoutes(app: FastifyInstance) {
  const backendUrl = config.ocmsBackendUrl.replace(/\/+$/, '');

  /**
   * POST /api/v1/router/odoo/create-order
   * Router Gateway: Điều phối tạo đơn hàng trực tiếp sang máy chủ Odoo đích (Test hoặc Prod)
   */
  app.post('/api/v1/router/odoo/create-order', async (request: FastifyRequest, reply: FastifyReply) => {
    const activeOdoo = routingRegistry.getActiveOdooConfig();
    const body = request.body as any;

    app.log.info(
      { order_code: body?.order_code, target: activeOdoo.id, odoo_url: activeOdoo.url },
      `[Router Mutation Gateway] 🎯 Điều phối TẠO ĐƠN HÀNG tới: [${activeOdoo.name}]`
    );

    try {
      const res = await fetch(`${backendUrl}/api/v1/internal/odoo/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(35000),
        body: JSON.stringify({
          ...body,
          odoo_target: {
            url: activeOdoo.url,
            db: activeOdoo.db,
            user: activeOdoo.user,
            apiKey: activeOdoo.apiKey,
          },
        }),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        return reply.status(res.status || 500).send({
          success: false,
          error: json.error || 'Lỗi khi tạo đơn hàng trên Odoo',
          target: activeOdoo.id,
        });
      }

      // Phát sự kiện order.odoo_synced vào queue_ocms để cập nhật CRM & Zalo
      try {
        await dispatchEvent('order.odoo_synced', {
          event_id: `router-sync-${json.odoo_order_id}`,
          event_type: 'order.odoo_synced',
          timestamp: new Date().toISOString(),
          data: {
            ...body,
            odoo_order_id: json.odoo_order_id,
            order_code: json.order_code,
            web_order_code: body?.order_code,
            salesperson: json.salesperson,
            total_amount: json.amount_total,
          },
        });
      } catch (dispatchErr: any) {
        app.log.warn(`Không thể dispatch order.odoo_synced: ${dispatchErr.message}`);
      }

      return reply.send({
        success: true,
        orderId: json.odoo_order_id,
        orderCode: json.order_code,
        amount_total: json.amount_total,
        salesperson: json.salesperson,
        target: activeOdoo.id,
        target_name: activeOdoo.name,
      });
    } catch (err: any) {
      app.log.error(err, `Lỗi Gateway điều phối tạo đơn: ${err.message}`);
      return reply.status(500).send({
        success: false,
        error: `Router không thể kết nối tới máy chủ Odoo (${err.message})`,
        target: activeOdoo.id,
      });
    }
  });

  /**
   * POST /api/v1/router/odoo/cancel-order
   * Router Gateway: Điều phối hủy đơn hàng trên máy chủ Odoo đích (Test hoặc Prod)
   */
  app.post('/api/v1/router/odoo/cancel-order', async (request: FastifyRequest, reply: FastifyReply) => {
    const activeOdoo = routingRegistry.getActiveOdooConfig();
    const body = request.body as any;

    app.log.info(
      { order_code: body?.order_code, odoo_order_id: body?.odoo_order_id, target: activeOdoo.id },
      `[Router Mutation Gateway] 🚫 Điều phối HỦY ĐƠN HÀNG tới: [${activeOdoo.name}]`
    );

    routerLogger.add({
      level: 'INFO',
      service: 'ROUTER',
      order_id: body?.order_code || String(body?.odoo_order_id || ''),
      event: 'order.cancelling',
      message: `[Gateway] 🚫 Điều phối HỦY ĐƠN HÀNG [${body?.order_code || body?.odoo_order_id}] sang ${activeOdoo.name}`,
      details: { target: activeOdoo.id, reason: body?.reason },
    });

    try {
      const res = await fetch(`${backendUrl}/api/v1/internal/odoo/cancel-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          ...body,
          odoo_target: {
            url: activeOdoo.url,
            db: activeOdoo.db,
            user: activeOdoo.user,
            apiKey: activeOdoo.apiKey,
          },
        }),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        routerLogger.add({
          level: 'ERROR',
          service: 'ODOO',
          order_id: body?.order_code || String(body?.odoo_order_id || ''),
          event: 'order.cancel_failed',
          message: `[Odoo] ❌ Thất bại khi hủy đơn [${body?.order_code || body?.odoo_order_id}]: ${json.error || 'Lỗi Odoo'}`,
          details: { error: json.error, target: activeOdoo.id },
        });

        return reply.status(res.status || 500).send({
          success: false,
          error: json.error || 'Lỗi khi hủy đơn hàng trên Odoo',
          target: activeOdoo.id,
        });
      }

      routerLogger.add({
        level: 'SUCCESS',
        service: 'ODOO',
        order_id: body?.order_code || String(body?.odoo_order_id || ''),
        event: 'order.cancelled',
        message: `[Odoo] ✅ Đã hủy đơn hàng [${body?.order_code || body?.odoo_order_id}] thành công trên ${activeOdoo.name}`,
        details: { target: activeOdoo.id },
      });

      return reply.send({
        success: true,
        message: `Đã hủy đơn hàng thành công trên ${activeOdoo.name}`,
        target: activeOdoo.id,
      });
    } catch (err: any) {
      app.log.error(err, `Lỗi Gateway điều phối hủy đơn: ${err.message}`);

      routerLogger.add({
        level: 'ERROR',
        service: 'ROUTER',
        order_id: body?.order_code || String(body?.odoo_order_id || ''),
        event: 'order.cancel_error',
        message: `[Gateway] 💥 Lỗi mạng khi hủy đơn [${body?.order_code || body?.odoo_order_id}]: ${err.message}`,
        details: { error: err.message, target: activeOdoo.id },
      });

      return reply.status(500).send({
        success: false,
        error: `Router không thể kết nối tới Odoo để hủy đơn (${err.message})`,
        target: activeOdoo.id,
      });
    }
  });

  /**
   * POST /api/v1/router/odoo/confirm-order
   * Router Gateway: Điều phối xác nhận đơn hàng (Báo giá -> Đơn hàng) sang máy chủ Odoo đích (Test hoặc Prod)
   */
  app.post('/api/v1/router/odoo/confirm-order', async (request: FastifyRequest, reply: FastifyReply) => {
    const activeOdoo = routingRegistry.getActiveOdooConfig();
    const body = request.body as any;

    app.log.info(
      { order_code: body?.order_code, odoo_order_id: body?.odoo_order_id, target: activeOdoo.id },
      `[Router Mutation Gateway] 🎯 Điều phối XÁC NHẬN ĐƠN HÀNG tới: [${activeOdoo.name}]`
    );

    routerLogger.add({
      level: 'INFO',
      service: 'ROUTER',
      order_id: body?.order_code || String(body?.odoo_order_id || ''),
      event: 'order.confirming',
      message: `[Gateway] 🎯 Điều phối XÁC NHẬN ĐƠN [${body?.order_code || body?.odoo_order_id}] sang ${activeOdoo.name}`,
      details: { target: activeOdoo.id, odoo_url: activeOdoo.url },
    });

    try {
      const res = await fetch(`${backendUrl}/api/v1/internal/odoo/confirm-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          ...body,
          odoo_target: {
            url: activeOdoo.url,
            db: activeOdoo.db,
            user: activeOdoo.user,
            apiKey: activeOdoo.apiKey,
          },
        }),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        routerLogger.add({
          level: 'ERROR',
          service: 'ODOO',
          order_id: body?.order_code || String(body?.odoo_order_id || ''),
          event: 'order.confirm_failed',
          message: `[Odoo] ❌ Thất bại khi xác nhận đơn [${body?.order_code || body?.odoo_order_id}]: ${json.error || 'Lỗi Odoo'}`,
          details: { error: json.error, target: activeOdoo.id },
        });

        return reply.status(res.status || 500).send({
          success: false,
          error: json.error || 'Lỗi khi xác nhận đơn hàng trên Odoo',
          target: activeOdoo.id,
        });
      }

      routerLogger.add({
        level: 'SUCCESS',
        service: 'ODOO',
        order_id: body?.order_code || String(body?.odoo_order_id || ''),
        event: 'order.confirmed',
        message: `[Odoo] ✅ Đã xác nhận đơn hàng [${body?.order_code || body?.odoo_order_id}] thành công trên ${activeOdoo.name}`,
        details: { target: activeOdoo.id, odoo_order_id: body?.odoo_order_id },
      });

      return reply.send({
        success: true,
        message: `Đã xác nhận đơn hàng thành công trên ${activeOdoo.name}`,
        target: activeOdoo.id,
        target_name: activeOdoo.name,
      });
    } catch (err: any) {
      app.log.error(err, `Lỗi Gateway điều phối xác nhận đơn: ${err.message}`);

      routerLogger.add({
        level: 'ERROR',
        service: 'ROUTER',
        order_id: body?.order_code || String(body?.odoo_order_id || ''),
        event: 'order.confirm_error',
        message: `[Gateway] 💥 Lỗi mạng khi gọi Odoo xác nhận đơn [${body?.order_code || body?.odoo_order_id}]: ${err.message}`,
        details: { error: err.message, target: activeOdoo.id },
      });

      return reply.status(500).send({
        success: false,
        error: `Router không thể kết nối tới Odoo để xác nhận đơn (${err.message})`,
        target: activeOdoo.id,
      });
    }
  });



  /**
   * POST /api/v1/router/odoo/create-customer
   * Router Gateway: Điều phối tạo khách hàng mới trên máy chủ Odoo đích (Test hoặc Prod)
   */
  app.post('/api/v1/router/odoo/create-customer', async (request: FastifyRequest, reply: FastifyReply) => {
    const activeOdoo = routingRegistry.getActiveOdooConfig();
    const body = request.body as any;

    app.log.info(
      { customer_name: body?.name, target: activeOdoo.id },
      `[Router Mutation Gateway] 👤 Điều phối TẠO KHÁCH HÀNG tới: [${activeOdoo.name}]`
    );

    try {
      const res = await fetch(`${backendUrl}/api/v1/internal/odoo/create-customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          ...body,
          odoo_target: {
            url: activeOdoo.url,
            db: activeOdoo.db,
            user: activeOdoo.user,
            apiKey: activeOdoo.apiKey,
          },
        }),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        return reply.status(res.status || 500).send({
          success: false,
          error: json.error || 'Lỗi khi tạo khách hàng trên Odoo',
          target: activeOdoo.id,
        });
      }

      return reply.send({
        success: true,
        customerId: json.odoo_partner_id,
        name: json.name,
        target: activeOdoo.id,
        target_name: activeOdoo.name,
      });
    } catch (err: any) {
      app.log.error(err, `Lỗi Gateway điều phối tạo khách hàng: ${err.message}`);
      return reply.status(500).send({
        success: false,
        error: `Router không thể kết nối tới Odoo để tạo khách (${err.message})`,
        target: activeOdoo.id,
      });
    }
  });

  /**
   * POST /api/v1/router/odoo/update-customer
   * Router Gateway: Điều phối cập nhật thông tin/nhân viên khách hàng trên máy chủ Odoo đích
   */
  app.post('/api/v1/router/odoo/update-customer', async (request: FastifyRequest, reply: FastifyReply) => {
    const activeOdoo = routingRegistry.getActiveOdooConfig();
    const body = request.body as any;

    app.log.info(
      { partner_id: body?.partner_id, target: activeOdoo.id },
      `[Router Mutation Gateway] 📝 Điều phối CẬP NHẬT KHÁCH HÀNG tới: [${activeOdoo.name}]`
    );

    try {
      const res = await fetch(`${backendUrl}/api/v1/internal/odoo/update-customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          ...body,
          odoo_target: {
            url: activeOdoo.url,
            db: activeOdoo.db,
            user: activeOdoo.user,
            apiKey: activeOdoo.apiKey,
          },
        }),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        return reply.status(res.status || 500).send({
          success: false,
          error: json.error || 'Lỗi khi cập nhật khách hàng trên Odoo',
          target: activeOdoo.id,
        });
      }

      return reply.send({
        success: true,
        updated: true,
        target: activeOdoo.id,
        target_name: activeOdoo.name,
      });
    } catch (err: any) {
      app.log.error(err, `Lỗi Gateway điều phối cập nhật khách hàng: ${err.message}`);
      return reply.status(500).send({
        success: false,
        error: `Router không thể kết nối tới Odoo để cập nhật khách (${err.message})`,
        target: activeOdoo.id,
      });
    }
  });

  /**
   * POST /api/v1/router/odoo/update-order
   * Router Gateway: Điều phối cập nhật đơn hàng (sản phẩm, giá, CK, ghi chú) sang máy chủ Odoo đích
   */
  app.post('/api/v1/router/odoo/update-order', async (request: FastifyRequest, reply: FastifyReply) => {
    const activeOdoo = routingRegistry.getActiveOdooConfig();
    const body = request.body as any;

    app.log.info(
      { odoo_order_id: body?.odoo_order_id, target: activeOdoo.id },
      `[Router Mutation Gateway] 📝 Điều phối CẬP NHẬT ĐƠN HÀNG #${body?.odoo_order_id} tới: [${activeOdoo.name}]`
    );

    try {
      const res = await fetch(`${backendUrl}/api/v1/internal/odoo/update-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(35000),
        body: JSON.stringify({
          ...body,
          odoo_target: {
            url: activeOdoo.url,
            db: activeOdoo.db,
            user: activeOdoo.user,
            apiKey: activeOdoo.apiKey,
          },
        }),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        return reply.status(res.status || 500).send({
          success: false,
          error: json.error || 'Lỗi khi cập nhật đơn hàng trên Odoo',
          target: activeOdoo.id,
        });
      }

      return reply.send({
        success: true,
        odoo_order_id: json.odoo_order_id,
        updated: true,
        target: activeOdoo.id,
        target_name: activeOdoo.name,
      });
    } catch (err: any) {
      app.log.error(err, `Lỗi Gateway điều phối cập nhật đơn hàng: ${err.message}`);
      return reply.status(500).send({
        success: false,
        error: `Router không thể kết nối tới Odoo để cập nhật đơn hàng (${err.message})`,
        target: activeOdoo.id,
      });
    }
  });

  /**
   * POST /api/v1/router/odoo/manage-activity
   * Router Gateway: Điều phối thêm / sửa / xóa Hoạt động (Ghi chú giao việc) sang máy chủ Odoo đích
   */
  app.post('/api/v1/router/odoo/manage-activity', async (request: FastifyRequest, reply: FastifyReply) => {
    const activeOdoo = routingRegistry.getActiveOdooConfig();
    const body = request.body as any;

    app.log.info(
      { odoo_order_id: body?.odoo_order_id, action: body?.action, target: activeOdoo.id },
      `[Router Mutation Gateway] 📌 Điều phối HOẠT ĐỘNG (${body?.action}) cho đơn #${body?.odoo_order_id} tới: [${activeOdoo.name}]`
    );

    try {
      const res = await fetch(`${backendUrl}/api/v1/internal/odoo/manage-activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          ...body,
          odoo_target: {
            url: activeOdoo.url,
            db: activeOdoo.db,
            user: activeOdoo.user,
            apiKey: activeOdoo.apiKey,
          },
        }),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        return reply.status(res.status || 500).send({
          success: false,
          error: json.error || 'Lỗi khi thao tác hoạt động trên Odoo',
          target: activeOdoo.id,
        });
      }

      return reply.send({
        success: true,
        action: body.action,
        activitySummary: json.activitySummary,
        target: activeOdoo.id,
        target_name: activeOdoo.name,
      });
    } catch (err: any) {
      app.log.error(err, `Lỗi Gateway điều phối hoạt động: ${err.message}`);
      return reply.status(500).send({
        success: false,
        error: `Router không thể kết nối tới Odoo để xử lý hoạt động (${err.message})`,
        target: activeOdoo.id,
      });
    }
  });
}
