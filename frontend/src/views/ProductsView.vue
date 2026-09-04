<template>
  <div class="products-container pa-3 pa-md-6">
    <!-- ── Page Header (Cleaned up: Title & Icon, Sync Button) ──────────────── -->
    <div class="d-flex flex-wrap align-center justify-space-between gap-3 mb-4">
      <div class="d-flex align-center gap-2">
        <v-icon size="28" color="primary">lucide-package</v-icon>
        <h1 class="text-h6 text-md-h5 font-weight-bold">Quản lý Sản phẩm (Danh mục Directus)</h1>
      </div>

      <!-- Sync Button -->
      <v-btn
        color="primary"
        variant="elevated"
        prepend-icon="lucide-refresh-cw"
        class="text-none font-weight-medium rounded-lg"
        :loading="syncing"
        @click="handleSyncProducts"
      >
        Đồng bộ dữ liệu
      </v-btn>
    </div>

    <!-- ── Search & Filter Card (Enhanced Spacing) ───────────────────────────── -->
    <v-card class="elevation-1 rounded-lg mb-4" variant="outlined">
      <v-card-text class="pa-3 pa-md-4">
        <div class="row-filters">
          <!-- Search input -->
          <v-text-field
            v-model="searchQuery"
            density="compact"
            variant="outlined"
            placeholder="Tìm theo mã SKU hoặc tên sản phẩm..."
            prepend-inner-icon="lucide-search"
            hide-details
            clearable
            class="filter-search"
            @keyup.enter="handleSearch"
            @click:clear="handleClearSearch"
          />

          <!-- Category filter -->
          <v-select
            v-model="selectedCategoryFilter"
            :items="categoryFilterOptions"
            density="compact"
            variant="outlined"
            label="Ngành hàng"
            hide-details
            clearable
            class="filter-select"
            @update:model-value="fetchProducts(1)"
          />

          <!-- Brand filter -->
          <v-select
            v-model="selectedBrandFilter"
            :items="brandFilterOptions"
            density="compact"
            variant="outlined"
            label="Thương hiệu"
            hide-details
            clearable
            class="filter-select"
            @update:model-value="fetchProducts(1)"
          />
        </div>
      </v-card-text>
    </v-card>

    <!-- ── Mobile Touch Helper Tip ─────────────────────────────────────────── -->
    <div
      v-if="isMobile && !isSelectMode"
      class="mobile-touch-tip d-flex align-center gap-2 px-3 py-2 mb-3 rounded-lg border bg-surface text-caption text-medium-emphasis"
    >
      <v-icon size="16" color="primary">lucide-info</v-icon>
      <span>Chạm vào thẻ để xem chi tiết • <strong>Nhấn & giữ</strong> để hiện cột chọn</span>
    </div>

    <!-- ── Floating Bulk Action Toolbar (appears when items selected or in select mode) ───────── -->
    <v-slide-y-transition>
      <v-card
        v-if="selectedIds.length > 0 || isSelectMode"
        color="primary"
        theme="dark"
        class="mb-4 elevation-4 rounded-lg d-flex flex-wrap align-center justify-space-between px-4 py-3 gap-2"
      >
        <div class="d-flex align-center gap-2">
          <v-icon size="20">lucide-check-square</v-icon>
          <span class="font-weight-bold text-body-2 text-md-body-1">
            Đã chọn {{ selectedIds.length }} sản phẩm
          </span>
        </div>
        <div class="d-flex align-center gap-2 flex-wrap">
          <v-btn
            v-if="selectedIds.length > 0"
            color="white"
            variant="elevated"
            class="text-primary font-weight-bold text-none"
            size="small"
            @click="openBulkEditModal"
          >
            <v-icon start size="16">lucide-tag</v-icon>
            Gán Ngành & Thương hiệu
          </v-btn>
          <v-btn
            variant="outlined"
            color="white"
            size="small"
            class="text-none"
            @click="toggleSelectAll(!isAllSelected)"
          >
            {{ isAllSelected ? 'Bỏ chọn hết' : 'Chọn tất cả' }}
          </v-btn>
          <v-btn
            variant="text"
            color="white"
            size="small"
            class="text-none"
            @click="exitSelectMode"
          >
            Thoát
          </v-btn>
        </div>
      </v-card>
    </v-slide-y-transition>

    <!-- ── Products Table ───────────────────────────────────────────────────── -->
    <v-card class="elevation-1 rounded-lg" variant="outlined">
      <v-table density="comfortable" hover class="products-table" :class="{ 'mobile-table': isMobile }">
        <thead>
          <tr>
            <!-- Select column (Always on desktop; on mobile only when isSelectMode is active) -->
            <th v-if="!isMobile || isSelectMode" class="col-select">
              <v-checkbox
                :model-value="isAllSelected"
                :indeterminate="isPartiallySelected"
                hide-details
                density="compact"
                @update:model-value="toggleSelectAll"
              />
            </th>

            <!-- Desktop only: Thumbnail -->
            <th v-if="!isMobile" style="width: 68px;">Ảnh</th>

            <!-- Mã sản phẩm (SKU) -->
            <th :class="isMobile ? 'col-sku' : ''" :style="!isMobile ? 'min-width: 110px;' : ''">
              {{ isMobile ? 'Mã SP' : 'Mã SKU' }}
            </th>

            <!-- Tên sản phẩm -->
            <th :class="isMobile ? 'col-name' : ''" :style="!isMobile ? 'min-width: 240px;' : ''">
              {{ isMobile ? 'Tên sản phẩm' : 'Tên sản phẩm (Directus)' }}
            </th>

            <!-- Desktop only columns -->
            <th v-if="!isMobile" style="min-width: 170px;">Ngành hàng (Category)</th>
            <th v-if="!isMobile" style="min-width: 140px;">Thương hiệu (Brand)</th>
            <th v-if="!isMobile" style="min-width: 110px;">Quy cách / ĐVT</th>

            <!-- Giá -->
            <th :class="isMobile ? 'col-price' : ''" :style="!isMobile ? 'min-width: 130px; text-align: right;' : ''">
              {{ isMobile ? 'Giá' : 'Giá niêm yết' }}
            </th>

            <!-- Desktop only: Action button -->
            <th v-if="!isMobile" style="width: 90px; text-align: center;">Chi tiết</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && products.length === 0">
            <td :colspan="isMobile ? (isSelectMode ? 4 : 3) : 9" class="text-center py-8 text-medium-emphasis">
              <v-progress-circular indeterminate color="primary" class="mr-2" size="24" />
              Đang tải danh mục sản phẩm Directus...
            </td>
          </tr>
          <tr v-else-if="products.length === 0">
            <td :colspan="isMobile ? (isSelectMode ? 4 : 3) : 9" class="text-center py-10 text-medium-emphasis">
              <v-icon size="40" class="mb-2 d-block mx-auto opacity-50">lucide-package-open</v-icon>
              Không tìm thấy sản phẩm Directus nào phù hợp
            </td>
          </tr>
          <tr
            v-for="item in products"
            :key="item.id"
            class="product-row cursor-pointer"
            :class="{
              'selected-row': selectedIds.includes(item.id),
              'is-pressing': pressingId === item.id,
              'mobile-row': isMobile
            }"
            @touchstart="onTouchStart(item, $event)"
            @touchend="onTouchEnd"
            @touchmove="onTouchMove"
            @touchcancel="onTouchEnd"
            @mousedown="onMouseDown(item, $event)"
            @mousemove="onMouseMove"
            @mouseup="onMouseUp"
            @mouseleave="onMouseLeave"
            @click="onRowClick($event, item)"
          >
            <!-- Checkbox -->
            <td v-if="!isMobile || isSelectMode" class="col-select" @click.stop>
              <v-checkbox
                :model-value="selectedIds.includes(item.id)"
                hide-details
                density="compact"
                @update:model-value="toggleSelectItem(item.id)"
              />
            </td>

            <!-- Thumbnail (Desktop only) -->
            <td v-if="!isMobile">
              <div class="table-img-box rounded-lg border bg-surface overflow-hidden d-flex align-center justify-center">
                <img
                  v-if="item.imageUrl"
                  :src="item.imageUrl"
                  :alt="item.name"
                  class="w-100 h-100"
                  style="object-fit: cover;"
                  @error="() => { item.imageUrl = null; }"
                />
                <v-icon v-else size="20" color="grey">lucide-package</v-icon>
              </div>
            </td>

            <!-- SKU / Mã sản phẩm -->
            <td :class="[isMobile ? 'col-sku' : '', { 'py-3': isMobile }]">
              <v-chip
                :size="isMobile ? 'x-small' : 'small'"
                variant="tonal"
                color="primary"
                class="font-weight-bold font-monospace"
              >
                {{ item.sku || item.default_code || 'N/A' }}
              </v-chip>
            </td>

            <!-- Name / Tên sản phẩm -->
            <td :class="[isMobile ? 'col-name' : '', { 'py-3': isMobile }]">
              <div
                class="font-weight-medium"
                :class="isMobile ? 'product-name-ellipsis' : 'text-truncate'"
                :title="item.name"
              >
                {{ item.name }}
              </div>
              <div v-if="item.product_group_name && !isMobile" class="text-caption text-secondary font-weight-medium mt-0.5">
                {{ item.product_group_name }}
              </div>
            </td>

            <!-- Category (Desktop only) -->
            <td v-if="!isMobile">
              <v-chip
                v-if="item.category"
                size="small"
                color="indigo"
                variant="flat"
                class="font-weight-medium text-white"
              >
                {{ item.category }}
              </v-chip>
              <span v-else class="text-caption text-grey-darken-1 font-italic">
                Chưa phân loại
              </span>
            </td>

            <!-- Brand (Desktop only) -->
            <td v-if="!isMobile">
              <v-chip
                v-if="item.brand"
                size="small"
                color="teal"
                variant="tonal"
                class="font-weight-bold"
              >
                {{ item.brand }}
              </v-chip>
              <span v-else class="text-caption text-grey-darken-1 font-italic">
                Chưa có
              </span>
            </td>

            <!-- Unit / Specification (Desktop only) -->
            <td v-if="!isMobile">
              <span class="text-caption text-medium-emphasis font-weight-medium">
                {{ item.specification || item.uomName || item.weight || 'Đơn vị' }}
              </span>
            </td>

            <!-- Price / Giá -->
            <td :class="[isMobile ? 'col-price' : '', { 'py-3': isMobile }]" :style="!isMobile ? 'text-align: right;' : ''">
              <span class="font-weight-bold text-success text-no-wrap text-body-2">
                {{ formatVND(item.listPrice || item.wholesalePrice || 0) }}
              </span>
              <div v-if="item.retailPrice && !isMobile" class="text-caption text-medium-emphasis">
                Lẻ: {{ formatVND(item.retailPrice) }}
              </div>
            </td>

            <!-- Actions (Desktop only) -->
            <td v-if="!isMobile" style="text-align: center;" @click.stop>
              <v-btn
                icon
                size="small"
                variant="text"
                color="primary"
                title="Xem chi tiết & Phân loại"
                @click="openDetailModal(item)"
              >
                <v-icon size="18">lucide-eye</v-icon>
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>

      <!-- Pagination Footer (Full Width, Centered & Evenly Stretched) -->
      <v-divider />
      <div class="d-flex flex-column pa-4 gap-3">
        <div class="text-caption text-medium-emphasis text-center text-sm-left">
          Hiển thị <strong>{{ products.length }}</strong> trong tổng số <strong>{{ totalProducts }}</strong> sản phẩm Directus
        </div>

        <div v-if="totalPages > 1" class="w-100 pagination-wrapper">
          <v-pagination
            v-model="currentPage"
            :length="totalPages"
            :total-visible="7"
            density="comfortable"
            color="primary"
            class="full-width-pagination w-100"
            @update:model-value="fetchProducts"
          />
        </div>
      </div>
    </v-card>

    <!-- ── Product Detail & Classification Modal ── -->
    <v-dialog v-model="detailModalVisible" max-width="540" scrollable>
      <v-card v-if="detailItem" class="rounded-xl overflow-hidden border elevation-8">
        <!-- Detail Header -->
        <v-card-title class="d-flex align-center justify-space-between pa-4 bg-surface border-b">
          <div class="d-flex align-center gap-2 overflow-hidden">
            <v-chip size="small" color="primary" variant="tonal" class="font-weight-bold flex-shrink-0">
              {{ detailItem.sku || detailItem.default_code }}
            </v-chip>
            <span class="text-subtitle-1 font-weight-bold text-truncate">{{ detailItem.name }}</span>
          </div>
          <v-btn
            icon
            variant="text"
            size="small"
            class="rounded-lg flex-shrink-0"
            @click="detailModalVisible = false"
          >
            <v-icon size="18">lucide-x</v-icon>
          </v-btn>
        </v-card-title>

        <!-- Detail Body -->
        <v-card-text class="pa-4" style="max-height: 560px;">
          <!-- Top section: Image & Key info -->
          <div class="d-flex gap-4 mb-4 flex-wrap">
            <div class="detail-img-box rounded-xl border bg-surface flex-shrink-0 overflow-hidden">
              <img
                v-if="detailItem.imageUrl || detailItem.image_url"
                :src="detailItem.imageUrl || detailItem.image_url"
                :alt="detailItem.name"
                class="w-100 h-100"
                style="object-fit: cover;"
                @error="() => { detailItem.imageUrl = null; detailItem.image_url = null; }"
              />
              <div v-else class="w-100 h-100 d-flex align-center justify-center text-medium-emphasis">
                <v-icon size="40" class="opacity-50">lucide-image</v-icon>
              </div>
            </div>

            <div class="flex-grow-1 d-flex flex-column justify-space-between py-1" style="min-width: 220px;">
              <div>
                <div class="text-h6 font-weight-bold text-high-emphasis mb-1">{{ detailItem.name }}</div>
                <div class="d-flex align-center gap-2 flex-wrap text-caption text-medium-emphasis mb-2">
                  <v-chip size="x-small" color="primary" variant="tonal">
                    Odoo ID: {{ detailItem.odooId || detailItem.odoo_id || detailItem.id }}
                  </v-chip>
                  <v-chip v-if="detailItem.product_group_name" size="x-small" color="secondary" variant="tonal">
                    {{ detailItem.product_group_name }}
                  </v-chip>
                  <v-chip v-if="detailItem.weight" size="x-small" variant="outlined">
                    {{ detailItem.weight }}
                  </v-chip>
                </div>
              </div>

              <!-- Price highlights -->
              <div class="pa-2.5 rounded-lg border detail-price-box">
                <div class="text-caption font-weight-medium text-medium-emphasis">Giá sỉ / Giá bán:</div>
                <div class="text-h6 font-weight-bold text-success">
                  {{ formatVND(detailItem.listPrice || detailItem.wholesalePrice || detailItem.list_price || 0) }}
                </div>
                <div v-if="detailItem.retailPrice || detailItem.retail_price" class="text-caption text-medium-emphasis mt-0.5">
                  Giá bán lẻ niêm yết: {{ formatVND(detailItem.retailPrice || detailItem.retail_price) }}
                </div>
              </div>
            </div>
          </div>

          <!-- ── 2 EDITABLE FIELDS: NGÀNH HÀNG & THƯƠNG HIỆU ── -->
          <!-- Ngành hàng (Category) -->
          <div class="detail-item border rounded-lg pa-3 bg-surface shadow-xs mb-3.5">
            <div class="text-subtitle-2 font-weight-bold text-primary mb-2">
              Ngành hàng (Category)
            </div>
            <v-combobox
              v-model="editForm.category"
              :items="suggestedCategories"
              placeholder="Chọn hoặc nhập ngành hàng..."
              variant="outlined"
              density="compact"
              hide-details
              clearable
            />
          </div>

          <!-- Thương hiệu (Brand) -->
          <div class="detail-item border rounded-lg pa-3 bg-surface shadow-xs mb-3.5">
            <div class="text-subtitle-2 font-weight-bold text-success mb-2">
              Thương hiệu (Brand)
            </div>
            <v-combobox
              v-model="editForm.brand"
              :items="suggestedBrands"
              placeholder="Chọn hoặc nhập thương hiệu..."
              variant="outlined"
              density="compact"
              hide-details
              clearable
            />
          </div>

          <!-- Rich Details from Directus -->
          <div class="d-flex flex-column gap-3.5 text-body-2">
            <!-- Specification -->
            <div v-if="detailItem.specification" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
              <div class="text-subtitle-2 font-weight-bold text-primary mb-1.5">
                Quy cách đóng gói
              </div>
              <div class="text-high-emphasis">{{ detailItem.specification }}</div>
            </div>

            <!-- Ingredients -->
            <div v-if="detailItem.ingredients" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
              <div class="text-subtitle-2 font-weight-bold text-warning-darken-2 mb-1.5">
                Thành phần
              </div>
              <div class="text-high-emphasis">{{ detailItem.ingredients }}</div>
            </div>

            <!-- Nutritional Info -->
            <div v-if="detailItem.nutritional_info" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
              <div class="text-subtitle-2 font-weight-bold text-success mb-1.5">
                Thông tin dinh dưỡng
              </div>
              <div class="text-high-emphasis white-space-pre-line">{{ detailItem.nutritional_info }}</div>
            </div>

            <!-- Target -->
            <div v-if="detailItem.target" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
              <div class="text-subtitle-2 font-weight-bold text-info mb-1.5">
                Đối tượng sử dụng
              </div>
              <div class="text-high-emphasis">{{ detailItem.target }}</div>
            </div>

            <!-- Preservation -->
            <div v-if="detailItem.preservation" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
              <div class="text-subtitle-2 font-weight-bold text-teal mb-1.5">
                Bảo quản
              </div>
              <div class="text-high-emphasis">{{ detailItem.preservation }}</div>
            </div>

            <!-- Description -->
            <div v-if="detailItem.description" class="detail-item border rounded-lg pa-3 bg-surface shadow-xs">
              <div class="text-subtitle-2 font-weight-bold text-purple mb-1.5">
                Mô tả chi tiết
              </div>
              <div class="text-high-emphasis white-space-pre-line text-caption">{{ detailItem.description }}</div>
            </div>
          </div>
        </v-card-text>

        <!-- Detail Actions -->
        <v-card-actions class="pa-3.5 border-t bg-surface-variant d-flex justify-space-between flex-shrink-0">
          <v-btn variant="text" rounded="lg" @click="detailModalVisible = false">
            Đóng
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            rounded="lg"
            class="font-weight-bold px-5"
            prepend-icon="lucide-save"
            :loading="saving"
            @click="saveSingleProduct"
          >
            Lưu phân loại
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Bulk Edit Modal ──────────────────────────────────────────────────── -->
    <v-dialog v-model="bulkModalVisible" max-width="520" persistent>
      <v-card class="rounded-xl elevation-8">
        <v-card-item class="bg-surface-light border-b py-3 px-5">
          <div class="d-flex align-center justify-space-between w-100">
            <div class="d-flex align-center gap-2">
              <v-icon color="primary" size="22">lucide-layers</v-icon>
              <v-card-title class="text-subtitle-1 font-weight-bold pa-0">
                Gán phân loại cho {{ selectedIds.length }} sản phẩm Directus
              </v-card-title>
            </div>
            <v-btn icon size="small" variant="text" @click="bulkModalVisible = false">
              <v-icon size="18">lucide-x</v-icon>
            </v-btn>
          </div>
        </v-card-item>

        <v-card-text class="pa-5">
          <p class="text-body-2 text-medium-emphasis mb-4">
            Giá trị bạn chọn sẽ được cập nhật cho toàn bộ <strong>{{ selectedIds.length }}</strong> sản phẩm đã chọn.
          </p>

          <div class="mb-4">
            <label class="text-subtitle-2 font-weight-bold mb-1 d-block">
              Ngành hàng áp dụng chung
            </label>
            <v-combobox
              v-model="bulkForm.category"
              :items="suggestedCategories"
              placeholder="Chọn hoặc gõ ngành hàng mới (hoặc để trống nếu không đổi)"
              variant="outlined"
              density="compact"
              clearable
            />
          </div>

          <div class="mb-2">
            <label class="text-subtitle-2 font-weight-bold mb-1 d-block">
              Thương hiệu áp dụng chung
            </label>
            <v-combobox
              v-model="bulkForm.brand"
              :items="suggestedBrands"
              placeholder="Chọn hoặc gõ thương hiệu mới (hoặc để trống nếu không đổi)"
              variant="outlined"
              density="compact"
              clearable
            />
          </div>
        </v-card-text>

        <v-divider />
        <v-card-actions class="pa-4 bg-surface-light d-flex justify-end gap-2">
          <v-btn variant="text" rounded="lg" @click="bulkModalVisible = false">
            Hủy bỏ
          </v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            rounded="lg"
            class="font-weight-bold px-4"
            :loading="saving"
            @click="saveBulkUpdate"
          >
            <v-icon start size="16">lucide-check</v-icon>
            Áp dụng cho {{ selectedIds.length }} sản phẩm
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Sync Notification Snackbar ────────────────────────────────────────── -->
    <v-snackbar
      v-model="syncSnackbar"
      :color="syncSuccess ? 'success' : 'error'"
      :timeout="5000"
      location="top"
      rounded="lg"
      elevation="6"
    >
      <div class="d-flex align-center gap-2">
        <v-icon size="20">{{ syncSuccess ? 'lucide-check-circle' : 'lucide-alert-circle' }}</v-icon>
        <span class="font-weight-medium">{{ syncMessage }}</span>
      </div>
      <template #actions>
        <v-btn variant="text" size="small" @click="syncSnackbar = false">Đóng</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useDisplay } from 'vuetify';
