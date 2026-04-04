<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h4">
        <v-icon class="mr-2" style="color: #00F2FF;">mdi-cart-outline</v-icon>
        Đơn hàng
      </h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">Tạo đơn</v-btn>
    </div>

    <!-- Stats cards -->
    <v-row class="mb-4">
      <v-col cols="6" sm="3">
        <v-card variant="outlined">
          <v-card-text class="text-center pa-3">
            <v-icon icon="mdi-cart" color="primary" size="28" class="mb-1" />
            <div class="text-h5 font-weight-bold">{{ stats?.totalOrders ?? '—' }}</div>
            <div class="text-caption text-grey">Tổng đơn</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="outlined">
          <v-card-text class="text-center pa-3">
            <v-icon icon="mdi-check-circle" color="green" size="28" class="mb-1" />
            <div class="text-h5 font-weight-bold">{{ stats?.completedOrders ?? '—' }}</div>
            <div class="text-caption text-grey">Hoàn thành</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="outlined">
          <v-card-text class="text-center pa-3">
            <v-icon icon="mdi-currency-usd" color="teal" size="28" class="mb-1" />
            <div class="text-h6 font-weight-bold">{{ formatVND(stats?.totalRevenue ?? 0) }}</div>
            <div class="text-caption text-grey">Doanh thu</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="outlined">
          <v-card-text class="text-center pa-3">
            <v-icon icon="mdi-calendar-today" color="orange" size="28" class="mb-1" />
            <div class="text-h6 font-weight-bold">{{ formatVND(stats?.todayRevenue ?? 0) }}</div>
            <div class="text-caption text-grey">Doanh thu hôm nay</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Filters -->
    <v-row class="mb-3">
      <v-col cols="12" sm="6" md="4">
        <v-text-field v-model="search" label="Tìm kiếm mã đơn, khách hàng..." density="compact"
          variant="outlined" prepend-inner-icon="mdi-magnify" hide-details clearable @update:model-value="onSearch" />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-select v-model="statusFilter" label="Trạng thái" :items="statusFilterItems"
          item-title="text" item-value="value" density="compact" variant="outlined"
          hide-details clearable @update:model-value="onSearch" />
      </v-col>
    </v-row>

    <!-- Orders table -->
    <v-card variant="outlined" class="mb-6">
      <v-progress-linear v-if="loading" indeterminate color="primary" />
      <v-table density="compact">
        <thead>
          <tr>
            <th>Mã đơn</th>
            <th>Khách hàng</th>
            <th>Tổng tiền</th>
            <th>Trạng thái</th>
            <th>Nhân viên</th>
            <th>Ngày tạo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!loading && orders.length === 0">
            <td colspan="7" class="text-center text-grey py-6">Không có đơn hàng</td>
          </tr>
          <tr v-for="o in orders" :key="o.id">
            <td class="text-caption font-weight-medium">{{ o.orderCode }}</td>
            <td>{{ o.contact?.fullName || '—' }}</td>
            <td>{{ formatVND(o.totalAmount) }}</td>
            <td>
              <v-chip size="x-small" :color="statusColor(o.status)" variant="tonal">
                {{ statusLabel(o.status) }}
              </v-chip>
            </td>
            <td>{{ o.createdBy?.fullName || '—' }}</td>
            <td class="text-caption">{{ formatDate(o.createdAt) }}</td>
            <td>
              <v-btn icon size="x-small" variant="text" @click="openEdit(o)">
                <v-icon size="16">mdi-pencil</v-icon>
              </v-btn>
              <v-btn icon size="x-small" variant="text" color="error" @click="confirmDelete(o.id)">
                <v-icon size="16">mdi-delete</v-icon>
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Staff performance -->
    <OrderStaffTable :staff-stats="staffStats" />

    <!-- Create / Edit dialog -->
    <v-dialog v-model="dialog" max-width="480">
      <v-card>
        <v-card-title>{{ editingId ? 'Cập nhật đơn hàng' : 'Tạo đơn hàng' }}</v-card-title>
        <v-card-text>
          <v-text-field v-if="!editingId" v-model="form.contactId" label="ID Khách hàng" density="compact"
            variant="outlined" class="mb-3" hide-details />
          <v-text-field v-model.number="form.totalAmount" label="Tổng tiền (VND)" type="number"
            density="compact" variant="outlined" class="mb-3" hide-details />
          <v-select v-model="form.status" label="Trạng thái" :items="ORDER_STATUS_OPTIONS"
            item-title="text" item-value="value" density="compact" variant="outlined" class="mb-3" hide-details />
          <v-textarea v-model="form.notes" label="Ghi chú" rows="2" density="compact"
            variant="outlined" hide-details />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">Huỷ</v-btn>
          <v-btn color="primary" :loading="saving" @click="submit">Lưu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useOrders, ORDER_STATUS_OPTIONS } from '@/composables/use-orders';
import type { Order } from '@/composables/use-orders';
import OrderStaffTable from '@/components/orders/OrderStaffTable.vue';

const {
  orders, loading, saving, stats, staffStats,
  fetchOrders, createOrder, updateOrder, deleteOrder,
  fetchStats, fetchStaffStats, statusColor, statusLabel,
} = useOrders();

const search = ref('');
const statusFilter = ref<string | null>(null);
const dialog = ref(false);
const editingId = ref<string | null>(null);

const statusFilterItems = [{ text: 'Tất cả', value: '' }, ...ORDER_STATUS_OPTIONS];

const form = reactive({ contactId: '', totalAmount: 0, status: 'new', notes: '' });

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN');
}

function buildParams() {
  const p: Record<string, string> = {};
  if (search.value) p['search'] = search.value;
  if (statusFilter.value) p['status'] = statusFilter.value;
  return p;
}

function onSearch() { fetchOrders(buildParams()); }

function openCreate() {
  editingId.value = null;
  Object.assign(form, { contactId: '', totalAmount: 0, status: 'new', notes: '' });
  dialog.value = true;
}

function openEdit(o: Order) {
  editingId.value = o.id;
  Object.assign(form, { contactId: o.contactId, totalAmount: o.totalAmount, status: o.status, notes: o.notes || '' });
  dialog.value = true;
}

async function submit() {
  if (editingId.value) {
    await updateOrder(editingId.value, { totalAmount: form.totalAmount, status: form.status, notes: form.notes || null });
  } else {
    await createOrder({ contactId: form.contactId, totalAmount: form.totalAmount, status: form.status, notes: form.notes || null });
  }
  dialog.value = false;
  fetchOrders(buildParams());
  fetchStats();
}

async function confirmDelete(id: string) {
  if (!confirm('Xoá đơn hàng này?')) return;
  await deleteOrder(id);
  fetchOrders(buildParams());
  fetchStats();
}

onMounted(() => {
  fetchOrders();
  fetchStats();
  fetchStaffStats();
});
</script>
