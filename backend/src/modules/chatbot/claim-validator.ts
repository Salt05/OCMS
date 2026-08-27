/**
 * Product Claim Validator for AI Auto Chat.
 * Enforces strict boundaries between Fact, Inference, and Overclaims.
 * Removes absolute assertions, prevents unverified choking/medical claims,
 * and ensures honest responses when data is unknown.
 *
 * Customer-First Enhancement:
 * - Rawhide Confusion Guard
 * - Universal Fit Claim Prevention
 * - Nutrition Cure Claim Prevention
 * - Hedging Language Injection
 */

export class ClaimValidator {
  /**
   * Main entry point to validate and sanitize LLM response claims
   */
  static validate(responseText: string): string {
    let result = responseText;

    // 1. Choking / Gagging overclaims
    // "dễ nhai" ≠ "không gây nghẹn"
    const chokingOverclaims = [
      /(?:không bao giờ (?:bị )?nghẹn|chống nghẹn 100%|an toàn tuyệt đối không nghẹn|đảm bảo không bị nghẹn|tuyệt đối không nghẹn|cam kết không nghẹn)/gi,
      /(?:hoàn toàn không gây nghẹn|không thể bị nghẹn|không lo bị nghẹn)/gi,
    ];

    for (const pattern of chokingOverclaims) {
      result = result.replace(pattern, 'kết cấu dễ nhai giúp bé dễ gặm hơn (ba mẹ vẫn nên quan sát bé trong khi ăn)');
    }

    // 2. Medical / Cure overclaims
    // "hỗ trợ chăm sóc răng" ≠ "điều trị bệnh răng"
    const medicalOverclaims = [
      /(?:chữa khỏi bệnh|điều trị dứt điểm|trị dứt điểm|chữa bệnh răng miệng|thuốc điều trị)/gi,
    ];

    for (const pattern of medicalOverclaims) {
      result = result.replace(pattern, 'hỗ trợ làm sạch mảng bám và chăm sóc răng nướu');
    }

    // 3. Absolute assertions without proof
    const absolutePatterns = [
      /(?:an toàn tuyệt đối 100%|chắc chắn 100% an toàn|phù hợp 100% mọi lứa tuổi|tốt nhất thị trường)/gi,
    ];

    for (const pattern of absolutePatterns) {
      result = result.replace(pattern, 'rất phù hợp và lành tính cho bé');
    }

    // 4. Rawhide Confusion Guard
    // Prevents misidentifying "da heo tự nhiên" as "rawhide" (rawhide = da bò sống)
    const rawhideConfusion = [
      /(?:C14[^\n]*?)(?:là\s*(?:loại\s*)?rawhide|(?:thuộc|là)\s*dòng\s*rawhide|rawhide\s*da\s*heo)/gi,
    ];

    for (const pattern of rawhideConfusion) {
      result = result.replace(pattern, (match) => {
        return match.replace(/rawhide/gi, 'que da heo tự nhiên (không phải Rawhide da bò sống)');
      });
    }

    // 5. Universal Fit Claim Prevention
    // "phù hợp mọi giống/tuổi" → softer language
    const universalFitPatterns = [
      /(?:phù hợp (?:cho )?mọi (?:giống|loài|loại) (?:chó|cún|thú cưng))/gi,
      /(?:phù hợp (?:cho )?mọi (?:độ tuổi|lứa tuổi))/gi,
      /(?:tất cả (?:giống|loài) (?:chó|cún) đều (?:ăn|dùng) được)/gi,
    ];

    for (const pattern of universalFitPatterns) {
      result = result.replace(pattern, 'phù hợp với nhiều giống chó');
    }

    // 6. Nutrition Cure Claim Prevention
    // "tăng đề kháng/miễn dịch" → softer language
    const nutritionCurePatterns = [
      /(?:tăng (?:cường )?(?:đề kháng|miễn dịch|sức đề kháng))/gi,
      /(?:giúp (?:bé )?(?:khỏe mạnh|phát triển toàn diện|tăng trưởng vượt bậc))/gi,
    ];

    for (const pattern of nutritionCurePatterns) {
      result = result.replace(pattern, 'hỗ trợ dinh dưỡng cho bé');
    }

    return result;
  }

  /**
   * Validates age claim for a specific SKU.
   * If a product has no confirmed age in DB and user asks about age suitability,
   * ensures AI explicitly states lack of confirmed data instead of blindly asserting safety.
   */
  static validateAgeClaim(responseText: string, sku: string, isPuppy: boolean, minAgeMonths: number | null): string {
    if (isPuppy && minAgeMonths === null) {
      const lower = responseText.toLowerCase();
      // If AI falsely asserted safety without DB confirmation (any puppy age)
      if (
        lower.includes('hoàn toàn an toàn cho bé') ||
        lower.includes('chắc chắn ăn được') ||
        lower.includes('an toàn tuyệt đối') ||
        /an toàn cho (?:bé |cún )?\d+ tháng/i.test(lower)
      ) {
        return `Đối với mã ${sku}, hệ thống chưa có dữ liệu xác nhận cụ thể về độ tuổi phù hợp. Do bé còn nhỏ, em khuyên ba/mẹ nên chọn dòng que gặm mềm chuyên dụng cho cún con (như B03 Que xoắn sữa hoặc B06 Xương bàn chải mềm) ạ!`;
      }
    }
    return responseText;
  }

  /**
   * Inject hedging language when response discusses unverified product properties.
   * Ensures honest communication when data is missing from DB.
   */
  static injectHedgingLanguage(text: string, hasVerifiedData: boolean): string {
    if (hasVerifiedData) return text;

    // Replace confident assertions with hedged versions when data is not verified
    const confidentPatterns = [
      { pattern: /(?:chắc chắn|đảm bảo|cam kết)\s+(rằng|là|sẽ)/gi, replacement: 'theo thông tin em có thì' },
      { pattern: /(?:sản phẩm này)\s+(?:sẽ|sẽ giúp|giúp)\s+(?:bé)/gi, replacement: 'sản phẩm này có thể hỗ trợ bé' },
    ];

    let result = text;
    for (const { pattern, replacement } of confidentPatterns) {
      result = result.replace(pattern, replacement);
    }

    return result;
  }
}

