import { ref, computed } from 'vue';
import { api } from '@/api/index';
import { io, Socket } from 'socket.io-client';
import type { Contact } from '@/composables/use-contacts';
import { useAuthStore } from '@/stores/auth';
import { isCallMessage, getCallInfo } from '@/utils/call-helpers';

interface ZaloAccount {
  id: string;
  displayName: string | null;
  avatarUrl?: string | null;
}

interface ConversationMessage {
  content: string | null;
  contentType: string;
  senderType: string;
  sentAt: string;
  isDeleted: boolean;
}

export interface Conversation {
  id: string;
  threadType: 'user' | 'group';
  contact: Contact | null;
  zaloAccount: ZaloAccount | null;
  lastMessageAt: string | null;
  unreadCount: number;
  isReplied: boolean;
  isPinned?: boolean;
  pinnedAt?: string | null;
  aiActive?: boolean;
  aiPaused?: boolean;
  pausedUntil?: string | null;
  handoffReason?: string | null;
  currentState?: string;
  contextStartMsgId?: string | null;
  contextEndMsgId?: string | null;
  contextStartedAt?: string | null;
  contextEndedAt?: string | null;
  messages?: ConversationMessage[];
}

export interface MessageReactionItem {
  icon: string;
  emoji: string;
  rType: number;
  uid: string;
  userName: string;
  avatarUrl?: string;
  isSelf: boolean;
  count?: number;
  updatedAt: string;
}
export interface Message {
  id: string;
  content: string | null;
  contentType: string;
  senderType: string;
  senderName: string | null;
  senderUid?: string | null;
  sentAt: string;
  isDeleted: boolean;
  isAi?: boolean;
  zaloMsgId: string | null;
  isNote?: boolean;
  replyToId?: string | null;
  replyTo?: {
    id: string;
    senderName: string | null;
    content: string | null;
    contentType: string;
    isNote?: boolean;
  } | null;
  reactions?: MessageReactionItem[];
  status?: 'sending' | 'sent' | 'failed';
  tempId?: string;
  errorMessage?: string;
  pendingFile?: File;
}
/** Helper to sort messages chronologically (oldest first, newest at bottom) */
function sortMessagesChronologically(msgs: Message[]): Message[] {
  return msgs.slice().sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
}

function sortConversations(list: Conversation[]): Conversation[] {
  return list.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return timeB - timeA;
  });
}

