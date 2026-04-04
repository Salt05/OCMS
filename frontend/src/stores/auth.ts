import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api/index';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  orgId: string;
  orgName: string;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref(localStorage.getItem('token') || '');
  const needsSetup = ref(false);

  const isAuthenticated = computed(() => !!token.value && !!user.value);
  const isOwner = computed(() => user.value?.role === 'owner');
  const isAdmin = computed(() => ['owner', 'admin'].includes(user.value?.role || ''));

  async function checkSetup() {
    const res = await api.get('/setup/status');
    needsSetup.value = res.data.needsSetup;
    return res.data.needsSetup;
  }

  async function setup(data: { orgName: string; fullName: string; email: string; password: string }) {
    const res = await api.post('/setup', data);
    token.value = res.data.token;
    user.value = res.data.user;
    localStorage.setItem('token', res.data.token);
  }

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    token.value = res.data.token;
    localStorage.setItem('token', res.data.token);
    // Login response is partial — fetch full profile immediately
    await fetchProfile();
  }

  async function fetchProfile() {
    try {
      const res = await api.get('/profile');
      const d = res.data;
      // Map API response to User interface (org.name → orgName)
      user.value = {
        id: d.id,
        email: d.email,
        fullName: d.fullName || d.full_name || '',
        role: d.role,
        orgId: d.orgId || d.org_id || '',
        orgName: d.org?.name || d.orgName || '',
      };
    } catch (err: any) {
      // Only logout on 401 (invalid token) — not on network errors
      if (err?.response?.status === 401) {
        logout();
      }
    }
  }

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('token');
  }

  async function init() {
    if (token.value) {
      await fetchProfile();
    }
  }

  return { user, token, needsSetup, isAuthenticated, isOwner, isAdmin, checkSetup, setup, login, fetchProfile, logout, init };
});
