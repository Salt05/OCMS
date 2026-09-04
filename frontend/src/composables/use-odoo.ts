/**
 * Composable for Odoo Data & Caching:
 * - LocalStorage Persistent Cache + Stale-While-Revalidate (SWR)
 * - Payment Terms (cached globally in frontend)
 * - Sellable Products with rich details (cached in LocalStorage & RAM)
 * - Instant client-side search & filtering with zero network overhead
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface PaymentTerm {
  id: number;
  name: string;
}

export interface OdooProduct {
  id: number;
  odoo_id?: number | string;
  name: string;
  default_code: string;
  sku?: string;
  display_name: string;
  list_price: number;
  wholesale_price?: number;
  retail_price?: number;
  uom_id: number | null;
  uom_name: string;
  weight?: string;
  specification?: string;
  ingredients?: string;
  nutritional_info?: string;
  target?: string;
  preservation?: string;
  image_url?: string;
  directus_id?: string | number;
  description?: string;
  product_group_id?: number | null;
  product_group_name?: string | null;
  product_groups?: { id: number; name: string; slug?: string }[];
}

export const SKU_GROUP_MAP: Record<string, { id: number; name: string }> = {
  // Nhóm 1: Nhóm không quấn gà
  'B03': { id: 1, name: 'Nhóm không quấn gà' },
  'B06': { id: 1, name: 'Nhóm không quấn gà' },
  'E01': { id: 1, name: 'Nhóm không quấn gà' },
  'E02': { id: 1, name: 'Nhóm không quấn gà' },
  'E03': { id: 1, name: 'Nhóm không quấn gà' },
  'D02': { id: 1, name: 'Nhóm không quấn gà' },
  'D03': { id: 1, name: 'Nhóm không quấn gà' },

  // Nhóm 2: Nhóm quấn gà
  'C24': { id: 2, name: 'Nhóm quấn gà' },
  'C11': { id: 2, name: 'Nhóm quấn gà' },
  'C17': { id: 2, name: 'Nhóm quấn gà' },
  'D01': { id: 2, name: 'Nhóm quấn gà' },
  'DB01': { id: 2, name: 'Nhóm quấn gà' },

  // Nhóm 3: Nhóm da bò
  'C22': { id: 3, name: 'Nhóm da bò' },
  'C33': { id: 3, name: 'Nhóm da bò' },
  'C34': { id: 3, name: 'Nhóm da bò' },
  'C37': { id: 3, name: 'Nhóm da bò' },
  'C35': { id: 3, name: 'Nhóm da bò' },
  'C38': { id: 3, name: 'Nhóm da bò' },
  'C39': { id: 3, name: 'Nhóm da bò' },
  'C36': { id: 3, name: 'Nhóm da bò' },
  'C42': { id: 3, name: 'Nhóm da bò' },
  'C41': { id: 3, name: 'Nhóm da bò' },
  'C14': { id: 3, name: 'Nhóm da bò' },
  'C14-1': { id: 3, name: 'Nhóm da bò' },

  // Nhóm 4: Nhóm keo nhai
  'C10': { id: 4, name: 'Nhóm keo nhai' },
  'C10-1': { id: 4, name: 'Nhóm keo nhai' },
  'DB02': { id: 4, name: 'Nhóm keo nhai' },
  'DB05': { id: 4, name: 'Nhóm keo nhai' },
  'DB04': { id: 4, name: 'Nhóm keo nhai' },

  // Nhóm 5: Nhóm thịt sấy
  'DB03': { id: 5, name: 'Nhóm thịt sấy' },
  'DB06': { id: 5, name: 'Nhóm thịt sấy' },

  // Nhóm 6: Nhóm que gặm tổng hợp
  'C28': { id: 6, name: 'Nhóm que gặm tổng hợp' },

  // Nhóm 7: Tã cho thú cưng
  'TL01': { id: 7, name: 'Tã cho thú cưng' },
  'TL02': { id: 7, name: 'Tã cho thú cưng' },
  'TL04': { id: 7, name: 'Tã cho thú cưng' },
  'TL03': { id: 7, name: 'Tã cho thú cưng' },
  'TLT01': { id: 7, name: 'Tã cho thú cưng' },
  'TLT02': { id: 7, name: 'Tã cho thú cưng' },
  'TLT04': { id: 7, name: 'Tã cho thú cưng' },
  'TLT03': { id: 7, name: 'Tã cho thú cưng' },
};

function enrichProductGroup(p: OdooProduct): OdooProduct {
  if (p.product_group_name && p.product_group_id != null) {
    return p;
  }
  const sku = (p.sku || p.default_code || '').trim();
  const match = SKU_GROUP_MAP[sku];
  if (match) {
    return {
      ...p,
      product_group_id: match.id,
      product_group_name: match.name,
      product_groups: p.product_groups && p.product_groups.length > 0 ? p.product_groups : [{ id: match.id, name: match.name }],
    };
  }
  return p;
}

const PRODUCTS_STORAGE_KEY = 'ocms_products_cache_v3';
const TERMS_STORAGE_KEY = 'ocms_terms_cache_v3';
const STALE_TIME = 10 * 60 * 1000; // 10 minutes

// Global in-memory singleton cache
const paymentTerms = ref<PaymentTerm[]>([]);
const products = ref<OdooProduct[]>([]);
const lastProductSync = ref<number>(0);
const loadingPaymentTerms = ref(false);
const loadingProducts = ref(false);
const isSyncing = ref(false);

// Auto-hydrate from LocalStorage immediately on module load
try {
  const cachedProds = localStorage.getItem(PRODUCTS_STORAGE_KEY);
  if (cachedProds) {
    const parsed = JSON.parse(cachedProds);
    if (Array.isArray(parsed.products) && parsed.products.length > 0) {
      products.value = parsed.products.map(enrichProductGroup);
      lastProductSync.value = parsed.timestamp || 0;
    }
  }

  const cachedTerms = localStorage.getItem(TERMS_STORAGE_KEY);
  if (cachedTerms) {
    const parsed = JSON.parse(cachedTerms);
    if (Array.isArray(parsed.terms) && parsed.terms.length > 0) {
      paymentTerms.value = parsed.terms;
    }
  }
} catch (e) {
  console.warn('[useOdoo] Failed to hydrate local cache:', e);
}

export function useOdoo() {
  /**
   * Fetch payment terms
   */
  async function fetchPaymentTerms(force = false) {
    if (paymentTerms.value.length > 0 && !force) {
      return paymentTerms.value;
    }

    loadingPaymentTerms.value = true;
    try {
      const res = await api.get('/odoo/payment-terms', {
        params: force ? { refresh: 'true' } : {},
      });
      if (res.data?.terms) {
        paymentTerms.value = res.data.terms;
        try {
          localStorage.setItem(TERMS_STORAGE_KEY, JSON.stringify({
            timestamp: Date.now(),
            terms: res.data.terms,
          }));
        } catch {}
      }
    } catch (err) {
      console.error('[useOdoo] Failed to fetch payment terms:', err);
    } finally {
      loadingPaymentTerms.value = false;
    }
    return paymentTerms.value;
  }

  /**
   * Fetch all products with SWR (Stale-While-Revalidate)
   */
  async function fetchProducts(force = false) {
    const now = Date.now();
    const hasCachedData = products.value.length > 0;
    const isStale = now - lastProductSync.value > STALE_TIME;

    // If we have cached data and not forced, return cache immediately (0ms)
    // and revalidate in the background if stale
    if (hasCachedData && !force) {
      if (isStale && !isSyncing.value) {
        // Background silent revalidation
        revalidateProductsInBackground();
      }
      return products.value;
    }

    loadingProducts.value = true;
    try {
      const res = await api.get('/odoo/products', {
        params: force ? { refresh: 'true' } : {},
      });
      if (res.data?.products && Array.isArray(res.data.products)) {
        const enriched = res.data.products.map(enrichProductGroup);
        products.value = enriched;
        lastProductSync.value = Date.now();
        try {
          localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify({
            timestamp: lastProductSync.value,
            total: enriched.length,
            products: enriched,
          }));
        } catch {}
      }
    } catch (err) {
      console.error('[useOdoo] Failed to fetch products:', err);
    } finally {
      loadingProducts.value = false;
    }
    return products.value;
  }

  /**
   * Silent background revalidation
   */
  async function revalidateProductsInBackground() {
    if (isSyncing.value) return;
    isSyncing.value = true;
    try {
      const res = await api.get('/odoo/products');
      if (res.data?.products && Array.isArray(res.data.products)) {
        const enriched = res.data.products.map(enrichProductGroup);
        products.value = enriched;
        lastProductSync.value = Date.now();
        try {
          localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify({
            timestamp: lastProductSync.value,
            total: enriched.length,
            products: enriched,
          }));
        } catch {}
      }
    } catch (err) {
      console.warn('[useOdoo] Background revalidation failed:', err);
    } finally {
      isSyncing.value = false;
    }
  }

  /**
   * Explicitly force sync cache from Directus + Odoo
   */
  async function syncProducts() {
    isSyncing.value = true;
    loadingProducts.value = true;
    try {
      const res = await api.post('/odoo/products/sync');
      if (res.data?.success) {
        // Refetch full list
        await fetchProducts(true);
      }
    } catch (err) {
      console.error('[useOdoo] Sync products failed:', err);
    } finally {
      isSyncing.value = false;
      loadingProducts.value = false;
    }
  }

  /**
   * Remove Vietnamese diacritics for flexible fuzzy searching
   */
  function removeVietnameseTones(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  /**
   * Fast custom filter for Vuetify v-autocomplete matching code, name, and unaccented text
   */
  function customProductFilter(_itemTitle: string, queryText: string, item?: any): boolean {
    if (!queryText) return true;
    const rawItem = item?.raw || item;
    if (!rawItem) return false;

    const q = removeVietnameseTones(queryText.trim());
    const code = removeVietnameseTones(rawItem.default_code || '');
    const name = removeVietnameseTones(rawItem.name || '');
    const display = removeVietnameseTones(rawItem.display_name || '');

    return code.includes(q) || name.includes(q) || display.includes(q);
  }

  /**
   * Filter product list directly by query text and optional product group ID
   */
  function filterProducts(queryText: string, groupId?: number | string | null): OdooProduct[] {
    let list = products.value;

    if (groupId !== undefined && groupId !== null && groupId !== 'all') {
      list = list.filter(p => {
        if (p.product_group_id === groupId) return true;
        if (Array.isArray(p.product_groups) && p.product_groups.some(g => g.id === groupId)) return true;
        return false;
      });
    }

    if (!queryText || !queryText.trim()) return list;

    const q = removeVietnameseTones(queryText.trim());
    return list.filter(p => {
      const code = removeVietnameseTones(p.default_code || p.sku || '');
      const name = removeVietnameseTones(p.name || '');
      const display = removeVietnameseTones(p.display_name || '');
      return code.includes(q) || name.includes(q) || display.includes(q);
    });
  }

  function formatCurrency(val: number): string {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
  }

  return {
    paymentTerms,
    products,
    loadingPaymentTerms,
    loadingProducts,
    isSyncing,
    lastProductSync,
    fetchPaymentTerms,
    fetchProducts,
    syncProducts,
    customProductFilter,
    filterProducts,
    formatCurrency,
    removeVietnameseTones,
  };
}

