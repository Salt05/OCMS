<template>
  <v-dialog v-model="dialogVisible" max-width="980" scrollable persistent>
    <v-card class="rounded-xl overflow-hidden order-export-modal">
      <!-- Modal Header -->
      <div class="pa-3 px-4 bg-primary text-white d-flex align-center justify-space-between flex-wrap gap-2">
        <div class="d-flex align-center gap-2">
          <v-icon size="22">lucide-file-spreadsheet</v-icon>
          <div>
            <div class="text-subtitle-1 font-weight-bold">Xuất File Excel Đơn Hàng</div>
            <div class="text-caption text-white text-opacity-80">
              Tùy biến cột dữ liệu & 9 bộ lọc chuyên sâu
            </div>
          </div>
        </div>

        <div class="d-flex align-center gap-2">
          <v-btn
            size="small"
            variant="tonal"
            color="white"
            class="text-none text-caption"
            prepend-icon="lucide-import"
            @click="syncFromPageFilters"
            title="Áp dụng các bộ lọc đang chọn trên trang đơn hàng"
          >
            Đồng bộ từ trang
          </v-btn>
          <v-btn icon="lucide-x" variant="text" size="small" color="white" @click="dialogVisible = false" />
        </div>
      </div>

      <!-- Navigation Tabs -->
      <v-tabs v-model="activeTab" color="primary" density="compact" class="border-b px-2 bg-surface">
        <v-tab value="filters" class="text-none font-weight-medium">
          <v-icon start size="16">lucide-filter</v-icon>
          Điều kiện lọc (9 tiêu chí)
          <v-chip v-if="activeFilterCount > 0" size="x-small" color="primary" variant="flat" class="ml-2 font-weight-bold">
            {{ activeFilterCount }}
          </v-chip>
        </v-tab>
        <v-tab value="columns" class="text-none font-weight-medium">
          <v-icon start size="16">lucide-columns-3</v-icon>
          Tùy chọn cột xuất file
          <v-chip size="x-small" color="secondary" variant="flat" class="ml-2 font-weight-bold">
            {{ selectedColumns.length }}/{{ ALL_EXPORT_COLUMNS.length }}
          </v-chip>
        </v-tab>
      </v-tabs>

      <!-- Modal Body -->
      <v-card-text class="pa-3 modal-body-content" style="max-height: calc(85vh - 120px);">
        <!-- TAB 1: 9 ĐIỀU KIỆN LỌC -->
        <div v-show="activeTab === 'filters'">
          <!-- Compact status bar / Reset button -->
          <div class="d-flex align-center justify-space-between mb-2 px-1">
            <div class="d-flex align-center gap-2">
              <span v-if="hasPageFiltersApplied" class="d-inline-flex align-center text-caption text-primary font-weight-medium bg-primary-lighten-5 px-2 py-0.5 rounded border">
                <v-icon size="13" class="mr-1">lucide-check-circle-2</v-icon>
                Đồng bộ trang: {{ pageFiltersSummaryText }}
                <span v-if="pageTotal !== undefined" class="font-weight-bold ml-1">({{ pageTotal.toLocaleString('vi-VN') }} đơn)</span>
                <v-btn
                  size="x-small"
                  variant="text"
                  color="primary"
                  class="text-none text-caption font-weight-bold pa-0 ml-2"
                  @click="syncFromPageFilters"
                >
                  [Khôi phục]
                </v-btn>
              </span>
              <span v-else class="text-caption text-medium-emphasis">
                Thiết lập điều kiện lọc đơn hàng để trích xuất dữ liệu chính xác:
              </span>
            </div>

            <v-btn
              size="x-small"
              variant="text"
              color="error"
              class="text-none font-weight-medium"
              prepend-icon="lucide-rotate-ccw"
              @click="resetExportFilters"
            >
              Đặt lại bộ lọc
            </v-btn>
          </div>

          <v-row dense>
            <!-- 1. CÓ SĐT KHÔNG & 2. CÓ EMAIL KHÔNG -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="pa-2 px-3 rounded-lg fill-height filter-subcard">
                <div class="d-flex align-center justify-space-between">
                  <div class="text-caption font-weight-bold text-high-emphasis d-flex align-center gap-1">
                    <v-icon size="15" color="primary">lucide-phone</v-icon>
                    1. Có Số điện thoại không?
                  </div>
                  <v-btn-toggle
                    v-model="filters.hasPhone"
                    mandatory
                    color="primary"
                    density="compact"
                    variant="outlined"
                    style="height: 28px;"
                  >
                    <v-btn value="all" size="x-small" class="text-none px-2 text-caption">Tất cả</v-btn>
                    <v-btn value="yes" size="x-small" class="text-none px-2 text-caption">Có SĐT</v-btn>
                    <v-btn value="no" size="x-small" class="text-none px-2 text-caption">Không có</v-btn>
                  </v-btn-toggle>
                </div>
              </v-card>
            </v-col>

            <v-col cols="12" md="6">
              <v-card variant="outlined" class="pa-2 px-3 rounded-lg fill-height filter-subcard">
                <div class="d-flex align-center justify-space-between">
                  <div class="text-caption font-weight-bold text-high-emphasis d-flex align-center gap-1">
                    <v-icon size="15" color="primary">lucide-mail</v-icon>
                    2. Có Email không?
                  </div>
                  <v-btn-toggle
                    v-model="filters.hasEmail"
                    mandatory
                    color="primary"
                    density="compact"
                    variant="outlined"
                    style="height: 28px;"
                  >
                    <v-btn value="all" size="x-small" class="text-none px-2 text-caption">Tất cả</v-btn>
                    <v-btn value="yes" size="x-small" class="text-none px-2 text-caption">Có Email</v-btn>
                    <v-btn value="no" size="x-small" class="text-none px-2 text-caption">Không có</v-btn>
                  </v-btn-toggle>
                </div>
              </v-card>
            </v-col>

            <!-- 3. KHU VỰC Ở ĐÂU -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="pa-2 px-3 rounded-lg fill-height filter-subcard">
                <div class="d-flex align-center justify-space-between mb-1">
                  <div class="text-caption font-weight-bold text-high-emphasis d-flex align-center gap-1">
                    <v-icon size="15" color="primary">lucide-map-pin</v-icon>
                    3. Khu vực ở đâu?
                  </div>
                  <v-checkbox
                    v-model="filters.includeEmptyZone"
                    density="compact"
                    hide-details
                    label="Không có khu vực"
                    class="ma-0 pa-0 text-caption"
                  />
                </div>
                <v-autocomplete
                  v-model="filters.zones"
                  :items="availableZones"
                  multiple
                  chips
                  closable-chips
                  density="compact"
                  variant="outlined"
                  autocomplete="off"
                  :input-props="{
                    autocomplete: 'off',
                    autocorrect: 'off',
                    autocapitalize: 'off',
                    spellcheck: 'false',
                    name: 'ocms_filter_zone_search'
                  }"
                  hide-details
                  clearable
                >
                  <template #chip="{ props, item }">
                    <v-chip v-bind="props" size="x-small" color="primary" variant="tonal">
                      {{ (item as any)?.title || (item as any)?.raw || item }}
                    </v-chip>
                  </template>
                </v-autocomplete>
              </v-card>
            </v-col>

            <!-- 4. NHÂN VIÊN PHỤ TRÁCH -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="pa-2 px-3 rounded-lg fill-height filter-subcard">
                <div class="d-flex align-center justify-space-between mb-1">
                  <div class="text-caption font-weight-bold text-high-emphasis d-flex align-center gap-1">
                    <v-icon size="15" color="primary">lucide-users</v-icon>
                    4. Nhân viên phụ trách là ai?
                  </div>
                  <v-checkbox
                    v-model="filters.includeEmptySalesperson"
                    density="compact"
                    hide-details
                    label="Không có nhân viên"
                    class="ma-0 pa-0 text-caption"
                  />
                </div>
                <v-autocomplete
                  v-model="filters.salespersons"
                  :items="availableSalespersons"
                  multiple
                  chips
                  closable-chips
                  density="compact"
                  variant="outlined"
                  autocomplete="off"
                  :input-props="{
                    autocomplete: 'off',
                    autocorrect: 'off',
                    autocapitalize: 'off',
                    spellcheck: 'false',
                    name: 'ocms_filter_salesperson_search'
                  }"
                  hide-details
                  clearable
                >
                  <template #chip="{ props, item }">
                    <v-chip v-bind="props" size="x-small" color="primary" variant="tonal">
                      {{ (item as any)?.title || (item as any)?.raw || item }}
                    </v-chip>
                  </template>
                </v-autocomplete>
              </v-card>
            </v-col>

            <!-- 5. KHOẢNG NGÀY TẠO ĐƠN -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="pa-2 px-3 rounded-lg fill-height filter-subcard">
                <div class="d-flex align-center justify-space-between mb-1.5 flex-wrap gap-1">
                  <div class="text-caption font-weight-bold text-high-emphasis d-flex align-center gap-1">
                    <v-icon size="15" color="primary">lucide-calendar</v-icon>
                    5. Ngày tạo đơn từ khoảng nào?
                  </div>
                  <!-- Quick date shortcuts -->
                  <div class="d-flex align-center gap-1 flex-wrap">
                    <v-chip
                      v-for="preset in datePresets"
                      :key="preset.value"
                      size="x-small"
                      :color="activeDatePreset === preset.value ? 'primary' : 'default'"
                      :variant="activeDatePreset === preset.value ? 'flat' : 'tonal'"
                      class="cursor-pointer px-1.5"
                      style="font-size: 11px; height: 20px;"
                      @click="applyDatePreset(preset.value)"
                    >
                      {{ preset.text }}
                    </v-chip>
                  </div>
                </div>
                <div class="d-flex align-center gap-2">
                  <v-text-field
                    v-model="filters.fromDate"
                    type="date"
                    density="compact"
                    variant="outlined"
                    label="Từ ngày"
                    hide-details
                    clearable
                    @update:model-value="activeDatePreset = 'custom'"
                  />
                  <span class="text-caption text-medium-emphasis">-</span>
                  <v-text-field
                    v-model="filters.toDate"
                    type="date"
                    density="compact"
                    variant="outlined"
                    label="Đến ngày"
                    hide-details
                    clearable
                    @update:model-value="activeDatePreset = 'custom'"
                  />
                </div>
              </v-card>
            </v-col>

            <!-- 6. KHOẢNG SỐ TIỀN -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="pa-2 px-3 rounded-lg fill-height filter-subcard">
                <div class="text-caption font-weight-bold text-high-emphasis mb-1.5 d-flex align-center gap-1">
                  <v-icon size="15" color="primary">lucide-dollar-sign</v-icon>
                  6. Số tiền từ bao nhiêu tới bao nhiêu?
                </div>
                <div class="d-flex align-center gap-2">
                  <v-text-field
                    v-model="filters.minAmount"
                    type="number"
                    min="0"
                    step="10000"
                    density="compact"
                    variant="outlined"
                    label="Từ số tiền (₫)"
                    autocomplete="off"
                    :input-props="{
                      autocomplete: 'off',
                      name: 'ocms_filter_min_amount'
                    }"
                    hide-details
                    clearable
                  />
                  <span class="text-caption text-medium-emphasis">-</span>
                  <v-text-field
                    v-model="filters.maxAmount"
                    type="number"
                    min="0"
                    step="10000"
                    density="compact"
                    variant="outlined"
                    label="Đến số tiền (₫)"
                    autocomplete="off"
                    :input-props="{
                      autocomplete: 'off',
                      name: 'ocms_filter_max_amount'
                    }"
                    hide-details
                    clearable
                  />
                </div>
              </v-card>
            </v-col>

            <!-- 7. ORDER ĐÓ CÓ NHỮNG SẢN PHẨM NÀO -->
            <v-col cols="12" md="5">
              <v-card variant="outlined" class="pa-2 px-3 rounded-lg fill-height filter-subcard">
                <div class="text-caption font-weight-bold text-high-emphasis mb-1 d-flex align-center gap-1">
                  <v-icon size="15" color="primary">lucide-package</v-icon>
                  7. Order đó có những sản phẩm nào?
                </div>
                <v-autocomplete
                  v-model="filters.productIds"
                  :items="productOptions"
                  item-title="displayName"
                  item-value="odooId"
                  multiple
                  chips
                  closable-chips
                  density="compact"
                  variant="outlined"
                  autocomplete="off"
                  :input-props="{
                    autocomplete: 'off',
                    autocorrect: 'off',
                    autocapitalize: 'off',
                    spellcheck: 'false',
                    name: 'ocms_filter_products_search'
                  }"
                  hide-details
                  clearable
                  :loading="loadingProducts"
                >
                  <template #chip="{ props, item }">
                    <v-chip v-bind="props" size="x-small" color="primary" variant="tonal">
                      {{ (item as any).sku ? `[${(item as any).sku}] ` : '' }}{{ (item as any).name }}
                    </v-chip>
                  </template>
                  <template #item="{ props, item }">
                    <v-list-item
                      v-bind="props"
                      :title="(item as any).name"
                      :subtitle="(item as any).sku ? `Mã SKU: ${(item as any).sku}` : ''"
                    />
                  </template>
                </v-autocomplete>
              </v-card>
            </v-col>

            <!-- 8. TRẠNG THÁI ĐƠN & 9. TRẠNG THÁI GIAO HÀNG -->
            <v-col cols="12" md="3">
              <v-card variant="outlined" class="pa-2 px-3 rounded-lg fill-height filter-subcard">
                <div class="text-caption font-weight-bold text-high-emphasis mb-1 d-flex align-center gap-1">
                  <v-icon size="15" color="primary">lucide-check-circle-2</v-icon>
                  8. Trạng thái đơn hàng
                </div>
                <v-select
                  v-model="filters.states"
                  :items="stateFilterOptions"
                  multiple
                  chips
                  closable-chips
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                >
                  <template #chip="{ props, item }">
                    <v-chip v-bind="props" size="x-small" color="primary" variant="tonal">
                      {{ item.title }}
                    </v-chip>
                  </template>
                </v-select>
              </v-card>
            </v-col>

            <v-col cols="12" md="4">
              <v-card variant="outlined" class="pa-2 px-3 rounded-lg fill-height filter-subcard">
                <div class="d-flex align-center justify-space-between mb-1">
                  <div class="text-caption font-weight-bold text-high-emphasis d-flex align-center gap-1">
                    <v-icon size="15" color="primary">lucide-truck</v-icon>
                    9. Trạng thái giao hàng
                  </div>
                  <v-checkbox
                    v-model="filters.includeEmptyDelivery"
                    density="compact"
                    hide-details
                    label="Chưa giao"
                    class="ma-0 pa-0 text-caption"
                  />
                </div>
                <v-select
                  v-model="filters.deliveryStatuses"
                  :items="deliveryStatusOptions"
                  multiple
                  chips
                  closable-chips
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                >
                  <template #chip="{ props, item }">
                    <v-chip v-bind="props" size="x-small" color="primary" variant="tonal">
                      {{ item.title }}
                    </v-chip>
                  </template>
                </v-select>
              </v-card>
            </v-col>
          </v-row>
        </div>

        <!-- TAB 2: TÙY CHỌN CỘT XUẤT FILE -->
        <div v-show="activeTab === 'columns'">
          <div class="d-flex align-center justify-space-between mb-2 px-1 flex-wrap gap-2">
            <span class="text-caption text-medium-emphasis">
              Chọn các cột dữ liệu bạn muốn đưa vào Sheet 1 của file Excel:
            </span>
            <div class="d-flex align-center gap-2">
              <v-btn
                size="small"
                variant="flat"
                color="primary"
                class="text-none font-weight-medium rounded-lg px-3"
                prepend-icon="lucide-check-square"
                @click="selectAllColumns"
              >
                Chọn tất cả
              </v-btn>
              <v-btn
                size="small"
                variant="flat"
                color="error"
                class="text-none font-weight-medium rounded-lg px-3"
                prepend-icon="lucide-square"
                @click="deselectAllColumns"
              >
                Bỏ chọn tất cả
              </v-btn>
              <v-btn
                size="small"
                variant="flat"
                color="secondary"
                class="text-none font-weight-medium rounded-lg px-3"
                prepend-icon="lucide-rotate-ccw"
                @click="resetDefaultColumns"
              >
                Mặc định
              </v-btn>
            </div>
          </div>

          <!-- Column Groups -->
          <v-row dense>
            <!-- Nhóm: Thông tin đơn hàng -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="pa-2.5 rounded-lg mb-2">
                <div class="d-flex align-center justify-space-between border-b pb-1 mb-1.5">
                  <span class="text-caption font-weight-bold text-primary">Thông tin Đơn hàng</span>
                  <span class="text-caption text-medium-emphasis">{{ getGroupSelectedCount('order') }} đã chọn</span>
                </div>
                <div class="column-checkbox-grid">
                  <v-checkbox
                    v-for="col in orderGroupColumns"
                    :key="col.key"
                    v-model="selectedColumns"
                    :value="col.key"
                    :label="col.label"
                    density="compact"
                    hide-details
                    color="primary"
                    class="py-0.5"
                  />
                </div>
              </v-card>
            </v-col>

            <!-- Nhóm: Thông tin khách hàng -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="pa-2.5 rounded-lg mb-2">
                <div class="d-flex align-center justify-space-between border-b pb-1 mb-1.5">
                  <span class="text-caption font-weight-bold text-primary">Thông tin Khách hàng</span>
                  <span class="text-caption text-medium-emphasis">{{ getGroupSelectedCount('customer') }} đã chọn</span>
                </div>
                <div class="column-checkbox-grid">
                  <v-checkbox
                    v-for="col in customerGroupColumns"
                    :key="col.key"
                    v-model="selectedColumns"
                    :value="col.key"
                    :label="col.label"
                    density="compact"
                    hide-details
                    color="primary"
                    class="py-0.5"
                  />
                </div>
              </v-card>
            </v-col>

            <!-- Nhóm: Thông tin tài chính -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="pa-2.5 rounded-lg mb-2">
                <div class="d-flex align-center justify-space-between border-b pb-1 mb-1.5">
                  <span class="text-caption font-weight-bold text-primary">Tài chính & Doanh thu</span>
                  <span class="text-caption text-medium-emphasis">{{ getGroupSelectedCount('finance') }} đã chọn</span>
                </div>
                <div class="column-checkbox-grid">
                  <v-checkbox
                    v-for="col in financeGroupColumns"
                    :key="col.key"
                    v-model="selectedColumns"
                    :value="col.key"
                    :label="col.label"
                    density="compact"
                    hide-details
                    color="primary"
                    class="py-0.5"
                  />
                </div>
              </v-card>
            </v-col>

            <!-- Nhóm: Sản phẩm & Khác -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="pa-2.5 rounded-lg mb-2">
                <div class="d-flex align-center justify-space-between border-b pb-1 mb-1.5">
                  <span class="text-caption font-weight-bold text-primary">Sản phẩm & Ghi chú</span>
                  <span class="text-caption text-medium-emphasis">{{ getGroupSelectedCount('other') }} đã chọn</span>
                </div>
                <div class="column-checkbox-grid">
                  <v-checkbox
                    v-for="col in otherGroupColumns"
                    :key="col.key"
                    v-model="selectedColumns"
                    :value="col.key"
                    :label="col.label"
                    density="compact"
                    hide-details
                    color="primary"
                    class="py-0.5"
                  />
                </div>
              </v-card>
            </v-col>
          </v-row>

          <!-- Sheet 2: Chi tiết từng món hàng -->
          <v-card variant="tonal" color="teal" class="pa-2.5 px-3 rounded-lg border">
            <div class="d-flex align-center justify-space-between">
              <div class="d-flex align-center gap-2">
                <v-icon size="18" color="teal">lucide-layers</v-icon>
                <div>
                  <div class="text-caption font-weight-bold text-teal-darken-3">
                    Kèm Sheet 2: Chi tiết phân rã từng mặt hàng (Line items)
                  </div>
                  <div class="text-caption text-medium-emphasis" style="font-size: 11px;">
                    Tạo thêm Sheet thứ 2 liệt kê từng sản phẩm riêng lẻ với SKU, ĐVT, Số lượng, Đơn giá, Thành tiền
                  </div>
                </div>
              </div>
              <v-switch
                v-model="includeLinesSheet"
                color="teal"
                density="compact"
                hide-details
                inset
              />
            </div>
          </v-card>
        </div>
      </v-card-text>

      <v-divider />

      <!-- Modal Footer -->
      <v-card-actions class="pa-3 px-4 bg-surface-variant d-flex align-center justify-space-between flex-wrap gap-2">
        <!-- Live Match Count Preview -->
        <div class="d-flex align-center gap-2">
          <v-progress-circular v-if="counting" indeterminate size="16" width="2" color="primary" />
          <v-chip v-else :color="matchCount > 0 ? 'primary' : 'grey'" variant="flat" size="small" class="font-weight-bold">
            <v-icon start size="14">lucide-database</v-icon>
            {{ matchCount.toLocaleString('vi-VN') }} đơn thỏa điều kiện
          </v-chip>

          <span v-if="matchCount > 0" class="text-caption text-medium-emphasis ml-1">
            Tổng giá trị: <strong class="text-primary font-monospace">{{ formatVND(matchTotalAmount) }}</strong>
          </span>
          <span v-else-if="!counting" class="text-caption text-error">
            Không có đơn hàng nào khớp với điều kiện lọc
          </span>
        </div>

        <div class="d-flex align-center gap-2">
          <v-btn variant="outlined" color="grey" :disabled="exporting" @click="dialogVisible = false">
            Đóng
          </v-btn>
          <v-btn
            color="success"
            variant="flat"
            :loading="exporting"
            :disabled="matchCount === 0 || selectedColumns.length === 0"
            prepend-icon="lucide-download"
            @click="executeExport"
          >
            Xuất file Excel ({{ selectedColumns.length }} cột)
          </v-btn>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { api } from '@/api/index';
