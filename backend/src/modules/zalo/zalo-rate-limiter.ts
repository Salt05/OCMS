/**
 * zalo-rate-limiter.ts — Per-account rate limiting to prevent Zalo from blocking accounts.
 * Tracks daily send counts and burst windows.
 */

const DAILY_LIMIT = 200;
const BURST_LIMIT = 5;    // max messages in BURST_WINDOW_MS
const BURST_WINDOW_MS = 30_000; // 30 seconds

class ZaloRateLimiter {
  private dailyCounts = new Map<string, { count: number; date: string }>();
  private recentSends = new Map<string, number[]>(); // timestamps per account

  /** Check if sending is allowed for accountId */
  checkLimits(accountId: string): { allowed: boolean; reason?: string } {
    const today = new Date().toISOString().split('T')[0];
    const daily = this.dailyCounts.get(accountId);
    if (daily && daily.date === today && daily.count >= DAILY_LIMIT) {
      return { allowed: false, reason: `Đã đạt giới hạn ${DAILY_LIMIT} tin/ngày` };
    }

    const now = Date.now();
    const recent = (this.recentSends.get(accountId) || []).filter(t => now - t < BURST_WINDOW_MS);
    if (recent.length >= BURST_LIMIT) {
      return { allowed: false, reason: `Gửi quá nhanh (>${BURST_LIMIT} tin/30s)` };
    }

    return { allowed: true };
  }

  /** Record a successful send for rate tracking */
  recordSend(accountId: string): void {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // Update burst window timestamps
    const recent = (this.recentSends.get(accountId) || []).filter(t => now - t < 60_000);
    recent.push(now);
    this.recentSends.set(accountId, recent);

    // Update daily count
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