import { api } from '@/api';

// ── Mobile Responsive Setup ──────────────────────────────────────────────────
const display = useDisplay();
const isMobile = computed(() => display.smAndDown.value);

// ── State ────────────────────────────────────────────────────────────────────
const loading = ref(false);
const saving = ref(false);
const syncing = ref(false);
const syncSnackbar = ref(false);
const syncMessage = ref('');
const syncSuccess = ref(true);

const products = ref<any[]>([]);
const totalProducts = ref(0);
const totalPages = ref(1);
const currentPage = ref(1);
const pageLimit = ref(50);

// Filters
const searchQuery = ref('');
const selectedCategoryFilter = ref<string | null>(null);
const selectedBrandFilter = ref<string | null>(null);

// Autocomplete suggestions
const suggestedCategories = ref<string[]>([]);
const suggestedBrands = ref<string[]>([]);

// Selection for bulk actions & mobile select mode
const selectedIds = ref<string[]>([]);
const isSelectMode = ref(false);
const pressingId = ref<string | null>(null);

let pressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressTriggered = false;
let startCoords = { x: 0, y: 0 };

// Detail & Edit Modal
const detailModalVisible = ref(false);
const detailItem = ref<any>(null);
const editForm = reactive({
  category: '' as string | null,
  brand: '' as string | null,
});

