/**
 * zalo-health-check.ts — Cron-based health monitor for Zalo account connections.
 * Runs every 5 minutes to detect disconnected accounts and auto-reconnect them.
 * Also runs a daily session refresh at 04:00 UTC to keep cookies fresh.
 */
import cron from 'node-cron';
import { Prisma } from '@prisma/client';
import { zaloPool } from './zalo-pool.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export function startZaloHealthCheck(): void {
  // Every 5 minutes: check all accounts with saved sessions
  cron.schedule('*/5 * * * *', async () => {
    try {
      const accounts = await prisma.zaloAccount.findMany({
        where: { sessionData: { not: Prisma.JsonNull } },
        select: { id: true, displayName: true, sessionData: true },
      });

      for (const acc of accounts) {
        const status = zaloPool.getStatus(acc.id);
        if (status !== 'connected' && !zaloPool.isReconnecting(acc.id) && status !== 'qr_pending') {
          const session = acc.sessionData as any;
          if (session?.imei) {
            logger.info(`[ZALO HEALTH-CHECK] 🔍 Phát hiện tài khoản ${acc.displayName || acc.id} đang ngắt kết nối. Đang tự động phục hồi...`);
            zaloPool.reconnect(acc.id, session, 1).catch((err) => {
              logger.warn(`[ZALO HEALTH-CHECK] ⚠️ Reconnect thất bại cho ${acc.displayName || acc.id}:`, err);
            });
          }
        }
      }
    } catch (err) {
      logger.error('[ZALO HEALTH-CHECK] Error during health check:', err);
    }
  });

  // Daily at 04:00 UTC (11:00 AM VN): refresh all sessions to keep cookies alive
  cron.schedule('0 4 * * *', async () => {
    logger.info('[ZALO HEALTH-CHECK] 🌅 Bắt đầu làm mới phiên hàng ngày (Daily session refresh)...');
    try {
      const accounts = await prisma.zaloAccount.findMany({
        where: { sessionData: { not: Prisma.JsonNull } },
        select: { id: true, displayName: true, sessionData: true },
      });

      for (const acc of accounts) {
        const session = acc.sessionData as any;
        if (session?.imei) {
          logger.info(`[ZALO HEALTH-CHECK] 🔄 Làm mới phiên cho ${acc.displayName || acc.id}...`);
          // Disconnect then reconnect to force cookie refresh
          zaloPool.disconnect(acc.id);
          await new Promise((r) => setTimeout(r, 5000));
          zaloPool.reconnect(acc.id, session, 1).catch((err) => {
            logger.warn(`[ZALO HEALTH-CHECK] ⚠️ Làm mới phiên thất bại cho ${acc.displayName || acc.id}:`, err);
          });
        }
        // Stagger reconnects by 10 seconds per account to avoid rate limits
        await new Promise((r) => setTimeout(r, 10000));
      }
    } catch (err) {
      logger.error('[ZALO HEALTH-CHECK] Error during daily refresh:', err);
    }
  });

  logger.info('[health-check] Zalo health check started (every 5 min + daily refresh at 04:00 UTC)');
}
