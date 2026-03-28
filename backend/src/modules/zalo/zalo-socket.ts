/**
 * Zalo Socket.IO event handlers.
 * Manages room subscriptions for org-level and per-account events.
 */
import type { Server, Socket } from 'socket.io';
import { logger } from '../../shared/utils/logger.js';

export function registerZaloSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    // Client should send orgId after connecting to join org-level room
    socket.on('org:join', (data: { orgId: string }) => {
      if (!data?.orgId) return;
      socket.join(`org:${data.orgId}`);
      logger.debug(`Socket ${socket.id} joined org:${data.orgId}`);
    });

    // Subscribe to QR/status updates for a specific Zalo account
    socket.on('zalo:subscribe', (data: { accountId: string }) => {
      if (!data?.accountId) return;
      socket.join(`account:${data.accountId}`);
      logger.debug(`Socket ${socket.id} joined account:${data.accountId}`);
    });

    // Unsubscribe from a specific account room
    socket.on('zalo:unsubscribe', (data: { accountId: string }) => {
      if (!data?.accountId) return;
      socket.leave(`account:${data.accountId}`);
      logger.debug(`Socket ${socket.id} left account:${data.accountId}`);
    });
  });
}
