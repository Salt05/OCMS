/**
 * ai-order-service.ts — AI-powered order extraction from Zalo chat messages.
 * Uses Groq API (Llama 3.3 70B) to analyze conversation messages,
 * extract product requests, and match them against the ProductCache catalog.
 *
 * Key design decisions:
 * - Uses wholesalePrice as the default pricing strategy per business requirement.
 * - Scans all messages sent today in the conversation for order context.
 * - Employs fuzzy matching (Vietnamese diacritics removal + substring) to map
 *   free-form customer text to real SKUs in the product catalog.
 * - Returns structured JSON with confidence scores for human review.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { PricingPromotionEngine } from '../promotions/pricing-promotion-engine.js';
import { extractImageUrls, convertAllToDataUris } from '../chatbot/image-helper.js';
import { PromotionService } from '../promotions/promotion-service.js';
import { odooService } from '../odoo/odoo-service.js';
import { integrationSettingsService } from '../settings/integration-settings-service.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AiExtractedItem {
  productNameRaw: string;       // What the customer actually wrote
  matchedProductOdooId: number | null;
  matchedProductName: string | null;
  sku: string | null;
  quantity: number;
  priceUnit: number;
  originalPrice?: number | null;
  discountedPrice?: number | null;
  discount: number;
  confidence: number;           // 0.0 – 1.0
}

export interface UnclearOrderItem {
  rawText: string;              // Đoạn chữ trong ảnh / tin nhắn không đọc rõ
  reason: string;               // Lý do (chữ mờ, không khớp mã SKU, thiếu số lượng, không rõ vị)
  suggestedProducts?: string[]; // Gợi ý sản phẩm gần đúng nhất nếu có
}

export interface AiOrderDraft {
  thinking?: string | null;
  customer: {
    name: string | null;
    phone: string | null;
    shippingAddress: string | null;
  };
  items: AiExtractedItem[];
  unclearItems?: UnclearOrderItem[];
  notes: string | null;
  paymentTerm: string | null;
  missingInfo: string[];
  originalSubtotal?: number;
  discountAmount?: number;
  finalTotal?: number;
  appliedPromotions?: any[];
  freeItems?: any[];
  explanations?: string[];
  suggestions?: string[];
}

/**
 * Helper: Run Pricing Engine on extracted items and update line item discounts.
 */
async function applyPricingToExtractedItems(orgId: string, items: AiExtractedItem[]) {
  let originalSubtotal = items.reduce((sum, it) => sum + (it.quantity * it.priceUnit), 0);
  let discountAmount = 0;
  let finalTotal = originalSubtotal;
  let appliedPromotions: any[] = [];
  let freeItems: any[] = [];
  let explanations: string[] = [];
  let suggestions: string[] = [];

  if (items.length > 0) {
    try {
      const evalResult = await PromotionService.evaluateOrder({
        orgId,
        items: items.map(it => ({
          sku: it.sku,
          productName: it.matchedProductName || it.productNameRaw,
          odooProductId: it.matchedProductOdooId,
          quantity: it.quantity,
          priceUnit: it.priceUnit,
        })),
        customerType: 'DEALER',
      });

      originalSubtotal = evalResult.originalSubtotal;
      discountAmount = evalResult.discountAmount;
      finalTotal = evalResult.finalTotal;
      appliedPromotions = evalResult.appliedPromotions;
      freeItems = evalResult.freeItems;
      explanations = evalResult.explanations;
      suggestions = evalResult.suggestions;

      for (let i = 0; i < items.length; i++) {
        const evalLine = evalResult.lineItems[i];
        if (evalLine) {
          items[i].discount = evalLine.itemDiscountPercent;
          items[i].originalPrice = evalLine.originalPriceUnit;
          const discounted = evalLine.specialUnitPrice || evalLine.discountedPriceUnit;
          if (discounted && discounted < evalLine.originalPriceUnit) {
            items[i].discountedPrice = discounted;
            items[i].priceUnit = discounted; // Use discounted price as instructed
          }
        }
      }
    } catch (evalErr: any) {
      logger.warn(`[ai-order-service] Promotion evaluation error: ${evalErr.message}`);
    }
  }

  return {
    originalSubtotal,
    discountAmount,
    finalTotal,
    appliedPromotions,
    freeItems,
    explanations,
    suggestions,
  };
}

// ── Vietnamese text normalization ────────────────────────────────────────────

function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

// ── Fuzzy product matching ───────────────────────────────────────────────────

/**
 * Robustly parse a quantity value from LLM output.
 * Handles: number, string with separators (1.100, 1,100), null/undefined.
 */
