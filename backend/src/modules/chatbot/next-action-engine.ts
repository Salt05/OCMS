/**
 * Next Action Engine for AI Auto Chat.
 * Decides deterministic next action before LLM generation.
 * Eliminates generic responses, guides conversational sales flow,
 * supports Product Grounding, Product Comparison, and respectful Objection Handling.
 */
import {
  StructuredPetProfile,
  StructuredCustomerProfile,
} from './customer-fact-model.js';
import { ExtractedSlots } from './slot-extractor.js';

export type NextActionType =
  | 'ASK_CLARIFICATION'
  | 'SEARCH_PRODUCT'
  | 'GET_PRODUCT_DETAIL'
  | 'COMPARE_PRODUCTS'
  | 'CHECK_PRICE'
  | 'CHECK_INVENTORY'
  | 'PROVIDE_INFO'
  | 'ANSWER'
  | 'HANDLE_OBJECTION'
  | 'CREATE_ORDER_DRAFT'
  | 'CONFIRM_CUSTOMER_ORDER'
  | 'HANDOFF_HUMAN'
  | 'HANDOFF_HUMAN_SILENT'
  | 'WAIT'
  | 'END_CONVERSATION';

export type ConversationState =
  | 'NEW'
  | 'GREETING'
  | 'DISCOVERY'
  | 'INFORMATION'
  | 'CONSIDERATION'
  | 'WAITING_FOR_CUSTOMER_INFO'
  | 'CUSTOMER_INFO_RECEIVED'
  | 'PRODUCT_SEARCH'
  | 'PRODUCT_RECOMMENDATION'
  | 'PRICE_DISCUSSION'
  | 'OBJECTION'
  | 'BUYING_INTENT'
  | 'ORDER_COLLECTION'
  | 'ORDER_DRAFT'
  | 'CONFIRMATION'
  | 'WAIT'
  | 'HUMAN_REVIEW'
  | 'HUMAN_REQUESTED'
  | 'AI_PAUSED'
  | 'HUMAN_ACTIVE'
  | 'ERROR';

export interface NextActionDecision {
  action: NextActionType;
  nextState: ConversationState;
  reason: string;
  missingRequiredSlots: string[];
  suggestedQuestions?: string[];
  productSearchQuery?: {
    query: string;
    category?: string;
    brand?: string;
    petType?: 'dog' | 'cat' | 'all';
    excludeIngredients?: string[];
    texturePreference?: string;
    ageMonths?: number;
    weightKg?: number;
  };
  comparisonSkus?: string[];
  targetSku?: string;
  handoffReason?: string;
}

