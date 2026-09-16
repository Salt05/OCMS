<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    width="880"
    max-width="95vw"
    scrollable
  >
    <v-card class="rounded-xl overflow-hidden d-flex flex-column" style="width: 880px; max-width: 95vw; height: 680px; max-height: 90vh;">
      <!-- Header -->
      <div class="px-5 py-3.5 border-b d-flex align-center justify-space-between bg-surface flex-shrink-0">
        <div class="d-flex align-center gap-2">
          <v-icon size="20" color="primary">lucide-users-round</v-icon>
          <span class="text-subtitle-1 font-weight-bold">Chọn người nhận tin nhắn hàng loạt</span>
        </div>
        <v-btn icon size="small" variant="text" @click="$emit('update:modelValue', false)">
          <v-icon size="18">lucide-x</v-icon>
        </v-btn>
      </div>

      <!-- Main Content: Left Panel (Search & List) + Right Panel (Selected Items) -->
      <div class="d-flex flex-grow-1 overflow-hidden" style="min-height: 420px;">
        <!-- LEFT PANEL -->
        <div class="d-flex flex-column flex-grow-1 border-e overflow-hidden" style="width: 58%;">
          <!-- Search input -->
          <div class="px-4 pt-3 pb-2 flex-shrink-0">
            <v-text-field
              v-model="searchQuery"
              placeholder="Tìm kiếm theo tên, SĐT, mã KH..."
              prepend-inner-icon="lucide-search"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              rounded="lg"
            />
          </div>

          <!-- Tabs: Bạn bè | Nhóm trò chuyện + Zalo account filter + Phân loại dropdown -->
          <div class="d-flex align-center justify-space-between px-3 border-b flex-shrink-0 gap-2">
            <v-tabs
              v-model="activeTab"
              density="compact"
              color="primary"
              class="bulk-picker-tabs flex-shrink-0"
            >
              <v-tab value="friends" class="text-none font-weight-medium px-2" style="font-size: 0.85rem;">
                Bạn bè
              </v-tab>
              <v-tab value="groups" class="text-none font-weight-medium px-2" style="font-size: 0.85rem;">
                Nhóm trò chuyện
              </v-tab>
            </v-tabs>

            <div class="d-flex align-center gap-1.5 flex-shrink-0">
              <!-- Zalo Account Filter -->
              <v-select
                v-if="zaloAccountOptions.length > 0"
                v-model="selectedZaloAccountId"
                :items="zaloAccountOptions"
                item-title="text"
                item-value="value"
                label="Tất cả Zalo"
                placeholder="Tất cả Zalo"
                density="compact"
                variant="outlined"
                hide-details
                clearable
                rounded="pill"
                class="zalo-account-filter-select"
                style="width: 140px; font-size: 11.5px;"
                @update:model-value="onZaloAccountChange"
              >
                <template #selection="{ item }">
                  <span class="text-truncate text-caption font-weight-medium" style="max-width: 95px;">{{ item.title }}</span>
                </template>
              </v-select>

              <!-- Dropdown Phân loại ⌵ -->
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
          </div>

          <!-- Select all toggle for current filtered list -->
          <div class="px-4 py-2 border-b bg-surface d-flex align-center justify-space-between flex-shrink-0" style="font-size: 0.8rem;">
            <div class="d-flex align-center cursor-pointer" @click="toggleSelectCurrentFiltered">
              <div
                class="custom-chk-box d-flex align-center justify-center flex-shrink-0 mr-3"
                :class="{ 'is-checked': isAllCurrentFilteredSelected }"
              >
                <v-icon v-if="isAllCurrentFilteredSelected" size="12" color="white">lucide-check</v-icon>
              </div>
              <span class="font-weight-medium text-grey-darken-2">Chọn tất cả ({{ filteredList.length }})</span>
            </div>
            <span class="text-caption text-grey">Đã tìm thấy {{ filteredList.length }} liên hệ</span>
          </div>

          <!-- Contact items scroll list -->
          <div class="flex-grow-1 overflow-y-auto px-2 py-1">
            <div v-if="loading" class="d-flex align-center justify-center py-10">
              <v-progress-circular indeterminate size="32" color="primary" />
              <span class="text-caption text-grey ml-3">Đang tải danh bạ...</span>
            </div>

            <!-- Error banner when loading fails -->
            <div v-else-if="loadError" class="pa-4 my-3 mx-2 bg-red-lighten-5 rounded-lg border border-error d-flex flex-column align-center text-center">
              <v-icon color="error" size="30" class="mb-1">lucide-alert-circle</v-icon>
              <div class="text-body-2 font-weight-bold text-error">Lỗi khi tải danh sách khách hàng</div>
              <div class="text-caption text-grey-darken-1 mb-2">{{ loadError }}</div>
              <v-btn size="small" color="error" variant="tonal" prepend-icon="lucide-rotate-cw" @click="loadData">
                Thử lại
              </v-btn>
            </div>

            <div v-else-if="filteredList.length === 0" class="text-center py-12 text-caption text-grey">
              <v-icon size="36" class="mb-2 text-grey-lighten-1">lucide-users</v-icon>
              <div>Không tìm thấy liên hệ phù hợp</div>
            </div>

            <div
              v-else
              v-for="item in filteredList"
              :key="item.id"
              class="picker-contact-item px-3 py-2 rounded-lg d-flex align-center cursor-pointer my-0.5"
              :class="{ 'is-selected': isSelected(item.id) }"
              @click="toggleSelect(item)"
            >
              <!-- Checkbox -->
              <div
                class="custom-chk-box d-flex align-center justify-center flex-shrink-0 mr-3"
                :class="{ 'is-checked': isSelected(item.id) }"
              >
                <v-icon v-if="isSelected(item.id)" size="12" color="white">lucide-check</v-icon>
              </div>

              <!-- Avatar -->
              <v-avatar size="38" class="flex-shrink-0 mr-3" :color="item.isSpecial ? 'blue-lighten-4' : 'primary'">
                <v-icon v-if="item.isSpecial" icon="lucide-folder" color="primary" size="20" />
                <v-img v-else-if="item.avatarUrl" :src="item.avatarUrl">
                  <template #error>
                    <span class="text-white font-weight-bold text-caption">{{ (item.name || 'U').charAt(0).toUpperCase() }}</span>
                  </template>
                </v-img>
                <v-icon v-else-if="item.isGroup" icon="lucide-users" color="white" size="18" />
                <span v-else class="text-white font-weight-bold text-caption">{{ (item.name || 'U').charAt(0).toUpperCase() }}</span>
              </v-avatar>

              <!-- Name & Zalo Account badge -->
              <div class="overflow-hidden flex-grow-1 min-w-0 mr-1">
                <span class="text-body-2 font-weight-medium text-truncate d-block" style="font-size: 13.5px; line-height: 1.3;">
                  {{ item.name }}
                </span>
                <span v-if="item.zaloAccountName" class="text-caption text-primary font-weight-medium d-block text-truncate" style="font-size: 11px; line-height: 1.1;">
                  {{ item.zaloAccountName }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT PANEL (Selected list: STRICTLY Name + Avatar + Remove button) -->
        <div class="d-flex flex-column overflow-hidden bg-surface" style="width: 42%;">
          <!-- Top summary: Đã chọn: X / Y + Xóa tất cả -->
          <div class="px-4 py-3.5 border-b d-flex align-center justify-space-between flex-shrink-0">
            <span class="text-body-2 font-weight-bold">
              Đã chọn: <span class="text-primary">{{ selectedMap.size }}</span>
            </span>
            <button
              type="button"
              class="text-caption text-primary font-weight-bold cursor-pointer border-0 bg-transparent"
              :disabled="selectedMap.size === 0"
              @click="clearSelected"
            >
              Xóa tất cả
            </button>
          </div>

          <!-- List of selected contacts with (X) remove icon -->
          <div class="flex-grow-1 overflow-y-auto px-3 py-2">
            <div v-if="selectedMap.size === 0" class="text-center py-16 text-caption text-grey">
              <v-icon size="32" class="mb-2 text-grey-lighten-2">lucide-user-check</v-icon>
              <div>Chưa có liên hệ nào được chọn</div>
              <div class="text-disabled" style="font-size: 11px;">Chọn từ danh sách bên trái</div>
            </div>

            <div
              v-else
              v-for="item in Array.from(selectedMap.values())"
              :key="item.id"
              class="selected-item-row px-2.5 py-2 rounded-lg d-flex align-center justify-space-between gap-2.5 my-1 border"
            >
              <div class="d-flex align-center gap-2.5 overflow-hidden min-w-0 flex-grow-1">
                <v-avatar size="32" class="flex-shrink-0 mr-3" :color="item.isSpecial ? 'blue-lighten-4' : 'primary'">
                  <v-icon v-if="item.isSpecial" icon="lucide-folder" color="primary" size="16" />
                  <v-img v-else-if="item.avatarUrl" :src="item.avatarUrl">
                    <template #error>
                      <span class="text-white font-weight-bold text-caption" style="font-size: 11px;">{{ (item.name || 'U').charAt(0).toUpperCase() }}</span>
                    </template>
                  </v-img>
                  <v-icon v-else-if="item.isGroup" icon="lucide-users" color="white" size="14" />
                  <span v-else class="text-white font-weight-bold text-caption" style="font-size: 11px;">{{ (item.name || 'U').charAt(0).toUpperCase() }}</span>
                </v-avatar>
                <!-- Name ONLY -->
                <div class="overflow-hidden min-w-0 flex-grow-1">
                  <div class="text-body-2 font-weight-medium text-truncate" style="font-size: 13px;">{{ item.name }}</div>
                </div>
              </div>

              <v-btn
                icon
                size="x-small"
                variant="text"
                color="medium-emphasis"
                class="flex-shrink-0"
                @click="unselect(item.id)"
                title="Bỏ chọn"
              >
                <v-icon size="14">lucide-x</v-icon>
              </v-btn>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Buttons: Hủy + Thêm vào danh sách -->
      <div class="px-5 py-3 border-t bg-surface d-flex align-center justify-end gap-2.5 flex-shrink-0">
        <v-btn
          variant="tonal"
          density="comfortable"
          class="text-none font-weight-medium rounded-lg px-4"
          @click="$emit('update:modelValue', false)"
        >
          Hủy
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          density="comfortable"
          class="text-none font-weight-bold rounded-lg px-5"
          :disabled="selectedMap.size === 0"
          @click="confirmSelection"
        >
          Thêm vào danh sách ({{ selectedMap.size }})
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { api } from '@/api/index';
import { useTags } from '@/composables/use-tags';

interface PickerContactItem {
  id: string;
  contactId?: string;
  conversationId?: string | null;
  name: string;
  phone?: string | null;
  customerId?: string | null;
  avatarUrl?: string | null;
  isGroup?: boolean;
  isSpecial?: boolean;
  tags?: string[];
  lastMessageAt?: string | null;
  zaloUid?: string | null;
  zaloAccountId?: string | null;
  zaloAccountName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const props = defineProps<{
  modelValue: boolean;
  existingContacts?: any[];
  existingIds?: string[];
  initialAccountId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'selected', contacts: PickerContactItem[]): void;
  (e: 'confirm', contacts: PickerContactItem[]): void;
}>();

const { tags: systemTags } = useTags();

const loading = ref(false);
const loadError = ref<string | null>(null);
const searchQuery = ref('');
const activeTab = ref<'friends' | 'groups'>('friends');
const tagMenuOpen = ref(false);
const selectedTags = ref<string[]>([]);
const zaloAccountOptions = ref<{ text: string; value: string; title: string }[]>([]);
const selectedZaloAccountId = ref<string | null>(props.initialAccountId || null);

async function fetchZaloAccounts() {
  try {
    const res = await api.get('/zalo-accounts');
    const accs = Array.isArray(res.data) ? res.data : (res.data?.accounts || []);
    zaloAccountOptions.value = accs.map((a: any) => {
      const name = a.displayName || a.phone || a.zaloUid || 'Tài khoản Zalo';
      return {
        text: name,
        title: name,
        value: a.id,
      };
    });
  } catch (err) {
    console.warn('Failed to fetch zalo accounts for picker:', err);
  }
}

function onZaloAccountChange() {
  loadData();
}

// Full pool of contacts and conversations
const contactsList = ref<PickerContactItem[]>([]);
const conversationsList = ref<PickerContactItem[]>([]);

// Selected items map (id -> item)
const selectedMap = ref<Map<string, PickerContactItem>>(new Map());

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

// Preset colors and tags matching Image 3 & 4
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

// Filtered list based on active tab, search query, tag filter, and Zalo account
const filteredList = computed(() => {
  let list: PickerContactItem[] = [];

  if (activeTab.value === 'groups') {
    list = conversationsList.value.filter((c) => c.isGroup);
  } else {
    // 'friends': CRM contacts or non-group conversations
    list = contactsList.value.length > 0
      ? contactsList.value
      : conversationsList.value.filter((c) => !c.isGroup);
  }

  // Filter by selected Zalo account (if selected)
  if (selectedZaloAccountId.value) {
    list = list.filter((item) => {
      if (!item.zaloAccountId) return true;
      return item.zaloAccountId === selectedZaloAccountId.value;
    });
  }

  // Filter by search text
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(q);
      const phoneMatch = item.phone ? item.phone.toLowerCase().includes(q) : false;
      const codeMatch = item.customerId ? item.customerId.toLowerCase().includes(q) : false;
      return nameMatch || phoneMatch || codeMatch;
    });
  }

  // Filter by selected tags from dropdown
  if (selectedTags.value.length > 0) {
    list = list.filter((item) => {
      const itemTags = (item.tags || []).map((t: any) =>
        (typeof t === 'string' ? t : t?.name || '').toLowerCase()
      );
      return selectedTags.value.some((sel) => itemTags.includes(sel.toLowerCase()));
    });
  }

  return list;
});