function parseQuantity(val: any): number {
  if (typeof val === 'number' && !isNaN(val)) return Math.floor(val);
  if (typeof val === 'string') {
    // Remove thousand separators (1.100 → 1100, 1,100 → 1100)
    const cleaned = val.replace(/[.,\s]/g, '');
    const parsed = parseInt(cleaned, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 1;
}


interface ProductCacheRow {
  id: string;
  odooId: number;
  sku: string | null;
  name: string;
  displayName: string | null;
  wholesalePrice: number;
  retailPrice: number;
  listPrice: number;
  weight: string | null;
  specification: string | null;
  isActive: boolean;
}

/**
 * Score how well a customer's raw text matches a product in our catalog.
 * Higher score = better match. Returns 0 if no match.
 */
function scoreProductMatch(rawText: string, product: ProductCacheRow): number {
  const q = removeVietnameseTones(rawText);
  const name = removeVietnameseTones(product.name || '');
  const display = removeVietnameseTones(product.displayName || '');
  const sku = removeVietnameseTones(product.sku || '');
  const spec = removeVietnameseTones(product.specification || '');

  // Exact SKU match is the highest confidence
  if (sku && q === sku) return 1.0;
  if (sku && q.includes(sku)) return 0.95;

  // Exact name match
  if (q === name || q === display) return 0.95;

  // Name contains query or query contains name
  if (name && name.includes(q)) return 0.85;
  if (name && q.includes(name)) return 0.80;
  if (display && display.includes(q)) return 0.80;
  if (display && q.includes(display)) return 0.75;

  // Word-level overlap scoring
  const qWords = q.split(/\s+/).filter(w => w.length > 1);
  const nameWords = name.split(/\s+/).filter(w => w.length > 1);
  if (qWords.length > 0 && nameWords.length > 0) {
    const matchedWords = qWords.filter(w => nameWords.some(nw => nw.includes(w) || w.includes(nw)));
    const overlapRatio = matchedWords.length / Math.max(qWords.length, nameWords.length);
    if (overlapRatio >= 0.6) return 0.5 + overlapRatio * 0.3;
  }

  // Spec/weight partial match
  if (spec && q.includes(spec)) return 0.5;

  return 0;
}

/**
 * Find the best matching product for a raw text from the customer.
 */
function findBestProduct(rawText: string, products: ProductCacheRow[]): {
  product: ProductCacheRow | null;
  confidence: number;
} {
  let bestProduct: ProductCacheRow | null = null;
  let bestScore = 0;

  for (const p of products) {
    if (!p.isActive) continue;
    const score = scoreProductMatch(rawText, p);
    if (score > bestScore) {
      bestScore = score;
      bestProduct = p;
    }
  }

  return { product: bestProduct, confidence: bestScore };
}

/**
 * Build product catalog string with all products (or prioritized if catalog is very large).
 */
function buildProductSummaryForPrompt(productCache: ProductCacheRow[], text: string): string {
  // If catalog is reasonable size (<= 300), include all products to guarantee 100% SKU match accuracy
  if (productCache.length <= 300) {
    return productCache
      .map(p => `- Mã: ${p.sku || 'N/A'} | Tên: ${p.name} | Quy cách: ${p.specification || p.weight || 'Gốc'} | Giá sỉ: ${p.wholesalePrice}đ`)
      .join('\n');
  }

  const textNormalized = removeVietnameseTones(text);

  const scoredProducts = productCache.map(p => {
    let score = 0;
    const sku = (p.sku || '').toLowerCase().trim();
    const nameNorm = removeVietnameseTones(p.name || '').trim();

    // 1. Direct SKU match
    if (sku && sku.length >= 2) {
      const skuRegex = new RegExp(`\\b${sku}\\b`, 'i');
      if (skuRegex.test(textNormalized)) {
        score += 100;
      } else if (textNormalized.includes(sku)) {
        score += 50;
      }
    }

    // 2. Full or phrase name match
    if (nameNorm.length >= 4) {
      if (textNormalized.includes(nameNorm)) {
        score += 80;
      } else {
        const cleanedName = nameNorm.replace(/\[.*?\]/g, '').replace(/^[a-z0-9_-]+\s*-\s*/i, '').trim();
        if (cleanedName.length >= 4 && textNormalized.includes(cleanedName)) {
          score += 70;
        } else {
          const stopWords = new Set(['tui', 'hang', 'giam', 'tang', 'them', 'bot', 'cho', 'khach', 'don', 'tru', 'tien', 'lai', 'size', 'vien', 'dang']);
          const words = cleanedName.split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));
          const matchCount = words.filter(w => textNormalized.includes(w)).length;
          if (matchCount >= 2) {
            score += matchCount * 15;
          } else if (matchCount === 1) {
            score += 5;
          }
        }
      }
    }

    return { product: p, score };
  });

  scoredProducts.sort((a, b) => b.score - a.score);
  const selectedProducts = scoredProducts.slice(0, 150).map(sp => sp.product);

  return selectedProducts
    .map(p => `- Mã: ${p.sku || 'N/A'} | Tên: ${p.name} | Quy cách: ${p.specification || p.weight || 'Gốc'} | Giá sỉ: ${p.wholesalePrice}đ`)
    .join('\n');
}

// ── LLM API call ────────────────────────────────────────────────────────────

