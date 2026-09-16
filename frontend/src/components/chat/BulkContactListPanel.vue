<template>
  <div class="bulk-contact-panel d-flex flex-column h-100 bg-surface border-s overflow-hidden">
    <!-- Mobile header with Close button only (desktop does not show full profile header) -->
    <div class="d-md-none d-flex align-center justify-space-between px-3 py-2 border-b bg-surface flex-shrink-0">
      <span class="text-subtitle-2 font-weight-bold">Danh sách người nhận</span>
      <v-btn icon size="small" variant="text" @click="$emit('close')">
        <v-icon size="18">lucide-x</v-icon>
      </v-btn>
    </div>

    <!-- ─────────────────────────────────────────────────────────────
         1. TABS & PHÂN LOẠI DROPDOWN
         ───────────────────────────────────────────────────────────── -->
    <div class="d-flex align-center justify-space-between border-b px-2 flex-shrink-0 bg-surface">
      <v-tabs v-model="filterTab" color="primary" density="compact" class="bulk-nav-tabs">
        <v-tab value="friends" class="text-caption font-weight-bold">Bạn bè</v-tab>
        <v-tab value="groups" class="text-caption font-weight-bold">Nhóm trò chuyện</v-tab>
      </v-tabs>

      <!-- Dropdown button: "Phân loại ⌵" with solid tag color when selected (Image 3) -->
      <v-menu v-model="tagMenuOpen" :close-on-content-click="false" location="bottom end" offset="6">
        <template #activator="{ props: tagProps }">
          <v-btn
            v-bind="tagProps"
            variant="tonal"
            size="small"
            rounded="pill"
            :color="selectedTags.length > 0 ? 'primary' : undefined"
            class="text-none font-weight-medium px-2.5 mr-1"
            style="height: 28px;"
          >
            Phân loại
            <v-icon end size="14">lucide-chevron-down</v-icon>
          </v-btn>
        </template>
        
        <v-card width="300" class="pa-2.5 rounded-xl elevation-6 border">
          <div class="d-flex align-center justify-space-between px-2 py-1.5 mb-2 border-b">
            <span class="text-subtitle-2 font-weight-bold text-grey-darken-3">Lọc theo thẻ tag</span>
            <v-btn
              v-if="selectedTags.length > 0"
              variant="text"
              size="small"
              color="primary"
              class="text-none font-weight-bold px-1"
              @click="selectedTags = []"
            >
              Bỏ lọc ({{ selectedTags.length }})
            </v-btn>
          </div>
          <div class="d-flex flex-column gap-1.5" style="max-height: 320px; overflow-y: auto;">
            <div
              v-for="tag in availableTagOptions"
              :key="tag.name"
              class="d-flex align-center justify-space-between px-3 py-2 cursor-pointer rounded-lg select-none transition-all tag-filter-row"
              :style="selectedTags.includes(tag.name) ? {
                backgroundColor: tag.color,
                color: isLightColor(tag.color) ? '#111827' : '#ffffff'
              } : {}"
              @click="toggleTagFilter(tag.name)"
            >
              <div class="d-flex align-center gap-2.5 overflow-hidden min-w-0 flex-grow-1">
                <span
                  class="tag-color-box flex-shrink-0"
                  :style="{
                    backgroundColor: selectedTags.includes(tag.name) ? (isLightColor(tag.color) ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)') : tag.color,
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px'
                  }"
                />
                <span class="text-body-2 font-weight-medium text-truncate" style="font-size: 14px;">
                  {{ tag.name }}
                </span>
              </div>
              <v-icon
                v-if="selectedTags.includes(tag.name)"
                size="18"
                :color="isLightColor(tag.color) ? '#111827' : '#ffffff'"
                class="flex-shrink-0 ml-2"
              >
                lucide-check
              </v-icon>
            </div>
          </div>
        </v-card>
      </v-menu>
    </div>

    <!-- ─────────────────────────────────────────────────────────────
         2. SEARCH BAR
         ───────────────────────────────────────────────────────────── -->
    <div class="px-3 py-2 border-b flex-shrink-0">
      <v-text-field
        v-model="searchQuery"
        placeholder="Tìm kiếm..."
        prepend-inner-icon="lucide-search"
        variant="outlined"
        density="compact"
        hide-details
        clearable
        rounded="lg"
      />
    </div>

    <!-- ─────────────────────────────────────────────────────────────
         4. SELECTION & ACTION CONTROLS (Prompt 1 requirement)
         ───────────────────────────────────────────────────────────── -->
    <div class="px-3 py-1.5 border-b d-flex align-center justify-space-between bg-surface-variant-subtle flex-shrink-0 text-caption">
      <div class="d-flex align-center cursor-pointer select-none" @click="handleToggleSelectAll">
        <div
          class="custom-chk-box flex-shrink-0 mr-2.5 d-flex align-center justify-center"
          :class="{ 'is-checked': allSelected }"
        >
          <v-icon v-if="allSelected" size="12" color="white">lucide-check</v-icon>
        </div>
        <span class="font-weight-medium">Chọn tất cả</span>
      </div>

      <div class="d-flex align-center gap-1.5">
        <span class="text-grey font-weight-medium mr-1">{{ activeCount }}/{{ totalCount }} liên hệ</span>
        <v-btn
          size="x-small"
          variant="tonal"
          color="primary"
          class="font-weight-bold text-none px-2 rounded-md"
          @click="showPicker = true"
        >
          + Thêm
        </v-btn>
        <v-btn
          size="x-small"
          variant="tonal"
          color="error"
          class="font-weight-bold text-none px-2 rounded-md"
          :disabled="selectedCount === 0"
          @click="handleRemoveSelected"
        >
          Xóa
        </v-btn>
        <v-btn
          size="x-small"
          variant="text"
          icon
          color="medium-emphasis"
          @click="$emit('close')"
          title="Đóng sidebar"
        >
          <v-icon size="16">lucide-x</v-icon>
        </v-btn>
      </div>
    </div>

    <!-- ─────────────────────────────────────────────────────────────
         5. CONTACT LIST ITEMS WITH CHECKBOXES (Image 4 Bottom)
         ───────────────────────────────────────────────────────────── -->
    <div class="flex-grow-1 overflow-y-auto custom-scrollbar" style="min-height: 0;">
      <div v-if="filteredItems.length === 0" class="text-center py-12 text-grey text-caption">
        <v-icon icon="lucide-users" size="36" class="opacity-40 mb-2" />
        <div>Không tìm thấy liên hệ phù hợp</div>
        <v-btn size="small" variant="tonal" color="primary" class="text-none font-weight-bold mt-2" @click="showPicker = true">
          Thêm liên hệ vào danh sách
        </v-btn>
      </div>

      <div
        v-for="item in filteredItems"
        :key="item.id"
        class="contact-item-row d-flex align-center px-3 py-2 cursor-pointer transition-colors"
        :class="{
          'is-active-contact': activeContactId === item.id,
          'is-disabled-contact': item.disabled
        }"
        @click="setActiveContact(item)"
      >
        <!-- Checkbox for deletion selection -->
        <div
          class="custom-chk-box flex-shrink-0 mr-3 d-flex align-center justify-center"
          :class="{ 'is-checked': item.selected }"
          @click.stop="toggleSelectRecipient(item.id)"
        >
          <v-icon v-if="item.selected" size="12" color="white">lucide-check</v-icon>
        </div>

        <!-- Avatar -->
        <v-avatar size="38" class="mr-3 flex-shrink-0" :color="item.isSpecial ? 'blue-lighten-4' : 'primary'">
          <v-icon v-if="item.isSpecial" icon="lucide-folder" color="primary" size="20" />
          <v-img v-else-if="item.avatarUrl" :src="item.avatarUrl">
            <template #error>
              <span class="text-white font-weight-bold text-caption">{{ (item.name || 'U').charAt(0).toUpperCase() }}</span>
            </template>
          </v-img>
          <v-icon v-else-if="item.isGroup" icon="lucide-users" color="white" size="18" />
          <span v-else class="text-white font-weight-bold text-caption">{{ (item.name || 'U').charAt(0).toUpperCase() }}</span>
        </v-avatar>

        <!-- Name (Avt + Name only, perfectly straight & vertically centered) -->
        <div class="overflow-hidden flex-grow-1 min-w-0 mr-2">
          <div
            class="text-body-2 font-weight-medium text-truncate text-high-emphasis"
            :class="{ 'text-grey-darken-1 line-through': item.disabled }"
          >
            {{ item.name }}
          </div>
          <div v-if="item.disabled" class="text-caption text-warning font-weight-medium" style="font-size: 10.5px; line-height: 1.2;">
            Vô hiệu hóa (không gửi tin)
          </div>
          <div
            v-else-if="getRecipientLastError(item.id)"
            class="text-caption text-error font-weight-medium d-flex align-center gap-1 mt-0.5"
            style="font-size: 11px; line-height: 1.2;"
            :title="getRecipientLastError(item.id)!"
          >
            <v-icon size="12" color="error">lucide-alert-triangle</v-icon>
            <span class="text-truncate">{{ getRecipientLastError(item.id) }}</span>
          </div>
          <div
            v-else-if="!item.phone && !item.zaloUid && !item.isGroup"
            class="text-caption text-warning font-weight-medium d-flex align-center gap-1 mt-0.5"
            style="font-size: 10.5px; line-height: 1.2;"
            title="Thiếu số điện thoại và UID Zalo"
          >
            <v-icon size="11" color="warning">lucide-info</v-icon>
            <span>Thiếu SĐT / Zalo UID</span>
          </div>
        </div>

        <!-- Row Hover Actions: Disable Toggle & Remove -->
        <div class="row-hover-actions d-flex align-center gap-0.5">
          <v-btn
            icon
            size="x-small"
            variant="text"
            :color="item.disabled ? 'warning' : 'grey'"
            :title="item.disabled ? 'Kích hoạt lại (sẽ nhận tin)' : 'Vô hiệu hóa (không gửi cho người này)'"
            @click.stop="toggleDisableRecipient(item.id)"
          >
            <v-icon size="15">{{ item.disabled ? 'lucide-eye-off' : 'lucide-eye' }}</v-icon>
          </v-btn>
          <v-btn
            icon
            size="x-small"
            variant="text"
            color="error"
            title="Xóa khỏi danh sách"
            @click.stop="removeRecipient(item.id)"
          >
            <v-icon size="15">lucide-trash-2</v-icon>
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Picker Dialog to add more contacts if needed -->
    <BulkContactPickerDialog
      v-model="showPicker"
      :existing-contacts="recipients"
      :initial-account-id="props.accountId"
      @confirm="onAddContactsFromPicker"
      @selected="onAddContactsFromPicker"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useBulkMessages } from '@/composables/use-bulk-messages';
