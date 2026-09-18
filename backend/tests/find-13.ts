import { prisma } from '../src/shared/database/prisma-client.js';
import { buildExportWhereClause, getExportCount } from '../src/modules/orders/order-excel-service.js';

async function main() {
  const org = await prisma.organization.findFirst();
  const orgId = org?.id!;

  const draftOrders = await prisma.orderHistory.findMany({
    where: {
      orgId,
      state: 'draft',
      NOT: [
        { orderCode: { startsWith: 'SO-AI-' } },
        { orderCode: { startsWith: 'AI-' } },
        { orderCode: { startsWith: 'ORD-' } },
      ],
    },
    include: {
      customerProfile: true,
      lines: true,
    }
  });

  console.log('Total draft orders:', draftOrders.length); // 51

  // Check which salesperson has 13 orders among draft orders
  const spCounts: Record<string, number> = {};
  for (const o of draftOrders) {
    const sp = o.customerProfile?.salesperson || o.salesperson || 'NONE';
    spCounts[sp] = (spCounts[sp] || 0) + 1;
  }
  console.log('Salesperson counts in draft orders:', spCounts);

  // Check zones count in draft orders
  const zoneCounts: Record<string, number> = {};
  for (const o of draftOrders) {
    const z = o.customerProfile?.zone || o.customerProfile?.city || 'NONE';
    zoneCounts[z] = (zoneCounts[z] || 0) + 1;
  }
  console.log('Zone counts in draft orders:', zoneCounts);

  // Check products in draft orders
  const prodInDraftCounts: Record<string, number> = {};
  for (const o of draftOrders) {
    for (const l of o.lines) {
      prodInDraftCounts[l.productName] = (prodInDraftCounts[l.productName] || 0) + 1;
    }
  }
  console.log('Products in draft orders with count 13:', Object.entries(prodInDraftCounts).filter(([k, v]) => v === 13));

  // Check date ranges in draft orders
  // Let's see dates of draft orders
  const dates = draftOrders.map(o => o.dateOrder.toISOString().split('T')[0]).sort();
  console.log('Draft orders date range: min =', dates[0], ', max =', dates[dates.length - 1]);
  
  // Count by date
  const dateCounts: Record<string, number> = {};
  for (const d of dates) {
    dateCounts[d] = (dateCounts[d] || 0) + 1;
  }
  console.log('Draft orders date counts:', dateCounts);

  // What about "thisMonth" or "30days" or "7days" for draft orders?
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthDrafts = draftOrders.filter(o => o.dateOrder >= thisMonthStart);
  console.log('Draft orders thisMonth count:', thisMonthDrafts.length);

  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d7Drafts = draftOrders.filter(o => o.dateOrder >= d7);
  console.log('Draft orders 7days count:', d7Drafts.length);

  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d30Drafts = draftOrders.filter(o => o.dateOrder >= d30);
  console.log('Draft orders 30days count:', d30Drafts.length);

  process.exit(0);
}

main().catch(console.error);
