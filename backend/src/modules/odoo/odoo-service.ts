/**
 * Odoo JSON-RPC Integration Service.
 * Connects to Odoo ERP to read customer details, orders, and products.
 */
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';

export interface OdooCustomer {
  id: number;
  name: string;
  phone: string;
  mobile: string;
  street: string;
  street2?: string;
  city: string;
  state?: string;
  zone?: string;
  fullAddress: string;
  email: string;
  vat: string;
  salesperson: string;
  paymentTermId?: number | null;
  paymentTermName?: string;
}

class OdooService {
  private uid: number | null = null;
  private authPromise: Promise<number | null> | null = null;

  async authenticate(): Promise<number | null> {
    if (this.uid) return this.uid;
    if (this.authPromise) return this.authPromise;

    this.authPromise = (async () => {
      try {
        const { url, db, user, apiKey } = config.odoo;
        const endpoint = `${url.replace(/\/+$/, '')}/jsonrpc`;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(3000),
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

        const data = (await res.json()) as any;
        if (data.error) {
          logger.error('[odoo] Authentication error:', data.error);
          return null;
        }

        this.uid = typeof data.result === 'number' ? data.result : null;
        if (this.uid) {
          logger.info(`[odoo] Authenticated successfully with UID: ${this.uid}`);
        } else {
          logger.warn('[odoo] Authentication returned false / null UID');
        }
        return this.uid;
      } catch (err: any) {
        logger.error('[odoo] Failed to connect to Odoo server:', err.message);
        return null;
      } finally {
        this.authPromise = null;
      }
    })();

    return this.authPromise;
  }

