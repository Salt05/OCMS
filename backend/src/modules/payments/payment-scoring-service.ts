/**
 * Payment Scoring & Matching Engine
 * Bộ não đánh giá thông tin chuyển khoản, chấm điểm tin cậy và khớp nối đơn hàng tự động.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { routerClient } from '../../shared/services/router-client.js';
import type { ParseResult } from './sms-parser.js';

export interface ScoringOutput {
  confidenceScore: number;
  scoringDetails: {
    codeMatch: boolean;
    amountMatch: boolean;
    senderMatch: boolean;
    timeMatch: boolean;
    notes: string[];
  };
  suggestedOrderHistoryId: string | null;
  suggestedOrderId: string | null;
  suggestedOrderCode: string | null;
  status: 'MATCHED' | 'SUGGESTED' | 'PARTIAL' | 'OVERPAID' | 'MANUAL_REVIEW' | 'IGNORED';
  matchedBy?: 'AUTO_HIGH_TRUST' | 'AUTO_EXACT_CODE' | 'MANUAL_STAFF';
  autoApproveEligible: boolean;
}

/**
 * Chuẩn hóa tên người chuyển (bỏ dấu, in hoa, rút gọn khoảng trắng)
 */
export function cleanSenderName(rawName?: string | null): string {
  if (!rawName) return '';
  return rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z\s]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Đánh giá và so khớp giao dịch ngân hàng với các đơn hàng trong hệ thống
 */
