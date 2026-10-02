import { prisma } from '../src/shared/database/prisma-client.js';

async function main() {
  const org = await prisma.organization.findFirst();
  if(!org) {
    console.log('No org');
    return;
  }
  const products = await prisma.productCache.findMany({ where: { isActive: true }});
  let count = 0;
  for (const p of products) {
    if(!p.sku) continue;
    const exist = await prisma.inventoryItem.findUnique({where:{orgId_sku:{orgId:org.id,sku:p.sku}}});
    if(!exist) {
      await prisma.inventoryItem.create({
        data:{
          orgId: org.id,
          sku: p.sku,
          productName: p.name,
          odooProductId: p.odooId,
          unit: p.uomName || 'Cái',
          onHand: 0,
          reserved: 0,
          soldQuantity: p.soldQuantity || 0,
          minStock: 0
        }
      });
      count++;
    }
  }
  console.log('Inserted', count, 'inventory items.');
}

main().finally(() => prisma.$disconnect());
