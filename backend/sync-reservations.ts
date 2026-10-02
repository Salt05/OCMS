import { prisma } from './src/shared/database/prisma-client.js';

async function syncReservations() {
  console.log('Bắt đầu đồng bộ giao dịch RESERVE cho các đơn hàng...');
  
  // Lấy tất cả OrderLine (đơn tạo nội bộ) có reservedQuantity > 0
  const localLines = await prisma.$queryRaw`
    SELECT ol.sku as "productSku", ol.reserved_quantity as "reservedQuantity", o.org_id as "orgId", o.id as "orderId", o.order_code as "orderCode"
    FROM order_lines ol
    JOIN orders o ON ol.order_id = o.id
    WHERE ol.reserved_quantity > 0 AND ol.sku IS NOT NULL;
  `;

  // Lấy tất cả OrderLineHistory (đơn đã sync từ Odoo) có reservedQuantity > 0
  const historyLines = await prisma.$queryRaw`
    SELECT ol.product_sku as "productSku", ol.reserved_quantity as "reservedQuantity", o.org_id as "orgId", o.id as "orderId", o.order_code as "orderCode"
    FROM order_line_histories ol
    JOIN order_histories o ON ol.order_history_id = o.id
    WHERE ol.reserved_quantity > 0;
  `;

  let createdCount = 0;
  const allLines = [...(localLines as any[]), ...(historyLines as any[])];
  console.log(`Tìm thấy ${allLines.length} order lines có reserved_quantity > 0`);

  for (const line of allLines) {
    if (!line.productSku) continue;
    
    // Tìm inventoryItem
    const items = await prisma.$queryRaw`
      SELECT id, on_hand as "onHand" FROM inventory_items WHERE org_id = ${line.orgId} AND sku = ${line.productSku} LIMIT 1;
    `;
    const item = (items as any[])[0];
    if (!item) continue;

    const qtyDiff = line.reservedQuantity;
    const idempotencyKey = `RESERVE_${line.orderCode}_${line.productSku}_${qtyDiff}_SYNC`;
    
    const existings = await prisma.$queryRaw`
      SELECT id FROM inventory_transactions WHERE idempotency_key = ${idempotencyKey} LIMIT 1;
    `;
    const existing = (existings as any[])[0];
    
    if (!existing) {
      await prisma.$executeRaw`
        INSERT INTO inventory_transactions (
          id, org_id, inventory_item_id, sku, type, channel, quantity, quantity_before, quantity_after,
          reference_type, reference_id, reference_code, reason, idempotency_key
        ) VALUES (
          gen_random_uuid(), ${line.orgId}, ${item.id}, ${line.productSku}, 'RESERVE', 'ODOO', ${-qtyDiff}, ${item.onHand}, ${item.onHand},
          'ORDER', ${line.orderId}, ${line.orderCode}, 'Đặt giữ hàng (Đồng bộ bổ sung)', ${idempotencyKey}
        )
      `;
      createdCount++;
    }
  }

  console.log(`Đã tạo thành công ${createdCount} giao dịch RESERVE cho các đơn báo giá/đơn hàng cũ.`);
  await prisma.$disconnect();
}

syncReservations().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