import {
  useOrders,
  type OrderExportFilters,
  type ExportColumnItem,
} from '@/composables/use-orders';

const props = defineProps<{
  modelValue: boolean;
  initialFilters?: {
    search?: string;
    state?: string;
    salesperson?: string;
    deliveryStatus?: string;
    from?: string;
    to?: string;
  };
  pageTotal?: number;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'exported'): void;
}>();

const {
  fetchExportZones,
  fetchExportColumns,
  fetchExportCount,
  exportOrdersExcel,
  salespersons,
  fetchSalespersons,
} = useOrders();

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});

const activeTab = ref<'filters' | 'columns'>('filters');
const counting = ref(false);
const exporting = ref(false);
const matchCount = ref(0);
const matchTotalAmount = ref(0);
const activeDatePreset = ref<string>('custom');

const availableZones = ref<string[]>([]);
const availableSalespersons = ref<string[]>([]);
const ALL_EXPORT_COLUMNS = ref<ExportColumnItem[]>([]);
const DEFAULT_SELECTED_COLUMNS = ref<string[]>([]);
const selectedColumns = ref<string[]>([]);
const includeLinesSheet = ref(true);

const loadingProducts = ref(false);
const productOptions = ref<Array<{ odooId: number; name: string; sku: string | null; displayName: string }>>([]);

