<template>
  <div>
    <v-divider class="my-3" />
    <div class="d-flex align-center mb-2">
      <v-icon size="16" color="warning" class="mr-1">mdi-calendar-clock</v-icon>
      <span class="text-caption font-weight-bold">Lịch hẹn ({{ appointments.length }})</span>
      <v-spacer />
      <v-btn size="x-small" variant="text" color="primary" @click="showForm = !showForm">
        <v-icon size="14">mdi-plus</v-icon>
      </v-btn>
    </div>

    <!-- Quick create form -->
    <div
      v-if="showForm"
      class="mb-2 pa-2"
      style="background: rgba(255,183,77,0.05); border-radius: 8px;"
    >
      <v-text-field
        v-model="createForm.date"
        label="Ngày"
        type="date"
        density="compact"
        variant="outlined"
        hide-details
        class="mb-1"
      />
      <v-text-field
        v-model="createForm.time"
        label="Giờ"
        type="time"
        density="compact"
        variant="outlined"
        hide-details
        class="mb-1"
      />
      <v-text-field
        v-model="createForm.notes"
        label="Ghi chú"
        density="compact"
        variant="outlined"
        hide-details
        class="mb-1"
      />
      <v-btn
        size="small"
        color="warning"
        block
        :loading="creating"
        @click="submitCreate"
      >
        Tạo lịch hẹn
      </v-btn>
    </div>

    <!-- Appointment list -->
    <div
      v-for="apt in appointments"
      :key="apt.id"
      class="mb-1 pa-2"
      style="background: rgba(255,183,77,0.05); border-radius: 8px; border: 1px solid rgba(255,183,77,0.1);"
    >
      <!-- View mode -->
      <div v-if="editingId !== apt.id" class="d-flex align-center">
        <div class="flex-grow-1">
          <div class="text-body-2">
            {{ formatAptDate(apt.appointmentDate) }} {{ apt.appointmentTime || '' }}
          </div>
          <div v-if="apt.notes" class="text-caption" style="opacity: 0.6;">{{ apt.notes }}</div>
        </div>
        <v-chip
          size="x-small"
          :color="statusColor(apt.status)"
          variant="tonal"
          class="mr-1"
        >
          {{ statusLabel(apt.status) }}
        </v-chip>
        <v-btn icon size="x-small" variant="text" color="primary" @click="startEdit(apt)">
          <v-icon size="12">mdi-pencil</v-icon>
        </v-btn>
      </div>

      <!-- Edit mode -->
      <div v-else>
        <v-text-field
          v-model="editForm.date"
          label="Ngày"
          type="date"
          density="compact"
          variant="outlined"
          hide-details
          class="mb-1"
        />
        <v-text-field
          v-model="editForm.time"
          label="Giờ"
          type="time"
          density="compact"
          variant="outlined"
          hide-details
          class="mb-1"
        />
        <v-text-field
          v-model="editForm.notes"
          label="Ghi chú"
          density="compact"
          variant="outlined"
          hide-details
          class="mb-1"
        />
        <v-select
          v-model="editForm.status"
          :items="statusOptions"
          item-title="title"
          item-value="value"
          label="Trạng thái"
          density="compact"
          variant="outlined"
          hide-details
          class="mb-1"
        />
        <div class="d-flex gap-1">
          <v-btn size="small" color="warning" :loading="saving" @click="submitEdit(apt.id)">Lưu</v-btn>
          <v-btn size="small" variant="text" @click="editingId = null">Hủy</v-btn>
        </div>
      </div>
    </div>

    <div v-if="appointments.length === 0" class="text-caption" style="opacity: 0.5;">
      Chưa có lịch hẹn
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { api } from '@/api/index';

export interface Appointment {
  id: string;
  appointmentDate: string;
  appointmentTime: string | null;
  type: string | null;
  status: string;
  notes: string | null;
}

const props = defineProps<{
  contactId: string;
  appointments: Appointment[];
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const showForm = ref(false);
const creating = ref(false);
const saving = ref(false);
const editingId = ref<string | null>(null);

const createForm = reactive({ date: '', time: '', notes: '' });
const editForm = reactive({ date: '', time: '', notes: '', status: '' });

const statusOptions = [
  { title: 'Sắp tới', value: 'scheduled' },
  { title: 'Hoàn thành', value: 'completed' },
  { title: 'Hủy', value: 'cancelled' },
  { title: 'Không đến', value: 'no_show' },
];

function statusColor(s: string): string {
  switch (s) {
    case 'scheduled': return 'blue';
    case 'completed': return 'green';
    case 'cancelled': return 'grey';
    case 'no_show': return 'orange';
    default: return 'grey';
  }
}

function statusLabel(s: string): string {
  return statusOptions.find(o => o.value === s)?.title || s;
}

function formatAptDate(d: string): string {
  return new Date(d).toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function startEdit(apt: Appointment) {
  editingId.value = apt.id;
  editForm.date = apt.appointmentDate
    ? new Date(apt.appointmentDate).toISOString().split('T')[0]
    : '';
  editForm.time = apt.appointmentTime ?? '';
  editForm.notes = apt.notes ?? '';
  editForm.status = apt.status;
}

async function submitCreate() {
  if (!createForm.date || !props.contactId) return;
  creating.value = true;
  try {
    await api.post('/appointments', {
      contactId: props.contactId,
      appointmentDate: new Date(createForm.date + 'T' + (createForm.time || '09:00') + ':00').toISOString(),
      appointmentTime: createForm.time || '09:00',
      type: 'tai_kham',
      notes: createForm.notes || null,
    });
    showForm.value = false;
    createForm.date = '';
    createForm.time = '';
    createForm.notes = '';
    emit('refresh');
  } catch (err) {
    console.error('Create appointment error:', err);
  } finally {
    creating.value = false;
  }
}

async function submitEdit(appointmentId: string) {
  saving.value = true;
  try {
    await api.put(`/appointments/${appointmentId}`, {
      appointmentDate: editForm.date
        ? new Date(editForm.date + 'T' + (editForm.time || '09:00') + ':00').toISOString()
        : undefined,
      appointmentTime: editForm.time || null,
      notes: editForm.notes || null,
      status: editForm.status,
    });
    editingId.value = null;
    emit('refresh');
  } catch (err) {
    console.error('Update appointment error:', err);
  } finally {
    saving.value = false;
  }
}
</script>
