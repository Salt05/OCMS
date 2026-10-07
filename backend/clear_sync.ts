import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const res = await prisma.odooSyncState.updateMany({
    where: { modelName: 'sale.order' },
    data: { lastWriteDate: null, status: 'idle' }
  });
  console.log('Reset sale.order sync state:', res);
  await prisma.$disconnect();
}

main().catch(console.error);
