/**
 * persona-extractor.ts — Analyzes conversation rhythm, tone, and staff-customer pronouns,
 * and classifies whether pending customer messages warrant an auto-reply upon AI resume.
 */
import { logger } from '../../shared/utils/logger.js';

export interface ExtractedPersona {
  selfPronoun: string;         // 'em' | 'mình' | 'shop'
  customerPronoun: string;     // 'chị' | 'anh' | 'bạn' | 'cô' | 'chú' | 'mình' | 'anh/chị'
  customerName?: string;       // e.g. 'Lan', 'Dũng'
  formalityLevel: 'polite' | 'casual' | 'standard';
  friendlinessLevel: 'high' | 'normal';
  usesEmoji: boolean;
  typicalEmojis: string[];
  conversationMomentum: string;
  promptInstruction: string;
}

export interface PendingIntentEvaluation {
  shouldReply: boolean;
  reason: string;
  isCaseA: boolean;
  pendingText?: string;
}

export class PersonaToneExtractor {
  /**
   * Analyze recent conversation messages to extract persona, pronouns, tone, and rhythm.
   */
  static extractPersonaAndTone(
    messages: any[],
    defaultCustomerName?: string,
    savedPronoun?: { customerPronoun?: string; selfPronoun?: string }
  ): ExtractedPersona {
    let selfPronoun = savedPronoun?.selfPronoun || 'em';
    let customerPronoun = savedPronoun?.customerPronoun || 'anh/chị';
    let detectedName = defaultCustomerName?.trim() || '';

    const getShortFriendlyName = (full: string) => {
      if (!full) return '';
      const parts = full.trim().split(/\s+/).filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : full;
    };
    const shortName = getShortFriendlyName(detectedName);

    let politeCount = 0;
    let friendlyCount = 0;
    let staffMessageCount = 0;
    const detectedEmojis: string[] = [];

    // Common standard Vietnamese emojis used in customer care
    const emojiRegex = /([\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])/gu;

    const staffMessages = messages.filter(m => m.senderType === 'self' && m.content);
    const customerMessages = messages.filter(m => m.senderType === 'contact' && m.content);

    // 1. Analyze Staff messages for selfPronoun, customerPronoun, tone, and emojis
    for (const msg of staffMessages) {
      const text = (msg.content || '').trim();
      if (!text) continue;
      staffMessageCount++;

      // Check self pronouns used by staff
      if (/\b(shop|bên shop|bên em)\b/i.test(text) && !/\bem\b/i.test(text)) {
        selfPronoun = 'shop';
      } else if (/\bmình\b/i.test(text) && !/\bem\b/i.test(text)) {
        selfPronoun = 'mình';
      } else if (/\bem\b/i.test(text)) {
        selfPronoun = 'em';
      }

      // Check customer addressing pronouns used by staff
      const chiMatch = text.match(/\bchị\s+([A-ZÀ-Ỹa-zà-ỹ]+)/i);
      const anhMatch = text.match(/\banh\s+([A-ZÀ-Ỹa-zà-ỹ]+)/i);
      const coMatch = text.match(/\bcô\s+([A-ZÀ-Ỹa-zà-ỹ]+)/i);
      const chuMatch = text.match(/\bchú\s+([A-ZÀ-Ỹa-zà-ỹ]+)/i);

      if (chiMatch && chiMatch[1] && !['mình', 'em', 'ơi', 'nhé', 'nha', 'ạ', 'gái'].includes(chiMatch[1].toLowerCase())) {
        customerPronoun = `chị ${chiMatch[1]}`;
        detectedName = chiMatch[1];
      } else if (anhMatch && anhMatch[1] && !['mình', 'em', 'ơi', 'nhé', 'nha', 'ạ', 'trai'].includes(anhMatch[1].toLowerCase())) {
        customerPronoun = `anh ${anhMatch[1]}`;
        detectedName = anhMatch[1];
      } else if (coMatch && coMatch[1] && !['mình', 'ơi', 'nhé', 'nha', 'ạ'].includes(coMatch[1].toLowerCase())) {
        customerPronoun = `cô ${coMatch[1]}`;
        detectedName = coMatch[1];
      } else if (chuMatch && chuMatch[1] && !['mình', 'ơi', 'nhé', 'nha', 'ạ'].includes(chuMatch[1].toLowerCase())) {
        customerPronoun = `chú ${chuMatch[1]}`;
        detectedName = chuMatch[1];
      } else if (/\bchị\b/i.test(text)) {
        customerPronoun = 'chị';
      } else if (/\banh\b/i.test(text)) {
        customerPronoun = 'anh';
      } else if (/\bcô\b/i.test(text)) {
        customerPronoun = 'cô';
      } else if (/\bchú\b/i.test(text)) {
        customerPronoun = 'chú';
      } else if (/\bbạn\b/i.test(text)) {
        customerPronoun = 'bạn';
      }

      // Check politeness & friendliness markers
      if (/\b(dạ|vâng|ạ|cảm ơn|kính chào)\b/i.test(text)) politeCount++;
      if (/\b(nhé|nha|nè|ha|nhen|nhé ạ|nha chị|nha anh)\b/i.test(text)) friendlyCount++;

      // Check emojis
      const foundEmojis = text.match(emojiRegex);
      if (foundEmojis) {
        for (const emo of foundEmojis) {
          if (!detectedEmojis.includes(emo)) {
            detectedEmojis.push(emo);
          }
        }
      }
    }

    // 2. Cross-check with Customer messages for self-reference (e.g. customer says "Chị ở Cầu Giấy", "Anh cần mua...")
    for (const msg of customerMessages) {
      const text = (msg.content || '').trim();
      if (!text) continue;

      if (/^(?:chị|chi)\b/i.test(text) || /\b(?:chị|chi)\s+(?:ở|muốn|cần|lấy|đặt|mua|hỏi)\b/i.test(text)) {
        customerPronoun = 'chị';
      } else if (/^(?:anh)\b/i.test(text) || /\b(?:anh)\s+(?:ở|muốn|cần|lấy|đặt|mua|hỏi)\b/i.test(text)) {
        customerPronoun = 'anh';
      } else if (/^(?:cô)\b/i.test(text) || /\b(?:cô)\s+(?:ở|muốn|cần|lấy|đặt|mua|hỏi)\b/i.test(text)) {
        customerPronoun = 'cô';
      } else if (/^(?:chú|chu)\b/i.test(text) || /\b(?:chú|chu)\s+(?:ở|muốn|cần|lấy|đặt|mua|hỏi)\b/i.test(text)) {
        customerPronoun = 'chú';
      } else if (/^(?:mình|em)\b/i.test(text) && customerPronoun === 'anh/chị') {
        if (/^(?:em)\b/i.test(text)) customerPronoun = 'bạn';
      }
    }

    const formalityLevel: 'polite' | 'casual' | 'standard' =
      politeCount >= Math.max(1, staffMessageCount * 0.4) ? 'polite' : 'standard';
    const friendlinessLevel: 'high' | 'normal' =
      friendlyCount >= Math.max(1, staffMessageCount * 0.3) ? 'high' : 'normal';
    const usesEmoji = detectedEmojis.length > 0;

    // Pick 1-2 standard pleasant emojis if detected or default friendly ones
    const safeEmojis = usesEmoji ? detectedEmojis.slice(0, 3).join(' ') : '😊';

    // 3. Assemble prompt instruction
    const promptInstruction = `
================================================================================
[PHONG CÁCH & XƯNG HÔ KẾ THỪA TỪ NHÂN VIÊN]:
- CÁCH XƯNG HÔ ĐÃ THIẾT LẬP:
  + Tự xưng: "${selfPronoun}"
  + Gọi khách hàng: "${customerPronoun}"
  + TUYỆT ĐỐI giữ chuẩn cách xưng hô này (ví dụ: "${selfPronoun}" - "${customerPronoun}") để cuộc trò chuyện hoàn toàn liền mạch như chính nhân viên đang tư vấn.
- GIỌNG ĐIỆU GIAO TIẾP:
  + Mức độ lịch sự: ${formalityLevel === 'polite' ? 'Rất lịch sự, nhã nhặn, dùng từ đệm "Dạ", "ạ" đúng chỗ.' : 'Lịch sự, chuyên nghiệp, tự nhiên.'}
  + Tính cách: ${friendlinessLevel === 'high' ? 'Thân thiện, niềm nở, dùng từ kết thúc nhẹ nhàng như "nhé ạ", "nha ' + customerPronoun + '".' : 'Nhẹ nhàng, chu đáo, súc tích.'}
  + Sử dụng icon/emoji: ${usesEmoji ? `Có thể chèn biểu cảm nhẹ nhàng, phù hợp ngữ cảnh (${safeEmojis}), không lạm dụng.` : 'Dùng icon tự nhiên, vừa phải (ví dụ: 😊).'}
- NHỊP ĐIỆU HỘI THOẠI:
  + Tiếp nối tự nhiên luồng trao đổi của nhân viên trước đó, không chào hỏi lại từ đầu nếu đang trong cùng mạch câu chuyện.
================================================================================
`;

    return {
      selfPronoun,
      customerPronoun,
      customerName: detectedName || undefined,
      formalityLevel,
      friendlinessLevel,
      usesEmoji,
      typicalEmojis: detectedEmojis,
      conversationMomentum: 'Ongoing conversation context maintained',
      promptInstruction,
    };
  }

