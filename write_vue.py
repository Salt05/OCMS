with open('frontend/src/views/ChatbotView.vue', 'w', encoding='utf-8') as f:
    f.write('''<template>
  <div class="chatbot-container h-100 w-100 d-flex flex-column">
    <div class="chatbot-iframe-wrapper flex-grow-1 position-relative rounded-lg overflow-hidden elevation-1 border">
      <iframe
        src="http://localhost:8000"
        title="AI Assistant"
        class="w-100 h-100 border-0 absolute-inset"
        allow="microphone; clipboard-write; clipboard-read"
      ></iframe>
    </div>
  </div>
</template>

<script setup lang="ts">
// AI Assistant Component
</script>

<style scoped>
.chatbot-container {
  min-height: calc(100vh - 100px);
}
.absolute-inset {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}
</style>
''')
