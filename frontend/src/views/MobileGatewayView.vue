<template>
  <div class="mobile-gateway-container pa-3 pa-md-6">
    <v-row dense>
      <v-col cols="12" md="6" lg="6">
        <v-card variant="outlined" class="rounded-xl pa-4 mb-4 elevation-1 bg-surface">
          <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">
            Chọn tài khoản nhận tiền
          </div>

          <v-select
            v-model="selectedAccountId"
            :items="accountOptions"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="compact"
            class="mb-3"
            hide-details
            @update:model-value="onAccountChanged"
          />

          <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-1">
            Tên hoặc ID định dạng người gửi
          </div>

          <v-text-field
            v-model="senderName"
            variant="outlined"
            density="compact"
            placeholder="Ví dụ: MBBANK, VIETCOMBANK, 0987654321, 9704..."
            hide-details
            class="mb-3 font-monospace"
            prepend-inner-icon="lucide-user"
          />

          <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-1">
            Nội dung tin nhắn SMS
          </div>

          <v-textarea
            v-model="smsContent"
            variant="outlined"
            rows="5"
            density="compact"
            placeholder="Dán hoặc nhập tin nhắn SMS ngân hàng vào đây..."
            hide-details
            class="font-monospace text-caption mb-3"
          />

          <v-btn
            color="primary"
            size="large"
            block
            class="font-weight-bold rounded-lg elevation-2 text-none"
            prepend-icon="lucide-send"
            :loading="sending"
            @click="runTest"
          >
            Bắn tin nhắn
          </v-btn>
        </v-card>
      </v-col>

      <v-col cols="12" md="6" lg="6">
        <v-card v-if="testHistory.length > 0" variant="outlined" class="rounded-xl pa-3 bg-surface">
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis d-flex align-center gap-1">
              <v-icon size="14">lucide-history</v-icon>
              Lịch sử test gần đây ({{ testHistory.length }})
            </span>
            <v-btn variant="text" size="x-small" color="error" @click="testHistory = []">
              Xóa lịch sử
            </v-btn>
          </div>

          <v-list density="compact" class="pa-0">
            <v-list-item
              v-for="(item, idx) in testHistory"
              :key="idx"
              class="px-2 py-1 rounded mb-1 border-b cursor-pointer hover-bg"
              @click="loadFromHistory(item)"
            >
              <div class="d-flex align-center justify-space-between text-caption">
                <div class="d-flex align-center gap-1">
                  <v-chip size="x-small" :color="item.type === 'dry-run' ? 'info' : 'primary'" variant="tonal">
                    {{ item.type === 'dry-run' ? 'DRY' : 'LIVE' }}
                  </v-chip>
                  <span class="font-monospace text-medium-emphasis text-xs">Gửi lúc {{ item.time }}</span>
                </div>
                <div class="d-flex align-center gap-1">
                  <span class="font-weight-bold font-monospace text-success text-xs">Số tiền: {{ item.amount }}</span>
                  <v-chip size="x-small" :color="getStatusColor(item.status)" variant="flat">
                    {{ item.status }}
                  </v-chip>
                </div>
              </div>
              <div class="text-caption text-truncate text-high-emphasis mt-0.5 font-monospace text-xs">
                [{{ item.sender }}] {{ item.content }}
              </div>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { api } from '@/api';

interface BankAccountItem {
  id: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  webhookSecret: string;
}

const accounts = ref<BankAccountItem[]>([]);
const selectedAccountId = ref<string>('');
const senderName = ref('MBBANK');
const deviceId = ref('phone_simulator');
const messageId = ref(`msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`);
const customToken = ref('');
const smsContent = ref('');
const sending = ref(false);

interface HistoryItem {
  time: string;
  type: 'dry-run' | 'live';
  sender: string;
  content: string;
  status: string;
  amount: string;
}

const testHistory = ref<HistoryItem[]>([]);

const selectedAccountData = computed(() => {
  return accounts.value.find((a) => a.id === selectedAccountId.value);
});

const selectedAccountNumber = computed(() => {
  return selectedAccountData.value?.accountNumber || '0380123456789';
});

const accountOptions = computed(() => {
  return accounts.value.map((acc) => ({
    title: `[${acc.bankCode}] ${acc.accountNumber} - ${acc.accountHolder}`,
    value: acc.id,
  }));
});

