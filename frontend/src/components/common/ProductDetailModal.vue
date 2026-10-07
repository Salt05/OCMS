<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="(val) => $emit('update:modelValue', val)"
    max-width="960"
    scrollable
    transition="dialog-bottom-transition"
  >
    <v-card v-if="product" class="rounded-xl overflow-hidden elevation-8 bg-surface d-flex flex-column" style="max-height: 85vh; min-height: 600px;">
      <!-- Loading bar for catalog details -->
      <v-progress-linear v-if="loadingDetails" indeterminate color="primary" height="2" class="flex-shrink-0" />

      <!-- Detail Header -->
      <v-card-title class="pa-4 border-b bg-surface-variant d-flex align-center justify-space-between flex-shrink-0">
        <div class="d-flex align-center gap-2 overflow-hidden mr-2">
          <span class="sku-badge flex-shrink-0">{{ pSku }}</span>
          <span class="text-subtitle-1 font-weight-bold text-high-emphasis text-truncate" style="max-width: 380px;">
            {{ pName }}
          </span>
        </div>
        <div class="d-flex align-center">
          <v-btn
            icon
            size="36"
            variant="text"
            rounded="lg"
            aria-label="Đóng chi tiết"
            @click="$emit('update:modelValue', false)"
          >
            <v-icon size="18">lucide-x</v-icon>
          </v-btn>
        </div>
      </v-card-title>

      <!-- Tabs (Thẻ) -->
      <v-tabs v-model="detailTab" color="primary" class="border-b bg-surface-variant flex-shrink-0" density="compact">
        <v-tab value="info" class="text-body-2 text-none font-weight-medium px-4">
          <v-icon size="16" class="mr-2">lucide-info</v-icon> Chi tiết
        </v-tab>
        <v-tab value="orders" class="text-body-2 text-none font-weight-medium px-4" v-if="showInventoryHistory">
          <v-icon size="16" class="mr-2">lucide-package</v-icon> Kho
        </v-tab>
        <v-tab value="history" class="text-body-2 text-none font-weight-medium px-4" v-if="showInventoryHistory">
          <v-icon size="16" class="mr-2">lucide-history</v-icon> Lịch sử
        </v-tab>
      </v-tabs>

      <!-- Detail Body -->
      <v-card-text class="pa-0 d-flex flex-column overflow-hidden flex-grow-1">
        <v-window v-model="detailTab" class="flex-grow-1 h-100" style="overflow-y: auto;">
          <!-- TAB: INFO -->
          <v-window-item value="info" class="pa-4 h-100">
            <!-- Top section: Image & Key info (Always inline with flex-nowrap) -->
            <div class="d-flex gap-4 mb-4 align-start flex-nowrap">
              <div class="detail-img-box rounded-xl border bg-surface flex-shrink-0 overflow-hidden" style="width: 130px; height: 130px; min-width: 130px;">
                <img
                  v-if="pImg"
                  :src="pImg"
                  :alt="pName"
                  class="w-100 h-100"
                  style="object-fit: contain; background-color: #fafafa;"
                  @error="() => { imageError = true; }"
                />
                <div v-else class="w-100 h-100 d-flex align-center justify-center text-medium-emphasis">
                  <v-icon size="40" class="opacity-50">lucide-image</v-icon>
                </div>
              </div>

              <div class="flex-grow-1 min-width-0 d-flex flex-column justify-start">
                <div>
                  <div class="text-subtitle-1 font-weight-bold text-high-emphasis text-truncate mb-1.5" :title="pName">
                    {{ pName }}
                  </div>

                  <!-- Tag List with +n Collapsing -->
                  <div class="d-flex align-center gap-1.5 flex-wrap text-caption text-medium-emphasis mb-2">
                    <!-- Visible tags -->
                    <v-chip
                      v-for="tag in visibleProductTags"
                      :key="tag.id"
                      size="x-small"
                      :color="tag.color"
                      :variant="tag.variant"
                      class="font-weight-medium"
                    >
                      {{ tag.label }}
                    </v-chip>

                    <!-- +n Tooltip Chip for remaining tags -->
                    <v-tooltip
                      v-if="hiddenProductTags.length > 0"
                      location="top"
                      open-delay="80"
                      location-strategy="connected"
                    >
                      <template #activator="{ props: tipProps }">
                        <v-chip
                          v-bind="tipProps"
                          size="x-small"
                          color="primary"
                          variant="tonal"
                          class="font-weight-bold cursor-pointer"
                        >
                          +{{ hiddenProductTags.length }}
                        </v-chip>
                      </template>

                      <div class="pa-1">
                        <div class="text-caption font-weight-bold mb-1 opacity-90">Thông tin khác:</div>
                        <div class="d-flex flex-wrap gap-1" style="max-width: 260px;">
                          <v-chip
                            v-for="tag in hiddenProductTags"
                            :key="tag.id"
                            size="x-small"
                            :color="tag.color || 'primary'"
                            :variant="tag.variant || 'tonal'"
                          >
                            {{ tag.label }}
                          </v-chip>
                        </div>
                      </div>
                    </v-tooltip>
                  </div>
                  
                  <!-- Stock Quick Info -->
                  <div v-if="showInventoryHistory" class="d-flex align-center gap-2 flex-wrap mt-1 text-caption text-medium-emphasis">
                    <div class="bg-grey-lighten-4 pa-1 px-2.5 rounded d-flex align-center gap-1.5">
                      <v-icon size="14" :color="currentOnHand < 0 ? 'error' : 'success'">lucide-package-check</v-icon> 
                      <span>Tồn thực tế: <strong :class="currentOnHand < 0 ? 'text-error font-weight-bold' : 'text-success font-weight-bold'">{{ formattedOnHand }}</strong></span>
                    </div>
                    <div class="bg-grey-lighten-4 pa-1 px-2.5 rounded d-flex align-center gap-1.5">
                      <v-icon size="14" color="info">lucide-shopping-cart</v-icon>
                      <span>Đã bán: <strong class="text-info font-weight-bold">{{ currentSold }}</strong></span>
                    </div>
                  </div>
                </div>

                <!-- Price highlights -->
                <div class="pa-2.5 rounded-lg border detail-price-box mt-2.5">
                  <div class="text-caption font-weight-medium text-medium-emphasis">Giá sỉ / Giá bán:</div>
                  <div class="text-h6 font-weight-bold text-success leading-tight">
                    {{ formatCurrency(pPrice) }}
                  </div>
                  <div v-if="pRetailPrice" class="text-caption text-medium-emphasis mt-0.5">
                    Giá bán lẻ niêm yết: {{ formatCurrency(pRetailPrice) }}
                  </div>
                </div>
              </div>
            </div>

            <slot name="edit-fields"></slot>

            <v-divider class="my-3"></v-divider>

            <!-- Rich Details (Specifications, Ingredients, Nutrition, Target, Preservation, Description) -->
            <div class="d-flex flex-column gap-3.5 text-body-2 pb-4">
              <div v-if="currentProduct.specification" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
                <div class="text-subtitle-2 font-weight-bold text-primary mb-1.5">Quy cách đóng gói</div>
                <div class="text-high-emphasis">{{ currentProduct.specification }}</div>
              </div>

              <div v-if="currentProduct.ingredients" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
                <div class="text-subtitle-2 font-weight-bold text-warning-darken-2 mb-1.5">Thành phần</div>
                <div class="text-high-emphasis">{{ currentProduct.ingredients }}</div>
              </div>

              <div v-if="currentProduct.nutritional_info || currentProduct.nutritionalInfo" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
                <div class="text-subtitle-2 font-weight-bold text-success mb-1.5">Thông tin dinh dưỡng</div>
                <div class="text-high-emphasis white-space-pre-line">{{ currentProduct.nutritional_info || currentProduct.nutritionalInfo }}</div>
              </div>

              <div v-if="currentProduct.target" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
                <div class="text-subtitle-2 font-weight-bold text-info mb-1.5">Đối tượng sử dụng</div>
                <div class="text-high-emphasis">{{ currentProduct.target }}</div>
              </div>

              <div v-if="currentProduct.preservation" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
                <div class="text-subtitle-2 font-weight-bold text-teal mb-1.5">Bảo quản</div>
                <div class="text-high-emphasis">{{ currentProduct.preservation }}</div>
              </div>

              <div v-if="currentProduct.description" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
                <div class="text-subtitle-2 font-weight-bold text-purple mb-1.5">Mô tả chi tiết</div>
                <div class="text-high-emphasis white-space-pre-line text-caption">{{ currentProduct.description }}</div>
              </div>

              <div v-if="!hasRichDetails && !loadingDetails" class="detail-item border border-dashed rounded-lg pa-6 text-center text-medium-emphasis">
                <v-icon size="28" class="opacity-40 mb-2">lucide-info</v-icon>
                <div class="text-body-2">Chưa có thông tin mô tả chi tiết cho sản phẩm này.</div>
              </div>
            </div>
          </v-window-item>

          <!-- TAB: ORDERS (KHO) -->
          <v-window-item value="orders" class="pa-0 h-100">
             <div class="pa-3 d-flex flex-wrap gap-3 align-center border-b bg-grey-lighten-4">
               <v-select
                 v-model="orderOperatorFilter"
                 :items="orderOperators"
                 label="Người thao tác"
                 variant="outlined"
                 density="compact"
                 hide-details
                 clearable
                 style="max-width: 200px;"
                 class="bg-white"
               ></v-select>
               <v-select
                 v-model="orderTypeFilter"
                 :items="orderTypes"
                 item-title="title"
                 item-value="value"
                 label="Loại giao dịch"
                 variant="outlined"
                 density="compact"
                 hide-details
                 clearable
                 style="max-width: 180px;"
                 class="bg-white"
               ></v-select>
               <v-text-field
                 v-model="orderSearch"
                 placeholder="Tìm tên, mã đơn..."
                 variant="outlined"
                 density="compact"
                 hide-details
                 clearable
                 prepend-inner-icon="lucide-search"
                 style="min-width: 200px; max-width: 300px;"
                 class="flex-grow-1 bg-white"
               ></v-text-field>
               <v-btn size="small" variant="tonal" prepend-icon="lucide-rotate-cw" class="ml-auto" @click="loadOrders" :loading="inventoryStore.skuLoading[`orders_${pSku}`]">Tải lại</v-btn>
             </div>
             
             <v-table hover density="compact" class="text-body-2">
               <thead>
                 <tr>
                   <th class="font-weight-bold">Thời gian</th>
                   <th class="font-weight-bold">Người thao tác</th>
                   <th class="font-weight-bold">Loại giao dịch</th>
                   <th class="font-weight-bold">Mã tham chiếu</th>
                   <th class="text-right font-weight-bold">Số lượng</th>
                   <th class="font-weight-bold">Lý do/Ghi chú</th>
                 </tr>
               </thead>
               <tbody>
                 <tr v-if="inventoryStore.skuLoading[`orders_${pSku}`]">
                   <td colspan="6" class="text-center pa-4">
                     <v-progress-circular indeterminate color="primary" size="24"></v-progress-circular>
                   </td>
                 </tr>
                 <tr v-else-if="!filteredOrders || filteredOrders.length === 0">
                   <td colspan="6" class="text-center pa-8 text-medium-emphasis">Không có đơn hàng nào khớp điều kiện</td>
                 </tr>
                 <tr
                   v-else
                   v-for="order in filteredOrders"
                   :key="order.id"
                   class="cursor-pointer hover-row"
                   @click="openOrderDetail(order.orderCode, order.type)"
                 >
                   <td class="text-caption">{{ new Date(order.dateOrder).toLocaleDateString('vi-VN') }}</td>
                   <td class="text-caption">{{ order.partnerName }}</td>
                   <td>
                     <v-chip size="x-small" :color="getTxColor(order.type)" variant="flat">
                       {{ getTxName(order.type) }}
                     </v-chip>
                   </td>
                   <td>
                     <span class="text-primary font-weight-bold text-decoration-underline d-inline-flex align-center" style="gap: 4px;">
                       {{ order.orderCode }}
                       <v-icon size="12">lucide-external-link</v-icon>
                     </span>
                   </td>
                   <td class="text-right font-weight-bold">
                     <span :class="['IMPORT', 'ADJUSTMENT_IN', 'RETURN_IN'].includes(order.type) ? 'text-success' : 'text-primary'">
                       {{ ['IMPORT', 'ADJUSTMENT_IN', 'RETURN_IN'].includes(order.type) ? '+' : '-' }}{{ order.quantity }}
                     </span>
                   </td>
                   <td class="text-caption">
                     {{ order.note || '' }}
                   </td>
                 </tr>
               </tbody>
             </v-table>
          </v-window-item>

          <!-- TAB: HISTORY -->
          <v-window-item value="history" class="pa-0 h-100">
             <div class="pa-4 d-flex justify-space-between align-center border-b bg-grey-lighten-4">
               <div class="d-flex align-center gap-2">
                 <div>
                   <span class="font-weight-bold mr-1">Thực tế:</span>
                   <v-chip :color="currentOnHand < 0 ? 'error' : 'info'" size="small" class="font-weight-bold">{{ formattedOnHand }}</v-chip>
                 </div>
                 <div>
                   <span class="font-weight-bold mx-1">Giữ:</span>
                   <v-chip color="warning" size="small" class="font-weight-bold">{{ currentReserved }}</v-chip>
                 </div>
                 <div>
                   <span class="font-weight-bold mx-1">Khả dụng:</span>
                   <v-chip :color="currentAvailable < 0 ? 'error' : 'success'" size="small" class="font-weight-bold">{{ formattedAvailable }} {{ pUom || 'Cái' }}</v-chip>
                 </div>
               </div>
               <div>
                 <v-btn size="small" variant="tonal" prepend-icon="lucide-rotate-cw" @click="loadHistory" :loading="inventoryStore.skuLoading[`tx_${pSku}`]">Tải lại</v-btn>
               </div>
             </div>
             
             <v-table hover density="compact" class="text-body-2">
               <thead>
                 <tr>
                   <th class="font-weight-bold">Thời gian</th>
                   <th class="font-weight-bold">Người thao tác</th>
                   <th class="font-weight-bold">Loại giao dịch</th>
                   <th class="font-weight-bold">Mã tham chiếu</th>
                   <th class="text-right font-weight-bold">Số lượng</th>
                   <th class="font-weight-bold">Lý do/Ghi chú</th>
                 </tr>
               </thead>
               <tbody>
                 <tr v-if="inventoryStore.skuLoading[`tx_${pSku}`]">
                   <td colspan="6" class="text-center pa-4">
                     <v-progress-circular indeterminate color="primary" size="24"></v-progress-circular>
                   </td>
                 </tr>
                 <tr v-else-if="!inventoryStore.skuTransactions[pSku] || inventoryStore.skuTransactions[pSku].length === 0">
                   <td colspan="6" class="text-center pa-8 text-medium-emphasis">Không có lịch sử xuất/nhập nào</td>
                 </tr>
                 <tr
                   v-else
                   v-for="tx in sortedSkuTransactions"
                   :key="tx.id"
                   :class="{ 'cursor-pointer hover-row': !!tx.referenceCode }"
                   @click="tx.referenceCode && openOrderDetail(tx.referenceCode, tx.type)"
                 >
                   <td class="text-caption">{{ new Date(tx.displayTime || tx.performedAt).toLocaleString('vi-VN') }}</td>
                   <td class="text-caption">{{ tx.operatorName || 'Hệ thống' }}</td>
                   <td>
                     <v-chip size="x-small" :color="getTxColor(tx.type)" variant="flat">{{ getTxName(tx.type) }}</v-chip>
                     <v-chip v-if="tx.channel" size="x-small" variant="outlined" class="ml-1">{{ tx.channel }}</v-chip>
                   </td>
                   <td>
                     <span
                       v-if="tx.referenceCode"
                       class="text-primary font-weight-bold text-decoration-underline d-inline-flex align-center"
                       style="gap: 4px;"
                       title="Bấm để xem chi tiết đơn hàng"
                     >
                       {{ tx.referenceCode }}
                       <v-icon size="12">lucide-external-link</v-icon>
                     </span>
                     <span v-else class="text-medium-emphasis">---</span>
                   </td>
                   <td class="text-right font-weight-bold" :class="tx.quantity > 0 ? 'text-success' : 'text-error'">
                     {{ tx.quantity > 0 ? '+' : '' }}{{ tx.quantity }}
                   </td>
                   <td class="text-caption text-truncate" style="max-width: 150px;">{{ tx.reason || tx.notes || '' }}</td>
                 </tr>
               </tbody>
             </v-table>
          </v-window-item>
        </v-window>
      </v-card-text>

      <!-- Detail Actions -->
      <slot name="actions">
        <v-card-actions class="pa-3.5 border-t bg-surface-variant d-flex justify-space-between flex-shrink-0">
          <v-btn variant="text" rounded="lg" @click="$emit('update:modelValue', false)">Đóng</v-btn>
          <v-btn
            v-if="showAddButton"
            color="primary"
            variant="flat"
            rounded="lg"
            class="font-weight-bold px-4"
            prepend-icon="lucide-plus"
            @click="$emit('add', currentProduct)"
          >
            {{ addText }}
          </v-btn>
        </v-card-actions>
      </slot>
    </v-card>
  </v-dialog>

  <!-- Modal xem chi tiết đơn hàng -->
  <OrderDetailModal
    v-model="showOrderDetail"
    :order="selectedOrder"
    :loading="orderLoading"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useInventoryStore } from '@/stores/inventory';
