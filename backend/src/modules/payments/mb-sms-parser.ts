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

  // 2. Khớp mã số Odoo có thể có tiền tố S: S02312, 02312
  const s0Matches = normalized.match(/(?<!\d)S?0\d{4,6}(?!\d)/g);
  if (s0Matches) {
    for (const m of s0Matches) {
      codes.add(m);
    }
  }

  // 3. Khớp mã SO Odoo: SO012345, SO 12345, SO-12345
  const soMatches = normalized.match(/\bSO[-_ ]?[0-9]{3,7}\b/gi);
  if (soMatches) {
    for (const m of soMatches) {
      codes.add(m.replace(/[-_ ]/g, ''));
    }
  }

  // 4. Khớp mã AI: AI-XXXXXXXX hoặc SO-AI-XXXXXXXX
  const aiMatches = normalized.match(/\b(?:SO-)?AI-[A-Z0-9]{6,12}\b/gi);
  if (aiMatches) {
    for (const m of aiMatches) {
      codes.add(m.replace(/^SO-/, ''));
    }
  }

  // 5. Khớp từ khóa DH / DON HANG: DH12345, DH-12345, DON 12345
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
 * Parsed transfer content: order code + customer name
 */
export interface ParsedTransferContent {
  orderCode: string | null;
  customerName: string | null;
}

/** Tạo các dạng mã tương đương để mã số có/không có tiền tố S đều được nhận diện. */
export function getOrderCodeSearchVariants(code: string): string[] {
  const normalized = code.replace(/[-_ ]/g, '').toUpperCase();
  const numericCode = normalized.replace(/^S(?=0\d{4,6}$)/, '');

  if (/^0\d{4,6}$/.test(numericCode)) {
    return Array.from(new Set([normalized, numericCode, `S${numericCode}`]));
  }

  return [normalized];
}

/**
 * Bóc tách thông tin từ nội dung chuyển khoản (ND field):
 * - Order Code (S02312, ORD-..., SO...)
 * - Customer Name (phần text sau order code, nếu là tên người)
 *
 * Hỗ trợ các dạng nội dung:
 * - "TT S02312 NGUYEN VAN A"
 * - "THANH TOAN S02312 NGUYEN VAN A"
 * - "Thanh toan don S02312"
 * - "S02312 NGUYEN VAN A"
 * - "S02312"
 * - "NGUYEN VAN A chuyen tien"
 */
