<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="editorial-heading">Tài khoản Zalo</h1>
      <v-spacer />
      <v-btn v-if="authStore.isAdmin" color="primary" prepend-icon="lucide-plus" @click="showAddDialog = true">Thêm Zalo</v-btn>
    </div>

    <!-- Health check & Reconnect monitor card -->
    <v-card class="mb-4 pa-4 rounded-lg border" elevation="0">
      <div class="d-flex flex-wrap align-center justify-space-between" style="gap: 12px;">
        <div class="d-flex align-center">
          <v-avatar size="40" :color="hasDisconnected ? 'warning' : 'success'" class="mr-3" variant="tonal">
            <v-icon size="22">{{ hasDisconnected ? 'lucide-alert-triangle' : 'lucide-shield-check' }}</v-icon>
          </v-avatar>
          <div>
            <div class="text-subtitle-2 font-weight-bold d-flex align-center">
              <span>{{ hasDisconnected ? 'Có tài khoản ngắt kết nối' : 'Tất cả tài khoản Zalo đang kết nối ổn định' }}</span>
              <v-chip size="x-small" :color="hasDisconnected ? 'warning' : 'success'" class="ml-2 font-weight-bold" variant="flat">
                {{ connectedCount }}/{{ accounts.length }} Hoạt động
              </v-chip>
            </div>
            <div class="text-caption text-medium-emphasis d-flex align-center mt-1">
              <v-icon size="14" class="mr-1">lucide-clock</v-icon>
              <span>{{ hasDisconnected ? 'Tự động phục hồi kết nối sau: ' : 'Tự động kiểm tra định kỳ sau: ' }}</span>
              <span class="text-high-emphasis font-weight-bold ml-1 font-mono" style="font-size: 13px;">{{ formattedCountdown }}</span>
            </div>
          </div>
        </div>

        <div class="d-flex align-center">
          <v-btn
            color="primary"
            variant="flat"
            size="small"
            prepend-icon="lucide-refresh-cw"
            :loading="isReconnectingAll"
            :disabled="cooldownSeconds > 0"
            @click="handleManualReconnectAll"
          >
            <span v-if="cooldownSeconds > 0">Thử lại sau ({{ cooldownSeconds }}s)</span>
            <span v-else>Kết nối lại ngay</span>
          </v-btn>
        </div>
      </div>
    </v-card>

    <v-card>
      <v-data-table :headers="headers" :items="accounts" :loading="loading" no-data-text="Chưa có tài khoản Zalo nào">
        <template #item.status="{ item }">
          <v-chip :color="statusColor(item.liveStatus || item.status)" size="small" variant="flat">
            {{ statusText(item.liveStatus || item.status) }}
          </v-chip>
        </template>
        <template #item.aiSettings="{ item }">
          <div class="d-flex align-center gap-2">
            <v-switch
              v-model="item.aiAutoReply"
              color="success"
              density="compact"
              hide-details
              inset
              :disabled="!authStore.isAdmin"
              @update:model-value="(val) => handleToggleAiAutoReply(item, !!val)"
              class="ma-0 pa-0"
            >
              <template #label>
                <span class="text-caption font-weight-medium">
                  {{ item.aiAutoReply ? 'Bật AI' : 'Tắt AI' }}
                </span>
              </template>
            </v-switch>
          </div>
        </template>
        <template #item.actions="{ item }">
          <v-btn icon size="small" color="success" @click="syncContacts(item.id)" title="Đồng bộ danh bạ Zalo" :loading="syncing === item.id">
            <v-icon>lucide-user-round-cog</v-icon>
          </v-btn>
          <v-btn v-if="item.liveStatus !== 'connected'" icon size="small" color="primary" @click="loginAccount(item.id)" title="Đăng nhập QR">
            <v-icon>lucide-qr-code</v-icon>
          </v-btn>
          <v-btn v-if="item.liveStatus === 'disconnected' && item.sessionData" icon size="small" color="info" @click="reconnectAccount(item.id)" title="Kết nối lại">
            <v-icon>lucide-refresh-cw</v-icon>
          </v-btn>
          <v-btn v-if="authStore.isAdmin" icon size="small" color="error" @click="confirmDelete(item)" title="Xóa">
            <v-icon>lucide-trash-2</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <!-- Add account dialog -->
    <v-dialog v-model="showAddDialog" max-width="400">
      <v-card>
        <v-card-title>Thêm tài khoản Zalo</v-card-title>
        <v-card-text>
          <v-text-field v-model="newAccountName" label="Tên hiển thị (VD: Zalo Sale Hương)" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showAddDialog = false">Hủy</v-btn>
          <v-btn color="primary" :loading="adding" @click="handleAddAccount">Thêm</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- QR Code dialog -->
    <v-dialog v-model="showQRDialog" max-width="400" persistent>
      <v-card class="text-center pa-4">
        <v-card-title>Quét QR để đăng nhập Zalo</v-card-title>
        <v-card-text>
          <div v-if="qrImage" class="mb-4">
            <img :src="'data:image/png;base64,' + qrImage" alt="QR Code" style="max-width: 280px;" />
          </div>
          <div v-else-if="qrScanned" class="mb-4">
            <v-icon icon="lucide-circle-check-big" size="64" color="success" />
            <p class="text-h6 mt-2">Đã quét! Xác nhận trên điện thoại...</p>
            <p v-if="scannedName" class="text-body-2">{{ scannedName }}</p>
          </div>
          <div v-else class="mb-4">
            <v-progress-circular indeterminate color="primary" size="64" />
            <p class="mt-2">Đang tạo QR code...</p>
          </div>
          <v-alert v-if="qrError" type="error" density="compact" class="mt-2">{{ qrError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="cancelQR">Đóng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete confirm dialog -->
    <v-dialog v-model="showDeleteDialog" max-width="450">
      <v-card>
        <v-card-title>Xác nhận vô hiệu hóa</v-card-title>
        <v-card-text>
          Bạn có chắc muốn vô hiệu hóa tài khoản "{{ deleteTarget?.displayName || deleteTarget?.id }}"?
          <br /><br />
          <strong>Lưu ý:</strong> Tài khoản sẽ bị ngắt kết nối và không nhận tin nhắn mới. Toàn bộ dữ liệu hội thoại, tin nhắn và khách hàng vẫn được giữ nguyên.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDeleteDialog = false">Hủy</v-btn>
          <v-btn color="warning" :loading="deleting" @click="handleDeleteAccount">Vô hiệu hóa</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3500" location="top">
      {{ snackbar.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useZaloAccounts, type ZaloAccount } from '@/composables/use-zalo-accounts';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api/index';

const {
  accounts, loading, adding, deleting,
  showQRDialog, qrImage, qrScanned, scannedName, qrError,
  statusColor, statusText,
  fetchAccounts, addAccount, loginAccount, reconnectAccount, deleteAccount,
  updateAccountAiSettings,
  cancelQR, setupSocket,
} = useZaloAccounts();

const authStore = useAuthStore();

const showAddDialog = ref(false);
const syncing = ref<string | null>(null);
const showDeleteDialog = ref(false);
const newAccountName = ref('');
const deleteTarget = ref<ZaloAccount | null>(null);

function getSecondsUntilNextHealthCheck(): number {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const minutesPastLastRun = minutes % 5;
  const secondsPastLastRun = minutesPastLastRun * 60 + seconds;
  const remaining = 300 - secondsPastLastRun;
  return remaining <= 0 ? 300 : remaining;
}

const countdownSeconds = ref(getSecondsUntilNextHealthCheck());
const cooldownSeconds = ref(0);
const isReconnectingAll = ref(false);
const snackbar = ref({ show: false, text: '', color: 'info' });
let timerInterval: any = null;

const headers = computed(() => {
  const list: any[] = [
    { title: 'Tên', key: 'displayName', sortable: true },
    { title: 'Zalo UID', key: 'zaloUid' },
    { title: 'SĐT', key: 'phone' },
    { title: 'Trạng thái', key: 'status', sortable: true },
    { title: 'AI Auto Chat', key: 'aiSettings', sortable: false, width: '130px' },
  ];
  if (authStore.isAdmin) {
    list.push({ title: 'Hành động', key: 'actions', sortable: false, align: 'end' as const });
  }
  return list;
});

async function handleToggleAiAutoReply(item: ZaloAccount, enabled: boolean) {
  const success = await updateAccountAiSettings(item.id, { aiAutoReply: enabled });
  if (success) {
    snackbar.value = {
      show: true,
      text: `${enabled ? 'Đã bật' : 'Đã tắt'} AI Auto Chat cho tài khoản "${item.displayName || item.id}"`,
      color: 'success',
    };
  } else {
    item.aiAutoReply = !enabled;
    snackbar.value = {
      show: true,
      text: 'Không thể cập nhật cấu hình AI',
      color: 'error',
    };
  }
}

const connectedCount = computed(() => {
  return accounts.value.filter((a) => (a.liveStatus || a.status) === 'connected').length;
});

const hasDisconnected = computed(() => {
  return accounts.value.some((a) => (a.liveStatus || a.status) === 'disconnected' || (a.liveStatus || a.status) === 'error');
});

const formattedCountdown = computed(() => {
  const m = Math.floor(countdownSeconds.value / 60);
  const s = countdownSeconds.value % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
});

async function handleManualReconnectAll() {
  if (cooldownSeconds.value > 0 || isReconnectingAll.value) return;
  isReconnectingAll.value = true;
  cooldownSeconds.value = 20; // 20s cooldown

  try {
    const res = await api.post('/zalo-accounts/reconnect-all');
    snackbar.value = {
      show: true,
      text: res.data.message || 'Đã kích hoạt kiểm tra kết nối',
      color: 'success',
    };
  } catch (err: any) {
    snackbar.value = {
      show: true,
      text: 'Kiểm tra thất bại: ' + (err.response?.data?.error || err.message),
      color: 'error',
    };
  } finally {
    await fetchAccounts();
    countdownSeconds.value = getSecondsUntilNextHealthCheck();
    isReconnectingAll.value = false;
  }
}

async function syncContacts(accountId: string) {
  syncing.value = accountId;
  try {
    const res = await api.post(`/zalo-accounts/${accountId}/sync-contacts`);
    snackbar.value = {
      show: true,
      text: `Đồng bộ thành công: ${res.data.created} mới, ${res.data.updated} cập nhật`,
      color: 'success',
    };
  } catch (err: any) {
    snackbar.value = {
      show: true,
      text: 'Đồng bộ thất bại: ' + (err.response?.data?.error || err.message),
      color: 'error',
    };
  } finally {
    syncing.value = null;
  }
}

async function handleAddAccount() {
  const ok = await addAccount(newAccountName.value);
  if (ok) {
    showAddDialog.value = false;
    newAccountName.value = '';
  }
}

function confirmDelete(account: ZaloAccount) {
  deleteTarget.value = account;
  showDeleteDialog.value = true;
}



async function handleDeleteAccount() {
  if (!deleteTarget.value) return;
  const ok = await deleteAccount(deleteTarget.value);
  if (ok) {
    showDeleteDialog.value = false;
    deleteTarget.value = null;
  }
}

onMounted(() => {
  fetchAccounts();
  setupSocket();

  countdownSeconds.value = getSecondsUntilNextHealthCheck();

  timerInterval = setInterval(() => {
    const remaining = getSecondsUntilNextHealthCheck();
    if (remaining === 300 || remaining === 1) {
      fetchAccounts();
    }
    countdownSeconds.value = remaining;

    if (cooldownSeconds.value > 0) {
      cooldownSeconds.value--;
    }
  }, 1000);
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});
</script>
