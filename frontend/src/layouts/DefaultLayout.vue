<template>
  <v-app class="zalo-app-wrapper" :class="{ 'is-dark-theme': isDark, 'is-light-theme': !isDark }">
    <div class="zalo-main-layout d-flex">
      <!-- 1. Left Vertical Navigation Rail (Zalo PC style) -->
      <aside class="zalo-nav-rail d-flex flex-column align-center justify-space-between py-3">
        <!-- Top Section: Avatar & Primary Nav -->
        <div class="d-flex flex-column align-center w-100">
          <!-- Profile Avatar with Online Badge -->
          <v-menu location="end top" offset="12">
            <template #activator="{ props: menuProps }">
              <div v-bind="menuProps" class="zalo-user-avatar-wrap mb-4 cursor-pointer" :title="authStore.user?.fullName || 'Tài khoản'">
                <v-avatar size="44" class="zalo-rail-avatar elevation-1" color="primary">
                  <v-img v-if="(authStore.user as any)?.avatarUrl" :src="(authStore.user as any).avatarUrl" />
                  <span v-else class="text-subtitle-1 font-weight-bold text-white">
                    {{ (authStore.user?.fullName || 'U').charAt(0).toUpperCase() }}
                  </span>
                </v-avatar>
                <span class="zalo-online-dot"></span>
              </div>
            </template>

            <!-- User Popover Card -->
            <v-card width="280" class="pa-3 zalo-user-menu-card elevation-4">
              <div class="d-flex align-center mb-3">
                <v-avatar size="40" class="mr-2" color="primary">
                  <span class="text-white font-weight-bold">{{ (authStore.user?.fullName || 'U').charAt(0) }}</span>
                </v-avatar>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="font-weight-bold text-truncate">{{ authStore.user?.fullName }}</div>
                  <div class="text-caption text-grey text-truncate">{{ authStore.user?.email }}</div>
                </div>
              </div>
              <v-divider class="mb-2" />
              <v-list density="compact" nav class="pa-0">
                <v-list-item to="/settings" prepend-icon="lucide-user-cog" title="Cài đặt tài khoản" rounded="lg" />
                <v-list-item to="/zalo-accounts" prepend-icon="lucide-smartphone" title="Quản lý Zalo" rounded="lg" />
                <v-list-item @click="logout" prepend-icon="lucide-log-out" title="Đăng xuất" rounded="lg" color="error" />
              </v-list>
            </v-card>
          </v-menu>

          <!-- Nav Items -->
          <nav class="zalo-nav-icons d-flex flex-column align-center gap-2 w-100">
            <router-link
              v-for="item in primaryMenuItems"
              :key="item.path"
              :to="item.path"
              class="zalo-rail-btn d-flex align-center justify-center position-relative"
              :class="{ 'is-active': isRouteActive(item.path) }"
              :title="item.title"
            >
              <v-icon size="22">{{ item.icon }}</v-icon>
              <!-- Unread Badge on Chat icon -->
              <span v-if="item.path === '/chat' && unreadChatCount > 0" class="zalo-rail-badge">
                {{ unreadChatCount > 99 ? '99+' : unreadChatCount }}
              </span>
            </router-link>
          </nav>
        </div>

        <!-- Bottom Section: Tools, Theme, Settings -->
        <div class="d-flex flex-column align-center gap-2 w-100">
          <!-- Connection Status Popover -->
          <v-menu location="end bottom" offset="12">
            <template #activator="{ props: connProps }">
              <button
                type="button"
                v-bind="connProps"
                class="zalo-rail-btn zalo-rail-tool-btn d-flex align-center justify-center"
                :title="connectionStore.statusDescription"
              >
                <span
                  class="zalo-status-indicator"
                  :class="{
                    'status-online': connectionStore.statusType === 'online',
                    'status-reconnecting': connectionStore.statusType === 'reconnecting',
                    'status-offline': connectionStore.statusType === 'disconnected' || connectionStore.statusType === 'offline',
                  }"
                ></span>
              </button>
            </template>
            <v-card width="260" class="pa-3 elevation-4">
              <div class="text-caption font-weight-bold text-uppercase mb-2">Trạng thái hệ thống</div>
              <div class="d-flex justify-space-between text-caption mb-1">
                <span class="text-grey">Kết nối Zalo:</span>
                <span :class="connectionStore.connectedAccountsCount > 0 ? 'text-success font-weight-bold' : 'text-error font-weight-bold'">
                  {{ connectionStore.connectedAccountsCount }}/{{ connectionStore.totalAccounts }}
                </span>
              </div>
              <div class="d-flex justify-space-between text-caption">
                <span class="text-grey">Máy chủ:</span>
                <span :class="connectionStore.isServerConnected ? 'text-success font-weight-bold' : 'text-error font-weight-bold'">
                  {{ connectionStore.isServerConnected ? 'Trực tuyến' : 'Mất kết nối' }}
                </span>
              </div>
            </v-card>
          </v-menu>

          <!-- Notifications -->
          <NotificationBell />

          <!-- Theme Toggle -->
          <button
            type="button"
            class="zalo-rail-btn zalo-rail-tool-btn d-flex align-center justify-center"
            @click="toggleTheme"
            :title="isDark ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'"
          >
            <v-icon size="20">{{ isDark ? 'lucide-sun' : 'lucide-moon' }}</v-icon>
          </button>

          <!-- Settings -->
          <router-link
            to="/settings"
            class="zalo-rail-btn zalo-rail-tool-btn d-flex align-center justify-center"
            :class="{ 'is-active': isRouteActive('/settings') || isRouteActive('/api-settings') }"
            title="Cài đặt hệ thống"
          >
            <v-icon size="20">lucide-settings</v-icon>
          </router-link>
        </div>
      </aside>

      <!-- 2. Main Content Area -->
      <main class="zalo-content-area flex-grow-1 position-relative overflow-hidden">
        <!-- If non-chat page, render top bar with title & search -->
        <header v-if="!isChatPage" class="zalo-top-subbar d-flex align-center px-4">
          <div class="text-h6 font-weight-bold mr-4">{{ currentPageTitle }}</div>
          <GlobalSearch class="mr-auto" style="max-width: 380px;" />
          <div class="d-flex align-center gap-2">
            <v-chip size="small" variant="tonal" color="primary" class="font-weight-medium">
              {{ authStore.user?.role === 'owner' ? 'Chủ sở hữu' : (authStore.user?.role === 'admin' ? 'Quản trị' : 'Nhân viên') }}
            </v-chip>
          </div>
        </header>

        <!-- Slot container -->
        <div :class="isChatPage ? 'zalo-chat-page-wrapper' : 'zalo-general-page-wrapper pa-4 overflow-y-auto'">
          <slot />
        </div>
      </main>
    </div>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTheme } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { useConnectionStore } from '@/stores/connection';