// Storage Keys
const COLUMNS_STORAGE_KEY = 'ocms_order_export_selected_columns';
const LINES_SHEET_STORAGE_KEY = 'ocms_order_export_include_lines_sheet';

// 9 Filters Reactive State
const filters = reactive<OrderExportFilters>({
  search: '',
  hasPhone: 'all',
  hasEmail: 'all',
  zones: [],
  includeEmptyZone: false,
  salespersons: [],
  includeEmptySalesperson: false,
  fromDate: '',
  toDate: '',
  minAmount: null,
  maxAmount: null,
  productIds: [],
  states: [],
  deliveryStatuses: [],
  includeEmptyDelivery: false,
});

// Dropdown Options
const datePresets = [
  { text: 'Tất cả', value: 'all' },
  { text: 'Hôm nay', value: 'today' },
  { text: '7 ngày qua', value: '7days' },
  { text: '30 ngày qua', value: '30days' },
  { text: 'Tháng này', value: 'thisMonth' },
  { text: 'Tháng trước', value: 'lastMonth' },
];

const stateFilterOptions = [
  { title: 'Báo giá (Draft)', value: 'draft' },
  { title: 'Đã gửi báo giá (Sent)', value: 'sent' },
  { title: 'Đã xác nhận (Sale)', value: 'sale' },
  { title: 'Hoàn thành (Done)', value: 'done' },
  { title: 'Đã hủy (Cancel)', value: 'cancel' },
];

