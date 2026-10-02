<template>
  <div v-if="show">
    <!-- Main Navigation Drawer -->
    <v-navigation-drawer
      v-model="show"
      location="right"
      temporary
      :width="$vuetify.display.xs ? '100%' : '580'"
      style="max-width: 100vw;"
      class="contact-detail-drawer elevation-12"
    >
      <div class="d-flex flex-column h-100" style="min-height: 0; overflow: hidden; background-color: rgb(var(--v-theme-surface));">
        <!-- Drawer Header -->
        <div class="drawer-header px-4 py-3 d-flex align-center border-b flex-shrink-0 bg-surface">
          <v-btn icon variant="text" size="small" @click="close" class="mr-2" title="Đóng">
            <v-icon size="20">lucide-arrow-right</v-icon>
          </v-btn>
          <div>
            <h2 class="text-subtitle-1 font-weight-bold mb-0">
              {{ isBulk ? `Chỉnh sửa hàng loạt (${props.selectedContactIds?.length} khách hàng)` : 'Chi tiết khách hàng' }}
            </h2>
            <span v-if="isBulk" class="text-caption text-primary font-weight-medium">
              Đang chọn {{ props.selectedContactIds?.length }} khách hàng
            </span>
            <span v-else-if="props.contact?.customerId" class="text-caption text-primary font-weight-medium">
              Mã KH: #{{ props.contact.customerId }}
            </span>
          </div>
          <v-spacer />
          <v-btn
            v-if="props.contact || isBulk"
            color="primary"
            variant="flat"
            size="small"
            prepend-icon="lucide-message-square"
            class="mr-2 font-weight-bold text-none"
            :loading="openingChat"
            @click="goToChat"
          >
            {{ isBulk ? `Nhắn tin (${props.selectedContactIds?.length})` : 'Nhắn tin' }}
          </v-btn>
          <v-btn
            v-if="!isBulk && props.contact"
            color="error"
            variant="text"
            size="small"
            prepend-icon="lucide-trash-2"
            class="mr-1 text-none"
            :loading="deleting"
            @click="onDelete"
          >
            Xoá
          </v-btn>
          <v-btn icon variant="text" size="small" @click="close" title="Đóng">
            <v-icon size="20">lucide-x</v-icon>
          </v-btn>
        </div>

        <!-- 1. BULK UPDATE MODE -->
        <div v-if="isBulk" class="flex-grow-1 overflow-y-auto pa-4 d-flex flex-column gap-3">
          <!-- Banner -->
          <div class="pa-3 rounded-lg border bg-primary-lighten-5 d-flex align-center gap-2">
            <v-avatar color="primary" size="32" variant="tonal">
              <v-icon size="18" color="primary">lucide-users</v-icon>
            </v-avatar>
            <div class="text-caption text-primary-darken-1 font-weight-medium" style="line-height: 1.4;">
              Đang áp dụng thay đổi đồng loạt cho <strong>{{ props.selectedContactIds?.length }}</strong> khách hàng được chọn. Các trường duy nhất (Tên, SĐT, Email, v.v.) được giữ nguyên riêng biệt cho từng người.
            </div>
          </div>

          <!-- Bulk form fields -->
          <v-card variant="outlined" class="pa-4 rounded-xl">
            <v-row dense>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="bulkForm.contactType"
                  :items="CONTACT_TYPE_OPTIONS"
                  item-title="text"
                  item-value="value"
                  label="Loại tài khoản"
                  density="compact"
                  variant="outlined"
                  hide-details="auto"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="bulkForm.salutation"
                  :items="SALUTATION_OPTIONS"
                  label="Xưng hô"
                  density="compact"
                  variant="outlined"
                  hide-details="auto"
                  clearable
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="bulkForm.status"
                  :items="STATUS_OPTIONS"
                  item-title="text"
                  item-value="value"
                  label="Trạng thái"
                  density="compact"
                  variant="outlined"
                  hide-details="auto"
                  clearable
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="bulkForm.source"
                  :items="SOURCE_OPTIONS"
                  item-title="text"
                  item-value="value"
                  label="Nguồn"
                  density="compact"
                  variant="outlined"
                  hide-details="auto"
                  clearable
                />
              </v-col>
              <v-col cols="12">
                <v-select
                  v-model="bulkForm.assignedUserId"
                  :items="userOptions"
                  label="Nhân viên phụ trách"
                  density="compact"
                  variant="outlined"
                  hide-details="auto"
                  clearable
                />
              </v-col>
              <v-col cols="12">
                <TagSelector v-model="bulkForm.tags" label="Nhãn thẻ (Tags)" />
              </v-col>
              <v-col cols="12">
                <v-textarea
                  v-model="bulkForm.notes"
                  label="Ghi chú"
                  rows="2"
                  density="compact"
                  variant="outlined"
                  hide-details="auto"
                />
              </v-col>
            </v-row>
          </v-card>

          <!-- Bulk Save Footer -->
          <div class="d-flex justify-end gap-2 mt-auto pt-3 border-t">
            <v-btn variant="outlined" size="small" class="text-none" @click="close">Đóng</v-btn>
            <v-btn
              color="primary"
              variant="flat"
              size="small"
              class="text-none px-4"
              :loading="saving"
              @click="onBulkSave"
            >
              Lưu thay đổi ({{ props.selectedContactIds?.length }} KH)
            </v-btn>
          </div>
        </div>

        <!-- 2. SINGLE CONTACT DETAIL (REUSING CHAT CONTACT PANEL) -->
        <div v-else class="flex-grow-1 overflow-hidden" style="min-height: 0; height: 100%;">
          <ChatContactPanel
            v-if="props.contact"
            :contact="props.contact"
            :contact-id="props.contact?.id || null"
            :conversation="props.contact?.conversations?.[0] || null"
            @saved="onPanelSaved"
            @close="close"
          />
          <div v-else class="d-flex align-center justify-center h-100 text-medium-emphasis text-caption">
            Không tìm thấy thông tin khách hàng
          </div>
        </div>
      </div>
    </v-navigation-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  useContacts,
  STATUS_OPTIONS,
  SOURCE_OPTIONS,
  SALUTATION_OPTIONS,
  CONTACT_TYPE_OPTIONS,
  type Contact,
} from '@/composables/use-contacts';
import { useUsers } from '@/composables/use-users';
import { api } from '@/api/index';
import ChatContactPanel from '@/components/chat/ChatContactPanel.vue';
import TagSelector from '@/components/common/TagSelector.vue';

