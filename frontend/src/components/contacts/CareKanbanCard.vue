<template>
  <div
    class="benchmark-kanban-card rounded-lg bg-surface pa-3 mb-3 border transition-swing"
    role="button"
    tabindex="0"
    :title="`Nhấp để mở hồ sơ khách hàng ${card.name}`"
    @click="$emit('click', card)"
    @keydown.enter.prevent="$emit('click', card)"
    @keydown.space.prevent="$emit('click', card)"
  >
    <!-- 1. Header: Pareto Square Badge + Customer Name + Chevron Right -->
    <div class="d-flex align-start justify-space-between gap-2 mb-1">
      <div class="d-flex align-start gap-2 overflow-hidden flex-grow-1">
        <!-- Square Pareto Badge [A], [B], [C] -->
        <div
          class="pareto-square-badge flex-shrink-0 font-weight-black d-flex align-center justify-center text-caption rounded"
          :class="`pareto-square-${card.paretoTier.toLowerCase()}`"
        >
          {{ card.paretoTier }}
        </div>

        <!-- Customer Name -->
        <div class="customer-title font-weight-bold text-subtitle-2 text-high-emphasis" :title="card.name">
          {{ card.name }}
        </div>
      </div>

      <!-- Chevron Right > -->
      <v-icon size="16" class="text-disabled flex-shrink-0 mt-0.5">lucide-chevron-right</v-icon>
    </div>

    <!-- 2. Subline: Partner ID • Score XX/100 -->
    <div class="text-caption text-medium-emphasis mb-2" style="font-size: 11px;">
      <span v-if="card.customerId && card.customerId !== '0' && card.customerId !== ''">Mã: #{{ card.customerId }}</span>
      <span v-else>Chưa có mã</span>
      <span class="mx-1">•</span>
      <span>Score {{ card.healthScore }}/100</span>
    </div>

    <!-- 3. Revenue 180d & Growth Trend -->
    <div class="d-flex align-baseline justify-space-between flex-wrap gap-1 mb-2.5">
      <span class="text-h6 font-weight-black text-high-emphasis tracking-tight" style="font-size: 1.05rem !important;">
        {{ formatFullCurrency(card.revenue180) }}
      </span>

      <!-- Growth % Badge with arrows (↑ / ↓) -->
      <div class="growth-pill font-weight-bold text-caption d-flex align-center gap-0.5 px-1.5 py-0.5 rounded" :class="growthPillClass">
        <span class="font-weight-black">{{ card.growthRate > 0 ? '↑' : (card.growthRate < 0 ? '↓' : '') }}</span>
        <span>{{ Math.abs(card.growthRate) }}%</span>
      </div>
    </div>

    <!-- 4. Sand/Beige Box: ĐƠN TB & GẮN BÓ -->
    <div class="metrics-sand-box pa-2 rounded-md mb-2.5 border">
      <div class="d-flex align-center justify-space-between">
        <!-- ĐƠN TB -->
        <div class="metric-col pr-2 border-e flex-grow-1">
          <div class="metric-label text-caption font-weight-bold text-disabled text-uppercase mb-0.5" style="font-size: 10px;">
            ĐƠN TB
          </div>
          <div class="metric-val text-caption font-weight-bold text-high-emphasis text-truncate" :title="formatFullCurrency(card.aov)">
            {{ formatFullCurrency(card.aov) }}
          </div>
        </div>

        <!-- GẮN BÓ -->
        <div class="metric-col pl-3 flex-grow-1">
          <div class="metric-label text-caption font-weight-bold text-disabled text-uppercase mb-0.5" style="font-size: 10px;">
            GẮN BÓ
          </div>
          <div class="metric-val text-caption font-weight-bold text-high-emphasis">
            {{ card.tenureMonths }} tháng
          </div>
        </div>
      </div>
    </div>

    <!-- 5. Location & Urgency Days Row -->
    <div class="d-flex align-center justify-space-between gap-1 flex-wrap text-caption mb-2">
      <!-- Zone / Location -->
      <div class="d-flex align-center gap-1 text-medium-emphasis text-truncate" style="max-width: 50%; font-size: 11.5px;" :title="card.zone">
        <v-icon size="12" class="text-disabled">lucide-map-pin</v-icon>
        <span class="text-truncate">{{ card.zone || 'Khác' }}</span>
      </div>

      <!-- Warning Days / Alert -->
      <div class="d-flex align-center gap-1 font-weight-bold" :class="warningClass" style="font-size: 11px;">
        <v-icon size="12" :color="warningIconColor">{{ warningIcon }}</v-icon>
        <span>{{ warningLabel }}</span>
      </div>
    </div>

    <!-- 6. Bottom Link: Mở hồ sơ -->
    <div class="border-t pt-1.5 text-center">
      <span class="open-profile-link font-weight-bold text-caption">
        Mở hồ sơ
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface CareKanbanCardProps {
  id: string;
  customerProfileId: string;
  odooPartnerId: number;
  customerId: string;
  name: string;
  phone: string;
  zone: string;
  salesperson: string;
  contactId: string | null;
  conversationId: string | null;
  paretoTier: 'A' | 'B' | 'C';
  healthScore: number;
  revenue180: number;
  growthRate: number;
  revenueShare: number;
  aov: number;
  tenureMonths: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
  lastMessageAt: string | null;
  daysSinceLastMessage: number | null;
  contactUrgency: 'good' | 'warning' | 'danger';
  columnId: 'dormant' | 'extreme_risk' | 'needs_attention' | 'active' | 'high_potential';
}

