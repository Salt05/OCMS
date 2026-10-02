<template>
  <div class="pa-6">
    <!-- Header -->
    <div class="d-flex justify-space-between align-center mb-6 flex-wrap ga-3" style="gap: 16px;">
      <div class="d-flex align-center ga-2" style="gap: 8px;">
        <v-icon color="primary" size="28">lucide-warehouse</v-icon>
        <h1 class="text-h4 font-weight-bold">Tổng quan & Tồn kho</h1>
      </div>
      <div class="d-flex align-center flex-wrap ga-2" style="gap: 8px;">
        <v-btn
          variant="outlined"
          color="primary"
          prepend-icon="lucide-rotate-cw"
          :loading="inventoryStore.loading || syncingOdoo"
          @click="loadAll"
          class="text-none font-weight-medium"
        >
          Làm mới
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="lucide-file-plus"
          to="/inventory/purchase"
          class="text-none font-weight-medium"
        >
          Phiếu nhập
        </v-btn>
        <v-btn
          color="secondary"
          variant="tonal"
          prepend-icon="lucide-history"
          to="/inventory/history"
          class="text-none font-weight-medium"
        >
          Lịch sử xuất nhập
        </v-btn>
        <v-btn
          :color="selectionMode ? 'primary' : 'secondary'"
          :variant="selectionMode ? 'flat' : 'outlined'"
          :prepend-icon="selectionMode ? 'lucide-x' : 'lucide-check-square'"
          class="text-none font-weight-medium"
          @click="toggleSelectionMode"
        >
          {{ selectionMode ? 'Bỏ chọn' : 'Chọn' }}
        </v-btn>
        <v-btn
          v-if="selectionMode && selectedProducts.length"
          color="primary"
          prepend-icon="lucide-file-plus"
          class="text-none font-weight-medium"
          @click="openCreateDialog(selectedProducts)"
        >
          Tạo phiếu ({{ selectedProducts.length }})
        </v-btn>
      </div>
    </div>

    <!-- Filter & Table -->
    <v-card rounded="lg" elevation="2" class="mb-6">
      <div class="pa-4 border-b">
        <v-row align="center">
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="categoryFilter"
              :items="['Tất cả ngành hàng', ...categories]"
              label="Ngành hàng"
              variant="outlined"
              density="compact"
              hide-details
              @update:modelValue="onFilterChange"
            ></v-select>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="brandFilter"
              :items="['Tất cả hãng', ...brands]"
              label="Hãng"
              variant="outlined"
              density="compact"
              hide-details
              @update:modelValue="onFilterChange"
            ></v-select>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="statusFilter"
              :items="[
                { title: 'Tất cả trạng thái', value: '' },
                { title: 'Đủ hàng', value: 'in_stock' },
                { title: 'Sắp hết hàng', value: 'low_stock' },
                { title: 'Hết hàng', value: 'out_of_stock' }
              ]"
              label="Trạng thái tồn kho"
              variant="outlined"
              density="compact"
              hide-details
              @update:modelValue="onFilterChange"
            ></v-select>
          </v-col>
          <v-col cols="12" md="3">
            <v-text-field
              v-model="search"
              prepend-inner-icon="lucide-search"
              label="Tìm kiếm theo SKU, Tên sản phẩm..."
              variant="outlined"
              density="compact"
              hide-details
              clearable
              @keyup.enter="onFilterChange"
              @click:clear="onClearSearch"
            ></v-text-field>
          </v-col>
        </v-row>
      </div>

      <v-table hover>
        <thead>
          <tr>
            <th v-if="selectionMode" style="width: 52px;">
              <v-checkbox-btn
                :model-value="allVisibleSelected"
                :indeterminate="someVisibleSelected && !allVisibleSelected"
                color="primary"
                @update:modelValue="toggleAllVisible"
              ></v-checkbox-btn>
            </th>
            <th style="width: 60px;">Ảnh</th>
            <th class="text-no-wrap">SKU</th>
            <th class="text-no-wrap" style="min-width: 200px;">Tên sản phẩm</th>
            <th class="text-no-wrap">Phân loại</th>
            <th class="text-right text-no-wrap cursor-pointer" @click="toggleSort('onHand')">
              Tồn thực tế
              <v-icon size="14" v-if="sortBy === 'onHand'">{{ sortOrder === 'asc' ? 'lucide-arrow-up' : 'lucide-arrow-down' }}</v-icon>
            </th>
            <th class="text-right text-no-wrap cursor-pointer" @click="toggleSort('reserved')">
              Đang giữ
              <v-icon size="14" v-if="sortBy === 'reserved'">{{ sortOrder === 'asc' ? 'lucide-arrow-up' : 'lucide-arrow-down' }}</v-icon>
            </th>
            <th class="text-right text-no-wrap cursor-pointer" @click="toggleSort('soldQuantity')">
              Đã bán (Odoo)
              <v-icon size="14" v-if="sortBy === 'soldQuantity'">{{ sortOrder === 'asc' ? 'lucide-arrow-up' : 'lucide-arrow-down' }}</v-icon>
            </th>
            <th class="text-right text-no-wrap font-weight-bold text-success cursor-pointer" @click="toggleSort('available')">
              Có thể bán
              <v-icon size="14" v-if="sortBy === 'available'">{{ sortOrder === 'asc' ? 'lucide-arrow-up' : 'lucide-arrow-down' }}</v-icon>
            </th>
            <th class="text-center text-no-wrap">Trạng thái</th>
            <th class="text-right text-no-wrap" style="width: 120px;">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="inventoryStore.loading">
            <td :colspan="selectionMode ? 11 : 10" class="text-center pa-6">
              <v-progress-circular indeterminate color="primary" size="32"></v-progress-circular>
            </td>
          </tr>
          <tr v-else-if="items.length === 0">
            <td :colspan="selectionMode ? 11 : 10" class="text-center pa-8 text-grey">Không có dữ liệu tồn kho</td>
          </tr>
          <tr v-else v-for="item in items" :key="item.id" class="align-middle text-body-1 cursor-pointer" @click="openDetail(item)" hover>
            <td v-if="selectionMode" @click.stop>
              <v-checkbox-btn
                :model-value="isSelected(item.id)"
                color="primary"
                @update:modelValue="toggleProduct(item)"
              ></v-checkbox-btn>
            </td>
            <td>
              <v-avatar size="40" rounded class="bg-grey-lighten-3">
                <v-img v-if="item.imageUrl" :src="item.imageUrl" cover></v-img>
                <v-icon v-else color="grey">lucide-package</v-icon>
              </v-avatar>
            </td>
            <td class="font-weight-bold text-no-wrap">{{ item.sku }}</td>
            <td class="font-weight-medium">
              <div class="text-truncate" style="max-width: 250px;" :title="item.productName">
                {{ item.productName }}
              </div>
            </td>
            <td class="text-grey-darken-1 text-caption text-no-wrap">{{ item.category || '---' }}</td>
            <td class="text-right font-weight-medium">{{ item.onHand }}</td>
            <td class="text-right text-warning">{{ item.reserved }}</td>
            <td class="text-right text-grey-darken-1">{{ item.soldQuantity }}</td>
            <td class="text-right font-weight-bold text-success">{{ item.available }}</td>
            <td class="text-center">
              <v-chip
                size="small"
                :color="item.status === 'Đủ hàng' ? 'success' : (item.status === 'Sắp hết' ? 'warning' : 'error')"
                variant="flat"
              >
                {{ item.status }}
              </v-chip>
            </td>
            <td class="text-right text-no-wrap" @click.stop>
              <div class="d-flex justify-end align-center">
                <v-btn
                  icon="lucide-bell"
                  variant="tonal"
                  size="small"
                  color="warning"
                  class="mr-2"
                  title="Thiết lập cảnh báo sắp hết hàng"
                  @click.stop="openMinStockDialog(item)"
                ></v-btn>
                <v-btn
                  icon="lucide-file-plus"
                  variant="tonal"
                  size="small"
                  color="primary"
                  title="Tạo phiếu"
                  @click.stop="openCreateDialog([item])"
                ></v-btn>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>
      
      <!-- Pagination -->
      <div class="pa-4 border-t d-flex justify-space-between align-center" v-if="totalPages > 1">
        <span class="text-caption text-grey">Tổng {{ totalItems }} sản phẩm</span>
        <v-pagination v-model="page" :length="totalPages" density="compact" @update:modelValue="loadItems"></v-pagination>
      </div>
    </v-card>

    <!-- Detail Modal -->
    <ProductDetailModal
      v-model="detailModalVisible"
      :product="detailItem"
      show-inventory-history
      defaultTab="info"
    />
    <InventoryTransactionDialog
      v-model="transactionDialogVisible"
      :initial-products="dialogProducts"
      @saved="onTransactionSaved"
    />

    <!-- Min Stock Config Dialog -->
    <v-dialog v-model="minStockDialog.visible" max-width="450px">
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold d-flex align-center">
          <v-icon color="warning" class="mr-2">lucide-bell</v-icon>
          Thiết lập cảnh báo sắp hết hàng
        </v-card-title>
        <v-card-text>
          <div class="mb-4 text-body-2 text-grey-darken-1">
            Sản phẩm: <span class="font-weight-medium text-black">{{ minStockDialog.product?.productName }}</span><br>
            SKU: <span class="font-weight-medium text-black">{{ minStockDialog.product?.sku }}</span>
          </div>
          <v-text-field
            v-model.number="minStockDialog.value"
            type="number"
            label="Số lượng cảnh báo (Dựa trên Có thể bán)"
            variant="outlined"
            density="compact"
            min="0"
            hint="Sản phẩm sẽ chuyển trạng thái 'Sắp hết' khi: Có thể bán <= mức này."
            persistent-hint
          ></v-text-field>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="minStockDialog.visible = false" :disabled="minStockDialog.loading">Hủy</v-btn>
          <v-btn color="primary" variant="flat" :loading="minStockDialog.loading" @click="saveMinStock">Lưu thay đổi</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Toast Notification -->
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3500" location="top right">
      {{ snackbar.text }}
      <template #actions>
        <v-btn variant="text" color="white" @click="snackbar.show = false">Đóng</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api';
