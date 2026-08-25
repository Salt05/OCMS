<template>
  <div class="chatbot-view-container h-100 w-100 position-relative overflow-hidden">
    <iframe
      ref="chatbotIframe"
      :src="chatbotUrl"
      title="AI Assistant"
      class="w-100 h-100 border-0 absolute-inset"
      allow="microphone; clipboard-write; clipboard-read"
      @load="onIframeLoad"
    ></iframe>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useTheme } from 'vuetify';

const theme = useTheme();
const chatbotIframe = ref<HTMLIFrameElement | null>(null);
const chatbotUrl = ref(`http://localhost:8000?t=${Date.now()}`);

function sendThemeToIframe() {
  if (chatbotIframe.value?.contentWindow) {
    const currentTheme = theme.global.name.value === 'dark' ? 'dark' : 'light';
    chatbotIframe.value.contentWindow.postMessage(
      { type: 'SET_THEME', theme: currentTheme },
      '*'
    );
  }
}

function injectHideStyles() {
  try {
    const doc = chatbotIframe.value?.contentDocument || chatbotIframe.value?.contentWindow?.document;
    if (doc && doc.head) {
      let existingStyle = doc.getElementById('custom-ocms-overrides');
      if (!existingStyle) {
        const style = doc.createElement('style');
        style.id = 'custom-ocms-overrides';
        style.textContent = `
          .sidebar-footer,
          #user-profile-bar,
          .btn-theme-toggle,
          .dataset-badge {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            height: 0 !important;
            overflow: hidden !important;
          }
        `;
        doc.head.appendChild(style);
      }
    }
  } catch (e) {
    // Cross-origin fallback handled safely
  }
}

function onIframeLoad() {
  sendThemeToIframe();
  injectHideStyles();
}

watch(() => theme.global.name.value, () => {
  sendThemeToIframe();
});

onMounted(() => {
  chatbotUrl.value = `http://localhost:8000?t=${Date.now()}`;
  setTimeout(() => {
    onIframeLoad();
  }, 400);
});
</script>

<style scoped>
.chatbot-view-container {
  height: 100vh;
  width: 100%;
}

.absolute-inset {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}
</style>