import { api } from '@/api/index';
import OrderDetailModal from '@/components/orders/OrderDetailModal.vue';

const inventoryStore = useInventoryStore();
const router = useRouter();

const props = defineProps<{
  modelValue: boolean;
  product: any;
  showAddButton?: boolean;
  addText?: string;
  showInventoryHistory?: boolean;
  defaultTab?: 'info' | 'history';
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'add': [product: any];
}>();

const imageError = ref(false);
const detailTab = ref('info');
const fetchedProduct = ref<any>(null);
const loadingDetails = ref(false);

const orderSearch = ref('');
const orderTypeFilter = ref<string | null>(null);
const orderOperatorFilter = ref<string | null>(null);

const filteredOrders = computed(() => {
  if (!pSku.value || !inventoryStore.skuOrders[pSku.value]) return [];
  let items = inventoryStore.skuOrders[pSku.value];
  if (orderTypeFilter.value) {
    items = items.filter(i => i.type === orderTypeFilter.value);
  }
  if (orderOperatorFilter.value) {
    items = items.filter(i => i.partnerName === orderOperatorFilter.value);
  }
  if (orderSearch.value) {
    const s = orderSearch.value.toLowerCase();
    items = items.filter(i => (i.partnerName || '').toLowerCase().includes(s) || (i.orderCode || '').toLowerCase().includes(s));
  }
  return items;
});

