/**
 * zalo-friend-routes.ts — REST API for Zalo friend management.
 * Provides endpoints for checking friend request status, sending friend requests,
 * accepting friend requests, and undoing friend requests.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloPool } from './zalo-pool.js';
import { logger } from '../../shared/utils/logger.js';

interface FriendActionBody {
  conversationId?: string;
  accountId?: string;
  userId?: string;
  msg?: string;
}

interface FriendStatusQuery {
  conversationId?: string;
  accountId?: string;
  userId?: string;
}

/**
 * Helper to resolve target Zalo account ID and customer Zalo UID from conversationId or explicit parameters.
 */
async function resolveZaloTarget(
  orgId: string,
  params: { conversationId?: string; accountId?: string; userId?: string },
): Promise<{ accountId: string; targetUid: string; api: any } | { error: string; statusCode: number }> {
  let { conversationId, accountId, userId } = params;

  if (conversationId) {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, orgId },
      include: {
        contact: { select: { zaloUid: true } },
      },
    });

    if (!conv) {
      return { error: 'Không tìm thấy cuộc trò chuyện', statusCode: 404 };
    }

    if (conv.threadType === 'group') {
      return { error: 'Tính năng kết bạn chỉ áp dụng cho cuộc trò chuyện cá nhân', statusCode: 400 };
    }

    accountId = conv.zaloAccountId;
    userId = conv.contact?.zaloUid || conv.externalThreadId || '';
  }

  if (!accountId) {
    const connectedAcc = await prisma.zaloAccount.findFirst({
      where: { orgId, status: 'connected', deletedAt: null },
      select: { id: true },
    });
    accountId = connectedAcc?.id;
  }

  if (!accountId) {
    return { error: 'Không tìm thấy tài khoản Zalo đang kết nối', statusCode: 400 };
  }

  if (!userId) {
    return { error: 'Không tìm thấy Zalo UID của người dùng để thao tác', statusCode: 400 };
  }

  const api = zaloPool.getApi(accountId);
  if (!api) {
    return { error: 'Tài khoản Zalo đang mất kết nối. Vui lòng kiểm tra lại trạng thái tài khoản.', statusCode: 503 };
  }

  return { accountId, targetUid: userId, api };
}

