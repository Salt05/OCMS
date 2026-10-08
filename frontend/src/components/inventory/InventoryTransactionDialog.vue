<template>
  <v-dialog v-model="dialog" max-width="920" width="100%" scrollable>
    <v-card class="transaction-card d-flex flex-column rounded-xl overflow-hidden">
      <!-- Dialog Header -->
      <v-card-title class="d-flex justify-space-between align-center pa-4 px-5 border-b bg-surface flex-shrink-0">
        <div class="d-flex align-center ga-2">
          <v-avatar color="primary" variant="tonal" size="36" class="rounded-lg">
            <v-icon size="20" color="primary">lucide-arrow-left-right</v-icon>
          </v-avatar>
          <div>
            <div class="text-h6 font-weight-bold leading-tight">Tạo biến động kho</div>
            <div class="text-caption text-medium-emphasis">Tạo phiếu nhập, xuất hoặc điều chỉnh số lượng tồn kho</div>
          </div>
        </div>
        <v-btn icon="lucide-x" variant="text" density="comfortable" @click="closeDialog"></v-btn>
      </v-card-title>

      <!-- Dialog Body (2 Columns Layout) -->
      <v-card-text class="transaction-card-body pa-0 d-flex flex-column flex-md-row overflow-hidden flex-grow-1">
        <!-- Left Pane: Configuration & Note (Form) -->
        <div class="form-pane pa-5 d-flex flex-column ga-4 border-e-md bg-grey-lighten-5 flex-shrink-0">
          <div class="text-subtitle-2 font-weight-bold text-high-emphasis">1. Thông tin biến động</div>

          <!-- Transaction Type -->
          <v-select
            v-model="form.type"
            :items="typeOptions"
            label="Loại biến động *"
            variant="outlined"
            density="comfortable"
            hide-details
            bg-color="white"
            @update:modelValue="onTypeChanged"
          ></v-select>

          <!-- Return Order Picker (shown when type is RETURN_IN) -->
          <div v-if="form.type === 'RETURN_IN'" class="return-order-picker">
            <v-autocomplete
              v-model="selectedReturnOrderId"
              v-model:search="returnOrderSearch"
              label="Tìm đơn hàng trả lại *"
              placeholder="Nhập mã đơn hoặc tên khách..."
              variant="outlined"
              density="comfortable"
              clearable
              hide-details
              bg-color="white"
              prepend-inner-icon="lucide-search"
              :loading="returnOrderLoading"
              :items="returnOrders"
              item-title="displayTitle"
              item-value="id"
              @update:search="onReturnSearchInput"
              @update:modelValue="selectReturnOrder"
            ></v-autocomplete>
            <div v-if="selectedReturnOrder" class="text-caption text-medium-emphasis mt-1">
              Đơn {{ selectedReturnOrder.orderCode }} - {{ selectedReturnOrder.partnerName || 'Khách hàng' }}
            </div>
          </div>

          <!-- Notes -->
          <v-textarea
            v-model="form.notes"
            label="Lý do / Ghi chú"
            placeholder="Nhập lý do điều chỉnh hoặc ghi chú thêm..."
            variant="outlined"
            density="comfortable"
            rows="3"
            auto-grow
            hide-details
            bg-color="white"
          ></v-textarea>

          <!-- Select Product Button -->
          <div class="mt-auto pt-2">
            <v-btn
              block
              color="primary"
              variant="tonal"
              prepend-icon="lucide-plus"
              class="product-picker-btn text-none font-weight-bold"
              size="large"
              @click="openProductPicker"
            >
              {{ selectedProducts.length ? 'Thêm sản phẩm khác' : 'Chọn sản phẩm' }}
            </v-btn>
          </div>
        </div>

        <!-- Right Pane: Selected Products List ("bên đó") -->
        <div class="products-pane pa-5 d-flex flex-column flex-grow-1 overflow-hidden bg-white">
          <div class="d-flex align-center justify-space-between mb-3 flex-shrink-0">
            <div class="text-subtitle-2 font-weight-bold text-high-emphasis d-flex align-center ga-2">
              <span>2. Danh sách sản phẩm</span>
              <v-chip size="x-small" color="primary" variant="tonal" class="font-weight-bold">
                {{ selectedProducts.length }}
              </v-chip>
            </div>
            <v-btn
              v-if="selectedProducts.length"
              size="small"
              variant="text"
              color="error"
              class="px-1 text-caption text-none"
              prepend-icon="lucide-trash-2"
              @click="selectedProducts = []"
            >
              Xóa tất cả
            </v-btn>
          </div>

          <!-- Empty State -->
          <div
            v-if="!selectedProducts.length"
            class="empty-products-box d-flex flex-column align-center justify-center rounded-xl border border-dashed pa-6 text-center my-auto flex-grow-1"
          >
            <v-avatar color="primary" variant="tonal" size="56" class="mb-3">
              <v-icon size="28" color="primary">lucide-package-plus</v-icon>
            </v-avatar>
            <div class="text-body-1 font-weight-medium text-high-emphasis mb-1">Chưa có sản phẩm nào</div>
            <div class="text-caption text-medium-emphasis mb-4" style="max-width: 260px;">
              Nhấn nút <strong>"Chọn sản phẩm"</strong> ở cột bên trái để chọn sản phẩm cần biến động.
            </div>
            <v-btn color="primary" variant="outlined" prepend-icon="lucide-plus" size="small" class="text-none" @click="openProductPicker">
              Chọn sản phẩm ngay
            </v-btn>
          </div>

          <!-- Selected Products Cards List -->
          <div v-else class="selected-products-list d-flex flex-column ga-2.5 overflow-y-auto pr-1 flex-grow-1">
            <div
              v-for="product in selectedProducts"
              :key="product.id"
              class="product-card border rounded-lg pa-3 bg-surface"
            >
              <div class="d-flex align-center ga-3">
                <div class="product-image-box rounded-md border flex-shrink-0 overflow-hidden bg-grey-lighten-4">
                  <img v-if="product.imageUrl" :src="product.imageUrl" :alt="product.name" class="product-image">
                  <v-icon v-else color="grey" size="20">lucide-image</v-icon>
                </div>

                <div class="flex-grow-1 overflow-hidden">
                  <div class="font-weight-medium text-body-2 text-high-emphasis text-truncate" :title="product.name">
                    {{ product.name }}
                  </div>
                  <div class="text-caption text-medium-emphasis mt-0.5 d-flex align-center ga-2">
                    <span>SKU: <strong class="text-high-emphasis">{{ product.sku || 'Chưa có' }}</strong></span>
                    <span v-if="product.maxQuantity" class="text-warning">
                      (Tối đa: {{ product.maxQuantity }})
                    </span>
                  </div>
                </div>

                <div class="d-flex align-center ga-2 flex-shrink-0">
                  <!-- Stepper -->
                  <div class="quantity-stepper d-inline-flex align-center border rounded-lg overflow-hidden bg-white">
                    <button
                      type="button"
                      class="stepper-btn"
                      :disabled="product.quantity <= 1"
                      @click="changeQuantity(product, -1)"
                    >
                      <v-icon size="14">lucide-minus</v-icon>
                    </button>
                    <input
                      :value="product.quantity"
                      type="text"
                      class="stepper-input text-center font-weight-bold text-body-2"
                      aria-label="Số lượng sản phẩm"
                      @change="onQuantityInput(product, $event)"
                      @keyup.enter="onQuantityInput(product, $event)"
                    >
                    <button
                      type="button"
                      class="stepper-btn"
                      :disabled="!!(product.maxQuantity && product.quantity >= product.maxQuantity)"
                      @click="changeQuantity(product, 1)"
                    >
                      <v-icon size="14">lucide-plus</v-icon>
                    </button>
                  </div>

                  <!-- Remove Button -->
                  <v-btn
                    icon="lucide-trash-2"
                    size="small"
                    variant="text"
                    color="grey-darken-1"
                    density="comfortable"
                    aria-label="Xóa sản phẩm"
                    @click="removeProduct(product.id)"
                  ></v-btn>
                </div>
              </div>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-divider></v-divider>
      <!-- Dialog Actions Footer -->
      <v-card-actions class="pa-4 px-5 bg-surface flex-shrink-0">
        <span v-if="selectedProducts.length" class="text-caption text-medium-emphasis">
          Đã chọn <strong>{{ selectedProducts.length }}</strong> sản phẩm
        </span>
        <v-spacer></v-spacer>
        <v-btn variant="outlined" color="grey" class="text-none" @click="closeDialog">Hủy</v-btn>
        <v-btn color="primary" class="text-none px-5 font-weight-bold" :loading="saving" @click="submit">Tạo phiếu</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <ProductPickerDialog
    v-model="productPickerDialog"
    mode="purchase"
    @select="addProduct"
  />

  <v-snackbar v-model="snackbar.show" :color="snackbar.color" location="top right">
    {{ snackbar.text }}
  </v-snackbar>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ProductPickerDialog from '@/components/chat/ProductPickerDialog.vue';
