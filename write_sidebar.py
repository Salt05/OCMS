import os

code = """<template>
  <div class="chatbot-sidebar-container d-flex flex-column h-100" style="background-color: #1a1a1a; color: #e0e0e0; font-family: Roboto, sans-serif;">
    <div class="chat-history flex-grow-1 overflow-y-auto px-4 pt-6 pb-2 d-flex flex-column">
      <!-- Welcome message -->
      <div v-if="messages.length === 0" class="welcome-section mt-8 mb-6">
        <h2 class="text-h5 font-weight-medium mb-2" style="background: -webkit-linear-gradient(45deg, #a8c0ff, #3f2b96); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
          Xin chào {{ currentUser }}!
        </h2>
        <h3 class="text-h6 font-weight-regular text-medium-emphasis mb-8" style="color: #b0b0b0 !important;">
          Hôm nay tôi có thể giúp gì cho bạn?
        </h3>
        
        <!-- Suggestions -->
        <div class="suggestions d-flex flex-column gap-3">
          <v-btn
            v-for="(suggestion, i) in suggestions"
            :key="i"
            variant="flat"
            class="suggestion-btn text-none justify-start px-4 py-3 h-auto rounded-xl"
            style="background-color: #2a2a2a; color: #e0e0e0; border: 1px solid #333;"
            @click="setInput(suggestion)"
          >
            {{ suggestion }}
          </v-btn>
        </div>
      </div>

      <!-- Messages -->
      <div v-else class="messages-list d-flex flex-column gap-4">
        <div 
          v-for="(msg, index) in messages" 
          :key="index" 
          class="message-wrapper d-flex"
          :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div 
            class="message-bubble px-4 py-2 rounded-xl"
            :style="{
              backgroundColor: msg.role === 'user' ? '#2a2a2a' : 'transparent',
              border: msg.role === 'user' ? '1px solid #333' : 'none',
              maxWidth: '85%',
              color: '#e0e0e0'
            }"
          >
            <div v-if="msg.role === 'assistant' && !msg.content" class="d-flex align-center gap-2">
              <v-progress-circular indeterminate size="20" width="2" color="primary"></v-progress-circular>
              <span class="text-caption text-medium-emphasis">Đang suy nghĩ...</span>
            </div>
            <div v-else v-html="formatMessage(msg.content)"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Input Area -->
    <div class="input-section px-4 pb-4 pt-2">
      <div class="input-wrapper d-flex align-center rounded-xl px-2 py-1" style="background-color: #2a2a2a; border: 1px solid #444;">
        <!-- Add button -->
        <v-btn icon="lucide-plus" variant="text" size="small" color="#b0b0b0" class="mr-1"></v-btn>
        
        <!-- Text Input -->
        <input 
          v-model="inputText"
          type="text"
          placeholder="Nhập nội dung / để sử dụng kỹ năng"
          class="flex-grow-1 text-body-2 px-2 text-white outline-none"
          style="background: transparent; border: none; outline: none; min-width: 0;"
          @keydown.enter="sendMessage"
        />
        
        <!-- Model Selector & Send -->
        <div class="d-flex align-center">
          <!-- Dropdown model selector -->
          <v-menu location="top end">
            <template v-slot:activator="{ props }">
              <div 
                v-bind="props"
                class="model-selector d-flex align-center cursor-pointer px-2 mr-1 text-caption text-medium-emphasis"
                style="color: #b0b0b0 !important;"
              >
                {{ selectedModel.name }}
                <v-icon size="14" class="ml-1">lucide-chevron-down</v-icon>
              </div>
            </template>
            <v-list bg-color="#2a2a2a" theme="dark" density="compact" class="rounded-lg">
              <v-list-item 
                v-for="model in availableModels" 
                :key="model.value" 
                @click="selectModel(model)"
                :active="selectedModel.value === model.value"
              >
                <v-list-item-title class="text-caption">{{ model.name }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>

          <!-- Submit button (sparkles) -->
          <v-btn 
            icon="lucide-sparkles" 
            variant="flat" 
            size="small" 
            :color="inputText.trim() ? 'primary' : '#333'" 
            class="rounded-lg"
            :disabled="!inputText.trim() || isLoading"
            @click="sendMessage"
          >
          </v-btn>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const currentUser = ref('bạn');
const inputText = ref('');
const isLoading = ref(false);

const messages = ref<{role: 'user'|'assistant', content: string}[]>([]);

const suggestions = [
  'Giúp tôi suy nghĩ thấu đáo về một vấn đề',
  'Tôi có thể đặt những kiểu câu hỏi nào?',
  'Giúp tôi phân tích một khái niệm mới'
];

const availableModels = [
  { name: 'Flash', value: 'gemini-1.5-flash' },
  { name: 'Pro', value: 'gemini-1.5-pro' },
  { name: 'GPT-4o', value: 'gpt-4o' },
  { name: 'Claude 3.5', value: 'claude-3-5-sonnet' }
];

const selectedModel = ref(availableModels[0]);

const setInput = (text: string) => {
  inputText.value = text;
};

const selectModel = (model: any) => {
  selectedModel.value = model;
};

const sendMessage = async () => {
  if (!inputText.value.trim() || isLoading.value) return;
  
  const text = inputText.value;
  messages.value.push({ role: 'user', content: text });
  inputText.value = '';
  isLoading.value = true;
  
  messages.value.push({ role: 'assistant', content: '' });
  
  try {
    await new Promise(resolve => setTimeout(resolve, 1500));
    messages.value[messages.value.length - 1].content = 'Đây là phản hồi từ mô hình ' + selectedModel.value.name + ' cho câu hỏi: ' + text;
  } catch (error) {
    messages.value[messages.value.length - 1].content = 'Xin lỗi, đã có lỗi xảy ra khi kết nối tới Chatbot.';
  } finally {
    isLoading.value = false;
  }
};

const formatMessage = (text: string) => {
  return text.replace(/\\n/g, '<br>');
};
</script>

<style scoped>
.chatbot-sidebar-container {
  scrollbar-width: thin;
  scrollbar-color: #555 #1a1a1a;
}
.chatbot-sidebar-container::-webkit-scrollbar {
  width: 6px;
}
.chatbot-sidebar-container::-webkit-scrollbar-track {
  background: #1a1a1a;
}
.chatbot-sidebar-container::-webkit-scrollbar-thumb {
  background-color: #555;
  border-radius: 3px;
}
input::placeholder {
  color: #777;
}
.suggestion-btn {
  transition: background-color 0.2s;
}
.suggestion-btn:hover {
  background-color: #333 !important;
}
</style>
"""

with open("frontend/src/components/chat/ChatbotSidebar.vue", "wb") as f:
    f.write(code.strip().encode("utf-8"))

print("SUCCESS_WRITTEN")