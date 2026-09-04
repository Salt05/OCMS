<template>
  <v-app class="zalo-app-wrapper" :class="{ 'is-dark-theme': isDark, 'is-light-theme': !isDark, 'is-mobile': isMobile }">
    <div class="zalo-main-layout d-flex" :class="{ 'flex-column': isMobile }">
      <!-- 1. DESKTOP: Left Vertical Navigation Rail (Zalo PC style, mdAndUp) -->
      <aside v-if="!isMobile" class="zalo-nav-rail d-flex flex-column align-center justify-space-between py-3">
        <!-- Top Section: Avatar & Primary Nav -->
        <div class="d-flex flex-column align-center w-100">
          <!-- Profile Avatar with Online Badge -->
          <v-menu location="end top" offset="12">
            <template #activator="{ props: menuProps }">
              <div v-bind="menuProps" class="zalo-user-avatar-wrap mb-4 cursor-pointer" :title="authStore.user?.fullName || 'Tài khoản'">
                <v-avatar size="44" class="zalo-rail-avatar elevation-1" color="primary">
                  <v-img v-if="(authStore.user as any)?.avatarUrl" :src="(authStore.user as any).avatarUrl">
                    <template #error>
                      <span class="text-subtitle-1 font-weight-bold text-white">
                        {{ (authStore.user?.fullName || 'U').charAt(0).toUpperCase() }}
                      </span>
                    </template>
                  </v-img>
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
              <!-- Unread Badge on Chat icon (Red) -->
              <span v-if="item.path === '/chat' && unreadChatCount > 0" class="zalo-rail-badge">
                {{ unreadChatCount > 99 ? '99+' : unreadChatCount }}
              </span>
              <!-- Pending Orders Badge on Orders icon (Amber/Red) -->
              <span
                v-if="item.path === '/orders' && pendingOrdersCount > 0"
                class="zalo-rail-badge zalo-rail-badge-amber"
                :class="{ 'badge-pulse-once': orderBadgePulsing }"
              >
                {{ pendingOrdersCount > 99 ? '99+' : pendingOrdersCount }}
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

      <!-- 2. MOBILE: Top App Bar (< 768px) -->
      <header v-if="isMobile && shouldShowMobileTopBar" class="mobile-top-bar d-flex align-center justify-space-between px-3">
        <div class="d-flex align-center overflow-hidden">
          <img :src="isDark ? logoDark : logoLight" alt="LaPet" class="brand-logo mr-2" style="width: 26px; height: 26px; object-fit: contain; border-radius: 6px;" />
          <span class="text-subtitle-1 font-weight-bold text-truncate">{{ currentPageTitle || 'LaPet CRM' }}</span>
        </div>

        <div class="d-flex align-center gap-1">
          <!-- Notification Bell -->
          <NotificationBell />

          <!-- User Menu Trigger -->
          <v-menu location="bottom end" offset="8">
            <template #activator="{ props: menuProps }">
              <v-avatar size="32" color="primary" class="ml-1 cursor-pointer" v-bind="menuProps">
                <v-img v-if="(authStore.user as any)?.avatarUrl" :src="(authStore.user as any).avatarUrl">
                  <template #error>
                    <span class="text-caption font-weight-bold text-white">
                      {{ (authStore.user?.fullName || 'U').charAt(0).toUpperCase() }}
                    </span>
                  </template>
                </v-img>
                <span v-else class="text-caption font-weight-bold text-white">
                  {{ (authStore.user?.fullName || 'U').charAt(0).toUpperCase() }}
                </span>
              </v-avatar>
            </template>
            <v-card width="260" class="pa-3 elevation-4">
              <div class="d-flex align-center mb-2">
                <v-avatar size="36" class="mr-2" color="primary">
                  <span class="text-white font-weight-bold">{{ (authStore.user?.fullName || 'U').charAt(0) }}</span>
                </v-avatar>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="font-weight-bold text-truncate text-body-2">{{ authStore.user?.fullName }}</div>
                  <div class="text-caption text-grey text-truncate">{{ authStore.user?.email }}</div>
                </div>
              </div>
              <v-divider class="mb-2" />
              <v-list density="compact" nav class="pa-0">
                <v-list-item @click="toggleTheme" rounded="lg">
                  <template #prepend>
                    <v-icon size="18">{{ isDark ? 'lucide-sun' : 'lucide-moon' }}</v-icon>
                  </template>
                  <v-list-item-title class="text-caption">
                    {{ isDark ? 'Giao diện Sáng' : 'Giao diện Tối' }}
                  </v-list-item-title>
                </v-list-item>
                <v-list-item to="/settings" prepend-icon="lucide-user-cog" title="Cài đặt tài khoản" rounded="lg" />
                <v-list-item @click="logout" prepend-icon="lucide-log-out" title="Đăng xuất" rounded="lg" color="error" />
              </v-list>
            </v-card>
          </v-menu>
        </div>
      </header>

      <!-- 3. Main Content Area -->
      <main class="zalo-content-area flex-grow-1 position-relative overflow-hidden" :class="{ 'is-mobile-content': isMobile }">
        <!-- Desktop Non-Chat Page Top Header -->
        <header v-if="!isChatPage && !isMobile" class="zalo-top-subbar d-flex align-center px-4">
          <div class="text-h6 font-weight-bold mr-4">{{ currentPageTitle }}</div>
          <v-spacer />
          <div class="d-flex align-center gap-2">
            <v-chip size="small" variant="tonal" color="primary" class="font-weight-medium">
              {{ authStore.user?.role === 'owner' ? 'Chủ sở hữu' : (authStore.user?.role === 'admin' ? 'Quản trị' : 'Nhân viên') }}
            </v-chip>
          </div>
        </header>

        <!-- Slot container -->
        <div
          :class="[
            isChatPage ? 'zalo-chat-page-wrapper' : 'zalo-general-page-wrapper pa-3 pa-md-4 overflow-y-auto',
            isMobile && isChatPage ? 'mobile-chat-wrapper' : ''
          ]"
        >
          <slot />
        </div>
      </main>

      <!-- 4. MOBILE: Bottom Navigation Bar (< 768px) -->
      <nav v-if="isMobile && shouldShowMobileBottomNav" class="mobile-bottom-nav d-flex align-center justify-space-around border-t">
        <!-- 1. Chat -->
        <router-link
          to="/chat"
          class="mobile-nav-tab d-flex flex-column align-center justify-center position-relative"
          :class="{ 'is-active': isRouteActive('/chat') }"
        >
          <div class="position-relative">
            <v-icon size="20">lucide-message-square</v-icon>
            <span v-if="unreadChatCount > 0" class="mobile-tab-badge">
              {{ unreadChatCount > 99 ? '99+' : unreadChatCount }}
            </span>
          </div>
          <span class="mobile-tab-label">Tin nhắn</span>
        </router-link>

        <!-- 2. Orders -->
        <router-link
          to="/orders"
          class="mobile-nav-tab d-flex flex-column align-center justify-center position-relative"
          :class="{ 'is-active': isRouteActive('/orders') }"
        >
          <div class="position-relative">
            <v-icon size="20">lucide-shopping-bag</v-icon>
            <span v-if="pendingOrdersCount > 0" class="mobile-tab-badge mobile-tab-badge-amber">
              {{ pendingOrdersCount > 99 ? '99+' : pendingOrdersCount }}
            </span>
          </div>
          <span class="mobile-tab-label">Đơn hàng</span>
        </router-link>

        <!-- 3. AI Assistant (Replaces Appointments) -->
        <router-link
          to="/ai-assistant"
          class="mobile-nav-tab d-flex flex-column align-center justify-center"
          :class="{ 'is-active': isRouteActive('/ai-assistant') }"
        >
          <v-icon size="20">lucide-bot</v-icon>
          <span class="mobile-tab-label">Trợ lý AI</span>
        </router-link>

        <!-- 4. Contacts -->
        <router-link
          to="/contacts"
          class="mobile-nav-tab d-flex flex-column align-center justify-center"
          :class="{ 'is-active': isRouteActive('/contacts') }"
        >
          <v-icon size="20">lucide-contact</v-icon>
          <span class="mobile-tab-label">Khách hàng</span>
        </router-link>

        <!-- 5. More Menu Button -->
        <button
          type="button"
          class="mobile-nav-tab d-flex flex-column align-center justify-center"
          :class="{ 'is-active': isMoreMenuRouteActive || showMobileMoreDrawer }"
          @click="showMobileMoreDrawer = true"
        >
          <v-icon size="20">lucide-menu</v-icon>
          <span class="mobile-tab-label">Thêm</span>
        </button>
      </nav>

      <!-- 5. MOBILE: More Menu Side Drawer (< 768px) -->
      <v-navigation-drawer
        v-if="isMobile"
        v-model="showMobileMoreDrawer"
        location="right"
        temporary
        width="310"
        class="mobile-more-drawer"
      >
        <div class="pa-4 d-flex flex-column h-100">
          <!-- Drawer Header -->
          <div class="d-flex align-center justify-space-between pb-3 border-b mb-3">
            <div class="d-flex align-center gap-2 overflow-hidden">
              <v-avatar size="40" color="primary">
                <span class="text-white font-weight-bold">{{ (authStore.user?.fullName || 'U').charAt(0) }}</span>
              </v-avatar>
              <div class="overflow-hidden">
                <div class="font-weight-bold text-subtitle-2 text-truncate">{{ authStore.user?.fullName }}</div>
                <div class="text-caption text-grey text-truncate">{{ authStore.user?.email }}</div>
              </div>
            </div>
            <v-btn icon size="small" variant="text" @click="showMobileMoreDrawer = false">
              <v-icon size="18">lucide-x</v-icon>
            </v-btn>
          </div>

          <!-- Connection Status Card with proper padding and badge chips -->
          <v-card variant="outlined" class="pa-3 mb-3 rounded-lg bg-surface border">
            <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis mb-2">Trạng thái hệ thống</div>
            <div class="d-flex justify-space-between align-center text-caption mb-1.5 px-0.5">
              <span class="text-medium-emphasis">Kết nối Zalo:</span>
              <v-chip size="x-small" :color="connectionStore.connectedAccountsCount > 0 ? 'success' : 'error'" variant="tonal" class="font-weight-bold px-2">
                {{ connectionStore.connectedAccountsCount }}/{{ connectionStore.totalAccounts }} Hoạt động
              </v-chip>
            </div>
            <div class="d-flex justify-space-between align-center text-caption px-0.5">
              <span class="text-medium-emphasis">Máy chủ:</span>
              <v-chip size="x-small" :color="connectionStore.isServerConnected ? 'success' : 'error'" variant="tonal" class="font-weight-bold px-2">
                {{ connectionStore.isServerConnected ? 'Trực tuyến' : 'Mất kết nối' }}
              </v-chip>
            </div>
          </v-card>

          <!-- Extended Navigation Items -->
          <div class="flex-grow-1 overflow-y-auto pr-1">
            <v-list density="comfortable" nav class="pa-0">
              <v-list-item
                to="/"
                prepend-icon="lucide-layout-dashboard"
                title="Tổng quan kinh doanh"
                rounded="lg"
                class="mb-1"
                @click="showMobileMoreDrawer = false"
              />
              <v-list-item
                to="/zalo-accounts"
                prepend-icon="lucide-cloud"
                title="Tài khoản Zalo Cloud"
                rounded="lg"
                class="mb-1"
                @click="showMobileMoreDrawer = false"
              />
              <v-list-item
                to="/products"
                prepend-icon="lucide-package"
                title="Sản phẩm & Phân loại"
                rounded="lg"
                class="mb-1"
                @click="showMobileMoreDrawer = false"
              />
              <v-list-item
                to="/reports"
                prepend-icon="lucide-pie-chart"
                title="Báo cáo & Thống kê"
                rounded="lg"
                class="mb-1"
                @click="showMobileMoreDrawer = false"
              />
              <v-list-item
                to="/ai-assistant"
                prepend-icon="lucide-bot"
                title="Trợ lý AI (Chatbot)"
                rounded="lg"
                class="mb-1"
                @click="showMobileMoreDrawer = false"
              />
              <v-list-item
                to="/settings"
                prepend-icon="lucide-settings"
                title="Cài đặt hệ thống"
                rounded="lg"
                class="mb-1"
                @click="showMobileMoreDrawer = false"
              />
              <v-list-item
                v-if="authStore.isAdmin"
                to="/api-settings"
                prepend-icon="lucide-webhook"
                title="Cấu hình API & Webhook"
                rounded="lg"
                class="mb-1"
                @click="showMobileMoreDrawer = false"
              />
            </v-list>
          </div>

          <!-- Drawer Footer with increased button height -->
          <div class="pt-3 border-t mt-auto d-flex flex-column gap-2">
            <v-btn
              variant="tonal"
              block
              height="44"
              class="text-none justify-start px-3 text-body-2 font-weight-medium rounded-lg"
              @click="toggleTheme"
            >
              <v-icon start size="18" class="mr-2">{{ isDark ? 'lucide-sun' : 'lucide-moon' }}</v-icon>
              {{ isDark ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối' }}
            </v-btn>
            <v-btn
              color="error"
              variant="tonal"
              block
              height="44"
              class="text-none justify-start px-3 text-body-2 font-weight-medium rounded-lg"
              @click="logout"
            >
              <v-icon start size="18" class="mr-2">lucide-log-out</v-icon>
              Đăng xuất
            </v-btn>
          </div>
        </div>
      </v-navigation-drawer>

      <!-- 5. MOBILE: More Menu Side Drawer (< 768px) -->
      <!-- Drawer contents above -->
    </div>

    <!-- ── Global Realtime New Order Popup Banner ──────────────────────── -->
    <v-snackbar
      v-model="newOrderNotification.show"
      :timeout="8000"
      color="primary"
      location="top right"
      elevation="8"
      class="mt-3 mr-3 rounded-lg"
    >
      <div class="d-flex align-center gap-3 py-1">
        <v-avatar color="white" size="36">
          <v-icon color="primary" size="22">lucide-shopping-bag</v-icon>
        </v-avatar>
        <div>
          <div class="font-weight-bold text-subtitle-2 text-white">{{ newOrderNotification.title }}</div>
          <div class="text-caption text-white opacity-90">{{ newOrderNotification.message }}</div>
        </div>
      </div>
      <template #actions>
        <v-btn
          variant="elevated"
          color="white"
          class="text-primary font-weight-bold text-caption text-none mr-1"
          @click="goToPendingOrders"
        >
          Xem & Duyệt
        </v-btn>
        <v-btn
          icon="lucide-x"
          variant="text"
          size="small"
          color="white"
          @click="newOrderNotification.show = false"
        />
      </template>
    </v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTheme, useDisplay } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { useConnectionStore } from '@/stores/connection';
import { useAppBadges } from '@/composables/use-app-badges';
import NotificationBell from '@/components/NotificationBell.vue';
import logoLight from '@/assets/logo-light.png';
import logoDark from '@/assets/logo-dark.png';

const theme = useTheme();
const display = useDisplay();
const authStore = useAuthStore();
const connectionStore = useConnectionStore();
const route = useRoute();
const router = useRouter();

const isMobile = computed(() => display.smAndDown.value);
const showMobileMoreDrawer = ref(false);

const {
  unreadChatCount,
  pendingOrdersCount,
  orderBadgePulsing,
  newOrderNotification,
  fetchAllBadges,
  setupSocketListeners,
} = useAppBadges();

function goToPendingOrders() {
  newOrderNotification.value.show = false;
  router.push('/orders');
}

const isDark = ref(localStorage.getItem('theme') === 'dark');

onMounted(() => {
  theme.global.name.value = isDark.value ? 'dark' : 'light';
  connectionStore.init();
  fetchAllBadges();
  setupSocketListeners();
});

const isFullWidthPage = computed(() => route.path === '/chat' || route.path.startsWith('/ai-assistant'));
const isChatPage = computed(() => isFullWidthPage.value);

// In Chat view on mobile: if an active chat thread is opened (query.id is present), hide top bar and bottom nav
const isMobileActiveChatOpen = computed(() => {
  return isMobile.value && route.path === '/chat' && !!route.query.id;
});

const shouldShowMobileTopBar = computed(() => {
  if (route.path === '/chat') {
    return !isMobileActiveChatOpen.value;
  }
  return true;
});

const shouldShowMobileBottomNav = computed(() => {
  if (route.path === '/chat') {
    return !isMobileActiveChatOpen.value;
  }
  return true;
});

const primaryMenuItems = computed(() => {
  const items = [
    { title: 'Tin nhắn (Chat)', icon: 'lucide-message-square', path: '/chat' },
    { title: 'Khách hàng (Danh bạ)', icon: 'lucide-contact', path: '/contacts' },
    { title: 'Tài khoản Zalo (Cloud)', icon: 'lucide-cloud', path: '/zalo-accounts' },
    { title: 'Đơn hàng & CRM', icon: 'lucide-shopping-bag', path: '/orders' },
    { title: 'Sản phẩm & Phân loại', icon: 'lucide-package', path: '/products' },
    { title: 'Ưu đãi & Chiết khấu', icon: 'lucide-percent', path: '/promotions' },
    { title: 'Báo cáo & Thống kê', icon: 'lucide-pie-chart', path: '/reports' },
    { title: 'Trợ lý AI (Chatbot)', icon: 'lucide-bot', path: '/ai-assistant' },
    { title: 'Tổng quan (Dashboard)', icon: 'lucide-layout-dashboard', path: '/' },
  ];
  return items;
});

function isRouteActive(path: string): boolean {
  if (path === '/') return route.path === '/';
  return route.path.startsWith(path);
}

const isMoreMenuRouteActive = computed(() => {
  const secondaryPaths = ['/', '/zalo-accounts', '/reports', '/ai-assistant', '/settings', '/api-settings'];
  return secondaryPaths.some(p => isRouteActive(p) && p !== '/chat' && p !== '/orders' && p !== '/products' && p !== '/promotions' && p !== '/contacts');
});

const currentPageTitle = computed(() => {
  switch (route.name) {
    case 'Dashboard': return 'Tổng quan kinh doanh';
    case 'Chat': return 'Tin nhắn';
    case 'Contacts': return 'Quản lý khách hàng';
    case 'ZaloAccounts': return 'Tài khoản Zalo kết nối';
    case 'Orders': return 'Quản lý đơn hàng';
    case 'Products': return 'Quản lý sản phẩm & Phân loại';
    case 'Promotions': return 'Quản lý ưu đãi & chiết khấu';
    case 'Reports': return 'Báo cáo & Thống kê';
    case 'AIAssistant': return 'Trợ lý AI Phân tích';
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
  height: 100dvh;
  width: 100vw;
  overflow: hidden;
}

.zalo-main-layout {
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  overflow: hidden;
}

/* ─────────────────────────────────────────────────────────────
   1. DESKTOP NAV RAIL (Zalo PC style)
   ───────────────────────────────────────────────────────────── */
.zalo-nav-rail {
  width: 68px;
  height: 100vh;
  height: 100dvh;
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
  0% { transform: scale(0.7); }
  36% { transform: scale(1.22); }
  54% { transform: scale(0.92); }
  72% { transform: scale(1.12); }
  85% { transform: scale(0.97); }
  100% { transform: scale(1.08); }
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

.zalo-rail-badge-amber {
  background-color: #f59e0b;
}

@keyframes badgePulseOnce {
  0% { transform: scale(1); }
  35% { transform: scale(1.45); box-shadow: 0 0 12px rgba(245, 158, 11, 0.8); }
  65% { transform: scale(0.85); }
  100% { transform: scale(1); }
}

.badge-pulse-once {
  animation: badgePulseOnce 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 1;
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

/* ─────────────────────────────────────────────────────────────
   2. MOBILE TOP APP BAR & BOTTOM NAVIGATION
   ───────────────────────────────────────────────────────────── */
.mobile-top-bar {
  height: 52px;
  flex-shrink: 0;
  background-color: var(--v-theme-surface);
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);
  z-index: 10;
  padding-top: env(safe-area-inset-top, 0);
}

.brand-badge {
  background-color: #0068ff;
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 6px;
  letter-spacing: 0.5px;
}

.mobile-bottom-nav {
  height: calc(56px + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  flex-shrink: 0;
  background-color: var(--v-theme-surface);
  border-top: 1px solid rgba(128, 128, 128, 0.15);
  z-index: 100;
  width: 100vw;
}

.mobile-nav-tab {
  flex: 1;
  height: 56px;
  text-decoration: none;
  background: transparent;
  border: none;
  color: rgba(var(--v-theme-on-surface), 0.6);
  transition: color 0.15s ease;
  cursor: pointer;
  padding: 0 4px;
}

.mobile-nav-tab.is-active {
  color: #0068ff;
}
.is-dark-theme .mobile-nav-tab.is-active {
  color: #38bdf8;
}

.mobile-tab-label {
  font-size: 11px;
  font-weight: 600;
  margin-top: 2px;
}

.mobile-tab-badge {
  position: absolute;
  top: -4px;
  right: -8px;
  background-color: #ef4444;
  color: #ffffff;
  font-size: 9px;
  font-weight: 700;
  border-radius: 10px;
  padding: 1px 4px;
  line-height: 1;
  min-width: 16px;
  text-align: center;
}

.mobile-tab-badge-amber {
  background-color: #f59e0b;
}

/* ─────────────────────────────────────────────────────────────
   3. CONTENT AREA
   ───────────────────────────────────────────────────────────── */
.zalo-content-area {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background-color: var(--v-theme-background);
}

.zalo-content-area.is-mobile-content {
  height: calc(100dvh - 52px - 56px - env(safe-area-inset-bottom, 0px));
}

.zalo-top-subbar {
  height: 56px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);
  background-color: var(--v-theme-surface);
}

.zalo-chat-page-wrapper {
  height: 100vh;
  height: 100dvh;
  width: 100%;
}

.mobile-chat-wrapper {
  height: 100% !important;
}

.zalo-general-page-wrapper {
  height: calc(100vh - 56px);
  width: 100%;
}

.is-mobile .zalo-general-page-wrapper {
  height: 100%;
}

/* Mobile More Drawer Enhanced Styling */
.mobile-more-drawer :deep(.v-list-item) {
  min-height: 48px !important;
  margin-bottom: 6px !important;
  border-radius: 10px !important;
  padding: 0 14px !important;
}

.mobile-more-drawer :deep(.v-list-item-title) {
  font-size: 15px !important;
  font-weight: 500 !important;
  line-height: 1.4 !important;
}

.mobile-more-drawer :deep(.v-list-item__prepend .v-icon) {
  font-size: 22px !important;
  margin-inline-end: 14px !important;
}
</style>
