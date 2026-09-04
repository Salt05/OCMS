import { ref } from 'vue';
import { io, Socket } from 'socket.io-client';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';

export interface NewOrderNotification {
  show: boolean;
  title: string;
  message: string;
  orderId?: string;
  partnerName?: string;
  amount?: number;
}

const unreadChatCount = ref(0);
const pendingOrdersCount = ref(0);
const orderBadgePulsing = ref(false);

export function triggerBadgePulse() {
  orderBadgePulsing.value = false;
  setTimeout(() => {
    orderBadgePulsing.value = true;
    setTimeout(() => {
      orderBadgePulsing.value = false;
    }, 750);
  }, 30);
}

export const newOrderNotification = ref<NewOrderNotification>({
  show: false,
  title: 'Có Đơn Hàng AI Mới Cần Xác Nhận!',
  message: '',
});

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
      const prev = pendingOrdersCount.value;
      pendingOrdersCount.value = res.data.count || 0;
      if (pendingOrdersCount.value > prev && pendingOrdersCount.value > 0) {
        triggerBadgePulse();
      }
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

  let lastPopupOrderId = '';
  let lastPopupTime = 0;

  function triggerNewOrderPopup(data?: any) {
    const orderId = data?.conversationId || data?.orderId || data?.id;
    const now = Date.now();
    if (orderId && orderId === lastPopupOrderId && now - lastPopupTime < 5000) {
      return;
    }
    if (orderId) {
      lastPopupOrderId = orderId;
      lastPopupTime = now;
    }

    const customer = data?.draftOrder?.customer?.name || data?.draftOrder?.recipientName || data?.partnerName;
    const total = data?.draftOrder?.subtotal || data?.amountTotal;
    const totalStr = total ? ` (${Number(total).toLocaleString('vi-VN')} đ)` : '';

    triggerBadgePulse();

    newOrderNotification.value = {
      show: true,
      title: '🎉 Có Đơn Hàng AI Mới Cần Duyệt!',
      message: customer
        ? `Khách hàng ${customer} vừa chốt đơn${totalStr}. Bấm để xem và duyệt sang Odoo!`
        : `Chatbot AI vừa ghi nhận một đơn hàng mới${totalStr}. Vui lòng kiểm tra và duyệt!`,
      orderId: data?.conversationId || data?.orderId || data?.id,
      partnerName: customer,
      amount: total,
    };
  }

  function setupSocketListeners() {
    if (socket) return;

    try {
      socket = io({ transports: ['websocket', 'polling'] });

      socket.on('connect', () => {
        const authStore = useAuthStore();
        socket?.emit('user:join', {
          userId: authStore.user?.id,
          orgId: authStore.user?.orgId,
          role: authStore.user?.role,
        });
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

      socket.on('order:updated', (data: any) => {
        const authStore = useAuthStore();
        const user = authStore.user;
        const isAdmin = user?.role === 'admin' || user?.role === 'owner';
        if (isAdmin || !data?.assignedUserId || data.assignedUserId === user?.id) {
          fetchPendingOrdersCount();
        }
      });

      socket.on('order:created', (data: any) => {
        const authStore = useAuthStore();
        const user = authStore.user;
        const isAdmin = user?.role === 'admin' || user?.role === 'owner';
        const isAssignedToMe = Boolean(user?.id && data?.assignedUserId && data.assignedUserId === user.id);

        if (isAdmin || isAssignedToMe) {
          fetchPendingOrdersCount();
          triggerNewOrderPopup(data);
        }
      });

      socket.on('chat:state_updated', (data: any) => {
        const authStore = useAuthStore();
        const user = authStore.user;
        const isAdmin = user?.role === 'admin' || user?.role === 'owner';
        const isAssignedToMe = Boolean(user?.id && data?.assignedUserId && data.assignedUserId === user.id);

        if (isAdmin || isAssignedToMe) {
          fetchPendingOrdersCount();
          if (data?.currentState === 'CONFIRMATION') {
            triggerNewOrderPopup(data);
          }
        }
      });

      socket.on('chat:order_draft_updated', () => {
        // Internal cart preview update; do not trigger new order popup until customer confirms
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
    orderBadgePulsing,
    newOrderNotification,
    fetchUnreadChatCount,
    fetchPendingOrdersCount,
    fetchAllBadges,
    setupSocketListeners,
    triggerNewOrderPopup,
    triggerBadgePulse,
  };
}
