<template>
  <div class="contacts-page-wrapper">
    <!-- Toolbar -->
    <div class="d-flex align-center mb-3 flex-wrap gap-2 justify-space-between">
      <div class="d-flex align-center gap-2">
        <h1 class="editorial-heading text-h6 font-weight-bold">Khách hàng</h1>
        <v-chip size="small" variant="tonal" color="primary" class="font-weight-medium">
          {{ total.toLocaleString('vi-VN') }} liên hệ
        </v-chip>
      </div>

      <div class="d-flex align-center gap-2">
        <!-- Exit select mode on mobile -->
        <v-btn
          v-if="isMobile && isSelectMode"
          size="small"
          variant="text"
          color="grey"
          class="text-none"
          @click="exitSelectMode"
        >
          Hủy chọn
        </v-btn>

        <!-- Merge button (when 2+ contacts are selected) -->
        <v-btn
          v-if="selected.length >= 2"
          color="indigo"
          variant="tonal"
          size="small"
          prepend-icon="mdi-call-merge"
          class="text-none font-weight-medium"
          @click="openMergeDialog"
        >
          Gộp ({{ selected.length }})
        </v-btn>

        <!-- Bulk delete -->
        <v-btn
          v-if="selected.length > 0"
          color="error"
          variant="tonal"
          size="small"
          prepend-icon="lucide-trash-2"
          class="text-none"
          @click="confirmBulkDelete"
        >
          Xóa ({{ selected.length }})
        </v-btn>
      </div>
    </div>

    <!-- Filters -->
    <ContactFilters :filters="filters" @search="onFilterChange" />

    <!-- Data table -->
    <v-card variant="outlined" class="rounded-lg mb-4 overflow-hidden">
      <v-data-table-server
        v-model="selected"
        v-model:items-per-page="pagination.limit"
        v-model:page="pagination.page"
        :headers="headers"
        :items="contacts"
        :loading="loading"
        :items-length="total"
        item-value="id"
        :show-select="!isMobile || isSelectMode"
        density="compact"
        hover
        class="contacts-table"
        @update:options="fetchContacts"
      >
        <template #item="{ item, props: rowProps }">
          <tr
            v-bind="rowProps"
            class="cursor-pointer contact-row"
            @touchstart.passive="onTouchStart(item)"
            @touchend="onTouchEnd"
            @touchmove="onTouchMove"
            @touchcancel="onTouchEnd"
            @mousedown="onMouseDown(item)"
            @mouseup="onMouseUp"
            @mouseleave="onMouseLeave"
            @click="onRowClick($event, item)"
          >
            <!-- Checkbox column when enabled -->
            <td v-if="!isMobile || isSelectMode" class="text-center" style="width: 40px;" @click.stop>
              <v-checkbox-btn
                :model-value="selected.includes(item.id)"
                density="compact"
                hide-details
                @update:model-value="toggleSelectItem(item.id)"
              />
            </td>

            <!-- Customer ID / Mã KH (First column on both Desktop & Mobile) -->
            <td class="text-center" :style="isMobile ? (isSelectMode ? 'width: 16%;' : 'width: 18%;') : ''">
              <v-chip v-if="item.customerId" size="x-small" variant="tonal" color="primary" class="font-weight-bold font-monospace">
                {{ item.customerId }}
              </v-chip>
              <span v-else class="text-caption text-medium-emphasis">—</span>
            </td>

            <!-- Cách gọi (Desktop only) -->
            <td v-if="!isMobile" class="text-center">
              <v-chip v-if="item.salutation" size="x-small" variant="flat" color="purple-lighten-4" class="text-purple-darken-3 font-weight-bold">
                {{ item.salutation }}
              </v-chip>
              <span v-else class="text-caption text-medium-emphasis">—</span>
            </td>

            <!-- Full name -->
            <td class="text-left" :style="isMobile ? (isSelectMode ? 'width: 34%;' : 'width: 38%;') : ''">
              <div v-if="isMobile" class="font-weight-medium text-caption text-truncate" :title="getContactDisplayName(item)">
                <span v-if="item.salutation" class="text-primary font-weight-bold mr-1">[{{ item.salutation }}]</span>
                {{ formatCustomerName(getContactDisplayName(item)) }}
              </div>
              <div v-else class="d-flex align-center gap-1.5 flex-nowrap" :title="getContactDisplayName(item)">
                <span class="font-weight-bold text-caption text-high-emphasis">{{ getContactDisplayName(item) }}</span>
                <span v-if="item.phone || item.zone || item.address" class="text-caption text-medium-emphasis ml-1 font-weight-regular">
                  ({{ [item.phone, item.zone || item.address].filter(Boolean).join(' • ') }})
                </span>
              </div>
            </td>

            <!-- SĐT (Mobile) -->
            <td v-if="isMobile" class="text-left" :style="isSelectMode ? 'width: 22%;' : 'width: 24%;'">
              <span class="text-caption font-monospace text-medium-emphasis">{{ item.phone || '—' }}</span>
            </td>

            <!-- Phone (Desktop only) -->
            <td v-if="!isMobile" class="text-left">
              <span class="text-caption font-monospace">{{ item.phone || '—' }}</span>
            </td>

            <!-- Email (Desktop only) -->
            <td v-if="!isMobile" class="text-left">
              <span v-if="item.email" class="text-caption">{{ item.email }}</span>
              <span v-else class="text-caption text-medium-emphasis">—</span>
            </td>

            <!-- Status (Desktop only) -->
            <td v-if="!isMobile" class="text-center">
              <v-chip
                v-if="item.status"
                :color="statusColor(item.status)"
                size="x-small"
                variant="tonal"
                class="font-weight-medium"
              >
                {{ statusLabel(item.status) }}
              </v-chip>
              <span v-else class="text-caption text-medium-emphasis">—</span>
            </td>

            <!-- Assigned user / Sale (Desktop only) -->
            <td v-if="!isMobile" class="text-left">
              <span class="text-caption text-medium-emphasis">{{ item.assignedUser?.fullName ?? '—' }}</span>
            </td>

            <!-- AI Chatbot Status Column -->
            <td class="text-center" :style="isMobile ? (isSelectMode ? 'width: 18%;' : 'width: 20%;') : ''">
              <span v-if="item.contactType && item.contactType !== 'customer'" class="text-caption text-disabled">
                —
              </span>
              <div v-else class="d-flex align-center justify-center">
                <v-btn
                  size="x-small"
                  variant="tonal"
                  rounded="md"
                  class="text-none font-weight-medium px-2"
                  :color="item.conversations?.[0]?.aiActive ? 'success' : 'grey-darken-1'"
                  @click.stop="toggleContactAi(item)"
                  :title="item.conversations?.[0]?.aiActive ? 'Click để tắt AI cho khách này' : 'Click để bật AI cho khách này'"
                  style="height: 22px; font-size: 11px !important;"
                >
                  <v-icon start size="12" class="mr-1">
                    {{ item.conversations?.[0]?.aiActive ? 'lucide-bot' : 'lucide-bot-off' }}
                  </v-icon>
                  {{ item.conversations?.[0]?.aiActive ? 'Bật' : 'Tắt' }}
                </v-btn>
              </div>
            </td>
          </tr>
        </template>
      </v-data-table-server>
    </v-card>

    <!-- Contact detail/edit dialog -->
    <ContactDetailDialog
      v-model="showDialog"
      :contact="selectedContact"
      @saved="onSaved"
      @deleted="onDeleted"
    />

    <!-- Merge Contacts Dialog -->
    <v-dialog v-model="showMergeDialog" max-width="620px" persistent>
      <v-card class="rounded-xl overflow-hidden">
        <v-card-title class="d-flex align-center justify-space-between pa-4 border-b bg-surface">
          <div class="d-flex align-center gap-2">
            <v-icon color="indigo" size="24">mdi-call-merge</v-icon>
            <div>
              <h2 class="text-subtitle-1 font-weight-bold mb-0">Gộp khách hàng trùng lặp</h2>
              <div class="text-caption text-medium-emphasis">
                Chuyển tất cả tin nhắn từ các tài khoản Zalo về 1 hồ sơ duy nhất
              </div>
            </div>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" @click="showMergeDialog = false" />
        </v-card-title>

        <v-card-text class="pa-4">
          <v-alert
            type="info"
            variant="tonal"
            density="compact"
            class="mb-4 text-caption rounded-lg"
          >
            Hệ thống sẽ giữ lại <strong>Hồ sơ chính</strong> bạn chọn bên dưới. Toàn bộ hội thoại Zalo (kể cả từ các tài khoản Zalo khác nhau), đơn hàng, lịch hẹn từ các hồ sơ còn lại sẽ được gộp vào hồ sơ này.
          </v-alert>

          <div class="text-caption font-weight-bold mb-2 text-medium-emphasis text-uppercase">
            Chọn 1 khách hàng làm Hồ sơ chính:
          </div>

          <v-radio-group v-model="primaryMergeContactId" hide-details class="mb-2">
            <div class="d-flex flex-column gap-2">
              <div
                v-for="c in selectedContactsList"
                :key="c.id"
                class="pa-3 rounded-lg border cursor-pointer transition-all"
                :class="primaryMergeContactId === c.id ? 'border-primary bg-primary-subtle' : 'bg-surface'"
                @click="primaryMergeContactId = c.id"
              >
                <div class="d-flex align-center gap-3">
                  <v-radio :value="c.id" density="compact" hide-details />
                  <v-avatar size="38" color="slate-200">
                    <v-img v-if="c.avatarUrl" :src="c.avatarUrl">
                      <template #error>
                        <v-icon size="20" color="medium-emphasis">mdi-account</v-icon>
                      </template>
                    </v-img>
                    <v-icon v-else size="20" color="medium-emphasis">mdi-account</v-icon>
                  </v-avatar>
                  <div class="flex-grow-1 min-w-0">
                    <div class="d-flex align-center gap-2">
                      <span class="font-weight-bold text-body-2 text-truncate">{{ getContactDisplayName(c) }}</span>
                      <v-chip v-if="c.customerId" size="x-small" color="primary" variant="tonal" class="font-monospace font-weight-bold">
                        {{ c.customerId }}
                      </v-chip>
                      <v-chip v-if="primaryMergeContactId === c.id" size="x-small" color="success" variant="flat" class="font-weight-bold">
                        Chính
                      </v-chip>
                    </div>
                    <div class="text-caption text-medium-emphasis d-flex align-center gap-2 mt-0.5">
                      <span v-if="c.phone"><v-icon size="12" class="mr-0.5">mdi-phone</v-icon>{{ c.phone }}</span>
                      <span v-if="c.email"><v-icon size="12" class="mr-0.5">mdi-email</v-icon>{{ c.email }}</span>
                      <span v-if="c.conversations?.length"><v-icon size="12" class="mr-0.5">mdi-chat</v-icon>{{ c.conversations.length }} hội thoại</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </v-radio-group>
        </v-card-text>

        <v-card-actions class="pa-4 border-t bg-slate-50 dark:bg-slate-800/40 d-flex justify-end gap-2">
          <v-btn variant="text" size="small" class="text-none" @click="showMergeDialog = false">
            Hủy
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            size="small"
            class="text-none font-weight-bold px-4"
            prepend-icon="mdi-call-merge"
            :loading="merging"
            :disabled="!primaryMergeContactId"
            @click="submitMerge"
          >
            Xác nhận gộp ({{ selected.length }} khách hàng)
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Global feedback snackbar -->
    <v-snackbar v-model="showSnackbar" timeout="3500" location="top" color="slate-900" rounded="lg">
      <div class="d-flex align-center gap-2">
        <v-icon color="success" size="18">mdi-check-circle</v-icon>
        <span class="text-body-2 text-white">{{ snackbarText }}</span>
      </div>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useDisplay } from 'vuetify';
