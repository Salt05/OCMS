<template>
  <div class="tags-settings-tab">
    <!-- Top Header & Actions Toolbar -->
    <v-card class="mb-4 rounded-lg">
      <div class="pa-4">
        <!-- Top Row: Title + Primary Buttons -->
        <div class="d-flex align-center justify-space-between flex-wrap gap-2 mb-3">
          <div>
            <h2 class="text-subtitle-1 font-weight-bold d-flex align-center gap-1.5 mb-0.5">
              <v-icon size="20" color="primary">lucide-tags</v-icon>
              Quản lý Thẻ Tag & Nhóm Thẻ Phân Loại
            </h2>
            <div class="text-caption text-grey">
              Quản lý toàn bộ danh sách thẻ tag và nhóm thẻ phân loại trong tổ chức.
            </div>
          </div>

          <div class="d-flex align-center gap-2">
            <v-btn
              color="primary"
              variant="flat"
              prepend-icon="lucide-plus"
              size="small"
              @click="openCreateTag"
            >
              Thêm thẻ tag
            </v-btn>

            <v-btn
              color="primary"
              variant="tonal"
              prepend-icon="lucide-folder-plus"
              size="small"
              @click="openCreateGroup()"
            >
              Thêm nhóm thẻ
            </v-btn>
          </div>
        </div>

        <!-- Filter & Bulk Actions Row ("Hành động") -->
        <div class="d-flex align-center justify-space-between flex-wrap gap-2 pt-2 border-t">
          <!-- Search box -->
          <div style="max-width: 320px; width: 100%;">
            <v-text-field
              v-model="searchQuery"
              placeholder="Tìm kiếm thẻ tag hoặc nhóm..."
              prepend-inner-icon="lucide-search"
              variant="outlined"
              density="compact"
              hide-details
              clearable
            />
          </div>

          <!-- Bulk Actions when checkboxes are selected -->
          <div class="d-flex align-center gap-2 flex-wrap">
            <span v-if="selectedTagIds.length > 0" class="text-caption font-weight-medium text-primary">
              Đã chọn <strong>{{ selectedTagIds.length }}</strong> thẻ tag:
            </span>

            <v-btn
              v-if="selectedTagIds.length > 0"
              size="small"
              variant="outlined"
              color="primary"
              prepend-icon="lucide-folder-plus"
              @click="openCreateGroupFromSelected"
            >
              Lưu thành nhóm mới
            </v-btn>

            <v-menu v-if="selectedTagIds.length > 0 && tagGroups.length > 0" location="bottom end">
              <template #activator="{ props: menuProps }">
                <v-btn
                  v-bind="menuProps"
                  size="small"
                  variant="outlined"
                  color="primary"
                  prepend-icon="lucide-plus-circle"
                  append-icon="lucide-chevron-down"
                >
                  Gán vào nhóm có sẵn
                </v-btn>
              </template>
              <v-list density="compact" nav class="pa-1" min-width="180">
                <v-list-item
                  v-for="group in tagGroups"
                  :key="group.id"
                  :title="group.name"
                  @click="assignSelectedToGroup(group)"
                >
                  <template #prepend>
                    <span
                      class="tag-color-indicator mr-2"
                      :style="{ backgroundColor: group.color || '#4F46E5' }"
                    />
                  </template>
                </v-list-item>
              </v-list>
            </v-menu>

            <v-btn
              v-if="selectedTagIds.length > 0"
              size="small"
              variant="tonal"
              color="error"
              prepend-icon="lucide-trash-2"
              @click="confirmBulkDeleteTags"
            >
              Xóa ({{ selectedTagIds.length }})
            </v-btn>
          </div>
        </div>
      </div>
    </v-card>

    <!-- Main Table: Tất cả thẻ tag | Nhóm thẻ phân loại -->
    <v-card class="rounded-lg mb-6">
      <v-table hover class="tag-management-table">
        <thead>
          <tr>
            <th style="width: 48px;" class="px-3 text-center">
              <v-checkbox-btn
                :model-value="isAllSelected"
                :indeterminate="isIndeterminate"
                @update:model-value="toggleSelectAll"
              />
            </th>
            <th class="font-weight-bold text-subtitle-2 text-left" style="min-width: 220px;">
              Tất cả thẻ tag
            </th>
            <th class="font-weight-bold text-subtitle-2 text-left">
              Nhóm thẻ phân loại
            </th>
            <th class="font-weight-bold text-subtitle-2 text-right" style="width: 140px;">
              Hành động
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="4" class="text-center py-6">
              <v-progress-circular indeterminate color="primary" size="24" />
            </td>
          </tr>

          <tr v-else-if="filteredTagRows.length === 0">
            <td colspan="4" class="text-center py-8 text-grey text-body-2">
              <v-icon size="32" class="mb-2 text-grey-lighten-1 d-block mx-auto">lucide-tags</v-icon>
              {{ searchQuery ? 'Không tìm thấy thẻ tag nào phù hợp' : 'Chưa có thẻ tag nào được tạo.' }}
              <div class="mt-2">
                <v-btn size="small" color="primary" variant="tonal" @click="openCreateTag">
                  + Tạo thẻ tag đầu tiên
                </v-btn>
              </div>
            </td>
          </tr>

          <tr
            v-for="row in filteredTagRows"
            :key="row.tag.id || row.tag.name"
            :class="{ 'is-selected-row': isTagSelected(row.tag.id || row.tag.name) }"
          >
            <!-- Checkbox column -->
            <td class="px-3 text-center">
              <v-checkbox-btn
                :model-value="isTagSelected(row.tag.id || row.tag.name)"
                @update:model-value="toggleSelectTag(row.tag.id || row.tag.name)"
              />
            </td>

            <!-- Column 1: Tất cả thẻ tag -->
            <td>
              <div class="d-flex align-center gap-2 py-2">
                <span
                  class="tag-color-indicator flex-shrink-0"
                  :style="{ backgroundColor: row.tag.color, borderColor: row.tag.color }"
                />
                <span
                  class="tag-name-badge font-weight-medium px-2 py-1 rounded"
                  :style="getTagStyle(row.tag.name)"
                >
                  {{ row.tag.name }}
                </span>
              </div>
            </td>

            <!-- Column 2: Nhóm thẻ phân loại -->
            <td>
              <div class="d-flex flex-wrap align-center gap-1.5 py-2">
                <span
                  v-for="group in row.groups"
                  :key="group.id"
                  class="group-badge d-inline-flex align-center px-2 py-1 rounded cursor-pointer"
                  :style="{
                    backgroundColor: `${group.color || '#4F46E5'}15`,
                    color: group.color || '#4F46E5',
                    border: `1px solid ${group.color || '#4F46E5'}40`,
                  }"
                  :title="`Bấm để xem/sửa nhóm ${group.name}`"
                  @click="openEditGroup(group)"
                >
                  <v-icon size="13" class="mr-1">lucide-folder</v-icon>
                  <span class="font-weight-medium text-caption">{{ group.name }}</span>
                  <button
                    type="button"
                    class="group-badge-remove ml-1"
                    title="Gỡ tag khỏi nhóm này"
                    @click.stop="removeTagFromGroup(row.tag.name, group)"
                  >
                    <v-icon size="11">lucide-x</v-icon>
                  </button>
                </span>

                <!-- Quick add to group button -->
                <v-menu location="bottom start">
                  <template #activator="{ props: addGroupProps }">
                    <button
                      type="button"
                      v-bind="addGroupProps"
                      class="quick-add-group-btn text-caption text-grey-darken-1 d-inline-flex align-center"
                      title="Gán thẻ này vào nhóm"
                    >
                      <v-icon size="12" class="mr-0.5">lucide-plus</v-icon>
                      Gán nhóm
                    </button>
                  </template>
                  <v-list density="compact" nav class="pa-1" min-width="160">
                    <v-list-item
                      v-for="group in getAvailableGroupsForTag(row.tag.name)"
                      :key="group.id"
                      :title="group.name"
                      @click="addTagToGroup(row.tag.name, group)"
                    >
                      <template #prepend>
                        <span
                          class="tag-color-indicator mr-2"
                          :style="{ backgroundColor: group.color || '#4F46E5' }"
                        />
                      </template>
                    </v-list-item>
                    <v-list-item
                      v-if="getAvailableGroupsForTag(row.tag.name).length === 0"
                      disabled
                      title="Đã thuộc tất cả nhóm"
                    />
                    <v-divider class="my-1" />
                    <v-list-item
                      prepend-icon="lucide-folder-plus"
                      title="Tạo nhóm mới..."
                      @click="openCreateGroup([row.tag.name])"
                    />
                  </v-list>
                </v-menu>
              </div>
            </td>

            <!-- Column 3: Hành động -->
            <td class="text-right py-2">
              <div class="d-flex align-center justify-end gap-1">
                <v-btn
                  icon
                  size="small"
                  variant="text"
                  title="Chỉnh sửa thẻ tag"
                  @click="openEditTag(row.tag)"
                >
                  <v-icon size="15" color="grey-darken-1">lucide-pencil</v-icon>
                </v-btn>

                <v-btn
                  icon
                  size="small"
                  variant="text"
                  color="error"
                  title="Xóa thẻ tag"
                  @click="confirmDeleteTag(row.tag)"
                >
                  <v-icon size="15">lucide-trash-2</v-icon>
                </v-btn>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Section 2: Danh sách Nhóm Thẻ Phân Loại (Tag Groups Summary) -->
    <v-card class="rounded-lg">
      <div class="pa-4 d-flex align-center justify-space-between border-b">
        <div>
          <h3 class="text-subtitle-2 font-weight-bold d-flex align-center gap-1.5">
            <v-icon size="18" color="primary">lucide-folder</v-icon>
            Danh sách Nhóm Thẻ Phân Loại ({{ tagGroups.length }})
          </h3>
          <div class="text-caption text-grey">
            Các nhóm tag giúp phân loại khách hàng nhanh khi chat và lọc dữ liệu.
          </div>
        </div>
        <v-btn
          size="small"
          variant="tonal"
          color="primary"
          prepend-icon="lucide-plus"
          @click="openCreateGroup()"
        >
          Tạo nhóm thẻ mới
        </v-btn>
      </div>

      <div class="pa-4">
        <div v-if="groupsLoading" class="text-center py-4">
          <v-progress-circular indeterminate color="primary" size="24" />
        </div>

        <div v-else-if="tagGroups.length === 0" class="text-center py-6 text-grey text-caption">
          Chưa có nhóm thẻ nào. Nhấn "Tạo nhóm thẻ mới" để gom các tag thường dùng lại với nhau.
        </div>

        <v-row v-else dense>
          <v-col
            v-for="group in tagGroups"
            :key="group.id"
            cols="12"
            sm="6"
            md="4"
          >
            <div class="tag-group-card pa-3 rounded-lg border">
              <div class="d-flex align-center justify-space-between mb-2">
                <div class="d-flex align-center min-w-0 mr-2">
                  <span
                    class="tag-color-indicator mr-2 flex-shrink-0"
                    :style="{ backgroundColor: group.color || '#4F46E5' }"
                  />
                  <span class="font-weight-bold text-body-2 text-truncate">{{ group.name }}</span>
                  <span class="text-caption text-grey ml-1.5 flex-shrink-0">({{ group.tags.length }} thẻ)</span>
                </div>
                <div class="d-flex align-center gap-0.5 flex-shrink-0">
                  <v-btn
                    icon
                    size="x-small"
                    variant="text"
                    title="Sửa nhóm"
                    @click="openEditGroup(group)"
                  >
                    <v-icon size="13" color="grey-darken-1">lucide-pencil</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    size="x-small"
                    variant="text"
                    color="error"
                    title="Xóa nhóm"
                    @click="confirmDeleteGroup(group)"
                  >
                    <v-icon size="13">lucide-trash-2</v-icon>
                  </v-btn>
                </div>
              </div>

              <!-- Tags Preview Chips -->
              <div class="d-flex flex-wrap gap-1">
                <span
                  v-for="tagName in group.tags"
                  :key="tagName"
                  class="tag-mini-chip text-truncate"
                  :style="getTagStyle(tagName)"
                >
                  {{ tagName }}
                </span>
                <span v-if="group.tags.length === 0" class="text-caption text-grey font-italic">
                  (Chưa có thẻ nào)
                </span>
              </div>
            </div>
          </v-col>
        </v-row>
      </div>
    </v-card>

    <!-- Dialog 1: Tag Group Dialog (Create / Edit Group) -->
    <TagGroupDialog
      v-model="showGroupDialog"
      :group="selectedGroupForEdit"
      :initial-tags="groupInitialTags"
      @saved="onGroupSaved"
    />

    <!-- Dialog 2: Tag Edit Dialog (Create / Edit Single Tag) -->
    <v-dialog v-model="showTagDialog" max-width="440" persistent>
      <v-card class="rounded-lg">
        <v-card-title class="pa-4 font-weight-bold text-body-1 border-b d-flex align-center justify-space-between">
          <div class="d-flex align-center">
            <v-icon size="18" class="mr-2 text-primary">
              {{ isEditingTag ? 'lucide-pencil' : 'lucide-tag' }}
            </v-icon>
            <span>{{ isEditingTag ? 'Chỉnh sửa thẻ tag' : 'Tạo thẻ tag mới' }}</span>
          </div>
          <v-btn icon size="x-small" variant="text" @click="showTagDialog = false">
            <v-icon size="16">lucide-x</v-icon>
          </v-btn>
        </v-card-title>

        <v-card-text class="pa-4">
          <v-alert
            v-if="tagError"
            type="error"
            density="compact"
            class="mb-3"
            closable
            @click:close="tagError = ''"
          >
            {{ tagError }}
          </v-alert>

          <!-- Tag Name -->
          <div class="mb-3">
            <label class="text-caption font-weight-medium mb-1 d-block">
              Tên thẻ tag <span class="text-error">*</span>
            </label>
            <v-text-field
              v-model="tagForm.name"
              placeholder="Ví dụ: VIP, Tiềm năng, Đã chốt..."
              variant="outlined"
              density="compact"
              hide-details
              autofocus
              @keydown.enter.prevent="handleSaveTag"
            />
          </div>

          <!-- Tag Color Palette -->
          <div class="mb-2">
            <label class="text-caption font-weight-medium mb-1 d-block">
              Màu sắc thẻ tag
            </label>
            <div class="d-flex flex-wrap gap-1.5 align-center color-palette-box pa-2 rounded border">
              <button
                v-for="color in paletteOptions"
                :key="color"
                type="button"
                class="color-dot-btn"
                :class="{ 'is-selected': tagForm.color.toUpperCase() === color.toUpperCase() }"
                :style="{ backgroundColor: color }"
                @click="tagForm.color = color"
                :title="color"
              >
                <v-icon
                  v-if="tagForm.color.toUpperCase() === color.toUpperCase()"
                  size="12"
                  color="white"
                >
                  lucide-check
                </v-icon>
              </button>
            </div>
          </div>
        </v-card-text>

        <v-card-actions class="pa-4 d-flex justify-end gap-2 border-t">
          <v-btn variant="outlined" density="comfortable" @click="showTagDialog = false" :disabled="savingTag">
            Hủy
          </v-btn>
          <v-btn color="primary" variant="flat" density="comfortable" :loading="savingTag" @click="handleSaveTag">
            {{ isEditingTag ? 'Lưu thay đổi' : 'Tạo thẻ tag' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog 3: Delete Tag Confirm -->
    <v-dialog v-model="showDeleteTagConfirm" max-width="400">
      <v-card class="rounded-lg">
        <v-card-title class="pa-4 font-weight-bold text-body-1">
          Xác nhận xóa thẻ tag
        </v-card-title>
        <v-card-text class="px-4 py-2 text-body-2">
          Bạn có chắc muốn xóa thẻ tag <strong>"{{ tagToDelete?.name }}"</strong>?
        </v-card-text>
        <v-card-actions class="pa-4 d-flex justify-end gap-2">
          <v-btn variant="outlined" density="comfortable" @click="showDeleteTagConfirm = false" :disabled="deletingTag">
            Hủy
          </v-btn>
          <v-btn color="error" variant="flat" density="comfortable" :loading="deletingTag" @click="handleDeleteSingleTag">
            Xóa thẻ
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog 4: Delete Group Confirm -->
    <v-dialog v-model="showDeleteGroupConfirm" max-width="400">
      <v-card class="rounded-lg">
        <v-card-title class="pa-4 font-weight-bold text-body-1">
          Xác nhận xóa nhóm thẻ
        </v-card-title>
        <v-card-text class="px-4 py-2 text-body-2">
          Bạn có chắc muốn xóa nhóm thẻ <strong>"{{ groupToDelete?.name }}"</strong>?
          <div class="text-caption text-grey mt-1">Các thẻ tag gắn trên khách hàng sẽ không bị xóa.</div>
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

    <!-- Dialog 5: Bulk Delete Tags Confirm -->
    <v-dialog v-model="showBulkDeleteConfirm" max-width="400">
      <v-card class="rounded-lg">
        <v-card-title class="pa-4 font-weight-bold text-body-1">
          Xác nhận xóa nhiều thẻ tag
        </v-card-title>
        <v-card-text class="px-4 py-2 text-body-2">
          Bạn có chắc muốn xóa <strong>{{ selectedTagIds.length }}</strong> thẻ tag đã chọn?
        </v-card-text>
        <v-card-actions class="pa-4 d-flex justify-end gap-2">
          <v-btn variant="outlined" density="comfortable" @click="showBulkDeleteConfirm = false" :disabled="deletingTag">
            Hủy
          </v-btn>
          <v-btn color="error" variant="flat" density="comfortable" :loading="deletingTag" @click="handleBulkDeleteTags">
            Xóa tất cả đã chọn
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTags, TAG_PALETTE, type Tag, type TagGroup } from '@/composables/use-tags';
import TagGroupDialog from '@/components/common/TagGroupDialog.vue';

const {
  tags,
  tagGroups,
  loading,
  groupsLoading,
  fetchTags,
  fetchTagGroups,
  createTag,
  updateTag,
  deleteTag,
  updateTagGroup,
  deleteTagGroup,
  getTagStyle,
} = useTags();

const searchQuery = ref('');
const selectedTagIds = ref<string[]>([]);

// Palette options for tag creation/edit
const paletteOptions = TAG_PALETTE.slice(0, 18);

// Tag Edit Dialog
const showTagDialog = ref(false);
const isEditingTag = ref(false);
const editingTagId = ref<string | null>(null);
const tagForm = ref({ name: '', color: TAG_PALETTE[0] });
const savingTag = ref(false);
const tagError = ref('');

// Tag Group Dialog
const showGroupDialog = ref(false);
const selectedGroupForEdit = ref<TagGroup | null>(null);
const groupInitialTags = ref<string[]>([]);

// Delete Dialogs
const showDeleteTagConfirm = ref(false);
const tagToDelete = ref<Tag | null>(null);
const deletingTag = ref(false);

const showDeleteGroupConfirm = ref(false);
const groupToDelete = ref<TagGroup | null>(null);
const deletingGroup = ref(false);

const showBulkDeleteConfirm = ref(false);

// Combined Table Structure: Map each tag to the groups it belongs to
interface TagRow {
  tag: Tag;
  groups: TagGroup[];
}

const allTagRows = computed<TagRow[]>(() => {
  return tags.value.map((t) => {
    const matchingGroups = tagGroups.value.filter((g) =>
      Array.isArray(g.tags) && g.tags.some((gt) => gt.toLowerCase() === t.name.toLowerCase())
    );
    return {
      tag: t,
      groups: matchingGroups,
    };
  });
});

const filteredTagRows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return allTagRows.value;
  return allTagRows.value.filter((r) => {
    if (r.tag.name.toLowerCase().includes(q)) return true;
    return r.groups.some((g) => g.name.toLowerCase().includes(q));
  });
});

