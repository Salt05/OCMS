<template>
  <div class="product-picker-container d-flex flex-column h-100 bg-surface-variant border-e">
    <!-- Header / Search input -->
    <div class="pa-3 border-b bg-surface flex-shrink-0">
      <div class="d-flex align-center justify-space-between mb-2">
        <span class="text-subtitle-2 font-weight-bold d-flex align-center gap-1 text-high-emphasis">
          <v-icon size="18" color="primary">lucide-package-search</v-icon>
          Danh sách sản phẩm
        </span>
        <div class="d-flex align-center gap-1">
          <v-btn
            icon
            size="32"
            variant="text"
            rounded="lg"
            :loading="isSyncing || loadingProducts"
            title="Làm mới danh mục"
            aria-label="Làm mới danh mục"
            @click="syncProducts"
          >
            <v-icon size="15">lucide-refresh-cw</v-icon>
          </v-btn>
          <v-btn
            icon
            size="32"
            variant="text"
            rounded="lg"
            aria-label="Đóng bảng sản phẩm"
            @click="$emit('close')"
          >
            <v-icon size="16">lucide-x</v-icon>
          </v-btn>
        </div>
      </div>

      <v-text-field
        v-model="searchQuery"
        placeholder="Thanh tìm kiếm (theo tên, mã đơn)"
        variant="outlined"
        density="compact"
        hide-details
        clearable
        bg-color="surface"
        prepend-inner-icon="lucide-search"
        class="search-input"
        autofocus
      />
    </div>

    <!-- Product list -->
    <div class="product-list flex-grow-1 overflow-y-auto pa-2">
      <div v-if="loading" class="d-flex flex-column gap-2 pa-2">
        <v-skeleton-loader
          v-for="i in 5"
          :key="i"
          type="list-item-two-line"
          class="rounded-lg"
        />
      </div>

      <div
        v-else-if="filteredList.length === 0"
        class="d-flex flex-column align-center justify-center h-100 text-medium-emphasis pa-4 text-center"
      >
        <v-icon size="40" class="mb-2 opacity-50">lucide-search-x</v-icon>
        <div class="text-caption">Không tìm thấy sản phẩm nào</div>
        <div class="text-caption font-italic text-medium-emphasis">Thử gõ mã khác hoặc tên không dấu</div>
      </div>

      <div v-else class="d-flex flex-column gap-2">
        <div
          v-for="prod in filteredList"
          :key="prod.id"
          class="product-item-card d-flex align-center justify-space-between pa-2.5 bg-surface border rounded-lg shadow-xs"
          @click="selectProduct(prod)"
        >
          <!-- Left: Code & Name -->
          <div class="d-flex align-center gap-2 overflow-hidden mr-2">
            <v-avatar size="38" rounded="md" color="surface-variant" class="flex-shrink-0">
              <v-img
                v-if="prod.image_url"
                :src="prod.image_url"
                cover
              />
              <v-icon v-else size="18" class="opacity-60">lucide-image</v-icon>
            </v-avatar>

            <div class="d-flex flex-column overflow-hidden text-left">
              <div class="d-flex align-center gap-1.5">
                <span v-if="prod.default_code" class="product-sku font-weight-bold">
                  {{ prod.default_code }}
                </span>
                <span class="product-name text-body-2 font-weight-medium text-high-emphasis text-truncate">
                  {{ prod.name || prod.display_name }}
                </span>
              </div>
              <span v-if="prod.uom_name" class="text-caption text-medium-emphasis">
                ĐVT: {{ prod.uom_name }}
              </span>
            </div>
          </div>

          <!-- Right: Price & Add icon -->
          <div class="d-flex align-center gap-1 flex-shrink-0">
            <span class="text-body-2 font-weight-bold text-success">
              {{ formatCurrency(prod.list_price) }}
            </span>
            <v-icon size="16" color="primary" class="add-icon ml-1">lucide-plus-circle</v-icon>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer summary of available count -->
    <div class="pa-2 text-center text-caption text-medium-emphasis border-t bg-surface flex-shrink-0">
      Hiển thị {{ filteredList.length }} / {{ products.length }} sản phẩm
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useOdoo, type OdooProduct } from '@/composables/use-odoo';

const props = defineProps<{
  loading?: boolean;
}>();

const emit = defineEmits<{
  select: [product: OdooProduct];
  close: [];
}>();

const { products, filterProducts, formatCurrency, syncProducts, isSyncing, loadingProducts } = useOdoo();

const searchQuery = ref('');

const filteredList = computed(() => {
  return filterProducts(searchQuery.value);
});

function selectProduct(product: OdooProduct) {
  emit('select', product);
}
</script>

<style scoped>
.product-picker-container {
  width: 330px;
  min-width: 300px;
  max-width: 380px;
  height: 100%;
}

.search-input :deep(.v-field__outline) {
  --v-field-border-opacity: 0.15;
}

.product-item-card {
  cursor: pointer;
  transition: all 0.18s ease-in-out;
  border-color: var(--color-chalk, #e2e8f0) !important;
}

.v-theme--dark .product-item-card {
  border-color: #373734 !important;
}

.product-item-card:hover {
  border-color: #3b82f6 !important;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.08) !important;
}

.product-sku {
  font-size: 12px;
  color: #1e40af;
  background-color: #dbeafe;
  padding: 1px 6px;
  border-radius: 4px;
}

.v-theme--dark .product-sku {
  color: #93c5fd;
  background-color: rgba(59, 130, 246, 0.2);
}

.product-name {
  font-size: 13px;
}

.product-list {
  scrollbar-width: thin;
}

.add-icon {
  opacity: 0.7;
  transition: transform 0.15s ease;
}

.product-item-card:hover .add-icon {
  opacity: 1;
  transform: scale(1.15);
}
</style>

