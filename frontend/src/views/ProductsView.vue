<template>
  <div class="products-container pa-4 pa-md-6">
    <!-- ── Page Header ──────────────────────────────────────────────────────── -->
    <div class="d-flex flex-wrap align-center justify-space-between gap-4 mb-6">
      <div>
        <div class="d-flex align-center gap-2">
          <v-icon size="28" color="primary">lucide-package</v-icon>
          <h1 class="text-h5 font-weight-bold">Quản lý Sản phẩm (Danh mục Directus)</h1>
        </div>
        <p class="text-body-2 text-medium-emphasis mt-1">
          Quản lý {{ stats.totalAll || 40 }} sản phẩm chính thức từ danh mục Directus. Chỉ cho phép tùy chỉnh Ngành hàng & Thương hiệu.
        </p>
      </div>

      <!-- Quick Stats -->
      <div class="d-flex flex-wrap gap-2">
        <v-chip color="primary" variant="tonal" class="font-weight-medium">
          <v-icon start size="16">lucide-layers</v-icon>
          Directus: {{ stats.totalAll || products.length }}
        </v-chip>
        <v-chip color="success" variant="tonal" class="font-weight-medium">
          <v-icon start size="16">lucide-check-circle-2</v-icon>
          Đã phân ngành: {{ stats.categorizedCount || 0 }}
        </v-chip>
        <v-chip color="warning" variant="tonal" class="font-weight-medium">
          <v-icon start size="16">lucide-alert-circle</v-icon>
          Chưa phân ngành: {{ stats.uncategorizedCount || 0 }}
        </v-chip>
      </div>
    </div>

    <!-- ── Search & Filter Card ─────────────────────────────────────────────── -->
    <v-card class="elevation-1 rounded-lg mb-4" variant="outlined">
      <v-card-text class="pa-4">
        <div class="row-filters d-flex flex-wrap align-center gap-3">
          <!-- Search input -->
          <v-text-field
            v-model="searchQuery"
            density="compact"
            variant="outlined"
            placeholder="Tìm theo mã SKU hoặc tên sản phẩm..."
            prepend-inner-icon="lucide-search"
            hide-details
            clearable
            class="filter-search flex-grow-1"
            style="min-width: 260px;"
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
            style="min-width: 180px;"
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
            style="min-width: 180px;"
            @update:model-value="fetchProducts(1)"
          />


          <!-- Refresh button -->
          <v-btn
            icon
            size="small"
            variant="text"
            title="Tải lại danh sách"
            :loading="loading"
            @click="reloadAll"
          >
            <v-icon size="18">lucide-refresh-cw</v-icon>
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- ── Floating Bulk Action Toolbar (appears when items selected) ───────── -->
    <v-slide-y-transition>
      <v-card
        v-if="selectedIds.length > 0"
        color="primary"
        theme="dark"
        class="mb-4 elevation-4 rounded-lg d-flex align-center justify-space-between px-4 py-3"
      >
        <div class="d-flex align-center gap-2">
          <v-icon size="20">lucide-check-square</v-icon>
          <span class="font-weight-bold">Đã chọn {{ selectedIds.length }} sản phẩm</span>
        </div>
        <div class="d-flex align-center gap-2">
          <v-btn
            color="white"
            variant="elevated"
            class="text-primary font-weight-bold text-none"
            size="small"
            @click="openBulkEditModal"
          >
            <v-icon start size="16">lucide-tag</v-icon>
            Gán Ngành hàng & Thương hiệu hàng loạt
          </v-btn>
          <v-btn
            variant="text"
            color="white"
            size="small"
            @click="selectedIds = []"
          >
            Bỏ chọn
          </v-btn>
        </div>
      </v-card>
    </v-slide-y-transition>

    <!-- ── Products Table ───────────────────────────────────────────────────── -->
    <v-card class="elevation-1 rounded-lg" variant="outlined">
      <v-table density="comfortable" hover class="products-table">
        <thead>
          <tr>
            <th style="width: 44px;">
              <v-checkbox
                :model-value="isAllSelected"
                :indeterminate="isPartiallySelected"
                hide-details
                density="compact"
                @update:model-value="toggleSelectAll"
              />
            </th>
            <th style="width: 68px;">Ảnh</th>
            <th style="min-width: 110px;">Mã SKU</th>
            <th style="min-width: 240px;">Tên sản phẩm (Directus)</th>
            <th style="min-width: 170px;">Ngành hàng (Category)</th>
            <th style="min-width: 140px;">Thương hiệu (Brand)</th>
            <th style="min-width: 110px;">Quy cách / ĐVT</th>
            <th style="min-width: 130px; text-align: right;">Giá niêm yết</th>
            <th style="width: 90px; text-align: center;">Chi tiết</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && products.length === 0">
            <td colspan="9" class="text-center py-8 text-medium-emphasis">
              <v-progress-circular indeterminate color="primary" class="mr-2" size="24" />
              Đang tải danh mục sản phẩm Directus...
            </td>
          </tr>
          <tr v-else-if="products.length === 0">
            <td colspan="9" class="text-center py-10 text-medium-emphasis">
              <v-icon size="40" class="mb-2 d-block mx-auto opacity-50">lucide-package-open</v-icon>
              Không tìm thấy sản phẩm Directus nào phù hợp
            </td>
          </tr>
          <tr
            v-for="item in products"
            :key="item.id"
            class="cursor-pointer"
            :class="{ 'selected-row': selectedIds.includes(item.id) }"
            @click="openDetailModal(item)"
          >
            <!-- Checkbox -->
            <td @click.stop>
              <v-checkbox
                :model-value="selectedIds.includes(item.id)"
                hide-details
                density="compact"
                @update:model-value="toggleSelectItem(item.id)"
              />
            </td>

            <!-- Thumbnail -->
            <td>
              <div class="table-img-box rounded-lg border bg-surface overflow-hidden d-flex align-center justify-center">
                <img
                  v-if="item.imageUrl"
                  :src="item.imageUrl"
                  :alt="item.name"
                  class="w-100 h-100"
                  style="object-fit: cover;"
                />
                <v-icon v-else size="20" color="grey">lucide-package</v-icon>
              </div>
            </td>

            <!-- SKU -->
            <td>
              <v-chip size="small" variant="tonal" color="primary" class="font-weight-bold">
                {{ item.sku || item.default_code || 'N/A' }}
              </v-chip>
            </td>

            <!-- Name -->
            <td>
              <div class="font-weight-medium text-truncate" style="max-width: 320px;" :title="item.name">
                {{ item.name }}
              </div>
              <div v-if="item.product_group_name" class="text-caption text-secondary font-weight-medium mt-0.5">
                {{ item.product_group_name }}
              </div>
            </td>

            <!-- Category (Editable Field 1) -->
            <td>
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

            <!-- Brand (Editable Field 2) -->
            <td>
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

            <!-- Unit / Specification -->
            <td>
              <span class="text-caption text-medium-emphasis font-weight-medium">
                {{ item.specification || item.uomName || item.weight || 'Đơn vị' }}
              </span>
            </td>

            <!-- Price (Odoo Read-Only) -->
            <td style="text-align: right;">
              <span class="font-weight-bold text-body-2 text-success">
                {{ formatVND(item.listPrice || item.wholesalePrice || 0) }}
              </span>
              <div v-if="item.retailPrice" class="text-caption text-medium-emphasis">
                Lẻ: {{ formatVND(item.retailPrice) }}
              </div>
            </td>

            <!-- Actions -->
            <td style="text-align: center;" @click.stop>
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

      <!-- Pagination Footer -->
      <v-divider />
      <div class="d-flex flex-wrap align-center justify-space-between pa-4 gap-3">
        <div class="text-caption text-medium-emphasis">
          Hiển thị <strong>{{ products.length }}</strong> trong tổng số <strong>{{ totalProducts }}</strong> sản phẩm Directus
        </div>

        <v-pagination
          v-if="totalPages > 1"
          v-model="currentPage"
          :length="totalPages"
          :total-visible="7"
          density="compact"
          color="primary"
          @update:model-value="fetchProducts"
        />
      </div>
    </v-card>

    <!-- ── Product Detail & Classification Modal (EXACT popup from ProductPickerDialog) ── -->
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

          <!-- ── 2 EDITABLE FIELDS: NGÀNH HÀNG & THƯƠNG HIỆU (Matching design of other cards) ── -->
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

          <!-- Rich Details from Directus (Specification, Ingredients, Nutrition, Target, Preservation, Description) -->
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { api } from '@/api';

