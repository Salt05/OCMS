import { inventoryService } from './src/modules/inventory/inventory-service.js';
import { prisma } from './src/shared/database/prisma-client.js';

async function main() {
  const orgs = await prisma.organization.findMany();
  if (orgs.length) {
    const stats = await inventoryService.getDashboardStats(orgs[0].id);
    console.log(JSON.stringify(stats, null, 2));
  }
  await prisma.$disconnect();
}
main();
