<template>
  <v-card variant="outlined" class="rounded-lg">
    <v-card-title class="text-subtitle-1 font-weight-bold d-flex align-center justify-space-between pa-4 border-b">
      <div class="d-flex align-center gap-2">
        <v-icon color="primary" size="20">lucide-trophy</v-icon>
        Hiệu suất nhân viên kinh doanh
      </div>
      <span class="text-caption text-medium-emphasis">{{ staffStats.length }} nhân viên</span>
    </v-card-title>

    <v-table density="comfortable" class="staff-table">
      <thead>
        <tr class="bg-surface-variant">
          <th style="width: 50px;" class="text-center">Hạng</th>
          <th>Nhân viên kinh doanh</th>
          <th style="width: 100px;" class="text-right">Số đơn</th>
          <th style="width: 180px;" class="text-right">Doanh số đóng góp</th>
          <th style="width: 160px;" class="text-right">Tỷ lệ đóng góp</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="staffStats.length === 0">
          <td colspan="5" class="text-center text-medium-emphasis py-6">Không có dữ liệu hiệu suất</td>
        </tr>
        <tr v-for="(s, idx) in staffStats" :key="s.salesperson">
          <td class="text-center">
            <v-chip v-if="idx === 0" size="x-small" color="amber-darken-3" variant="flat" class="font-weight-bold">1</v-chip>
            <v-chip v-else-if="idx === 1" size="x-small" color="blue-grey-lighten-1" variant="flat" class="font-weight-bold">2</v-chip>
            <v-chip v-else-if="idx === 2" size="x-small" color="brown-lighten-1" variant="flat" class="font-weight-bold">3</v-chip>
            <span v-else class="text-caption text-medium-emphasis">{{ idx + 1 }}</span>
          </td>
          <td>
            <div class="font-weight-medium text-body-2">{{ s.salesperson }}</div>
          </td>
          <td class="text-right font-weight-medium">{{ s.orderCount }}</td>
          <td class="text-right font-weight-bold text-body-2 text-primary">
            {{ formatVND(s.totalRevenue) }}
          </td>
          <td class="text-right">
            <div class="d-flex align-center justify-end gap-2">
              <v-progress-linear
                :model-value="getRevenuePercent(s.totalRevenue)"
                color="primary"
                height="6"
                rounded
                style="max-width: 80px;"
              />
              <span class="text-caption font-weight-medium" style="min-width: 40px;">
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
import type { StaffStat } from '@/composables/use-orders';

const props = defineProps<{
  staffStats: StaffStat[];
}>();

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
.staff-table th {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}
</style>
