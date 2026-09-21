<template>
  <div class="mobile-gateway-container pa-3 pa-md-6">
    <!-- Top Header -->
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2" style="gap: 12px;">
      <div class="d-flex align-center gap-3">
        <v-avatar color="primary" size="42" class="elevation-2">
          <v-icon color="white" size="22">lucide-smartphone</v-icon>
        </v-avatar>
        <div>
          <div class="text-h6 font-weight-bold text-high-emphasis d-flex align-center gap-2">
            Mobile Gateway Test & Định Dạng SMS
          </div>
          <div class="text-caption text-medium-emphasis">
            Trình giả lập và kiểm tra bóc tách biến động số dư ngân hàng thời gian thực
          </div>
        </div>
      </div>

      <div class="d-flex align-center flex-wrap ga-2" style="gap: 8px;">
        <v-chip
          size="small"
          :color="serverOnline ? 'success' : 'error'"
          variant="flat"
          class="font-weight-bold"
        >
          <v-icon start size="14">{{ serverOnline ? 'lucide-check-circle-2' : 'lucide-alert-triangle' }}</v-icon>
          {{ serverOnline ? 'SERVER ONLINE' : 'SERVER OFFLINE' }}
        </v-chip>

        <v-btn
          to="/payments"
          variant="outlined"
          size="small"
          color="secondary"
          prepend-icon="lucide-credit-card"
          class="text-none font-weight-medium"
        >
          Quản lý Thanh toán
        </v-btn>
      </div>
    </div>

    <!-- Alert / Introduction -->
    <v-alert
      density="compact"
      variant="tonal"
      color="primary"
      class="mb-4 text-caption rounded-lg"
      prepend-icon="lucide-info"
    >
      Giao diện giả lập tin nhắn SMS ngân hàng từ điện thoại: Hỗ trợ tùy chỉnh <strong>Tên/ID người gửi</strong>, <strong>Nội dung SMS</strong>, <strong>Tài khoản nhận</strong>. Bạn có thể chọn <strong>"Phân tích thử (Dry-run)"</strong> để kiểm tra bóc tách mà không ghi CSDL, hoặc <strong>"Bắn tin nhắn sang OCMS (Live)"</strong> để ghi nhận giao dịch thật!
    </v-alert>

    <!-- Main Content: Two Columns on Medium+ Screens -->
    <v-row dense>
      <!-- LEFT COLUMN: INPUTS & SETTINGS -->
      <v-col cols="12" md="6" lg="6">
        <v-card variant="outlined" class="rounded-xl pa-4 mb-4 elevation-1 bg-surface">
          <!-- 1. Select Bank Account -->
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
              1. Chọn tài khoản nhận tiền
            </span>
            <v-chip v-if="selectedAccountData" size="x-small" color="primary" variant="flat">
              {{ selectedAccountData.bankCode || 'BANK' }}
            </v-chip>
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

          <!-- 2. Sender Name / Format ID -->
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
              2. Tên hoặc ID định dạng người gửi
            </span>
            <span class="text-caption text-medium-emphasis text-xs">Brandname / Số máy</span>
          </div>

          <!-- Quick Sender Chips -->
          <div class="d-flex flex-wrap mb-2" style="gap: 6px;">
            <v-chip
              v-for="s in quickSenders"
              :key="s"
              size="x-small"
              :variant="senderName === s ? 'flat' : 'outlined'"
              :color="senderName === s ? 'primary' : 'default'"
              class="cursor-pointer font-weight-medium"
              @click="setSender(s)"
            >
              {{ s }}
            </v-chip>
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

          <!-- 3. SMS Templates -->
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
              3. Chọn mẫu tin nhắn ngân hàng
            </span>
            <span class="text-caption text-medium-emphasis text-xs">{{ templates.length }} mẫu</span>
          </div>

          <div class="d-flex flex-wrap mb-3" style="gap: 6px;">
            <v-chip
              v-for="(tpl, idx) in templates"
              :key="idx"
              size="small"
              variant="outlined"
              color="primary"
              class="cursor-pointer font-weight-medium"
              @click="applyTemplate(tpl)"
            >
              {{ tpl.label }}
            </v-chip>
          </div>

          <!-- 4. SMS Content -->
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
              4. Nội dung tin nhắn SMS
            </span>
            <span class="text-caption text-medium-emphasis text-xs font-monospace">
              {{ smsContent.length }} ký tự
            </span>
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

          <!-- 5. Advanced Settings (Collapsible) -->
          <v-expansion-panels variant="accordion" class="mb-3 rounded-lg border">
            <v-expansion-panel elevation="0">
              <v-expansion-panel-title class="pa-2 text-caption font-weight-medium text-medium-emphasis">
                <v-icon start size="16">lucide-settings-2</v-icon>
                Cấu hình nâng cao (Mã thiết bị, Message ID, Token)
              </v-expansion-panel-title>
              <v-expansion-panel-text class="pa-2">
                <v-row dense>
                  <v-col cols="6">
                    <v-text-field
                      v-model="deviceId"
                      label="Mã thiết bị (Device ID)"
                      variant="outlined"
                      density="compact"
                      hide-details
                      class="mb-2"
                    />
                  </v-col>
                  <v-col cols="6">
                    <div class="d-flex align-center gap-1">
                      <v-text-field
                        v-model="messageId"
                        label="Message ID (Chống trùng)"
                        variant="outlined"
                        density="compact"
                        hide-details
                        class="mb-2"
                      />
                      <v-btn
                        icon="lucide-refresh-cw"
                        size="small"
                        variant="tonal"
                        color="primary"
                        title="Tạo Message ID ngẫu nhiên mới"
                        @click="generateNewMessageId"
                      />
                    </div>
                  </v-col>
                  <v-col cols="12">
                    <v-text-field
                      v-model="customToken"
                      label="Mã bí mật xác thực (Authorization: Bearer <TOKEN>)"
                      variant="outlined"
                      density="compact"
                      hide-details
                      class="mb-1 font-monospace"
                      append-inner-icon="lucide-key"
                    />
                    <div class="text-caption text-medium-emphasis text-xs">
                      Tự động điền theo tài khoản đã chọn. Có thể sửa token sai để kiểm tra phản hồi 401 Unauthorized.
                    </div>
                  </v-col>
                </v-row>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <!-- 6. Action Buttons -->
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-btn
                color="secondary"
                variant="outlined"
                size="large"
                block
                class="font-weight-bold rounded-lg text-none"
                prepend-icon="lucide-scan"
                :loading="analyzing"
                @click="dryRunParse"
              >
                Phân tích thử (Dry-run)
              </v-btn>
            </v-col>

            <v-col cols="12" sm="6">
              <v-btn
                color="primary"
                size="large"
                block
                class="font-weight-bold rounded-lg elevation-2 text-none"
                prepend-icon="lucide-send"
                :loading="sending"
                @click="sendTestSms"
              >
                Bắn tin nhắn sang OCMS
              </v-btn>
            </v-col>
          </v-row>
        </v-card>
      </v-col>

      <!-- RIGHT COLUMN: RESULTS & HISTORY -->
      <v-col cols="12" md="6" lg="6">
        <!-- Result Box -->
        <v-card variant="outlined" class="rounded-xl pa-4 mb-4 bg-surface elevation-1">
          <div class="d-flex align-center justify-space-between mb-3 border-b pb-2">
            <div class="font-weight-bold text-subtitle-2 d-flex align-center gap-2">
              <v-icon
                :color="lastResponse ? (lastResponse.success ? 'success' : 'error') : 'medium-emphasis'"
                size="20"
              >
                {{ lastResponse ? (lastResponse.success ? 'lucide-check-circle-2' : 'lucide-alert-triangle') : 'lucide-activity' }}
              </v-icon>
              Kết Quả Phân Tích & Chấm Điểm
            </div>

            <div class="d-flex align-center gap-1" v-if="lastResponse">
              <v-chip size="x-small" :color="lastTestType === 'dry-run' ? 'info' : 'primary'" variant="tonal" class="font-weight-bold">
                {{ lastTestType === 'dry-run' ? 'DRY-RUN (XEM TRƯỚC)' : 'LIVE WEBHOOK' }}
              </v-chip>
              <v-chip
                size="x-small"
                :color="getStatusColor(lastResponse.status || (lastResponse.scoring && lastResponse.scoring.status))"
                variant="flat"
                class="font-weight-bold"
              >
                {{ lastResponse.status || (lastResponse.scoring && lastResponse.scoring.status) || (lastResponse.success ? 'SUCCESS' : 'ERROR') }}
              </v-chip>
            </div>
          </div>

          <!-- Empty state when no test performed yet -->
          <div v-if="!lastResponse" class="text-center py-8 text-medium-emphasis">
            <v-icon size="48" class="mb-2 opacity-50">lucide-flask-conical</v-icon>
            <div class="text-subtitle-2 font-weight-medium">Chưa có kết quả kiểm tra</div>
            <div class="text-caption mt-1">
              Hãy chọn mẫu tin nhắn bên trái rồi bấm <strong>"Phân tích thử"</strong> hoặc <strong>"Bắn tin nhắn"</strong> để xem kết quả bóc tách.
            </div>
          </div>

          <!-- Response Details -->
          <div v-else>
            <!-- Error message if failed -->
            <v-alert
              v-if="!lastResponse.success"
              color="error"
              variant="tonal"
              density="compact"
              class="mb-3 rounded-lg text-caption font-weight-medium"
              prepend-icon="lucide-alert-circle"
            >
              {{ lastResponse.error || 'Yêu cầu không thành công' }}
            </v-alert>

            <!-- Success Content -->
            <div v-if="lastResponse.success">
              <!-- Duplicate notice -->
              <v-alert
                v-if="lastResponse.isDuplicate"
                color="warning"
                variant="tonal"
                density="compact"
                class="mb-3 rounded-lg text-caption font-weight-medium"
                prepend-icon="lucide-copy"
              >
                {{ lastResponse.message || 'Phát hiện tin nhắn trùng lặp (Idempotent) -> Đã bỏ qua không ghi đè!' }}
              </v-alert>

              <!-- Amount Highlight Banner -->
              <div class="pa-3 rounded-lg border bg-surface-variant mb-3 d-flex align-center justify-space-between">
                <div>
                  <div class="text-caption text-medium-emphasis">Số tiền biến động</div>
                  <div class="text-h5 font-weight-bold font-monospace" :class="amountColorClass">
                    {{ parsedAmountFormatted }}
                  </div>
                </div>
                <div class="text-right">
                  <v-chip
                    size="small"
                    :color="parsedType === 'IN' ? 'success' : 'error'"
                    variant="flat"
                    class="font-weight-bold"
                  >
                    {{ parsedType === 'IN' ? 'TIỀN VÀO (+)' : 'TIỀN RA (-)' }}
                  </v-chip>
                  <div class="text-caption text-medium-emphasis mt-1 font-monospace">
                    {{ parsedBankCode }} | {{ parsedAccountNumber }}
                  </div>
                </div>
              </div>

              <!-- Parameter Breakdown Grid -->
              <v-row dense class="mb-3 text-caption">
                <v-col cols="6">
                  <div class="pa-2 rounded border bg-surface">
                    <div class="text-medium-emphasis text-xs">Chủ tài khoản</div>
                    <div class="font-weight-bold text-truncate text-high-emphasis">
                      {{ parsedAccountHolder || 'Chưa xác định' }}
                    </div>
                  </div>
                </v-col>

                <v-col cols="6">
                  <div class="pa-2 rounded border bg-surface">
                    <div class="text-medium-emphasis text-xs">Người gửi trích xuất</div>
                    <div class="font-weight-bold text-truncate text-primary">
                      {{ parsedSenderName || 'Không tìm thấy' }}
                    </div>
                  </div>
                </v-col>

                <v-col cols="6">
                  <div class="pa-2 rounded border bg-surface">
                    <div class="text-medium-emphasis text-xs">Mã đơn nhận diện</div>
                    <div class="font-weight-bold text-success text-truncate">
                      {{ matchedOrderCode ? `#${matchedOrderCode}` : 'Không có mã' }}
                    </div>
                  </div>
                </v-col>

                <v-col cols="6">
                  <div class="pa-2 rounded border bg-surface">
                    <div class="text-medium-emphasis text-xs">Số ĐT nhận diện</div>
                    <div class="font-weight-bold text-high-emphasis">
                      {{ parsedCandidatePhone || 'Không có' }}
                    </div>
                  </div>
                </v-col>
              </v-row>

              <!-- Scoring & Confidence Progress -->
              <div class="pa-3 rounded-lg border bg-surface mb-3">
                <div class="d-flex align-center justify-space-between mb-1">
                  <span class="text-caption font-weight-bold">Điểm tin cậy (Confidence Score)</span>
                  <span class="text-caption font-weight-bold font-monospace text-primary">
                    {{ confidenceScore }}/100 đ
                  </span>
                </div>
                <v-progress-linear
                  :model-value="confidenceScore"
                  :color="confidenceScore >= 90 ? 'success' : (confidenceScore >= 60 ? 'warning' : 'error')"
                  height="8"
                  rounded
                  class="mb-2"
                />

                <div class="d-flex align-center justify-space-between text-xs text-medium-emphasis">
                  <span>Trạng thái duyệt:</span>
                  <strong :class="isAutoApproved ? 'text-success' : 'text-amber-darken-3'">
                    {{ isAutoApproved ? 'Tự động duyệt thành công (100%)' : 'Chờ kế toán xác nhận 1-click' }}
                  </strong>
                </div>

                <div v-if="lastResponse.transactionId" class="mt-2 pt-2 border-t text-xs font-monospace text-medium-emphasis d-flex align-center justify-space-between">
                  <span>Mã GD CSDL:</span>
                  <span class="text-high-emphasis">{{ lastResponse.transactionId.slice(0, 18) }}...</span>
                </div>
              </div>

              <!-- Quick Link to Payments Table -->
              <div v-if="lastResponse.transactionId" class="mb-3">
                <v-btn
                  to="/payments"
                  color="primary"
                  variant="tonal"
                  block
                  size="small"
                  class="text-none font-weight-bold"
                  prepend-icon="lucide-external-link"
                >
                  Xem giao dịch này trên Bảng Đối Soát
                </v-btn>
              </div>
            </div>

            <!-- Toggle Raw JSON Inspector -->
            <v-expansion-panels variant="accordion" class="rounded-lg border">
              <v-expansion-panel elevation="0">
                <v-expansion-panel-title class="pa-2 text-caption font-weight-medium text-medium-emphasis">
                  <v-icon start size="14">lucide-terminal</v-icon>
                  Xem phản hồi JSON chi tiết (Raw Response)
                </v-expansion-panel-title>
                <v-expansion-panel-text class="pa-2">
                  <pre class="raw-json-box font-monospace text-xs pa-2 rounded bg-grey-darken-4 text-white overflow-auto">{{ JSON.stringify(lastResponse, null, 2) }}</pre>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>
        </v-card>

        <!-- Test History List -->
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
                  <span class="font-monospace text-medium-emphasis text-xs">{{ item.time }}</span>
                </div>
                <div class="d-flex align-center gap-1">
                  <span class="font-weight-bold font-monospace text-success text-xs">{{ item.amount }}</span>
                  <v-chip size="x-small" :color="getStatusColor(item.status)" variant="flat">
                    {{ item.status }} ({{ item.score }}đ)
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
  autoApprove?: boolean;
  minTrustScore?: number;
}

