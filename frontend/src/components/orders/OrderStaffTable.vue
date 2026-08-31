<template>
  <v-card variant="outlined" class="rounded-lg overflow-hidden mb-4">
    <v-card-title class="text-subtitle-1 font-weight-bold d-flex align-center justify-space-between pa-4 border-b">
      <div class="d-flex align-center gap-2">
        <v-icon color="primary" size="20">lucide-trophy</v-icon>
        Hiệu suất nhân viên kinh doanh
      </div>
      <span class="text-caption text-medium-emphasis">{{ staffStats.length }} nhân viên</span>
    </v-card-title>

    <v-table density="compact" hover class="staff-table">
      <thead>
        <tr class="bg-surface-variant">
          <th class="text-center" :style="isMobile ? 'width: 12%;' : ''">Hạng</th>
          <th class="text-left" :style="isMobile ? 'width: 32%;' : ''">Nhân viên</th>
          <th class="text-center" :style="isMobile ? 'width: 14%;' : ''">Số đơn</th>
          <th class="text-right" :style="isMobile ? 'width: 26%;' : ''">Doanh số</th>
          <th class="text-right" :style="isMobile ? 'width: 16%;' : ''">Tỷ lệ</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="staffStats.length === 0">
          <td colspan="5" class="text-center text-medium-emphasis py-6">Không có dữ liệu hiệu suất</td>
        </tr>
        <tr v-for="(s, idx) in staffStats" :key="s.salesperson">
          <!-- Rank -->
          <td class="text-center">
            <v-chip v-if="idx === 0" size="x-small" color="amber-darken-3" variant="flat" class="font-weight-bold">1</v-chip>
            <v-chip v-else-if="idx === 1" size="x-small" color="blue-grey-lighten-1" variant="flat" class="font-weight-bold">2</v-chip>
            <v-chip v-else-if="idx === 2" size="x-small" color="brown-lighten-1" variant="flat" class="font-weight-bold">3</v-chip>
            <span v-else class="text-caption text-medium-emphasis">{{ idx + 1 }}</span>
          </td>

          <!-- Salesperson Name -->
          <td class="text-left">
            <div v-if="isMobile" class="font-weight-medium text-caption text-truncate" :title="s.salesperson">
              {{ formatStaffName(s.salesperson) }}
            </div>
            <div v-else class="font-weight-medium text-caption text-high-emphasis" :title="s.salesperson">
              {{ s.salesperson }}
            </div>
          </td>

          <!-- Order Count -->
          <td class="text-center font-weight-medium text-caption">
            {{ s.orderCount }}
          </td>

          <!-- Total Revenue -->
          <td class="text-right font-weight-bold text-caption text-primary font-monospace">
            {{ formatVND(s.totalRevenue) }}
          </td>

          <!-- Revenue Percentage -->
          <td class="text-right">
            <div class="d-flex align-center justify-end gap-1.5 flex-nowrap">
              <v-progress-linear
                v-if="!isMobile"
                :model-value="getRevenuePercent(s.totalRevenue)"
                color="primary"
                height="6"
                rounded
                style="max-width: 60px;"
              />
              <span class="text-caption font-weight-medium">
                {{ getRevenuePercent(s.totalRevenue).toFixed(1) }}%
              </span>
            </div>
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDisplay } from 'vuetify';
import type { StaffStat } from '@/composables/use-orders';

const props = defineProps<{
  staffStats: StaffStat[];
}>();

const display = useDisplay();
const isMobile = computed(() => display.smAndDown.value);

function formatStaffName(name?: string | null): string {
  if (!name) return '—';
  const trimmed = name.trim();
  if (trimmed.length > 15) {
    return trimmed.slice(0, 12) + '...';
  }
  return trimmed;
}

const totalAllRevenue = computed(() => {
  return props.staffStats.reduce((sum, s) => sum + (s.totalRevenue || 0), 0);
});

function getRevenuePercent(rev: number) {
  if (totalAllRevenue.value <= 0) return 0;
  return Math.min(100, Math.max(0, (rev / totalAllRevenue.value) * 100));
}

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}
</script>

<style scoped>
.staff-table {
  width: 100% !important;
}
.staff-table th {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  white-space: nowrap;
}
.staff-table th,
.staff-table td {
  padding-left: 8px !important;
  padding-right: 8px !important;
  white-space: nowrap;
}

/* Desktop: Proportional auto-fit with evenly distributed space */
@media (min-width: 769px) {
  :deep(.v-table__wrapper > table) {
    width: 100% !important;
    table-layout: auto !important;
  }
  .staff-table th,
  .staff-table td {
    padding-left: 10px !important;
    padding-right: 10px !important;
    white-space: nowrap !important;
  }
}

/* Mobile: Fixed layout with percentage columns, no scroll */
@media (max-width: 768px) {
  :deep(.v-table__wrapper) {
    overflow-x: hidden !important;
    width: 100% !important;
  }
  :deep(.v-table__wrapper > table) {
    width: 100% !important;
    min-width: 100% !important;
    table-layout: fixed !important;
  }
  .staff-table th {
    padding-left: 2px !important;
    padding-right: 2px !important;
    font-size: 11.5px !important;
  }
  .staff-table td {
    padding-left: 2px !important;
    padding-right: 2px !important;
    font-size: 12px !important;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .staff-table .v-chip {
    font-size: 11px !important;
    height: 20px !important;
    min-width: 20px !important;
    padding: 0 4px !important;
  }
}
</style>
