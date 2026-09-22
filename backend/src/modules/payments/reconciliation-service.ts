/**
 * Payment Reconciliation Service — 2-Tier Engine
 * Tầng 1: Hard Rules (điều kiện bắt buộc, không thể override bằng scoring)
 * Tầng 2: Scoring (chấm điểm tin cậy, chỉ chạy sau khi pass Hard Rules)
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import type { ParseResult } from './sms-parser.js';
import { cleanSenderName } from './payment-scoring-service.js';

// ── Reconciliation Status Constants ─────────────────────────────────────────────
export const RECON_STATUS = {
  AUTO_PAID: 'AUTO_PAID',
  PARTIAL_PAYMENT: 'PARTIAL_PAYMENT',
  OVERPAYMENT: 'OVERPAYMENT',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  PAYMENT_AFTER_PAID: 'PAYMENT_AFTER_PAID',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  INVALID_TRANSACTION_TIME: 'INVALID_TRANSACTION_TIME',
  NEED_REVIEW: 'NEED_REVIEW',
  DEBIT_IGNORED: 'DEBIT_IGNORED',
  CANDIDATE_FOUND: 'CANDIDATE_FOUND',
  DUPLICATE: 'DUPLICATE',
} as const;

export type ReconStatus = typeof RECON_STATUS[keyof typeof RECON_STATUS];

// ── Reconciliation Reason Constants ─────────────────────────────────────────────
export const RECON_REASON = {
  ORDER_CODE_MATCH: 'ORDER_CODE_MATCH',
  AMOUNT_MATCH: 'AMOUNT_MATCH',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  AMOUNT_PARTIAL: 'AMOUNT_PARTIAL',
  AMOUNT_OVER: 'AMOUNT_OVER',
  CUSTOMER_NAME_MATCH: 'CUSTOMER_NAME_MATCH',
  VALID_TRANSACTION_TIME: 'VALID_TRANSACTION_TIME',
  INVALID_TRANSACTION_TIME: 'INVALID_TRANSACTION_TIME',
  DUPLICATE_TRANSACTION: 'DUPLICATE_TRANSACTION',
  DEBIT_TRANSACTION: 'DEBIT_TRANSACTION',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_ALREADY_PAID: 'ORDER_ALREADY_PAID',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  NO_ORDER_CODE: 'NO_ORDER_CODE',
  CANDIDATE_BY_SCORING: 'CANDIDATE_BY_SCORING',
} as const;

export type ReconReason = typeof RECON_REASON[keyof typeof RECON_REASON];

// ── Scoring Weights ─────────────────────────────────────────────────────────────
export const SCORING_WEIGHTS = {
  ORDER_CODE_MATCH: 90,
  AMOUNT_MATCH: 10,
  AMOUNT_MISMATCH: -10,
  CUSTOMER_NAME_MATCH: 10,
  VALID_TRANSACTION_TIME: 5,
} as const;

// ── Reconciliation Output ───────────────────────────────────────────────────────
export interface ReconciliationResult {
  status: ReconStatus;
  score: number;
  reasons: ReconReason[];
  matchedOrderId: string | null;
  matchedOrderHistoryId: string | null;
  matchedOrderCode: string | null;
  orderType: 'crm' | 'history' | null;
  // Backward-compatible fields for legacy scoring output
  legacyScoringStatus: string;
  legacyAutoApproveEligible: boolean;
  legacyMatchedBy: string | null;
}

// ── Paid statuses for OrderHistory (Odoo) ───────────────────────────────────────
const HISTORY_PAID_STATES = ['done', 'paid'];
const HISTORY_CANCELLED_STATES = ['cancel', 'cancelled'];
const ORDER_PAID_STATUSES = ['paid', 'completed'];
const ORDER_CANCELLED_STATUSES = ['cancelled', 'canceled'];

/**
 * Chuẩn hóa tên để so sánh (bỏ dấu, in hoa, rút gọn khoảng trắng)
 */
function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z\s]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * So sánh tên khách hàng (normalized)
 */
