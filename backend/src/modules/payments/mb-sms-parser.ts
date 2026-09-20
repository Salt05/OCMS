/**
 * MB Bank SMS Parser
 * Bóc tách chuyên sâu cho tất cả các định dạng tin nhắn SMS biến động số dư của MB Bank (Ngân hàng Quân Đội).
 */

export interface ParsedBankSms {
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
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Chuẩn hóa chuỗi số tiền sang number.
 * Ví dụ: "+500,000VND" -> 500000, "1.250.000" -> 1250000
 */
export function cleanAmount(raw: string): { amount: number; type: 'IN' | 'OUT' } {
  const isOut = raw.includes('-') || raw.toLowerCase().includes('giam') || raw.toLowerCase().includes('tru');
  const digits = raw.replace(/[^\d]/g, '');
  const amount = parseInt(digits, 10) || 0;
  return { amount, type: isOut ? 'OUT' : 'IN' };
}

/**
 * Trích xuất danh sách mã đơn hàng tiềm năng từ nội dung chuyển khoản.
 * Hỗ trợ các mẫu:
 * - ORD-YYYYMMDD-XXX
 * - SO-AI-XXXX / AI-XXXX
 * - SO12345 / SO-12345 / S012345
 * - DH12345 / DON12345 / DON-12345
 * - Mã thuần số hoặc mã đơn hàng CRM
 */
export function extractCandidateOrderCodes(text: string): string[] {
  if (!text) return [];
  const normalized = text.toUpperCase();
  const codes = new Set<string>();

  // 1. Khớp mã ORD chuẩn: ORD-20260920-001 hoặc ORD20260920001
  const ordMatches = normalized.match(/ORD[-_ ]?[0-9]{8}[-_ ]?[0-9]{2,4}/gi);
  if (ordMatches) {
    for (const m of ordMatches) {
      codes.add(m.replace(/[-_ ]/g, '-'));
    }
  }

  // 2. Khớp mã SO Odoo: SO012345, SO 12345, SO-12345
  const soMatches = normalized.match(/\bSO[-_ ]?[0-9]{3,7}\b/gi);
  if (soMatches) {
    for (const m of soMatches) {
      codes.add(m.replace(/[-_ ]/g, ''));
    }
  }

  // 3. Khớp mã AI: AI-XXXXXXXX hoặc SO-AI-XXXXXXXX
  const aiMatches = normalized.match(/\b(?:SO-)?AI-[A-Z0-9]{6,12}\b/gi);
  if (aiMatches) {
    for (const m of aiMatches) {
      codes.add(m.replace(/^SO-/, ''));
    }
  }

  // 4. Khớp từ khóa DH / DON HANG: DH12345, DH-12345, DON 12345
  const dhMatches = normalized.match(/(?:DH|DON|ORDER)[-_ ]?([A-Z0-9]{4,12})/gi);
  if (dhMatches) {
    for (const m of dhMatches) {
      const clean = m.replace(/^(?:DH|DON|ORDER)[-_ ]?/i, '').trim();
      if (clean) codes.add(clean);
    }
  }

  return Array.from(codes);
}

/**
 * Trích xuất số điện thoại Việt Nam tiềm năng từ nội dung (10 số, bắt đầu bằng 03, 05, 07, 08, 09)
 */
export function extractCandidatePhones(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\b(?:03|05|07|08|09)\d{8}\b/g);
  return matches ? Array.from(new Set(matches)) : [];
}

/**
 * Bóc tách tên người chuyển từ nội dung MB Bank nếu có.
 * Thường có dạng: "MBVCB.123456.NGUYEN VAN A CHUYEN TIEN..." hoặc "NGUYEN VAN A chuyen tien..."
 */
export function extractSenderNameFromMB(description: string): string | null {
  if (!description) return null;
  
  // Dạng NAPAS liên ngân hàng: MBVCB.123456.NGUYEN VAN A CHUYEN TIEN...
  const napasMatch = description.match(/[A-Z0-9]{3,10}\.[0-9]+\.([A-Z\s]{3,30})(?:CHUYEN|CK|THANH TOAN|TT|\.)/i);
  if (napasMatch && napasMatch[1]) {
    const name = napasMatch[1].trim();
    if (name.length >= 4 && !/\d/.test(name)) return name.toUpperCase();
  }

  // Dạng nội bộ MB hoặc cú pháp thông thường: NGUYEN VAN A chuyen tien...
  const directMatch = description.match(/^([A-Z\s]{4,30})(?:chuyen|ck|thanh toan|tt|tra tien)/i);
  if (directMatch && directMatch[1]) {
    const name = directMatch[1].trim();
    if (name.length >= 4 && !/\d/.test(name)) return name.toUpperCase();
  }

  return null;
}

/**
 * Parser chính cho MB Bank SMS
 */
