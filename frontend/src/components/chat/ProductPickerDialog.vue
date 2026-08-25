<template>
  <v-dialog
    :model-value="modelValue"
    max-width="1000"
    scrollable
    transition="dialog-bottom-transition"
    @update:model-value="(val) => $emit('update:modelValue', val)"
  >
    <v-card class="product-picker-dialog rounded-xl elevation-6 overflow-hidden bg-surface d-flex flex-column">
      <!-- Dialog Header -->
      <v-card-title class="pa-4 border-b bg-surface d-flex align-center justify-space-between flex-shrink-0">
        <div class="d-flex align-center gap-2.5 overflow-hidden mr-2">
          <v-avatar size="38" color="primary" variant="tonal" class="rounded-lg flex-shrink-0">
            <v-icon size="22" color="primary">lucide-package-search</v-icon>
          </v-avatar>
          <div class="overflow-hidden">
            <div class="text-subtitle-1 font-weight-bold text-high-emphasis text-truncate leading-tight">
              Chọn sản phẩm từ Directus
            </div>
            <div class="text-caption text-medium-emphasis text-truncate">
              Danh mục sản phẩm & giá sỉ đại lý
            </div>
          </div>
        </div>

        <div class="d-flex align-center gap-2 flex-shrink-0">
          <v-chip size="small" color="primary" variant="tonal" class="font-weight-medium">
            {{ filteredList.length }} / {{ products.length }} sản phẩm
          </v-chip>
          <v-tooltip text="Đồng bộ / Làm mới dữ liệu cache" location="bottom">
            <template #activator="{ props: tipProps }">
              <v-btn
                v-bind="tipProps"
                icon
                size="36"
                variant="text"
                rounded="lg"
                aria-label="Đồng bộ dữ liệu sản phẩm"
                :loading="isSyncing || loadingProducts"
                @click="syncProducts"
              >
                <v-icon size="16">lucide-refresh-cw</v-icon>
              </v-btn>
            </template>
          </v-tooltip>
          <v-btn
            icon
            size="36"
            variant="text"
            rounded="lg"
            aria-label="Đóng cửa sổ chọn sản phẩm"
            @click="$emit('update:modelValue', false)"
          >
            <v-icon size="18">lucide-x</v-icon>
          </v-btn>
        </div>
      </v-card-title>

      <!-- Dialog Body: Two Column Layout -->
      <div class="d-flex flex-grow-1 overflow-hidden picker-layout-body">
        <!-- Left Sidebar: Search Bar + Product Groups -->
        <div class="picker-sidebar border-e d-flex flex-column flex-shrink-0 bg-surface-variant">
          <!-- Search Input moved to top of left panel -->
          <div class="pa-3 border-b flex-shrink-0">
            <v-text-field
              v-model="searchQuery"
              placeholder="Tìm kiếm sản phẩm, SKU..."
              variant="outlined"
              density="compact"
              hide-details
              clearable
              bg-color="surface"
              class="search-input-field rounded-lg shadow-xs"
              prepend-inner-icon="lucide-search"
              autofocus
            />
          </div>

          <!-- Product Groups Navigation Header -->
          <div class="px-3 pt-3 pb-1 d-flex align-center justify-space-between flex-shrink-0">
            <span class="text-caption font-weight-bold text-uppercase tracking-wider text-medium-emphasis">
              Nhóm sản phẩm
            </span>
            <v-chip size="x-small" variant="text" class="px-1 text-medium-emphasis">
              {{ productGroups.length }} nhóm
            </v-chip>
          </div>

          <!-- Group Items Scrollable List -->
          <div class="picker-groups-list px-2 pb-3 overflow-y-auto flex-grow-1 d-flex flex-column gap-1">
            <!-- All Products Option -->
            <div
              class="group-nav-item rounded-lg px-3 py-2 d-flex align-center justify-space-between cursor-pointer"
              :class="{ 'group-nav-item-active': selectedGroupId === null }"
              @click="selectedGroupId = null"
            >
              <div class="d-flex align-center gap-2 overflow-hidden mr-1">
                <v-icon size="16" :color="selectedGroupId === null ? 'primary' : 'medium-emphasis'">
                  lucide-layout-grid
                </v-icon>
                <span class="text-body-2 font-weight-medium text-truncate">Tất cả sản phẩm</span>
              </div>
              <v-chip
                size="x-small"
                :color="selectedGroupId === null ? 'primary' : undefined"
                :variant="selectedGroupId === null ? 'flat' : 'tonal'"
                class="font-weight-bold flex-shrink-0"
              >
                {{ products.length }}
              </v-chip>
            </div>

            <!-- Dynamic Product Groups from Directus -->
            <div
              v-for="grp in productGroups"
              :key="grp.id"
              class="group-nav-item rounded-lg px-3 py-2 d-flex align-center justify-space-between cursor-pointer"
              :class="{ 'group-nav-item-active': selectedGroupId === grp.id }"
              @click="selectedGroupId = grp.id"
            >
              <div class="d-flex align-center gap-2 overflow-hidden mr-1">
                <v-icon size="16" :color="selectedGroupId === grp.id ? 'primary' : 'medium-emphasis'">
                  lucide-layers
                </v-icon>
                <span class="text-body-2 font-weight-medium text-truncate" :title="grp.name">
                  {{ grp.name }}
                </span>
              </div>
              <v-chip
                size="x-small"
                :color="selectedGroupId === grp.id ? 'primary' : undefined"
                :variant="selectedGroupId === grp.id ? 'flat' : 'tonal'"
                class="font-weight-bold flex-shrink-0"
              >
                {{ grp.count }}
              </v-chip>
            </div>
          </div>
        </div>

        <!-- Right Content: Products List -->
        <div class="picker-main-content d-flex flex-column flex-grow-1 overflow-hidden bg-surface">
          <!-- Active Category Header Bar -->
          <div class="px-4 py-2.5 border-b bg-surface-variant d-flex align-center justify-space-between flex-shrink-0">
            <div class="d-flex align-center gap-2 overflow-hidden">
              <span class="text-body-2 font-weight-bold text-high-emphasis text-truncate">
                {{ selectedGroupName }}
              </span>
              <span class="text-caption text-medium-emphasis">
                ({{ filteredList.length }} sản phẩm)
              </span>
            </div>
            <v-chip
              v-if="searchQuery"
              size="x-small"
              color="primary"
              variant="tonal"
              closable
              class="font-weight-medium"
              @click:close="searchQuery = ''"
            >
              Từ khóa: {{ searchQuery }}
            </v-chip>
          </div>

          <!-- Product List Body -->
          <v-card-text class="pa-3.5 product-dialog-body flex-grow-1 overflow-y-auto" style="min-height: 380px; max-height: 520px;">
            <!-- Loading Skeleton -->
            <div v-if="loading" class="d-flex flex-column gap-3 pa-2">
              <v-skeleton-loader
                v-for="i in 4"
                :key="i"
                type="list-item-avatar-two-line"
                class="rounded-xl border"
              />
            </div>

            <!-- Empty Results -->
            <div
              v-else-if="filteredList.length === 0"
              class="d-flex flex-column align-center justify-center py-12 text-center text-medium-emphasis h-100"
            >
              <v-avatar size="64" color="surface-variant" class="mb-3">
                <v-icon size="32" class="opacity-60">lucide-search-x</v-icon>
              </v-avatar>
              <div class="text-body-1 font-weight-medium text-high-emphasis">Không tìm thấy sản phẩm nào</div>
              <div class="text-caption text-medium-emphasis mt-1">Thử chọn nhóm sản phẩm khác hoặc tìm bằng từ khóa khác</div>
            </div>

            <!-- Product Cards List -->
            <div v-else class="d-flex flex-column gap-2.5">
              <div
                v-for="prod in filteredList"
                :key="prod.id"
                class="product-modal-card border bg-surface d-flex align-center justify-space-between flex-wrap gap-3"
              >
                <!-- Left: Product Image & Information -->
                <div class="d-flex align-center gap-3.5 overflow-hidden flex-grow-1" style="min-width: 220px;">
                  <!-- Image Box -->
                  <div class="product-thumb-wrapper flex-shrink-0 rounded-lg overflow-hidden border bg-surface">
                    <img
                      v-if="prod.image_url"
                      :src="prod.image_url"
                      :alt="prod.name"
                      class="product-thumb-img"
                    />
                    <div v-else class="w-100 h-100 d-flex align-center justify-center text-medium-emphasis">
                      <v-icon size="24" class="opacity-50">lucide-image</v-icon>
                    </div>
                  </div>

                  <!-- Product Info: SKU, Name, and Price (UOM line removed) -->
                  <div class="product-info-block d-flex flex-column justify-center overflow-hidden flex-grow-1 pl-1">
                    <div class="d-flex align-center gap-2 mb-1 overflow-hidden">
                      <span v-if="prod.default_code || prod.sku" class="sku-badge flex-shrink-0">
                        {{ prod.default_code || prod.sku }}
                      </span>
                      <span class="product-title font-weight-bold text-high-emphasis text-truncate" :title="prod.name || prod.display_name">
                        {{ prod.name || prod.display_name }}
                      </span>
                    </div>
                    <!-- Price Info directly under the name (No ĐVT line) -->
                    <div class="d-flex align-center gap-2">
                      <span class="product-price-val font-weight-bold">
                        {{ formatCurrency(prod.list_price || prod.wholesale_price || 0) }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Right: Action Buttons & Stepper & Added Badge -->
                <div class="d-flex flex-column align-end flex-shrink-0 gap-1 justify-center ml-auto">
                  <!-- Added Count Badge if already added -->
                  <v-chip
                    v-if="hasAdded(prod)"
                    size="x-small"
                    color="amber-darken-2"
                    variant="flat"
                    class="font-weight-bold px-2 mb-1"
                  >
                    Đã thêm: {{ getAddedCount(prod) }}
                  </v-chip>

                  <!-- Action Controls Row: [Chi tiết] [ - 1 + ] [ + Chọn ] with padding/gap -->
                  <div class="d-flex align-center gap-2">
                    <!-- Detail button -->
                    <v-btn
                      size="small"
                      variant="outlined"
                      height="32"
                      class="detail-btn rounded-lg font-weight-medium px-3"
                      title="Xem thông tin chi tiết sản phẩm"
                      aria-label="Xem chi tiết sản phẩm"
                      @click.stop="openProductDetail(prod)"
                    >
                      <v-icon size="14" class="mr-1.5 opacity-80">lucide-info</v-icon>
                      Chi tiết
                    </v-btn>

                    <!-- Quantity Stepper Control -->
                    <div class="quantity-stepper d-inline-flex align-center border rounded-lg overflow-hidden bg-surface" @click.stop>
                      <button
                        type="button"
                        class="stepper-btn stepper-btn-minus"
                        :disabled="getQty(prod.id) <= 1"
                        aria-label="Giảm số lượng"
                        title="Giảm 1"
                        @click.stop="decrementQty(prod.id)"
                      >
                        <v-icon size="12">lucide-minus</v-icon>
                      </button>
                      <input
                        type="number"
                        :value="getQty(prod.id)"
                        min="1"
                        class="stepper-input text-center font-weight-bold text-high-emphasis"
                        aria-label="Số lượng sản phẩm"
                        @input="onQtyInput(prod.id, $event)"
                        @click.stop
                      />
                      <button
                        type="button"
                        class="stepper-btn stepper-btn-plus"
                        aria-label="Tăng số lượng"
                        title="Tăng 1"
                        @click.stop="incrementQty(prod.id)"
                      >
                        <v-icon size="12">lucide-plus</v-icon>
                      </button>
                    </div>

                    <!-- Select button -->
                    <v-btn
                      size="small"
                      color="primary"
                      variant="flat"
                      height="32"
                      class="select-btn rounded-lg font-weight-bold px-3.5 shadow-xs"
                      prepend-icon="lucide-plus"
                      aria-label="Chọn sản phẩm"
                      @click.stop="selectProduct(prod)"
                    >
                      Chọn
                    </v-btn>
                  </div>
                </div>
              </div>
            </div>
          </v-card-text>
        </div>
      </div>

      <!-- Dialog Footer -->
      <v-card-actions class="pa-3.5 border-t bg-surface-variant d-flex justify-space-between align-center flex-shrink-0">
        <span class="text-caption text-medium-emphasis px-2">
          Bấm "Chọn" để thêm sản phẩm vào đơn hàng
        </span>
        <v-btn
          color="primary"
          variant="flat"
          rounded="lg"
          class="font-weight-bold px-5"
          @click="$emit('update:modelValue', false)"
        >
          Hoàn tất
        </v-btn>
      </v-card-actions>
    </v-card>

    <!-- Nested Product Detail Modal -->
    <v-dialog v-model="showDetailModal" max-width="580" scrollable>
      <v-card v-if="detailProduct" class="rounded-xl overflow-hidden elevation-8 bg-surface">
        <!-- Detail Header -->
        <v-card-title class="pa-4 border-b bg-surface-variant d-flex align-center justify-space-between flex-shrink-0">
          <div class="d-flex align-center gap-2 overflow-hidden mr-2">
            <span class="sku-badge flex-shrink-0">{{ detailProduct.sku || detailProduct.default_code }}</span>
            <span class="text-subtitle-1 font-weight-bold text-high-emphasis text-truncate" style="max-width: 380px;">
              {{ detailProduct.name }}
            </span>
          </div>
          <v-btn
            icon
            size="36"
            variant="text"
            rounded="lg"
            aria-label="Đóng chi tiết"
            @click="showDetailModal = false"
          >
            <v-icon size="18">lucide-x</v-icon>
          </v-btn>
        </v-card-title>

        <!-- Detail Body -->
        <v-card-text class="pa-4" style="max-height: 520px;">
          <!-- Top section: Image & Key info -->
          <div class="d-flex gap-4 mb-4 flex-wrap">
            <div class="detail-img-box rounded-xl border bg-surface flex-shrink-0 overflow-hidden">
              <img
                v-if="detailProduct.image_url"
                :src="detailProduct.image_url"
                :alt="detailProduct.name"
                class="w-100 h-100"
                style="object-fit: cover;"
              />
              <div v-else class="w-100 h-100 d-flex align-center justify-center text-medium-emphasis">
                <v-icon size="40" class="opacity-50">lucide-image</v-icon>
              </div>
            </div>

            <div class="flex-grow-1 d-flex flex-column justify-space-between py-1" style="min-width: 220px;">
              <div>
                <div class="text-h6 font-weight-bold text-high-emphasis mb-1">{{ detailProduct.name }}</div>
                <div class="d-flex align-center gap-2 flex-wrap text-caption text-medium-emphasis mb-2">
                  <v-chip size="x-small" color="primary" variant="tonal">Odoo ID: {{ detailProduct.odoo_id || detailProduct.id }}</v-chip>
                  <v-chip v-if="detailProduct.product_group_name" size="x-small" color="secondary" variant="tonal">
                    {{ detailProduct.product_group_name }}
                  </v-chip>
                  <v-chip v-if="detailProduct.weight" size="x-small" variant="outlined">{{ detailProduct.weight }}</v-chip>
                </div>
              </div>

              <!-- Price highlights -->
              <div class="pa-2.5 rounded-lg border detail-price-box">
                <div class="text-caption font-weight-medium text-medium-emphasis">Giá sỉ / Giá bán:</div>
                <div class="text-h6 font-weight-bold text-success">
                  {{ formatCurrency(detailProduct.list_price || detailProduct.wholesale_price || 0) }}
                </div>
                <div v-if="detailProduct.retail_price" class="text-caption text-medium-emphasis mt-0.5">
                  Giá bán lẻ niêm yết: {{ formatCurrency(detailProduct.retail_price) }}
                </div>
              </div>
            </div>
          </div>

          <v-divider class="my-3"></v-divider>

          <!-- Rich Details (Ingredients, Nutrition, Target, Description) -->
          <div class="d-flex flex-column gap-3.5 text-body-2">
            <!-- Specification -->
            <div v-if="detailProduct.specification" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
              <div class="text-subtitle-2 font-weight-bold text-primary mb-1.5">
                Quy cách đóng gói
              </div>
              <div class="text-high-emphasis">{{ detailProduct.specification }}</div>
            </div>

            <!-- Ingredients -->
            <div v-if="detailProduct.ingredients" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
              <div class="text-subtitle-2 font-weight-bold text-warning-darken-2 mb-1.5">
                Thành phần
              </div>
              <div class="text-high-emphasis">{{ detailProduct.ingredients }}</div>
            </div>

            <!-- Nutritional Info -->
            <div v-if="detailProduct.nutritional_info" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
              <div class="text-subtitle-2 font-weight-bold text-success mb-1.5">
                Thông tin dinh dưỡng
              </div>
              <div class="text-high-emphasis white-space-pre-line">{{ detailProduct.nutritional_info }}</div>
            </div>

            <!-- Target -->
            <div v-if="detailProduct.target" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
              <div class="text-subtitle-2 font-weight-bold text-info mb-1.5">
                Đối tượng sử dụng
              </div>
              <div class="text-high-emphasis">{{ detailProduct.target }}</div>
            </div>

            <!-- Preservation -->
            <div v-if="detailProduct.preservation" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
              <div class="text-subtitle-2 font-weight-bold text-teal mb-1.5">
                Bảo quản
              </div>
              <div class="text-high-emphasis">{{ detailProduct.preservation }}</div>
            </div>

            <!-- Description -->
            <div v-if="detailProduct.description" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
              <div class="text-subtitle-2 font-weight-bold text-purple mb-1.5">
                Mô tả chi tiết
              </div>
              <div class="text-high-emphasis white-space-pre-line text-caption">{{ detailProduct.description }}</div>
            </div>
          </div>
        </v-card-text>

        <!-- Detail Actions -->
        <v-card-actions class="pa-3.5 border-t bg-surface-variant d-flex justify-space-between flex-shrink-0">
          <v-btn variant="text" rounded="lg" @click="showDetailModal = false">Đóng</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            rounded="lg"
            class="font-weight-bold px-4"
            prepend-icon="lucide-plus"
            @click="addFromDetail(detailProduct)"
          >
            Thêm vào đơn hàng
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useOdoo, type OdooProduct } from '@/composables/use-odoo';

