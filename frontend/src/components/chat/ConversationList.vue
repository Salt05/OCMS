<template>
  <div class="conversation-list d-flex flex-column" style="width: 100%; border-right: 1px solid var(--v-border-color, rgba(128,128,128,0.15)); height: 100%;">
    <!-- 1. Zalo PC Top Header: Search Box + Action Icons -->
    <div class="zalo-conv-header px-3 pt-3 pb-2 d-flex align-center gap-2">
      <!-- Search Input -->
      <div class="zalo-search-box flex-grow-1 d-flex align-center px-2 py-1">
        <v-icon size="16" class="zalo-search-icon mr-1.5 text-grey">lucide-search</v-icon>
        <input
          type="text"
          :value="search"
          @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
          placeholder="Tìm kiếm"
          class="zalo-search-input flex-grow-1"
        />
        <button
          v-if="search"
          type="button"
          class="zalo-clear-btn d-flex align-center justify-center"
          @click="$emit('update:search', '')"
        >
          <v-icon size="12">lucide-x</v-icon>
        </button>
      </div>
    </div>

    <!-- 2. Zalo PC Tab Filter Row: Tất cả | Chưa đọc | Phân loại ▾ | ... -->
    <div class="zalo-conv-tabs-row d-flex align-center justify-space-between px-3 pb-2 border-b">
      <div class="d-flex align-center gap-3">
        <button
          type="button"
          class="zalo-tab-btn"
          :class="{ 'is-active': activeTab === 'all' }"
          @click="activeTab = 'all'"
        >
          Tất cả
        </button>
        <button
          type="button"
          class="zalo-tab-btn d-flex align-center gap-1"
          :class="{ 'is-active': activeTab === 'unread' }"
          @click="activeTab = 'unread'"
        >
          <span>Chưa đọc</span>
          <span v-if="unreadTotalCount > 0" class="zalo-tab-badge">{{ unreadTotalCount }}</span>
        </button>
      </div>

      <div class="d-flex align-center gap-1">
        <!-- Phân loại / Tag Filter Menu -->
        <v-menu
          v-model="filterMenuOpen"
          :close-on-content-click="false"
          location="bottom end"
          offset="8"
        >
          <template #activator="{ props: menuProps }">
            <button
              type="button"
              v-bind="menuProps"
              class="zalo-tab-btn d-flex align-center gap-1"
              :class="{ 'is-active': activeFilterCount > 0 }"
              title="Phân loại theo Tag"
            >
              <span>Phân loại</span>
              <v-icon size="14">lucide-chevron-down</v-icon>
              <span v-if="activeFilterCount > 0" class="zalo-filter-count-dot"></span>
            </button>
          </template>

          <!-- Tag Filter Popup Card -->
          <v-card class="tag-filter-card" elevation="4" width="340">
            <div class="pa-3 d-flex align-center justify-space-between border-b">
              <div class="d-flex align-center font-weight-medium text-body-2">
                <v-icon size="16" class="mr-1.5 text-primary">lucide-filter</v-icon>
                <span>Phân loại theo Tag</span>
                <span v-if="activeFilterCount > 0" class="ml-1 text-caption text-primary font-weight-bold">
                  ({{ activeFilterCount }})
                </span>
              </div>
              <div class="d-flex align-center gap-1">
                <v-btn
                  v-if="activeFilterCount > 0"
                  size="x-small"
                  variant="text"
                  color="error"
                  @click="resetTagFilter"
                >
                  Đặt lại
                </v-btn>
                <v-btn icon size="x-small" variant="text" @click="filterMenuOpen = false">
                  <v-icon size="14">lucide-x</v-icon>
                </v-btn>
              </div>
            </div>

            <!-- Tab Switch: Nhóm Tag / Tất cả Tag -->
            <div class="px-3 pt-2">
              <v-btn-toggle
                v-model="filterSubTab"
                mandatory
                density="compact"
                variant="outlined"
                color="primary"
                rounded="lg"
                class="w-100 d-flex mb-2"
              >
                <v-btn value="groups" size="small" class="flex-grow-1 font-weight-medium" style="font-size: 0.76rem;">
                  <v-icon size="14" class="mr-1">lucide-folder</v-icon>
                  Nhóm tag ({{ tagGroups.length }})
                </v-btn>
                <v-btn value="tags" size="small" class="flex-grow-1 font-weight-medium" style="font-size: 0.76rem;">
                  <v-icon size="14" class="mr-1">lucide-tags</v-icon>
                  Tất cả tag ({{ tags.length }})
                </v-btn>
              </v-btn-toggle>
            </div>

            <!-- SUB-TAB 1: NHÓM TAG -->
            <div v-if="filterSubTab === 'groups'" class="px-3 pb-3">
              <div class="d-flex align-center gap-1 mb-2">
                <v-text-field
                  v-model="groupSearchInFilter"
                  placeholder="Tìm nhóm tag..."
                  prepend-inner-icon="lucide-search"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="flex-grow-1"
                />
                <v-btn
                  color="primary"
                  size="small"
                  variant="tonal"
                  density="comfortable"
                  class="px-2 font-weight-bold"
                  title="Tạo nhóm tag mới"
                  @click="openCreateGroup()"
                >
                  <v-icon size="14" class="mr-1">lucide-plus</v-icon>
                  Tạo nhóm
                </v-btn>
              </div>

              <!-- Groups List -->
              <div class="tag-filter-list overflow-y-auto" style="max-height: 220px;">
                <div
                  v-for="group in filteredTagGroups"
                  :key="group.id"
                  class="tag-group-filter-item pa-2 rounded cursor-pointer mb-1 border"
                  :class="{ 'is-selected': selectedGroupId === group.id }"
                  @click="toggleSelectGroup(group)"
                >
                  <div class="d-flex align-center justify-space-between mb-1">
                    <div class="d-flex align-center flex-grow-1 min-w-0 mr-1">
                      <span
                        class="tag-color-indicator mr-2"
                        :style="{ backgroundColor: group.color || '#4F46E5', borderColor: group.color || '#4F46E5' }"
                      />
                      <span class="text-body-2 font-weight-bold text-truncate">
                        {{ group.name }}
                      </span>
                      <span class="text-caption text-grey ml-1.5 flex-shrink-0 font-weight-regular">
                        ({{ group.tags.length }} tag)
                      </span>
                    </div>

                    <!-- Actions: Edit / Delete -->
                    <div class="d-flex align-center gap-0.5 flex-shrink-0" @click.stop>
                      <v-icon
                        v-if="selectedGroupId === group.id"
                        size="16"
                        color="primary"
                        class="mr-1"
                      >
                        lucide-check-circle-2
                      </v-icon>
                      <v-btn
                        icon
                        size="x-small"
                        variant="text"
                        density="compact"
                        title="Chỉnh sửa nhóm"
                        @click.stop="openEditGroup(group)"
                      >
                        <v-icon size="13" color="grey-darken-1">lucide-pencil</v-icon>
                      </v-btn>
                      <v-btn
                        icon
                        size="x-small"
                        variant="text"
                        density="compact"
                        title="Xóa nhóm"
                        @click.stop="confirmDeleteGroup(group)"
                      >
                        <v-icon size="13" color="error">lucide-trash-2</v-icon>
                      </v-btn>
                    </div>
                  </div>

                  <!-- Tags Preview Chips in Group -->
                  <div class="d-flex flex-wrap gap-1 mt-1">
                    <span
                      v-for="tagName in group.tags.slice(0, 4)"
                      :key="tagName"
                      class="tag-mini-chip text-truncate"
                      :style="getTagStyle(tagName)"
                    >
                      {{ tagName }}
                    </span>
                    <span v-if="group.tags.length > 4" class="tag-mini-more text-caption text-grey">
                      +{{ group.tags.length - 4 }}
                    </span>
                  </div>
                </div>

                <div
                  v-if="filteredTagGroups.length === 0"
                  class="text-center py-4 text-caption text-grey"
                >
                  <v-icon size="24" class="mb-1 d-block mx-auto text-grey-lighten-1">lucide-folder-x</v-icon>
                  {{ groupSearchInFilter ? 'Không tìm thấy nhóm tag phù hợp' : 'Chưa có nhóm tag nào.' }}
                  <div class="mt-1">
                    <a
                      href="javascript:void(0)"
                      class="text-primary text-decoration-none font-weight-medium"
                      @click="openCreateGroup()"
                    >
                      + Tạo nhóm tag đầu tiên
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <!-- SUB-TAB 2: TẤT CẢ TAG -->
            <div v-else class="pa-3 pt-0">
              <div class="mb-2">
                <div class="text-caption font-weight-medium mb-1 text-grey-darken-1">Kiểu kết hợp:</div>
                <v-btn-toggle v-model="combineMode" mandatory density="compact" variant="outlined" color="primary" rounded="lg" class="w-100 d-flex">
                  <v-btn value="and" size="small" class="flex-grow-1" style="font-size: 0.8rem;">Và</v-btn>
                  <v-btn value="or" size="small" class="flex-grow-1" style="font-size: 0.8rem;">Hoặc</v-btn>
                </v-btn-toggle>
              </div>

              <div class="mb-2">
                <div class="text-caption font-weight-medium mb-1 text-grey-darken-1">Điều kiện lọc:</div>
                <v-btn-toggle v-model="presenceMode" mandatory density="compact" variant="outlined" color="primary" rounded="lg" class="w-100 d-flex">
                  <v-btn value="include" size="small" class="flex-grow-1" style="font-size: 0.73rem;">Có chứa tag</v-btn>
                  <v-btn value="exclude" size="small" class="flex-grow-1" style="font-size: 0.73rem;">Không chứa tag</v-btn>
                </v-btn-toggle>
              </div>

              <v-text-field
                v-model="tagSearchInFilter"
                placeholder="Tìm tag..."
                prepend-inner-icon="lucide-search"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-2"
              />

              <div class="tag-filter-list overflow-y-auto" style="max-height: 160px;">
                <div
                  v-for="t in filteredTagsInPopup"
                  :key="t.id || t.name"
                  class="tag-filter-item d-flex align-center pa-1.5 rounded cursor-pointer mb-0.5"
                  :class="{ 'is-selected': selectedFilterTags.includes(t.name) }"
                  @click="toggleFilterTag(t.name)"
                >
                  <span class="tag-color-indicator mr-2" :style="{ backgroundColor: t.color, borderColor: t.color }" />
                  <span class="text-body-2 flex-grow-1 text-truncate font-weight-medium">{{ t.name }}</span>
                  <v-icon v-if="selectedFilterTags.includes(t.name)" size="16" color="primary">lucide-check</v-icon>
                </div>
              </div>

              <!-- Shortcut to save selected tags as a group -->
              <div v-if="selectedFilterTags.length > 0" class="mt-2 pt-2 border-t">
                <v-btn
                  block
                  size="small"
                  variant="tonal"
                  color="primary"
                  prepend-icon="lucide-folder-plus"
                  @click="openCreateGroup(selectedFilterTags)"
                >
                  Lưu {{ selectedFilterTags.length }} tag này thành nhóm mới
                </v-btn>
              </div>
            </div>
          </v-card>
        </v-menu>

        <!-- More Options Menu (...) -->
        <v-menu location="bottom end" offset="8" :close-on-content-click="false">
          <template #activator="{ props: moreProps }">
            <button type="button" v-bind="moreProps" class="zalo-tab-btn px-1" title="Tùy chọn khác">
              <v-icon size="16">lucide-more-horizontal</v-icon>
            </button>
          </template>
          <v-card width="240" class="pa-1 elevation-4 rounded-lg">
            <v-list density="compact" nav class="pa-0">
              <v-list-item
                prepend-icon="lucide-check-check"
                title="Đánh dấu đã đọc tất cả"
                rounded="lg"
                @click="markAllAsRead"
              />
              <v-divider class="my-1" />
              <!-- Account filter sub item -->
              <div class="px-3 py-1">
                <div class="text-caption text-grey font-weight-medium mb-1">Lọc theo tài khoản Zalo:</div>
                <v-select
                  v-model="selectedAccountId"
                  :items="accountOptions"
                  item-title="text"
                  item-value="value"
                  label="Tất cả Zalo"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  @update:model-value="$emit('filter-account', $event)"
                />
              </div>
            </v-list>
          </v-card>
        </v-menu>
      </div>
    </div>

    <!-- Active Tag Filter Chips Bar (if filtered) -->
    <div v-if="activeFilterCount > 0" class="px-3 py-1.5 d-flex flex-wrap align-center gap-1 border-b">
      <span class="text-caption text-grey" style="font-size: 0.7rem;">
        Đang lọc ({{ presenceMode === 'include' ? 'Có' : 'Không có' }}):
      </span>

      <!-- Group badge if filtering by a group -->
      <span
        v-if="activeSelectedGroup"
        class="tag-group-chip d-inline-flex align-center"
        :style="{
          backgroundColor: `${activeSelectedGroup.color || '#4F46E5'}18`,
          color: activeSelectedGroup.color || '#4F46E5',
          border: `1px solid ${activeSelectedGroup.color || '#4F46E5'}50`,
        }"
      >
        <v-icon size="12" class="mr-1">lucide-folder</v-icon>
        <span class="font-weight-bold text-truncate" style="max-width: 110px;">{{ activeSelectedGroup.name }}</span>
        <button
          type="button"
          class="tag-chip-remove d-flex align-center justify-center ml-1"
          title="Bỏ lọc nhóm này"
          @click.stop="resetTagFilter"
        >
          <v-icon size="11">lucide-x</v-icon>
        </button>
      </span>

      <!-- Individual tag chips -->
      <span
        v-for="tagName in selectedFilterTags"
        :key="tagName"
        class="tag-chip d-inline-flex align-center"
        :style="getTagStyle(tagName)"
      >
        <span class="tag-chip-text text-truncate">{{ tagName }}</span>
        <button
          type="button"
          class="tag-chip-remove d-flex align-center justify-center"
          @click.stop="toggleFilterTag(tagName)"
        >
          <v-icon size="11">lucide-x</v-icon>
        </button>
      </span>
      <button
        type="button"
        class="text-caption text-error ml-1"
        style="background:none; border:none; cursor:pointer; font-size: 0.7rem; text-decoration: underline;"
        @click="resetTagFilter"
      >
        Xóa lọc
      </button>
    </div>

    <!-- 3. Zalo Conversation List -->
    <div class="zalo-conv-items-scroll flex-grow-1 overflow-y-auto pa-0">
      <v-progress-linear v-if="loading" indeterminate color="primary" />

      <div
        v-for="conv in displayedConversations"
        :key="conv.id"
        class="zalo-conv-item d-flex align-center px-3 py-2 cursor-pointer position-relative"
        :class="{
          'is-active': conv.id === selectedId,
          'is-unread': conv.unreadCount > 0 && conv.id !== selectedId,
          'needs-confirmation-blink': conv.currentState === 'CONFIRMATION'
        }"
        @click="$emit('select', conv.id)"
      >
        <!-- Avatar -->
        <div class="zalo-conv-avatar-wrap mr-3.5 position-relative flex-shrink-0">
          <v-avatar size="44" class="zalo-conv-avatar">
            <v-img v-if="conv.contact?.avatarUrl" :src="conv.contact.avatarUrl" />
            <v-icon v-else-if="conv.threadType === 'group'" icon="lucide-users" color="white" size="22" />
            <v-icon v-else icon="lucide-user" color="white" size="22" />
          </v-avatar>
          <span v-if="conv.threadType !== 'group'" class="zalo-conv-online-dot"></span>
        </div>

        <!-- Conversation Details -->
        <div class="zalo-conv-body flex-grow-1 overflow-hidden d-flex flex-column justify-center">
          <!-- Top Row: Name + Time -->
          <div class="d-flex align-center justify-space-between mb-1">
            <span
              class="zalo-conv-title text-truncate"
              :class="{ 'font-weight-bold': conv.unreadCount > 0 || conv.id === selectedId }"
            >
              {{ conv.threadType === 'group' ? (conv.contact?.fullName || 'Nhóm') : (conv.contact?.fullName || 'Khách hàng') }}
            </span>
            <span class="zalo-conv-time text-caption text-grey ml-2 flex-shrink-0">
              {{ formatTime(conv.lastMessageAt) }}
            </span>
          </div>

          <!-- Bottom Row: Snippet + Unread Badge -->
          <div class="d-flex align-center justify-space-between mb-0.5">
            <span
              class="zalo-conv-snippet text-truncate text-caption"
              :class="{ 'text-high-emphasis font-weight-medium': conv.unreadCount > 0, 'text-grey': conv.unreadCount === 0 }"
            >
              {{ lastMessagePreview(conv) }}
            </span>
            <span v-if="conv.unreadCount > 0" class="zalo-unread-badge ml-2 flex-shrink-0">
              {{ conv.unreadCount > 99 ? '99+' : conv.unreadCount }}
            </span>
          </div>

          <!-- Extra row: Tags (if any) -->
          <div v-if="getContactTags(conv).length > 0" class="conv-tags-row d-flex align-center flex-wrap mt-1">
            <span
              v-for="(tag, idx) in getContactTags(conv).slice(0, 3)"
              :key="idx"
              class="conv-tag-badge text-truncate"
              :style="getTagStyle(tag)"
              :title="getTagName(tag)"
            >
              {{ getTagName(tag) }}
            </span>
            <span v-if="getContactTags(conv).length > 3" class="conv-tag-more">
              +{{ getContactTags(conv).length - 3 }}
            </span>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!loading && displayedConversations.length === 0" class="text-center pa-8 text-grey">
        <div v-if="activeFilterCount > 0">
          <v-icon size="32" class="mb-2 text-grey">lucide-filter-x</v-icon>
          <div>Không tìm thấy cuộc trò chuyện phù hợp bộ lọc</div>
          <v-btn size="small" variant="text" color="primary" class="mt-2" @click="resetTagFilter">
            Xóa bộ lọc
          </v-btn>
        </div>
        <div v-else-if="activeTab === 'unread'">
          <v-icon size="32" class="mb-2 text-grey">lucide-check-circle</v-icon>
          <div>Không có tin nhắn chưa đọc</div>
        </div>
        <div v-else>
          Chưa có cuộc trò chuyện nào
        </div>
      </div>
    </div>

    <!-- Tag Group Create / Edit Dialog -->
    <TagGroupDialog
      v-model="showGroupDialog"
      :group="editingGroup"
      :initial-tags="groupInitialTags"
      @saved="onGroupSaved"
    />

    <!-- Delete Tag Group Confirmation Dialog -->
    <v-dialog v-model="showDeleteGroupConfirm" max-width="400">
      <v-card class="rounded-lg">
        <v-card-title class="pa-4 font-weight-bold text-body-1">
          Xác nhận xóa nhóm tag
        </v-card-title>
        <v-card-text class="px-4 py-2 text-body-2">
          Bạn có chắc muốn xóa nhóm tag <strong>"{{ groupToDelete?.name }}"</strong>?
          <div class="text-caption text-grey mt-1">Các tag gắn trên khách hàng sẽ không bị ảnh hưởng.</div>
        </v-card-text>
        <v-card-actions class="pa-4 d-flex justify-end gap-2">
          <v-btn variant="outlined" density="comfortable" @click="showDeleteGroupConfirm = false" :disabled="deletingGroup">
            Hủy
          </v-btn>
          <v-btn color="error" variant="flat" density="comfortable" :loading="deletingGroup" @click="handleDeleteGroup">
            Xóa nhóm
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { Conversation } from '@/composables/use-chat';
import { useTags, type TagGroup } from '@/composables/use-tags';
import TagGroupDialog from '@/components/common/TagGroupDialog.vue';
import { api } from '@/api/index';

