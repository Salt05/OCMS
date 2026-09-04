<template>
  <div class="chat-contact-panel d-flex flex-column h-100" style="width: 100%; height: 100%; overflow: hidden; background-color: rgb(var(--v-theme-surface));">
    
    <!-- 1. Profile Summary Header (Avatar, Name, UID, Dates) -->
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
                {{ (form.fullName && form.fullName !== 'Khách hàng') ? form.fullName : (form.zaloName || conversation?.contact?.zaloName || conversation?.contact?.fullName || 'Chưa đặt tên') }}
              </span>
              <v-chip v-if="form.customerId" size="x-small" color="primary" variant="flat" class="font-weight-bold">
                #{{ form.customerId }}
              </v-chip>
            </div>
            <div v-if="form.status" class="mt-1 d-flex align-center gap-1">
              <v-chip :color="statusColor(form.status)" size="x-small" variant="tonal" class="font-weight-bold" style="font-size: 10px; height: 18px;">
                {{ statusLabel(form.status) }}
              </v-chip>
              <v-chip :color="customerTier.color" size="x-small" variant="flat" class="font-weight-bold" style="font-size: 10px; height: 18px;">
                {{ customerTier.label }}
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

    <!-- 2. Tabs Navigation (3 Tabs: Thông tin, Đơn hàng, File & Media) -->
    <v-tabs v-model="activeTab" color="primary" density="compact" class="border-b px-2 flex-shrink-0 panel-tabs" :grow="$vuetify.display.smAndDown" show-arrows>
      <v-tab value="info" class="text-caption font-weight-bold">
        <v-icon start size="14">lucide-user</v-icon>
        Thông tin
      </v-tab>
      <v-tab value="orders" class="text-caption font-weight-bold">
        <v-icon start size="14">lucide-shopping-bag</v-icon>
        Đơn hàng
      </v-tab>
      <v-tab value="media" class="text-caption font-weight-bold">
        <v-icon start size="14">lucide-folder</v-icon>
        File & Media
      </v-tab>
    </v-tabs>

    <!-- 3. Tab Body Content -->
    <div
      class="flex-grow-1 custom-scrollbar"
      :class="activeTab === 'media' ? 'overflow-hidden pa-0' : 'overflow-y-auto px-4 py-3'"
      style="min-height: 0;"
    >
      
      <!-- TAB 1: THÔNG TIN (2-COLUMN GRID) -->
      <div v-show="activeTab === 'info'" class="d-flex flex-column gap-3">
        
        <v-row dense>
          <!-- CỘT 1 (BÊN TRÁI): THÔNG TIN LIÊN HỆ CƠ BẢN -->
          <v-col cols="12" md="6">
            <v-card variant="outlined" class="rounded-xl pa-3 customer-profile-card h-100">
              <div class="d-flex align-center justify-space-between mb-3 pb-2 border-b">
                <div class="d-flex align-center gap-2">
                  <div class="card-icon-badge">
                    <v-icon size="16" color="primary">lucide-contact</v-icon>
                  </div>
                  <span class="text-subtitle-2 font-weight-bold text-primary tracking-wide">THÔNG TIN LIÊN HỆ</span>
                </div>
              </div>

              <!-- Loại tài khoản -->
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

              <!-- Tên khách hàng (Odoo) -->
              <v-text-field
                v-model="form.fullName"
                label="Tên khách hàng (Odoo)"
                placeholder="Tên chính thức..."
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-user"
                hide-details="auto"
                class="mb-2"
              />

              <!-- Tên liên lạc (Zalo) -->
              <v-text-field
                :model-value="form.zaloName || contact?.zaloName || conversation?.contact?.zaloName || 'Khách hàng Zalo'"
                label="Tên liên lạc (Zalo)"
                readonly
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-message-circle"
                hide-details="auto"
                class="mb-2"
              />

              <!-- Số điện thoại -->
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

              <!-- Email -->
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

              <!-- Địa chỉ -->
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

              <!-- Khu vực (Zone) -->
              <v-text-field
                v-model="form.zone"
                label="Khu vực (Zone)"
                placeholder="VD: HCM - Q10, Hà Nội - Cầu Giấy..."
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-map"
                hide-details="auto"
                class="mb-2"
              />

              <!-- Ghi chú -->
              <v-textarea
                v-model="form.notes"
                label="Ghi chú khách hàng"
                placeholder="Lưu ý đặc biệt, sở thích, thói quen mua hàng..."
                rows="2"
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-file-text"
                hide-details="auto"
              />
            </v-card>
          </v-col>

          <!-- CỘT 2 (BÊN PHẢI): THÔNG TIN NÂNG CAO & DỮ LIỆU TÍNH TOÁN CRM -->
          <v-col cols="12" md="6" class="d-flex flex-column gap-3">
            
            <!-- Card Nâng cao (Odoo & CSKH) -->
            <v-card variant="outlined" class="rounded-xl pa-3 customer-profile-card">
              <div class="d-flex align-center justify-space-between mb-3 pb-2 border-b">
                <div class="d-flex align-center gap-2">
                  <div class="card-icon-badge">
                    <v-icon size="16" color="teal">lucide-settings-2</v-icon>
                  </div>
                  <span class="text-subtitle-2 font-weight-bold text-teal tracking-wide">THÔNG TIN NÂNG CAO</span>
                </div>
                <v-tooltip v-if="!isAdmin" text="Chỉ Admin mới có quyền sửa các trường này" location="top">
                  <template #activator="{ props }">
                    <v-icon v-bind="props" size="16" color="grey">lucide-lock</v-icon>
                  </template>
                </v-tooltip>
              </div>

              <!-- ID Customer (Admin only edit) -->
              <v-text-field
                v-model="form.customerId"
                label="ID Customer (Odoo)"
                placeholder="Nhập ID Odoo rồi nhấn Enter..."
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-hash"
                hide-details="auto"
                class="mb-2"
                :disabled="!isAdmin"
                :loading="loadingOdoo"
                @keyup.enter="lookupAndApplyOdoo()"
              >
                <template #append-inner>
                  <div class="odoo-action-buttons">
                    <v-btn
                      v-if="form.customerId && isAdmin"
                      icon
                      variant="text"
                      color="primary"
                      size="x-small"
                      density="compact"
                      class="action-icon-btn"
                      :loading="loadingOdoo"
                      title="Đồng bộ / Cập nhật lại từ Odoo"
                      @click.stop="lookupAndApplyOdoo()"
                    >
                      <v-icon size="15">lucide-refresh-cw</v-icon>
                    </v-btn>
                    <v-btn
                      v-else-if="isAdmin"
                      icon
                      variant="text"
                      color="primary"
                      size="x-small"
                      density="compact"
                      class="action-icon-btn"
                      :loading="loadingOdoo"
                      title="Tra cứu & Điền thông tin Odoo"
                      @click.stop="lookupAndApplyOdoo()"
                    >
                      <v-icon size="15">lucide-search</v-icon>
                    </v-btn>
                    <v-btn
                      v-if="form.customerId && isAdmin"
                      icon
                      variant="text"
                      color="error"
                      size="x-small"
                      density="compact"
                      class="action-icon-btn"
                      title="Hủy liên kết Odoo"
                      @click.stop="form.customerId = ''"
                    >
                      <v-icon size="15">lucide-unlink</v-icon>
                    </v-btn>
                  </div>
                </template>
              </v-text-field>

              <!-- Thông báo đồng bộ Odoo -->
              <v-alert
                v-if="odooSyncMessage"
                type="success"
                density="compact"
                variant="tonal"
                class="text-caption mb-2 py-1 px-2 rounded-lg"
                closable
                @click:close="odooSyncMessage = ''"
              >
                {{ odooSyncMessage }}
              </v-alert>
              <v-alert
                v-if="odooSyncError"
                type="warning"
                density="compact"
                variant="tonal"
                class="text-caption mb-2 py-1 px-2 rounded-lg"
                closable
                @click:close="odooSyncError = ''"
              >
                {{ odooSyncError }}
              </v-alert>

              <!-- Phân loại Odoo (Admin only edit) -->
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
                :disabled="!isAdmin"
              />

              <!-- Thẻ phân loại (Tags) -->
              <div class="mb-2">
                <TagSelector
                  v-model="form.tags"
                  :contact-id="contact?.id"
                  density="compact"
                  variant="outlined"
                  label="Thẻ phân loại (Tags)"
                />
              </div>

              <!-- Nhân viên CSKH (Admin only edit) -->
              <v-select
                v-model="form.assignedUserId"
                :items="userOptions"
                item-title="title"
                item-value="value"
                label="Nhân viên CSKH"
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-user-check"
                hide-details="auto"
                class="mb-2"
                clearable
                :disabled="!isAdmin"
              />

              <!-- Trạng thái khách hàng (Admin only edit) -->
              <v-select
                v-model="form.status"
                :items="STATUS_OPTIONS"
                item-title="text"
                item-value="value"
                label="Trạng thái"
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-activity"
                hide-details="auto"
                class="mb-2"
                :disabled="!isAdmin"
              />

              <!-- Nguồn liên hệ -->
              <v-select
                v-model="form.source"
                :items="SOURCE_OPTIONS"
                item-title="text"
                item-value="value"
                label="Nguồn"
                density="compact"
                variant="outlined"
                prepend-inner-icon="lucide-share-2"
                hide-details="auto"
                clearable
              />
            </v-card>

            <!-- Card Dữ liệu Tính toán CRM & Lịch sử Mua hàng -->
            <v-card variant="outlined" class="rounded-xl pa-3 bg-surface-variant">
              <div class="d-flex align-center gap-2 mb-2 pb-1 border-b">
                <v-icon size="16" color="primary">lucide-bar-chart-3</v-icon>
                <span class="text-caption font-weight-bold text-primary">CHỈ SỐ MUA HÀNG (CRM)</span>
              </div>

              <div class="d-flex flex-column gap-1.5 text-caption">
                <div class="d-flex justify-space-between align-center">
                  <span class="text-medium-emphasis">💰 Tổng tiền đã chi:</span>
                  <span class="font-weight-bold text-teal font-monospace">{{ formatVND(customerRevenue) }}</span>
                </div>
                <div class="d-flex justify-space-between align-center">
                  <span class="text-medium-emphasis">📦 Tổng số đơn hàng:</span>
                  <span class="font-weight-bold text-primary">{{ customerOrdersCount }} đơn</span>
                </div>
                <div class="d-flex justify-space-between align-center">
                  <span class="text-medium-emphasis">⭐ Giá trị TB/đơn (AOV):</span>
                  <span class="font-weight-bold">{{ formatVND(customerAov) }}</span>
                </div>
                <div class="d-flex justify-space-between align-center">
                  <span class="text-medium-emphasis">📅 Ngày mua gần nhất:</span>
                  <span class="font-weight-medium">{{ customerLastOrderDate }}</span>
                </div>
              </div>
            </v-card>

          </v-col>
        </v-row>

        <!-- Save Button Footer -->
        <div class="d-flex align-center justify-space-between mt-2 pt-2 border-t">
          <div>
            <span v-if="saveSuccess" class="text-caption text-success font-weight-medium d-flex align-center gap-1">
              <v-icon size="14">lucide-check</v-icon> Đã lưu thông tin
            </span>
            <span v-else-if="saveError" class="text-caption text-error font-weight-medium">
              Lỗi khi lưu thông tin
            </span>
          </div>

          <v-btn
            color="primary"
            variant="flat"
            size="small"
            class="text-none px-4"
            prepend-icon="lucide-save"
            :loading="saving"
            @click="saveContact"
          >
            Lưu thay đổi
          </v-btn>
        </div>

      </div>

      <!-- TAB 2: ĐƠN HÀNG -->
      <div v-show="activeTab === 'orders'">
        <ChatOrders v-if="props.contactId" :contact-id="props.contactId" />
        <div v-else class="text-caption text-grey text-center py-4">
          Chưa có liên hệ để xem đơn hàng
        </div>
      </div>

      <!-- TAB 4: FILE & MEDIA GALLERY -->
      <div v-show="activeTab === 'media'" class="h-100">
        <ChatMediaGallery
          :conversation-id="conversation?.id || null"
          :messages="messages || []"
        />
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import type { Contact } from '@/composables/use-contacts';
import { STATUS_OPTIONS, SOURCE_OPTIONS } from '@/composables/use-contacts';
import { useChatContactPanel } from '@/composables/use-chat-contact-panel';
import { useUsers } from '@/composables/use-users';
import { useAuthStore } from '@/stores/auth';
import ChatOrders from './ChatOrders.vue';
import ChatMediaGallery from './ChatMediaGallery.vue';
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
const authStore = useAuthStore();
const isAdmin = computed(() => ['owner', 'admin'].includes(authStore.user?.role || ''));