const orderTypes = computed(() => {
  if (!pSku.value || !inventoryStore.skuOrders[pSku.value]) return [];
  const types = new Set(inventoryStore.skuOrders[pSku.value].map(i => i.type));
  return Array.from(types).map(t => ({ value: t, title: getTxName(t) }));
});

const orderOperators = computed(() => {
  if (!pSku.value || !inventoryStore.skuOrders[pSku.value]) return [];
  const ops = new Set(inventoryStore.skuOrders[pSku.value].map(i => i.partnerName).filter(Boolean));
  return Array.from(ops);
});

// Combined product from props and fetched catalog details
const currentProduct = computed(() => {
  return {
    ...(props.product || {}),
    ...(fetchedProduct.value || {}),
  };
});

const pName = computed(() => currentProduct.value?.name || currentProduct.value?.productName || currentProduct.value?.displayName || '');
const pSku = computed(() => currentProduct.value?.sku || currentProduct.value?.default_code || '');

const isValidOdooId = computed(() => {
  const p = currentProduct.value;
  if (!p) return false;
  const raw = p.odooId || p.odoo_id || p.odooProductId;
  if (raw !== undefined && raw !== null && raw !== '' && !isNaN(Number(raw)) && Number(raw) > 0) {
    return true;
  }
  if (typeof p.id === 'number' && p.id > 0) return true;
  return false;
});