  /**
   * Evaluate recent unreplied customer messages upon Chatbot resume.
   * Determines if the pending message is Case A (Inquiry/Purchase/Question -> Needs reply)
   * or Case B (Gratitude/Farewell/Closing/ThumbsUp -> No reply needed).
   */
  static evaluatePendingCustomerIntent(recentMessages: any[]): PendingIntentEvaluation {
    if (!recentMessages || recentMessages.length === 0) {
      return {
        shouldReply: false,
        reason: 'Không có tin nhắn nào trong lịch sử',
        isCaseA: false,
      };
    }

    const lastMsg = recentMessages[recentMessages.length - 1];
    // If the last message was sent by self (staff or AI), nothing is pending
    if (lastMsg.senderType === 'self') {
      return {
        shouldReply: false,
        reason: 'Tin nhắn gần nhất đã được nhân viên/AI phản hồi',
        isCaseA: false,
      };
    }

    // Collect all consecutive unreplied customer messages from the end
    const unrepliedCustomerMsgs: any[] = [];
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const m = recentMessages[i];
      if (m.senderType === 'contact') {
        unrepliedCustomerMsgs.unshift(m);
      } else {
        break; // Reached staff/AI message
      }
    }

    if (unrepliedCustomerMsgs.length === 0) {
      return {
        shouldReply: false,
        reason: 'Không có tin nhắn chờ từ khách hàng',
        isCaseA: false,
      };
    }