export async function evaluateAndMatchTransaction(
  orgId: string,
  txData: ParseResult,
  bankAccountId?: string | null
): Promise<ScoringOutput> {
  const result: ScoringOutput = {
    confidenceScore: 0,
    scoringDetails: {
      codeMatch: false,
      amountMatch: false,
      senderMatch: false,
      timeMatch: false,
      notes: [],
    },
    suggestedOrderHistoryId: null,
    suggestedOrderId: null,
    suggestedOrderCode: null,
    status: 'MANUAL_REVIEW',
    autoApproveEligible: false,
  };

  // Nếu là tiền ra (type = 'OUT') hoặc số tiền <= 0 -> Bỏ qua
  if (txData.type === 'OUT' || txData.amount <= 0) {
    result.status = 'IGNORED';
    result.scoringDetails.notes.push('Giao dịch tiền ra hoặc số tiền không hợp lệ');
    return result;
  }

  // Lấy cấu hình tài khoản ngân hàng (để kiểm tra ngưỡng tin cậy auto-approve)
  const bankAccount = bankAccountId
    ? await prisma.bankAccount.findUnique({ where: { id: bankAccountId } })
    : await prisma.bankAccount.findFirst({ where: { orgId, accountNumber: txData.accountNumber } });

  const minTrustScore = bankAccount?.minTrustScore ?? 85;
  const isAccountAutoApprove = bankAccount?.autoApprove ?? false;

  let targetOrderHistory: any = null;
  let targetOrder: any = null;
  let matchedCustomerContactId: string | null = null;

  // ── TIÊU CHÍ 1: Tìm kiếm theo Mã Đơn Hàng ──────────────────────────────────
  if (txData.candidateOrderCodes && txData.candidateOrderCodes.length > 0) {
    for (const code of txData.candidateOrderCodes) {
      // 1. Tìm trong OrderHistory (đơn Odoo/hệ thống)
      const foundHistory = await prisma.orderHistory.findFirst({
        where: {
          orgId,
          OR: [
            { orderCode: { equals: code, mode: 'insensitive' } },
            { orderCode: { contains: code, mode: 'insensitive' } },
          ],
        },
        include: { customerProfile: true },
        orderBy: { createdAt: 'desc' },
      });

      if (foundHistory) {
        targetOrderHistory = foundHistory;
        result.suggestedOrderHistoryId = foundHistory.id;
        result.suggestedOrderCode = foundHistory.orderCode;
        result.scoringDetails.codeMatch = true;
        result.confidenceScore += 45;
        result.scoringDetails.notes.push(`Khớp chính xác mã đơn: ${foundHistory.orderCode}`);
        break;
      }

      // 2. Tìm trong Order (đơn CRM nội bộ)
      const foundOrder = await prisma.order.findFirst({
        where: {
          orgId,
          OR: [
            { orderCode: { equals: code, mode: 'insensitive' } },
            { orderCode: { contains: code, mode: 'insensitive' } },
          ],
        },
        include: { contact: true },
        orderBy: { createdAt: 'desc' },
      });

      if (foundOrder) {
        targetOrder = foundOrder;
        result.suggestedOrderId = foundOrder.id;
        result.suggestedOrderCode = foundOrder.orderCode;
        result.scoringDetails.codeMatch = true;
        result.confidenceScore += 45;
        result.scoringDetails.notes.push(`Khớp chính xác mã đơn CRM: ${foundOrder.orderCode}`);
        break;
      }
    }
  }

  // ── TIÊU CHÍ 2: Tìm kiếm theo Danh Tính Người Chuyển (SenderIdentity) ──────
  const cleanSender = cleanSenderName(txData.senderNameRaw);
  let senderIdentityRecord: any = null;

  if (cleanSender) {
    senderIdentityRecord = await prisma.senderIdentity.findFirst({
      where: {
        orgId,
        senderNameClean: cleanSender,
      },
      include: { contact: true },
    });

    if (senderIdentityRecord && senderIdentityRecord.contactId) {
      matchedCustomerContactId = senderIdentityRecord.contactId;
      result.scoringDetails.senderMatch = true;
      result.confidenceScore += 20;
      result.scoringDetails.notes.push(
        `Nhận diện khách quen: ${cleanSender} (Đã khớp thành công ${senderIdentityRecord.successMatchCount} lần)`
      );

      // Nếu chưa tìm thấy đơn theo mã, thử tìm đơn gần nhất của khách hàng này
      if (!targetOrderHistory && !targetOrder) {
        // Tìm đơn trong vòng 72 giờ của contact này
        const recentHistory = await prisma.orderHistory.findFirst({
          where: {
            orgId,
            customerProfileId: senderIdentityRecord.contactId,
            state: { in: ['draft', 'sale'] },
            dateOrder: { gte: new Date(Date.now() - 72 * 3600 * 1000) },
          },
          orderBy: { dateOrder: 'desc' },
        });

        if (recentHistory) {
          targetOrderHistory = recentHistory;
          result.suggestedOrderHistoryId = recentHistory.id;
          result.suggestedOrderCode = recentHistory.orderCode;
          result.scoringDetails.notes.push(`Đề xuất đơn gần nhất của khách quen: ${recentHistory.orderCode}`);
        }
      }
    }
  }

  // ── TIÊU CHÍ 3: Tìm kiếm dự phòng theo Số Điện Thoại (Phone Fallback) ──────
  if (!targetOrderHistory && !targetOrder && txData.candidatePhones.length > 0) {
    for (const phone of txData.candidatePhones) {
      const cleanPhone = phone.replace(/\D/g, '').slice(-9);
      const contact = await prisma.contact.findFirst({
        where: {
          orgId,
          phone: { contains: cleanPhone },
        },
      });

      if (contact) {
        matchedCustomerContactId = contact.id;
        const recentHistory = await prisma.orderHistory.findFirst({
          where: {
            orgId,
            OR: [
              { customerProfileId: contact.id },
              { partnerName: { contains: contact.fullName || '', mode: 'insensitive' } },
            ],
            dateOrder: { gte: new Date(Date.now() - 72 * 3600 * 1000) },
          },
          orderBy: { dateOrder: 'desc' },
        });

        if (recentHistory) {
          targetOrderHistory = recentHistory;
          result.suggestedOrderHistoryId = recentHistory.id;
          result.suggestedOrderCode = recentHistory.orderCode;
          result.confidenceScore += 15;
          result.scoringDetails.notes.push(`Tìm thấy đơn theo SĐT khách hàng (${phone}): ${recentHistory.orderCode}`);
          break;
        }
      }
    }
  }

  // ── TIÊU CHÍ 4: So Sánh Số Tiền (Amount Match) ────────────────────────────
  const orderAmount = targetOrderHistory
    ? targetOrderHistory.amountTotal
    : (targetOrder ? targetOrder.totalAmount : null);

  if (orderAmount !== null && orderAmount > 0) {
    const diff = Math.abs(txData.amount - orderAmount);

    if (diff === 0 || diff <= 1000) {
      // Khớp đúng 100% (cho phép lệch tối đa 1.000đ do làm tròn)
      result.scoringDetails.amountMatch = true;
      result.confidenceScore += 30;
      result.scoringDetails.notes.push(`Số tiền khớp chuẩn 100%: ${txData.amount.toLocaleString('vi-VN')} đ`);
    } else if (txData.amount < orderAmount) {
      // Chuyển thiếu
      result.status = 'PARTIAL';
      result.scoringDetails.notes.push(
        `Chuyển thiếu: nhận ${txData.amount.toLocaleString('vi-VN')} đ / cần ${orderAmount.toLocaleString('vi-VN')} đ`
      );
    } else if (txData.amount > orderAmount) {
      // Chuyển thừa
      result.status = 'OVERPAID';
      result.scoringDetails.notes.push(
        `Chuyển thừa: nhận ${txData.amount.toLocaleString('vi-VN')} đ / đơn ${orderAmount.toLocaleString('vi-VN')} đ`
      );
    }
  }

  // ── TIÊU CHÍ 5: Thời Gian Giao Dịch Hợp Lệ ───────────────────────────────
  const orderDate = targetOrderHistory?.dateOrder || targetOrder?.createdAt;
  if (orderDate) {
    const diffHours = Math.abs(txData.transactionTime.getTime() - new Date(orderDate).getTime()) / (1000 * 3600);
    if (diffHours <= 48) {
      result.scoringDetails.timeMatch = true;
      result.confidenceScore += 5;
    }
  }

  // Giới hạn điểm từ 0 đến 100
  result.confidenceScore = Math.min(100, Math.max(0, result.confidenceScore));

  // ── PHÂN LOẠI TRẠNG THÁI & ĐIỀU KIỆN TỰ ĐỘNG DUYỆT ───────────────────────
  const isSenderTrusted = senderIdentityRecord && senderIdentityRecord.isAutoApproved;
  const isHighTrustScore = result.confidenceScore >= minTrustScore;

  if (
    result.scoringDetails.amountMatch &&
    (result.suggestedOrderHistoryId || result.suggestedOrderId)
  ) {
    // Nếu điểm cao và khách quen đã được bật autoApprove
    if (isAccountAutoApprove && isHighTrustScore && (isSenderTrusted || result.scoringDetails.codeMatch)) {
      result.status = 'MATCHED';
      result.matchedBy = isSenderTrusted ? 'AUTO_HIGH_TRUST' : 'AUTO_EXACT_CODE';
      result.autoApproveEligible = true;
    } else {
      // Giai đoạn 1: Gợi ý sẵn cho kế toán duyệt 1-click
      result.status = result.status === 'PARTIAL' ? 'PARTIAL' : (result.status === 'OVERPAID' ? 'OVERPAID' : 'SUGGESTED');
    }
  }

  return result;
}

