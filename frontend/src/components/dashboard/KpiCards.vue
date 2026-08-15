<template>
  <v-row>
    <v-col v-for="card in cards" :key="card.title" cols="6" sm="4" md="2">
      <v-card variant="outlined">
        <v-card-text class="text-center pa-3">
          <v-icon :icon="card.icon" :color="card.color" size="32" class="mb-1" />
          <div class="text-h5 font-weight-bold">{{ card.value }}</div>
          <div class="text-caption text-grey">{{ card.title }}</div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface KpiData {
  messagesToday: number;
  messagesUnreplied: number;
  messagesUnread: number;
  appointmentsToday: number;
  newContactsThisWeek: number;
  totalContacts: number;
}

const props = defineProps<{
  kpi: KpiData | null;
}>();

const cards = computed(() => [
  { title: 'Tin nhắn hôm nay', value: props.kpi?.messagesToday ?? '—', icon: 'lucide-message-circle', color: 'primary' },
  { title: 'Chưa trả lời', value: props.kpi?.messagesUnreplied ?? '—', icon: 'lucide-message-circle-warning', color: 'warning' },
  { title: 'Chưa đọc', value: props.kpi?.messagesUnread ?? '—', icon: 'lucide-mail', color: 'orange' },
  { title: 'Lịch hẹn hôm nay', value: props.kpi?.appointmentsToday ?? '—', icon: 'lucide-calendar-days', color: 'success' },
  { title: 'KH mới tuần này', value: props.kpi?.newContactsThisWeek ?? '—', icon: 'lucide-user-plus', color: 'info' },
  { title: 'Tổng khách hàng', value: props.kpi?.totalContacts ?? '—', icon: 'lucide-users', color: 'secondary' },
]);
</script>