  async executeKw<T = any>(
    model: string,
    method: string,
    args: any[] = [],
    kwargs: Record<string, any> = {},
  ): Promise<T | null> {
    const uid = await this.authenticate();
    if (!uid) {
      throw new Error('Không thể xác thực với máy chủ Odoo');
    }

    const { url, db, apiKey } = config.odoo;
    const endpoint = `${url.replace(/\/+$/, '')}/jsonrpc`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [db, uid, apiKey, model, method, args, kwargs],
        },
      }),
    });

    const data = (await res.json()) as any;
    if (data.error) {
      logger.error(`[odoo] Error calling ${model}.${method}:`, data.error);
      throw new Error(data.error.data?.message || data.error.message || 'Lỗi từ Odoo API');
    }

    return data.result as T;
  }

  async getCustomerById(partnerId: number | string): Promise<OdooCustomer | null> {
    const numericId = parseInt(String(partnerId).trim(), 10);
    if (isNaN(numericId) || numericId <= 0) {
      return null;
    }

    try {
      const partners = await this.executeKw<any[]>('res.partner', 'search_read', [
        [['id', '=', numericId]],
      ], {
        fields: ['id', 'name', 'phone', 'mobile', 'street', 'street2', 'city', 'state_id', 'country_id', 'email', 'vat', 'user_id', 'property_payment_term_id'],
        context: { lang: 'vi_VN' },
        limit: 1,
      });

      if (!partners || partners.length === 0) {
        return null;
      }

      const p = partners[0];
      const salesperson = Array.isArray(p.user_id) && p.user_id.length > 1 ? String(p.user_id[1]) : '';
      const stateName = Array.isArray(p.state_id) && p.state_id.length > 1 ? String(p.state_id[1]) : '';
      const countryName = Array.isArray(p.country_id) && p.country_id.length > 1 ? String(p.country_id[1]) : '';
      const paymentTermId = Array.isArray(p.property_payment_term_id) && p.property_payment_term_id.length > 0 ? p.property_payment_term_id[0] : null;
      const paymentTermName = Array.isArray(p.property_payment_term_id) && p.property_payment_term_id.length > 1 ? String(p.property_payment_term_id[1]) : '';

      const addrParts = [p.street, p.street2, p.city, stateName, countryName].filter(Boolean).map((s: any) => String(s).trim()).filter(Boolean);
      const fullAddress = addrParts.join(', ');

      return {
        id: p.id,
        name: typeof p.name === 'string' ? p.name : '',
        phone: typeof p.phone === 'string' ? p.phone : (typeof p.mobile === 'string' ? p.mobile : ''),
        mobile: typeof p.mobile === 'string' ? p.mobile : '',
        street: typeof p.street === 'string' ? p.street : '',
        street2: typeof p.street2 === 'string' ? p.street2 : '',
        city: typeof p.city === 'string' ? p.city : '',
        state: stateName,
        zone: stateName || (typeof p.city === 'string' ? p.city : ''),
        fullAddress,
        email: typeof p.email === 'string' ? p.email : '',
        vat: typeof p.vat === 'string' ? p.vat : '',
        salesperson,
        paymentTermId,
        paymentTermName,
      };
    } catch (err: any) {
      logger.error(`[odoo] getCustomerById(${partnerId}) error:`, err.message);
      return null;
    }
  }

  async getEmployeeById(employeeId: number | string): Promise<any | null> {
    const numericId = parseInt(String(employeeId).trim(), 10);
    if (isNaN(numericId) || numericId <= 0) {
      return null;
    }

    try {
      const employees = await this.executeKw<any[]>('hr.employee', 'search_read', [
        [['id', '=', numericId]],
      ], {
        fields: ['id', 'name', 'work_email', 'job_title', 'department_id', 'user_id'],
        context: { lang: 'vi_VN' },
        limit: 1,
      });

      if (!employees || employees.length === 0) {
        return null;
      }
      return employees[0];
    } catch (err: any) {
      logger.error(`[odoo] getEmployeeById(${employeeId}) error:`, err.message);
      return null;
    }
  }

  async searchEmployees(query: string = '', limit: number = 20): Promise<any[]> {
    try {
      const domain: any[] = [];
      if (query) {
        domain.push(['name', 'ilike', query]);
      }
      const employees = await this.executeKw<any[]>('hr.employee', 'search_read', [domain], {
        fields: ['id', 'name', 'work_email', 'job_title', 'department_id', 'user_id'],
        context: { lang: 'vi_VN' },
        limit,
      });
      return employees || [];
    } catch (err: any) {
      logger.error('[odoo] searchEmployees error:', err.message);
      return [];
    }
  }

  async createCustomer(data: {
    is_company: boolean;
    name: string;
    street?: string;
    city?: string;
    phone?: string;
    email?: string;
    [key: string]: any;
  }): Promise<number | null> {
    try {
      const partnerData: any = {
        is_company: data.is_company,
        name: data.name,
      };

      if (data.street) partnerData.street = data.street;
      if (data.city) partnerData.city = data.city;
      if (data.phone) partnerData.phone = data.phone;
      if (data.email) partnerData.email = data.email;
      
      // Handle user_id (salesperson) if provided. If it's a number, it's an ID.
      // If it's a string, we might need to search for the user in Odoo first.
      if (data.salesperson) {
        if (typeof data.salesperson === 'number') {
          partnerData.user_id = data.salesperson;
        } else if (typeof data.salesperson === 'string') {
          const users = await this.executeKw<any[]>('res.users', 'search_read', [
            [['name', 'ilike', data.salesperson.trim()]],
          ], { fields: ['id'], limit: 1 });
          if (users && users.length > 0) {
            partnerData.user_id = users[0].id;
          }
        }
      }

      const newId = await this.executeKw<number>('res.partner', 'create', [[partnerData]]);
      if (!newId) {
        throw new Error('Tạo khách hàng thất bại: Odoo trả về rỗng');
      }
      return newId;
    } catch (err: any) {
      logger.error('[odoo] createCustomer error:', err.message);
      throw err;
    }
  }

  async updateCustomer(partnerId: number, data: {
    user_id?: number;
    [key: string]: any;
  }): Promise<boolean> {
    try {
      const partnerData: any = { ...data };
      
      const success = await this.executeKw<boolean>('res.partner', 'write', [[partnerId], partnerData]);
      return success || false;
    } catch (err: any) {
      logger.error('[odoo] updateCustomer error:', err.message);
      throw err;
    }
  }

  async getAllSellableProducts(): Promise<any[]> {
    try {
      const products = await this.executeKw<any[]>('product.product', 'search_read', [
        [['sale_ok', '=', true], ['active', '=', true]],
      ], {
        fields: ['id', 'name', 'display_name', 'default_code', 'list_price', 'uom_id'],
        context: { lang: 'vi_VN' },
        order: 'default_code asc, name asc',
      });
      if (!products) return [];

      return products.map((p: any) => ({
        id: p.id,
        name: typeof p.name === 'string' ? p.name : '',
        default_code: typeof p.default_code === 'string' ? p.default_code : '',
        display_name: typeof p.display_name === 'string' ? p.display_name : (p.name || ''),
        list_price: typeof p.list_price === 'number' ? p.list_price : 0,
        uom_id: Array.isArray(p.uom_id) && p.uom_id.length > 0 ? p.uom_id[0] : null,
        uom_name: Array.isArray(p.uom_id) && p.uom_id.length > 1 ? String(p.uom_id[1]) : '',
      }));
    } catch (err: any) {
      logger.error('[odoo] getAllSellableProducts error:', err.message);
      return [];
    }
  }

  async searchProducts(query: string = '', limit: number = 20): Promise<any[]> {
    try {
      const domain: any[] = [['sale_ok', '=', true], ['active', '=', true]];
      if (query) {
        domain.push(['name', 'ilike', query]);
      }
      const products = await this.executeKw<any[]>('product.product', 'search_read', [domain], {
        fields: ['id', 'name', 'display_name', 'default_code', 'list_price', 'uom_id'],
        context: { lang: 'vi_VN' },
        limit,
      });
      if (!products) return [];
      return products.map((p: any) => ({
        id: p.id,
        name: typeof p.name === 'string' ? p.name : '',
        default_code: typeof p.default_code === 'string' ? p.default_code : '',
        display_name: typeof p.display_name === 'string' ? p.display_name : (p.name || ''),
        list_price: typeof p.list_price === 'number' ? p.list_price : 0,
        uom_id: Array.isArray(p.uom_id) && p.uom_id.length > 0 ? p.uom_id[0] : null,
        uom_name: Array.isArray(p.uom_id) && p.uom_id.length > 1 ? String(p.uom_id[1]) : '',
      }));
    } catch (err: any) {
      logger.error('[odoo] searchProducts error:', err.message);
      return [];
    }
  }

  async getPaymentTerms(): Promise<any[]> {
    try {
      const terms = await this.executeKw<any[]>('account.payment.term', 'search_read', [
        [['active', '=', true]],
      ], {
        fields: ['id', 'name'],
        context: { lang: 'vi_VN' },
        order: 'id asc',
      });
      return terms || [];
    } catch (err: any) {
      logger.error('[odoo] getPaymentTerms error:', err.message);
      return [];
    }
  }

  async createOrder(data: {
    partner_id: number;
    validity_date?: string;
    payment_term_id?: number;
    pricelist_id?: number;
    user_id?: number;
    note?: string;
    order_line: Array<{
      product_id: number;
      product_uom_qty: number;
      price_unit: number;
      discount?: number;
    }>;
  }): Promise<number | null> {
    try {
      // Build order_line array for Odoo. Format: (0, 0, { values })
      const orderLines = data.order_line.map(line => [0, 0, {
        product_id: line.product_id,
        product_uom_qty: line.product_uom_qty,
        price_unit: line.price_unit,
        discount: line.discount || 0,
      }]);

      const orderData: any = {
        partner_id: data.partner_id,
        order_line: orderLines,
      };

      if (data.validity_date) orderData.validity_date = data.validity_date;
      if (data.payment_term_id) orderData.payment_term_id = data.payment_term_id;
      if (data.pricelist_id) orderData.pricelist_id = data.pricelist_id;
      if (data.user_id) orderData.user_id = data.user_id;
      if (data.note) orderData.note = data.note;

      const orderId = await this.executeKw<number>('sale.order', 'create', [[orderData]]);
      if (!orderId) {
        throw new Error('Tạo đơn hàng thất bại: Odoo trả về rỗng');
      }
      return orderId;
    } catch (err: any) {
      logger.error('[odoo] createOrder error:', err.message);
      throw err;
    }
  }
  
  async getOrder(orderId: number): Promise<any | null> {
    try {
      const orders = await this.executeKw<any[]>('sale.order', 'search_read', [
        [['id', '=', orderId]]
      ], {
        fields: ['id', 'name', 'amount_total', 'state'],
        limit: 1,
      });
      return orders && orders.length > 0 ? orders[0] : null;
    } catch (err: any) {
      logger.error('[odoo] getOrder error:', err.message);
      return null;
    }
  }

  async getZones(): Promise<string[]> {
    try {
      const groups = await this.executeKw<any[]>('res.partner', 'read_group', [
        [], // domain
        ['city'], // fields
        ['city'] // groupby
      ]);
      if (!groups) return [];
      
      const zones = groups
        .map(g => g.city)
        .filter(c => typeof c === 'string' && c.trim() !== '');
        
      return Array.from(new Set(zones)).sort();
    } catch (err: any) {
      logger.error('[odoo] getZones error:', err.message);
      return [];
    }
  }

  async getSalespersons(): Promise<{id: number, name: string}[]> {
    try {
      // Internal users (not portal/public)
      const users = await this.executeKw<any[]>('res.users', 'search_read', [
        [['share', '=', false]]
      ], {
        fields: ['id', 'name']
      });
      return users || [];
    } catch (err: any) {
      logger.error('[odoo] getSalespersons error:', err.message);
      return [];
    }
  }

  async checkProductInventory(odooProductId: number): Promise<{
    odooId: number;
    isInStock: boolean;
    qtyAvailable: number;
    virtualAvailable: number;
    statusText: 'Còn hàng' | 'Hết hàng' | 'Sắp hết';
  } | null> {
    try {
      const products = await this.executeKw<any[]>('product.product', 'read', [
        [odooProductId],
      ], {
        fields: ['id', 'default_code', 'name', 'qty_available', 'virtual_available'],
      });

      if (!products || products.length === 0) {
        return null;
      }

      const p = products[0];
      const qtyAvailable = typeof p.qty_available === 'number' ? p.qty_available : 0;
      const virtualAvailable = typeof p.virtual_available === 'number' ? p.virtual_available : qtyAvailable;

      let statusText: 'Còn hàng' | 'Hết hàng' | 'Sắp hết' = 'Còn hàng';
      if (qtyAvailable <= 0) {
        statusText = 'Hết hàng';
      } else if (qtyAvailable <= 5) {
        statusText = 'Sắp hết';
      }

      return {
        odooId: p.id,
        isInStock: qtyAvailable > 0,
        qtyAvailable,
        virtualAvailable,
        statusText,
      };
    } catch (err: any) {
      logger.error(`[odoo] checkProductInventory error for product ${odooProductId}:`, err.message);
      return null;
    }
  }

  async checkInventoryBySku(sku: string): Promise<{
    sku: string;
    odooId: number;
    isInStock: boolean;
    qtyAvailable: number;
    statusText: 'Còn hàng' | 'Hết hàng' | 'Sắp hết';
  } | null> {
    try {
      const cleanSku = sku.trim();
      const products = await this.executeKw<any[]>('product.product', 'search_read', [
        [['default_code', '=ilike', cleanSku]],
      ], {
        fields: ['id', 'default_code', 'name', 'qty_available', 'virtual_available'],
        limit: 1,
      });

      if (!products || products.length === 0) {
        return null;
      }

      const p = products[0];
      const qtyAvailable = typeof p.qty_available === 'number' ? p.qty_available : 0;
      let statusText: 'Còn hàng' | 'Hết hàng' | 'Sắp hết' = 'Còn hàng';
      if (qtyAvailable <= 0) {
        statusText = 'Hết hàng';
      } else if (qtyAvailable <= 5) {
        statusText = 'Sắp hết';
      }

      return {
        sku: p.default_code || cleanSku,
        odooId: p.id,
        isInStock: qtyAvailable > 0,
        qtyAvailable,
        statusText,
      };
    } catch (err: any) {
      logger.error(`[odoo] checkInventoryBySku error for SKU ${sku}:`, err.message);
      return null;
    }
  }

  async checkHealth(): Promise<{ ok: boolean; uid?: number | null; error?: string }> {
    try {
      this.uid = null;
      const uid = await this.authenticate();
      return { ok: !!uid, uid };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}

export const odooService = new OdooService();


