/**
 * Composable for Order Management:
 * - Direct local database querying for Odoo synchronized orders
 * - Stats, staff performance, salesperson filters
 * - Single order detail fetching with line items
 * - Clean & incremental Odoo sync triggers
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface OrderLineItem {
  id: string;
  odooLineId: number;
  productName: string;
  productSku: string | null;
  odooProductId: number | null;
  uomName: string | null;
  quantity: number;
  originalPrice?: number | null;
  discountedPrice?: number | null;
  priceUnit: number;
  discount: number;
  priceSubtotal: number;
  priceTotal: number;
  qtyDelivered: number;
  qtyInvoiced: number;
}

export interface OrderItem {
  id: string;
  odooOrderId: number;
  orderCode: string;
  odooPartnerId: number;
  partnerName: string | null;
  customerProfileId: string | null;
  customerProfile?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
  } | null;
  dateOrder: string;
  state: 'draft' | 'sent' | 'sale' | 'done' | 'cancel' | string;
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
  amountUndiscounted: number;
  margin: number;
  marginPercent: number;
  invoiceStatus: string | null;
  deliveryStatus: string | null;
  warehouseName: string | null;
  pricelistName: string | null;
  salesperson: string | null;
  salespersonId: number | null;
  expectedDate: string | null;
  validityDate: string | null;
  activitySummary: string | null;
  pickingIds: any;
  paymentTerm?: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  lines?: OrderLineItem[];
  _count?: { lines: number };
  conversationId?: string;
  isAiDraft?: boolean;
}

export interface OrderStats {
  totalOrders: number;
  confirmedOrders: number;
  draftOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  todayRevenue: number;
  totalMargin: number;
  avgOrderValue: number;
}

export interface StaffStat {
  salesperson: string;
  orderCount: number;
  totalRevenue: number;
  totalMargin: number;
}

export const ODOO_ORDER_STATES = [
  { text: 'Tất cả trạng thái', value: '' },
  { text: 'Báo giá (Draft)', value: 'draft', color: 'info' },
  { text: 'Đã xác nhận (Sale)', value: 'sale', color: 'primary' },
  { text: 'Hoàn thành (Done)', value: 'done', color: 'success' },
  { text: 'Đã hủy (Cancel)', value: 'cancel', color: 'error' },
];

export const ODOO_DELIVERY_STATUSES = [
  { text: 'Tất cả vận chuyển', value: '' },
  { text: 'Chờ giao hàng', value: 'pending', color: 'warning' },
  { text: 'Đang giao', value: 'started', color: 'info' },
  { text: 'Đã giao đủ', value: 'full', color: 'success' },
];

export const ODOO_INVOICE_STATUSES = [
  { text: 'Tất cả hóa đơn', value: '' },
  { text: 'Cần xuất HĐ', value: 'to invoice', color: 'warning' },
  { text: 'Đã xuất HĐ', value: 'invoiced', color: 'success' },
  { text: 'Không xuất HĐ', value: 'no', color: 'grey' },
];

export function useOrders() {
  const orders = ref<OrderItem[]>([]);
  const selectedOrder = ref<OrderItem | null>(null);
  const total = ref(0);
  const totalPages = ref(1);
  const loading = ref(false);
  const detailLoading = ref(false);
  const syncing = ref(false);
  const stats = ref<OrderStats | null>(null);
  const staffStats = ref<StaffStat[]>([]);
  const salespersons = ref<string[]>([]);

  async function fetchOrders(params: Record<string, string | number> = {}) {
    loading.value = true;
    try {
      const res = await api.get('/orders', { params });
      orders.value = res.data.orders || [];
      total.value = res.data.total || 0;
      totalPages.value = res.data.totalPages || 1;
    } catch (err) {
      console.error('[useOrders] fetchOrders error:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchOrderDetail(id: string): Promise<OrderItem | null> {
    detailLoading.value = true;
    try {
      const res = await api.get(`/orders/${id}`);
      selectedOrder.value = res.data.order;
      return res.data.order;
    } catch (err) {
      console.error('[useOrders] fetchOrderDetail error:', err);
      return null;
    } finally {
      detailLoading.value = false;
    }
  }

  async function fetchStats(params: Record<string, string> = {}) {
    try {
      const res = await api.get('/orders/stats', { params });
      stats.value = res.data;
    } catch (err) {
      console.error('[useOrders] fetchStats error:', err);
    }
  }

  async function fetchStaffStats() {
    try {
      const res = await api.get('/orders/by-staff');
      staffStats.value = res.data.staffStats || [];
    } catch (err) {
      console.error('[useOrders] fetchStaffStats error:', err);
    }
  }

  async function fetchSalespersons() {
    try {
      const res = await api.get('/orders/salespersons');
      salespersons.value = res.data.salespersons || [];
    } catch (err) {
      console.error('[useOrders] fetchSalespersons error:', err);
    }
  }

  async function cleanAndSyncOrders() {
    syncing.value = true;
    try {
      const res = await api.post('/sync/orders/clean');
      return res.data;
    } catch (err) {
      console.error('[useOrders] cleanAndSyncOrders error:', err);
      throw err;
    } finally {
      syncing.value = false;
    }
  }

  async function syncOrders() {
    syncing.value = true;
    try {
      const res = await api.post('/sync/orders');
      return res.data;
    } catch (err) {
      console.error('[useOrders] syncOrders error:', err);
      throw err;
    } finally {
      syncing.value = false;
    }
  }

  function stateColor(state: string) {
    switch (state) {
      case 'draft': return 'amber-darken-2';
      case 'sent': return 'blue-grey';
      case 'sale': return 'primary';
      case 'done': return 'success';
      case 'cancel': return 'error';
      default: return 'grey';
    }
  }

  function stateLabel(state: string) {
    switch (state) {
      case 'draft': return 'Báo giá';
      case 'sent': return 'Đã gửi BG';
      case 'sale': return 'Đơn hàng';
      case 'done': return 'Hoàn thành';
      case 'cancel': return 'Đã hủy';
      default: return state || '—';
    }
  }

  function deliveryStatusColor(status: string | null) {
    switch (status) {
      case 'pending': return 'warning';
      case 'started': return 'info';
      case 'full': return 'success';
      default: return 'grey-lighten-1';
    }
  }

  function deliveryStatusLabel(status: string | null) {
    switch (status) {
      case 'pending': return 'Chờ giao';
      case 'started': return 'Đang giao';
      case 'full': return 'Đã giao';
      default: return '—';
    }
  }

  function invoiceStatusColor(status: string | null) {
    switch (status) {
      case 'to invoice': return 'warning';
      case 'invoiced': return 'success';
      case 'no': return 'grey';
      default: return 'grey';
    }
  }

  function invoiceStatusLabel(status: string | null) {
    switch (status) {
      case 'to invoice': return 'Cần xuất HĐ';
      case 'invoiced': return 'Đã xuất HĐ';
      case 'no': return 'Không';
      default: return status || '—';
    }
  }

  const pendingOrders = ref<OrderItem[]>([]);
  const pendingTotal = ref(0);
  const pendingLoading = ref(false);

  const processedAiOrders = ref<OrderItem[]>([]);
  const processedAiTotal = ref(0);
  const processedAiLoading = ref(false);

  async function fetchPendingOrders() {
    pendingLoading.value = true;
    try {
      const res = await api.get('/orders/pending-ai');
      pendingOrders.value = res.data.orders || [];
      pendingTotal.value = res.data.total || 0;
    } catch (err) {
      console.error('[useOrders] fetchPendingOrders error:', err);
    } finally {
      pendingLoading.value = false;
    }
  }

  async function fetchProcessedAiOrders(params: Record<string, any> = {}) {
    processedAiLoading.value = true;
    try {
      const res = await api.get('/orders/processed-ai', { params });
      processedAiOrders.value = res.data.orders || [];
      processedAiTotal.value = res.data.total || 0;
    } catch (err) {
      console.error('[useOrders] fetchProcessedAiOrders error:', err);
    } finally {
      processedAiLoading.value = false;
    }
  }

  async function confirmOrder(id: string, customNote?: string, customZaloMessage?: string, lines?: any[]) {
    try {
      const res = await api.post(`/orders/${id}/confirm`, { customNote, customZaloMessage, lines });
      return res.data;
    } catch (err) {
      console.error('[useOrders] confirmOrder error:', err);
      throw err;
    }
  }

  async function rejectOrder(id: string, reason: string, customZaloMessage?: string) {
    try {
      const res = await api.post(`/orders/${id}/reject`, { reason, customZaloMessage });
      return res.data;
    } catch (err) {
      console.error('[useOrders] rejectOrder error:', err);
      throw err;
    }
  }

  return {
    orders,
    selectedOrder,
    total,
    totalPages,
    loading,
    detailLoading,
    syncing,
    stats,
    staffStats,
    salespersons,
    pendingOrders,
    pendingTotal,
    pendingLoading,
    processedAiOrders,
    processedAiTotal,
    processedAiLoading,
    fetchOrders,
    fetchPendingOrders,
    fetchProcessedAiOrders,
    confirmOrder,
    rejectOrder,
    fetchOrderDetail,
    fetchStats,
    fetchStaffStats,
    fetchSalespersons,
    cleanAndSyncOrders,
    syncOrders,
    stateColor,
    stateLabel,
    deliveryStatusColor,
    deliveryStatusLabel,
    invoiceStatusColor,
    invoiceStatusLabel,
  };
}
