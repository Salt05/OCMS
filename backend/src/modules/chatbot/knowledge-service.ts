/**
 * Knowledge Base Service for Chatbot FAQ, policies, and product guides.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export interface KnowledgeItemInput {
  category: string; // faq, policy, product_guide, script
  title: string;
  content: string;
  keywords?: string;
  isPublic?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

class KnowledgeService {
  async searchKnowledge(orgId: string, query: string, category?: string, limit = 4) {
    try {
      const q = query.trim().toLowerCase();
      const whereClause: any = {
        orgId,
        isActive: true,
      };

      if (category && category !== 'all') {
        whereClause.category = category;
      }

      // Fetch active items
      const items = await prisma.knowledgeBase.findMany({
        where: whereClause,
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        take: 30,
      });

      if (!items || items.length === 0) {
        return [];
      }

      if (!q) {
        return items.slice(0, limit);
      }

      // Keyword & string matching
      const words = q.split(/\s+/).filter(w => w.length > 1);
      const scored = items.map((item: any) => {
        let score = 0;
        const titleLower = item.title.toLowerCase();
        const contentLower = item.content.toLowerCase();
        const keywordsLower = (item.keywords || '').toLowerCase();

        if (titleLower.includes(q)) score += 10;
        if (keywordsLower.includes(q)) score += 8;
        if (contentLower.includes(q)) score += 5;

        for (const w of words) {
          if (titleLower.includes(w)) score += 3;
          if (keywordsLower.includes(w)) score += 2;
          if (contentLower.includes(w)) score += 1;
        }

        return { item, score };
      });

      return scored
        .filter((s: any) => s.score > 0)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, limit)
        .map((s: any) => s.item);
    } catch (err: any) {
      logger.error('[knowledge-service] searchKnowledge error:', err.message);
      return [];
    }
  }

  async listKnowledge(orgId: string, options?: { category?: string; isActive?: boolean }) {
    const where: any = { orgId };
    if (options?.category) where.category = options.category;
    if (typeof options?.isActive === 'boolean') where.isActive = options.isActive;

    return prisma.knowledgeBase.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createKnowledge(orgId: string, input: KnowledgeItemInput) {
    return prisma.knowledgeBase.create({
      data: {
        orgId,
        category: input.category,
        title: input.title,
        content: input.content,
        keywords: input.keywords || null,
        isPublic: input.isPublic ?? true,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }

  async updateKnowledge(id: string, orgId: string, input: Partial<KnowledgeItemInput>) {
    return prisma.knowledgeBase.updateMany({
      where: { id, orgId },
      data: {
        ...input,
        updatedAt: new Date(),
      },
    });
  }

  async deleteKnowledge(id: string, orgId: string) {
    return prisma.knowledgeBase.deleteMany({
      where: { id, orgId },
    });
  }

  async seedDefaultKnowledgeIfEmpty(orgId: string) {
    try {
      const count = await prisma.knowledgeBase.count({ where: { orgId } });
      if (count > 0) return;

      const defaults: KnowledgeItemInput[] = [
        {
          category: 'policy',
          title: 'Chính sách Đổi trả và Bảo hành',
          content: 'LA PET hỗ trợ đổi trả miễn phí trong vòng 7 ngày kể từ ngày nhận hàng nếu sản phẩm có lỗi từ nhà sản xuất, bao bì rách hỏng trong quá trình vận chuyển, hoặc giao sai phân loại sản phẩm. Quý khách vui lòng giữ nguyên bao bì và gửi hình ảnh mở hộp để được hỗ trợ nhanh nhất.',
          keywords: 'đổi trả, bảo hành, hàng lỗi, hoàn tiền, rách bao bì, trả hàng',
          sortOrder: 1,
        },
        {
          category: 'policy',
          title: 'Chính sách Vận chuyển và Miễn phí Giao hàng',
          content: 'LA PET hỗ trợ giao hàng toàn quốc:\n- Miễn phí vận chuyển (Freeship) cho đơn hàng có giá trị từ 300.000 VNĐ trở lên.\n- Nội thành TP.HCM: Giao hỏa tốc 2-4 giờ hoặc giao tiêu chuẩn trong ngày (phí 20.000 - 30.000 VNĐ).\n- Các tỉnh thành khác: Giao từ 2-3 ngày làm việc qua đơn vị vận chuyển Viettel Post / GHTK.',
          keywords: 'vận chuyển, ship, phí ship, giao hàng, freeship, thời gian giao, nội thành',
          sortOrder: 2,
        },
        {
          category: 'product_guide',
          title: 'Ưu điểm Que gặm Rawhide-Free (Không Da Bò Sống)',
          content: 'Các dòng que gặm sạch răng và snack nhai của LA PET áp dụng công nghệ Rawhide-Free (hoàn toàn không dùng da bò sống chưa qua xử lý), giúp dễ tiêu hóa, chống tắc nghẽn đường ruột 100%, bổ sung thịt thật, canxi và các vitamin khoáng chất hỗ trợ răng nướu khỏe mạnh.',
          keywords: 'rawhide-free, da bò sống, tiêu hóa, tắc ruột, que gặm, sạch răng, hôi miệng',
          sortOrder: 3,
        },
        {
          category: 'product_guide',
          title: 'Hướng dẫn Bảo quản Bánh thưởng & Que gặm LA PET',
          content: 'Bảo quản sản phẩm ở nơi khô ráo, thoáng mát, tránh ánh nắng trực tiếp và nơi có độ ẩm cao. Sau khi mở túi, vui lòng kéo chặt khóa zip hoặc bảo quản trong hộp kín. Nên sử dụng hết trong vòng 30 ngày kể từ ngày mở túi.',
          keywords: 'bảo quản, hạn sử dụng, zip, hỏng mốc, để được bao lâu',
          sortOrder: 4,
        },
        {
          category: 'faq',
          title: 'Cún con mấy tháng tuổi thì ăn được que gặm LA PET?',
          content: 'Dòng que gặm sạch răng mềm (B03, B06) và bánh thưởng dinh dưỡng thích hợp cho cún từ 3 tháng tuổi trở lên khi răng sữa đã hoàn thiện. Với cún dưới 3 tháng tuổi, nên ưu tiên sữa mẹ hoặc thức ăn hạt ngâm mềm.',
          keywords: 'mấy tháng, tuổi ăn được, chó con, 2 tháng, 3 tháng, poodle con',
          sortOrder: 5,
        },
      ];

      for (const d of defaults) {
        await this.createKnowledge(orgId, d);
      }
      logger.info(`[knowledge-service] Seeded ${defaults.length} default knowledge items for org ${orgId}`);
    } catch (err: any) {
      logger.warn('[knowledge-service] Failed to seed default knowledge:', err.message);
    }
  }
}

export const knowledgeService = new KnowledgeService();