// Bulk Edit Modal
const bulkModalVisible = ref(false);
const bulkForm = reactive({
  category: '' as string | null,
  brand: '' as string | null,
});

// ── Computed Filter Options ──────────────────────────────────────────────────
const categoryFilterOptions = computed(() => {
  const list: Array<{ title: string; value: string | null }> = [{ title: 'Tất cả ngành hàng', value: null }];
  list.push({ title: 'Chưa phân ngành (Trống)', value: '__NONE__' });
  suggestedCategories.value.forEach(cat => {
    list.push({ title: cat, value: cat });
  });
  return list;
});

const brandFilterOptions = computed(() => {
  const list: Array<{ title: string; value: string | null }> = [{ title: 'Tất cả thương hiệu', value: null }];
  list.push({ title: 'Chưa có thương hiệu (Trống)', value: '__NONE__' });
  suggestedBrands.value.forEach(b => {
    list.push({ title: b, value: b });
  });
  return list;
});

// Selection computations
const isAllSelected = computed(() => {
  if (products.value.length === 0) return false;
  return products.value.every(p => selectedIds.value.includes(p.id));
});

const isPartiallySelected = computed(() => {
  if (products.value.length === 0) return false;
  const count = products.value.filter(p => selectedIds.value.includes(p.id)).length;
  return count > 0 && count < products.value.length;
});

