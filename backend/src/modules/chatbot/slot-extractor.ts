/**
 * Deterministic & Rule-based Slot Extractor for AI Auto Chat.
 * Extracts Pet facts, Customer facts, texture preferences, allergies,
 * corrections, customer stage, buying intent level, and objections.
 */
import {
  StructuredPetProfile,
  StructuredCustomerProfile,
  updateFact,
} from './customer-fact-model.js';

export type CustomerStage =
  | 'EXPLORING'
  | 'CONSIDERING'
  | 'COMPARING'
  | 'OBJECTION'
  | 'READY_TO_BUY'
  | 'ORDERING'
  | 'POST_PURCHASE';

export type BuyingIntentLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_INTENT';

export type ObjectionType =
  | 'AGE_CONCERN'
  | 'HARDNESS_CONCERN'
  | 'INGREDIENT_SAFETY_CONCERN'
  | 'PRICE_CONCERN'
  | 'THINKING_ABOUT_IT'
  | 'NONE';

export interface ExtractedSlots {
  isCorrection: boolean;
  intent:
    | 'GREETING'
    | 'FAREWELL'
    | 'PROVIDE_INFO'
    | 'INFORMATION_SEEKING'
    | 'ASK_RECOMMENDATION'
    | 'ASK_PRICE'
    | 'CHECK_INVENTORY'
    | 'COMPARE_PRODUCTS'
    | 'CHECK_PRODUCT_SAFETY'
    | 'HANDLE_OBJECTION'
    | 'ORDER_INTENT'
    | 'CONFIRM_ORDER'
    | 'ASK_ORDER_STATUS'
    | 'HANDOFF_REQUEST'
    | 'COMPLAINT'
    | 'GENERAL_QUERY';
  customerStage: CustomerStage;
  buyingIntentLevel: BuyingIntentLevel;
  objectionType: ObjectionType;
  comparisonSkus?: string[];
  productSafetyQuery?: {
    sku?: string;
    aspect?: 'age' | 'rawhide' | 'choking' | 'general';
  };
  petType?: 'dog' | 'cat' | 'all';
  breed?: string;
  ageMonths?: number;
  weightKg?: number;
  size?: 'small' | 'medium' | 'large';
  gender?: 'male' | 'female';
  allergies?: string[];
  texturePreference?: 'soft' | 'hard' | 'chewy' | 'crispy';
  foodPreference?: string;
  customerName?: string;
  phone?: string;
  address?: string;
  paymentTerm?: string;
  invalidPaymentTerm?: string;
  orderQuantity?: number;
  answeredPendingSlots: string[];
}

// Common dog & cat breeds in Vietnam
const KNOWN_BREEDS = [
  'poodle',
  'corgi',
  'phốc sóc',
  'pomeranian',
  'phốc hươu',
  'phốc',
  'chihuahua',
  'husky',
  'alaska',
  'golden',
  'labrador',
  'samoyed',
  'pug',
  'bulldog',
  'bull pháp',
  'bichon',
  'shiba',
  'akita',
  'chó ta',
  'chó cỏ',
  'lạp xưởng',
  'dachshund',
  'mèo anh lông ngắn',
  'aln',
  'mèo anh lông dài',
  'ald',
  'mèo ba tư',
  'mèo mướp',
  'mèo ta',
  'mèo xiêm',
  'ragdoll',
  'sphynx',
  'bengal',
];

export class SlotExtractor {
  /**
   * Normalizes text for regex matching
   */
  private static normalizeText(text: string): string {
    return text.toLowerCase().trim();
  }