const {
  form, saving, saveSuccess, saveError,
  customerStats,
  loadingOdoo, odooSyncMessage, odooSyncError,
  saveContact,
  lookupAndApplyOdoo,
} = useChatContactPanel(
  () => props.contactId,
  () => props.contact,
  () => emit('saved'),
);

const userOptions = computed(() => {
  return users.value.map(u => ({
    title: u.fullName || u.email,
    value: u.id,
  }));
});

function formatDateShort(dateStr: string) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN');
}

function formatVND(n?: number) {
  if (n === undefined || n === null) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function statusColor(val?: string | null) {
  switch (val) {
    case 'new': return 'info';
    case 'contacted': return 'primary';
    case 'qualified': return 'purple';
    case 'won': return 'success';
    case 'lost': return 'error';
    default: return 'grey';
  }
}

function statusLabel(val?: string | null) {
  const opt = STATUS_OPTIONS.find(o => o.value === val);
  return opt ? opt.text : 'Mới';
}

// Calculated CRM Metrics
const customerRevenue = computed(() => {
  return customerStats.value?.totalRevenue ?? ((props.contact as any)?.customer?.totalRevenue || props.conversation?.contact?.customer?.totalRevenue || 0);
});

const customerOrdersCount = computed(() => {
  return customerStats.value?.totalOrders ?? ((props.contact as any)?.customer?.totalOrders || props.conversation?.contact?.customer?.totalOrders || 0);
});

const customerAov = computed(() => {
  if (customerOrdersCount.value > 0) {
    return customerRevenue.value / customerOrdersCount.value;
  }
  return 0;
});

const customerLastOrderDate = computed(() => {
  const d = customerStats.value?.lastOrderDate || (props.contact as any)?.customer?.lastOrderDate || props.conversation?.contact?.customer?.lastOrderDate;
  return d ? formatDateShort(d) : 'Chưa có đơn';
});

const customerTier = computed(() => {
  const rev = customerRevenue.value;
  if (rev >= 50000000) return { label: 'VIP Kim Cương', color: 'purple' };
  if (rev >= 10000000) return { label: 'Khách Thân Thiết', color: 'amber-darken-3' };
  if (customerOrdersCount.value > 0) return { label: 'Khách Quen', color: 'teal' };
  return { label: 'Khách Mới', color: 'info' };
});

onMounted(() => {
  fetchUsers();
});
</script>

<style scoped>
.chat-contact-panel {
  font-family: inherit;
}
.profile-summary-card {
  background-color: rgba(var(--v-theme-on-surface), 0.02);
}
.profile-meta-box {
  background: rgba(var(--v-theme-on-surface), 0.04);
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  min-width: 170px;
}
.card-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: rgba(var(--v-theme-primary), 0.1);
}
.customer-profile-card {
  background-color: rgb(var(--v-theme-surface));
  border-color: rgba(var(--v-theme-on-surface), 0.12) !important;
}
.odoo-action-buttons {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 4px !important;
  margin-right: -4px;
}
.action-icon-btn {
  width: 24px !important;
  height: 24px !important;
  min-width: 24px !important;
  padding: 0 !important;
}
</style>