const serverOnline = ref(true);
const accounts = ref<BankAccountItem[]>([]);
const selectedAccountId = ref<string>('');
const senderName = ref('MBBANK');
const deviceId = ref('phone_simulator');
const messageId = ref(`msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`);
const customToken = ref('');
const smsContent = ref('');
const analyzing = ref(false);
const sending = ref(false);
const lastResponse = ref<any>(null);
const lastTestType = ref<'dry-run' | 'live'>('dry-run');

interface HistoryItem {
  time: string;
  type: 'dry-run' | 'live';
  sender: string;
  content: string;
  status: string;
  score: number;
  amount: string;
}

const testHistory = ref<HistoryItem[]>([]);

const quickSenders = [
  'MBBANK',
  'Vietcombank',
  'Techcombank',
  'ACB',
  'VPBank',
  'BIDV',
  'TPBank',
  '0987654321',
];

const templates = [
  {
    label: 'Khớp đủ (Mã ORD)',
    bank: 'MBBANK',
    text: 'TK {ACC}|GD: +500,000VND 20/09/26 14:30|SD: 15,200,000VND|ND: NGUYEN VAN A CHUYEN TIEN ORD-20260920-001',
  },
  {
    label: 'NAPAS VCB vào MB (Mã SO)',
    bank: 'MBBANK',
    text: 'MB: 20/09/26 15:45|TK {ACC}|GD: +1,250,000VND|SD: 20,450,000VND|ND: MBVCB.987654.TRAN THI B CHUYEN TIEN SO02345',
  },
  {
    label: 'Khách quen (Có tên)',
    bank: 'MBBANK',
    text: 'TK {ACC}|GD: +350,000VND 20/09/26 16:00|SD: 2,500,000VND|ND: NGUYEN VAN A CK TIEN HANG',
  },
  {
    label: 'Không mã đơn (Có SĐT)',
    bank: 'MBBANK',
    text: 'TK {ACC} GD: +200,000VND 20/09/26 16:15 SD: 2,700,000VND ND: LE THI C 0987654321 THANH TOAN DON HANG',
  },
  {
    label: 'Chuyển thiếu tiền',
    bank: 'MBBANK',
    text: 'TK {ACC}|GD: +100,000VND 20/09/26 16:30|SD: 15,300,000VND|ND: NGUYEN VAN A CHUYEN TIEN ORD-20260920-001',
  },
  {
    label: 'Chi tiền ra (-OUT)',
    bank: 'MBBANK',
    text: 'TK {ACC}|GD: -250,000VND 20/09/26 17:00|SD: 14,950,000VND|ND: CHI TIEN MUA VAN PHONG PHAM',
  },
  {
    label: 'Vietcombank SMS',
    bank: 'Vietcombank',
    text: 'SD TK {ACC} +2,500,000VND vao 16:45 20/09/2026. So du: 18,200,000VND. ND: CT tu 0987654321 NGUYEN VAN A ORD-20260920-002',
  },
  {
    label: 'Techcombank SMS',
    bank: 'Techcombank',
    text: 'TCB: TK {ACC}, GD: +800,000VND luc 20/09/26 15:00. So du 5,400,000VND. ND: NGUYEN THI D THANH TOAN ORD-20260920-003',
  },
  {
    label: 'Xóa trắng (Tùy chỉnh)',
    bank: 'MBBANK',
    text: '',
  },
];

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

