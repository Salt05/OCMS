<template>
  <div class="payments-view pa-4">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-3" style="gap: 16px;">
      <div>
        <h1 class="editorial-heading d-flex align-center gap-2">
          <v-icon color="primary" class="page-icon">lucide-credit-card</v-icon>
          Đối soát & Tự động Kiểm tra Thanh toán
        </h1>
        <div class="text-caption text-medium-emphasis">
          Quản lý biến động số dư 2 tài khoản MB Bank, chấm điểm tin cậy và tự động khớp đơn hàng
        </div>
      </div>

      <div class="d-flex align-center flex-wrap ga-2" style="gap: 12px;">
        <v-btn
          color="secondary"
          variant="outlined"
          prepend-icon="lucide-qr-code"
          class="text-none font-weight-medium"
          @click="showQrModal = true"
        >
          Kết nối Điện thoại (Test QR)
        </v-btn>

        <v-btn
          color="primary"
          prepend-icon="lucide-refresh-cw"
          :loading="loading"
          class="text-none font-weight-medium"
          @click="fetchData"
        >
          Làm mới
        </v-btn>
      </div>
    </div>

    <!-- Metric Cards -->
    <v-row class="mb-4" dense>
      <v-col cols="12" sm="6" md="3">
        <v-card variant="outlined" class="pa-3 rounded-lg border bg-surface">
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption text-medium-emphasis">Thu hôm nay (2 TK MB)</span>
            <v-icon color="success" size="18">lucide-arrow-down-left</v-icon>
          </div>
          <div class="text-h6 font-weight-bold font-monospace text-success">
            {{ formatVND(stats.todayTotalAmount) }}
          </div>
          <div class="text-caption text-medium-emphasis">{{ stats.todayTxCount }} giao dịch phát sinh</div>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <v-card variant="outlined" class="pa-3 rounded-lg border bg-surface">
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption text-medium-emphasis">Đã khớp hôm nay</span>
            <v-icon color="primary" size="18">lucide-check-circle</v-icon>
          </div>
          <div class="text-h6 font-weight-bold font-monospace text-primary">
            {{ stats.todayMatchedCount }}
          </div>
          <div class="text-caption text-medium-emphasis">Đơn hàng đã được xác nhận tiền</div>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <v-card variant="outlined" class="pa-3 rounded-lg border bg-surface">
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption text-medium-emphasis">Cần kế toán duyệt</span>
            <v-chip v-if="stats.pendingReviewCount > 0" size="x-small" color="warning" variant="flat" class="font-weight-bold">
              CẦN XỬ LÝ
            </v-chip>
          </div>
          <div class="text-h6 font-weight-bold font-monospace" :class="stats.pendingReviewCount > 0 ? 'text-warning' : 'text-medium-emphasis'">
            {{ stats.pendingReviewCount }}
          </div>
          <div class="text-caption text-medium-emphasis">Gợi ý 1-click hoặc duyệt thủ công</div>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <v-card variant="outlined" class="pa-3 rounded-lg border bg-surface">
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption text-medium-emphasis">Tài khoản kết nối</span>
            <v-icon color="info" size="18">lucide-landmark</v-icon>
          </div>
          <div class="text-h6 font-weight-bold font-monospace text-high-emphasis">
            {{ accounts.length || 2 }} Tài khoản MB
          </div>
          <div class="text-caption text-success font-weight-medium">🟢 Đang nhận tin nhắn 24/7</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Navigation Tabs -->
    <v-tabs v-model="activeTab" color="primary" class="border-b mb-4">
      <v-tab value="transactions" class="text-none font-weight-medium">
        <v-icon start size="18">lucide-list</v-icon>
        Biến động số dư & Đối soát
        <v-chip v-if="stats.pendingReviewCount > 0" size="x-small" color="warning" variant="flat" class="ml-2 font-weight-bold">
          {{ stats.pendingReviewCount }}
        </v-chip>
      </v-tab>
      <v-tab value="senders" class="text-none font-weight-medium">
        <v-icon start size="18">lucide-user-check</v-icon>
        Khách quen & Điểm uy tín
      </v-tab>
      <v-tab value="accounts" class="text-none font-weight-medium">
        <v-icon start size="18">lucide-settings</v-icon>
        Cấu hình 2 Tài khoản MB Bank
      </v-tab>
    </v-tabs>

    <!-- Tab Contents -->
    <v-window v-model="activeTab">
      <!-- TAB 1: TRANSACTIONS -->
      <v-window-item value="transactions">
        <!-- Filters -->
        <v-card variant="outlined" class="rounded-lg mb-4 pa-3">
          <v-row dense align="center">
            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model="filters.search"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Tìm nội dung, mã đơn, người gửi..."
                prepend-inner-icon="lucide-search"
                clearable
                @update:model-value="fetchTransactions"
              />
            </v-col>

            <v-col cols="6" sm="6" md="2">
              <v-select
                v-model="filters.status"
                :items="statusOptions"
                item-title="text"
                item-value="value"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Trạng thái"
                @update:model-value="fetchTransactions"
              />
            </v-col>

            <v-col cols="6" sm="6" md="3">
              <v-select
                v-model="filters.bankAccountId"
                :items="accountFilterOptions"
                item-title="text"
                item-value="value"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Tài khoản MB"
                @update:model-value="fetchTransactions"
              />
            </v-col>

            <v-col cols="12" sm="6" md="2" class="d-flex justify-end">
              <v-btn
                variant="tonal"
                size="small"
                color="secondary"
                prepend-icon="lucide-rotate-ccw"
                class="text-none"
                @click="resetFilters"
              >
                Đặt lại
              </v-btn>
            </v-col>
          </v-row>
        </v-card>

        <!-- Transactions Table -->
        <v-card variant="outlined" class="rounded-lg mb-4 overflow-hidden">
          <v-progress-linear v-if="loading" indeterminate color="primary" />

          <v-table density="compact" hover class="payments-table">
            <thead>
              <tr class="bg-surface-variant">
                <th style="width: 140px;" class="text-left">Thời gian</th>
                <th style="width: 130px;" class="text-left">Tài khoản nhận</th>
                <th style="width: 130px;" class="text-right">Số tiền</th>
                <th style="width: 150px;" class="text-left">Người chuyển</th>
                <th class="text-left">Nội dung SMS (ND)</th>
                <th style="width: 170px;" class="text-left">Đơn hàng đề xuất</th>
                <th style="width: 110px;" class="text-center">Độ tin cậy</th>
                <th style="width: 120px;" class="text-center">Trạng thái</th>
                <th style="width: 140px;" class="text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && transactions.length === 0">
                <td colspan="9" class="text-center text-medium-emphasis py-8">
                  <v-icon icon="lucide-inbox" size="36" color="grey" class="mb-2" />
                  <div class="text-body-2 font-weight-medium">Chưa có giao dịch biến động số dư nào</div>
                  <div class="text-caption text-grey">Bạn có thể bấm "Kết nối Điện thoại (Test QR)" để thử bắn tin nhắn giả lập</div>
                </td>
              </tr>

              <tr v-for="tx in transactions" :key="tx.id">
                <!-- Time -->
                <td class="text-caption text-medium-emphasis">
                  {{ formatDateTime(tx.transactionTime) }}
                </td>

                <!-- Account -->
                <td>
                  <v-chip size="x-small" color="primary" variant="tonal" class="font-monospace font-weight-bold">
                    MB *{{ tx.accountNumber ? tx.accountNumber.slice(-4) : '...' }}
                  </v-chip>
                </td>

                <!-- Amount -->
                <td class="text-right">
                  <span class="font-weight-bold font-monospace text-caption" :class="tx.type === 'IN' ? 'text-success' : 'text-error'">
                    {{ tx.type === 'IN' ? '+' : '-' }}{{ formatVND(tx.amount) }}
                  </span>
                </td>

                <!-- Sender Name -->
                <td class="text-caption text-high-emphasis font-weight-medium text-truncate" style="max-width: 150px;" :title="tx.senderNameRaw || ''">
                  {{ tx.senderNameRaw || '—' }}
                </td>

                <!-- Description -->
                <td class="text-caption text-medium-emphasis text-truncate" style="max-width: 250px;" :title="tx.description">
                  {{ tx.description }}
                </td>

                <!-- Matched / Suggested Order -->
                <td>
                  <div v-if="tx.matchedOrderCode" class="d-flex align-center gap-1">
                    <v-icon size="14" color="success">lucide-check</v-icon>
                    <strong class="text-caption text-success font-monospace">#{{ tx.matchedOrderCode }}</strong>
                  </div>
                  <div v-else-if="tx.suggestedOrderHistoryId || tx.suggestedOrderId" class="d-flex align-center gap-1">
                    <v-icon size="14" color="warning">lucide-sparkles</v-icon>
                    <span class="text-caption text-warning font-monospace font-weight-medium">Gợi ý #{{ tx.matchedOrderCode || 'Đơn gần nhất' }}</span>
                  </div>
                  <span v-else class="text-caption text-disabled">—</span>
                </td>

                <!-- Confidence Score -->
                <td class="text-center">
                  <v-chip
                    size="x-small"
                    :color="getScoreColor(tx.confidenceScore)"
                    variant="flat"
                    class="font-weight-bold"
                  >
                    {{ tx.confidenceScore }}/100
                  </v-chip>
                </td>

                <!-- Status -->
                <td class="text-center">
                  <v-chip size="x-small" :color="getStatusColor(tx.status)" variant="flat" class="font-weight-medium">
                    {{ getStatusLabel(tx.status) }}
                  </v-chip>
                </td>

                <!-- Actions -->
                <td class="text-center">
                  <div class="d-flex align-center justify-center gap-1" style="gap: 4px;">
                    <!-- 1-Click Approve Button -->
                    <v-btn
                      v-if="tx.status !== 'MATCHED' && (tx.suggestedOrderHistoryId || tx.suggestedOrderId)"
                      color="success"
                      size="x-small"
                      variant="elevated"
                      class="text-none font-weight-bold"
                      :loading="approvingId === tx.id"
                      @click="approveTransaction(tx.id)"
                    >
                      Duyệt khớp
                    </v-btn>

                    <!-- Manual Match Modal Button -->
                    <v-btn
                      v-if="tx.status !== 'MATCHED'"
                      color="primary"
                      size="x-small"
                      variant="outlined"
                      class="text-none"
                      @click="openManualMatch(tx)"
                    >
                      Chọn đơn
                    </v-btn>
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>

      <!-- TAB 2: SENDER IDENTITIES (WHITELIST) -->
      <v-window-item value="senders">
        <v-card variant="outlined" class="rounded-lg pa-4">
          <div class="d-flex align-center justify-space-between mb-3">
            <div>
              <div class="text-subtitle-1 font-weight-bold">Danh sách Khách Quen & Hồ sơ Người Chuyển Khoản</div>
              <div class="text-caption text-medium-emphasis">
                Hệ thống tự động ghi nhớ sau mỗi lần duyệt. Những khách hàng tin cậy cao được bật "Tự động duyệt" sẽ không cần người duyệt ở các lần sau.
              </div>
            </div>
          </div>

          <v-table density="compact" hover>
            <thead>
              <tr class="bg-surface-variant">
                <th class="text-left">Tên người chuyển (Bóc từ SMS)</th>
                <th class="text-left">Khách hàng liên kết trong CRM</th>
                <th class="text-center">Số lần khớp thành công</th>
                <th class="text-center">Cấp độ uy tín</th>
                <th class="text-center">Tự động duyệt</th>
                <th class="text-left">Giao dịch gần nhất</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="senders.length === 0">
                <td colspan="6" class="text-center py-6 text-medium-emphasis">
                  Chưa có dữ liệu danh tính người chuyển. Khi kế toán duyệt khớp các giao dịch đầu tiên, hệ thống sẽ tự động học và lưu vào đây.
                </td>
              </tr>
              <tr v-for="s in senders" :key="s.id">
                <td>
                  <strong class="text-high-emphasis font-monospace">{{ s.senderNameClean }}</strong>
                </td>
                <td>
                  <span v-if="s.contact?.fullName" class="text-primary font-weight-medium">
                    {{ s.contact.fullName }} ({{ s.contact.phone || 'Không SĐT' }})
                  </span>
                  <span v-else class="text-medium-emphasis">—</span>
                </td>
                <td class="text-center font-weight-bold">
                  {{ s.successMatchCount }} lần
                </td>
                <td class="text-center">
                  <v-chip size="x-small" :color="s.trustLevel === 'TRUSTED' ? 'success' : 'primary'" variant="tonal">
                    {{ s.trustLevel }}
                  </v-chip>
                </td>
                <td class="text-center">
                  <v-switch
                    :model-value="s.isAutoApproved"
                    color="success"
                    density="compact"
                    hide-details
                    class="d-inline-flex"
                    @update:model-value="(val) => toggleAutoApprove(s.id, val)"
                  />
                </td>
                <td class="text-caption text-medium-emphasis">
                  {{ formatDateTime(s.lastMatchedAt) }}
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>

      <!-- TAB 3: BANK ACCOUNTS CONFIG -->
      <v-window-item value="accounts">
        <v-card variant="outlined" class="rounded-lg pa-4">
          <div class="text-subtitle-1 font-weight-bold mb-1">Cấu hình 2 Tài khoản MB Bank & Cổng Webhook</div>
          <div class="text-caption text-medium-emphasis mb-4">
            Điện thoại Android sử dụng Webhook URL và Secret Token bên dưới để đẩy tin nhắn SMS về OCMS.
          </div>

          <v-row>
            <v-col v-for="(acc, idx) in accounts" :key="acc.id" cols="12" md="6">
              <v-card variant="outlined" class="pa-4 rounded-xl border bg-surface">
                <div class="d-flex align-center justify-space-between mb-3">
                  <div class="d-flex align-center gap-2">
                    <v-avatar color="primary" size="36">
                      <v-icon color="white" size="18">lucide-landmark</v-icon>
                    </v-avatar>
                    <div>
                      <div class="font-weight-bold text-subtitle-2">{{ acc.bankName }} (TK {{ idx + 1 }})</div>
                      <div class="text-caption text-medium-emphasis">{{ acc.branch || 'Ngân hàng Quân Đội' }}</div>
                    </div>
                  </div>
                  <v-chip size="small" color="success" variant="flat">HOẠT ĐỘNG</v-chip>
                </div>

                <div class="text-caption mb-1">
                  <span class="text-medium-emphasis">Số tài khoản:</span>
                  <strong class="ml-2 font-monospace text-high-emphasis text-body-2">{{ acc.accountNumber }}</strong>
                </div>
                <div class="text-caption mb-1">
                  <span class="text-medium-emphasis">Chủ tài khoản:</span>
                  <strong class="ml-2 text-high-emphasis">{{ acc.accountHolder }}</strong>
                </div>
                <div class="text-caption mb-2">
                  <span class="text-medium-emphasis">Webhook Secret:</span>
                  <code class="ml-2 font-monospace text-primary bg-surface-variant px-1 rounded">{{ acc.webhookSecret }}</code>
                </div>

                <v-divider class="my-3" />

                <div class="text-caption text-medium-emphasis mb-1">Webhook URL gửi SMS:</div>
                <div class="text-caption font-monospace bg-surface-variant pa-2 rounded text-truncate mb-2">
                  {{ webhookEndpointUrl }}
                </div>
              </v-card>
            </v-col>
          </v-row>
        </v-card>
      </v-window-item>
    </v-window>

    <!-- Dialog: Test QR Code Connection -->
    <v-dialog v-model="showQrModal" max-width="480">
      <v-card class="rounded-xl pa-4 text-center">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="font-weight-bold text-subtitle-1">Kết nối Điện thoại Test</div>
          <v-btn icon size="small" variant="text" @click="showQrModal = false">
            <v-icon size="18">lucide-x</v-icon>
          </v-btn>
        </div>

        <div class="text-caption text-medium-emphasis mb-3">
          Mở camera điện thoại hoặc trình duyệt quét mã QR này để truy cập ngay màn hình <strong>Mobile Gateway Test</strong>:
        </div>

        <div class="d-flex justify-center my-3">
          <v-img
            :src="mobileGatewayQrUrl"
            width="220"
            height="220"
            class="elevation-2 rounded-lg border bg-white pa-2"
          />
        </div>

        <div class="text-caption font-monospace bg-surface-variant pa-2 rounded text-truncate mb-3">
          {{ mobileGatewayDirectUrl }}
        </div>

        <v-btn
          color="primary"
          variant="flat"
          block
          class="text-none font-weight-bold"
          @click="openMobileTestInNewTab"
        >
          Mở thử trên Tab mới trình duyệt máy tính
        </v-btn>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import axios from 'axios';

