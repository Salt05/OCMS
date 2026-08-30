<template>
  <div class="order-form-container d-flex flex-column h-100 bg-surface">
    <!-- Header -->
    <div class="panel-header d-flex align-center justify-space-between px-5 py-3 border-b bg-surface flex-shrink-0">
      <div class="d-flex align-center gap-2.5 overflow-hidden mr-2">
        <v-avatar size="36" color="success" variant="tonal" class="rounded-lg flex-shrink-0">
          <v-icon size="19" color="success">lucide-shopping-cart</v-icon>
        </v-avatar>
        <div class="overflow-hidden">
          <div class="text-subtitle-1 font-weight-bold text-high-emphasis text-truncate leading-tight">
            Tạo Đơn Hàng (Odoo)
          </div>
          <div class="text-caption text-medium-emphasis text-truncate font-size-11">
            Sản phẩm từ Directus • Đồng bộ kho Odoo
          </div>
        </div>
      </div>

      <div class="d-flex align-center gap-1 flex-shrink-0">
        <v-tooltip text="Làm mới dữ liệu từ Directus & Odoo" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <v-btn
              v-bind="tooltipProps"
              icon
              size="34"
              variant="text"
              rounded="lg"
              aria-label="Làm mới dữ liệu từ Directus & Odoo"
              :loading="loadingProducts || loadingPaymentTerms"
              @click="refreshOdooData"
            >
              <v-icon size="16">lucide-refresh-cw</v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <v-btn
          icon
          size="34"
          variant="text"
          rounded="lg"
          aria-label="Đóng bảng tạo đơn"
          @click="$emit('close')"
        >
          <v-icon size="18">lucide-x</v-icon>
        </v-btn>
      </div>
    </div>

    <!-- Warning if contact has no Odoo ID -->
    <div v-if="contact?.contactType !== 'customer' || !contact?.customerId" class="pa-5 flex-grow-1 overflow-y-auto">
      <v-alert type="warning" variant="tonal" class="mb-4 text-body-2 font-weight-medium rounded-xl">
        Khách hàng này chưa được xác nhận hoặc chưa có mã Odoo. Vui lòng cập nhật thông tin khách hàng trước khi tạo đơn!
      </v-alert>
      <v-btn color="primary" block rounded="lg" size="default" @click="$emit('close')">
        Quay lại
      </v-btn>
    </div>

    <!-- Main Scrollable Form Content (Generous padding: px-5 pt-4 pb-6) -->
    <div v-else class="panel-content flex-grow-1 overflow-y-auto px-5 pt-4 pb-6">
      <!-- AI Extract Button -->
      <div class="ai-extract-section mb-4">
        <v-btn
          color="deep-purple-accent-3"
          variant="tonal"
          block
          height="40"
          rounded="lg"
          :loading="aiExtracting"
          :disabled="aiExtracting"
          class="font-weight-bold text-body-2 ai-extract-btn"
          prepend-icon="lucide-sparkles"
          @click="handleAiExtract"
        >
          <template v-if="aiExtracting">
            AI đang phân tích tin nhắn...
          </template>
          <template v-else>
            ✨ AI Bóc tách đơn từ tin nhắn
          </template>
        </v-btn>
        <div class="text-caption text-center text-medium-emphasis mt-1 font-size-11">
          AI đọc tin nhắn hôm nay • Tự động điền sản phẩm & số lượng
        </div>
      </div>

      <!-- AI Missing Info Alerts -->
      <v-alert
        v-if="aiMissingInfo.length > 0"
        type="warning"
        variant="tonal"
        density="compact"
        closable
        class="mb-3 rounded-xl text-body-2"
        @click:close="aiMissingInfo = []"
      >
        <div class="font-weight-bold mb-1">⚠️ AI phát hiện thiếu thông tin:</div>
        <ul class="pl-4 mb-0" style="font-size: 12px;">
          <li v-for="(info, i) in aiMissingInfo" :key="i">{{ info }}</li>
        </ul>
      </v-alert>

      <!-- AI Shipping Address suggestion -->
      <v-alert
        v-if="aiShippingAddress"
        type="info"
        variant="tonal"
        density="compact"
        closable
        class="mb-3 rounded-xl text-body-2"
        @click:close="aiShippingAddress = ''"
      >
        <div class="font-weight-bold mb-0.5">📍 Địa chỉ giao hàng (AI trích xuất):</div>
        <div style="font-size: 12px;">{{ aiShippingAddress }}</div>
      </v-alert>

      <v-form ref="orderForm" v-model="formValid" @submit.prevent="submitOrder">
        <!-- Khách hàng & Ngày hết hạn -->
        <v-row dense class="mb-2">
          <v-col cols="12" sm="6">
            <div class="field-label mb-1.5">Khách hàng</div>
            <v-text-field
              :model-value="contact.fullName"
              variant="outlined"
              density="compact"
              readonly
              hide-details
              prepend-inner-icon="lucide-user"
              class="rounded-input customer-field"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <div class="field-label mb-1.5">Ngày hết hạn</div>
            <v-text-field
              v-model="validityDate"
              type="date"
              variant="outlined"
              density="compact"
              hide-details
              placeholder="dd/mm/yyyy"
              class="rounded-input date-input-field"
            />
          </v-col>

          <!-- Điều khoản thanh toán -->
          <v-col cols="12" class="mt-2">
            <div class="field-label mb-1.5">Điều khoản thanh toán</div>
            <v-select
              v-model="paymentTermId"
              :items="paymentTerms"
              :loading="loadingPaymentTerms"
              item-title="name"
              item-value="id"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              placeholder="Chọn điều khoản thanh toán"
              class="rounded-input"
            >
              <template #prepend-inner>
                <v-icon size="15" color="primary">lucide-credit-card</v-icon>
              </template>
            </v-select>
          </v-col>
        </v-row>

        <!-- Chi tiết đơn hàng Header -->
        <div class="d-flex align-center justify-space-between mt-4 mb-3 flex-wrap gap-2">
          <div class="d-flex align-center gap-2">
            <span class="text-subtitle-2 font-weight-bold text-high-emphasis">Chi tiết đơn hàng</span>
            <v-chip
              size="small"
              color="primary"
              variant="tonal"
              class="font-weight-medium px-2 text-caption product-count-chip"
            >
              {{ products.length }} sản phẩm có sẵn
            </v-chip>
          </div>

          <!-- Secondary Action: Thêm sản phẩm -->
          <v-btn
            color="primary"
            variant="tonal"
            height="30"
            class="font-weight-bold px-3 text-caption rounded-lg secondary-add-btn"
            prepend-icon="lucide-plus"
            aria-label="Thêm sản phẩm vào đơn"
            @click="showProductDialog = true"
          >
            Thêm sản phẩm
          </v-btn>
        </div>

        <!-- Empty state placeholder -->
        <div
          v-if="orderLines.length === 0"
          class="empty-order-box d-flex flex-column align-center justify-center pa-6 mb-3.5 border-dashed rounded-xl cursor-pointer text-center transition-all"
          @click="showProductDialog = true"
        >
          <v-avatar size="42" color="amber-lighten-4" class="mb-2">
            <v-icon size="22" color="amber-darken-3">lucide-package-plus</v-icon>
          </v-avatar>
          <div class="text-body-2 font-weight-bold text-high-emphasis">Chưa có sản phẩm nào trong đơn</div>
          <div class="text-caption text-medium-emphasis mt-0.5">Bấm nút "+ Thêm sản phẩm" hoặc nhấp vào đây để chọn</div>
        </div>

        <!-- Ordered Product Cards List -->
        <div v-else class="order-cards-list mb-4 d-flex flex-column gap-3">
          <div
            v-for="(line, index) in orderLines"
            :key="index"
            class="product-card border rounded-xl bg-surface shadow-xs transition-all"
            :class="{ 'ai-filled-card': line.aiConfidence != null }"
          >
            <!-- Top Section: Image + Name & Metadata + Delete Button -->
            <div class="d-flex gap-3.5 align-start">
              <!-- Left: Image Box -->
              <div class="product-image-box rounded-lg border flex-shrink-0 bg-surface overflow-hidden">
                <img
                  v-if="line.product?.image_url"
                  :src="line.product.image_url"
                  :alt="line.product.name"
                  class="product-img-render"
                />
                <div v-else class="w-100 h-100 d-flex align-center justify-center text-medium-emphasis">
                  <v-icon size="22" class="opacity-50">lucide-image</v-icon>
                </div>
              </div>

              <!-- Center: Product Name & Subtle Metadata (with comfortable gap from image) -->
              <div class="flex-grow-1 overflow-hidden" style="min-width: 0;">
                <div class="product-name-title font-weight-bold text-high-emphasis leading-snug">
                  {{ line.product?.name || line.product?.display_name || 'Chưa chọn sản phẩm' }}
                </div>
                <div class="product-meta-tags d-flex align-center gap-2 mt-1 text-caption text-medium-emphasis">
                  <span v-if="line.product?.default_code || line.product?.sku" class="sku-meta-text">
                    SKU: {{ line.product?.default_code || line.product?.sku }}
                  </span>
                  <span v-if="line.product?.odoo_id || line.product?.id" class="odoo-meta-text">
                    · #{{ line.product?.odoo_id || line.product?.id }}
                  </span>
                </div>
                <!-- AI Confidence Badge -->
                <v-chip
                  v-if="line.aiConfidence != null"
                  :color="line.aiConfidence >= 0.8 ? 'success' : line.aiConfidence >= 0.5 ? 'warning' : 'error'"
                  size="x-small"
                  variant="tonal"
                  class="mt-1 font-weight-bold"
                  :prepend-icon="line.aiConfidence >= 0.8 ? 'lucide-check-circle' : 'lucide-alert-triangle'"
                >
                  AI {{ Math.round(line.aiConfidence * 100) }}%
                </v-chip>
              </div>

              <!-- Right: Delete Button -->
              <v-btn
                icon
                size="30"
                variant="text"
                color="error"
                class="delete-line-btn flex-shrink-0"
                aria-label="Xóa sản phẩm này khỏi đơn"
                title="Xóa sản phẩm"
                @click="removeOrderLine(index)"
              >
                <v-icon size="16">lucide-trash-2</v-icon>
              </v-btn>
            </div>

            <!-- Bottom Section: Pricing, Quantity Stepper & Subtotal -->
            <div class="product-calc-bar d-flex align-center justify-space-between flex-wrap gap-2">
              <!-- Left: Unit Price × Stepper -->
              <div class="d-flex align-center gap-2 flex-shrink-0">
                <span class="unit-price-text text-medium-emphasis font-weight-medium">
                  {{ formatCurrency(line.price) }}
                </span>
                <span class="text-medium-emphasis opacity-60 font-size-11">×</span>

                <!-- Quantity Stepper -->
                <div class="quantity-stepper d-inline-flex align-center border rounded-lg overflow-hidden bg-surface">
                  <button
                    type="button"
                    class="stepper-btn stepper-btn-minus"
                    :disabled="line.qty <= 0"
                    aria-label="Giảm số lượng"
                    title="Giảm 1"
                    @click="decrementQty(line)"
                  >
                    <v-icon size="12">lucide-minus</v-icon>
                  </button>
                  <input
                    type="number"
                    v-model.number="line.qty"
                    min="0"
                    class="stepper-input text-center font-weight-bold text-high-emphasis"
                    aria-label="Số lượng sản phẩm"
                    @change="onQtyChange(line)"
                  />
                  <button
                    type="button"
                    class="stepper-btn stepper-btn-plus"
                    aria-label="Tăng số lượng"
                    title="Tăng 1"
                    @click="incrementQty(line)"
                  >
                    <v-icon size="12">lucide-plus</v-icon>
                  </button>
                </div>
              </div>

              <!-- Right: Subtotal (Thành tiền) -->
              <div class="subtotal-group d-flex align-center gap-1.5 ml-auto flex-shrink-0">
                <span class="text-caption text-medium-emphasis font-weight-medium">Thành tiền:</span>
                <span class="line-subtotal-val font-weight-bold text-high-emphasis">
                  {{ formatCurrency(lineSubtotal(line)) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Ghi chú đơn hàng -->
        <div class="mt-4">
          <div class="field-label mb-1.5">Ghi chú đơn hàng</div>
          <v-textarea
            v-model="notes"
            variant="outlined"
            density="compact"
            rows="2"
            auto-grow
            hide-details
            placeholder="Nhập ghi chú cho đơn hàng này..."
            class="rounded-input"
          />
        </div>

        <!-- Tổng kết đơn hàng Summary Box -->
        <div class="order-summary-box">
          <div class="d-flex align-center justify-space-between summary-row">
            <span class="text-caption font-weight-medium text-medium-emphasis">Tổng số lượng:</span>
            <span class="text-caption font-weight-bold text-high-emphasis">{{ totalProductsCount }} sản phẩm</span>
          </div>
          <div class="d-flex align-center justify-space-between summary-row-total">
            <span class="text-subtitle-2 font-weight-bold text-high-emphasis">Tổng thanh toán:</span>
            <span class="total-amount-highlight font-weight-bold">
              {{ formatCurrency(totalAmount) }}
            </span>
          </div>
        </div>
      </v-form>
    </div>

    <!-- Sticky Footer Action Button -->
    <div
      v-if="contact?.contactType === 'customer' && contact?.customerId"
      class="panel-footer px-5 py-3 border-t bg-surface flex-shrink-0"
    >
      <v-btn
        color="success"
        block
        size="default"
        height="42"
        :loading="saving"
        :disabled="!isValidOrder"
        prepend-icon="lucide-check-circle"
        rounded="lg"
        class="cta-submit-btn font-weight-bold text-white shadow-xs"
        aria-label="Tạo đơn hàng sang Odoo"
        @click="submitOrder"
      >
        Tạo đơn sang Odoo
      </v-btn>
      <div
        v-if="!isValidOrder && orderLines.length === 0"
        class="text-caption text-center text-medium-emphasis mt-1.5 font-size-11"
      >
        Vui lòng chọn ít nhất 1 sản phẩm để tạo đơn
      </div>
    </div>

    <!-- Product Picker Modal Dialog -->
    <ProductPickerDialog
      v-model="showProductDialog"
      :loading="loadingProducts"
      :order-lines="orderLines"
      @select="onProductFromPicker"
    />

    <!-- Success/Error Snackbar -->
    <v-snackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      timeout="3500"
      location="top"
      class="rounded-xl"
    >
      <div class="d-flex align-center gap-2 font-weight-medium">
        <v-icon size="18">{{ snackbar.color === 'success' ? 'lucide-check-circle' : 'lucide-alert-circle' }}</v-icon>
        <span>{{ snackbar.text }}</span>
      </div>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api } from '@/api';
import { io, Socket } from 'socket.io-client';
import type { Contact } from '@/composables/use-contacts';
import { useOdoo, type OdooProduct } from '@/composables/use-odoo';
import ProductPickerDialog from '@/components/chat/ProductPickerDialog.vue';

const props = defineProps<{
  contact: Contact | null;
  conversationId: string;
}>();

const emit = defineEmits<{
  close: [];
  created: [order: any];
}>();

const {
  paymentTerms,
  products,
  loadingPaymentTerms,
  loadingProducts,
  fetchPaymentTerms,
  fetchProducts,
  formatCurrency,
} = useOdoo();

const formValid = ref(false);
const saving = ref(false);
const snackbar = ref({ show: false, text: '', color: 'success' });
const showProductDialog = ref(false);

// Header fields
const validityDate = ref('');
const paymentTermId = ref<number | null>(null);
const notes = ref('');

// Order lines
export interface OrderLineItem {
  product: OdooProduct | null;
  qty: number;
  price: number;
  discount: number;
  aiConfidence?: number | null;
  aiRawName?: string;
}
const orderLines = ref<OrderLineItem[]>([]);
const aiExtracting = ref(false);
const aiMissingInfo = ref<string[]>([]);
const aiShippingAddress = ref('');

// Line calculation
function lineSubtotal(line: OrderLineItem) {
  const amount = (line.qty || 0) * (line.price || 0);
  const discountAmount = amount * ((line.discount || 0) / 100);
  return amount - discountAmount;
}

// Totals
const totalProductsCount = computed(() => {
  return orderLines.value.reduce((sum, line) => sum + (line.qty || 0), 0);
});

const totalAmount = computed(() => {
  return orderLines.value.reduce((sum, line) => sum + lineSubtotal(line), 0);
});

const isValidOrder = computed(() => {
  return orderLines.value.length > 0 && orderLines.value.some(l => l.product?.id != null && Number(l.qty) > 0);
});

// Quantity controls
function incrementQty(line: OrderLineItem) {
  line.qty = (Number(line.qty) || 0) + 1;
}

function decrementQty(line: OrderLineItem) {
  if ((line.qty || 0) > 0) {
    line.qty -= 1;
  }
}

function onQtyChange(line: OrderLineItem) {
  if (line.qty === null || line.qty === undefined || line.qty < 0 || isNaN(line.qty)) {
    line.qty = 0;
  } else {
    line.qty = Math.floor(line.qty);
  }
}

// When product is clicked in the picker dialog
function onProductFromPicker(product: OdooProduct, addQty: number = 1) {
  const odooProductId = Number(product.odoo_id || product.id);
  const existingLine = orderLines.value.find(
    (l) => l.product?.id === odooProductId || l.product?.id === product.id
  );

  const quantityToAdd = typeof addQty === 'number' && addQty > 0 ? addQty : 1;

  if (existingLine) {
    existingLine.qty += quantityToAdd;
    snackbar.value = {
      show: true,
      text: `Đã tăng số lượng "${product.name || product.sku}" lên ${existingLine.qty}`,
      color: 'info',
    };
  } else {
    orderLines.value.push({
      product: {
        ...product,
        id: odooProductId,
      },
      qty: quantityToAdd,
      price: product.list_price || product.wholesale_price || 0,
      discount: 0,
    });
    snackbar.value = {
      show: true,
      text: `Đã thêm "${product.name || product.sku}" (x${quantityToAdd}) vào đơn hàng`,
      color: 'success',
    };
  }
}

function removeOrderLine(index: number) {
  orderLines.value.splice(index, 1);
}

let socket: Socket | null = null;

function initSocketListener() {
  socket = io({ transports: ['websocket', 'polling'] });
  socket.on('chat:order_draft_updated', (data: { conversationId: string; draftOrder: any }) => {
    if (data.conversationId === props.conversationId && data.draftOrder) {
      fillOrderFromAI(data.draftOrder);
    }
  });
}

onUnmounted(() => {
  if (socket) {
    socket.disconnect();
  }
});

// Load Payment Terms and Products on mount (cached)
onMounted(async () => {
  await Promise.all([
    fetchPaymentTerms(),
    fetchProducts(),
  ]);

  // Default to 1 (Thanh toán ngay) if nothing selected
  if (!paymentTermId.value && paymentTerms.value.length > 0) {
    paymentTermId.value = paymentTerms.value[0].id;
  }

  // If customer has a specific payment term in Odoo, try to match it
  if (props.contact?.customerId) {
    try {
      const res = await api.get(`/odoo/customers/${props.contact.customerId}`);
      if (res.data?.customer?.paymentTermId) {
        paymentTermId.value = res.data.customer.paymentTermId;
      }
    } catch {
      // Keep default
    }
  }

  // Auto-load pre-saved draft order from database (no LLM call)
  loadSavedDraft();

  // Listen to real-time AI updates
  initSocketListener();
});

async function refreshOdooData() {
  await Promise.all([
    fetchPaymentTerms(true),
    fetchProducts(true),
  ]);
  snackbar.value = {
    show: true,
    text: `Đã làm mới: ${products.value.length} sản phẩm từ Directus & Odoo`,
    color: 'success',
  };
}

// ── AI Order Extraction ─────────────────────────────────────────────────────
async function handleAiExtract() {
  if (!props.conversationId) {
    snackbar.value = { show: true, text: 'Không tìm thấy cuộc trò chuyện hiện tại.', color: 'error' };
    return;
  }

  aiExtracting.value = true;
  aiMissingInfo.value = [];
  aiShippingAddress.value = '';

  try {
    const res = await api.post('/orders/ai-extract', {
      conversationId: props.conversationId,
    });

    if (res.data?.success && res.data.draft) {
      fillOrderFromAI(res.data.draft);
    } else {
      snackbar.value = { show: true, text: 'AI không trích xuất được đơn hàng từ tin nhắn.', color: 'warning' };
    }
  } catch (err: any) {
    console.error('[AI Extract]', err);
    snackbar.value = {
      show: true,
      text: err.response?.data?.error || 'Lỗi khi AI phân tích tin nhắn',
      color: 'error',
    };
  } finally {
    aiExtracting.value = false;
  }
}

async function loadSavedDraft() {
  if (!props.conversationId) return;
  try {
    const res = await api.get(`/orders/draft/${props.conversationId}`);
    if (res.data?.success && res.data.draft) {
      fillOrderFromAI(res.data.draft);
    }
  } catch (err) {
    console.error('Failed to load saved draft order:', err);
  }
}

function fillOrderFromAI(draft: any) {
  // Store missing info alerts
  aiMissingInfo.value = draft.missingInfo || [];

  // Store shipping address if extracted
  if (draft.customer?.shippingAddress) {
    aiShippingAddress.value = draft.customer.shippingAddress;
  }

  // Store notes if any
  if (draft.notes) {
    notes.value = draft.notes;
  }

  // Map AI items to order lines
  const items = draft.items || [];
  if (items.length === 0) {
    snackbar.value = { show: true, text: 'AI không tìm thấy yêu cầu đặt hàng trong tin nhắn hôm nay.', color: 'warning' };
    return;
  }

  // Clear existing lines and fill with AI data
  orderLines.value = [];

  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const item of items) {
    // Try to find the product in our local products cache by odooId
    let matchedProduct: OdooProduct | null = null;

    if (item.matchedProductOdooId) {
      matchedProduct = products.value.find(
        (p) => Number(p.odoo_id || p.id) === item.matchedProductOdooId
      ) || null;
    }

    // Fallback: try matching by SKU
    if (!matchedProduct && item.sku) {
      matchedProduct = products.value.find(
        (p) => (p.default_code || p.sku || '').toLowerCase() === item.sku.toLowerCase()
      ) || null;
    }

    if (matchedProduct) {
      matchedCount++;
    } else {
      unmatchedCount++;
    }

    orderLines.value.push({
      product: matchedProduct ? {
        ...matchedProduct,
        id: Number(matchedProduct.odoo_id || matchedProduct.id),
      } : null,
      qty: item.quantity || 1,
      price: item.priceUnit || matchedProduct?.wholesale_price || matchedProduct?.list_price || 0,
      discount: item.discount || 0,
      aiConfidence: item.confidence,
      aiRawName: item.productNameRaw,
    });
  }

  const totalItems = matchedCount + unmatchedCount;
  if (unmatchedCount > 0) {
    snackbar.value = {
      show: true,
      text: `AI bóc tách ${totalItems} sản phẩm (${matchedCount} khớp, ${unmatchedCount} cần kiểm tra)`,
      color: 'warning',
    };
  } else {
    snackbar.value = {
      show: true,
      text: `✨ AI đã điền thành công ${totalItems} sản phẩm vào đơn hàng!`,
      color: 'success',
    };
  }
}