const props = defineProps<{
  conversations: Conversation[];
  selectedId: string | null;
  loading: boolean;
  search: string;
}>();

const emit = defineEmits<{
  select: [id: string];
  'update:search': [value: string];
  'filter-account': [accountId: string | null];
}>();

const { tags, tagGroups, getTagStyle, getTagName, fetchTags, fetchTagGroups, deleteTagGroup } = useTags();

const accountOptions = ref<{ text: string; value: string }[]>([]);
const selectedAccountId = ref<string | null>(null);

const activeTab = ref<'all' | 'unread'>('all');

const unreadTotalCount = computed(() => {
  return props.conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
});

// Tag Filter State
const filterMenuOpen = ref(false);
const filterSubTab = ref<'groups' | 'tags'>('groups');
const selectedGroupId = ref<string | null>(null);
const selectedFilterTags = ref<string[]>([]);
const combineMode = ref<'and' | 'or'>('and');
const presenceMode = ref<'include' | 'exclude'>('include');
const tagSearchInFilter = ref('');
const groupSearchInFilter = ref('');

// Tag Group Dialogs
const showGroupDialog = ref(false);
const editingGroup = ref<TagGroup | null>(null);
const groupInitialTags = ref<string[]>([]);
const showDeleteGroupConfirm = ref(false);
const groupToDelete = ref<TagGroup | null>(null);
const deletingGroup = ref(false);