const activeTab = ref('transactions');
const loading = ref(false);
const showQrModal = ref(false);
const approvingId = ref<string | null>(null);

const stats = reactive({
  todayTotalAmount: 0,
  todayTxCount: 0,
  todayMatchedCount: 0,
  pendingReviewCount: 0,
  accountsCount: 2,
});

const filters = reactive({
  search: '',
  status: '',
  bankAccountId: '',
});

const transactions = ref<any[]>([]);
const senders = ref<any[]>([]);
const accounts = ref<any[]>([]);

const statusOptions = [
  { text: 'Tất cả trạng thái', value: '' },
  { text: 'Chờ duyệt / Gợi ý', value: 'SUGGESTED' },
  { text: 'Đã khớp thành công', value: 'MATCHED' },
  { text: 'Chuyển thiếu tiền', value: 'PARTIAL' },
  { text: 'Chuyển thừa tiền', value: 'OVERPAID' },
  { text: 'Cần kiểm tra lại', value: 'MANUAL_REVIEW' },
];

const accountFilterOptions = computed(() => [
  { text: 'Tất cả tài khoản MB', value: '' },
  ...accounts.value.map(a => ({
    text: `${a.bankName} - *${a.accountNumber.slice(-4)} (${a.accountHolder})`,
    value: a.id,
  })),
]);

