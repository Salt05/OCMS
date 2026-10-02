import { prisma } from './src/shared/database/prisma-client.js';
import { OrderDomainService } from './src/modules/orders/order-service.js';

async function fixOldDraftOrders() {
  console.log('Bắt đầu đồng bộ bổ sung cho các đơn Báo giá cũ...');
  const orderDomainService = new OrderDomainService();

  // Lấy các đơn hàng có trạng thái draft hoặc sent
  const oldOrders = await prisma.orderHistory.findMany({
    where: {
      state: { in: ['draft', 'sent'] }
    },
    include: {
      lines: true
    }
  });

  console.log(`Tìm thấy ${oldOrders.length} đơn Báo giá (draft/sent) cần kiểm tra.`);

  let processedCount = 0;

  for (const order of oldOrders) {
    // Tìm các line cần reserve
    const linesToReserve = order.lines.map(l => {
      const qtyToReserve = l.quantity - l.qtyDelivered - l.reservedQuantity;
      return {
        id: l.id,
        sku: l.productSku || '',
        quantity: qtyToReserve
      };
    }).filter(l => l.quantity > 0 && l.sku !== '');

    if (linesToReserve.length > 0) {
      console.log(`Processing Order ${order.orderCode}...`);
      await orderDomainService.handleOrderConfirmed(
        order.orgId, 
        order.id, 
        order.orderCode, 
        linesToReserve
      ).catch(e => {
        console.error(`Lỗi khi xử lý đơn ${order.orderCode}:`, e.message);
      });
      processedCount++;
    }
  }

  console.log(`Đã xử lý xong ${processedCount} đơn Báo giá cũ.`);
  await prisma.$disconnect();
}

fixOldDraftOrders().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