const props = defineProps<{
  card: CareKanbanCardProps;
}>();

defineEmits<{
  (e: 'click', card: CareKanbanCardProps): void;
}>();

// Full currency formatting (e.g. 25.099.200 đ)
function formatFullCurrency(amount: number): string {
  if (!amount || amount === 0) return '0 đ';
  return Math.round(amount).toLocaleString('vi-VN') + ' đ';
}

// Growth pill styling
const growthPillClass = computed(() => {
  if (props.card.growthRate > 0) {
    return 'growth-positive';
  }
  if (props.card.growthRate < 0) {
    return 'growth-negative';
  }
  return 'growth-neutral';
});

// Urgency / Days Warning Calculation matching screenshot
const daysWithoutContact = computed(() => {
  // If we have days since last message, use it; otherwise fallback to days since last order
  if (props.card.daysSinceLastMessage !== null) {
    return props.card.daysSinceLastMessage;
  }
  if (props.card.daysSinceLastOrder !== null) {
    return props.card.daysSinceLastOrder;
  }
  return null;
});

const isExtremeDanger = computed(() => {
  return props.card.columnId === 'extreme_risk' || (daysWithoutContact.value !== null && daysWithoutContact.value > 45);
});

const warningLabel = computed(() => {
  if (daysWithoutContact.value === null) {
    return 'NGUY HIỂM - Chưa liên lạc';
  }
  if (daysWithoutContact.value === 0) {
    return '0 ngày';
  }
  if (isExtremeDanger.value) {
    return `NGUY HIỂM - ${daysWithoutContact.value} ngày`;
  }
  return `${daysWithoutContact.value} ngày`;
});

const warningClass = computed(() => {
  if (isExtremeDanger.value) {
    return 'text-danger-strong';
  }
  if (props.card.columnId === 'needs_attention' || (daysWithoutContact.value !== null && daysWithoutContact.value > 20)) {
    return 'text-warning-strong';
  }
  return 'text-success-strong';
});

const warningIcon = computed(() => {
  if (isExtremeDanger.value) {
    return 'lucide-alert-triangle';
  }
  if (props.card.columnId === 'needs_attention' || (daysWithoutContact.value !== null && daysWithoutContact.value > 20)) {
    return 'lucide-clock';
  }
  return 'lucide-message-circle';
});

const warningIconColor = computed(() => {
  if (isExtremeDanger.value) return '#dc2626';
  if (props.card.columnId === 'needs_attention' || (daysWithoutContact.value !== null && daysWithoutContact.value > 20)) return '#d97706';
  return '#16a34a';
});
</script>

<style scoped>
.benchmark-kanban-card {
  cursor: pointer;
  border: 1px solid rgba(var(--v-border-color), 0.16) !important;
  background-color: #ffffff !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  user-select: none;
  outline: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.benchmark-kanban-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.07) !important;
  border-color: rgba(var(--v-theme-primary), 0.4) !important;
}

.benchmark-kanban-card:focus-visible {
  border-color: #0f766e !important;
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.25) !important;
}

.customer-title {
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  color: #0f172a;
}

/* ── Square Pareto Badges [A], [B], [C] ────────────────────────── */
.pareto-square-badge {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: #ffffff;
  font-size: 12px;
}

.pareto-square-a {
  background-color: #0f766e; /* Dark Teal / Forest Green */
}

.pareto-square-b {
  background-color: #1e40af; /* Deep Cobalt Blue */
}

.pareto-square-c {
  background-color: #b45309; /* Warm Caramel / Amber Brown */
}

/* ── Growth Pills (↑ / ↓) ────────────────────────────────────────── */
.growth-pill {
  font-size: 11px;
}

.growth-positive {
  background-color: #dcfce7;
  color: #15803d;
}

.growth-negative {
  background-color: #fee2e2;
  color: #b91c1c;
}

.growth-neutral {
  background-color: #f1f5f9;
  color: #64748b;
}

/* ── Sand/Beige Box ─────────────────────────────────────────────── */
.metrics-sand-box {
  background-color: #faf6ed !important;
  border-color: #efe8d8 !important;
}

.metrics-sand-box .border-e {
  border-right: 1px solid #efe8d8 !important;
}

/* ── Warning & Urgency Text Colors ──────────────────────────────── */
.text-danger-strong {
  color: #dc2626 !important;
}

.text-warning-strong {
  color: #d97706 !important;
}

.text-success-strong {
  color: #16a34a !important;
}

/* ── Bottom Link "Mở hồ sơ" ─────────────────────────────────────── */
.open-profile-link {
  color: #0f766e;
  font-size: 12px;
  display: inline-block;
  transition: color 0.15s ease;
}

.benchmark-kanban-card:hover .open-profile-link {
  text-decoration: underline;
  color: #115e59;
}
</style>
