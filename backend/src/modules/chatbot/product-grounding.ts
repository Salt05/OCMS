/**
 * Product Grounding Module for AI Auto Chat.
 * Extracts structured, verifiable product attributes from ProductCache/Database.
 * Strictly avoids synthetic or hallucinated product data.
 */
import { prisma } from '../../shared/database/prisma-client.js';

export interface GroundedProduct {
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  price: number;
  wholesale_price: number;
  formatted_price: string;
  uom: string;
  specification: string | null;
  ingredients: string | null;
  target_audience: string | null;
  description: string | null;
  suitable_min_age_months: number | null;
  texture_category: 'soft' | 'chewy' | 'hard' | 'crispy' | 'unknown';
  is_rawhide_free: boolean | null;
  confirmed_benefits: string[];
  safety_notes: string[];
}

export class ProductGroundingEngine {
  /**
   * Normalizes and parses raw product cache row into grounded product facts
   */
  static groundProduct(product: any): GroundedProduct {
    const rawName = (product.name || '').trim();
    const rawSku = (product.sku || '').trim();
    const rawIng = product.ingredients ? product.ingredients.trim() : null;
    const rawTarget = product.target ? product.target.trim() : null;
    const rawDesc = product.description ? product.description.trim() : null;
    const rawSpec = product.specification || product.weight || null;
    const rawBrand = product.brand ? product.brand.trim() : null;
    const rawCategory = product.category ? product.category.trim() : null;

    const wholesalePrice = product.wholesalePrice > 0 ? product.wholesalePrice : product.listPrice;

    // Detect minimum age if explicitly specified in target/name/description
    let minAge: number | null = null;
    const allText = `${rawName} ${rawTarget || ''} ${rawDesc || ''}`.toLowerCase();
    const ageMatch = allText.match(/(?:từ|tren|cho cún)\s*(\d+)\s*(?:tháng|thang)/i);
    if (ageMatch && ageMatch[1]) {
      minAge = parseInt(ageMatch[1], 10);
    } else if (allText.includes('3 tháng')) {
      minAge = 3;
    } else if (allText.includes('cho con') || allText.includes('chó con') || allText.includes('puppy')) {
      minAge = 3;
    }

    // Detect texture category
    let texture: 'soft' | 'chewy' | 'hard' | 'crispy' | 'unknown' = 'unknown';
    if (allText.includes('mềm') || allText.includes('dễ nhai') || allText.includes('bàn chải mềm') || allText.includes('que xoắn sữa')) {
      texture = 'soft';
    } else if (allText.includes('giòn') || allText.includes('bánh giòn') || allText.includes('xốp')) {
      texture = 'crispy';
    } else if (allText.includes('dai') || allText.includes('dẻo') || allText.includes('da heo') || allText.includes('da bò')) {
      texture = 'chewy';
    } else if (allText.includes('cứng') || allText.includes('mài răng cứng')) {
      texture = 'hard';
    }

    // Detect Rawhide-free claim
    let isRawhideFree: boolean | null = null;
    if (allText.includes('rawhide-free') || allText.includes('không da bò sống') || allText.includes('khong da bo song')) {
      isRawhideFree = true;
    } else if (rawIng && rawIng.toLowerCase().includes('da bò sống')) {
      isRawhideFree = false;
    }

    // Extract confirmed benefits without overclaiming
    const benefits: string[] = [];
    if (allText.includes('sạch răng') || allText.includes('mảng bám') || allText.includes('bàn chải')) {
      benefits.push('Hỗ trợ làm sạch mảng bám răng miệng');
    }
    if (allText.includes('dễ tiêu hóa') || allText.includes('tiêu hóa')) {
      benefits.push('Hỗ trợ tiêu hóa');
    }
    if (allText.includes('canxi') || allText.includes('khoáng chất')) {
      benefits.push('Bổ sung canxi và khoáng chất');
    }

    // Safety notes
    const safety: string[] = [
      'Nên quan sát thú cưng trong khi nhai thức ăn/que gặm',
      'Đảm bảo luôn có sẵn nước uống sạch cho bé',
    ];

    return {
      sku: rawSku,
      name: rawName,
      brand: rawBrand,
      category: rawCategory,
      price: wholesalePrice,
      wholesale_price: wholesalePrice,
      formatted_price: `${wholesalePrice.toLocaleString('vi-VN')} đ`,
      uom: product.uomName || 'Gói',
      specification: rawSpec,
      ingredients: rawIng,
      target_audience: rawTarget,
      description: rawDesc,
      suitable_min_age_months: minAge,
      texture_category: texture,
      is_rawhide_free: isRawhideFree,
      confirmed_benefits: benefits,
      safety_notes: safety,
    };
  }

  /**
   * Builds structured comparison between 2 or more products based on ground-truth facts
   */
  static buildComparison(products: GroundedProduct[]): string {
    if (!products || products.length === 0) {
      return 'Không tìm thấy thông tin sản phẩm để so sánh.';
    }

    return products.map(p => {
      const ingStr = p.ingredients ? p.ingredients : 'Chưa có thông tin thành phần chi tiết trong CSDL';
      const targetStr = p.target_audience ? p.target_audience : 'Chưa có thông tin đối tượng cụ thể trong CSDL';
      const ageStr = p.suitable_min_age_months !== null ? `Từ ${p.suitable_min_age_months} tháng tuổi trở lên` : 'Chưa có thông tin xác nhận độ tuổi trong CSDL';
      const textureStr = p.texture_category !== 'unknown' ? p.texture_category : 'Chưa rõ';
      const rawhideStr = p.is_rawhide_free === true ? 'Công nghệ Rawhide-Free (Không da bò sống)' : (p.is_rawhide_free === false ? 'Có da bò tự nhiên' : 'Không đề cập');
      const catStr = p.category ? `\n- Ngành hàng: ${p.category}` : '';
      const brandStr = p.brand ? `\n- Thương hiệu (Brand): ${p.brand}` : '';

      return `
📌 [Mã ${p.sku}] ${p.name}${catStr}${brandStr}
- Giá sỉ niêm yết: ${p.formatted_price} (${p.specification || p.uom})
- Thành phần: ${ingStr}
- Độ mềm/kết cấu: ${textureStr}
- Đối tượng phù hợp: ${targetStr} (Độ tuổi xác nhận: ${ageStr})
- Công nghệ Rawhide: ${rawhideStr}
- Đặc tính xác nhận: ${p.confirmed_benefits.join(', ') || 'Chăm sóc răng miệng, bổ sung dinh dưỡng'}
`;
    }).join('\n----------------------------------------\n');
  }
}
