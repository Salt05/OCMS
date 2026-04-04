<template>
  <div>
    <v-divider class="my-3" />
    <div class="d-flex align-center mb-2">
      <v-icon size="16" color="success" class="mr-1">mdi-cart</v-icon>
      <span class="text-caption font-weight-bold">Đơn hàng ({{ contactOrders.length }})</span>
      <v-spacer />
      <v-btn size="x-small" variant="text" color="primary" @click="showCreate = !showCreate">
        <v-icon size="14">mdi-plus</v-icon>
      </v-btn>
    </div>

    <!-- Quick create form -->
    <div v-if="showCreate" class="mb-2 pa-2" style="background: rgba(76,175,80,0.05); border-radius: 8px;">
      <v-text-field v-model.number="newOrder.totalAmount" label="Tổng tiền" type="number"
        density="compact" variant="outlined" hide-details class="mb-1" />
      <v-text-field v-model="newOrder.notes" label="Ghi chú" density="compact"
        variant="outlined" hide-details class="mb-1" />
      <v-btn size="small" color="success" block :loading="creating" @click="submitCreate">Tạo đơn</v-btn>
    </div>

    <!-- Order list -->
    <div v-for="o in contactOrders" :key="o.id"
      class="mb-1 pa-2 d-flex align-center"
      style="border-radius: 8px; border: 1px solid rgba(76,175,80,0.1); background: rgba(76,175,80,0.03);"
    >
      <div class="flex-grow-1">
        <div class="text-body-2 font-weight-medium">{{ formatVND(o.totalAmount) }}</div>
        <div class="text-caption" style="opacity: 0.6;">{{ o.orderCode }} · {{ formatDate(o.createdAt) }}</div>
      </div>
      <v-chip size="x-small" :color="statusColor(o.status)" variant="tonal">{{ statusLabel(o.status) }}</v-chip>
    </div>

    <div v-if="contactOrders.length === 0 && !showCreate" class="text-caption text-grey text-center py-2">
      Chưa có đơn hàng
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { api } from '@/api/index';
import { useOrders } from '@/composables/use-orders';

const props = defineProps<{ contactId: string | null }>();

const { statusColor, statusLabel } = useOrders();

const contactOrders = ref<any[]>([]);
const showCreate = ref(false);
const creating = ref(false);
const newOrder = reactive({ totalAmount: 0, notes: '' });

async function loadOrders() {
  if (!props.contactId) return;
  try {
    const res = await api.get(`/contacts/${props.contactId}/orders`);
    contactOrders.value = res.data.orders || [];
  } catch {}
}

async function submitCreate() {
  if (!props.contactId || !newOrder.totalAmount) return;
  creating.value = true;
  try {
    await api.post('/orders', {
      contactId: props.contactId,
      totalAmount: newOrder.totalAmount,
      notes: newOrder.notes || null,
      conversationId: null,
    });
    showCreate.value = false;
    newOrder.totalAmount = 0;
    newOrder.notes = '';
    await loadOrders();
  } catch (err) { console.error(err); }
  finally { creating.value = false; }
}

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN');
}

watch(() => props.contactId, (id) => { if (id) loadOrders(); }, { immediate: true });
</script>
