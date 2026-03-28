<template>
  <div>
    <!-- Toolbar -->
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <h1 class="text-h5 mr-4">Lịch hẹn</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="showCreateDialog = true">
        Tạo lịch hẹn
      </v-btn>
    </div>

    <!-- Tabs -->
    <v-tabs v-model="activeTab" class="mb-4">
      <v-tab value="today">Hôm nay</v-tab>
      <v-tab value="upcoming">Sắp tới</v-tab>
      <v-tab value="all">Tất cả</v-tab>
    </v-tabs>

    <!-- "Tất cả" tab: status filter -->
    <div v-if="activeTab === 'all'" class="mb-3">
      <v-select
        v-model="filters.status"
        :items="APPOINTMENT_STATUS_OPTIONS"
        item-title="text"
        item-value="value"
        label="Trạng thái"
        clearable
        style="max-width: 220px"
        hide-details
        @update:model-value="fetchAppointments()"
      />
    </div>

    <!-- Appointment table -->
    <v-data-table
      :headers="headers"
      :items="activeList"
      :loading="loading"
      item-value="id"
      hover
    >
      <!-- Date -->
      <template #item.appointmentDate="{ item }">
        {{ formatDate(item.appointmentDate) }}
      </template>

      <!-- Contact name -->
      <template #item.contact="{ item }">
        <span>{{ item.contact?.fullName ?? '—' }}</span>
        <div class="text-caption text-grey">{{ item.contact?.phone ?? '' }}</div>
      </template>

      <!-- Type -->
      <template #item.type="{ item }">
        {{ typeLabel(item.type) }}
      </template>

      <!-- Status chip -->
      <template #item.status="{ item }">
        <v-chip :color="statusChipColor(item.status)" size="small" variant="tonal">
          {{ statusLabel(item.status) }}
        </v-chip>
      </template>

      <!-- Notes -->
      <template #item.notes="{ item }">
        <span class="text-body-2">{{ item.notes ?? '—' }}</span>
      </template>

      <!-- Quick actions -->
      <template #item.actions="{ item }">
        <div class="d-flex gap-1">
          <v-btn
            v-if="item.status === 'scheduled'"
            size="small"
            variant="text"
            color="success"
            icon="mdi-check"
            title="Hoàn thành"
            @click.stop="onMarkComplete(item.id)"
          />
          <v-btn
            v-if="item.status === 'scheduled'"
            size="small"
            variant="text"
            color="grey"
            icon="mdi-cancel"
            title="Huỷ"
            @click.stop="onCancel(item.id)"
          />
          <v-btn
            size="small"
            variant="text"
            color="error"
            icon="mdi-delete"
            title="Xoá"
            @click.stop="onDelete(item.id)"
          />
        </div>
      </template>
    </v-data-table>

    <!-- Create appointment dialog -->
    <v-dialog v-model="showCreateDialog" max-width="520" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          Tạo lịch hẹn
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="showCreateDialog = false" />
        </v-card-title>
        <v-divider />
        <v-card-text>
          <v-row dense>
            <v-col cols="12">
              <v-text-field
                v-model="createForm.contactId"
                label="ID khách hàng"
                hint="Nhập ID khách hàng"
                persistent-hint
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="createForm.appointmentDate" label="Ngày hẹn" type="date" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="createForm.appointmentTime" label="Giờ hẹn" type="time" />
            </v-col>
            <v-col cols="12">
              <v-select
                v-model="createForm.type"
                :items="APPOINTMENT_TYPE_OPTIONS"
                item-title="text"
                item-value="value"
                label="Loại"
              />
            </v-col>
            <v-col cols="12">
              <v-textarea v-model="createForm.notes" label="Ghi chú" rows="2" auto-grow />
            </v-col>
          </v-row>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCreateDialog = false">Huỷ</v-btn>
          <v-btn color="primary" :loading="saving" @click="onCreateSave">Lưu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  useAppointments,
  APPOINTMENT_STATUS_OPTIONS,
  APPOINTMENT_TYPE_OPTIONS,
  statusChipColor,
  statusLabel,
} from '@/composables/use-appointments';
import type { Appointment } from '@/composables/use-appointments';

const {
  appointments, todayAppointments, upcomingAppointments,
  loading, saving, filters,
  fetchAppointments, fetchToday, fetchUpcoming,
  createAppointment, deleteAppointment, markComplete, cancelAppointment,
} = useAppointments();

const activeTab = ref<'today' | 'upcoming' | 'all'>('today');
const showCreateDialog = ref(false);

interface CreateForm {
  contactId: string;
  appointmentDate: string;
  appointmentTime: string;
  type: string;
  notes: string;
}

const createForm = ref<CreateForm>({
  contactId: '',
  appointmentDate: '',
  appointmentTime: '',
  type: 'follow_up',
  notes: '',
});

const headers = [
  { title: 'Ngày', key: 'appointmentDate', sortable: true },
  { title: 'Giờ', key: 'appointmentTime', sortable: true },
  { title: 'Khách hàng', key: 'contact', sortable: false },
  { title: 'Loại', key: 'type', sortable: false },
  { title: 'Trạng thái', key: 'status', sortable: false },
  { title: 'Ghi chú', key: 'notes', sortable: false },
  { title: '', key: 'actions', sortable: false, width: '120px' },
];

const activeList = computed<Appointment[]>(() => {
  switch (activeTab.value) {
    case 'today': return todayAppointments.value;
    case 'upcoming': return upcomingAppointments.value;
    default: return appointments.value;
  }
});

function formatDate(date: string) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('vi-VN');
}

function typeLabel(type: string) {
  return APPOINTMENT_TYPE_OPTIONS.find(o => o.value === type)?.text ?? type;
}

async function onMarkComplete(id: string) {
  await markComplete(id);
  refreshActive();
}

async function onCancel(id: string) {
  await cancelAppointment(id);
  refreshActive();
}

async function onDelete(id: string) {
  await deleteAppointment(id);
  refreshActive();
}

async function onCreateSave() {
  const result = await createAppointment({
    contactId: createForm.value.contactId,
    appointmentDate: createForm.value.appointmentDate,
    appointmentTime: createForm.value.appointmentTime,
    type: createForm.value.type,
    notes: createForm.value.notes || null,
  } as Partial<Appointment>);
  if (result) {
    showCreateDialog.value = false;
    createForm.value = { contactId: '', appointmentDate: '', appointmentTime: '', type: 'follow_up', notes: '' };
    refreshActive();
  }
}

function refreshActive() {
  switch (activeTab.value) {
    case 'today': fetchToday(); break;
    case 'upcoming': fetchUpcoming(); break;
    default: fetchAppointments(); break;
  }
}

watch(activeTab, () => refreshActive());

onMounted(() => {
  fetchToday();
  fetchUpcoming();
});
</script>