const deliveryStatusOptions = [
  { title: 'Chờ giao hàng (Pending)', value: 'pending' },
  { title: 'Đang giao (Started)', value: 'started' },
  { title: 'Đã giao đủ (Full)', value: 'full' },
];

// Column Categories
const orderGroupColumns = computed(() => {
  const keys = ['orderCode', 'dateOrder', 'state', 'deliveryStatus', 'invoiceStatus', 'warehouseName', 'paymentTerm', 'activitySummary'];
  return ALL_EXPORT_COLUMNS.value.filter(c => keys.includes(c.key));
});

const customerGroupColumns = computed(() => {
  const keys = ['customerName', 'phone', 'email', 'zone', 'address', 'salesperson'];
  return ALL_EXPORT_COLUMNS.value.filter(c => keys.includes(c.key));
});

const financeGroupColumns = computed(() => {
  const keys = ['amountUntaxed', 'amountTax', 'discountAmount', 'amountTotal', 'margin'];
  return ALL_EXPORT_COLUMNS.value.filter(c => keys.includes(c.key));
});

const otherGroupColumns = computed(() => {
  const keys = ['productsSummary', 'note'];
  return ALL_EXPORT_COLUMNS.value.filter(c => keys.includes(c.key));
});

function getGroupSelectedCount(group: 'order' | 'customer' | 'finance' | 'other'): number {
  let groupCols: ExportColumnItem[] = [];
  if (group === 'order') groupCols = orderGroupColumns.value;
  else if (group === 'customer') groupCols = customerGroupColumns.value;
  else if (group === 'finance') groupCols = financeGroupColumns.value;
  else if (group === 'other') groupCols = otherGroupColumns.value;

  const set = new Set(selectedColumns.value);
  return groupCols.filter(c => set.has(c.key)).length;
}

