<template>
  <v-dialog :model-value="modelValue" max-width="960" :fullscreen="$vuetify.display.xs" scrollable @update:model-value="$emit('update:modelValue', $event)">
    <v-card class="order-detail-card rounded-lg">
      <!-- Dialog Header -->
      <v-card-item class="border-b py-3 px-6 bg-surface">
        <div class="d-flex align-center justify-space-between w-100 flex-wrap gap-2">
          <div class="d-flex align-center gap-2">
            <v-avatar color="primary" variant="tonal" size="36">
              <v-icon icon="lucide-file-text" size="18" />
            </v-avatar>
            <div>
              <div class="d-flex align-center gap-2">
                <span class="text-h6 font-weight-bold font-monospace">{{ order?.orderCode }}</span>
                <v-btn icon size="x-small" variant="text" color="grey" title="Sao chép mã đơn" @click="copyOrderCode">
                  <v-icon size="14">lucide-copy</v-icon>
                </v-btn>
              </div>
              <div class="text-caption text-medium-emphasis">
                Odoo ID: #{{ order?.odooOrderId }} • Tạo lúc: {{ formatDateTime(order?.dateOrder) }}
              </div>
            </div>
          </div>

          <div class="d-flex align-center gap-2 flex-wrap">
            <v-chip v-if="order" size="small" :color="stateColor(order.state)" variant="flat" class="font-weight-medium">
              {{ stateLabel(order.state) }}
            </v-chip>
            <v-chip v-if="order?.deliveryStatus" size="small" :color="deliveryStatusColor(order.deliveryStatus)" variant="tonal">
              <v-icon start size="14">lucide-truck</v-icon>
              {{ deliveryStatusLabel(order.deliveryStatus) }}
            </v-chip>
            <v-chip v-if="order?.invoiceStatus" size="small" :color="invoiceStatusColor(order.invoiceStatus)" variant="tonal">
              <v-icon start size="14">lucide-receipt</v-icon>
              {{ invoiceStatusLabel(order.invoiceStatus) }}
            </v-chip>
            <v-btn icon size="small" variant="text" @click="$emit('update:modelValue', false)">
              <v-icon size="18">lucide-x</v-icon>
            </v-btn>
          </div>
        </div>
      </v-card-item>

      <v-card-text :class="isMobile ? 'pa-3' : 'pa-6'" style="max-height: 75vh;">
        <!-- Loading State -->
        <div v-if="loading" class="text-center py-12">
          <v-progress-circular indeterminate color="primary" size="48" />
          <div class="text-body-2 text-medium-emphasis mt-3">Đang tải chi tiết đơn hàng...</div>
        </div>

        <div v-else-if="order">
          <!-- Information Grid -->
          <v-row class="mb-4">
            <!-- Customer Info -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="h-100 rounded-lg info-box">
                <v-card-title class="text-subtitle-2 font-weight-bold d-flex align-center gap-2 pb-2">
                  <v-icon color="primary" size="16">lucide-user</v-icon>
                  Thông tin khách hàng
                </v-card-title>
                <v-divider />
                <v-card-text class="pa-4 text-body-2 space-y-2">
                  <div class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Tên khách hàng:</span>
                    <span class="font-weight-medium text-right">{{ order.partnerName || order.customerProfile?.name || '—' }}</span>
                  </div>
                  <div v-if="order.customerProfile?.phone" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Số điện thoại:</span>
                    <span class="font-weight-medium">{{ order.customerProfile.phone }}</span>
                  </div>
                  <div v-if="order.customerProfile?.email" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Email:</span>
                    <span>{{ order.customerProfile.email }}</span>
                  </div>
                  <div v-if="order.customerProfile?.city" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Khu vực / Tỉnh thành:</span>
                    <span>{{ order.customerProfile.city }}</span>
                  </div>
                  <div class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Bảng giá:</span>
                    <span>{{ order.pricelistName || 'Mặc định' }}</span>
                  </div>
                  <div v-if="order.paymentTerm" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Điều khoản thanh toán:</span>
                    <span class="font-weight-medium text-teal-darken-1">{{ order.paymentTerm }}</span>
                  </div>
                </v-card-text>
              </v-card>
            </v-col>

            <!-- Sales & Operation Info -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="h-100 rounded-lg info-box">
                <v-card-title class="text-subtitle-2 font-weight-bold d-flex align-center gap-2 pb-2">
                  <v-icon color="teal" size="16">lucide-store</v-icon>
                  Vận hành & Kinh doanh
                </v-card-title>
                <v-divider />
                <v-card-text class="pa-4 text-body-2 space-y-2">
                  <div class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Nhân viên phụ trách:</span>
                    <span class="font-weight-medium text-primary">{{ order.customerProfile?.salesperson || order.salesperson || 'Chưa phân công' }}</span>
                  </div>
                  <div class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Kho xuất hàng:</span>
                    <span class="font-weight-medium">{{ order.warehouseName || 'TPHCM' }}</span>
                  </div>
                  <div v-if="order.expectedDate" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Ngày dự kiến giao:</span>
                    <span>{{ formatDate(order.expectedDate) }}</span>
                  </div>
                  <div v-if="order.validityDate" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Hạn hiệu lực:</span>
                    <span>{{ formatDate(order.validityDate) }}</span>
                  </div>
                  <div v-if="order.activitySummary" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Ghi chú giao việc:</span>
                    <span class="text-amber-darken-3 font-italic">{{ order.activitySummary }}</span>
                  </div>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>

          <!-- Order Lines Table -->
          <div class="mb-4">
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-subtitle-2 font-weight-bold d-flex align-center gap-2">
                <v-icon color="primary" size="16">lucide-package</v-icon>
                Danh sách sản phẩm ({{ productLines.length }})
              </span>
            </div>

            <v-card variant="outlined" class="rounded-lg overflow-hidden">
              <v-table density="compact" class="order-lines-table">
                <thead>
                  <tr class="bg-surface-variant">
                    <th class="text-center" :style="!isMobile ? 'width: 40px;' : ''">#</th>
                    <th :class="isMobile ? 'text-left' : ''">
                      {{ isMobile ? 'Mã SP' : 'Sản phẩm' }}
                    </th>
                    <th v-if="!isMobile" style="width: 80px;" class="text-center">ĐVT</th>
                    <th :style="!isMobile ? 'width: 80px;' : ''" class="text-right">SL</th>
                    <th :style="!isMobile ? 'width: 120px;' : ''" class="text-right">Đơn giá</th>
                    <th :style="!isMobile ? 'width: 80px;' : ''" class="text-right">CK %</th>
                    <th :style="!isMobile ? 'width: 130px;' : ''" class="text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="productLines.length === 0">
                    <td :colspan="isMobile ? 6 : 7" class="text-center text-medium-emphasis py-6">Không có dữ liệu dòng sản phẩm</td>
                  </tr>
                  <tr v-for="(line, idx) in productLines" :key="line.id">
                    <td class="text-center text-caption text-medium-emphasis">{{ idx + 1 }}</td>
                    <td>
                      <!-- Desktop: Tên sản phẩm + SKU -->
                      <div v-if="!isMobile">
                        <div class="font-weight-medium text-body-2 line-clamp-1">{{ line.productName }}</div>
                        <div v-if="line.productSku" class="text-caption text-medium-emphasis font-monospace">
                          SKU: {{ line.productSku }}
                        </div>
                      </div>
                      <!-- Mobile: Chỉ hiển thị mã sản phẩm -->
                      <div v-else class="font-monospace text-caption font-weight-medium text-primary">
                        {{ line.productSku || line.productName }}
                      </div>
                    </td>
                    <td v-if="!isMobile" class="text-center text-caption">{{ line.uomName || 'Units' }}</td>
                    <td class="text-right font-weight-medium">{{ line.quantity }}</td>
                    <td class="text-right text-caption">
                      <div v-if="!isMobile && line.originalPrice && line.originalPrice > line.priceUnit" class="text-caption text-decoration-line-through text-medium-emphasis">
                        {{ formatVND(line.originalPrice) }}
                      </div>
                      <div :class="['font-weight-medium', (line.originalPrice && line.originalPrice > line.priceUnit) ? 'text-success font-weight-bold' : '']">
                        {{ formatVND(line.priceUnit) }}
                      </div>
                    </td>
                    <td class="text-right text-caption">
                      <span v-if="line.discount > 0" class="text-error font-weight-medium">-{{ line.discount }}%</span>
                      <span v-else class="text-medium-emphasis">—</span>
                    </td>
                    <td class="text-right font-weight-bold text-body-2">{{ formatVND(line.priceSubtotal) }}</td>
                  </tr>
                </tbody>
              </v-table>
            </v-card>
          </div>

          <!-- Applied Promotions & Free Gifts Section -->
          <div v-if="(order as any).appliedPromotions?.length || (order as any).freeItems?.length" class="mb-4">
            <v-card variant="outlined" class="rounded-lg pa-3 bg-amber-50/40 dark:bg-amber-950/20 border-amber-200">
              <div class="text-subtitle-2 font-weight-bold text-amber-800 dark:text-amber-400 d-flex align-center gap-1 mb-2">
                <v-icon size="18">lucide-gift</v-icon>
                Ưu đãi & Quà tặng áp dụng cho đơn:
              </div>
              <div class="d-flex flex-wrap gap-2 mb-2">
                <v-chip
                  v-for="(p, pidx) in (order as any).appliedPromotions"
                  :key="pidx"
                  size="small"
                  color="primary"
                  variant="flat"
                  class="font-weight-medium"
                >
                  🎉 {{ p.promotionName || p.name }} (v{{ p.policyVersion || 1 }})
                  <span v-if="p.discountAmount > 0" class="ml-1 font-weight-bold">-{{ formatVND(p.discountAmount) }}</span>
                </v-chip>
              </div>

              <!-- Free Gifts -->
              <div v-for="(p, pidx) in (order as any).appliedPromotions" :key="'g-' + pidx">
                <div v-if="p.freeItems?.length" class="d-flex flex-wrap gap-2">
                  <div
                    v-for="(g, gidx) in p.freeItems"
                    :key="gidx"
                    class="text-caption font-weight-bold text-deep-orange bg-deep-orange-lighten-5 px-2 py-1 rounded border"
                  >
                    🎁 Tặng kèm: {{ g.quantity }}x {{ g.name }} (SKU: {{ g.sku }})
                  </div>
                </div>
              </div>
            </v-card>
          </div>

          <!-- Bottom: Notes and Financial Summary -->
          <v-row>
            <!-- Left: Notes -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="h-100 rounded-lg pa-4">
                <div class="text-subtitle-2 font-weight-bold mb-2 d-flex align-center gap-1">
                  <v-icon color="grey" size="16">lucide-message-square</v-icon>
                  Ghi chú
                </div>
                <div v-if="cleanNote(order.note)" class="text-body-2 text-medium-emphasis order-note-content mb-2" v-html="cleanNote(order.note)" />
                <div v-if="extractedNotes.length > 0" class="space-y-1 mt-1">
                  <div v-for="(nt, nidx) in extractedNotes" :key="nidx" class="text-caption text-primary bg-primary-lighten-5 px-2 py-1 rounded border">
                    📌 {{ nt }}
                  </div>
                </div>
                <div v-if="!cleanNote(order.note) && extractedNotes.length === 0" class="text-body-2 text-medium-emphasis font-italic">Không có ghi chú thêm</div>
              </v-card>
            </v-col>

            <!-- Right: Financial Totals -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="rounded-lg pa-4 bg-surface">
                <div class="space-y-2 text-body-2">
                  <div class="d-flex justify-space-between text-medium-emphasis">
                    <span>Tổng tiền hàng (chưa giảm):</span>
                    <span class="font-monospace">{{ formatVND(order.amountUndiscounted || order.amountUntaxed) }}</span>
                  </div>

                  <div v-if="order.amountUndiscounted > order.amountUntaxed" class="d-flex justify-space-between text-error">
                    <span>Tổng chiết khấu:</span>
                    <span class="font-monospace">-{{ formatVND(order.amountUndiscounted - order.amountUntaxed) }}</span>
                  </div>

                  <div class="d-flex justify-space-between text-medium-emphasis">
                    <span>Tiền trước thuế:</span>
                    <span class="font-monospace">{{ formatVND(order.amountUntaxed) }}</span>
                  </div>

                  <div v-if="order.amountTax > 0" class="d-flex justify-space-between text-medium-emphasis">
                    <span>Thuế VAT:</span>
                    <span class="font-monospace">{{ formatVND(order.amountTax) }}</span>
                  </div>

                  <v-divider class="my-2" />

                  <div class="d-flex justify-space-between align-center">
                    <span class="text-subtitle-1 font-weight-bold">Tổng thanh toán:</span>
                    <span class="text-h6 font-weight-bold text-primary font-monospace">{{ formatVND(order.amountTotal) }}</span>
                  </div>
                </div>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="px-4 px-md-6 py-3 bg-surface d-flex align-center justify-space-between flex-wrap ga-2" style="gap: 8px;">
        <div v-if="canApproveOrReject" class="d-flex align-center ga-2" style="gap: 8px;">
          <v-btn
            color="success"
            variant="flat"
            prepend-icon="lucide-check-circle-2"
            class="text-none font-weight-bold"
            @click="$emit('confirm', order!)"
          >
            Duyệt
          </v-btn>
          <v-btn
            color="error"
            variant="outlined"
            prepend-icon="lucide-x-circle"
            class="text-none font-weight-bold"
            @click="$emit('reject', order!)"
          >
            Từ chối
          </v-btn>
        </div>
        <v-spacer v-else />
        <v-btn variant="outlined" color="grey" @click="$emit('update:modelValue', false)">Đóng</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDisplay } from 'vuetify';
