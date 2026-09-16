import { ref, computed } from 'vue';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';

export interface BulkRecipient {
  id: string; // contact ID or unique recipient ID
  contactId?: string;
  conversationId?: string | null;
  name: string;
  phone?: string | null;
  avatarUrl?: string | null;
  customerId?: string | null;
  tags?: string[];
  selected: boolean;
  disabled: boolean; // vô hiệu hóa (không gửi tin nhắn cho người đó)
  zaloUid?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  threadType?: string;
  isGroup?: boolean;
  isSpecial?: boolean;
}

export interface BulkMessageRecipientResult {
  recipientId: string;
  name: string;
  status: 'pending' | 'sending' | 'success' | 'failed';
  error?: string;
  sentAt?: string;
}

export interface BulkMessageSendStats {
  status: 'idle' | 'sending' | 'success' | 'partial' | 'error';
  sentCount: number;
  totalCount: number;
  failedCount: number;
  startedAt?: string;
  completedAt?: string;
  recipientResults?: BulkMessageRecipientResult[];
}

export interface BulkMessage {
  id: string;
  content: string;
  contentType: 'text' | 'image' | 'file';
  fileInfo?: {
    name: string;
    size?: number;
    url?: string;
    mimeType?: string;
  };
  createdAt: string;
  senderName: string;
  sendStats?: BulkMessageSendStats;
}

const STORAGE_KEY = 'ocms_bulk_chat_session';

// Module-level reactive singleton state so all components share the same session
const recipients = ref<BulkRecipient[]>([]);
const messages = ref<BulkMessage[]>([]);
const isSendingAny = ref(false);
const currentSendingMsgId = ref<string | null>(null);
const isInitialized = ref(false);

