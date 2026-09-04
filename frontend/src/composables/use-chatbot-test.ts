import { ref, computed } from 'vue';
import { api } from '@/api/index';
import { io, Socket } from 'socket.io-client';

export interface TestContact {
  id: string;
  fullName: string;
  salutation?: string | null;
  zaloName?: string | null;
  zaloUid?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  zone?: string | null;
  customerId?: string | null;
  salesperson?: string | null;
  status?: string;
  avatarUrl?: string | null;
  metadata?: any;
}

export interface TestConversation {
  id: string;
  threadType: 'user' | 'group';
  externalThreadId: string;
  isTest: boolean;
  contact: TestContact | null;
  zaloAccount: { id: string; displayName: string | null; status?: string } | null;
  lastMessageAt: string | null;
  unreadCount: number;
  isReplied: boolean;
  aiActive?: boolean;
  aiPaused?: boolean;
  pausedUntil?: string | null;
  handoffReason?: string | null;
  currentState?: string;
  messages?: Array<{
    content: string | null;
    contentType: string;
    senderType: string;
    sentAt: string;
    isAi?: boolean;
  }>;
}

export interface TestMessage {
  id: string;
  conversationId: string;
  content: string | null;
  contentType: string;
  senderType: 'self' | 'contact';
  senderName: string | null;
  senderUid?: string | null;
  sentAt: string;
  isDeleted: boolean;
  isAi?: boolean;
  isNote?: boolean;
  attachments?: any;
  replyTo?: {
    id: string;
    senderName: string | null;
    content: string | null;
  } | null;
}

export interface AiAuditLog {
  id: string;
  userMessage: string;
  intentDetected: string;
  toolCalls: Array<{ name: string; args: any }>;
  aiResponse: string;
  latencyMs: number;
  modelUsed: string;
  isHandoff: boolean;
  hasCTA?: boolean;
  createdAt: string;
}

export interface DebugInfo {
  conversation: {
    id: string;
    externalThreadId: string;
    threadType: string;
    isTest: boolean;
    aiActive: boolean;
    aiPaused: boolean;
    pausedUntil: string | null;
    handoffReason: string | null;
    currentState: string;
    lastMessageAt: string;
    unreadCount: number;
  };
  contact: any;
  zaloAccount: any;
  aiState: {
    petInfo?: any;
    customerInfo?: any;
    draftOrder?: any;
    lastAiQuestion?: string;
    pendingSlots?: string[];
  } | null;
  auditLogs: AiAuditLog[];
  messageStats: any[];
}

