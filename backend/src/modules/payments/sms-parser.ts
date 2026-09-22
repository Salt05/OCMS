/**
 * Unified SMS Parser Engine
 * Điều phối bóc tách tin nhắn SMS đa ngân hàng và tạo mã băm chống trùng lặp (Idempotency Hash).
 */
import { createHash } from 'node:crypto';
import { parseMbBankSms, extractTransferContent, type ParsedBankSms } from './mb-sms-parser.js';

export interface SmsPayloadInput {
  sender?: string; // Tên người gửi SMS (ví dụ: "MBBANK", "MB Bank", "9704...")
  content: string; // Toàn bộ nội dung tin nhắn SMS nhận được
  timestamp?: number | string; // Thời gian tin nhắn đến trên điện thoại
  simSlot?: number; // 1 hoặc 2
  simAccountNumber?: string; // Số tài khoản gán cố định cho SIM đó (nếu có)
  deviceId?: string; // ID thiết bị điện thoại (ví dụ: "phone_mb_01")
}

export interface ParseResult {
  bankCode: string;
  accountNumber: string;
  type: 'IN' | 'OUT';
  amount: number;
  balanceAfter: number | null;
  transactionTime: Date;
  senderNameRaw: string | null;
  description: string;
  refCode: string | null;
  candidateOrderCodes: string[];
  candidatePhones: string[];
  parsedOrderCode: string | null;
  parsedCustomerName: string | null;
  idempotencyHash: string;
  isValid: boolean;
  errorMessage?: string;
  rawSms: string;
}

/**
 * Tính mã băm Idempotency Hash (SHA-256) duy nhất cho giao dịch:
 * Dựa trên: accountNumber + amount + timestamp string + nội dung SMS.
 * Nhờ đó nếu cùng 1 tin nhắn bị app gửi lại 2 lần hoặc 2 máy cùng bắt được tin, hash sẽ trùng 100% và bị chặn.
 */
export function computeIdempotencyHash(
  accountNumber: string,
  amount: number,
  transactionTime: Date,
  rawSms: string
): string {
  // Rút gọn rawSms bỏ khoảng trắng thừa để chống sai lệch nhỏ
  const normalizedSms = rawSms.replace(/\s+/g, ' ').trim();
  const timeKey = transactionTime.toISOString().slice(0, 16); // Lấy tới phút để an toàn
  const data = `${accountNumber}|${amount}|${timeKey}|${normalizedSms}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Bóc tách tin nhắn SMS tổng quát
 */
export function parseIncomingSms(input: SmsPayloadInput): ParseResult {
  const rawSms = (input.content || '').trim();
  const sender = (input.sender || '').toUpperCase();

  // Nhận diện ngân hàng: Mặc định là MB Bank nếu sender có MBBANK hoặc nội dung có MB
  let parsed: ParsedBankSms;

  if (sender.includes('MB') || /TK\s*[0-9]{6,16}/i.test(rawSms)) {
    parsed = parseMbBankSms(rawSms, input.simAccountNumber);
  } else {
    // Fallback thử bóc tách bằng parser MB
    parsed = parseMbBankSms(rawSms, input.simAccountNumber);
  }

  // Sử dụng timestamp gửi lên nếu hợp lệ
  let finalTxTime = parsed.transactionTime;
  if (input.timestamp) {
    const parsedTs = new Date(input.timestamp);
    if (!isNaN(parsedTs.getTime())) {
      finalTxTime = parsedTs;
    }
  }

  // Tính toán Idempotency Hash
  const idempotencyHash = computeIdempotencyHash(
    parsed.accountNumber || input.simAccountNumber || 'UNKNOWN',
    parsed.amount,
    finalTxTime,
    rawSms
  );

  // Bóc tách Order Code + Customer Name từ nội dung chuyển khoản (ND field)
  const transferContent = extractTransferContent(parsed.description);

  // Nếu extractTransferContent tìm được order code mà candidateOrderCodes chưa có, thêm vào đầu
  const finalCandidateCodes = [...parsed.candidateOrderCodes];
  if (transferContent.orderCode && !finalCandidateCodes.some(c => c.toUpperCase() === transferContent.orderCode!.toUpperCase())) {
    finalCandidateCodes.unshift(transferContent.orderCode);
  }

  return {
    ...parsed,
    candidateOrderCodes: finalCandidateCodes,
    transactionTime: finalTxTime,
    parsedOrderCode: transferContent.orderCode,
    parsedCustomerName: transferContent.customerName,
    idempotencyHash,
    rawSms,
  };
}