function toggleSelectAll(checked: boolean | null) {
  if (checked) {
    const currentIds = products.value.map(p => p.id);
    const combined = new Set([...selectedIds.value, ...currentIds]);
    selectedIds.value = Array.from(combined);
  } else {
    const currentIds = new Set(products.value.map(p => p.id));
    selectedIds.value = selectedIds.value.filter(id => !currentIds.has(id));
  }
}

function toggleSelectItem(id: string) {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1);
  } else {
    selectedIds.value.push(id);
  }
}

function exitSelectMode() {
  isSelectMode.value = false;
  selectedIds.value = [];
}

// ── Long-press (Click & Hold) Handlers ────────────────────────────────────────
function startPress(item: any, clientX?: number, clientY?: number) {
  if (isSelectMode.value) return; // In select mode, standard taps toggle selection
  pressingId.value = item.id;
  longPressTriggered = false;
  if (clientX !== undefined && clientY !== undefined) {
    startCoords = { x: clientX, y: clientY };
  }
  if (pressTimer) clearTimeout(pressTimer);

  pressTimer = setTimeout(() => {
    longPressTriggered = true;
    pressingId.value = null;
    isSelectMode.value = true;
    if (!selectedIds.value.includes(item.id)) {
      selectedIds.value.push(item.id);
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(50);
      } catch (_) {}
    }
  }, 450);
}