const pOdooId = computed(() => {
  const p = currentProduct.value;
  if (!p) return null;
  const raw = p.odooId || p.odoo_id || p.odooProductId;
  if (raw !== undefined && raw !== null && raw !== '' && !isNaN(Number(raw)) && Number(raw) > 0) {
    return Number(raw);
  }
  if (typeof p.id === 'number' && p.id > 0) return p.id;
  return null;
});

const pImg = computed(() => {
  if (imageError.value) return null;
  return currentProduct.value?.imageUrl || currentProduct.value?.image_url || null;
});

const pPrice = computed(() => {
  const p = currentProduct.value;
  if (!p) return 0;
  return Number(p.wholesalePrice || p.wholesale_price || p.listPrice || p.list_price || 0);
});
const pRetailPrice = computed(() => {
  const p = currentProduct.value;
  if (!p) return 0;
  return Number(p.retailPrice || p.retail_price || 0);
});
const pUom = computed(() => currentProduct.value?.uomName || currentProduct.value?.uom_name || currentProduct.value?.unit || null);

interface ProductTag {
  id: string;
  label: string;
  color?: string;
  variant: 'tonal' | 'outlined' | 'flat';
}

const allProductTags = computed<ProductTag[]>(() => {
  const tags: ProductTag[] = [];
  const p = currentProduct.value;
  if (!p) return tags;

  if (isValidOdooId.value && pOdooId.value) {
    tags.push({
      id: 'odoo-id',
      label: `Odoo ID: ${pOdooId.value}`,
      color: 'primary',
      variant: 'tonal'
    });
  }

  if (p.source) {
    tags.push({
      id: 'source',
      label: p.source === 'odoo' ? 'Nguồn: Odoo ERP' : 'Nguồn: Directus',
      color: p.source === 'odoo' ? 'teal' : 'indigo',
      variant: 'tonal'
    });
  }

  if (p.product_group_name) {
    tags.push({
      id: 'group',
      label: p.product_group_name,
      color: 'secondary',
      variant: 'tonal'
    });
  }

  if (p.category && p.category !== p.product_group_name) {
    tags.push({
      id: 'category',
      label: p.category,
      color: 'secondary',
      variant: 'tonal'
    });
  }

  if (p.brand) {
    tags.push({
      id: 'brand',
      label: p.brand,
      color: 'info',
      variant: 'tonal'
    });
  }

  if (p.weight) {
    tags.push({
      id: 'weight',
      label: String(p.weight),
      variant: 'outlined'
    });
  }

  if (pUom.value) {
    tags.push({
      id: 'uom',
      label: `ĐVT: ${pUom.value}`,
      variant: 'outlined'
    });
  }

  return tags;
});

