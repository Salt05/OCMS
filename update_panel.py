import re

file_path = 'frontend/src/components/chat/ChatContactPanel.vue'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

header_replacement = '''<div class="px-4 py-3 d-flex align-center justify-space-between border-b zalo-info-header flex-shrink-0">
      <div class="d-flex align-center">
        <button
          type="button"
          class="font-weight-bold text-subtitle-1 cursor-pointer"
          :class="{ 'text-primary': currentTab === 'info', 'text-medium-emphasis': currentTab !== 'info' }"
          @click="currentTab = 'info'"
        >
          {{ isGroup ? 'Thông tin nhóm' : 'Thông tin hội thoại' }}
        </button>
        <div class="mx-3" style="width: 3px; height: 18px; background-color: var(--v-border-color, #e0e0e0); border-radius: 2px;"></div>
        <button
          type="button"
          class="font-weight-bold text-subtitle-1 cursor-pointer"
          :class="{ 'text-primary': currentTab === 'chatbot', 'text-medium-emphasis': currentTab !== 'chatbot' }"
          @click="currentTab = 'chatbot'"
        >
          chatbot
        </button>
      </div>
      <button type="button" class="zalo-close-btn d-flex align-center justify-center" @click="('close')">
        <v-icon size="18">lucide-x</v-icon>
      </button>
    </div>

    <!-- Main Content Area -->
    <div v-show="currentTab === 'info'" class="d-flex flex-column flex-grow-1" style="overflow-y: hidden;">
      <!-- 2. Profile Summary Card -->'''

content = re.sub(r'<!-- 1\. Header -->[\s\S]*?<!-- 2\. Profile Summary Card -->', header_replacement, content)

footer_replacement = '''    </div>

    <!-- Chatbot Area -->
    <div v-if="currentTab === 'chatbot'" class="d-flex flex-column flex-grow-1" style="overflow-y: hidden; background-color: #1a1a1a;">
      <ChatbotSidebar />
    </div>
  </div>
</template>'''

content = re.sub(r'    </div>\s*</div>\s*</template>', footer_replacement, content)

content = content.replace("import { ref, computed, watch, onMounted } from 'vue';", "import { ref, computed, watch, onMounted } from 'vue';\nimport ChatbotSidebar from './ChatbotSidebar.vue';")
content = content.replace("const isGroup = computed", "const currentTab = ref('info');\n\nconst isGroup = computed")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
