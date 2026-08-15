<template>
  <v-app>
    <!-- Top bar -->
    <v-app-bar density="comfortable" flat>
      <v-app-bar-nav-icon @click="drawer = !drawer" />

      <!-- Brand mark + Title -->
      <div class="d-flex align-center" style="gap: 12px;">
        <div
          class="brand-mark d-flex align-center justify-center"
          style="width: 32px; height: 32px;"
        >
          <img :src="isDark ? logoDark : logoLight" alt="LAPET Logo" style="width: 24px; height: 24px; object-fit: contain;" />
        </div>
        <v-app-bar-title>
          <span class="font-weight-medium">LA</span><span class="brand-accent">PET</span>
        </v-app-bar-title>
      </div>

      <!-- Global search -->
      <GlobalSearch class="mx-2" />

      <v-spacer />

      <!-- Status indicator -->
      <div class="d-flex align-center mr-4 px-3 py-1 status-badge-online rounded-lg">
        <span
          class="status-dot"
          style="width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 8px;"
        ></span>
        <span class="text-caption font-weight-medium status-label">ONLINE</span>
      </div>

      <span class="text-body-2 mr-3 text-graphite" v-if="authStore.user">{{ authStore.user.fullName }}</span>
      <NotificationBell />
      <v-btn icon variant="text" @click="toggleTheme">
        <v-icon>{{ isDark ? 'lucide-sun' : 'lucide-moon' }}</v-icon>
      </v-btn>
      <v-btn icon variant="text" @click="logout">
        <v-icon>lucide-log-out</v-icon>
      </v-btn>
    </v-app-bar>

    <!-- Sidebar navigation -->
    <v-navigation-drawer v-model="drawer" :rail="rail" permanent @click="rail = false">
      <v-list density="compact" nav class="mt-2">
        <v-list-item
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          :prepend-icon="item.icon"
          :title="item.title"
          :value="item.path"
          rounded="lg"
          class="mb-1"
        />
      </v-list>

      <template #append>
        <v-list density="compact" nav>
          <v-list-item
          prepend-icon="lucide-chevron-left"
          title="Thu gọn"
          @click.stop="rail = !rail"
          rounded="lg"
          class="mx-2"
        />
        </v-list>
      </template>
    </v-navigation-drawer>

    <!-- Main content -->
    <v-main>
      <v-container fluid>
        <slot />
      </v-container>
    </v-main>

  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTheme } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import NotificationBell from '@/components/NotificationBell.vue';
import GlobalSearch from '@/components/GlobalSearch.vue';
import logoLight from '@/assets/logo-light.png';
import logoDark from '@/assets/logo-dark.png';

const theme = useTheme();
const authStore = useAuthStore();
const router = useRouter();

const drawer = ref(true);
const rail = ref(false);
const isDark = ref(localStorage.getItem('theme') === 'dark');

onMounted(() => {
  theme.global.name.value = isDark.value ? 'dark' : 'light';
});

const menuItems = [
  { title: 'Dashboard', icon: 'lucide-layout-dashboard', path: '/' },
  { title: 'Tin nhắn', icon: 'lucide-message-square-text', path: '/chat' },
  { title: 'Khách hàng', icon: 'lucide-users', path: '/contacts' },
  { title: 'Tài khoản Zalo', icon: 'lucide-monitor-smartphone', path: '/zalo-accounts' },
  { title: 'Lịch hẹn', icon: 'lucide-calendar-clock', path: '/appointments' },
  { title: 'Đơn hàng', icon: 'lucide-shopping-cart', path: '/orders' },
  { title: 'Báo cáo', icon: 'lucide-pie-chart', path: '/reports' },
  { title: 'Nhân viên', icon: 'lucide-user-cog', path: '/settings' },
  { title: 'API & Webhook', icon: 'lucide-webhook', path: '/api-settings' },
];

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
