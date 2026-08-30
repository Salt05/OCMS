<template>
  <v-card variant="outlined" class="dashboard-sync-widget rounded-lg mb-4 bg-surface">
    <v-card-text class="pa-4">
      <div class="d-flex align-center justify-space-between flex-wrap gap-3">
        <!-- Left: Status & Last Synced Info -->
        <div class="d-flex align-center gap-3">
          <div class="status-indicator-wrapper">
            <v-avatar
              :color="isSyncing ? 'primary' : (hasError ? 'error' : 'success')"
              variant="tonal"
              size="44"
              rounded="lg"
            >
              <v-icon
                :icon="isSyncing ? 'lucide-refresh-cw' : (hasError ? 'lucide-alert-circle' : 'lucide-cloud-check')"
                :class="{ 'spin-animation': isSyncing }"
                size="22"
              />
            </v-avatar>
          </div>

          <div>
            <div class="d-flex align-center gap-2">
              <span class="text-subtitle-1 font-weight-bold">Đồng bộ Odoo ERP</span>
              <v-chip
                size="x-small"
                :color="isSyncing ? 'primary' : (hasError ? 'error' : 'success')"
                variant="flat"
                class="font-weight-medium"
              >
                {{ isSyncing ? 'Đang đồng bộ...' : (hasError ? 'Lỗi kết nối' : 'Đang hoạt động') }}
              </v-chip>
            </div>
            <div class="text-caption text-medium-emphasis mt-0.5">
              Đồng bộ gần nhất: <span class="font-weight-medium text-body-2">{{ lastSyncedDisplay }}</span>
              <span v-if="totalRecords > 0" class="ml-1">• {{ totalRecords.toLocaleString('vi-VN') }} bản ghi</span>
            </div>
          </div>
        </div>

        <!-- Right: Countdown Timer & Sync Button -->
        <div class="d-flex align-center gap-3 flex-wrap">
          <!-- Countdown Badge -->
          <div class="countdown-badge d-flex align-center gap-2 px-3 py-1.5 rounded-lg border bg-surface-variant">
            <v-icon icon="lucide-timer" size="16" color="primary" />
            <div class="text-caption">
              <span class="text-medium-emphasis">Tự động sau: </span>
              <strong class="font-monospace text-primary text-body-2 font-weight-bold">{{ formattedCountdown }}</strong>
            </div>
          </div>

          <!-- Manual Sync Button -->
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="lucide-refresh-cw"
            :loading="isSyncing"
            @click="triggerManualSync"
          >
            Đồng bộ ngay
          </v-btn>
        </div>
      </div>
    </v-card-text>

    <!-- Error Banner if any -->
    <v-expand-transition>
      <div v-if="hasError && errorMessage" class="px-4 pb-3 pt-0">
        <v-alert
          type="error"
          variant="tonal"
          density="compact"
          class="text-caption rounded-lg"
          closable
        >
          {{ errorMessage }}
        </v-alert>
      </div>
    </v-expand-transition>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api } from '@/api';

const emit = defineEmits<{
  (e: 'synced'): void;
}>();

const isSyncing = ref(false);
const hasError = ref(false);
const errorMessage = ref('');
const lastSyncedAt = ref<Date | null>(null);
const totalRecords = ref(0);

// Auto-sync interval: 5 minutes = 300 seconds
const SYNC_INTERVAL_SECONDS = 300;
const secondsLeft = ref(SYNC_INTERVAL_SECONDS);
let countdownTimer: any = null;

const formattedCountdown = computed(() => {
  const m = Math.floor(secondsLeft.value / 60);
  const s = secondsLeft.value % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
});

const lastSyncedDisplay = computed(() => {
  if (!lastSyncedAt.value) return 'Chưa đồng bộ';
  const diffMs = Date.now() - lastSyncedAt.value.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  
  if (diffMinutes < 1) return 'Vừa xong';
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  
  const h = lastSyncedAt.value.getHours().toString().padStart(2, '0');
  const m = lastSyncedAt.value.getMinutes().toString().padStart(2, '0');
  return `${h}:${m} (${lastSyncedAt.value.toLocaleDateString('vi-VN')})`;
});

async function fetchSyncStatus() {
  try {
    const res = await api.get('/sync/status');
    const states = res.data.syncStates || [];
    
    let latestTime: Date | null = null;
    let records = 0;
    let hasErr = false;
    let errMsg = '';

    for (const s of states) {
      if (s.recordCount) records += s.recordCount;
      if (s.lastSyncedAt) {
        const d = new Date(s.lastSyncedAt);
        if (!latestTime || d > latestTime) latestTime = d;
      }
      if (s.status === 'error') {
        hasErr = true;
        if (s.errorMessage) errMsg = s.errorMessage;
      }
    }

    lastSyncedAt.value = latestTime;
    totalRecords.value = records;
    hasError.value = hasErr;
    errorMessage.value = errMsg;
  } catch (err: any) {
    console.warn('[DashboardSyncWidget] fetch status error:', err);
  }
}

async function triggerManualSync() {
  if (isSyncing.value) return;
  isSyncing.value = true;
  hasError.value = false;
  errorMessage.value = '';

  try {
    await api.post('/sync/incremental');
    lastSyncedAt.value = new Date();
    secondsLeft.value = SYNC_INTERVAL_SECONDS;
    await fetchSyncStatus();
    emit('synced');
  } catch (err: any) {
    hasError.value = true;
    errorMessage.value = err.response?.data?.error || err.message || 'Lỗi khi đồng bộ';
  } finally {
    isSyncing.value = false;
  }
}

function startCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(async () => {
    if (secondsLeft.value > 0) {
      secondsLeft.value--;
    } else {
      // Countdown reached 0: trigger auto-sync
      secondsLeft.value = SYNC_INTERVAL_SECONDS;
      await triggerManualSync();
    }
  }, 1000);
}

onMounted(async () => {
  await fetchSyncStatus();
  startCountdown();
});

onUnmounted(() => {
  clearInterval(countdownTimer);
});
</script>

<style scoped>
.spin-animation {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.countdown-badge {
  background-color: rgba(var(--v-theme-surface-variant), 0.5);
}
</style>
