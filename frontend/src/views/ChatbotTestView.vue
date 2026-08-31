<template>
  <div class="chatbot-test-view h-100 w-100 d-flex" style="overflow: hidden; max-width: 100%;">
    <!-- ── CỘT 1: DANH SÁCH PHIÊN TEST & KỊCH BẢN (280px) ──────────────────── -->
    <div class="conv-sidebar border-e d-flex flex-column flex-shrink-0" :style="{ width: '280px', minWidth: '280px', maxWidth: '280px' }">
      <!-- Sidebar Header -->
      <div class="sidebar-header pa-3 border-b flex-shrink-0">
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="d-flex align-center gap-2">
            <v-icon color="primary" size="20">mdi-flask-outline</v-icon>
            <span class="font-weight-bold text-subtitle-2">AI Training Lab</span>
          </div>
          <v-btn
            size="small"
            color="primary"
            variant="flat"
            prepend-icon="mdi-plus"
            :loading="creatingSession"
            @click="handleQuickCreateTest"
            class="text-caption font-weight-bold"
          >
            Tạo Test
          </v-btn>
        </div>

        <!-- Filter tabs: Test Sandbox vs Zalo thật -->
        <v-btn-toggle
          v-model="filterMode"
          mandatory
          density="compact"
          color="primary"
          variant="outlined"
          class="w-100 mb-2"
          @update:model-value="fetchConversations"
        >
          <v-btn value="test" size="x-small" class="flex-grow-1 text-caption">Chỉ Test</v-btn>
          <v-btn value="real" size="x-small" class="flex-grow-1 text-caption">Zalo Thật</v-btn>
          <v-btn value="all" size="x-small" class="flex-grow-1 text-caption">Tất cả</v-btn>
        </v-btn-toggle>

        <!-- Search Input -->
        <v-text-field
          v-model="searchQuery"
          placeholder="Tìm kiếm phiên test..."
          prepend-inner-icon="mdi-magnify"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          class="text-caption"
          @update:model-value="debounceSearch"
        />
      </div>

      <!-- Conversation List -->
      <div class="flex-grow-1 overflow-y-auto">
        <div v-if="loadingConvs" class="pa-4 text-center">
          <v-progress-circular indeterminate size="24" color="primary" />
        </div>

        <div v-else-if="conversations.length === 0" class="pa-6 text-center text-caption text-medium-emphasis">
          <v-icon size="32" class="mb-2 opacity-50">mdi-chat-question-outline</v-icon>
          <div>Chưa có phiên test nào.</div>
          <div class="mt-2">Bấm <strong>Tạo Test</strong> để bắt đầu thử thách Bot!</div>
        </div>

        <v-list v-else lines="two" class="pa-0">
          <v-list-item
            v-for="conv in conversations"
            :key="conv.id"
            :active="conv.id === selectedConvId"
            active-color="primary"
            class="px-3 py-2 border-b cursor-pointer conv-item"
            @click="selectConversation(conv.id)"
          >
            <template #prepend>
              <v-avatar size="36" :color="conv.isTest ? 'primary-lighten-4' : 'grey-lighten-3'">
                <v-icon v-if="conv.isTest" color="primary" size="20">mdi-account-cowboy-hat-outline</v-icon>
                <v-img v-else-if="conv.contact?.avatarUrl" :src="conv.contact.avatarUrl" />
                <span v-else class="text-caption font-weight-bold">{{ getInitials(conv.contact?.fullName) }}</span>
              </v-avatar>
            </template>

            <v-list-item-title class="d-flex align-center justify-space-between text-caption font-weight-bold mb-1">
              <span class="truncate">{{ conv.contact?.fullName || 'Phạm Minh Phát' }}</span>
              <v-chip
                v-if="conv.isTest"
                size="x-small"
                color="primary"
                variant="flat"
                class="font-weight-bold"
                style="font-size: 9px; height: 16px"
              >
                TEST
              </v-chip>
            </v-list-item-title>

            <v-list-item-subtitle class="text-caption text-truncate d-flex align-center justify-space-between">
              <span class="truncate text-medium-emphasis">
                {{ getLastMessagePreview(conv) }}
              </span>
              <v-chip
                v-if="conv.currentState"
                size="x-small"
                :color="getStateColor(conv.currentState)"
                variant="tonal"
                style="font-size: 9px; height: 16px"
              >
                {{ conv.currentState }}
              </v-chip>
            </v-list-item-subtitle>

            <template #append v-if="conv.isTest">
              <v-btn
                icon="mdi-trash-can-outline"
                variant="text"
                size="x-small"
                color="error"
                class="delete-btn"
                @click.stop="confirmDeleteSession(conv)"
                title="Xóa phiên test này"
              />
            </template>
          </v-list-item>
        </v-list>
      </div>
    </div>

    <!-- ── CỘT 2: KHUNG CHAT TƯƠNG TÁC THỬ THÁCH (Flex 1) ────────────────── -->
    <div class="chat-main flex-grow-1 d-flex flex-column h-100" style="min-width: 0; flex: 1 1 0%; overflow: hidden;">
      <!-- Chat Header -->
      <div v-if="selectedConv" class="chat-header px-4 py-3 border-b d-flex align-center justify-space-between bg-surface flex-shrink-0">
        <div class="d-flex align-center gap-3">
          <v-avatar size="38" :color="selectedConv.isTest ? 'primary-lighten-4' : 'grey-lighten-3'">
            <v-icon v-if="selectedConv.isTest" color="primary">mdi-account-cowboy-hat</v-icon>
            <v-img v-else-if="selectedConv.contact?.avatarUrl" :src="selectedConv.contact.avatarUrl" />
            <span v-else class="text-subtitle-2 font-weight-bold">{{ getInitials(selectedConv.contact?.fullName) }}</span>
          </v-avatar>

          <div>
            <div class="d-flex align-center gap-2">
              <span class="font-weight-bold text-subtitle-2">{{ selectedConv.contact?.fullName || 'Phạm Minh Phát' }}</span>
              <v-chip size="x-small" color="info" variant="flat" class="font-weight-bold">
                Odoo ID: 17871
              </v-chip>
              <v-chip size="x-small" color="secondary" variant="outlined" class="font-weight-medium">
                Sale: Võ Tấn Dũng
              </v-chip>
              <v-chip size="x-small" :color="getStateColor(selectedConv.currentState)" variant="tonal">
                {{ selectedConv.currentState || 'NEW' }}
              </v-chip>
            </div>
            <div class="text-caption text-medium-emphasis">
              SĐT: <span class="font-weight-medium text-body-2">{{ selectedConv.contact?.phone || '0355785209' }}</span> •
              Đ/C: <span class="font-weight-medium">{{ selectedConv.contact?.address || 'Rung Sen, My Hanh Bac, HCM - Q10' }}</span>
            </div>
          </div>
        </div>

        <div class="d-flex align-center gap-2">
          <v-btn
            size="small"
            variant="tonal"
            color="error"
            prepend-icon="mdi-delete-sweep-outline"
            :loading="resettingChat"
            @click="handleResetFullChat"
            class="text-caption font-weight-bold"
            title="Xóa toàn bộ tin nhắn & reset bộ nhớ AI để test lại từ đầu"
          >
            Reset Phiên Chat
          </v-btn>
          <v-btn
            size="small"
            variant="tonal"
            color="warning"
            prepend-icon="mdi-restart"
            @click="resetAiState"
            class="text-caption font-weight-medium"
            title="Làm mới trạng thái AI state"
          >
            Làm Mới State
          </v-btn>
          <v-btn
            size="small"
            variant="text"
            :icon="showDebugPanel ? 'mdi-chevron-right' : 'mdi-chevron-left'"
            @click="showDebugPanel = !showDebugPanel"
            title="Đóng / Mở Debug Inspector"
          />
        </div>
      </div>

      <!-- No Conversation Selected -->
      <div v-if="!selectedConv" class="flex-grow-1 d-flex align-center justify-center text-center">
        <div class="pa-6">
          <v-icon size="48" color="primary" class="mb-3 opacity-60">mdi-robot-confused-outline</v-icon>
          <div class="text-h6 font-weight-bold">Chọn hoặc tạo một phiên Chatbot Sandbox</div>
          <div class="text-caption text-medium-emphasis mt-1">
            Khách hàng mặc định: <strong>Phạm Minh Phát (Odoo ID: 17871 - Sale: Võ Tấn Dũng)</strong>
          </div>
          <v-btn color="primary" class="mt-4" prepend-icon="mdi-plus" :loading="creatingSession" @click="handleQuickCreateTest">
            Tạo Phiên Test Mới (ID 17871)
          </v-btn>
        </div>
      </div>

      <!-- Message History List -->
      <div v-else class="messages-container flex-grow-1 overflow-y-auto pa-4 d-flex flex-column gap-3" ref="messagesBox">
        <div v-if="loadingMsgs" class="text-center py-4">
          <v-progress-circular indeterminate size="24" color="primary" />
        </div>

        <div v-else-if="messages.length === 0" class="text-center py-10 text-caption text-medium-emphasis">
          <v-icon size="36" class="mb-2 opacity-50">mdi-message-text-outline</v-icon>
          <div>Chưa có tin nhắn trong phiên này.</div>
          <div>Hãy thử gửi một câu hỏi bên dưới để xem Bot phản hồi!</div>
        </div>

        <div
          v-for="msg in messages"
          :key="msg.id"
          class="message-wrapper d-flex"
          :class="msg.senderType === 'contact' ? 'justify-start' : 'justify-end'"
        >
          <!-- Customer Message (Left) -->
          <div v-if="msg.senderType === 'contact'" class="d-flex align-start gap-2 max-w-75">
            <v-avatar size="28" color="amber-lighten-4" class="mt-1">
              <v-icon size="16" color="amber-darken-3">mdi-account</v-icon>
            </v-avatar>
            <div>
              <div class="text-caption text-medium-emphasis mb-1 font-weight-medium">
                {{ msg.senderName || 'Khách Hàng (Giả lập)' }}
              </div>
              <div class="customer-bubble pa-3 rounded-xl rounded-ts-0 text-body-2">
                {{ msg.content }}
              </div>
              <div class="text-caption text-disabled mt-1" style="font-size: 10px">
                {{ formatTime(msg.sentAt) }}
              </div>
            </div>
          </div>

          <!-- Assistant / Staff Message (Right) -->
          <div v-else class="d-flex align-start gap-2 max-w-75 flex-row-reverse">
            <v-avatar size="28" :color="msg.isAi ? 'primary-lighten-4' : 'green-lighten-4'" class="mt-1">
              <v-icon size="16" :color="msg.isAi ? 'primary' : 'green-darken-3'">
                {{ msg.isAi ? 'mdi-robot' : 'mdi-face-agent' }}
              </v-icon>
            </v-avatar>
            <div class="text-right">
              <div class="text-caption text-medium-emphasis mb-1 font-weight-medium d-flex align-center justify-end gap-1">
                <v-chip size="x-small" :color="msg.isAi ? 'primary' : 'green'" variant="flat" style="font-size: 9px; height: 14px">
                  {{ msg.isAi ? '🤖 CHATBOT AI' : '👨‍💼 NHÂN VIÊN' }}
                </v-chip>
              </div>
              <div class="bot-bubble pa-3 rounded-xl rounded-te-0 text-body-2 text-left">
                {{ msg.content }}
              </div>
              <div class="text-caption text-disabled mt-1" style="font-size: 10px">
                {{ formatTime(msg.sentAt) }}
              </div>
            </div>
          </div>
        </div>

        <!-- AI Typing Indicator -->
        <div v-if="isAiTyping" class="d-flex align-start gap-2">
          <v-avatar size="28" color="primary-lighten-4">
            <v-icon size="16" color="primary">mdi-robot</v-icon>
          </v-avatar>
          <div class="typing-bubble pa-3 rounded-xl rounded-ts-0 d-flex align-center gap-1">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="text-caption text-medium-emphasis ml-2">Chatbot đang suy luận & gọi tools Odoo...</span>
          </div>
        </div>
      </div>

      <!-- Quick Prompt Suggestions -->
      <div v-if="selectedConv" class="quick-prompts-bar px-4 py-2 border-t bg-surface-light d-flex align-center gap-2 flex-shrink-0" style="overflow-x: auto; max-width: 100%; white-space: nowrap;">
        <span class="text-caption text-medium-emphasis font-weight-bold text-no-wrap">⚡ Thử nhanh:</span>
        <v-chip
          v-for="(prompt, idx) in quickPrompts"
          :key="idx"
          size="small"
          variant="outlined"
          color="primary"
          class="cursor-pointer text-caption text-no-wrap"
          @click="useQuickPrompt(prompt)"
        >
          {{ prompt }}
        </v-chip>
      </div>

      <!-- Message Input Area -->
      <div v-if="selectedConv" class="chat-input-area pa-3 border-t bg-surface flex-shrink-0">
        <div class="d-flex align-center gap-2 mb-2">
          <v-btn-toggle v-model="sendRole" mandatory density="compact" size="x-small" color="primary" variant="flat">
            <v-btn value="customer" size="x-small" class="text-caption">
              <v-icon start size="14">mdi-account</v-icon>
              Gõ vai Khách Hàng
            </v-btn>
            <v-btn value="staff" size="x-small" class="text-caption">
              <v-icon start size="14">mdi-face-agent</v-icon>
              Gõ vai Nhân Viên (Takeover)
            </v-btn>
          </v-btn-toggle>
        </div>

        <div class="d-flex align-center gap-2">
          <v-textarea
            v-model="inputContent"
            :placeholder="sendRole === 'customer' ? 'Nhập câu hỏi vai Khách Hàng (Enter để gửi)...' : 'Nhập câu trả lời vai Nhân Viên CSKH...'"
            variant="outlined"
            density="compact"
            rows="1"
            max-rows="4"
            auto-grow
            hide-details
            class="text-body-2"
            @keydown.enter.exact.prevent="handleSend"
          />
          <v-btn
            color="primary"
            icon="mdi-send"
            :loading="sendingMsg"
            :disabled="!inputContent.trim()"
            @click="handleSend"
          />
        </div>
      </div>
    </div>

    <!-- ── CỘT 3: DEBUG INSPECTOR PANEL (360px) ───────────────────────────── -->
    <div v-if="showDebugPanel" class="debug-sidebar border-s d-flex flex-column flex-shrink-0" :style="{ width: '360px', minWidth: '360px', maxWidth: '360px', overflow: 'hidden' }">
      <TestDebugPanel
        :debug-info="debugInfo"
        :loading="loadingDebug"
        @refresh="refreshDebug"
        @reset-state="resetAiState"
      />
    </div>

    <!-- Confirm Delete Dialog -->
    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card class="rounded-xl">
        <v-card-item class="py-3 px-4 bg-error text-white">
          <div class="font-weight-bold text-subtitle-1">Xóa Phiên Test</div>
        </v-card-item>
        <v-card-text class="pa-4 text-body-2">
          Bạn có chắc chắn muốn xóa phiên test này và toàn bộ tin nhắn liên quan trong Database không?
        </v-card-text>
        <v-card-actions class="pa-3 justify-end">
          <v-btn variant="text" @click="showDeleteDialog = false">Hủy</v-btn>
          <v-btn color="error" variant="flat" :loading="deletingSession" @click="handleConfirmDelete">
            Xác Nhận Xóa
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useChatbotTest, type TestConversation } from '@/composables/use-chatbot-test';
import TestDebugPanel from '@/components/chatbot-test/TestDebugPanel.vue';

