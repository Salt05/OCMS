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
        hover
        no-data-text="Chưa có tin nhắn mẫu nào"
        loading-text="Đang tải danh sách..."
        class="quick-messages-table"
        @click:row="handleRowClick"
      >
        <!-- Shortcut Column -->
        <template #item.shortcut="{ item }">
          <span class="font-weight-bold text-primary cursor-pointer">/{{ item.shortcut }}</span>
        </template>

        <!-- Title Column -->
        <template #item.title="{ item }">
          <span class="font-weight-medium cursor-pointer">{{ item.title }}</span>
        </template>

        <!-- Content Column (Truncated) -->
        <template #item.content="{ item }">
          <div v-if="item.content?.trim()" class="text-truncate-custom cursor-pointer" style="max-width: 300px;">
            {{ item.content }}
          </div>
          <span v-else class="text-grey-darken-1 font-italic text-caption">(Chỉ gửi đính kèm)</span>
        </template>

        <!-- Attachments Column (Images & Files) -->
        <template #item.attachments="{ item }">
          <div v-if="getAttachments(item).length > 0" class="d-flex align-center flex-wrap gap-1">
            <!-- Images preview -->
            <div v-if="getImageAttachments(item).length > 0" class="d-flex align-center quick-table-gallery">
              <div
                v-for="(att, idx) in getImageAttachments(item).slice(0, 2)"
                :key="idx"
                class="quick-table-thumb-wrap"
                :style="{ marginLeft: idx > 0 ? '-8px' : '0', zIndex: 10 - idx }"
                :title="att.name || `Xem ảnh ${idx + 1}`"
                @click.stop="previewLargeImage(att.url)"
              >
                <v-avatar size="30" rounded="lg" class="border elevation-1 bg-grey-lighten-4">
                  <v-img :src="att.url" cover />
                </v-avatar>
              </div>
              <v-chip
                v-if="getImageAttachments(item).length > 2"
                size="x-small"
                variant="tonal"
                color="primary"
                class="ml-1 font-weight-bold px-1"
                style="height: 20px;"
              >
                +{{ getImageAttachments(item).length - 2 }}
              </v-chip>
            </div>

            <!-- Files preview -->
            <div v-if="getFileAttachments(item).length > 0" class="d-inline-flex align-center">
              <v-chip
                size="x-small"
                variant="tonal"
                color="secondary"
                class="font-weight-medium px-1.5"
                style="height: 22px;"
                :title="getFileAttachments(item).map(f => f.name).join('\n')"
              >
                <v-icon size="12" class="mr-1">lucide-paperclip</v-icon>
                {{ getFileAttachments(item).length }} tệp
              </v-chip>
            </div>
          </div>
          <span v-else class="text-grey-lighten-1">—</span>
        </template>

        <!-- Scope / Type Column -->
        <template #item.isShared="{ item }">
          <v-tooltip location="top" text="Dùng chung toàn tổ chức (Quản trị viên quản lý)">
            <template #activator="{ props: tipProps }">
              <span v-if="item.isShared" v-bind="tipProps" class="text-info font-weight-medium text-caption d-inline-flex align-center cursor-help">
                <v-icon size="14" class="mr-1">lucide-users</v-icon>Dùng chung
              </span>
            </template>
          </v-tooltip>
          <v-tooltip location="top" text="Toàn bộ thành viên đều thấy & sử dụng. Chỉ người tạo và Quản trị viên mới được sửa/xóa.">
            <template #activator="{ props: tipProps }">
              <span v-if="!item.isShared" v-bind="tipProps" class="text-grey-darken-1 text-caption d-inline-flex align-center cursor-help">
                <v-icon size="14" class="mr-1">lucide-user</v-icon>Cá nhân
              </span>
            </template>
          </v-tooltip>
        </template>

        <!-- Creator Column -->
        <template #item.user="{ item }">
          <span class="text-caption">
            {{ item.user?.fullName || 'Hệ thống' }}
          </span>
        </template>

        <!-- Actions Column -->
        <template #item.actions="{ item }">
          <div class="d-flex align-center gap-1 justify-center" @click.stop>
            <!-- If user has permission to edit/delete -->
            <template v-if="canModify(item)">
              <v-btn
                icon
                size="small"
                variant="text"
                title="Chỉnh sửa tin nhắn mẫu"
                @click.stop="openViewOrEditDialog(item)"
              >
                <v-icon size="16">lucide-pencil</v-icon>
              </v-btn>
              <v-btn
                icon
                size="small"
                variant="text"
                color="error"
                title="Xóa tin nhắn mẫu"
                @click.stop="confirmDelete(item)"
              >
                <v-icon size="16">lucide-trash-2</v-icon>
              </v-btn>
            </template>

            <!-- If user can only view details (non-owner staff) -->
            <template v-else>
              <v-btn
                icon
                size="small"
                variant="text"
                color="primary"
                title="Xem chi tiết (Chỉ xem)"
                @click.stop="openViewOrEditDialog(item)"
              >
                <v-icon size="16">lucide-eye</v-icon>
              </v-btn>
            </template>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Create / Edit / View Details Dialog -->
    <v-dialog v-model="dialogOpen" max-width="540" persistent>
      <v-card class="rounded-lg">
        <v-card-title class="pa-4 d-flex align-center justify-space-between border-b">
          <div class="d-flex align-center gap-2">
            <v-icon v-if="isReadOnly" size="20" color="grey-darken-1">lucide-eye</v-icon>
            <v-icon v-else size="20" color="primary">lucide-message-square</v-icon>
            <span class="text-h6 font-weight-bold">
              {{ dialogTitle }}
            </span>
          </div>
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
            :readonly="isReadOnly"
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
            :readonly="isReadOnly"
            :rules="[rules.required]"
          />

          <!-- Attachments Section (Images & Files) -->
          <div class="mb-4">
            <div class="d-flex align-center justify-space-between mb-1">
              <label class="text-caption font-weight-bold text-grey-darken-2">
                Tệp & Hình ảnh đính kèm ({{ form.attachments.length }})
              </label>
              <div v-if="form.attachments.length > 0" class="d-flex align-center gap-1">
                <v-chip v-if="imageCount > 0" size="x-small" variant="tonal" color="primary" class="px-1.5" style="height: 18px;">
                  {{ imageCount }} ảnh
                </v-chip>
                <v-chip v-if="fileCount > 0" size="x-small" variant="tonal" color="secondary" class="px-1.5" style="height: 18px;">
                  {{ fileCount }} tệp
                </v-chip>
              </div>
            </div>

            <!-- Upload button & URL input (editable mode only) -->
            <div v-if="!isReadOnly" class="d-flex gap-2 mb-2">
              <v-text-field
                v-model="inputUrl"
                placeholder="Dán link ảnh hoặc tệp (https://...) rồi bấm Thêm"
                density="compact"
                variant="outlined"
                hide-details
                clearable
                prepend-inner-icon="lucide-link"
                @keydown.enter.prevent="addUrl"
              >
                <template #append-inner>
                  <v-btn
                    size="small"
                    variant="text"
                    color="primary"
                    :disabled="!inputUrl.trim()"
                    @click="addUrl"
                  >
                    Thêm URL
                  </v-btn>
                </template>
              </v-text-field>

              <v-btn
                color="primary"
                variant="tonal"
                prepend-icon="lucide-paperclip"
                :loading="uploading"
                @click="triggerFileInput"
              >
                Tải tệp / ảnh lên
              </v-btn>
              <input
                type="file"
                ref="fileInput"
                multiple
                class="d-none"
                @change="onFileChange"
              />
            </div>

            <!-- Preview Attachments Grid & List -->
            <div
              v-if="form.attachments.length > 0"
              class="attachments-preview-wrapper pa-2 rounded-lg border bg-grey-lighten-5 d-flex flex-column gap-2"
            >
              <!-- Images Sub-grid -->
              <div v-if="imageAttachments.length > 0" class="d-flex flex-wrap gap-2">
                <div
                  v-for="(att, idx) in imageAttachments"
                  :key="'img-' + idx"
                  class="position-relative preview-card rounded-lg overflow-hidden border bg-white"
                >
                  <img
                    :src="att.url"
                    class="preview-img cursor-pointer"
                    :alt="att.name || 'Ảnh đính kèm'"
                    :title="att.name || 'Click để xem ảnh lớn'"
                    @click="previewLargeImage(att.url)"
                  />
                  <!-- Remove button -->
                  <v-btn
                    v-if="!isReadOnly"
                    icon
                    size="20"
                    color="error"
                    variant="flat"
                    class="position-absolute delete-img-btn"
                    style="top: 2px; right: 2px; z-index: 5;"
                    title="Xóa ảnh này"
                    @click.stop="removeAttachment(form.attachments.indexOf(att))"
                  >
                    <v-icon size="11">lucide-x</v-icon>
                  </v-btn>
                  <span class="preview-index-tag text-caption font-weight-bold">
                    {{ idx + 1 }}
                  </span>
                </div>
              </div>

              <!-- Files Sub-list -->
              <div v-if="fileAttachments.length > 0" class="d-flex flex-column gap-1">
                <div
                  v-for="(att, idx) in fileAttachments"
                  :key="'file-' + idx"
                  class="preview-file-row pa-2 rounded-lg border bg-white d-flex align-center justify-space-between gap-2"
                >
                  <div class="d-flex align-center gap-2 text-truncate flex-grow-1">
                    <v-icon size="20" :color="getFileColor(att.name)">{{ getFileIcon(att.name) }}</v-icon>
                    <div class="text-truncate">
                      <div class="text-body-2 font-weight-medium text-truncate" :title="att.name">
                        {{ att.name }}
                      </div>
                      <div v-if="att.size" class="text-caption text-grey" style="font-size: 11px;">
                        {{ formatFileSize(att.size) }}
                      </div>
                    </div>
                  </div>

                  <div class="d-flex align-center gap-1 flex-shrink-0">
                    <v-btn
                      v-if="att.url"
                      icon
                      size="x-small"
                      variant="text"
                      color="primary"
                      title="Mở tệp trong tab mới"
                      :href="att.url"
                      target="_blank"
                    >
                      <v-icon size="14">lucide-external-link</v-icon>
                    </v-btn>
                    <v-btn
                      v-if="!isReadOnly"
                      icon
                      size="x-small"
                      variant="text"
                      color="error"
                      title="Xóa tệp này"
                      @click.stop="removeAttachment(form.attachments.indexOf(att))"
                    >
                      <v-icon size="14">lucide-trash-2</v-icon>
                    </v-btn>
                  </div>
                </div>
              </div>
            </div>
            <div v-else-if="isReadOnly" class="text-caption text-grey font-italic pa-2">
              (Không có tệp hoặc hình ảnh đính kèm)
            </div>
          </div>

          <!-- Content -->
          <v-textarea
            v-model="form.content"
            label="Nội dung tin nhắn"
            placeholder="Nhập nội dung mẫu tại đây (hoặc để trống nếu chỉ gửi ảnh/tệp đính kèm)... Dùng {fullName} để tự động điền tên khách hàng."
            prepend-inner-icon="lucide-align-left"
            density="compact"
            variant="outlined"
            rows="5"
            auto-grow
            class="mb-3"
            :readonly="isReadOnly"
            persistent-hint
            hint="Sử dụng tham số {fullName} để hệ thống tự động điền tên khách hàng khi chat. Có thể để trống nếu đã có tệp/ảnh đính kèm."
          />

          <!-- Scope Selection -->
          <div class="mb-2 pa-3 rounded-lg border bg-grey-lighten-5">
            <div class="text-caption font-weight-bold text-grey-darken-2 mb-1">
              Phạm vi áp dụng
            </div>
            <v-radio-group
              v-model="form.isShared"
              density="compact"
              hide-details
              :disabled="isReadOnly || !authStore.isAdmin"
            >
              <v-radio :value="false">
                <template #label>
                  <div>
                    <span class="font-weight-medium text-body-2">Cá nhân</span>
                    <div class="text-caption text-grey-darken-1">
                      Toàn bộ thành viên đều thấy và sử dụng khi chat. Chỉ người tạo & Quản trị viên mới có quyền sửa/xóa.
                    </div>
                  </div>
                </template>
              </v-radio>
              <v-radio :value="true" :disabled="isReadOnly || !authStore.isAdmin">
                <template #label>
                  <div>
                    <span class="font-weight-medium text-body-2">Dùng chung cho tổ chức</span>
                    <div class="text-caption text-grey-darken-1">
                      Mẫu tin nhắn dùng chung toàn công ty (chỉ Quản trị viên mới được tạo/sửa).
                    </div>
                  </div>
                </template>
              </v-radio>
            </v-radio-group>
          </div>
        </v-card-text>

        <v-card-actions class="pa-4 pt-0 justify-end">
          <v-btn variant="text" @click="dialogOpen = false">
            {{ isReadOnly ? 'Đóng' : 'Hủy' }}
          </v-btn>
          <v-btn
            v-if="!isReadOnly"
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

    <!-- Large Image Preview Dialog -->
    <v-dialog v-model="largeImageDialogOpen" max-width="700">
      <v-card class="rounded-lg">
        <div class="pa-2 d-flex justify-end border-b">
          <v-btn icon size="small" variant="text" @click="largeImageDialogOpen = false">
            <v-icon>lucide-x</v-icon>
          </v-btn>
        </div>
        <div class="pa-4 text-center bg-grey-lighten-4">
          <img
            :src="largeImageUrl"
            style="max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 8px;"
            alt="Preview lớn"
          />
        </div>
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
interface QuickMessageAttachment {
  type: 'image' | 'file';
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
}

