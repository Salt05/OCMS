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

        <!-- Add Contact -->
        <v-btn color="primary" size="small" prepend-icon="lucide-plus" class="text-none" @click="openCreate">
          Thêm KH
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
            @touchstart="onTouchStart(item)"
            @touchend="onTouchEnd"
            @touchmove="onTouchMove"
            @mouseenter="onRowMouseEnter(item)"
            @mouseleave="onRowMouseLeave"
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

            <!-- Full name -->
            <td class="text-left" :style="isMobile ? (isSelectMode ? 'width: 34%;' : 'width: 38%;') : ''">
              <div v-if="isMobile" class="font-weight-medium text-caption text-truncate" :title="item.fullName || ''">
                {{ formatCustomerName(item.fullName) }}
              </div>
              <div v-else class="d-flex align-center gap-1.5 flex-nowrap" :title="item.fullName || ''">
                <span class="font-weight-bold text-caption text-high-emphasis">{{ item.fullName || '—' }}</span>
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

const { contacts, total, loading, filters, pagination, fetchContacts, deleteContacts, toggleContactAi } = useContacts();

const showDialog = ref(false);
const selected = ref<string[]>([]);
const selectedContact = ref<Contact | null>(null);
const isSelectMode = ref(false);

let touchTimer: ReturnType<typeof setTimeout> | null = null;
let hoverTimer: ReturnType<typeof setTimeout> | null = null;

function formatCustomerName(name?: string | null): string {
  if (!name) return '—';
  const trimmed = name.trim();
  if (trimmed.length > 15) {
    return trimmed.slice(0, 12) + '...';
  }
  return trimmed;
}

function onTouchStart(item: Contact) {
  touchTimer = setTimeout(() => {
    isSelectMode.value = true;
    toggleSelectItem(item.id);
  }, 450);
}

function onTouchEnd() {
  if (touchTimer) clearTimeout(touchTimer);
}

function onTouchMove() {
  if (touchTimer) clearTimeout(touchTimer);
}

function onRowMouseEnter(item: Contact) {
  if (isMobile.value) {
    hoverTimer = setTimeout(() => {
      isSelectMode.value = true;
      toggleSelectItem(item.id);
    }, 600);
  }
}

function onRowMouseLeave() {
  if (hoverTimer) clearTimeout(hoverTimer);
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
    { title: 'Mã KH', key: 'customerId', sortable: true, width: '100px', align: 'center' as const },
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

function openCreate() {
  selectedContact.value = null;
  showDialog.value = true;
}

function onRowClick(_event: Event, item: Contact) {
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
</script>

<style scoped>
.contacts-table {
  width: 100% !important;
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