import ContactFilters from '@/components/contacts/ContactFilters.vue';
import ContactDetailDialog from '@/components/contacts/ContactDetailDialog.vue';
import { useContacts, STATUS_OPTIONS } from '@/composables/use-contacts';
import type { Contact } from '@/composables/use-contacts';

const display = useDisplay();
const isMobile = computed(() => display.smAndDown.value);

const {
  contacts, total, loading, filters, pagination,
  fetchContacts, deleteContacts, mergeContacts,
  toggleContactAi,
} = useContacts();

const showDialog = ref(false);
const selected = ref<string[]>([]);
const selectedContact = ref<Contact | null>(null);
const isSelectMode = ref(false);

// Merge dialog state
const showMergeDialog = ref(false);
const merging = ref(false);
const primaryMergeContactId = ref<string>('');
const showSnackbar = ref(false);
const snackbarText = ref('');

const selectedContactsList = computed(() => {
  return contacts.value.filter((c) => selected.value.includes(c.id));
});

let pressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressTriggered = false;

function getContactDisplayName(item?: Partial<Contact> | null): string {
  if (!item) return '—';
  const zaloName = item.zaloName?.trim();
  const fullName = item.fullName?.trim();

  const isInvalid = (name?: string | null) =>
    !name || name === 'Khách hàng' || name === 'Khách hàng Zalo' || name === 'Unknown';

  if (!isInvalid(fullName)) return fullName!;
  if (!isInvalid(zaloName)) return zaloName!;
  return fullName || zaloName || '—';
}

