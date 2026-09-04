/**
 * seed-la-pet-promotions.ts — Seed official LA PET policies into Database.
 * Fulfills all policy specifications without any hardcoding in business logic.
 */

import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

const db = prisma as any;

export async function seedLaPetPromotions() {
  console.log('\n======================================================');
  console.log('🌱 BẮT ĐẦU SEED DỮ LIỆU CHÍNH SÁCH ƯU ĐÃI LA PET');
  console.log('======================================================\n');

  // 1. Get primary organization
  let org = await db.organization.findFirst({
    where: { name: { contains: 'La Pet', mode: 'insensitive' } },
  });

  if (!org) {
    org = await db.organization.findFirst();
  }

  if (!org) {
    console.error('❌ Không tìm thấy Organization để seed!');
    return;
  }

  const orgId = org.id;
  console.log(`🏢 Sử dụng Organization: "${org.name}" (${orgId})`);

  // 2. Update ProductCache with categories and brands for seamless matching
  console.log('📦 Cập nhật category & brand cho các sản phẩm trong ProductCache...');

  // Update Toothbrush bones E01-E06 (and E1-E6)
  await db.productCache.updateMany({
    where: {
      orgId,
      OR: [
        { sku: { in: ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6'], mode: 'insensitive' } },
        { name: { contains: 'bàn chải', mode: 'insensitive' } },
      ],
    },
    data: {
      category: 'Xương bàn chải',
      brand: 'Lapati',
    },
  });

  // Ensure E1-E6 exist in ProductCache for testing & demo
  const sampleEProducts = [
    { sku: 'E1', name: 'Xương bàn chải hương sữa', price: 19500 },
    { sku: 'E2', name: 'Xương bàn chải hương phô mai', price: 19500 },
    { sku: 'E3', name: 'Xương bàn chải hương thịt gà + thịt hươu', price: 19500 },
    { sku: 'E4', name: 'Xương bàn chải hương thịt bò', price: 19500 },
    { sku: 'E5', name: 'Xương bàn chải hương bạc hà', price: 19500 },
    { sku: 'E6', name: 'Xương bàn chải hương thịt ba rọi xông khói', price: 19500 },
  ];

  for (const ep of sampleEProducts) {
    const existing = await db.productCache.findFirst({
      where: {
        orgId,
        OR: [
          { sku: { equals: ep.sku, mode: 'insensitive' } },
          { name: { contains: ep.name, mode: 'insensitive' } },
        ],
      },
    });

    if (!existing) {
      await db.productCache.create({
        data: {
          orgId,
          odooId: 9000 + parseInt(ep.sku.replace(/\D/g, ''), 10),
          sku: ep.sku,
          name: ep.name,
          displayName: `[${ep.sku}] ${ep.name}`,
          wholesalePrice: ep.price,
          listPrice: ep.price,
          retailPrice: 25000,
          category: 'Xương bàn chải',
          brand: 'Lapati',
          isActive: true,
        },
      });
      console.log(`  + Đã tạo sản phẩm mẫu ${ep.sku}: ${ep.name}`);
    }
  }

  // Update other chew bones as 'Xương gặm'
  await db.productCache.updateMany({
    where: {
      orgId,
      OR: [
        { sku: { in: ['B03', 'B06', 'D02', 'D03', 'C24', 'C11', 'C17'], mode: 'insensitive' } },
        { name: { contains: 'que gặm', mode: 'insensitive' } },
        { name: { contains: 'que nhai', mode: 'insensitive' } },
        { name: { contains: 'xương nhai', mode: 'insensitive' } },
      ],
    },
    data: {
      category: 'Xương gặm',
      brand: 'Lapati',
    },
  });

  // Ensure sample brand treats exist for Buy 7 Get 1 testing
  const sampleTreats = [
    { sku: 'LP-TREAT-01', name: 'Bánh thưởng Lapati vị thịt bò', brand: 'Lapati', price: 35000 },
    { sku: 'DX-TREAT-01', name: 'Bánh thưởng Dexinbone vị sữa canxi', brand: 'Dexinbone', price: 38000 },
    { sku: 'INU-TREAT-01', name: 'Bánh thưởng INU cá ngừ sấy', brand: 'INU', price: 42000 },
  ];

  for (const st of sampleTreats) {
    const existing = await db.productCache.findFirst({
      where: { orgId, sku: st.sku },
    });
    if (!existing) {
      await db.productCache.create({
        data: {
          orgId,
          odooId: 9100 + Math.floor(Math.random() * 100),
          sku: st.sku,
          name: st.name,
          displayName: `[${st.sku}] ${st.name}`,
          wholesalePrice: st.price,
          listPrice: st.price,
          retailPrice: st.price + 10000,
          category: 'Bánh thưởng',
          brand: st.brand,
          isActive: true,
        },
      });
      console.log(`  + Đã tạo bánh thưởng mẫu ${st.sku}: ${st.name} (${st.brand})`);
    }
  }

  // 3. Define LA PET policies to upsert
  const policies = [
    // A. Chiết khấu cơ bản 22% (Mục II Chính sách Đại lý LA PET)
    {
      code: 'LA_PET_BASIC_22',
      name: 'Chính sách Chiết khấu cơ bản Đại lý 22%',
      description:
        'Chiết khấu cơ bản 22% trên giá bán lẻ đề xuất (MRP) trên nhóm sản phẩm áp dụng. Áp dụng từ ngày 07/07/2026 theo Chính sách đại lý LA PET 2026.',
      type: 'BASIC_DISCOUNT',
      targetScope: 'ALL_PRODUCTS',
      priority: 10,
      isStackable: true,
      isActive: true,
      startDate: new Date('2026-07-07T00:00:00.000Z'),
      endDate: null,
      conditions: {
        customerTypes: ['DEALER'],
      },
      actions: {
        actionType: 'PERCENT_DISCOUNT',
        discountPercent: 22,
      },
    },

    // B. Chiết khấu Xương gặm theo bậc giá trị (Phụ lục Chính sách Đại lý LA PET)
    {
      code: 'LA_PET_CHEW_TIER',
      name: 'Chiết khấu đơn hàng Xương gặm theo bậc giá trị',
      description:
        'Phụ lục chính sách đại lý LA PET: Đơn hàng Xương gặm đạt 3M (4%), 5M (5%), 8M (6%), 12M (7%), 20M (8%), 40M (9%), 60M (10%), 100M (13%).',
      type: 'TIER_DISCOUNT',
      targetScope: 'CATEGORY',
      priority: 20,
      isStackable: true,
      isActive: true,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: null,
      conditions: {
        applicableCategories: ['Xương gặm', 'Xương nhai', 'Que gặm', 'Xương bàn chải'],
        tiers: [
          { minAmount: 3000000, percent: 4 },
          { minAmount: 5000000, percent: 5 },
          { minAmount: 8000000, percent: 6 },
          { minAmount: 12000000, percent: 7 },
          { minAmount: 20000000, percent: 8 },
          { minAmount: 40000000, percent: 9 },
          { minAmount: 60000000, percent: 10 },
          { minAmount: 100000000, percent: 13 },
        ],
      },
      actions: {
        actionType: 'TIER_PERCENT',
        tiers: [
          { minAmount: 3000000, percent: 4 },
          { minAmount: 5000000, percent: 5 },
          { minAmount: 8000000, percent: 6 },
          { minAmount: 12000000, percent: 7 },
          { minAmount: 20000000, percent: 8 },
          { minAmount: 40000000, percent: 9 },
          { minAmount: 60000000, percent: 10 },
          { minAmount: 100000000, percent: 13 },
        ],
      },
    },

    // C. Chương trình Xương bàn chải 6 vị E1-E6 (Giá đặc biệt 15.000 VNĐ)
    {
      code: 'LA_PET_TOOTHBRUSH_COMBO',
      name: 'Chương trình Combo Xương bàn chải 6 vị E1-E6 giá đặc biệt 15.000đ',
      description:
        'Đại lý mua sản phẩm xương bàn chải đủ các vị (E1 hương sữa, E2 phô mai, E3 gà + hươu, E4 bò, E5 bạc hà, E6 ba rọi xông khói) trong thời gian từ 15/08 - 31/08/2026 sẽ được áp dụng giá hỗ trợ đặc biệt 15.000 vnđ/sản phẩm.',
      type: 'SPECIAL_PRICE',
      targetScope: 'SPECIFIC_SKUS',
      priority: 50,
      isStackable: true,
      isActive: true,
      startDate: new Date('2026-08-15T00:00:00.000Z'),
      endDate: new Date('2026-08-31T23:59:59.999Z'),
      conditions: {
        requiredAllSkus: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'],
        applicableSkus: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E01', 'E02', 'E03', 'E04', 'E05', 'E06'],
      },
      actions: {
        actionType: 'SPECIAL_UNIT_PRICE',
        specialUnitPrice: 15000,
      },
    },

    // D. Chương trình Bánh thưởng Mua 7 tặng 1 (Combo 3 thương hiệu)
    {
      code: 'LA_PET_BUY_7_GET_1',
      name: 'Chương trình Bánh thưởng Combo 3 thương hiệu Mua 7 Tặng 1',
      description:
        'Khi khách hàng mua kèm đơn Combo 9 sản phẩm bánh thưởng bao gồm cả 3 thương hiệu Lapati, Dexinbone và INU sẽ được áp dụng chương trình đặc biệt: Mua 7 tặng 1 (sản phẩm cùng loại).',
      type: 'BUY_X_GET_Y',
      targetScope: 'BRAND',
      priority: 40,
      isStackable: true,
      isActive: true,
      startDate: new Date('2026-07-07T00:00:00.000Z'),
      endDate: null,
      conditions: {
        applicableBrands: ['Lapati', 'Dexinbone', 'INU'],
        applicableCategories: ['Bánh thưởng', 'Treats'],
      },
      actions: {
        actionType: 'BUY_X_GET_Y',
        buyQuantity: 7,
        getQuantity: 1,
        giftType: 'SAME_PRODUCT',
      },
    },

    // E. Thưởng doanh số Quý (Mục IV & Phụ lục Chính sách Đại lý LA PET)
    {
      code: 'LA_PET_REWARD_QUARTER',
      name: 'Chính sách Thưởng Doanh Số Quý (Tất cả mã hàng)',
      description:
        'Mục IV Chính sách đại lý LA PET (Cố định năm 2026): Doanh số quý đạt 25M (6.0%), 50M (6.5%), 100M (7.0%), 200M (7.5%), 400M (8.0%), 600M (8.5%), 800M (9.0%), 1000M (9.5%). Thưởng được cấn trừ vào đơn hàng tiếp theo hoặc thanh toán theo chính sách LA PET.',
      type: 'SALES_REWARD_QUARTER',
      targetScope: 'ORDER_TOTAL',
      priority: 15,
      isStackable: true,
      isActive: true,
      startDate: new Date('2026-07-07T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.999Z'),
      conditions: {},
      actions: {
        actionType: 'SALES_REWARD',
        rewardTiers: [
          { minAmount: 25000000, rewardPercent: 6.0 },
          { minAmount: 50000000, rewardPercent: 6.5 },
          { minAmount: 100000000, rewardPercent: 7.0 },
          { minAmount: 200000000, rewardPercent: 7.5 },
          { minAmount: 400000000, rewardPercent: 8.0 },
          { minAmount: 600000000, rewardPercent: 8.5 },
          { minAmount: 800000000, rewardPercent: 9.0 },
          { minAmount: 1000000000, rewardPercent: 9.5 },
        ],
      },
    },

    // F. Thưởng doanh số Năm (Mục V & VI Chính sách Đại lý LA PET)
    {
      code: 'LA_PET_REWARD_YEAR',
      name: 'Chính sách Thưởng Doanh Số Năm (Tất cả mã hàng)',
      description:
        'Mục V & VI Chính sách đại lý LA PET: Doanh số năm đạt 100M (5.0%), 200M (5.5%), 400M (6.0%), 800M (6.5%), 1600M (7.0%), 2400M (7.5%), 3200M (8.0%), 4000M (8.5%). Điều kiện nhận thưởng năm: Thanh toán đúng hạn >= 95%, Không bán phá giá hoặc gây ảnh hưởng hệ thống phân phối, Duy trì mua hàng tối thiểu 10-12 tháng trong năm, Phân phối tối thiểu 15 SKU của LA PET.',
      type: 'SALES_REWARD_YEAR',
      targetScope: 'ORDER_TOTAL',
      priority: 15,
      isStackable: true,
      isActive: true,
      startDate: new Date('2026-07-07T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.999Z'),
      conditions: {
        rewardConditions: {
          onTimePaymentPercent: 95,
          noPriceDumping: true,
          minActiveMonths: 10,
          minDistributedSkus: 15,
        },
      },
      actions: {
        actionType: 'SALES_REWARD',
        rewardTiers: [
          { minAmount: 100000000, rewardPercent: 5.0 },
          { minAmount: 200000000, rewardPercent: 5.5 },
          { minAmount: 400000000, rewardPercent: 6.0 },
          { minAmount: 800000000, rewardPercent: 6.5 },
          { minAmount: 1600000000, rewardPercent: 7.0 },
          { minAmount: 2400000000, rewardPercent: 7.5 },
          { minAmount: 3200000000, rewardPercent: 8.0 },
          { minAmount: 4000000000, rewardPercent: 8.5 },
        ],
      },
    },
  ];

  for (const pol of policies) {
    const existing = await db.promotionPolicy.findFirst({
      where: { orgId, code: pol.code, version: 1 },
    });

    if (existing) {
      await db.promotionPolicy.update({
        where: { id: existing.id },
        data: {
          name: pol.name,
          description: pol.description,
          type: pol.type,
          targetScope: pol.targetScope,
          priority: pol.priority,
          isStackable: pol.isStackable,
          isActive: pol.isActive,
          startDate: pol.startDate,
          endDate: pol.endDate,
          conditions: pol.conditions,
          actions: pol.actions,
        },
      });
      console.log(`  ✓ Đã cập nhật chính sách: [${pol.code}] ${pol.name}`);
    } else {
      const created = await db.promotionPolicy.create({
        data: {
          orgId,
          code: pol.code,
          name: pol.name,
          description: pol.description,
          type: pol.type,
          targetScope: pol.targetScope,
          priority: pol.priority,
          isStackable: pol.isStackable,
          isActive: pol.isActive,
          startDate: pol.startDate,
          endDate: pol.endDate,
          version: 1,
          conditions: pol.conditions,
          actions: pol.actions,
        },
      });

      await db.promotionAuditLog.create({
        data: {
          orgId,
          promotionId: created.id,
          version: 1,
          changeType: 'CREATE',
          snapshotAfter: created,
          comment: 'Hệ thống khởi tạo chính sách LA PET',
        },
      });
      console.log(`  + Đã tạo mới chính sách: [${pol.code}] ${pol.name}`);
    }
  }

  console.log('\n✅ SEED CHÍNH SÁCH LA PET THÀNH CÔNG!\n');
}

// Auto-run if executed via CLI
if (process.argv[1]?.endsWith('seed-la-pet-promotions.ts') || process.argv[1]?.endsWith('seed-la-pet-promotions.js')) {
  seedLaPetPromotions()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Lỗi seed chính sách LA PET:', err);
      process.exit(1);
    });
}
