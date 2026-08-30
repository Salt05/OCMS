import { prisma } from '../shared/database/prisma-client.js';
import { odooSyncService } from '../modules/sync/odoo-sync-service.js';
import { logger } from '../shared/utils/logger.js';

async function main() {
  logger.info('=== BẮT ĐẦU LÀM SẠCH VÀ ĐỒNG BỘ ĐƠN HÀNG TỪ ODOO ===');

  const org = await prisma.organization.findFirst();
  if (!org) {
    throw new Error('Không tìm thấy Organization');
  }

  const startTime = Date.now();
  const count = await odooSyncService.cleanAndSyncOrders(org.id);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  const orderCount = await prisma.orderHistory.count({ where: { orgId: org.id } });
  const lineCount = await prisma.orderLineHistory.count();

  logger.info(`=== HOÀN TẤT ĐỒNG BỘ ${count} ĐƠN HÀNG TRONG ${duration}s ===`);
  console.log(`- Tổng số Đơn hàng trong PostgreSQL: ${orderCount}`);
  console.log(`- Tổng số Dòng sản phẩm chi tiết: ${lineCount}`);

  // Inspect 1 sample order
  const sampleOrder = await prisma.orderHistory.findFirst({
    where: { orgId: org.id },
    include: { lines: true },
    orderBy: { amountTotal: 'desc' },
  });

  if (sampleOrder) {
    const o = sampleOrder as any;
    console.log('\nSample Order in DB:');
    console.log({
      orderCode: o.orderCode,
      partnerName: o.partnerName,
      amountTotal: o.amountTotal,
      state: o.state,
      deliveryStatus: o.deliveryStatus,
      warehouseName: o.warehouseName,
      margin: o.margin,
      lineCount: o.lines.length,
      sampleLine: o.lines[0],
    });
  }
}

main()
  .catch((e) => {
    logger.error('Lỗi khi clean sync:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
