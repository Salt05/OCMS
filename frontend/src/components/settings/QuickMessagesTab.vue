<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-4">
      <div style="max-width: 300px; width: 100%;">
        <v-text-field
          v-model="search"
          placeholder="Tìm phím tắt, tiêu đề..."
          prepend-inner-icon="lucide-search"
          density="compact"
          variant="solo-filled"
          hide-details
          clearable
        />
      </div>
      <v-btn color="primary" prepend-icon="lucide-plus" @click="openCreateDialog">
        Thêm tin nhắn mẫu
      </v-btn>
    </div>

    <!-- Alerts -->
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable @click:close="error = ''">
      {{ error }}
    </v-alert>
    <v-alert v-if="success" type="success" variant="tonal" class="mb-4" closable @click:close="success = ''">
      {{ success }}
    </v-alert>

    <v-card>
      <v-data-table
        :headers="headers"
        :items="quickMessages"
        :search="search"
        :loading="loading"
        no-data-text="Chưa có tin nhắn mẫu nào"
        loading-text="Đang tải danh sách..."
      >
        <!-- Shortcut Column -->
        <template #item.shortcut="{ item }">
          <span class="font-weight-bold text-primary">/{{ item.shortcut }}</span>
        </template>

        <!-- Content Column (Truncated) -->
        <template #item.content="{ item }">
          <div class="text-truncate-custom" style="max-width: 320px;">
            {{ item.content }}
          </div>
        </template>

        <!-- Image Column -->
        <template #item.imageUrl="{ item }">
          <v-avatar v-if="getImageUrl(item)" size="36" rounded="lg" class="border">
            <v-img :src="getImageUrl(item)" cover />
          </v-avatar>
          <span v-else class="text-grey-lighten-1">—</span>
        </template>

        <!-- Scope / Type Column -->
        <template #item.isShared="{ item }">
          <span v-if="item.isShared" class="text-info font-weight-medium text-caption d-inline-flex align-center">
            <v-icon size="14" class="mr-1">lucide-users</v-icon>Dùng chung
          </span>
          <span v-else class="text-grey-darken-1 text-caption d-inline-flex align-center">
            <v-icon size="14" class="mr-1">lucide-user</v-icon>Cá nhân
          </span>
        </template>

        <!-- Creator Column -->
        <template #item.user="{ item }">
          <span class="text-caption">
            {{ item.user?.fullName || 'Hệ thống' }}
          </span>
        </template>

        <!-- Actions Column -->
        <template #item.actions="{ item }">
          <div class="d-flex align-center gap-1">
            <v-btn
              icon
              size="small"
              variant="text"
              :disabled="!canModify(item)"
              :title="canModify(item) ? 'Chỉnh sửa' : 'Chỉ người tạo hoặc Quản trị viên mới được sửa'"
              @click="openEditDialog(item)"
            >
              <v-icon size="16">lucide-pencil</v-icon>
            </v-btn>
            <v-btn
              icon
              size="small"
              variant="text"
              color="error"
              :disabled="!canModify(item)"
              :title="canModify(item) ? 'Xóa bỏ' : 'Chỉ người tạo hoặc Quản trị viên mới được xóa'"
              @click="confirmDelete(item)"
            >
              <v-icon size="16">lucide-trash-2</v-icon>
            </v-btn>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Create/Edit Dialog -->
    <v-dialog v-model="dialogOpen" max-width="500" persistent>
      <v-card class="rounded-lg">
        <v-card-title class="pa-4 d-flex align-center justify-space-between border-b">
          <span class="text-h6 font-weight-bold">
            {{ form.id ? 'Cập nhật tin nhắn mẫu' : 'Thêm tin nhắn mẫu mới' }}
          </span>
          <v-btn icon size="small" variant="text" @click="dialogOpen = false">
            <v-icon>lucide-x</v-icon>
          </v-btn>
        </v-card-title>

        <v-card-text class="pa-4">
          <v-alert v-if="dialogError" type="error" density="compact" variant="tonal" class="mb-3">
            {{ dialogError }}
          </v-alert>

          <!-- Shortcut -->
          <v-text-field
            v-model="form.shortcut"
            label="Phím tắt *"
            placeholder="ví dụ: stk, chao, tuvan"
            prepend-inner-icon="lucide-terminal"
            density="compact"
            variant="outlined"
            class="mb-3"
            :rules="[rules.required, rules.shortcutFormat]"
            hint="Chỉ gồm chữ thường không dấu, số, gạch ngang, gạch dưới và viết liền không dấu cách."
            persistent-hint
          />

          <!-- Title -->
          <v-text-field
            v-model="form.title"
            label="Tiêu đề gợi nhớ *"
            placeholder="ví dụ: Thông tin chuyển khoản"
            prepend-inner-icon="lucide-bookmark"
            density="compact"
            variant="outlined"
            class="mb-3"
            :rules="[rules.required]"
          />

          <!-- Image URL / File Upload -->
          <div class="mb-3">
            <v-text-field
              v-model="form.imageUrl"
              label="URL ảnh đính kèm (Tùy chọn)"
              placeholder="Nhập link ảnh hoặc chọn file tải lên..."
              prepend-inner-icon="lucide-image"
              density="compact"
              variant="outlined"
              clearable
              hide-details
            >
              <template #append-inner>
                <v-btn
                  size="small"
                  variant="text"
                  color="primary"
                  class="px-1"
                  :loading="uploading"
                  @click="triggerFileInput"
                >
                  <v-icon size="14" class="mr-1">lucide-upload</v-icon>Chọn file
                </v-btn>
              </template>
            </v-text-field>
            <input
              type="file"
              ref="fileInput"
              accept="image/*"
              class="d-none"
              @change="onFileChange"
            />
            
            <!-- Image Preview Box -->
            <v-expand-transition>
              <div v-if="form.imageUrl" class="mt-3 d-flex justify-start">
                <v-card variant="outlined" class="pa-1 rounded-lg position-relative border bg-grey-lighten-4" max-width="180">
                  <v-img
                    :src="form.imageUrl"
                    max-height="100"
                    min-width="120"
                    contain
                    class="rounded-lg"
                  />
                  <v-btn
                    icon
                    size="20"
                    color="error"
                    variant="flat"
                    class="position-absolute"
                    style="top: -6px; right: -6px; z-index: 10;"
                    @click="form.imageUrl = ''"
                  >
                    <v-icon size="12">lucide-x</v-icon>
                  </v-btn>
                </v-card>
              </div>
            </v-expand-transition>
          </div>

          <!-- Content -->
          <v-textarea
            v-model="form.content"
            label="Nội dung tin nhắn *"
            placeholder="Nhập nội dung mẫu tại đây... Dùng {fullName} để tự động điền tên khách hàng."
            prepend-inner-icon="lucide-align-left"
            density="compact"
            variant="outlined"
            rows="5"
            auto-grow
            class="mb-3"
            :rules="[rules.required]"
            persistent-hint
            hint="Sử dụng tham số {fullName} để hệ thống tự động điền tên khách hàng khi chat."
          />

          <!-- Share Toggle (only editable by Admin/Owner) -->
          <div class="d-flex align-center mt-2">
            <v-checkbox
              v-model="form.isShared"
              label="Dùng chung cho cả tổ chức (chỉ Admin/Owner được tạo)"
              density="compact"
              hide-details
              :disabled="!authStore.isAdmin"
            />
          </div>
        </v-card-text>

        <v-card-actions class="pa-4 pt-0 justify-end">
          <v-btn variant="text" @click="dialogOpen = false">Hủy</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="saving"
            :disabled="!isFormValid"
            @click="saveQuickMessage"
          >
            Lưu lại
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteConfirmOpen" max-width="400">
      <v-card class="rounded-lg">
        <v-card-title class="pa-4 font-weight-bold text-h6">
          Xác nhận xóa mẫu tin nhắn?
        </v-card-title>
        <v-card-text class="px-4 pb-4">
          Bạn có chắc chắn muốn xóa mẫu tin nhắn phím tắt
          <strong class="text-error">/{{ selectedItem?.shortcut }}</strong> này không?
          Hành động này không thể hoàn tác.
        </v-card-text>
        <v-card-actions class="px-4 pb-4 pt-0 justify-end">
          <v-btn variant="text" @click="deleteConfirmOpen = false">Hủy bỏ</v-btn>
          <v-btn color="error" variant="flat" :loading="deleting" @click="deleteQuickMessage">
            Đồng ý xóa
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