const {
  conversations,
  selectedConvId,
  selectedConv,
  messages,
  debugInfo,
  loadingConvs,
  loadingMsgs,
  sendingMsg,
  loadingDebug,
  isAiTyping,
  filterMode,
  searchQuery,
  fetchConversations,
  selectConversation,
  simulateCustomerMessage,
  sendStaffReply,
  createTestSession,
  resetAiState,
  resetFullChat,
  deleteTestSession,
  fetchDebugInfo,
  initSocket,
  destroySocket,
} = useChatbotTest();

const showDebugPanel = ref(true);
const sendRole = ref<'customer' | 'staff'>('customer');
const inputContent = ref('');
const messagesBox = ref<HTMLElement | null>(null);

const creatingSession = ref(false);
const resettingChat = ref(false);

const showDeleteDialog = ref(false);
const convToDelete = ref<TestConversation | null>(null);
const deletingSession = ref(false);

const quickPrompts = [
  'Đóng gói cho tôi 100 gói C28 và 250 gói C14 nhé shop',
  'Giao về Rung Sen, Mỹ Hạnh Bắc nha. SĐT 0355785209',
  'Bé Poodle 3 tháng ăn que gặm nào tốt shop?',
  'Có loại nào không chứa thịt gà không?',
  'Cho mình gặp trực tiếp nhân viên tư vấn nhé!',
];