const activeFilterCount = computed(() => {
  if (selectedGroupId.value) return 1;
  return selectedFilterTags.value.length;
});

const activeSelectedGroup = computed(() => {
  if (!selectedGroupId.value) return null;
  return tagGroups.value.find((g) => g.id === selectedGroupId.value) || null;
});

const filteredTagGroups = computed(() => {
  const q = groupSearchInFilter.value.trim().toLowerCase();
  if (!q) return tagGroups.value;
  return tagGroups.value.filter((g) => {
    if (g.name.toLowerCase().includes(q)) return true;
    return g.tags.some((t) => t.toLowerCase().includes(q));
  });
});

const filteredTagsInPopup = computed(() => {
  const q = tagSearchInFilter.value.trim().toLowerCase();
  if (!q) return tags.value;
  return tags.value.filter((t) => t.name.toLowerCase().includes(q));
});

function toggleSelectGroup(group: TagGroup) {
  if (selectedGroupId.value === group.id) {
    selectedGroupId.value = null;
    selectedFilterTags.value = [];
  } else {
    selectedGroupId.value = group.id;
    selectedFilterTags.value = [...group.tags];
  }
}

function openCreateGroup(initialTags: string[] = []) {
  editingGroup.value = null;
  groupInitialTags.value = Array.isArray(initialTags) ? [...initialTags] : [];
  showGroupDialog.value = true;
}

