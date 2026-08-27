/**
 * Directus Service
 * Primary product data source with rich specifications, wholesale prices,
 * ingredient information, and direct image assets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';

export interface DirectusProductItem {
  id: number;
  directus_id: number | string;
  odoo_id: number;
  default_code: string;
  sku: string;
  name: string;
  display_name: string;
  list_price: number;
  retail_price: number;
  wholesale_price: number;
  uom_id?: number | null;
  uom_name: string;
  weight?: string;
  specification?: string;
  image_url?: string;
  description?: string;
  ingredients?: string;
  nutritional_info?: string;
  target?: string;
  preservation?: string;
  product_group_id?: number | null;
  product_group_name?: string | null;
  product_groups?: { id: number; name: string; slug?: string }[];
}

const DEFAULT_GROUP_NAMES: Record<number, string> = {
  1: 'Nhóm không quấn gà',
  2: 'Nhóm quấn gà',
  3: 'Nhóm da bò',
  4: 'Nhóm keo nhai',
  5: 'Nhóm thịt sấy',
  6: 'Nhóm que gặm tổng hợp',
  7: 'Tã cho thú cưng',
  8: 'Cát vệ sinh cho mèo',
};

const SKU_GROUP_MAP: Record<string, { id: number; name: string }> = {
  'B03': { id: 1, name: 'Nhóm không quấn gà' },
  'B06': { id: 1, name: 'Nhóm không quấn gà' },
  'E01': { id: 1, name: 'Nhóm không quấn gà' },
  'E02': { id: 1, name: 'Nhóm không quấn gà' },
  'E03': { id: 1, name: 'Nhóm không quấn gà' },
  'D02': { id: 1, name: 'Nhóm không quấn gà' },
  'D03': { id: 1, name: 'Nhóm không quấn gà' },
  'C24': { id: 2, name: 'Nhóm quấn gà' },
  'C11': { id: 2, name: 'Nhóm quấn gà' },
  'C17': { id: 2, name: 'Nhóm quấn gà' },
  'D01': { id: 2, name: 'Nhóm quấn gà' },
  'DB01': { id: 2, name: 'Nhóm quấn gà' },
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
  'C10': { id: 4, name: 'Nhóm keo nhai' },
  'C10-1': { id: 4, name: 'Nhóm keo nhai' },
  'DB02': { id: 4, name: 'Nhóm keo nhai' },
  'DB05': { id: 4, name: 'Nhóm keo nhai' },
  'DB04': { id: 4, name: 'Nhóm keo nhai' },
  'DB03': { id: 5, name: 'Nhóm thịt sấy' },
  'DB06': { id: 5, name: 'Nhóm thịt sấy' },
  'C28': { id: 6, name: 'Nhóm que gặm tổng hợp' },
  'TL01': { id: 7, name: 'Tã cho thú cưng' },
  'TL02': { id: 7, name: 'Tã cho thú cưng' },
  'TL04': { id: 7, name: 'Tã cho thú cưng' },
  'TL03': { id: 7, name: 'Tã cho thú cưng' },
  'TLT01': { id: 7, name: 'Tã cho thú cưng' },
  'TLT02': { id: 7, name: 'Tã cho thú cưng' },
  'TLT04': { id: 7, name: 'Tã cho thú cưng' },
  'TLT03': { id: 7, name: 'Tã cho thú cưng' },
};

function extractProductGroups(rawGroups: any): { id: number; name: string; slug?: string }[] {
  if (!Array.isArray(rawGroups)) return [];
  const result: { id: number; name: string; slug?: string }[] = [];
  for (const pg of rawGroups) {
    if (pg.product_groups_id && typeof pg.product_groups_id === 'object') {
      result.push({
        id: Number(pg.product_groups_id.id),
        name: String(pg.product_groups_id.name || `Nhóm ${pg.product_groups_id.id}`),
        slug: pg.product_groups_id.slug,
      });
    } else if (pg.product_groups_id != null) {
      const numId = Number(pg.product_groups_id);
      result.push({
        id: numId,
        name: DEFAULT_GROUP_NAMES[numId] || `Nhóm ${numId}`,
      });
    } else if (pg.id != null && pg.name != null) {
      result.push({
        id: Number(pg.id),
        name: String(pg.name),
        slug: pg.slug,
      });
    }
  }
  return result;
}

class DirectusService {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private productsCache: DirectusProductItem[] | null = null;
  private productsCacheTime = 0;
  private readonly CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  constructor() {
    // Automatically pre-load persistent disk cache on service initialization
    this.loadDiskCache();
  }

  /**
   * Potential paths for persistent products disk cache
   */
  private getCacheFilePaths(): string[] {
    return [
      path.join(config.uploadDir, 'products_cache.json'),
      path.join(process.cwd(), 'data', 'products_cache.json'),
      path.join(process.cwd(), 'backend', 'data', 'products_cache.json'),
      path.join(process.cwd(), 'dist', 'data', 'products_cache.json'),
      path.join(process.cwd(), 'directus_products_sample.json'),
    ];
  }

  /**
   * Load products from disk cache file
   */
  loadDiskCache(): DirectusProductItem[] {
    const candidatePaths = this.getCacheFilePaths();
    for (const filePath of candidatePaths) {
      try {
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(raw);
          const list: any[] = Array.isArray(parsed) ? parsed : (parsed.products || parsed.data || []);
          if (list.length > 0) {
            const formatted: DirectusProductItem[] = list.map((item) => {
              const odooId = item.odoo_id ? parseInt(String(item.odoo_id), 10) : item.id;
              const sku = item.sku || item.default_code || '';
              const name = item.name || item.title || '';
              const wholesalePrice = Number(item.wholesale_price || item.list_price || 0);
              const retailPrice = Number(item.retail_price || item.price || 0);
              const listPrice = wholesalePrice > 0 ? wholesalePrice : retailPrice;

              const skuMatch = SKU_GROUP_MAP[sku] || null;
              let parsedGroups = extractProductGroups(item.product_groups);
              if (parsedGroups.length === 0 && skuMatch) {
                parsedGroups = [{ id: skuMatch.id, name: skuMatch.name }];
              }
              const primaryGroup = parsedGroups[0] || null;
              const groupName = item.product_group_name || primaryGroup?.name || skuMatch?.name || null;
              const groupId = item.product_group_id || primaryGroup?.id || skuMatch?.id || null;

              return {
                id: odooId,
                directus_id: item.directus_id || item.id,
                odoo_id: odooId,
                default_code: sku,
                sku: sku,
                name: name,
                display_name: item.display_name || (sku ? `[${sku}] ${name}` : name),
                list_price: listPrice,
                retail_price: retailPrice,
                wholesale_price: wholesalePrice,
                uom_id: item.uom_id ?? null,
                uom_name: item.uom_name || item.specification || 'Gói',
                weight: item.weight || undefined,
                specification: item.specification || undefined,
                image_url: item.image_url || undefined,
                description: item.description || undefined,
                ingredients: item.ingredients || undefined,
                nutritional_info: item.nutritional_info || undefined,
                target: item.target || undefined,
                preservation: item.preservation || undefined,
                product_group_id: groupId,
                product_group_name: groupName,
                product_groups: parsedGroups.length > 0 ? parsedGroups : (item.product_groups || []),
              };
            });

            this.productsCache = formatted;
            this.productsCacheTime = Date.now();
            logger.info(`[DirectusService] Loaded ${formatted.length} products from disk cache: ${filePath}`);
            return formatted;
          }
        }
      } catch (err: any) {
        logger.warn(`[DirectusService] Failed reading disk cache at ${filePath}:`, err.message);
      }
    }
    return [];
  }

  /**
   * Save products to disk cache for persistent storage
   */
  async saveDiskCache(products: DirectusProductItem[]): Promise<void> {
    if (!products || products.length === 0) return;

    const payload = JSON.stringify({
      updated_at: new Date().toISOString(),
      total: products.length,
      products,
    }, null, 2);

    const targetDirs = [
      config.uploadDir,
      path.join(process.cwd(), 'data'),
      path.join(process.cwd(), 'backend', 'data'),
    ];

    for (const dir of targetDirs) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const targetPath = path.join(dir, 'products_cache.json');
        await fs.promises.writeFile(targetPath, payload, 'utf-8');
        logger.info(`[DirectusService] Saved products disk cache to: ${targetPath}`);
      } catch (err: any) {
        // Silently skip if dir is not writable in certain container contexts
      }
    }
  }

  /**
   * Authenticate and get/refresh access token
   */
  async getAuthToken(): Promise<string | null> {
    if (config.directus.token) {
      return config.directus.token;
    }

    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    if (!config.directus.url || !config.directus.email || !config.directus.password) {
      return null;
    }

    try {
      const res = await fetch(`${config.directus.url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
        body: JSON.stringify({
          email: config.directus.email,
          password: config.directus.password,
        }),
      });

      if (!res.ok) {
        logger.warn(`[DirectusService] Login failed with status: ${res.status}`);
        return null;
      }

      const data = (await res.json()) as any;
      if (data?.data?.access_token) {
        this.accessToken = data.data.access_token;
        const expiresIn = data.data.expires || 900000;
        this.tokenExpiresAt = Date.now() + expiresIn;
        logger.info('[DirectusService] Authenticated successfully with Directus');
        return this.accessToken;
      }
    } catch (err: any) {
      logger.error('[DirectusService] Login error:', err.message);
    }
    return null;
  }

  /**
   * Format asset image URL from Directus file ID
   */
  getAssetUrl(fileId?: string): string | undefined {
    if (!fileId || !config.directus.url) return undefined;
    if (fileId.startsWith('http://') || fileId.startsWith('https://')) {
      return fileId;
    }
    return `${config.directus.url}/assets/${fileId}`;
  }

  /**
   * Get all products from Directus, fallback to disk cache if Directus is unreachable
   */
  async getProducts(force = false): Promise<DirectusProductItem[]> {
    const now = Date.now();
    if (this.productsCache && !force && now - this.productsCacheTime < this.CACHE_TTL) {
      return this.productsCache;
    }

    // Try fetching fresh data from Directus
    if (config.directus.url) {
      try {
        const token = await this.getAuthToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const collection = config.directus.productCollection || 'products';
        const url = `${config.directus.url}/items/${collection}?limit=-1&fields=*,images.*,product_groups.*,product_groups.product_groups_id.*`;
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(3000) });

        if (res.ok) {
          const data = (await res.json()) as any;
          const rawItems: any[] = data?.data || [];

          if (rawItems.length > 0) {
            this.productsCache = rawItems.map((item) => {
              let imageFileId: string | undefined = undefined;
              if (Array.isArray(item.images) && item.images.length > 0) {
                imageFileId = item.images[0].directus_files_id || item.images[0].id;
              } else if (typeof item.image === 'string') {
                imageFileId = item.image;
              } else if (typeof item.thumbnail === 'string') {
                imageFileId = item.thumbnail;
              }

              const odooId = item.odoo_id ? parseInt(String(item.odoo_id), 10) : item.id;
              const sku = item.sku || item.default_code || '';
              const name = item.name || item.title || '';
              const wholesalePrice = Number(item.wholesale_price || 0);
              const retailPrice = Number(item.price || 0);
              const listPrice = wholesalePrice > 0 ? wholesalePrice : retailPrice;
              const uomName = item.specification || item.weight || 'Gói';

              const skuMatch = SKU_GROUP_MAP[sku] || null;
              let parsedGroups = extractProductGroups(item.product_groups);
              if (parsedGroups.length === 0 && skuMatch) {
                parsedGroups = [{ id: skuMatch.id, name: skuMatch.name }];
              }
              const primaryGroup = parsedGroups[0] || null;
              const groupName = item.product_group_name || primaryGroup?.name || skuMatch?.name || null;
              const groupId = item.product_group_id || primaryGroup?.id || skuMatch?.id || null;

              return {
                id: odooId,
                directus_id: item.id,
                odoo_id: odooId,
                default_code: sku,
                sku: sku,
                name: name,
                display_name: sku ? `[${sku}] ${name}` : name,
                list_price: listPrice,
                retail_price: retailPrice,
                wholesale_price: wholesalePrice,
                uom_id: null,
                uom_name: uomName,
                weight: item.weight || undefined,
                specification: item.specification || undefined,
                image_url: this.getAssetUrl(imageFileId),
                description: item.description || undefined,
                ingredients: item.ingredients || undefined,
                nutritional_info: item.nutritional_info || undefined,
                target: item.target || undefined,
                preservation: item.preservation || undefined,
                product_group_id: groupId,
                product_group_name: groupName,
                product_groups: parsedGroups.length > 0 ? parsedGroups : (item.product_groups || []),
              };
            });

            this.productsCacheTime = now;
            logger.info(`[DirectusService] Loaded ${this.productsCache.length} products from Directus`);
            
            // Persist to disk asynchronously
            this.saveDiskCache(this.productsCache).catch(() => {});
            return this.productsCache;
          }
        }
      } catch (err: any) {
        logger.warn('[DirectusService] Directus fetch exception, falling back to disk cache:', err.message);
      }
    }

    // Directus unreachable or returned nothing -> return disk cache
    if (!this.productsCache || this.productsCache.length === 0) {
      this.loadDiskCache();
    }

    return this.productsCache || [];
  }
}

export const directusService = new DirectusService();