export function useChatbotTest() {
  const conversations = ref<TestConversation[]>([]);
  const selectedConvId = ref<string | null>(null);
  const messages = ref<TestMessage[]>([]);
  const debugInfo = ref<DebugInfo | null>(null);

  const loadingConvs = ref(false);
  const loadingMsgs = ref(false);
  const sendingMsg = ref(false);
  const loadingDebug = ref(false);
  const isAiTyping = ref(false);

  const filterMode = ref<'test' | 'real' | 'all'>('test');
  const searchQuery = ref('');

  let socket: Socket | null = null;

  const selectedConv = computed(() =>
    conversations.value.find((c) => c.id === selectedConvId.value) || null,
  );

  async function fetchConversations() {
    loadingConvs.value = true;
    try {
      const res = await api.get('/chatbot-test/conversations', {
        params: {
          filter: filterMode.value,
          search: searchQuery.value || undefined,
        },
      });
      conversations.value = res.data.conversations || [];
      if (!selectedConvId.value && conversations.value.length > 0) {
        selectConversation(conversations.value[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch test conversations:', err);
    } finally {
      loadingConvs.value = false;
    }
  }

  async function selectConversation(convId: string) {
    selectedConvId.value = convId;
    await Promise.all([
      fetchMessages(convId),
      fetchDebugInfo(convId),
    ]);
  }

  async function fetchMessages(convId: string) {
    loadingMsgs.value = true;
    try {
      const res = await api.get(`/chatbot-test/conversations/${convId}/messages`, {
        params: { limit: 100 },
      });
      messages.value = res.data.messages || [];
    } catch (err) {
      console.error('Failed to fetch test messages:', err);
    } finally {
      loadingMsgs.value = false;
    }
  }

  async function fetchDebugInfo(convId: string) {
    loadingDebug.value = true;
    try {
      const res = await api.get(`/chatbot-test/conversations/${convId}/debug`);
      debugInfo.value = res.data;
    } catch (err) {
      console.error('Failed to fetch debug info:', err);
    } finally {
      loadingDebug.value = false;
    }
  }

  // Simulate Inbound Customer Message
  async function simulateCustomerMessage(content: string, senderName?: string) {
    if (!selectedConvId.value || !content.trim()) return;

    sendingMsg.value = true;
    isAiTyping.value = true;

    try {
      await api.post(`/chatbot-test/conversations/${selectedConvId.value}/simulate`, {
        content: content.trim(),
        senderName: senderName || selectedConv.value?.contact?.fullName || 'Khách Hàng',
      });
    } catch (err) {
      console.error('Failed to simulate customer message:', err);
      isAiTyping.value = false;
    } finally {
      sendingMsg.value = false;
    }
  }

  // Reply as Human Staff (takeover simulation)
  async function sendStaffReply(content: string) {
    if (!selectedConvId.value || !content.trim()) return;

    sendingMsg.value = true;
    try {
      await api.post(`/chatbot-test/conversations/${selectedConvId.value}/reply`, {
        content: content.trim(),
      });
    } catch (err) {
      console.error('Failed to send staff reply:', err);
    } finally {
      sendingMsg.value = false;
    }
  }

  // Upload and simulate message with image
  async function uploadTestImage(file: File, caption?: string, role: 'customer' | 'staff' = 'customer') {
    if (!selectedConvId.value) return;

    sendingMsg.value = true;
    if (role === 'customer') {
      isAiTyping.value = true;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (caption?.trim()) {
        formData.append('caption', caption.trim());
      }
      formData.append('role', role);

      const res = await api.post(`/chatbot-test/conversations/${selectedConvId.value}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return res.data;
    } catch (err) {
      console.error('Failed to upload test image:', err);
      if (role === 'customer') {
        isAiTyping.value = false;
      }
      throw err;
    } finally {
      sendingMsg.value = false;
    }
  }

  // Create new test session with custom persona
  async function createTestSession(payload: {
    contactName: string;
    salutation?: string;
    phone?: string;
    petType?: string;
    breed?: string;
    ageMonths?: number;
    allergies?: string[];
    personaDescription?: string;
    existingContactId?: string;
  }) {
    try {
      const res = await api.post('/chatbot-test/conversations', payload);
      const newConv = res.data.conversation;
      conversations.value.unshift(newConv);
      await selectConversation(newConv.id);
      return newConv;
    } catch (err: any) {
      console.error('Failed to create test session:', err);
      throw err;
    }
  }

  // Reset state / memory
  async function resetAiState() {
    if (!selectedConvId.value) return;
    try {
      await api.post(`/chatbot-test/conversations/${selectedConvId.value}/reset-state`);
      await fetchDebugInfo(selectedConvId.value);
      if (selectedConv.value) {
        selectedConv.value.currentState = 'NEW';
        selectedConv.value.aiPaused = false;
      }
    } catch (err) {
      console.error('Failed to reset AI state:', err);
    }
  }

  // Reset full conversation (wipes all messages and AI memory)
  async function resetFullChat() {
    if (!selectedConvId.value) return;
    try {
      await api.post(`/chatbot-test/conversations/${selectedConvId.value}/reset-full`);
      messages.value = [];
      await fetchDebugInfo(selectedConvId.value);
      if (selectedConv.value) {
        selectedConv.value.currentState = 'NEW';
        selectedConv.value.aiPaused = false;
      }
    } catch (err) {
      console.error('Failed to reset full chat:', err);
      throw err;
    }
  }

  // Delete test session
  async function deleteTestSession(convId: string) {
    try {
      await api.delete(`/chatbot-test/conversations/${convId}`);
      conversations.value = conversations.value.filter((c) => c.id !== convId);
      if (selectedConvId.value === convId) {
        selectedConvId.value = conversations.value[0]?.id || null;
        if (selectedConvId.value) {
          selectConversation(selectedConvId.value);
        } else {
          messages.value = [];
          debugInfo.value = null;
        }
      }
    } catch (err) {
      console.error('Failed to delete test session:', err);
      throw err;
    }
  }

  function initSocket() {
    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('chat:message', (data: { message: TestMessage; conversationId: string }) => {
      if (data.conversationId === selectedConvId.value) {
        // Stop typing indicator when message arrives
        if (data.message.isAi || data.message.senderType === 'self') {
          isAiTyping.value = false;
        }
        // Avoid duplicates
        if (!messages.value.some((m) => m.id === data.message.id)) {
          messages.value.push(data.message);
        }
        // Refresh debug info to reflect new AI state and audit logs
        fetchDebugInfo(data.conversationId);
      }

      // Update conversation last message in list
      const conv = conversations.value.find((c) => c.id === data.conversationId);
      if (conv) {
        conv.lastMessageAt = data.message.sentAt;
        if (!conv.messages) conv.messages = [];
        conv.messages[0] = {
          content: data.message.content,
          contentType: data.message.contentType,
          senderType: data.message.senderType,
          sentAt: data.message.sentAt,
          isAi: data.message.isAi,
        };
      }
    });

    socket.on('chat:state_updated', (data: { conversationId: string; currentState: string }) => {
      const conv = conversations.value.find((c) => c.id === data.conversationId);
      if (conv) {
        conv.currentState = data.currentState;
      }
      if (debugInfo.value && debugInfo.value.conversation.id === data.conversationId) {
        debugInfo.value.conversation.currentState = data.currentState;
      }
    });

    socket.on('chat:order_draft_updated', (data: { conversationId: string; draftOrder: any }) => {
      if (debugInfo.value && debugInfo.value.conversation.id === data.conversationId) {
        if (!debugInfo.value.aiState) {
          debugInfo.value.aiState = {};
        }
        debugInfo.value.aiState.draftOrder = data.draftOrder;
      }
    });
  }

  function destroySocket() {
    socket?.disconnect();
    socket = null;
  }

  return {
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
    uploadTestImage,
    createTestSession,
    resetAiState,
    resetFullChat,
    deleteTestSession,
    fetchDebugInfo,
    initSocket,
    destroySocket,
  };
}