function setSender(s: string) {
  senderName.value = s;
}

function generateNewMessageId() {
  messageId.value = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function onAccountChanged() {
  const acc = selectedAccountData.value;
  if (acc) {
    customToken.value = acc.webhookSecret;
    // Thay thế số tài khoản trong SMS mẫu nếu người dùng đang dùng mẫu
    if (smsContent.value) {
      smsContent.value = smsContent.value.replace(/0380[0-9]{5,10}/g, acc.accountNumber);
    }
  }
}

function applyTemplate(tpl: { label: string; bank: string; text: string }) {
  if (tpl.bank) {
    senderName.value = tpl.bank;
  }
  const accNo = selectedAccountNumber.value;
  smsContent.value = tpl.text.replace(/\{ACC\}/g, accNo);
}

// Bóc tách dữ liệu từ phản hồi để hiển thị trực quan
const parsedAmount = computed(() => {
  if (!lastResponse.value) return 0;
  if (lastResponse.value.parsed?.amount !== undefined) return lastResponse.value.parsed.amount;
  return 0;
});

const parsedAmountFormatted = computed(() => {
  const amt = parsedAmount.value;
  const prefix = parsedType.value === 'OUT' ? '-' : '+';
  return `${prefix}${amt.toLocaleString('vi-VN')} VND`;
});

const parsedType = computed(() => {
  return lastResponse.value?.parsed?.type || 'IN';
});

const amountColorClass = computed(() => {
  return parsedType.value === 'OUT' ? 'text-error' : 'text-success';
});

const parsedBankCode = computed(() => {
  return lastResponse.value?.parsed?.bankCode || selectedAccountData.value?.bankCode || 'MB';
});

const parsedAccountNumber = computed(() => {
  return lastResponse.value?.parsed?.accountNumber || selectedAccountNumber.value;
});

const parsedAccountHolder = computed(() => {
  return lastResponse.value?.bankAccount?.accountHolder || selectedAccountData.value?.accountHolder || '';
});

const parsedSenderName = computed(() => {
  return lastResponse.value?.parsed?.senderNameRaw || '';
});

const matchedOrderCode = computed(() => {
  return (
    lastResponse.value?.suggestedOrderCode ||
    lastResponse.value?.scoring?.suggestedOrderCode ||
    (lastResponse.value?.parsed?.candidateOrderCodes && lastResponse.value?.parsed?.candidateOrderCodes[0]) ||
    ''
  );
});

const parsedCandidatePhone = computed(() => {
  return (
    (lastResponse.value?.parsed?.candidatePhones && lastResponse.value?.parsed?.candidatePhones[0]) ||
    ''
  );
});

const confidenceScore = computed(() => {
  if (!lastResponse.value) return 0;
  return lastResponse.value.confidenceScore ?? lastResponse.value.scoring?.confidenceScore ?? 0;
});

const isAutoApproved = computed(() => {
  if (!lastResponse.value) return false;
  return !!(lastResponse.value.autoApproved ?? lastResponse.value.scoring?.autoApproveEligible);
});

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

// 1. Chế độ Xem trước / Phân tích thử (Dry-run)
async function dryRunParse() {
  if (!smsContent.value.trim()) return;
  analyzing.value = true;
  lastTestType.value = 'dry-run';
  lastResponse.value = null;

  try {
    const headers: Record<string, string> = {};
    if (customToken.value.trim()) {
      headers['Authorization'] = `Bearer ${customToken.value.trim()}`;
    }

    const res = await axios.post(
      '/api/v1/payments/test-parse',
      {
        sender: senderName.value,
        content: smsContent.value,
        timestamp: Date.now(),
        simAccountNumber: selectedAccountNumber.value,
        bankAccountId: selectedAccountId.value,
      },
      { headers }
    );

    lastResponse.value = res.data;
    addHistoryItem('dry-run', res.data);
  } catch (err: any) {
    lastResponse.value = {
      success: false,
      error: err.response?.data?.error || err.message || 'Lỗi bóc tách thử nghiệm',
    };
  } finally {
    analyzing.value = false;
  }
}

// 2. Chế độ Bắn Webhook thực tế (Live Webhook sang OCMS)
async function sendTestSms() {
  if (!smsContent.value.trim()) return;
  sending.value = true;
  lastTestType.value = 'live';
  lastResponse.value = null;

  try {
    const headers: Record<string, string> = {};
    if (customToken.value.trim()) {
      headers['Authorization'] = `Bearer ${customToken.value.trim()}`;
    }

    const res = await axios.post(
      '/api/v1/payments/sms-webhook',
      {
        sender: senderName.value,
        content: smsContent.value,
        message: smsContent.value, // Hỗ trợ cả 2 trường
        timestamp: Date.now(),
        deviceId: deviceId.value,
        messageId: messageId.value,
        simAccountNumber: selectedAccountNumber.value,
      },
      { headers }
    );

    lastResponse.value = res.data;
    addHistoryItem('live', res.data);
    // Sinh messageId mới sau khi bắn thành công để lần sau không bị coi là tin trùng nếu đổi nội dung
    generateNewMessageId();
  } catch (err: any) {
    lastResponse.value = {
      success: false,
      error: err.response?.data?.error || err.message || 'Lỗi kết nối tới máy chủ OCMS',
    };
  } finally {
    sending.value = false;
  }
}

function addHistoryItem(type: 'dry-run' | 'live', res: any) {
  const amt =
    res.parsed?.amount !== undefined
      ? `${(res.parsed.amount).toLocaleString('vi-VN')} đ`
      : '';
  const score = res.confidenceScore ?? res.scoring?.confidenceScore ?? 0;
  const status = res.status || res.scoring?.status || (res.success ? 'SUCCESS' : 'ERROR');

  testHistory.value.unshift({
    time: new Date().toLocaleTimeString('vi-VN'),
    type,
    sender: senderName.value,
    content: smsContent.value,
    status,
    score,
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
}

async function checkHealth() {
  try {
    const res = await axios.get('/api/v1/payments/sms-webhook/health', {
      headers: {
        Authorization: `Bearer ${customToken.value || 'ocms_gateway_secret_key'}`,
      },
    });
    serverOnline.value = res.data?.status === 'healthy';
  } catch (e) {
    serverOnline.value = false;
  }
}

onMounted(async () => {
  await loadAccounts();
  applyTemplate(templates[0]);
  await checkHealth();
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