function cancelPress() {
  pressingId.value = null;
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
}

function onTouchStart(item: any, e: TouchEvent) {
  if (isSelectMode.value) return;
  const touch = e.touches[0];
  startPress(item, touch ? touch.clientX : undefined, touch ? touch.clientY : undefined);
}

function onTouchMove(e: TouchEvent) {
  if (pressTimer && e.touches[0]) {
    const dx = Math.abs(e.touches[0].clientX - startCoords.x);
    const dy = Math.abs(e.touches[0].clientY - startCoords.y);
    if (dx > 10 || dy > 10) {
      cancelPress();
    }
  }
}

function onTouchEnd() {
  cancelPress();
}

function onMouseDown(item: any, e: MouseEvent) {
  if (isSelectMode.value) return;
  startPress(item, e.clientX, e.clientY);
}

function onMouseMove(e: MouseEvent) {
  if (pressTimer) {
    const dx = Math.abs(e.clientX - startCoords.x);
    const dy = Math.abs(e.clientY - startCoords.y);
    if (dx > 10 || dy > 10) {
      cancelPress();
    }
  }
}

function onMouseUp() {
  cancelPress();
}

function onMouseLeave() {
  cancelPress();
}

function onRowClick(_e: Event, item: any) {
  if (longPressTriggered) {
    longPressTriggered = false;
    return;
  }
  if (isSelectMode.value) {
    toggleSelectItem(item.id);
    return;
  }
  openDetailModal(item);
}

