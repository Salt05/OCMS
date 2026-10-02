import { prisma } from '../src/shared/database/prisma-client.js';

async function syncSoldQuantities() {
  console.log('Starting sync of sold quantities from OrderHistory to Inventory...');
  const orgs = await prisma.organization.findMany();
  
  if (orgs.length === 0) {
    console.log('No organizations found.');
    return;
  }

  // Assuming we only have one org in dev
  const orgId = orgs[0].id;
  
  // Find a valid user to assign as performedByUserId
  const systemUser = await prisma.user.findFirst({
    where: { orgId }
  });
  const systemUserId = systemUser?.id; // If no user exists, it will be undefined, but we assume at least one exists

  if (!systemUserId) {
    console.log('No users found to act as system sync user.');
    return;
  }

  // Find all valid orders
  const orders = await prisma.orderHistory.findMany({
    where: {
      orgId,
      state: { in: ['sale', 'done'] }
    },
    include: {
      lines: true
    }
  });

  console.log(`Found ${orders.length} valid orders.`);

  let newItemsCount = 0;
  let newTransactionsCount = 0;

  for (const order of orders) {
    for (const line of order.lines) {
      if (!line.productSku) continue; // Skip lines without SKU
      
      const sku = line.productSku;
      const qty = line.quantity;
      if (qty <= 0) continue;

      // Ensure InventoryItem exists
      let invItem = await prisma.inventoryItem.findUnique({
        where: { orgId_sku: { orgId, sku } }
      });

      if (!invItem) {
        // Try to get product info from cache
        const productCache = await prisma.productCache.findFirst({
          where: { orgId, sku }
        });

        invItem = await prisma.inventoryItem.create({
          data: {
            orgId,
            sku,
            productName: productCache?.name || line.productName,
            unit: productCache?.uomName || line.uomName || 'Cái',
            onHand: 0, // Assume 0 initially, since we don't know the import
            reserved: 0
          }
        });
        newItemsCount++;
      }

      // Check if transaction already exists to prevent duplicate sync
      const existingTx = await prisma.inventoryTransaction.findFirst({
        where: {
          orgId,
          referenceType: 'ODOO_ORDER',
          referenceId: order.id,
          sku
        }
      });

      if (!existingTx) {
        // Create SALE transaction
        // NOTE: It might make onHand negative, which is fine since we haven't synced import
        await prisma.$transaction(async (tx) => {
          // Re-fetch item to lock/get latest onHand
          const currentItem = await tx.inventoryItem.findUnique({
            where: { id: invItem!.id }
          });
          
          if (!currentItem) return;

          const qtyBefore = currentItem.onHand;
          const qtyAfter = qtyBefore - qty;
          if (qtyAfter < 0) {
            throw new Error(`Không thể đồng bộ đơn ${order.orderCode}: tồn kho của ${sku} không đủ`);
          }

          await tx.inventoryTransaction.create({
            data: {
              orgId,
              inventoryItemId: currentItem.id,
              sku,
              type: 'SALE',
              channel: 'ODOO',
              quantity: -qty,
              quantityBefore: qtyBefore,
              quantityAfter: qtyAfter,
              referenceType: 'ODOO_ORDER',
              referenceId: order.id,
              referenceCode: order.orderCode,
              performedByUserId: systemUserId,
              reason: 'Đồng bộ từ Odoo',
            }
          });

          await tx.inventoryItem.update({
            where: { id: currentItem.id },
            data: { onHand: qtyAfter }
          });
        });
        newTransactionsCount++;
      }
    }
  }

  console.log(`Sync complete!`);
  console.log(`- Created ${newItemsCount} new Inventory Items`);
  console.log(`- Created ${newTransactionsCount} new SALE transactions`);
}

syncSoldQuantities()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
