<template>
  <div v-if="show">
    <!-- Main Navigation Drawer -->
    <v-navigation-drawer
      v-model="show"
      location="right"
      temporary
      width="540"
      class="contact-detail-drawer elevation-12"
    >
      <div class="d-flex flex-column h-100" style="min-height: 0; overflow: hidden;">
        <!-- Drawer Header -->
        <div class="drawer-header px-4 py-3 d-flex align-center border-b flex-shrink-0">
          <v-btn icon variant="text" size="small" @click="close" class="mr-2">
            <v-icon size="20">lucide-arrow-right</v-icon>
          </v-btn>
          <div>
            <h2 class="text-subtitle-1 font-weight-bold mb-0">
              {{ isNew ? 'Thêm khách hàng mới' : 'Chi tiết khách hàng' }}
            </h2>
            <span v-if="form.customerId" class="text-caption text-primary font-weight-medium">
              Mã KH: #{{ form.customerId }}
            </span>
          </div>
          <v-spacer />
          <v-btn
            v-if="!isNew"
            color="error"
            variant="text"
            size="small"
            prepend-icon="lucide-trash-2"
            :loading="deleting"
            @click="onDelete"
          >
            Xoá
          </v-btn>
          <v-btn icon variant="text" size="small" @click="close">
            <v-icon size="20">lucide-x</v-icon>
          </v-btn>
        </div>

        <!-- Quick Profile Card (when editing existing contact) -->
        <div v-if="!isNew" class="px-4 py-3 border-b flex-shrink-0 profile-summary-card">
          <div class="d-flex align-center justify-space-between gap-3">
            <!-- Left: Avatar & Name -->
            <div class="d-flex align-center gap-3 overflow-hidden">
              <v-avatar size="48" color="primary" variant="flat" class="elevation-1 flex-shrink-0">
                <v-img v-if="contact?.avatarUrl" :src="contact.avatarUrl" />
                <v-icon v-else size="24" color="white">lucide-user</v-icon>
              </v-avatar>
              <div class="overflow-hidden">
                <div class="d-flex align-center gap-1.5 flex-wrap">
                  <span class="text-subtitle-1 font-weight-bold text-truncate" style="color: rgb(var(--v-theme-on-surface)); line-height: 1.2;">
                    {{ form.fullName || 'Chưa đặt tên' }}
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

            <!-- Right: UID, Ngày tạo, Cập nhật gần đây -->
            <div class="d-flex flex-column gap-1 text-caption flex-shrink-0 profile-meta-box">
              <div class="d-flex align-center justify-space-between gap-2">
                <span class="text-medium-emphasis">UID:</span>
                <span class="font-weight-medium font-monospace text-high-emphasis text-right text-truncate" style="max-width: 130px;" :title="contact?.zaloUid || ''">
                  {{ contact?.zaloUid || '—' }}
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

        <!-- Tabs Navigation -->
        <v-tabs v-model="activeTab" color="primary" class="border-b px-2 flex-shrink-0 panel-tabs">
          <v-tab value="profile">Thông tin</v-tab>
          <v-tab v-if="!isNew" value="appointments">
            Lịch hẹn ({{ appointmentsList.length }})
          </v-tab>
          <v-tab v-if="!isNew" value="system">Dữ liệu hệ thống</v-tab>
        </v-tabs>

        <!-- Drawer Body Content -->
        <div class="flex-grow-1 overflow-y-auto px-4 py-3 custom-scrollbar" style="min-height: 0;">
          <!-- TAB 1: THÔNG TIN -->
          <div v-show="activeTab === 'profile'" class="d-flex flex-column gap-3">
            
            <!-- 1. Card HỒ SƠ KHÁCH HÀNG (Ở TRÊN) -->
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
                  <v-alert
                    v-if="form.contactType === 'other'"
                    type="warning"
                    variant="tonal"
                    density="compact"
                    class="text-caption mt-1 mb-2"
                  >
                    Lưu ý: Lưu thành "Khác" sẽ ẩn liên hệ này khỏi hệ thống đối với nhân viên và không lưu thêm tin nhắn mới.
                  </v-alert>
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

                <!-- Phân loại (Cá nhân/Công ty) -->
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

                <!-- Tên khách hàng (Customer Name odoo) -->
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="form.fullName"
                    label="Tên khách hàng"
                    placeholder="Tên chính thức Odoo / Họ tên..."
                    density="compact"
                    variant="outlined"
                    prepend-inner-icon="lucide-user"
                    :rules="[required]"
                    hide-details="auto"
                    class="mb-2"
                  />
                </v-col>

                <!-- Tên liên lạc (Tên Zalo ban đầu - Đặt đối xứng với Tên khách hàng) -->
                <v-col cols="12" sm="6">
                  <v-text-field
                    :model-value="form.zaloName || contact?.zaloName || contact?.fullName || 'Khách hàng Zalo'"
                    label="Tên liên lạc"
                    readonly
                    density="compact"
                    variant="outlined"
                    prepend-inner-icon="lucide-message-circle"
                    persistent-hint
                    class="mb-2"
                  />
                </v-col>

                <!-- Số điện thoại (sdt odoo mới nhập) -->
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

                <!-- Nhân viên phụ trách (OCMS) -->
                <v-col cols="12" sm="6">
                  <v-select
                    v-model="form.assignedUserId"
                    :items="users"
                    item-title="fullName"
                    item-value="id"
                    label="Nhân viên phụ trách"
                    placeholder="Chọn nhân viên OCMS..."
                    density="compact"
                    variant="outlined"
                    clearable
                    :readonly="!isAdmin"
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

                <!-- Tag -->
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
              </v-row>
            </v-card>

            <!-- 2. Card TRA CỨU DỮ LIỆU TỪ ODOO -->
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

              <!-- Input & Nút Tìm kiếm -->
              <div class="d-flex align-center gap-2 mb-2">
                <v-text-field
                  v-model="odooSearchId"
                  label="ID / SĐT Khách hàng Odoo"
                  placeholder="Nhập ID hoặc SĐT để tra cứu..."
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

              <!-- Nút Tạo mới trên Odoo -->
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

              <!-- Bảng kết quả Odoo (Chỉ hiển thị bảng sau khi bấm tìm kiếm) -->
              <div v-if="hasSearchedOdoo && odooCustomer" class="mt-3 pt-3 border-t">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="text-caption font-weight-bold text-success d-flex align-center gap-1">
                    <v-icon size="14">lucide-check-circle</v-icon> Thông tin Odoo tìm thấy
                  </span>
                  <v-chip size="x-small" color="primary" variant="flat" class="font-weight-bold">
                    Mã Odoo #{{ odooCustomer.id }}
                  </v-chip>
                </div>

                <!-- Bảng 6 trường thông tin Odoo -->
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

                <!-- Nút xác nhận nhập dữ liệu -->
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

              <!-- Odoo Error -->
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

        <!-- TAB 2: LỊCH HẸN & CHĂM SÓC -->
        <div v-show="activeTab === 'appointments'">
          <div v-if="appointmentsList.length === 0" class="text-center py-8 text-grey">
            <v-icon size="40" class="mb-2">lucide-calendar-x</v-icon>
            <div class="text-body-2">Chưa có lịch hẹn nào cho khách hàng này</div>
          </div>
          <v-list v-else lines="two" class="bg-transparent pa-0">
            <v-list-item
              v-for="apt in appointmentsList"
              :key="apt.id"
              class="mb-2 border rounded-lg bg-surface"
            >
              <template #prepend>
                <v-avatar color="primary" variant="tonal" size="36">
                  <v-icon size="18">lucide-calendar</v-icon>
                </v-avatar>
              </template>
              <v-list-item-title class="font-weight-medium">
                {{ formatDateTime(apt.appointmentDate, apt.appointmentTime) }}
              </v-list-item-title>
              <v-list-item-subtitle class="text-caption">
                {{ apt.notes || 'Không có ghi chú' }}
              </v-list-item-subtitle>
              <template #append>
                <v-chip size="x-small" :color="aptStatusColor(apt.status)" variant="tonal">
                  {{ aptStatusLabel(apt.status) }}
                </v-chip>
              </template>
            </v-list-item>
          </v-list>
        </div>

        <!-- TAB 3: DỮ LIỆU HỆ THỐNG & KÊNH ZALO -->
        <div v-show="activeTab === 'system'">
          <v-card variant="outlined" class="rounded-lg mb-3">
            <v-list density="compact">
              <v-list-item>
                <template #prepend><v-icon size="18" class="mr-2">lucide-message-circle</v-icon></template>
                <v-list-item-title class="text-caption text-grey">Zalo UID</v-list-item-title>
                <v-list-item-subtitle class="text-body-2 font-weight-medium font-monospace">
                  {{ contact?.zaloUid || 'Chưa liên kết Zalo' }}
                </v-list-item-subtitle>
              </v-list-item>

              <v-divider />

              <v-list-item>
                <template #prepend><v-icon size="18" class="mr-2">lucide-messages-square</v-icon></template>
                <v-list-item-title class="text-caption text-grey">Tổng số hội thoại chat</v-list-item-title>
                <v-list-item-subtitle class="text-body-2 font-weight-medium">
                  {{ fullContactDetail?._count?.conversations ?? contact?._count?.conversations ?? 0 }} cuộc trò chuyện
                </v-list-item-subtitle>
              </v-list-item>

              <v-divider />

              <v-list-item>
                <template #prepend><v-icon size="18" class="mr-2">lucide-clock</v-icon></template>
                <v-list-item-title class="text-caption text-grey">Ngày tạo hồ sơ</v-list-item-title>
                <v-list-item-subtitle class="text-body-2">
                  {{ contact?.createdAt ? formatFullDate(contact.createdAt) : '—' }}
                </v-list-item-subtitle>
              </v-list-item>

              <v-divider />

              <v-list-item>
                <template #prepend><v-icon size="18" class="mr-2">lucide-refresh-cw</v-icon></template>
                <v-list-item-title class="text-caption text-grey">Cập nhật lần cuối</v-list-item-title>
                <v-list-item-subtitle class="text-body-2">
                  {{ contact?.updatedAt ? formatFullDate(contact.updatedAt) : '—' }}
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card>
        </div>
      </div>

      <!-- Drawer Footer Actions -->
      <div class="drawer-footer px-4 py-3 border-t bg-surface d-flex align-center gap-2 flex-shrink-0">
        <v-btn variant="outlined" @click="close">Đóng</v-btn>
        <v-spacer />
        <v-btn color="primary" prepend-icon="lucide-check" :loading="saving" @click="onSave">
          {{ isNew ? 'Tạo khách hàng' : 'Lưu thay đổi' }}
        </v-btn>
      </div>
      </div>
    </v-navigation-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import { api } from '@/api/index';