const MAX_VISIBLE_TAGS = 3;
const visibleProductTags = computed(() => allProductTags.value.slice(0, MAX_VISIBLE_TAGS));
const hiddenProductTags = computed(() => allProductTags.value.slice(MAX_VISIBLE_TAGS));

const currentOnHand = computed(() => {
  const sku = pSku.value;
  if (sku && inventoryStore.skuStock[sku]?.onHand !== undefined) {
    return inventoryStore.skuStock[sku].onHand;
  }
  return currentProduct.value?.onHand ?? 0;
});

const currentReserved = computed(() => {
  const sku = pSku.value;
  if (sku && inventoryStore.skuStock[sku]?.reserved !== undefined) {
    return inventoryStore.skuStock[sku].reserved;
  }
  return currentProduct.value?.reserved ?? 0;
});

const currentAvailable = computed(() => {
  const sku = pSku.value;
  if (sku && inventoryStore.skuStock[sku]?.available !== undefined) {
    return inventoryStore.skuStock[sku].available;
  }
  return currentProduct.value?.available ?? (currentOnHand.value - currentReserved.value);
});

const currentSold = computed(() => {
  const sku = pSku.value;
  if (sku && inventoryStore.skuStock[sku]?.soldQuantity !== undefined) {
    return inventoryStore.skuStock[sku].soldQuantity;
  }
  return currentProduct.value?.soldQuantity ?? 0;
});