export function useChat() {
  const conversations = ref<Conversation[]>([]);
  const selectedConvId = ref<string | null>(null);
  const messages = ref<Message[]>([]);
  const loadingConvs = ref(false);
  const loadingMsgs = ref(false);
  const loadingMoreMsgs = ref(false);
  const sendingMsg = ref(false);
  const hasMoreMessages = ref(true);
  const searchQuery = ref('');
  const accountFilter = ref<string | null>(null);
  let socket: Socket | null = null;

  // In-memory cache of messages per conversation to make switching instantaneous
  const messagesCache = new Map<string, Message[]>();
  let activeConvRequestId = 0;

  const selectedConv = computed(() =>
    conversations.value.find(c => c.id === selectedConvId.value) || null,
  );

  async function fetchConversations() {
    loadingConvs.value = true;
    try {
      const res = await api.get('/conversations', {
        params: { limit: 100, search: searchQuery.value, accountId: accountFilter.value || undefined },
      });
      conversations.value = sortConversations(res.data.conversations || []);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      loadingConvs.value = false;
    }
  }

  async function selectConversation(convId: string | null) {
    if (selectedConvId.value && selectedConvId.value !== convId) {
      socket?.emit('conversation:leave', { conversationId: selectedConvId.value });
    }

    if (!convId) {
      selectedConvId.value = null;
      messages.value = [];
      return;
    }
    selectedConvId.value = convId;
    socket?.emit('conversation:join', { conversationId: convId });
    hasMoreMessages.value = true;

    // Turn off handoff effect immediately when staff enters this chat session
    const currentConv = conversations.value.find(c => c.id === convId);
    if (currentConv && currentConv.currentState === 'HUMAN_REQUESTED') {
      currentConv.currentState = 'AI_PAUSED';
    }

    // 1. Instant switch: Check cache first
    const cached = messagesCache.get(convId);
    if (cached && cached.length > 0) {
      messages.value = [...cached];
      loadingMsgs.value = false;
    } else {
      // Clear old messages and show spinner immediately for new conversation
      messages.value = [];
      loadingMsgs.value = true;
    }

    const requestId = ++activeConvRequestId;
    await fetchMessages(convId, requestId);

    if (requestId === activeConvRequestId) {
      // Fetch full conversation detail to populate contact CRM fields
      try {
        const convDetail = await api.get(`/conversations/${convId}`);
        const conv = conversations.value.find(c => c.id === convId);
        if (conv && convDetail.data.contact) {
          conv.contact = convDetail.data.contact;
          conversations.value = [...conversations.value];
        } else if (!conv && convDetail.data) {
          conversations.value = [convDetail.data, ...conversations.value];
        }
      } catch {
        // Non-critical — panel will show partial data from list
      }
      // Mark as read
      try {
        await api.post(`/conversations/${convId}/mark-read`);
        const conv = conversations.value.find(c => c.id === convId);
        if (conv) conv.unreadCount = 0;
      } catch {
        // Ignore mark-read errors
      }
    }
  }

  async function fetchMessages(convId: string, requestId?: number) {
    const hasCache = (messagesCache.get(convId)?.length || 0) > 0;
    if (!hasCache) {
      loadingMsgs.value = true;
    }
    try {
      const res = await api.get(`/conversations/${convId}/messages`, {
        params: { limit: 50 },
      });

      // Ignore stale requests if user rapidly switched conversations
      if (requestId !== undefined && requestId !== activeConvRequestId) {
        return;
      }

      const fetched = sortMessagesChronologically(res.data.messages || []);
      // Preserve any optimistic messages currently sending or failed in this conversation
      const optimistic = (messages.value || []).filter(
        m => (m.status === 'sending' || m.status === 'failed') && m.senderType === 'self'
      );

      let merged = fetched;
      if (optimistic.length > 0) {
        const nonDuplicated = optimistic.filter(opt => {
          return !fetched.some(f => {
            if (f.id === opt.id) return true;
            if (f.senderType === 'self' && Math.abs(new Date(f.sentAt).getTime() - new Date(opt.sentAt).getTime()) < 60000) {
              if (f.content === opt.content) return true;
              if ((f.contentType === 'image' || f.contentType === 'file') && (opt.contentType === 'image' || opt.contentType === 'file')) return true;
            }
            return false;
          });
        });
        merged = sortMessagesChronologically([...fetched, ...nonDuplicated]);
      }

      messages.value = merged;
      messagesCache.set(convId, merged);

      if ((res.data.messages || []).length < 50) {
        hasMoreMessages.value = false;
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      if (requestId === undefined || requestId === activeConvRequestId) {
        loadingMsgs.value = false;
      }
    }
  }

  /**
   * Load older messages from DB for infinite scroll up
   */
  async function loadMoreMessages(): Promise<number> {
    if (!selectedConvId.value || loadingMoreMsgs.value || !hasMoreMessages.value) return 0;
    if (messages.value.length === 0) return 0;

    const oldestMessage = messages.value[0];
    loadingMoreMsgs.value = true;

    try {
      const res = await api.get(`/conversations/${selectedConvId.value}/messages`, {
        params: {
          limit: 30,
          before: oldestMessage.sentAt,
        },
      });

      const olderMessages: Message[] = res.data.messages || [];
      if (olderMessages.length === 0) {
        hasMoreMessages.value = false;
        return 0;
      }

      // Merge and deduplicate by id
      const existingIds = new Set(messages.value.map(m => m.id));
      const newUnique = olderMessages.filter(m => !existingIds.has(m.id));

      if (newUnique.length > 0) {
        messages.value = sortMessagesChronologically([...newUnique, ...messages.value]);
        if (selectedConvId.value) {
          messagesCache.set(selectedConvId.value, messages.value);
        }
      }

      if (olderMessages.length < 30) {
        hasMoreMessages.value = false;
      }

      return newUnique.length;
    } catch (err) {
      console.error('Failed to load more messages:', err);
      return 0;
    } finally {
      loadingMoreMsgs.value = false;
    }
  }

  async function sendMessage(content: string, contentType: string = 'text', isNote?: boolean, replyToId?: string, existingTempId?: string) {
    if (!selectedConvId.value || !content.trim()) return;

    const convId = selectedConvId.value;
    const authStore = useAuthStore();
    const currentUserName = authStore.user?.fullName || authStore.user?.email || 'Tôi';
    const tempId = existingTempId || `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let replyToObj = null;
    if (replyToId) {
      const parent = messages.value.find(m => m.id === replyToId);
      if (parent) {
        replyToObj = {
          id: parent.id,
          senderName: parent.senderName,
          content: parent.content,
          contentType: parent.contentType,
          isNote: parent.isNote,
        };
      }
    }

    // Build optimistic message
    const optimisticMsg: Message = {
      id: tempId,
      tempId,
      content: content.trim(),
      contentType,
      senderType: 'self',
      senderName: currentUserName,
      senderUid: authStore.user?.id || null,
      sentAt: new Date().toISOString(),
      isDeleted: false,
      isNote: !!isNote,
      replyToId: replyToId || null,
      replyTo: replyToObj,
      zaloMsgId: null,
      status: 'sending',
    };

    const existingIdx = messages.value.findIndex(m => m.id === tempId || m.tempId === tempId);
    if (existingIdx !== -1) {
      messages.value[existingIdx] = optimisticMsg;
      messages.value = [...messages.value];
    } else {
      messages.value = sortMessagesChronologically([...messages.value, optimisticMsg]);
    }
    messagesCache.set(convId, messages.value);
    sendingMsg.value = true;

    try {
      const res = await api.post(
        `/conversations/${convId}/messages`,
        {
          content: content.trim(),
          contentType,
          isNote,
          replyToId,
        },
        { timeout: 30000 }
      );

      // If note or server returns created message:
      if (res.data?.message) {
        const serverMsg = res.data.message;
        const idx = messages.value.findIndex(m => m.id === tempId || m.tempId === tempId);
        if (idx !== -1) {
          messages.value[idx] = { ...serverMsg, status: 'sent' };
          messages.value = [...messages.value];
          messagesCache.set(convId, messages.value);
        }
      } else {
        // Customer message: will be confirmed via socket, mark sent
        const idx = messages.value.findIndex(m => m.id === tempId || m.tempId === tempId);
        if (idx !== -1) {
          messages.value[idx].status = 'sent';
          messages.value = [...messages.value];
          messagesCache.set(convId, messages.value);
        }
      }
    } catch (err: any) {
      console.error('Failed to send message:', err);
      const idx = messages.value.findIndex(m => m.id === tempId || m.tempId === tempId);
      if (idx !== -1) {
        const errMsg = err.response?.data?.error || err.message || 'Lỗi gửi tin nhắn';
        messages.value[idx].status = 'failed';
        messages.value[idx].errorMessage = errMsg;
        messages.value = [...messages.value];
        messagesCache.set(convId, messages.value);
      }
    } finally {
      sendingMsg.value = false;
    }
  }

  function retrySendMessage(tempId: string) {
    const msg = messages.value.find(m => m.id === tempId || m.tempId === tempId);
    if (!msg || !msg.content) return;
    sendMessage(msg.content, msg.contentType, msg.isNote, msg.replyToId || undefined, tempId);
  }

  function removeOptimisticMessage(tempId: string) {
    if (!selectedConvId.value) return;
    messages.value = messages.value.filter(m => m.id !== tempId && m.tempId !== tempId);
    messagesCache.set(selectedConvId.value, messages.value);
  }

  async function sendAttachment(file: File, existingTempId?: string) {
    if (!selectedConvId.value) return;

    const convId = selectedConvId.value;
    const authStore = useAuthStore();
    const currentUserName = authStore.user?.fullName || authStore.user?.email || 'Tôi';
    const tempId = existingTempId || `temp_att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const isImg = file.type.startsWith('image/');
    let previewUrl = '';
    try {
      if (isImg) previewUrl = URL.createObjectURL(file);
    } catch {}

    const optimisticMsg: Message = {
      id: tempId,
      tempId,
      content: isImg ? JSON.stringify({ href: previewUrl, title: file.name }) : JSON.stringify({ title: file.name, size: file.size }),
      contentType: isImg ? 'image' : 'file',
      senderType: 'self',
      senderName: currentUserName,
      senderUid: authStore.user?.id || null,
      sentAt: new Date().toISOString(),
      isDeleted: false,
      isNote: false,
      zaloMsgId: null,
      status: 'sending',
      pendingFile: file,
    };

    const existingIdx = messages.value.findIndex(m => m.id === tempId || m.tempId === tempId);
    if (existingIdx !== -1) {
      messages.value[existingIdx] = optimisticMsg;
      messages.value = [...messages.value];
    } else {
      messages.value = sortMessagesChronologically([...messages.value, optimisticMsg]);
    }
    messagesCache.set(convId, messages.value);
    sendingMsg.value = true;

    try {
      const formData = new FormData();
      formData.append('file', file);

      await api.post(
        `/conversations/${convId}/upload`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        },
      );

      const idx = messages.value.findIndex(m => m.id === tempId || m.tempId === tempId);
      if (idx !== -1) {
        messages.value[idx].status = 'sent';
        messages.value = [...messages.value];
        messagesCache.set(convId, messages.value);
      }
    } catch (err: any) {
      console.error('Failed to send attachment:', err);
      const idx = messages.value.findIndex(m => m.id === tempId || m.tempId === tempId);
      if (idx !== -1) {
        messages.value[idx].status = 'failed';
        messages.value[idx].errorMessage = err.response?.data?.error || err.message || 'Gửi tệp thất bại';
        messages.value = [...messages.value];
        messagesCache.set(convId, messages.value);
      }
      throw err;
    } finally {
      sendingMsg.value = false;
    }
  }

  function retrySendAttachment(tempId: string) {
    const msg = messages.value.find(m => m.id === tempId || m.tempId === tempId);
    if (!msg || !msg.pendingFile) return;
    sendAttachment(msg.pendingFile, tempId);
  }

  function initSocket() {
    socket = io({ transports: ['websocket', 'polling'] });
    const authStore = useAuthStore();

    // When socket connects or reconnects to backend, identify user and refresh conversations
    socket.on('connect', () => {
      socket?.emit('user:join', {
        userId: authStore.user?.id,
        orgId: authStore.user?.orgId,
        role: authStore.user?.role,
      });
      if (selectedConvId.value) {
        socket?.emit('conversation:join', { conversationId: selectedConvId.value });
      }
      fetchConversations();
    });

    socket.on('chat:message', (data: { message: Message; conversationId: string; contactId?: string; assignedUserId?: string | null }) => {
      const currentUser = authStore.user;
      const isAdmin = authStore.isAdmin;

      const isAssignedToMe = !!(currentUser?.id && data.assignedUserId && data.assignedUserId === currentUser.id);
      const isKnownInMyList = conversations.value.some(c => c.id === data.conversationId);
      const hasPermission = isAdmin || isAssignedToMe || isKnownInMyList;

      // Add to messages if viewing this conversation
      if (data.conversationId === selectedConvId.value) {
        const incoming = data.message;
        // Look for matching optimistic message
        const optIndex = messages.value.findIndex(m => {
          if (m.id === incoming.id) return true;
          // 1. Text / Note match:
          if (
            (m.status === 'sending' || m.status === 'sent') &&
            m.senderType === 'self' &&
            incoming.senderType === 'self' &&
            m.content === incoming.content &&
            Boolean(m.isNote) === Boolean(incoming.isNote)
          ) {
            return true;
          }
          // 2. Attachment / Image / File match:
          if (
            (m.status === 'sending' || m.status === 'sent') &&
            m.senderType === 'self' &&
            incoming.senderType === 'self' &&
            (m.contentType === 'image' || m.contentType === 'file') &&
            (incoming.contentType === 'image' || incoming.contentType === 'file') &&
            Math.abs(new Date(incoming.sentAt).getTime() - new Date(m.sentAt).getTime()) < 60000
          ) {
            return true;
          }
          return false;
        });

        if (optIndex !== -1) {
          messages.value[optIndex] = { ...incoming, status: 'sent' };
          messages.value = [...messages.value];
        } else {
          // Extra deduplication: Don't add if identical message was already added in the last 15s
          const isDuplicate = messages.value.some(m =>
            m.id === incoming.id ||
            (m.senderType === incoming.senderType &&
             m.content === incoming.content &&
             Boolean(m.isNote) === Boolean(incoming.isNote) &&
             Math.abs(new Date(m.sentAt).getTime() - new Date(incoming.sentAt).getTime()) < 15000)
          );
          if (!isDuplicate) {
            messages.value = sortMessagesChronologically([...messages.value, { ...incoming, status: 'sent' }]);
          }
        }

        messagesCache.set(data.conversationId, messages.value);
      } else {
        // Update cache if conversation is in cache
        const cached = messagesCache.get(data.conversationId);
        if (cached) {
          const isDuplicate = cached.some(m =>
            m.id === data.message.id ||
            (m.senderType === data.message.senderType &&
             m.content === data.message.content &&
             Boolean(m.isNote) === Boolean(data.message.isNote) &&
             Math.abs(new Date(m.sentAt).getTime() - new Date(data.message.sentAt).getTime()) < 15000)
          );
          if (!isDuplicate) {
            messagesCache.set(data.conversationId, sortMessagesChronologically([...cached, data.message]));
          }
        }
      }

      // Refresh conversation list to update last message / unread count only if user has permission
      if (hasPermission) {
        fetchConversations();
      }
      
      const isPushEnabled = localStorage.getItem('push_enabled') === 'true';
      if (isPushEnabled && data.message.senderType === 'contact' && hasPermission) {
        // Only play sound if document is hidden or viewing another conversation
        const isCurrentlyViewing = data.conversationId === selectedConvId.value;
        const shouldNotify = document.hidden || !isCurrentlyViewing;
        
        if (shouldNotify) {
          try {
            const audio = new Audio('/notification.ogg');
            audio.play().catch(e => console.error('Audio play failed:', e));
          } catch (err) {
            console.error('Audio play error:', err);
          }
          
          if (Notification.permission === 'granted' && document.hidden) {
            const sender = data.message.senderName || 'Tin nhắn mới';
            let text = 'Đã gửi một tin nhắn';
            if (data.message.contentType === 'call' || isCallMessage(data.message)) {
              text = getCallInfo(data.message).snippet;
            } else if (data.message.contentType === 'text') {
              text = data.message.content || 'Đã gửi một tin nhắn';
            } else {
              text = 'Đã gửi một tệp đính kèm';
            }
            const pushNotif = new Notification(sender, {
              body: text,
              icon: '/favicon.svg'
            });
            pushNotif.onclick = () => {
              window.focus();
              selectConversation(data.conversationId);
              pushNotif.close();
            };
          }
        }
      }
    });

    socket.on('chat:deleted', (data: { msgId: string }) => {
      const msg = messages.value.find(m => m.zaloMsgId === data.msgId);
      if (msg) {
        msg.isDeleted = true;
      }
    });

    socket.on('chat:reaction', (data: { messageId: string; zaloMsgId?: string; reactions: MessageReactionItem[] }) => {
      const msg = messages.value.find(m => m.id === data.messageId || (data.zaloMsgId && m.zaloMsgId === data.zaloMsgId));
      if (msg) {
        msg.reactions = data.reactions;
      }
    });

    // Instant unread badge refresh after reconnect (< 200ms)
    socket.on('chat:unread-marked', () => {
      fetchConversations();
    });

    // Background sync completion refresh
    socket.on('chat:inbox-synced', () => {
      fetchConversations();
    });

    // Real-time conversation state updates (e.g. green blinking border, AI paused handoff)
    socket.on('chat:state_updated', (data: {
      conversationId: string;
      currentState: string;
      aiPaused?: boolean;
      handoffReason?: string | null;
      pausedUntil?: string | null;
    }) => {
      const conv = conversations.value.find(c => c.id === data.conversationId);
      if (conv) {
        conv.currentState = data.currentState;
        if (data.aiPaused !== undefined) conv.aiPaused = data.aiPaused;
        if (data.handoffReason !== undefined) conv.handoffReason = data.handoffReason;
        if (data.pausedUntil !== undefined) conv.pausedUntil = data.pausedUntil;
      }
    });

    // Real-time AI context boundary updates
    socket.on('chat:context_boundary_updated', (data: {
      conversationId: string;
      contextStartMsgId?: string | null;
      contextEndMsgId?: string | null;
      contextStartedAt?: string | null;
      contextEndedAt?: string | null;
      currentState?: string;
    }) => {
      const conv = conversations.value.find(c => c.id === data.conversationId);
      if (conv) {
        if (data.contextStartMsgId !== undefined) conv.contextStartMsgId = data.contextStartMsgId;
        if (data.contextEndMsgId !== undefined) conv.contextEndMsgId = data.contextEndMsgId;
        if (data.contextStartedAt !== undefined) conv.contextStartedAt = data.contextStartedAt;
        if (data.contextEndedAt !== undefined) conv.contextEndedAt = data.contextEndedAt;
        if (data.currentState) conv.currentState = data.currentState;
      }
    });

    // Real-time Pinned status updates
    socket.on('chat:conversation_pinned', (data: {
      conversationId: string;
      isPinned: boolean;
      pinnedAt?: string | null;
    }) => {
      const conv = conversations.value.find(c => c.id === data.conversationId);
      if (conv) {
        conv.isPinned = data.isPinned;
        conv.pinnedAt = data.pinnedAt || null;
        conversations.value = sortConversations([...conversations.value]);
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
    }
  }

  function handleOnline() {
    fetchConversations();
  }

  async function sendReaction(messageId: string, icon: string) {
    if (!selectedConvId.value) return;
    try {
      const res = await api.post(`/conversations/${selectedConvId.value}/messages/${messageId}/reaction`, {
        icon,
      });
      if (res.data?.reactions) {
        const msg = messages.value.find(m => m.id === messageId || m.zaloMsgId === messageId);
        if (msg) {
          msg.reactions = res.data.reactions;
        }
      }
    } catch (err) {
      console.error('Failed to send reaction:', err);
    }
  }

  async function pauseAi(convId: string, reason = 'Nhân viên tạm dừng AI', durationMinutes = 60) {
    try {
      await api.post(`/chatbot/conversations/${convId}/pause`, { reason, durationMinutes });
      const conv = conversations.value.find(c => c.id === convId);
      if (conv) {
        conv.aiPaused = true;
        conv.handoffReason = reason;
        conv.currentState = 'AI_PAUSED';
      }
    } catch (err) {
      console.error('Failed to pause AI:', err);
    }
  }

  async function resumeAi(convId: string) {
    try {
      await api.post(`/chatbot/conversations/${convId}/resume`);
      const conv = conversations.value.find(c => c.id === convId);
      if (conv) {
        conv.aiPaused = false;
        conv.handoffReason = null;
        conv.currentState = 'GREETING';
      }
    } catch (err) {
      console.error('Failed to resume AI:', err);
    }
  }

  async function toggleAi(convId: string, aiActive: boolean) {
    try {
      await api.post(`/chatbot/conversations/${convId}/toggle`, { aiActive });
      const conv = conversations.value.find(c => c.id === convId);
      if (conv) {
        conv.aiActive = aiActive;
        if (!aiActive) {
          conv.aiPaused = false;
        }
      }
    } catch (err) {
      console.error('Failed to toggle AI:', err);
    }
  }

  async function setContextBoundary(
    convId: string,
    options: { startMessageId?: string | null; endMessageId?: string | null; resetDraft?: boolean }
  ) {
    try {
      const res = await api.post(`/chatbot/conversations/${convId}/context-boundary`, options);
      if (res.data?.conversation) {
        const conv = conversations.value.find(c => c.id === convId);
        if (conv) {
          conv.contextStartMsgId = res.data.conversation.contextStartMsgId;
          conv.contextEndMsgId = res.data.conversation.contextEndMsgId;
          conv.contextStartedAt = res.data.conversation.contextStartedAt;
          conv.contextEndedAt = res.data.conversation.contextEndedAt;
          if (res.data.conversation.currentState) {
            conv.currentState = res.data.conversation.currentState;
          }
        }
      }
      return res.data;
    } catch (err) {
      console.error('Failed to set context boundary:', err);
      throw err;
    }
  }

  async function togglePin(convId: string, pinned: boolean) {
    const conv = conversations.value.find(c => c.id === convId);
    if (conv) {
      conv.isPinned = pinned;
      conv.pinnedAt = pinned ? new Date().toISOString() : null;
      conversations.value = sortConversations([...conversations.value]);
    }

    try {
      const res = await api.post(`/conversations/${convId}/pin`, { pinned });
      if (conv && res.data) {
        conv.isPinned = res.data.isPinned;
        conv.pinnedAt = res.data.pinnedAt;
        conversations.value = sortConversations([...conversations.value]);
      }
      return res.data;
    } catch (err) {
      console.error('Failed to update pin status:', err);
      // Revert if error
      if (conv) {
        conv.isPinned = !pinned;
        conv.pinnedAt = null;
        conversations.value = sortConversations([...conversations.value]);
      }
      throw err;
    }
  }

  function destroySocket() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
    socket?.disconnect();
    socket = null;
  }

  return {
    conversations,
    selectedConvId,
    selectedConv,
    messages,
    loadingConvs,
    loadingMsgs,
    loadingMoreMsgs,
    sendingMsg,
    hasMoreMessages,
    searchQuery,
    accountFilter,
    fetchConversations,
    selectConversation,
    fetchMessages,
    loadMoreMessages,
    sendMessage,
    retrySendMessage,
    sendAttachment,
    retrySendAttachment,
    removeOptimisticMessage,
    sendReaction,
    pauseAi,
    resumeAi,
    toggleAi,
    setContextBoundary,
    togglePin,
    initSocket,
    destroySocket,
  };
}

