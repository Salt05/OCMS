<template>
  <div class="tag-selector-wrapper" ref="wrapperRef">
    <!-- Main Tag Input Container -->
    <div
      class="tag-input-container"
      :class="{ 'is-focused': isOpen, 'is-disabled': disabled }"
      @click="handleContainerClick"
    >
      <label v-if="label" class="tag-input-label">{{ label }}</label>

      <div class="tag-chips-and-input d-flex flex-wrap align-center gap-1">
        <!-- Selected tag chips -->
        <span
          v-for="tagName in selectedTags"
          :key="tagName"
          class="tag-chip d-inline-flex align-center"
          :style="getTagStyle(tagName)"
        >
          <span class="tag-chip-text text-truncate">{{ tagName }}</span>
          <button
            type="button"
            class="tag-chip-remove d-flex align-center justify-center"
            :disabled="disabled"
            @click.stop="removeTag(tagName)"
            title="Xoá tag"
          >
            <v-icon size="12">lucide-x</v-icon>
          </button>
        </span>

        <!-- Search / Type input (handles both search and create) -->
        <input
          ref="inputRef"
          v-model="searchQuery"
          type="text"
          class="tag-text-input flex-grow-1"
          :placeholder="selectedTags.length === 0 ? 'Chọn tag hoặc tạo tag...' : ''"
          :disabled="disabled"
          @focus="openDropdown"
          @keydown="handleKeyDown"
        />
      </div>

      <!-- Dropdown toggle arrow button -->
      <div class="tag-input-actions d-flex align-center">
        <button
          type="button"
          class="tag-action-btn tag-toggle-btn"
          :disabled="disabled"
          @click.stop="toggleDropdown"
          title="Danh sách tag"
        >
          <v-icon size="14" :class="{ 'icon-rotated': isOpen }">lucide-chevron-down</v-icon>
        </button>
      </div>
    </div>

    <!-- Dropdown Menu -->
    <div v-if="isOpen" class="tag-dropdown-menu" @click.stop>
      <!-- Option: Create New Tag (when typed text is not already existing exactly) -->
      <div
        v-if="searchQuery.trim() && !hasExactMatch"
        class="tag-dropdown-item tag-dropdown-create-item d-flex align-center px-3 py-2"
        @click="createAndSelectTag(searchQuery)"
      >
        <v-icon size="16" color="primary" class="mr-2">lucide-plus-circle</v-icon>
        <span class="text-body-2 flex-grow-1">
          Thêm tag mới: <strong class="text-primary">"{{ searchQuery.trim() }}"</strong>
        </span>
        <span class="text-caption text-grey ml-1">(Enter)</span>
      </div>

      <!-- Existing Tags List -->
      <div class="tag-items-list overflow-y-auto" style="max-height: 200px;">
        <div
          v-for="t in filteredTags"
          :key="t.id || t.name"
          class="tag-dropdown-item d-flex align-center px-3 py-2"
          :class="{ 'is-selected': isTagSelected(t.name) }"
          @click="toggleTagSelection(t.name)"
        >
          <!-- Tag color dot -->
          <span
            class="tag-color-indicator mr-2"
            :style="{ backgroundColor: t.color, borderColor: t.color }"
          />
          <span class="tag-item-name flex-grow-1 text-body-2 font-weight-medium">
            {{ t.name }}
          </span>

          <!-- Checkmark if selected -->
          <v-icon
            v-if="isTagSelected(t.name)"
            size="16"
            color="primary"
            class="ml-1"
          >
            lucide-check
          </v-icon>
        </div>

        <div
          v-if="filteredTags.length === 0 && !searchQuery.trim()"
          class="px-3 py-3 text-center text-caption text-grey"
        >
          Chưa có tag nào. Gõ tên để tạo tag mới.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useTags } from '@/composables/use-tags';

const props = withDefaults(
  defineProps<{
    modelValue?: string[];
    label?: string;
    disabled?: boolean;
  }>(),
  {
    modelValue: () => [],
    label: 'Tags',
    disabled: false,
  }
);

const emit = defineEmits<{
  'update:modelValue': [tags: string[]];
}>();

const { tags, fetchTags, createTag, getTagStyle } = useTags();

const wrapperRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);

const isOpen = ref(false);
const searchQuery = ref('');
const creatingLoading = ref(false);

const selectedTags = computed<string[]>({
  get: () => (Array.isArray(props.modelValue) ? props.modelValue : []),
  set: (val) => emit('update:modelValue', val),
});

const filteredTags = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return tags.value;
  return tags.value.filter((t) => t.name.toLowerCase().includes(q));
});

const hasExactMatch = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return false;
  return tags.value.some((t) => t.name.toLowerCase() === q);
});

