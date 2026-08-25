/**
 * ZaloAccountPool — singleton that manages live Zalo SDK instances.
 * Handles QR login, session reconnect, message listener lifecycle,
 * and credential persistence to the database.
 *
 * Note: zca-js is imported via createRequire because its TypeScript
 * declarations don't expose named exports in ESM mode.
 */
import { createRequire } from 'module';
import type { Server } from 'socket.io';
import fs from 'node:fs';
import { imageSize } from 'image-size';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { attachZaloListener, type UserInfoCacheEntry } from './zalo-listener-factory.js';
import { emitWebhook } from '../api/webhook-service.js';

// zca-js has no reliable ESM type exports — load via CJS interop
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Zalo } = require('zca-js') as { Zalo: new (opts: { logging: boolean; selfListen?: boolean; imageMetadataGetter?: any }) => any };

async function imageMetadataGetter(filePath: string) {
  try {
    const stats = await fs.promises.stat(filePath);
    const buffer = await fs.promises.readFile(filePath);
    const dimensions = imageSize(buffer);
    return {
      width: dimensions?.width || 0,
      height: dimensions?.height || 0,
      size: stats.size || buffer.length,
    };
  } catch (err) {
    try {
      const stats = await fs.promises.stat(filePath);
      return {
        width: 0,
        height: 0,
        size: stats.size,
      };
    } catch {
      return null;
    }
  }
}

interface ZaloCredentials {
  cookie: any;
  imei: string;
  userAgent: string;
}

interface ZaloInstance {
  zalo: any;
  api: any;
  status: 'connected' | 'disconnected' | 'qr_pending' | 'connecting';
  displayName?: string;
  zaloUid?: string;
  lastActivity: Date;
}

class ZaloAccountPool {
  private instances = new Map<string, ZaloInstance>();
  private io: Server | null = null;
  // Shared user-info cache passed into each listener context
  private userInfoCache = new Map<string, UserInfoCacheEntry>();
  // Circuit breaker: track disconnect timestamps per account
  private disconnectHistory = new Map<string, number[]>();
  // Guard against concurrent reconnection attempts
  private reconnectingAccounts = new Set<string>();
  // Pending reconnect timers
  private reconnectTimers = new Map<string, NodeJS.Timeout>();

  setIO(io: Server): void {
    this.io = io;
  }

  isReconnecting(accountId: string): boolean {
    return this.reconnectingAccounts.has(accountId) || this.instances.get(accountId)?.status === 'connecting';
  }

  // Initiate QR-based login; emits QR events to frontend via Socket.IO
  async loginQR(accountId: string): Promise<void> {
    this.disconnect(accountId);
    const zalo = new Zalo({ logging: false, selfListen: true, imageMetadataGetter });
    this.instances.set(accountId, { zalo, api: null, status: 'qr_pending', lastActivity: new Date() });

    try {
      const api = await zalo.loginQR({}, (event: any) => {
        switch (event.type) {
          case 0: // QRCodeGenerated
            this.io?.to(`account:${accountId}`).emit('zalo:qr', { accountId, qrImage: event.data.image });
            break;
          case 1: // QRCodeExpired
            this.io?.to(`account:${accountId}`).emit('zalo:qr-expired', { accountId });
            event.actions?.retry();
            break;
          case 2: // QRCodeScanned
            this.io?.to(`account:${accountId}`).emit('zalo:scanned', {
              accountId,
              displayName: event.data.display_name,
              avatar: event.data.avatar,
            });
            break;
          case 4: // GotLoginInfo
            this.saveCredentials(accountId, {
              cookie: event.data.cookie,
              imei: event.data.imei,
              userAgent: event.data.userAgent,
            });
            break;
        }
      });

      const instance = this.instances.get(accountId)!;
      instance.api = api;
      instance.status = 'connected';
      instance.lastActivity = new Date();

      const ownId = await api.getOwnId();
      instance.zaloUid = ownId;

      // Fetch own profile info for avatar
      try {
        const userInfo = await api.getUserInfo(ownId);
        const profiles = userInfo?.changed_profiles || {};
        const profile = profiles[ownId] || profiles[`${ownId}_0`];
        if (profile?.avatar) {
          await prisma.zaloAccount.update({
            where: { id: accountId },
            data: { avatarUrl: profile.avatar, displayName: profile.zaloName || profile.zalo_name || profile.displayName || instance.displayName },
          });
        }
      } catch {}

      this.disconnectHistory.delete(`dc_${accountId}`);
      this.attachListener(accountId, api);
      this.io?.emit('zalo:connected', { accountId, zaloUid: ownId });
      await this.updateAccountDB(accountId, 'connected', ownId);

      // Emit webhook (orgId lookup is async, fire-and-forget)
      prisma.zaloAccount.findUnique({ where: { id: accountId }, select: { orgId: true } })
        .then((rec) => rec && emitWebhook(rec.orgId, 'zalo.connected', { accountId }))
        .catch(() => {});
    } catch (err) {
      const instance = this.instances.get(accountId);
      if (instance) instance.status = 'disconnected';
      this.io?.emit('zalo:error', { accountId, error: String(err) });
      throw err;
    }
  }

