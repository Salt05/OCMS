/**
 * Helper to format draft order items, applied promotions, free items,
 * and pricing breakdown (before and after promotions) for chatbot responses.
 */

export function formatDraftOrderProductList(draftOrder: any, salutation: string = 'anh/chị'): { itemsListStr: string; unclearListStr: string } {
  const items = draftOrder?.items || [];
  const itemsListStr = items.map((it: any) => `- ${it.sku ? it.sku + ' - ' : ''}${it.name}: ${it.qty || it.quantity || 1} gói`).join('\n');

  const unclearList = draftOrder?.unclearItems || [];
  const unclearListStr = unclearList.length > 0
    ? `\n\nRiêng các dòng sau chưa có mã SKU trong hệ thống, nhờ ${salutation} kiểm tra và xác nhận lại:\n${unclearList.map((u: any) => `- ${u.rawText} (${u.reason})`).join('\n')}`
    : '';

  return { itemsListStr, unclearListStr };
}

export function formatDraftOrderPromotionsAndPricing(draftOrder: any, salutation: string = 'anh/chị'): string {
  if (!draftOrder || (!draftOrder.items?.length && !draftOrder.subtotal)) {
    return '';
  }

  const subtotal = Number(draftOrder.subtotal || 0);
  const discountAmount = Number(draftOrder.discountAmount || 0);
  const amountTotal = draftOrder.amountTotal !== undefined ? Number(draftOrder.amountTotal) : Math.max(0, subtotal - discountAmount);

  const explanations: string[] = draftOrder.explanations || [];
  const appliedPromotions: any[] = draftOrder.appliedPromotions || [];
  const freeItems: any[] = draftOrder.freeItems || [];

  let promoSection = '';
  if (explanations.length > 0) {
    promoSection = `\n\nDạ đơn hàng của ${salutation} đã thỏa mãn các điều kiện ưu đãi sau ạ:\n` +
      explanations.map(e => `- ${e}`).join('\n');
  } else if (appliedPromotions.length > 0) {
    promoSection = `\n\nDạ đơn hàng của ${salutation} đã thỏa mãn các điều kiện ưu đãi sau ạ:\n` +
      appliedPromotions.map(p => `- ${p.name || p.ruleName}: -${Number(p.discountAmount || 0).toLocaleString('vi-VN')} đ`).join('\n');
  }

  if (freeItems.length > 0) {
    const freeLines = freeItems.map(f => `- Tặng kèm ${f.qty || f.quantity || 1} gói ${f.sku ? f.sku + ' - ' : ''}${f.name || f.productName || ''}`).join('\n');
    promoSection += `\nQuà tặng kèm theo chương trình:\n${freeLines}`;
  }

  let priceSection = '';
  if (discountAmount > 0 || promoSection) {
    priceSection = `\n\nThông tin thanh toán:\n- Tổng tiền trước ưu đãi: ${subtotal.toLocaleString('vi-VN')} đ\n- Tiền chiết khấu / giảm giá: -${discountAmount.toLocaleString('vi-VN')} đ\n- Tổng tiền thanh toán sau ưu đãi: ${amountTotal.toLocaleString('vi-VN')} đ`;
  } else if (subtotal > 0) {
    priceSection = `\n\nThông tin thanh toán:\n- Tổng tiền tạm tính: ${subtotal.toLocaleString('vi-VN')} đ`;
  }

  return promoSection + priceSection;
}

export function formatFullOrderDeclaration(
  draftOrder: any,
  salutation: string = 'anh/chị',
  isFromImage: boolean = true
): string {
  const items = draftOrder?.items || [];
  const { itemsListStr, unclearListStr } = formatDraftOrderProductList(draftOrder, salutation);
  const promoAndPriceStr = formatDraftOrderPromotionsAndPricing(draftOrder, salutation);

  const prefix = isFromImage
    ? `Dạ từ ảnh danh sách đơn hàng của ${salutation}, đơn hàng của mình gồm đầy đủ ${items.length} sản phẩm sau đúng không ạ:`
    : `Dạ em đã ghi nhận đầy đủ ${items.length} sản phẩm trong đơn hàng của ${salutation} gồm:`;

  const closing = draftOrder?.paymentTerm
    ? `\n\nDanh sách trên và các ưu đãi đã chính xác chưa ạ? Nhờ ${salutation} kiểm tra lại giúp em nhé ạ!`
    : `\n\nDanh sách trên và các ưu đãi đã chính xác chưa ạ? Nhờ ${salutation} xem qua và cho em biết mình muốn thanh toán ngay hay trong bao lâu nhé ạ!`;

  return `${prefix}\n\n${itemsListStr}${unclearListStr}${promoAndPriceStr}${closing}`;
}
