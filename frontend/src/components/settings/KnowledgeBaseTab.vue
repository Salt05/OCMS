<template>
  <div>
    <!-- Header Controls: Search, Filter, Actions, Role Indicator -->
    <div class="d-flex flex-wrap align-center justify-space-between gap-3 mb-4">
      <div class="d-flex flex-wrap align-center gap-3" style="max-width: 600px; width: 100%;">
        <!-- Search -->
        <v-text-field
          v-model="search"
          placeholder="Tìm tiêu đề, từ khóa, nội dung..."
          prepend-inner-icon="lucide-search"
          density="compact"
          variant="solo-filled"
          hide-details
          clearable
          style="min-width: 240px; flex: 1;"
        />

        <!-- Category Filter -->
        <v-select
          v-model="categoryFilter"
          :items="categoryOptions"
          item-title="label"
          item-value="value"
          density="compact"
          variant="solo-filled"
          hide-details
          style="max-width: 220px; width: 100%;"
        />
      </div>

      <div class="d-flex align-center gap-2">
        <!-- Staff Read-Only Badge -->
        <v-chip
          v-if="!authStore.isAdmin"
          color="info"
          variant="tonal"
          size="small"
          prepend-icon="lucide-eye"
        >
          Chế độ xem (Nhân viên)
        </v-chip>

        <!-- Create Button (Admin Only) -->
        <v-btn
          v-if="authStore.isAdmin"
          color="primary"
          prepend-icon="lucide-plus"
          @click="openCreateDialog"
        >
          Thêm tài liệu / Chính sách
        </v-btn>
      </div>
    </div>

    <!-- Alerts -->
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable @click:close="error = ''">
      {{ error }}
    </v-alert>
    <v-alert v-if="success" type="success" variant="tonal" class="mb-4" closable @click:close="success = ''">
      {{ success }}
    </v-alert>

    <!-- Data Table -->
    <v-card variant="outlined" class="rounded-lg">
      <v-data-table
        :headers="headers"
        :items="filteredItems"
        :loading="loading"
        no-data-text="Không tìm thấy tài liệu hoặc chính sách nào"
        loading-text="Đang tải dữ liệu..."
        hover
      >
        <!-- Category Column -->
        <template #item.category="{ item }">
          <v-chip
            :color="getCategoryMeta(item.category).color"
            size="small"
            variant="flat"
            class="font-weight-medium"
          >
            <v-icon start size="14">{{ getCategoryMeta(item.category).icon }}</v-icon>
            {{ getCategoryMeta(item.category).label }}
          </v-chip>
        </template>

        <!-- Title Column -->
        <template #item.title="{ item }">
          <div class="py-1">
            <div
              class="font-weight-bold text-body-2 cursor-pointer text-primary"
              @click="openDetailDialog(item)"
              title="Nhấn để xem toàn văn"
            >
              {{ item.title }}
            </div>
            <div v-if="item.keywords" class="text-caption text-medium-emphasis mt-0 text-truncate" style="max-width: 320px;">
              <v-icon size="12" class="mr-1">lucide-tag</v-icon>
              {{ item.keywords }}
            </div>
          </div>
        </template>

        <!-- Content Preview Column -->
        <template #item.content="{ item }">
          <div class="text-caption text-medium-emphasis text-truncate-2" style="max-width: 350px;">
            {{ item.content }}
          </div>
        </template>

        <!-- Usage / Public Bot Column -->
        <template #item.isPublic="{ item }">
          <v-tooltip :text="item.isPublic ? 'AI Chatbot được phép dùng để tư vấn khách' : 'Chỉ lưu hành nội bộ'" location="top">
            <template #activator="{ props }">
              <v-chip
                v-bind="props"
                :color="item.isPublic ? 'teal' : 'default'"
                size="x-small"
                variant="tonal"
              >
                <v-icon start size="12">{{ item.isPublic ? 'lucide-bot' : 'lucide-lock' }}</v-icon>
                {{ item.isPublic ? 'AI Bot' : 'Nội bộ' }}
              </v-chip>
            </template>
          </v-tooltip>
        </template>

        <!-- Status Column -->
        <template #item.isActive="{ item }">
          <v-chip
            :color="item.isActive ? 'success' : 'default'"
            size="x-small"
            variant="flat"
          >
            {{ item.isActive ? 'Hiệu lực' : 'Tạm dừng' }}
          </v-chip>
        </template>

        <!-- Actions Column -->
        <template #item.actions="{ item }">
          <div class="d-flex align-center justify-end gap-1">
            <!-- View Details Button (Available to everyone) -->
            <v-btn
              icon
              size="small"
              variant="text"
              color="primary"
              title="Xem chi tiết"
              @click="openDetailDialog(item)"
            >
              <v-icon size="16">lucide-eye</v-icon>
            </v-btn>

            <!-- Edit Button (Admin Only) -->
            <v-btn
              v-if="authStore.isAdmin"
              icon
              size="small"
              variant="text"
              title="Chỉnh sửa"
              @click="openEditDialog(item)"
            >
              <v-icon size="16">lucide-pencil</v-icon>
            </v-btn>

            <!-- Delete Button (Admin Only) -->
            <v-btn
              v-if="authStore.isAdmin"
              icon
              size="small"
              variant="text"
              color="error"
              title="Xóa tài liệu"
              @click="confirmDelete(item)"
            >
              <v-icon size="16">lucide-trash-2</v-icon>
            </v-btn>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- 1. Detail / View Dialog (Read-only for all users) -->
    <v-dialog v-model="detailDialogOpen" max-width="680" scrollable>
      <v-card v-if="selectedItem" class="rounded-lg">
        <v-card-title class="d-flex align-center justify-space-between pa-4 border-b">
          <div class="d-flex align-center gap-2 overflow-hidden">
            <v-chip
              :color="getCategoryMeta(selectedItem.category).color"
              size="small"
              variant="flat"
            >
              <v-icon start size="14">{{ getCategoryMeta(selectedItem.category).icon }}</v-icon>
              {{ getCategoryMeta(selectedItem.category).label }}
            </v-chip>
            <span class="text-subtitle-1 font-weight-bold text-truncate">{{ selectedItem.title }}</span>
          </div>
          <v-btn icon size="small" variant="text" @click="detailDialogOpen = false">
            <v-icon size="18">lucide-x</v-icon>
          </v-btn>
        </v-card-title>

        <v-card-text class="pa-4">
          <!-- Metadata strip -->
          <div class="d-flex flex-wrap gap-2 align-center mb-4 pb-3 border-b text-caption text-medium-emphasis">
            <div class="d-flex align-center mr-3">
              <v-icon size="14" class="mr-1">lucide-calendar</v-icon>
              Cập nhật: {{ formatDate(selectedItem.updatedAt || selectedItem.createdAt) }}
            </div>
            <div class="d-flex align-center mr-3">
              <v-icon size="14" class="mr-1">{{ selectedItem.isPublic ? 'lucide-bot' : 'lucide-lock' }}</v-icon>
              {{ selectedItem.isPublic ? 'Áp dụng cho AI Chatbot' : 'Văn bản nội bộ' }}
            </div>
            <div class="d-flex align-center">
              <v-icon size="14" class="mr-1">{{ selectedItem.isActive ? 'lucide-check-circle' : 'lucide-alert-circle' }}</v-icon>
              {{ selectedItem.isActive ? 'Đang có hiệu lực' : 'Đã tạm dừng' }}
            </div>
          </div>

          <!-- Keywords -->
          <div v-if="selectedItem.keywords" class="mb-3">
            <span class="text-caption font-weight-bold text-medium-emphasis">Từ khóa tra cứu: </span>
            <span class="text-caption">{{ selectedItem.keywords }}</span>
          </div>

          <!-- Document Full Content -->
          <div class="text-caption font-weight-bold text-medium-emphasis mb-1">Nội dung văn bản / chính sách:</div>
          <v-card variant="tonal" class="pa-4 rounded-lg bg-surface-variant text-body-2 line-height-relaxed" style="white-space: pre-wrap; font-family: inherit;">
            {{ selectedItem.content }}
          </v-card>
        </v-card-text>

        <v-card-actions class="pa-4 pt-0 justify-space-between border-t mt-2">
          <v-btn
            variant="tonal"
            size="small"
            prepend-icon="lucide-copy"
            @click="copyContent(selectedItem.content)"
          >
            Sao chép nội dung
          </v-btn>

          <div class="d-flex gap-2">
            <v-btn
              v-if="authStore.isAdmin"
              variant="outlined"
              color="primary"
              size="small"
              prepend-icon="lucide-pencil"
              @click="detailDialogOpen = false; openEditDialog(selectedItem)"
            >
              Chỉnh sửa
            </v-btn>
            <v-btn variant="text" size="small" @click="detailDialogOpen = false">
              Đóng
            </v-btn>
          </div>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 2. Create / Edit Dialog (Admin / Owner Only) -->
    <v-dialog v-model="dialogOpen" max-width="600" persistent>
      <v-card class="rounded-lg">
        <v-card-title class="pa-4 border-b">
          {{ isEditMode ? 'Chỉnh sửa tài liệu / chính sách' : 'Thêm tài liệu / chính sách mới' }}
        </v-card-title>

        <v-card-text class="pa-4">
          <!-- Category Select -->
          <v-select
            v-model="form.category"
            :items="editableCategoryOptions"
            item-title="label"
            item-value="value"
            label="Phân loại văn bản *"
            density="compact"
            variant="outlined"
            class="mb-3"
          />

          <!-- Title -->
          <v-text-field
            v-model="form.title"
            label="Tiêu đề văn bản / chính sách *"
            placeholder="Ví dụ: Chính sách Đổi trả và Bảo hành"
            density="compact"
            variant="outlined"
            class="mb-3"
            :rules="[rules.required]"
          />

          <!-- Keywords -->
          <v-text-field
            v-model="form.keywords"
            label="Từ khóa tìm kiếm / AI matching (phân cách bằng dấu phẩy)"
            placeholder="đổi trả, hoàn tiền, bảo hành, phí ship..."
            density="compact"
            variant="outlined"
            class="mb-3"
            hint="Từ khóa giúp nhân viên tra cứu nhanh và AI Chatbot nhận diện câu hỏi của khách hàng"
            persistent-hint
          />

          <!-- Content -->
          <v-textarea
            v-model="form.content"
            label="Nội dung chi tiết văn bản *"
            placeholder="Nhập đầy đủ quy định, điều khoản, hướng dẫn..."
            density="compact"
            variant="outlined"
            rows="7"
            auto-grow
            class="mb-3"
            :rules="[rules.required]"
          />

          <!-- Settings row: sort order, isPublic, isActive -->
          <v-row dense class="mt-1">
            <v-col cols="12" sm="4">
              <v-text-field
                v-model.number="form.sortOrder"
                label="Thứ tự hiển thị"
                type="number"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="4" class="d-flex align-center">
              <v-switch
                v-model="form.isPublic"
                label="Cho phép AI Bot"
                color="teal"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="4" class="d-flex align-center">
              <v-switch
                v-model="form.isActive"
                label="Có hiệu lực"
                color="success"
                density="compact"
                hide-details
              />
            </v-col>
          </v-row>

          <v-alert v-if="dialogError" type="error" density="compact" variant="tonal" class="mt-3">
            {{ dialogError }}
          </v-alert>
        </v-card-text>

        <v-card-actions class="pa-4 pt-0 justify-end border-t mt-2">
          <v-btn variant="text" @click="dialogOpen = false">Hủy</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="saving"
            :disabled="!isFormValid"
            @click="saveKnowledge"
          >
            {{ isEditMode ? 'Lưu thay đổi' : 'Tạo mới' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 3. Delete Confirmation Dialog (Admin / Owner Only) -->
    <v-dialog v-model="deleteConfirmOpen" max-width="440">
      <v-card class="rounded-lg">
        <v-card-title class="d-flex align-center pa-4">
          <v-icon color="error" class="mr-2">lucide-alert-triangle</v-icon>
          Xác nhận xóa tài liệu
        </v-card-title>
        <v-card-text class="pa-4 pt-0">
          Bạn có chắc chắn muốn xóa văn bản/chính sách
          <strong>"{{ selectedItem?.title }}"</strong> không?
          <div class="text-caption text-medium-emphasis mt-2">
            Hành động này không thể hoàn tác. Chatbot AI sẽ không còn sử dụng tài liệu này khi trả lời khách.
          </div>
          <v-alert v-if="dialogError" type="error" density="compact" variant="tonal" class="mt-3">
            {{ dialogError }}
          </v-alert>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0 justify-end">
          <v-btn variant="text" @click="deleteConfirmOpen = false">Hủy</v-btn>
          <v-btn color="error" variant="flat" :loading="saving" @click="executeDelete">
            Xác nhận xóa
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Copy Toast / Snackbar -->
    <v-snackbar v-model="copiedToast" timeout="2000" color="success" location="bottom end">
      Đã sao chép nội dung vào khay nhớ tạm!
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';

interface KnowledgeItem {
  id: string;
  orgId: string;
  category: string;
  title: string;
  content: string;
  keywords?: string | null;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const authStore = useAuthStore();

// State
const knowledgeItems = ref<KnowledgeItem[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const success = ref('');
const dialogError = ref('');
const search = ref('');
const categoryFilter = ref('all');
const copiedToast = ref(false);

// Dialogs
const detailDialogOpen = ref(false);
const dialogOpen = ref(false);
const deleteConfirmOpen = ref(false);
const selectedItem = ref<KnowledgeItem | null>(null);
const isEditMode = ref(false);

// Form
const form = ref({
  id: '',
  category: 'policy',
  title: '',
  content: '',
  keywords: '',
  isPublic: true,
  isActive: true,
  sortOrder: 0,
});

// Category definition & options
const categoryOptions = [
  { label: 'Tất cả phân loại', value: 'all' },
  { label: 'Chính sách & Quy định', value: 'policy' },
  { label: 'Hỏi đáp (FAQ)', value: 'faq' },
  { label: 'Hướng dẫn sản phẩm', value: 'product_guide' },
  { label: 'Kịch bản tư vấn', value: 'script' },
];

const editableCategoryOptions = [
  { label: 'Chính sách & Quy định', value: 'policy' },
  { label: 'Hỏi đáp (FAQ)', value: 'faq' },
  { label: 'Hướng dẫn sản phẩm', value: 'product_guide' },
  { label: 'Kịch bản tư vấn', value: 'script' },
];

function getCategoryMeta(cat: string) {
  switch (cat) {
    case 'policy':
      return { label: 'Chính sách', color: 'deep-purple', icon: 'lucide-shield-check' };
    case 'faq':
      return { label: 'FAQ', color: 'teal', icon: 'lucide-help-circle' };
    case 'product_guide':
      return { label: 'Hướng dẫn', color: 'amber-darken-3', icon: 'lucide-book-open' };
    case 'script':
      return { label: 'Kịch bản', color: 'indigo', icon: 'lucide-message-square' };
    default:
      return { label: cat || 'Khác', color: 'default', icon: 'lucide-file-text' };
  }
}

// Table headers
const headers = [
  { title: 'Phân loại', key: 'category', width: '140px', sortable: true },
  { title: 'Tiêu đề & Từ khóa', key: 'title', width: '280px', sortable: true },
  { title: 'Nội dung trích đoạn', key: 'content', sortable: false },
  { title: 'Đối tượng', key: 'isPublic', width: '100px', sortable: true },
  { title: 'Trạng thái', key: 'isActive', width: '100px', sortable: true },
  { title: 'Hành động', key: 'actions', width: '120px', sortable: false, align: 'end' as const },
];

// Computed Filtered Items
const filteredItems = computed(() => {
  let list = knowledgeItems.value;

  // Filter category
  if (categoryFilter.value && categoryFilter.value !== 'all') {
    list = list.filter(item => item.category === categoryFilter.value);
  }

  // Search keyword in title, keywords, or content
  if (search.value && search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter(item => {
      const title = (item.title || '').toLowerCase();
      const content = (item.content || '').toLowerCase();
      const kw = (item.keywords || '').toLowerCase();
      return title.includes(q) || content.includes(q) || kw.includes(q);
    });
  }

  return list;
});

// Validation
const rules = {
  required: (v: string) => !!v?.trim() || 'Thông tin này là bắt buộc',
};

const isFormValid = computed(() => {
  return !!form.value.title?.trim() && !!form.value.content?.trim();
});

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function copyContent(text: string) {
  if (!text) return;
  navigator.clipboard.writeText(text);
  copiedToast.value = true;
}

// Fetch list
async function fetchKnowledge() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/knowledge');
    knowledgeItems.value = Array.isArray(res.data) ? res.data : [];
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Không thể tải danh sách tài liệu';
  } finally {
    loading.value = false;
  }
}

// Open Detail Modal
function openDetailDialog(item: KnowledgeItem) {
  selectedItem.value = item;
  detailDialogOpen.value = true;
}

// Open Create Dialog
function openCreateDialog() {
  isEditMode.value = false;
  selectedItem.value = null;
  dialogError.value = '';
  form.value = {
    id: '',
    category: categoryFilter.value !== 'all' ? categoryFilter.value : 'policy',
    title: '',
    content: '',
    keywords: '',
    isPublic: true,
    isActive: true,
    sortOrder: 0,
  };
  dialogOpen.value = true;
}

// Open Edit Dialog
function openEditDialog(item: KnowledgeItem) {
  isEditMode.value = true;
  selectedItem.value = item;
  dialogError.value = '';
  form.value = {
    id: item.id,
    category: item.category,
    title: item.title,
    content: item.content,
    keywords: item.keywords || '',
    isPublic: item.isPublic,
    isActive: item.isActive,
    sortOrder: item.sortOrder || 0,
  };
  dialogOpen.value = true;
}

// Save (Create or Update)
async function saveKnowledge() {
  if (!isFormValid.value) return;
  saving.value = true;
  dialogError.value = '';

  const payload = {
    category: form.value.category,
    title: form.value.title.trim(),
    content: form.value.content.trim(),
    keywords: form.value.keywords?.trim() || null,
    isPublic: form.value.isPublic,
    isActive: form.value.isActive,
    sortOrder: Number(form.value.sortOrder) || 0,
  };

  try {
    if (isEditMode.value && form.value.id) {
      await api.put(`/knowledge/${form.value.id}`, payload);
      success.value = 'Cập nhật tài liệu thành công';
    } else {
      await api.post('/knowledge', payload);
      success.value = 'Tạo tài liệu mới thành công';
    }
    dialogOpen.value = false;
    await fetchKnowledge();
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Có lỗi xảy ra khi lưu tài liệu';
  } finally {
    saving.value = false;
  }
}

// Confirm Delete
function confirmDelete(item: KnowledgeItem) {
  selectedItem.value = item;
  dialogError.value = '';
  deleteConfirmOpen.value = true;
}

// Execute Delete
async function executeDelete() {
  if (!selectedItem.value) return;
  saving.value = true;
  dialogError.value = '';

  try {
    await api.delete(`/knowledge/${selectedItem.value.id}`);
    success.value = 'Đã xóa tài liệu thành công';
    deleteConfirmOpen.value = false;
    await fetchKnowledge();
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Không thể xóa tài liệu này';
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  fetchKnowledge();
});
</script>

<style scoped>
.text-truncate-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.line-height-relaxed {
  line-height: 1.65;
}
</style>