export function useBulkMessages() {
  const authStore = useAuthStore();

  const totalCount = computed(() => recipients.value.length);
  const activeCount = computed(
    () => recipients.value.filter((r) => !r.disabled).length
  );
  const selectedCount = computed(
    () => recipients.value.filter((r) => r.selected).length
  );
  const disabledCount = computed(
    () => recipients.value.filter((r) => r.disabled).length
  );
  const allSelected = computed(
    () =>
      recipients.value.length > 0 &&
      recipients.value.every((r) => r.selected)
  );

  // ── Session persistence ───────────────────────────────────────────────────

  function saveSession() {
    try {
      const data = {
        recipients: recipients.value,
        messages: messages.value,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

      // Asynchronously sync to backend
      api.post('/bulk-chat/session', { session: data }).catch(() => {
        // Ignore background sync errors
      });
    } catch (err) {
      console.warn('Failed to save bulk chat session:', err);
    }
  }

  async function loadSession() {
    if (isInitialized.value) return;
    isInitialized.value = true;

    // 1. Instant load from localStorage
    try {
      const localRaw = localStorage.getItem(STORAGE_KEY);
      if (localRaw) {
        const parsed = JSON.parse(localRaw);
        if (Array.isArray(parsed.recipients)) recipients.value = parsed.recipients;
        if (Array.isArray(parsed.messages)) messages.value = parsed.messages;
      }
    } catch (err) {
      console.warn('Failed to parse local bulk chat session:', err);
    }

    // 2. Fetch fresh session from backend if local was empty
    try {
      const res = await api.get('/bulk-chat/session');
      if (res.data?.session) {
        const s = res.data.session;
        if (recipients.value.length === 0 && Array.isArray(s.recipients)) {
          recipients.value = s.recipients;
        }
        if (messages.value.length === 0 && Array.isArray(s.messages)) {
          messages.value = s.messages;
        }
      }
    } catch {
      // Backend may not have session yet, ignore
    }
  }

  // ── Recipient management ──────────────────────────────────────────────────

  function addRecipients(newContacts: any[]) {
    const existingMap = new Map(recipients.value.map((r) => [r.id, r]));
    const added: BulkRecipient[] = [];
    let updatedAny = false;

    for (const c of newContacts) {
      const id = String(c.id || c.contactId);
      if (existingMap.has(id)) {
        const existing = existingMap.get(id)!;
        existing.selected = true;
        existing.disabled = false;
        if (!existing.conversationId && c.conversationId) existing.conversationId = c.conversationId;
        if (!existing.avatarUrl && c.avatarUrl) existing.avatarUrl = c.avatarUrl;
        if (!existing.zaloUid && c.zaloUid) existing.zaloUid = c.zaloUid;
        updatedAny = true;
        continue;
      }

      let convId: string | null = null;
      if (c.conversationId) convId = c.conversationId;
      else if (c.conversations && c.conversations[0]?.id) convId = c.conversations[0].id;

      const newRecip: BulkRecipient = {
        id,
        contactId: id,
        conversationId: convId,
        name: c.fullName || c.name || c.zaloName || 'Khách hàng',
        phone: c.phone || null,
        avatarUrl: c.avatarUrl || null,
        customerId: c.customerId || null,
        tags: Array.isArray(c.tags) ? c.tags : [],
        selected: true,
        disabled: false,
        zaloUid: c.zaloUid || null,
        createdAt: c.createdAt || null,
        updatedAt: c.updatedAt || null,
        threadType: c.threadType || (c.isGroup ? 'group' : 'direct'),
        isGroup: Boolean(c.isGroup || c.threadType === 'group'),
        isSpecial: Boolean(c.isSpecial),
      };

      added.push(newRecip);
      existingMap.set(id, newRecip);
    }

    if (added.length > 0 || updatedAny) {
      recipients.value = [...recipients.value, ...added];
      saveSession();
    }
    return added.length;
  }

  function syncRecipients(newContacts: any[]) {
    const currentMap = new Map(recipients.value.map((r) => [r.id, r]));
    const result: BulkRecipient[] = [];

    for (const c of newContacts) {
      const id = String(c.id || c.contactId);
      if (currentMap.has(id)) {
        const existing = currentMap.get(id)!;
        existing.selected = true;
        existing.disabled = false;
        if (!existing.conversationId && c.conversationId) existing.conversationId = c.conversationId;
        if (!existing.avatarUrl && c.avatarUrl) existing.avatarUrl = c.avatarUrl;
        if (!existing.zaloUid && c.zaloUid) existing.zaloUid = c.zaloUid;
        result.push(existing);
      } else {
        let convId: string | null = null;
        if (c.conversationId) convId = c.conversationId;
        else if (c.conversations && c.conversations[0]?.id) convId = c.conversations[0].id;

        result.push({
          id,
          contactId: id,
          conversationId: convId,
          name: c.fullName || c.name || c.zaloName || 'Khách hàng',
          phone: c.phone || null,
          avatarUrl: c.avatarUrl || null,
          customerId: c.customerId || null,
          tags: Array.isArray(c.tags) ? c.tags : [],
          selected: true,
          disabled: false,
          zaloUid: c.zaloUid || null,
          createdAt: c.createdAt || null,
          updatedAt: c.updatedAt || null,
          threadType: c.threadType || (c.isGroup ? 'group' : 'direct'),
          isGroup: Boolean(c.isGroup || c.threadType === 'group'),
          isSpecial: Boolean(c.isSpecial),
        });
      }
    }
    recipients.value = result;
    saveSession();
  }

  function removeRecipient(id: string) {
    recipients.value = recipients.value.filter((r) => r.id !== id);
    saveSession();
  }

  function toggleRecipient(id: string, val?: boolean) {
    const r = recipients.value.find((item) => item.id === id);
    if (r) {
      r.selected = val !== undefined ? val : !r.selected;
      saveSession();
    }
  }

  function toggleSelectAll(val: boolean) {
    for (const r of recipients.value) {
      r.selected = val;
    }
    saveSession();
  }

  function toggleSelectRecipient(id: string) {
    toggleRecipient(id);
  }

  function selectAll() {
    toggleSelectAll(true);
  }

  function deselectAll() {
    toggleSelectAll(false);
  }

  function toggleDisableRecipient(id: string) {
    const r = recipients.value.find((item) => item.id === id);
    if (r) {
      r.disabled = !r.disabled;
      saveSession();
    }
  }

  function clearAllRecipients() {
    recipients.value = [];
    saveSession();
  }

  // ── Message management ────────────────────────────────────────────────────

  function createDraftMessage(
    content: string,
    contentType: 'text' | 'image' | 'file' = 'text',
    fileInfo?: { name: string; size?: number; url?: string; mimeType?: string }
  ): BulkMessage {
    const currentUserName =
      authStore.user?.fullName || authStore.user?.email || 'Nhân viên';

    const newMsg: BulkMessage = {
      id: `bulk_msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      content: content.trim(),
      contentType,
      fileInfo,
      createdAt: new Date().toISOString(),
      senderName: currentUserName,
      sendStats: {
        status: 'idle',
        sentCount: 0,
        totalCount: activeCount.value,
        failedCount: 0,
        recipientResults: [],
      },
    };

    messages.value = [...messages.value, newMsg];
    saveSession();
    return newMsg;
  }

  function deleteMessage(id: string) {
    messages.value = messages.value.filter((m) => m.id !== id);
    saveSession();
  }

  function clearAllMessages() {
    messages.value = [];
    saveSession();
  }

  // ── Sequential Sending Logic (Tuần tự cho từng khách hàng) ───────────────

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function sendBulkMessage(messageId: string): Promise<{ success: boolean; sent: number; total: number }> {
    const msg = messages.value.find((m) => m.id === messageId);
    if (!msg) throw new Error('Không tìm thấy tin nhắn');

    const targets = recipients.value.filter((r) => !r.disabled);
    if (targets.length === 0) {
      throw new Error('Vui lòng chọn ít nhất 1 người nhận đang hoạt động để gửi tin nhắn!');
    }

    if (isSendingAny.value) {
      throw new Error('Hệ thống đang trong quá trình gửi một tin nhắn khác. Vui lòng đợi!');
    }

    isSendingAny.value = true;
    currentSendingMsgId.value = messageId;

    // Initialize sendStats
    const recipientResults: BulkMessageRecipientResult[] = targets.map((t) => ({
      recipientId: t.id,
      name: t.name,
      status: 'pending',
    }));

    msg.sendStats = {
      status: 'sending',
      sentCount: 0,
      totalCount: targets.length,
      failedCount: 0,
      startedAt: new Date().toISOString(),
      recipientResults,
    };
    saveSession();

    let sent = 0;
    let failed = 0;

    try {
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const resItem = recipientResults[i];
        resItem.status = 'sending';

        try {
          // 1. Ensure conversation exists
          let convId = target.conversationId;
          if (!convId) {
            try {
              const openRes = await api.post('/contacts/bulk-open-chat', {
                contactIds: [target.contactId || target.id],
              });
              if (openRes.data?.conversationIds?.[0]) {
                convId = openRes.data.conversationIds[0];
                target.conversationId = convId;
              }
            } catch (openErr: any) {
              console.warn(`Could not open conversation for contact ${target.name}:`, openErr);
            }
          }

          if (!convId) {
            throw new Error('Không tìm thấy hoặc không thể mở cuộc trò chuyện với khách hàng này');
          }

          // 2. Dispatch message based on contentType
          if (msg.contentType === 'text') {
            await api.post(
              `/conversations/${convId}/messages`,
              {
                content: msg.content,
                contentType: 'text',
                isNote: false,
              },
              { timeout: 30000 }
            );
          } else if (msg.contentType === 'image') {
            const imageUrl = msg.fileInfo?.url || msg.content;
            await api.post(
              `/conversations/${convId}/messages`,
              {
                content: imageUrl,
                contentType: 'image',
                isNote: false,
              },
              { timeout: 45000 }
            );
          } else {
            // file
            const fileUrl = msg.fileInfo?.url || msg.content;
            await api.post(
              `/conversations/${convId}/messages`,
              {
                content: fileUrl,
                contentType: 'file',
                isNote: false,
              },
              { timeout: 45000 }
            );
          }

          resItem.status = 'success';
          resItem.sentAt = new Date().toISOString();
          sent++;
        } catch (err: any) {
          console.error(`Failed to send bulk message to ${target.name}:`, err);
          resItem.status = 'failed';
          resItem.error = err.response?.data?.error || err.message || 'Lỗi gửi tin nhắn';
          failed++;
        }

        // Update progress in real-time
        if (msg.sendStats) {
          msg.sendStats.sentCount = sent;
          msg.sendStats.failedCount = failed;
        }
        saveSession();

        // Safe delay of 1.3s between sequential sends to prevent Zalo rate limiting/anti-spam
        if (i < targets.length - 1) {
          await sleep(1300);
        }
      }
    } finally {
      isSendingAny.value = false;
      currentSendingMsgId.value = null;

      if (msg.sendStats) {
        msg.sendStats.completedAt = new Date().toISOString();
        if (failed === 0) {
          msg.sendStats.status = 'success';
        } else if (sent > 0) {
          msg.sendStats.status = 'partial';
        } else {
          msg.sendStats.status = 'error';
        }
      }
      saveSession();
    }

    return {
      success: failed === 0,
      sent,
      total: targets.length,
    };
  }

  async function sendBulkMessagesBatch(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    for (let i = 0; i < messageIds.length; i++) {
      const id = messageIds[i];
      try {
        await sendBulkMessage(id);
      } catch (err) {
        console.error(`Error sending batch message ${id}:`, err);
      }
      if (i < messageIds.length - 1) {
        await sleep(1200);
      }
    }
  }

  return {
    recipients,
    messages,
    isSendingAny,
    currentSendingMsgId,
    totalCount,
    activeCount,
    selectedCount,
    disabledCount,
    allSelected,
    loadSession,
    saveSession,
    addRecipients,
    syncRecipients,
    removeRecipient,
    toggleRecipient,
    toggleSelectRecipient,
    toggleSelectAll,
    selectAll,
    deselectAll,
    toggleDisableRecipient,
    clearAllRecipients,
    createDraftMessage,
    deleteMessage,
    clearAllMessages,
    sendBulkMessage,
    sendBulkMessagesBatch,
  };
}
