import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveConfigPath(filename: string): string {
  const candidate1 = path.resolve(__dirname, filename);
  if (fs.existsSync(candidate1)) return candidate1;

  const candidate2 = path.resolve(process.cwd(), `src/registry/${filename}`);
  if (fs.existsSync(candidate2)) return candidate2;

  const candidate3 = path.resolve(process.cwd(), `dist/registry/${filename}`);
  return candidate3;
}

const RULES_CONFIG_PATH = resolveConfigPath('routing-rules.json');
const SYSTEMS_CONFIG_PATH = resolveConfigPath('systems-registry.json');

export interface RoutingTarget {
  id: string;
  name: string;
  icon: string;
  target_system: 'odoo' | 'zalo' | 'ocms' | 'webhook' | string;
  queue: string;
  action: string;
  description: string;
  enabled: boolean;
  retry_attempts: number;
}

export interface EventRoute {
  name: string;
  description: string;
  targets: RoutingTarget[];
}

export interface RoutingRulesConfig {
  version: string;
  updated_at: string;
  events: Record<string, EventRoute>;
}

export interface SystemItem {
  id: string;
  name: string;
  type: string;
  url: string;
  db?: string;
  user?: string;
  apiKey?: string;
  status: 'active' | 'inactive';
  description?: string;
}

export interface SystemsRegistryConfig {
  version: string;
  updated_at: string;
  active_odoo_target: 'odoo_test' | 'odoo_prod' | string;
  systems: Record<string, SystemItem>;
}

class RoutingRegistry {
  private rulesConfig: RoutingRulesConfig;
  private systemsConfig: SystemsRegistryConfig;

  constructor() {
    this.rulesConfig = this.loadRulesConfig();
    this.systemsConfig = this.loadSystemsConfig();
  }

  // ── 1. ROUTING RULES ─────────────────────────────────────────────
  private loadRulesConfig(): RoutingRulesConfig {
    try {
      if (fs.existsSync(RULES_CONFIG_PATH)) {
        const raw = fs.readFileSync(RULES_CONFIG_PATH, 'utf-8');
        return JSON.parse(raw) as RoutingRulesConfig;
      }
    } catch (err) {
      console.error('[RoutingRegistry] Error loading routing config file, falling back to default:', err);
    }

    return {
      version: '1.0.0',
      updated_at: new Date().toISOString(),
      events: {
        'order.created': {
          name: 'Đơn hàng mới',
          description: 'Kích hoạt khi có đơn hàng mới từ Store Lapet hoặc OCMS',
          targets: [
            {
              id: 'target_odoo',
              name: 'Odoo ERP',
              icon: '🏢',
              target_system: 'odoo',
              queue: 'queue_odoo',
              action: 'create_sale_order',
              description: 'Tạo báo giá (Quotation) hoặc đơn bán (Sale Order) trong Odoo',
              enabled: true,
              retry_attempts: 3,
            },
            {
              id: 'target_ocms',
              name: 'OCMS Core & Zalo',
              icon: '💬',
              target_system: 'ocms',
              queue: 'queue_ocms',
              action: 'process_order_and_notify',
              description: 'Lưu đơn vào Database CRM & Gửi tin nhắn Zalo xác nhận cho khách hàng',
              enabled: true,
              retry_attempts: 3,
            },
          ],
        },
      },
    };
  }

  public getRules(): RoutingRulesConfig {
    return this.rulesConfig;
  }

  public getActiveTargets(eventId: string): RoutingTarget[] {
    const event = this.rulesConfig.events[eventId];
    if (!event || !Array.isArray(event.targets)) {
      return [];
    }
    return event.targets.filter((t) => t.enabled === true);
  }

  public isTargetEnabled(eventId: string, targetId: string): boolean {
    const event = this.rulesConfig.events[eventId];
    if (!event || !Array.isArray(event.targets)) return false;
    const target = event.targets.find((t) => t.id === targetId);
    return target ? target.enabled === true : false;
  }

  public updateTargetStatus(eventId: string, targetId: string, enabled: boolean): boolean {
    const event = this.rulesConfig.events[eventId];
    if (!event) return false;

    const target = event.targets.find((t) => t.id === targetId);
    if (!target) return false;

    target.enabled = enabled;
    this.rulesConfig.updated_at = new Date().toISOString();
    this.saveRulesConfig();
    return true;
  }

  public updateFullConfig(newConfig: RoutingRulesConfig): void {
    this.rulesConfig = newConfig;
    this.rulesConfig.updated_at = new Date().toISOString();
    this.saveRulesConfig();
  }

  private saveRulesConfig(): void {
    try {
      fs.writeFileSync(RULES_CONFIG_PATH, JSON.stringify(this.rulesConfig, null, 2), 'utf-8');
    } catch (err) {
      console.error('[RoutingRegistry] Error saving routing-rules.json:', err);
    }
  }

