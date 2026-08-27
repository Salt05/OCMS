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
   * Check allergy safety against product recommendations
   */
  static checkAllergyConflict(responseText: string, allergies: string[]): { conflict: boolean; conflictingAllergy?: string } {
    if (!allergies || allergies.length === 0) return { conflict: false };

    const lowerResp = responseText.toLowerCase();
    for (const allergy of allergies) {
      const aLower = allergy.toLowerCase();
      if (aLower === 'gà' || aLower === 'thịt gà' || aLower === 'chicken') {
        // Look for chicken SKUs or phrases
        if (lowerResp.includes('quấn gà') || lowerResp.includes('thịt gà') || lowerResp.includes('c24') || lowerResp.includes('c11')) {
          return { conflict: true, conflictingAllergy: 'thịt gà' };
        }
      }
      if (aLower === 'da bò' || aLower === 'rawhide') {
        if (lowerResp.includes('da bò sống')) {
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
   * INFO/GENERAL responses capped at ~300 chars.
   * BUY/ORDER responses allowed up to 600 chars.
   */
  static enforceResponseLength(text: string, isBuyingFlow: boolean): string {
    const maxLength = isBuyingFlow ? 600 : 300;

    if (text.length <= maxLength) return text;

    // Try to cut at the last sentence boundary within limit
    const truncated = text.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('ạ.'),
      truncated.lastIndexOf('ạ!'),
      truncated.lastIndexOf('nhé!'),
      truncated.lastIndexOf('nhé.'),
      truncated.lastIndexOf('. '),
      truncated.lastIndexOf('! '),
    );

    if (lastSentenceEnd > maxLength * 0.5) {
      return text.substring(0, lastSentenceEnd + 2).trim();
    }

    return truncated.trim();
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
}

