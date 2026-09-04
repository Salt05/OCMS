/**
 * pricing-promotion-engine.test.ts — Complete automated test suite with all 18 test cases.
 * Validates calculation accuracy, boundary thresholds, combos, gifts, time validity, immutability, and AI query.
 */

import { PricingPromotionEngine, PromotionPolicyRecord } from '../src/modules/promotions/pricing-promotion-engine.js';
import { PromotionService } from '../src/modules/promotions/promotion-service.js';
import { prisma } from '../src/shared/database/prisma-client.js';

const db = prisma as any;

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 BẮT ĐẦU CHẠY BỘ KIỂM THỬ TỰ ĐỘNG 18 TEST CASES');
  console.log('======================================================\n');

  // Load policies from DB or initialize standard test policies
  let org = await db.organization.findFirst({
    where: { name: { contains: 'La Pet', mode: 'insensitive' } },
  });
  if (!org) {
    org = await db.organization.findFirst();
  }
  const orgId = org?.id || 'test-org-id';

  const policiesFromDb = await db.promotionPolicy.findMany({
    where: { orgId, isActive: true, deletedAt: null },
    orderBy: { priority: 'desc' },
  });

  const testPolicies: PromotionPolicyRecord[] = policiesFromDb.map((p: any) => ({
    id: p.id,
    orgId: p.orgId,
    code: p.code,
    name: p.name,
    description: p.description,
    type: p.type,
    targetScope: p.targetScope,
    priority: p.priority,
    isStackable: p.isStackable,
    isActive: p.isActive,
    startDate: p.startDate,
    endDate: p.endDate,
    version: p.version,
    parentPolicyId: p.parentPolicyId,
    conditions: p.conditions,
    actions: p.actions,
  }));

  // Policy references
  const chewTierPolicy = testPolicies.find((p) => p.code === 'LA_PET_CHEW_TIER')!;
  const toothbrushComboPolicy = testPolicies.find((p) => p.code === 'LA_PET_TOOTHBRUSH_COMBO')!;
  const buy7Get1Policy = testPolicies.find((p) => p.code === 'LA_PET_BUY_7_GET_1')!;
  const quarterRewardPolicy = testPolicies.find((p) => p.code === 'LA_PET_REWARD_QUARTER')!;
  const yearRewardPolicy = testPolicies.find((p) => p.code === 'LA_PET_REWARD_YEAR')!;

  // ──────────────────────────────────────────────────────────────────────────
  // NHÓM 1: BẬC CHIẾT KHẤU XƯƠNG GẶM & NGƯỠNG BIÊN (Test 1 - Test 6)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- Nhóm 1: Bậc chiết khấu Xương gặm & Ngưỡng biên ---');

  // Test 1: Đơn 2 triệu Xương gặm -> 0% chiết khấu bậc
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        items: [{ sku: 'B03', category: 'Xương gặm', quantity: 1, priceUnit: 2000000 }],
      },
      [chewTierPolicy]
    );
    assert(res.discountAmount === 0 && res.appliedDiscounts.length === 0, 'Test 1: Đơn 2 triệu Xương gặm -> 0% chiết khấu bậc');
  }

  // Test 2: Đơn 3 triệu Xương gặm -> đúng 4% (-120.000đ)
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        items: [{ sku: 'B03', category: 'Xương gặm', quantity: 1, priceUnit: 3000000 }],
      },
      [chewTierPolicy]
    );
    const tierDisc = res.appliedDiscounts.find((d) => d.code === 'LA_PET_CHEW_TIER');
    assert(
      tierDisc !== undefined && tierDisc.amount === 120000 && tierDisc.ratePercent === 4,
      'Test 2: Đơn 3 triệu Xương gặm -> đúng 4% (-120.000đ)',
      `Actual: ${tierDisc?.amount}`
    );
  }

  // Test 3: Đơn 4.9 triệu Xương gặm -> vẫn 4% (-196.000đ)
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        items: [{ sku: 'B03', category: 'Xương gặm', quantity: 1, priceUnit: 4900000 }],
      },
      [chewTierPolicy]
    );
    const tierDisc = res.appliedDiscounts.find((d) => d.code === 'LA_PET_CHEW_TIER');
    assert(
      tierDisc !== undefined && tierDisc.amount === 196000 && tierDisc.ratePercent === 4,
      'Test 3: Đơn 4.9 triệu Xương gặm -> vẫn 4% (-196.000đ)',
      `Actual: ${tierDisc?.amount}`
    );
  }

  // Test 4: Đơn 5 triệu Xương gặm -> đúng 5% (-250.000đ)
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        items: [{ sku: 'B03', category: 'Xương gặm', quantity: 1, priceUnit: 5000000 }],
      },
      [chewTierPolicy]
    );
    const tierDisc = res.appliedDiscounts.find((d) => d.code === 'LA_PET_CHEW_TIER');
    assert(
      tierDisc !== undefined && tierDisc.amount === 250000 && tierDisc.ratePercent === 5,
      'Test 4: Đơn 5 triệu Xương gặm -> đúng 5% (-250.000đ)',
      `Actual: ${tierDisc?.amount}`
    );
  }

  // Test 5: Đơn 40 triệu Xương gặm -> đúng 9% (-3.600.000đ)
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        items: [{ sku: 'B03', category: 'Xương gặm', quantity: 1, priceUnit: 40000000 }],
      },
      [chewTierPolicy]
    );
    const tierDisc = res.appliedDiscounts.find((d) => d.code === 'LA_PET_CHEW_TIER');
    assert(
      tierDisc !== undefined && tierDisc.amount === 3600000 && tierDisc.ratePercent === 9,
      'Test 5: Đơn 40 triệu Xương gặm -> đúng 9% (-3.600.000đ)',
      `Actual: ${tierDisc?.amount}`
    );
  }

  // Test 6: Đơn 100 triệu Xương gặm -> đúng 13% (-13.000.000đ)
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        items: [{ sku: 'B03', category: 'Xương gặm', quantity: 1, priceUnit: 100000000 }],
      },
      [chewTierPolicy]
    );
    const tierDisc = res.appliedDiscounts.find((d) => d.code === 'LA_PET_CHEW_TIER');
    assert(
      tierDisc !== undefined && tierDisc.amount === 13000000 && tierDisc.ratePercent === 13,
      'Test 6: Đơn 100 triệu Xương gặm -> đúng 13% (-13.000.000đ)',
      `Actual: ${tierDisc?.amount}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NHÓM 2: COMBO XƯƠNG BÀN CHẢI E1-E6 & THỜI HẠN HIỆU LỰC (Test 7 - Test 10)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Nhóm 2: Combo Xương bàn chải E1-E6 & Thời hạn hiệu lực ---');

  // Test 7: Mua đủ 6 SKU E1-E6 trong thời gian 15-31/08/2026 -> giá mỗi món 15.000đ
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        orderDate: new Date('2026-08-20T10:00:00Z'),
        items: [
          { sku: 'E1', quantity: 2, priceUnit: 19500 },
          { sku: 'E2', quantity: 2, priceUnit: 19500 },
          { sku: 'E3', quantity: 2, priceUnit: 19500 },
          { sku: 'E4', quantity: 2, priceUnit: 19500 },
          { sku: 'E5', quantity: 2, priceUnit: 19500 },
          { sku: 'E6', quantity: 2, priceUnit: 19500 },
        ],
      },
      [toothbrushComboPolicy]
    );
    const all15k = res.lineItems.every((l) => l.effectivePriceUnit === 15000);
    // (19500 - 15000) * 12 = 4500 * 12 = 54000
    assert(
      all15k && res.discountAmount === 54000 && res.appliedPromotions.length > 0,
      'Test 7: Mua đủ 6 SKU E1-E6 trong thời gian 15-31/08/2026 -> đơn giá mỗi món thành 15.000đ',
      `Effective prices: ${res.lineItems.map((l) => l.effectivePriceUnit).join(', ')}`
    );
  }

  // Test 8: Mua thiếu 1 SKU (chỉ có E1-E5) -> KHÔNG giảm giá 15k, engine trả về cảnh báo thiếu E6
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        orderDate: new Date('2026-08-20T10:00:00Z'),
        items: [
          { sku: 'E1', quantity: 2, priceUnit: 19500 },
          { sku: 'E2', quantity: 2, priceUnit: 19500 },
          { sku: 'E3', quantity: 2, priceUnit: 19500 },
          { sku: 'E4', quantity: 2, priceUnit: 19500 },
          { sku: 'E5', quantity: 2, priceUnit: 19500 },
        ],
      },
      [toothbrushComboPolicy]
    );
    const hasSpecialPrice = res.lineItems.some((l) => l.effectivePriceUnit === 15000);
    const missed = res.missedPromotions.find((m) => m.code === 'LA_PET_TOOTHBRUSH_COMBO');
    const hasE6Warning = missed?.missingRequirements.includes('E6');
    assert(
      !hasSpecialPrice && res.discountAmount === 0 && !!hasE6Warning,
      'Test 8: Mua thiếu 1 SKU (chỉ có E1-E5) -> KHÔNG giảm giá 15k, engine trả về cảnh báo thiếu E6',
      `Missed: ${JSON.stringify(missed)}`
    );
  }

  // Test 9: Mua E1-E6 ngày 10/08/2026 (trước ngày bắt đầu 15/08) -> KHÔNG áp dụng
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        orderDate: new Date('2026-08-10T10:00:00Z'),
        items: [
          { sku: 'E1', quantity: 1, priceUnit: 19500 },
          { sku: 'E2', quantity: 1, priceUnit: 19500 },
          { sku: 'E3', quantity: 1, priceUnit: 19500 },
          { sku: 'E4', quantity: 1, priceUnit: 19500 },
          { sku: 'E5', quantity: 1, priceUnit: 19500 },
          { sku: 'E6', quantity: 1, priceUnit: 19500 },
        ],
      },
      [toothbrushComboPolicy]
    );
    assert(
      res.discountAmount === 0 && res.appliedPromotions.length === 0,
      'Test 9: Mua E1-E6 ngày 10/08/2026 (trước ngày bắt đầu) -> KHÔNG áp dụng giá 15k'
    );
  }

  // Test 10: Mua E1-E6 ngày 01/09/2026 (sau ngày kết thúc 31/08) -> KHÔNG áp dụng
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        orderDate: new Date('2026-09-01T10:00:00Z'),
        items: [
          { sku: 'E1', quantity: 1, priceUnit: 19500 },
          { sku: 'E2', quantity: 1, priceUnit: 19500 },
          { sku: 'E3', quantity: 1, priceUnit: 19500 },
          { sku: 'E4', quantity: 1, priceUnit: 19500 },
          { sku: 'E5', quantity: 1, priceUnit: 19500 },
          { sku: 'E6', quantity: 1, priceUnit: 19500 },
        ],
      },
      [toothbrushComboPolicy]
    );
    assert(
      res.discountAmount === 0 && res.appliedPromotions.length === 0,
      'Test 10: Mua E1-E6 ngày 01/09/2026 (sau ngày kết thúc) -> KHÔNG áp dụng giá 15k'
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NHÓM 3: CHƯƠNG TRÌNH MUA 7 TẶNG 1 (Test 11 - Test 13)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Nhóm 3: Chương trình Mua 7 tặng 1 bánh thưởng ---');

  // Test 11: Mua 6 bánh thưởng Lapati -> 0 quà tặng
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        items: [{ sku: 'LP-TREAT-01', brand: 'Lapati', quantity: 6, priceUnit: 35000 }],
      },
      [buy7Get1Policy]
    );
    assert(
      res.freeItems.length === 0 && res.suggestions.some((s) => s.includes('Mua thêm 1')),
      'Test 11: Mua 6 bánh thưởng Lapati -> 0 quà tặng (có gợi ý mua thêm 1)'
    );
  }

  // Test 12: Mua 7 bánh thưởng Lapati -> tặng 1 bánh thưởng
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        items: [{ sku: 'LP-TREAT-01', brand: 'Lapati', quantity: 7, priceUnit: 35000 }],
      },
      [buy7Get1Policy]
    );
    assert(
      res.freeItems.length === 1 && res.freeItems[0].quantity === 1,
      'Test 12: Mua 7 bánh thưởng Lapati -> tặng 1 bánh thưởng'
    );
  }

  // Test 13: Mua 14 bánh thưởng Dexinbone -> tặng 2 bánh thưởng
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        items: [{ sku: 'DX-TREAT-01', brand: 'Dexinbone', quantity: 14, priceUnit: 38000 }],
      },
      [buy7Get1Policy]
    );
    assert(
      res.freeItems.length === 1 && res.freeItems[0].quantity === 2,
      'Test 13: Mua 14 bánh thưởng Dexinbone -> tặng 2 bánh thưởng'
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NHÓM 4: THƯỞNG DOANH SỐ QUÝ & NĂM (Test 14 - Test 16)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Nhóm 4: Thưởng doanh số Quý & Năm ---');

  // Test 14: Thưởng quý đạt 400 triệu -> đủ điều kiện 8% (32.000.000đ)
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        items: [{ sku: 'GENERAL', quantity: 1, priceUnit: 1000000 }],
        salesStats: {
          quarterSales: 400000000,
        },
      },
      [quarterRewardPolicy]
    );
    const qReward = res.salesRewards.find((r) => r.code === 'LA_PET_REWARD_QUARTER');
    assert(
      qReward !== undefined && qReward.eligible && qReward.rewardPercent === 8 && qReward.rewardAmount === 32000000,
      'Test 14: Thưởng quý đạt 400 triệu -> đủ điều kiện 8% (32.000.000đ)',
      `Actual reward: ${qReward?.rewardAmount}`
    );
  }

  // Test 15: Thưởng năm đạt 1.6 tỷ nhưng thanh toán 90% (<95%) -> KHÔNG đạt, giải thích rõ lý do
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        items: [{ sku: 'GENERAL', quantity: 1, priceUnit: 1000000 }],
        salesStats: {
          annualSales: 1600000000,
          onTimePaymentPercent: 90,
          noPriceDumping: true,
          activeMonths: 11,
          distributedSkusCount: 16,
        },
      },
      [yearRewardPolicy]
    );
    const yReward = res.salesRewards.find((r) => r.code === 'LA_PET_REWARD_YEAR');
    assert(
      Boolean(yReward !== undefined && !yReward.eligible && yReward.unmetConditions?.some((u) => u.includes('thanh toán'))),
      'Test 15: Thưởng năm đạt 1.6 tỷ nhưng tỷ lệ thanh toán 90% (<95%) -> KHÔNG đạt, giải thích rõ lý do',
      `Unmet: ${yReward?.unmetConditions?.join('; ')}`
    );
  }

  // Test 16: Thưởng năm đạt 1.6 tỷ, thanh toán 96%, không phá giá, 11 tháng, 16 SKU -> ĐỦ ĐIỀU KIỆN 7% (112.000.000đ)
  {
    const res = PricingPromotionEngine.evaluateOrder(
      {
        orgId,
        items: [{ sku: 'GENERAL', quantity: 1, priceUnit: 1000000 }],
        salesStats: {
          annualSales: 1600000000,
          onTimePaymentPercent: 96,
          noPriceDumping: true,
          activeMonths: 11,
          distributedSkusCount: 16,
        },
      },
      [yearRewardPolicy]
    );
    const yReward = res.salesRewards.find((r) => r.code === 'LA_PET_REWARD_YEAR');
    assert(
      yReward !== undefined && yReward.eligible && yReward.rewardPercent === 7 && yReward.rewardAmount === 112000000,
      'Test 16: Thưởng năm đạt 1.6 tỷ, thanh toán 96%, không phá giá, 11 tháng, 16 SKU -> ĐỦ ĐIỀU KIỆN 7% (112.000.000đ)',
      `Actual reward: ${yReward?.rewardAmount}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NHÓM 5: IMMUTABILITY & VERSIONING (Test 17)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Nhóm 5: Tính bất biến (Immutability) & Versioning ---');

  // Test 17: Kiểm tra tính bất biến: Thay đổi chính sách tạo Version 2, đơn hàng cũ giữ nguyên snapshot version 1
  {
    try {
      // 1. Create a test policy v1
      const testCode = `TEST_IMMUTABILITY_${Date.now()}`;
      const policyV1 = await PromotionService.createPromotion(orgId, null, {
        code: testCode,
        name: 'Chính sách kiểm tra Immutability v1',
        type: 'PERCENT_DISCOUNT',
        targetScope: 'ALL_PRODUCTS',
        actions: { actionType: 'PERCENT_DISCOUNT', discountPercent: 10 },
      });

      // 2. Simulate applying policyV1 to an order
      const fakeOrder = await db.orderHistory.findFirst({ where: { orgId } });
      const appliedSnap = await db.orderAppliedPromotion.create({
        data: {
          orgId,
          orderHistoryId: fakeOrder?.id,
          promotionId: policyV1.id,
          promotionCode: policyV1.code,
          promotionName: policyV1.name,
          policyVersion: policyV1.version,
          discountAmount: 100000,
          freeItems: [],
          appliedRuleSnapshot: { percent: 10 },
          explanation: 'Đã áp dụng giảm 10% v1',
        },
      });

      // 3. User attempts to update policy: System MUST trigger new version because it's linked to an order
      const policyV2 = await PromotionService.updatePromotion(orgId, null, policyV1.id, {
        code: policyV1.code,
        name: 'Chính sách kiểm tra Immutability v2 (20%)',
        actions: { actionType: 'PERCENT_DISCOUNT', discountPercent: 20 },
      });

      // 4. Verify policyV2 is version 2, parentPolicyId is policyV1.id, and policyV1 is now deactivated
      const oldPolicyFresh = await db.promotionPolicy.findUnique({ where: { id: policyV1.id } });
      const snapshotAfterOrder = await db.orderAppliedPromotion.findUnique({ where: { id: appliedSnap.id } });

      const isImmutable =
        policyV2.version === 2 &&
        policyV2.parentPolicyId === policyV1.id &&
        oldPolicyFresh?.isActive === false &&
        snapshotAfterOrder?.policyVersion === 1 &&
        (snapshotAfterOrder?.appliedRuleSnapshot as any)?.percent === 10;

      assert(
        isImmutable,
        'Test 17: Tính bất biến (Immutability): Thay đổi chính sách tạo Version 2, snapshot đơn cũ giữ nguyên v1',
        `v1 active: ${oldPolicyFresh?.isActive}, v2 version: ${policyV2.version}`
      );

      // Clean up test data
      await db.orderAppliedPromotion.delete({ where: { id: appliedSnap.id } });
      await db.promotionPolicy.delete({ where: { id: policyV2.id } });
      await db.promotionPolicy.delete({ where: { id: policyV1.id } });
    } catch (err: any) {
      assert(false, 'Test 17: Immutability test error', err.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NHÓM 6: AI / CHATBOT QUERY CONSULTATION (Test 18)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Nhóm 6: Chatbot Tool get_applicable_promotions ---');

  // Test 18: Chatbot Tool get_applicable_promotions trả lời chính xác, tính toán theo Engine
  {
    try {
      const { ChatbotToolExecutor } = await import('../src/modules/chatbot/chatbot-tools.js');
      const executor = new ChatbotToolExecutor(orgId, 'test-conv-ai-promo');

      // Test evaluation of 40M order
      const aiResult = await executor.executeTool('get_applicable_promotions', {
        order_value: 40000000,
        category: 'Xương gặm',
      });

      const isAiAccurate =
        aiResult.has_applicable_promotions === true &&
        aiResult.discount_amount === 3600000 &&
        aiResult.final_total === 36400000;

      assert(
        isAiAccurate,
        'Test 18: Chatbot Tool get_applicable_promotions trả lời chính xác, tính toán theo Engine (40M giảm 9% = 3.600.000đ)',
        `Discount: ${aiResult.discount_amount}, Final: ${aiResult.final_total}`
      );
    } catch (err: any) {
      assert(false, 'Test 18: Chatbot Tool test error', err.message);
    }
  }

  console.log('\n======================================================');
  console.log(`🏁 KẾT QUẢ KIỂM THỬ: ${passedCount}/18 PASSED, ${failedCount} FAILED`);
  console.log('======================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
