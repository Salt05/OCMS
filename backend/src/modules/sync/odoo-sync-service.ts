/**
 * Odoo Sync Service.
 * Handles incremental (delta) synchronization of Odoo data into local PostgreSQL.
 * Uses Odoo's `write_date` field to only fetch new or modified records.
 *
 * Synced models:
 *  - res.partner      -> CustomerProfile
 *  - sale.order       -> OrderHistory
 *  - sale.order.line  -> OrderLineHistory
 *  - product.product  -> ProductCache
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { odooService } from '../odoo/odoo-service.js';
import { directusService } from '../directus/directus-service.js';
import { logger } from '../../shared/utils/logger.js';

const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID || '';

class OdooSyncService {
  private isSyncing = false;

  private async getSyncState(orgId: string, modelName: string) {
    let state = await prisma.odooSyncState.findUnique({
      where: { orgId_modelName: { orgId, modelName } },
    });

    if (!state) {
      state = await prisma.odooSyncState.create({
        data: {
          orgId,
          modelName,
          lastSyncedAt: new Date(0),
          status: 'idle',
        },
      });
    }
    return state;
  }

  private async updateSyncState(
    orgId: string,
    modelName: string,
    data: {
      lastWriteDate?: string;
      recordCount?: number;
      status: string;
      errorMessage?: string | null;
    },
  ) {
    await prisma.odooSyncState.update({
      where: { orgId_modelName: { orgId, modelName } },
      data: {
        lastSyncedAt: new Date(),
        lastWriteDate: data.lastWriteDate,
        recordCount: data.recordCount,
        status: data.status,
        errorMessage: data.errorMessage ?? null,
      },
    });
  }

  private async getOrgId(): Promise<string> {
    if (DEFAULT_ORG_ID) return DEFAULT_ORG_ID;
    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!org) throw new Error('[sync] No organization found in database');
    return org.id;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SYNC: Customers (res.partner)
  // ──────────────────────────────────────────────────────────────────────────
  async syncCustomers(orgId?: string): Promise<number> {
    const oid = orgId || (await this.getOrgId());
    const modelName = 'res.partner';
    const syncState = await this.getSyncState(oid, modelName);

    await this.updateSyncState(oid, modelName, { status: 'syncing' });

    try {
      const domain: any[] = [['customer_rank', '>', 0]];
      if (syncState.lastWriteDate) {
        domain.push(['write_date', '>', syncState.lastWriteDate]);
      }

      const partners = await odooService.executeKw<any[]>('res.partner', 'search_read', [domain], {
        fields: [
          'id', 'name', 'phone', 'mobile', 'email',
          'street', 'city', 'state_id', 'country_id',
          'vat', 'user_id', 'property_payment_term_id',
          'active', 'write_date',
        ],
        context: { lang: 'vi_VN' },
        order: 'write_date asc',
      });

      if (!partners || partners.length === 0) {
        await this.updateSyncState(oid, modelName, {
          status: 'idle',
          recordCount: syncState.recordCount,
        });
        logger.debug(`[sync] ${modelName}: No new records to sync.`);
        return 0;
      }

      let upsertCount = 0;
      let latestWriteDate = syncState.lastWriteDate || '';

      for (const p of partners) {
        const salesperson = Array.isArray(p.user_id) && p.user_id.length > 1
          ? String(p.user_id[1]) : '';
        const salespersonId = Array.isArray(p.user_id) && p.user_id.length > 0
          ? p.user_id[0] : null;
        const stateName = Array.isArray(p.state_id) && p.state_id.length > 1
          ? String(p.state_id[1]) : '';
        const countryName = Array.isArray(p.country_id) && p.country_id.length > 1
          ? String(p.country_id[1]) : '';
        const paymentTermName = Array.isArray(p.property_payment_term_id) && p.property_payment_term_id.length > 1
          ? String(p.property_payment_term_id[1]) : '';

        const addrParts = [p.street, p.city, stateName, countryName]
          .filter(Boolean).map((s: any) => String(s).trim()).filter(Boolean);
        const fullAddress = addrParts.join(', ');

        await prisma.customerProfile.upsert({
          where: { orgId_odooPartnerId: { orgId: oid, odooPartnerId: p.id } },
          update: {
            name: typeof p.name === 'string' ? p.name : '',
            phone: typeof p.phone === 'string' ? p.phone : null,
            mobile: typeof p.mobile === 'string' ? p.mobile : null,
            email: typeof p.email === 'string' ? p.email : null,
            street: typeof p.street === 'string' ? p.street : null,
            city: typeof p.city === 'string' ? p.city : null,
            zone: stateName || (typeof p.city === 'string' ? p.city : ''),
            fullAddress,
            vat: typeof p.vat === 'string' ? p.vat : null,
            salesperson,
            salespersonId,
            paymentTermName,
            isActive: p.active !== false,
          },
          create: {
            orgId: oid,
            odooPartnerId: p.id,
            name: typeof p.name === 'string' ? p.name : '',
            phone: typeof p.phone === 'string' ? p.phone : null,
            mobile: typeof p.mobile === 'string' ? p.mobile : null,
            email: typeof p.email === 'string' ? p.email : null,
            street: typeof p.street === 'string' ? p.street : null,
            city: typeof p.city === 'string' ? p.city : null,
            zone: stateName || (typeof p.city === 'string' ? p.city : ''),
            fullAddress,
            vat: typeof p.vat === 'string' ? p.vat : null,
            salesperson,
            salespersonId,
            paymentTermName,
            isActive: p.active !== false,
          },
        });

        if (p.write_date && p.write_date > latestWriteDate) {
          latestWriteDate = p.write_date;
        }
        upsertCount++;
      }

      await this.updateSyncState(oid, modelName, {
        status: 'idle',
        lastWriteDate: latestWriteDate,
        recordCount: (syncState.recordCount || 0) + upsertCount,
      });

      logger.info(`[sync] ${modelName}: Synced ${upsertCount} customers.`);
      return upsertCount;
    } catch (err: any) {
      await this.updateSyncState(oid, modelName, {
        status: 'error',
        errorMessage: err.message,
      });
      logger.error(`[sync] ${modelName} error:`, err.message);
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SYNC: Orders (sale.order + sale.order.line)
  // ──────────────────────────────────────────────────────────────────────────
  async syncOrders(orgId?: string): Promise<number> {
    const oid = orgId || (await this.getOrgId());
    const modelName = 'sale.order';
    const syncState = await this.getSyncState(oid, modelName);

    await this.updateSyncState(oid, modelName, { status: 'syncing' });

    try {
      const domain: any[] = [];
      if (syncState.lastWriteDate) {
        domain.push(['write_date', '>', syncState.lastWriteDate]);
      }

      const orders = await odooService.executeKw<any[]>('sale.order', 'search_read', [domain], {
        fields: [
          'id', 'name', 'partner_id', 'date_order', 'state',
          'amount_untaxed', 'amount_tax', 'amount_total',
          'invoice_status', 'user_id', 'note',
          'order_line', 'write_date',
        ],
        order: 'write_date asc',
      });

      if (!orders || orders.length === 0) {
        await this.updateSyncState(oid, modelName, {
          status: 'idle',
          recordCount: syncState.recordCount,
        });
        logger.debug(`[sync] ${modelName}: No new records to sync.`);
        return 0;
      }

      // Pre-fetch customer profile mapping for fast lookup
      const customerProfiles = await prisma.customerProfile.findMany({
        where: { orgId: oid },
        select: { id: true, odooPartnerId: true },
      });
      const customerMap = new Map<number, string>();
      for (const cp of customerProfiles) {
        customerMap.set(cp.odooPartnerId, cp.id);
      }

      // Batch fetch all order lines from Odoo in chunks of 400
      const allLineIds = orders.flatMap(o => o.order_line || []).filter(Boolean);
      const lineMap = new Map<number, any>();
      if (allLineIds.length > 0) {
        logger.info(`[sync] Batch fetching ${allLineIds.length} order lines from Odoo...`);
        for (let i = 0; i < allLineIds.length; i += 400) {
          const chunk = allLineIds.slice(i, i + 400);
          const lines = await odooService.executeKw<any[]>('sale.order.line', 'search_read', [
            [['id', 'in', chunk]],
          ], {
            fields: [
              'id', 'product_id', 'name', 'product_uom_qty',
              'price_unit', 'discount', 'price_subtotal',
              'qty_delivered', 'qty_invoiced',
            ],
          });
          if (lines) {
            for (const l of lines) {
              lineMap.set(l.id, l);
            }
          }
        }
        logger.info(`[sync] Batch fetched ${lineMap.size} order lines successfully.`);
      }

      let upsertCount = 0;
      let latestWriteDate = syncState.lastWriteDate || '';

      for (const order of orders) {
        const partnerId = Array.isArray(order.partner_id) ? order.partner_id[0] : order.partner_id;
        const partnerName = Array.isArray(order.partner_id) && order.partner_id.length > 1
          ? String(order.partner_id[1]) : '';
        const salesperson = Array.isArray(order.user_id) && order.user_id.length > 1
          ? String(order.user_id[1]) : '';
        const salespersonId = Array.isArray(order.user_id) && order.user_id.length > 0
          ? order.user_id[0] : null;

        const customerProfileId = customerMap.get(partnerId) || null;

        const orderHistory = await prisma.orderHistory.upsert({
          where: { orgId_odooOrderId: { orgId: oid, odooOrderId: order.id } },
          update: {
            orderCode: order.name || `ODOO-${order.id}`,
            odooPartnerId: partnerId,
            partnerName,
            customerProfileId,
            dateOrder: new Date(order.date_order),
            state: order.state || 'draft',
            amountUntaxed: parseFloat(order.amount_untaxed) || 0,
            amountTax: parseFloat(order.amount_tax) || 0,
            amountTotal: parseFloat(order.amount_total) || 0,
            invoiceStatus: order.invoice_status || null,
            salesperson,
            salespersonId,
            note: typeof order.note === 'string' ? order.note : null,
          },
          create: {
            orgId: oid,
            odooOrderId: order.id,
            orderCode: order.name || `ODOO-${order.id}`,
            odooPartnerId: partnerId,
            partnerName,
            customerProfileId,
            dateOrder: new Date(order.date_order),
            state: order.state || 'draft',
            amountUntaxed: parseFloat(order.amount_untaxed) || 0,
            amountTax: parseFloat(order.amount_tax) || 0,
            amountTotal: parseFloat(order.amount_total) || 0,
            invoiceStatus: order.invoice_status || null,
            salesperson,
            salespersonId,
            note: typeof order.note === 'string' ? order.note : null,
          },
        });

        // Save order lines from pre-fetched map
        if (order.order_line && order.order_line.length > 0) {
          const linesToSave = order.order_line.map((lid: number) => lineMap.get(lid)).filter(Boolean);
          await this.saveOrderLines(orderHistory.id, linesToSave);
        }

        if (order.write_date && order.write_date > latestWriteDate) {
          latestWriteDate = order.write_date;
        }
        upsertCount++;
      }

      await this.updateCustomerOrderStats(oid);

      await this.updateSyncState(oid, modelName, {
        status: 'idle',
        lastWriteDate: latestWriteDate,
        recordCount: (syncState.recordCount || 0) + upsertCount,
      });

      logger.info(`[sync] ${modelName}: Synced ${upsertCount} orders.`);
      return upsertCount;
    } catch (err: any) {
      await this.updateSyncState(oid, modelName, {
        status: 'error',
        errorMessage: err.message,
      });
      logger.error(`[sync] ${modelName} error:`, err.message);
      throw err;
    }
  }

  private async saveOrderLines(orderHistoryId: string, lines: any[]): Promise<void> {
    try {
      for (const line of lines) {
        const productName = Array.isArray(line.product_id) && line.product_id.length > 1
          ? String(line.product_id[1]) : (typeof line.name === 'string' ? line.name : '');
        const odooProductId = Array.isArray(line.product_id) && line.product_id.length > 0
          ? line.product_id[0] : null;

        const skuMatch = productName.match(/^\[([^\]]+)\]/);
        const productSku = skuMatch ? skuMatch[1] : null;

        await prisma.orderLineHistory.upsert({
          where: {
            orderHistoryId_odooLineId: { orderHistoryId, odooLineId: line.id },
          },
          update: {
            productName,
            productSku,
            odooProductId,
            quantity: parseFloat(line.product_uom_qty) || 0,
            priceUnit: parseFloat(line.price_unit) || 0,
            discount: parseFloat(line.discount) || 0,
            priceSubtotal: parseFloat(line.price_subtotal) || 0,
            qtyDelivered: parseFloat(line.qty_delivered) || 0,
            qtyInvoiced: parseFloat(line.qty_invoiced) || 0,
          },
          create: {
            orderHistoryId,
            odooLineId: line.id,
            productName,
            productSku,
            odooProductId,
            quantity: parseFloat(line.product_uom_qty) || 0,
            priceUnit: parseFloat(line.price_unit) || 0,
            discount: parseFloat(line.discount) || 0,
            priceSubtotal: parseFloat(line.price_subtotal) || 0,
            qtyDelivered: parseFloat(line.qty_delivered) || 0,
            qtyInvoiced: parseFloat(line.qty_invoiced) || 0,
          },
        });
      }
    } catch (err: any) {
      logger.warn(`[sync] Order lines save error for ${orderHistoryId}:`, err.message);
    }
  }

  private async updateCustomerOrderStats(orgId: string): Promise<void> {
    try {
      await prisma.$executeRaw`
        UPDATE customer_profiles cp SET
          total_orders = sub.order_count,
          total_revenue = sub.revenue,
          last_order_date = sub.last_date
        FROM (
          SELECT
            oh.odoo_partner_id,
            COUNT(*) AS order_count,
            COALESCE(SUM(oh.amount_total), 0) AS revenue,
            MAX(oh.date_order) AS last_date
          FROM order_histories oh
          WHERE oh.org_id = ${orgId}
            AND oh.state IN ('sale', 'done')
          GROUP BY oh.odoo_partner_id
        ) sub
        WHERE cp.org_id = ${orgId}
          AND cp.odoo_partner_id = sub.odoo_partner_id
      `;
    } catch (err: any) {
      logger.warn('[sync] updateCustomerOrderStats error:', err.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SYNC: Products (product.product + Directus enrichment)
  // ──────────────────────────────────────────────────────────────────────────
  async syncProducts(orgId?: string): Promise<number> {
    const oid = orgId || (await this.getOrgId());
    const modelName = 'product.product';
    const syncState = await this.getSyncState(oid, modelName);

    await this.updateSyncState(oid, modelName, { status: 'syncing' });

    try {
      let directusProducts: any[] = [];
      try {
        directusProducts = await directusService.getProducts(true);
      } catch (e: any) {
        logger.warn('[sync] Directus products fetch failed, will use Odoo fallback:', e.message);
      }

      const domain: any[] = [['sale_ok', '=', true], ['active', '=', true]];
      if (syncState.lastWriteDate && directusProducts.length === 0) {
        domain.push(['write_date', '>', syncState.lastWriteDate]);
      }

      const odooProducts = await odooService.executeKw<any[]>('product.product', 'search_read', [domain], {
        fields: ['id', 'name', 'display_name', 'default_code', 'list_price', 'uom_id', 'active', 'write_date'],
        context: { lang: 'vi_VN' },
        order: 'write_date asc',
      });

      const directusMap = new Map<number, any>();
      for (const dp of directusProducts) {
        const odooId = dp.odoo_id || dp.id;
        if (odooId) directusMap.set(odooId, dp);
      }

      const products = odooProducts || [];
      let upsertCount = 0;
      let latestWriteDate = syncState.lastWriteDate || '';

      for (const op of products) {
        const directusData = directusMap.get(op.id);
        const sku = op.default_code || directusData?.sku || '';
        const uomName = Array.isArray(op.uom_id) && op.uom_id.length > 1
          ? String(op.uom_id[1]) : (directusData?.uom_name || '');

        await prisma.productCache.upsert({
          where: { orgId_odooId: { orgId: oid, odooId: op.id } },
          update: {
            sku,
            name: op.name || '',
            displayName: op.display_name || (sku ? `[${sku}] ${op.name}` : op.name),
            listPrice: directusData?.wholesale_price || op.list_price || 0,
            wholesalePrice: directusData?.wholesale_price || op.list_price || 0,
            retailPrice: directusData?.retail_price || 0,
            uomName,
            weight: directusData?.weight || null,
            specification: directusData?.specification || null,
            imageUrl: directusData?.image_url || null,
            description: directusData?.description || null,
            ingredients: directusData?.ingredients || null,
            target: directusData?.target || null,
            preservation: directusData?.preservation || null,
            isActive: op.active !== false,
          },
          create: {
            orgId: oid,
            odooId: op.id,
            sku,
            name: op.name || '',
            displayName: op.display_name || (sku ? `[${sku}] ${op.name}` : op.name),
            listPrice: directusData?.wholesale_price || op.list_price || 0,
            wholesalePrice: directusData?.wholesale_price || op.list_price || 0,
            retailPrice: directusData?.retail_price || 0,
            uomName,
            weight: directusData?.weight || null,
            specification: directusData?.specification || null,
            imageUrl: directusData?.image_url || null,
            description: directusData?.description || null,
            ingredients: directusData?.ingredients || null,
            target: directusData?.target || null,
            preservation: directusData?.preservation || null,
            isActive: op.active !== false,
          },
        });

        if (op.write_date && op.write_date > latestWriteDate) {
          latestWriteDate = op.write_date;
        }
        upsertCount++;
      }

      await this.updateSyncState(oid, modelName, {
        status: 'idle',
        lastWriteDate: latestWriteDate,
        recordCount: upsertCount,
      });

      logger.info(`[sync] ${modelName}: Synced ${upsertCount} products (${directusProducts.length} enriched from Directus).`);
      return upsertCount;
    } catch (err: any) {
      await this.updateSyncState(oid, modelName, {
        status: 'error',
        errorMessage: err.message,
      });
      logger.error(`[sync] ${modelName} error:`, err.message);
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SYNC: Invoices / Account Moves (account.move)
  // ──────────────────────────────────────────────────────────────────────────
  async syncInvoices(orgId?: string): Promise<number> {
    const oid = orgId || (await this.getOrgId());
    const modelName = 'account.move';
    const syncState = await this.getSyncState(oid, modelName);

    await this.updateSyncState(oid, modelName, { status: 'syncing' });

    try {
      const domain: any[] = [['move_type', 'in', ['out_invoice', 'out_refund']]];
      if (syncState.lastWriteDate) {
        domain.push(['write_date', '>', syncState.lastWriteDate]);
      }

      const invoices = await odooService.executeKw<any[]>('account.move', 'search_read', [domain], {
        fields: [
          'id', 'name', 'partner_id', 'invoice_date',
          'amount_total', 'payment_state', 'state', 'write_date',
        ],
        order: 'write_date asc',
      });

      if (!invoices || invoices.length === 0) {
        await this.updateSyncState(oid, modelName, {
          status: 'idle',
          recordCount: syncState.recordCount,
        });
        logger.debug(`[sync] ${modelName}: No new records to sync.`);
        return 0;
      }

      let processedCount = 0;
      let latestWriteDate = syncState.lastWriteDate || '';

      const partnerDebts = new Map<number, { totalDebt: number; paidCount: number; unpaidCount: number }>();

      for (const inv of invoices) {
        const partnerId = Array.isArray(inv.partner_id) ? inv.partner_id[0] : inv.partner_id;

        if (!partnerDebts.has(partnerId)) {
          partnerDebts.set(partnerId, { totalDebt: 0, paidCount: 0, unpaidCount: 0 });
        }
        const entry = partnerDebts.get(partnerId)!;

        if (inv.state === 'posted') {
          if (inv.payment_state === 'paid' || inv.payment_state === 'reversed') {
            entry.paidCount++;
          } else {
            entry.unpaidCount++;
            entry.totalDebt += parseFloat(inv.amount_total) || 0;
          }
        }

        if (inv.write_date && inv.write_date > latestWriteDate) {
          latestWriteDate = inv.write_date;
        }
        processedCount++;
      }

      logger.info(`[sync] ${modelName}: Processed ${processedCount} invoices for ${partnerDebts.size} partners.`);

      await this.updateSyncState(oid, modelName, {
        status: 'idle',
        lastWriteDate: latestWriteDate,
        recordCount: (syncState.recordCount || 0) + processedCount,
      });

      return processedCount;
    } catch (err: any) {
      await this.updateSyncState(oid, modelName, {
        status: 'error',
        errorMessage: err.message,
      });
      logger.error(`[sync] ${modelName} error:`, err.message);
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ORCHESTRATION
  // ──────────────────────────────────────────────────────────────────────────

  async runFullSync(orgId?: string): Promise<Record<string, number>> {
    if (this.isSyncing) {
      logger.warn('[sync] Sync already in progress, skipping...');
      return {};
    }
    this.isSyncing = true;
    const startTime = Date.now();

    try {
      const oid = orgId || (await this.getOrgId());
      logger.info('[sync] ═══ Starting FULL SYNC ═══');

      await prisma.odooSyncState.updateMany({
        where: { orgId: oid },
        data: { lastWriteDate: null, status: 'idle' },
      });

      const results: Record<string, number> = {};

      results.customers = await this.syncCustomers(oid);
      results.orders = await this.syncOrders(oid);
      results.products = await this.syncProducts(oid);
      results.invoices = await this.syncInvoices(oid);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`[sync] ═══ FULL SYNC COMPLETE in ${elapsed}s ═══`, results);
      return results;
    } catch (err: any) {
      logger.error('[sync] Full sync failed:', err.message);
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  async runIncrementalSync(orgId?: string): Promise<Record<string, number>> {
    if (this.isSyncing) {
      logger.debug('[sync] Sync already in progress, skipping incremental...');
      return {};
    }
    this.isSyncing = true;
    const startTime = Date.now();

    try {
      const oid = orgId || (await this.getOrgId());

      const results: Record<string, number> = {};

      results.customers = await this.syncCustomers(oid);
      results.orders = await this.syncOrders(oid);
      results.invoices = await this.syncInvoices(oid);

      const totalChanged = Object.values(results).reduce((a, b) => a + b, 0);
      if (totalChanged > 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`[sync] Incremental sync: ${totalChanged} records updated in ${elapsed}s`, results);
      }

      return results;
    } catch (err: any) {
      logger.error('[sync] Incremental sync failed:', err.message);
      return {};
    } finally {
      this.isSyncing = false;
    }
  }

  async getSyncStatus(orgId?: string) {
    const oid = orgId || (await this.getOrgId());
    const states = await prisma.odooSyncState.findMany({
      where: { orgId: oid },
      orderBy: { modelName: 'asc' },
    });
    return states;
  }
}

export const odooSyncService = new OdooSyncService();
