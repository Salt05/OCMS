<template>
  <v-dialog
    :model-value="modelValue"
    max-width="1120px"
    persistent
    scrollable
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card class="rounded-xl overflow-hidden product-selector-card">
      <!-- ── Dialog Header ────────────────────────────────────────────────────── -->
      <v-card-title class="d-flex align-center justify-space-between pa-4 border-b bg-surface">
        <div class="d-flex align-center gap-2">
          <v-icon color="primary" size="24">{{ multiple ? 'mdi-package-variant-closed-plus' : 'mdi-gift-outline' }}</v-icon>
          <div>
            <h2 class="text-h6 font-weight-bold mb-0">{{ title }}</h2>
            <div class="text-caption text-medium-emphasis">
              {{ subtitle }}
            </div>
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="handleClose" />
      </v-card-title>

      <!-- ── Dialog Body ──────────────────────────────────────────────────────── -->
      <v-card-text class="pa-4 pa-md-5" style="max-height: 75vh">
        <!-- 1. Filters Bar (Tương tự trang /products) -->
        <v-card class="mb-4 pa-3 rounded-lg border elevation-0 bg-slate-50 dark:bg-slate-800/60">
          <div class="d-flex flex-wrap align-center gap-3">
            <!-- Search SKU or Name -->
            <v-text-field
              v-model="searchQuery"
              density="compact"
              variant="outlined"
              placeholder="Tìm theo mã SKU hoặc tên sản phẩm..."
              prepend-inner-icon="mdi-magnify"
              hide-details
              clearable
              class="flex-grow-1"
              style="min-width: 260px;"
              @update:model-value="onSearchDebounced"
            />

            <!-- Category Filter -->
            <v-select
              v-model="selectedCategory"
              :items="categoryOptions"
              density="compact"
              variant="outlined"
              label="Ngành hàng"
              hide-details
              clearable
              style="min-width: 200px;"
              @update:model-value="fetchProducts(1)"
            />

            <!-- Brand Filter -->
            <v-select
              v-model="selectedBrand"
              :items="brandOptions"
              density="compact"
              variant="outlined"
              label="Thương hiệu"
              hide-details
              clearable
              style="min-width: 200px;"
              @update:model-value="fetchProducts(1)"
            />

            <!-- Refresh Button -->
            <v-btn
              icon="mdi-refresh"
              variant="tonal"
              size="small"
              color="primary"
              :loading="loading"
              title="Tải lại danh sách"
              @click="reloadProducts"
            />
          </div>
        </v-card>

        <!-- 2. Quick Selection Toolbar -->
        <div class="d-flex flex-wrap align-center justify-space-between gap-2 mb-3 px-1">
          <div class="d-flex align-center gap-2">
            <v-chip color="primary" variant="flat" class="font-weight-bold" size="default">
              <v-icon start size="18">mdi-check-circle-outline</v-icon>
              <template v-if="multiple">
                Đã chọn: {{ tempSelectedSkus.size }} sản phẩm
              </template>
              <template v-else>
                {{ tempSelectedSkus.size > 0 ? `Đã chọn: ${Array.from(tempSelectedSkus)[0]}` : 'Chưa chọn sản phẩm' }}
              </template>
            </v-chip>

            <v-chip
              v-if="selectedCategory || selectedBrand"
              color="secondary"
              variant="tonal"
              size="small"
              class="font-weight-medium"
            >
              Bộ lọc: {{ [selectedCategory, selectedBrand].filter(Boolean).join(' • ') }}
            </v-chip>
          </div>

          <div v-if="multiple" class="d-flex align-center gap-2">
            <v-btn
              size="small"
              variant="tonal"
              color="primary"
              prepend-icon="mdi-checkbox-multiple-marked"
              class="text-none font-weight-medium"
              :disabled="loading || products.length === 0"
              @click="selectAllCurrentFiltered"
            >
              Chọn tất cả sản phẩm đang lọc ({{ totalFilteredCount }})
            </v-btn>

            <v-btn
              v-if="tempSelectedSkus.size > 0"
              size="small"
              variant="text"
              color="error"
              prepend-icon="mdi-close-circle-outline"
              class="text-none"
              @click="clearAllSelections"
            >
              Bỏ chọn tất cả
            </v-btn>
          </div>
          <div v-else-if="tempSelectedSkus.size > 0">
            <v-btn
              size="small"
              variant="text"
              color="error"
              prepend-icon="mdi-close-circle-outline"
              class="text-none"
              @click="clearAllSelections"
            >
              Bỏ chọn quà này
            </v-btn>
          </div>
        </div>

        <!-- 3. Products Table -->
        <v-card class="rounded-lg border elevation-0 overflow-hidden">
          <v-table density="comfortable" hover class="products-table">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-800">
                <th style="width: 48px;">
                  <v-checkbox
                    v-if="multiple"
                    :model-value="isAllCurrentPageSelected"
                    :indeterminate="isPartiallyCurrentPageSelected"
                    hide-details
                    density="compact"
                    @update:model-value="toggleSelectCurrentPage"
                  />
                  <span v-else class="text-caption font-weight-bold">Chọn</span>
                </th>
                <th style="width: 68px;">Ảnh</th>
                <th style="min-width: 100px;">Mã SKU</th>
                <th style="min-width: 240px;">Tên sản phẩm</th>
                <th style="min-width: 160px;">Ngành hàng (Category)</th>
                <th style="min-width: 140px;">Thương hiệu (Brand)</th>
                <th style="min-width: 110px;">Quy cách / ĐVT</th>
                <th style="min-width: 130px; text-align: right;">Giá niêm yết</th>
              </tr>
            </thead>
            <tbody>
              <!-- Loading state -->
              <tr v-if="loading && products.length === 0">
                <td colspan="8" class="text-center py-8 text-medium-emphasis">
                  <v-progress-circular indeterminate color="primary" class="mr-2" size="24" />
                  Đang tải danh mục sản phẩm...
                </td>
              </tr>

              <!-- Empty state -->
              <tr v-else-if="products.length === 0">
                <td colspan="8" class="text-center py-10 text-medium-emphasis">
                  <v-icon size="40" class="mb-2 d-block mx-auto opacity-50">mdi-package-variant</v-icon>
                  Không tìm thấy sản phẩm nào phù hợp với bộ lọc
                </td>
              </tr>

              <!-- Product rows -->
              <tr
                v-for="item in products"
                :key="item.id || item.sku"
                class="cursor-pointer"
                :class="{ 'bg-primary-subtle': isSelected(item.sku) }"
                @click="toggleItem(item)"
              >
                <!-- Checkbox / Radio -->
                <td @click.stop>
                  <v-checkbox
                    v-if="multiple"
                    :model-value="isSelected(item.sku)"
                    hide-details
                    density="compact"
                    color="primary"
                    @update:model-value="toggleItem(item)"
                  />
                  <v-icon
                    v-else
                    :color="isSelected(item.sku) ? 'primary' : 'medium-emphasis'"
                    size="22"
                    @click="toggleItem(item)"
                  >
                    {{ isSelected(item.sku) ? 'mdi-radiobox-marked' : 'mdi-radiobox-blank' }}
                  </v-icon>
                </td>

                <!-- Thumbnail -->
                <td>
                  <div class="table-img-box rounded border bg-surface overflow-hidden d-flex align-center justify-center">
                    <img
                      v-if="item.imageUrl"
                      :src="item.imageUrl"
                      :alt="item.name"
                      class="w-100 h-100"
                      style="object-fit: cover;"
                      @error="() => { item.imageUrl = undefined; }"
                    />
                    <v-icon v-else size="20" color="grey">mdi-package-variant-closed</v-icon>
                  </div>
                </td>

                <!-- SKU -->
                <td>
                  <v-chip size="small" variant="tonal" color="primary" class="font-weight-bold font-mono">
                    {{ item.sku || 'N/A' }}
                  </v-chip>
                </td>

                <!-- Name -->
                <td>
                  <div class="font-weight-medium text-body-2" style="max-width: 280px;" :title="item.name">
                    {{ item.name }}
                  </div>
                </td>

                <!-- Category -->
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
                  <span v-else class="text-caption text-medium-emphasis font-italic">Chưa phân loại</span>
                </td>

                <!-- Brand -->
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
                  <span v-else class="text-caption text-medium-emphasis font-italic">Chưa có</span>
                </td>

                <!-- Unit / Specification -->
                <td>
                  <span class="text-caption text-medium-emphasis font-weight-medium">
                    {{ item.specification || item.uomName || item.weight || 'Đơn vị' }}
                  </span>
                </td>

                <!-- Price -->
                <td class="text-right">
                  <div class="font-weight-bold text-body-2 text-primary">
                    {{ formatVND(item.wholesalePrice || item.listPrice || 0) }}
                  </div>
                  <div v-if="item.retailPrice" class="text-caption text-medium-emphasis">
                    Lẻ: {{ formatVND(item.retailPrice) }}
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="d-flex justify-center mt-3">
          <v-pagination
            v-model="currentPage"
            :length="totalPages"
            :total-visible="5"
            density="compact"
            size="small"
            @update:model-value="fetchProducts"
          />
        </div>
      </v-card-text>

      <!-- ── Dialog Footer ────────────────────────────────────────────────────── -->
      <v-divider />
      <v-card-actions class="pa-4 bg-surface d-flex justify-space-between align-center">
        <div class="text-body-2 text-medium-emphasis">
          Đã chọn: <strong class="text-primary">{{ tempSelectedSkus.size }}</strong> sản phẩm
        </div>

        <div class="d-flex align-center gap-2">
          <v-btn variant="outlined" class="text-none" @click="handleClose">
            Hủy bỏ
          </v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            prepend-icon="mdi-check-bold"
            class="text-none font-weight-bold px-4"
            @click="handleConfirm"
          >
            Xác nhận áp dụng ({{ tempSelectedSkus.size }} sản phẩm)
          </v-btn>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { api } from '@/api';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    selectedSkus: string[];
    title?: string;
    subtitle?: string;
    multiple?: boolean;
  }>(),
  {
    title: 'Chọn sản phẩm áp dụng ưu đãi',
    subtitle: 'Lọc nhanh theo Ngành hàng hoặc Thương hiệu để chọn danh sách sản phẩm tham gia chương trình.',
    multiple: true,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'confirm', skus: string[], productMap: Record<string, any>): void;
}>();