import { useTags } from '@/composables/use-tags';
import BulkContactPickerDialog from '@/components/chat/BulkContactPickerDialog.vue';

const props = defineProps<{
  accountId?: string | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const {
  recipients,
  messages,
  activeCount,
  selectedCount,
  totalCount,
  allSelected,
  syncRecipients,
  toggleSelectRecipient,
  selectAll,
  deselectAll,
  toggleDisableRecipient,
  removeRecipient,
  loadSession
} = useBulkMessages();

const { tags: systemTags } = useTags();

const showPicker = ref(false);
const searchQuery = ref('');
const filterTab = ref<'friends' | 'groups'>('friends');
const tagMenuOpen = ref(false);
const selectedTags = ref<string[]>([]);
const activeContactId = ref<string | null>(null);

function isLightColor(hex?: string | null): boolean {
  if (!hex || !hex.startsWith('#')) return false;
  const c = hex.substring(1);
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const rgb = parseInt(full, 16);
  if (isNaN(rgb)) return false;
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 180;
}

// Preset colors and tags as seen in Image 3 & 4
const availableTagOptions = computed(() => {
  const defaults = [
    { name: 'Gia đình', color: '#e91e63' },
    { name: 'Khách hàng', color: '#e53935' },
    { name: 'Công việc', color: '#fb8c00' },
    { name: 'Bạn bè', color: '#fbc02d' },
    { name: 'Trả lời sau', color: '#4caf50' },
    { name: 'Đồng nghiệp', color: '#1e88e5' },
  ];
  if (Array.isArray(systemTags.value)) {
    for (const t of systemTags.value) {
      if (!defaults.some((d) => d.name.toLowerCase() === t.name.toLowerCase())) {
        defaults.push({ name: t.name, color: t.color || '#9e9e9e' });
      }
    }
  }
  return defaults;
});

function toggleTagFilter(tagName: string) {
  const idx = selectedTags.value.indexOf(tagName);
  if (idx >= 0) {
    selectedTags.value.splice(idx, 1);
  } else {
    selectedTags.value.push(tagName);
  }
}

function setActiveContact(item: any) {
  activeContactId.value = item.id;
}

// Filter recipients by Tab, Search query, and Tags
const filteredItems = computed(() => {
  let list = recipients.value.map((r) => {
    const isGroup = (r as any).threadType === 'group' || (r as any).isGroup || false;
    const isSpecial = r.name === 'My Documents' || r.name.toLowerCase().includes('document');
    return {
      ...r,
      isGroup,
      isSpecial
    };
  });

  // Filter by Tab
  if (filterTab.value === 'groups') {
    list = list.filter((item) => item.isGroup);
  } else if (filterTab.value === 'friends') {
    list = list.filter((item) => !item.isGroup);
  }

  // Filter by Search Query
  const q = searchQuery.value?.trim().toLowerCase();
  if (q) {
    list = list.filter((item) => {
      const nameMatch = item.name?.toLowerCase().includes(q);
      const phoneMatch = item.phone?.toLowerCase().includes(q);
      const codeMatch = item.customerId?.toLowerCase().includes(q);
      return nameMatch || phoneMatch || codeMatch;
    });
  }

  // Filter by Selected Tags
  if (selectedTags.value.length > 0) {
    list = list.filter((item) => {
      const itemTags = (item.tags || []).map((t: any) =>
        (typeof t === 'string' ? t : t?.name || '').toLowerCase()
      );
      return selectedTags.value.some((sel) => itemTags.includes(sel.toLowerCase()));
    });
  }

  // Sort: Prioritize disabled contacts at the very top (những người bị vô hiệu hóa sẽ ưu tiên hiển thị trên cùng)
  list.sort((a, b) => {
    if (a.disabled && !b.disabled) return -1;
    if (!a.disabled && b.disabled) return 1;
    return 0;
  });

  return list;
});

function handleToggleSelectAll() {
  if (allSelected.value) {
    deselectAll();
  } else {
    selectAll();
  }
}

function handleRemoveSelected() {
  const toRemove = recipients.value.filter((r) => r.selected).map((r) => r.id);
  for (const id of toRemove) {
    removeRecipient(id);
  }
}

function onAddContactsFromPicker(selectedContacts: any[]) {
  syncRecipients(selectedContacts);
  if (selectedContacts.length > 0 && (!activeContactId.value || !selectedContacts.some(c => c.id === activeContactId.value))) {
    activeContactId.value = selectedContacts[0].id;
  }
}

function getRecipientLastError(recipientId: string): string | null {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const stats = messages.value[i].sendStats;
    if (stats?.recipientResults) {
      const res = stats.recipientResults.find((r) => r.recipientId === recipientId);
      if (res && res.status === 'failed') {
        return res.error || 'Gửi thất bại';
      }
    }
  }
  return null;
}