import { useInventoryStore } from '@/stores/inventory';
import { parseQuantityInput } from '@/utils/math-evaluator';

interface Product {
  id: string;
  sku: string | null;
  name: string;
  imageUrl?: string | null;
  quantity: number;
  maxQuantity?: number;
}

const props = defineProps<{
  modelValue: boolean;
  initialProducts?: Product[];
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

const inventoryStore = useInventoryStore();
const dialog = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
});
const productPickerDialog = ref(false);
const selectedProducts = ref<Product[]>([]);
const saving = ref(false);
const form = ref({ type: 'INITIAL_STOCK', notes: '' });
const snackbar = ref({ show: false, text: '', color: 'success' });
const returnOrderSearch = ref('');
const returnOrders = ref<any[]>([]);
const returnOrderLoading = ref(false);
const selectedReturnOrderId = ref<string | null>(null);
const selectedReturnOrder = ref<any>(null);

const typeOptions = [
  { title: 'Tồn đầu kỳ', value: 'INITIAL_STOCK' },
  { title: 'Khách trả hàng', value: 'RETURN_IN' },
  { title: 'Điều chỉnh (+)', value: 'ADJUSTMENT_IN' },
  { title: 'Điều chỉnh (-)', value: 'ADJUSTMENT_OUT' },
  { title: 'Hư hỏng', value: 'DAMAGE' },
];

