/**
 * promotion-types.ts — Data types for Data-Driven Pricing & Promotion Engine.
 * Single Source of Truth for rules, conditions, actions, evaluation results, and snapshots.
 */

export type PromotionType =
  | 'BASIC_DISCOUNT'          // Chiết khấu cơ bản (ví dụ 22% toàn bộ hoặc theo nhóm/SKU)
  | 'TIER_DISCOUNT'           // Chiết khấu theo bậc doanh số / giá trị đơn (ví dụ Xương gặm 3M->4%... 40M->9%, 100M->13%)
  | 'SPECIAL_PRICE'           // Giá đặc biệt cố định (ví dụ Combo Bàn chải E1-E6 15.000 VNĐ)
  | 'BUY_X_GET_Y'             // Mua X tặng Y (ví dụ Mua 7 tặng 1 bánh thưởng)
  | 'PERCENT_DISCOUNT'        // Giảm theo %
  | 'FIXED_AMOUNT'            // Giảm số tiền cố định
  | 'COMBO'                   // Combo ưu đãi
  | 'SALES_REWARD_QUARTER'    // Thưởng doanh số quý
  | 'SALES_REWARD_YEAR'       // Thưởng doanh số năm
  | 'CUSTOM_TEXT';            // Ưu đãi chưa định dạng (Lưu dạng văn bản)

export type TargetScope =
  | 'ALL_PRODUCTS'
  | 'CATEGORY'
  | 'BRAND'
  | 'SPECIFIC_SKUS'
  | 'ORDER_TOTAL';

export interface DiscountTier {
  minAmount: number;
  maxAmount?: number;
  percent: number;
}

export interface RewardTier {
  minAmount: number;
  maxAmount?: number;
  rewardPercent: number;
}

export interface RewardConditions {
  onTimePaymentPercent?: number;  // ví dụ >= 95%
  noPriceDumping?: boolean;        // Không bán phá giá
  minActiveMonths?: number;       // Duy trì mua hàng 10-12 tháng
  minDistributedSkus?: number;    // Phân phối tối thiểu 15 SKU
  annualSalesTarget?: number;     // Đạt doanh số năm
}

export interface PromotionConditions {
  minOrderValue?: number;
  maxOrderValue?: number;
  minQuantity?: number;
  customerTypes?: string[];       // ['DEALER', 'RETAIL']
  applicableCustomerIds?: string[];
  applicableCategories?: string[]; // ['Xương gặm', 'Bánh thưởng']
  applicableBrands?: string[];     // ['Lapati', 'Dexinbone', 'INU']
  applicableSkus?: string[];
  requiredAllSkus?: string[];     // ['E1', 'E2', 'E3', 'E4', 'E5', 'E6']
  tiers?: DiscountTier[];
  rewardConditions?: RewardConditions;
  textContent?: string;
}

export interface PromotionActions {
  actionType?:
    | 'PERCENT_DISCOUNT'
    | 'FIXED_AMOUNT'
    | 'SPECIAL_UNIT_PRICE'
    | 'BUY_X_GET_Y'
    | 'TIER_PERCENT'
    | 'SALES_REWARD'
    | 'CUSTOM_TEXT';
  discountPercent?: number;
  discountAmount?: number;
  specialUnitPrice?: number;      // ví dụ 15000
  buyQuantity?: number;           // ví dụ 7
  getQuantity?: number;           // ví dụ 1
  giftType?: 'SAME_PRODUCT' | 'SPECIFIC_SKU';
  giftSku?: string;
  giftName?: string;
  tiers?: DiscountTier[];
  rewardTiers?: RewardTier[];
  textContent?: string;           // Nội dung ưu đãi lưu dạng văn bản
}

export interface OrderItemInput {
  sku?: string | null;
  productName?: string | null;
  odooProductId?: number | null;
  brand?: string | null;
  category?: string | null;
  quantity: number;
  priceUnit: number;
}

export interface CustomerSalesStats {
  quarterSales?: number;
  annualSales?: number;
  onTimePaymentPercent?: number;
  noPriceDumping?: boolean;
  activeMonths?: number;
  distributedSkusCount?: number;
}

export interface OrderEvaluationContext {
  orgId: string;
  customerId?: string | null;
  customerName?: string | null;
  customerType?: string | null;   // 'DEALER' | 'RETAIL'
  orderDate?: Date | string | null;
  items: OrderItemInput[];
  salesStats?: CustomerSalesStats;
}

export interface FreeGiftItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  reason: string;
}

export interface EvaluatedLineItem {
  sku?: string | null;
  productName?: string | null;
  odooProductId?: number | null;
  brand?: string | null;
  category?: string | null;
  quantity: number;
  originalPriceUnit: number;
  specialUnitPrice?: number;
  discountedPriceUnit?: number;
  effectivePriceUnit: number;
  originalSubtotal: number;
  finalSubtotal: number;
  itemDiscountAmount: number;
  itemDiscountPercent: number;
  appliedPromotions: string[];
}

export interface AppliedDiscountDetail {
  code: string;
  name: string;
  scope: string;
  ratePercent?: number;
  amount: number;
}

export interface AppliedPromotionDetail {
  promotionId: string;
  promotionCode: string;
  promotionName: string;
  policyVersion: number;
  type: string;
  discountAmount: number;
  freeItems: FreeGiftItem[];
  appliedRuleSnapshot: any;
  explanation: string;
}

export interface SalesRewardEvaluation {
  code: string;
  name: string;
  period: 'QUARTER' | 'YEAR';
  eligible: boolean;
  achievedSales: number;
  rewardPercent: number;
  rewardAmount: number;
  explanation: string;
  unmetConditions?: string[];
}

export interface MissedPromotionNotice {
  code: string;
  name: string;
  reason: string;
  missingRequirements: string[];
}

export interface EvaluationResult {
  originalSubtotal: number;
  discountAmount: number;
  finalTotal: number;
  lineItems: EvaluatedLineItem[];
  appliedDiscounts: AppliedDiscountDetail[];
  appliedPromotions: AppliedPromotionDetail[];
  freeItems: FreeGiftItem[];
  salesRewards: SalesRewardEvaluation[];
  explanations: string[];
  suggestions: string[];
  missedPromotions: MissedPromotionNotice[];
  policyVersions: Array<{
    policyId: string;
    code: string;
    name: string;
    version: number;
  }>;
}