export function parseMbBankSms(smsContent: string, simAccountNumberFallback?: string): ParsedBankSms {
  const cleanContent = smsContent.trim();
  
  // Khởi tạo kết quả mặc định
  const result: ParsedBankSms = {
    bankCode: 'MB',
    accountNumber: '',
    type: 'IN',
    amount: 0,
    balanceAfter: null,
    transactionTime: new Date(),
    senderNameRaw: null,
    description: '',
    refCode: null,
    candidateOrderCodes: [],
    candidatePhones: [],
    isValid: false,
  };

  if (!cleanContent) {
    result.errorMessage = 'Tin nhắn rỗng';
    return result;
  }

  // ── 1. Bóc tách Số tài khoản nhận (TK xxxxx) ──
  const tkMatch = cleanContent.match(/(?:TK|Tai khoan|So TK)[:\s]*([0-9]{6,16})/i);
  if (tkMatch) {
    result.accountNumber = tkMatch[1].trim();
  } else if (simAccountNumberFallback) {
    result.accountNumber = simAccountNumberFallback.trim();
  }

  // ── 2. Bóc tách Số tiền giao dịch (GD: +500,000VND hoặc tang 500,000VND) ──
  let rawAmount = '';
  const gdMatch = cleanContent.match(/(?:GD|Giao dich)[:\s]*([+-]?\s*[0-9.,]+(?:\s*VND)?)/i);
  if (gdMatch) {
    rawAmount = gdMatch[1];
  } else {
    // Thử mẫu biến động: tang 500,000 VND / cong 500.000 VND
    const altAmountMatch = cleanContent.match(/(?:tang|cong|\+)\s*([0-9.,]+)\s*(?:VND|d)?/i);
    if (altAmountMatch) {
      rawAmount = `+${altAmountMatch[1]}`;
    } else {
      const minusMatch = cleanContent.match(/(?:giam|tru|-)\s*([0-9.,]+)\s*(?:VND|d)?/i);
      if (minusMatch) rawAmount = `-${minusMatch[1]}`;
    }
  }

  if (rawAmount) {
    const { amount, type } = cleanAmount(rawAmount);
    result.amount = amount;
    result.type = type;
  }

  // ── 3. Bóc tách Số dư sau giao dịch (SD: 15,200,000VND) ──
  const sdMatch = cleanContent.match(/(?:SD|So du)[:\s]*([0-9.,]+(?:\s*VND)?)/i);
  if (sdMatch) {
    result.balanceAfter = cleanAmount(sdMatch[1]).amount;
  }

  // ── 4. Bóc tách Thời gian giao dịch (20/09/26 14:30 hoặc 14:30 20/09/2026) ──
  const dateMatch = cleanContent.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)/);
  const dateMatchAlt = cleanContent.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);

  if (dateMatch) {
    result.transactionTime = parseDateTime(dateMatch[1], dateMatch[2]);
  } else if (dateMatchAlt) {
    result.transactionTime = parseDateTime(dateMatchAlt[2], dateMatchAlt[1]);
  }

  // ── 5. Bóc tách Nội dung chuyển khoản (ND: ...) ──
  const ndMatch = cleanContent.match(/(?:ND|Noi dung|Noi dung chuyen khoan)[:\s]*(.*)$/i);
  if (ndMatch) {
    result.description = ndMatch[1].trim();
  } else {
    // Nếu không có tiền tố ND, lấy nửa sau của tin nhắn
    result.description = cleanContent;
  }

  // ── 6. Bóc tách Tên người gửi, Mã đơn, Số điện thoại ──
  result.senderNameRaw = extractSenderNameFromMB(result.description);
  result.candidateOrderCodes = extractCandidateOrderCodes(result.description);
  result.candidatePhones = extractCandidatePhones(result.description);

  // ── 7. Kiểm định tính hợp lệ ──
  // Hợp lệ nếu có số tiền > 0 và có số tài khoản
  if (result.amount > 0 && (result.accountNumber || simAccountNumberFallback)) {
    result.isValid = true;
  } else {
    result.errorMessage = 'Không xác định được số tiền hoặc số tài khoản từ tin nhắn MB Bank';
  }

  return result;
}

/**
 * Helper phân tích ngày giờ định dạng VN: DD/MM/YY hoặc DD/MM/YYYY + HH:mm
 */
function parseDateTime(datePart: string, timePart: string): Date {
  try {
    const dParts = datePart.split(/[\/-]/).map(Number);
    const tParts = timePart.split(':').map(Number);

    let day = dParts[0];
    let month = dParts[1] - 1; // 0-indexed
    let year = dParts[2];
    if (year < 100) year += 2000; // 26 -> 2026

    const hour = tParts[0] || 0;
    const min = tParts[1] || 0;
    const sec = tParts[2] || 0;

    return new Date(year, month, day, hour, min, sec);
  } catch {
    return new Date();
  }
}