// ── API Fetchers ─────────────────────────────────────────────────────────────
async function fetchSuggestions() {
  try {
    const res = await api.get('/products/suggestions');
    if (res.data.success) {
      suggestedCategories.value = res.data.categories || [];
      suggestedBrands.value = res.data.brands || [];
    }
  } catch (err: any) {
    console.error('Error fetching suggestions:', err);
  }
}

async function fetchProducts(page = currentPage.value) {
  loading.value = true;
  currentPage.value = page;

  try {
    const params: any = {
      page: currentPage.value,
      limit: pageLimit.value,
      search: searchQuery.value || undefined,
      category: selectedCategoryFilter.value || undefined,
      brand: selectedBrandFilter.value || undefined,
    };

    const res = await api.get('/products', { params });
    if (res.data.success) {
      products.value = res.data.products || [];
      totalProducts.value = res.data.total || 0;
      totalPages.value = res.data.totalPages || 1;
    }
  } catch (err: any) {
    console.error('Error fetching products:', err);
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  fetchProducts(1);
}

function handleClearSearch() {
  searchQuery.value = '';
  fetchProducts(1);
}

async function handleSyncProducts() {
  syncing.value = true;
  try {
    const res = await api.post('/sync/products');
    if (res.data.success) {
      syncSuccess.value = true;
      syncMessage.value = res.data.message ||
        `Đã lấy được ${res.data.createdCount || 0} sản phẩm mới và cập nhật ${res.data.updatedCount || 0} sản phẩm.`;
      syncSnackbar.value = true;
      await Promise.all([fetchSuggestions(), fetchProducts(1)]);
    } else {
      throw new Error(res.data.error || 'Đồng bộ thất bại');
    }
  } catch (err: any) {
    syncSuccess.value = false;
    syncMessage.value = err.response?.data?.error || err.message || 'Lỗi khi đồng bộ sản phẩm';
    syncSnackbar.value = true;
  } finally {
    syncing.value = false;
  }
}

// ── Detail & Single Edit Handlers ────────────────────────────────────────────
function openDetailModal(item: any) {
  detailItem.value = item;
  editForm.category = item.category || '';
  editForm.brand = item.brand || '';
  detailModalVisible.value = true;
}

async function saveSingleProduct() {
  if (!detailItem.value) return;
  saving.value = true;

  try {
    const payload = {
      category: editForm.category?.trim() || null,
      brand: editForm.brand?.trim() || null,
    };

    const res = await api.patch(`/products/${detailItem.value.id}`, payload);
    if (res.data.success) {
      detailItem.value.category = payload.category;
      detailItem.value.brand = payload.brand;

      // Update in table list
      const idx = products.value.findIndex(p => p.id === detailItem.value.id);
      if (idx >= 0) {
        products.value[idx].category = payload.category;
        products.value[idx].brand = payload.brand;
      }

      detailModalVisible.value = false;
      fetchSuggestions();
      fetchProducts();
    }
  } catch (err: any) {
    alert(err.response?.data?.error || 'Lỗi khi cập nhật sản phẩm');
  } finally {
    saving.value = false;
  }
}

// ── Bulk Edit Handlers ───────────────────────────────────────────────────────
function openBulkEditModal() {
  bulkForm.category = '';
  bulkForm.brand = '';
  bulkModalVisible.value = true;
}

async function saveBulkUpdate() {
  if (selectedIds.value.length === 0) return;
  saving.value = true;

  try {
    const payload: any = {
      productIds: selectedIds.value,
    };
    if (bulkForm.category && bulkForm.category.trim()) {
      payload.category = bulkForm.category.trim();
    }
    if (bulkForm.brand && bulkForm.brand.trim()) {
      payload.brand = bulkForm.brand.trim();
    }

    const res = await api.patch('/products/bulk-update', payload);
    if (res.data.success) {
      bulkModalVisible.value = false;
      selectedIds.value = [];
      fetchSuggestions();
      fetchProducts();
    }
  } catch (err: any) {
    alert(err.response?.data?.error || 'Lỗi khi cập nhật hàng loạt');
  } finally {
    saving.value = false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Math.round(amount || 0));
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  fetchSuggestions();
  fetchProducts(1);
});
</script>