const headers = [
  { title: 'Phím tắt', key: 'shortcut', sortable: true, width: '120px' },
  { title: 'Tiêu đề gợi nhớ', key: 'title', sortable: true, width: '180px' },
  { title: 'Đính kèm', key: 'attachments', sortable: false, width: '130px' },
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

// Upload & URL State
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const inputUrl = ref('');

function triggerFileInput() {
  fileInput.value?.click();
}

function isImageUrl(url: string): boolean {
  if (!url) return false;
  const clean = url.split('?')[0].toLowerCase();
  return /\.(jpe?g|png|webp|gif|svg|bmp|ico)$/i.test(clean);
}

function getAttachments(item: any): QuickMessageAttachment[] {
  if (!item || !item.attachments) return [];
  let raw: any[] = [];
  if (Array.isArray(item.attachments)) {
    raw = item.attachments;
  } else if (typeof item.attachments === 'string') {
    try {
      const parsed = JSON.parse(item.attachments);
      if (Array.isArray(parsed)) raw = parsed;
      else if (item.attachments.startsWith('http')) raw = [{ url: item.attachments }];
    } catch {
      if (item.attachments.startsWith('http')) raw = [{ url: item.attachments }];
    }
  }

  return raw.map<QuickMessageAttachment>((att: any) => {
    if (typeof att === 'string') {
      const isImg = isImageUrl(att);
      const name = att.split('/').pop()?.split('?')[0] || (isImg ? 'image.jpg' : 'file');
      return { type: isImg ? 'image' : 'file', url: att, name };
    }
    const url = att?.url || '';
    const isImg = att?.type === 'image' || (!att?.type && isImageUrl(url));
    const name = att?.name || url.split('/').pop()?.split('?')[0] || (isImg ? 'image.jpg' : 'file');
    return {
      type: (att?.type === 'file' || (!isImg && att?.type !== 'image')) ? 'file' : 'image',
      url,
      name,
      size: att?.size,
      mimeType: att?.mimeType,
    };
  }).filter((att: QuickMessageAttachment) => !!att.url);
}

function getImageAttachments(item: any): QuickMessageAttachment[] {
  return getAttachments(item).filter(a => a.type === 'image');
}

function getFileAttachments(item: any): QuickMessageAttachment[] {
  return getAttachments(item).filter(a => a.type === 'file');
}

function getFileIcon(name?: string): string {
  if (!name) return 'lucide-file';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'lucide-file-spreadsheet';
  if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return 'lucide-file-text';
  if (ext === 'pdf') return 'lucide-file-text';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'lucide-archive';
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return 'lucide-video';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'lucide-music';
  return 'lucide-file';
}

function getFileColor(name?: string): string {
  if (!name) return 'grey-darken-1';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'error';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'success';
  if (['doc', 'docx'].includes(ext)) return 'primary';
  if (['zip', 'rar', '7z'].includes(ext)) return 'amber-darken-2';
  return 'grey-darken-1';
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;

  uploading.value = true;
  dialogError.value = '';

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post('/quick-messages/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      if (res.data?.url) {
        const isImg = file.type.startsWith('image/') || res.data?.type === 'image' || isImageUrl(res.data.url);
        form.value.attachments.push({
          type: isImg ? 'image' : 'file',
          url: res.data.url,
          name: res.data.name || file.name,
          size: res.data.size || file.size,
          mimeType: res.data.mimeType || file.type,
        });
      }
    }
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Không thể upload tệp đính kèm';
  } finally {
    uploading.value = false;
    if (fileInput.value) {
      fileInput.value.value = '';
    }
  }
}

