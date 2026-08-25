<template>
  <v-menu offset-y :close-on-content-click="false" max-width="380">
    <template #activator="{ props: menuProps }">
      <v-btn
        icon
        variant="text"
        v-bind="menuProps"
        class="topbar-btn notification-btn mr-1"
        title="Thông báo"
      >
        <v-badge
          :content="notifications.length"
          :model-value="notifications.length > 0"
          color="error"
          overlap
        >
          <v-icon>lucide-bell</v-icon>
        </v-badge>
      </v-btn>
    </template>
    <v-card class="notification-card" style="max-height: 400px; overflow-y: auto;">
      <v-card-title class="text-body-1 font-weight-bold pa-3 d-flex align-center justify-space-between">
        <div class="d-flex align-center">
          <span>Thông báo</span>
          <v-btn
            icon
            variant="text"
            size="small"
            class="ml-2"
            @click.stop="togglePush"
            :title="isPushEnabled ? 'Tắt thông báo đẩy & âm thanh' : 'Bật thông báo đẩy & âm thanh'"
            :color="isPushEnabled ? 'primary' : undefined"
          >
            <v-icon size="16">{{ isPushEnabled ? 'lucide-volume-2' : 'lucide-volume-x' }}</v-icon>
          </v-btn>
        </div>
        <v-chip v-if="notifications.length > 0" size="x-small" color="error" variant="flat">
          {{ notifications.length }} mới
        </v-chip>
      </v-card-title>
      <v-divider />
      <v-list density="compact" v-if="notifications.length > 0" class="pa-1">
        <v-list-item
          v-for="n in notifications"
          :key="n.id"
          @click="handleClick(n)"
          class="py-2 notification-item"
          :class="{ 'unread-db-notification': n.id.startsWith('db-') }"
        >
          <template #prepend>
            <v-icon
              :color="n.type === 'error' ? 'error' : n.type === 'warning' ? 'warning' : 'secondary'"
              size="20"
              class="mr-2"
            >
              {{ n.type === 'error' ? 'lucide-circle-alert' : n.type === 'warning' ? 'lucide-triangle-alert' : 'lucide-info' }}
            </v-icon>
          </template>
          <v-list-item-title class="text-body-2 font-weight-medium">{{ n.title }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption mt-0.5">{{ n.detail }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
      <div v-else class="pa-4 text-center text-caption text-grey">Không có thông báo</div>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';
import { io, Socket } from 'socket.io-client';

interface Notification {
  id: string;
  type: string;
  title: string;
  detail: string;
  priority: string;
  conversationId?: string;
}

const notifications = ref<Notification[]>([]);
const router = useRouter();
const authStore = useAuthStore();
let interval: ReturnType<typeof setInterval>;
let socket: Socket | null = null;

const isPushEnabled = ref(localStorage.getItem('push_enabled') === 'true');

async function togglePush() {
  if (!isPushEnabled.value) {
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        isPushEnabled.value = true;
        localStorage.setItem('push_enabled', 'true');
      } else {
        alert('Vui lòng cấp quyền thông báo trong trình duyệt!');
      }
    } else if (Notification.permission === 'granted') {
      isPushEnabled.value = true;
      localStorage.setItem('push_enabled', 'true');
    } else {
      alert('Quyền thông báo đã bị từ chối. Vui lòng bật lại trong cài đặt trình duyệt!');
    }
  } else {
    isPushEnabled.value = false;
    localStorage.setItem('push_enabled', 'false');
  }
}

async function fetchNotifications() {
  try {
    const res = await api.get('/notifications');
    notifications.value = res.data.notifications || [];
  } catch {
    // silently ignore fetch errors
  }
}

async function handleClick(n: Notification) {
  if (n.id.startsWith('db-')) {
    const dbId = n.id.substring(3);
    try {
      await api.put(`/notifications/${dbId}/read`);
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
    fetchNotifications();
    if (n.conversationId) {
      router.push(`/chat?id=${n.conversationId}`);
    }
  } else {
    if (n.id === 'unreplied') router.push('/chat');
    else if (n.id.startsWith('apt-')) router.push('/appointments');
    else if (n.id.startsWith('zalo-')) router.push('/zalo-accounts');
    else if (n.id === 'tmr-apts') router.push('/appointments');
  }
}

onMounted(() => {
  fetchNotifications();
  interval = setInterval(fetchNotifications, 60000);
});

watch(() => authStore.user?.id, (newUserId) => {
  if (newUserId) {
    if (socket) {
      socket.disconnect();
    }
    socket = io({ transports: ['websocket', 'polling'] });
    socket.on(`notification:created:${newUserId}`, (data: any) => {
      if (data?.notification) {
        if (!notifications.value.some(notif => notif.id === data.notification.id)) {
          notifications.value.unshift(data.notification);
          
          if (isPushEnabled.value) {
            try {
              const audio = new Audio('/notification.ogg');
              audio.play().catch(e => console.error('Audio play failed:', e));
            } catch (err) {
              console.error('Audio play error:', err);
            }
            
            if (Notification.permission === 'granted') {
              const pushNotif = new Notification(data.notification.title || 'Thông báo mới', {
                body: data.notification.detail || 'Bạn có thông báo mới',
                icon: '/favicon.svg'
              });
              pushNotif.onclick = () => {
                window.focus();
                handleClick(data.notification);
                pushNotif.close();
              };
            }
          }
        }
      }
    });
  }
}, { immediate: true });

onUnmounted(() => {
  clearInterval(interval);
  if (socket) {
    socket.disconnect();
  }
});
</script>

<style scoped>
.unread-db-notification {
  background-color: #e3f2fd !important;
  border-left: 4px solid #1e88e5 !important;
}

.v-theme--dark .unread-db-notification {
  background-color: #1a237e !important;
  border-left: 4px solid #2196f3 !important;
}
</style>
