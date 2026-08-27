<template>
  <div>
    <!-- Toolbar -->
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <h1 class="editorial-heading mr-4">Khách hàng</h1>
      <v-spacer />
      <v-btn v-if="selected.length > 0" color="error" variant="tonal" prepend-icon="lucide-trash-2" @click="confirmBulkDelete" class="mr-2">
        Xóa ({{ selected.length }})
      </v-btn>
      <v-btn color="primary" prepend-icon="lucide-plus" @click="openCreate">Thêm KH</v-btn>
    </div>

    <!-- Filters -->
    <ContactFilters :filters="filters" @search="onFilterChange" />

    <!-- Data table -->
    <v-data-table-server
      v-model="selected"
      v-model:items-per-page="pagination.limit"
      v-model:page="pagination.page"
      :headers="headers"
      :items="contacts"
      :loading="loading"
      :items-length="total"
      item-value="id"
      show-select
      hover
      @update:options="fetchContacts"
      @click:row="onRowClick"
    >
      <!-- Avatar -->
      <template #item.avatarUrl="{ item }">
        <v-avatar size="34" color="primary" variant="tonal">
          <v-img v-if="item.avatarUrl" :src="item.avatarUrl" />
          <v-icon v-else size="18">lucide-user</v-icon>
        </v-avatar>
      </template>

      <!-- Full name -->
      <template #item.fullName="{ item }">
        <span class="font-weight-bold text-body-1" style="color: rgb(var(--v-theme-on-surface));">
          {{ item.fullName || '—' }}
        </span>
      </template>

      <!-- Email -->
      <template #item.email="{ item }">
        <span v-if="item.email" class="text-body-2">{{ item.email }}</span>
        <span v-else class="text-grey">—</span>
      </template>

      <!-- Status chip -->
      <template #item.status="{ item }">
        <v-chip
          v-if="item.status"
          :color="statusColor(item.status)"
          size="small"
          variant="tonal"
        >
          {{ statusLabel(item.status) }}
        </v-chip>
        <span v-else class="text-grey">—</span>
      </template>

      <!-- Customer ID -->
      <template #item.customerId="{ item }">
        <v-chip v-if="item.customerId" size="small" variant="tonal" color="primary">
          {{ item.customerId }}
        </v-chip>
        <span v-else class="text-grey">—</span>
      </template>

      <!-- Assigned user -->
      <template #item.assignedUser="{ item }">
        <span class="text-body-2">{{ item.assignedUser?.fullName ?? '—' }}</span>
      </template>

      <!-- AI Chatbot Status Column -->
      <template #item.aiStatus="{ item }">
        <!-- If contact is employee or other: Hidden / Not applicable -->
        <span v-if="item.contactType && item.contactType !== 'customer'" class="text-caption text-disabled">
          —
        </span>
        <!-- If contact is customer: Clickable Toggle Button -->
        <div v-else class="d-flex align-center">
          <v-btn
            size="x-small"
            variant="tonal"
            rounded="md"
            class="text-none font-weight-medium px-2"
            :color="item.conversations?.[0]?.aiActive ? 'success' : 'grey-darken-1'"
            @click.stop="toggleContactAi(item)"
            :title="item.conversations?.[0]?.aiActive ? 'Click để tắt AI cho khách này' : 'Click để bật AI cho khách này'"
            style="height: 24px; font-size: 11px !important;"
          >
            <v-icon start size="12" class="mr-1">
              {{ item.conversations?.[0]?.aiActive ? 'lucide-bot' : 'lucide-bot-off' }}
            </v-icon>
            {{ item.conversations?.[0]?.aiActive ? 'AI Bật' : 'AI Tắt' }}
          </v-btn>
        </div>
      </template>
    </v-data-table-server>

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
import { ref } from 'vue';
import ContactFilters from '@/components/contacts/ContactFilters.vue';
import ContactDetailDialog from '@/components/contacts/ContactDetailDialog.vue';
import { useContacts, STATUS_OPTIONS } from '@/composables/use-contacts';
import type { Contact } from '@/composables/use-contacts';

const { contacts, total, loading, filters, pagination, fetchContacts, deleteContacts, toggleContactAi } = useContacts();

const showDialog = ref(false);
const selected = ref<string[]>([]);
const selectedContact = ref<Contact | null>(null);

const headers = [
  { title: '', key: 'avatarUrl', sortable: false, width: '48px' },
  { title: 'Tên', key: 'fullName', sortable: true },
  { title: 'Mã KH', key: 'customerId', sortable: true },
  { title: 'SĐT', key: 'phone', sortable: false },
  { title: 'Email', key: 'email', sortable: false },
  { title: 'Trạng thái', key: 'status', sortable: false },
  { title: 'Sale', key: 'assignedUser', sortable: false },
  { title: 'AI Chatbot', key: 'aiStatus', sortable: false, width: '110px' },
];

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

function onRowClick(_event: Event, row: { item: Contact }) {
  selectedContact.value = row.item;
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
    }
  }
}
</script>
