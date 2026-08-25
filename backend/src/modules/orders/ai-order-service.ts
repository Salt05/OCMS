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

// ── Types ────────────────────────────────────────────────────────────────────

export interface AiExtractedItem {
  productNameRaw: string;       // What the customer actually wrote
  matchedProductOdooId: number | null;
  matchedProductName: string | null;
  sku: string | null;
  quantity: number;
  priceUnit: number;
  discount: number;
  confidence: number;           // 0.0 – 1.0
}

export interface AiOrderDraft {
  thinking?: string | null;
  customer: {
    name: string | null;
    phone: string | null;
    shippingAddress: string | null;
  };
  items: AiExtractedItem[];
  notes: string | null;
  paymentTerm: string | null;
  missingInfo: string[];
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

// ── Groq API call ────────────────────────────────────────────────────────────

async function callGroqChat(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = config.groq.apiKey;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY chưa được cấu hình. Vui lòng thêm vào biến môi trường.');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.groq.model,
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
    logger.error('[ai-order] Groq API error:', response.status, errBody);
    throw new Error(`Groq API lỗi ${response.status}: ${errBody}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '{}';
}

// ── Main extraction function ─────────────────────────────────────────────────

export async function extractOrderFromConversation(
  orgId: string,
  conversationId: string,
): Promise<AiOrderDraft> {
  // 1. Fetch today's messages from the conversation
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      sentAt: { gte: todayStart },
      isDeleted: false,
      contentType: { in: ['text'] },
    },
    orderBy: { sentAt: 'asc' },
    select: {
      senderType: true,
      senderName: true,
      content: true,
      sentAt: true,
    },
  });

  if (messages.length === 0) {
    return {
      customer: { name: null, phone: null, shippingAddress: null },
      items: [],
      notes: null,
      paymentTerm: null,
      missingInfo: ['Không tìm thấy tin nhắn nào trong ngày hôm nay.'],
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

  // 4. Format messages for LLM (get today's messages, prioritizing recent text)
  const chatTranscript = messages
    .slice(-30) // Take up to 30 most recent messages of today
    .map((m) => {
      const isStaff = m.senderType === 'self';
      const senderRole = isStaff ? '[Nhân viên]' : `[Khách hàng - ${m.senderName || conversation?.contact?.fullName || 'Khách'}]`;
      const time = new Date(m.sentAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      return `${time} ${senderRole}: ${m.content || ''}`;
    })
    .join('\n');

  // 5. Smart compact product catalog (filter relevant products + compact format to save 85% tokens)
  const chatTextNormalized = removeVietnameseTones(chatTranscript);
  
  // Find products that match keywords in chat first, then fill with other active products
  const relevantProducts = productCache.filter(p => {
    const sku = (p.sku || '').toLowerCase();
    const name = removeVietnameseTones(p.name || '');
    return (sku && chatTextNormalized.includes(sku)) || (name && name.split(/\s+/).some(w => w.length > 2 && chatTextNormalized.includes(w)));
  });

  // Combine relevant products first + top products, capped at 60 items in ultra-compact format
  const selectedProducts = Array.from(new Set([...relevantProducts, ...productCache])).slice(0, 60);

  const productSummary = selectedProducts
    .map(p => `${p.sku || 'NA'}: ${p.name} (${p.specification || p.weight || 'Gốc'}) - ${p.wholesalePrice}đ`)
    .join('\n');

  // 6. Build the system prompt
  const systemPrompt = `Bạn là trợ lý AI chuyên phân tích tin nhắn Zalo để bóc tách thông tin đơn hàng cho công ty thú cưng (pet shop).

NHIỆM VỤ: Đọc đoạn hội thoại chat giữa [Nhân viên] và [Khách hàng], chỉ trích xuất những sản phẩm và thông tin mà KHÁCH HÀNG yêu cầu đặt mua.

DANH MỤC SẢN PHẨM CÓ SẴN TRONG KHO:
${productSummary}

THÔNG TIN KHÁCH HÀNG ĐÃ BIẾT:
- Tên: ${conversation?.contact?.fullName || 'Chưa biết'}
- SĐT: ${conversation?.contact?.phone || 'Chưa biết'}
- Địa chỉ: ${conversation?.contact?.address || 'Chưa biết'}
- Mã KH Odoo: ${conversation?.contact?.customerId || 'Chưa có'}

QUY TẮC PHÂN BIỆT VAI TRÒ:
1. PHÂN BIỆT RÕ RÀNG:
   - "[Khách hàng - ...]": Là người mua hàng. Hãy lấy các sản phẩm, số lượng, địa chỉ giao hàng và ghi chú từ các câu nói của Khách hàng.
   - "[Nhân viên]": Là người bán hàng tư vấn hoặc hỗ trợ. Tuyệt đối không nhầm lẫn câu báo giá hay câu chào hỏi của Nhân viên thành nhu cầu mua của Khách.
2. Trích xuất TẤT CẢ sản phẩm mà khách hàng muốn mua hoặc xác nhận lấy.
3. Với mỗi sản phẩm, tìm mã SKU khớp nhất từ danh mục sản phẩm ở trên.
4. Nếu khách không nói rõ số lượng, mặc định là 1.
5. Trích xuất địa chỉ giao hàng và số điện thoại nếu khách có cung cấp trong đoạn chat.
6. Trích xuất ghi chú đặc biệt (VD: giao giờ hành chính, gọi trước khi giao, v.v.)
7. Liệt kê các thông tin còn thiếu trong mảng "missingInfo".
8. Nếu không tìm thấy yêu cầu đặt hàng nào từ Khách hàng trong đoạn chat, trả về mảng items rỗng.
9. BẮT BUỘC có trường "thinking": Tóm tắt ngắn gọn từng bước phân tích và suy luận của bạn (Ví dụ: "1. Đã đọc tin nhắn từ khách hàng...\n2. Nhận diện khách yêu cầu sản phẩm X, Y...\n3. Khớp mã SKU và giá bán buôn...").

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
      "productNameRaw": "tên sản phẩm khách viết trong chat",
      "matchedSku": "SKU khớp nhất từ danh mục hoặc null",
      "matchedProductName": "tên sản phẩm chính thức hoặc null",
      "quantity": 1,
      "notes": "ghi chú riêng cho dòng này hoặc null"
    }
  ],
  "notes": "ghi chú chung cho đơn hàng hoặc null",
  "paymentTerm": "phương thức thanh toán nếu khách nói hoặc null",
  "missingInfo": ["danh sách thông tin còn thiếu"]
}`;

  // 7. Call Groq LLM
  const llmResponse = await callGroqChat(systemPrompt, `ĐÂY LÀ ĐOẠN HỘI THOẠI ZALO:\n\n${chatTranscript}`);

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
  const llmItems = llmData.items || [];
  const missingInfo: string[] = Array.isArray(llmData.missingInfo) ? [...llmData.missingInfo] : [];

  for (const item of llmItems) {
    const rawName = item.productNameRaw || item.matchedProductName || '';
    const llmSku = (item.matchedSku || '').trim();

    // Try SKU match first from LLM suggestion
    let bestMatch: { product: ProductCacheRow | null; confidence: number } = { product: null, confidence: 0 };

    if (llmSku) {
      const skuProduct = productCache.find(p =>
        (p.sku || '').toLowerCase() === llmSku.toLowerCase()
      );
      if (skuProduct) {
        bestMatch = { product: skuProduct, confidence: 0.98 };
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

    // Fallback to fuzzy name matching
    if (!bestMatch.product && rawName) {
      bestMatch = findBestProduct(rawName, productCache);
    }

    // Also try matching by LLM's matchedProductName
    if (!bestMatch.product && item.matchedProductName) {
      bestMatch = findBestProduct(item.matchedProductName, productCache);
    }

    // STRICT VALIDATION: ONLY add product if it really exists in database and confidence >= 0.45
    if (bestMatch.product && bestMatch.confidence >= 0.45) {
      extractedItems.push({
        productNameRaw: rawName,
        matchedProductOdooId: bestMatch.product.odooId,
        matchedProductName: bestMatch.product.name,
        sku: bestMatch.product.sku || llmSku || null,
        quantity: Math.max(1, parseInt(item.quantity) || 1),
        priceUnit: bestMatch.product.wholesalePrice || bestMatch.product.listPrice || 0,
        discount: 0,
        confidence: bestMatch.confidence,
      });
    } else if (rawName && rawName.trim().length > 1) {
      missingInfo.push(`Sản phẩm "${rawName}" không tồn tại trong danh mục hệ thống.`);
    }
  }

  return {
    thinking: llmData.thinking || 'Đã phân tích các tin nhắn trong hội thoại hôm nay, nhận diện khách hàng và đối chiếu danh mục sản phẩm.',
    customer: {
      name: llmData.customer?.name || conversation?.contact?.fullName || null,
      phone: llmData.customer?.phone || conversation?.contact?.phone || null,
      shippingAddress: llmData.customer?.shippingAddress || conversation?.contact?.address || null,
    },
    items: extractedItems,
    notes: llmData.notes || null,
    paymentTerm: llmData.paymentTerm || null,
    missingInfo: Array.from(new Set(missingInfo)),
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

  const textNormalized = removeVietnameseTones(text);
  const relevantProducts = productCache.filter(p => {
    const sku = (p.sku || '').toLowerCase();
    const name = removeVietnameseTones(p.name || '');
    return (sku && textNormalized.includes(sku)) || (name && name.split(/\s+/).some(w => w.length > 2 && textNormalized.includes(w)));
  });
  const selectedProducts = Array.from(new Set([...relevantProducts, ...productCache])).slice(0, 60);

  const productSummary = selectedProducts
    .map(p => `${p.sku || 'NA'}: ${p.name} (${p.specification || p.weight || 'Gốc'}) - ${p.wholesalePrice}đ`)
    .join('\n');

  const systemPrompt = `Bạn là trợ lý AI chuyên phân tích yêu cầu đặt hàng cho công ty thú cưng (pet shop).