async function handleQuickCreateTest() {
  creatingSession.value = true;
  try {
    await createTestSession({
      contactName: 'Phạm Minh Phát',
      personaDescription: 'Khách hàng Odoo ID 17871: Phạm Minh Phát (NV Sale: Võ Tấn Dũng)',
    });
  } catch (err) {
    console.error('Failed to create quick test session:', err);
  } finally {
    creatingSession.value = false;
  }
}

async function handleResetFullChat() {
  if (!selectedConvId.value) return;
  resettingChat.value = true;
  try {
    await resetFullChat();
  } catch (err) {
    console.error('Reset full chat failed:', err);
  } finally {
    resettingChat.value = false;
  }
}

async function handleSend() {
  if (!inputContent.value.trim()) return;
  const text = inputContent.value.trim();
  inputContent.value = '';

  if (sendRole.value === 'customer') {
    await simulateCustomerMessage(text);
  } else {
    await sendStaffReply(text);
  }
  scrollToBottom();
}

function useQuickPrompt(text: string) {
  inputContent.value = text;
  handleSend();
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesBox.value) {
      messagesBox.value.scrollTop = messagesBox.value.scrollHeight;
    }
  });
}

function confirmDeleteSession(conv: TestConversation) {
  convToDelete.value = conv;
  showDeleteDialog.value = true;
}