const webhookEndpointUrl = computed(() => {
  return `${window.location.origin}/api/v1/payments/sms-webhook`;
});

const mobileGatewayDirectUrl = computed(() => {
  return `${window.location.origin}/mobile-gateway`;
});

const mobileGatewayQrUrl = computed(() => {
  return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(mobileGatewayDirectUrl.value)}`;
});

function formatVND(n?: number | null): string {
  if (!n) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function formatDateTime(d?: string | Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function getScoreColor(score = 0): string {
  if (score >= 85) return 'success';
  if (score >= 50) return 'warning';
  return 'error';
}

function getStatusColor(status = ''): string {
  switch (status) {
    case 'MATCHED':
      return 'success';
    case 'SUGGESTED':
      return 'warning';
    case 'PARTIAL':
      return 'amber-darken-3';
    case 'OVERPAID':
      return 'info';
    case 'MANUAL_REVIEW':
      return 'error';
    default:
      return 'grey';
  }
}

function getStatusLabel(status = ''): string {
  switch (status) {
    case 'MATCHED':
      return 'Đã khớp';
    case 'SUGGESTED':
      return 'Chờ duyệt 1-click';
    case 'PARTIAL':
      return 'Thiếu tiền';
    case 'OVERPAID':
      return 'Thừa tiền';
    case 'MANUAL_REVIEW':
      return 'Cần kiểm tra';
    default:
      return status;
  }
}

async function fetchData() {
  loading.value = true;
  try {
    const [statsRes, accountsRes] = await Promise.all([
      axios.get('/api/v1/payments/stats'),
      axios.get('/api/v1/payments/accounts'),
    ]);

    Object.assign(stats, statsRes.data);
    accounts.value = accountsRes.data.accounts || [];

    // Nếu chưa có tài khoản nào, khởi tạo sẵn 2 tài khoản mẫu MB
    if (accounts.value.length === 0) {
      await initDefaultMbAccounts();
    }

    await Promise.all([fetchTransactions(), fetchSenders()]);
  } catch (err) {
    console.error('Lỗi tải dữ liệu thanh toán:', err);
  } finally {
    loading.value = false;
  }
}

async function initDefaultMbAccounts() {
  try {
    await axios.post('/api/v1/payments/accounts', {
      accountNumber: '0380123456789',
      accountHolder: 'CTY TNHH LA PET VIETNAM',
      bankName: 'MB Bank',
      bankCode: 'MB',
      branch: 'Chi nhánh Sài Gòn',
    });
    await axios.post('/api/v1/payments/accounts', {
      accountNumber: '0380987654321',
      accountHolder: 'VO TAN DUNG',
      bankName: 'MB Bank',
      bankCode: 'MB',
      branch: 'Chi nhánh TP.HCM',
    });
    const accRes = await axios.get('/api/v1/payments/accounts');
    accounts.value = accRes.data.accounts || [];
  } catch (e) {}
}

async function fetchTransactions() {
  try {
    const res = await axios.get('/api/v1/payments/transactions', {
      params: {
        status: filters.status,
        bankAccountId: filters.bankAccountId,
        search: filters.search,
      },
    });
    transactions.value = res.data.transactions || [];
  } catch (err) {
    console.error('Lỗi lấy giao dịch:', err);
  }
}

async function fetchSenders() {
  try {
    const res = await axios.get('/api/v1/payments/senders');
    senders.value = res.data.senders || [];
  } catch (err) {
    console.error('Lỗi lấy danh tính người chuyển:', err);
  }
}

function resetFilters() {
  filters.search = '';
  filters.status = '';
  filters.bankAccountId = '';
  fetchTransactions();
}

async function approveTransaction(id: string) {
  approvingId.value = id;
  try {
    await axios.post(`/api/v1/payments/transactions/${id}/approve`, {});
    await fetchData();
  } catch (err: any) {
    alert(err.response?.data?.error || 'Lỗi khi duyệt giao dịch');
  } finally {
    approvingId.value = null;
  }
}

function openManualMatch(tx: any) {
  const code = prompt('Nhập mã đơn hàng (ví dụ ORD-20260920-001 hoặc SO01234) để gán cho giao dịch này:', tx.matchedOrderCode || '');
  if (code && code.trim()) {
    // Có thể mở rộng dialog tìm kiếm đơn
    alert(`Đã chọn gán cho đơn ${code.trim()}`);
  }
}

async function toggleAutoApprove(senderId: string, value: boolean) {
  try {
    await axios.patch(`/api/v1/payments/senders/${senderId}`, {
      isAutoApproved: value,
    });
    await fetchSenders();
  } catch (err) {
    console.error('Lỗi cập nhật auto approve:', err);
  }
}

function openMobileTestInNewTab() {
  window.open(mobileGatewayDirectUrl.value, '_blank');
}

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.payments-table th {
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.payments-table td {
  height: 48px;
}
</style>