// Checkbox selection helpers
const isAllSelected = computed(() => {
  if (filteredTagRows.value.length === 0) return false;
  return filteredTagRows.value.every((r) => isTagSelected(r.tag.id || r.tag.name));
});

const isIndeterminate = computed(() => {
  const selectedCount = filteredTagRows.value.filter((r) =>
    isTagSelected(r.tag.id || r.tag.name)
  ).length;
  return selectedCount > 0 && selectedCount < filteredTagRows.value.length;
});

function isTagSelected(idOrName: string): boolean {
  return selectedTagIds.value.includes(idOrName);
}

function toggleSelectTag(idOrName: string) {
  const idx = selectedTagIds.value.indexOf(idOrName);
  if (idx >= 0) {
    selectedTagIds.value.splice(idx, 1);
  } else {
    selectedTagIds.value.push(idOrName);
  }
}

function toggleSelectAll(val: boolean | null) {
  if (val) {
    const allIds = filteredTagRows.value.map((r) => r.tag.id || r.tag.name);
    selectedTagIds.value = Array.from(new Set([...selectedTagIds.value, ...allIds]));
  } else {
    const rowIds = new Set(filteredTagRows.value.map((r) => r.tag.id || r.tag.name));
    selectedTagIds.value = selectedTagIds.value.filter((id) => !rowIds.has(id));
  }
}