const activeFilterCount = computed(() => {
  let count = 0;
  if (filters.hasPhone && filters.hasPhone !== 'all') count++;
  if (filters.hasEmail && filters.hasEmail !== 'all') count++;
  if (filters.zones && filters.zones.length > 0) count++;
  if (filters.includeEmptyZone) count++;
  if (filters.salespersons && filters.salespersons.length > 0) count++;
  if (filters.includeEmptySalesperson) count++;
  if (filters.fromDate || filters.toDate) count++;
  if (filters.minAmount !== null && filters.minAmount !== undefined && (filters.minAmount as any) !== '') count++;
  if (filters.maxAmount !== null && filters.maxAmount !== undefined && (filters.maxAmount as any) !== '') count++;
  if (filters.productIds && filters.productIds.length > 0) count++;
  if (filters.states && filters.states.length > 0) count++;
  if (filters.deliveryStatuses && filters.deliveryStatuses.length > 0) count++;
  if (filters.includeEmptyDelivery) count++;
  if (filters.search && filters.search.trim()) count++;
  return count;
});

const hasPageFiltersApplied = computed(() => {
  if (!props.initialFilters) return false;
  return !!(
    props.initialFilters.search ||
    props.initialFilters.state ||
    props.initialFilters.salesperson ||
    props.initialFilters.deliveryStatus ||
    props.initialFilters.from ||
    props.initialFilters.to
  );
});