onMounted(() => {
  fetchTags();
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

function isTagSelected(name: string): boolean {
  return selectedTags.value.some((t) => t.toLowerCase() === name.toLowerCase());
}

function toggleTagSelection(name: string) {
  const idx = selectedTags.value.findIndex((t) => t.toLowerCase() === name.toLowerCase());
  if (idx >= 0) {
    const updated = [...selectedTags.value];
    updated.splice(idx, 1);
    selectedTags.value = updated;
  } else {
    selectedTags.value = [...selectedTags.value, name];
  }
  searchQuery.value = '';
  inputRef.value?.focus();
}

function removeTag(name: string) {
  selectedTags.value = selectedTags.value.filter(
    (t) => t.toLowerCase() !== name.toLowerCase()
  );
}

function openDropdown() {
  if (props.disabled) return;
  isOpen.value = true;
}

function toggleDropdown() {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    nextTick(() => inputRef.value?.focus());
  }
}

function handleContainerClick() {
  if (props.disabled) return;
  isOpen.value = true;
  inputRef.value?.focus();
}

async function createAndSelectTag(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  creatingLoading.value = true;
  try {
    const tag = await createTag(trimmed);
    if (tag) {
      if (!isTagSelected(tag.name)) {
        selectedTags.value = [...selectedTags.value, tag.name];
      }
      searchQuery.value = '';
      inputRef.value?.focus();
    }
  } finally {
    creatingLoading.value = false;
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const q = searchQuery.value.trim();
    if (q) {
      // If exact match in filtered list, toggle it; otherwise create new
      const match = tags.value.find(
        (t) => t.name.toLowerCase() === q.toLowerCase()
      );
      if (match) {
        toggleTagSelection(match.name);
      } else {
        createAndSelectTag(q);
      }
    }
  } else if (e.key === 'Backspace' && !searchQuery.value && selectedTags.value.length > 0) {
    // Remove last tag
    const updated = [...selectedTags.value];
    updated.pop();
    selectedTags.value = updated;
  } else if (e.key === 'Escape') {
    isOpen.value = false;
  }
}

function handleClickOutside(e: MouseEvent) {
  if (wrapperRef.value && !wrapperRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
}
</script>

<style scoped>
.tag-selector-wrapper {
  position: relative;
  width: 100%;
}

.tag-input-container {
  min-height: 40px;
  border: 1px solid rgba(0, 0, 0, 0.24);
  border-radius: 8px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  position: relative;
  background-color: #ffffff;
  cursor: text;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.tag-input-container.is-focused {
  border-color: #121212;
  box-shadow: 0 0 0 1px #121212;
}

.v-theme--dark .tag-input-container {
  background-color: #252522;
  border-color: rgba(255, 255, 255, 0.24);
}

.v-theme--dark .tag-input-container.is-focused {
  border-color: #efeeeb;
  box-shadow: 0 0 0 1px #efeeeb;
}

.tag-input-label {
  position: absolute;
  top: -8px;
  left: 10px;
  background: #ffffff;
  padding: 0 4px;
  font-size: 0.72rem;
  color: rgba(0, 0, 0, 0.65);
  font-weight: 500;
  pointer-events: none;
  border-radius: 2px;
}

.v-theme--dark .tag-input-label {
  background: #252522;
  color: rgba(255, 255, 255, 0.7);
}

.tag-chips-and-input {
  flex: 1;
  min-width: 0;
}

.tag-chip {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 6px;
  line-height: 1.2;
  user-select: none;
}

.tag-chip-text {
  max-width: 120px;
}

.tag-chip-remove {
  background: none;
  border: none;
  margin-left: 4px;
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

.tag-text-input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.85rem;
  min-width: 80px;
  color: inherit;
  padding: 2px 0;
}

.tag-input-actions {
  margin-left: 4px;
}

.tag-action-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: rgba(0, 0, 0, 0.54);
  transition: background-color 0.15s, color 0.15s;
}

.tag-action-btn:hover {
  background-color: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.87);
}

.v-theme--dark .tag-action-btn {
  color: rgba(255, 255, 255, 0.6);
}

.v-theme--dark .tag-action-btn:hover {
  background-color: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.icon-rotated {
  transform: rotate(180deg);
  transition: transform 0.2s ease;
}

/* Dropdown Menu */
.tag-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 100;
  overflow: hidden;
}

.v-theme--dark .tag-dropdown-menu {
  background: #252522;
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.tag-dropdown-create-item {
  background-color: #f1f5f9;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: background-color 0.15s;
}

.tag-dropdown-create-item:hover {
  background-color: #e2e8f0;
}

.v-theme--dark .tag-dropdown-create-item {
  background-color: #2e2e2b;
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.v-theme--dark .tag-dropdown-create-item:hover {
  background-color: #373734;
}

.tag-dropdown-item {
  cursor: pointer;
  transition: background-color 0.15s;
}

.tag-dropdown-item:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

.v-theme--dark .tag-dropdown-item:hover {
  background-color: rgba(255, 255, 255, 0.06);
}

.tag-dropdown-item.is-selected {
  background-color: rgba(0, 0, 0, 0.03);
}

.v-theme--dark .tag-dropdown-item.is-selected {
  background-color: rgba(255, 255, 255, 0.05);
}

.tag-color-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}
</style>
