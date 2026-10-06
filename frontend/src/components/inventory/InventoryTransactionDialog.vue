<template>
  <v-dialog v-model="dialog" max-width="620">
    <v-card class="transaction-card d-flex flex-column">
      <v-card-title class="d-flex justify-space-between align-center pa-5">
        <span class="text-h6 font-weight-bold">Tạo biến động kho</span>
        <v-btn icon="lucide-x" variant="text" @click="closeDialog"></v-btn>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text class="transaction-card-body pa-5 d-flex flex-column">
        <div class="text-subtitle-2 mb-2">Sản phẩm cần biến động</div>
        <v-btn v-if="form.type !== 'RETURN_IN'" block variant="outlined" color="primary" prepend-icon="lucide-plus" class="product-picker-button mb-3" @click="openProductPicker">
          {{ selectedProducts.length ? 'Thêm sản phẩm' : 'Chọn sản phẩm' }}
        </v-btn>
        <div v-if="form.type === 'RETURN_IN'" class="return-order-picker mb-3">
          <v-text-field
            v-model="returnOrderSearch"
            label="Tìm đơn hàng theo mã"
            placeholder="Nhập mã đơn rồi bấm tìm"
            variant="outlined"
            density="comfortable"
            clearable
            hide-details
            prepend-inner-icon="lucide-search"
            append-inner-icon="lucide-search"
            :loading="returnOrderLoading"
            @keyup.enter="searchOrders"
            @click:append-inner="searchOrders"
          ></v-text-field>
          <v-select
            v-if="returnOrders.length"
            v-model="selectedReturnOrderId"
            class="mt-3"
            label="Chọn đơn hàng"
            :items="returnOrders"
            item-title="displayTitle"
            item-value="id"
            variant="outlined"
            hide-details
            @update:modelValue="selectReturnOrder"
          ></v-select>
          <div v-if="selectedReturnOrder" class="text-caption text-medium-emphasis mt-2">
            Đơn {{ selectedReturnOrder.orderCode }} - {{ selectedReturnOrder.partnerName || 'Không có tên khách' }}
          </div>
        </div>
        <div v-if="selectedProducts.length" class="selected-products mb-5 d-flex flex-column ga-3">
          <div v-for="product in selectedProducts" :key="product.id" class="product-card border rounded-xl pa-2">
            <div class="d-flex align-start ga-2">
              <div class="product-image-box rounded-lg border flex-shrink-0 overflow-hidden">
                <img v-if="product.imageUrl" :src="product.imageUrl" :alt="product.name" class="product-image">
                <v-icon v-else color="grey" size="24">lucide-image</v-icon>
              </div>
              <div class="flex-grow-1 overflow-hidden">
                <div class="font-weight-bold text-high-emphasis text-truncate">{{ product.name }}</div>
                <div class="text-caption text-medium-emphasis mt-1">
                  SKU: {{ product.sku || 'Chưa có SKU' }}
                </div>
              </div>
              <v-btn
                icon="lucide-trash-2"
                size="small"
                variant="text"
                color="error"
                aria-label="Xóa sản phẩm"
                @click="removeProduct(product.id)"
              ></v-btn>
            </div>
            <div class="product-calc-bar mt-1 pt-1 border-t d-flex justify-end">
              <div class="quantity-stepper d-inline-flex align-center border rounded-lg overflow-hidden">
                <button
                  type="button"
                  class="stepper-btn"
                  :disabled="product.quantity <= 1"
                  @click="changeQuantity(product, -1)"
                >
                  <v-icon size="14">lucide-minus</v-icon>
                </button>
                <input
                  v-model.number="product.quantity"
                  type="number"
                  min="1"
                  :max="product.maxQuantity || undefined"
                  class="stepper-input text-center font-weight-bold"
                  aria-label="Số lượng sản phẩm"
                  @change="normalizeQuantity(product)"
                >
                <button type="button" class="stepper-btn" :disabled="!!product.maxQuantity && product.quantity >= product.maxQuantity" @click="changeQuantity(product, 1)">
                  <v-icon size="14">lucide-plus</v-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
        <v-select
          v-model="form.type"
          :items="typeOptions"
          label="Loại biến động"
          variant="outlined"
          class="mb-5"
          @update:modelValue="onTypeChanged"
        ></v-select>
        <v-textarea
          v-model="form.notes"
          label="Ghi chú"
          variant="outlined"
          rows="3"
          auto-grow
        ></v-textarea>
      </v-card-text>
      <v-card-actions class="pa-5 pt-0">
        <span v-if="selectedProducts.length" class="text-caption text-grey">{{ selectedProducts.length }} sản phẩm</span>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="closeDialog">Hủy</v-btn>
        <v-btn color="primary" :loading="saving" @click="submit">Tạo phiếu</v-btn>
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
    quantity: Math.max(1, Number(quantity) || 1),
  });
}

