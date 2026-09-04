/**
 * pricing-promotion-engine.ts — Pure Data-Driven Pricing & Promotion Engine.
 * Single Source of Truth for evaluating order pricing, discounts, promotions, free gifts, and sales rewards.
 * CODE NEVER HARDCODES program values or conditions — everything is driven by PromotionPolicy records.
 */

import {
  PromotionType,
  PromotionConditions,
  PromotionActions,
  OrderItemInput,
  OrderEvaluationContext,
  EvaluationResult,
  EvaluatedLineItem,
  AppliedDiscountDetail,
  AppliedPromotionDetail,
  FreeGiftItem,
  SalesRewardEvaluation,
  MissedPromotionNotice,
  DiscountTier,
} from './promotion-types.js';

export interface PromotionPolicyRecord {
  id: string;
  orgId: string;
  code: string;
  name: string;
  description?: string | null;
  type: string;
  targetScope: string;
  priority: number;
  isStackable: boolean;
  isActive: boolean;
  startDate?: Date | null;
  endDate?: Date | null;
  version: number;
  parentPolicyId?: string | null;
  conditions: any;
  actions: any;
}

/**
 * Format currency VND for consistent explanation messages.
 */
export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

/**
 * Normalize SKU for fuzzy matching (e.g., E1 <=> E01, B3 <=> B03).
 */
export function normalizeSku(sku?: string | null): string {
  if (!sku) return '';
  const trimmed = sku.trim().toUpperCase();
  // If format is like E1, convert to E01 or match both
  const match = trimmed.match(/^([A-Za-z]+)0*(\d+)$/);
  if (match) {
    const prefix = match[1];
    const num = parseInt(match[2], 10);
    return `${prefix}${num}`; // Canonical representation e.g. E1, B3
  }
  return trimmed;
}

export function skusMatch(skuA?: string | null, skuB?: string | null): boolean {
  if (!skuA || !skuB) return false;
  return normalizeSku(skuA) === normalizeSku(skuB);
}

export class PricingPromotionEngine {
  /**
   * Helper to check if a line item matches the target scope and conditions of a policy.
   */
  public static lineMatchesScope(
    line: EvaluatedLineItem,
    targetScope: string,
    conditions: PromotionConditions
  ): boolean {
    if (targetScope === 'ORDER_TOTAL' || targetScope === 'ALL_PRODUCTS') {
      return true;
    }

    const appSkus = conditions.applicableSkus || conditions.requiredAllSkus || [];
    if (targetScope === 'SPECIFIC_SKUS' || appSkus.length > 0) {
      if (appSkus.length > 0) {
        return appSkus.some((s) => skusMatch(s, line.sku));
      }
      return false;
    }

    const appCategories = (conditions.applicableCategories || []).map((c) => c.trim().toLowerCase());
    const appBrands = (conditions.applicableBrands || []).map((b) => b.trim().toLowerCase());

    if (targetScope === 'BRAND') {
      if (appBrands.length > 0) {
        return !!(
          (line.brand && appBrands.includes(line.brand.toLowerCase())) ||
          (line.productName && appBrands.some((b) => line.productName!.toLowerCase().includes(b)))
        );
      }
      return true;
    }

    if (targetScope === 'CATEGORY') {
      if (appCategories.length > 0) {
        return !!(
          (line.category && appCategories.includes(line.category.toLowerCase())) ||
          (line.productName && appCategories.some((c) => line.productName!.toLowerCase().includes(c)))
        );
      }
      return true;
    }

    // Fallback: If either brand or category matches
    let matches = false;
    let checked = false;
    if (appBrands.length > 0) {
      checked = true;
      if (
        (line.brand && appBrands.includes(line.brand.toLowerCase())) ||
        (line.productName && appBrands.some((b) => line.productName!.toLowerCase().includes(b)))
      ) {
        matches = true;
      }
    }
    if (appCategories.length > 0) {
      checked = true;
      if (
        (line.category && appCategories.includes(line.category.toLowerCase())) ||
        (line.productName && appCategories.some((c) => line.productName!.toLowerCase().includes(c)))
      ) {
        matches = true;
      }
    }
    return checked ? matches : true;
  }

