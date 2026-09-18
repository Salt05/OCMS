import { prisma } from '../src/shared/database/prisma-client.js';

async function main() {
  const org = await prisma.organization.findFirst();
  const orgId = org?.id!;

  // 1. Let's find ANY query with count = 13
  // Check products in draft orders where count = 13?
  // Check any product in order_line_histories where count of orders = 13:
  const p13 = await prisma.$queryRaw<any[]>`
    SELECT l.product_name, l.product_sku, l.odoo_product_id, COUNT(DISTINCT l.order_history_id) as cnt
    FROM order_line_histories l
    JOIN order_histories o ON o.id = l.order_history_id
    WHERE o.org_id = ${orgId}
    GROUP BY l.product_name, l.product_sku, l.odoo_product_id
    HAVING COUNT(DISTINCT l.order_history_id) = 13
  `;
  console.log('Products in any order with exactly 13 orders:', p13);

  // 2. What about draft orders? Which products are in draft orders?
  const pDraft = await prisma.$queryRaw<any[]>`
    SELECT l.product_name, l.product_sku, l.odoo_product_id, COUNT(DISTINCT l.order_history_id) as cnt
    FROM order_line_histories l
    JOIN order_histories o ON o.id = l.order_history_id
    WHERE o.org_id = ${orgId} AND o.state = 'draft'
    GROUP BY l.product_name, l.product_sku, l.odoo_product_id
    ORDER BY cnt DESC
  `;
  console.log('Products in draft orders:', pDraft);

  // 3. What about partner/customer with 13 orders?
  const cust13 = await prisma.$queryRaw<any[]>`
    SELECT o.partner_name, COUNT(*) as cnt
    FROM order_histories o
    WHERE o.org_id = ${orgId}
    GROUP BY o.partner_name
    HAVING COUNT(*) = 13
  `;
  console.log('Customers with 13 orders:', cust13);

  // 4. What about in pending AI orders (Tab 2: Đơn cần xác nhận)?
  // How many pending AI orders are there?
  const pendingConversations = await prisma.conversation.count({
    where: {
      orgId,
      currentState: 'CONFIRMATION',
    }
  });
  console.log('Pending AI conversations count:', pendingConversations);

  // 5. Look at the phrase: "tôi lọc loại sản phẩm đơn giá ở đây có tận 51 đơn mà khi xuất chỉ có 13"
  // "loại sản phẩm đơn giá" -> WHAT DOES THIS MEAN?
  // Let's check products in product_cache:
  const allProds = await prisma.productCache.findMany({
    where: { orgId },
    select: { name: true, sku: true, odooId: true, listPrice: true, retailPrice: true, wholesalePrice: true, category: true }
  });
  
  // Is there any product with price (đơn giá) or name containing "đơn giá"?
  for (const p of allProds) {
    if (p.name.toLowerCase().includes('đơn giá') || (p.category && p.category.toLowerCase().includes('đơn giá'))) {
      console.log('Product with đơn giá:', p);
    }
  }

  process.exit(0);
}

main().catch(console.error);