function openEditGroup(group: TagGroup) {
  editingGroup.value = group;
  groupInitialTags.value = [];
  showGroupDialog.value = true;
}

function confirmDeleteGroup(group: TagGroup) {
  groupToDelete.value = group;
  showDeleteGroupConfirm.value = true;
}

async function handleDeleteGroup() {
  if (!groupToDelete.value) return;
  deletingGroup.value = true;
  try {
    await deleteTagGroup(groupToDelete.value.id);
    if (selectedGroupId.value === groupToDelete.value.id) {
      selectedGroupId.value = null;
      selectedFilterTags.value = [];
    }
    showDeleteGroupConfirm.value = false;
  } finally {
    deletingGroup.value = false;
  }
}

function onGroupSaved(savedGroup: TagGroup) {
  if (selectedGroupId.value === savedGroup.id) {
    selectedFilterTags.value = [...savedGroup.tags];
  }
}

function toggleFilterTag(tagName: string) {
  const idx = selectedFilterTags.value.findIndex((t) => t.toLowerCase() === tagName.toLowerCase());
  if (idx >= 0) {
    selectedFilterTags.value.splice(idx, 1);
  } else {
    selectedFilterTags.value.push(tagName);
  }

  if (activeSelectedGroup.value) {
    const groupTagsLower = activeSelectedGroup.value.tags.map((t) => t.toLowerCase());
    const currentTagsLower = selectedFilterTags.value.map((t) => t.toLowerCase());
    if (groupTagsLower.length !== currentTagsLower.length || !groupTagsLower.every((t) => currentTagsLower.includes(t))) {
      selectedGroupId.value = null;
    }
  }
}