import type { Contact } from '@/composables/use-contacts';
import { STATUS_OPTIONS, SOURCE_OPTIONS, useContacts } from '@/composables/use-contacts';
import { useUsers } from '@/composables/use-users';
import { useAuthStore } from '@/stores/auth';
import TagSelector from '@/components/common/TagSelector.vue';

const props = defineProps<{
  modelValue: boolean;
  contact: Contact | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [contact: Contact];
  deleted: [id: string];
}>();

const { saving, deleting, createContact, updateContact, deleteContact, fetchContact } = useContacts();
const { users, fetchUsers } = useUsers();
const authStore = useAuthStore();
const isAdmin = computed(() => ['owner', 'admin'].includes(authStore.user?.role || ''));

const activeTab = ref('profile');
const fullContactDetail = ref<Contact | null>(null);

// ── Odoo Integration State ──────────────────────────────────────────
export interface OdooCustomer {
  id: number;
  name: string;
  phone: string;
  mobile: string;
  street: string;
  street2?: string;
  city: string;
  state?: string;
  zone?: string;
  fullAddress?: string;
  email: string;
  vat: string;
  salesperson?: string;
}

const odooSearchId = ref('');
const hasSearchedOdoo = ref(false);
const odooCustomer = ref<OdooCustomer | null>(null);
const loadingOdoo = ref(false);
const odooError = ref('');