const isAllCurrentFilteredSelected = computed(() => {
  if (filteredList.value.length === 0) return false;
  return filteredList.value.every((item) => selectedMap.value.has(item.id));
});

function isSelected(id: string) {
  return selectedMap.value.has(id);
}

function toggleSelect(item: PickerContactItem) {
  if (selectedMap.value.has(item.id)) {
    selectedMap.value.delete(item.id);
  } else {
    selectedMap.value.set(item.id, item);
  }
  selectedMap.value = new Map(selectedMap.value);
}

function unselect(id: string) {
  selectedMap.value.delete(id);
  selectedMap.value = new Map(selectedMap.value);
}

function clearSelected() {
  selectedMap.value.clear();
  selectedMap.value = new Map();
}

function toggleSelectCurrentFiltered() {
  if (isAllCurrentFilteredSelected.value) {
    for (const item of filteredList.value) {
      selectedMap.value.delete(item.id);
    }
  } else {
    for (const item of filteredList.value) {
      selectedMap.value.set(item.id, item);
    }
  }
  selectedMap.value = new Map(selectedMap.value);
}

function confirmSelection() {
  const list = Array.from(selectedMap.value.values());
  emit('selected', list);
  emit('confirm', list);
  emit('update:modelValue', false);
}

async function loadData() {
  loading.value = true;
  loadError.value = null;
  try {
    const convParams: any = { limit: 0 };
    const contactParams: any = { limit: 0 };
    if (selectedZaloAccountId.value) {
      convParams.accountId = selectedZaloAccountId.value;
      contactParams.zaloAccountId = selectedZaloAccountId.value;
    }

    const [convRes, contactsRes] = await Promise.allSettled([
      api.get('/conversations', { params: convParams }),
      api.get('/contacts', { params: contactParams }),
    ]);

    // Parse conversations
    if (convRes.status === 'fulfilled' && convRes.value.data?.conversations) {
      conversationsList.value = convRes.value.data.conversations.map((c: any) => {
        const isSpecial = c.contact?.fullName === 'My Documents' || c.contact?.zaloName === 'My Documents';
        return {
          id: c.contact?.id || c.id,
          contactId: c.contact?.id,
          conversationId: c.id,
          name: c.contact?.fullName || c.contact?.zaloName || (c.threadType === 'group' ? 'Nhóm Zalo' : 'Khách hàng'),
          phone: c.contact?.phone || null,
          customerId: c.contact?.customerId || null,
          avatarUrl: c.contact?.avatarUrl || null,
          isGroup: c.threadType === 'group',
          isSpecial,
          tags: Array.isArray(c.contact?.tags) ? c.contact.tags : [],
          lastMessageAt: c.lastMessageAt,
          zaloUid: c.contact?.zaloUid || null,
          zaloAccountId: c.zaloAccountId || c.zaloAccount?.id || null,
          zaloAccountName: c.zaloAccount?.displayName || null,
          createdAt: c.contact?.createdAt || null,
          updatedAt: c.contact?.updatedAt || null,
        };
      });
    }

    // Parse CRM contacts
    if (contactsRes.status === 'fulfilled' && contactsRes.value.data?.contacts) {
      contactsList.value = contactsRes.value.data.contacts.map((ct: any) => {
        const firstConv = ct.conversations?.[0];
        return {
          id: ct.id,
          contactId: ct.id,
          conversationId: firstConv?.id || null,
          name: ct.fullName || ct.zaloName || 'Khách hàng',
          phone: ct.phone || null,
          customerId: ct.customerId || null,
          avatarUrl: ct.avatarUrl || null,
          isGroup: false,
          tags: Array.isArray(ct.tags) ? ct.tags : [],
          zaloUid: ct.zaloUid || null,
          zaloAccountId: firstConv?.zaloAccountId || firstConv?.zaloAccount?.id || null,
          zaloAccountName: firstConv?.zaloAccount?.displayName || null,
          createdAt: ct.createdAt || null,
          updatedAt: ct.updatedAt || null,
        };
      });
    }

    if (convRes.status === 'rejected' && contactsRes.status === 'rejected') {
      const msg = (convRes.reason as any)?.response?.data?.error || (convRes.reason as any)?.message || 'Không thể kết nối đến máy chủ';
      loadError.value = msg;
    }
  } catch (err: any) {
    console.error('Failed to load contacts for picker:', err);
    loadError.value = err.response?.data?.error || err.message || 'Lỗi khi tải danh sách khách hàng';
  } finally {
    loading.value = false;
  }
}

