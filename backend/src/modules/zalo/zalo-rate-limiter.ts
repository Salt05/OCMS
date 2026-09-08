/**
 * zalo-rate-limiter.ts — Per-account rate limiting and safety warnings to prevent Zalo from blocking accounts.
 * Thay vì chặn cứng, hệ thống gửi cảnh báo:
 * "Hiện tại đã {hành động : bao nhiêu} nguy cơ sẽ bị {tác hại}"
 * Khi đã đạt giới hạn (DAILY_LIMIT = 200), cứ cách 10 tin nhắn sẽ hiển thị thông báo đó 1 lần (200, 210, 220, 230...).
 */

export const DAILY_LIMIT = 200;
export const WARNING_INTERVAL = 10; // Cách 10 tin nhắn hiển thị thông báo 1 lần sau khi đạt giới hạn
export const BURST_LIMIT = 15;      // Tăng thêm 10 (từ 5 -> 15): Tối đa 15 tin trong BURST_WINDOW_MS
export const BURST_WINDOW_MS = 30_000; // 30 seconds

export interface RateLimitCheckResult {
  allowed: boolean;   // Luôn cho phép gửi tin nhắn (true)
  warning?: string;   // Thông điệp cảnh báo nếu chạm mốc
  action?: string;    // Hành động: ví dụ "gửi 200/200 tin nhắn trong ngày"
  count?: number;     // Số lượng hiện tại
  risk?: string;      // Nguy cơ / tác hại
}

class ZaloRateLimiter {
  private dailyCounts = new Map<string, { count: number; date: string }>();
  private recentSends = new Map<string, number[]>(); // timestamps per account
  private lastBurstWarnTime = new Map<string, number>();

  /**
   * Kiểm tra giới hạn và tạo cảnh báo (nếu có).
   * Không chặn gửi tin (allowed luôn là true).
   */
  checkLimits(accountId: string): RateLimitCheckResult {
    const today = new Date().toISOString().split('T')[0];
    const daily = this.dailyCounts.get(accountId);
    const currentDailyCount = daily && daily.date === today ? daily.count : 0;
    const nextDailyCount = currentDailyCount + 1;

    // 1. Kiểm tra giới hạn ngày:
    // Khi đã đạt giới hạn (>= 200) và cứ cách 10 tin nhắn (200, 210, 220, 230...) hiển thị cảnh báo 1 lần
    if (nextDailyCount >= DAILY_LIMIT && (nextDailyCount - DAILY_LIMIT) % WARNING_INTERVAL === 0) {
      const action = `gửi ${nextDailyCount}/${DAILY_LIMIT} tin nhắn trong ngày`;
      const risk = `Zalo tạm khóa tính năng nhắn tin hoặc khóa tài khoản do nghi ngờ spam`;
      return {
        allowed: true,
        action,
        count: nextDailyCount,
        risk,
        warning: `Hiện tại đã ${action}, nguy cơ sẽ bị ${risk}.`,
      };
    }

    // 2. Kiểm tra tốc độ gửi dồn dập (Burst limit: > 5 tin trong 30s)
    const now = Date.now();
    const recent = (this.recentSends.get(accountId) || []).filter(t => now - t < BURST_WINDOW_MS);
    if (recent.length >= BURST_LIMIT) {
      const lastBurst = this.lastBurstWarnTime.get(accountId) || 0;
      // Tránh hiện liên tục mỗi giây nếu gửi dồn dập, cảnh báo cách nhau tối thiểu 10s
      if (now - lastBurst >= 10_000) {
        this.lastBurstWarnTime.set(accountId, now);
        const action = `gửi dồn dập ${recent.length + 1} tin nhắn trong 30 giây`;
        const risk = `Zalo đánh dấu spam và tạm dừng gửi tin nhắn`;
        return {
          allowed: true,
          action,
          count: recent.length + 1,
          risk,
          warning: `Hiện tại đã ${action}, nguy cơ sẽ bị ${risk}.`,
        };
      }
    }

    return { allowed: true };
  }

  /** Ghi nhận gửi thành công để theo dõi số lượng */
  recordSend(accountId: string): void {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // Cập nhật mốc burst window
    const recent = (this.recentSends.get(accountId) || []).filter(t => now - t < 60_000);
    recent.push(now);
    this.recentSends.set(accountId, recent);

    // Cập nhật số đếm ngày
    const daily = this.dailyCounts.get(accountId);
    if (daily && daily.date === today) {
      daily.count++;
    } else {
      this.dailyCounts.set(accountId, { count: 1, date: today });
    }
  }

  getDailyCount(accountId: string): number {
    const today = new Date().toISOString().split('T')[0];
    const daily = this.dailyCounts.get(accountId);
    return daily && daily.date === today ? daily.count : 0;
  }
}

export const zaloRateLimiter = new ZaloRateLimiter();