async function lookupOdooCustomer(idStr?: string | null) {
  const cleanId = (idStr || odooSearchId.value || form.value.customerId || '').trim();
  if (!cleanId) return;

  hasSearchedOdoo.value = true;
  loadingOdoo.value = true;
  odooError.value = '';

  try {
    const res = await api.get(`/odoo/customers/${cleanId}`);
    if (res.data?.success && res.data?.customer) {
      odooCustomer.value = res.data.customer;
      odooError.value = '';
    } else {
      odooCustomer.value = null;
      odooError.value = `Không tìm thấy khách hàng #${cleanId} trên Odoo`;
    }
  } catch (err: any) {
    odooCustomer.value = null;
    odooError.value = err.response?.data?.error || `Không tìm thấy khách hàng #${cleanId} trên Odoo`;
  } finally {
    loadingOdoo.value = false;
  }
}

function confirmApplyOdooData() {
  if (!odooCustomer.value) return;

  form.value.customerId = String(odooCustomer.value.id);
  if (odooCustomer.value.name) form.value.fullName = odooCustomer.value.name;
  if (odooCustomer.value.phone) {
    form.value.phone = odooCustomer.value.phone;
  } else if (odooCustomer.value.mobile) {
    form.value.phone = odooCustomer.value.mobile;
  }
  if (odooCustomer.value.email) form.value.email = odooCustomer.value.email;
  if (odooCustomer.value.fullAddress || odooCustomer.value.street) {
    form.value.address = odooCustomer.value.fullAddress || odooCustomer.value.street;
  }
  if (odooCustomer.value.zone || odooCustomer.value.state || odooCustomer.value.city) {
    form.value.zone = odooCustomer.value.zone || odooCustomer.value.state || odooCustomer.value.city;
  }
  if (odooCustomer.value.salesperson) {
    form.value.salesperson = odooCustomer.value.salesperson;
  }

  form.value.contactType = 'customer';
}

