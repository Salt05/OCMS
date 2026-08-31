<template>
  <div class="test-debug-panel h-100 d-flex flex-column">
    <!-- Header -->
    <div class="panel-header px-4 py-3 border-b d-flex align-center justify-space-between">
      <div class="d-flex align-center gap-2">
        <v-icon size="18" color="primary">mdi-brain</v-icon>
        <span class="text-subtitle-2 font-weight-bold">AI Brain & Debug Inspector</span>
      </div>
      <div class="d-flex align-center gap-1">
        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="small"
          density="comfortable"
          :loading="loading"
          @click="$emit('refresh')"
          title="Làm mới dữ liệu Debug"
        />
        <v-btn
          icon="mdi-restart"
          variant="text"
          size="small"
          density="comfortable"
          color="warning"
          @click="$emit('reset-state')"
          title="Làm mới trạng thái AI (Reset State Machine & Memory)"
        />
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!debugInfo" class="flex-grow-1 d-flex align-center justify-center text-center px-4">
      <div class="text-caption text-medium-emphasis">
        <v-icon size="36" class="mb-2 opacity-50">mdi-text-box-search-outline</v-icon>
        <div>Chọn hoặc tạo một phiên chat để xem não bộ và dữ liệu suy luận của AI</div>
      </div>
    </div>

    <!-- Content Tabs -->
    <div v-else class="flex-grow-1 overflow-y-auto d-flex flex-column">
      <!-- State Machine Quick Banner -->
      <div class="state-banner px-4 py-3 border-b bg-surface-light d-flex align-center justify-space-between">
        <div>
          <div class="text-caption text-medium-emphasis mb-1 font-weight-medium">TRẠNG THÁI HIỆN TẠI (STATE)</div>
          <v-chip
            size="small"
            :color="getStateColor(debugInfo.conversation.currentState)"
            class="font-weight-bold text-uppercase px-3"
          >
            {{ debugInfo.conversation.currentState || 'NEW' }}
          </v-chip>
        </div>
        <div class="text-right">
          <div class="text-caption text-medium-emphasis mb-1 font-weight-medium">AI AUTO REPLY</div>
          <v-chip
            size="x-small"
            :color="debugInfo.conversation.aiPaused ? 'error' : 'success'"
            variant="tonal"
          >
            {{ debugInfo.conversation.aiPaused ? 'ĐANG TẠM DỪNG' : 'ĐANG TRỰC' }}
          </v-chip>
        </div>
      </div>

      <!-- Tab Navigation -->
      <v-tabs v-model="activeTab" density="compact" color="primary" class="border-b px-2">
        <v-tab value="facts" class="text-caption">
          <v-icon size="14" start>mdi-format-list-checks</v-icon>
          Fact Model
        </v-tab>
        <v-tab value="tools" class="text-caption">
          <v-icon size="14" start>mdi-tools</v-icon>
          Tools ({{ totalToolCalls }})
        </v-tab>
        <v-tab value="audit" class="text-caption">
          <v-icon size="14" start>mdi-history</v-icon>
          Audit Logs
        </v-tab>
      </v-tabs>

      <!-- Tab Windows -->
      <div class="flex-grow-1 overflow-y-auto pa-3">
        <!-- ── TAB 1: FACT INTEGRITY & DRAFT ORDER ────────────────────────── -->
        <div v-if="activeTab === 'facts'" class="d-flex flex-column gap-3">
          <!-- Draft Order Card (Live) -->
          <v-card variant="outlined" class="rounded-lg border-primary" v-if="hasDraftOrder">
            <v-card-item class="py-2 px-3 bg-primary-lighten-5">
              <div class="d-flex align-center justify-space-between">
                <div class="d-flex align-center gap-1 font-weight-bold text-caption text-primary">
                  <v-icon size="14">mdi-cart-check</v-icon>
                  <span>GIỎ HÀNG NHÁP (DRAFT ORDER BÓC TÁCH)</span>
                </div>
                <v-chip size="x-small" color="primary">Live Sync</v-chip>
              </div>
            </v-card-item>
            <v-divider />
            <v-card-text class="pa-2 text-caption">
              <div v-for="(item, idx) in draftItems" :key="idx" class="d-flex justify-space-between py-1 border-b">
                <span>{{ item.qty }}x {{ item.name || item.sku }}</span>
                <span class="font-weight-medium">{{ formatCurrency(item.price * item.qty) }}</span>
              </div>
              <div v-if="draftAddress" class="mt-2 text-medium-emphasis">
                <v-icon size="12" start>mdi-map-marker</v-icon>
                <span>{{ draftAddress }}</span>
              </div>
              <div v-if="draftPhone" class="text-medium-emphasis">
                <v-icon size="12" start>mdi-phone</v-icon>
                <span>{{ draftPhone }}</span>
              </div>
            </v-card-text>
          </v-card>

          <!-- Pet Information Fact Layer -->
          <v-card variant="outlined" class="rounded-lg">
            <v-card-item class="py-2 px-3 bg-surface-light">
              <div class="d-flex align-center justify-space-between">
                <span class="font-weight-bold text-caption">THÔNG TIN THÚ CƯNG (FACT LAYER)</span>
                <v-icon size="14">mdi-paw</v-icon>
              </div>
            </v-card-item>
            <v-divider />
            <v-card-text class="pa-3 text-caption d-flex flex-column gap-2">
              <div class="d-flex justify-space-between align-center">
                <span class="text-medium-emphasis">Loài:</span>
                <div class="d-flex align-center gap-1">
                  <span class="font-weight-bold">{{ petFact('type') }}</span>
                  <v-chip size="x-small" :color="getStatusColor(petStatus('type'))" variant="flat">
                    {{ petStatus('type') }}
                  </v-chip>
                </div>
              </div>
              <div class="d-flex justify-space-between align-center">
                <span class="text-medium-emphasis">Giống (Breed):</span>
                <div class="d-flex align-center gap-1">
                  <span class="font-weight-bold">{{ petFact('breed') }}</span>
                  <v-chip size="x-small" :color="getStatusColor(petStatus('breed'))" variant="flat">
                    {{ petStatus('breed') }}
                  </v-chip>
                </div>
              </div>
              <div class="d-flex justify-space-between align-center">
                <span class="text-medium-emphasis">Độ tuổi:</span>
                <div class="d-flex align-center gap-1">
                  <span class="font-weight-bold">{{ petFact('ageMonths', 'tháng') }}</span>
                  <v-chip size="x-small" :color="getStatusColor(petStatus('ageMonths'))" variant="flat">
                    {{ petStatus('ageMonths') }}
                  </v-chip>
                </div>
              </div>
              <div class="d-flex justify-space-between align-center">
                <span class="text-medium-emphasis">Dị ứng (Allergies):</span>
                <div class="d-flex align-center gap-1">
                  <span class="font-weight-bold text-error">{{ petAllergies }}</span>
                  <v-chip size="x-small" :color="getStatusColor(petStatus('allergies'))" variant="flat">
                    {{ petStatus('allergies') }}
                  </v-chip>
                </div>
              </div>
            </v-card-text>
          </v-card>

          <!-- Customer Identity Fact Layer -->
          <v-card variant="outlined" class="rounded-lg">
            <v-card-item class="py-2 px-3 bg-surface-light">
              <div class="d-flex align-center justify-space-between">
                <span class="font-weight-bold text-caption">THÔNG TIN KHÁCH HÀNG</span>
                <v-icon size="14">mdi-account-check</v-icon>
              </div>
            </v-card-item>
            <v-divider />
            <v-card-text class="pa-3 text-caption d-flex flex-column gap-2">
              <div class="d-flex justify-space-between">
                <span class="text-medium-emphasis">Họ tên:</span>
                <span class="font-weight-medium">{{ customerFact('name') }}</span>
              </div>
              <div class="d-flex justify-space-between">
                <span class="text-medium-emphasis">Số điện thoại:</span>
                <span class="font-weight-medium">{{ customerFact('phone') }}</span>
              </div>
              <div class="d-flex justify-space-between">
                <span class="text-medium-emphasis">Địa chỉ:</span>
                <span class="font-weight-medium">{{ customerFact('address') }}</span>
              </div>
            </v-card-text>
          </v-card>

          <!-- Pending Missing Slots -->
          <v-card variant="outlined" class="rounded-lg" v-if="pendingSlots.length > 0">
            <v-card-item class="py-2 px-3 bg-amber-lighten-5 text-amber-darken-4">
              <div class="d-flex align-center gap-1 font-weight-bold text-caption">
                <v-icon size="14">mdi-alert-circle-outline</v-icon>
                <span>THÔNG TIN CÒN THIẾU CẦN HỎI TIẾP</span>
              </div>
            </v-card-item>
            <v-divider />
            <v-card-text class="pa-2 d-flex flex-wrap gap-1">
              <v-chip v-for="slot in pendingSlots" :key="slot" size="x-small" color="amber-darken-3" variant="outlined">
                {{ slot }}
              </v-chip>
            </v-card-text>
          </v-card>
        </div>

        <!-- ── TAB 2: TOOL CALLS & FUNCTION TRACE ────────────────────────── -->
        <div v-else-if="activeTab === 'tools'" class="d-flex flex-column gap-2">
          <div v-if="allToolCalls.length === 0" class="text-center py-6 text-caption text-medium-emphasis">
            Chưa có Function Tool nào được AI kích hoạt trong phiên này.
          </div>

          <v-expansion-panels v-else variant="accordion" class="custom-panels">
            <v-expansion-panel
              v-for="(tool, idx) in allToolCalls"
              :key="idx"
              class="border rounded-lg mb-2"
            >
              <v-expansion-panel-title class="py-2 px-3 text-caption font-weight-bold">
                <div class="d-flex align-center gap-2">
                  <v-chip size="x-small" color="purple" variant="flat">TOOL</v-chip>
                  <span class="font-mono text-primary">{{ tool.name }}</span>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text class="pa-2 bg-surface-light">
                <div class="text-caption mb-1 font-weight-medium">Tham số truyền vào (Arguments):</div>
                <pre class="code-block pa-2 rounded text-xs">{{ JSON.stringify(tool.args, null, 2) }}</pre>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>

        <!-- ── TAB 3: AUDIT LOGS & LATENCY ───────────────────────────────── -->
        <div v-else-if="activeTab === 'audit'" class="d-flex flex-column gap-3">
          <div v-if="!debugInfo.auditLogs || debugInfo.auditLogs.length === 0" class="text-center py-6 text-caption text-medium-emphasis">
            Chưa có nhật ký suy luận (Audit Logs).
          </div>

          <v-card
            v-for="log in debugInfo.auditLogs"
            :key="log.id"
            variant="outlined"
            class="rounded-lg text-caption pa-3"
          >
            <div class="d-flex align-center justify-space-between mb-2">
              <v-chip size="x-small" color="info" variant="flat">{{ log.intentDetected || 'GENERAL' }}</v-chip>
              <div class="d-flex align-center gap-2 text-caption text-medium-emphasis">
                <span>⏱️ {{ log.latencyMs }}ms</span>
                <span>🤖 {{ log.modelUsed }}</span>
              </div>
            </div>

            <div class="mb-1">
              <strong class="text-medium-emphasis">Khách hỏi:</strong>
              <div class="text-body-2 text-carbon mt-1 pa-2 bg-surface-light rounded">{{ log.userMessage }}</div>
            </div>

            <div class="mt-2">
              <strong class="text-medium-emphasis">AI Phản hồi:</strong>
              <div class="text-body-2 text-carbon mt-1 pa-2 bg-primary-lighten-5 rounded border border-primary-subtle">
                {{ log.aiResponse }}
              </div>
            </div>

            <div v-if="log.hasCTA" class="mt-2 text-success d-flex align-center gap-1 font-weight-medium">
              <v-icon size="14" color="success">mdi-check-decagram</v-icon>
              <span>Có Call-To-Action chốt đơn</span>
            </div>
          </v-card>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { DebugInfo } from '@/composables/use-chatbot-test';