<style scoped>
.products-container {
  max-width: 1400px;
  margin: 0 auto;
}

/* ── SEARCH & FILTER ROW (Distinct Gap & Spacing) ─────────────────────────── */
.row-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px !important;
  width: 100%;
}

.filter-search {
  flex: 1 1 280px;
  min-width: 220px;
}

.filter-select {
  flex: 0 1 200px;
  min-width: 170px;
}

.filter-refresh {
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .row-filters {
    gap: 12px !important;
  }
  .filter-search {
    flex: 1 1 100%;
    min-width: 100%;
  }
  .filter-select {
    flex: 1 1 calc(50% - 6px);
    min-width: 130px;
  }
}

@media (max-width: 480px) {
  .filter-select {
    flex: 1 1 100%;
    min-width: 100%;
  }
}

/* ── PRODUCT TABLE & ROWS ─────────────────────────────────────────────────── */
.products-table th {
  font-weight: 600 !important;
  font-size: 0.825rem !important;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--v-medium-emphasis-opacity);
}

.product-row {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  transition: background-color 0.15s ease;
}

.product-row.is-pressing {
  background-color: rgba(var(--v-theme-primary), 0.12) !important;
}

.selected-row {
  background-color: rgba(var(--v-theme-primary), 0.07) !important;
}