// ── State ────────────────────────────────────────────────────────────────────
const loading = ref(false);
const products = ref<any[]>([]);
const totalFilteredCount = ref(0);
const totalPages = ref(1);
const currentPage = ref(1);
const pageLimit = ref(50);

// Filters
const searchQuery = ref('');
const selectedCategory = ref<string | null>(null);
const selectedBrand = ref<string | null>(null);

// Suggestions from backend
const suggestedCategories = ref<string[]>([]);
const suggestedBrands = ref<string[]>([]);

// Selection tracking: Set of SKUs + Cache of Product Objects for fast lookup
const tempSelectedSkus = ref<Set<string>>(new Set());
const productCache = reactive<Record<string, any>>({});

// ── Computed Filter Options ──────────────────────────────────────────────────
const categoryOptions = computed(() => {
  const list: Array<{ title: string; value: string | null }> = [{ title: 'Tất cả ngành hàng', value: null }];
  suggestedCategories.value.forEach((c) => {
    list.push({ title: c, value: c });
  });
  return list;
});

const brandOptions = computed(() => {
  const list: Array<{ title: string; value: string | null }> = [{ title: 'Tất cả thương hiệu', value: null }];
  suggestedBrands.value.forEach((b) => {
    list.push({ title: b, value: b });
  });
  return list;
});

