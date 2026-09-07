<template>
  <div class="chat-container d-flex" style="height: 100%; width: 100%;">
    <!-- ─────────────────────────────────────────────────────────────
         1. CONVERSATION LIST (Desktop: Left panel | Mobile: Fullscreen when no active chat)
         ───────────────────────────────────────────────────────────── -->
    <div
      v-if="!isMobile || !selectedConvId"
      class="chat-panel-left"
      :class="{ 'is-mobile-panel': isMobile }"
      :style="isMobile ? { width: '100%' } : { width: leftWidth + 'px' }"
    >
      <ConversationList
        :conversations="conversations"
        :selected-id="selectedConvId"
        :loading="loadingConvs"
        v-model:search="searchQuery"
        @select="onSelectConversation"
        @filter-account="onFilterAccount"
        @toggle-pin="onTogglePin"
      />
      <!-- Resize handle (Desktop only) -->
      <div v-if="!isMobile" class="resize-handle" @mousedown="startResize('left', $event)" />
    </div>

    <!-- ─────────────────────────────────────────────────────────────
         2. MESSAGE THREAD (Desktop: Center panel | Mobile: Fullscreen when chat active)
         ───────────────────────────────────────────────────────────── -->
    <div
      v-if="!isMobile || selectedConvId"
      class="chat-thread-wrapper flex-grow-1 h-100 position-relative overflow-hidden"
      :style="isMobile ? { width: '100%' } : { flex: 1, minWidth: '300px' }"
    >
      <MessageThread
        :conversation="selectedConv"
        :messages="messages"
        :loading="loadingMsgs"
        :loading-more="loadingMoreMsgs"
        :has-more="hasMoreMessages"
        :sending="sendingMsg"
        :is-mobile="isMobile"
        @back="onMobileBack"
        @toggle-pin="onTogglePin"
        @send="sendMessage"
        @send-attachment="sendAttachment"
        @retry-message="retrySendMessage"
        @retry-attachment="retrySendAttachment"
        @remove-optimistic-message="removeOptimisticMessage"
        @react="sendReaction"
        @load-more="loadMoreMessages"
        @toggle-contact-panel="toggleContactPanel"
        @open-order-panel="openOrderPanel"
        @pause-ai="pauseAi"
        @resume-ai="resumeAi"
        @toggle-ai="toggleAi"
        @set-context-boundary="handleSetContextBoundary"
        :show-contact-panel="showContactPanel && !showOrderPanel"
        :show-order-panel="showOrderPanel"
        style="height: 100%;"
      />
    </div>

    <!-- ─────────────────────────────────────────────────────────────
         3. DESKTOP: Right Panels (Contact Info / Order Form / Chatbot)
         ───────────────────────────────────────────────────────────── -->
    <div
      v-if="!isMobile && (showContactPanel || showOrderPanel) && selectedConv"
      class="chat-panel-right d-flex flex-column"
      :style="{ width: showOrderPanel ? '500px' : rightWidth + 'px', maxWidth: '85vw', height: '100%', overflow: 'hidden' }"
    >
      <div v-if="!showOrderPanel" class="resize-handle resize-handle-left" @mousedown="startResize('right', $event)" />
      
      <!-- Top Header Tabs if in Contact Panel mode -->
      <div v-if="!showOrderPanel" class="px-4 py-2 d-flex align-center justify-space-between border-b bg-surface flex-shrink-0" style="border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);">
        <div class="d-flex align-center gap-2 pa-1 rounded-lg" style="background: rgba(var(--v-theme-on-surface), 0.04);">
          <v-btn
            variant="flat"
            size="small"
            :color="rightPanelTab === 'info' ? 'surface' : 'transparent'"
            :class="{ 'text-primary': rightPanelTab === 'info', 'text-medium-emphasis': rightPanelTab !== 'info' }"
            class="text-none font-weight-medium rounded-md px-3"
            :elevation="rightPanelTab === 'info' ? 1 : 0"
            @click="rightPanelTab = 'info'"
          >
            Thông tin hội thoại
          </v-btn>
          <v-btn
            variant="flat"
            size="small"
            :color="rightPanelTab === 'chatbot' ? 'surface' : 'transparent'"
            :class="{ 'text-primary': rightPanelTab === 'chatbot', 'text-medium-emphasis': rightPanelTab !== 'chatbot' }"
            class="text-none font-weight-medium rounded-md px-3"
            :elevation="rightPanelTab === 'chatbot' ? 1 : 0"
            @click="rightPanelTab = 'chatbot'"
          >
            Chatbot
          </v-btn>
        </div>
        <div class="d-flex align-center gap-1">
          <!-- Button with icon "..." for Chatbot history -->
          <v-menu v-if="rightPanelTab === 'chatbot'" location="bottom end" :close-on-content-click="false">
            <template v-slot:activator="{ props }">
              <v-btn
                icon
                variant="text"
                size="small"
                color="medium-emphasis"
                v-bind="props"
                title="Lịch sử các phiên trò chuyện Chatbot"
                class="mr-1"
              >
                <v-icon size="18">lucide-ellipsis</v-icon>
              </v-btn>
            </template>
            <v-card min-width="260" max-width="320" class="rounded-md elevation-4 pa-2 bg-surface" style="border-radius: 8px !important;">
              <div class="d-flex align-center justify-space-between px-2 py-1 mb-1">
                <span class="text-caption font-weight-bold text-medium-emphasis">Lịch sử chat</span>
                <v-btn
                  variant="tonal"
                  color="primary"
                  size="x-small"
                  class="text-none px-2"
                  style="border-radius: 6px !important;"
                  @click="chatbotSidebarRef?.createNewSession()"
                >
                  <v-icon size="12" class="mr-1">lucide-plus</v-icon> Mới
                </v-btn>
              </div>
              <v-divider class="mb-1"></v-divider>
              <div class="overflow-y-auto" style="max-height: 280px;">
                <div v-if="!chatbotSidebarRef?.sessions || chatbotSidebarRef.sessions.length === 0" class="text-caption text-medium-emphasis text-center py-4">
                  Chưa có lịch sử trò chuyện nào
                </div>
                <v-list v-else density="compact" class="pa-0">
                  <v-list-item
                    v-for="sess in chatbotSidebarRef.sessions"
                    :key="sess.id"
                    :active="sess.id === chatbotSidebarRef.activeSessionId"
                    class="mb-1 px-2 cursor-pointer session-item"
                    style="border-radius: 6px !important;"
                    @click="chatbotSidebarRef?.loadSession(sess.id)"
                  >
                    <v-list-item-title class="text-caption font-weight-medium text-truncate">
                      {{ sess.title || 'Cuộc trò chuyện' }}
                    </v-list-item-title>
                    <v-list-item-subtitle v-if="sess.created_at" class="text-caption text-disabled" style="font-size: 11px;">
                      {{ formatChatbotDate(sess.created_at) }}
                    </v-list-item-subtitle>
                    <template v-slot:append>
                      <v-btn
                        icon="lucide-trash-2"
                        variant="text"
                        size="x-small"
                        color="error"
                        density="compact"
                        class="session-delete-btn"
                        title="Xóa đoạn chat"
                        @click.stop="chatbotSidebarRef?.deleteSession(sess.id)"
                      />
                    </template>
                  </v-list-item>
                </v-list>
              </div>
            </v-card>
          </v-menu>

          <v-btn
            icon
            variant="text"
            size="small"
            color="medium-emphasis"
            :title="isExpanded ? 'Thu nhỏ panel (420px)' : 'Mở rộng gấp đôi (760px)'"
            class="mr-1"
            @click="toggleExpandRightWidth"
          >
            <v-icon size="16">{{ isExpanded ? 'lucide-minimize-2' : 'lucide-maximize-2' }}</v-icon>
          </v-btn>

          <v-btn icon variant="text" size="small" color="medium-emphasis" @click="showContactPanel = false" title="Đóng panel">
            <v-icon size="18">lucide-x</v-icon>
          </v-btn>
        </div>
      </div>

      <!-- Contact Panel -->
      <div v-if="!showOrderPanel && rightPanelTab === 'info'" class="flex-grow-1 overflow-y-auto" style="height: calc(100% - 50px);">
        <ChatContactPanel
          :conversation="selectedConv"
          :contact-id="selectedConv.contact?.id || null"
          :contact="selectedConv.contact || null"
          :messages="messages"
          @close="showContactPanel = false"
          @saved="fetchConversations()"
        />
      </div>

      <!-- Chatbot Panel -->
      <div v-if="!showOrderPanel && rightPanelTab === 'chatbot'" class="flex-grow-1 overflow-hidden bg-surface" style="height: calc(100% - 50px); border-left: 1px solid rgba(var(--v-theme-on-surface), 0.12);">
        <ChatbotSidebar
          ref="chatbotSidebarRef"
          :contact="selectedConv?.contact || null"
          :conversation="selectedConv"
          :messages="messages"
          @order-created="fetchConversations()"
        />
      </div>

      <!-- Order Form Drawer -->
      <OrderFormDrawer
        v-if="showOrderPanel"
        :contact="selectedConv.contact || null"
        :conversation-id="selectedConv.id"
        @close="showOrderPanel = false"
        @created="fetchConversations()"
      />
    </div>

    <!-- ─────────────────────────────────────────────────────────────
         4. MOBILE: Full-screen Slide Over Panel for Details (< 768px)
         ───────────────────────────────────────────────────────────── -->
    <transition name="slide-x-reverse-transition">
      <div
        v-if="isMobile && (showContactPanel || showOrderPanel) && selectedConv"
        class="mobile-chat-panel-overlay position-fixed top-0 left-0 w-100 h-100 d-flex flex-column bg-surface"
        style="z-index: 500;"
      >
        <div class="d-flex flex-column h-100 overflow-hidden">
          <!-- Drawer Header -->
          <div class="px-3 py-2 d-flex align-center justify-space-between border-b flex-shrink-0">
            <div v-if="!showOrderPanel" class="d-flex align-center gap-2">
              <v-btn
                variant="flat"
                size="small"
                :color="rightPanelTab === 'info' ? 'primary' : 'surface-variant'"
                class="text-none font-weight-medium rounded-md px-3"
                @click="rightPanelTab = 'info'"
              >
                Thông tin
              </v-btn>
              <v-btn
                variant="flat"
                size="small"
                :color="rightPanelTab === 'chatbot' ? 'primary' : 'surface-variant'"
                class="text-none font-weight-medium rounded-md px-3"
                @click="rightPanelTab = 'chatbot'"
              >
                Chatbot
              </v-btn>
            </div>
            <div v-else class="text-subtitle-2 font-weight-bold">
              Tạo đơn hàng
            </div>

            <v-btn icon size="small" variant="text" @click="closeMobilePanels">
              <v-icon size="20">lucide-x</v-icon>
            </v-btn>
          </div>

          <!-- Panel content -->
          <div class="flex-grow-1 overflow-y-auto">
            <ChatContactPanel
              v-if="!showOrderPanel && rightPanelTab === 'info'"
              :conversation="selectedConv"
              :contact-id="selectedConv.contact?.id || null"
              :contact="selectedConv.contact || null"
              :messages="messages"
              @close="closeMobilePanels"
              @saved="fetchConversations()"
            />
            <ChatbotSidebar
              v-else-if="!showOrderPanel && rightPanelTab === 'chatbot'"
              ref="chatbotSidebarRef"
              :contact="selectedConv?.contact || null"
              :conversation="selectedConv"
              :messages="messages"
              @order-created="fetchConversations()"
            />
            <OrderFormDrawer
              v-else-if="showOrderPanel"
              :contact="selectedConv.contact || null"
              :conversation-id="selectedConv.id"
              @close="closeMobilePanels"
              @created="fetchConversations()"
            />
          </div>
        </div>
      </div>
    </transition>

    <!-- ── Zalo Safety Rate Limit Warning Snackbar ── -->
    <v-snackbar
      :model-value="Boolean(rateLimitWarning)"
      color="amber-darken-3"
      location="top"
      :timeout="8000"
      elevation="6"
      rounded="lg"
      @update:model-value="(val) => { if (!val) rateLimitWarning = null; }"
    >
      <div class="d-flex align-center">
        <v-icon class="mr-2" size="20">mdi-alert</v-icon>
        <div class="text-body-2 font-weight-medium text-white">{{ rateLimitWarning }}</div>
      </div>
      <template #actions>
        <v-btn
          variant="text"
          size="small"
          class="text-white font-weight-bold"
          @click="rateLimitWarning = null"
        >
          Đã hiểu
        </v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import ConversationList from '@/components/chat/ConversationList.vue';