const props = defineProps<{
  modelValue: boolean;
  loading?: boolean;
  orderLines?: { product: OdooProduct | null; qty: number }[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  select: [product: OdooProduct, qty: number];
}>();

const { products, filterProducts, formatCurrency, syncProducts, isSyncing, loadingProducts } = useOdoo();

const searchQuery = ref('');
const selectedGroupId = ref<number | string | null>(null);
const showDetailModal = ref(false);
const detailProduct = ref<OdooProduct | null>(null);

// Map of quantities per product ID (defaults to 1)
const quantities = ref<Record<string | number, number>>({});

function getQty(id: number | string): number {
  return quantities.value[id] || 1;
}

function setQty(id: number | string, val: number) {
  quantities.value[id] = Math.max(1, Math.floor(val) || 1);
}

function incrementQty(id: number | string) {
  setQty(id, getQty(id) + 1);
}

function decrementQty(id: number | string) {
  setQty(id, Math.max(1, getQty(id) - 1));
}

function onQtyInput(id: number | string, event: Event) {
  const target = event.target as HTMLInputElement;
  const val = parseInt(target.value, 10);
  setQty(id, isNaN(val) ? 1 : val);
}

// Compute distinct product groups from Directus products
const productGroups = computed(() => {
  const map = new Map<number | string, { id: number | string; name: string; count: number }>();
  for (const p of products.value) {
    const gId = p.product_group_id ?? (p.product_groups?.[0]?.id ?? 'other');
    const gName = p.product_group_name || p.product_groups?.[0]?.name || 'Khác';
    if (!map.has(gId)) {
      map.set(gId, { id: gId, name: gName, count: 0 });
    }
    map.get(gId)!.count++;
  }
  return Array.from(map.values()).sort((a, b) => {
    if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
    return String(a.name).localeCompare(String(b.name));
  });
});

const selectedGroupName = computed(() => {
  if (selectedGroupId.value === null || selectedGroupId.value === 'all') {
    return 'Tất cả sản phẩm';
  }
  const found = productGroups.value.find(g => g.id === selectedGroupId.value);
  return found ? found.name : 'Sản phẩm';
});

const filteredList = computed(() => {
  return filterProducts(searchQuery.value, selectedGroupId.value);
});

function hasAdded(product: OdooProduct): boolean {
  if (!props.orderLines) return false;
  return props.orderLines.some(
    (l) => l.product?.id === product.id || (product.odoo_id && l.product?.id === Number(product.odoo_id))
  );
}

function getAddedCount(product: OdooProduct): number {
  if (!props.orderLines) return 0;
  const match = props.orderLines.find(
    (l) => l.product?.id === product.id || (product.odoo_id && l.product?.id === Number(product.odoo_id))
  );
  return match ? match.qty : 0;
}

function selectProduct(product: OdooProduct) {
  const qty = getQty(product.id);
  emit('select', product, qty);
}

function openProductDetail(product: OdooProduct) {
  detailProduct.value = product;
  showDetailModal.value = true;
}

function addFromDetail(product: OdooProduct) {
  const qty = getQty(product.id);
  emit('select', product, qty);
  showDetailModal.value = false;
}
</script>

<style scoped>
.product-picker-dialog {
  border: 1px solid var(--color-chalk, #e2e8f0);
}

.v-theme--dark .product-picker-dialog {
  border-color: rgba(255, 255, 255, 0.08);
}

.picker-layout-body {
  height: 520px;
}

/* Left Sidebar */
.picker-sidebar {
  width: 280px;
  background-color: var(--color-paper-white, #f8fafc);
  border-color: var(--color-chalk, #e2e8f0) !important;
}

.v-theme--dark .picker-sidebar {
  background-color: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.picker-groups-list {
  scrollbar-width: thin;
}

.group-nav-item {
  color: var(--color-graphite, #475569);
  transition: all 0.15s ease-in-out;
}

.group-nav-item:hover {
  background-color: rgba(0, 0, 0, 0.04);
  color: var(--color-carbon-ink, #0f172a);
}

.v-theme--dark .group-nav-item {
  color: #94a3b8;
}

.v-theme--dark .group-nav-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
  color: #f1f5f9;
}

.group-nav-item-active {
  background-color: rgba(59, 130, 246, 0.12) !important;
  color: #2563eb !important;
  font-weight: 600;
}

.v-theme--dark .group-nav-item-active {
  background-color: rgba(59, 130, 246, 0.22) !important;
  color: #60a5fa !important;
}

.search-input-field :deep(.v-field) {
  border-radius: 8px;
}

.product-dialog-body {
  scrollbar-width: thin;
}

.product-modal-card {
  padding: 10px 14px !important;
  border-radius: 10px !important;
  border-color: var(--color-chalk, #e2e8f0) !important;
  background-color: var(--color-paper-white, #ffffff) !important;
  transition: all 0.18s ease-in-out;
}

.v-theme--dark .product-modal-card {
  border-color: rgba(255, 255, 255, 0.08) !important;
  background-color: rgba(255, 255, 255, 0.02) !important;
}

.product-modal-card:hover {
  border-color: #3b82f6 !important;
  box-shadow: 0 3px 10px rgba(59, 130, 246, 0.08) !important;
}

.v-theme--dark .product-modal-card:hover {
  border-color: #2563eb !important;
}

.product-thumb-wrapper {
  width: 54px;
  height: 54px;
  border-color: var(--color-chalk, #e2e8f0);
  background-color: var(--color-paper-white, #ffffff);
  padding: 2px;
  border-radius: 8px;
}

.v-theme--dark .product-thumb-wrapper {
  border-color: rgba(255, 255, 255, 0.08);
  background-color: #1f1f1c;
}

.product-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.product-info-block {
  max-width: 320px;
}

.sku-badge {
  font-size: 11px;
  font-weight: 700;
  color: #1e40af;
  background-color: #dbeafe;
  padding: 1px 5px;
  border-radius: 4px;
  letter-spacing: 0.2px;
}

.v-theme--dark .sku-badge {
  color: #93c5fd;
  background-color: rgba(59, 130, 246, 0.2);
}

.product-title {
  font-size: 13.5px;
  line-height: 1.35;
  color: var(--color-carbon-ink, #1e293b);
}

.product-price-val {
  font-size: 14.5px;
  color: #10b981;
  letter-spacing: -0.1px;
}

.v-theme--dark .product-price-val {
  color: #34d399;
}

/* Quantity Stepper Control */
.quantity-stepper {
  border-color: var(--color-chalk, #cbd5e1) !important;
  height: 32px;
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

.detail-btn {
  border-color: var(--color-chalk, #cbd5e1) !important;
  font-size: 12px;
  transition: all 0.15s ease;
}

.v-theme--dark .detail-btn {
  border-color: rgba(255, 255, 255, 0.12) !important;
}

.select-btn {
  font-size: 12px;
  transition: all 0.15s ease;
}

.detail-btn:hover,
.select-btn:hover {
  transform: translateY(-0.5px);
}

.detail-img-box {
  width: 120px;
  height: 120px;
  border-color: var(--color-chalk, #e2e8f0);
}

.v-theme--dark .detail-img-box {
  border-color: rgba(255, 255, 255, 0.08);
}

.detail-price-box {
  background-color: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.25) !important;
}

.detail-item {
  border-color: var(--color-chalk, #e2e8f0) !important;
}

.v-theme--dark .detail-item {
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.white-space-pre-line {
  white-space: pre-line;
}
</style>

