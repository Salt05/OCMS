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
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { prisma } from '../../shared/database/prisma-client.js';
import { odooService } from '../odoo/odoo-service.js';
import { directusService } from '../directus/directus-service.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { logger } from '../../shared/utils/logger.js';

const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID || '';

function normalizePhoneNumber(raw?: string | null): string[] {
  if (!raw) return [];
  const digits = raw.replace(/\D/g, '');
  if (!digits) return [];

  const variants = new Set<string>();
  variants.add(digits);

  // If starts with 84, add 0... variant
  if (digits.startsWith('84') && digits.length >= 10) {
    variants.add('0' + digits.slice(2));
  }
  // If starts with 0, add 84... and +84... variant
  if (digits.startsWith('0') && digits.length >= 10) {
    variants.add(digits);
    variants.add('84' + digits.slice(1));
    variants.add('+84' + digits.slice(1));
  }

  variants.add(raw.trim());
  return Array.from(variants);
}

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
    await prisma.odooSyncState.upsert({
      where: { orgId_modelName: { orgId, modelName } },
      create: {
        orgId,
        modelName,
        lastSyncedAt: new Date(),
        lastWriteDate: data.lastWriteDate,
        recordCount: data.recordCount ?? 0,
        status: data.status,
        errorMessage: data.errorMessage ?? null,
      },
      update: {
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
  async cleanAndSyncOrders(orgId?: string): Promise<{ total: number; newCount: number; updatedCount: number }> {
    const oid = orgId || (await this.getOrgId());
    const modelName = 'sale.order';
    logger.info(`[sync] Clean sync triggered for ${modelName} on org ${oid}`);

    // 1. Delete all existing order lines and orders for this org
    await prisma.orderLineHistory.deleteMany({
      where: {
        orderHistory: { orgId: oid },
      },
    });
    await prisma.orderHistory.deleteMany({
      where: { orgId: oid },
    });

    // 2. Reset OdooSyncState
    await prisma.odooSyncState.upsert({
      where: { orgId_modelName: { orgId: oid, modelName } },
      update: {
        lastWriteDate: null,
        recordCount: 0,
        status: 'syncing',
        errorMessage: null,
      },
      create: {
        orgId: oid,
        modelName,
        lastSyncedAt: new Date(),
        lastWriteDate: null,
        recordCount: 0,
        status: 'syncing',
      },
    });

    // 3. Run syncOrders
    return await this.syncOrders(oid);
  }

  async syncOrders(orgId?: string): Promise<{ total: number; newCount: number; updatedCount: number }> {
    const oid = orgId || (await this.getOrgId());
    const modelName = 'sale.order';
    const syncState = await this.getSyncState(oid, modelName);

    await this.updateSyncState(oid, modelName, { status: 'syncing' });

    try {
      const domain: any[] = [];
      if (syncState.lastWriteDate) {
        try {
          // Odoo returns write_date string without milliseconds, but comparison in DB has milliseconds.
          // Adding 1 second prevents querying the same latest modified order repeatedly.
          const lastDate = new Date(syncState.lastWriteDate.includes('T') ? syncState.lastWriteDate : `${syncState.lastWriteDate.replace(' ', 'T')}Z`);
          if (!isNaN(lastDate.getTime())) {
            const nextSec = new Date(lastDate.getTime() + 1000);
            const yyyy = nextSec.getUTCFullYear();
            const mm = String(nextSec.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(nextSec.getUTCDate()).padStart(2, '0');
            const hh = String(nextSec.getUTCHours()).padStart(2, '0');
            const min = String(nextSec.getUTCMinutes()).padStart(2, '0');
            const ss = String(nextSec.getUTCSeconds()).padStart(2, '0');
            const formatted = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
            domain.push(['write_date', '>', formatted]);
          } else {
            domain.push(['write_date', '>', syncState.lastWriteDate]);
          }
        } catch (e) {
          domain.push(['write_date', '>', syncState.lastWriteDate]);
        }
      }

      const orders = await odooService.executeKw<any[]>('sale.order', 'search_read', [domain], {
        fields: [
          'id', 'name', 'partner_id', 'date_order', 'validity_date', 'expected_date',
          'state', 'amount_untaxed', 'amount_tax', 'amount_total', 'amount_undiscounted',
          'margin', 'margin_percent', 'invoice_status', 'delivery_status',
          'warehouse_id', 'pricelist_id', 'user_id', 'note',
          'order_line', 'activity_summary', 'picking_ids', 'write_date',
        ],
        order: 'write_date asc',
      });

      if (!orders || orders.length === 0) {
        await this.updateSyncState(oid, modelName, {
          status: 'idle',
          recordCount: syncState.recordCount,
        });
        logger.debug(`[sync] ${modelName}: No new records to sync.`);
        return { total: 0, newCount: 0, updatedCount: 0 };
      }

      // Pre-fetch customer profile mapping for fast lookup
      const customerProfiles = await prisma.customerProfile.findMany({
        where: { orgId: oid },
        select: { id: true, odooPartnerId: true, salesperson: true, salespersonId: true },
      });
      const customerMap = new Map<number, { id: string; salesperson: string | null; salespersonId: number | null }>();
      for (const cp of customerProfiles) {
        customerMap.set(cp.odooPartnerId, {
          id: cp.id,
          salesperson: cp.salesperson,
          salespersonId: cp.salespersonId,
        });
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
              'id', 'product_id', 'name', 'product_uom_qty', 'product_uom',
              'price_unit', 'discount', 'price_subtotal', 'price_total',
              'qty_delivered', 'qty_invoiced', 'display_type',
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
      let newCount = 0;
      let updatedCount = 0;
      let latestWriteDate = syncState.lastWriteDate || '';

      for (const order of orders) {
        const partnerId = Array.isArray(order.partner_id) ? order.partner_id[0] : order.partner_id;
        const partnerName = Array.isArray(order.partner_id) && order.partner_id.length > 1
          ? String(order.partner_id[1]) : '';
        const salesperson = Array.isArray(order.user_id) && order.user_id.length > 1
          ? String(order.user_id[1]) : '';
        const salespersonId = Array.isArray(order.user_id) && order.user_id.length > 0
          ? order.user_id[0] : null;

        const warehouseName = Array.isArray(order.warehouse_id) && order.warehouse_id.length > 1
          ? String(order.warehouse_id[1]) : null;
        const pricelistName = Array.isArray(order.pricelist_id) && order.pricelist_id.length > 1
          ? String(order.pricelist_id[1]) : null;

        const cpInfo = customerMap.get(partnerId);
        const customerProfileId = cpInfo?.id || null;
        // Ưu tiên hiển thị nhân viên sale hiện tại của khách hàng
        const effectiveSalesperson = cpInfo?.salesperson?.trim() || salesperson;
        const effectiveSalespersonId = cpInfo?.salespersonId || salespersonId;

        const orderData = {
          orderCode: order.name || `ODOO-${order.id}`,
          odooPartnerId: partnerId,
          partnerName,
          customerProfileId,
          dateOrder: new Date(order.date_order),
          state: order.state || 'draft',
          amountUntaxed: parseFloat(order.amount_untaxed) || 0,
          amountTax: parseFloat(order.amount_tax) || 0,
          amountTotal: parseFloat(order.amount_total) || 0,
          amountUndiscounted: parseFloat(order.amount_undiscounted) || parseFloat(order.amount_untaxed) || 0,
          margin: parseFloat(order.margin) || 0,
          marginPercent: parseFloat(order.margin_percent) || 0,
          invoiceStatus: order.invoice_status || null,
          deliveryStatus: typeof order.delivery_status === 'string' ? order.delivery_status : null,
          warehouseName,
          pricelistName,
          salesperson: effectiveSalesperson,
          salespersonId: effectiveSalespersonId,
          expectedDate: order.expected_date ? new Date(order.expected_date) : null,
          validityDate: order.validity_date ? new Date(order.validity_date) : null,
          activitySummary: typeof order.activity_summary === 'string' ? order.activity_summary : null,
          pickingIds: Array.isArray(order.picking_ids) ? order.picking_ids : null,
          note: typeof order.note === 'string' ? order.note : null,
        };

        const existing = await prisma.orderHistory.findUnique({
          where: { orgId_odooOrderId: { orgId: oid, odooOrderId: order.id } },
          select: { id: true },
        });

        if (existing) {
          updatedCount++;
        } else {
          newCount++;
        }

        const orderHistory = await prisma.orderHistory.upsert({
          where: { orgId_odooOrderId: { orgId: oid, odooOrderId: order.id } },
          update: orderData,
          create: {
            orgId: oid,
            odooOrderId: order.id,
            ...orderData,
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

      logger.info(`[sync] ${modelName}: Synced ${upsertCount} orders (New: ${newCount}, Updated: ${updatedCount}).`);
      return { total: upsertCount, newCount, updatedCount };
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
      // 1. Separate valid product lines from note / section lines
      const validLines = lines.filter(line => {
        if (line.display_type === 'line_note' || line.display_type === 'line_section') return false;
        const hasProductId = Array.isArray(line.product_id) ? line.product_id.length > 0 : !!line.product_id;
        const qty = parseFloat(line.product_uom_qty) || 0;
        const price = parseFloat(line.price_unit) || 0;
        if (!hasProductId && qty === 0 && price === 0) return false;
        return true;
      });

      // 2. Extract line notes and append to Order note if applicable
      const noteLines = lines.filter(line => line.display_type === 'line_note' || (!line.product_id && typeof line.name === 'string' && line.name.trim()));
      if (noteLines.length > 0) {
        const noteTexts = noteLines.map(l => String(l.name).trim()).filter(Boolean);
        if (noteTexts.length > 0) {
          const order = await prisma.orderHistory.findUnique({
            where: { id: orderHistoryId },
            select: { note: true },
          });
          const currentNote = order?.note || '';
          const missingNotes = noteTexts.filter(nt => !currentNote.includes(nt));
          if (missingNotes.length > 0) {
            const updatedNote = currentNote ? `${currentNote}\n${missingNotes.join('\n')}` : missingNotes.join('\n');
            await prisma.orderHistory.update({
              where: { id: orderHistoryId },
              data: { note: updatedNote },
            });
          }
        }
      }

      // 3. Remove obsolete, deleted, or temporary local dummy lines (e.g. odooLineId: 1, 2)
      const validOdooLineIds = validLines.map((l: any) => l.id).filter(Boolean);
      await prisma.orderLineHistory.deleteMany({
        where: {
          orderHistoryId,
          odooLineId: { notIn: validOdooLineIds },
        },
      });

      // 4. Upsert valid product lines
      for (const line of validLines) {
        const productName = Array.isArray(line.product_id) && line.product_id.length > 1
          ? String(line.product_id[1]) : (typeof line.name === 'string' ? line.name : '');
        const odooProductId = Array.isArray(line.product_id) && line.product_id.length > 0
          ? line.product_id[0] : null;

        const uomName = Array.isArray(line.product_uom) && line.product_uom.length > 1
          ? String(line.product_uom[1]) : (typeof line.product_uom === 'string' ? line.product_uom : null);

        const skuMatch = productName.match(/^\[([^\]]+)\]/);
        const productSku = skuMatch ? skuMatch[1] : null;

        const lineData = {
          productName,
          productSku,
          odooProductId,
          uomName,
          quantity: parseFloat(line.product_uom_qty) || 0,
          priceUnit: parseFloat(line.price_unit) || 0,
          discount: parseFloat(line.discount) || 0,
          priceSubtotal: parseFloat(line.price_subtotal) || 0,
          priceTotal: parseFloat(line.price_total) || parseFloat(line.price_subtotal) || 0,
          qtyDelivered: parseFloat(line.qty_delivered) || 0,
          qtyInvoiced: parseFloat(line.qty_invoiced) || 0,
        };

        await prisma.orderLineHistory.upsert({
          where: {
            orderHistoryId_odooLineId: { orderHistoryId, odooLineId: line.id },
          },
          update: lineData,
          create: {
            orderHistoryId,
            odooLineId: line.id,
            ...lineData,
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

  /**
   * Automatically sends quotation/order PDF to customer via Zalo when order is confirmed.
   */
  async onOrderConfirmed(
    orgId: string,
    odooOrderId: number,
    orderCode: string,
    odooPartnerId: number,
    partnerName?: string,
  ): Promise<void> {
    try {
      logger.info(`[sync] Order ${orderCode} confirmed → sending PDF via Zalo (odooOrderId: ${odooOrderId}, partnerId: ${odooPartnerId})`);

      // 1. Query CustomerProfile to get phone / mobile
      const profile = await prisma.customerProfile.findUnique({
        where: { orgId_odooPartnerId: { orgId, odooPartnerId } },
      });

      const rawPhones = [profile?.phone, profile?.mobile].filter(Boolean) as string[];
      const phoneVariants = rawPhones.flatMap(p => normalizePhoneNumber(p));

      if (phoneVariants.length === 0) {
        logger.warn(`[sync] Order ${orderCode}: No phone number found for partner ${odooPartnerId} (${profile?.name || partnerName || 'Unknown'}). Skipping PDF send.`);
        return;
      }

      // 2. Query Contact matching phone numbers
      const contacts = await prisma.contact.findMany({
        where: {
          orgId,
          OR: phoneVariants.map(p => ({ phone: { contains: p } })),
        },
        include: {
          conversations: {
            include: { zaloAccount: true },
            orderBy: { lastMessageAt: 'desc' },
          },
        },
      });

      let matchedConversation: any = null;
      let matchedContact: any = null;

      for (const contact of contacts) {
        if (contact.conversations && contact.conversations.length > 0) {
          const conv = contact.conversations.find((c: any) => c.externalThreadId && c.zaloAccount?.status === 'connected') || contact.conversations[0];
          if (conv && conv.externalThreadId) {
            matchedConversation = conv;
            matchedContact = contact;
            break;
          }
        }
      }

      if (!matchedConversation) {
        logger.warn(`[sync] Order ${orderCode}: No matching Zalo conversation found for customer ${partnerName || profile?.name || odooPartnerId} (Phones: ${rawPhones.join(', ')}).`);
        return;
      }

      const instance = zaloPool.getInstance(matchedConversation.zaloAccountId);
      if (!instance || !instance.api) {
        logger.warn(`[sync] Order ${orderCode}: Zalo account ${matchedConversation.zaloAccountId} is not connected. Cannot send PDF.`);
        return;
      }

      // 3. Download PDF report from Odoo
      logger.info(`[sync] Fetching PDF report from Odoo for order ${orderCode} (ID: ${odooOrderId})...`);
      const reportPdf = await odooService.getOrderReportPdf(odooOrderId);
      if (!reportPdf || !reportPdf.buffer || reportPdf.buffer.length === 0) {
        logger.error(`[sync] Order ${orderCode}: Failed to retrieve PDF from Odoo.`);
        return;
      }

      // 4. Save to temporary file
      const safeOrderCode = orderCode.replace(/[^a-zA-Z0-9_-]/g, '_');
      const tempDir = path.join(os.tmpdir(), 'ocms-pdf');
      await fs.promises.mkdir(tempDir, { recursive: true });
      const tempFilePath = path.join(tempDir, `${safeOrderCode}.pdf`);
      await fs.promises.writeFile(tempFilePath, reportPdf.buffer);

      const customerDisplayName = partnerName || matchedContact?.fullName || profile?.name || 'Quý khách';
      const textMessage = `Cảm ơn Quý khách ${customerDisplayName} đã đặt hàng tại LA PET!\nChúng tôi xin gửi bản báo giá chi tiết cho đơn hàng ${orderCode} kèm theo đây.\nNếu cần hỗ trợ thêm, vui lòng nhắn tin cho chúng tôi.\nTrân trọng cảm ơn!`;

      const threadId = matchedConversation.externalThreadId;
      const threadType = matchedConversation.threadType === 'group' ? 1 : 0;

      try {
        // 5. Send greeting text message via Zalo
        await instance.api.sendMessage(
          { msg: textMessage },
          threadId,
          threadType,
        );

        // Send PDF attachment via Zalo
        await instance.api.sendMessage(
          {
            msg: '',
            attachments: [tempFilePath],
          },
          threadId,
          threadType,
        );

        logger.info(`[sync] Order ${orderCode} confirmed → PDF sent successfully via Zalo to ${customerDisplayName} (${threadId})`);

        // Update lastMessageAt on conversation
        await prisma.conversation.update({
          where: { id: matchedConversation.id },
          data: {
            lastMessageAt: new Date(),
            isReplied: true,
          },
        });

        // 6. Update pdfSentAt in DB to prevent re-sending
        await prisma.orderHistory.update({
          where: { orgId_odooOrderId: { orgId, odooOrderId } },
          data: { pdfSentAt: new Date() },
        });

      } finally {
        await fs.promises.rm(tempFilePath, { force: true }).catch(() => {});
      }
    } catch (err: any) {
      logger.error(`[sync] onOrderConfirmed error for order ${orderCode}:`, err);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SYNC: Products (Directus + Odoo unified with Directus priority)
  // ──────────────────────────────────────────────────────────────────────────
  async syncProducts(orgId?: string): Promise<{
    createdCount: number;
    updatedCount: number;
    totalProcessed: number;
    message: string;
  }> {
    const oid = orgId || (await this.getOrgId());
    const modelName = 'product.product';

    await this.updateSyncState(oid, modelName, { status: 'syncing' });

    try {
      // 1. Fetch fresh products from Directus (force = true)
      let directusProducts: any[] = [];
      try {
        directusProducts = await directusService.getProducts(true);
        if (directusProducts && directusProducts.length > 0) {
          directusService.saveDiskCache(directusProducts).catch(() => {});
        }
      } catch (e: any) {
        logger.warn('[sync] Directus products fetch error, fallback to disk cache:', e.message);
        directusProducts = directusService.loadDiskCache();
      }

      // 2. Fetch products from Odoo
      let odooProducts: any[] = [];
      try {
        const domain: any[] = [['sale_ok', '=', true], ['active', '=', true]];
        odooProducts = await odooService.executeKw<any[]>('product.product', 'search_read', [domain], {
          fields: ['id', 'name', 'display_name', 'default_code', 'list_price', 'uom_id', 'active', 'write_date'],
          context: { lang: 'vi_VN' },
          order: 'write_date asc',
        }) || [];
      } catch (e: any) {
        logger.warn('[sync] Odoo products fetch failed, continuing with Directus products:', e.message);
      }

      // 3. Build lookup maps for Directus products (by odoo_id and by SKU)
      const directusByOdooId = new Map<number, any>();
      const directusBySku = new Map<string, any>();

      for (const dp of directusProducts) {
        const numId = Number(dp.odoo_id || dp.id);
        if (numId) directusByOdooId.set(numId, dp);
        const skuKey = (dp.sku || dp.default_code || '').trim().toLowerCase();
        if (skuKey) directusBySku.set(skuKey, dp);
      }

      const processedDirectus = new Set<any>();
      const unifiedList: any[] = [];

      // A. Process Odoo products (merge with Directus when duplicate, PRIORITIZING Directus)
      for (const op of odooProducts) {
        const opSku = (op.default_code || '').trim().toLowerCase();
        const dp = (op.id ? directusByOdooId.get(op.id) : null) || (opSku ? directusBySku.get(opSku) : null);

        if (dp) {
          processedDirectus.add(dp);
          // Prioritize Directus data
          const sku = dp.sku || dp.default_code || op.default_code || '';
          const name = dp.name || op.name || '';
          const uomName = dp.uom_name || (Array.isArray(op.uom_id) && op.uom_id.length > 1 ? String(op.uom_id[1]) : 'Gói');
          const wholesalePrice = Number(dp.wholesale_price || dp.list_price || op.list_price || 0);
          const listPrice = Number(dp.list_price || dp.wholesale_price || op.list_price || 0);
          const retailPrice = Number(dp.retail_price || 0);

          unifiedList.push({
            odooId: op.id,
            sku,
            name,
            displayName: dp.display_name || (sku ? `[${sku}] ${name}` : (op.display_name || name)),
            listPrice: listPrice > 0 ? listPrice : wholesalePrice,
            wholesalePrice,
            retailPrice,
            uomName,
            weight: dp.weight || null,
            specification: dp.specification || null,
            imageUrl: dp.image_url || null,
            description: dp.description || null,
            ingredients: dp.ingredients || null,
            target: dp.target || null,
            preservation: dp.preservation || null,
            productGroupName: dp.product_group_name || null,
            isActive: op.active !== false,
          });
        } else {
          // Odoo only product
          const sku = op.default_code || '';
          const name = op.name || '';
          const uomName = Array.isArray(op.uom_id) && op.uom_id.length > 1 ? String(op.uom_id[1]) : 'Gói';
          const listPrice = Number(op.list_price || 0);

          unifiedList.push({
            odooId: op.id,
            sku,
            name,
            displayName: op.display_name || (sku ? `[${sku}] ${name}` : name),
            listPrice,
            wholesalePrice: listPrice,
            retailPrice: 0,
            uomName,
            weight: null,
            specification: null,
            imageUrl: null,
            description: null,
            ingredients: null,
            target: null,
            preservation: null,
            productGroupName: null,
            isActive: op.active !== false,
          });
        }
      }

      // B. Process remaining Directus products not matched with any Odoo product
      for (const dp of directusProducts) {
        if (processedDirectus.has(dp)) continue;

        const odooId = Number(dp.odoo_id || dp.id);
        const sku = dp.sku || dp.default_code || '';
        const name = dp.name || '';
        const wholesalePrice = Number(dp.wholesale_price || dp.list_price || 0);
        const listPrice = Number(dp.list_price || dp.wholesale_price || 0);
        const retailPrice = Number(dp.retail_price || 0);

        unifiedList.push({
          odooId,
          sku,
          name,
          displayName: dp.display_name || (sku ? `[${sku}] ${name}` : name),
          listPrice: listPrice > 0 ? listPrice : wholesalePrice,
          wholesalePrice,
          retailPrice,
          uomName: dp.uom_name || 'Gói',
          weight: dp.weight || null,
          specification: dp.specification || null,
          imageUrl: dp.image_url || null,
          description: dp.description || null,
          ingredients: dp.ingredients || null,
          target: dp.target || null,
          preservation: dp.preservation || null,
          productGroupName: dp.product_group_name || null,
          isActive: true,
        });
      }

      // 4. Fetch existing database records in ProductCache
      const existingRows = await prisma.productCache.findMany({
        where: { orgId: oid },
      });
      const existingByOdooId = new Map<number, any>();
      const existingBySku = new Map<string, any>();
      for (const row of existingRows) {
        existingByOdooId.set(row.odooId, row);
        if (row.sku) existingBySku.set(row.sku.trim().toLowerCase(), row);
      }

      let createdCount = 0;
      let updatedCount = 0;

      for (const item of unifiedList) {
        const itemSkuKey = (item.sku || '').trim().toLowerCase();
        const existing = existingByOdooId.get(item.odooId) || (itemSkuKey ? existingBySku.get(itemSkuKey) : null);

        if (!existing) {
          const conflict = await prisma.productCache.findUnique({
            where: { orgId_odooId: { orgId: oid, odooId: item.odooId } },
          });

          if (!conflict) {
            await prisma.productCache.create({
              data: {
                orgId: oid,
                odooId: item.odooId,
                sku: item.sku || null,
                name: item.name,
                displayName: item.displayName || null,
                listPrice: item.listPrice,
                wholesalePrice: item.wholesalePrice,
                retailPrice: item.retailPrice,
                uomName: item.uomName || null,
                weight: item.weight || null,
                specification: item.specification || null,
                imageUrl: item.imageUrl || null,
                description: item.description || null,
                ingredients: item.ingredients || null,
                target: item.target || null,
                preservation: item.preservation || null,
                category: item.productGroupName || null,
                isActive: item.isActive,
              },
            });
            createdCount++;
            existingByOdooId.set(item.odooId, item);
            if (itemSkuKey) existingBySku.set(itemSkuKey, item);
          }
        } else {
          // Check for differences (comparing fields)
          const hasDiff =
            (existing.name || '').trim() !== (item.name || '').trim() ||
            (existing.sku || '').trim() !== (item.sku || '').trim() ||
            (existing.displayName || '').trim() !== (item.displayName || '').trim() ||
            Math.abs((existing.listPrice || 0) - (item.listPrice || 0)) > 0.01 ||
            Math.abs((existing.wholesalePrice || 0) - (item.wholesalePrice || 0)) > 0.01 ||
            Math.abs((existing.retailPrice || 0) - (item.retailPrice || 0)) > 0.01 ||
            (existing.uomName || '').trim() !== (item.uomName || '').trim() ||
            (existing.weight || '').trim() !== (item.weight || '').trim() ||
            (existing.specification || '').trim() !== (item.specification || '').trim() ||
            (existing.imageUrl || '').trim() !== (item.imageUrl || '').trim() ||
            (existing.description || '').trim() !== (item.description || '').trim() ||
            (existing.ingredients || '').trim() !== (item.ingredients || '').trim() ||
            (existing.target || '').trim() !== (item.target || '').trim() ||
            (existing.preservation || '').trim() !== (item.preservation || '').trim() ||
            existing.isActive !== item.isActive;

          if (hasDiff) {
            await prisma.productCache.update({
              where: { id: existing.id },
              data: {
                odooId: item.odooId,
                sku: item.sku || existing.sku,
                name: item.name,
                displayName: item.displayName || existing.displayName,
                listPrice: item.listPrice,
                wholesalePrice: item.wholesalePrice,
                retailPrice: item.retailPrice,
                uomName: item.uomName || existing.uomName,
                weight: item.weight || existing.weight,
                specification: item.specification || existing.specification,
                imageUrl: item.imageUrl || existing.imageUrl,
                description: item.description || existing.description,
                ingredients: item.ingredients || existing.ingredients,
                target: item.target || existing.target,
                preservation: item.preservation || existing.preservation,
                isActive: item.isActive,
              },
            });
            updatedCount++;
          }
        }
      }

      await this.updateSyncState(oid, modelName, {
        status: 'idle',
        recordCount: unifiedList.length,
      });

      const message = createdCount > 0 || updatedCount > 0
        ? `Đồng bộ thành công: ${createdCount} sản phẩm mới, cập nhật ${updatedCount} sản phẩm.`
        : `Đồng bộ hoàn tất: Dữ liệu đã là mới nhất (0 sản phẩm mới, 0 cập nhật).`;

      logger.info(`[sync] ${modelName}: ${message} (Total processed: ${unifiedList.length})`);
      return {
        createdCount,
        updatedCount,
        totalProcessed: unifiedList.length,
        message,
      };
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
      const ordersRes = await this.syncOrders(oid);
      results.orders = ordersRes.total;
      const prodRes = await this.syncProducts(oid);
      results.products = prodRes.totalProcessed;
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
      const ordersRes = await this.syncOrders(oid);
      results.orders = ordersRes.total;
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