  // Helper to determine if an error is transient/network-related
  private isNetworkError(err: any): boolean {
    const msg = String(err?.message || err || '').toLowerCase();
    return (
      msg.includes('fetch failed') ||
      msg.includes('enotfound') ||
      msg.includes('etimedout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('timeout') ||
      msg.includes('network') ||
      msg.includes('socket hang up')
    );
  }

  // Reconnect using previously saved session credentials
  async reconnect(accountId: string, credentials: ZaloCredentials, attempt = 1): Promise<boolean> {
    if (this.reconnectingAccounts.has(accountId)) {
      logger.warn(`[ZALO RECONNECT] [Account ${accountId}] Đang trong quá trình kết nối lại, bỏ qua request trùng lặp.`);
      return false;
    }

    this.reconnectingAccounts.add(accountId);

    // Cancel any pending reconnect timer
    const prevTimer = this.reconnectTimers.get(accountId);
    if (prevTimer) {
      clearTimeout(prevTimer);
      this.reconnectTimers.delete(accountId);
    }

    // Cleanly stop previous instance/listener before reconnecting
    this.disconnect(accountId);

    const zalo = new Zalo({ logging: false, selfListen: true, imageMetadataGetter });
    this.instances.set(accountId, { zalo, api: null, status: 'connecting', lastActivity: new Date() });

    logger.info(`[ZALO RECONNECT] 🔄 [Account ${accountId}] Đang thực hiện kết nối lại (Lần thử ${attempt})...`);
    this.io?.emit('zalo:reconnecting', {
      accountId,
      attempt,
      message: `Đang kết nối lại Zalo (lần thử ${attempt})...`,
    });

    try {
      const api = await zalo.login({
        cookie: credentials.cookie,
        imei: credentials.imei,
        userAgent: credentials.userAgent,
      });

      const instance = this.instances.get(accountId)!;
      instance.api = api;
      instance.status = 'connected';
      instance.lastActivity = new Date();

      const ownId = await api.getOwnId();
      instance.zaloUid = ownId;

      // Fetch own profile info for avatar
      try {
        const userInfo = await api.getUserInfo(ownId);
        const profiles = userInfo?.changed_profiles || {};
        const profile = profiles[ownId] || profiles[`${ownId}_0`];
        if (profile?.avatar) {
          await prisma.zaloAccount.update({
            where: { id: accountId },
            data: { avatarUrl: profile.avatar, displayName: profile.zaloName || profile.zalo_name || profile.displayName || instance.displayName },
          });
        }
      } catch {}

      // Reset circuit breaker history on success
      this.disconnectHistory.delete(`dc_${accountId}`);

      this.attachListener(accountId, api);
      await this.updateAccountDB(accountId, 'connected', ownId);
      
      logger.info(`[ZALO RECONNECT] ✅ [Account ${accountId}] Kết nối lại THÀNH CÔNG (UID: ${ownId})`);
      this.io?.emit('zalo:connected', { accountId, zaloUid: ownId, message: 'Kết nối lại Zalo thành công' });

      prisma.zaloAccount.findUnique({ where: { id: accountId }, select: { orgId: true } })
        .then((rec) => rec && emitWebhook(rec.orgId, 'zalo.connected', { accountId }))
        .catch(() => {});

      return true;
    } catch (err: any) {
      const isNetErr = this.isNetworkError(err);
      const instance = this.instances.get(accountId);
      if (instance) instance.status = 'disconnected';

      if (isNetErr) {
        logger.warn(`[ZALO RECONNECT] ⚠️ [Account ${accountId}] Thất bại do lỗi mạng/đường truyền: ${err.message}. Giữ nguyên session.`);
        await this.updateAccountDB(accountId, 'disconnected', null);
        this.io?.emit('zalo:reconnect-failed', {
          accountId,
          error: `Mất mạng hoặc máy chủ bận: ${err.message}. Hệ thống sẽ tự động thử lại.`,
          isNetworkError: true,
        });
      } else {
        logger.error(`[ZALO RECONNECT] ❌ [Account ${accountId}] Thất bại do phiên không hợp lệ: ${err.message}. Cần quét QR lại.`);
        await this.updateAccountDB(accountId, 'qr_pending', null);
        this.io?.emit('zalo:reconnect-failed', {
          accountId,
          error: 'Phiên đăng nhập hết hạn hoặc bị hủy. Vui lòng quét mã QR lại.',
          isFatal: true,
        });
      }
      return false;
    } finally {
      this.reconnectingAccounts.delete(accountId);
    }
  }

  // Delegate listener setup to zalo-listener-factory
  private attachListener(accountId: string, api: any): void {
    attachZaloListener({
      accountId,
      api,
      io: this.io,
      userInfoCache: this.userInfoCache,
      onDisconnected: (id) => {
        const inst = this.instances.get(id);
        if (inst) inst.status = 'disconnected';
        this.updateAccountDB(id, 'disconnected', null);
        // Emit webhook for disconnect (fire-and-forget)
        prisma.zaloAccount.findUnique({ where: { id }, select: { orgId: true } })
          .then((rec) => rec && emitWebhook(rec.orgId, 'zalo.disconnected', { accountId: id }))
          .catch(() => {});

        // Circuit breaker: track disconnect count per account
        const now = Date.now();
        const key = `dc_${id}`;
        const history = (this.disconnectHistory.get(key) || []).filter((t) => now - t < 5 * 60_000);
        history.push(now);
        this.disconnectHistory.set(key, history);

        if (history.length >= 5) {
          // >5 disconnects in 5 min → stop reconnecting, require QR re-login
          logger.error(`[ZALO RECONNECT] [Account ${id}] ⚠️ Kích hoạt Circuit breaker: Bị ngắt kết nối ${history.length} lần trong 5 phút. Dừng auto-reconnect để bảo vệ tài khoản.`);
          this.updateAccountDB(id, 'disconnected', null);
          this.io?.emit('zalo:reconnect-failed', { accountId: id, error: 'Kết nối mạng không ổn định liên tục (>5 lần/5p). Bạn có thể bấm Kết nối lại trong Cài đặt.' });
          return;
        }

        const delaySec = 30;
        logger.warn(`[ZALO RECONNECT] [Account ${id}] 🔌 Mất kết nối (Lần ${history.length}/5 trong 5 phút). Sẽ tự động kết nối lại sau ${delaySec} giây...`);
        this.io?.emit('zalo:reconnecting', {
          accountId: id,
          attempt: history.length,
          delaySeconds: delaySec,
          message: `Mất kết nối Zalo. Sẽ tự động kết nối lại sau ${delaySec} giây (Lần ${history.length}/5)...`,
        });

        // Cancel existing timer before scheduling new one
        const prevTimer = this.reconnectTimers.get(id);
        if (prevTimer) clearTimeout(prevTimer);

        const timer = setTimeout(() => {
          this.reconnectTimers.delete(id);
          this.autoReconnect(id, 1);
        }, delaySec * 1000);
        this.reconnectTimers.set(id, timer);
      },
    });
  }

  // Persist session credentials to DB
  private saveCredentials(accountId: string, credentials: ZaloCredentials): void {
    prisma.zaloAccount
      .update({ where: { id: accountId }, data: { sessionData: credentials as any } })
      .catch((err) => logger.error(`[zalo:${accountId}] saveCredentials error:`, err));
  }

  // Sync account status and zaloUid to DB
  private async updateAccountDB(accountId: string, status: string, zaloUid: string | null): Promise<void> {
    try {
      await prisma.zaloAccount.update({
        where: { id: accountId },
        data: {
          status,
          ...(zaloUid !== null ? { zaloUid } : {}),
          ...(status === 'connected' ? { lastConnectedAt: new Date() } : {}),
        },
      });
    } catch (err) {
      logger.error(`[zalo:${accountId}] updateAccountDB error:`, err);
    }
  }

  // Auto-reconnect using saved session from DB
  private async autoReconnect(accountId: string, attempt = 1): Promise<void> {
    const inst = this.instances.get(accountId);
    // Skip if already reconnected or manually disconnected
    if (inst?.status === 'connected') return;

    try {
      const account = await prisma.zaloAccount.findUnique({
        where: { id: accountId },
        select: { sessionData: true, displayName: true },
      });
      const session = account?.sessionData as ZaloCredentials | null;
      if (session?.imei) {
        logger.info(`[ZALO RECONNECT] [Account ${account?.displayName || accountId}] Bắt đầu tiến trình auto-reconnect (lần ${attempt})...`);
        const ok = await this.reconnect(accountId, session, attempt);
        if (!ok && attempt < 3) {
          // If transient failure, retry again in 60s
          const retryDelay = 60;
          logger.info(`[ZALO RECONNECT] [Account ${accountId}] Lên lịch thử lại lần ${attempt + 1} sau ${retryDelay} giây...`);
          setTimeout(() => this.autoReconnect(accountId, attempt + 1), retryDelay * 1000);
        }
      } else {
        logger.warn(`[ZALO RECONNECT] [Account ${accountId}] Không tìm thấy sessionData để auto-reconnect`);
        this.io?.emit('zalo:reconnect-failed', { accountId, error: 'Chưa có thông tin phiên đăng nhập' });
      }
    } catch (err) {
      logger.error(`[ZALO RECONNECT] [Account ${accountId}] Lỗi bất ngờ trong autoReconnect:`, err);
      // Retry again in 2 minutes
      setTimeout(() => this.autoReconnect(accountId, attempt + 1), 120_000);
    }
  }

  // Stop listener and remove from pool
  disconnect(accountId: string): void {
    const instance = this.instances.get(accountId);
    if (instance?.api?.listener) {
      try { instance.api.listener.stop(); } catch (err) {
        logger.warn(`[zalo:${accountId}] Error stopping listener:`, err);
      }
    }
    this.instances.delete(accountId);
  }

  getStatus(accountId: string): string {
    return this.instances.get(accountId)?.status ?? 'disconnected';
  }

  getAllStatuses(): Record<string, string> {
    const statuses: Record<string, string> = {};
    for (const [id, inst] of this.instances) statuses[id] = inst.status;
    return statuses;
  }

  // Return raw API instance for direct SDK calls (e.g. public API send message)
  getApi(accountId: string): any | null {
    const inst = this.instances.get(accountId);
    return inst?.status === 'connected' ? inst.api : null;
  }

  getInstance(accountId: string): ZaloInstance | undefined {
    return this.instances.get(accountId);
  }

  getUserInfoCache(): Map<string, UserInfoCacheEntry> {
    return this.userInfoCache;
  }

  getIO(): Server | null {
    return this.io;
  }
}

export const zaloPool = new ZaloAccountPool();