function resetTagFilter() {
  selectedGroupId.value = null;
  selectedFilterTags.value = [];
  combineMode.value = 'and';
  presenceMode.value = 'include';
  tagSearchInFilter.value = '';
  groupSearchInFilter.value = '';
}

async function markAllAsRead() {
  for (const conv of props.conversations) {
    if ((conv.unreadCount || 0) > 0) {
      conv.unreadCount = 0;
      try { await api.post(`/chat/conversations/${conv.id}/read`); } catch {}
    }
  }
}

const displayedConversations = computed(() => {
  let list = props.conversations;
  if (activeTab.value === 'unread') list = list.filter((c) => (c.unreadCount || 0) > 0);

  if (selectedFilterTags.value.length > 0) {
    const filterLower = selectedFilterTags.value.map((t) => t.toLowerCase());
    list = list.filter((conv) => {
      const contactTags = getContactTags(conv).map((t) => getTagName(t).toLowerCase());
      let hasMatch = combineMode.value === 'and'
        ? filterLower.every((ft) => contactTags.includes(ft))
        : filterLower.some((ft) => contactTags.includes(ft));
      return presenceMode.value === 'include' ? hasMatch : !hasMatch;
    });
  }
  return list;
});

onMounted(async () => {
  fetchTags();
  fetchTagGroups();
  try {
    const res = await api.get('/zalo-accounts');
    const accounts = Array.isArray(res.data) ? res.data : (res.data.accounts || []);
    accountOptions.value = accounts.map((a: any) => ({ text: a.displayName || a.zaloUid, value: a.id }));
  } catch {}
});