import NotificationBell from '@/components/NotificationBell.vue';
import GlobalSearch from '@/components/GlobalSearch.vue';

const theme = useTheme();
const authStore = useAuthStore();
const connectionStore = useConnectionStore();
const route = useRoute();
const router = useRouter();

const isDark = ref(localStorage.getItem('theme') === 'dark');

onMounted(() => {
  theme.global.name.value = isDark.value ? 'dark' : 'light';
  connectionStore.init();
});

const isFullWidthPage = computed(() => route.path === '/chat' || route.path.startsWith('/ai-assistant'));
const isChatPage = computed(() => isFullWidthPage.value);

const unreadChatCount = computed(() => {
  return 0;
});

const primaryMenuItems = [
  { title: 'Tin nhắn (Chat)', icon: 'lucide-message-square', path: '/chat' },
  { title: 'Khách hàng (Danh bạ)', icon: 'lucide-contact', path: '/contacts' },
  { title: 'Tài khoản Zalo (Cloud)', icon: 'lucide-cloud', path: '/zalo-accounts' },
  { title: 'Lịch hẹn & Giao việc', icon: 'lucide-calendar-check', path: '/appointments' },
  { title: 'Đơn hàng & CRM', icon: 'lucide-shopping-bag', path: '/orders' },
  { title: 'Báo cáo & Thống kê', icon: 'lucide-pie-chart', path: '/reports' },
  { title: 'Trợ lý AI (Chatbot)', icon: 'lucide-bot', path: '/ai-assistant' },
  { title: 'Tổng quan (Dashboard)', icon: 'lucide-layout-dashboard', path: '/' },
];

