import { randomUUID } from 'node:crypto';
import { redisConnection } from '../queue/queue-manager.js';

export type LogLevel = 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
export type ServiceName = 'ROUTER' | 'ODOO' | 'OCMS' | 'REDIS';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  service: ServiceName;
  queue?: string;
  event?: string;
  order_id?: string;
  message: string;
  details?: any;
}

class RouterLogger {
  private inMemoryLogs: LogEntry[] = [];
  private readonly MAX_LOGS = 1000;
  private readonly REDIS_KEY = 'router:logs:recent';
  private seeded = false;

  constructor() {
    this.add({
      level: 'INFO',
      service: 'ROUTER',
      message: 'OCMS Universal Router Control Center đã sẵn sàng hoạt động',
      event: 'system.startup',
    });
  }

  add(entry: {
    level: LogLevel;
    service: ServiceName;
    queue?: string;
    event?: string;
    order_id?: string;
    message: string;
    details?: any;
    timestamp?: string;
  }): LogEntry {
    const logItem: LogEntry = {
      id: randomUUID(),
      timestamp: entry.timestamp || new Date().toISOString(),
      level: entry.level,
      service: entry.service,
      queue: entry.queue,
      event: entry.event,
      order_id: entry.order_id,
      message: entry.message,
      details: entry.details,
    };

    this.inMemoryLogs.unshift(logItem);
    if (this.inMemoryLogs.length > this.MAX_LOGS) {
      this.inMemoryLogs.pop();
    }

    try {
      if (redisConnection && redisConnection.status === 'ready') {
        redisConnection.lpush(this.REDIS_KEY, JSON.stringify(logItem)).catch(() => {});
        redisConnection.ltrim(this.REDIS_KEY, 0, this.MAX_LOGS - 1).catch(() => {});
      }
    } catch {
      // Ignored
    }

    return logItem;
  }

  async initFromRedis(): Promise<void> {
    if (this.seeded) return;
    try {
      if (redisConnection && redisConnection.status === 'ready') {
        const rawLogs = await redisConnection.lrange(this.REDIS_KEY, 0, 200);
        if (rawLogs && rawLogs.length > 0) {
          const parsed: LogEntry[] = [];
          for (const item of rawLogs) {
            try {
              parsed.push(JSON.parse(item));
            } catch {}
          }
          if (parsed.length > 0) {
            this.inMemoryLogs = parsed;
            this.seeded = true;
            return;
          }
        }
      }
    } catch (err: any) {
      console.warn('[RouterLogger] Chưa thể đọc logs từ Redis:', err.message);
    }
  }

  getLogs(filters: {
    level?: string;
    service?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): { total: number; logs: LogEntry[] } {
    let result = [...this.inMemoryLogs];

    if (filters.level && filters.level !== 'ALL') {
      result = result.filter(l => l.level.toUpperCase() === filters.level!.toUpperCase());
    }

    if (filters.service && filters.service !== 'ALL') {
      result = result.filter(l => l.service.toUpperCase() === filters.service!.toUpperCase());
    }

    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      result = result.filter(
        l =>
          l.message.toLowerCase().includes(q) ||
          (l.order_id && l.order_id.toLowerCase().includes(q)) ||
          (l.event && l.event.toLowerCase().includes(q)) ||
          (l.queue && l.queue.toLowerCase().includes(q))
      );
    }

    const total = result.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    const paginated = result.slice(offset, offset + limit);

    return {
      total,
      logs: paginated,
    };
  }

  getRecentActivity(limit = 20, filterService = 'ALL'): LogEntry[] {
    let result = [...this.inMemoryLogs];
    if (filterService !== 'ALL') {
      if (filterService === 'ORDERS') {
        result = result.filter(l => l.order_id || l.event?.startsWith('order.'));
      } else if (filterService === 'ERRORS') {
        result = result.filter(l => l.level === 'ERROR' || l.level === 'WARN');
      } else {
        result = result.filter(l => l.service.toUpperCase() === filterService.toUpperCase());
      }
    }
    return result.slice(0, limit);
  }

  clearLogs(): void {
    this.inMemoryLogs = [];
    try {
      if (redisConnection && redisConnection.status === 'ready') {
        redisConnection.del(this.REDIS_KEY).catch(() => {});
      }
    } catch {}
    this.seeded = false;
  }
}

export const routerLogger = new RouterLogger();