// Selection helpers
function isSelected(sku?: string): boolean {
  if (!sku) return false;
  return tempSelectedSkus.value.has(sku);
}

const isAllCurrentPageSelected = computed(() => {
  if (products.value.length === 0) return false;
  return products.value.every((p) => p.sku && tempSelectedSkus.value.has(p.sku));
});

const isPartiallyCurrentPageSelected = computed(() => {
  if (products.value.length === 0) return false;
  const count = products.value.filter((p) => p.sku && tempSelectedSkus.value.has(p.sku)).length;
  return count > 0 && count < products.value.length;
});

// Watch dialog open to initialize selections
watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      tempSelectedSkus.value = new Set(props.selectedSkus || []);
      if (suggestedCategories.value.length === 0) {
        fetchSuggestions();
      }
      fetchProducts(1);
    }
  },
  { immediate: true }
);

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

let searchTimeout: any = null;
function onSearchDebounced() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    fetchProducts(1);
  }, 300);
}

async function fetchProducts(page = currentPage.value) {
  loading.value = true;
  currentPage.value = page;

  try {
    const params: any = {
      page: currentPage.value,
      limit: pageLimit.value,
      search: searchQuery.value || undefined,
      category: selectedCategory.value || undefined,
      brand: selectedBrand.value || undefined,
    };

    const res = await api.get('/products', { params });
    if (res.data.success) {
      products.value = res.data.products || [];
      totalFilteredCount.value = res.data.total || 0;
      totalPages.value = res.data.totalPages || 1;

      // Cache product metadata for parent reference
      products.value.forEach((p) => {
        if (p.sku) {
          productCache[p.sku] = p;
        }
      });
    }
  } catch (err: any) {
    console.error('Error fetching products in selector:', err);
  } finally {
    loading.value = false;
  }
}

