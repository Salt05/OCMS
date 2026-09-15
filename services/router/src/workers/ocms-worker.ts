import { Worker, type Job } from 'bullmq';
import { redisConnection } from '../queue/queue-manager.js';
import { config } from '../config.js';
import { routingRegistry } from '../registry/routing-registry.js';
import { routerLogger } from '../logger/router-logger.js';

export interface OcmsJobPayload {
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

export class OcmsWorkerService {
  private worker: Worker | null = null;

  start(): Worker {
    if (this.worker) return this.worker;

    this.worker = new Worker(
      'queue_ocms',
      async (job: Job<OcmsJobPayload>) => {
        const { action, payload } = job.data;
        const orderData = payload?.data;

        console.log(`\n💬 [OcmsWorker] Bắt đầu xử lý Job #${job.id} trên queue_ocms - Hành động: ${action} - Đơn: ${orderData?.order_code}`);

        // 1. Ghi nhận đơn hàng vào CRM OCMS và gửi tin nhắn Zalo kèm file PDF qua Backend OCMS
        console.log(`   🗄️ [OCMS-CRM] Đang ghi nhận đơn ${orderData?.order_code} vào CRM của khách hàng [${orderData?.customer_phone}]...`);

        const activeOdoo = routingRegistry.getActiveOdooConfig();
        const backendUrl = config.ocmsBackendUrl.replace(/\/+$/, '');
        const notifyRes = await fetch(`${backendUrl}/api/v1/internal/ocms/notify-customer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            order_code: orderData?.order_code,
            customer_name: orderData?.customer_name,
            customer_phone: orderData?.customer_phone,
            shipping_address: orderData?.shipping_address,
            total_amount: orderData?.total_amount,
            payment_method: orderData?.payment_method,
            note: orderData?.note,
            odoo_order_id: (orderData as any)?.odoo_order_id || (orderData as any)?.metadata?.odoo_order_id,
            conversation_id: (orderData as any)?.conversationId || (orderData as any)?.conversation_id,
            contact_id: (orderData as any)?.contactId || (orderData as any)?.contact_id,
            web_order_code: (orderData as any)?.web_order_code,
            items: orderData?.items || [],
            odoo_target: {
              url: activeOdoo.url,
              db: activeOdoo.db,
              user: activeOdoo.user,
              apiKey: activeOdoo.apiKey,
            },
          }),
        });

        const notifyJson = (await notifyRes.json()) as any;
        if (!notifyRes.ok || !notifyJson.success || notifyJson.zalo_sent === false) {
          const failMsg = notifyJson?.error || `Chưa thể gửi thông báo Zalo cho khách hàng [${orderData?.customer_name || 'Khách'}] (Mã đơn: ${orderData?.order_code}): Chưa có hội thoại Zalo của khách hàng.`;
          console.warn(`   ⚠️ [OcmsWorker] Xử lý thất bại: ${failMsg}`);
          throw new Error(failMsg);
        }

        console.log(`   📱 [OCMS-Zalo] Nội dung thông báo khách hàng:`);
        console.log(`   ──────────────────────────────────────────────────`);
        console.log(`   ${(notifyJson?.message || '').replace(/\n/g, '\n   ')}`);
        console.log(`   ──────────────────────────────────────────────────`);
        console.log(`   📎 [OCMS-Zalo] Trạng thái gửi PDF: ${notifyJson?.pdf_sent ? 'Đã gửi file PDF thành công' : 'Chưa có file PDF đính kèm'}`);

        return {
          success: true,
          crm_synced: notifyJson?.crm_synced ?? true,
          zalo_sent: notifyJson?.zalo_sent ?? false,
          pdf_sent: notifyJson?.pdf_sent ?? false,
          recipient_phone: orderData?.customer_phone,
          order_code: orderData?.order_code,
          message: notifyJson?.message,
          processed_at: new Date().toISOString(),
        };
      },
      {
        connection: redisConnection,
        concurrency: 5, // Có thể xử lý đồng thời 5 đơn cùng lúc
      }
    );

    this.worker.on('completed', (job: Job) => {
      console.log(`✅ [OcmsWorker] Job #${job.id} đã hoàn thành lưu CRM và gửi Zalo thành công!`);
      const payload = job.data?.payload?.data || {};
      const code = payload.order_code || payload.web_order_code;
      routerLogger.add({
        level: 'SUCCESS',
        service: 'OCMS',
        queue: 'queue_ocms',
        order_id: code,
        message: `Đơn [${code || job.id}] đã ghi nhận CRM và gửi tin nhắn Zalo thành công`,
      });
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      console.error(`❌ [OcmsWorker] Job #${job?.id} xử lý thất bại:`, err.message);
      const payload = job?.data?.payload?.data || {};
      const code = payload.order_code || payload.web_order_code;
      routerLogger.add({
        level: 'WARN',
        service: 'OCMS',
        queue: 'queue_ocms',
        order_id: code,
        message: `Đơn [${code || job?.id}] lỗi xử lý CRM/Zalo: ${err.message}`,
      });
    });

    console.log('✨ [OcmsWorker] Worker OCMS (CRM & Zalo) đã khởi động thành công và đang lắng nghe queue_ocms.');
    return this.worker;
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  isRunning(): boolean {
    return this.worker !== null;
  }
}

export const ocmsWorkerService = new OcmsWorkerService();