watch(() => props.modelValue, isOpen => {
  if (!isOpen) return;
  selectedProducts.value = (props.initialProducts || []).map(product => ({ ...product, quantity: 1 }));
  form.value = { type: 'INITIAL_STOCK', notes: '' };
  returnOrderSearch.value = '';
  returnOrders.value = [];
  selectedReturnOrderId.value = null;
  selectedReturnOrder.value = null;
});

function openProductPicker() {
  productPickerDialog.value = true;
}

function addProduct(product: any, quantity = 1) {
  const id = String(product.id ?? product.odoo_id ?? product.default_code);
  if (selectedProducts.value.some(selected => selected.id === id)) return;
  selectedProducts.value.push({
    id,
    sku: product.sku || product.default_code || null,
    name: product.name || product.display_name || 'Sản phẩm',
    imageUrl: product.image_url || product.imageUrl || null,
    quantity: Number.isFinite(Number(quantity)) ? Math.round(Number(quantity)) || 1 : 1,
  });
}

function changeQuantity(product: Product, amount: number) {
  const next = Math.round(Number(product.quantity) || 0) + amount;
  product.quantity = Math.max(1, next);
}

function onQuantityInput(product: Product, event: Event) {
  const target = event.target as HTMLInputElement;
  const evaluated = parseQuantityInput(target.value, product.quantity || 1);
  const validQty = Math.max(1, evaluated);
  product.quantity = validQty;
  target.value = String(validQty);
}

function removeProduct(id: string) {
  selectedProducts.value = selectedProducts.value.filter(product => product.id !== id);
}

function closeDialog() {
  if (!saving.value) dialog.value = false;
}

async function fetchReturnOrders(searchStr: string) {
  returnOrderLoading.value = true;
  try {
    const skus = selectedProducts.value.map(p => p.sku).filter(Boolean).join(',');
    const orders = await inventoryStore.searchReturnOrders(searchStr, skus);
    returnOrders.value = orders.map((order: any) => ({
      ...order,
      displayTitle: `${order.orderCode} - ${order.partnerName || 'Không có tên khách'}`,
    }));
  } catch (err: any) {
    // ignore
  } finally {
    returnOrderLoading.value = false;
  }
}

let searchTimeout: any;
function onReturnSearchInput(val: string) {
  if (val === null || val === undefined) return;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    fetchReturnOrders(val);
  }, 300);
}

