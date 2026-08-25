import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { io, Socket } from 'socket.io-client';
import { api } from '@/api/index';
import { useAuthStore } from './auth';

export interface AccountStatusItem {
  id: string;
  displayName: string | null;
  phone?: string | null;
  status: string;
  liveStatus: string;
}

export type StatusType = 'online' | 'reconnecting' | 'disconnected' | 'offline';

export const useConnectionStore = defineStore('connection', () => {
  const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const isServerConnected = ref(false);
  const isReconnecting = ref(false);
  const accounts = ref<AccountStatusItem[]>([]);
  let socket: Socket | null = null;
  let checkInterval: ReturnType<typeof setInterval> | null = null;
  let isInitialized = false;

  const totalAccounts = computed(() => accounts.value.length);
  const connectedAccountsCount = computed(
    () => accounts.value.filter((a) => (a.liveStatus || a.status) === 'connected').length
  );
  const reconnectingAccountsCount = computed(
    () => accounts.value.filter((a) => (a.liveStatus || a.status) === 'reconnecting').length
  );
  const disconnectedAccountsCount = computed(
    () =>
      accounts.value.filter((a) => {
        const s = a.liveStatus || a.status;
        return s === 'disconnected' || s === 'error';
      }).length
  );

  const statusType = computed<StatusType>(() => {
    if (!isOnline.value) return 'offline';
    if (!isServerConnected.value) return 'disconnected';
    if (isReconnecting.value || reconnectingAccountsCount.value > 0) return 'reconnecting';
    if (totalAccounts.value > 0 && disconnectedAccountsCount.value > 0) return 'disconnected';
    return 'online';
  });

  const statusLabel = computed<string>(() => {
    switch (statusType.value) {
      case 'offline':
        return 'OFFLINE';
      case 'disconnected':
        return 'MẤT KẾT NỐI';
      case 'reconnecting':
        return 'ĐANG KẾT NỐI';
      case 'online':
      default:
        return 'ONLINE';
    }
  });

  const statusDescription = computed<string>(() => {
    if (!isOnline.value) return 'Mất kết nối Internet trên thiết bị';
    if (!isServerConnected.value) return 'Mất kết nối tới máy chủ (Backend)';
    if (isReconnecting.value || reconnectingAccountsCount.value > 0) return 'Đang thực hiện kết nối lại Zalo...';
    if (totalAccounts.value > 0 && disconnectedAccountsCount.value > 0) {
      return `${disconnectedAccountsCount.value}/${totalAccounts.value} tài khoản Zalo bị mất kết nối`;
    }
    if (totalAccounts.value > 0) {
      return `${connectedAccountsCount.value}/${totalAccounts.value} tài khoản Zalo đang hoạt động tốt`;
    }
    return 'Hệ thống đang hoạt động bình thường';
  });

  async function fetchAccounts() {
    const authStore = useAuthStore();
    if (!authStore.isAuthenticated) return;
    try {
      const res = await api.get('/zalo-accounts');
      accounts.value = res.data || [];
    } catch {
      // ignore fetch errors silently
    }
  }

  async function manualReconnectAll() {
    const authStore = useAuthStore();
    if (!authStore.isAuthenticated) return;
    isReconnecting.value = true;
    try {
      await api.post('/zalo-accounts/reconnect-all');
    } catch {
      // ignore
    } finally {
      setTimeout(async () => {
        await fetchAccounts();
        isReconnecting.value = false;
      }, 2000);
    }
  }

  async function checkInternetConnection(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      isOnline.value = false;
      return false;
    }

    try {
      // Lightweight probe to verify actual external WAN connectivity with 2.5s timeout
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      await fetch('https://www.google.com/favicon.ico?' + Date.now(), {
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);
      isOnline.value = true;
      return true;
    } catch {
      // If probe failed or timed out, check navigator.onLine as fallback
      const online = typeof navigator !== 'undefined' ? navigator.onLine : false;
      isOnline.value = online;
      return online;
    }
  }

  function init() {
    if (isInitialized) return;
    isInitialized = true;

    // Window online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        isOnline.value = true;
        checkInternetConnection();
        fetchAccounts();
      });
      window.addEventListener('offline', () => {
        isOnline.value = false;
      });
    }

    // Socket.IO
    socket = io({ transports: ['websocket', 'polling'], reconnectionAttempts: Infinity, timeout: 5000 });


    socket.on('connect', () => {
      isServerConnected.value = true;
      fetchAccounts();
    });

    socket.on('disconnect', () => {
      isServerConnected.value = false;
    });

    socket.on('connect_error', () => {
      isServerConnected.value = false;
    });

    socket.on('zalo:connected', (data: { accountId: string }) => {
      const acc = accounts.value.find((a) => a.id === data.accountId);
      if (acc) {
        acc.liveStatus = 'connected';
        acc.status = 'connected';
      } else {
        fetchAccounts();
      }
    });

    socket.on('zalo:disconnected', (data: { accountId: string }) => {
      const acc = accounts.value.find((a) => a.id === data.accountId);
      if (acc) {
        acc.liveStatus = 'disconnected';
      } else {
        fetchAccounts();
      }
    });

    socket.on('zalo:reconnecting', (data: { accountId: string }) => {
      const acc = accounts.value.find((a) => a.id === data.accountId);
      if (acc) {
        acc.liveStatus = 'reconnecting';
      }
    });

    socket.on('zalo:reconnect-failed', (data: { accountId: string }) => {
      const acc = accounts.value.find((a) => a.id === data.accountId);
      if (acc) {
        acc.liveStatus = 'disconnected';
      } else {
        fetchAccounts();
      }
    });

    // Initial check & polling every 10 seconds for connectivity and accounts
    checkInternetConnection();
    fetchAccounts();
    checkInterval = setInterval(() => {
      checkInternetConnection();
      fetchAccounts();
    }, 10000);
  }

  function cleanup() {
    if (checkInterval) clearInterval(checkInterval);
    socket?.disconnect();
    socket = null;
    isInitialized = false;
  }

  return {
    isOnline,
    isServerConnected,
    isReconnecting,
    accounts,
    totalAccounts,
    connectedAccountsCount,
    reconnectingAccountsCount,
    disconnectedAccountsCount,
    statusType,
    statusLabel,
    statusDescription,
    init,
    cleanup,
    fetchAccounts,
    manualReconnectAll,
  };
});
