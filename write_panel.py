code = """<template>
  <div class="chat-contact-panel d-flex flex-column h-100" style="width: 100%; height: 100%; overflow: hidden; background-color: rgb(var(--v-theme-surface));">
    
    <!-- 1. Profile Summary Card (Avatar, Name, UID, Ngày tạo, Cập nhật) -->
    <div class="px-4 py-3 border-b flex-shrink-0 profile-summary-card">
      <div class="d-flex align-center justify-space-between gap-3">
        <!-- Left: Avatar & Name -->
        <div class="d-flex align-center gap-3 overflow-hidden">
          <v-avatar size="48" color="primary" variant="flat" class="elevation-1 flex-shrink-0">
            <v-img v-if="contact?.avatarUrl || conversation?.contact?.avatarUrl" :src="contact?.avatarUrl || conversation?.contact?.avatarUrl" />
            <v-icon v-else size="24" color="white">lucide-user</v-icon>
          </v-avatar>
          <div class="overflow-hidden">
            <div class="d-flex align-center gap-1.5 flex-wrap">
              <span class="text-subtitle-1 font-weight-bold text-truncate" style="color: rgb(var(--v-theme-on-surface)); line-height: 1.2;">
                {{ form.fullName || conversation?.contact?.fullName || conversation?.contact?.zaloName || 'Chưa đặt tên' }}
              </span>
              <v-chip v-if="form.customerId" size="x-small" color="primary" variant="flat" class="font-weight-bold">
                #{{ form.customerId }}
              </v-chip>
            </div>
            <div v-if="form.status" class="mt-1">
              <v-chip :color="statusColor(form.status)" size="x-small" variant="tonal" class="font-weight-bold" style="font-size: 10px; height: 18px;">
                {{ statusLabel(form.status) }}
              </v-chip>
            </div>
          </div>
        </div>

        <!-- Right: UID, Ngày tạo, Cập nhật -->
        <div class="d-flex flex-column gap-1 text-caption flex-shrink-0 profile-meta-box">
          <div class="d-flex align-center justify-space-between gap-2">
            <span class="text-medium-emphasis">UID:</span>
            <span class="font-weight-medium font-monospace text-high-emphasis text-right text-truncate" style="max-width: 130px;" :title="contact?.zaloUid || conversation?.contact?.zaloUid || ''">
              {{ contact?.zaloUid || conversation?.contact?.zaloUid || '—' }}
            </span>
          </div>
          <div class="d-flex align-center justify-space-between gap-2">
            <span class="text-medium-emphasis">Ngày tạo:</span>
            <span class="font-weight-medium text-high-emphasis text-right">
              {{ contact?.createdAt ? formatDateShort(contact.createdAt) : '—' }}
            </span>
          </div>
          <div class="d-flex align-center justify-space-between gap-2">
            <span class="text-medium-emphasis">Cập nhật:</span>
            <span class="font-weight-medium text-high-emphasis text-right">
              {{ contact?.updatedAt ? formatDateShort(contact.updatedAt) : '—' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. Tabs Navigation -->
    <v-tabs v-model="activeTab" color="primary" density="compact" class="border-b px-2 flex-shrink-0 panel-tabs">
      <v-tab value="info" class="text-caption font-weight-bold">Thông tin</v-tab>
      <v-tab value="appointments" class="text-caption font-weight-bold">
        Lịch hẹn ({{ contactAppointments.length }})
      </v-tab>
      <v-tab value="orders" class="text-caption font-weight-bold">Đơn hàng</v-tab>
    </v-tabs>

    <!-- 3. Tab Body -->
    <div class="flex-grow-1 overflow-y-auto px-4 py-3 custom-scrollbar" style="min-height: 0;">
      
      <!-- TAB 1: THÔNG TIN -->
      <div v-show="activeTab === 'info'" class="d-flex flex-column gap-3">
        
        <!-- Card 1: HỒ SƠ KHÁCH HÀNG -->
        <v-card variant="outlined" class="rounded-xl pa-3 customer-profile-card">
          <div class="d-flex align-center justify-space-between mb-3 pb-2 border-b">
            <div class="d-flex align-center gap-2">
              <div class="card-icon-badge">
                <v-icon size="16" color="primary">lucide-user-cog</v-icon>
              </div>
              <span class="text-subtitle-2 font-weight-bold text-primary tracking-wide">HỒ SƠ KHÁCH HÀNG</span>
            </div>
          </div>

          <v-row dense>
            <!-- Loại tài khoản -->
            <v-col cols="12">
              <v-select
                v-model="form.contactType"
                :items="[{ title: 'Khách hàng', value: 'customer' }, { title: 'Nhân viên', value: 'employee' }, { title: 'Khác', value: 'other' }]"
                item-title="title"
                item-value="value"
                label="Loại tài khoản"
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-users"
                hide-details="auto"
                class="mb-2"
              />
            </v-col>

            <!-- ID Customer -->
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.customerId"
                label="ID Customer"
                placeholder="VD: 16586"
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-hash"
                hide-details="auto"
                class="mb-2"
                :readonly="!!form.customerId"
              >
                <template v-if="form.customerId" #append-inner>
                  <v-btn
                    icon="lucide-unlink"
                    variant="text"
                    color="error"
                    size="x-small"
                    density="compact"
                    title="Hủy liên kết Odoo"
                    @click.stop="form.customerId = ''"
                  />
                </template>
              </v-text-field>
            </v-col>

            <!-- Phân loại Odoo -->
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.isCompany"
                :items="[{ title: 'Cá nhân', value: false }, { title: 'Công ty', value: true }]"
                item-title="title"
                item-value="value"
                label="Phân loại (Odoo)"
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-building"
                hide-details="auto"
                class="mb-2"
              />
            </v-col>

            <!-- Tên khách hàng -->
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.fullName"
                label="Tên khách hàng"
                placeholder="Tên chính thức Odoo..."
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-user"
                hide-details="auto"
                class="mb-2"
              />
            </v-col>

            <!-- Tên liên lạc (Zalo) -->
            <v-col cols="12" sm="6">
              <v-text-field
                :model-value="form.zaloName || contact?.zaloName || conversation?.contact?.zaloName || 'Khách hàng Zalo'"
                label="Tên liên lạc"
                readonly
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-message-circle"
                hide-details="auto"
                class="mb-2"
              />
            </v-col>

            <!-- Số điện thoại -->
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.phone"
                label="Số điện thoại"
                placeholder="09xxxxxxx..."
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-phone"
                hide-details="auto"
                class="mb-2"
              />
            </v-col>

            <!-- Email -->
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.email"
                label="Email"
                placeholder="email@example.com"
                type="email"
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-mail"
                hide-details="auto"
                class="mb-2"
              />
            </v-col>

            <!-- Địa chỉ (Address) -->
            <v-col cols="12">
              <v-text-field
                v-model="form.address"
                label="Địa chỉ (Address)"
                placeholder="Số nhà, tên đường, phường/xã..."
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-map-pin"
                hide-details="auto"
                class="mb-2"
              />
            </v-col>

            <!-- Khu vực (Zone) -->
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.zone"
                label="Khu vực (Zone)"
                placeholder="Quận/Huyện, Tỉnh..."
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-map"
                hide-details="auto"
                class="mb-2"
              />
            </v-col>

            <!-- Nhân viên CSKH -->
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.assignedUserId"
                :items="users"
                item-title="fullName"
                item-value="id"
                label="Nhân viên CSKH"
                placeholder="Chọn nhân viên..."
                density="compact"
                variant="outlined"
                clearable
                prepend-inner-icon="lucide-user-check"
                hide-details="auto"
                class="mb-2"
              />
            </v-col>

            <!-- Trạng thái -->
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.status"
                :items="STATUS_OPTIONS"
                item-title="text"
                item-value="value"
                label="Trạng thái"
                density="compact"
                variant="outlined"
                clearable
                hide-details="auto"
                class="mb-2"
              />
            </v-col>

            <!-- Nguồn -->
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.source"
                :items="SOURCE_OPTIONS"
                item-title="text"
                item-value="value"
                label="Nguồn"
                density="compact"
                variant="outlined"
                clearable
                hide-details="auto"
                class="mb-2"
              />
            </v-col>

            <!-- Tag phân loại -->
            <v-col cols="12" class="mb-2">
              <TagSelector v-model="form.tags" label="Tag phân loại" />
            </v-col>

            <!-- Ghi chú -->
            <v-col cols="12" class="mb-2">
              <v-textarea
                v-model="form.notes"
                label="Ghi chú"
                placeholder="Nhập ghi chú chăm sóc..."
                rows="2"
                density="compact"
                variant="outlined"
                hide-details="auto"
                auto-grow
              />
            </v-col>

            <!-- Nút Lưu -->
            <v-col cols="12" class="mt-2">
              <v-btn color="primary" block :loading="saving" @click="saveContact" rounded="lg">
                Lưu thông tin CRM
              </v-btn>
              <v-alert v-if="saveSuccess" type="success" density="compact" class="mt-2" closable @click:close="saveSuccess = false">
                Đã lưu thành công!
              </v-alert>
              <v-alert v-if="saveError" type="error" density="compact" class="mt-2" closable @click:close="saveError = false">
                Lưu thất bại, thử lại!
              </v-alert>
            </v-col>
          </v-row>
        </v-card>

        <!-- Card 2: TRA CỨU DỮ LIỆU TỪ ODOO -->
        <v-card variant="outlined" class="rounded-xl pa-3 odoo-lookup-card">
          <div class="d-flex align-center justify-space-between mb-3 pb-2 border-b">
            <div class="d-flex align-center gap-2">
              <div class="card-icon-badge">
                <v-icon size="16" color="primary">lucide-database</v-icon>
              </div>
              <span class="text-subtitle-2 font-weight-bold text-primary tracking-wide">TRA CỨU DỮ LIỆU TỪ ODOO</span>
            </div>
            <v-chip size="x-small" color="primary" variant="tonal" class="font-weight-medium px-2">
              Đọc dữ liệu Odoo
            </v-chip>
          </div>

          <div class="d-flex align-center gap-2 mb-2">
            <v-text-field
              v-model="odooSearchId"
              label="ID / SĐT Khách hàng Odoo"
              placeholder="Nhập ID hoặc SĐT..."
              density="compact"
              variant="outlined"
              prepend-inner-icon="lucide-hash"
              :loading="loadingOdoo"
              clearable
              hide-details
              class="flex-grow-1"
              @keyup.enter="lookupOdooCustomer(odooSearchId)"
            />
            <v-btn
              color="primary"
              variant="flat"
              height="40"
              class="px-4 font-weight-bold rounded-lg flex-shrink-0"
              :loading="loadingOdoo"
              prepend-icon="lucide-search"
              @click="lookupOdooCustomer(odooSearchId)"
            >
              Tìm kiếm
            </v-btn>
          </div>

          <div class="d-flex justify-start mb-2">
            <v-btn
              color="primary"
              variant="tonal"
              prepend-icon="lucide-plus"
              size="small"
              class="font-weight-medium rounded-pill px-3"
              :loading="creatingOdoo"
              @click="createOdooCustomer"
            >
              Tạo mới trên Odoo
            </v-btn>
          </div>

          <div v-if="hasSearchedOdoo && odooCustomer" class="mt-3 pt-3 border-t">
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-caption font-weight-bold text-success d-flex align-center gap-1">
                <v-icon size="14">lucide-check-circle</v-icon> Thông tin Odoo tìm thấy
              </span>
              <v-chip size="x-small" color="primary" variant="flat" class="font-weight-bold">
                Mã Odoo #{{ odooCustomer.id }}
              </v-chip>
            </div>

            <v-table density="compact" class="border rounded-lg text-caption mb-3 odoo-result-table" style="font-size: 11.5px;">
              <tbody>
                <tr>
                  <td class="font-weight-bold text-medium-emphasis py-1.5" style="width: 130px;">Customer Name</td>
                  <td class="font-weight-bold text-high-emphasis py-1.5">{{ odooCustomer.name || '—' }}</td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-medium-emphasis py-1.5">Phone</td>
                  <td class="font-weight-medium text-high-emphasis py-1.5">{{ odooCustomer.phone || odooCustomer.mobile || '—' }}</td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-medium-emphasis py-1.5">Address</td>
                  <td class="text-high-emphasis py-1.5">{{ odooCustomer.fullAddress || odooCustomer.street || '—' }}</td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-medium-emphasis py-1.5">Zone</td>
                  <td class="text-high-emphasis py-1.5">{{ odooCustomer.zone || odooCustomer.state || odooCustomer.city || '—' }}</td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-medium-emphasis py-1.5">Nhân viên CSKH</td>
                  <td class="text-high-emphasis py-1.5">{{ odooCustomer.salesperson || '—' }}</td>
                </tr>
                <tr>
                  <td class="font-weight-bold text-medium-emphasis py-1.5">Email</td>
                  <td class="text-high-emphasis py-1.5">{{ odooCustomer.email || '—' }}</td>
                </tr>
              </tbody>
            </v-table>

            <div class="d-flex justify-end">
              <v-btn
                color="success"
                size="small"
                variant="flat"
                prepend-icon="lucide-link"
                class="font-weight-bold rounded-lg px-3"
                @click="confirmApplyOdooData"
              >
                Liên kết Odoo
              </v-btn>
            </div>
          </div>

          <v-alert
            v-else-if="hasSearchedOdoo && odooError"
            density="compact"
            type="warning"
            variant="tonal"
            class="text-caption mt-2 mb-0 rounded-lg"
          >
            {{ odooError }}
          </v-alert>
        </v-card>
      </div>

      <!-- TAB 2: LỊCH HẸN -->
      <div v-show="activeTab === 'appointments'">
        <ChatAppointments
          v-if="props.contactId"
          :contact-id="props.contactId"
          :appointments="contactAppointments"
          @refresh="reloadAppointments"
        />
        <div v-else class="text-caption text-grey text-center py-4">
          Chưa có liên hệ để quản lý lịch hẹn
        </div>
      </div>

      <!-- TAB 3: ĐƠN HÀNG -->
      <div v-show="activeTab === 'orders'">
        <ChatOrders v-if="props.contactId" :contact-id="props.contactId" />
        <div v-else class="text-caption text-grey text-center py-4">
          Chưa có liên hệ để xem đơn hàng
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { api } from '@/api/index';
import type { Contact } from '@/composables/use-contacts';
import { STATUS_OPTIONS, SOURCE_OPTIONS } from '@/composables/use-contacts';
import { useChatContactPanel } from '@/composables/use-chat-contact-panel';
import { useUsers } from '@/composables/use-users';
import ChatAppointments from './ChatAppointments.vue';
import ChatOrders from './ChatOrders.vue';
import TagSelector from '@/components/common/TagSelector.vue';

const props = defineProps<{
  conversation?: any;
  contactId: string | null;
  contact: Contact | null;
  messages?: any[];
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const activeTab = ref('info');
const { users, fetchUsers } = useUsers();

const {
  form, saving, saveSuccess, saveError,
  contactAppointments,
  saveContact, reloadAppointments,
} = useChatContactPanel(
  () => props.contactId,
  () => props.contact,
  () => emit('saved'),
);

const odooSearchId = ref('');
const hasSearchedOdoo = ref(false);
const odooCustomer = ref<any>(null);
const loadingOdoo = ref(false);
const odooError = ref('');
const creatingOdoo = ref(false);

async function lookupOdooCustomer(idStr?: string | null) {
  const cleanId = (idStr || odooSearchId.value || form.customerId || '').trim();
  if (!cleanId) return;

  hasSearchedOdoo.value = true;
  loadingOdoo.value = true;
  odooError.value = '';

  try {
    const res = await api.get(/odoo/customers/);
    if (res.data?.success && res.data?.customer) {
      odooCustomer.value = res.data.customer;
      odooError.value = '';
    } else {
      odooCustomer.value = null;
      odooError.value = Không tìm thấy khách hàng # trên Odoo;
    }
  } catch (err: any) {
    odooCustomer.value = null;
    odooError.value = err.response?.data?.error || Không tìm thấy khách hàng # trên Odoo;
  } finally {
    loadingOdoo.value = false;
  }
}

function confirmApplyOdooData() {
  if (!odooCustomer.value) return;

  form.customerId = String(odooCustomer.value.id);
  if (odooCustomer.value.name) form.fullName = odooCustomer.value.name;
  if (odooCustomer.value.phone) {
    form.phone = odooCustomer.value.phone;
  } else if (odooCustomer.value.mobile) {
    form.phone = odooCustomer.value.mobile;
  }
  if (odooCustomer.value.email) form.email = odooCustomer.value.email;
  if (odooCustomer.value.fullAddress || odooCustomer.value.street) {
    form.address = odooCustomer.value.fullAddress || odooCustomer.value.street;
  }
  if (odooCustomer.value.zone || odooCustomer.value.state || odooCustomer.value.city) {
    form.zone = odooCustomer.value.zone || odooCustomer.value.state || odooCustomer.value.city;
  }
  if (odooCustomer.value.salesperson) {
    form.salesperson = odooCustomer.value.salesperson;
  }

  form.contactType = 'customer';
}

async function createOdooCustomer() {
  if (!form.fullName || !form.address || !form.zone || !form.assignedUserId) {
    odooError.value = "Vui lòng nhập đủ các trường: Tên, Địa chỉ, Khu vực, và Nhân viên CSKH";
    hasSearchedOdoo.value = true;
    return;
  }
  
  creatingOdoo.value = true;
  odooError.value = "";
  hasSearchedOdoo.value = true;
  
  try {
    const res = await api.post('/odoo/customers', {
      is_company: form.isCompany,
      name: form.fullName,
      street: form.address,
      city: form.zone,
      phone: form.phone,
      email: form.email,
      salesperson: users.value.find(u => u.id === form.assignedUserId)?.fullName || '',
    });
    
    if (res.data?.success && res.data?.id) {
      form.customerId = String(res.data.id);
      form.contactType = 'customer';
      odooCustomer.value = res.data.customer;
      odooError.value = "";
    }
  } catch (err: any) {
    odooError.value = err.response?.data?.error || "Lỗi khi tạo mới trên Odoo";
  } finally {
    creatingOdoo.value = false;
  }
}

watch(() => props.contact, (c) => {
  if (c?.customerId) {
    odooSearchId.value = c.customerId;
  }
}, { immediate: true });

onMounted(() => {
  fetchUsers();
});

function statusLabel(value: string) {
  return STATUS_OPTIONS.find(o => o.value === value)?.text ?? value;
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    new: 'grey',
    contacted: 'primary',
    interested: 'accent',
    converted: 'success',
    lost: 'error',
  };
  return map[status] ?? 'grey';
}

function formatDateShort(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
</script>

<style scoped>
.profile-summary-card {
  background-color: rgba(var(--v-theme-surface-variant), 0.35);
  transition: background-color 0.2s ease;
}

.profile-meta-box {
  font-size: 11px;
  min-width: 170px;
}

.card-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background-color: rgba(var(--v-theme-primary), 0.12);
}

.customer-profile-card,
.odoo-lookup-card {
  border-color: rgba(var(--v-border-color), 0.18) !important;
  background-color: rgb(var(--v-theme-surface));
  transition: all 0.2s ease;
}

.customer-profile-card:hover,
.odoo-lookup-card:hover {
  border-color: rgba(var(--v-theme-primary), 0.35) !important;
}

.odoo-lookup-card {
  background-color: rgba(var(--v-theme-surface-variant), 0.18);
}

.odoo-result-table {
  overflow: hidden;
  border-color: rgba(var(--v-border-color), 0.15) !important;
}

.odoo-result-table td {
  border-bottom-color: rgba(var(--v-border-color), 0.08) !important;
}
</style>
"""

with open("frontend/src/components/chat/ChatContactPanel.vue", "wb") as f:
    f.write(code.strip().encode("utf-8"))

print("SUCCESS_WRITTEN_PANEL")