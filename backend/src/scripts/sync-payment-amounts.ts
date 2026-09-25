import { prisma } from '../shared/database/prisma-client.js';
import { logger } from '../shared/utils/logger.js';

export async function syncPaymentAmounts() {
  logger.info('=== BẮT ĐẦU ĐỒNG BỘ SỐ TIỀN ĐÃ THANH TOÁN (ODOO -> OCMS) ===');

  // 1. Cập nhật các đơn có phiếu thu nội bộ trong OCMS (order_payments) trước
  const paymentAggs = await prisma.orderPayment.groupBy({
    by: ['orderHistoryId'],
    where: { orderHistoryId: { not: null } },
    _sum: { amount: true },
  });

  let customPaymentUpdated = 0;
  for (const p of paymentAggs) {
    if (p.orderHistoryId) {
      await prisma.orderHistory.update({
        where: { id: p.orderHistoryId },
        data: { paidAmount: p._sum.amount || 0 },
      });
      customPaymentUpdated++;
    }
  }
  logger.info(`Đã cập nhật ${customPaymentUpdated} đơn hàng theo phiếu thu nội bộ.`);

  // 2. Cập nhật các đơn có trạng thái hóa đơn là 'Đã xuất hoá đơn hết' (invoice_status = 'invoiced')
  // chưa có phiếu thu riêng -> Đã thanh toán 100% (paidAmount = amountTotal)
  const paidUpdated = await prisma.$executeRawUnsafe(`
    UPDATE order_histories
    SET paid_amount = amount_total
    WHERE invoice_status = 'invoiced'
      AND id NOT IN (
        SELECT DISTINCT order_history_id 
        FROM order_payments 
        WHERE order_history_id IS NOT NULL
      );
  `);
  logger.info(`Đã cập nhật ${paidUpdated} đơn có trạng thái hóa đơn 'Đã xuất hoá đơn hết' (invoiced) sang ĐÃ THANH TOÁN ĐỦ (100%).`);

  // 3. Cập nhật các đơn chưa xuất hoá đơn hết (invoice_status != 'invoiced' hoặc NULL)
  // chưa có phiếu thu riêng -> Chưa thanh toán (paidAmount = 0)
  const unpaidUpdated = await prisma.$executeRawUnsafe(`
    UPDATE order_histories
    SET paid_amount = 0
    WHERE (invoice_status IS NULL OR invoice_status != 'invoiced')
      AND id NOT IN (
        SELECT DISTINCT order_history_id 
        FROM order_payments 
        WHERE order_history_id IS NOT NULL
      );
  `);
  logger.info(`Đã cập nhật ${unpaidUpdated} đơn chưa xuất hoá đơn hết sang CHƯA THANH TOÁN (0 ₫).`);

  // 4. Thống kê tổng hợp sau khi đồng bộ
  const total = await prisma.orderHistory.count();
  const fullPaid = await prisma.orderHistory.count({
    where: {
      amountTotal: { gt: 0 },
      paidAmount: { gt: 0 },
    },
  });
  const zeroOrUnpaid = await prisma.orderHistory.count({
    where: { paidAmount: 0 },
  });

  logger.info('=== THỐNG KÊ SAU KHI ĐỒNG BỘ ===');
  logger.info(`- Tổng số đơn: ${total}`);
  logger.info(`- Số đơn Đã thanh toán (> 0đ): ${fullPaid}`);
  logger.info(`- Số đơn Chưa thanh toán (= 0đ): ${zeroOrUnpaid}`);

  return {
    customPaymentUpdated,
    paidUpdated,
    unpaidUpdated,
    total,
    fullPaid,
    zeroOrUnpaid,
  };
}

if (process.argv[1] && process.argv[1].includes('sync-payment-amounts')) {
  syncPaymentAmounts()
    .then((res) => {
      console.log('Result:', JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error syncing payments:', err);
      process.exit(1);
    });
}
