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
              <v-chip :color="item.isActive ? 'success' : 'default'" size="small" variant="flat">
                {{ item.isActive ? 'Hoạt động' : 'Vô hiệu' }}
              </v-chip>
            </template>
            <template #item.actions="{ item }">
              <v-btn v-if="authStore.isAdmin" icon size="small" title="Chỉnh sửa" @click="openEdit(item)">
                <v-icon>lucide-pencil</v-icon>
              </v-btn>
              <v-btn v-if="authStore.isAdmin" icon size="small" title="Đặt lại mật khẩu" @click="openPassword(item)">
                <v-icon>lucide-key-round</v-icon>
              </v-btn>
              <v-btn v-if="authStore.isOwner && item.id !== authStore.user?.id" icon size="small" color="error" title="Vô hiệu hóa" @click="confirmDelete(item)">
                <v-icon>lucide-trash-2</v-icon>
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
              <v-select v-if="authStore.isOwner" v-model="form.role" :items="roleOptions" item-title="label" item-value="value" label="Vai trò" />
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

        <!-- Delete confirm dialog -->
        <v-dialog v-model="showDelete" max-width="400">
          <v-card>
            <v-card-title>Xác nhận vô hiệu hóa</v-card-title>
            <v-card-text>Bạn có chắc muốn vô hiệu hóa nhân viên "{{ selectedUser?.fullName }}"?</v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showDelete = false">Hủy</v-btn>
              <v-btn color="error" :loading="saving" @click="handleDelete">Vô hiệu hóa</v-btn>
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

const { users, loading, error, fetchUsers, createUser, updateUser, resetPassword, deleteUser } = useUsers();
const authStore = useAuthStore();

const tab = ref('users');
const showCreate = ref(false);
const showEdit = ref(false);
const showPassword = ref(false);
const showDelete = ref(false);
const saving = ref(false);
const dialogError = ref('');
const newPassword = ref('');
const selectedUser = ref<OrgUser | null>(null);
const odooEmployees = ref<any[]>([]);
const loadingOdooEmployees = ref(false);
let searchOdooTimeout: any = null;

const form = ref({ fullName: '', email: '', password: '', role: 'member', odooId: '' });

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
  form.value = { fullName: '', email: '', password: '', role: 'member', odooId: '' };
  dialogError.value = '';
  showCreate.value = true;
}

function openEdit(user: OrgUser) {
  selectedUser.value = user;
  form.value = { fullName: user.fullName, email: user.email, password: '', role: user.role, odooId: user.odooId || '' };
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

function confirmDelete(user: OrgUser) {
  selectedUser.value = user;
  showDelete.value = true;
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
  const res = await updateUser(selectedUser.value.id, { fullName: form.value.fullName, email: form.value.email, role: form.value.role, odooId: form.value.odooId });
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

async function handleDelete() {
  if (!selectedUser.value) return;
  saving.value = true;
  const res = await deleteUser(selectedUser.value.id);
  saving.value = false;
  if (res.ok) { showDelete.value = false; }
}

onMounted(fetchUsers);
</script>
