<template>
  <div>
    <h1 class="text-h4 mb-4">
      <v-icon class="mr-2" style="color: #00F2FF;">mdi-view-dashboard</v-icon>
      Dashboard
    </h1>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <KpiCards :kpi="kpi" class="mb-4" />

    <!-- Order KPI cards -->
    <v-row class="mb-4">
      <v-col cols="6" sm="3">
        <v-card variant="outlined">
          <v-card-text class="text-center pa-3">
            <v-icon icon="mdi-cart-outline" color="primary" size="28" class="mb-1" />
            <div class="text-h5 font-weight-bold">{{ orderStats?.totalOrders ?? '—' }}</div>
            <div class="text-caption text-grey">Đơn hàng mới</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="outlined">
          <v-card-text class="text-center pa-3">
            <v-icon icon="mdi-calendar-today" color="orange" size="28" class="mb-1" />
            <div class="text-h6 font-weight-bold">{{ formatVND(orderStats?.todayRevenue ?? 0) }}</div>
            <div class="text-caption text-grey">Doanh thu hôm nay</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row class="mb-4">
      <v-col cols="12" md="8">
        <MessageVolumeChart :data="messageVolume" />
      </v-col>
      <v-col cols="12" md="4">
        <PipelineChart :data="pipeline" />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="6">
        <SourceChart :data="sources" />
      </v-col>
      <v-col cols="12" md="6">
        <AppointmentChart :data="appointments" />
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import KpiCards from '@/components/dashboard/KpiCards.vue';
import MessageVolumeChart from '@/components/dashboard/MessageVolumeChart.vue';
import PipelineChart from '@/components/dashboard/PipelineChart.vue';
import SourceChart from '@/components/dashboard/SourceChart.vue';
import AppointmentChart from '@/components/dashboard/AppointmentChart.vue';
import { useDashboard } from '@/composables/use-dashboard';

const {
  kpi, messageVolume, pipeline, sources, appointments,
  orderStats, loading, fetchAll,
} = useDashboard();

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

onMounted(() => fetchAll());
</script>
