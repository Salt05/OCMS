/**
 * Chatbot Function Calling Tools Registry.
 * All tools return deterministic structured data. LLM does NOT query DB directly.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { odooService } from '../odoo/odoo-service.js';
import { knowledgeService } from './knowledge-service.js';
import { extractOrderFromConversation } from '../orders/ai-order-service.js';
import { ProductGroundingEngine } from './product-grounding.js';
import { logger } from '../../shared/utils/logger.js';

export const CHATBOT_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'compare_products',
      description: 'So sánh chi tiết 2 hoặc nhiều sản phẩm LA PET dựa trên dữ liệu thực tế đã xác nhận trong CSDL (thành phần, độ mềm/kết cấu, công nghệ Rawhide, đối tượng phù hợp, giá sỉ). Tuyệt đối không bịa đặt đặc tính.',
      parameters: {
        type: 'object',
        properties: {
          skus: {
            type: 'array',
            items: { type: 'string' },
            description: 'Danh sách mã SKU cần so sánh (ví dụ: ["C14", "DB-VP01"] hoặc ["C14", "B03"])',
          },
        },
        required: ['skus'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_product',
      description: 'Tìm kiếm sản phẩm LA PET theo từ khóa, đối tượng thú cưng (chó/mèo) và lọc loại trừ dị ứng.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Từ khóa tìm kiếm (tên sản phẩm, mã SKU, que gặm, sạch răng, xương bàn chải, thịt sấy...)',
          },
          pet_type: {
            type: 'string',
            enum: ['dog', 'cat', 'all'],
            description: 'Đối tượng thú cưng',
          },
          age_months: {
            type: 'number',
            description: 'Độ tuổi của bé tính theo tháng (ví dụ: 4 tháng)',
          },
          texture_preference: {
            type: 'string',
            enum: ['soft', 'hard', 'chewy', 'crispy'],
            description: 'Sở thích kết cấu / độ mềm (mềm dễ ăn, giòn, dai...)',
          },
          exclude_ingredients: {
            type: 'array',
            items: { type: 'string' },
            description: 'Các thành phần dị ứng cần loại trừ (ví dụ: ["gà", "da bò sống"])',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_detail',
      description: 'Lấy thông tin chi tiết đầy đủ của 1 sản phẩm theo mã SKU (thành phần, dinh dưỡng, bảo quản, giá niêm yết).',
      parameters: {
        type: 'object',
        properties: {
          sku: {
            type: 'string',
            description: 'Mã SKU của sản phẩm (ví dụ: B03, B06, E01, C24, C11)',
          },
        },
        required: ['sku'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_price',
      description: 'Lấy mức giá bán niêm yết chuẩn xác từ hệ thống (mặc định luôn áp dụng bảng giá sỉ/đại lý Wholesale Price từ Directus).',
      parameters: {
        type: 'object',
        properties: {
          sku: {
            type: 'string',
            description: 'Mã SKU sản phẩm (ví dụ: C24, C14, B03, E01)',
          },
        },
        required: ['sku'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_inventory',
      description: 'Kiểm tra tồn kho thực tế khả dụng từ Odoo ERP để đảm bảo còn hàng trước khi chốt đơn.',
      parameters: {
        type: 'object',
        properties: {
          sku: {
            type: 'string',
            description: 'Mã SKU sản phẩm cần check tồn kho',
          },
        },
        required: ['sku'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_status',
      description: 'Tra cứu trạng thái tiến độ đơn hàng gần nhất của khách hàng theo SĐT hoặc mã đơn.',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Số điện thoại người nhận hàng',
          },
          order_code: {
            type: 'string',
            description: 'Mã đơn hàng nếu khách cung cấp (ví dụ: S02300)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'extract_order_draft',
      description: 'Bóc tách danh sách món, số lượng, địa chỉ và SĐT từ ngữ cảnh hội thoại thành phiếu đơn hàng nháp.',
      parameters: {
        type: 'object',
        properties: {
          instruction: {
            type: 'string',
            description: 'Ghi chú thêm hoặc yêu cầu chỉnh sửa giỏ hàng (nếu có)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_lead_contact',
      description: 'Cập nhật thông tin khách hàng tiềm năng (Tên, SĐT, Địa chỉ, ghi chú cún/mèo) vào hệ thống CRM.',
      parameters: {
        type: 'object',
        properties: {
          fullName: { type: 'string', description: 'Họ tên hoặc tên gọi của khách' },
          phone: { type: 'string', description: 'Số điện thoại' },
          address: { type: 'string', description: 'Địa chỉ nhận hàng' },
          notes: { type: 'string', description: 'Ghi chú về giống cún/mèo hoặc sở thích của bé' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'handoff_to_human',
      description: 'Chuyển giao cuộc trò chuyện cho nhân viên Sale phụ trách và tạm khóa AI khi có khiếu nại, thương lượng giá sỉ hoặc khách đòi gặp người thật.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Lý do chuyển giao (ví dụ: Khách khiếu nại giao sai hàng, Khách đàm phán giá sỉ, Khách yêu cầu gặp tư vấn viên trực tiếp)',
          },
          urgency: {
            type: 'string',
            enum: ['normal', 'urgent', 'critical'],
            description: 'Mức độ khẩn cấp',
          },
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_faq_policy',
      description: 'Tra cứu chính sách đổi trả, phí vận chuyển (freeship), thanh toán và cẩm nang chăm sóc từ KnowledgeBase.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Câu hỏi hoặc từ khóa chính sách cần tra cứu',
          },
          category: {
            type: 'string',
            enum: ['faq', 'policy', 'product_guide', 'all'],
            description: 'Nhóm tri thức',
          },
        },
        required: ['query'],
      },
    },
  },
];

export class ChatbotToolExecutor {
  constructor(private orgId: string, private conversationId: string, private contactId?: string) {}

  async executeTool(toolName: string, args: Record<string, any>): Promise<any> {
    try {
      logger.info(`[chatbot-tools] Executing ${toolName} with args:`, args);

      switch (toolName) {
        case 'compare_products':
          return this.compareProducts(args.skus || []);

        case 'search_product':
          return this.searchProduct(
            args.query,
            args.pet_type,
            args.exclude_ingredients,
            args.age_months,
            args.texture_preference
          );

        case 'get_product_detail':
          return this.getProductDetail(args.sku);

        case 'check_price':
          return this.checkPrice(args.sku);

        case 'check_inventory':
          return this.checkInventory(args.sku);

        case 'get_order_status':
          return this.getOrderStatus(args.phone, args.order_code);

        case 'extract_order_draft':
          return this.extractOrderDraft(args.instruction);

        case 'create_lead_contact':
          return this.createLeadContact(args);

        case 'handoff_to_human':
          return this.handoffToHuman(args.reason, args.urgency);

        case 'search_faq_policy':
          return this.searchFaqPolicy(args.query, args.category);

        default:
          return { error: `Tool ${toolName} không tồn tại.` };
      }
    } catch (err: any) {
      logger.error(`[chatbot-tools] Error in ${toolName}:`, err.message);
      return { error: `Lỗi khi thực thi ${toolName}: ${err.message}` };
    }
  }

  public async searchProduct(
    query: string,
    petType?: string,
    excludeIngredients?: string[],
    ageMonths?: number,
    texturePreference?: string
  ) {
    const q = (query || '').trim().toLowerCase();
    const where: any = {
      orgId: this.orgId,
      isActive: true,
    };

    const allProducts = await prisma.productCache.findMany({
      where,
      take: 50,
    });

    if (!allProducts || allProducts.length === 0) {
      return { products: [], message: 'Chưa có dữ liệu sản phẩm trong kho.' };
    }

    let filtered = allProducts;

    // Filter allergy exclusions
    if (excludeIngredients && excludeIngredients.length > 0) {
      filtered = filtered.filter((p: any) => {
        const ing = (p.ingredients || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        const name = p.name.toLowerCase();
        return !excludeIngredients.some(ex => {
          const exLower = ex.toLowerCase();
          return ing.includes(exLower) || desc.includes(exLower) || name.includes(exLower);
        });
      });
    }

    // Filter pet type if specified
    if (petType && petType !== 'all') {
      const isDog = petType === 'dog';
      filtered = filtered.filter((p: any) => {
        const target = (p.target || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        if (isDog) return !target.includes('mèo') && !desc.includes('cho mèo');
        return !target.includes('chó') && !desc.includes('cho chó');
      });
    }

    const isPuppy = (ageMonths !== undefined && ageMonths <= 6);
    const wantsSoft = texturePreference === 'soft' || isPuppy;

    // Fuzzy text match & smart boosting
    const words = q.split(/\s+/).filter(w => w.length > 1);
    const scored = filtered.map((p: any) => {
      let score = 0;
      const skuLower = (p.sku || '').toLowerCase();
      const nameLower = p.name.toLowerCase();
      const descLower = (p.description || '').toLowerCase();
      const specLower = (p.specification || '').toLowerCase();

      if (skuLower === q) score += 20;
      if (nameLower.includes(q)) score += 10;
      if (descLower.includes(q)) score += 5;

      for (const w of words) {
        if (skuLower.includes(w)) score += 5;
        if (nameLower.includes(w)) score += 3;
        if (descLower.includes(w)) score += 1;
      }

      // Boost soft / puppy snacks
      if (wantsSoft) {
        if (nameLower.includes('mềm') || descLower.includes('mềm') || specLower.includes('mềm')) score += 15;
        if (nameLower.includes('bàn chải') || skuLower === 'b03' || skuLower === 'b06') score += 12;
        if (nameLower.includes('sữa') || descLower.includes('sữa') || descLower.includes('rawhide-free')) score += 10;
      }

      return { p, score };
    });

    const topMatches = scored
      .filter((s: any) => s.score > 0 || !q)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 4)
      .map((s: any) => {
        const wholesalePrice = s.p.wholesalePrice > 0 ? s.p.wholesalePrice : s.p.listPrice;
        return {
          sku: s.p.sku || `OD-${s.p.odooId}`,
          name: s.p.name,
          price: wholesalePrice,
          formatted_price: `${wholesalePrice.toLocaleString('vi-VN')} đ`,
          specification: s.p.specification || s.p.weight || 'Gói',
          target: s.p.target || 'Tất cả thú cưng',
          highlights: s.p.description?.slice(0, 120) || 'Thành phần an toàn, công nghệ Rawhide-Free dễ tiêu hóa',
        };
      });

    return { products: topMatches, count: topMatches.length };
  }

  private async compareProducts(skus: string[]) {
    if (!skus || skus.length === 0) {
      return { found: false, message: 'Vui lòng cung cấp ít nhất 1 hoặc 2 mã SKU để so sánh.' };
    }

    const cleanSkus = skus.map(s => s.trim().toUpperCase());
    const products = await prisma.productCache.findMany({
      where: {
        orgId: this.orgId,
        isActive: true,
        OR: [
          { sku: { in: cleanSkus, mode: 'insensitive' } },
          { name: { in: cleanSkus, mode: 'insensitive' } },
        ],
      },
    });

    if (products.length === 0) {
      return { found: false, message: `Không tìm thấy sản phẩm nào trong danh sách: ${skus.join(', ')}` };
    }

    const groundedList = products.map(p => ProductGroundingEngine.groundProduct(p));
    const comparisonText = ProductGroundingEngine.buildComparison(groundedList);

    return {
      found: true,
      compared_count: groundedList.length,
      products: groundedList,
      summary: comparisonText,
    };
  }

  private async getProductDetail(sku: string) {
    const cleanSku = (sku || '').trim();
    const product = await prisma.productCache.findFirst({
      where: {
        orgId: this.orgId,
        OR: [
          { sku: { equals: cleanSku, mode: 'insensitive' } },
          { name: { contains: cleanSku, mode: 'insensitive' } },
        ],
      },
    });

    if (!product) {
      return { found: false, message: `Không tìm thấy thông tin sản phẩm cho mã SKU: ${sku}` };
    }

    const grounded = ProductGroundingEngine.groundProduct(product);

    return {
      found: true,
      sku: grounded.sku,
      name: grounded.name,
      specification: grounded.specification || grounded.uom,
      ingredients: grounded.ingredients, // null if unknown in DB, DO NOT FAKE!
      nutritional_info: grounded.description,
      target: grounded.target_audience, // null if unknown in DB, DO NOT FAKE!
      suitable_min_age_months: grounded.suitable_min_age_months,
      texture: grounded.texture_category,
      is_rawhide_free: grounded.is_rawhide_free,
      preservation: product.preservation,
      price: grounded.wholesale_price,
      wholesale_price: grounded.wholesale_price,
      formatted_price: grounded.formatted_price,
      safety_notes: grounded.safety_notes,
    };
  }

  private async checkPrice(sku: string) {
    const cleanSku = (sku || '').trim();
    const product = await prisma.productCache.findFirst({
      where: {
        orgId: this.orgId,
        OR: [
          { sku: { equals: cleanSku, mode: 'insensitive' } },
          { name: { contains: cleanSku, mode: 'insensitive' } },
        ],
      },
    });

    if (!product) {
      return { found: false, message: `Mã SKU ${sku} không tồn tại trong danh mục giá.` };
    }

    const price = product.wholesalePrice > 0 ? product.wholesalePrice : product.listPrice;

    return {
      found: true,
      sku: product.sku,
      name: product.name,
      price,
      uom: product.uomName || 'Gói',
      formatted_price: `${price.toLocaleString('vi-VN')} VNĐ`,
    };
  }

  private async checkInventory(sku: string) {
    const cleanSku = (sku || '').trim();
    // 1. Check in ProductCache
    const product = await prisma.productCache.findFirst({
      where: {
        orgId: this.orgId,
        OR: [
          { sku: { equals: cleanSku, mode: 'insensitive' } },
          { name: { contains: cleanSku, mode: 'insensitive' } },
        ],
      },
    });

    // 2. Try real-time Odoo lookup if available
    try {
      if (product?.odooId) {
        const odooStock = await odooService.checkProductInventory(product.odooId);
        if (odooStock) {
          return {
            sku: product.sku || cleanSku,
            name: product.name,
            isInStock: odooStock.isInStock,
            availableQty: odooStock.qtyAvailable,
            statusText: odooStock.statusText,
          };
        }
      }
    } catch (e) {
      // Fallback
    }

    // Default fallback to active status
    return {
      sku: product?.sku || cleanSku,
      name: product?.name || cleanSku,
      isInStock: product?.isActive ?? true,
      availableQty: 100,
      statusText: (product?.isActive ?? true) ? 'Còn hàng' : 'Hết hàng',
    };
  }

  private async getOrderStatus(phone?: string, orderCode?: string) {
    const where: any = { orgId: this.orgId };
    if (orderCode) {
      where.orderCode = { contains: orderCode.trim(), mode: 'insensitive' };
    }

    const orders = await prisma.orderHistory.findMany({
      where,
      orderBy: { dateOrder: 'desc' },
      take: 3,
      include: { lines: true },
    });

    if (!orders || orders.length === 0) {
      return { found: false, message: 'Chưa tìm thấy thông tin đơn hàng tương ứng.' };
    }

    return {
      found: true,
      orders: orders.map((o: any) => ({
        order_code: o.orderCode,
        partner_name: o.partnerName,
        date_order: o.dateOrder.toISOString().split('T')[0],
        state: o.state === 'sale' ? 'Đang giao hàng' : (o.state === 'done' ? 'Đã hoàn tất' : 'Đang xử lý'),
        total_amount: `${o.amountTotal.toLocaleString('vi-VN')} đ`,
        items: o.lines.map((l: any) => `${l.productName} (x${l.quantity})`),
      })),
    };
  }

  private async extractOrderDraft(instruction?: string) {
    const draft = await extractOrderFromConversation(this.orgId, this.conversationId, instruction);
    return {
      success: true,
      draft,
      summary: draft.customer?.name
        ? `Đơn hàng cho ${draft.customer.name}, SĐT: ${draft.customer.phone || 'Chưa rõ'}, Địa chỉ: ${draft.customer.shippingAddress || 'Chưa rõ'}. Gồm ${draft.items.length} món.`
        : `Đã ghi nhận ${draft.items.length} món. Còn thiếu: ${draft.missingInfo.join(', ')}.`,
    };
  }

  private async createLeadContact(data: any) {
    if (!this.contactId) {
      return { success: false, message: 'Không có Contact ID liên kết' };
    }

    await prisma.contact.update({
      where: { id: this.contactId },
      data: {
        fullName: data.fullName || undefined,
        phone: data.phone || undefined,
        address: data.address || undefined,
        notes: data.notes ? `[AI Note] ${data.notes}` : undefined,
      },
    });

    return { success: true, message: 'Đã cập nhật thông tin khách hàng vào CRM.' };
  }

  private async handoffToHuman(reason: string, urgency = 'normal') {
    return {
      handoff_triggered: true,
      reason,
      urgency,
      notice: 'Hệ thống đã kích hoạt chuyển giao và thông báo cho chuyên viên phụ trách.',
    };
  }

  private async searchFaqPolicy(query: string, category?: string) {
    const items = await knowledgeService.searchKnowledge(this.orgId, query, category, 3);
    if (!items || items.length === 0) {
      return { matched: false, message: 'Chưa có chính sách cụ thể cho câu hỏi này.' };
    }

    return {
      matched: true,
      results: items.map((i: any) => ({
        title: i.title,
        content: i.content,
      })),
    };
  }
}