function getContactTags(conv: Conversation): any[] {
  const tagsList = conv.contact?.tags;
  return Array.isArray(tagsList) ? tagsList.filter((t: any) => t) : [];
}

function isUndoSyncMessage(msg: any): boolean {
  if (!msg || !msg.content || !msg.content.startsWith('{')) return false;
  try {
    const p = JSON.parse(msg.content);
    if (p.globalMsgId !== undefined && p.deleteMsg !== undefined) return true;
  } catch {}
  return false;
}

function lastMessagePreview(conv: Conversation): string {
  const msg = conv.messages?.[0];
  if (!msg) return '';
  if (msg.isDeleted || isUndoSyncMessage(msg)) {
    if (msg.senderType === 'self') return 'Bạn đã thu hồi một tin nhắn';
    const contactName = conv.contact?.fullName || conv.contact?.zaloName || 'Khách hàng';
    return `${contactName} đã thu hồi một tin nhắn`;
  }

  if (msg.contentType === 'image') return 'Hình ảnh';
  if (msg.contentType === 'video') return 'Video';
  if (msg.contentType === 'sticker') return 'Nhãn dán';
  if (msg.contentType === 'voice') return 'Tin nhắn thoại';
  if (msg.contentType === 'gif') return 'GIF';

  if (msg.content?.startsWith('{')) {
    try {
      const p = JSON.parse(msg.content);
      
      // Lịch hẹn / Reminder
      if (p.action === 'msginfo.actionlist') return 'Nhắc hẹn';
      
      const paramsStr = typeof p.params === 'string' ? p.params : JSON.stringify(p.params || {});
      if (paramsStr.includes('fileExt') || paramsStr.includes('"fType":1')) {
        return 'Tệp tin đính kèm';
      }
      
      const href = p.href || p.thumb || '';
      if (href && /\.(jpg|jpeg|png|webp|gif)/i.test(href)) {
        return 'Hình ảnh';
      }
      
      if (p.title && p.href) {
        return 'Liên kết';
      }
      if (p.href) {
        return 'Liên kết';
      }
    } catch {
      // Ignore parse error
    }
  }

  return msg.content || '...';
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}
</script>

