import { ref, computed } from 'vue';
import { api } from '@/api/index';
import { io, Socket } from 'socket.io-client';
import type { Contact } from '@/composables/use-contacts';

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
}
/** Helper to sort messages chronologically (oldest first, newest at bottom) */
function sortMessagesChronologically(msgs: Message[]): Message[] {
  return msgs.slice().sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
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

  const selectedConv = computed(() =>
    conversations.value.find(c => c.id === selectedConvId.value) || null,
  );

  async function fetchConversations() {
    loadingConvs.value = true;
    try {
      const res = await api.get('/conversations', {
        params: { limit: 100, search: searchQuery.value, accountId: accountFilter.value || undefined },
      });
      conversations.value = res.data.conversations;
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      loadingConvs.value = false;
    }
  }

  async function selectConversation(convId: string) {
    selectedConvId.value = convId;
    hasMoreMessages.value = true;
    await fetchMessages(convId);
    // Fetch full conversation detail to populate contact CRM fields
    try {
      const convDetail = await api.get(`/conversations/${convId}`);
      const conv = conversations.value.find(c => c.id === convId);
      if (conv && convDetail.data.contact) {
        conv.contact = convDetail.data.contact;
        conversations.value = [...conversations.value];
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

  async function fetchMessages(convId: string) {
    loadingMsgs.value = true;
    try {
      const res = await api.get(`/conversations/${convId}/messages`, {
        params: { limit: 50 },
      });
      messages.value = sortMessagesChronologically(res.data.messages || []);
      if ((res.data.messages || []).length < 50) {
        hasMoreMessages.value = false;
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      loadingMsgs.value = false;
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

  async function sendMessage(content: string, contentType: string = 'text', isNote?: boolean, replyToId?: string) {
    if (!selectedConvId.value || !content.trim()) return;

    sendingMsg.value = true;

    try {
      await api.post(
        `/conversations/${selectedConvId.value}/messages`,
        {
          content: content.trim(),
          contentType,
          isNote,
          replyToId,
        },
      );
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      sendingMsg.value = false;
    }
  }

  async function sendAttachment(file: File) {
    if (!selectedConvId.value) return;

    sendingMsg.value = true;

    try {
      const formData = new FormData();
      formData.append('file', file);

      await api.post(
        `/conversations/${selectedConvId.value}/upload`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000, // 2 minutes for large files
        },
      );
    } catch (err) {
      console.error('Failed to send attachment:', err);
      throw err;
    } finally {
      sendingMsg.value = false;
    }
  }

  function initSocket() {
    socket = io({ transports: ['websocket', 'polling'] });

    // When socket connects or reconnects to backend, immediately refresh conversations
    socket.on('connect', () => {
      fetchConversations();
    });

    socket.on('chat:message', (data: { message: Message; conversationId: string }) => {
      // Add to messages if viewing this conversation
      if (data.conversationId === selectedConvId.value) {
        // Avoid duplicates and insert in chronological order
        if (!messages.value.find(m => m.id === data.message.id)) {
          messages.value = sortMessagesChronologically([...messages.value, data.message]);
        }
      }
      // Refresh conversation list to update last message / unread count
      fetchConversations();
      
      const isPushEnabled = localStorage.getItem('push_enabled') === 'true';
      if (isPushEnabled && data.message.senderType === 'contact') {
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
            const text = data.message.contentType === 'text' ? (data.message.content || 'Đã gửi một tin nhắn') : 'Đã gửi một tệp đính kèm';
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
    sendAttachment,
    sendReaction,
    initSocket,
    destroySocket,
  };
}