// Submit Order
async function submitOrder() {
  if (!isValidOrder.value || !props.contact?.customerId) return;

  const payloadLines = orderLines.value
    .filter(l => l.product?.id != null && Number(l.qty) > 0)
    .map(l => ({
      product_id: l.product!.id,
      product_uom_qty: Number(l.qty) || 0,
      price_unit: l.price,
      discount: l.discount || 0,
    }));

  if (payloadLines.length === 0) {
    snackbar.value = { show: true, text: 'Vui lòng chọn ít nhất 1 sản phẩm có số lượng lớn hơn 0!', color: 'error' };
    return;
  }

  const payload = {
    partner_id: parseInt(props.contact.customerId),
    contactId: props.contact.id,
    conversationId: props.conversationId,
    validity_date: validityDate.value || undefined,
    payment_term_id: paymentTermId.value || undefined,
    notes: notes.value || undefined,
    order_line: payloadLines,
  };

  saving.value = true;
  try {
    const res = await api.post('/odoo/orders', payload);
    if (res.data?.success) {
      snackbar.value = { show: true, text: `Tạo đơn thành công: ${res.data.orderCode}`, color: 'success' };
      emit('created', res.data);
      setTimeout(() => emit('close'), 1500);
    }
  } catch (err: any) {
    console.error('Submit error', err);
    snackbar.value = { show: true, text: err.response?.data?.error || 'Lỗi tạo đơn', color: 'error' };
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.order-form-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.panel-header {
  height: 56px;
}

.panel-footer {
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.03);
}

.v-theme--dark .panel-footer {
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.2);
}