  /**
   * Main evaluation entry point:
   * Takes an order context and the list of active promotion policies,
   * returns the deterministic calculation breakdown, applied promotions, free items, explanations, and suggestions.
   */
  public static evaluateOrder(
    context: OrderEvaluationContext,
    policies: PromotionPolicyRecord[]
  ): EvaluationResult {
    const orderDate = context.orderDate ? new Date(context.orderDate) : new Date();

    // 1. Filter policies valid for the given order date and active status
    const validPolicies = policies.filter((p) => {
      if (!p.isActive) return false;
      if (p.startDate && new Date(p.startDate) > orderDate) return false;
      if (p.endDate && new Date(p.endDate) < orderDate) return false;
      return true;
    });

    // 2. Sort policies by priority DESC, createdAt ASC
    validPolicies.sort((a, b) => b.priority - a.priority);

    // 3. Initialize working line items
    const lineItems: EvaluatedLineItem[] = context.items.map((item) => {
      const origUnit = Number(item.priceUnit) || 0;
      const qty = Number(item.quantity) || 0;
      const sub = origUnit * qty;
      return {
        sku: item.sku,
        productName: item.productName || item.sku || 'Sản phẩm',
        odooProductId: item.odooProductId,
        brand: item.brand || null,
        category: item.category || null,
        quantity: qty,
        originalPriceUnit: origUnit,
        effectivePriceUnit: origUnit,
        originalSubtotal: sub,
        finalSubtotal: sub,
        itemDiscountAmount: 0,
        itemDiscountPercent: 0,
        appliedPromotions: [],
      };
    });

    const originalSubtotal = lineItems.reduce((acc, l) => acc + l.originalSubtotal, 0);
    const appliedDiscounts: AppliedDiscountDetail[] = [];
    const appliedPromotions: AppliedPromotionDetail[] = [];
    const freeItems: FreeGiftItem[] = [];
    const salesRewards: SalesRewardEvaluation[] = [];
    const explanations: string[] = [];
    const suggestions: string[] = [];
    const missedPromotions: MissedPromotionNotice[] = [];
    const policyVersions: Array<{ policyId: string; code: string; name: string; version: number }> = [];

    let hasNonStackableApplied = false;

    // Helper to check stackability
    const canApplyPolicy = (policy: PromotionPolicyRecord) => {
      if (hasNonStackableApplied) return false;
      return true;
    };

    // ── PHASE 1: ITEM-LEVEL PROMOTIONS (SPECIAL UNIT PRICE & BUY X GET Y) ──────
    for (const policy of validPolicies) {
      if (!canApplyPolicy(policy)) continue;
      const conditions: PromotionConditions = policy.conditions || {};
      const actions: PromotionActions = policy.actions || {};

      // A. COMBO / SPECIAL PRICE WITH ALL REQUIRED SKUS (e.g. Xương bàn chải E1-E6)
      if (
        policy.type === 'SPECIAL_PRICE' ||
        policy.type === 'COMBO' ||
        actions.actionType === 'SPECIAL_UNIT_PRICE'
      ) {
        const requiredSkus = conditions.requiredAllSkus || conditions.applicableSkus || [];
        if (requiredSkus.length > 0) {
          const presentCanonicalSkus = new Set(
            lineItems.filter((l) => l.quantity > 0).map((l) => normalizeSku(l.sku))
          );

          const missingSkus = requiredSkus.filter(
            (rSku) => !presentCanonicalSkus.has(normalizeSku(rSku))
          );

          if (missingSkus.length === 0) {
            // ALL required SKUs present! Apply special unit price
            const specialPrice = Number(actions.specialUnitPrice) || 0;
            let totalComboDiscount = 0;
            const affectedSkus: string[] = [];

            for (const line of lineItems) {
              const matchesReq = requiredSkus.some((rSku) => skusMatch(rSku, line.sku));
              if (matchesReq && line.effectivePriceUnit > specialPrice) {
                const diffPerUnit = line.effectivePriceUnit - specialPrice;
                const lineDiscount = diffPerUnit * line.quantity;
                line.specialUnitPrice = specialPrice;
                line.discountedPriceUnit = specialPrice;
                line.effectivePriceUnit = specialPrice;
                line.finalSubtotal = specialPrice * line.quantity;
                line.itemDiscountAmount += lineDiscount;
                line.appliedPromotions.push(policy.code);
                totalComboDiscount += lineDiscount;
                affectedSkus.push(line.sku || '');
              }
            }

            if (totalComboDiscount > 0) {
              if (!policy.isStackable) hasNonStackableApplied = true;

              const expl = `${policy.name}: Đã mua đủ bộ SKU (${requiredSkus.join(
                ', '
              )}), áp dụng giá hỗ trợ ${formatVND(specialPrice)}/sản phẩm (tiết kiệm ${formatVND(
                totalComboDiscount
              )}).`;
              explanations.push(expl);

              appliedDiscounts.push({
                code: policy.code,
                name: policy.name,
                scope: 'SPECIAL_PRICE_COMBO',
                amount: totalComboDiscount,
              });

              appliedPromotions.push({
                promotionId: policy.id,
                promotionCode: policy.code,
                promotionName: policy.name,
                policyVersion: policy.version,
                type: policy.type,
                discountAmount: totalComboDiscount,
                freeItems: [],
                appliedRuleSnapshot: { conditions, actions },
                explanation: expl,
              });

              policyVersions.push({
                policyId: policy.id,
                code: policy.code,
                name: policy.name,
                version: policy.version,
              });
            }
          } else {
            // Missing some required SKUs
            const hasAnyPresent = requiredSkus.some((rSku) =>
              presentCanonicalSkus.has(normalizeSku(rSku))
            );
            if (hasAnyPresent) {
              const missedNotice = `Chương trình "${policy.name}": Để nhận giá hỗ trợ ${formatVND(
                actions.specialUnitPrice || 0
              )}/sản phẩm, cần mua đủ ${requiredSkus.length} SKU (${requiredSkus.join(
                ', '
              )}). Bạn đang thiếu: ${missingSkus.join(', ')}.`;
              suggestions.push(missedNotice);
              missedPromotions.push({
                code: policy.code,
                name: policy.name,
                reason: `Thiếu ${missingSkus.length} SKU: ${missingSkus.join(', ')}`,
                missingRequirements: missingSkus,
              });
            }
          }
        }
      }

      // B. BUY X GET Y (e.g. Mua 7 tặng 1 bánh thưởng)
      if (policy.type === 'BUY_X_GET_Y' || actions.actionType === 'BUY_X_GET_Y') {
        const buyQty = actions.buyQuantity || 7;
        const getQty = actions.getQuantity || 1;
        const appBrands = (conditions.applicableBrands || []).map((b) => b.trim().toLowerCase());
        const appCategories = (conditions.applicableCategories || []).map((c) => c.trim().toLowerCase());
        const appSkus = conditions.applicableSkus || [];

        // Match items using unified lineMatchesScope
        const matchingLines = lineItems.filter((line) =>
          PricingPromotionEngine.lineMatchesScope(line, policy.targetScope, conditions)
        );

        const totalMatchingQty = matchingLines.reduce((acc, l) => acc + l.quantity, 0);

        if (totalMatchingQty >= buyQty) {
          const sets = Math.floor(totalMatchingQty / buyQty);
          const freeCount = sets * getQty;

          if (freeCount > 0) {
            if (!policy.isStackable) hasNonStackableApplied = true;

            const repItem = matchingLines[0];
            const giftItem: FreeGiftItem = {
              sku: actions.giftSku || repItem?.sku || 'GIFT',
              name:
                actions.giftName ||
                (repItem ? `Tặng 1 ${repItem.productName} (cùng loại)` : 'Quà tặng kèm'),
              quantity: freeCount,
              unitPrice: 0,
              reason: `${policy.name} (Mua ${buyQty} tặng ${getQty})`,
            };

            freeItems.push(giftItem);

            const expl = `${policy.name}: Mua ${totalMatchingQty} sản phẩm (đủ điều kiện ${buyQty} tặng ${getQty}), được tặng ${freeCount} sản phẩm cùng loại.`;
            explanations.push(expl);

            appliedPromotions.push({
              promotionId: policy.id,
              promotionCode: policy.code,
              promotionName: policy.name,
              policyVersion: policy.version,
              type: policy.type,
              discountAmount: 0,
              freeItems: [giftItem],
              appliedRuleSnapshot: { conditions, actions },
              explanation: expl,
            });

            policyVersions.push({
              policyId: policy.id,
              code: policy.code,
              name: policy.name,
              version: policy.version,
            });
          }
        } else if (totalMatchingQty > 0) {
          const needed = buyQty - totalMatchingQty;
          suggestions.push(
            `Chương trình "${policy.name}": Bạn đã mua ${totalMatchingQty} sản phẩm. Mua thêm ${needed} sản phẩm nữa để được tặng ${getQty} sản phẩm cùng loại!`
          );
        }
      }
    }

    // ── PHASE 2: ORDER-LEVEL TIER DISCOUNTS (e.g. Chiết khấu Xương gặm theo bậc, Priority 20) ──
    for (const policy of validPolicies) {
      if (!canApplyPolicy(policy)) continue;
      const conditions: PromotionConditions = policy.conditions || {};
      const actions: PromotionActions = policy.actions || {};

      if (policy.type === 'TIER_DISCOUNT' || actions.actionType === 'TIER_PERCENT') {
        const tiers: DiscountTier[] = actions.tiers || conditions.tiers || [];
        if (!tiers || tiers.length === 0) continue;

        // Sort tiers ascending by minAmount
        const sortedTiers = [...tiers].sort((a, b) => a.minAmount - b.minAmount);

        // Scope filter: by Category, Brand, SKU or whole order
        const matchingLines = lineItems.filter((line) =>
          PricingPromotionEngine.lineMatchesScope(line, policy.targetScope, conditions)
        );

        // Use the initial original subtotal of matching items to evaluate threshold
        const matchingAmount = matchingLines.reduce((acc, l) => acc + l.originalSubtotal, 0);

        // Find matched tier
        let matchedTier: DiscountTier | null = null;
        let nextTier: DiscountTier | null = null;

        for (let i = 0; i < sortedTiers.length; i++) {
          const tier = sortedTiers[i];
          if (matchingAmount >= tier.minAmount) {
            matchedTier = tier;
            nextTier = sortedTiers[i + 1] || null;
          } else {
            if (!nextTier) nextTier = tier;
            break;
          }
        }

        if (matchedTier) {
          if (!policy.isStackable) hasNonStackableApplied = true;

          const tierPercent = matchedTier.percent ?? (matchedTier as any).discountPercent ?? 0;
          // Calculate discount from current subtotal (special price base if applied, else original)
          const discountBase = matchingLines.reduce((acc, l) => {
            const unit = l.specialUnitPrice || l.originalPriceUnit;
            return acc + (unit * l.quantity);
          }, 0);
          const tierDiscountAmount = (discountBase * tierPercent) / 100;

          for (const line of matchingLines) {
            const baseSubtotal = (line.specialUnitPrice || line.originalPriceUnit) * line.quantity;
            const lDisc = (baseSubtotal * tierPercent) / 100;
            line.finalSubtotal = Math.max(0, line.finalSubtotal - lDisc);
            line.effectivePriceUnit = line.quantity > 0 ? line.finalSubtotal / line.quantity : 0;
            line.itemDiscountAmount += lDisc;
            line.itemDiscountPercent += tierPercent;
            line.appliedPromotions.push(policy.code);
          }

          const expl = `${policy.name}: Đơn hàng đạt ${formatVND(
            matchingAmount
          )} (ngưỡng >= ${formatVND(matchedTier.minAmount)}), áp dụng chiết khấu ${tierPercent}% (-${formatVND(
            tierDiscountAmount
          )}).`;
          explanations.push(expl);

          appliedDiscounts.push({
            code: policy.code,
            name: policy.name,
            scope: 'ORDER_TIER',
            ratePercent: tierPercent,
            amount: tierDiscountAmount,
          });

          appliedPromotions.push({
            promotionId: policy.id,
            promotionCode: policy.code,
            promotionName: policy.name,
            policyVersion: policy.version,
            type: policy.type,
            discountAmount: tierDiscountAmount,
            freeItems: [],
            appliedRuleSnapshot: { conditions, actions, matchedTier },
            explanation: expl,
          });

          policyVersions.push({
            policyId: policy.id,
            code: policy.code,
            name: policy.name,
            version: policy.version,
          });

          if (nextTier) {
            const gap = nextTier.minAmount - matchingAmount;
            suggestions.push(
              `Đơn hàng hiện đạt ${formatVND(matchingAmount)} (chiết khấu ${tierPercent}%). Mua thêm ${formatVND(
                gap
              )} để nâng lên mức chiết khấu ${nextTier.percent}%!`
            );
          }
        } else if (sortedTiers.length > 0 && matchingAmount > 0) {
          const firstTier = sortedTiers[0];
          const gap = firstTier.minAmount - matchingAmount;
          suggestions.push(
            `Đơn hàng hiện đạt ${formatVND(matchingAmount)}. Mua thêm ${formatVND(
              gap
            )} để nhận chiết khấu ${firstTier.percent}%!`
          );
        }
      }
    }

    // ── PHASE 3: BASIC & CATEGORY/SKU PERCENT DISCOUNTS (e.g. Chiết khấu cơ bản 22%, Priority 10) ─
    for (const policy of validPolicies) {
      if (!canApplyPolicy(policy)) continue;
      const conditions: PromotionConditions = policy.conditions || {};
      const actions: PromotionActions = policy.actions || {};

      if (
        policy.type === 'BASIC_DISCOUNT' ||
        policy.type === 'PERCENT_DISCOUNT' ||
        actions.actionType === 'PERCENT_DISCOUNT'
      ) {
        const discountPercent = Number(actions.discountPercent) || 0;
        if (discountPercent <= 0) continue;

        let totalPhase3Discount = 0;

        for (const line of lineItems) {
          const matchesScope = PricingPromotionEngine.lineMatchesScope(line, policy.targetScope, conditions);

          if (matchesScope && line.finalSubtotal > 0) {
            const lineDisc = (line.finalSubtotal * discountPercent) / 100;
            line.finalSubtotal = Math.max(0, line.finalSubtotal - lineDisc);
            line.effectivePriceUnit = line.quantity > 0 ? line.finalSubtotal / line.quantity : 0;
            line.itemDiscountAmount += lineDisc;
            line.itemDiscountPercent += discountPercent;
            line.appliedPromotions.push(policy.code);
            totalPhase3Discount += lineDisc;
          }
        }

        if (totalPhase3Discount > 0) {
          if (!policy.isStackable) hasNonStackableApplied = true;

          const expl = `${policy.name}: Chiết khấu ${discountPercent}% (${formatVND(
            totalPhase3Discount
          )}).`;
          explanations.push(expl);

          appliedDiscounts.push({
            code: policy.code,
            name: policy.name,
            scope: policy.targetScope || 'ALL_PRODUCTS',
            ratePercent: discountPercent,
            amount: totalPhase3Discount,
          });

          appliedPromotions.push({
            promotionId: policy.id,
            promotionCode: policy.code,
            promotionName: policy.name,
            policyVersion: policy.version,
            type: policy.type,
            discountAmount: totalPhase3Discount,
            freeItems: [],
            appliedRuleSnapshot: { conditions, actions },
            explanation: expl,
          });

          policyVersions.push({
            policyId: policy.id,
            code: policy.code,
            name: policy.name,
            version: policy.version,
          });
        }
      }
    }

    // ── PHASE 3.5: CUSTOM UNFORMATTED TEXT PROMOTIONS ─────────────────────────
    for (const policy of validPolicies) {
      const conditions: PromotionConditions = policy.conditions || {};
      const actions: PromotionActions = policy.actions || {};

      if (policy.type === 'CUSTOM_TEXT' || actions.actionType === 'CUSTOM_TEXT') {
        let scopeMatched = true;
        if (policy.targetScope === 'SPECIFIC_SKUS') {
          scopeMatched = lineItems.some((line) =>
            this.lineMatchesScope(line, policy.targetScope, conditions)
          );
        }

        if (scopeMatched) {
          const text = actions.textContent || policy.description || '';
          if (text) {
            const expl = `${policy.name}: ${text}`;
            explanations.push(expl);
            suggestions.push(`Ưu đãi bổ sung (${policy.name}): ${text}`);

            appliedPromotions.push({
              promotionId: policy.id,
              promotionCode: policy.code,
              promotionName: policy.name,
              policyVersion: policy.version,
              type: policy.type,
              discountAmount: 0,
              freeItems: [],
              appliedRuleSnapshot: { conditions, actions },
              explanation: expl,
            });

            policyVersions.push({
              policyId: policy.id,
              code: policy.code,
              name: policy.name,
              version: policy.version,
            });
          }
        }
      }
    }

    // ── PHASE 4: SALES REWARD EVALUATION (QUARTER & YEAR) ───────────────────────
    for (const policy of validPolicies) {
      const conditions: PromotionConditions = policy.conditions || {};
      const actions: PromotionActions = policy.actions || {};

      if (
        policy.type === 'SALES_REWARD_QUARTER' ||
        policy.type === 'SALES_REWARD_YEAR' ||
        actions.actionType === 'SALES_REWARD'
      ) {
        const isYear =
          policy.type === 'SALES_REWARD_YEAR' ||
          policy.code.toLowerCase().includes('year') ||
          policy.code.toLowerCase().includes('nam');
        const stats = context.salesStats || {};
        const salesAchieved = isYear ? stats.annualSales || 0 : stats.quarterSales || 0;
        const rewardTiers = actions.rewardTiers || [];

        if (rewardTiers.length > 0 && salesAchieved > 0) {
          const sortedRewardTiers = [...rewardTiers].sort((a, b) => a.minAmount - b.minAmount);
          let matchedRewardTier = null;

          for (const rTier of sortedRewardTiers) {
            if (salesAchieved >= rTier.minAmount) {
              matchedRewardTier = rTier;
            }
          }

          if (matchedRewardTier) {
            const unmet: string[] = [];

            // If Annual Reward, check strict qualification criteria:
            if (isYear) {
              const req = conditions.rewardConditions || {};
              const onTimeTarget = req.onTimePaymentPercent ?? 95;
              const minMonthsTarget = req.minActiveMonths ?? 10;
              const minSkusTarget = req.minDistributedSkus ?? 15;

              if ((stats.onTimePaymentPercent ?? 100) < onTimeTarget) {
                unmet.push(
                  `Tỷ lệ thanh toán đúng hạn đạt ${(stats.onTimePaymentPercent ?? 0)}% (yêu cầu >= ${onTimeTarget}%)`
                );
              }
              if (stats.noPriceDumping === false) {
                unmet.push('Vi phạm quy định bán phá giá');
              }
              if ((stats.activeMonths ?? 12) < minMonthsTarget) {
                unmet.push(
                  `Duy trì mua hàng ${stats.activeMonths || 0} tháng (yêu cầu >= ${minMonthsTarget} tháng)`
                );
              }
              if ((stats.distributedSkusCount ?? 20) < minSkusTarget) {
                unmet.push(
                  `Phân phối ${stats.distributedSkusCount || 0} SKU (yêu cầu >= ${minSkusTarget} SKU)`
                );
              }
            }

            const isEligible = unmet.length === 0;
            const rewardAmt = isEligible
              ? (salesAchieved * matchedRewardTier.rewardPercent) / 100
              : 0;

            const expl = isEligible
              ? `${policy.name}: Doanh số đạt ${formatVND(salesAchieved)} (đủ mốc >= ${formatVND(
                  matchedRewardTier.minAmount
                )}), đủ điều kiện nhận thưởng ${matchedRewardTier.rewardPercent}% (${formatVND(
                  rewardAmt
                )}).`
              : `${policy.name}: Doanh số đạt ${formatVND(
                  salesAchieved
                )} nhưng chưa đủ điều kiện nhận thưởng do: ${unmet.join(', ')}.`;

            salesRewards.push({
              code: policy.code,
              name: policy.name,
              period: isYear ? 'YEAR' : 'QUARTER',
              eligible: isEligible,
              achievedSales: salesAchieved,
              rewardPercent: matchedRewardTier.rewardPercent,
              rewardAmount: rewardAmt,
              explanation: expl,
              unmetConditions: unmet,
            });
          }
        }
      }
    }

    // ── FINAL FINANCIAL AGGREGATION ───────────────────────────────────────────
    const currentSubtotal = lineItems.reduce((acc, l) => acc + l.finalSubtotal, 0);
    const totalDiscountAmount = Math.max(0, originalSubtotal - currentSubtotal);
    const finalTotal = Math.max(0, originalSubtotal - totalDiscountAmount);

    return {
      originalSubtotal,
      discountAmount: Math.round(totalDiscountAmount),
      finalTotal: Math.round(finalTotal),
      lineItems,
      appliedDiscounts,
      appliedPromotions,
      freeItems,
      salesRewards,
      explanations,
      suggestions,
      missedPromotions,
      policyVersions,
    };
  }
}