import MessageThread from '@/components/chat/MessageThread.vue';
import ChatContactPanel from '@/components/chat/ChatContactPanel.vue';
import OrderFormDrawer from '@/components/chat/OrderFormDrawer.vue';
import ChatbotSidebar from '@/components/chat/ChatbotSidebar.vue';
import { useChat } from '@/composables/use-chat';

const display = useDisplay();
const isMobile = computed(() => display.smAndDown.value);
const router = useRouter();
const route = useRoute();

const {
  conversations, selectedConvId, selectedConv, messages,
  loadingConvs, loadingMsgs, loadingMoreMsgs, sendingMsg, hasMoreMessages,
  searchQuery, accountFilter,
  fetchConversations, selectConversation, sendMessage, retrySendMessage, sendAttachment, retrySendAttachment, removeOptimisticMessage,
  sendReaction,
  loadMoreMessages,
  pauseAi, resumeAi, toggleAi,
  setContextBoundary,
  togglePin,
  rateLimitWarning,
  initSocket, destroySocket,
} = useChat();

function onTogglePin(payload: { conversationId: string; pinned: boolean }) {
  togglePin(payload.conversationId, payload.pinned);
}

async function handleSetContextBoundary(payload: { startMessageId?: string | null; endMessageId?: string | null; resetDraft?: boolean }) {
  if (!selectedConvId.value) return;
  try {
    await setContextBoundary(selectedConvId.value, payload);
  } catch (err) {
    console.error('Failed to set context boundary:', err);
  }
}