function isNameMatch(parsedName: string | null, orderName: string | null): boolean {
  if (!parsedName || !orderName) return false;
  const a = normalizeName(parsedName);
  const b = normalizeName(orderName);
  if (!a || !b) return false;
  // Khớp chính xác hoặc chứa lẫn nhau
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * MAIN: Reconcile transaction theo mô hình 2 tầng
 */
export async function reconcileTransaction(
  orgId: string,
  txData: ParseResult,
  bankAccountId?: string | null
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    status: RECON_STATUS.NEED_REVIEW,
    score: 0,
    reasons: [],
    matchedOrderId: null,
    matchedOrderHistoryId: null,
    matchedOrderCode: null,
    orderType: null,
    legacyScoringStatus: 'MANUAL_REVIEW',
    legacyAutoApproveEligible: false,
    legacyMatchedBy: null,
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // TẦNG 1 — HARD RULES (bắt buộc, scoring không override)
  // ══════════════════════════════════════════════════════════════════════════════

  // ── RULE 2: CHỈ XỬ LÝ TIỀN VÀO ──────────────────────────────────────────────
  if (txData.type !== 'IN' || txData.amount <= 0) {
    result.status = RECON_STATUS.DEBIT_IGNORED;
    result.reasons.push(RECON_REASON.DEBIT_TRANSACTION);
    result.legacyScoringStatus = 'IGNORED';
    logger.info(`[reconciliation] DEBIT/invalid amount → DEBIT_IGNORED`);
    return result;
  }

  // ── Tìm Order từ parsedOrderCode hoặc candidateOrderCodes ─────────────────
  const orderCode = txData.parsedOrderCode;
  const allCandidateCodes = txData.candidateOrderCodes || [];

  let targetOrderHistory: any = null;
  let targetOrder: any = null;
  let matchedCode: string | null = null;

  // Ưu tiên parsedOrderCode, sau đó thử candidateOrderCodes
  const codesToSearch = orderCode
    ? [orderCode, ...allCandidateCodes.filter(c => c.toUpperCase() !== orderCode.toUpperCase())]
    : allCandidateCodes;

  for (const code of codesToSearch) {
    // Tìm trong OrderHistory (Odoo)
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
      matchedCode = foundHistory.orderCode;
      result.matchedOrderHistoryId = foundHistory.id;
      result.matchedOrderCode = foundHistory.orderCode;
      result.orderType = 'history';
      break;
    }

    // Tìm trong Order (CRM)
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
      matchedCode = foundOrder.orderCode;
      result.matchedOrderId = foundOrder.id;
      result.matchedOrderCode = foundOrder.orderCode;
      result.orderType = 'crm';
      break;
    }
  }

  // ── RULE 3: ORDER PHẢI TỒN TẠI ───────────────────────────────────────────────
  if (codesToSearch.length > 0 && !targetOrderHistory && !targetOrder) {
    result.status = RECON_STATUS.ORDER_NOT_FOUND;
    result.reasons.push(RECON_REASON.ORDER_NOT_FOUND);
    result.matchedOrderCode = orderCode || codesToSearch[0] || null;
    result.legacyScoringStatus = 'MANUAL_REVIEW';
    logger.info(`[reconciliation] Order code '${orderCode || codesToSearch[0]}' → ORDER_NOT_FOUND`);
    return result;
  }

  // Nếu tìm được order → tiếp tục kiểm tra Hard Rules
  if (targetOrderHistory || targetOrder) {
    const orderState = targetOrderHistory?.state || targetOrder?.status || '';
    const orderCreatedAt = targetOrderHistory?.dateOrder || targetOrderHistory?.createdAt || targetOrder?.createdAt;
    const orderAmount = targetOrderHistory?.amountTotal || targetOrder?.totalAmount || 0;

    // ── RULE 4: ORDER ĐÃ PAID ────────────────────────────────────────────────
    const isPaid = targetOrderHistory
      ? HISTORY_PAID_STATES.includes(orderState)
      : ORDER_PAID_STATUSES.includes(orderState);

    if (isPaid) {
      result.status = RECON_STATUS.PAYMENT_AFTER_PAID;
      result.reasons.push(RECON_REASON.ORDER_ALREADY_PAID);
      result.legacyScoringStatus = 'MANUAL_REVIEW';
      logger.info(`[reconciliation] Order '${matchedCode}' already PAID → PAYMENT_AFTER_PAID`);
      return result;
    }

    // ── RULE 5: ORDER ĐÃ CANCELLED ───────────────────────────────────────────
    const isCancelled = targetOrderHistory
      ? HISTORY_CANCELLED_STATES.includes(orderState)
      : ORDER_CANCELLED_STATUSES.includes(orderState);

    if (isCancelled) {
      result.status = RECON_STATUS.ORDER_CANCELLED;
      result.reasons.push(RECON_REASON.ORDER_CANCELLED);
      result.legacyScoringStatus = 'MANUAL_REVIEW';
      logger.info(`[reconciliation] Order '${matchedCode}' CANCELLED → ORDER_CANCELLED`);
      return result;
    }

    // ── RULE 6: THỜI GIAN GIAO DỊCH ──────────────────────────────────────────
    if (orderCreatedAt && txData.transactionTime) {
      const txTime = txData.transactionTime.getTime();
      const orderTime = new Date(orderCreatedAt).getTime();

      if (txTime < orderTime) {
        result.status = RECON_STATUS.INVALID_TRANSACTION_TIME;
        result.reasons.push(RECON_REASON.INVALID_TRANSACTION_TIME);
        result.legacyScoringStatus = 'MANUAL_REVIEW';
        logger.info(`[reconciliation] Transaction time before order creation → INVALID_TRANSACTION_TIME`);
        return result;
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TẦNG 2 — SCORING (chỉ chạy sau khi pass Hard Rules)
    // ══════════════════════════════════════════════════════════════════════════

    // Tiêu chí 1: Order Code Match (+90)
    if (matchedCode) {
      result.score += SCORING_WEIGHTS.ORDER_CODE_MATCH;
      result.reasons.push(RECON_REASON.ORDER_CODE_MATCH);
    }

    // Tiêu chí 2: Amount Match (+10 / -10)
    if (orderAmount > 0) {
      const diff = Math.abs(txData.amount - orderAmount);
      if (diff <= 1000) {
        // Cho phép lệch tối đa 1.000đ do làm tròn
        result.score += SCORING_WEIGHTS.AMOUNT_MATCH;
        result.reasons.push(RECON_REASON.AMOUNT_MATCH);
      } else {
        result.score += SCORING_WEIGHTS.AMOUNT_MISMATCH;
        result.reasons.push(RECON_REASON.AMOUNT_MISMATCH);

        if (txData.amount < orderAmount) {
          result.reasons.push(RECON_REASON.AMOUNT_PARTIAL);
        } else {
          result.reasons.push(RECON_REASON.AMOUNT_OVER);
        }
      }
    }

    // Tiêu chí 3: Customer Name Match (+10)
    const parsedName = txData.parsedCustomerName || txData.senderNameRaw;
    const orderCustomerName = targetOrderHistory?.partnerName
      || targetOrderHistory?.customerProfile?.name
      || targetOrder?.contact?.fullName;

    if (isNameMatch(parsedName, orderCustomerName)) {
      result.score += SCORING_WEIGHTS.CUSTOMER_NAME_MATCH;
      result.reasons.push(RECON_REASON.CUSTOMER_NAME_MATCH);
    }

    // Tiêu chí 4: Valid Transaction Time (+5)
    if (orderCreatedAt && txData.transactionTime) {
      const txTime = txData.transactionTime.getTime();
      const orderTime = new Date(orderCreatedAt).getTime();
      if (txTime >= orderTime) {
        result.score += SCORING_WEIGHTS.VALID_TRANSACTION_TIME;
        result.reasons.push(RECON_REASON.VALID_TRANSACTION_TIME);
      }
    }

    // ── Phân loại kết quả ────────────────────────────────────────────────────

    // Case: Amount mismatch
    const amountMatched = result.reasons.includes(RECON_REASON.AMOUNT_MATCH);
    const amountPartial = result.reasons.includes(RECON_REASON.AMOUNT_PARTIAL);
    const amountOver = result.reasons.includes(RECON_REASON.AMOUNT_OVER);

    if (amountPartial) {
      result.status = RECON_STATUS.PARTIAL_PAYMENT;
      result.legacyScoringStatus = 'PARTIAL';
      logger.info(`[reconciliation] Order '${matchedCode}' PARTIAL: got ${txData.amount}, need ${orderAmount}`);
    } else if (amountOver) {
      result.status = RECON_STATUS.OVERPAYMENT;
      result.legacyScoringStatus = 'OVERPAID';
      logger.info(`[reconciliation] Order '${matchedCode}' OVERPAYMENT: got ${txData.amount}, order ${orderAmount}`);
    } else if (matchedCode && amountMatched) {
      // Đủ điều kiện khớp đề xuất: tất cả điều kiện thỏa mãn -> chuyển sang SUGGESTED để chờ nhân viên/kế toán duyệt
      result.status = RECON_STATUS.AUTO_PAID;
      result.legacyScoringStatus = 'SUGGESTED';
      result.legacyAutoApproveEligible = false;
      result.legacyMatchedBy = 'AUTO_EXACT_CODE';
      logger.info(`[reconciliation] ✅ KHỚP ĐỀ XUẤT: Order '${matchedCode}', Amount ${txData.amount}, Score ${result.score} (Chờ kế toán xác nhận)`);
    } else {
      result.status = RECON_STATUS.NEED_REVIEW;
      result.legacyScoringStatus = 'SUGGESTED';
    }

    return result;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CASE: KHÔNG CÓ ORDER CODE — Sử dụng Scoring tìm candidate
  // ══════════════════════════════════════════════════════════════════════════════
  result.reasons.push(RECON_REASON.NO_ORDER_CODE);

  const parsedName = txData.parsedCustomerName || txData.senderNameRaw;
  const cleanName = normalizeName(parsedName);

  if (!cleanName && txData.amount <= 0) {
    result.status = RECON_STATUS.NEED_REVIEW;
    result.legacyScoringStatus = 'MANUAL_REVIEW';
    logger.info(`[reconciliation] No order code + no customer info → NEED_REVIEW`);
    return result;
  }

  // Tìm candidate orders bằng scoring
  const candidates: Array<{
    id: string;
    orderCode: string;
    type: 'history' | 'crm';
    score: number;
    customerName: string | null;
    amount: number;
    createdAt: Date;
  }> = [];

  // Tìm trong OrderHistory (72h gần nhất)
  const recentHistories = await prisma.orderHistory.findMany({
    where: {
      orgId,
      state: { in: ['draft', 'sent', 'sale'] },
      dateOrder: { gte: new Date(Date.now() - 72 * 3600 * 1000) },
    },
    include: { customerProfile: true },
    orderBy: { dateOrder: 'desc' },
    take: 50,
  });

  for (const h of recentHistories) {
    let candidateScore = 0;
    const customerName = h.partnerName || h.customerProfile?.name || null;

    // Name match
    if (isNameMatch(parsedName, customerName)) {
      candidateScore += SCORING_WEIGHTS.CUSTOMER_NAME_MATCH;
    }

    // Amount match
    if (h.amountTotal > 0) {
      const diff = Math.abs(txData.amount - h.amountTotal);
      if (diff <= 1000) {
        candidateScore += SCORING_WEIGHTS.AMOUNT_MATCH;
      }
    }

    // Time match
    if (txData.transactionTime && h.dateOrder) {
      if (txData.transactionTime.getTime() >= new Date(h.dateOrder).getTime()) {
        candidateScore += SCORING_WEIGHTS.VALID_TRANSACTION_TIME;
      }
    }

    if (candidateScore > 0) {
      candidates.push({
        id: h.id,
        orderCode: h.orderCode,
        type: 'history',
        score: candidateScore,
        customerName,
        amount: h.amountTotal,
        createdAt: h.dateOrder || h.createdAt,
      });
    }
  }

  // Tìm trong Order CRM (72h gần nhất)
  const recentOrders = await prisma.order.findMany({
    where: {
      orgId,
      status: { notIn: ['paid', 'completed', 'cancelled', 'canceled'] },
      createdAt: { gte: new Date(Date.now() - 72 * 3600 * 1000) },
    },
    include: { contact: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  for (const o of recentOrders) {
    let candidateScore = 0;
    const customerName = o.contact?.fullName || null;

    // Name match
    if (isNameMatch(parsedName, customerName)) {
      candidateScore += SCORING_WEIGHTS.CUSTOMER_NAME_MATCH;
    }

    // Amount match
    if (o.totalAmount > 0) {
      const diff = Math.abs(txData.amount - o.totalAmount);
      if (diff <= 1000) {
        candidateScore += SCORING_WEIGHTS.AMOUNT_MATCH;
      }
    }

    // Time match
    if (txData.transactionTime && o.createdAt) {
      if (txData.transactionTime.getTime() >= new Date(o.createdAt).getTime()) {
        candidateScore += SCORING_WEIGHTS.VALID_TRANSACTION_TIME;
      }
    }

    if (candidateScore > 0) {
      candidates.push({
        id: o.id,
        orderCode: o.orderCode,
        type: 'crm',
        score: candidateScore,
        customerName,
        amount: o.totalAmount,
        createdAt: o.createdAt,
      });
    }
  }

  // Sắp xếp theo điểm giảm dần
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length > 0) {
    const best = candidates[0];
    result.status = RECON_STATUS.CANDIDATE_FOUND;
    result.score = best.score;
    result.matchedOrderCode = best.orderCode;
    result.reasons.push(RECON_REASON.CANDIDATE_BY_SCORING);
    result.legacyScoringStatus = 'SUGGESTED';

    if (best.type === 'history') {
      result.matchedOrderHistoryId = best.id;
      result.orderType = 'history';
    } else {
      result.matchedOrderId = best.id;
      result.orderType = 'crm';
    }

    logger.info(`[reconciliation] Candidate found by scoring: '${best.orderCode}' (score: ${best.score})`);

    // KHÔNG tự động PAID khi chỉ có scoring, luôn cần review
    result.legacyAutoApproveEligible = false;
  } else {
    result.status = RECON_STATUS.NEED_REVIEW;
    result.legacyScoringStatus = 'MANUAL_REVIEW';
    logger.info(`[reconciliation] No order code + no candidate found → NEED_REVIEW`);
  }

  return result;
}