import { useInventoryStore } from '@/stores/inventory';
import ProductDetailModal from '@/components/common/ProductDetailModal.vue';
import InventoryTransactionDialog from '@/components/inventory/InventoryTransactionDialog.vue';

const inventoryStore = useInventoryStore();

// State
const search = ref('');
const statusFilter = ref('');
const categoryFilter = ref('Tất cả ngành hàng');
const brandFilter = ref('Tất cả hãng');
const sortBy = ref('');
const sortOrder = ref('desc');
const page = ref(1);
const detailModalVisible = ref(false);
const detailItem = ref<any>(null);
const selectionMode = ref(false);
const selectedProducts = ref<any[]>([]);
const transactionDialogVisible = ref(false);
const dialogProducts = ref<any[]>([]);
const syncingOdoo = ref(false);
const minStockDialog = ref({
  visible: false,
  loading: false,
  product: null as any,
  value: 0
});
const snackbar = ref({
  show: false,
  text: '',
  color: 'success'
});

function openDetail(item: any) {
  detailItem.value = {
    ...item,
    name: item.name || item.productName,
  };
  detailModalVisible.value = true;
}

// Computed
const categories = computed(() => {
  const set = new Set<string>();
  inventoryStore.items.forEach(item => {
    if (item.category) set.add(item.category);
  });
  return Array.from(set);
});