// Table state
const headers = [
  { title: 'Phím tắt', key: 'shortcut', sortable: true, width: '120px' },
  { title: 'Tiêu đề gợi nhớ', key: 'title', sortable: true, width: '180px' },
  { title: 'Ảnh', key: 'imageUrl', sortable: false, width: '80px' },
  { title: 'Nội dung tin nhắn', key: 'content', sortable: false },
  { title: 'Phạm vi', key: 'isShared', sortable: true, width: '130px' },
  { title: 'Người tạo', key: 'user', sortable: true, width: '130px' },
  { title: 'Thao tác', key: 'actions', sortable: false, width: '100px', align: 'center' as const },
];

const quickMessages = ref<any[]>([]);
const search = ref('');
const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const error = ref('');
const success = ref('');

// Upload state
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);

function triggerFileInput() {
  fileInput.value?.click();
}

async function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    dialogError.value = 'Chỉ chấp nhận file hình ảnh';
    return;
  }

  uploading.value = true;
  dialogError.value = '';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await api.post('/quick-messages/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    if (res.data?.url) {
      form.value.imageUrl = res.data.url;
      success.value = 'Tải ảnh lên thành công';
    }
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Không thể upload file ảnh';
  } finally {
    uploading.value = false;
    if (fileInput.value) {
      fileInput.value.value = '';
    }
  }
}