// Initial load: load stored session (strictly without auto-picking any contacts)
onMounted(async () => {
  await loadSession(false, props.accountId);
  if (!activeContactId.value && recipients.value.length > 0) {
    activeContactId.value = recipients.value[0].id;
  }
});
</script>

<style scoped>
.bulk-contact-panel {
  width: 100%;
  height: 100%;
  background-color: rgb(var(--v-theme-surface));
}

.profile-summary-card {
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.tag-filter-row {
  transition: all 0.15s ease;
}
.tag-filter-row:hover:not([style*="background-color"]) {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
}

.hover-tag-item {
  transition: background-color 0.15s ease;
}
.hover-tag-item:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
}

.contact-item-row {
  transition: background-color 0.15s ease;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.04);
}
.contact-item-row:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}
.contact-item-row.is-active-contact {
  background-color: rgba(var(--v-theme-primary), 0.08) !important;
}
.contact-item-row.is-disabled-contact {
  opacity: 0.65;
}

.row-hover-actions {
  opacity: 0.4;
  transition: opacity 0.15s ease;
}
.contact-item-row:hover .row-hover-actions {
  opacity: 1;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 4px;
}

.custom-chk-box {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.35);
  background-color: transparent;
  transition: all 0.15s ease;
  user-select: none;
  cursor: pointer;
}
.custom-chk-box.is-checked {
  background-color: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
}
.custom-chk-box.is-disabled {
  background-color: rgba(var(--v-theme-on-surface), 0.12);
  border-color: rgba(var(--v-theme-on-surface), 0.25);
  cursor: not-allowed;
}

.tag-chk-box {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.35);
  background-color: transparent;
  transition: all 0.15s ease;
  user-select: none;
}
.tag-chk-box.is-checked {
  background-color: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
}
</style>