const creatingOdoo = ref(false);
async function createOdooCustomer() {
  if (!form.value.fullName || !form.value.address || !form.value.zone || !form.value.assignedUserId) {
    odooError.value = "Vui lòng nhập đủ các trường: Tên, Địa chỉ, Khu vực, và Nhân viên phụ trách";
    hasSearchedOdoo.value = true;
    return;
  }
  
  creatingOdoo.value = true;
  odooError.value = "";
  hasSearchedOdoo.value = true;
  
  try {
    const res = await api.post('/odoo/customers', {
      is_company: form.value.isCompany,
      name: form.value.fullName,
      street: form.value.address,
      city: form.value.zone,
      phone: form.value.phone,
      email: form.value.email,
      salesperson: users.value.find(u => u.id === form.value.assignedUserId)?.fullName || '',
    });
    
    if (res.data?.success && res.data?.id) {
      form.value.customerId = String(res.data.id);
      form.value.contactType = 'customer';
      odooCustomer.value = res.data.customer;
      odooError.value = "";
    }
  } catch (err: any) {
    odooError.value = err.response?.data?.error || "Lỗi khi tạo mới trên Odoo";
  } finally {
    creatingOdoo.value = false;
  }
}

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const isNew = computed(() => !props.contact?.id);

interface FormState {
  isCompany: boolean;
  fullName: string;
  zaloName: string;
  customerId: string;
  contactType: 'customer' | 'employee' | 'other';
  phone: string;
  email: string;
  address: string;
  zone: string;
  salesperson: string;
  source: string;
  status: string;
  assignedUserId: string | null;
  firstContactDate: string;
  notes: string;
  tags: string[];
}

const form = ref<FormState>(emptyForm());

function emptyForm(): FormState {
  return {
    isCompany: false,
    fullName: '',
    zaloName: '',
    customerId: '',
    contactType: 'other',
    phone: '',
    email: '',
    address: '',
    zone: '',
    salesperson: '',
    source: '',
    status: '',
    assignedUserId: null,
    firstContactDate: '',
    notes: '',
    tags: [],
  };
}

const appointmentsList = computed(() => {
  return fullContactDetail.value?.appointments ?? props.contact?.appointments ?? [];
});

watch(() => props.contact, async (c) => {
  activeTab.value = 'profile';
  hasSearchedOdoo.value = false;
  odooCustomer.value = null;
  odooError.value = '';

  if (c) {
    form.value = {
      isCompany: false,
      fullName: c.fullName ?? '',
      zaloName: c.zaloName || c.fullName || '',
      customerId: c.customerId ?? '',
      contactType: c.contactType ?? 'other',
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      zone: c.zone ?? '',
      salesperson: c.salesperson ?? '',
      source: c.source ?? '',
      status: c.status ?? '',
      assignedUserId: c.assignedUserId ?? (c.assignedUser?.id ?? null),
      firstContactDate: c.firstContactDate
        ? new Date(c.firstContactDate).toISOString().split('T')[0]
        : '',
      notes: c.notes ?? '',
      tags: Array.isArray(c.tags) ? [...c.tags] : [],
    };

    // Load full detail including appointments and counts
    if (c.id) {
      const detail = await fetchContact(c.id);
      if (detail) {
        fullContactDetail.value = detail;
        if (detail.assignedUserId) form.value.assignedUserId = detail.assignedUserId;
      }
    }

    if (c.customerId) {
      odooSearchId.value = c.customerId;
    } else {
      odooSearchId.value = '';
    }
  } else {
    form.value = emptyForm();
    fullContactDetail.value = null;
  }
}, { immediate: true, deep: true });

onMounted(() => {
  fetchUsers();
});

function required(v: string) {
  return !!v || 'Bắt buộc nhập họ tên';
}

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