  /**
   * Main extractor function
   */
  static extract(message: string, pendingSlots: string[] = []): ExtractedSlots {
    const raw = message.trim();
    const text = this.normalizeText(raw);
    const result: ExtractedSlots = {
      isCorrection: false,
      intent: 'GENERAL_QUERY',
      customerStage: 'EXPLORING',
      buyingIntentLevel: 'LOW',
      objectionType: 'NONE',
      answeredPendingSlots: [],
    };

    // 1. Detect Correction phrases (supports Unicode without ASCII \b pitfalls)
    const correctionRegex = /(?:^|\s|[.,!?])(à nhầm|a nham|nhầm rồi|nham roi|sửa lại|sua lai|đính chính|dinh chinh|không phải|khong phai|ý em là|y em la)(?:$|\s|[.,!?])/i;
    if (correctionRegex.test(text)) {
      result.isCorrection = true;
    }

    // 2. Extract Pet Type
    if (/\b(cún|chó|dog|bé cún|chó con|puppy)\b/i.test(text)) {
      result.petType = 'dog';
      result.answeredPendingSlots.push('type');
    } else if (/\b(mèo|cat|bé mèo|miu|mèo con|kitten)\b/i.test(text)) {
      result.petType = 'cat';
      result.answeredPendingSlots.push('type');
    }

    // 3. Extract Breed (Strict matching - never assume)
    for (const breed of KNOWN_BREEDS) {
      const breedRegex = new RegExp(`(?:^|\\s|[.,!?])${breed}(?:$|\\s|[.,!?])`, 'i');
      if (breedRegex.test(text)) {
        result.breed = breed
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        result.answeredPendingSlots.push('breed');
        break;
      }
    }

    // 4. Extract Age in Months
    const monthRegex = /(\d+(?:[.,]\d+)?)\s*(?:tháng tuổi|thang tuoi|tháng|thang|thg\b)/i;
    const yearRegex = /(\d+(?:[.,]\d+)?)\s*(?:năm tuổi|nam tuoi|tuổi|tuoi)\b/i;
    const weekRegex = /(\d+(?:[.,]\d+)?)\s*(?:tuần tuổi|tuan tuoi|tuần|tuan)\b/i;

    const monthMatch = text.match(monthRegex);
    const yearMatch = text.match(yearRegex);
    const weekMatch = text.match(weekRegex);

    if (monthMatch) {
      const val = parseFloat(monthMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) {
        result.ageMonths = Math.round(val);
        result.answeredPendingSlots.push('age_months');
      }
    } else if (yearMatch) {
      const val = parseFloat(yearMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) {
        result.ageMonths = Math.round(val * 12);
        result.answeredPendingSlots.push('age_months');
      }
    } else if (weekMatch) {
      const val = parseFloat(weekMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) {
        result.ageMonths = Math.max(1, Math.round(val / 4));
        result.answeredPendingSlots.push('age_months');
      }
    }

    // 5. Extract Weight in KG
    const kgRegex = /(\d+(?:[.,]\d+)?)\s*(?:kg|kí|ký|cân|can)\b/i;
    const gramRegex = /(\d+(?:[.,]\d+)?)\s*(?:g|gram|gam)\b/i;
    const langRegex = /(\d+(?:[.,]\d+)?)\s*(?:lạng|lang)\b/i;

    const kgMatch = text.match(kgRegex);
    const gramMatch = text.match(gramRegex);
    const langMatch = text.match(langRegex);

    if (kgMatch) {
      const val = parseFloat(kgMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) {
        result.weightKg = val;
        result.answeredPendingSlots.push('weight_kg');
      }
    } else if (gramMatch) {
      const val = parseFloat(gramMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) {
        result.weightKg = parseFloat((val / 1000).toFixed(2));
        result.answeredPendingSlots.push('weight_kg');
      }
    } else if (langMatch) {
      const val = parseFloat(langMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) {
        result.weightKg = parseFloat((val * 0.1).toFixed(2));
        result.answeredPendingSlots.push('weight_kg');
      }
    }

    // 6. Extract Size
    if (/\b(nhỏ con|nhỏ|bé xíu|mini|size nhỏ|tí hon)\b/i.test(text)) {
      result.size = 'small';
      result.answeredPendingSlots.push('size');
    } else if (/\b(to|bự|khổng lồ|size lớn|size đại)\b/i.test(text)) {
      result.size = 'large';
      result.answeredPendingSlots.push('size');
    } else if (/\b(vừa|trung bình|size vừa)\b/i.test(text)) {
      result.size = 'medium';
      result.answeredPendingSlots.push('size');
    }

    // 7. Extract Texture Preference
    if (/\b(mềm|mem|mềm mềm|dễ nhai|de nhai|dễ ăn|de an|nhai mềm|mềm dẻo)\b/i.test(text)) {
      result.texturePreference = 'soft';
      result.answeredPendingSlots.push('texture_preference');
    } else if (/\b(giòn|gion|bánh giòn|xốp)\b/i.test(text)) {
      result.texturePreference = 'crispy';
      result.answeredPendingSlots.push('texture_preference');
    } else if (/\b(dai|dẻo|gặm lâu|lâu mòn)\b/i.test(text)) {
      result.texturePreference = 'chewy';
      result.answeredPendingSlots.push('texture_preference');
    } else if (/\b(cứng|cung|mài răng cứng)\b/i.test(text)) {
      result.texturePreference = 'hard';
      result.answeredPendingSlots.push('texture_preference');
    }

    // 8. Extract Allergies
    const allergies: string[] = [];
    if (/\b(dị ứng gà|di ung ga|dị ứng thịt gà|không ăn gà|kiêng gà)\b/i.test(text)) {
      allergies.push('thịt gà');
      result.answeredPendingSlots.push('allergies');
    }
    if (/\b(dị ứng bò|di ung bo|kiêng bò|không ăn bò)\b/i.test(text)) {
      allergies.push('thịt bò');
      result.answeredPendingSlots.push('allergies');
    }
    if (/\b(dị ứng hải sản|di ung hai san|kiêng cá)\b/i.test(text)) {
      allergies.push('hải sản');
      result.answeredPendingSlots.push('allergies');
    }
    if (allergies.length > 0) {
      result.allergies = allergies;
    }

    // 9. Extract Phone Number
    const phoneRegex = /(?:0|\+84)(?:3|5|7|8|9)\d{8}\b/;
    const phoneMatch = text.match(phoneRegex);
    if (phoneMatch) {
      result.phone = phoneMatch[0];
      result.answeredPendingSlots.push('phone');
    }

    // 9b. Extract Delivery Address
    const addressKeywords = /(?:giao về|giao ve|giao đến|giao den|giao tới|giao toi|ship về|ship ve|ship đến|ship den|địa chỉ|dia chi|nhận tại|nhan tai)\s*[:：]?\s*([^.,\n\r]+(?:,\s*[^.,\n\r]+)*)/i;
    const addrMatch = raw.match(addressKeywords);
    if (addrMatch && addrMatch[1]) {
      const cleanAddr = addrMatch[1].replace(/(?:nha|nhé|nhe|ạ|a|sđt|sdt|\d{9,11}).*$/i, '').trim();
      if (cleanAddr.length >= 5) {
        result.address = cleanAddr;
        result.answeredPendingSlots.push('address');
      }
    } else if (/(?:đường|duong|quận|quan|huyện|huyen|phường|phuong|xã|xa|tp\.?|thành phố|thanh pho|ấp|ap|tổ|to)\s+[a-zA-Z0-9\s,]+/i.test(raw)) {
      const parts = raw.split(/[\n,]/).map(p => p.trim()).filter(p => /(?:đường|quận|huyện|phường|xã|tp|ấp|lê|nguyễn|trần|lý|hai bà trưng|duẩn)/i.test(p));
      if (parts.length > 0) {
        result.address = parts.join(', ').replace(/(?:nha|nhé|nhe|ạ|a|sđt|sdt|\d{9,11}).*$/i, '').trim();
        if (result.address.length >= 5) {
          result.answeredPendingSlots.push('address');
        }
      }
    }

    // 9c. Extract Payment Terms (Thanh toán ngay, 15 ngày, 21 ngày, 30 ngày, 45 ngày, Cuối tháng kế tiếp)
    let paymentTerm: string | undefined;
    if (/\b(thanh to[aá]n ngay|ngay|ti[eề]n m[aặ]t|chuy[eể]n kho[aả]n ngay|cod|tr[aả] ti[eề]n m[aặ]t|thanh to[aá]n lu[oô]n|ck ngay)\b/i.test(text)) {
      paymentTerm = 'Thanh toán ngay';
    } else if (/\b(15\s*ng[aà]y|c[oô]ng n[oợ]\s*15\s*ng[aà]y)\b/i.test(text)) {
      paymentTerm = '15 ngày';
    } else if (/\b(21\s*ng[aà]y|c[oô]ng n[oợ]\s*21\s*ng[aà]y)\b/i.test(text)) {
      paymentTerm = '21 ngày';
    } else if (/\b(30\s*ng[aà]y|1\s*th[aá]ng|c[oô]ng n[oợ]\s*30\s*ng[aà]y|c[oô]ng n[oợ]\s*1\s*th[aá]ng)\b/i.test(text)) {
      paymentTerm = '30 ngày';
    } else if (/\b(45\s*ng[aà]y|c[oô]ng n[oợ]\s*45\s*ng[aà]y)\b/i.test(text)) {
      paymentTerm = '45 ngày';
    } else if (/\b(cu[oố]i th[aá]ng k[eế] ti[eế]p|cu[oố]i th[aá]ng sau|cu[oố]i th[aá]ng)\b/i.test(text)) {
      paymentTerm = 'Cuối tháng kế tiếp';
    }

    if (paymentTerm) {
      result.paymentTerm = paymentTerm;
      result.answeredPendingSlots.push('payment_term');
    } else if (/\b(?:trong\s+)?(\d+)\s*(ng[aà]y|tu[aâầ]n|th[aá]ng)\b/i.test(text)) {
      // Customer mentioned a time duration that doesn't match any supported payment term
      const match = text.match(/\b(?:trong\s+)?(\d+)\s*(ng[aà]y|tu[aâầ]n|th[aá]ng)\b/i);
      if (match) {
        const num = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        let days = num;
        if (/tu[aâầ]n/i.test(unit)) days = num * 7;
        else if (/th[aá]ng/i.test(unit)) days = num * 30;

        if (days > 0 && ![15, 21, 30, 45].includes(days)) {
          result.invalidPaymentTerm = `${match[1]} ${match[2]}`;
        }
      }
    }

    // 10. Extract SKUs mentioned in message (e.g. C14, DB-VP01, B03, B06, C28, E01)
    const skuMatches = raw.match(/\b([BCE]\d{1,3}(?:-\d+)?|DB-[A-Z0-9]+|OD-\d+)\b/gi);
    const uniqueSkus = skuMatches ? Array.from(new Set(skuMatches.map(s => s.toUpperCase()))) : [];

    // 11. Classify Customer Stage, Objection, and Intent
    // A. Objection: "Thôi em chưa mua, để chị suy nghĩ"
    if (/\b(thôi em chưa mua|thoi em chua mua|để chị suy nghĩ|de chi suy nghi|để em suy nghĩ|de em suy nghi|chưa mua đâu|chua mua dau|chưa cần đâu|chua can dau|để xem lại|de xem lai|khi khác em mua|để lần sau)\b/i.test(text)) {
      result.intent = 'HANDLE_OBJECTION';
      result.customerStage = 'OBJECTION';
      result.objectionType = 'THINKING_ABOUT_IT';
      result.buyingIntentLevel = 'NO_INTENT';
      return result;
    }

    // B. Objection: Age / Hardness / Safety concern
    if (/\b(hơi lo|hoi lo|sợ bé|so be|còn nhỏ quá|con nho qua|chưa ăn được|chua an duoc)\b/i.test(text)) {
      result.intent = 'HANDLE_OBJECTION';
      result.customerStage = 'OBJECTION';
      result.objectionType = 'AGE_CONCERN';
      result.buyingIntentLevel = 'MEDIUM';
      return result;
    }

    // B2. Customer Order Confirmation (e.g. "ok", "oke", "okie", "oki", "okay", "đồng ý", "xác nhận", "chốt", "duyệt", "đúng rồi", "giao đi", "lên đơn", "chính xác"...)
    const isAffirmative =
      /^(ok|oke|okie|oki|okay|k|uk|ừ|uh|uhm|dạ|da|vâng|vang|được|duoc|dc|chốt|chot|duyệt|duyet|xác nhận|xac nhan|đồng ý|dong y|đúng|dung|chuẩn|chuan)$/i.test(text.trim()) ||
      /\b(đồng ý|dong y|xác nhận|xac nhan|ok\b|oke\b|okie\b|oki\b|okay\b|đúng rồi|dung roi|chuẩn rồi|chuan roi|chốt nha|chốt nhé|chot nhe|chốt luôn|chot luon|chốt đơn|chot don|giao nhé|gửi nhé|duyệt nhé|duyệt đi|lên đơn đi|lên đơn nhé|đặt luôn|giao luôn|gửi luôn|ship luôn|ship đi|chính xác|đúng thông tin)\b/i.test(text);

    if (isAffirmative && !/\b(chưa|không|ko|thôi|hủy|khong|chua|thoi|huy|đừng)\b/i.test(text)) {
      result.intent = 'CONFIRM_ORDER';
      result.customerStage = 'READY_TO_BUY';
      result.buyingIntentLevel = 'HIGH';
      return result;
    }

    // C. High Buying Intent: "Cho chị 2 gói", "Mua 1 gói thử", "Lấy loại này", "Đóng gói cho tôi 100 C28 và 250 C14"
    const orderKeywords = /(?:đóng gói|dong goi|chốt đơn|chot don|lên đơn|len don|tạo đơn|tao don|đặt hàng|dat hang|ship cho|giao cho|lấy cho|cho tôi|cho toi|cho mình|cho minh|cho em|cho anh|cho chị|cho shop|gói cho|lấy cho|giao về|ship về|đặt luôn|lấy luôn|lấy giúp|mua giúp|gửi cho)/i;
    const hasOrderQty = /\b\d+\s*(?:gói|túi|hộp|bịch|cây|phần|kg|thùng|lon)?\b/i.test(text);
    const mentionsPaymentTermTopic = /(?:điều khoản thanh toán|hình thức thanh toán|thanh toán thế nào|thanh toán như thế nào|chưa hỏi điều khoản)/i.test(text);

    if (orderKeywords.test(text) || (hasOrderQty && uniqueSkus.length > 0) || mentionsPaymentTermTopic) {
      const orderQtyMatch = text.match(/(?:cho chị|cho em|lấy|mua|đặt|đóng gói)?\s*(\d+)\s*(?:gói|túi|hộp|bịch|cây|phần)/i);
      if (orderQtyMatch && orderQtyMatch[1]) {
        result.orderQuantity = parseInt(orderQtyMatch[1], 10);
      }
      result.intent = 'ORDER_INTENT';
      result.customerStage = 'READY_TO_BUY';
      result.buyingIntentLevel = 'HIGH';
      return result;
    }

    // C2. Customer providing delivery info (phone / address) for order collection
    if ((result.phone || result.address || /(?:giao về|ship về|giao tới|địa chỉ|sđt|sdt|nhận hàng)/i.test(text)) &&
        (pendingSlots.includes('phone') || pendingSlots.includes('address') || pendingSlots.length > 0 || /(?:giao|ship|quận|huyện|phường|xã|đường|ấp|tổ|sđt|sdt|tp\.?hcm|hà nội)/i.test(text))) {
      result.intent = 'ORDER_INTENT';
      result.customerStage = 'READY_TO_BUY';
      result.buyingIntentLevel = 'HIGH';
      return result;
    }

    // D. Product Comparison: ONLY when customer explicitly asks to compare!
    // Never treat ordering multiple SKUs (e.g. C28 and C14) as comparison!
    const isExplicitComparison = /(?:so sánh|so sanh|cái nào tốt hơn|cái nào hơn|cái nào phù hợp|loại nào hơn|loại nào tốt hơn|khác nhau thế nào|khác gì nhau|nên lấy cái nào|nên chọn cái nào|nên mua loại nào)/i.test(text) ||
      (uniqueSkus.length >= 2 && /(?:cái nào|loại nào|so sánh|khác nhau)/i.test(text));

    if (isExplicitComparison) {
      result.intent = 'COMPARE_PRODUCTS';
      result.customerStage = 'COMPARING';
      result.buyingIntentLevel = 'MEDIUM';
      result.comparisonSkus = uniqueSkus;
      return result;
    }

    // E. Product Safety / Ingredient / Rawhide / Choking specific queries
    // E.g. "C14 có an toàn cho bé 4 tháng không?", "C14 có phải rawhide không?", "Loại này có giúp bé không bị nghẹn không?"
    const isSafetyQuery =
      /(?:an toàn|an toan|ăn được|an duoc|rawhide|da bò|da bo|nghẹn|nghen|hóc|hoc|dị ứng|di ung)/i.test(text) &&
      /(?:không|ko|khong|chưa|chua|thế nào|the nao|sao|được không|duoc khong|giúp bé|giup be|an toàn|an toan)/i.test(text);

    if (isSafetyQuery) {
      result.intent = 'CHECK_PRODUCT_SAFETY';
      result.customerStage = 'CONSIDERING';
      result.buyingIntentLevel = 'MEDIUM';

      let aspect: 'age' | 'rawhide' | 'choking' | 'general' = 'general';
      if (text.includes('nghẹn') || text.includes('nghen') || text.includes('hóc')) {
        aspect = 'choking';
      } else if (text.includes('rawhide') || text.includes('da bò') || text.includes('da bo')) {
        aspect = 'rawhide';
      } else if (text.includes('tháng') || text.includes('tuổi') || text.includes('an toàn')) {
        aspect = 'age';
      }

      result.productSafetyQuery = {
        sku: uniqueSkus.length > 0 ? uniqueSkus[0] : undefined,
        aspect,
      };
      return result;
    }

    // F. Farewell / End conversation: "cảm ơn", "ok em hiểu rồi", "bye", "được rồi"
    if (/\b(cảm ơn|cám ơn|cam on|thank|thanks|bye|bai|tạm biệt|ok rồi|ok em hiểu|hiểu rồi|được rồi|vậy nhé|thôi nhé)\b/i.test(text) && text.length < 40) {
      result.intent = 'FAREWELL';
      result.customerStage = 'POST_PURCHASE';
      result.buyingIntentLevel = 'NO_INTENT';
      return result;
    }

    // G. Pure information-seeking queries (thành phần, công dụng, mô tả sản phẩm)
    if (
      /\b(thành phần|thanh phan|gồm những gì|gom nhung gi|có gì|co gi|bao nhiêu cây|bao nhieu cay|bao nhiêu que|nặng bao nhiêu|mấy que|may que|mô tả|mo ta|công dụng|cong dung|đặc điểm|dac diem|kích thước|kich thuoc)\b/i.test(text) &&
      !/\b(mua|đặt|lấy|ship|giao|chốt)\b/i.test(text)
    ) {
      result.intent = 'INFORMATION_SEEKING';
      result.customerStage = 'EXPLORING';
      result.buyingIntentLevel = 'LOW';
      return result;
    }

    // H. General intents
    if (/\b(chào|hi|hello|alo|shop ơi|ad ơi|có ai không)\b/i.test(text) && text.length < 30) {
      result.intent = 'GREETING';
      result.customerStage = 'EXPLORING';
    } else if (/\b(gặp người thật|gặp nhân viên|nhân viên đâu|tư vấn viên|khiếu nại|chửi|lừa đảo|giao sai)\b/i.test(text)) {
      result.intent = 'HANDOFF_REQUEST';
    } else if (/\b(giá bao nhiêu|bao nhiêu tiền|nhiêu 1 gói|báo giá|giá sỉ|chiết khấu)\b/i.test(text)) {
      result.intent = 'ASK_PRICE';
      result.customerStage = 'CONSIDERING';
      result.buyingIntentLevel = 'MEDIUM';
    } else if (/\b(còn hàng không|còn hàng ko|hết hàng chưa|có sẵn không)\b/i.test(text)) {
      result.intent = 'CHECK_INVENTORY';
      result.customerStage = 'CONSIDERING';
      result.buyingIntentLevel = 'MEDIUM';
    } else if (/\b(đơn hàng|mã đơn|giao đến đâu|kiểm tra đơn|s0\d+)\b/i.test(text)) {
      result.intent = 'ASK_ORDER_STATUS';
      result.customerStage = 'POST_PURCHASE';
    } else if (
      /\b(snack|bánh thưởng|que gặm|chọn loại nào|tư vấn|loại nào tốt|dành cho|thức ăn|đồ ăn|mua snack|mua bánh)\b/i.test(text) ||
      result.texturePreference ||
      result.ageMonths ||
      result.breed
    ) {
      if (pendingSlots.length > 0 && (result.breed || result.weightKg || result.ageMonths || result.texturePreference)) {
        result.intent = 'PROVIDE_INFO';
        result.customerStage = 'CONSIDERING';
      } else {
        result.intent = 'ASK_RECOMMENDATION';
        result.customerStage = 'EXPLORING';
      }
    }

    return result;
  }

