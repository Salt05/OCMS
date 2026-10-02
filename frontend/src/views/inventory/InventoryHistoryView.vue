<template>
  <div class="pa-6">
    <div class="d-flex justify-space-between align-center mb-6 flex-wrap ga-3">
      <div class="d-flex align-center">
        <v-btn icon="lucide-arrow-left" variant="text" to="/inventory" class="mr-4"></v-btn>
        <h1 class="text-h4 font-weight-bold">Lịch sử biến động kho</h1>
      </div>
      <v-btn color="primary" prepend-icon="lucide-plus" @click="openCreateDialog">
        Tạo biến động
      </v-btn>
    </div>

    <!-- Filter -->
    <v-card rounded="lg" elevation="2" class="mb-6 pa-4">
      <v-row align="center">
        <v-col cols="12" md="3">
          <v-text-field
            v-model="filters.sku"
            label="Mã SKU"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            @keyup.enter="loadHistory"
          ></v-text-field>
        </v-col>
        <v-col cols="12" md="3">
          <v-select
            v-model="filters.type"
            :items="typeOptions"
            label="Loại biến động"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            @update:modelValue="loadHistory"
          ></v-select>
        </v-col>
        <v-col cols="12" md="3">
          <v-select
            v-model="filters.channel"
            :items="['CONTACT', 'ODOO', 'SHOPEE']"
            label="Kênh bán"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            @update:modelValue="loadHistory"
          ></v-select>
        </v-col>
        <v-col class="text-right">
          <v-btn color="primary" @click="loadHistory">Tìm kiếm</v-btn>
        </v-col>
      </v-row>
    </v-card>

    <!-- Table -->
    <v-card rounded="lg" elevation="2">
      <v-table hover>
        <thead>
          <tr>
            <th>Thời gian</th>
            <th>Mã SKU</th>
            <th>Loại</th>
            <th>Kênh/Nguồn</th>
            <th class="text-right">Số lượng</th>
            <th class="text-right">Tồn trước</th>
            <th class="text-right">Tồn sau</th>
            <th>Người thực hiện</th>
            <th>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="inventoryStore.loading">
            <td colspan="9" class="text-center pa-4">
              <v-progress-circular indeterminate color="primary"></v-progress-circular>
            </td>
          </tr>
          <tr v-else-if="transactions.length === 0">
            <td colspan="9" class="text-center pa-8 text-grey">Không có lịch sử biến động</td>
          </tr>
          <tr v-else v-for="tx in transactions" :key="tx.id">
            <td class="text-caption">{{ formatDate(tx.performedAt) }}</td>
            <td class="font-weight-bold">{{ tx.sku }}</td>
            <td>
              <v-chip size="small" :color="getTypeColor(tx.type)">{{ formatType(tx.type) }}</v-chip>
            </td>
            <td>
              <div v-if="tx.channel" class="text-caption font-weight-bold">{{ tx.channel }}</div>
              <div v-if="tx.referenceCode" class="text-caption text-grey">{{ tx.referenceCode }}</div>
            </td>
            <td class="text-right font-weight-bold" :class="tx.quantity > 0 ? 'text-success' : 'text-error'">
              {{ tx.quantity > 0 ? '+' : '' }}{{ tx.quantity }}
            </td>
            <td class="text-right text-grey">{{ tx.quantityBefore }}</td>
            <td class="text-right font-weight-bold">{{ tx.quantityAfter }}</td>
            <td class="text-caption">{{ tx.performedBy?.fullName || 'Hệ thống' }}</td>
            <td class="text-caption text-truncate" style="max-width: 200px;" :title="tx.notes || ''">
              {{ tx.notes || '-' }}
            </td>
          </tr>
        </tbody>
      </v-table>
      
      <!-- Pagination -->
      <div class="pa-4 border-t d-flex justify-space-between align-center" v-if="totalPages > 1">
        <span class="text-caption text-grey">Tổng {{ totalTransactions }} giao dịch</span>
        <v-pagination v-model="page" :length="totalPages" density="compact" @update:modelValue="loadHistory"></v-pagination>
      </div>
    </v-card>
    <InventoryTransactionDialog v-model="createDialog" @saved="onTransactionSaved" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useInventoryStore } from '@/stores/inventory';
import InventoryTransactionDialog from '@/components/inventory/InventoryTransactionDialog.vue';

const inventoryStore = useInventoryStore();

const page = ref(1);
const filters = ref({
  sku: '',
  type: '',
  channel: ''
});

const typeOptions = [
  { title: 'Bán hàng', value: 'SALE' },
  { title: 'Nhập kho', value: 'IMPORT' },
  { title: 'Tồn đầu kỳ', value: 'INITIAL_STOCK' },
  { title: 'Khách trả hàng', value: 'RETURN_IN' },
  { title: 'Điều chỉnh (+)', value: 'ADJUSTMENT_IN' },
  { title: 'Điều chỉnh (-)', value: 'ADJUSTMENT_OUT' },
  { title: 'Hư hỏng', value: 'DAMAGE' },
  { title: 'Đặt giữ', value: 'RESERVE' },
];
const createDialog = ref(false);

const transactions = computed(() => inventoryStore.transactions);
const totalTransactions = computed(() => inventoryStore.totalTransactions);
const totalPages = computed(() => Math.ceil(totalTransactions.value / 50));

function openCreateDialog() {
  createDialog.value = true;
}

async function onTransactionSaved() {
  await loadHistory();
}

async function loadHistory() {
  await inventoryStore.fetchTransactions({
    sku: filters.value.sku || undefined,
    type: filters.value.type || undefined,
    channel: filters.value.channel || undefined,
    page: page.value,
    limit: 50
  });
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatType(type: string) {
  const opt = typeOptions.find(o => o.value === type);
  return opt ? opt.title : type;
}

function getTypeColor(type: string) {
  if (['INITIAL_STOCK', 'ADJUSTMENT_IN', 'RETURN_IN'].includes(type)) return 'success';
  if (['SALE', 'ADJUSTMENT_OUT', 'DAMAGE'].includes(type)) return 'error';
  if (type === 'RESERVE') return 'warning';
  return 'default';
}

onMounted(() => {
  loadHistory();
});
</script>

<style scoped>
.border-t { border-top: 1px solid rgba(0,0,0,0.12); }
</style>