const pageFiltersSummaryText = computed(() => {
  if (!props.initialFilters) return '';
  const parts: string[] = [];
  if (props.initialFilters.state) {
    const st = stateFilterOptions.find(s => s.value === props.initialFilters?.state);
    parts.push(`Trạng thái: ${st?.title || props.initialFilters.state}`);
  }
  if (props.initialFilters.salesperson) {
    parts.push(`Nhân viên: ${props.initialFilters.salesperson}`);
  }
  if (props.initialFilters.deliveryStatus) {
    const ds = deliveryStatusOptions.find(d => d.value === props.initialFilters?.deliveryStatus);
    parts.push(`Vận chuyển: ${ds?.title || props.initialFilters.deliveryStatus}`);
  }
  if (props.initialFilters.search) {
    parts.push(`Tìm: "${props.initialFilters.search}"`);
  }
  if (props.initialFilters.from || props.initialFilters.to) {
    parts.push(`Ngày: ${props.initialFilters.from || '...'} → ${props.initialFilters.to || '...'}`);
  }
  return parts.join(' • ');
});

function formatVND(n?: number) {
  if (n === undefined || n === null) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function applyDatePreset(val: string) {
  activeDatePreset.value = val;
  const now = new Date();
  if (val === 'today') {
    const s = now.toISOString().split('T')[0];
    filters.fromDate = s;
    filters.toDate = s;
  } else if (val === '7days') {
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    filters.fromDate = d7.toISOString().split('T')[0];
    filters.toDate = now.toISOString().split('T')[0];
  } else if (val === '30days') {
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    filters.fromDate = d30.toISOString().split('T')[0];
    filters.toDate = now.toISOString().split('T')[0];
  } else if (val === 'thisMonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    filters.fromDate = start.toISOString().split('T')[0];
    filters.toDate = now.toISOString().split('T')[0];
  } else if (val === 'lastMonth') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    filters.fromDate = start.toISOString().split('T')[0];
    filters.toDate = end.toISOString().split('T')[0];
  } else {
    filters.fromDate = '';
    filters.toDate = '';
  }
}

