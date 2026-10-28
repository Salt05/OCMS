import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { CareKanbanCardProps } from '@/components/contacts/CareKanbanCard.vue';

export interface CareKanbanSummary {
  totalRevenue180: number;
  totalCustomers: number;
  repeatPurchaseRate: number;
  averageOrderValue: number;
  customersNeedingRescue: number;
  tierACustomers: number;
}

export interface CareKanbanColumn {
  id: string;
  title: string;
  color: string;
  count: number;
  totalRevenue: number;
  items: CareKanbanCardProps[];
}

export interface CareKanbanData {
  summary: CareKanbanSummary;
  columns: Record<string, CareKanbanColumn>;
  filterOptions: {
    salespeople: Array<{ name: string; count: number }>;
    zones: Array<{ name: string; count: number }>;
  };
}

interface CacheEntry {
  data: CareKanbanData;
  timestamp: number;
}

const CACHE_TTL_MS = 60 * 1000; // 60 seconds client-side cache

export const useCareKanbanStore = defineStore('careKanban', () => {
  // Reactive state for the currently active view
  const summary = ref<CareKanbanSummary>({
    totalRevenue180: 0,
    totalCustomers: 0,
    repeatPurchaseRate: 0,
    averageOrderValue: 0,
    customersNeedingRescue: 0,
    tierACustomers: 0,
  });

  const columns = ref<Record<string, CareKanbanColumn>>({});
  const filterOptions = ref<{
    salespeople: Array<{ name: string; count: number }>;
    zones: Array<{ name: string; count: number }>;
  }>({
    salespeople: [],
    zones: [],
  });

  const loading = ref(false);
  const isRevalidating = ref(false);
  const lastUpdated = ref<Date | null>(null);

  // In-memory cache map keyed by serialized filter parameters
  const cacheMap = new Map<string, CacheEntry>();

  function buildCacheKey(filters: Record<string, any>): string {
    const sorted = Object.keys(filters)
      .sort()
      .reduce((acc: any, key) => {
        if (filters[key] !== undefined && filters[key] !== '' && filters[key] !== 'all' && filters[key] !== 'Tất cả') {
          acc[key] = filters[key];
        }
        return acc;
      }, {});
    return JSON.stringify(sorted);
  }

  /**
   * Fetch Kanban data with Stale-While-Revalidate (SWR) caching.
   * If valid cache exists, it renders immediately (0ms).
   * Background revalidation fetches fresh data without disrupting the user.
   */
  async function fetchKanban(filters: Record<string, any> = {}, options?: { force?: boolean }) {
    const key = buildCacheKey(filters);
    const cached = cacheMap.get(key);
    const now = Date.now();
    const hasValidCache = cached && now - cached.timestamp < CACHE_TTL_MS;

    if (options?.force) {
      cacheMap.delete(key);
    }

    // 1. If we have cached data, apply it instantly
    if (cached && !options?.force) {
      summary.value = cached.data.summary;
      columns.value = cached.data.columns;
      if (cached.data.filterOptions) {
        filterOptions.value = cached.data.filterOptions;
      }

      // If cache is still fresh, no need to re-fetch
      if (hasValidCache) {
        return;
      }
      // If stale, revalidate in background silently
      isRevalidating.value = true;
    } else {
      // First time load with no cache: show skeleton/spinner
      loading.value = true;
    }

    // 2. Fetch fresh data from backend
    try {
      const params: Record<string, any> = { ...filters };
      if (options?.force) {
        params.refresh = 'true';
      }

      const res = await api.get('/crm/care-kanban', { params });
      if (res.data?.success && res.data?.data) {
        const freshData: CareKanbanData = res.data.data;

        // Update reactive state
        summary.value = freshData.summary;
        columns.value = freshData.columns;
        if (freshData.filterOptions) {
          filterOptions.value = freshData.filterOptions;
        }
        lastUpdated.value = new Date();

        // Store into cache
        cacheMap.set(key, {
          data: freshData,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.error('[useCareKanbanStore] Error fetching kanban data:', err);
      throw err;
    } finally {
      loading.value = false;
      isRevalidating.value = false;
    }
  }

  /**
   * Optimistically update a customer's Zalo status in current memory cache
   * when a chat message is triggered.
   */
  function updateCustomerZaloStatus(customerProfileId: string, conversationId: string) {
    for (const col of Object.values(columns.value)) {
      const card = col.items.find((c) => c.customerProfileId === customerProfileId);
      if (card) {
        card.conversationId = conversationId;
        card.lastMessageAt = new Date().toISOString();
        card.daysSinceLastMessage = 0;
        card.contactUrgency = 'good';
        break;
      }
    }
  }

  /**
   * Clear all cached kanban data
   */
  function clearCache() {
    cacheMap.clear();
  }

  return {
    summary,
    columns,
    filterOptions,
    loading,
    isRevalidating,
    lastUpdated,
    fetchKanban,
    updateCustomerZaloStatus,
    clearCache,
  };
});
