<template>
  <div class="mobile-gateway-container pa-4">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-4">
      <div class="d-flex align-center gap-2">
        <v-avatar color="primary" size="38" class="elevation-2">
          <v-icon color="white" size="20">lucide-smartphone</v-icon>
        </v-avatar>
        <div>
          <div class="text-subtitle-1 font-weight-bold text-high-emphasis">Mobile Gateway Test</div>
          <div class="text-caption text-medium-emphasis">Trình giả lập SMS biến động số dư MB Bank</div>
        </div>
      </div>
      <v-chip size="small" :color="serverOnline ? 'success' : 'error'" variant="flat" class="font-weight-bold">
        {{ serverOnline ? 'ONLINE' : 'OFFLINE' }}
      </v-chip>
    </div>

    <!-- Alert / Tips -->
    <v-alert
      density="compact"
      variant="tonal"
      color="primary"
      class="mb-4 text-caption rounded-lg"
      prepend-icon="lucide-info"
    >
      Trang này dùng để test trực tiếp từ điện thoại. Khi bấm <strong>"Bắn tin nhắn"</strong>, hệ thống OCMS sẽ nhận Webhook và tự động bóc tách, chấm điểm và gợi ý đơn ngay!
    </v-alert>

    <!-- Main Card -->
    <v-card variant="outlined" class="rounded-xl pa-4 mb-4 elevation-1 bg-surface">
      <!-- Select Account -->
      <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">1. Chọn tài khoản nhận tiền</div>
      <v-radio-group v-model="selectedAccount" inline class="mb-2" density="compact">
        <v-radio
          label="MB Bank 1 (Chính)"
          value="0380123456789"
          color="primary"
        />
        <v-radio
          label="MB Bank 2 (Phụ)"
          value="0380987654321"
          color="primary"
        />
      </v-radio-group>

      <!-- Quick Templates -->
      <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">2. Chọn mẫu tin nhắn MB Bank</div>
      <div class="d-flex flex-wrap gap-2 mb-3" style="gap: 8px;">
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

      <!-- SMS Content Input -->
      <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-1">3. Nội dung tin nhắn SMS</div>
      <v-textarea
        v-model="smsContent"
        variant="outlined"
        rows="4"
        density="compact"
        placeholder="Nhập hoặc dán tin nhắn SMS ngân hàng vào đây..."
        hide-details
        class="font-monospace text-caption mb-3"
      />

      <!-- Device Identifier -->
      <v-row dense class="mb-2">
        <v-col cols="6">
          <v-text-field
            v-model="senderName"
            label="Đầu số gửi"
            variant="outlined"
            density="compact"
            hide-details
            placeholder="MBBANK"
          />
        </v-col>
        <v-col cols="6">
          <v-text-field
            v-model="deviceId"
            label="Mã thiết bị"
            variant="outlined"
            density="compact"
            hide-details
            placeholder="phone_test_01"
          />
        </v-col>
      </v-row>

      <!-- Send Button -->
      <v-btn
        color="primary"
        size="large"
        block
        class="mt-3 font-weight-bold rounded-lg elevation-2 text-none"
        prepend-icon="lucide-send"
        :loading="sending"
        @click="sendTestSms"
      >
        Bắn tin nhắn sang OCMS
      </v-btn>
    </v-card>

    <!-- Response Result Box -->
    <v-card v-if="lastResponse" variant="outlined" class="rounded-xl pa-4 mb-4 bg-surface elevation-1">
      <div class="d-flex align-center justify-space-between mb-2">
        <div class="font-weight-bold text-subtitle-2 d-flex align-center gap-1">
          <v-icon :color="lastResponse.success ? 'success' : 'error'" size="18">
            {{ lastResponse.success ? 'lucide-check-circle-2' : 'lucide-alert-triangle' }}
          </v-icon>
          Kết quả từ Máy chủ OCMS
        </div>
        <v-chip
          size="x-small"
          :color="getStatusColor(lastResponse.status)"
          variant="flat"
          class="font-weight-bold"
        >
          {{ lastResponse.status || (lastResponse.success ? 'THÀNH CÔNG' : 'LỖI') }}
        </v-chip>
      </div>

      <div v-if="lastResponse.success" class="text-caption">
        <div class="mb-1">
          <span class="text-medium-emphasis">Điểm tin cậy:</span>
          <strong class="ml-1 text-primary">{{ lastResponse.confidenceScore || 0 }}/100 đ</strong>
        </div>
        <div v-if="lastResponse.suggestedOrderCode" class="mb-1">
          <span class="text-medium-emphasis">Đơn hàng khớp/gợi ý:</span>
          <strong class="ml-1 text-success">#{{ lastResponse.suggestedOrderCode }}</strong>
        </div>
        <div class="mb-1">
          <span class="text-medium-emphasis">Tự động duyệt:</span>
          <span class="ml-1 font-weight-medium" :class="lastResponse.autoApproved ? 'text-success' : 'text-amber-darken-3'">
            {{ lastResponse.autoApproved ? 'Đã tự động duyệt (100%)' : 'Chờ kế toán xác nhận 1-click' }}
          </span>
        </div>
        <div class="text-medium-emphasis mt-2 text-xs">Mã GD: {{ lastResponse.transactionId }}</div>
      </div>
      <div v-else class="text-caption text-error font-weight-medium">
        {{ lastResponse.error || 'Có lỗi xảy ra khi gửi tin nhắn' }}
      </div>
    </v-card>

    <!-- Recent Tests Log -->
    <v-card v-if="testHistory.length > 0" variant="outlined" class="rounded-xl pa-3 bg-surface">
      <div class="d-flex align-center justify-space-between mb-2">
        <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis">Lịch sử test gần đây</span>
        <v-btn variant="text" size="x-small" color="primary" @click="testHistory = []">Xóa lịch sử</v-btn>
      </div>
      <v-list density="compact" class="pa-0">
        <v-list-item
          v-for="(item, idx) in testHistory"
          :key="idx"
          class="px-2 py-1 rounded mb-1 border-b"
        >
          <div class="d-flex align-center justify-space-between text-caption">
            <span class="font-monospace text-medium-emphasis">{{ item.time }}</span>
            <v-chip size="x-small" :color="getStatusColor(item.status)" variant="tonal">
              {{ item.status }} ({{ item.score }}đ)
            </v-chip>
          </div>
          <div class="text-caption text-truncate text-high-emphasis mt-0.5">
            {{ item.content }}
          </div>
        </v-list-item>
      </v-list>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';