export async function zaloFriendRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/zalo/friend-status ─────────────────────────────────────────
  app.get<{ Querystring: FriendStatusQuery }>(
    '/api/v1/zalo/friend-status',
    async (request: FastifyRequest<{ Querystring: FriendStatusQuery }>, reply: FastifyReply) => {
      const user = request.user!;
      const resolved = await resolveZaloTarget(user.orgId, request.query);

      if ('error' in resolved) {
        return reply.status(resolved.statusCode).send({ error: resolved.error });
      }

      const { targetUid, api } = resolved;

      try {
        if (typeof api.getFriendRequestStatus !== 'function') {
          return reply.status(501).send({ error: 'Thư viện Zalo chưa hỗ trợ API kiểm tra bạn bè' });
        }

        const rawStatus = await api.getFriendRequestStatus(targetUid);
        logger.info(`[zalo-friend] Status for user ${targetUid}: ${JSON.stringify(rawStatus)}`);

        // Zalo return structure:
        // is_friend: 1 (friend) | 0 (not friend)
        // is_requested: 1 (they sent us friend request) | 0
        // is_requesting: 1 (we sent them friend request) | 0
        // addFriendPrivacy: number
        const isFriend = Number(rawStatus?.is_friend) === 1;
        const isRequested = Number(rawStatus?.is_requested) === 1;
        const isRequesting = Number(rawStatus?.is_requesting) === 1;

        return {
          userId: targetUid,
          isFriend,
          isRequested,
          isRequesting,
          privacy: rawStatus?.addFriendPrivacy ?? 0,
        };
      } catch (err: any) {
        logger.error(`[zalo-friend] getFriendRequestStatus error for ${targetUid}:`, err);
        return reply.status(500).send({
          error: err?.message || 'Không thể kiểm tra trạng thái kết bạn Zalo',
        });
      }
    },
  );

  // ── POST /api/v1/zalo/friend-request ───────────────────────────────────────
  app.post<{ Body: FriendActionBody }>(
    '/api/v1/zalo/friend-request',
    async (request: FastifyRequest<{ Body: FriendActionBody }>, reply: FastifyReply) => {
      const user = request.user!;
      const resolved = await resolveZaloTarget(user.orgId, request.body || {});

      if ('error' in resolved) {
        return reply.status(resolved.statusCode).send({ error: resolved.error });
      }

      const { targetUid, api } = resolved;
      const msg = request.body?.msg || 'Xin chào! Mình kết bạn để trao đổi thông tin nhé.';

      try {
        if (typeof api.sendFriendRequest !== 'function') {
          return reply.status(501).send({ error: 'Thư viện Zalo chưa hỗ trợ gửi lời mời kết bạn' });
        }

        await api.sendFriendRequest(msg, targetUid);
        logger.info(`[zalo-friend] Sent friend request to ${targetUid} with msg: "${msg}"`);

        return {
          success: true,
          message: 'Đã gửi lời mời kết bạn thành công',
          userId: targetUid,
        };
      } catch (err: any) {
        logger.error(`[zalo-friend] sendFriendRequest error for ${targetUid}:`, err);
        const code = err?.code;
        const errMsg = String(err?.message || '');

        if (code === 225 || errMsg.includes('225')) {
          return { success: true, message: 'Hai bên đã là bạn bè trên Zalo', isFriend: true };
        }
        if (code === 222 || errMsg.includes('222')) {
          return { success: true, message: 'Đối phương đã gửi lời mời trước đó, yêu cầu đã được chấp nhận thành công!', isFriend: true };
        }
        if (code === 215 || errMsg.includes('215')) {
          return reply.status(400).send({ error: 'Người dùng này đã chặn nhận lời mời kết bạn từ người lạ' });
        }
        if (code === 226 || errMsg.includes('226')) {
          return reply.status(429).send({ error: 'Tài khoản Zalo đã vượt quá giới hạn gửi lời mời kết bạn trong ngày' });
        }

        return reply.status(500).send({
          error: errMsg || 'Không thể gửi lời mời kết bạn Zalo',
        });
      }
    },
  );

  // ── POST /api/v1/zalo/accept-friend ────────────────────────────────────────
  app.post<{ Body: FriendActionBody }>(
    '/api/v1/zalo/accept-friend',
    async (request: FastifyRequest<{ Body: FriendActionBody }>, reply: FastifyReply) => {
      const user = request.user!;
      const resolved = await resolveZaloTarget(user.orgId, request.body || {});

      if ('error' in resolved) {
        return reply.status(resolved.statusCode).send({ error: resolved.error });
      }

      const { targetUid, api } = resolved;

      try {
        if (typeof api.acceptFriendRequest !== 'function') {
          return reply.status(501).send({ error: 'Thư viện Zalo chưa hỗ trợ chấp nhận kết bạn' });
        }

        await api.acceptFriendRequest(targetUid);
        logger.info(`[zalo-friend] Accepted friend request from ${targetUid}`);

        return {
          success: true,
          message: 'Đã chấp nhận kết bạn thành công',
          userId: targetUid,
          isFriend: true,
        };
      } catch (err: any) {
        logger.error(`[zalo-friend] acceptFriendRequest error for ${targetUid}:`, err);
        return reply.status(500).send({
          error: err?.message || 'Không thể chấp nhận kết bạn Zalo',
        });
      }
    },
  );

  // ── POST /api/v1/zalo/undo-friend-request ──────────────────────────────────
  app.post<{ Body: FriendActionBody }>(
    '/api/v1/zalo/undo-friend-request',
    async (request: FastifyRequest<{ Body: FriendActionBody }>, reply: FastifyReply) => {
      const user = request.user!;
      const resolved = await resolveZaloTarget(user.orgId, request.body || {});

      if ('error' in resolved) {
        return reply.status(resolved.statusCode).send({ error: resolved.error });
      }

      const { targetUid, api } = resolved;

      try {
        if (typeof api.undoFriendRequest !== 'function') {
          return reply.status(501).send({ error: 'Thư viện Zalo chưa hỗ trợ thu hồi lời mời kết bạn' });
        }

        await api.undoFriendRequest(targetUid);
        logger.info(`[zalo-friend] Undid friend request to ${targetUid}`);

        return {
          success: true,
          message: 'Đã thu hồi lời mời kết bạn thành công',
          userId: targetUid,
          isRequesting: false,
        };
      } catch (err: any) {
        logger.error(`[zalo-friend] undoFriendRequest error for ${targetUid}:`, err);
        return reply.status(500).send({
          error: err?.message || 'Không thể thu hồi lời mời kết bạn Zalo',
        });
      }
    },
  );
}