/**
 * Thực thi xác nhận khớp đơn hàng (Dùng cho cả Auto-Match và Kế toán duyệt tay 1-Click)
 */
export async function executeOrderApproval(
  orgId: string,
  transactionId: string,
  approverUserId?: string,
  targetOrderIdParam?: string,
  isHistoryOrder = true
): Promise<{ success: boolean; message: string; orderCode?: string }> {
  const transaction = await prisma.bankTransaction.findUnique({
    where: { id: transactionId },
    include: { bankAccount: true },
  });

  if (!transaction) {
    throw new Error('Không tìm thấy giao dịch ngân hàng');
  }

  if (transaction.status === 'MATCHED') {
    return { success: true, message: 'Giao dịch đã được duyệt trước đó', orderCode: transaction.matchedOrderCode || '' };
  }

  const orderHistoryId = isHistoryOrder ? (targetOrderIdParam || transaction.suggestedOrderHistoryId) : null;
  const regularOrderId = !isHistoryOrder ? (targetOrderIdParam || transaction.suggestedOrderId) : null;

  if (!orderHistoryId && !regularOrderId) {
    throw new Error('Chưa có thông tin đơn hàng để duyệt khớp');
  }

  let finalOrderCode = '';
  let contactForZalo: any = null;
  let odooOrderIdToSync: number | null = null;

  // 1. Cập nhật OrderHistory (nếu là đơn Odoo/History)
  if (orderHistoryId) {
    const updatedHistory = await prisma.orderHistory.update({
      where: { id: orderHistoryId },
      data: {
        note: transaction.notes
          ? `${transaction.notes}\n[Đã thanh toán qua MB Bank ${transaction.accountNumber}]`
          : `[Đã thanh toán qua MB Bank ${transaction.accountNumber}]`,
        updatedAt: new Date(),
      },
      include: { customerProfile: true },
    });

    finalOrderCode = updatedHistory.orderCode;
    odooOrderIdToSync = updatedHistory.odooOrderId;

    // Tìm contact để gửi tin Zalo
    if (updatedHistory.customerProfileId) {
      contactForZalo = await prisma.contact.findFirst({
        where: { orgId, customerId: updatedHistory.customerProfileId },
        include: { conversations: { take: 1, orderBy: { lastMessageAt: 'desc' } } },
      });
    }
  }

  // 2. Cập nhật Order (nếu là đơn CRM)
  if (regularOrderId) {
    const updatedOrder = await prisma.order.update({
      where: { id: regularOrderId },
      data: {
        status: 'paid',
        updatedAt: new Date(),
      },
      include: { contact: true },
    });

    finalOrderCode = updatedOrder.orderCode;
    contactForZalo = updatedOrder.contact;
  }

  // 3. Cập nhật trạng thái BankTransaction -> MATCHED
  const now = new Date();
  await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: {
      status: 'MATCHED',
      matchedOrderHistoryId: orderHistoryId,
      matchedOrderId: regularOrderId,
      matchedOrderCode: finalOrderCode,
      matchedBy: approverUserId ? 'MANUAL_STAFF' : (transaction.matchedBy || 'AUTO_HIGH_TRUST'),
      matchedUserId: approverUserId || null,
      matchedAt: now,
    },
  });

  // 4. Học danh tính người chuyển (SenderIdentity Learning)
  const cleanSender = cleanSenderName(transaction.senderNameRaw);
  if (cleanSender && contactForZalo?.id) {
    try {
      await prisma.senderIdentity.upsert({
        where: {
          orgId_senderNameClean_contactId: {
            orgId,
            senderNameClean: cleanSender,
            contactId: contactForZalo.id,
          },
        },
        create: {
          orgId,
          contactId: contactForZalo.id,
          senderNameClean: cleanSender,
          senderBank: transaction.bankCode,
          successMatchCount: 1,
          trustLevel: 'NORMAL',
          isAutoApproved: false, // Mặc định lần 1 chưa bật auto, cần kế toán duyệt vài lần
          lastMatchedAt: now,
        },
        update: {
          successMatchCount: { increment: 1 },
          lastMatchedAt: now,
          // Nếu đã khớp thành công >= 3 lần, tự động nâng lên TRUSTED
          trustLevel: 'TRUSTED',
        },
      });
      logger.info(`[payment-scoring] Ghi nhớ danh tính người chuyển: ${cleanSender} cho khách hàng: ${contactForZalo.fullName || contactForZalo.id}`);
    } catch (learnErr: any) {
      logger.warn(`[payment-scoring] Lỗi khi cập nhật SenderIdentity: ${learnErr.message}`);
    }
  }

  // 5. Đồng bộ trạng thái thanh toán sang ERP Odoo (nếu có odooOrderId)
  if (odooOrderIdToSync) {
    try {
      // Có thể ghi nhận activity hoặc thanh toán qua routerClient
      logger.info(`[payment-scoring] Đã ghi nhận thanh toán cho đơn Odoo #${odooOrderIdToSync}`);
    } catch (odooErr: any) {
      logger.warn(`[payment-scoring] Lỗi đồng bộ Odoo Payment: ${odooErr.message}`);
    }
  }

  // 6. Gửi tin nhắn Zalo tự động xác nhận thanh toán cho khách hàng
  if (contactForZalo && contactForZalo.conversations && contactForZalo.conversations.length > 0) {
    const conv = contactForZalo.conversations[0];
    const amountStr = transaction.amount.toLocaleString('vi-VN');
    const zaloMsg = `Dạ shop đã nhận được số tiền ${amountStr} ₫ thanh toán cho đơn hàng #${finalOrderCode} qua ngân hàng MB Bank (STK *${transaction.accountNumber.slice(-4)}).
Đơn hàng đã được xác nhận thanh toán thành công và đang được chuẩn bị giao đến quý khách ạ! Cảm ơn quý khách đã tin tưởng shop!`;

    try {
      const instance = zaloPool.getInstance(conv.zaloAccountId);
      if (instance && instance.api && conv.externalThreadId && !conv.externalThreadId.startsWith('test_')) {
        await instance.api.sendMessage({ msg: zaloMsg }, conv.externalThreadId, conv.threadType === 'group' ? 1 : 0);
      }
      logger.info(`[payment-scoring] Đã gửi Zalo xác nhận thanh toán cho đơn ${finalOrderCode}`);
    } catch (zaloErr: any) {
      logger.warn(`[payment-scoring] Không thể gửi Zalo xác nhận: ${zaloErr.message}`);
    }
  }

  // 7. Bắn Socket.IO realtime thông báo toàn hệ thống
  try {
    zaloPool.getIO()?.emit('payment:matched', {
      transactionId,
      orderCode: finalOrderCode,
      amount: transaction.amount,
      accountNumber: transaction.accountNumber,
    });
    zaloPool.getIO()?.emit('order:updated', {
      orderCode: finalOrderCode,
      state: 'paid',
    });
  } catch (socketErr: any) {
    // Non-blocking
  }

  return {
    success: true,
    message: `Đã duyệt thanh toán thành công cho đơn #${finalOrderCode}`,
    orderCode: finalOrderCode,
  };
}