.mobile-row td {
  padding-top: 11px !important;
  padding-bottom: 11px !important;
}

/* ── MOBILE TABLE COLUMN WIDTHS & SPACING ────────────────────────────────── */
:deep(.mobile-table table) {
  table-layout: auto !important;
  width: 100% !important;
}

.mobile-table .col-select {
  width: 1% !important;
  white-space: nowrap !important;
  text-align: center !important;
  padding-left: 8px !important;
  padding-right: 6px !important;
}

.mobile-table .col-sku {
  width: 1% !important;
  white-space: nowrap !important;
  padding-left: 8px !important;
  padding-right: 12px !important;
}

.mobile-table .col-name {
  width: 100% !important;
  max-width: 0 !important;
  padding-left: 6px !important;
  padding-right: 12px !important;
}

.mobile-table .col-price {
  width: 1% !important;
  white-space: nowrap !important;
  text-align: right !important;
  padding-left: 8px !important;
  padding-right: 12px !important;
}

.product-name-ellipsis {
  display: block !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  max-width: 100% !important;
  font-size: 0.875rem !important;
  line-height: 1.4 !important;
}

.text-no-wrap {
  white-space: nowrap !important;
}

.table-img-box {
  width: 44px;
  height: 44px;
  border-color: rgba(0, 0, 0, 0.08);
}

.v-theme--dark .table-img-box {
  border-color: rgba(255, 255, 255, 0.08);
}

/* ── FULL WIDTH PAGINATION (Evenly Stretched Across Container) ─────────────── */
.pagination-wrapper {
  width: 100%;
}

:deep(.full-width-pagination) {
  width: 100% !important;
}

:deep(.full-width-pagination .v-pagination__list) {
  width: 100% !important;
  display: flex !important;
  justify-content: space-between !important;
  gap: 6px !important;
  padding: 0 !important;
  margin: 0 !important;
}

:deep(.full-width-pagination .v-pagination__item),
:deep(.full-width-pagination .v-pagination__prev),
:deep(.full-width-pagination .v-pagination__next) {
  flex: 1 1 0 !important;
  display: flex !important;
  justify-content: center !important;
  margin: 0 !important;
}

:deep(.full-width-pagination .v-pagination__item .v-btn),
:deep(.full-width-pagination .v-pagination__prev .v-btn),
:deep(.full-width-pagination .v-pagination__next .v-btn) {
  width: 100% !important;
  min-width: 0 !important;
  height: 38px !important;
  border-radius: 8px !important;
}

/* ── EXACT POPUP STYLES MATCHING ProductPickerDialog ──────────────────────── */
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