function addUrl() {
  const url = inputUrl.value.trim();
  if (!url) return;
  if (form.value.attachments.some(a => a.url === url)) {
    dialogError.value = 'Liên kết này đã tồn tại trong danh sách đính kèm';
    return;
  }
  const cleanUrl = url.split('?')[0].toLowerCase();
  const isImg = isImageUrl(cleanUrl);
  const name = url.split('/').pop()?.split('?')[0] || (isImg ? 'image.jpg' : 'file');
  form.value.attachments.push({
    type: isImg ? 'image' : 'file',
    url,
    name,
  });
  inputUrl.value = '';
  dialogError.value = '';
}

function removeAttachment(index: number) {
  if (index >= 0 && index < form.value.attachments.length) {
    form.value.attachments.splice(index, 1);
  }
}

// Large image modal state
const largeImageDialogOpen = ref(false);
const largeImageUrl = ref('');

function previewLargeImage(url: string) {
  largeImageUrl.value = url;
  largeImageDialogOpen.value = true;
}

// Dialog states
const dialogOpen = ref(false);
const deleteConfirmOpen = ref(false);
const dialogError = ref('');
const selectedItem = ref<any>(null);
const isReadOnly = ref(false);

// Form state
const form = ref({
  id: '',
  shortcut: '',
  title: '',
  content: '',
  isShared: false,
  attachments: [] as QuickMessageAttachment[],
  creatorName: '',
});