// Available groups to add a tag to
function getAvailableGroupsForTag(tagName: string): TagGroup[] {
  return tagGroups.value.filter(
    (g) => !Array.isArray(g.tags) || !g.tags.some((t) => t.toLowerCase() === tagName.toLowerCase())
  );
}

// Add / Remove single tag from group
async function addTagToGroup(tagName: string, group: TagGroup) {
  const updatedTags = Array.from(new Set([...(group.tags || []), tagName]));
  await updateTagGroup(group.id, { tags: updatedTags });
}

async function removeTagFromGroup(tagName: string, group: TagGroup) {
  const updatedTags = (group.tags || []).filter((t) => t.toLowerCase() !== tagName.toLowerCase());
  await updateTagGroup(group.id, { tags: updatedTags });
}

// Bulk assign selected tags to a group
async function assignSelectedToGroup(group: TagGroup) {
  const selectedNames = tags.value
    .filter((t) => isTagSelected(t.id || t.name))
    .map((t) => t.name);

  const updatedTags = Array.from(new Set([...(group.tags || []), ...selectedNames]));
  await updateTagGroup(group.id, { tags: updatedTags });
  selectedTagIds.value = [];
}

// Open create group from selected tags
function openCreateGroupFromSelected() {
  const selectedNames = tags.value
    .filter((t) => isTagSelected(t.id || t.name))
    .map((t) => t.name);

  openCreateGroup(selectedNames);
}