function reloadProducts() {
  fetchSuggestions();
  fetchProducts(1);
}

// ── Selection Actions ────────────────────────────────────────────────────────
function toggleItem(item: any) {
  if (!item.sku) return;
  if (!props.multiple) {
    tempSelectedSkus.value = new Set([item.sku]);
    productCache[item.sku] = item;
    return;
  }
  const next = new Set(tempSelectedSkus.value);
  if (next.has(item.sku)) {
    next.delete(item.sku);
  } else {
    next.add(item.sku);
    productCache[item.sku] = item;
  }
  tempSelectedSkus.value = next;
}

function toggleSelectCurrentPage(checked: boolean | null) {
  const next = new Set(tempSelectedSkus.value);
  if (checked) {
    products.value.forEach((p) => {
      if (p.sku) {
        next.add(p.sku);
        productCache[p.sku] = p;
      }
    });
  } else {
    products.value.forEach((p) => {
      if (p.sku) {
        next.delete(p.sku);
      }
    });
  }
  tempSelectedSkus.value = next;
}

async function selectAllCurrentFiltered() {
  // If all products are already on current page, add them directly
  if (totalFilteredCount.value <= products.value.length) {
    const next = new Set(tempSelectedSkus.value);
    products.value.forEach((p) => {
      if (p.sku) {
        next.add(p.sku);
        productCache[p.sku] = p;
      }
    });
    tempSelectedSkus.value = next;
    return;
  }

  // If there are multiple pages, fetch all matching SKUs with limit=1000
  loading.value = true;
  try {
    const params: any = {
      page: 1,
      limit: 1000,
      search: searchQuery.value || undefined,
      category: selectedCategory.value || undefined,
      brand: selectedBrand.value || undefined,
    };
    const res = await api.get('/products', { params });
    if (res.data.success && res.data.products) {
      const next = new Set(tempSelectedSkus.value);
      res.data.products.forEach((p: any) => {
        if (p.sku) {
          next.add(p.sku);
          productCache[p.sku] = p;
        }
      });
      tempSelectedSkus.value = next;
    }
  } catch (err: any) {
    console.error('Error selecting all filtered products:', err);
  } finally {
    loading.value = false;
  }
}

function clearAllSelections() {
  tempSelectedSkus.value = new Set();
}

function handleClose() {
  emit('update:modelValue', false);
}

function handleConfirm() {
  emit('confirm', Array.from(tempSelectedSkus.value), productCache);
  emit('update:modelValue', false);
}

// ── Formatters ───────────────────────────────────────────────────────────────
function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));
}
</script>

<style scoped>
.table-img-box {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
}
.bg-primary-subtle {
  background-color: rgba(var(--v-theme-primary), 0.08) !important;
}
.products-table :deep(th) {
  font-weight: 600 !important;
  font-size: 0.8rem !important;
  color: rgb(100, 116, 139) !important;
}
</style>
