import { prisma } from '../shared/database/prisma-client.js';
import { odooSyncService } from '../modules/sync/odoo-sync-service.js';
import { logger } from '../shared/utils/logger.js';

async function main() {
  logger.info('=== BẮT ĐẦU KÉO DỮ LIỆU TỪ ODOO VỀ POSTGRESQL ===');
  
  // 1. Ensure an organization exists
  let org = await prisma.organization.findFirst();
  if (!org) {
    logger.info('Chưa có Organization, tự động tạo mới Default Organization...');
    org = await prisma.organization.create({
      data: {
        name: 'La Pet CRM Org',
      },
    });
  }
  logger.info(`Sử dụng Organization ID: ${org.id} (${org.name})`);

  // 2. Run full sync
  const startTime = Date.now();
  const results = await odooSyncService.runFullSync(org.id);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  logger.info(`=== HOÀN THÀNH KÉO DỮ LIỆU TRONG ${duration}s ===`);

  // 3. Query PostgreSQL tables to verify exact record counts
  const customerCount = await prisma.customerProfile.count({ where: { orgId: org.id } });
  const productCount = await prisma.productCache.count({ where: { orgId: org.id } });
  const orderCount = await prisma.orderHistory.count({ where: { orgId: org.id } });
  const lineCount = await prisma.orderLineHistory.count();
  const syncStates = await prisma.odooSyncState.findMany({ where: { orgId: org.id } });

  console.log('\n--- BÁO CÁO THỐNG KÊ CHI TIẾT TRONG POSTGRESQL ---');
  console.log(`- Tổng số Khách hàng (CustomerProfile): ${customerCount} bản ghi`);
  console.log(`- Tổng số Sản phẩm (ProductCache): ${productCount} bản ghi`);
  console.log(`- Tổng số Đơn hàng (OrderHistory): ${orderCount} bản ghi`);
  console.log(`- Tổng số Dòng chi tiết đơn (OrderLineHistory): ${lineCount} bản ghi`);
  console.log('- Trạng thái các mốc đồng bộ (OdooSyncState):');
  for (const s of syncStates) {
    console.log(`  + [${s.modelName}]: ${s.recordCount} bản ghi, mốc write_date = "${s.lastWriteDate || 'N/A'}", trạng thái = ${s.status}`);
  }
}

main()
  .catch((e) => {
    logger.error('Lỗi khi kéo dữ liệu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