// Tag CRUD
function openCreateTag() {
  isEditingTag.value = false;
  editingTagId.value = null;
  tagForm.value = {
    name: '',
    color: TAG_PALETTE[Math.floor(Math.random() * 14)],
  };
  tagError.value = '';
  showTagDialog.value = true;
}

function openEditTag(tag: Tag) {
  isEditingTag.value = true;
  editingTagId.value = tag.id || null;
  tagForm.value = {
    name: tag.name,
    color: tag.color || TAG_PALETTE[0],
  };
  tagError.value = '';
  showTagDialog.value = true;
}

async function handleSaveTag() {
  const trimmedName = tagForm.value.name.trim();
  if (!trimmedName) {
    tagError.value = 'Vui lòng nhập tên thẻ tag';
    return;
  }

  savingTag.value = true;
  tagError.value = '';

  try {
    if (isEditingTag.value && editingTagId.value) {
      await updateTag(editingTagId.value, {
        name: trimmedName,
        color: tagForm.value.color,
      });
    } else {
      await createTag(trimmedName, tagForm.value.color);
    }
    showTagDialog.value = false;
    fetchTags(true);
  } catch (err: any) {
    tagError.value = err?.response?.data?.error || err.message || 'Không thể lưu thẻ tag';
  } finally {
    savingTag.value = false;
  }
}