DANH MỤC SẢN PHẨM CÓ SẴN:
${productSummary}

THÔNG TIN KHÁCH HÀNG:
- Tên: ${contactInfo?.name || 'Chưa biết'}
- SĐT: ${contactInfo?.phone || 'Chưa biết'}
- Địa chỉ: ${contactInfo?.address || 'Chưa biết'}

QUY TẮC:
1. Trích xuất TẤT CẢ sản phẩm từ đoạn text.
2. Với mỗi sản phẩm, tìm mã SKU khớp nhất từ danh mục.
3. Nếu không nói rõ số lượng, mặc định là 1.
4. BẮT BUỘC có trường "thinking" tóm tắt ngắn gọn các bước phân tích nhận diện.
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
        quantity: Math.max(1, parseInt(item.quantity) || 1),
        priceUnit: bestMatch.product.wholesalePrice || bestMatch.product.listPrice || 0,
        discount: 0,
        confidence: bestMatch.confidence,
      });
    } else if (rawName && rawName.trim().length > 1) {
      missingInfo.push(`Sản phẩm "${rawName}" không tồn tại trong danh mục hệ thống.`);
    }
  }

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

  const llmResponse = await callGroqChat(systemPrompt, `Yêu cầu chỉnh sửa: "${instruction}"`);

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
        quantity: Math.max(0, parseInt(item.quantity) || 0),
        priceUnit: bestMatch.product.wholesalePrice || bestMatch.product.listPrice || 0,
        discount: 0,
        confidence: bestMatch.confidence,
      });
    } else if (rawName && rawName.trim().length > 1) {
      missingInfo.push(`Sản phẩm "${rawName}" không tồn tại trong danh mục hệ thống.`);
    }
  }

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
    },
  };
}