const formattedOnHand = computed(() => {
  const val = currentOnHand.value;
  return val < 0 ? `Thiếu ${Math.abs(val)}` : val.toString();
});

const formattedAvailable = computed(() => {
  const val = currentAvailable.value;
  return val < 0 ? `Thiếu ${Math.abs(val)}` : val.toString();
});

const hasRichDetails = computed(() => {
  const p = currentProduct.value;
  if (!p) return false;
  return !!(
    p.specification ||
    p.ingredients ||
    p.nutritional_info ||
    p.nutritionalInfo ||
    p.target ||
    p.preservation ||
    p.description ||
    p.weight ||
    p.brand
  );
});

// History & Order Detail Modal
const showOrderDetail = ref(false);
const selectedOrder = ref<any>(null);
const orderLoading = ref(false);

const sortedSkuTransactions = computed(() => {
  const list = inventoryStore.skuTransactions[pSku.value] || [];
  return [...list].sort((a, b) => {
    const timeA = new Date(a.displayTime || a.performedAt).getTime();
    const timeB = new Date(b.displayTime || b.performedAt).getTime();
    return timeB - timeA;
  });
});

async function openOrderDetail(orderCode?: string, type?: string) {
  if (!orderCode) return;

  if (type === 'IMPORT' || orderCode.startsWith('PO')) {
    emit('update:modelValue', false);
    router.push({ name: 'PurchaseOrders', query: { open: orderCode } });
    return;
  }

  if (type === 'ADJUSTMENT_IN' || type === 'ADJUSTMENT_OUT' || orderCode.startsWith('KK')) {
    return;
  }

  orderLoading.value = true;
  showOrderDetail.value = true;
  try {
    const res = await api.get(`/orders/${encodeURIComponent(orderCode)}`);
    if (res.data?.order) {
      selectedOrder.value = res.data.order;
    }
  } catch (err) {
    console.error('Lỗi khi tải chi tiết đơn hàng:', err);
  } finally {
    orderLoading.value = false;
  }
}