async function handleConfirmDelete() {
  if (!convToDelete.value) return;
  deletingSession.value = true;
  try {
    await deleteTestSession(convToDelete.value.id);
    showDeleteDialog.value = false;
    convToDelete.value = null;
  } catch (err) {
    console.error(err);
  } finally {
    deletingSession.value = false;
  }
}

function refreshDebug() {
  if (selectedConvId.value) {
    fetchDebugInfo(selectedConvId.value);
  }
}

let searchTimer: any = null;
function debounceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    fetchConversations();
  }, 300);
}

function getInitials(name?: string | null): string {
  if (!name) return 'KH';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function getLastMessagePreview(conv: TestConversation): string {
  const m = conv.messages?.[0];
  if (!m || !m.content) return 'Chưa có tin nhắn';
  return m.content;
}

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

function formatTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

onMounted(() => {
  initSocket();
  fetchConversations();
});

onUnmounted(() => {
  destroySocket();
});
</script>

<style scoped>
.chatbot-test-view {
  background-color: var(--surface-page-canvas, #f8f8f6);
}
.sidebar-header, .chat-header {
  background-color: var(--surface-card-surface, #ffffff);
}
.conv-sidebar {
  background-color: var(--surface-card-surface, #ffffff);
}
.conv-item {
  transition: background-color 0.15s ease;
}
.conv-item:hover .delete-btn {
  opacity: 1;
}
.delete-btn {
  opacity: 0;
  transition: opacity 0.15s ease;
}
.messages-container {
  background-color: var(--surface-page-canvas, #f8f8f6);
}
.customer-bubble {
  background-color: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: var(--color-carbon-ink, #121212);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.bot-bubble {
  background-color: #e8f0fe;
  border: 1px solid #c2e0ff;
  color: var(--color-carbon-ink, #121212);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.typing-bubble {
  background-color: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
}
.quick-prompts-bar {
  background-color: var(--surface-nested-surface, #efeeeb);
}
.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #0068ff;
  animation: bounce 1.4s infinite ease-in-out both;
}
.dot:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.max-w-75 {
  max-width: 75%;
}
.gap-1 { gap: 4px; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