const brands = computed(() => {
  const set = new Set<string>();
  inventoryStore.items.forEach(item => {
    if (item.brand) set.add(item.brand);
  });
  return Array.from(set);
});

const items = computed(() => inventoryStore.items);
const totalItems = computed(() => inventoryStore.totalItems);
const totalPages = computed(() => Math.ceil(totalItems.value / 50));
const selectedProductIds = computed(() => new Set(selectedProducts.value.map(product => product.id)));
const allVisibleSelected = computed(() => items.value.length > 0 && items.value.every(item => selectedProductIds.value.has(item.id)));
const someVisibleSelected = computed(() => items.value.some(item => selectedProductIds.value.has(item.id)));

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value;
  if (!selectionMode.value) selectedProducts.value = [];
}

function isSelected(id: string) {
  return selectedProductIds.value.has(id);
}

function toggleProduct(item: any) {
  if (isSelected(item.id)) {
    selectedProducts.value = selectedProducts.value.filter(product => product.id !== item.id);
  } else {
    selectedProducts.value = [...selectedProducts.value, item];
  }
}

function toggleAllVisible(value: boolean) {
  if (value) {
    const selectedIds = selectedProductIds.value;
    const additions = items.value.filter(item => !selectedIds.has(item.id));
    selectedProducts.value = [...selectedProducts.value, ...additions];
  } else {
    const visibleIds = new Set(items.value.map(item => item.id));
    selectedProducts.value = selectedProducts.value.filter(product => !visibleIds.has(product.id));
  }
}