<style scoped>
.zalo-search-box { background-color: rgba(0,0,0,0.05); border-radius: 8px; height: 36px; }
.zalo-search-input { border: none; background: transparent; outline: none; font-size: 13px; }
.zalo-tab-btn { background: transparent; border: none; padding: 4px 8px; border-radius: 6px; }
.zalo-tab-btn.is-active { background: rgba(0, 104, 255, 0.1); color: #0068ff; }
.zalo-filter-count-dot { width: 6px; height: 6px; background: #0068ff; border-radius: 50%; display: inline-block; }
.tag-group-filter-item { border: 1px solid rgba(0,0,0,0.1); }
.tag-group-filter-item.is-selected { border-color: #0068ff; background: rgba(0, 104, 255, 0.05); }
.tag-group-chip { font-size: 11px; padding: 2px 6px; border-radius: 4px; }
.tag-mini-chip { font-size: 10px; padding: 2px 4px; border-radius: 4px; }
.tag-filter-item:hover { background: rgba(0,0,0,0.05); }
.tag-filter-item.is-selected { background: rgba(0, 104, 255, 0.1); }
.zalo-conv-avatar-wrap { margin-right: 14px !important; }
.conv-tags-row { gap: 4px; }
.conv-tag-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  line-height: 1.2;
  max-width: 110px;
  transition: all 0.2s ease;
}
.conv-tag-more {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  background: rgba(0, 0, 0, 0.06);
  padding: 2px 6px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
}

.needs-confirmation-blink {
  border-left: 4px solid #10B981 !important;
  animation: blink-green 2.5s infinite ease-in-out;
}

@keyframes blink-green {
  0%, 100% { background-color: rgba(16, 185, 129, 0.02); }
  50% { background-color: rgba(16, 185, 129, 0.12); }
}
</style>
