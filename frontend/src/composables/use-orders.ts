/**
 * Composable for Order Management:
 * - CRUD operations for orders
 * - Stats and staff performance data
 * - Status helpers for labels and colors
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface Order {
  id: string;
  orderCode: string;
  contactId: string;
  contact?: { id: string; fullName: string | null; phone: string | null };
  createdByUserId: string;
  createdBy?: { id: string; fullName: string };
  totalAmount: number;
  status: string;
  notes: string | null;
  conversationId: string | null;
  createdAt: string;
}

export const ORDER_STATUS_OPTIONS = [
  { text: 'Mới', value: 'new', color: 'grey' },
  { text: 'Đã xác nhận', value: 'confirmed', color: 'blue' },
  { text: 'Đã thanh toán', value: 'paid', color: 'teal' },
  { text: 'Đang giao', value: 'shipped', color: 'indigo' },
  { text: 'Hoàn thành', value: 'completed', color: 'green' },
  { text: 'Đã huỷ', value: 'cancelled', color: 'red' },
];

export function useOrders() {
  const orders = ref<Order[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const saving = ref(false);
  const stats = ref<any>(null);
  const staffStats = ref<any[]>([]);

  async function fetchOrders(params: Record<string, string> = {}) {
    loading.value = true;
    try {
      const res = await api.get('/orders', { params });
      orders.value = res.data.orders || [];
      total.value = res.data.total || 0;
    } catch (err) { console.error(err); }
    finally { loading.value = false; }
  }

  async function createOrder(data: Partial<Order>) {
    saving.value = true;
    try {
      const res = await api.post('/orders', data);
      return res.data;
    } catch (err) { console.error(err); return null; }
    finally { saving.value = false; }
  }

  async function updateOrder(id: string, data: Partial<Order>) {
    try {
      const res = await api.put(`/orders/${id}`, data);
      return res.data;
    } catch (err) { console.error(err); return null; }
  }

  async function deleteOrder(id: string) {
    try { await api.delete(`/orders/${id}`); return true; }
    catch { return false; }
  }

  async function fetchStats() {
    try {
      const res = await api.get('/orders/stats');
      stats.value = res.data;
    } catch {}
  }

  async function fetchStaffStats() {
    try {
      const res = await api.get('/orders/by-staff');
      staffStats.value = res.data.staffStats || [];
    } catch {}
  }

  async function fetchContactOrders(contactId: string) {
    try {
      const res = await api.get(`/contacts/${contactId}/orders`);
      return res.data.orders || [];
    } catch { return []; }
  }

  function statusColor(s: string) {
    return ORDER_STATUS_OPTIONS.find(o => o.value === s)?.color || 'grey';
  }

  function statusLabel(s: string) {
    return ORDER_STATUS_OPTIONS.find(o => o.value === s)?.text || s;
  }

  return {
    orders, total, loading, saving, stats, staffStats,
    fetchOrders, createOrder, updateOrder, deleteOrder,
    fetchStats, fetchStaffStats, fetchContactOrders,
    statusColor, statusLabel,
  };
}