    const combinedText = unrepliedCustomerMsgs
      .map(m => (m.content || '').trim())
      .filter(Boolean)
      .join('\n');

    if (!combinedText) {
      return {
        shouldReply: false,
        reason: 'Tin nhắn khách hàng trống hoặc chỉ có tệp đính kèm không có nội dung chữ',
        isCaseA: false,
      };
    }

    // Check message age: If last message is older than 3 days (72 hours), do not auto-spam cold
    const lastSentAt = new Date(lastMsg.sentAt || Date.now()).getTime();
    const hoursSinceLastMsg = (Date.now() - lastSentAt) / (1000 * 60 * 60);
    if (hoursSinceLastMsg > 72) {
      logger.info(`[persona-extractor] Pending customer message is ${hoursSinceLastMsg.toFixed(1)}h old (>72h). Skipping auto-reply.`);
      return {
        shouldReply: false,
        reason: `Tin nhắn khách hàng đã quá cũ (${hoursSinceLastMsg.toFixed(1)} giờ trước). Không tự động trả lời để tránh làm phiền khách.`,
        isCaseA: false,
      };
    }

    const textLower = combinedText.toLowerCase();

    // =========================================================================
    // CASE B: GRATITUDE / FAREWELL / CLOSING REMARKS / SIMPLE CONFIRMATION
    // (Khách chỉ cảm ơn, tạm biệt, thả like, đã xong việc -> KHÔNG trả lời)
    // =========================================================================
    const isPureGratitudeOrClosing =
      /^(?:dạ\s*)?(?:cảm ơn|cam on|cảm ơn bạn|cảm ơn shop|cảm ơn nha|cảm ơn nhé|cảm ơn em|cảm ơn chị|cảm ơn anh|tks|thanks|thank you|thank shop|thank u|dạ vâng|da vang|vâng ạ|vang a|ok bạn|ok shop|oke bạn|oke shop|ok|oke|okie|oki|dạ ok|dạ oke|dạ oki|tạm biệt|bye|bye bye|bai|gặp lại sau|chúc shop đắt hàng|mình biết rồi|mình nhận được rồi|đã nhận được|đã nhận|đã hiểu)(?:\s*(?:ạ|nhé|nha|nhen|nhe|shop|bạn|em|chị|anh))?[\s.!?~]*$/i.test(
        textLower
      );