.panel-content {
  scrollbar-width: thin;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-graphite, #334155);
  letter-spacing: 0.1px;
}

.v-theme--dark .field-label {
  color: var(--color-ashen, #9ca3af);
}

.font-size-11 {
  font-size: 11px !important;
}

.rounded-input :deep(.v-field) {
  border-radius: 8px;
}

/* Customer field: clear visible text & distinct background in light & dark mode */
.customer-field :deep(.v-field) {
  background-color: #f1f5f9 !important;
  border-color: #cbd5e1 !important;
}

.v-theme--dark .customer-field :deep(.v-field) {
  background-color: rgba(255, 255, 255, 0.05) !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
}

.customer-field :deep(.v-field__input),
.customer-field :deep(input) {
  color: #0f172a !important;
  -webkit-text-fill-color: #0f172a !important;
  opacity: 1 !important;
  font-weight: 600 !important;
  font-size: 13.5px !important;
  cursor: default;
}

.customer-field :deep(.v-field__prepend-inner) .v-icon {
  color: #0068ff !important;
  opacity: 0.9 !important;
}

.v-theme--dark .customer-field :deep(.v-field__input),
.v-theme--dark .customer-field :deep(input) {
  color: #f8fafc !important;
  -webkit-text-fill-color: #f8fafc !important;
  opacity: 1 !important;
}

.v-theme--dark .customer-field :deep(.v-field__prepend-inner) .v-icon {
  color: #38bdf8 !important;
  opacity: 0.9 !important;
}

.product-count-chip {
  font-weight: 500;
  height: 24px;
}

.secondary-add-btn {
  letter-spacing: 0.1px;
  font-size: 12px !important;
  transition: all 0.15s ease;
}

.secondary-add-btn:hover {
  transform: translateY(-0.5px);
}

/* Product Card */
.product-card {
  padding: 14px !important;
  border-radius: 12px !important;
  border-color: var(--color-chalk, #e2e8f0) !important;
  background-color: var(--color-paper-white, #ffffff) !important;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.v-theme--dark .product-card {
  border-color: rgba(255, 255, 255, 0.08) !important;
  background-color: rgba(255, 255, 255, 0.02) !important;
}

.product-card:hover {
  border-color: #3b82f6 !important;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.06);
}

.v-theme--dark .product-card:hover {
  border-color: #2563eb !important;
}

.product-image-box {
  width: 58px;
  height: 58px;
  border-color: var(--color-chalk, #e2e8f0);
  background-color: var(--color-paper-white, #ffffff);
  padding: 2px;
  border-radius: 8px;
}

.v-theme--dark .product-image-box {
  border-color: rgba(255, 255, 255, 0.08);
  background-color: #1f1f1c;
}

.product-img-render {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.product-name-title {
  font-size: 13.5px;
  line-height: 1.35;
  color: var(--color-carbon-ink, #0f172a);
}

.sku-meta-text,
.odoo-meta-text {
  font-size: 11.5px;
}

.delete-line-btn {
  opacity: 0.6;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.delete-line-btn:hover {
  opacity: 1;
  transform: scale(1.08);
}

.product-calc-bar {
  padding-top: 10px;
  margin-top: 2px;
  border-top: 1px dashed var(--color-chalk, #f1f5f9);
}

.v-theme--dark .product-calc-bar {
  border-top-color: rgba(255, 255, 255, 0.06);
}

.unit-price-text {
  font-size: 13px;
  white-space: nowrap;
}

/* Quantity Stepper Control */
.quantity-stepper {
  border-color: var(--color-chalk, #cbd5e1) !important;
  height: 28px;
  width: 88px;
}

.v-theme--dark .quantity-stepper {
  border-color: rgba(255, 255, 255, 0.12) !important;
}

.stepper-btn {
  width: 26px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--color-carbon-ink, #334155);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.v-theme--dark .stepper-btn {
  color: #e2e8f0;
}

.stepper-btn:hover:not(:disabled) {
  background-color: var(--color-soft-stone, rgba(0, 0, 0, 0.05));
  color: #0068ff;
}

.v-theme--dark .stepper-btn:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.08);
  color: #38bdf8;
}

.stepper-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.stepper-input {
  width: 36px;
  height: 100%;
  font-size: 12.5px;
  outline: none;
  border: none;
  border-left: 1px solid var(--color-chalk, #e2e8f0);
  border-right: 1px solid var(--color-chalk, #e2e8f0);
  background: transparent;
  color: var(--color-carbon-ink, inherit);
  appearance: textfield;
  -moz-appearance: textfield;
}

.stepper-input::-webkit-outer-spin-button,
.stepper-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.v-theme--dark .stepper-input {
  border-left-color: rgba(255, 255, 255, 0.12);
  border-right-color: rgba(255, 255, 255, 0.12);
}

.line-subtotal-val {
  font-size: 14px;
  white-space: nowrap;
  letter-spacing: -0.1px;
}

/* Order Summary Box */
.order-summary-box {
  padding: 14px 16px !important;
  border-radius: 12px !important;
  border: 1px solid var(--color-chalk, #e2e8f0) !important;
  background-color: #f8fafc !important;
  margin-top: 16px;
}

.v-theme--dark .order-summary-box {
  background-color: rgba(255, 255, 255, 0.03) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.summary-row {
  padding: 2px 0;
}

.summary-row-total {
  padding-top: 10px;
  margin-top: 8px;
  border-top: 1px solid var(--color-chalk, #e2e8f0);
}

.v-theme--dark .summary-row-total {
  border-top-color: rgba(255, 255, 255, 0.08);
}

.total-amount-highlight {
  font-size: 20px;
  color: #10b981;
  letter-spacing: -0.2px;
  white-space: nowrap;
}

.v-theme--dark .total-amount-highlight {
  color: #34d399;
}

.empty-order-box {
  border-color: #f59e0b !important;
  background-color: #fffbeb !important;
}

.v-theme--dark .empty-order-box {
  border-color: rgba(245, 158, 11, 0.35) !important;
  background-color: rgba(245, 158, 11, 0.06) !important;
}

.empty-order-box:hover {
  border-color: #d97706 !important;
  background-color: #fef3c7 !important;
}

.v-theme--dark .empty-order-box:hover {
  background-color: rgba(245, 158, 11, 0.1) !important;
}

.cta-submit-btn {
  letter-spacing: 0.15px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.cta-submit-btn:hover:not(:disabled) {
  transform: translateY(-0.5px);
}

/* ── AI Extract Button ─────────────────────────────────────────────────── */
.ai-extract-btn {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%) !important;
  border: 1.5px dashed rgba(124, 58, 237, 0.35) !important;
  transition: all 0.25s ease;
}

.ai-extract-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%) !important;
  border-color: rgba(124, 58, 237, 0.6) !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(124, 58, 237, 0.15);
}

.v-theme--dark .ai-extract-btn {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(192, 132, 252, 0.15) 100%) !important;
  border-color: rgba(192, 132, 252, 0.4) !important;
}

.v-theme--dark .ai-extract-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(192, 132, 252, 0.25) 100%) !important;
  border-color: rgba(192, 132, 252, 0.7) !important;
}

/* AI-filled product card highlight */
.ai-filled-card {
  border-color: rgba(124, 58, 237, 0.3) !important;
  box-shadow: 0 0 0 1px rgba(124, 58, 237, 0.1), 0 2px 8px rgba(124, 58, 237, 0.08);
}

.v-theme--dark .ai-filled-card {
  border-color: rgba(192, 132, 252, 0.35) !important;
  box-shadow: 0 0 0 1px rgba(192, 132, 252, 0.15), 0 2px 8px rgba(192, 132, 252, 0.1);
}
</style>


