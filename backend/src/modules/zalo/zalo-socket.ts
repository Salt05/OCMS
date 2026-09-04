/**
 * Zalo Socket.IO event handlers.
 * Manages room subscriptions for org-level, role-level, and per-user/conversation events.
 */
import type { Server, Socket } from 'socket.io';
import { logger } from '../../shared/utils/logger.js';

export function registerZaloSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    // Authenticate / identify user connection
    socket.on('user:join', (data: { userId?: string; orgId?: string; role?: string }) => {
      if (data?.userId) {
        socket.join(`user:${data.userId}`);
        logger.debug(`Socket ${socket.id} joined user:${data.userId}`);
      }
      if (data?.orgId) {
        socket.join(`org:${data.orgId}`);
        if (data?.role && ['owner', 'admin'].includes(data.role)) {
          socket.join(`admin:${data.orgId}`);
          logger.debug(`Socket ${socket.id} joined admin:${data.orgId}`);
        }
      }
    });

    socket.on('conversation:join', (data: { conversationId: string }) => {
      if (data?.conversationId) {
        socket.join(`conversation:${data.conversationId}`);
        logger.debug(`Socket ${socket.id} joined conversation:${data.conversationId}`);
      }
    });

    socket.on('conversation:leave', (data: { conversationId: string }) => {
      if (data?.conversationId) {
        socket.leave(`conversation:${data.conversationId}`);
        logger.debug(`Socket ${socket.id} left conversation:${data.conversationId}`);
      }
    });

    // Client sends orgId after connecting to join org-level room
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

/**
 * Helper to safely emit chat:message to:
 * 1. Admin room (admin:{orgId}) — admins and owners see all
 * 2. Assigned user room (user:{assignedUserId}) — only the assigned staff member
 * 3. Active conversation room (conversation:{conversationId})
 * NEVER broadcast globally to the entire server!
 */
export function emitScopedChatMessage(
  io: Server | null | undefined,
  data: {
    accountId: string;
    orgId: string;
    message: any;
    conversationId: string;
    contactId?: string | null;
    assignedUserId?: string | null;
  }
): void {
  if (!io) return;

  const payload = {
    accountId: data.accountId,
    message: data.message,
    conversationId: data.conversationId,
    contactId: data.contactId,
    assignedUserId: data.assignedUserId,
  };

  // 1. Emit to Admins of this Organization
  io.to(`admin:${data.orgId}`).emit('chat:message', payload);

  // 2. Emit to the assigned staff member (if assigned)
  if (data.assignedUserId) {
    io.to(`user:${data.assignedUserId}`).emit('chat:message', payload);
  }

  // 3. Emit to clients currently viewing this conversation room
  io.to(`conversation:${data.conversationId}`).emit('chat:message', payload);
}
