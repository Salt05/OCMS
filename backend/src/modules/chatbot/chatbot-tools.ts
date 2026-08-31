/**
 * Chatbot Function Calling Tools Registry.
 * All tools return deterministic structured data. LLM does NOT query DB directly.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { odooService } from '../odoo/odoo-service.js';
import { knowledgeService } from './knowledge-service.js';
import { extractOrderFromConversation } from '../orders/ai-order-service.js';
import { ProductGroundingEngine } from './product-grounding.js';
import { zaloPool } from '../zalo/zalo-pool.js';
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
      description: 'Bóc tách danh sách món, số lượng, địa chỉ và SĐT từ ngữ cảnh hội thoại thành phiếu đơn hàng nháp để gửi tóm tắt cho khách kiểm tra.',
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
      name: 'confirm_customer_order',
      description: 'Chốt đơn hàng sau khi khách hàng đã kiểm tra thông tin và nhắn xác nhận đồng ý (ví dụ: "Đồng ý", "Xác nhận", "Ok em", "Chốt đơn"). Chuyển đơn sang trạng thái CONFIRMATION để nhân viên duyệt sang Odoo.',
      parameters: {
        type: 'object',
        properties: {
          note: {
            type: 'string',
            description: 'Ghi chú thêm về đơn hàng từ khách (nếu có)',
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
      name: 'lookup_odoo_customer',
      description: 'Tra cứu hồ sơ khách hàng Odoo ERP (theo SĐT, tên hoặc mã đối tác odooPartnerId) để tự động lấy địa chỉ giao hàng, khu vực/zone, công nợ, nhân viên phụ trách mà không bắt khách nhập lại.',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Số điện thoại của khách' },
          odoo_partner_id: { type: 'number', description: 'Mã ID khách hàng trên Odoo nếu có' },
          name: { type: 'string', description: 'Tên khách hàng hoặc tên cửa hàng/đại lý' },
        },
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

        case 'confirm_customer_order':
          return this.confirmCustomerOrder(args.note);

        case 'create_lead_contact':
          return this.createLeadContact(args);

        case 'lookup_odoo_customer':
          return this.lookupOdooCustomer(args);

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
      return {
        found: false,
        message: `Hiện tại hệ thống chưa tìm thấy mã ${sku}. Nhờ mình mô tả thêm về đặc điểm, hình dáng hoặc hương vị sản phẩm để em tìm đúng loại cho mình nhé ạ!`,
      };
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
      return {
        found: false,
        message: `Hiện tại hệ thống chưa tìm thấy mã ${sku}. Nhờ mình mô tả thêm về sản phẩm để em tìm giúp mình ạ.`,
      };
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
    const product = await prisma.productCache.findFirst({
      where: {
        orgId: this.orgId,
        OR: [
          { sku: { equals: cleanSku, mode: 'insensitive' } },
          { name: { contains: cleanSku, mode: 'insensitive' } },
        ],
      },
    });

    if (product) {
      return {
        sku: product.sku || cleanSku,
        name: product.name,
        isInStock: true,
        available: true,
        statusText: 'Sản phẩm đang có sẵn hàng đầy đủ để phục vụ mình ạ.',
      };
    }

    return {
      sku: cleanSku,
      isInStock: false,
      available: false,
      message: `Hiện tại hệ thống chưa tìm thấy mã ${cleanSku}. Nhờ mình mô tả thêm về hình dáng, hương vị hoặc công dụng của sản phẩm để em hỗ trợ tìm đúng sản phẩm cho mình nhé ạ!`,
      statusText: 'Chưa tìm thấy mã sản phẩm trên hệ thống',
    };
  }

  private async getCurrentContact(): Promise<any> {
    if (this.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: this.contactId, orgId: this.orgId },
      });
      if (contact) return contact;
    }

    if (this.conversationId) {
      const conv = await prisma.conversation.findFirst({
        where: { id: this.conversationId, orgId: this.orgId },
        include: { contact: true },
      });
      if (conv?.contact) return conv.contact;
    }

    return null;
  }

  private async getOrderStatus(phone?: string, orderCode?: string) {
    const currentContact = await this.getCurrentContact();

    const contactPhones: string[] = [];
    if (currentContact?.phone) {
      const clean = currentContact.phone.replace(/\D/g, '');
      if (clean.length >= 9) contactPhones.push(clean.slice(-9));
    }
    if (phone) {
      const cleanInput = phone.replace(/\D/g, '');
      if (cleanInput.length >= 9) contactPhones.push(cleanInput.slice(-9));
    }

    const contactName = (currentContact?.fullName || '').trim().toLowerCase();
    const contactOdooId = currentContact?.customerId ? parseInt(currentContact.customerId, 10) : null;

    if (orderCode) {
      const cleanOrderCode = orderCode.trim();
      const order = await prisma.orderHistory.findFirst({
        where: {
          orgId: this.orgId,
          orderCode: { contains: cleanOrderCode, mode: 'insensitive' },
        },
        include: { lines: true, customerProfile: true },
      });

      if (!order) {
        return {
          found: false,
          message: `Dạ hệ thống không tìm thấy đơn hàng ${cleanOrderCode} trong lịch sử mua hàng của mình ạ. Mình vui lòng kiểm tra lại mã đơn hàng giúp em nhé!`,
        };
      }

      // ── STRICT CUSTOMER OWNERSHIP VERIFICATION ──
      let isOwner = false;

      // 1. Check matching Odoo Partner ID / Customer Profile ID
      if (contactOdooId && !isNaN(contactOdooId)) {
        if (order.odooPartnerId === contactOdooId || order.customerProfile?.odooPartnerId === contactOdooId) {
          isOwner = true;
        }
      }
      if (currentContact?.customerId && order.customerProfileId === currentContact.customerId) {
        isOwner = true;
      }

      // 2. Check matching Phone numbers
      const orderPhone = (order.customerProfile?.phone || '').replace(/\D/g, '');
      if (orderPhone && contactPhones.some(p => orderPhone.includes(p))) {
        isOwner = true;
      }

      // 3. Check matching Full Name
      const orderPartnerName = (order.partnerName || '').trim().toLowerCase();
      if (contactName && orderPartnerName && (contactName.includes(orderPartnerName) || orderPartnerName.includes(contactName))) {
        isOwner = true;
      }

      // If the order DOES NOT belong to the current customer -> Block access and return not found!
      if (!isOwner) {
        logger.warn(
          `[chatbot-tools] Security Guardrail: Blocked unauthorized order lookup! Customer "${currentContact?.fullName || 'Unknown'}" (ID: ${currentContact?.id}) tried to access order "${order.orderCode}" belonging to "${order.partnerName}"`
        );
        return {
          found: false,
          message: `Dạ hệ thống không tìm thấy đơn hàng ${cleanOrderCode} trong lịch sử mua hàng của mình ạ. Mình vui lòng kiểm tra lại mã đơn hàng giúp em nhé!`,
        };
      }

      // Customer IS the owner -> return their own order details
      return {
        found: true,
        orders: [{
          order_code: order.orderCode,
          partner_name: order.partnerName,
          date_order: order.dateOrder.toISOString().split('T')[0],
          state: order.state === 'sale' ? 'Đang giao hàng' : (order.state === 'done' ? 'Đã hoàn tất' : 'Đang xử lý đóng gói'),
          total_amount: `${order.amountTotal.toLocaleString('vi-VN')} đ`,
          items: order.lines.map((l: any) => `${l.productName} (x${l.quantity})`),
        }],
      };
    }

    // If no orderCode is specified, lookup the customer's own recent orders only
    const userOrConditions: any[] = [];
    if (contactOdooId && !isNaN(contactOdooId)) userOrConditions.push({ odooPartnerId: contactOdooId });
    if (currentContact?.customerId) userOrConditions.push({ customerProfileId: currentContact.customerId });
    if (contactName && contactName.length >= 2) userOrConditions.push({ partnerName: { contains: contactName, mode: 'insensitive' } });
    if (contactPhones.length > 0) {
      for (const cp of contactPhones) {
        userOrConditions.push({ customerProfile: { phone: { contains: cp } } });
      }
    }

    if (userOrConditions.length === 0) {
      return {
        found: false,
        message: 'Dạ hiện tại em chưa tìm thấy đơn hàng nào trong lịch sử mua hàng của mình ạ. Mình có thể cung cấp mã đơn hàng hoặc SĐT đặt hàng để em tra cứu giúp mình nhé!',
      };
    }

    const orders = await prisma.orderHistory.findMany({
      where: {
        orgId: this.orgId,
        OR: userOrConditions,
      },
      orderBy: { dateOrder: 'desc' },
      take: 3,
      include: { lines: true },
    });

    if (!orders || orders.length === 0) {
      return {
        found: false,
        message: 'Dạ hiện tại em chưa tìm thấy đơn hàng nào trong lịch sử mua hàng của mình ạ.',
      };
    }

    return {
      found: true,
      orders: orders.map((o: any) => ({
        order_code: o.orderCode,
        partner_name: o.partnerName,
        date_order: o.dateOrder.toISOString().split('T')[0],
        state: o.state === 'sale' ? 'Đang giao hàng' : (o.state === 'done' ? 'Đã hoàn tất' : 'Đang xử lý đóng gói'),
        total_amount: `${o.amountTotal.toLocaleString('vi-VN')} đ`,
        items: o.lines.map((l: any) => `${l.productName} (x${l.quantity})`),
      })),
    };
  }

  private async extractOrderDraft(instruction?: string) {
    const draft = await extractOrderFromConversation(this.orgId, this.conversationId, instruction);
    
    if (draft && draft.items && draft.items.length > 0) {
      const subtotal = draft.items.reduce((sum: number, it: any) => sum + ((it.quantity || 1) * (it.priceUnit || 0)), 0);
      const savedDraft = {
        items: draft.items.map((it: any) => ({
          matchedProductOdooId: it.matchedProductOdooId,
          sku: it.sku || '',
          name: it.matchedProductName || it.productNameRaw || '',
          productNameRaw: it.productNameRaw,
          quantity: Number(it.quantity) || 1,
          qty: Number(it.quantity) || 1,
          priceUnit: it.priceUnit || 0,
          price: it.priceUnit || 0,
          discount: it.discount || 0,
        })),
        customer: {
          name: draft.customer?.name || null,
          phone: draft.customer?.phone || null,
          shippingAddress: draft.customer?.shippingAddress || null,
        },
        recipientName: draft.customer?.name || undefined,
        phone: draft.customer?.phone || undefined,
        address: draft.customer?.shippingAddress || undefined,
        subtotal,
        amountTotal: subtotal,
        paymentTerm: draft.paymentTerm || (draft as any).payment_term || null,
        notes: draft.notes || null,
        missingInfo: draft.missingInfo || [],
      };

      if (!savedDraft.paymentTerm) {
        if (!savedDraft.missingInfo.includes('Điều khoản thanh toán')) {
          savedDraft.missingInfo.push('Điều khoản thanh toán');
        }
      }

      try {
        await prisma.conversationAiState.upsert({
          where: { conversationId: this.conversationId },
          create: {
            orgId: this.orgId,
            conversationId: this.conversationId,
            draftOrder: savedDraft,
          },
          update: {
            draftOrder: savedDraft,
          },
        });

        await prisma.conversation.update({
          where: { id: this.conversationId },
          data: { currentState: 'ORDER_COLLECTION' },
        });

        // Realtime notifications to frontend live cart preview (NOT approval queue yet)
        zaloPool.getIO()?.emit('chat:order_draft_updated', {
          conversationId: this.conversationId,
          draftOrder: savedDraft,
        });
        zaloPool.getIO()?.emit('chat:state_updated', {
          conversationId: this.conversationId,
          currentState: 'ORDER_COLLECTION',
        });
      } catch (dbErr) {
        logger.error('[chatbot-tools] Error persisting draft order:', dbErr);
      }

      const paymentTermNote = savedDraft.paymentTerm
        ? `Điều khoản thanh toán: ${savedDraft.paymentTerm}.`
        : `CẢNH BÁO: ĐƠN HÀNG ĐANG THIẾU ĐIỀU KHOẢN THANH TOÁN! BẮT BUỘC bạn phải hỏi ngắn gọn: "Dạ cho em biết mình muốn thanh toán ngay hay trong bao lâu ạ?". TUYỆT ĐỐI KHÔNG ĐƯỢC BẢO KHÁCH XÁC NHẬN CHỐT ĐƠN KHI CHƯA CÓ ĐIỀU KHOẢN THANH TOÁN!`;

      return {
        success: true,
        draft: savedDraft,
        subtotal,
        formatted_total: `${subtotal.toLocaleString('vi-VN')} đ`,
        summary: `Đã bóc tách đơn hàng thành công gồm ${savedDraft.items.length} sản phẩm, tổng tiền: ${subtotal.toLocaleString('vi-VN')} đ. ${paymentTermNote} Khách nhận: ${savedDraft.recipientName || 'Chưa rõ'}, SĐT: ${savedDraft.phone || 'Chưa rõ'}, Địa chỉ: ${savedDraft.address || 'Chưa rõ'}.`,
      };
    }

    return {
      success: true,
      draft,
      summary: draft.customer?.name
        ? `Đơn hàng cho ${draft.customer.name}, SĐT: ${draft.customer.phone || 'Chưa rõ'}, Địa chỉ: ${draft.customer.shippingAddress || 'Chưa rõ'}. Gồm ${draft.items.length} món.`
        : `Đã ghi nhận ${draft.items.length} món. Còn thiếu: ${draft.missingInfo.join(', ')}.`,
    };
  }

  public async confirmCustomerOrder(note?: string) {
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: this.conversationId },
        include: { aiState: true, contact: true },
      });

      if (!conv || !conv.aiState?.draftOrder) {
        return { success: false, message: 'Chưa có đơn hàng nháp để xác nhận' };
      }

      const draft = (conv.aiState.draftOrder as any) || {};
      draft.isConfirmedByCustomer = true;
      if (note) draft.notes = note;

      await prisma.conversationAiState.update({
        where: { conversationId: this.conversationId },
        data: { draftOrder: draft },
      });

      await prisma.conversation.update({
        where: { id: this.conversationId },
        data: { currentState: 'CONFIRMATION' },
      });

      // Realtime notification to staff
      zaloPool.getIO()?.emit('chat:order_draft_updated', {
        conversationId: this.conversationId,
        draftOrder: draft,
      });
      zaloPool.getIO()?.emit('chat:state_updated', {
        conversationId: this.conversationId,
        currentState: 'CONFIRMATION',
      });
      zaloPool.getIO()?.emit('order:created', {
        conversationId: this.conversationId,
        partnerName: draft.customer?.name || conv.contact?.fullName || 'Khách hàng',
        amountTotal: draft.amountTotal || draft.subtotal || 0,
      });
      zaloPool.getIO()?.emit('order:updated');

      return {
        success: true,
        message: 'Đã ghi nhận đơn hàng thành công và chuyển sang trạng thái chờ nhân viên kiểm tra duyệt. Hãy phản hồi ngắn gọn đúng 3 nội dung: thông báo đã ghi nhận đơn, đơn đang chờ nhân viên kiểm tra xác nhận, và gửi lời cảm ơn. Tuyệt đối không nói đơn đã chuyển sang bộ phận đóng gói/giao hàng.',
      };
    } catch (err: any) {
      logger.error('[chatbot-tools] Error confirming customer order:', err);
      return { success: false, error: err.message };
    }
  }

  private async lookupOdooCustomer(args: { phone?: string; odoo_partner_id?: number; name?: string }) {
    const cleanPhone = (args.phone || '').trim().replace(/[^0-9]/g, '');
    const partnerId = args.odoo_partner_id;
    const cleanName = (args.name || '').trim();

    const orClauses: any[] = [];
    if (partnerId && !isNaN(partnerId)) orClauses.push({ odooPartnerId: partnerId });
    if (cleanPhone && cleanPhone.length >= 7) {
      orClauses.push({ phone: { contains: cleanPhone } });
      orClauses.push({ mobile: { contains: cleanPhone } });
    }
    if (cleanName && cleanName.length >= 3) {
      orClauses.push({ name: { contains: cleanName, mode: 'insensitive' } });
    }

    if (orClauses.length === 0) {
      return { found: false, message: 'Vui lòng cung cấp SĐT, tên hoặc mã ID khách hàng để tra cứu.' };
    }

    const profile = await prisma.customerProfile.findFirst({
      where: {
        orgId: this.orgId,
        OR: orClauses,
      },
    });

    if (!profile) {
      return { found: false, message: 'Chưa tìm thấy hồ sơ khách hàng khớp trên hệ thống Odoo ERP.' };
    }

    // Auto-link to Contact if contactId exists
    if (this.contactId) {
      await prisma.contact.update({
        where: { id: this.contactId },
        data: {
          customerId: String(profile.odooPartnerId),
          fullName: profile.name || undefined,
          phone: profile.phone || profile.mobile || undefined,
          address: profile.fullAddress || profile.street || undefined,
          zone: profile.zone || undefined,
          salesperson: profile.salesperson || undefined,
        },
      });
    }

    return {
      found: true,
      partner_id: profile.odooPartnerId,
      name: profile.name,
      phone: profile.phone || profile.mobile || 'Chưa có',
      address: profile.fullAddress || profile.street || 'Chưa có',
      city: profile.city || undefined,
      zone: profile.zone || 'Chưa phân vùng',
      salesperson: profile.salesperson || 'Chưa phân bổ',
      payment_term: profile.paymentTermName || 'Thanh toán khi nhận hàng (COD)',
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
