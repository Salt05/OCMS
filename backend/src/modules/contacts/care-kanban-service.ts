/**
 * care-kanban-service.ts — CRM Customer Care Kanban Aggregation Service.
 * Calculates 180-day revenue, growth trend, Pareto tier (80/20),
 * Customer Health Score (RFM + Zalo engagement), and distributes customers
 * into 5 health status columns.
 */

import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export interface CareKanbanCard {
  id: string;
  customerProfileId: string;
  odooPartnerId: number;
  customerId: string;
  name: string;
  phone: string;
  zone: string;
  salesperson: string;
  contactId: string | null;
  conversationId: string | null;
  paretoTier: 'A' | 'B' | 'C';
  healthScore: number;
  revenue180: number;
  growthRate: number;
  revenueShare: number;
  aov: number;
  tenureMonths: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
  lastMessageAt: string | null;
  daysSinceLastMessage: number | null;
  contactUrgency: 'good' | 'warning' | 'danger';
  columnId: 'dormant' | 'extreme_risk' | 'needs_attention' | 'active' | 'high_potential';
}

export interface CareKanbanColumn {
  id: 'dormant' | 'extreme_risk' | 'needs_attention' | 'active' | 'high_potential';
  title: string;
  color: string;
  count: number;
  totalRevenue: number;
  items: CareKanbanCard[];
}

export interface CareKanbanSummary {
  totalRevenue180: number;
  totalCustomers: number;
  repeatPurchaseRate: number;
  averageOrderValue: number;
  customersNeedingRescue: number;
  tierACustomers: number;
}

export interface CareKanbanResponse {
  summary: CareKanbanSummary;
  columns: Record<string, CareKanbanColumn>;
  filterOptions: {
    salespeople: Array<{ name: string; count: number }>;
    zones: Array<{ name: string; count: number }>;
  };
}

export interface CareKanbanFilterQuery {
  search?: string;
  zone?: string;
  salesperson?: string;
  tier?: 'A' | 'B' | 'C';
  refresh?: boolean;
}

interface OrgRawDataCache {
  rows: any[];
  timestamp: number;
}

const RAW_CACHE_TTL_MS = 30 * 1000; // 30 seconds cache for DB queries
const orgRawCache = new Map<string, OrgRawDataCache>();

export class CareKanbanService {
  /**
   * Invalidate raw data cache for an organization (e.g. on new orders/sync)
   */
  clearOrgCache(orgId?: string) {
    if (orgId) {
      orgRawCache.delete(orgId);
    } else {
      orgRawCache.clear();
    }
  }