// Dialog states
const dialogOpen = ref(false);
const deleteConfirmOpen = ref(false);
const dialogError = ref('');
const selectedItem = ref<any>(null);

// Form state
const form = ref({
  id: '',
  shortcut: '',
  title: '',
  content: '',
  isShared: false,
  imageUrl: '',
});

function getImageUrl(item: any): string {
  if (Array.isArray(item.attachments)) {
    return item.attachments.find((a: any) => a.type === 'image')?.url || '';
  }
  return '';
}

// Auto-remove leading slash if typed by user
watch(() => form.value.shortcut, (newVal) => {
  if (newVal && newVal.startsWith('/')) {
    form.value.shortcut = newVal.slice(1);
  }
});

// Input validation rules
const rules = {
  required: (v: string) => !!v || 'Thông tin này là bắt buộc',
  shortcutFormat: (v: string) =>
    /^[a-z0-9_-]+$/.test(v) || 'Phím tắt chỉ được chứa chữ thường không dấu, số, gạch ngang (-) hoặc gạch dưới (_)',
};

const isFormValid = computed(() => {
  const shortcut = form.value.shortcut?.trim().toLowerCase();
  const title = form.value.title?.trim();
  const content = form.value.content?.trim();
  return shortcut && /^[a-z0-9_-]+$/.test(shortcut) && title && content;
});

onMounted(() => {
  fetchQuickMessages();
});

async function fetchQuickMessages() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/quick-messages');
    quickMessages.value = res.data.quickMessages || [];
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Không thể tải danh sách tin nhắn mẫu';
  } finally {
    loading.value = false;
  }
}

function canModify(item: any): boolean {
  if (authStore.isAdmin) return true;
  return !item.isShared && item.userId === authStore.user?.id;
}

function openCreateDialog() {
  dialogError.value = '';
  form.value = {
    id: '',
    shortcut: '',
    title: '',
    content: '',
    isShared: false,
    imageUrl: '',
  };
  dialogOpen.value = true;
}

function openEditDialog(item: any) {
  dialogError.value = '';
  form.value = {
    id: item.id,
    shortcut: item.shortcut,
    title: item.title,
    content: item.content,
    isShared: item.isShared,
    imageUrl: getImageUrl(item),
  };
  dialogOpen.value = true;
}

async function saveQuickMessage() {
  if (!isFormValid.value) return;

  saving.value = true;
  dialogError.value = '';

  const payload = {
    shortcut: form.value.shortcut.trim().toLowerCase(),
    title: form.value.title.trim(),
    content: form.value.content.trim(),
    isShared: form.value.isShared,
    attachments: form.value.imageUrl.trim()
      ? [{ type: 'image', url: form.value.imageUrl.trim() }]
      : [],
  };

  try {
    if (form.value.id) {
      await api.put(`/quick-messages/${form.value.id}`, payload);
      success.value = 'Đã cập nhật tin nhắn mẫu thành công';
    } else {
      await api.post('/quick-messages', payload);
      success.value = 'Đã thêm tin nhắn mẫu mới thành công';
    }
    dialogOpen.value = false;
    fetchQuickMessages();
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Có lỗi xảy ra khi lưu tin nhắn mẫu';
  } finally {
    saving.value = false;
  }
}

function confirmDelete(item: any) {
  selectedItem.value = item;
  deleteConfirmOpen.value = true;
}

async function deleteQuickMessage() {
  if (!selectedItem.value) return;

  deleting.value = true;
  try {
    await api.delete(`/quick-messages/${selectedItem.value.id}`);
    success.value = 'Đã xóa tin nhắn mẫu thành công';
    deleteConfirmOpen.value = false;
    fetchQuickMessages();
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Không thể xóa tin nhắn mẫu';
    deleteConfirmOpen.value = false;
  } finally {
    deleting.value = false;
    selectedItem.value = null;
  }
}
</script>

<style scoped>
.text-truncate-custom {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}
.gap-1 {
  gap: 4px;
}
</style>
