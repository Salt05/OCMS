<template>
  <v-dialog v-model="open" max-width="520">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2" color="cyan">mdi-shield-account</v-icon>
        Phân quyền truy cập — {{ accountName }}
      </v-card-title>

      <v-card-text>
        <v-progress-linear v-if="loading" indeterminate color="cyan" class="mb-3" />

        <!-- Current access list -->
        <div v-if="accessList.length" class="mb-4">
          <div class="text-subtitle-2 mb-2">Người có quyền truy cập</div>
          <v-list density="compact" rounded="lg" variant="tonal">
            <v-list-item v-for="a in accessList" :key="a.id">
              <template #prepend>
                <v-icon color="cyan">mdi-account</v-icon>
              </template>
              <v-list-item-title>{{ a.fullName }}</v-list-item-title>
              <v-list-item-subtitle>{{ a.email }}</v-list-item-subtitle>
              <template #append>
                <v-select
                  :model-value="a.permission"
                  :items="permissionOptions"
                  item-title="label"
                  item-value="value"
                  density="compact"
                  hide-details
                  variant="outlined"
                  style="min-width: 120px;"
                  class="mr-2"
                  @update:model-value="handleUpdatePermission(a.id, $event)"
                />
                <v-btn icon size="x-small" color="error" variant="text" @click="handleRemoveAccess(a.id)">
                  <v-icon>mdi-delete</v-icon>
                </v-btn>
              </template>
            </v-list-item>
          </v-list>
        </div>
        <div v-else-if="!loading" class="text-medium-emphasis text-body-2 mb-4">
          Chưa có người dùng nào được cấp quyền
        </div>

        <!-- Add access section -->
        <v-divider class="mb-3" />
        <div class="text-subtitle-2 mb-2">Thêm người dùng</div>
        <div class="d-flex gap-2 align-start">
          <v-select
            v-model="newUserId"
            :items="availableUsers"
            item-title="fullName"
            item-value="id"
            label="Chọn nhân viên"
            density="compact"
            hide-details
            variant="outlined"
            no-data-text="Không có nhân viên để thêm"
            class="flex-grow-1"
          />
          <v-select
            v-model="newPermission"
            :items="permissionOptions"
            item-title="label"
            item-value="value"
            label="Quyền"
            density="compact"
            hide-details
            variant="outlined"
            style="min-width: 130px;"
          />
          <v-btn color="primary" :loading="saving" :disabled="!newUserId" @click="handleAddAccess">
            Thêm
          </v-btn>
        </div>
        <v-alert v-if="dialogError" type="error" density="compact" class="mt-3">{{ dialogError }}</v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Đóng</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { api } from '@/api/index';
import { useUsers } from '@/composables/use-users';

interface AccessEntry {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  permission: string;
}

const props = defineProps<{
  modelValue: boolean;
  accountId: string;
  accountName: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
}>();

const { users, fetchUsers } = useUsers();

// Writable computed to allow v-model on the dialog
const open = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const accessList = ref<AccessEntry[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogError = ref('');
const newUserId = ref('');
const newPermission = ref('read');

const permissionOptions = [
  { label: 'Xem', value: 'read' },
  { label: 'Chat', value: 'chat' },
  { label: 'Quản lý', value: 'admin' },
];

const availableUsers = computed(() => {
  const grantedIds = new Set(accessList.value.map((a) => a.userId));
  return users.value.filter((u) => !grantedIds.has(u.id));
});

async function fetchAccess() {
  if (!props.accountId) return;
  loading.value = true;
  try {
    const res = await api.get(`/zalo-accounts/${props.accountId}/access`);
    accessList.value = res.data.access ?? res.data;
  } catch {
    accessList.value = [];
  } finally {
    loading.value = false;
  }
}

async function handleAddAccess() {
  if (!newUserId.value) return;
  saving.value = true;
  dialogError.value = '';
  try {
    await api.post(`/zalo-accounts/${props.accountId}/access`, {
      userId: newUserId.value,
      permission: newPermission.value,
    });
    newUserId.value = '';
    newPermission.value = 'read';
    await fetchAccess();
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Lỗi thêm quyền truy cập';
  } finally {
    saving.value = false;
  }
}

async function handleUpdatePermission(accessId: string, permission: string) {
  try {
    await api.put(`/zalo-accounts/${props.accountId}/access/${accessId}`, { permission });
    await fetchAccess();
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Lỗi cập nhật quyền';
  }
}

async function handleRemoveAccess(accessId: string) {
  try {
    await api.delete(`/zalo-accounts/${props.accountId}/access/${accessId}`);
    await fetchAccess();
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Lỗi xóa quyền truy cập';
  }
}

watch(() => props.modelValue, (val) => {
  if (val) {
    dialogError.value = '';
    fetchAccess();
    fetchUsers();
  }
});
</script>