  /**
   * Applies extracted slots to the Structured Pet & Customer Profiles
   */
  static applyExtractedSlots(
    pet: StructuredPetProfile,
    customer: StructuredCustomerProfile,
    extracted: ExtractedSlots
  ): { petUpdated: boolean; customerUpdated: boolean } {
    let petUpdated = false;
    let customerUpdated = false;

    if (extracted.petType) {
      pet.type = updateFact(pet.type, { value: extracted.petType, status: 'CONFIRMED', source: 'customer_message' }, extracted.isCorrection);
      petUpdated = true;
    }

    if (extracted.breed) {
      pet.breed = updateFact(pet.breed, { value: extracted.breed, status: 'CONFIRMED', source: 'customer_message' }, extracted.isCorrection);
      petUpdated = true;
    }

    if (extracted.ageMonths !== undefined) {
      pet.age_months = updateFact(pet.age_months, { value: extracted.ageMonths, status: 'CONFIRMED', source: 'customer_message' }, extracted.isCorrection);
      petUpdated = true;
    }

    if (extracted.weightKg !== undefined) {
      pet.weight_kg = updateFact(pet.weight_kg, { value: extracted.weightKg, status: 'CONFIRMED', source: 'customer_message' }, extracted.isCorrection);
      petUpdated = true;
    }

    if (extracted.size) {
      pet.size = updateFact(pet.size, { value: extracted.size, status: 'CONFIRMED', source: 'customer_message' }, extracted.isCorrection);
      petUpdated = true;
    }

    if (extracted.texturePreference) {
      pet.texture_preference = updateFact(pet.texture_preference, { value: extracted.texturePreference, status: 'CONFIRMED', source: 'customer_message' }, extracted.isCorrection);
      petUpdated = true;
    }

    if (extracted.allergies && extracted.allergies.length > 0) {
      const currentAllergies = pet.allergies.value || [];
      const merged = Array.from(new Set([...currentAllergies, ...extracted.allergies]));
      pet.allergies = updateFact(pet.allergies, { value: merged, status: 'CONFIRMED', source: 'customer_message' }, extracted.isCorrection);
      petUpdated = true;
    }

    if (extracted.phone) {
      customer.phone = updateFact(customer.phone, { value: extracted.phone, status: 'CONFIRMED', source: 'customer_message' }, extracted.isCorrection);
      customerUpdated = true;
    }

    if (extracted.address) {
      customer.address = updateFact(customer.address, { value: extracted.address, status: 'CONFIRMED', source: 'customer_message' }, extracted.isCorrection);
      customerUpdated = true;
    }

    if (extracted.paymentTerm) {
      customer.payment_term = updateFact(customer.payment_term, { value: extracted.paymentTerm, status: 'CONFIRMED', source: 'customer_message' }, extracted.isCorrection);
      customerUpdated = true;
    }

    if (extracted.buyingIntentLevel === 'HIGH') {
      customer.buying_intent = updateFact(customer.buying_intent, { value: 'high', status: 'CONFIRMED', source: 'customer_message' }, extracted.isCorrection);
      customerUpdated = true;
    } else if (extracted.buyingIntentLevel === 'NO_INTENT') {
      customer.buying_intent = updateFact(customer.buying_intent, { value: 'low', status: 'CONFIRMED', source: 'customer_message' }, extracted.isCorrection);
      customerUpdated = true;
    }

    return { petUpdated, customerUpdated };
  }
}
