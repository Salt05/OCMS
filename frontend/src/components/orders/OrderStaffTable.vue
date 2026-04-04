<template>
  <v-card variant="outlined">
    <v-card-title class="text-body-1">
      <v-icon class="mr-1" color="primary">mdi-account-group</v-icon>
      Hiệu suất nhân viên
    </v-card-title>
    <v-table density="compact">
      <thead>
        <tr>
          <th>Nhân viên</th>
          <th class="text-right">Số đơn</th>
          <th class="text-right">Doanh thu</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="staffStats.length === 0">
          <td colspan="3" class="text-center text-grey py-4">Không có dữ liệu</td>
        </tr>
        <tr v-for="s in staffStats" :key="s.userId">
          <td>{{ s.fullName || s.userId }}</td>
          <td class="text-right">{{ s.orderCount }}</td>
          <td class="text-right">{{ formatVND(s.totalRevenue) }}</td>
        </tr>
      </tbody>
    </v-table>
  </v-card>
</template>

<script setup lang="ts">
defineProps<{ staffStats: any[] }>();

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}
</script>
