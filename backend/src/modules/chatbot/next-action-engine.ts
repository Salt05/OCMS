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

    // 5. Check for Product Safety / Ingredient / Rawhide / Choking specific queries
    if (extracted.intent === 'CHECK_PRODUCT_SAFETY') {
      const targetSku = extracted.productSafetyQuery?.sku;
      return {
        action: targetSku ? 'GET_PRODUCT_DETAIL' : 'PROVIDE_INFO',
        nextState: 'INFORMATION',
        reason: `Khách hỏi thông tin an toàn/thành phần sản phẩm ${targetSku || ''}. Trả lời dựa dữ liệu, KHÔNG CTA.`,
        missingRequiredSlots: [],
        targetSku,
      };
    }

    // Check missing required slots for order completion
    const hasPhone = customer.phone.status === 'CONFIRMED' || !!extracted.phone;
    const hasAddress = customer.address.status === 'CONFIRMED' || !!extracted.address;
    const hasPaymentTermVal = customer.payment_term?.status === 'CONFIRMED' || !!extracted.paymentTerm;
    const missing: string[] = [];
    if (!hasPhone) missing.push('phone');
    if (!hasAddress) missing.push('address');
    if (!hasPaymentTermVal) missing.push('payment_term');

    // 5b. Check for Customer Order Confirmation (e.g. "Đồng ý", "Xác nhận", "OK em", "ok", "được rồi", "ừ")
    // ONLY allow CONFIRM_CUSTOMER_ORDER if ALL required slots (especially payment term) are already confirmed!
    if (extracted.intent === 'CONFIRM_ORDER' && missing.length === 0 && (
      currentState === 'ORDER_COLLECTION' ||
      currentState === 'ORDER_DRAFT' ||
      currentState === 'CONFIRMATION' ||
      hasDraftItems
    )) {
      return {
        action: 'CONFIRM_CUSTOMER_ORDER',
        nextState: 'CONFIRMATION',
        reason: 'Khách hàng đã kiểm tra thông tin và nhắn xác nhận chốt đơn. Chuyển đơn sang trạng thái CONFIRMATION và gửi thông báo tới nhân viên để duyệt sang Odoo.',
        missingRequiredSlots: [],
      };
    }

    // 6. Check for Order Draft Intent (High Buying Intent) or Checkout
    if (extracted.intent === 'ORDER_INTENT' || extracted.intent === 'CONFIRM_ORDER' || extracted.buyingIntentLevel === 'HIGH' || currentState === 'ORDER_COLLECTION' || currentState === 'ORDER_DRAFT') {
      return {
        action: 'CREATE_ORDER_DRAFT',
        nextState: 'ORDER_COLLECTION',
        reason: missing.length === 0
          ? 'Đã có đầy đủ danh sách món, số lượng, SĐT, địa chỉ nhận hàng và điều khoản thanh toán. Giữ ở ORDER_COLLECTION để nhắc lại toàn bộ đơn và yêu cầu khách nhắn xác nhận lại trước khi tạo đơn sang Odoo.'
          : `Khách bày tỏ ý định mua rõ ràng. Còn thiếu: ${missing.join(', ')}. Tiến hành thu thập thông tin giao hàng & điều khoản thanh toán.`,
        missingRequiredSlots: missing,
      };
    }

    // 7. Check for Price / Inventory Direct Queries (INFO-only, no CTA)
    if (extracted.intent === 'ASK_PRICE') {
      return {
        action: 'CHECK_PRICE',
        nextState: 'INFORMATION',
        reason: 'Khách hỏi giá. Trả lời giá, DỪNG. KHÔNG tự mời mua.',
        missingRequiredSlots: [],
      };
    }

    if (extracted.intent === 'CHECK_INVENTORY') {
      return {
        action: 'CHECK_INVENTORY',
        nextState: 'INFORMATION',
        reason: 'Khách kiểm tra tồn kho. Trả lời, KHÔNG CTA.',
        missingRequiredSlots: [],
      };
    }

    // 7b. Pure information-seeking queries (thành phần, công dụng, đặc điểm...)
    if (extracted.intent === 'INFORMATION_SEEKING') {
      return {
        action: 'PROVIDE_INFO',
        nextState: 'INFORMATION',
        reason: 'Khách hỏi thông tin thuần túy. Trả lời ngắn gọn 1-2 câu, DỪNG. KHÔNG CTA.',
        missingRequiredSlots: [],
      };
    }

    // 7. Evaluate Pet Profile Completeness for Consultation
    const hasPetType = pet.type.status === 'CONFIRMED';
    const hasAge = pet.age_months.status === 'CONFIRMED';
    const hasBreed = pet.breed.status === 'CONFIRMED';
    const hasWeight = pet.weight_kg.status === 'CONFIRMED';
    const hasTexture = pet.texture_preference.status === 'CONFIRMED';

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
    if (extracted.intent === 'ASK_RECOMMENDATION' || currentState === 'DISCOVERY' || currentState === 'NEW') {
      const askSlots: string[] = [];
      if (!hasBreed) askSlots.push('breed');
      if (!hasWeight) askSlots.push('weight_kg');
      if (!hasTexture && (pet.age_months.value || 0) <= 6) askSlots.push('texture_preference');

      return {
        action: 'ASK_CLARIFICATION',
        nextState: 'WAITING_FOR_CUSTOMER_INFO',
        reason: 'Chưa đủ thông tin để chọn sản phẩm phù hợp nhất',
        missingRequiredSlots: askSlots,
        suggestedQuestions: [
          'Bé nhà mình giống gì và nặng bao nhiêu kg ạ? Bé thích dòng mềm dễ nhai hay giòn rụm để em chọn mẫu phù hợp nhé!',
        ],
      };
    }

    // SCENARIO C: Greeting
    if (extracted.intent === 'GREETING') {
      return {
        action: 'ANSWER',
        nextState: 'GREETING',
        reason: 'Khách chào hỏi. Đáp ngắn gọn, thân thiện.',
        missingRequiredSlots: [],
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