async function callGroqChat(systemPrompt: string, userMessage: string | any[], orgId?: string): Promise<string> {
  let aiConfig: any = null;
  if (orgId) {
    try {
      aiConfig = await integrationSettingsService.getAiConfig(orgId);
    } catch {}
  }

  const apiKey = aiConfig?.apiKey || config.llm?.apiKey || config.groq.apiKey;
  if (!apiKey) {
    throw new Error('Chưa cấu hình API Key cho AI (GEMINI_API_KEY hoặc GROQ_API_KEY). Vui lòng cấu hình trong phần Cài đặt Hệ thống trên Web hoặc file .env.');
  }

  const apiUrl = aiConfig?.baseUrl || config.llm?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  const modelName = aiConfig?.model || config.llm?.model || config.groq.model || 'gemini-3.5-flash-lite';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    logger.error('[ai-order] LLM API error:', response.status, errBody);
    throw new Error(`LLM API lỗi ${response.status}: ${errBody}`);
  }

  const data = await response.json() as any;
  let content = data.choices?.[0]?.message?.content || '{}';
  if (content.includes('```json')) {
    content = content.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
  } else if (content.includes('```')) {
    content = content.replace(/```\s*/gi, '').trim();
  }
  return content;
}

function cleanExtractedValue(val: any): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s || /^(null|undefined|chua biet|chua co|khong co|none|unknown)$/i.test(removeVietnameseTones(s))) {
    return null;
  }
  return s;
}

// ── Main extraction function ─────────────────────────────────────────────────

export async function extractOrderFromConversation(
  orgId: string,
  conversationId: string,
  additionalInstruction?: string,
): Promise<AiOrderDraft> {
  // 1. Fetch today's messages from the conversation (ignoring messages before the last order was placed)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const latestOrder = await prisma.order.findFirst({
    where: { conversationId, orgId },
    orderBy: { createdAt: 'desc' },
  });

  const queryStart = latestOrder ? latestOrder.createdAt : todayStart;

  let messages = await prisma.message.findMany({
    where: {
      conversationId,
      sentAt: { gte: queryStart },
      isDeleted: false,
      contentType: { in: ['text', 'image', 'photo', 'rich'] },
    },
    orderBy: { sentAt: 'asc' },
    select: {
      senderType: true,
      senderName: true,
      content: true,
      contentType: true,
      attachments: true,
      sentAt: true,
    },
  });

  // Fallback: If no messages today, fetch the last 30 messages in the thread (recent history from past days)
  if (messages.length === 0) {
    const recentMessages = await prisma.message.findMany({
      where: {
        conversationId,
        isDeleted: false,
        contentType: { in: ['text', 'image', 'photo', 'rich'] },
      },
      orderBy: { sentAt: 'desc' },
      take: 30,
      select: {
        senderType: true,
        senderName: true,
        content: true,
        contentType: true,
        attachments: true,
        sentAt: true,
      },
    });
    messages = recentMessages.reverse();
  }

  if (messages.length === 0) {
    return {
      customer: { name: null, phone: null, shippingAddress: null },
      items: [],
      notes: null,
      paymentTerm: null,
      missingInfo: ['Không tìm thấy tin nhắn nào trong cuộc trò chuyện này.'],
    };
  }

  // 2. Fetch the contact info for context
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          address: true,
          customerId: true,
        },
      },
    },
  });

  // 3. Fetch product catalog for this org
  const productCache = await prisma.productCache.findMany({
    where: { orgId, isActive: true },
    select: {
      id: true,
      odooId: true,
      sku: true,
      name: true,
      displayName: true,
      wholesalePrice: true,
      retailPrice: true,
      listPrice: true,
      weight: true,
      specification: true,
      isActive: true,
    },
  });

  // 4. Extract image URLs and format text transcript
  const imageUrls: string[] = [];
  const chatTranscript = messages
    .slice(-30) // Take up to 30 most recent messages
    .map((m) => {
      const isStaff = m.senderType === 'self';
      const senderRole = isStaff ? '[Nhân viên]' : `[Khách hàng - ${m.senderName || conversation?.contact?.fullName || 'Khách'}]`;
      const dateStr = new Date(m.sentAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      const timeStr = new Date(m.sentAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

      // Extract image URLs from message and attachments
      const msgImages = extractImageUrls(m.content, m.attachments, m.contentType);
      for (const u of msgImages) {
        imageUrls.push(u);
      }

      const imgTag = m.contentType === 'image' || msgImages.length > 0 ? ' [Hình ảnh/Đính kèm]' : '';
      const cleanContent = m.content && m.content.startsWith('{') ? '[Gửi hình ảnh]' : (m.content || '');
      return `${dateStr} ${timeStr} ${senderRole}${imgTag}: ${cleanContent}`;
    })
    .join('\n');

  // 5. Smart compact product catalog (relevance-scored to ensure 100% SKU match accuracy)
  const productSummary = buildProductSummaryForPrompt(productCache, chatTranscript);

  // 6. Build the system prompt
  const systemPrompt = `Bạn là trợ lý AI chuyên phân tích tin nhắn Zalo và hình ảnh đính kèm để bóc tách thông tin đơn hàng cho công ty thú cưng (pet shop).

NHIỆM VỤ: Đọc toàn bộ đoạn hội thoại chat và xem các hình ảnh (nếu có) giữa [Nhân viên] và [Khách hàng], trích xuất danh sách sản phẩm và thông tin chốt cuối cùng mà KHÁCH HÀNG yêu cầu đặt mua.

DANH MỤC SẢN PHẨM CÓ SẴN TRONG KHO:
${productSummary}

THÔNG TIN KHÁCH HÀNG ĐÃ BIẾT:
- Tên: ${conversation?.contact?.fullName || 'Chưa biết'}
- SĐT: ${conversation?.contact?.phone || 'Chưa biết'}
- Địa chỉ: ${conversation?.contact?.address || 'Chưa biết'}
- Mã KH Odoo: ${conversation?.contact?.customerId || 'Chưa có'}

QUY TẮC PHÂN BIỆT VAI TRÒ VÀ TÍNH TOÁN ĐƠN HÀNG:
1. PHÂN BIỆT RÕ RÀNG VAI TRÒ:
   - "[Khách hàng - ...]": Là người mua hàng. Hãy lấy các sản phẩm, số lượng, địa chỉ giao hàng và ghi chú từ các câu nói hoặc hình ảnh do Khách hàng gửi.
   - "[Nhân viên]": Là người bán hàng tư vấn. Nếu nhân viên gửi tin nhắn báo giá hoặc đề xuất đơn mà khách hàng đồng ý/xác nhận sau đó thì lấy; nếu khách chưa phản hồi thì ghi chú vào missingInfo.
2. XỬ LÝ HÌNH ẢNH DANH SÁCH ĐƠN HÀNG (IMAGE-TO-ORDER - QUY TẮC BẮT BUỘC):
   - ĐỌC CHÍNH XÁC MÃ SKU VÀ ĐỐI CHIẾU DANH MỤC:
     • Nếu trong ảnh có cột Mã (như C10, C28, B03, E01, DB01...), BẮT BUỘC dùng chính xác mã SKU đó.
     • Tuyệt đối KHÔNG nhầm lẫn giữa C10 (Thịt xiên que Single Kaboz) với C10-1 (Double Kaboz) hay C10-2.
   - TUYỆT ĐỐI KHÔNG GỘP CÁC DÒNG (DO NOT MERGE ROWS):
     • Mỗi dòng trong bảng ảnh có số lượng > 0 PHẢI LÀ MỘT MỤC RIÊNG BIỆT trong kết quả.
     • Ví dụ: Trong ảnh có dòng "Xương nơ da bò trắng 3"": 70 và dòng "Xương nơ da bò vàng 3"": 70, BẮT BUỘC TÁCH THÀNH 2 DÒNG RIÊNG BIỆT (mỗi dòng số lượng 70), TUYỆT ĐỐI KHÔNG ĐƯỢC GỘP CHUNG THÀNH 1 DÒNG 140!
   - NẾU DÒNG TRONG ẢNH KHÔNG CÓ MÃ SKU:
     • Nếu tên sản phẩm trong ảnh khớp RÕ RÀNG và DUY NHẤT với 1 sản phẩm trong danh mục kho (ví dụ: "Xương nơ da bò trắng 3\"" khớp chính xác C42, "Xương nơ da bò vàng 3\"" khớp chính xác C41), thì ĐƯA VÀO items kèm matchedSku tương ứng.
     • Chỉ đưa vào unclearItems khi THẬT SỰ không thể xác định sản phẩm nào trong danh mục (chữ mờ không đọc được, tên quá chung chung khớp nhiều sản phẩm, hoặc hoàn toàn không tìm thấy tên tương tự trong danh mục).
   - Dòng nào chữ viết tay mờ, không rõ chữ hoặc thiếu số lượng: Đưa vào mảng "unclearItems" kèm lý do cụ thể và gợi ý.
3. TÍNH TOÁN SỐ LƯỢNG THỰC TẾ CUỐI CÙNG (NET FINAL QUANTITY):
   - Đọc toàn bộ các tin nhắn từ đầu đến cuối theo thứ tự thời gian.
   - Nếu khách hàng có các câu điều chỉnh sau đó (ví dụ: "hủy món A", "bớt 20 món B", "tăng thêm 10 món C", "đổi sang món D"), bạn PHẢI áp dụng các thay đổi này tuần tự theo thời gian để đưa ra danh sách sản phẩm và số lượng chốt cuối cùng.
   - Tuyệt đối KHÔNG đưa các món có số lượng = 0 hoặc đã bị hủy vào mảng items.
4. KHỚP MÃ SKU VỚI DANH MỤC KHO:
   - Với mỗi sản phẩm còn lại sau khi tính toán, tìm mã SKU khớp nhất từ danh mục sản phẩm ở trên.
   - Nếu khách không nói rõ số lượng của một món, mặc định là 1.
5. Trích xuất địa chỉ giao hàng, SĐT, phương thức thanh toán và ghi chú đặc biệt nếu khách có cung cấp trong chat.
6. Liệt kê các thông tin còn thiếu trong mảng "missingInfo".
7. BẮT BUỘC có trường "thinking": Tóm tắt ngắn gọn từng bước phân tích và suy luận của bạn.

TRẢ VỀ JSON theo đúng cấu trúc sau:
{
  "thinking": "các bước suy nghĩ phân tích của bạn",
  "customer": {
    "name": "string hoặc null",
    "phone": "string hoặc null",
    "shippingAddress": "string hoặc null"
  },
  "items": [
    {
      "productNameRaw": "tên sản phẩm khách viết hoặc nhận diện trong ảnh",
      "matchedSku": "SKU khớp nhất từ danh mục hoặc null",
      "matchedProductName": "tên sản phẩm chính thức hoặc null",
      "quantity": 1,
      "notes": "ghi chú riêng cho dòng này hoặc null"
    }
  ],
  "unclearItems": [
    {
      "rawText": "dòng chữ trong ảnh/tin nhắn đọc không rõ hoặc không khớp SKU",
      "reason": "lý do (chữ viết tay mờ / chưa rõ vị / không tìm thấy mã trong CSDL)",
      "suggestedProducts": ["tên gợi ý nếu có"]
    }
  ],
  "notes": "ghi chú chung cho đơn hàng hoặc null",
  "paymentTerm": "phương thức thanh toán nếu khách nói hoặc null",
  "missingInfo": ["danh sách thông tin còn thiếu"]
}
`;

  // 7. Call LLM (multimodal if images exist)
  const promptText = `ĐÂY LÀ ĐOẠN HỘI THOẠI ZALO VÀ YÊU CẦU ĐẶT HÀNG:\n\n${chatTranscript}${additionalInstruction && additionalInstruction.trim() ? `\n\nYÊU CẦU / GHI CHÚ BỔ SUNG:\n${additionalInstruction.trim()}` : ''}`;
  let userPayload: string | any[] = promptText;

  const base64Urls = await convertAllToDataUris(imageUrls);
  if (base64Urls.length > 0) {
    userPayload = [
      { type: 'text', text: promptText },
      ...base64Urls.slice(-3).map((url) => ({
        type: 'image_url',
        image_url: { url },
      })),
    ];
  }

  const llmResponse = await callGroqChat(systemPrompt, userPayload, orgId);

  // 8. Parse LLM output
  let llmData: any;
  try {
    llmData = JSON.parse(llmResponse);
  } catch (e) {
    logger.error('[ai-order] Failed to parse LLM JSON:', llmResponse);
    throw new Error('AI trả về dữ liệu không hợp lệ. Vui lòng thử lại.');
  }

  // 9. Post-process: match each item against real ProductCache
  const extractedItems: AiExtractedItem[] = [];
  const unclearItems: UnclearOrderItem[] = Array.isArray(llmData.unclearItems) ? [...llmData.unclearItems] : [];
  const llmItems = llmData.items || [];
  const missingInfo: string[] = Array.isArray(llmData.missingInfo) ? [...llmData.missingInfo] : [];

  // Debug: log raw LLM item quantities for troubleshooting
  if (llmItems.length > 0) {
    logger.info(`[ai-order] LLM extracted ${llmItems.length} items: ${llmItems.map((it: any) => `${it.matchedSku || it.productNameRaw}: qty=${JSON.stringify(it.quantity)} (type: ${typeof it.quantity})`).join(', ')}`);
  }

  for (const item of llmItems) {
    const rawName = item.productNameRaw || item.matchedProductName || '';
    const llmSku = (item.matchedSku || '').trim();

    // Try SKU match first from LLM suggestion
    let bestMatch: { product: ProductCacheRow | null; confidence: number } = { product: null, confidence: 0 };

    if (llmSku) {
      const skuProduct = productCache.find(p =>
        (p.sku || '').trim().toLowerCase() === llmSku.toLowerCase()
      );
      if (skuProduct) {
        bestMatch = { product: skuProduct, confidence: 1.0 };
      }
    }

    // Direct SKU match from rawName (e.g. if rawName contains E01, B03, etc.)
    if (!bestMatch.product && rawName) {
      const directSkuProduct = productCache.find(p =>
        p.sku && new RegExp(`\\b${p.sku}\\b`, 'i').test(rawName)
      );
      if (directSkuProduct) {
        bestMatch = { product: directSkuProduct, confidence: 0.95 };
      }
    }

    // Fallback to fuzzy name matching ONLY if confidence is high (>= 0.7)
    if (!bestMatch.product && rawName) {
      const fuzzy = findBestProduct(rawName, productCache);
      if (fuzzy.confidence >= 0.7) {
        bestMatch = fuzzy;
      }
    }

    // Fallback: Query Odoo directly if SKU exists but wasn't in local cache
    if (!bestMatch.product && llmSku) {
      try {
        const odooProd = await odooService.searchProductBySku(llmSku);
        if (odooProd) {
          const cached = await prisma.productCache.upsert({
            where: { orgId_odooId: { orgId, odooId: odooProd.id } },
            update: {
              sku: odooProd.default_code || llmSku,
              name: odooProd.name || '',
              displayName: odooProd.display_name || odooProd.name,
              listPrice: odooProd.list_price || 0,
              wholesalePrice: odooProd.list_price || 0,
              isActive: odooProd.active !== false,
            },
            create: {
              orgId,
              odooId: odooProd.id,
              sku: odooProd.default_code || llmSku,
              name: odooProd.name || '',
              displayName: odooProd.display_name || odooProd.name,
              listPrice: odooProd.list_price || 0,
              wholesalePrice: odooProd.list_price || 0,
              isActive: odooProd.active !== false,
            },
          });
          const newRow: ProductCacheRow = {
            id: cached.id,
            odooId: cached.odooId,
            sku: cached.sku,
            name: cached.name,
            displayName: cached.displayName,
            wholesalePrice: cached.wholesalePrice,
            retailPrice: cached.retailPrice,
            listPrice: cached.listPrice,
            specification: cached.specification,
            weight: cached.weight,
            isActive: cached.isActive,
          };
          productCache.push(newRow);
          bestMatch = { product: newRow, confidence: 1.0 };
        }
      } catch (e: any) {
        logger.warn(`[ai-order] Odoo fallback search error for SKU ${llmSku}: ${e.message}`);
      }
    }

    // If item has no SKU and was not matched with high confidence, put into unclearItems to ask customer
    if (!bestMatch.product) {
      unclearItems.push({
        rawText: `${rawName} (${item.quantity || 1} gói)`,
        reason: 'Chưa xác định được mã SKU chính xác, nhờ khách hàng xác nhận',
      });
      continue;
    }

    // STRICT VALIDATION: ONLY add product if it really exists in database and confidence >= 0.45
    if (bestMatch.product && bestMatch.confidence >= 0.45) {
      extractedItems.push({
        productNameRaw: rawName,
        matchedProductOdooId: bestMatch.product.odooId,
        matchedProductName: bestMatch.product.name,
        sku: bestMatch.product.sku || llmSku || null,
        quantity: Math.max(1, parseQuantity(item.quantity)),
        priceUnit: bestMatch.product.wholesalePrice || bestMatch.product.listPrice || 0,
        discount: 0,
        confidence: bestMatch.confidence,
      });
    } else if (rawName && rawName.trim().length > 1) {
      unclearItems.push({
        rawText: rawName,
        reason: 'Sản phẩm không tìm thấy hoặc chưa khớp mã SKU trong danh mục kho',
        suggestedProducts: bestMatch.product ? [bestMatch.product.name] : [],
      });
      missingInfo.push(`Sản phẩm "${rawName}" chưa khớp danh mục hệ thống.`);
    }
  }

  const pricing = await applyPricingToExtractedItems(orgId, extractedItems);

  return {
    thinking: llmData.thinking || 'Đã phân tích các tin nhắn và hình ảnh trong hội thoại, nhận diện khách hàng và đối chiếu danh mục sản phẩm.',
    customer: {
      name: cleanExtractedValue(llmData.customer?.name) || conversation?.contact?.fullName || null,
      phone: cleanExtractedValue(llmData.customer?.phone) || conversation?.contact?.phone || null,
      shippingAddress: cleanExtractedValue(llmData.customer?.shippingAddress) || conversation?.contact?.address || null,
    },
    items: extractedItems,
    unclearItems: unclearItems.length > 0 ? unclearItems : undefined,
    notes: llmData.notes || null,
    paymentTerm: cleanExtractedValue(llmData.paymentTerm) || null,
    missingInfo: Array.from(new Set(missingInfo)),
    originalSubtotal: pricing.originalSubtotal,
    discountAmount: pricing.discountAmount,
    finalTotal: pricing.finalTotal,
    appliedPromotions: pricing.appliedPromotions,
    freeItems: pricing.freeItems,
    explanations: pricing.explanations,
  };
}

// ── Text-based extraction (manual text input) ────────────────────────────────

export async function extractOrderFromText(
  orgId: string,
  text: string,
  contactInfo?: { name?: string; phone?: string; address?: string; customerId?: string },
): Promise<AiOrderDraft> {
  // Fetch product catalog
  const productCache = await prisma.productCache.findMany({
    where: { orgId, isActive: true },
    select: {
      id: true,
      odooId: true,
      sku: true,
      name: true,
      displayName: true,
      wholesalePrice: true,
      retailPrice: true,
      listPrice: true,
      weight: true,
      specification: true,
      isActive: true,
    },
  });

  // Smart compact product catalog (relevance-scored to ensure 100% SKU match accuracy)
  const productSummary = buildProductSummaryForPrompt(productCache, text);

  const systemPrompt = `Bạn là trợ lý AI chuyên phân tích yêu cầu đặt hàng cho công ty thú cưng (pet shop).

DANH MỤC SẢN PHẨM CÓ SẴN:
${productSummary}

THÔNG TIN KHÁCH HÀNG:
- Tên: ${contactInfo?.name || 'Chưa biết'}
- SĐT: ${contactInfo?.phone || 'Chưa biết'}
- Địa chỉ: ${contactInfo?.address || 'Chưa biết'}

QUY TẮC:
1. Trích xuất TẤT CẢ sản phẩm và số lượng CHỐT CUỐI CÙNG từ đoạn text. Nếu đoạn text là diễn biến tin nhắn có chứa các điều chỉnh (như "hủy món X", "bỏ X", "giảm Y túi", "thêm Z phần"), hãy tính toán chính xác số lượng thực tế sau cùng. Nếu một món bị hủy hoàn toàn hoặc số lượng về 0, TUYỆT ĐỐI KHÔNG đưa vào danh sách items.
2. Với mỗi sản phẩm, tìm mã SKU khớp nhất từ danh mục sản phẩm có sẵn.
3. Nếu không nói rõ số lượng, mặc định là 1.
4. BẮT BUỘC có trường "thinking" tóm tắt ngắn gọn các bước phân tích nhận diện và các phép tính điều chỉnh nếu có.
5. Liệt kê thông tin còn thiếu.

TRẢ VỀ JSON:
{
  "thinking": "string",
  "customer": { "name": "string|null", "phone": "string|null", "shippingAddress": "string|null" },
  "items": [{ "productNameRaw": "...", "matchedSku": "...", "matchedProductName": "...", "quantity": 1, "notes": null }],
  "notes": "string|null",
  "paymentTerm": "string|null",
  "missingInfo": ["..."]
}`;

  const llmResponse = await callGroqChat(systemPrompt, text);

  let llmData: any;
  try {
    llmData = JSON.parse(llmResponse);
  } catch {
    throw new Error('AI trả về dữ liệu không hợp lệ. Vui lòng thử lại.');
  }

  const extractedItems: AiExtractedItem[] = [];
  const missingInfo: string[] = Array.isArray(llmData.missingInfo) ? [...llmData.missingInfo] : [];

  for (const item of (llmData.items || [])) {
    const rawName = item.productNameRaw || item.matchedProductName || '';
    const llmSku = (item.matchedSku || '').trim();

    let bestMatch: { product: ProductCacheRow | null; confidence: number } = { product: null, confidence: 0 };

    if (llmSku) {
      const skuProduct = productCache.find(p =>
        (p.sku || '').toLowerCase() === llmSku.toLowerCase()
      );
      if (skuProduct) {
        bestMatch = { product: skuProduct, confidence: 0.98 };
      }
    }

    // Direct SKU match from rawName or text (e.g. E01, B03)
    if (!bestMatch.product) {
      const directSkuProduct = productCache.find(p =>
        p.sku && (new RegExp(`\\b${p.sku}\\b`, 'i').test(rawName) || new RegExp(`\\b${p.sku}\\b`, 'i').test(text))
      );
      if (directSkuProduct) {
        bestMatch = { product: directSkuProduct, confidence: 0.95 };
      }
    }

    if (!bestMatch.product && rawName) {
      bestMatch = findBestProduct(rawName, productCache);
    }

    if (!bestMatch.product && item.matchedProductName) {
      bestMatch = findBestProduct(item.matchedProductName, productCache);
    }

    if (bestMatch.product && bestMatch.confidence >= 0.45) {
      extractedItems.push({
        productNameRaw: rawName || bestMatch.product.name,
        matchedProductOdooId: bestMatch.product.odooId,
        matchedProductName: bestMatch.product.name,
        sku: bestMatch.product.sku || llmSku || null,
        quantity: Math.max(1, parseQuantity(item.quantity)),
        priceUnit: bestMatch.product.wholesalePrice || bestMatch.product.listPrice || 0,
        discount: 0,
        confidence: bestMatch.confidence,
      });
    } else if (rawName && rawName.trim().length > 1) {
      missingInfo.push(`Sản phẩm "${rawName}" không tồn tại trong danh mục hệ thống.`);
    }
  }

  const pricing = await applyPricingToExtractedItems(orgId, extractedItems);

  return {
    thinking: llmData.thinking || `Đã trích xuất thông tin trực tiếp từ câu lệnh: Nhận diện ${extractedItems.length} sản phẩm hợp lệ trong danh mục.`,
    customer: {
      name: llmData.customer?.name || contactInfo?.name || null,
      phone: llmData.customer?.phone || contactInfo?.phone || null,
      shippingAddress: llmData.customer?.shippingAddress || contactInfo?.address || null,
    },
    items: extractedItems,
    notes: llmData.notes || null,
    paymentTerm: llmData.paymentTerm || null,
    missingInfo: Array.from(new Set(missingInfo)),
    originalSubtotal: pricing.originalSubtotal,
    discountAmount: pricing.discountAmount,
    finalTotal: pricing.finalTotal,
    appliedPromotions: pricing.appliedPromotions,
    freeItems: pricing.freeItems,
    explanations: pricing.explanations,
    suggestions: pricing.suggestions,
  };
}

// ── Modify an existing draft order via conversational instruction ────────────

export interface AiModifyDraftResult {
  draft: AiOrderDraft;
  explanation: string;
}

export async function modifyOrderDraft(
  orgId: string,
  currentDraft: any,
  instruction: string,
): Promise<AiModifyDraftResult> {
  const productCache = await prisma.productCache.findMany({
    where: { orgId, isActive: true },
    select: {
      id: true,
      odooId: true,
      sku: true,
      name: true,
      displayName: true,
      wholesalePrice: true,
      retailPrice: true,
      listPrice: true,
      weight: true,
      specification: true,
      isActive: true,
    },
  });

  const instructionNorm = removeVietnameseTones(instruction);
  const relevantProducts = productCache.filter(p => {
    const sku = (p.sku || '').toLowerCase();
    const name = removeVietnameseTones(p.name || '');
    return (sku && instructionNorm.includes(sku)) || (name && name.split(/\s+/).some(w => w.length > 2 && instructionNorm.includes(w)));
  });
  const selectedProducts = Array.from(new Set([...relevantProducts, ...productCache])).slice(0, 60);

  const productSummary = selectedProducts
    .map(p => `${p.sku || 'NA'}: ${p.name} (${p.specification || p.weight || 'Gốc'}) - ${p.wholesalePrice}đ`)
    .join('\n');

  const currentItemsSummary = (currentDraft.items || [])
    .map((it: any) => `- SKU: ${it.sku || 'NA'}, Tên: ${it.productNameRaw || it.matchedProductName || it.product?.name}, SL: ${it.quantity || it.qty || 1}, Đơn giá: ${it.priceUnit || it.price}đ`)
    .join('\n');

  const systemPrompt = `Bạn là trợ lý AI chuyên chỉnh sửa đơn hàng theo yêu cầu bằng ngôn ngữ tự nhiên của nhân viên.

ĐƠN HÀNG HIỆN TẠI ĐANG MỞ:
- Khách hàng: ${currentDraft.customer?.name || 'Khách hàng'}
- SĐT: ${currentDraft.customer?.phone || 'Chưa có'}
- Địa chỉ: ${currentDraft.customer?.shippingAddress || 'Chưa có'}
- Các sản phẩm hiện có trong đơn:
${currentItemsSummary || '(Chưa có sản phẩm)'}
- Ghi chú: ${currentDraft.notes || 'Không'}

DANH MỤC SẢN PHẨM HỆ THỐNG:
${productSummary}

YÊU CẦU CHỈNH SỬA:
"${instruction}"

QUY TẮC CHỈNH SỬA:
1. "giảm số lượng ... còn X" hoặc "giảm ... xuống X": Cập nhật số lượng của sản phẩm tương ứng thành đúng X.
2. "tăng số lượng ... lên X" hoặc "thêm X ...": Cập nhật số lượng hoặc thêm sản phẩm vào đơn.
3. "xóa ...", "bỏ ...", "hủy ...": Loại bỏ sản phẩm đó khỏi danh sách đơn hàng.
4. "đổi địa chỉ sang ...", "thêm ghi chú ...": Cập nhật thông tin tương ứng.
5. Tạo câu giải thích "explanation" ngắn gọn, lịch sự, tóm tắt những thay đổi đã thực hiện (VD: "Tôi đã cập nhật số lượng của Que xoắn vị sữa quấn gà thành 20 theo yêu cầu.").
6. Tạo trường "thinking" tóm tắt ngắn gọn các bước phân tích chỉnh sửa.

TRẢ VỀ JSON DUY NHẤT:
{
  "thinking": "string",
  "explanation": "string",
  "customer": { "name": "...", "phone": "...", "shippingAddress": "..." },
  "items": [
    {
      "productNameRaw": "...",
      "matchedSku": "...",
      "matchedProductName": "...",
      "quantity": 20,
      "notes": null
    }
  ],
  "notes": "string|null",
  "paymentTerm": "string|null",
  "missingInfo": []
}`;

  const llmResponse = await callGroqChat(systemPrompt, `Yêu cầu chỉnh sửa: "${instruction}"`, orgId);

  let llmData: any;
  try {
    llmData = JSON.parse(llmResponse);
  } catch {
    throw new Error('AI trả về kết quả chỉnh sửa không hợp lệ.');
  }

  const extractedItems: AiExtractedItem[] = [];
  const missingInfo: string[] = Array.isArray(llmData.missingInfo) ? [...llmData.missingInfo] : [];

  for (const item of (llmData.items || [])) {
    const rawName = item.productNameRaw || item.matchedProductName || '';
    const llmSku = (item.matchedSku || '').trim();

    let bestMatch: { product: ProductCacheRow | null; confidence: number } = { product: null, confidence: 0 };

    if (llmSku) {
      const skuProduct = productCache.find(p =>
        (p.sku || '').toLowerCase() === llmSku.toLowerCase()
      );
      if (skuProduct) {
        bestMatch = { product: skuProduct, confidence: 0.98 };
      }
    }

    if (!bestMatch.product) {
      const directSkuProduct = productCache.find(p =>
        p.sku && (new RegExp(`\\b${p.sku}\\b`, 'i').test(rawName) || new RegExp(`\\b${p.sku}\\b`, 'i').test(instruction))
      );
      if (directSkuProduct) {
        bestMatch = { product: directSkuProduct, confidence: 0.95 };
      }
    }

    if (!bestMatch.product && rawName) {
      bestMatch = findBestProduct(rawName, productCache);
    }

    if (!bestMatch.product && item.matchedProductName) {
      bestMatch = findBestProduct(item.matchedProductName, productCache);
    }

    if (bestMatch.product && bestMatch.confidence >= 0.45) {
      extractedItems.push({
        productNameRaw: rawName || bestMatch.product.name,
        matchedProductOdooId: bestMatch.product.odooId,
        matchedProductName: bestMatch.product.name,
        sku: bestMatch.product.sku || llmSku || null,
        quantity: Math.max(0, parseQuantity(item.quantity)),
        priceUnit: bestMatch.product.wholesalePrice || bestMatch.product.listPrice || 0,
        discount: 0,
        confidence: bestMatch.confidence,
      });
    } else if (rawName && rawName.trim().length > 1) {
      missingInfo.push(`Sản phẩm "${rawName}" không tồn tại trong danh mục hệ thống.`);
    }
  }

  const pricing = await applyPricingToExtractedItems(orgId, extractedItems);

  return {
    explanation: llmData.explanation || 'Đã cập nhật phiếu đơn hàng theo yêu cầu của bạn.',
    draft: {
      thinking: llmData.thinking || `Đã điều chỉnh theo yêu cầu: "${instruction}"\n- Cập nhật số lượng/mặt hàng trong đơn: ${extractedItems.length} sản phẩm.`,
      customer: {
        name: llmData.customer?.name || currentDraft.customer?.name || null,
        phone: llmData.customer?.phone || currentDraft.customer?.phone || null,
        shippingAddress: llmData.customer?.shippingAddress || currentDraft.customer?.shippingAddress || null,
      },
      items: extractedItems,
      notes: llmData.notes !== undefined ? llmData.notes : currentDraft.notes,
      paymentTerm: llmData.paymentTerm || currentDraft.paymentTerm,
      missingInfo: Array.from(new Set(missingInfo)),
      originalSubtotal: pricing.originalSubtotal,
      discountAmount: pricing.discountAmount,
      finalTotal: pricing.finalTotal,
      appliedPromotions: pricing.appliedPromotions,
      freeItems: pricing.freeItems,
      explanations: pricing.explanations,
      suggestions: pricing.suggestions,
    },
  };
}