// ── State ────────────────────────────────────────────────────────────────────
const loading = ref(false);
const saving = ref(false);
const products = ref<any[]>([]);
const totalProducts = ref(0);
const totalPages = ref(1);
const currentPage = ref(1);
const pageLimit = ref(50);

const stats = reactive({
  totalAll: 0,
  categorizedCount: 0,
  uncategorizedCount: 0,
});

// Filters
const searchQuery = ref('');
const selectedCategoryFilter = ref<string | null>(null);
const selectedBrandFilter = ref<string | null>(null);

// Autocomplete suggestions
const suggestedCategories = ref<string[]>([]);
const suggestedBrands = ref<string[]>([]);

// Selection for bulk actions
const selectedIds = ref<string[]>([]);

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
      if (res.data.stats) {
        Object.assign(stats, res.data.stats);
      }
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

function reloadAll() {
  fetchSuggestions();
  fetchProducts(1);
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

.products-table th {
  font-weight: 600 !important;
  font-size: 0.825rem !important;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--v-medium-emphasis-opacity);
}

.selected-row {
  background-color: rgba(var(--v-theme-primary), 0.06) !important;
}

.table-img-box {
  width: 44px;
  height: 44px;
  border-color: rgba(0, 0, 0, 0.08);
}

.v-theme--dark .table-img-box {
  border-color: rgba(255, 255, 255, 0.08);
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