function onFilterAccount(id: string | null) {
  accountFilter.value = id;
  fetchConversations();
}

function onSelectConversation(id: string) {
  showContactPanel.value = false;
  showOrderPanel.value = false;
  selectConversation(id);
  if (isMobile.value) {
    router.replace({ path: '/chat', query: { id } });
  }
}

function onMobileBack() {
  showContactPanel.value = false;
  showOrderPanel.value = false;
  selectConversation(null);
  router.replace({ path: '/chat', query: {} });
}

const showContactPanel = ref(false);
const showOrderPanel = ref(false);
const rightPanelTab = ref<'info' | 'chatbot'>('info');
const chatbotSidebarRef = ref<any>(null);

function closeMobilePanels() {
  showContactPanel.value = false;
  showOrderPanel.value = false;
}

// Resizable panel widths (restored from localStorage)
const leftWidth = ref(parseInt(localStorage.getItem('chat-left-width') || '350'));
const rightWidth = ref(parseInt(localStorage.getItem('chat-right-width') || '420'));
const isExpanded = computed(() => rightWidth.value >= 700);

function toggleExpandRightWidth() {
  if (rightWidth.value >= 700) {
    rightWidth.value = 420;
  } else {
    rightWidth.value = 760;
  }
  localStorage.setItem('chat-right-width', String(rightWidth.value));
}