function isRouteActive(path: string): boolean {
  if (path === '/') return route.path === '/';
  return route.path.startsWith(path);
}

const currentPageTitle = computed(() => {
  switch (route.name) {
    case 'Dashboard': return 'Tổng quan kinh doanh';
    case 'Contacts': return 'Quản lý khách hàng';
    case 'ZaloAccounts': return 'Tài khoản Zalo kết nối';
    case 'Appointments': return 'Lịch hẹn & Nhắc việc';
    case 'Orders': return 'Quản lý đơn hàng';
    case 'Reports': return 'Báo cáo & Thống kê';
    case 'AIAssistant': return 'Trợ lý AI Phân tích dữ liệu';
    case 'Settings': return 'Cài đặt hệ thống';
    case 'ApiSettings': return 'Cấu hình API & Webhook';
    default: return '';
  }
});

function toggleTheme() {
  isDark.value = !isDark.value;
  theme.global.name.value = isDark.value ? 'dark' : 'light';
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
}

function logout() {
  authStore.logout();
  router.push('/login');
}
</script>

<style scoped>
.zalo-app-wrapper {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.zalo-main-layout {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

/* 1. Left Nav Rail */
.zalo-nav-rail {
  width: 68px;
  height: 100vh;
  flex-shrink: 0;
  z-index: 100;
  transition: background-color 0.2s ease;
}

.is-light-theme .zalo-nav-rail {
  background-color: #0068ff;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
}

.is-dark-theme .zalo-nav-rail {
  background-color: #18191a;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.zalo-user-avatar-wrap {
  position: relative;
  display: inline-block;
}

.zalo-rail-avatar {
  border: 2px solid rgba(255, 255, 255, 0.4);
  transition: transform 0.15s ease;
}
.zalo-user-avatar-wrap:hover .zalo-rail-avatar {
  transform: scale(1.05);
}

.zalo-online-dot {
  position: absolute;
  bottom: 1px;
  right: 1px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #10b981;
  border: 2px solid #0068ff;
}
.is-dark-theme .zalo-online-dot {
  border-color: #18191a;
}

/* Rail Button */
.zalo-rail-btn {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
  transform: none !important;
}

.zalo-rail-btn .v-icon {
  transition: color 0.2s ease;
}

.zalo-rail-btn:hover {
  background-color: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.zalo-rail-btn.is-active {
  background-color: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}

.zalo-rail-btn.is-active .v-icon {
  animation: easeOutBounceIcon 0.5s ease-out forwards;
}

@keyframes easeOutBounceIcon {
  0% {
    transform: scale(0.7);
  }
  36% {
    transform: scale(1.22);
  }
  54% {
    transform: scale(0.92);
  }
  72% {
    transform: scale(1.12);
  }
  85% {
    transform: scale(0.97);
  }
  100% {
    transform: scale(1.08);
  }
}

.is-dark-theme .zalo-rail-btn {
  color: #9ca3af;
}
.is-dark-theme .zalo-rail-btn:hover {
  background-color: #242526;
  color: #e4e6eb;
}
.is-dark-theme .zalo-rail-btn.is-active {
  background-color: #2d3748;
  color: #38bdf8;
}

.zalo-rail-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background-color: #ef4444;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 10px;
  padding: 1px 5px;
  line-height: 1.2;
}

.zalo-status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.status-online { background-color: #10b981; box-shadow: 0 0 6px rgba(16, 185, 129, 0.6); }
.status-reconnecting { background-color: #f59e0b; box-shadow: 0 0 6px rgba(245, 158, 11, 0.6); }
.status-offline { background-color: #ef4444; }

/* 2. Main Area */
.zalo-content-area {
  height: 100vh;
  overflow: hidden;
  background-color: var(--v-theme-background);
}

.zalo-top-subbar {
  height: 56px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);
  background-color: var(--v-theme-surface);
}

.zalo-chat-page-wrapper {
  height: 100vh;
  width: 100%;
}

.zalo-general-page-wrapper {
  height: calc(100vh - 56px);
  width: 100%;
}
</style>
