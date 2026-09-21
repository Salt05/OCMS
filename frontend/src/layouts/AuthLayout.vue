<template>
  <v-app class="parchment-bg">
    <v-main class="d-flex align-center justify-center py-4" style="min-height: 100vh;">
      <v-container :style="containerStyle" :class="{ 'pa-2 pa-md-4': isWide }">
        <slot />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const isWide = computed(() => route.meta?.wideLayout === true || route.path === '/mobile-gateway');
const containerStyle = computed(() => {
  if (isWide.value) {
    return 'max-width: 1240px; width: 100%;';
  }
  return 'max-width: 450px; width: 100%;';
});
</script>