    const isPureReactionOrSticker =
      /^[\p{Extended_Pictographic}\p{Emoji}\s.,!?~👍❤️🐾🙏😊✨]+$/u.test(combinedText) && !combinedText.includes('?');

    if (isPureGratitudeOrClosing || isPureReactionOrSticker) {
      logger.info(`[persona-extractor] Classified as CASE B (Closing/Gratitude: "${combinedText}"). No auto-reply needed.`);
      return {
        shouldReply: false,
        reason: 'Khách hàng gửi lời cảm ơn, chào tạm biệt hoặc xác nhận kết thúc hội thoại (Case B)',
        isCaseA: false,
        pendingText: combinedText,
      };
    }

    // =========================================================================
    // CASE A: INQUIRIES / QUESTIONS / PRODUCT / ORDERS / GREETINGS
    // (Khách có câu hỏi, thắc mắc, mua hàng, tư vấn -> TỰ ĐỘNG PHẢN HỒI)
    // =========================================================================
    const hasQuestion =
      combinedText.includes('?') ||
      /\b(hỏi|sao|nào|bao nhiêu|nhiêu|mấy|ở đâu|khi nào|bao lâu|gì|thế nào|không|k|ko|được không|đc k|đc ko|sao ạ|nào ạ|nhỉ|nhờ shop|tư vấn|báo giá|check giá|giá sỉ|giá lẻ)\b/i.test(
        textLower
      );

    const hasBuyingOrProductIntent =
      /\b(mua|lấy|đặt|lên đơn|tạo đơn|chốt đơn|ship|giao|gửi|gói|bịch|hộp|thùng|còn hàng|hết hàng|loại|mẫu|mã|sku|que gặm|thịt sấy|xương|bánh thưởng|chó|cún|mèo|poodle|corgi|alaska|golden|pug|mèo anh|mèo ta|mềm|giòn|dị ứng)\b/i.test(
        textLower
      );

    const hasGreeting =
      /\b(alo|chào|hello|hi shop|shop ơi|ad ơi|bạn ơi|em ơi|chị ơi|anh ơi|có ai trực không|có ai ở đây không)\b/i.test(
        textLower
      );

    const isCaseA = hasQuestion || hasBuyingOrProductIntent || hasGreeting || combinedText.length > 5;

    if (isCaseA) {
      logger.info(`[persona-extractor] Classified as CASE A (Inquiry/Purchase: "${combinedText}"). Auto-reply will trigger.`);
      return {
        shouldReply: true,
        reason: 'Khách hàng có câu hỏi, thắc mắc, chào hỏi hoặc nhu cầu mua sắm cần phản hồi (Case A)',
        isCaseA: true,
        pendingText: combinedText,
      };
    }

    // Default fallback
    return {
      shouldReply: false,
      reason: 'Nội dung tin nhắn không thuộc nhóm cần phản hồi tự động',
      isCaseA: false,
      pendingText: combinedText,
    };
  }
}