function initSelectedFromExisting() {
  selectedMap.value.clear();
  const existing = props.existingContacts || [];
  for (const c of existing) {
    const id = String(c.id || c.contactId);
    selectedMap.value.set(id, {
      id,
      contactId: id,
      conversationId: c.conversationId || null,
      name: c.name || c.fullName || c.zaloName || 'Khách hàng',
      phone: c.phone || null,
      customerId: c.customerId || null,
      avatarUrl: c.avatarUrl || null,
      isGroup: Boolean(c.isGroup || c.threadType === 'group'),
      isSpecial: Boolean(c.isSpecial),
      tags: Array.isArray(c.tags) ? c.tags : [],
      zaloUid: c.zaloUid || null,
      zaloAccountId: c.zaloAccountId || null,
      zaloAccountName: c.zaloAccountName || null,
      createdAt: c.createdAt || null,
      updatedAt: c.updatedAt || null,
    });
  }
  selectedMap.value = new Map(selectedMap.value);
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      if (props.initialAccountId !== undefined) {
        selectedZaloAccountId.value = props.initialAccountId;
      }
      initSelectedFromExisting();
      fetchZaloAccounts();
      loadData();
    }
  }
);

watch(
  () => props.initialAccountId,
  (newAcc) => {
    if (newAcc !== undefined) {
      selectedZaloAccountId.value = newAcc;
      if (props.modelValue) {
        loadData();
      }
    }
  }
);

onMounted(() => {
  fetchZaloAccounts();
  if (props.modelValue) {
    if (props.initialAccountId !== undefined) {
      selectedZaloAccountId.value = props.initialAccountId;
    }
    initSelectedFromExisting();
    loadData();
  }
});
</script>

<style scoped>
.tag-filter-row {
  transition: all 0.15s ease;
}
.tag-filter-row:hover:not([style*="background-color"]) {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
}

.custom-chk-box {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.35);
  background-color: transparent;
  transition: all 0.15s ease;
}
.custom-chk-box.is-checked {
  background-color: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
}

.tag-chk-box {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.3);
  background-color: transparent;
  transition: all 0.15s ease;
}
.tag-chk-box.is-checked {
  background-color: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
}

.hover-tag-item {
  transition: background-color 0.15s ease;
}
.hover-tag-item:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
}

.picker-contact-item {
  transition: background-color 0.15s ease-in-out;
}
.picker-contact-item:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}
.picker-contact-item.is-selected {
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.selected-item-row {
  background-color: rgba(var(--v-theme-on-surface), 0.02);
  transition: background-color 0.15s ease;
}
.selected-item-row:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.05);
}
</style>
