<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap gap-2">
      <h1 class="editorial-heading">
        <v-icon class="mr-2 page-icon">lucide-layout-dashboard</v-icon>
        Dashboard
      </h1>
    </div>

    <!-- Odoo Sync & Countdown Widget -->
    <DashboardSyncWidget @synced="fetchAll" />

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <!-- CRM Message & Contact KPI Cards -->
    <KpiCards :kpi="kpi" class="mb-4" />

    <!-- Order & Business KPI cards -->
    <v-row class="mb-4">
      <v-col cols="6" sm="6" md="3">
        <v-card variant="outlined" class="rounded-lg h-100">
          <v-card-text class="pa-4">
            <div class="d-flex justify-space-between align-start">
              <div>
                <div class="text-caption text-medium-emphasis font-weight-medium">TỔNG ĐƠN HÀNG</div>
                <div class="text-h5 font-weight-bold mt-1 text-primary">
                  {{ orderStats?.totalOrders ? orderStats.totalOrders.toLocaleString('vi-VN') : '—' }}
                </div>
              </div>
              <v-avatar color="primary" variant="tonal" size="36" rounded="lg">
                <v-icon icon="lucide-shopping-cart" size="18" />
              </v-avatar>
            </div>
            <div class="text-caption text-medium-emphasis mt-2">
              Báo giá: <span class="font-weight-medium text-amber-darken-3">{{ orderStats?.draftOrders || 0 }}</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="6" sm="6" md="3">
        <v-card variant="outlined" class="rounded-lg h-100">
          <v-card-text class="pa-4">
            <div class="d-flex justify-space-between align-start">
              <div>
                <div class="text-caption text-medium-emphasis font-weight-medium">ĐÃ XÁC NHẬN</div>
                <div class="text-h5 font-weight-bold mt-1 text-success">
                  {{ orderStats?.confirmedOrders ? orderStats.confirmedOrders.toLocaleString('vi-VN') : '—' }}
                </div>
              </div>
              <v-avatar color="success" variant="tonal" size="36" rounded="lg">
                <v-icon icon="lucide-check-circle" size="18" />
              </v-avatar>
            </div>
            <div class="text-caption text-medium-emphasis mt-2">
              Đơn hoàn tất / đang giao
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="6" sm="6" md="3">
        <v-card variant="outlined" class="rounded-lg h-100">
          <v-card-text class="pa-4">
            <div class="d-flex justify-space-between align-start">
              <div>
                <div class="text-caption text-medium-emphasis font-weight-medium">TỔNG DOANH THU</div>
                <div class="text-h6 font-weight-bold mt-1 text-teal font-monospace">
                  {{ formatVND(orderStats?.totalRevenue ?? 0) }}
                </div>
              </div>
              <v-avatar color="teal" variant="tonal" size="36" rounded="lg">
                <v-icon icon="lucide-circle-dollar-sign" size="18" />
              </v-avatar>
            </div>
            <div class="text-caption text-medium-emphasis mt-2">
              Lợi nhuận: <span class="font-weight-medium text-teal">{{ formatVND(orderStats?.totalMargin ?? 0) }}</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="6" sm="6" md="3">
        <v-card variant="outlined" class="rounded-lg h-100">
          <v-card-text class="pa-4">
            <div class="d-flex justify-space-between align-start">
              <div>
                <div class="text-caption text-medium-emphasis font-weight-medium">DOANH THU HÔM NAY</div>
                <div class="text-h6 font-weight-bold mt-1 text-orange font-monospace">
                  {{ formatVND(orderStats?.todayRevenue ?? 0) }}
                </div>
              </div>
              <v-avatar color="orange" variant="tonal" size="36" rounded="lg">
                <v-icon icon="lucide-calendar-days" size="18" />
              </v-avatar>
            </div>
            <div class="text-caption text-medium-emphasis mt-2">
              TB/đơn: <span class="font-weight-medium">{{ formatVND(orderStats?.avgOrderValue ?? 0) }}</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Message Volume & Pipeline Charts -->
    <v-row class="mb-4">
      <v-col cols="12" md="8">
        <MessageVolumeChart :data="messageVolume" />
      </v-col>
      <v-col cols="12" md="4">
        <PipelineChart :data="pipeline" />
      </v-col>
    </v-row>

    <!-- Appointments Chart -->
    <v-row>
      <v-col cols="12">
        <AppointmentChart :data="appointments" />
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import DashboardSyncWidget from '@/components/dashboard/DashboardSyncWidget.vue';
import KpiCards from '@/components/dashboard/KpiCards.vue';
import MessageVolumeChart from '@/components/dashboard/MessageVolumeChart.vue';
import PipelineChart from '@/components/dashboard/PipelineChart.vue';
import AppointmentChart from '@/components/dashboard/AppointmentChart.vue';
import { useDashboard } from '@/composables/use-dashboard';

const {
  kpi, messageVolume, pipeline, appointments,
  orderStats, loading, fetchAll,
} = useDashboard();

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

onMounted(() => fetchAll());
</script>
