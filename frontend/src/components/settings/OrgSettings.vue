<template>
  <div style="max-width: 480px;">
    <div class="text-h6 mb-4">Thông tin tổ chức</div>

    <v-card variant="outlined" class="pa-4">
      <v-text-field
        v-model="orgName"
        label="Tên tổ chức"
        :disabled="!authStore.isOwner || saving"
        variant="outlined"
        class="mb-3"
      />
      <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>
      <v-alert v-if="saved" type="success" density="compact" class="mb-3">Đã lưu thành công</v-alert>
      <v-btn
        v-if="authStore.isOwner"
        color="primary"
        :loading="saving"
        :disabled="!orgName.trim()"
        @click="handleSave"
      >
        Lưu
      </v-btn>
      <p v-else class="text-medium-emphasis text-body-2">Chỉ chủ sở hữu mới có thể chỉnh sửa thông tin tổ chức.</p>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const orgName = ref('');
const saving = ref(false);
const error = ref('');
const saved = ref(false);

async function fetchOrg() {
  try {
    const res = await api.get('/organization');
    orgName.value = res.data.name ?? '';
  } catch {
    // silently ignore — endpoint may not exist yet
  }
}

async function handleSave() {
  saving.value = true;
  error.value = '';
  saved.value = false;
  try {
    await api.put('/organization', { name: orgName.value.trim() });
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 3000);
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Lỗi lưu thông tin tổ chức';
  } finally {
    saving.value = false;
  }
}

onMounted(fetchOrg);
</script>
