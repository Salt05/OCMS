<template>
  <component :is="layout">
    <router-view v-slot="{ Component }">
      <keep-alive :include="cachedViews">
        <component :is="Component" />
      </keep-alive>
    </router-view>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import DefaultLayout from '@/layouts/DefaultLayout.vue';
import AuthLayout from '@/layouts/AuthLayout.vue';

const route = useRoute();
const layout = computed(() => {
  return route.meta.layout === 'auth' ? AuthLayout : DefaultLayout;
});

// Cache high-frequency operational views for instantaneous (0ms) tab switching
const cachedViews = ['ChatView', 'OrdersView', 'ContactsView'];
</script>