function changeQuantity(product: Product, amount: number) {
  product.quantity = Math.max(1, product.quantity + amount);
}

function normalizeQuantity(product: Product) {
  const maxQuantity = product.maxQuantity || Number.MAX_SAFE_INTEGER;
  product.quantity = Math.min(maxQuantity, Math.max(1, Math.floor(Number(product.quantity) || 1)));
}

function removeProduct(id: string) {
  selectedProducts.value = selectedProducts.value.filter(product => product.id !== id);
}

function closeDialog() {
  if (!saving.value) dialog.value = false;
}

async function searchOrders() {
  const search = returnOrderSearch.value.trim();
  if (!search) return showMessage('Nhập mã đơn hàng để tìm kiếm', 'error');
  returnOrderLoading.value = true;
  try {
    const orders = await inventoryStore.searchReturnOrders(search);
    returnOrders.value = orders.map((order: any) => ({
      ...order,
      displayTitle: `${order.orderCode} - ${order.partnerName || 'Không có tên khách'}`,
    }));
    if (!returnOrders.value.length) showMessage('Không tìm thấy đơn hàng phù hợp', 'warning');
  } catch (err: any) {
    showMessage(err.response?.data?.error || 'Không thể tìm đơn hàng', 'error');
  } finally {
    returnOrderLoading.value = false;
  }
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
  if (type !== 'RETURN_IN') {
    returnOrders.value = [];
    selectedReturnOrderId.value = null;
    selectedReturnOrder.value = null;
    returnOrderSearch.value = '';
  }
}

async function submit() {
  if (!selectedProducts.value.length) return showMessage('Vui lòng chọn ít nhất một sản phẩm', 'error');
  if (selectedProducts.value.some(product => !product.sku)) return showMessage('Sản phẩm được chọn phải có SKU', 'error');
  if (form.value.type === 'RETURN_IN' && !selectedReturnOrder.value) {
    return showMessage('Vui lòng tìm và chọn đơn hàng trả hàng', 'error');
  }

  saving.value = true;
  try {
    if (form.value.type === 'RETURN_IN') {
      await inventoryStore.processReturn({
        orderId: selectedReturnOrder.value.id,
        lines: selectedProducts.value.map(product => ({ id: product.id, quantity: product.quantity })),
      });
      dialog.value = false;
      emit('saved');
      return;
    }

    const isDecrease = ['ADJUSTMENT_OUT', 'DAMAGE'].includes(form.value.type);
    for (const product of selectedProducts.value) {
      await inventoryStore.createTransaction({
        sku: product.sku,
        productName: product.name,
        type: form.value.type,
        quantity: isDecrease ? -product.quantity : product.quantity,
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
.transaction-card { height: 720px; max-height: calc(100vh - 32px); }
.transaction-card-body { min-height: 0; overflow: hidden; }
.product-picker-button { min-height: 56px; border-style: dashed; }
.selected-products { flex: 1 1 auto; min-height: 80px; overflow-y: auto; }
.product-card { border-color: rgba(var(--v-border-color), 0.22) !important; }
.product-image-box { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: rgb(var(--v-theme-surface)); }
.product-image { width: 100%; height: 100%; object-fit: cover; }
.border-t { border-top: 1px dashed rgba(var(--v-border-color), 0.3); }
.quantity-stepper { height: 30px; }
.stepper-btn { width: 30px; height: 28px; border: 0; background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.stepper-btn:hover:not(:disabled) { background: rgba(var(--v-theme-primary), 0.08); }
.stepper-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.stepper-input { width: 46px; height: 28px; border: 0; border-left: 1px solid rgba(var(--v-border-color), 0.2); border-right: 1px solid rgba(var(--v-border-color), 0.2); outline: none; }
.stepper-input::-webkit-outer-spin-button,
.stepper-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.stepper-input {
  -moz-appearance: textfield;
}
</style>
