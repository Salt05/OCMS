/**
 * RouterClient - Cổng kết nối trung tâm từ OCMS Backend tới Universal Router
 * Đảm bảo mọi hành động Thêm/Sửa/Xóa sang Odoo đều do Router quyết định đích đến (Test hoặc Thật)
 */
import { config } from '../../config/index.js';
import { logger } from '../utils/logger.js';

export interface ActiveOdooConfig {
  id: string;
  name: string;
  url: string;
  db: string;
  user: string;
  apiKey: string;
}

export interface RouterOrderPayload {
  order_code: string;
  source?: string;
  partner_id?: number | null;
  customer_name?: string;
  customer_phone?: string;
  shipping_address?: string;
  note?: string;
  items: Array<{
    sku: string;
    product_name?: string;
    odoo_product_id?: number | null;
    quantity: number;
    price: number;
    discount?: number;
  }>;
  total_amount?: number;
  payment_method?: string;
  metadata?: Record<string, any>;
  validity_date?: string;
  payment_term_id?: number;
  user_id?: number;
  contactId?: string;
  conversationId?: string;
}

export class RouterClient {
  private activeOdooCache: { config: ActiveOdooConfig; expiresAt: number } | null = null;
  private readonly CACHE_TTL_MS = 5000; // 5 giây cache để phản hồi siêu tốc và luôn cập nhật

  private getRouterBaseUrl(): string {
    return (config.routerUrl || 'http://localhost:3001').replace(/\/+$/, '');
  }

  /**
   * Lấy cấu hình Odoo đích đang kích hoạt do Router quyết định
   */
  async getActiveOdooConfig(): Promise<ActiveOdooConfig | null> {
    if (this.activeOdooCache && Date.now() < this.activeOdooCache.expiresAt) {
      return this.activeOdooCache.config;
    }

    try {
      const url = `${this.getRouterBaseUrl()}/api/v1/registry/active-odoo`;
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const json = (await res.json()) as any;
        if (json.success && json.data?.url && json.data?.db) {
          this.activeOdooCache = {
            config: json.data as ActiveOdooConfig,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
          };
          return json.data;
        }
      }
    } catch (err: any) {
      logger.warn(`[RouterClient] Không thể kết nối tới Router (${err.message}). Dùng fallback cấu hình nội bộ.`);
    }

