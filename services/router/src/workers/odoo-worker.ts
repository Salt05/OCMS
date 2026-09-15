import { Worker, type Job } from 'bullmq';
import { redisConnection, dispatchEvent } from '../queue/queue-manager.js';
import { config } from '../config.js';
import { routingRegistry } from '../registry/routing-registry.js';
import { routerLogger } from '../logger/router-logger.js';

export interface OdooJobPayload {
  target_id: string;
  action: string;
  payload: {
    event_id: string;
    event_type: string;
    timestamp: string;
    data: {
      order_code: string;
      source: string;
      partner_id?: number | null;
      customer_name: string;
      customer_phone: string;
      shipping_address: string;
      note?: string;
      items: Array<{
        sku: string;
        product_name?: string;
        odoo_product_id?: number | null;
        quantity: number;
        price: number;
        discount?: number;
      }>;
      total_amount: number;
      payment_method: string;
      metadata?: Record<string, any>;
    };
  };
}

export class OdooWorkerService {
  private worker: Worker | null = null;

  /**
   * Gọi kiểm tra máy chủ Odoo có sẵn sàng hay không (sử dụng URL do Router quyết định)
   */
  async checkOdooHealth(overrideUrl?: string): Promise<{ healthy: boolean; status?: number; error?: string; target_name?: string }> {
    try {
      const activeOdoo = routingRegistry.getActiveOdooConfig();
      const targetUrl = overrideUrl || activeOdoo?.url;

      if (!targetUrl) {
        return { healthy: false, error: 'Chưa cấu hình Odoo URL trong Danh bạ hệ thống của Router' };
      }

      const endpoint = `${targetUrl.replace(/\/+$/, '')}/web/health`;
      const res = await fetch(endpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (res.status === 502 || res.status === 503 || res.status === 504) {
        return {
          healthy: false,
          status: res.status,
          target_name: activeOdoo?.name,
          error: `Máy chủ Odoo (${targetUrl}) trả về mã ${res.status} (Bad Gateway / Service Unavailable).`,
        };
      }

      return { healthy: res.ok, status: res.status, target_name: activeOdoo?.name };
    } catch (err: any) {
      return {
        healthy: false,
        error: `Không thể kết nối đến Odoo (${err.message})`,
      };
    }
  }

  /**
   * Khởi động Worker lắng nghe hàng đợi queue_odoo
   */
  start(): Worker {
    if (this.worker) return this.worker;

    this.worker = new Worker(
      'queue_odoo',
      async (job: Job<OdooJobPayload>) => {
        const { action, payload } = job.data;
        const orderData = payload?.data;

        console.log(`\n⚙️ [OdooWorker] Bắt đầu xử lý Job #${job.id} - Hành động: ${action} - Đơn: ${orderData?.order_code}`);
        console.log(`   👉 Lần thử thứ: ${job.attemptsMade + 1}/${job.opts.attempts || 3}`);

        // 0. Kiểm tra điểm đích Odoo ERP có đang được kích hoạt trong Bảng Định Tuyến Sự Kiện không
        if (action === 'create_sale_order') {
          const isOdooEnabled = routingRegistry.isTargetEnabled('order.created', 'target_odoo');
          if (!isOdooEnabled) {
            const errMsg = `Điểm đích Odoo ERP (create_sale_order) đang bị TẮT trong Bảng Định Tuyến Sự Kiện. Vui lòng bật lại trong Bảng Định Tuyến trước khi thử lại đơn #${orderData?.order_code}.`;
            console.warn(`   ⚠️ [OdooWorker] ${errMsg}`);
            throw new Error(errMsg);
          }
        }

        // 1. Kiểm tra tình trạng kết nối Odoo theo đích đến Router chỉ định
        const health = await this.checkOdooHealth();

        if (!health.healthy) {
          const errMsg = `[OdooWorker] CẢNH BÁO: Odoo [${health.target_name || 'N/A'}] đang bảo trì hoặc gặp sự cố (${health.error}). Giữ đơn hàng trong hàng đợi để tự động thử lại sau...`;
          console.warn(errMsg);
          throw new Error(health.error || 'Odoo 502 Bad Gateway - Sẽ tự động thử lại khi Odoo phục hồi');
        }

        // 2. Lấy trực tiếp ID Odoo của khách hàng (partner_id) thay vì tra cứu số điện thoại
        const odooPartnerId = orderData?.partner_id || orderData?.metadata?.partner_id || orderData?.metadata?.odooPartnerId;
        console.log(`   👤 [OdooWorker] Sử dụng trực tiếp ID Odoo khách hàng: #${odooPartnerId || 'N/A'} (không tìm kiếm SĐT)`);

        // 3. Quy ước kho: Không kiểm tra tồn kho, luôn coi kho đủ hàng sẵn sàng
        console.log(`   📦 [OdooWorker] Bỏ qua kiểm tra tồn kho (quy ước kho luôn đảm bảo đủ hàng)`);

        // 4. Lấy đích đến do Router quyết định (Odoo Test hoặc Odoo Chính Thức)
        const activeOdoo = routingRegistry.getActiveOdooConfig();
        console.log(`   🎯 [OdooWorker] Router chỉ định đích đến: [${activeOdoo.name}] (${activeOdoo.url})`);

        const backendUrl = config.ocmsBackendUrl.replace(/\/+$/, '');

        // Xử lý Hành động Hủy đơn hàng
        if (action === 'cancel_sale_order') {
          console.log(`   🚫 [OdooWorker] Tiến hành hủy đơn hàng #${orderData?.order_code} trên ${activeOdoo.name}...`);
          const cancelRes = await fetch(`${backendUrl}/api/v1/internal/odoo/cancel-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30000),
            body: JSON.stringify({
              order_code: orderData?.order_code,
              reason: (orderData as any)?.reason,
              odoo_target: {
                url: activeOdoo.url,
                db: activeOdoo.db,
                user: activeOdoo.user,
                apiKey: activeOdoo.apiKey,
              },
            }),
          });
          const cancelJson = (await cancelRes.json()) as any;
          if (!cancelRes.ok || !cancelJson.success) {
            throw new Error(cancelJson.error || 'Lỗi khi hủy đơn trên Odoo');
          }
          console.log(`   ✅ [OdooWorker] Đã hủy thành công đơn hàng #${orderData?.order_code} trên ${activeOdoo.name}!`);
          return { success: true, order_code: orderData?.order_code, action: 'cancelled' };
        }

        // Xử lý Hành động Tạo khách hàng
        if (action === 'create_customer') {
          const custData = (orderData as any)?.customer || orderData;
          console.log(`   👤 [OdooWorker] Tiến hành tạo khách hàng [${custData?.name}] trên ${activeOdoo.name}...`);
          const res = await fetch(`${backendUrl}/api/v1/internal/odoo/create-customer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30000),
            body: JSON.stringify({
              customer: custData,
              contact_id: (orderData as any)?.contact_id,
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
            throw new Error(json.error || 'Lỗi khi tạo khách hàng trên Odoo');
          }
          console.log(`   ✅ [OdooWorker] Đã tạo thành công khách hàng #${json.odoo_partner_id} trên ${activeOdoo.name}!`);
          return { success: true, odoo_partner_id: json.odoo_partner_id, action: 'customer_created' };
        }

        // Xử lý Hành động Cập nhật khách hàng
        if (action === 'update_customer') {
          const custData = (orderData as any)?.customer || orderData;
          const partnerId = custData?.partner_id || (orderData as any)?.partner_id;
          console.log(`   📝 [OdooWorker] Tiến hành cập nhật khách hàng #${partnerId} trên ${activeOdoo.name}...`);
          const res = await fetch(`${backendUrl}/api/v1/internal/odoo/update-customer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30000),
            body: JSON.stringify({
              partner_id: partnerId,
              data: custData?.data || custData,
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
            throw new Error(json.error || 'Lỗi khi cập nhật khách hàng trên Odoo');
          }
          console.log(`   ✅ [OdooWorker] Đã cập nhật thành công khách hàng #${partnerId} trên ${activeOdoo.name}!`);
          return { success: true, partner_id: partnerId, action: 'customer_updated' };
        }

        const createRes = await fetch(`${backendUrl}/api/v1/internal/odoo/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            order_code: orderData?.order_code,
            partner_id: odooPartnerId,
            user_id: (orderData as any)?.user_id,
            validity_date: (orderData as any)?.validity_date,
            payment_term_id: (orderData as any)?.payment_term_id,
            note: orderData?.note,
            items: orderData?.items || [],
            odoo_target: {
              url: activeOdoo.url,
              db: activeOdoo.db,
              user: activeOdoo.user,
              apiKey: activeOdoo.apiKey,
            },
          }),
        });

        const createJson = (await createRes.json()) as any;
        if (!createRes.ok || !createJson.success) {
          throw new Error(createJson.error || 'Lỗi khi tạo Báo giá Odoo');
        }

        console.log(`   ✨ [OdooWorker] Đã tạo thành công Báo giá #${createJson.odoo_order_id} (${createJson.order_code}) trên ${activeOdoo.name}!`);

        // Điều phối tiếp sang OCMS (queue_ocms) với mã Odoo và ID Odoo chính thức
        try {
          await dispatchEvent('order.odoo_synced', {
            event_id: payload.event_id,
            event_type: 'order.odoo_synced',
            timestamp: new Date().toISOString(),
            data: {
              ...orderData,
              odoo_order_id: createJson.odoo_order_id,
              order_code: createJson.order_code, // Mã Odoo chính thức: S02398
              web_order_code: orderData?.order_code,
              salesperson: createJson.salesperson,
              total_amount: createJson.amount_total ?? orderData?.total_amount,
              conversationId: (orderData as any)?.conversationId || (orderData as any)?.conversation_id || (orderData as any)?.metadata?.conversationId,
              contactId: (orderData as any)?.contactId || (orderData as any)?.contact_id || (orderData as any)?.metadata?.contactId,
              customer_name: orderData?.customer_name,
              customer_phone: orderData?.customer_phone,
              note: orderData?.note,
            },
          });
          console.log(`   🚀 [OdooWorker] Đã chuyển tiếp sự kiện [order.odoo_synced] sang OCMS (CRM & Zalo) với mã: ${createJson.order_code}`);
        } catch (dispatchErr: any) {
          console.warn(`   ⚠️ [OdooWorker] Không thể điều phối order.odoo_synced: ${dispatchErr.message}`);
        }

        return {
          success: true,
          odoo_order_id: createJson.odoo_order_id,
          order_code: createJson.order_code,
          amount_total: createJson.amount_total,
          partner_id: odooPartnerId,
          processed_at: new Date().toISOString(),
        };
      },
      {
        connection: redisConnection,
        concurrency: 2, // Xử lý tuần tự 2 đơn cùng lúc để tránh làm nghẽn CPU của Odoo
      }
    );

    this.worker.on('completed', (job: Job) => {
      console.log(`✅ [OdooWorker] Job #${job.id} đã hoàn thành thành công!`);
      const payload = job.data?.payload?.data || {};
      routerLogger.add({
        level: 'SUCCESS',
        service: 'ODOO',
        queue: 'queue_odoo',
        order_id: payload.order_code,
        message: `Đơn [${payload.order_code || job.id}] đồng bộ Odoo ERP thành công (Odoo #${job.returnvalue?.odoo_order_id || 'OK'})`,
      });
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      console.warn(`⏳ [OdooWorker] Job #${job?.id} chưa thành công: ${err.message}. Đơn vẫn an toàn trong Queue!`);
      const payload = job?.data?.payload?.data || {};
      routerLogger.add({
        level: 'ERROR',
        service: 'ODOO',
        queue: 'queue_odoo',
        order_id: payload.order_code,
        message: `Đơn [${payload.order_code || job?.id}] lỗi xử lý Odoo ERP: ${err.message}`,
      });
    });

    console.log('[OdooWorker] Worker Odoo Sync đã khởi động thành công và đang lắng nghe queue_odoo.');
    return this.worker;
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[OdooWorker] Đã tạm dừng worker Odoo.');
    }
  }

  isRunning(): boolean {
    return this.worker !== null && !this.worker.isPaused();
  }
}

export const odooWorkerService = new OdooWorkerService();
