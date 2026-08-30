import { ref } from 'vue';
import { io, Socket } from 'socket.io-client';
import { api } from '@/api';

const unreadChatCount = ref(0);
const pendingOrdersCount = ref(0);
let socket: Socket | null = null;
let pollTimer: any = null;

export function useAppBadges() {
  async function fetchUnreadChatCount() {
    try {
      const res = await api.get('/chat/unread-count');
      unreadChatCount.value = res.data.unreadTotal || 0;
    } catch {
      // ignore
    }
  }

  async function fetchPendingOrdersCount() {
    try {
      const res = await api.get('/orders/pending-count');
      pendingOrdersCount.value = res.data.count || 0;
    } catch {
      // ignore
    }
  }

  async function fetchAllBadges() {
    await Promise.all([
      fetchUnreadChatCount(),
      fetchPendingOrdersCount(),
    ]);
  }

  function setupSocketListeners() {
    if (socket) return;

    try {
      socket = io({ transports: ['websocket', 'polling'] });

      socket.on('connect', () => {
        fetchAllBadges();
      });

      socket.on('chat:message', (data: any) => {
        if (data?.message?.senderType === 'contact') {
          fetchUnreadChatCount();
        }
      });

      socket.on('chat:unread-marked', () => {
        fetchUnreadChatCount();
      });

      socket.on('order:updated', () => {
        fetchPendingOrdersCount();
      });

      socket.on('order:created', () => {
        fetchPendingOrdersCount();
      });

      socket.on('chat:state_updated', () => {
        fetchPendingOrdersCount();
      });
    } catch (e) {
      console.warn('[useAppBadges] Socket init error:', e);
    }

    if (!pollTimer) {
      pollTimer = setInterval(() => {
        fetchAllBadges();
      }, 30000); // 30s light background refresh
    }
  }

  return {
    unreadChatCount,
    pendingOrdersCount,
    fetchUnreadChatCount,
    fetchPendingOrdersCount,
    fetchAllBadges,
    setupSocketListeners,
  };
}
