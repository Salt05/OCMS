<template>
  <v-card class="auth-card" elevation="0">
    <div class="text-center mb-8">
      <div
        class="brand-mark mx-auto mb-4 d-flex align-center justify-center"
        style="width: 64px; height: 64px;"
      >
          <img :src="isDark ? logoDark : logoLight" alt="LAPET Logo" style="width: 32px; height: 32px; object-fit: contain;" />
        </div>
        <h1 class="editorial-heading mb-1">LA<span class="brand-accent">PET</span></h1>
      <p class="text-caption mt-1 text-ashen">Quản lý Zalo đa tài khoản</p>
    </div>

    <v-form @submit.prevent="handleLogin">
      <v-text-field
        v-model="email"
        label="Email"
        type="email"
        prepend-inner-icon="lucide-mail"
        required
        class="mb-3"
      />
      <v-text-field
        v-model="password"
        label="Mật khẩu"
        type="password"
        prepend-inner-icon="lucide-lock"
        required
        class="mb-5"
      />
      <v-btn type="submit" color="primary" block size="large" :loading="loading" rounded="lg">
        <v-icon start>lucide-log-in</v-icon>
        Đăng nhập
      </v-btn>
    </v-form>

    <v-alert v-if="error" type="error" class="mt-4" density="compact" closable variant="tonal">
      {{ error }}
    </v-alert>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from 'vuetify';
import logoLight from '@/assets/logo-light.png';
import logoDark from '@/assets/logo-dark.png';

const theme = useTheme();
const isDark = computed(() => theme.global.name.value === 'dark');

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const router = useRouter();
const authStore = useAuthStore();

onMounted(async () => {
  // If already authenticated, skip login page
  if (authStore.token) {
    try {
      await authStore.fetchProfile();
      if (authStore.isAuthenticated) {
        router.replace('/');
        return;
      }
    } catch {}
  }
  // Check if first-time setup needed
  try {
    const needs = await authStore.checkSetup();
    if (needs) router.replace('/setup');
  } catch {}
});

async function handleLogin() {
  loading.value = true;
  error.value = '';
  try {
    await authStore.login(email.value, password.value);
    router.push('/');
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Đăng nhập thất bại';
  } finally {
    loading.value = false;
  }
}
</script>