function formatCurrency(val: number) {
  if (!val) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
}

function getTxColor(type: string) {
  switch (type) {
    case 'IMPORT':
    case 'RETURN_IN':
    case 'ADJUSTMENT_IN': return 'success';
    case 'SALE':
    case 'DAMAGE':
    case 'ADJUSTMENT_OUT': return 'error';
    case 'INITIAL_STOCK': return 'info';
    case 'RESERVE': return 'warning';
    default: return 'grey';
  }
}

function getTxName(type: string) {
  switch (type) {
    case 'SALE': return 'Bán hàng';
    case 'IMPORT': return 'Nhập kho';
    case 'INITIAL_STOCK': return 'Tồn đầu kỳ';
    case 'RETURN_IN': return 'Khách trả hàng';
    case 'ADJUSTMENT_IN': return 'Điều chỉnh (+)';
    case 'ADJUSTMENT_OUT': return 'Điều chỉnh (-)';
    case 'DAMAGE': return 'Hư hỏng';
    case 'RESERVE': return 'Báo giá';
    default: return type;
  }
}

async function loadHistory() {
  if (!pSku.value) return;
  await inventoryStore.fetchStockBySku(pSku.value);
  await inventoryStore.fetchTransactionsBySku(pSku.value, { limit: 100 });
}

async function loadOrders() {
  if (!pSku.value) return;
  await inventoryStore.fetchSkuOrders(pSku.value);
}

async function fetchFullProductDetails(sku: string) {
  if (!sku) return;
  loadingDetails.value = true;
  try {
    const res = await api.get(`/products/by-sku/${encodeURIComponent(sku)}`);
    if (res.data?.success && res.data?.product) {
      fetchedProduct.value = res.data.product;
    }
  } catch (err) {
    console.warn('[ProductDetailModal] Could not fetch enriched product by sku:', err);
  } finally {
    loadingDetails.value = false;
  }
}

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    imageError.value = false;
    detailTab.value = props.defaultTab || 'info';
    fetchedProduct.value = null;
    const sku = props.product?.sku || props.product?.default_code;
    if (sku) {
      fetchFullProductDetails(sku);
    }
    if (props.showInventoryHistory && sku) {
      loadHistory();
      loadOrders();
    }
  }
}, { immediate: true });

watch(() => props.product, (newProd) => {
  if (props.modelValue && newProd) {
    imageError.value = false;
    const sku = newProd?.sku || newProd?.default_code;
    if (sku && (!fetchedProduct.value || (fetchedProduct.value.sku !== sku && fetchedProduct.value.default_code !== sku))) {
      fetchedProduct.value = null;
      fetchFullProductDetails(sku);
      if (props.showInventoryHistory) {
        loadHistory();
        loadOrders();
      }
    }
  }
});
</script>

<style scoped>
.sku-badge {
  background-color: rgb(var(--v-theme-surface-light));
  color: rgb(var(--v-theme-on-surface));
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.8rem;
  letter-spacing: 0.5px;
  border: 1px solid rgba(var(--v-border-color), 0.12);
}
.detail-price-box {
  background: linear-gradient(145deg, rgba(var(--v-theme-success), 0.05) 0%, rgba(var(--v-theme-success), 0.01) 100%);
  border-color: rgba(var(--v-theme-success), 0.2) !important;
}
.shadow-xs {
  box-shadow: 0 1px 3px rgba(0,0,0,0.05) !important;
}
.white-space-pre-line {
  white-space: pre-line;
}
.min-width-0 {
  min-width: 0 !important;
}
.cursor-pointer {
  cursor: pointer;
}
.leading-tight {
  line-height: 1.25;
}
</style>