const props = defineProps<{
  modelValue: boolean;
  contact: Contact | null;
  selectedContactIds?: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [contact: Contact];
  deleted: [id: string];
}>();

const router = useRouter();
const { deleteContact, bulkUpdateContacts, bulkOpenChat } = useContacts();
const { users, fetchUsers } = useUsers();

const show = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});

const isBulk = computed(() => (props.selectedContactIds?.length || 0) > 1);

const openingChat = ref(false);
const deleting = ref(false);
const saving = ref(false);

const userOptions = computed(() => {
  return users.value
    .filter((u) => u.isActive)
    .map((u) => ({
      title: u.fullName || u.email,
      value: u.id,
    }));
});

// Bulk form state
const bulkForm = reactive({
  contactType: 'customer' as 'customer' | 'employee' | 'other',
  salutation: null as string | null,
  source: null as string | null,
  status: null as string | null,
  assignedUserId: null as string | null,
  tags: [] as string[],
  notes: '',
});

watch(
  () => props.modelValue,
  (val) => {
    if (val && isBulk.value && props.contact) {
      bulkForm.contactType = (props.contact.contactType as any) || 'customer';
      bulkForm.salutation = props.contact.salutation || null;
      bulkForm.source = props.contact.source || null;
      bulkForm.status = props.contact.status || null;
      bulkForm.assignedUserId = props.contact.assignedUserId || null;
      bulkForm.tags = Array.isArray(props.contact.tags) ? [...props.contact.tags] : [];
      bulkForm.notes = props.contact.notes || '';
    }
  },
  { immediate: true },
);

onMounted(() => {
  fetchUsers();
});

function close() {
  emit('update:modelValue', false);
}

function onPanelSaved() {
  if (props.contact) {
    emit('saved', props.contact);
  }
}

async function onBulkSave() {
  if (!props.selectedContactIds?.length) return;
  saving.value = true;
  try {
    const bulkPayload: any = {
      contactType: bulkForm.contactType,
      salutation: bulkForm.salutation || null,
      source: bulkForm.source || null,
      status: bulkForm.status || null,
      assignedUserId: bulkForm.assignedUserId || null,
      notes: bulkForm.notes || null,
      tags: bulkForm.tags,
    };
    const ok = await bulkUpdateContacts(props.selectedContactIds, bulkPayload);
    if (ok) {
      emit('saved', props.contact || ({} as Contact));
      close();
    }
  } catch (err) {
    console.error('Failed to bulk update contacts:', err);
  } finally {
    saving.value = false;
  }
}

async function goToChat() {
  if (isBulk.value && props.selectedContactIds?.length) {
    openingChat.value = true;
    try {
      const res = await bulkOpenChat(props.selectedContactIds);
      if (res?.success) {
        close();
        router.push({ path: '/chat' });
      }
    } catch (err) {
      console.error('Failed to open bulk chat:', err);
    } finally {
      openingChat.value = false;
    }
    return;
  }

  if (!props.contact) return;
  openingChat.value = true;
  try {
    const res = await api.post('/zalo/start-chat-by-phone', {
      contactId: props.contact.id,
      phone: props.contact.phone || undefined,
      uid: props.contact.zaloUid || undefined,
      displayName: props.contact.fullName || props.contact.zaloName || 'Khách hàng',
      avatarUrl: props.contact.avatarUrl || undefined,
    });

    if (res.data?.conversationId) {
      close();
      router.push({ path: '/chat', query: { id: res.data.conversationId } });
    } else {
      close();
      router.push({ path: '/chat' });
    }
  } catch (err) {
    console.error('Failed to open chat from contact detail:', err);
    close();
    router.push({ path: '/chat' });
  } finally {
    openingChat.value = false;
  }
}

async function onDelete() {
  if (!props.contact?.id) return;
  const name = props.contact.fullName || props.contact.zaloName || 'này';
  if (confirm(`Bạn có chắc muốn xóa khách hàng "${name}"?`)) {
    deleting.value = true;
    try {
      const ok = await deleteContact(props.contact.id);
      if (ok) {
        emit('deleted', props.contact.id);
        close();
      }
    } finally {
      deleting.value = false;
    }
  }
}
</script>

<style scoped>
.contact-detail-drawer {
  z-index: 1050 !important;
}

.contact-detail-drawer :deep(.v-navigation-drawer__content) {
  overflow: hidden !important;
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
