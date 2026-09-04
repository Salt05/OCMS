<template>
  <div>
    <h1 class="editorial-heading mb-4">
      <v-icon class="mr-2 page-icon">lucide-settings</v-icon>
      Cài đặt
    </h1>

    <v-tabs v-model="tab" class="mb-4" :grow="$vuetify.display.smAndDown" show-arrows>
      <v-tab value="users">Nhân viên</v-tab>
      <v-tab value="teams">Đội nhóm</v-tab>
      <v-tab value="org">Tổ chức</v-tab>
      <v-tab value="tags">Thẻ & Nhóm tag</v-tab>
      <v-tab value="quick-messages">Tin nhắn mẫu</v-tab>
    </v-tabs>

    <v-window v-model="tab" :touch="false">
      <!-- Tab 1: User management -->
      <v-window-item value="users">
        <div class="d-flex align-center mb-4">
          <v-btn v-if="authStore.isAdmin" color="primary" prepend-icon="lucide-plus" @click="openCreate">
            Thêm nhân viên
          </v-btn>
        </div>

        <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable @click:close="error = ''">
          {{ error }}
        </v-alert>

        <v-card>
          <v-data-table :headers="headers" :items="users" :loading="loading" no-data-text="Chưa có nhân viên nào">
            <template #item.role="{ item }">
              <v-chip :color="roleColor(item.role)" size="small" variant="flat">{{ roleLabel(item.role) }}</v-chip>
            </template>
            <template #item.isActive="{ item }">
              <v-tooltip
                :text="authStore.isAdmin && item.id !== authStore.user?.id && (authStore.isOwner || item.role !== 'owner') ? (item.isActive ? 'Nhấn để vô hiệu hóa tài khoản' : 'Nhấn để kích hoạt lại tài khoản') : ''"
                location="top"
              >
                <template #activator="{ props }">
                  <v-chip
                    v-bind="props"
                    :color="item.isActive ? 'success' : 'default'"
                    size="small"
                    variant="flat"
                    :style="authStore.isAdmin && item.id !== authStore.user?.id && (authStore.isOwner || item.role !== 'owner') ? 'cursor: pointer;' : ''"
                    @click="authStore.isAdmin && item.id !== authStore.user?.id && (authStore.isOwner || item.role !== 'owner') && promptToggleStatus(item)"
                  >
                    <v-icon start size="14">{{ item.isActive ? 'lucide-check-circle' : 'lucide-ban' }}</v-icon>
                    {{ item.isActive ? 'Hoạt động' : 'Vô hiệu' }}
                  </v-chip>
                </template>
              </v-tooltip>
            </template>
            <template #item.actions="{ item }">
              <v-btn v-if="authStore.isAdmin" icon size="small" title="Chỉnh sửa" @click="openEdit(item)">
                <v-icon>lucide-pencil</v-icon>
              </v-btn>
              <v-btn v-if="authStore.isAdmin && (authStore.isOwner || item.role !== 'owner')" icon size="small" title="Đặt lại mật khẩu" @click="openPassword(item)">
                <v-icon>lucide-key-round</v-icon>
              </v-btn>
              <v-btn
                v-if="authStore.isAdmin && item.id !== authStore.user?.id && (authStore.isOwner || item.role !== 'owner')"
                icon
                size="small"
                :color="item.isActive ? 'error' : 'success'"
                :title="item.isActive ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt lại tài khoản'"
                @click="promptToggleStatus(item)"
              >
                <v-icon>{{ item.isActive ? 'lucide-user-x' : 'lucide-user-check' }}</v-icon>
              </v-btn>
            </template>
          </v-data-table>
        </v-card>

        <!-- Create dialog -->
        <v-dialog v-model="showCreate" max-width="440">
          <v-card>
            <v-card-title>Thêm nhân viên</v-card-title>
            <v-card-text>
              <v-text-field v-model="form.fullName" label="Họ tên *" class="mb-2" />
              <v-text-field v-model="form.email" label="Email *" type="email" class="mb-2" />
              <v-text-field v-model="form.password" label="Mật khẩu *" type="password" class="mb-2" />
              <v-select v-model="form.role" :items="roleOptions" item-title="label" item-value="value" label="Vai trò" />
              <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showCreate = false">Hủy</v-btn>
              <v-btn color="primary" :loading="saving" @click="handleCreate">Tạo</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Edit dialog -->
        <v-dialog v-model="showEdit" max-width="440">
          <v-card>
            <v-card-title>Chỉnh sửa nhân viên</v-card-title>
            <v-card-text>
              <v-text-field v-model="form.fullName" label="Họ tên" class="mb-2" />
              <v-text-field v-model="form.email" label="Email" type="email" class="mb-2" />
              <v-autocomplete
                v-model="form.odooId"
                :items="odooEmployees"
                :loading="loadingOdooEmployees"
                :item-title="item => item && typeof item === 'object' ? item.name : item"
                item-value="idStr"
                label="Liên kết với Nhân viên Odoo (Tùy chọn)"
                class="mb-2"
                hint="Tìm kiếm và chọn nhân viên Odoo"
                persistent-hint
                clearable
                @update:search="searchOdooEmployees"
              >
                <template #item="{ props, item }">
                  <v-list-item v-bind="props">
                    <template v-slot:title>
                      {{ (item.raw || item)?.name || 'Chưa có tên' }}
                    </template>
                    <template v-slot:subtitle>
                      {{ (item.raw || item)?.work_email || (item.raw || item)?.job_title || 'Không có thông tin' }}
                    </template>
                  </v-list-item>
                </template>
              </v-autocomplete>
              <v-select v-if="authStore.isOwner" v-model="form.role" :items="roleOptions" item-title="label" item-value="value" label="Vai trò" class="mb-2" />
              <v-switch
                v-if="authStore.isAdmin && (authStore.isOwner || selectedUser?.role !== 'owner') && selectedUser?.id !== authStore.user?.id"
                v-model="form.isActive"
                color="success"
                :label="form.isActive ? 'Trạng thái: Đang hoạt động' : 'Trạng thái: Vô hiệu hóa'"
                hide-details
                class="mt-1"
              />
              <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showEdit = false">Hủy</v-btn>
              <v-btn color="primary" :loading="saving" @click="handleUpdate">Lưu</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Reset password dialog -->
        <v-dialog v-model="showPassword" max-width="400">
          <v-card>
            <v-card-title>Đặt lại mật khẩu</v-card-title>
            <v-card-text>
              <v-text-field v-model="newPassword" label="Mật khẩu mới *" type="password" />
              <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showPassword = false">Hủy</v-btn>
              <v-btn color="primary" :loading="saving" @click="handlePassword">Đặt lại</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Status toggle confirm dialog -->
        <v-dialog v-model="showStatusConfirm" max-width="440">
          <v-card>
            <v-card-title class="d-flex align-center">
              <v-icon :color="targetStatus ? 'success' : 'error'" class="mr-2">
                {{ targetStatus ? 'lucide-user-check' : 'lucide-user-x' }}
              </v-icon>
              {{ targetStatus ? 'Xác nhận kích hoạt tài khoản' : 'Xác nhận vô hiệu hóa tài khoản' }}
            </v-card-title>
            <v-card-text>
              Bạn có chắc muốn {{ targetStatus ? 'kích hoạt lại' : 'vô hiệu hóa' }} tài khoản nhân viên 
              <strong>"{{ selectedUser?.fullName || selectedUser?.email }}"</strong> không?
              <div v-if="!targetStatus" class="text-caption text-medium-emphasis mt-2">
                * Nhân viên bị vô hiệu hóa sẽ không thể đăng nhập hoặc thao tác trên hệ thống.
              </div>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn variant="text" @click="showStatusConfirm = false">Hủy</v-btn>
              <v-btn :color="targetStatus ? 'success' : 'error'" :loading="saving" @click="handleToggleStatus">
                {{ targetStatus ? 'Kích hoạt' : 'Vô hiệu hóa' }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-window-item>

      <!-- Tab 2: Team management -->
      <v-window-item value="teams">
        <TeamManagement />
      </v-window-item>

      <!-- Tab 3: Organization settings -->
      <v-window-item value="org">
        <OrgSettings />
      </v-window-item>

      <!-- Tab 4: Tags & Tag Groups settings -->
      <v-window-item value="tags">
        <TagsSettingsTab />
      </v-window-item>

      <!-- Tab 5: Quick Messages templates -->
      <v-window-item value="quick-messages">
        <QuickMessagesTab />
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api';
import { useUsers, type OrgUser } from '@/composables/use-users';
import { useAuthStore } from '@/stores/auth';
import TeamManagement from '@/components/settings/TeamManagement.vue';
import OrgSettings from '@/components/settings/OrgSettings.vue';
import TagsSettingsTab from '@/components/settings/TagsSettingsTab.vue';
import QuickMessagesTab from '@/components/settings/QuickMessagesTab.vue';

const { users, loading, error, fetchUsers, createUser, updateUser, resetPassword, toggleUserActive } = useUsers();
const authStore = useAuthStore();

const tab = ref('users');
const showCreate = ref(false);
const showEdit = ref(false);
const showPassword = ref(false);
const showStatusConfirm = ref(false);
const targetStatus = ref(true);
const saving = ref(false);
const dialogError = ref('');
const newPassword = ref('');
const selectedUser = ref<OrgUser | null>(null);
const odooEmployees = ref<any[]>([]);
const loadingOdooEmployees = ref(false);
let searchOdooTimeout: any = null;

const form = ref({ fullName: '', email: '', password: '', role: 'member', odooId: '', isActive: true });

const roleOptions = [
  { label: 'Nhân viên', value: 'member' },
  { label: 'Quản trị viên', value: 'admin' },
];

const headers = [
  { title: 'Họ tên', key: 'fullName', sortable: true },
  { title: 'Email', key: 'email' },
  { title: 'Odoo ID', key: 'odooId' },
  { title: 'Vai trò', key: 'role', sortable: true },
  { title: 'Trạng thái', key: 'isActive', sortable: true },
  { title: 'Hành động', key: 'actions', sortable: false, align: 'end' as const },
];

function roleColor(role: string) {
  if (role === 'owner') return 'primary';
  if (role === 'admin') return 'info';
  return 'default';
}

function roleLabel(role: string) {
  if (role === 'owner') return 'Chủ sở hữu';
  if (role === 'admin') return 'Quản trị viên';
  return 'Nhân viên';
}

function openCreate() {
  form.value = { fullName: '', email: '', password: '', role: 'member', odooId: '', isActive: true };
  dialogError.value = '';
  showCreate.value = true;
}

function openEdit(user: OrgUser) {
  selectedUser.value = user;
  form.value = {
    fullName: user.fullName,
    email: user.email,
    password: '',
    role: user.role,
    odooId: user.odooId || '',
    isActive: user.isActive,
  };
  dialogError.value = '';
  odooEmployees.value = [];
  if (form.value.odooId) {
    fetchOdooEmployee(form.value.odooId);
  }
  searchOdooEmployees('');
  showEdit.value = true;
}

async function searchOdooEmployees(query: string) {
  if (query === null || query === undefined) return;
  clearTimeout(searchOdooTimeout);
  searchOdooTimeout = setTimeout(async () => {
    loadingOdooEmployees.value = true;
    try {
      const res = await api.get(`/odoo/employees?query=${encodeURIComponent(query)}`);
      if (res.data && res.data.employees) {
        odooEmployees.value = res.data.employees.map((e: any) => ({
          ...e,
          idStr: String(e.id),
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      loadingOdooEmployees.value = false;
    }
  }, 500);
}

async function fetchOdooEmployee(id: string) {
  if (!id) return;
  try {
    const res = await api.get(`/odoo/employees/${id}`);
    if (res.data && res.data.employee) {
      const emp = res.data.employee;
      const idStr = String(emp.id);
      if (!odooEmployees.value.find(e => e.idStr === idStr)) {
        odooEmployees.value.push({ ...emp, idStr });
      }
    }
  } catch (e) {
    console.error(e);
  }
}

function openPassword(user: OrgUser) {
  selectedUser.value = user;
  newPassword.value = '';
  dialogError.value = '';
  showPassword.value = true;
}

function promptToggleStatus(user: OrgUser) {
  selectedUser.value = user;
  targetStatus.value = !user.isActive;
  showStatusConfirm.value = true;
}

async function handleToggleStatus() {
  if (!selectedUser.value) return;
  saving.value = true;
  dialogError.value = '';
  const res = await toggleUserActive(selectedUser.value.id, targetStatus.value);
  saving.value = false;
  if (res.ok) {
    showStatusConfirm.value = false;
  } else {
    error.value = res.error || 'Không thể thay đổi trạng thái nhân viên';
    showStatusConfirm.value = false;
  }
}

async function handleCreate() {
  saving.value = true;
  dialogError.value = '';
  const res = await createUser(form.value);
  saving.value = false;
  if (res.ok) { showCreate.value = false; } else { dialogError.value = res.error || ''; }
}

async function handleUpdate() {
  if (!selectedUser.value) return;
  saving.value = true;
  dialogError.value = '';
  const res = await updateUser(selectedUser.value.id, {
    fullName: form.value.fullName,
    email: form.value.email,
    role: form.value.role,
    odooId: form.value.odooId,
    isActive: form.value.isActive,
  });
  saving.value = false;
  if (res.ok) { showEdit.value = false; } else { dialogError.value = res.error || ''; }
}

async function handlePassword() {
  if (!selectedUser.value) return;
  saving.value = true;
  dialogError.value = '';
  const res = await resetPassword(selectedUser.value.id, newPassword.value);
  saving.value = false;
  if (res.ok) { showPassword.value = false; } else { dialogError.value = res.error || ''; }
}

onMounted(fetchUsers);
</script>