let resizing: 'left' | 'right' | null = null;
let startX = 0;
let startWidth = 0;
let tempWidth = 0;

function startResize(panel: 'left' | 'right', e: MouseEvent) {
  resizing = panel;
  startX = e.clientX;
  startWidth = panel === 'left' ? leftWidth.value : rightWidth.value;
  tempWidth = startWidth;
  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', stopResize);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function onResize(e: MouseEvent) {
  if (!resizing) return;
  const diff = e.clientX - startX;
  if (resizing === 'left') {
    tempWidth = Math.max(200, Math.min(500, startWidth + diff));
  } else {
    tempWidth = Math.max(250, Math.min(900, startWidth - diff));
  }
}

function stopResize() {
  if (resizing) {
    if (resizing === 'left') {
      leftWidth.value = tempWidth;
      localStorage.setItem('chat-left-width', String(tempWidth));
    } else {
      rightWidth.value = tempWidth;
      localStorage.setItem('chat-right-width', String(tempWidth));
    }
  }
  resizing = null;
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

function formatChatbotDate(dateStr: string) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return (
      d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
      ' ' +
      d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
    );
  } catch {
    return dateStr;
  }
}

function toggleContactPanel() {
  if (showOrderPanel.value) {
    showOrderPanel.value = false;
  }
  showContactPanel.value = !showContactPanel.value;
}

function openOrderPanel() {
  showContactPanel.value = false;
  showOrderPanel.value = !showOrderPanel.value;
}

watch(() => route.query.id, (newId) => {
  if (newId && typeof newId === 'string' && newId !== selectedConvId.value) {
    showContactPanel.value = false;
    showOrderPanel.value = false;
    selectConversation(newId);
  }
}, { immediate: true });

watch(selectedConv, (newConv) => {
  if (newConv && newConv.currentState === 'CONFIRMATION') {
    showOrderPanel.value = true;
    showContactPanel.value = false;
  }
});

onMounted(() => { fetchConversations(); initSocket(); });
onUnmounted(() => { destroySocket(); });

let searchTimeout: ReturnType<typeof setTimeout>;
watch(searchQuery, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => fetchConversations(), 300);
});
</script>

<style scoped>
.chat-container {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.chat-panel-left {
  position: relative;
  flex-shrink: 0;
  min-width: 200px;
  max-width: 500px;
  height: 100%;
  overflow: hidden;
}

.chat-panel-left.is-mobile-panel {
  max-width: 100% !important;
  min-width: 100% !important;
  width: 100% !important;
}

.chat-thread-wrapper {
  height: 100%;
  overflow: hidden;
}

.chat-panel-right {
  position: relative;
  flex-shrink: 0;
  min-width: 250px;
  max-width: 900px;
  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Resize handle — thin vertical line on the edge */
.resize-handle {
  position: absolute;
  top: 0;
  right: -2px;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background 0.2s;
}

.resize-handle:hover,
.resize-handle:active {
  background: var(--color-mist);
}

.resize-handle-left {
  right: auto;
  left: -2px;
}

.session-item :deep(.session-delete-btn) {
  opacity: 0 !important;
  transition: opacity 0.15s ease-in-out, transform 0.15s ease-in-out;
  width: 20px !important;
  height: 20px !important;
  min-width: 20px !important;
  padding: 0 !important;
  transform: scale(0.85);
}

.session-item:hover :deep(.session-delete-btn) {
  opacity: 1 !important;
  transform: scale(1);
}

.mobile-chat-side-drawer {
  background-color: var(--v-theme-surface) !important;
}
</style>
