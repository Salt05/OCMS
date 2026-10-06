import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/index';

export interface InventoryItem {
  id: string;
  sku: string;
  productName: string;
  variantName?: string;
  onHand: number;
  reserved: number;
  soldQuantity: number;
  available: number;
  minStock: number;
  unit: string;
  status: string;
  imageUrl?: string | null;
  category?: string | null;
  brand?: string | null;
  updatedAt: string;
}

export interface ProductCacheItem {
  id: string;
  odooId: number;
  sku: string | null;
  name: string;
  displayName: string | null;
  uomName: string | null;
  listPrice: number;
  wholesalePrice: number;
  retailPrice: number;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
}

export interface InventoryTransaction {
  id: string;
  sku: string;
  type: string;
  channel?: string;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  referenceType?: string;
  referenceCode?: string;
  performedBy?: { fullName: string };
  performedAt: string;
  reason?: string;
  notes?: string;
  inventoryItem?: { productName: string; unit: string };
  displayTime?: string;
  operatorName?: string;
}

export interface DashboardStats {
  totalProducts: number;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  outOfStock: number;
  lowStock: number;
  todayImport: number;
  todayExport: number;
  totalSold: number;
}

export interface StockInfo {
  onHand: number;
  reserved: number;
  soldQuantity: number;
  available: number;
  minStock: number;
  unit: string | null;
  updatedAt: string | null;
}

export const useInventoryStore = defineStore('inventory', () => {
  const items = ref<InventoryItem[]>([]);
  const totalItems = ref(0);
  
  const transactions = ref<InventoryTransaction[]>([]);
  const totalTransactions = ref(0);
  
  const stats = ref<DashboardStats | null>(null);
  const productList = ref<ProductCacheItem[]>([]);
  const productListLoading = ref(false);
  
  const loading = ref(false);

  // For product detail popup
  const skuStock = ref<Record<string, StockInfo>>({});
  const skuTransactions = ref<Record<string, InventoryTransaction[]>>({});
  const skuTransactionTotal = ref<Record<string, number>>({});
  const skuLoading = ref<Record<string, boolean>>({});

  async function fetchDashboardStats() {
    try {
      const res = await api.get('/inventory/dashboard');
      stats.value = res.data.data;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  const itemsCache = new Map<string, { items: InventoryItem[]; total: number; timestamp: number }>();
  const ITEMS_CACHE_TTL = 30000; // 30s client cache

  function clearItemsCache() {
    itemsCache.clear();
  }

  async function fetchItems(params: any = {}, options?: { force?: boolean }) {
    if (options?.force) {
      itemsCache.clear();
    }
    const cacheKey = JSON.stringify(params);
    const cached = itemsCache.get(cacheKey);
    if (!options?.force && cached && Date.now() - cached.timestamp < ITEMS_CACHE_TTL) {
      items.value = cached.items;
      totalItems.value = cached.total;
      return;
    }

    loading.value = true;
    try {
      const res = await api.get('/inventory/items', { params });
      items.value = res.data.data.items;
      totalItems.value = res.data.data.total;
      itemsCache.set(cacheKey, {
        items: res.data.data.items,
        total: res.data.data.total,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchTransactions(params: any = {}) {
    loading.value = true;
    try {
      const res = await api.get('/inventory/transactions', { params });
      transactions.value = res.data.data.transactions;
      totalTransactions.value = res.data.data.total;
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createTransaction(data: any) {
    try {
      await api.post('/inventory/transactions', data);
      // Refresh data
      await fetchDashboardStats();
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async function searchReturnOrders(search: string) {
    const res = await api.get('/inventory/return-orders', { params: { search } });
    return res.data.data || [];
  }

  async function processReturn(data: { orderId: string; lines: { id: string; quantity: number }[] }) {
    await api.post('/inventory/returns', data);
    await fetchDashboardStats();
  }

  async function fetchProductList(search = '') {
    productListLoading.value = true;
    try {
      const res = await api.get('/inventory/products', { params: search ? { search } : {} });
      productList.value = res.data.data;
    } catch (err) {
      console.error(err);
    } finally {
      productListLoading.value = false;
    }
  }

  async function fetchStockBySku(sku: string) {
    skuLoading.value[sku] = true;
    try {
      const res = await api.get(`/inventory/stock/${encodeURIComponent(sku)}`);
      skuStock.value[sku] = res.data.data;
    } catch (err) {
      console.error(err);
    } finally {
      skuLoading.value[sku] = false;
    }
  }

  async function fetchTransactionsBySku(sku: string, params: any = {}) {
    skuLoading.value[`tx_${sku}`] = true;
    try {
      const res = await api.get(`/inventory/transactions/by-sku/${encodeURIComponent(sku)}`, { params });
      skuTransactions.value[sku] = res.data.data.transactions;
      skuTransactionTotal.value[sku] = res.data.data.total;
    } catch (err) {
      console.error(err);
    } finally {
      skuLoading.value[`tx_${sku}`] = false;
    }
  }

  return {
    items,
    totalItems,
    transactions,
    totalTransactions,
    stats,
    productList,
    productListLoading,
    loading,
    skuStock,
    skuTransactions,
    skuTransactionTotal,
    skuLoading,
    fetchDashboardStats,
    fetchItems,
    clearItemsCache,
    fetchTransactions,
    createTransaction,
    searchReturnOrders,
    processReturn,
    fetchProductList,
    fetchStockBySku,
    fetchTransactionsBySku,
  };
});