function confirmDeleteTag(tag: Tag) {
  tagToDelete.value = tag;
  showDeleteTagConfirm.value = true;
}

async function handleDeleteSingleTag() {
  if (!tagToDelete.value?.id) return;
  deletingTag.value = true;
  try {
    await deleteTag(tagToDelete.value.id);
    showDeleteTagConfirm.value = false;
    tagToDelete.value = null;
  } catch (err) {
    console.error('Failed to delete tag:', err);
  } finally {
    deletingTag.value = false;
  }
}

function confirmBulkDeleteTags() {
  showBulkDeleteConfirm.value = true;
}

async function handleBulkDeleteTags() {
  deletingTag.value = true;
  try {
    const selectedTagsList = tags.value.filter((t) => isTagSelected(t.id || t.name));
    for (const t of selectedTagsList) {
      if (t.id) {
        await deleteTag(t.id);
      }
    }
    selectedTagIds.value = [];
    showBulkDeleteConfirm.value = false;
    fetchTags(true);
  } catch (err) {
    console.error('Failed bulk delete tags:', err);
  } finally {
    deletingTag.value = false;
  }
}

// Tag Group CRUD
function openCreateGroup(initialTags: string[] = []) {
  selectedGroupForEdit.value = null;
  groupInitialTags.value = Array.isArray(initialTags) ? [...initialTags] : [];
  showGroupDialog.value = true;
}

