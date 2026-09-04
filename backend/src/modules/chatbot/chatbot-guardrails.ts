/**
 * Safety & Security Guardrail Engine for AI Auto Chat.
 * Enforces pricing integrity, product safety (allergies), medical boundaries, and anti-ban limits.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export interface GuardrailCheckResult {
  passed: boolean;
  sanitizedResponse?: string;
  violations: string[];
  requiresHandoff?: boolean;
}

export class ChatbotGuardrails {
  /**
   * Check veterinary medical query
   */
  static checkMedicalSafety(userMessage: string): { isMedicalEmergency: boolean; warningAdvice?: string } {
    const msg = userMessage.toLowerCase();
    const emergencyKeywords = [
      'nôn ra máu', 'nôn bọt vàng', 'co giật', 'sùi bọt mép', 'bị tiêu chảy ra máu',
      'bị liệt', 'uống thuốc gì', 'kê đơn thuốc', 'bị co giật', 'sắp chết', 'ngộ độc'
    ];

    const hasEmergency = emergencyKeywords.some(k => msg.includes(k));
    if (hasEmergency) {
      return {
        isMedicalEmergency: true,
        warningAdvice: 'Dạ bé nhà mình đang có triệu chứng cần can thiệp y tế khẩn cấp! Em khuyên Ba/Mẹ nên đưa bé đến Bác sĩ Thú y hoặc Bệnh viện Thú cưng gần nhất để được thăm khám và cấp cứu kịp thời ạ. LA PET chỉ chuyên về dinh dưỡng và snack chăm sóc răng nướu nên không thể kê đơn thuốc y tế được ạ!',
      };
    }

    return { isMedicalEmergency: false };
  }

  /**
   * Data Privacy & Internal Security Guardrail
   * Detects and blocks attempts to access internal financial or system secrets.
   */
  static checkDataPrivacySafety(userMessage: string): { isViolating: boolean; cannedResponse?: string } {
    const msg = userMessage.toLowerCase();
    
    // Internal company secrets keywords
    const forbiddenInternalKeywords = [
      'giá vốn', 'giá nhập', 'giá gốc của công ty', 'doanh thu công ty', 'lợi nhuận công ty',
      'mật khẩu', 'database password', 'bảng giá mật', 'danh sách khách hàng'
    ];

    if (forbiddenInternalKeywords.some(k => msg.includes(k))) {
      return {
        isViolating: true,
        cannedResponse: 'Dạ em chỉ hỗ trợ tư vấn thông tin sản phẩm và chính sách bán hàng chính thức của LA PET thôi ạ. Nếu mình cần hỗ trợ thêm thông tin nào khác về sản phẩm, em sẵn sàng giải đáp nhé ạ!',
      };
    }

    return { isViolating: false };
  }

  /**
   * Check allergy safety against product recommendations
   */
  static checkAllergyConflict(responseText: string, allergies: string[]): { conflict: boolean; conflictingAllergy?: string } {
    if (!allergies || allergies.length === 0) return { conflict: false };

    const lowerResp = responseText.toLowerCase();

    for (const allergy of allergies) {
      const aLower = allergy.toLowerCase().trim();
      if (aLower === 'gà' || aLower === 'thịt gà' || aLower === 'chicken') {
        // Exclude safe negation contexts (e.g. "không chứa thịt gà", "hoàn toàn không có gà", "tránh gà")
        const isNegated = /(?:không\s+chứa|không\s+có|hoàn\s+toàn\s+không|loại\s+trừ|tránh|không\s+dùng)\s+(?:thịt\s+)?gà/i.test(lowerResp);
        if (isNegated) {
          continue;
        }

        // Only trigger conflict if actively recommending or containing chicken items
        if (
          lowerResp.includes('quấn gà') ||
          lowerResp.includes('vị gà') ||
          lowerResp.includes('vị thịt gà') ||
          lowerResp.includes('ức gà') ||
          lowerResp.includes('thịt gà tươi')
        ) {
          return { conflict: true, conflictingAllergy: 'thịt gà' };
        }
      }

      if (aLower === 'bò' || aLower === 'thịt bò' || aLower === 'beef') {
        const isNegated = /(?:không\s+chứa|không\s+có|hoàn\s+toàn\s+không|loại\s+trừ|tránh)\s+(?:thịt\s+)?bò/i.test(lowerResp);
        if (isNegated) continue;

        if (lowerResp.includes('vị bò') || lowerResp.includes('thịt bò') || lowerResp.includes('gân bò')) {
          return { conflict: true, conflictingAllergy: 'thịt bò' };
        }
      }

      if (aLower === 'da bò' || aLower === 'rawhide') {
        const isNegated = /(?:không\s+chứa|không\s+dùng|không\s+có|rawhide-free|không\s+da\s+bò)/i.test(lowerResp);
        if (isNegated) continue;

        if (lowerResp.includes('da bò sống') || lowerResp.includes('rawhide thô')) {
          return { conflict: true, conflictingAllergy: 'da bò' };
        }
      }
    }

    return { conflict: false };
  }

  /**
   * Anti-ban Rate Limit Check (Maximum 150 automated messages/day/Zalo account)
   */
  static async checkDailyRateLimit(orgId: string, zaloAccountId: string): Promise<boolean> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const count = await prisma.aiAuditLog.count({
        where: {
          orgId,
          createdAt: { gte: today },
        },
      });

      // Max 150 automated AI messages per day per system
      if (count >= 150) {
        logger.warn(`[guardrails] Daily AI message quota exceeded (${count}/150) for org ${orgId}`);
        return false;
      }
      return true;
    } catch (err: any) {
      return true;
    }
  }

  /**
   * Check and prevent Breed/Fact Hallucination when Fact status is UNKNOWN
   */
  static checkFactHallucination(responseText: string, knownBreedStatus: 'CONFIRMED' | 'UNKNOWN' | 'INFERRED', confirmedBreed?: string | null): string {
    if (knownBreedStatus === 'UNKNOWN') {
      // If breed is unknown, ensure LLM does not ask for or assume a specific breed
      // E.g. replace "giống Poodle của bé" with "giống của bé"
      const specificBreedPatterns = [
        /\bgiống\s+(?:poodle|corgi|phốc|husky|alaska|golden|chihuahua|mèo anh)\s+của\s+bé\b/gi,
        /\bgiống\s+(?:poodle|corgi|phốc|husky|alaska|golden|chihuahua|mèo anh)\b/gi,
        /\bbé\s+(?:poodle|corgi|phốc|husky|alaska|golden|chihuahua)\b/gi,
      ];

      let cleaned = responseText;
      for (const pattern of specificBreedPatterns) {
        cleaned = cleaned.replace(pattern, (match) => {
          if (match.toLowerCase().includes('giống')) {
            return 'giống cún của bé';
          }
          return 'bé';
        });
      }
      return cleaned;
    }
    return responseText;
  }

  /**
   * Sanitize AI output (remove prompt leaks, internal IDs, JSON code blocks, and markdown markup)
   * Converts markdown formatting to natural plain text suitable for Zalo chat.
   */
  static sanitizeOutput(text: string): string {
    let sanitized = text
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```json[\s\S]*?```/gi, '')
      .replace(/```[\s\S]*?```/gi, '')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
      .trim();

    // Strip markdown formatting for natural plain-text chat on Zalo
    sanitized = sanitized
      .replace(/\*\*(.*?)\*\*/g, '$1') // **bold** -> bold
      .replace(/__(.*?)__/g, '$1')     // __bold__ -> bold
      .replace(/\*(.*?)\*/g, '$1')     // *italic* -> italic
      .replace(/`([^`]+)`/g, '$1')     // `code` -> code
      .replace(/^#+\s*/gm, '')          // ### Header -> Header
      .replace(/\*\*/g, '')            // stray **
      .trim();

    // Remove excessive newlines
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

    return sanitized;
  }

  /**
   * Enforce response length based on intent type.
   * INFO/GENERAL responses capped at ~500 chars.
  /**
   * Enforce response length constraint to prevent AI talking too much.
   * General responses allowed up to 600 chars.
   * BUY/ORDER responses allowed up to 1500 chars.
   * NEVER truncate order item lists (splitMessageIntoChunks handles sending them sequentially).
   */
  static enforceResponseLength(text: string, isBuyingFlow: boolean, hasOrderDraft: boolean = false): string {
    // If the message is an order confirmation/draft listing with bullets, NEVER truncate it!
    const isOrderList = hasOrderDraft || (text.includes('\n- ') && /(?:đơn hàng|sản phẩm|gói|túi|kho)/i.test(text));
    if (isOrderList) {
      return text;
    }

    const maxLength = isBuyingFlow ? 1200 : 600;

    if (!text || text.length <= maxLength) return text;

    // Search for clean sentence / paragraph boundaries within limit
    const truncated = text.substring(0, maxLength);
    const candidateBoundaries = [
      truncated.lastIndexOf('.\n'),
      truncated.lastIndexOf('!\n'),
      truncated.lastIndexOf('?\n'),
      truncated.lastIndexOf('\n- '),
      truncated.lastIndexOf('\n'),
      truncated.lastIndexOf(' ạ.'),
      truncated.lastIndexOf(' ạ!'),
      truncated.lastIndexOf(' nhé!'),
      truncated.lastIndexOf(' nhé.'),
      truncated.lastIndexOf('. '),
      truncated.lastIndexOf('! '),
      truncated.lastIndexOf('? '),
    ];

    const lastSentenceEnd = Math.max(...candidateBoundaries);

    // If a clean sentence boundary is found after 40% of the text, cut cleanly there
    if (lastSentenceEnd > maxLength * 0.4) {
      return text.substring(0, lastSentenceEnd + 1).trim();
    }

    // Otherwise, find last word boundary so we never cut in the middle of a word
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.7) {
      return text.substring(0, lastSpace).trim() + '...';
    }

    return text.trim();
  }

  /**
   * Strip unsolicited CTA (Call To Action) phrases when intent is NOT buying.
   * Removes pushy sales language that the Customer-First report prohibits.
   */
  static stripUnsolicitedCTA(text: string, isBuyingIntent: boolean): string {
    if (isBuyingIntent) return text; // Allow CTA in buying flow

    const ctaPatterns = [
      /(?:anh\/chị|mình|bạn)\s*(?:có\s*)?(?:muốn|cần)\s*(?:mua|đặt|lấy|order)\s*(?:không|ko|hông|hem|k)?\s*(?:ạ|nhé|nha|ha)?[?!]?/gi,
      /(?:em\s*)?(?:lên đơn|chốt đơn|ghi đơn|tạo đơn)\s*(?:cho|giùm|giúp)?\s*(?:anh\/chị|mình|bạn|chị|anh)?\s*(?:luôn|ngay|nhé|nha)?[?!]?/gi,
      /(?:cho em|để em)\s*(?:lên đơn|ghi nhận|chốt)\s*(?:luôn|ngay)?\s*(?:nhé|nha|ạ)?[?!]?/gi,
      /(?:em\s*)?(?:gửi|ship|giao)\s*(?:cho|về)?\s*(?:anh\/chị|mình|chị|anh)?\s*(?:\d+\s*gói)?\s*(?:nhé|nha|luôn)?[?!]?/gi,
      /(?:mua\s*thử|đặt\s*thử|lấy\s*thử)\s*(?:\d+\s*(?:gói|túi|hộp))?\s*(?:nhé|nha|ạ)?[?!]?/gi,
    ];

    let cleaned = text;
    for (const pattern of ctaPatterns) {
      cleaned = cleaned.replace(pattern, '').trim();
    }

    // Clean up trailing/orphaned punctuation or whitespace from removals
    cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();

    return cleaned;
  }

  /**
   * Check and reduce empathy overuse in AI responses.
   * Only allows empathy phrasing when contextually appropriate (concern/complaint detected).
   */
  static checkEmpathyOveruse(text: string, hasCustomerConcern: boolean): string {
    if (hasCustomerConcern) return text; // Empathy is appropriate

    const empathyPatterns = [
      /(?:em\s*(?:rất\s*)?(?:hiểu|thấu hiểu|đồng cảm)\s*(?:lo lắng|nỗi lo|sự lo lắng|tâm trạng|cảm giác)\s*(?:của\s*)?(?:anh\/chị|mình|bạn|chị|anh)\s*(?:ạ|lắm)?[.,!]?\s*)/gi,
      /(?:lo lắng\s*(?:của\s*)?(?:anh\/chị|mình|bạn|chị|anh)\s*(?:là\s*)?(?:hoàn toàn\s*)?(?:chính đáng|hợp lý|dễ hiểu)\s*(?:ạ)?[.,!]?\s*)/gi,
      /(?:em\s*(?:rất\s*)?hiểu\s*(?:ạ|lắm|nhiều)?[.,!]?\s*)/gi,
    ];

    let cleaned = text;
    for (const pattern of empathyPatterns) {
      cleaned = cleaned.replace(pattern, '').trim();
    }

    return cleaned;
  }

  /**
   * Detects if AI generated an unwanted stall/waiting message for a normal query
   * (e.g. "Dạ để em kiểm tra lại... Chị chờ em một chút nha!", "Đợi em tí nhé", "Chờ em một lát để em xem...")
   * Returns true if text is purely an empty stall/wait promise without actual answers.
   */
  static detectUnwantedWaitResponse(text: string): boolean {
    if (!text || text.length > 250) return false;
    const lower = text.toLowerCase();

    const waitPhrases = [
      /(?:chờ|đợi)\s*(?:em|mình|chút|tí|xíu|lát|nha|nhé)/i,
      /(?:để\s*em\s*(?:kiểm tra|tra cứu|xem lại|coi lại|tìm|check)\s*(?:lại)?)/i,
      /(?:chờ\s*(?:em|mình)\s*(?:tìm|tra|check))/i,
    ];

    const hasWait = waitPhrases.some(p => p.test(lower));
    if (!hasWait) return false;

    // Check if the message contains concrete data/SKU or is just a stall
    const hasConcreteData = /\b[BCE]\d{1,3}\b|\bOD-\d+\b|\b\d+[.,]\d+\s*đ\b|\b\d+\s*gói\b|\n-\s+/i.test(text);
    return !hasConcreteData;
  }
}