function openCreateDialog(products: any[]) {
  dialogProducts.value = products.map(product => ({
    id: product.id,
    sku: product.sku,
    name: product.name || product.productName,
    imageUrl: product.imageUrl || null,
  }));
  transactionDialogVisible.value = true;
}

function openMinStockDialog(item: any) {
  minStockDialog.value.product = item;
  minStockDialog.value.value = item.minStock || 0;
  minStockDialog.value.visible = true;
}

async function saveMinStock() {
  if (!minStockDialog.value.product) return;
  minStockDialog.value.loading = true;
  try {
    await api.post('/inventory/min-stock', {
      sku: minStockDialog.value.product.sku,
      minStock: Number(minStockDialog.value.value) || 0
    });
    snackbar.value = { show: true, text: 'Đã cập nhật mức cảnh báo thành công', color: 'success' };
    minStockDialog.value.visible = false;
    await loadItems();
  } catch (err: any) {
    snackbar.value = { show: true, text: err.response?.data?.error || 'Lỗi khi cập nhật cảnh báo', color: 'error' };
  } finally {
    minStockDialog.value.loading = false;
  }
}

async function onTransactionSaved() {
  selectedProducts.value = [];
  await loadItems();
}

// Actions
async function loadAll() {
  syncingOdoo.value = true;
  try {
    const res = await api.post('/sync/products');
    const data = res.data;
    if (data.success) {
      snackbar.value = {
        show: true,
        text: `Đồng bộ thành công! Mới: ${data.createdCount}, Cập nhật: ${data.updatedCount}`,
        color: 'success'
      };
    }
  } catch (error: any) {
    snackbar.value = {
      show: true,
      text: error?.response?.data?.error || 'Lỗi đồng bộ Odoo',
      color: 'error'
    };
  } finally {
    syncingOdoo.value = false;
    await loadItems();
  }
}

async function loadItems() {
  await inventoryStore.fetchItems({
    search: search.value.trim(),
    status: statusFilter.value,
    category: categoryFilter.value === 'Tất cả ngành hàng' ? '' : categoryFilter.value,
    brand: brandFilter.value === 'Tất cả hãng' ? '' : brandFilter.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
    page: page.value,
    limit: 50
  });
}

function toggleSort(column: string) {
  if (sortBy.value === column) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = column;
    sortOrder.value = 'desc';
  }
  onFilterChange();
}

function onFilterChange() {
  page.value = 1;
  loadItems();
}

function onClearSearch() {
  search.value = '';
  onFilterChange();
}

onMounted(() => {
  loadItems();
});
</script>

<style scoped>
.border-b { border-bottom: 1px solid rgba(0,0,0,0.12); }
.border-t { border-top: 1px solid rgba(0,0,0,0.12); }
</style>
