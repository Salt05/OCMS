import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  StandardOrderPayloadSchema,
  formatZodErrors,
} from '../validators/order-validator.js';
import { dispatchEvent, queues } from '../queue/queue-manager.js';

export async function orderRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/orders/standard
   * Cổng tiếp nhận đơn hàng chuẩn hóa từ Web Bán Hàng (store-lapet)
   */
  app.post('/api/v1/orders/standard', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Kiểm duyệt cấu trúc dữ liệu với Zod Schema
    const parseResult = StandardOrderPayloadSchema.safeParse(request.body);

    if (!parseResult.success) {
      const formattedErrors = formatZodErrors(parseResult.error);
      return reply.status(400).send({
        success: false,
        error: 'Dữ liệu đơn hàng không hợp lệ',
        details: formattedErrors,
      });
    }

    const startTime = Date.now();
    const validatedOrder = parseResult.data;
    const trackingId = randomUUID();
    const receivedAt = new Date().toISOString();

    // 2. Điều phối sự kiện qua Danh Bạ Định Tuyến (Routing Registry)
    const { dispatched, skipped } = await dispatchEvent('order.created', {
      event_id: trackingId,
      event_type: 'order.created',
      timestamp: receivedAt,
      data: validatedOrder,
    });

    // Nếu điểm đích Odoo ERP bị TẮT trong Danh bạ (dispatched.length === 0):
    // Đơn hàng KHÔNG được tạo trên Odoo => TUYỆT ĐỐI KHÔNG kích hoạt order.odoo_synced (không gửi Zalo thành công)
    // Thay vào đó, đưa đơn hàng vào Dead-Letter Queue của queue_odoo để Router hiển thị cảnh báo và hỗ trợ 1-Click Retry
    if (dispatched.length === 0) {
      const failReason = 'Điểm đích Odoo ERP (create_sale_order) đang bị TẮT trong Bảng Định Tuyến Sự Kiện. Đơn hàng chưa được tạo trên Odoo.';
      try {
        const odooQueue = queues.queue_odoo;
        if (odooQueue) {
          await odooQueue.add(
            'create_sale_order',
            {
              target_id: 'target_odoo',
              action: 'create_sale_order',
              payload: {
                event_id: trackingId,
                event_type: 'order.created',
                timestamp: receivedAt,
                data: validatedOrder,
              },
            },
            {
              attempts: 1, // Để khi worker fail sẽ lập tức rơi vào Dead-Letter Queue
              jobId: `${trackingId}-target_odoo`,
            }
          );
        }
      } catch (err: any) {
        app.log.error({ err }, 'Lỗi khi đưa đơn hàng vào queue_odoo');
      }

      const executionTimeMs = Date.now() - startTime;
      app.log.warn(
        {
          order_code: validatedOrder.order_code,
          tracking_id: trackingId,
          reason: failReason,
          execution_time_ms: executionTimeMs,
        },
        'Đơn hàng bị tạm giữ trong Hàng Đợi Đơn Lỗi do Odoo ERP bị TẮT trong Danh bạ định tuyến'
      );

      return reply.status(422).send({
        success: false,
        status: 'failed',
        error: failReason,
        data: {
          order_code: validatedOrder.order_code,
          tracking_id: trackingId,
          status: 'failed',
          dispatched: [],
          skipped,
          execution_time_ms: executionTimeMs,
        },
      });
    }

    const executionTimeMs = Date.now() - startTime;

    // 3. Ghi nhận log tiếp nhận & điều phối
    app.log.info(
      {
        order_code: validatedOrder.order_code,
        tracking_id: trackingId,
        dispatched_count: dispatched.length,
        execution_time_ms: executionTimeMs,
      },
      'Đơn hàng đã được thẩm định và phân luồng vào các hàng đợi thành công'
    );

    // 4. Phản hồi siêu tốc về cho Web Bán Hàng (< 0.05s)
    return reply.status(201).send({
      success: true,
      message: 'Đơn hàng đã được tiếp nhận thành công và đang được phân luồng xử lý',
      data: {
        order_code: validatedOrder.order_code,
        tracking_id: trackingId,
        status: 'pending',
        received_at: receivedAt,
        dispatched,
        skipped,
        execution_time_ms: executionTimeMs,
      },
    });
  });

  /**
   * GET /api/v1/orders/standard/:order_code
   * Tra cứu trạng thái tiến độ đơn hàng
   */
  app.get('/api/v1/orders/standard/:order_code', async (request: FastifyRequest, reply: FastifyReply) => {
    const { order_code } = request.params as { order_code: string };

    if (!order_code || order_code.trim().length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'Mã đơn hàng không được để trống',
      });
    }

    // Endpoint tra cứu trạng thái đơn hàng (sẽ đọc từ Redis/DB khi nối ở Phase 3)
    return reply.send({
      success: true,
      data: {
        order_code,
        status: 'pending',
        message: 'Đơn hàng đang chờ xử lý đồng bộ sang Odoo ERP',
      },
    });
  });

  /**
   * POST /api/v1/orders/cancel
   * Tiếp nhận yêu cầu hủy đơn hàng qua Router để phân luồng tới Odoo đích
   */
  app.post('/api/v1/orders/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { order_code?: string; order_id?: number | string; reason?: string; partner_id?: number };
    const orderIdentifier = body?.order_code || String(body?.order_id || '');

    if (!orderIdentifier) {
      return reply.status(400).send({
        success: false,
        error: 'Thiếu mã đơn hàng order_code hoặc order_id',
      });
    }

    const trackingId = randomUUID();
    const receivedAt = new Date().toISOString();

    const { dispatched, skipped } = await dispatchEvent('order.cancelled', {
      event_id: trackingId,
      event_type: 'order.cancelled',
      timestamp: receivedAt,
      data: {
        order_code: orderIdentifier,
        reason: body.reason || 'Khách hàng yêu cầu hủy',
        partner_id: body.partner_id,
      },
    });

    app.log.info(
      { order_code: orderIdentifier, tracking_id: trackingId, dispatched_count: dispatched.length },
      'Yêu cầu hủy đơn hàng đã được phân luồng xử lý'
    );

    return reply.send({
      success: true,
      message: 'Yêu cầu hủy đơn hàng đã được tiếp nhận và phân luồng qua Router',
      data: {
        order_code: orderIdentifier,
        tracking_id: trackingId,
        status: 'cancelling',
        dispatched,
        skipped,
      },
    });
  });
}