const imageAttachments = computed(() => form.value.attachments.filter(a => a.type === 'image'));
const fileAttachments = computed(() => form.value.attachments.filter(a => a.type === 'file'));
const imageCount = computed(() => imageAttachments.value.length);
const fileCount = computed(() => fileAttachments.value.length);

const dialogTitle = computed(() => {
  if (isReadOnly.value) return 'Chi tiết tin nhắn mẫu';
  return form.value.id ? 'Cập nhật tin nhắn mẫu' : 'Thêm tin nhắn mẫu mới';
});

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
  const hasAttachments = form.value.attachments.length > 0;
  return !!(shortcut && /^[a-z0-9_-]+$/.test(shortcut) && title && (content || hasAttachments));
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
  const currentUserId = authStore.user?.id;
  if (!currentUserId) return false;
  return item.userId === currentUserId || item.user?.id === currentUserId;
}

function handleRowClick(_event: Event, { item }: { item: any }) {
  openViewOrEditDialog(item);
}

function openCreateDialog() {
  dialogError.value = '';
  isReadOnly.value = false;
  inputUrl.value = '';
  form.value = {
    id: '',
    shortcut: '',
    title: '',
    content: '',
    isShared: false,
    attachments: [],
    creatorName: '',
  };
  dialogOpen.value = true;
}