function formatCustomerName(name?: string | null): string {
  if (!name) return '—';
  const trimmed = name.trim();
  if (trimmed.length > 15) {
    return trimmed.slice(0, 12) + '...';
  }
  return trimmed;
}

function startPress(item: Contact) {
  if (!isMobile.value || isSelectMode.value) return;
  longPressTriggered = false;
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    longPressTriggered = true;
    isSelectMode.value = true;
    toggleSelectItem(item.id);
  }, 450);
}

function cancelPress() {
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
}

function onTouchStart(item: Contact) {
  startPress(item);
}

function onTouchEnd() {
  cancelPress();
}

function onTouchMove() {
  cancelPress();
}

function onMouseDown(item: Contact) {
  startPress(item);
}

function onMouseUp() {
  cancelPress();
}

function onMouseLeave() {
  cancelPress();
}

function toggleSelectItem(id: string) {
  const index = selected.value.indexOf(id);
  if (index >= 0) {
    selected.value.splice(index, 1);
  } else {
    selected.value.push(id);
  }
}

function exitSelectMode() {
  isSelectMode.value = false;
  selected.value = [];
}

const headers = computed(() => {
  if (isMobile.value) {
    const list: any[] = [];
    if (isSelectMode.value) {
      list.push({ title: '', key: 'data-table-select', width: '36px', sortable: false, align: 'center' as const });
    }
    list.push(
      { title: 'Mã KH', key: 'customerId', sortable: true, width: isSelectMode.value ? '16%' : '18%', align: 'center' as const },
      { title: 'Khách hàng', key: 'fullName', sortable: true, width: isSelectMode.value ? '34%' : '38%' },
      { title: 'SĐT', key: 'phone', sortable: false, width: isSelectMode.value ? '22%' : '24%' },
      { title: 'AI Bot', key: 'aiStatus', sortable: false, width: isSelectMode.value ? '18%' : '20%', align: 'center' as const }
    );
    return list;
  }
  return [
    { title: 'Mã KH', key: 'customerId', sortable: true, width: '90px', align: 'center' as const },
    { title: 'Cách gọi', key: 'salutation', sortable: true, width: '100px', align: 'center' as const },
    { title: 'Tên khách hàng', key: 'fullName', sortable: true },
    { title: 'SĐT', key: 'phone', sortable: false },
    { title: 'Email', key: 'email', sortable: false },
    { title: 'Trạng thái', key: 'status', sortable: false, align: 'center' as const },
    { title: 'Sale', key: 'assignedUser', sortable: false },
    { title: 'AI Chatbot', key: 'aiStatus', sortable: false, width: '100px', align: 'center' as const },
  ];
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

function onFilterChange() {
  pagination.page = 1;
  fetchContacts();
}

function onRowClick(_event: Event, item: Contact) {
  if (longPressTriggered) {
    longPressTriggered = false;
    return;
  }
  if (isSelectMode.value) {
    toggleSelectItem(item.id);
    return;
  }
  selectedContact.value = item;
  showDialog.value = true;
}

function onSaved() {
  fetchContacts();
}

function onDeleted() {
  fetchContacts();
}

async function confirmBulkDelete() {
  if (confirm(`Bạn có chắc muốn xóa ${selected.value.length} khách hàng đã chọn?`)) {
    const success = await deleteContacts(selected.value);
    if (success) {
      selected.value = [];
      isSelectMode.value = false;
    }
  }
}

function openMergeDialog() {
  if (selected.value.length < 2) return;
  const list = selectedContactsList.value;
  const best = list.find((c) => c.customerId) || list.find((c) => c.phone) || list[0];
  primaryMergeContactId.value = best?.id || selected.value[0];
  showMergeDialog.value = true;
}

async function submitMerge() {
  if (!primaryMergeContactId.value) return;
  merging.value = true;
  const sourceIds = selected.value.filter((id) => id !== primaryMergeContactId.value);
  try {
    const ok = await mergeContacts(primaryMergeContactId.value, sourceIds);
    if (ok) {
      showMergeDialog.value = false;
      selected.value = [];
      isSelectMode.value = false;
      snackbarText.value = 'Đã gộp thành công các liên hệ!';
      showSnackbar.value = true;
    }
  } finally {
    merging.value = false;
  }
}
</script>

<style scoped>
.contacts-table {
  width: 100% !important;
}

.contact-row {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.contacts-table :deep(th) {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  white-space: nowrap;
}

/* Desktop: Proportional auto-fit with evenly distributed space */
@media (min-width: 769px) {
  .contacts-table :deep(table) {
    width: 100% !important;
    table-layout: auto !important;
  }
  .contacts-table :deep(th),
  .contacts-table :deep(td) {
    padding-left: 10px !important;
    padding-right: 10px !important;
    white-space: nowrap !important;
  }
}

/* Mobile: Fixed layout with percentage columns, no scroll */
@media (max-width: 768px) {
  .contacts-table :deep(.v-table__wrapper) {
    overflow-x: hidden !important;
    width: 100% !important;
  }
  .contacts-table :deep(table) {
    width: 100% !important;
    min-width: 100% !important;
    table-layout: fixed !important;
  }
  .contacts-table :deep(th) {
    padding-left: 3px !important;
    padding-right: 3px !important;
    font-size: 11.5px !important;
  }
  .contacts-table :deep(td) {
    padding-left: 3px !important;
    padding-right: 3px !important;
    font-size: 12px !important;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