export class NextActionEngine {
  /**
   * Evaluates current facts, state, and extracted message to decide next action
   */
  static decide(
    currentState: ConversationState,
    pet: StructuredPetProfile,
    customer: StructuredCustomerProfile,
    extracted: ExtractedSlots,
    lastAiQuestion?: string | null,
    pendingSlots: string[] = [],
    hasPaymentTerm: boolean = false,
    hasDraftItems: boolean = false
  ): NextActionDecision {
    // 0. Check for Unhandled / Out-of-scope Situation (Silent Handoff to staff)
    if (extracted.intent === 'UNHANDLED_SITUATION') {
      return {
        action: 'HANDOFF_HUMAN_SILENT',
        nextState: 'HUMAN_REQUESTED',
        reason: 'Khách hàng có yêu cầu chưa được thiết lập hoặc ngoài quy định hệ thống (đàm phán riêng/công nợ ngoài quy định)',
        missingRequiredSlots: [],
        handoffReason: 'Yêu cầu chưa thiết lập trong hệ thống (đàm phán riêng/công nợ ngoài quy định)',
      };
    }

    // 1. Check for Direct Human Handoff Request
    if (extracted.intent === 'HANDOFF_REQUEST') {
      return {
        action: 'HANDOFF_HUMAN',
        nextState: 'HUMAN_REQUESTED',
        reason: 'Khách hàng có yêu cầu khiếu nại hoặc muốn gặp trực tiếp nhân viên tư vấn',
        missingRequiredSlots: [],
        handoffReason: 'Khách yêu cầu gặp tư vấn viên trực tiếp',
      };
    }

    // 2. Check for Farewell / End Conversation
    if (extracted.intent === 'FAREWELL') {
      return {
        action: 'END_CONVERSATION',
        nextState: 'WAIT',
        reason: 'Khách hàng chào tạm biệt / cảm ơn. Đáp lại thân thiện, ngắn gọn.',
        missingRequiredSlots: [],
      };
    }

    // 2b. Check for Greeting / Starting Conversation / Unclear Message
    const isStartingSession = currentState === 'NEW' || currentState === 'GREETING';
    if ((extracted.intent === 'GREETING' && isStartingSession) || (currentState === 'NEW' && extracted.intent === 'GENERAL_QUERY')) {
      return {
        action: 'ANSWER',
        nextState: 'GREETING',
        reason: 'Mở đầu cuộc trò chuyện. Chào khách và hỏi khách muốn đặt hàng, giải đáp thắc mắc hay cần tư vấn sản phẩm gì.',
        missingRequiredSlots: [],
        suggestedQuestions: [
          'Dạ em chào anh/chị ạ! Em có thể hỗ trợ gì cho mình hôm nay ạ? Mình đang muốn đặt hàng, giải đáp thắc mắc hay cần tư vấn sản phẩm nào ạ?',
        ],
      };
    }

    // 2c. Check for Clarifying Question about Items/SKUs (e.g. "C10-2 hay là C10?" or "2 món xương nơ da bò trắng vàng có mã là gì")
    if (extracted.intent === 'CLARIFY_ORDER_ITEM') {
      const isSkuQuery = Boolean(extracted.skuInquiryQuery);
      return {
        action: isSkuQuery ? 'SEARCH_PRODUCT' : 'ANSWER',
        nextState: currentState === 'ORDER_DRAFT' || currentState === 'ORDER_COLLECTION' ? currentState : 'CONSIDERATION',
        reason: isSkuQuery
          ? `Khách hàng đang hỏi mã SKU của sản phẩm: "${extracted.skuInquiryQuery}". Bắt buộc tra cứu sản phẩm trong kho và trả lời ngay kết quả mã SKU cụ thể, TUYỆT ĐỐI KHÔNG xin chờ!`
          : 'Khách hàng đang hỏi để làm rõ sự khác nhau giữa các mã sản phẩm. Trả lời giải thích rõ ràng, TUYỆT ĐỐI KHÔNG tự ý coi đây là lệnh sửa đơn!',
        missingRequiredSlots: [],
        productSearchQuery: isSkuQuery ? { query: extracted.skuInquiryQuery! } : undefined,
      };
    }

    // 2d. Check if customer asks about remaining items (e.g. "còn nữa không", "thiếu món nào không")
    if (extracted.intent === 'CHECK_REMAINING_ITEMS') {
      return {
        action: 'ANSWER',
        nextState: currentState === 'ORDER_DRAFT' || currentState === 'ORDER_COLLECTION' ? currentState : 'ORDER_COLLECTION',
        reason: 'Khách hàng hỏi còn món nào nữa không hoặc kiểm tra danh sách có đủ chưa. Trình bày đầy đủ 100% tất cả các món trong đơn hàng nháp.',
        missingRequiredSlots: [],
      };
    }

    // 3. Check for Objection Handling (e.g. "Thôi em chưa mua, để chị suy nghĩ", "Sợ bé còn nhỏ")
    if (extracted.intent === 'HANDLE_OBJECTION' || extracted.objectionType !== 'NONE') {
      if (extracted.objectionType === 'THINKING_ABOUT_IT') {
        return {
          action: 'END_CONVERSATION',
          nextState: 'WAIT',
          reason: 'Khách chưa sẵn sàng mua / muốn suy nghĩ thêm. Tôn trọng quyết định, chúc vui vẻ, sẵn sàng hỗ trợ khi cần. KHÔNG chèo kéo.',
          missingRequiredSlots: [],
        };
      }

      if (extracted.objectionType === 'AGE_CONCERN') {
        return {
          action: 'SEARCH_PRODUCT',
          nextState: 'CONSIDERATION',
          reason: 'Khách băn khoăn về độ tuổi/độ cứng. Gợi ý dòng que gặm mềm Rawhide-Free cho cún nhỏ.',
          missingRequiredSlots: [],
          productSearchQuery: {
            query: 'que gặm mềm cún con',
            petType: 'dog',
            ageMonths: pet.age_months.value || 4,
            texturePreference: 'soft',
          },
        };
      }
    }

    // 4. Check for Product Comparison Query (e.g. "C14 với DB-VP01 cái nào tốt hơn?")
    if (extracted.intent === 'COMPARE_PRODUCTS' && extracted.comparisonSkus && extracted.comparisonSkus.length > 0) {
      return {
        action: 'COMPARE_PRODUCTS',
        nextState: 'INFORMATION',
        reason: `Khách yêu cầu so sánh sản phẩm: ${extracted.comparisonSkus.join(', ')}. Trả lời trung thực, KHÔNG CTA.`,
        missingRequiredSlots: [],
        comparisonSkus: extracted.comparisonSkus,
      };
    }

    // 5. Check for Price Query (e.g. "C28 giá bao nhiêu?", "Báo giá cho anh")
    if (extracted.intent === 'ASK_PRICE') {
      return {
        action: 'CHECK_PRICE',
        nextState: 'PRICE_DISCUSSION',
        reason: 'Khách hỏi giá sản phẩm. Báo giá đại lý / sỉ kèm chương trình khuyến mãi nếu có.',
        missingRequiredSlots: [],
      };
    }

    // 6. Check for Product Detail / Safety / Ingredient Query (e.g. "C14 thành phần là gì?", "C14 có phải rawhide không?")
    if (extracted.intent === 'CHECK_PRODUCT_SAFETY' || extracted.intent === 'INFORMATION_SEEKING') {
      const targetSku = extracted.productSafetyQuery?.sku;
      return {
        action: 'GET_PRODUCT_DETAIL',
        nextState: 'INFORMATION',
        reason: `Khách tìm hiểu thông tin / tính an toàn của sản phẩm ${targetSku || 'sản phẩm'}. Cung cấp thông tin khách quan, chính xác từ CSDL.`,
        missingRequiredSlots: [],
        targetSku,
      };
    }

    // 7. Check for Buying Intent (Order Draft Extraction)
    const isBuyingIntent =
      extracted.intent === 'ORDER_INTENT' ||
      extracted.buyingIntentLevel === 'HIGH' ||
      currentState === 'BUYING_INTENT' ||
      currentState === 'ORDER_COLLECTION' ||
      currentState === 'ORDER_DRAFT' ||
      (currentState === 'CUSTOMER_INFO_RECEIVED' && hasDraftItems) ||
      !!extracted.orderQuantity ||
      Boolean(extracted.paymentTerm);

    if (isBuyingIntent) {
      const missingRequiredSlots: string[] = [];
      const hasPhone = customer.phone.status === 'CONFIRMED' || !!extracted.phone;
      const hasAddress = customer.address.status === 'CONFIRMED' || !!extracted.address;

      if (!hasPhone) missingRequiredSlots.push('phone');
      if (!hasAddress) missingRequiredSlots.push('address');
      if (!hasPaymentTerm && customer.payment_term?.status !== 'CONFIRMED' && !extracted.paymentTerm) {
        missingRequiredSlots.push('payment_term');
      }

      return {
        action: 'CREATE_ORDER_DRAFT',
        nextState: 'ORDER_COLLECTION',
        reason: missingRequiredSlots.length === 0
          ? 'Đã có đầy đủ thông tin đơn hàng. Tiến hành tạo đơn nháp.'
          : 'Khách hàng có ý định đặt hàng. Bóc tách sản phẩm, số lượng, điều khoản thanh toán và các thông tin liên quan.',
        missingRequiredSlots,
      };
    }

    // 8. Recommendation Discovery
    const hasBreed = pet.breed.status === 'CONFIRMED' || !!extracted.breed;
    const hasAge = pet.age_months.status === 'CONFIRMED' || !!extracted.ageMonths;
    const hasWeight = pet.weight_kg.status === 'CONFIRMED' || !!extracted.weightKg;
    const hasTexture = pet.texture_preference.status === 'CONFIRMED' || !!extracted.texturePreference;
    const hasPetType = pet.type.status === 'CONFIRMED' || !!extracted.petType;

    // If user was answering previous question
    const isAnsweringPrevious = pendingSlots.some(s => extracted.answeredPendingSlots.includes(s));

    // SCENARIO A: If customer gave enough core info (e.g. puppy 4 months + Poodle 2.5kg + soft texture)
    // OR customer explicitly specified age + texture preference -> SEARCH & RECOMMEND!
    if ((hasAge && (hasBreed || hasWeight || hasTexture)) || (hasBreed && hasAge) || (hasAge && hasPetType && isAnsweringPrevious)) {
      const texture = pet.texture_preference.value || 'soft';
      const age = pet.age_months.value || 4;
      const breed = pet.breed.value || '';
      const weight = pet.weight_kg.value ? `${pet.weight_kg.value}kg` : '';

      let query = 'que gặm sạch răng';
      if (texture === 'soft' || age <= 6) {
        query = 'que gặm mềm sạch răng cho cún con';
      }

      return {
        action: 'SEARCH_PRODUCT',
        nextState: 'PRODUCT_RECOMMENDATION',
        reason: `Đã có đủ dữ liệu dinh dưỡng (Tuổi: ${age} tháng, Giống: ${breed || 'Chưa rõ'}, Cân nặng: ${weight || 'Chưa rõ'}, Độ mềm: ${texture}). Tiến hành tra cứu sản phẩm tối ưu.`,
        missingRequiredSlots: [],
        productSearchQuery: {
          query,
          petType: pet.type.value || 'dog',
          excludeIngredients: pet.allergies.value || [],
          texturePreference: texture,
          ageMonths: age,
          weightKg: pet.weight_kg.value || undefined,
        },
      };
    }

    // SCENARIO B: If customer is initiating discovery, but we lack basic info
    // Ask missing info precisely WITHOUT hallucinating any facts!
    if (extracted.intent === 'ASK_RECOMMENDATION' || currentState === 'DISCOVERY') {
      const askSlots: string[] = [];
      if (!hasBreed) askSlots.push('breed');
      if (!hasWeight) askSlots.push('weight_kg');
      if (!hasTexture && (pet.age_months.value || 0) <= 6) askSlots.push('texture_preference');

      return {
        action: 'ASK_CLARIFICATION',
        nextState: 'WAITING_FOR_CUSTOMER_INFO',
        reason: 'Khách hỏi tư vấn chọn sản phẩm. Hỏi ngắn gọn để tìm sản phẩm phù hợp.',
        missingRequiredSlots: askSlots,
        suggestedQuestions: [
          'Dạ bé nhà mình thuộc giống cún nào và mấy tháng tuổi ạ để em tìm loại phù hợp nhất cho bé nhé!',
        ],
      };
    }

    // Default: PROVIDE_INFO instead of auto-searching products
    // Customer-First: Don't aggressively push products, respond naturally
    return {
      action: 'PROVIDE_INFO',
      nextState: 'INFORMATION',
      reason: 'Trả lời câu hỏi khách hàng. Ngắn gọn, đúng trọng tâm, KHÔNG tự mời mua.',
      missingRequiredSlots: [],
    };
  }
}