function resetExportFilters() {
  filters.search = '';
  filters.hasPhone = 'all';
  filters.hasEmail = 'all';
  filters.zones = [];
  filters.includeEmptyZone = false;
  filters.salespersons = [];
  filters.includeEmptySalesperson = false;
  filters.fromDate = '';
  filters.toDate = '';
  filters.minAmount = null;
  filters.maxAmount = null;
  filters.productIds = [];
  filters.states = [];
  filters.deliveryStatuses = [];
  filters.includeEmptyDelivery = false;
  activeDatePreset.value = 'all';
}

function syncFromPageFilters() {
  if (!props.initialFilters) return;
  resetExportFilters();
  if (props.initialFilters.search) filters.search = props.initialFilters.search;
  if (props.initialFilters.state) filters.states = [props.initialFilters.state];
  if (props.initialFilters.salesperson) filters.salespersons = [props.initialFilters.salesperson];
  if (props.initialFilters.deliveryStatus) filters.deliveryStatuses = [props.initialFilters.deliveryStatus];
  if (props.initialFilters.from) filters.fromDate = props.initialFilters.from;
  if (props.initialFilters.to) filters.toDate = props.initialFilters.to;
}

const EXCLUDED_DEFAULT_COLUMNS = ['margin', 'warehouseName', 'activitySummary', 'marginPercent'];

function selectAllColumns() {
  selectedColumns.value = ALL_EXPORT_COLUMNS.value.map(c => c.key);
}

function deselectAllColumns() {
  selectedColumns.value = [];
}

function resetDefaultColumns() {
  selectedColumns.value = DEFAULT_SELECTED_COLUMNS.value.filter(
    (k: string) => !EXCLUDED_DEFAULT_COLUMNS.includes(k)
  );
}

// Watch selectedColumns and includeLinesSheet to save to localStorage
watch(selectedColumns, (newVal) => {
  try {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(newVal));
  } catch (e) {
    // Ignore localStorage errors
  }
}, { deep: true });

