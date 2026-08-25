<template>
  <v-dialog v-model="dialogModel" max-width="720" persistent>
    <v-card class="tag-group-dialog-card rounded-lg">
      <v-card-title class="d-flex align-center justify-space-between px-4 py-3 border-b">
        <div class="d-flex align-center font-weight-bold text-body-1">
          <v-icon size="18" class="mr-2 text-primary">
            {{ isEditing ? 'lucide-pencil' : 'lucide-folder-plus' }}
          </v-icon>
          <span>{{ isEditing ? 'Chỉnh sửa nhóm tag' : 'Tạo nhóm tag mới' }}</span>
        </div>
        <v-btn icon size="x-small" variant="text" @click="close">
          <v-icon size="16">lucide-x</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text class="pa-4">
        <v-alert
          v-if="errorMessage"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
          closable
          @click:close="errorMessage = ''"
        >
          {{ errorMessage }}
        </v-alert>

        <div class="d-flex flex-column flex-md-row gap-4">
          <!-- LEFT COLUMN: Form details -->
          <div class="flex-grow-1 min-w-0">
            <!-- Group Name -->
            <div class="mb-3">
              <label class="text-caption font-weight-medium text-grey-darken-2 mb-1 d-block">
                Tên nhóm tag <span class="text-error">*</span>
              </label>
              <v-text-field
                v-model="form.name"
                placeholder="Ví dụ: Khách VIP, Chăm sóc sau bán..."
                variant="outlined"
                density="compact"
                hide-details
                autofocus
                @keydown.enter.prevent="handleSave"
              />
            </div>

            <!-- Group Color -->
            <div class="mb-3">
              <label class="text-caption font-weight-medium text-grey-darken-2 mb-1 d-block">
                Màu đại diện nhóm
              </label>
              <div class="d-flex flex-wrap gap-1.5 align-center color-palette-container pa-2 rounded border">
                <button
                  v-for="color in paletteOptions"
                  :key="color"
                  type="button"
                  class="color-dot-btn"
                  :class="{ 'is-selected': form.color.toUpperCase() === color.toUpperCase() }"
                  :style="{ backgroundColor: color }"
                  @click="form.color = color"
                  :title="color"
                >
                  <v-icon
                    v-if="form.color.toUpperCase() === color.toUpperCase()"
                    size="12"
                    color="white"
                  >
                    lucide-check
                  </v-icon>
                </button>
              </div>
            </div>

            <!-- Tags in Group (Selected Tags Display) -->
            <div class="mb-2">
              <div class="d-flex align-center justify-space-between mb-1">
                <label class="text-caption font-weight-medium text-grey-darken-2 d-block">
                  Các tag thuộc nhóm <span class="text-error">*</span>
                </label>
                <button
                  v-if="form.tags.length > 0"
                  type="button"
                  class="text-caption text-error bg-transparent border-0 pa-0 cursor-pointer text-decoration-underline"
                  @click="clearAllTags"
                >
                  Xoá tất cả
                </button>
              </div>

              <div class="selected-tags-display-box pa-2.5 rounded border">
                <div v-if="form.tags.length === 0" class="text-caption text-grey text-center py-4">
                  Hiển thị các tag đã chọn
                </div>
                <div v-else class="d-flex flex-wrap align-center gap-1.5">
                  <span
                    v-for="tagName in form.tags"
                    :key="tagName"
                    class="tag-chip d-inline-flex align-center"
                    :style="getTagStyle(tagName)"
                  >
                    <span class="tag-chip-text text-truncate">{{ tagName }}</span>
                    <button
                      type="button"
                      class="tag-chip-remove d-flex align-center justify-center"
                      @click="removeTag(tagName)"
                      title="Bỏ tag này"
                    >
                      <v-icon size="12">lucide-x</v-icon>
                    </button>
                  </span>
                </div>
              </div>
              <div class="text-caption text-grey mt-1">
                Đã chọn <strong>{{ form.tags.length }}</strong> tag cho nhóm này.
              </div>
            </div>
          </div>

          <!-- RIGHT COLUMN: Checkbox Tag List Sidebar -->
          <div class="tag-list-sidebar border-s-md pl-md-4 d-flex flex-column" style="min-width: 250px; max-width: 280px; width: 100%;">
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-caption font-weight-bold text-grey-darken-2">
                Danh sách thẻ tag ({{ tags.length }})
              </span>
            </div>

            <!-- Search input -->
            <v-text-field
              v-model="tagSearchQuery"
              placeholder="Tìm kiếm thẻ tag..."
              prepend-inner-icon="lucide-search"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              class="mb-2"
              @keydown.enter.prevent="handleQuickCreateTag"
            />

            <!-- Option to quickly create tag if typed name doesn't exist -->
            <div
              v-if="canQuickCreate"
              class="quick-create-btn d-flex align-center gap-1.5 pa-2 rounded mb-2 text-caption text-primary cursor-pointer border border-dashed"
              @click="handleQuickCreateTag"
            >
              <v-icon size="14">lucide-plus</v-icon>
              <span class="text-truncate">Tạo tag "<strong>{{ tagSearchQuery.trim() }}</strong>"</span>
            </div>

            <!-- Scrollable list of tags with checkboxes -->
            <div class="tag-checkbox-list flex-grow-1 overflow-y-auto pr-1" style="max-height: 250px;">
              <div v-if="filteredTags.length === 0 && !canQuickCreate" class="text-caption text-grey text-center py-5">
                Không tìm thấy thẻ tag
              </div>

              <div
                v-for="tag in filteredTags"
                :key="tag.id || tag.name"
                class="tag-item-row d-flex align-center justify-space-between pa-1.5 rounded cursor-pointer mb-1"
                :class="{ 'is-active': isTagSelected(tag.name) }"
                @click="toggleTag(tag.name)"
              >
                <div class="d-flex align-center gap-2 min-w-0">
                  <v-checkbox-btn
                    :model-value="isTagSelected(tag.name)"
                    density="compact"
                    color="primary"
                    class="ma-0 pa-0"
                    @click.stop="toggleTag(tag.name)"
                  />
                  <span
                    class="tag-dot"
                    :style="{ backgroundColor: getTagColor(tag) }"
                  />
                  <span class="text-caption font-weight-medium text-truncate">
                    {{ tag.name }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="px-4 py-3 border-t d-flex justify-end gap-2">
        <v-btn variant="outlined" density="comfortable" @click="close" :disabled="saving">
          Hủy
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          density="comfortable"
          :loading="saving"
          @click="handleSave"
        >
          {{ isEditing ? 'Cập nhật' : 'Tạo nhóm' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useTags, TAG_PALETTE, type TagGroup } from '@/composables/use-tags';

const props = defineProps<{
  modelValue: boolean;
  group?: TagGroup | null;
  initialTags?: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'saved': [group: TagGroup];
}>();

const { tags, fetchTags, createTag, createTagGroup, updateTagGroup, getTagColor, getTagStyle } = useTags();

const dialogModel = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const isEditing = computed(() => Boolean(props.group?.id));

const saving = ref(false);
const errorMessage = ref('');
const tagSearchQuery = ref('');

const paletteOptions = TAG_PALETTE.slice(0, 14);

const form = ref({
  name: '',
  color: TAG_PALETTE[0],
  tags: [] as string[],
});

onMounted(() => {
  fetchTags();
});

watch(
  () => [props.modelValue, props.group, props.initialTags],
  ([isOpen]) => {
    if (isOpen) {
      errorMessage.value = '';
      tagSearchQuery.value = '';
      fetchTags(true);
      if (props.group) {
        form.value = {
          name: props.group.name || '',
          color: props.group.color || TAG_PALETTE[0],
          tags: Array.isArray(props.group.tags) ? [...props.group.tags] : [],
        };
      } else {
        form.value = {
          name: '',
          color: TAG_PALETTE[Math.floor(Math.random() * 12)],
          tags: props.initialTags ? [...props.initialTags] : [],
        };
      }
    }
  },
  { immediate: true }
);

const filteredTags = computed(() => {
  const q = tagSearchQuery.value.trim().toLowerCase();
  if (!q) return tags.value;
  return tags.value.filter((t) => t.name.toLowerCase().includes(q));
});

const canQuickCreate = computed(() => {
  const q = tagSearchQuery.value.trim().toLowerCase();
  if (!q) return false;
  return !tags.value.some((t) => t.name.toLowerCase() === q);
});

function isTagSelected(name: string): boolean {
  return form.value.tags.some((t) => t.toLowerCase() === name.toLowerCase());
}

function toggleTag(name: string) {
  const idx = form.value.tags.findIndex((t) => t.toLowerCase() === name.toLowerCase());
  if (idx >= 0) {
    form.value.tags.splice(idx, 1);
  } else {
    form.value.tags.push(name);
  }
}

function removeTag(name: string) {
  form.value.tags = form.value.tags.filter((t) => t.toLowerCase() !== name.toLowerCase());
}

function clearAllTags() {
  form.value.tags = [];
}

async function handleQuickCreateTag() {
  const q = tagSearchQuery.value.trim();
  if (!q) return;

  const existing = tags.value.find((t) => t.name.toLowerCase() === q.toLowerCase());
  if (existing) {
    if (!isTagSelected(existing.name)) {
      form.value.tags.push(existing.name);
    }
  } else {
    try {
      const created = await createTag(q);
      if (created && !isTagSelected(created.name)) {
        form.value.tags.push(created.name);
      }
    } catch (err) {
      console.error('Failed to quick create tag:', err);
    }
  }
  tagSearchQuery.value = '';
}

function close() {
  dialogModel.value = false;
  errorMessage.value = '';
}

async function handleSave() {
  const trimmedName = form.value.name.trim();
  if (!trimmedName) {
    errorMessage.value = 'Vui lòng nhập tên nhóm tag';
    return;
  }

  saving.value = true;
  errorMessage.value = '';

  try {
    let result: TagGroup | null = null;
    if (props.group?.id) {
      result = await updateTagGroup(props.group.id, {
        name: trimmedName,
        color: form.value.color,
        tags: form.value.tags,
      });
    } else {
      result = await createTagGroup({
        name: trimmedName,
        color: form.value.color,
        tags: form.value.tags,
      });
    }

    if (result) {
      emit('saved', result);
      close();
    }
  } catch (err: any) {
    const rawError = err?.response?.data?.error || err.message || '';
    if (rawError.includes('already exists') || rawError === 'Tag group already exists') {
      errorMessage.value = 'Tên nhóm tag này đã tồn tại trong tổ chức';
    } else if (rawError === 'not_found') {
      errorMessage.value = 'Không tìm thấy API (404). Vui lòng kiểm tra lại backend.';
    } else if (rawError) {
      errorMessage.value = rawError;
    } else {
      errorMessage.value = 'Không thể lưu nhóm tag';
    }
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.color-palette-container {
  background-color: rgba(0, 0, 0, 0.02);
}

.color-dot-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s, border-color 0.15s;
}

.color-dot-btn:hover {
  transform: scale(1.15);
}

.color-dot-btn.is-selected {
  border-color: #ffffff;
  box-shadow: 0 0 0 2px #121212;
  transform: scale(1.1);
}

.v-theme--dark .color-dot-btn.is-selected {
  box-shadow: 0 0 0 2px #ffffff;
}

/* Selected tags display area */
.selected-tags-display-box {
  min-height: 80px;
  max-height: 140px;
  overflow-y: auto;
  background-color: rgba(0, 0, 0, 0.03);
}

.v-theme--dark .selected-tags-display-box {
  background-color: rgba(255, 255, 255, 0.03);
}

.tag-chip {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 6px;
  line-height: 1.2;
  user-select: none;
}

.tag-chip-text {
  max-width: 140px;
}

.tag-chip-remove {
  background: none;
  border: none;
  margin-left: 5px;
  cursor: pointer;
  opacity: 0.7;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}

.tag-chip-remove:hover {
  opacity: 1;
}

/* Tag checkbox list in sidebar */
.tag-item-row {
  transition: background-color 0.15s;
}

.tag-item-row:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

.tag-item-row.is-active {
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.v-theme--dark .tag-item-row:hover {
  background-color: rgba(255, 255, 255, 0.06);
}

.tag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.quick-create-btn {
  background-color: rgba(var(--v-theme-primary), 0.05);
  border-color: rgba(var(--v-theme-primary), 0.3) !important;
  transition: background-color 0.15s;
}

.quick-create-btn:hover {
  background-color: rgba(var(--v-theme-primary), 0.12);
}
</style>
