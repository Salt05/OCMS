<template>
  <div>
    <v-divider class="my-3" />
    <div class="d-flex align-center mb-2">
      <v-icon size="16" color="success" class="mr-1">lucide-shopping-cart</v-icon>
      <span class="text-caption font-weight-bold">Đơn hàng ({{ contactOrders.length }})</span>
      <v-spacer />
    </div>

    <!-- Order list -->
    <div v-for="o in contactOrders" :key="o.id"
      class="mb-1 pa-2 d-flex align-center cursor-pointer hover-bg-light"
      style="border-radius: 8px; border: 1px solid rgba(76,175,80,0.1); background: rgba(76,175,80,0.03); cursor: pointer;"
      @click="openOrder(o)"
    >
      <div class="flex-grow-1">
        <div class="text-body-2 font-weight-medium">{{ formatVND(o.amountTotal || o.totalAmount) }}</div>
        <div class="text-caption" style="opacity: 0.6;">{{ o.orderCode }} · {{ formatDate(o.dateOrder || o.createdAt) }}</div>
      </div>
      <v-chip size="x-small" :color="stateColor(o.state || o.status)" variant="tonal">{{ stateLabel(o.state || o.status) }}</v-chip>
    </div>

    <div v-if="contactOrders.length === 0" class="text-caption text-grey text-center py-2">
      Chưa có đơn hàng
    </div>

    <OrderDetailModal 
      v-if="selectedOrder"
      v-model="showOrderModal" 
      :order="selectedOrder" 
      @saved="loadOrders" 
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { api } from '@/api/index';
import { useOrders } from '@/composables/use-orders';
import OrderDetailModal from '@/components/orders/OrderDetailModal.vue';

const props = defineProps<{ contactId: string | null }>();

const { stateColor, stateLabel } = useOrders();

const contactOrders = ref<any[]>([]);

const showOrderModal = ref(false);
const selectedOrder = ref<any>(null);

function openOrder(order: any) {
  selectedOrder.value = order;
  showOrderModal.value = true;
}

async function loadOrders() {
  if (!props.contactId) return;
  try {
    const res = await api.get(`/contacts/${props.contactId}/orders`);
    contactOrders.value = res.data.orders || [];
  } catch {}
}

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN');
}

watch(() => props.contactId, (id) => { if (id) loadOrders(); }, { immediate: true });
</script>