  // ── 2. ECOSYSTEM SYSTEMS REGISTRY (DANH BẠ HỆ SINH THÁI & ĐÍCH ĐẾN) ────
  private loadSystemsConfig(): SystemsRegistryConfig {
    try {
      if (fs.existsSync(SYSTEMS_CONFIG_PATH)) {
        const raw = fs.readFileSync(SYSTEMS_CONFIG_PATH, 'utf-8');
        return JSON.parse(raw) as SystemsRegistryConfig;
      }
    } catch (err) {
      console.error('[RoutingRegistry] Error loading systems-registry.json, falling back to default:', err);
    }

    return {
      version: '1.0.0',
      updated_at: new Date().toISOString(),
      active_odoo_target: 'odoo_test',
      systems: {
        ocms: {
          id: 'ocms',
          name: 'OCMS Core & CRM Zalo',
          type: 'crm_backend',
          url: 'http://app:3000',
          status: 'active',
          description: 'Trung tâm vận hành, kho lưu CRM và cổng phát tin nhắn Zalo OA',
        },
        store_lapet: {
          id: 'store_lapet',
          name: 'Web Store LaPet',
          type: 'ecommerce',
          url: 'http://localhost:4321',
          status: 'active',
          description: 'Website bán lẻ và đại lý thú cưng LaPet',
        },
        odoo_test: {
          id: 'odoo_test',
          name: 'Odoo ERP (Môi trường Test)',
          type: 'erp_test',
          url: process.env.ODOO_TEST_URL || 'https://test-odoo.fonti.vn',
          db: process.env.ODOO_TEST_DB || 'odoo_it_test_20260905',
          user: process.env.ODOO_TEST_USER || 'sale.order01@gmai.com',
          apiKey: process.env.ODOO_TEST_API_KEY || 'b09c7fa1deb1103abb6820be7d1d99c16129a243',
          status: 'active',
          description: 'Máy chủ Odoo thử nghiệm, chạy đơn an toàn không ảnh hưởng số liệu thực tế',
        },
        odoo_prod: {
          id: 'odoo_prod',
          name: 'Odoo ERP (Môi trường Chính thức)',
          type: 'erp_prod',
          url: process.env.ODOO_PROD_URL || 'https://odooo.fonti.vn',
          db: process.env.ODOO_PROD_DB || 'odoo',
          user: process.env.ODOO_PROD_USER || 'sale.order01@gmai.com',
          apiKey: process.env.ODOO_PROD_API_KEY || '8da04c7fddd03867a41f8acfca0bbb6ddc2d8caf',
          status: 'active',
          description: 'Máy chủ Odoo ERP sản xuất chính thức của công ty',
        },
      },
    };
  }

  public getSystems(): SystemsRegistryConfig {
    return this.systemsConfig;
  }

  public getActiveOdooConfig(): SystemItem {
    const activeTargetKey = this.systemsConfig.active_odoo_target || 'odoo_test';
    const system = this.systemsConfig.systems[activeTargetKey];
    if (system && system.status === 'active') {
      return system;
    }
    // Fallback to test or prod
    return this.systemsConfig.systems['odoo_test'] || this.systemsConfig.systems['odoo_prod'];
  }

  public switchOdooEnvironment(targetKey: 'odoo_test' | 'odoo_prod' | string): { success: boolean; active_target: string; system?: SystemItem } {
    if (!this.systemsConfig.systems[targetKey]) {
      return { success: false, active_target: this.systemsConfig.active_odoo_target };
    }

    this.systemsConfig.active_odoo_target = targetKey as any;
    this.systemsConfig.updated_at = new Date().toISOString();
    this.saveSystemsConfig();

    return {
      success: true,
      active_target: targetKey,
      system: this.systemsConfig.systems[targetKey],
    };
  }

  public upsertSystem(system: SystemItem): boolean {
    if (!system.id || !system.name || !system.url) return false;
    this.systemsConfig.systems[system.id] = {
      ...this.systemsConfig.systems[system.id],
      ...system,
    };
    this.systemsConfig.updated_at = new Date().toISOString();
    this.saveSystemsConfig();
    return true;
  }

  public deleteSystem(systemId: string): boolean {
    if (systemId === 'odoo_test' || systemId === 'odoo_prod' || systemId === 'ocms') {
      return false; // Prevent deleting core system keys
    }
    if (!this.systemsConfig.systems[systemId]) return false;
    delete this.systemsConfig.systems[systemId];
    this.systemsConfig.updated_at = new Date().toISOString();
    this.saveSystemsConfig();
    return true;
  }

  private saveSystemsConfig(): void {
    try {
      fs.writeFileSync(SYSTEMS_CONFIG_PATH, JSON.stringify(this.systemsConfig, null, 2), 'utf-8');
    } catch (err) {
      console.error('[RoutingRegistry] Error saving systems-registry.json:', err);
    }
  }
}

export const routingRegistry = new RoutingRegistry();