function openEditGroup(group: TagGroup) {
  selectedGroupForEdit.value = group;
  groupInitialTags.value = [];
  showGroupDialog.value = true;
}

function confirmDeleteGroup(group: TagGroup) {
  groupToDelete.value = group;
  showDeleteGroupConfirm.value = true;
}

async function handleDeleteGroup() {
  if (!groupToDelete.value?.id) return;
  deletingGroup.value = true;
  try {
    await deleteTagGroup(groupToDelete.value.id);
    showDeleteGroupConfirm.value = false;
    groupToDelete.value = null;
  } catch (err) {
    console.error('Failed to delete group:', err);
  } finally {
    deletingGroup.value = false;
  }
}

function onGroupSaved() {
  fetchTagGroups(true);
  fetchTags(true);
}

onMounted(() => {
  fetchTags(true);
  fetchTagGroups(true);
});
</script>

<style scoped>
.tag-management-table th {
  background-color: rgba(0, 0, 0, 0.02) !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
  font-size: 0.8125rem;
}

.v-theme--dark .tag-management-table th {
  background-color: rgba(255, 255, 255, 0.03) !important;
  border-bottom-color: rgba(255, 255, 255, 0.08) !important;
}

.tag-management-table tr.is-selected-row {
  background-color: rgba(0, 104, 255, 0.04);
}

.tag-color-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}

.tag-name-badge {
  font-size: 0.8125rem;
  line-height: 1.25;
}

.group-badge {
  font-size: 0.75rem;
  line-height: 1.2;
  transition: opacity 0.15s;
}

.group-badge:hover {
  opacity: 0.85;
}

.group-badge-remove {
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0.65;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}

.group-badge-remove:hover {
  opacity: 1;
}

.quick-add-group-btn {
  background: transparent;
  border: 1px dashed rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 0.72rem;
  transition: all 0.15s;
}

.v-theme--dark .quick-add-group-btn {
  border-color: rgba(255, 255, 255, 0.2);
}

.quick-add-group-btn:hover {
  background-color: rgba(0, 0, 0, 0.05);
  border-color: #0068ff;
  color: #0068ff !important;
}

.tag-group-card {
  background-color: #fafafa;
  border-color: rgba(0, 0, 0, 0.08) !important;
  transition: box-shadow 0.15s;
}

.v-theme--dark .tag-group-card {
  background-color: #2a2a28;
  border-color: rgba(255, 255, 255, 0.1) !important;
}

.tag-group-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.tag-mini-chip {
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 4px;
  max-width: 100px;
  display: inline-block;
}

.color-palette-box {
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
</style>