const props = defineProps<{
  debugInfo: DebugInfo | null;
  loading?: boolean;
}>();

defineEmits<{
  (e: 'refresh'): void;
  (e: 'reset-state'): void;
}>();

const activeTab = ref('facts');

function getStateColor(state?: string) {
  switch (state) {
    case 'CONFIRMATION':
      return 'success';
    case 'ORDER_DRAFT':
    case 'BUYING_INTENT':
      return 'primary';
    case 'CONSIDERATION':
    case 'INFO':
      return 'info';
    case 'AI_PAUSED':
    case 'HANDOFF':
      return 'error';
    default:
      return 'default';
  }
}

function getStatusColor(status?: string) {
  switch (status) {
    case 'CONFIRMED':
      return 'success';
    case 'INFERRED':
      return 'warning';
    default:
      return 'default';
  }
}

function petFact(field: string, suffix = ''): string {
  const p = props.debugInfo?.aiState?.petInfo?.[field];
  if (!p || p.value === null || p.value === undefined || p.value === '') return 'Chưa rõ';
  return `${p.value} ${suffix}`.trim();
}

function petStatus(field: string): string {
  return props.debugInfo?.aiState?.petInfo?.[field]?.status || 'UNKNOWN';
}

const petAllergies = computed(() => {
  const a = props.debugInfo?.aiState?.petInfo?.allergies;
  if (!a || !a.value || (Array.isArray(a.value) && a.value.length === 0)) return 'Không phát hiện';
  return Array.isArray(a.value) ? a.value.join(', ') : String(a.value);
});