export function extractTransferContent(description: string): ParsedTransferContent {
  const result: ParsedTransferContent = { orderCode: null, customerName: null };
  if (!description) return result;

  const text = description.trim();
  const upper = text.toUpperCase();

  // 1. Tìm order code trong nội dung
  // Ưu tiên S0XXXX (Odoo), sau đó ORD-..., SO...
  const orderCodePatterns: RegExp[] = [
    /(?<!\d)S?0\d{4,6}(?!\d)/i,                 // S02312, 02312, aaaS02312bbb
    /\bORD[-_ ]?[0-9]{8}[-_ ]?[0-9]{2,4}\b/i,   // ORD-20260920-001
    /\bSO[-_ ]?[0-9]{3,7}\b/i,                   // SO12345
    /\b(?:SO-)?AI-[A-Z0-9]{6,12}\b/i,            // AI-A1B2C3D4
    /\b(?:DH|DON)[-_ ]?[A-Z0-9]{4,12}\b/i,       // DH12345
  ];

  let codeMatch: RegExpMatchArray | null = null;
  for (const pattern of orderCodePatterns) {
    codeMatch = upper.match(pattern);
    if (codeMatch) {
      result.orderCode = codeMatch[0].replace(/[-_ ]/g, '').toUpperCase();
      break;
    }
  }

  // 2. Tìm customer name — phần text sau order code
  if (codeMatch) {
    const codeEndIdx = upper.indexOf(codeMatch[0]) + codeMatch[0].length;
    let afterCode = text.slice(codeEndIdx).trim();

    // Bỏ các từ khóa phổ biến ở đầu: "chuyen tien", "ck", "thanh toan"
    afterCode = afterCode.replace(/^\s*(?:chuyen\s*tien|ck|chuyenkhoan|chuyen\s*khoan)\s*/i, '').trim();

    // Tên người: chỉ chứa chữ cái (có/không dấu) và khoảng trắng, tối thiểu 4 ký tự, tối đa 40
    const nameCandidate = afterCode.replace(/\s+/g, ' ').trim();
    if (nameCandidate.length >= 4 && nameCandidate.length <= 40 && /^[A-Za-zÀ-ỹ\s]+$/.test(nameCandidate)) {
      result.customerName = nameCandidate.toUpperCase();
    }
  } else {
    // Không tìm thấy order code — thử tìm tên người gửi từ các pattern đặc biệt
    // Dạng: "NGUYEN VAN A chuyen tien" hoặc "NGUYEN VAN A TT ..."
    const nameBeforeKeyword = upper.match(/^([A-Z0-9À-Ỹ\s]{4,40})\s+(?:CHUYEN|CK|THANH TOAN|TT|CHUYENKHOAN|CHUYEN KHOAN)/i);
    if (nameBeforeKeyword && nameBeforeKeyword[1]) {
      const name = nameBeforeKeyword[1].trim();
      if (name.length >= 4 && !/\d/.test(name)) {
        result.customerName = name;
      }
    } else {
      // Một số SMS chỉ gửi tên khách hàng trong ND, ví dụ: "68 PET SHOP".
      // Loại bỏ các trường hợp văn bản chung chung / nội dung chuyển tiền không phải tên người hoặc shop
      const nameOnly = text.replace(/\s+/g, ' ').trim();
      const genericKeywords = [
        'CHUYEN TIEN', 'CHUYEN TIEN CHO', 'CK', 'THANH TOAN', 'TIEN AN', 'TIEN NHA', 'TIEN HOC',
        'HOC PHI', 'CHUC MUNG', 'SINH NHAT', 'TRA NO', 'VAY TIEN', 'LIXI', 'LI XI', 'MUA HANG',
        'RANDOM', 'TEST', 'ORDER INFO', 'WITHOUT ORDER',
      ];
      const isGeneric = genericKeywords.some((kw) => nameOnly.toUpperCase().includes(kw));

      if (!isGeneric && nameOnly.length >= 4 && nameOnly.length <= 40 && /^[A-Za-zÀ-ỹ0-9][A-Za-zÀ-ỹ0-9\s.'-]*$/.test(nameOnly)) {
        result.customerName = nameOnly.toUpperCase();
      }
    }
  }

  return result;
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

  // ── 2. Bóc tách Số tiền giao dịch (GD: +500,000VND hoặc TK xxx +500,000VND hoặc tang 500,000VND) ──
  let rawAmount = '';
  // Ưu tiên cú pháp chuẩn MB mới nhất: TK <acc> +500,000VND hoặc -500,000VND
  const tkAmountMatch = cleanContent.match(/TK\s+[0-9]{6,16}\s+([+-]\s*[0-9.,]+(?:\s*VND)?)/i);
  if (tkAmountMatch) {
    rawAmount = tkAmountMatch[1];
  } else {
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
  }

  if (rawAmount) {
    const { amount, type } = cleanAmount(rawAmount);
    result.amount = amount;
    result.type = type;
  }

  // ── 3. Bóc tách Số dư sau giao dịch (SD: 15,200,000VND hoặc So du: 15,200,000VND) ──
  const sdMatch = cleanContent.match(/(?:SD|So du)[:\s]*([0-9.,]+(?:\s*VND)?)/i);
  if (sdMatch) {
    result.balanceAfter = cleanAmount(sdMatch[1]).amount;
  }

  // ── 4. Bóc tách Thời gian giao dịch ──
  // MB format: "luc 14:30 20/09/2026" hoặc "20/09/26 14:30" hoặc "14:30 20/09/2026"
  const lucMatch = cleanContent.match(/luc\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
  if (lucMatch) {
    result.transactionTime = parseDateTime(lucMatch[2], lucMatch[1]);
  } else {
    const dateMatch = cleanContent.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)/);
    const dateMatchAlt = cleanContent.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);

    if (dateMatch) {
      result.transactionTime = parseDateTime(dateMatch[1], dateMatch[2]);
    } else if (dateMatchAlt) {
      result.transactionTime = parseDateTime(dateMatchAlt[2], dateMatchAlt[1]);
    }
  }

  // ── 5. Bóc tách Nội dung chuyển khoản (ND: ...) ──
  const ndMatch = cleanContent.match(/\b(?:ND|Noi dung chuyen khoan|Noi dung)[:\s]*(.*)$/i);
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