function generateNewMessageId() {
  messageId.value = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function getDefaultSmsContent(accountNumber: string): string {
  const now = new Date();
  const time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `MBBANK: TK ${accountNumber} +500,000VND luc ${time} ${date}. So du: 15,200,000VND. ND: Paddy Nơ Trang long`;
}

function onAccountChanged() {
  const acc = selectedAccountData.value;
  if (acc) {
    customToken.value = acc.webhookSecret;
    smsContent.value = smsContent.value
      ? smsContent.value.replace(/TK\s+\S+/, `TK ${acc.accountNumber}`)
      : getDefaultSmsContent(acc.accountNumber);
  }
}

function getStatusColor(status?: string): string {
  switch (status) {
    case 'MATCHED':
    case 'SUCCESS':
      return 'success';
    case 'SUGGESTED':
      return 'warning';
    case 'PARTIAL':
      return 'amber-darken-3';
    case 'OVERPAID':
      return 'info';
    case 'MANUAL_REVIEW':
      return 'error';
    case 'DUPLICATE':
      return 'grey-darken-1';
    default:
      return 'grey';
  }
}

async function runTest() {
  if (!smsContent.value.trim()) return;
  sending.value = true;

  try {
    const headers: Record<string, string> = {};
    if (customToken.value.trim()) {
      headers['Authorization'] = `Bearer ${customToken.value.trim()}`;
    }

    const payload = {
      sender: senderName.value,
      content: smsContent.value,
      message: smsContent.value,
      timestamp: Date.now(),
      deviceId: deviceId.value,
      messageId: messageId.value,
      simAccountNumber: selectedAccountNumber.value,
    };

    const res = await axios.post(
      '/api/v1/payments/sms-webhook',
      payload,
      { headers }
    );

    addHistoryItem('live', res.data);
    generateNewMessageId();
  } catch (err: any) {
    addHistoryItem('live', {
      success: false,
      error: err.response?.data?.error || err.message || 'Lỗi kết nối tới máy chủ OCMS',
    });
  } finally {
    sending.value = false;
  }
}

function addHistoryItem(type: 'dry-run' | 'live', res: any) {
  const amt =
    res.parsed?.amount !== undefined
      ? `${(res.parsed.amount).toLocaleString('vi-VN')} đ`
      : res.amount !== undefined
        ? `${Number(res.amount).toLocaleString('vi-VN')} đ`
        : '—';
  const status = res.status || (res.success ? 'SUCCESS' : 'ERROR');

  testHistory.value.unshift({
    time: new Date().toLocaleTimeString('vi-VN'),
    type,
    sender: senderName.value,
    content: smsContent.value,
    status,
    amount: amt,
  });

  if (testHistory.value.length > 20) {
    testHistory.value.pop();
  }
}

function loadFromHistory(item: HistoryItem) {
  senderName.value = item.sender;
  smsContent.value = item.content;
}

async function loadAccounts() {
  try {
    const res = await axios.get('/api/v1/payments/simulator-accounts');
    if (res.data?.success && Array.isArray(res.data.accounts) && res.data.accounts.length > 0) {
      accounts.value = res.data.accounts;
      selectedAccountId.value = accounts.value[0].id;
      customToken.value = accounts.value[0].webhookSecret;
      smsContent.value = getDefaultSmsContent(accounts.value[0].accountNumber);
      return;
    }
  } catch (e) {
    // Thử load qua api client nếu đã đăng nhập
    try {
      const resAuth = await api.get('/payments/accounts');
      if (Array.isArray(resAuth.data) && resAuth.data.length > 0) {
        accounts.value = resAuth.data;
        selectedAccountId.value = accounts.value[0].id;
        customToken.value = accounts.value[0].webhookSecret;
        smsContent.value = getDefaultSmsContent(accounts.value[0].accountNumber);
        return;
      }
    } catch (e2) {}
  }

  // Fallback nếu chưa có tài khoản nào
  accounts.value = [
    {
      id: 'default-mb-1',
      bankCode: 'MB',
      bankName: 'MB Bank',
      accountNumber: '0380123456789',
      accountHolder: 'CTY TNHH LA PET VIETNAM',
      webhookSecret: 'ocms_gateway_secret_key',
    },
    {
      id: 'default-mb-2',
      bankCode: 'MB',
      bankName: 'MB Bank',
      accountNumber: '0380987654321',
      accountHolder: 'VO TAN DUNG',
      webhookSecret: 'ocms_mb_test_secret_02',
    },
  ];
  selectedAccountId.value = accounts.value[0].id;
  customToken.value = accounts.value[0].webhookSecret;
  smsContent.value = getDefaultSmsContent(accounts.value[0].accountNumber);
}

onMounted(async () => {
  await loadAccounts();
});
</script>

<style scoped>
.mobile-gateway-container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

.cursor-pointer {
  cursor: pointer;
}

.hover-bg:hover {
  background-color: rgba(var(--v-theme-primary), 0.05);
}

.raw-json-box {
  max-height: 250px;
  line-height: 1.4;
}

.text-xs {
  font-size: 0.75rem !important;
}
</style>