function aptStatusColor(st?: string) {
  if (st === 'completed') return 'success';
  if (st === 'cancelled') return 'error';
  return 'primary';
}

function aptStatusLabel(st?: string) {
  if (st === 'completed') return 'Đã xong';
  if (st === 'cancelled') return 'Đã huỷ';
  return 'Đã lên lịch';
}

function formatDateTime(dateStr: string, timeStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr).toLocaleDateString('vi-VN');
  return timeStr ? `${timeStr} - ${d}` : d;
}

function formatFullDate(dateStr?: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('vi-VN');
}

function formatDateShort(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function onSave() {
  const payload: Partial<Contact> = {
    fullName: form.value.fullName || null,
    zaloName: form.value.zaloName || null,
    customerId: form.value.customerId || null,
    contactType: form.value.contactType,
    phone: form.value.phone || null,
    email: form.value.email || null,
    address: form.value.address || null,
    zone: form.value.zone || null,
    salesperson: form.value.salesperson || null,
    source: form.value.source || null,
    status: form.value.status || null,
    assignedUserId: form.value.assignedUserId || null,
    firstContactDate: form.value.firstContactDate
      ? new Date(form.value.firstContactDate + 'T00:00:00').toISOString()
      : null,
    notes: form.value.notes || null,
    tags: form.value.tags,
  };

  let result: Contact | null;
  if (isNew.value) {
    result = await createContact(payload);
  } else {
    result = await updateContact(props.contact!.id, payload);
  }
  if (result) {
    emit('saved', result);
    close();
  }
}

async function onDelete() {
  if (!props.contact?.id) return;
  if (confirm(`Bạn có chắc muốn xóa khách hàng "${form.value.fullName || 'này'}"?`)) {
    const ok = await deleteContact(props.contact.id);
    if (ok) {
      emit('deleted', props.contact.id);
      close();
    }
  }
}

function close() {
  emit('update:modelValue', false);
}
</script>

<style scoped>
.contact-detail-drawer {
  z-index: 1050 !important;
}
.contact-detail-drawer :deep(.v-navigation-drawer__content) {
  overflow-y: hidden !important;
  display: flex;
  flex-direction: column;
  height: 100%;
}

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

:deep(.v-tabs.panel-tabs) {
  min-height: 44px !important;
  height: 44px !important;
  flex-shrink: 0 !important;
}
:deep(.v-slide-group) {
  min-height: 44px !important;
  height: 44px !important;
}
:deep(.v-slide-group__container) {
  min-height: 44px !important;
  height: 44px !important;
}
:deep(.v-slide-group__content) {
  min-height: 44px !important;
  height: 44px !important;
}
:deep(.v-tab) {
  min-height: 42px !important;
  height: 42px !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  text-transform: none !important;
}

.gap-1 {
  gap: 4px;
}
.gap-1\.5 {
  gap: 6px;
}
.gap-2 {
  gap: 8px;
}
.gap-3 {
  gap: 12px;
}
.tracking-wide {
  letter-spacing: 0.4px;
}
.font-monospace {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

:deep(.v-field-label) {
  font-weight: 550 !important;
  color: #374151 !important;
  opacity: 0.9 !important;
}

:deep(.v-field-label--floating) {
  font-weight: 600 !important;
  color: #1f2937 !important;
  opacity: 1 !important;
}

:deep(.v-field--focused .v-field-label),
:deep(.v-field--focused .v-field-label--floating) {
  color: #0068ff !important;
  opacity: 1 !important;
}

:deep(.v-field__prepend-inner .v-icon) {
  color: #4b5563 !important;
  opacity: 0.85 !important;
}

:deep(.v-field--focused .v-field__prepend-inner .v-icon) {
  color: #0068ff !important;
}

:deep(.v-theme--dark .v-field-label) {
  color: #d1d5db !important;
  opacity: 0.95 !important;
}

:deep(.v-theme--dark .v-field-label--floating) {
  color: #e5e7eb !important;
  opacity: 1 !important;
}

:deep(.v-theme--dark .v-field--focused .v-field-label),
:deep(.v-theme--dark .v-field--focused .v-field-label--floating) {
  color: #38bdf8 !important;
  opacity: 1 !important;
}

:deep(.v-theme--dark .v-field__prepend-inner .v-icon) {
  color: #9ca3af !important;
  opacity: 0.9 !important;
}

:deep(.v-theme--dark .v-field--focused .v-field__prepend-inner .v-icon) {
  color: #38bdf8 !important;
}
</style>