function customerFact(field: string): string {
  const c = props.debugInfo?.aiState?.customerInfo?.[field];
  if (!c || !c.value) return 'Chưa có';
  return c.value;
}

const pendingSlots = computed(() => {
  return props.debugInfo?.aiState?.pendingSlots || [];
});

const hasDraftOrder = computed(() => {
  const draft = props.debugInfo?.aiState?.draftOrder;
  return draft && Array.isArray(draft.items) && draft.items.length > 0;
});

const draftItems = computed(() => {
  return props.debugInfo?.aiState?.draftOrder?.items || [];
});

const draftAddress = computed(() => {
  return props.debugInfo?.aiState?.draftOrder?.address || '';
});

const draftPhone = computed(() => {
  return props.debugInfo?.aiState?.draftOrder?.phone || '';
});

const allToolCalls = computed(() => {
  const logs = props.debugInfo?.auditLogs || [];
  const tools: Array<{ name: string; args: any }> = [];
  for (const log of logs) {
    if (Array.isArray(log.toolCalls)) {
      for (const tc of log.toolCalls) {
        tools.push(tc);
      }
    }
  }
  return tools;
});

const totalToolCalls = computed(() => allToolCalls.value.length);

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
}
</script>

<style scoped>
.test-debug-panel {
  background-color: var(--surface-card-surface, #ffffff);
}
.panel-header {
  background-color: var(--surface-nested-surface, #efeeeb);
}
.code-block {
  background-color: #1e1e1e;
  color: #d4d4d4;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  overflow-x: auto;
}
.gap-1 { gap: 4px; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
</style>