watch(includeLinesSheet, (newVal) => {
  try {
    localStorage.setItem(LINES_SHEET_STORAGE_KEY, JSON.stringify(newVal));
  } catch (e) {
    // Ignore localStorage errors
  }
});

// Debounced Live Count Fetching
let countDebounceTimer: any = null;
function triggerCountCalculation() {
  clearTimeout(countDebounceTimer);
  counting.value = true;
  countDebounceTimer = setTimeout(async () => {
    try {
      const res = await fetchExportCount(filters);
      matchCount.value = res.count;
      matchTotalAmount.value = res.totalAmount;
    } catch (err) {
      console.error('Lỗi tính số lượng đơn xuất:', err);
    } finally {
      counting.value = false;
    }
  }, 350);
}

// Watch filters to update live count
watch(filters, () => {
  if (dialogVisible.value) {
    triggerCountCalculation();
  }
}, { deep: true });

// Load initial options when modal opens
watch(dialogVisible, async (isOpen) => {
  if (isOpen) {
    // Always sync cleanly from page filters whenever modal opens
    syncFromPageFilters();
    await loadInitialData();
    triggerCountCalculation();
  }
});

async function loadInitialData() {
  try {
    const [zones, colsRes, spList] = await Promise.all([
      fetchExportZones(),
      fetchExportColumns(),
      fetchSalespersons().then(() => salespersons.value),
      loadProductsCatalog(),
    ]);

    availableZones.value = zones;
    ALL_EXPORT_COLUMNS.value = colsRes.allColumns;
    DEFAULT_SELECTED_COLUMNS.value = (colsRes.defaultColumns || []).filter(
      (k: string) => !EXCLUDED_DEFAULT_COLUMNS.includes(k)
    );
    availableSalespersons.value = spList || [];

    // Restore saved columns from localStorage
    try {
      const savedCols = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (savedCols) {
        const parsed = JSON.parse(savedCols);
        if (Array.isArray(parsed) && parsed.length > 0) {
          selectedColumns.value = parsed.filter((k: string) => !EXCLUDED_DEFAULT_COLUMNS.includes(k));
        } else {
          selectedColumns.value = [...DEFAULT_SELECTED_COLUMNS.value];
        }
      } else {
        selectedColumns.value = [...DEFAULT_SELECTED_COLUMNS.value];
      }

      const savedLines = localStorage.getItem(LINES_SHEET_STORAGE_KEY);
      if (savedLines !== null) {
        includeLinesSheet.value = JSON.parse(savedLines);
      }
    } catch (e) {
      selectedColumns.value = [...DEFAULT_SELECTED_COLUMNS.value];
    }
  } catch (err) {
    console.error('Lỗi tải dữ liệu ban đầu cho modal xuất Excel:', err);
  }
}

async function loadProductsCatalog() {
  if (productOptions.value.length > 0) return;
  loadingProducts.value = true;
  try {
    const res = await api.get('/products', { params: { limit: 100 } });
    const prods = res.data.products || [];
    productOptions.value = prods.map((p: any) => ({
      odooId: p.odooId,
      name: p.name,
      sku: p.sku || '',
      displayName: p.sku ? `[${p.sku}] ${p.name}` : p.name,
    }));
  } catch (err) {
    console.error('Lỗi tải danh mục sản phẩm:', err);
  } finally {
    loadingProducts.value = false;
  }
}

async function executeExport() {
  if (selectedColumns.value.length === 0) {
    alert('Vui lòng chọn ít nhất 1 cột dữ liệu để xuất file!');
    return;
  }
  exporting.value = true;
  try {
    await exportOrdersExcel({
      filters,
      columns: selectedColumns.value,
      includeLinesSheet: includeLinesSheet.value,
    });
    emit('exported');
    dialogVisible.value = false;
  } catch (err: any) {
    alert(err.message || 'Lỗi khi xuất file Excel. Vui lòng thử lại!');
  } finally {
    exporting.value = false;
  }
}

onMounted(() => {
  if (dialogVisible.value) {
    loadInitialData();
  }
});
</script>

<style scoped>
.order-export-modal {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.filter-subcard {
  background-color: rgb(var(--v-theme-surface));
  transition: border-color 0.2s;
}

.filter-subcard:hover {
  border-color: rgba(var(--v-theme-primary), 0.5);
}

.column-checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 2px 8px;
}

.modal-body-content::-webkit-scrollbar {
  width: 6px;
}

.modal-body-content::-webkit-scrollbar-thumb {
  background-color: rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 3px;
}
</style>