const selectedAccount = ref('0380123456789');
const senderName = ref('MBBANK');
const deviceId = ref('phone_simulator');
const smsContent = ref('');
const sending = ref(false);
const serverOnline = ref(true);
const lastResponse = ref<any>(null);
const testHistory = ref<Array<{ time: string; content: string; status: string; score: number }>>([]);

const templates = [
  {
    label: 'Khớp đủ (Mã ORD)',
    text: 'TK 0380123456789|GD: +500,000VND 20/09/26 14:30|SD: 15,200,000VND|ND: NGUYEN VAN A CHUYEN TIEN ORD-20260920-001',
  },
  {
    label: 'NAPAS VCB vào MB (Mã SO)',
    text: 'MB: 20/09/26 15:45|TK 0380123456789|GD: +1,250,000VND|SD: 20,450,000VND|ND: MBVCB.987654.TRAN THI B CHUYEN TIEN SO02345',
  },
  {
    label: 'Khách quen (Có tên)',
    text: 'TK 0380123456789|GD: +350,000VND 20/09/26 16:00|SD: 2,500,000VND|ND: NGUYEN VAN A CK TIEN HANG',
  },
  {
    label: 'Không mã đơn (Có SĐT)',
    text: 'TK 0380123456789 GD: +200,000VND 20/09/26 16:15 SD: 2,700,000VND ND: LE THI C 0987654321 THANH TOAN DON HANG',
  },
  {
    label: 'Chuyển thiếu tiền',
    text: 'TK 0380123456789|GD: +100,000VND 20/09/26 16:30|SD: 15,300,000VND|ND: NGUYEN VAN A CHUYEN TIEN ORD-20260920-001',
  },
];

function applyTemplate(tpl: { label: string; text: string }) {
  smsContent.value = tpl.text.replace('0380123456789', selectedAccount.value);
}

function getStatusColor(status?: string): string {
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

async function sendTestSms() {
  if (!smsContent.value.trim()) return;
  sending.value = true;
  lastResponse.value = null;

  try {
    const res = await axios.post('/api/v1/payments/sms-webhook', {
      sender: senderName.value,
      content: smsContent.value,
      timestamp: Date.now(),
      deviceId: deviceId.value,
      simAccountNumber: selectedAccount.value,
    });

    lastResponse.value = res.data;
    testHistory.value.unshift({
      time: new Date().toLocaleTimeString('vi-VN'),
      content: smsContent.value,
      status: res.data.status || 'SUCCESS',
      score: res.data.confidenceScore || 0,
    });
  } catch (err: any) {
    lastResponse.value = {
      success: false,
      error: err.response?.data?.error || err.message || 'Lỗi kết nối tới máy chủ',
    };
  } finally {
    sending.value = false;
  }
}

onMounted(() => {
  // Tự động nạp mẫu đầu tiên
  applyTemplate(templates[0]);
});
</script>

<style scoped>
.mobile-gateway-container {
  max-width: 540px;
  margin: 0 auto;
  min-height: 100vh;
}
</style>