function selectReturnOrder(orderId: string) {
  const order = returnOrders.value.find(item => item.id === orderId);
  if (!order) return;
  selectedReturnOrder.value = order;
  selectedReturnOrderId.value = order.id;
  form.value.notes = `${order.orderCode} khách trả hàng`;
  selectedProducts.value = order.lines
    .map((line: any) => {
      const delivered = Number(line.qtyDelivered || line.shippedQuantity || 0);
      const returned = Number(line.returnedQuantity || 0);
      const available = delivered - returned;
      if (!line.productSku || available <= 0) return null;
      return {
        id: line.id,
        sku: line.productSku,
        name: line.productName,
        imageUrl: line.imageUrl || null,
        quantity: available,
        maxQuantity: available,
      };
    })
    .filter(Boolean);
  if (!selectedProducts.value.length) showMessage('Đơn hàng không còn sản phẩm đủ điều kiện trả', 'warning');
}

function onTypeChanged(type: string) {
  if (type === 'RETURN_IN') {
    fetchReturnOrders('');
  } else {
    returnOrders.value = [];
    selectedReturnOrderId.value = null;
    selectedReturnOrder.value = null;
    returnOrderSearch.value = '';
  }
}

async function submit() {
  if (!selectedProducts.value.length) return showMessage('Vui lòng chọn ít nhất một sản phẩm', 'error');
  if (selectedProducts.value.some(product => !product.sku)) return showMessage('Sản phẩm được chọn phải có SKU', 'error');
  if (selectedProducts.value.some(product => product.quantity < 1)) {
    return showMessage('Số lượng tối thiểu của 1 dòng sản phẩm là 1', 'error');
  }
  if (form.value.type === 'RETURN_IN' && !selectedReturnOrder.value) {
    return showMessage('Vui lòng tìm và chọn đơn hàng trả hàng', 'error');
  }

  saving.value = true;
  try {
    if (form.value.type === 'RETURN_IN') {
      await inventoryStore.processReturn({
        orderId: selectedReturnOrder.value.id,
        lines: selectedProducts.value.map(product => ({ id: product.id, quantity: product.quantity })),
        reason: form.value.notes.trim() || undefined,
      });
      dialog.value = false;
      emit('saved');
      return;
    }

    const isDecrease = ['ADJUSTMENT_OUT', 'DAMAGE'].includes(form.value.type);
    for (const product of selectedProducts.value) {
      const rawQty = Number(product.quantity) || 0;
      const quantity = isDecrease ? (rawQty > 0 ? -rawQty : rawQty) : rawQty;
      await inventoryStore.createTransaction({
        sku: product.sku!,
        productName: product.name,
        type: form.value.type,
        quantity,
        notes: form.value.notes.trim() || undefined,
      });
    }
    dialog.value = false;
    emit('saved');
  } catch (err: any) {
    showMessage(err.response?.data?.error || 'Không thể tạo biến động kho', 'error');
  } finally {
    saving.value = false;
  }
}

function showMessage(text: string, color: string) {
  snackbar.value = { show: true, text, color };
}
</script>

<style scoped>
.transaction-card {
  height: 640px;
  max-height: calc(100vh - 40px);
}
.transaction-card-body {
  min-height: 0;
}
.form-pane {
  width: 350px;
}
@media (max-width: 768px) {
  .form-pane {
    width: 100%;
  }
}
.product-picker-btn {
  min-height: 44px;
}
.selected-products-list {
  min-height: 0;
}
.empty-products-box {
  min-height: 220px;
  background-color: rgba(var(--v-theme-surface-variant), 0.25);
}
.product-card {
  border-color: rgba(var(--v-border-color), 0.18) !important;
}
.product-image-box {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.product-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.quantity-stepper {
  height: 32px;
}
.stepper-btn {
  width: 32px;
  height: 30px;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.stepper-btn:hover:not(:disabled) {
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}
.stepper-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.stepper-input {
  width: 48px;
  height: 30px;
  border: 0;
  border-left: 1px solid rgba(var(--v-border-color), 0.15);
  border-right: 1px solid rgba(var(--v-border-color), 0.15);
  outline: none;
}
.stepper-input::-webkit-outer-spin-button,
.stepper-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.stepper-input {
  -moz-appearance: textfield;
}
</style>