    // Fallback nếu Router tạm thời không phản hồi
    return {
      id: 'fallback_odoo',
      name: 'Odoo ERP (Fallback)',
      url: config.odoo.url,
      db: config.odoo.db,
      user: config.odoo.user,
      apiKey: config.odoo.apiKey,
    };
  }

  /**
   * Đẩy đơn hàng vào Router Queue để xử lý bất đồng bộ (100% giống luồng Store LaPet)
   * Router sẽ đưa vào queue_odoo -> odoo-worker tạo báo giá -> queue_ocms -> ocms-worker gửi Zalo + PDF
   * Phản hồi siêu tốc trong < 30ms
   */
  async submitOrderAsync(payload: RouterOrderPayload): Promise<{
    success: boolean;
    order_code: string;
    tracking_id?: string;
    status: string;
    message?: string;
    error?: string;
  }> {
    const url = `${this.getRouterBaseUrl()}/api/v1/orders/standard`;

    try {
      logger.info(`[RouterClient] ⚡ Đẩy đơn hàng [${payload.order_code}] vào hàng đợi Router (/api/v1/orders/standard)...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(6000),
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        throw new Error(json.error || (json.details ? JSON.stringify(json.details) : 'Router từ chối tiếp nhận đơn'));
      }

      logger.info(`[RouterClient] 🚀 Đơn hàng [${payload.order_code}] đã được Router tiếp nhận vào hàng đợi (tracking: ${json.data?.tracking_id})`);
      return {
        success: true,
        order_code: payload.order_code,
        tracking_id: json.data?.tracking_id,
        status: 'pending',
        message: json.message,
      };
    } catch (err: any) {
      logger.error(`[RouterClient] Lỗi đẩy đơn vào Router queue: ${err.message}`);
      throw err;
    }
  }

  /**
   * Điều phối tạo đơn hàng qua Router (Router toàn quyền quyết định Odoo Test hay Prod)
   */
  async createOrder(payload: RouterOrderPayload): Promise<{
    success: boolean;
    orderId?: number;
    orderCode?: string;
    amount_total?: number;
    salesperson?: string;
    target?: string;
    target_name?: string;
    error?: string;
  }> {
    const url = `${this.getRouterBaseUrl()}/api/v1/router/odoo/create-order`;

    try {
      logger.info(`[RouterClient] 🚀 Gửi lệnh TẠO ĐƠN [${payload.order_code}] sang Universal Router...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(40000),
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Router trả về lỗi khi tạo đơn');
      }

      logger.info(`[RouterClient] ✨ Đã tạo đơn thành công qua Router: ${json.orderCode} (Odoo #${json.orderId}) trên [${json.target_name}]`);
      return json;
    } catch (err: any) {
      logger.error(`[RouterClient] Lỗi tạo đơn qua Router: ${err.message}`);
      throw err;
    }
  }

  /**
   * Điều phối hủy đơn hàng qua Router
   */
  async cancelOrder(payload: { order_code?: string; odoo_order_id?: number; reason?: string }): Promise<{
    success: boolean;
    message?: string;
    target?: string;
    error?: string;
  }> {
    const url = `${this.getRouterBaseUrl()}/api/v1/router/odoo/cancel-order`;

    try {
      logger.info(`[RouterClient] 🚫 Gửi lệnh HỦY ĐƠN [${payload.order_code || payload.odoo_order_id}] sang Universal Router...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Router trả về lỗi khi hủy đơn');
      }

      logger.info(`[RouterClient] ✅ Đã hủy đơn thành công qua Router`);
      return json;
    } catch (err: any) {
      logger.error(`[RouterClient] Lỗi hủy đơn qua Router: ${err.message}`);
      throw err;
    }
  }

  /**
   * Điều phối xác nhận đơn hàng (Báo giá -> Đơn hàng) qua Router
   */
  async confirmOrder(payload: {
    order_code?: string;
    odoo_order_id?: number;
  }): Promise<{
    success: boolean;
    message?: string;
    target?: string;
    target_name?: string;
    error?: string;
  }> {
    const url = `${this.getRouterBaseUrl()}/api/v1/router/odoo/confirm-order`;

    try {
      logger.info(`[RouterClient] 🎯 Gửi lệnh XÁC NHẬN ĐƠN [${payload.order_code || payload.odoo_order_id}] sang Universal Router...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Router trả về lỗi khi xác nhận đơn');
      }

      logger.info(`[RouterClient] ✅ Đã xác nhận đơn thành công qua Router trên [${json.target_name || json.target}]`);
      return json;
    } catch (err: any) {
      logger.error(`[RouterClient] Lỗi xác nhận đơn qua Router: ${err.message}`);
      throw err;
    }
  }


  /**
   * Điều phối tạo khách hàng mới qua Router
   */
  async createCustomer(payload: {
    customer?: any;
    name?: string;
    phone?: string;
    email?: string;
    street?: string;
    contact_id?: string;
  }): Promise<{
    success: boolean;
    customerId?: number;
    name?: string;
    target?: string;
    target_name?: string;
    error?: string;
  }> {
    const url = `${this.getRouterBaseUrl()}/api/v1/router/odoo/create-customer`;

    try {
      logger.info(`[RouterClient] 👤 Gửi lệnh TẠO KHÁCH HÀNG [${payload.name || payload.customer?.name}] sang Universal Router...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Router trả về lỗi khi tạo khách hàng');
      }

      logger.info(`[RouterClient] ✅ Đã tạo khách #${json.customerId} (${json.name}) thành công qua Router trên [${json.target_name}]`);
      return json;
    } catch (err: any) {
      logger.error(`[RouterClient] Lỗi tạo khách hàng qua Router: ${err.message}`);
      throw err;
    }
  }

  /**
   * Điều phối cập nhật khách hàng (hoặc gán Salesperson) qua Router
   */
  async updateCustomer(payload: {
    partner_id: number;
    data: any;
  }): Promise<{
    success: boolean;
    updated?: boolean;
    target?: string;
    target_name?: string;
    error?: string;
  }> {
    const url = `${this.getRouterBaseUrl()}/api/v1/router/odoo/update-customer`;

    try {
      logger.info(`[RouterClient] 📝 Gửi lệnh CẬP NHẬT KHÁCH HÀNG #${payload.partner_id} sang Universal Router...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Router trả về lỗi khi cập nhật khách hàng');
      }

      logger.info(`[RouterClient] ✅ Đã cập nhật khách #${payload.partner_id} thành công qua Router trên [${json.target_name}]`);
      return json;
    } catch (err: any) {
      logger.error(`[RouterClient] Lỗi cập nhật khách hàng qua Router: ${err.message}`);
      throw err;
    }
  }

  /**
   * Điều phối cập nhật đơn hàng (sản phẩm, giá, CK, ghi chú) qua Router
   */
  async updateOrder(payload: {
    odoo_order_id: number;
    order_code?: string;
    note?: string;
    lines?: Array<{
      odooLineId?: number;
      odooProductId?: number;
      quantity: number;
      priceUnit: number;
      discount?: number;
    }>;
    editor_name?: string;
    staff_odoo_uid?: number;
  }): Promise<{
    success: boolean;
    odoo_order_id?: number;
    updated?: boolean;
    target?: string;
    target_name?: string;
    error?: string;
  }> {
    const url = `${this.getRouterBaseUrl()}/api/v1/router/odoo/update-order`;

    try {
      logger.info(`[RouterClient] 📝 Gửi lệnh CẬP NHẬT ĐƠN HÀNG #${payload.odoo_order_id} sang Universal Router...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(35000),
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Router trả về lỗi khi cập nhật đơn hàng');
      }

      logger.info(`[RouterClient] ✅ Đã cập nhật đơn #${payload.odoo_order_id} thành công qua Router trên [${json.target_name}]`);
      return json;
    } catch (err: any) {
      logger.error(`[RouterClient] Lỗi cập nhật đơn hàng qua Router: ${err.message}`);
      throw err;
    }
  }

  /**
   * Điều phối thêm / sửa / xóa Hoạt động (Ghi chú giao việc) qua Router
   */
  async manageActivity(payload: {
    odoo_order_id: number;
    action: 'create' | 'update' | 'delete';
    summary?: string;
    activity_type_id?: number;
    date_deadline?: string;
    user_id?: number;
  }): Promise<{
    success: boolean;
    action: string;
    activitySummary?: string | null;
    target?: string;
    target_name?: string;
    error?: string;
  }> {
    const url = `${this.getRouterBaseUrl()}/api/v1/router/odoo/manage-activity`;

    try {
      logger.info(`[RouterClient] 📌 Gửi lệnh HOẠT ĐỘNG (${payload.action}) cho đơn #${payload.odoo_order_id} sang Universal Router...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as any;
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Router trả về lỗi khi quản lý hoạt động');
      }

      logger.info(`[RouterClient] ✅ Đã thực hiện hoạt động (${payload.action}) cho đơn #${payload.odoo_order_id} thành công qua Router trên [${json.target_name}]`);
      return json;
    } catch (err: any) {
      logger.error(`[RouterClient] Lỗi quản lý hoạt động qua Router: ${err.message}`);
      throw err;
    }
  }
}

export const routerClient = new RouterClient();