import { useOrders } from '@/composables/use-orders';
import type { OrderItem } from '@/composables/use-orders';

const display = useDisplay();
const isMobile = computed(() => display.smAndDown.value);

const props = defineProps<{
  modelValue: boolean;
  order: OrderItem | null;
  loading?: boolean;
}>();

defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'confirm', order: OrderItem): void;
  (e: 'reject', order: OrderItem): void;
}>();

const {
  stateColor,
  stateLabel,
  deliveryStatusColor,
  deliveryStatusLabel,
  invoiceStatusColor,
  invoiceStatusLabel,
} = useOrders();

const productLines = computed(() => {
  if (!props.order?.lines) return [];
  return props.order.lines.filter(l => {
    // Filter out note / section items
    if (!l.odooProductId && !l.productSku && Number(l.quantity) === 0 && Number(l.priceUnit) === 0) {
      return false;
    }
    return true;
  });
});

const extractedNotes = computed(() => {
  if (!props.order?.lines) return [];
  return props.order.lines
    .filter(l => !l.odooProductId && !l.productSku && Number(l.quantity) === 0 && Number(l.priceUnit) === 0)
    .map(l => l.productName)
    .filter(Boolean);
});

function formatVND(n?: number) {
  if (n === undefined || n === null) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function formatDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

function formatDateTime(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${dt.toLocaleDateString('vi-VN')}`;
}

function copyOrderCode() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(window.location.href);
  }
}

function cleanNote(note: string | null | undefined) {
  if (!note) return '';
  let cleaned = note;
  
  // Remove anchor tags containing "terms" link: <a href="...terms...">...</a>
  cleaned = cleaned.replace(/<a\s+[^>]*href=["'][^"']*terms[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '');
  
  // Remove text strings with terms and conditions link
  cleaned = cleaned.replace(/Điều khoản\s*&\s*điều kiện\s*:?\s*https?:\/\/[^\s<]+/gi, '');
  cleaned = cleaned.replace(/Điều khoản\s*&\s*điều kiện\s*:?\s*/gi, '');
  
  // Clean up residual empty paragraphs or line breaks
  cleaned = cleaned.replace(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, '');
  cleaned = cleaned.replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '<br />');
  
  return cleaned.trim();
}

const canApproveOrReject = computed(() => {
  if (!props.order) return false;
  // Đơn hàng đã có trên Odoo (đang nằm trong danh sách đơn hàng) -> không hiển thị Duyệt/Từ chối
  if (props.order.odooOrderId && typeof props.order.odooOrderId === 'number' && props.order.odooOrderId > 0) {
    return false;
  }
  // Chỉ hiển thị cho đơn nháp AI đang chờ xác nhận
  return Boolean(props.order.isAiDraft);
});
</script>

<style scoped>
.space-y-2 > * + * {
  margin-top: 8px;
}
.order-lines-table {
  width: 100% !important;
}
:deep(.order-lines-table .v-table__wrapper > table) {
  width: 100% !important;
  table-layout: auto !important;
}
.order-lines-table th {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  white-space: nowrap;
}
.order-lines-table th,
.order-lines-table td {
  white-space: nowrap;
  padding-left: 8px !important;
  padding-right: 8px !important;
}
@media (max-width: 768px) {
  .order-lines-table th,
  .order-lines-table td {
    padding-left: 6px !important;
    padding-right: 6px !important;
    font-size: 0.75rem;
  }
}
.order-note-content {
  max-height: 120px;
  overflow-y: auto;
  font-size: 0.85rem;
}
.order-note-content :deep(p) {
  margin-bottom: 4px;
}
.order-note-content :deep(a) {
  color: var(--v-theme-primary);
  text-decoration: underline;
}
</style>