  /**
   * Main entry to fetch and aggregate customer care kanban data
   */
  async getCareKanbanData(
    orgId: string,
    currentUser: { id: string; role: string; fullName?: string },
    filter: CareKanbanFilterQuery
  ): Promise<CareKanbanResponse> {
    const now = new Date();
    const nowMs = now.getTime();

    // 0. Resolve User Profile to ensure fullName and odooId are present
    const dbUser = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, fullName: true, role: true, odooId: true },
    });

    const userRole = (dbUser?.role || currentUser.role || 'member').toLowerCase();
    const isMember = userRole === 'member';
    const userFullName = (dbUser?.fullName || currentUser.fullName || '').trim();
    const userOdooId = dbUser?.odooId ? parseInt(dbUser.odooId, 10) : NaN;

    // For regular staff (member), force salesperson filter to their own
    if (isMember) {
      filter.salesperson = undefined;
    }

    // 1. Check in-memory raw data cache
    const cachedEntry = orgRawCache.get(orgId);
    let rawRows: any[];

    if (!filter.refresh && cachedEntry && nowMs - cachedEntry.timestamp < RAW_CACHE_TTL_MS) {
      rawRows = cachedEntry.rows;
    } else {
      // Raw aggregate query on PostgreSQL
      rawRows = await prisma.$queryRaw`
      WITH stats_180 AS (
        SELECT 
          odoo_partner_id,
          COUNT(id)::int AS orders_180,
          COALESCE(SUM(amount_total), 0)::float AS rev_180,
          MAX(date_order) AS last_order_180,
          MIN(date_order) AS first_order_180
        FROM order_histories
        WHERE org_id = ${orgId}
          AND date_order >= NOW() - INTERVAL '180 days'
          AND state != 'cancel'
        GROUP BY odoo_partner_id
      ),
      stats_prev AS (
        SELECT 
          odoo_partner_id,
          COALESCE(SUM(amount_total), 0)::float AS rev_prev
        FROM order_histories
        WHERE org_id = ${orgId}
          AND date_order >= NOW() - INTERVAL '360 days'
          AND date_order < NOW() - INTERVAL '180 days'
          AND state != 'cancel'
        GROUP BY odoo_partner_id
      ),
      stats_all AS (
        SELECT 
          odoo_partner_id,
          COUNT(id)::int AS total_orders_all,
          COALESCE(SUM(amount_total), 0)::float AS total_rev_all,
          MIN(date_order) AS first_order_all,
          MAX(date_order) AS last_order_all
        FROM order_histories
        WHERE org_id = ${orgId}
          AND state != 'cancel'
        GROUP BY odoo_partner_id
      ),
      contacts_map AS (
        SELECT DISTINCT ON (cp_key)
          COALESCE(c.customer_id, cp.odoo_partner_id::text) AS cp_key,
          c.id AS contact_id,
          c.assigned_user_id,
          u.full_name AS assigned_user_name,
          c.salesperson AS contact_salesperson,
          cv.id AS conversation_id,
          cv.last_message_at
        FROM customer_profiles cp
        JOIN contacts c ON (
          c.customer_id = cp.odoo_partner_id::text
          OR (c.phone IS NOT NULL AND cp.phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g'), 9) = RIGHT(REGEXP_REPLACE(cp.phone, '[^0-9]', '', 'g'), 9))
        )
        LEFT JOIN users u ON u.id = c.assigned_user_id
        LEFT JOIN conversations cv ON cv.contact_id = c.id
        WHERE cp.org_id = ${orgId}
        ORDER BY cp_key, cv.last_message_at DESC NULLS LAST
      ),
      latest_order_sales AS (
        SELECT DISTINCT ON (odoo_partner_id)
          odoo_partner_id,
          salesperson AS order_salesperson,
          salesperson_id AS order_salesperson_id
        FROM order_histories
        WHERE org_id = ${orgId}
          AND salesperson IS NOT NULL 
          AND TRIM(salesperson) != '' 
          AND state != 'cancel'
        ORDER BY odoo_partner_id, date_order DESC
      )
      SELECT 
        cp.id AS "customerProfileId",
        cp.odoo_partner_id AS "odooPartnerId",
        cp.name,
        COALESCE(cp.phone, cp.mobile, '') AS phone,
        COALESCE(cp.zone, 'Khác') AS zone,
        COALESCE(
          NULLIF(TRIM(cp.salesperson), ''),
          NULLIF(TRIM(cm.assigned_user_name), ''),
          NULLIF(TRIM(cm.contact_salesperson), ''),
          NULLIF(TRIM(los.order_salesperson), ''),
          ''
        ) AS salesperson,
        COALESCE(
          cp.salesperson_id,
          los.order_salesperson_id
        ) AS "salespersonId",
        cp.created_at AS "createdAt",
        COALESCE(s1.orders_180, 0)::int AS "orders180",
        COALESCE(s1.rev_180, 0)::float AS "revenue180",
        s1.last_order_180 AS "lastOrderDate180",
        COALESCE(sp.rev_prev, 0)::float AS "revenuePrev",
        COALESCE(sa.total_orders_all, cp.total_orders, 0)::int AS "totalOrdersAll",
        COALESCE(sa.total_rev_all, cp.total_revenue, 0)::float AS "totalRevenueAll",
        COALESCE(sa.first_order_all, cp.created_at) AS "firstOrderDate",
        COALESCE(sa.last_order_all, cp.last_order_date) AS "lastOrderDateOverall",
        cm.contact_id AS "contactId",
        cm.conversation_id AS "conversationId",
        cm.last_message_at AS "lastMessageAt",
        cm.assigned_user_id AS "assignedUserId"
      FROM customer_profiles cp
      LEFT JOIN stats_180 s1 ON s1.odoo_partner_id = cp.odoo_partner_id
      LEFT JOIN stats_prev sp ON sp.odoo_partner_id = cp.odoo_partner_id
      LEFT JOIN stats_all sa ON sa.odoo_partner_id = cp.odoo_partner_id
      LEFT JOIN contacts_map cm ON cm.cp_key = cp.odoo_partner_id::text
      LEFT JOIN latest_order_sales los ON los.odoo_partner_id = cp.odoo_partner_id
      WHERE cp.org_id = ${orgId}
        AND (cp.total_orders > 0 OR COALESCE(sa.total_orders_all, 0) > 0)
      ORDER BY COALESCE(s1.rev_180, 0) DESC, cp.name ASC;
      `;

      orgRawCache.set(orgId, {
        rows: rawRows,
        timestamp: nowMs,
      });
    }

    // 2. Build Filter Options (from all accessible rows before specific UI filtering)
    // Staff (role == 'member') can ONLY see customers they manage
    const staffAccessibleRows = isMember
      ? rawRows.filter((r) => {
          // 1. Direct assignment in OCMS Contact
          const matchAssign = r.assignedUserId === currentUser.id;

          // 2. Direct match by Odoo User ID
          const rowOdooSaleId = r.salespersonId ? Number(r.salespersonId) : NaN;
          const matchOdooId = !isNaN(userOdooId) && !isNaN(rowOdooSaleId) && rowOdooSaleId === userOdooId;

          // 3. Name match (case-insensitive, trimmed)
          const rowSaleName = (r.salesperson || '').toLowerCase().trim();
          const targetName = userFullName.toLowerCase();
          const matchSaleName = Boolean(
            targetName &&
            rowSaleName &&
            rowSaleName !== 'chưa gán sale' &&
            rowSaleName !== 'chưa phân công' &&
            (rowSaleName === targetName ||
             rowSaleName.includes(targetName) ||
             targetName.includes(rowSaleName))
          );

          return matchAssign || matchOdooId || matchSaleName;
        })
      : rawRows;

    const salespeopleMap = new Map<string, number>();
    const zonesMap = new Map<string, number>();

    for (const r of staffAccessibleRows) {
      const spName = (r.salesperson || '').trim() || 'Chưa gán Sale';
      salespeopleMap.set(spName, (salespeopleMap.get(spName) || 0) + 1);

      const zoneName = (r.zone || '').trim() || 'Khác';
      zonesMap.set(zoneName, (zonesMap.get(zoneName) || 0) + 1);
    }

    const salespeopleOptions = isMember
      ? [
          {
            name: userFullName || 'Khách của tôi',
            count: staffAccessibleRows.length,
          },
        ]
      : Array.from(salespeopleMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);

    const zonesOptions = Array.from(zonesMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // 3. Calculate Global 180d Revenue for Pareto 80/20 Tiering
    const totalRevAll180 = staffAccessibleRows.reduce((sum, r) => sum + (r.revenue180 || 0), 0);

    // Compute Pareto Tier for each customer in the accessible dataset
    let runningCumulativeRev = 0;
    const cardsMap = new Map<string, CareKanbanCard>();

    for (const r of staffAccessibleRows) {
      const rev180 = Math.max(0, r.revenue180 || 0);
      const orders180 = Math.max(0, r.orders180 || 0);
      const revPrev = Math.max(0, r.revenuePrev || 0);

      // % Growth
      let growthRate = 0;
      if (revPrev > 0) {
        growthRate = Math.round(((rev180 - revPrev) / revPrev) * 1000) / 10;
      } else if (rev180 > 0) {
        growthRate = 100.0;
      }

      // % Share of total 180d revenue
      const revenueShare = totalRevAll180 > 0 ? Math.round((rev180 / totalRevAll180) * 1000) / 10 : 0;

      // Cumulative Pareto Tier: A = Top 80%, B = Next 15% (80-95%), C = Bottom 5% or 0 VND
      runningCumulativeRev += rev180;
      const cumulativePct = totalRevAll180 > 0 ? (runningCumulativeRev / totalRevAll180) * 100 : 100;

      let paretoTier: 'A' | 'B' | 'C' = 'C';
      if (rev180 > 0) {
        if (cumulativePct <= 80 || (runningCumulativeRev - rev180) / (totalRevAll180 || 1) < 0.8) {
          paretoTier = 'A';
        } else if (cumulativePct <= 95) {
          paretoTier = 'B';
        } else {
          paretoTier = 'C';
        }
      }

      // AOV (Average Order Value)
      let aov = 0;
      if (orders180 > 0) {
        aov = Math.round(rev180 / orders180);
      } else if (r.totalOrdersAll > 0 && r.totalRevenueAll > 0) {
        aov = Math.round(r.totalRevenueAll / r.totalOrdersAll);
      }

      // Tenure in months
      const firstDate = r.firstOrderDate ? new Date(r.firstOrderDate) : new Date(r.createdAt || now);
      const diffMonths = Math.max(1, Math.round((nowMs - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));

      // Days since last order
      const lastOrderDate = r.lastOrderDate180 || r.lastOrderDateOverall;
      let daysSinceLastOrder: number | null = null;
      if (lastOrderDate) {
        const orderDateObj = new Date(lastOrderDate);
        daysSinceLastOrder = Math.max(0, Math.floor((nowMs - orderDateObj.getTime()) / (1000 * 60 * 60 * 24)));
      }

      // Days since last Zalo message
      let daysSinceLastMessage: number | null = null;
      let contactUrgency: 'good' | 'warning' | 'danger' = 'danger';

      if (r.lastMessageAt) {
        const msgDateObj = new Date(r.lastMessageAt);
        daysSinceLastMessage = Math.max(0, Math.floor((nowMs - msgDateObj.getTime()) / (1000 * 60 * 60 * 24)));
        if (daysSinceLastMessage <= 7) {
          contactUrgency = 'good';
        } else if (daysSinceLastMessage <= 20) {
          contactUrgency = 'warning';
        } else {
          contactUrgency = 'danger';
        }
      } else {
        contactUrgency = 'danger'; // Never messaged on Zalo
      }

      // Customer Health Score (0 - 100)
      // 1. Recency (30 pts)
      let recencyScore = 0;
      if (daysSinceLastOrder !== null) {
        if (daysSinceLastOrder <= 30) recencyScore = 30;
        else if (daysSinceLastOrder <= 60) recencyScore = 22;
        else if (daysSinceLastOrder <= 90) recencyScore = 15;
        else if (daysSinceLastOrder <= 180) recencyScore = 8;
        else recencyScore = 0;
      }

      // 2. Frequency (25 pts)
      let frequencyScore = 0;
      if (orders180 >= 6) frequencyScore = 25;
      else if (orders180 >= 3) frequencyScore = 18;
      else if (orders180 >= 1) frequencyScore = 10;
      else frequencyScore = 0;

      // 3. Growth Trend (25 pts)
      let growthScore = 0;
      if (orders180 > 0) {
        if (growthRate >= 20) growthScore = 25;
        else if (growthRate >= -10) growthScore = 18;
        else if (growthRate >= -40) growthScore = 10;
        else growthScore = 3;
      }

      // 4. Zalo Care / Interaction (20 pts)
      let zaloCareScore = 3;
      if (daysSinceLastMessage !== null) {
        if (daysSinceLastMessage <= 7) zaloCareScore = 20;
        else if (daysSinceLastMessage <= 20) zaloCareScore = 12;
        else zaloCareScore = 5;
      }

      const healthScore = Math.min(100, Math.max(0, recencyScore + frequencyScore + growthScore + zaloCareScore));

      // 5-Column Logic based on customer purchasing lifecycle:
      // Column 1: Dormant (Ngủ đông) -> 0 orders in 180 days (or last order > 180d)
      // Column 5: High Potential (Tiềm năng tăng trưởng) -> active purchase (dOrder <= 75d) AND (growthRate >= 15% OR healthScore >= 75)
      // Column 2: Extreme Risk (Cực kỳ nguy hiểm) -> dOrder > 90d (3-6 months no order) OR growthRate <= -40%
      // Column 3: Needs Attention (Cần theo dõi) -> 60d < dOrder <= 90d OR -40% < growthRate <= -15% OR (dOrder > 30d AND daysSinceLastMessage !== null && daysSinceLastMessage > 20)
      // Column 4: Active (Đang mua) -> Stable regular purchases within 60 days
      let columnId: 'dormant' | 'extreme_risk' | 'needs_attention' | 'active' | 'high_potential';

      const dOrder = daysSinceLastOrder !== null ? daysSinceLastOrder : 999;

      if (orders180 === 0 || dOrder > 180) {
        columnId = 'dormant';
      } else if (dOrder <= 75 && (growthRate >= 15 || healthScore >= 75)) {
        columnId = 'high_potential';
      } else if (dOrder > 90 || growthRate <= -40) {
        columnId = 'extreme_risk';
      } else if (
        (dOrder > 60 && dOrder <= 90) ||
        (growthRate > -40 && growthRate <= -15) ||
        (dOrder > 30 && daysSinceLastMessage !== null && daysSinceLastMessage > 20)
      ) {
        columnId = 'needs_attention';
      } else {
        columnId = 'active';
      }

      const card: CareKanbanCard = {
        id: r.customerProfileId,
        customerProfileId: r.customerProfileId,
        odooPartnerId: r.odooPartnerId,
        customerId: String(r.odooPartnerId),
        name: r.name || 'Khách hàng',
        phone: r.phone || '',
        zone: (r.zone || '').trim() || 'Khác',
        salesperson: (r.salesperson || '').trim() || 'Chưa gán Sale',
        contactId: r.contactId || null,
        conversationId: r.conversationId || null,
        paretoTier,
        healthScore,
        revenue180: rev180,
        growthRate,
        revenueShare,
        aov,
        tenureMonths: diffMonths,
        lastOrderDate: lastOrderDate ? new Date(lastOrderDate).toISOString() : null,
        daysSinceLastOrder,
        lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt).toISOString() : null,
        daysSinceLastMessage,
        contactUrgency,
        columnId,
      };

      cardsMap.set(r.customerProfileId, card);
    }

    // 4. Apply UI Filters (search, zone, salesperson, tier)
    let filteredCards = Array.from(cardsMap.values());

    if (filter.search) {
      const q = filter.search.toLowerCase().trim();
      filteredCards = filteredCards.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.customerId.includes(q) ||
          c.salesperson.toLowerCase().includes(q)
      );
    }

    if (filter.zone && filter.zone !== 'all' && filter.zone !== 'Tất cả') {
      const targetZone = filter.zone.toLowerCase().trim();
      const isOther = targetZone === 'khác' || targetZone === 'other' || targetZone === '';
      if (isOther) {
        filteredCards = filteredCards.filter((c) => {
          const z = (c.zone || '').toLowerCase().trim();
          return !z || z === 'khác' || z === 'other';
        });
      } else {
        filteredCards = filteredCards.filter(
          (c) => (c.zone || '').toLowerCase().trim() === targetZone
        );
      }
    }

    if (filter.salesperson && filter.salesperson !== 'all' && filter.salesperson !== 'Tất cả') {
      const targetSp = filter.salesperson.toLowerCase().trim();
      const isUnassigned =
        targetSp === 'chưa gán sale' ||
        targetSp === 'chưa gán' ||
        targetSp === 'chưa phân công' ||
        targetSp === 'unassigned' ||
        targetSp === 'none' ||
        targetSp === '';

      if (isUnassigned) {
        filteredCards = filteredCards.filter((c) => {
          const s = (c.salesperson || '').toLowerCase().trim();
          return (
            !s ||
            s === 'chưa gán sale' ||
            s === 'chưa gán' ||
            s === 'chưa phân công' ||
            s === 'unassigned'
          );
        });
      } else {
        filteredCards = filteredCards.filter(
          (c) => (c.salesperson || '').toLowerCase().trim() === targetSp
        );
      }
    }

    if (filter.tier && ['A', 'B', 'C'].includes(filter.tier)) {
      filteredCards = filteredCards.filter((c) => c.paretoTier === filter.tier);
    }

    // 5. Build 4 Dashboard KPIs
    const totalFilteredRevenue180 = filteredCards.reduce((sum, c) => sum + c.revenue180, 0);
    const totalFilteredCustomers = filteredCards.length;

    // Repeat purchase rate: customers with >= 2 orders in 180d / customers with >= 1 order in 180d
    const active180Cards = filteredCards.filter((c) => c.revenue180 > 0);
    const repeatCustomersCount = active180Cards.filter((c) => {
      // Find row in staffAccessibleRows to check orders180
      const orig = staffAccessibleRows.find((r) => r.customerProfileId === c.customerProfileId);
      return orig && orig.orders180 >= 2;
    }).length;

    const repeatPurchaseRate =
      active180Cards.length > 0 ? Math.round((repeatCustomersCount / active180Cards.length) * 1000) / 10 : 0;

    // Overall AOV in filter
    const totalOrdersInFilter = filteredCards.reduce((sum, c) => {
      const orig = staffAccessibleRows.find((r) => r.customerProfileId === c.customerProfileId);
      return sum + (orig ? orig.orders180 || 0 : 0);
    }, 0);

    const averageOrderValue =
      totalOrdersInFilter > 0 ? Math.round(totalFilteredRevenue180 / totalOrdersInFilter) : 0;

    const tierACustomers = filteredCards.filter((c) => c.paretoTier === 'A').length;
    const customersNeedingRescue = filteredCards.filter(
      (c) => c.columnId === 'extreme_risk' || c.columnId === 'needs_attention'
    ).length;

    const summary: CareKanbanSummary = {
      totalRevenue180: totalFilteredRevenue180,
      totalCustomers: totalFilteredCustomers,
      repeatPurchaseRate,
      averageOrderValue,
      customersNeedingRescue,
      tierACustomers,
    };

    // 6. Distribute into 5 Kanban Columns
    const columns: Record<string, CareKanbanColumn> = {
      dormant: {
        id: 'dormant',
        title: 'Ngủ đông',
        color: '#64748b', // Slate gray
        count: 0,
        totalRevenue: 0,
        items: [],
      },
      extreme_risk: {
        id: 'extreme_risk',
        title: 'Cực kỳ nguy hiểm',
        color: '#ef4444', // Red
        count: 0,
        totalRevenue: 0,
        items: [],
      },
      needs_attention: {
        id: 'needs_attention',
        title: 'Cần theo dõi',
        color: '#f59e0b', // Amber / Orange
        count: 0,
        totalRevenue: 0,
        items: [],
      },
      active: {
        id: 'active',
        title: 'Đang mua',
        color: '#0ea5e9', // Sky blue
        count: 0,
        totalRevenue: 0,
        items: [],
      },
      high_potential: {
        id: 'high_potential',
        title: 'Tiềm năng tăng trưởng',
        color: '#10b981', // Emerald green
        count: 0,
        totalRevenue: 0,
        items: [],
      },
    };

    for (const card of filteredCards) {
      const col = columns[card.columnId];
      if (col) {
        col.items.push(card);
        col.count += 1;
        col.totalRevenue += card.revenue180;
      }
    }

    // Sort items within each column by revenue180 DESC or healthScore DESC
    for (const colKey of Object.keys(columns)) {
      columns[colKey].items.sort((a, b) => b.revenue180 - a.revenue180 || b.healthScore - a.healthScore);
    }

    logger.debug(
      `[CareKanbanService] Processed ${filteredCards.length}/${rawRows.length} customers. Summary: Rev180=${summary.totalRevenue180}, RepeatRate=${summary.repeatPurchaseRate}%`
    );

    return {
      summary,
      columns,
      filterOptions: {
        salespeople: salespeopleOptions,
        zones: zonesOptions,
      },
    };
  }
}

export const careKanbanService = new CareKanbanService();