function openViewOrEditDialog(item: any) {
  dialogError.value = '';
  inputUrl.value = '';
  isReadOnly.value = !canModify(item);
  form.value = {
    id: item.id,
    shortcut: item.shortcut,
    title: item.title,
    content: item.content || '',
    isShared: !!item.isShared,
    attachments: [...getAttachments(item)],
    creatorName: item.user?.fullName || item.user?.email || 'Người dùng',
  };
  dialogOpen.value = true;
}

async function saveQuickMessage() {
  if (isReadOnly.value || !isFormValid.value) return;

  saving.value = true;
  dialogError.value = '';

  const payload = {
    shortcut: form.value.shortcut.trim().toLowerCase(),
    title: form.value.title.trim(),
    content: form.value.content ? form.value.content.trim() : '',
    isShared: form.value.isShared,
    attachments: form.value.attachments,
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
.gap-2 {
  gap: 8px;
}
.cursor-pointer {
  cursor: pointer;
}
.cursor-help {
  cursor: help;
}

/* Quick table thumbnails */
.quick-table-gallery {
  position: relative;
}
.quick-table-thumb-wrap {
  position: relative;
  transition: transform 0.15s ease;
  cursor: pointer;
}
.quick-table-thumb-wrap:hover {
  transform: scale(1.3);
  z-index: 25 !important;
}

/* Modal preview grid */
.attachments-preview-wrapper {
  max-height: 280px;
  overflow-y: auto;
}
.preview-card {
  width: 76px;
  height: 76px;
  position: relative;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: opacity 0.15s;
}
.preview-img:hover {
  opacity: 0.9;
}
.preview-index-tag {
  position: absolute;
  bottom: 2px;
  left: 2px;
  background-color: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 4px;
  padding: 0 4px;
  font-size: 10px;
  line-height: 14px;
}
.preview-file-row {
  transition: background-color 0.15s ease;
}
.preview-file-row:hover {
  background-color: #f8fafc !important;
}
.delete-img-btn {
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

:deep(.quick-messages-table tbody tr) {
  cursor: pointer;
}
</style>
