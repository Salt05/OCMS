/**
 * chat-routes.ts — REST API for conversations and messages.
 * All routes require JWT auth and are scoped to the user's org.
 */
import {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from 'fastify';

import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { logger } from '../../shared/utils/logger.js';

type QueryParams = Record<string, string>;

export async function chatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // ── List conversations ───────────────────────────────────────────────────
  app.get(
    '/api/v1/conversations',
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const user = request.user!;

      const {
        page = '1',
        limit = '50',
        search = '',
        accountId = '',
      } = request.query as QueryParams;

      const where: any = {
        orgId: user.orgId,
      };

      if (accountId) {
        where.zaloAccountId = accountId;
      }

      if (search) {
        where.contact = {
          OR: [
            {
              fullName: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              phone: {
                contains: search,
              },
            },
          ],
        };
      }

      // Members can only see conversations
      // from Zalo accounts they have access to
      if (user.role === 'member') {
        const accessibleAccounts =
          await prisma.zaloAccountAccess.findMany({
            where: {
              userId: user.id,
            },
            select: {
              zaloAccountId: true,
            },
          });

        where.zaloAccountId = {
          in: accessibleAccounts.map(
            (a) => a.zaloAccountId,
          ),
        };
      }

      const [conversations, total] =
        await Promise.all([
          prisma.conversation.findMany({
            where,

            include: {
              contact: {
                select: {
                  id: true,
                  fullName: true,
                  phone: true,
                  avatarUrl: true,
                  zaloUid: true,
                },
              },

              zaloAccount: {
                select: {
                  id: true,
                  displayName: true,
                  zaloUid: true,
                },
              },

              messages: {
                take: 1,
                orderBy: {
                  sentAt: 'desc',
                },
                select: {
                  content: true,
                  contentType: true,
                  senderType: true,
                  sentAt: true,
                  isDeleted: true,
                },
              },
            },

            orderBy: {
              lastMessageAt: 'desc',
            },

            skip:
              (parseInt(page) - 1) *
              parseInt(limit),

            take: parseInt(limit),
          }),

          prisma.conversation.count({
            where,
          }),
        ]);

      return {
        conversations,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
      };
    },
  );

  // ── Get single conversation ─────────────────────────────────────────────
  app.get(
    '/api/v1/conversations/:id',
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const user = request.user!;
      const { id } = request.params as {
        id: string;
      };

      const conversation =
        await prisma.conversation.findFirst({
          where: {
            id,
            orgId: user.orgId,
          },

          include: {
            contact: true,

            zaloAccount: {
              select: {
                id: true,
                displayName: true,
                zaloUid: true,
                status: true,
              },
            },
          },
        });

      if (!conversation) {
        return reply
          .status(404)
          .send({
            error: 'Not found',
          });
      }

      return conversation;
    },
  );

  // ── List messages ───────────────────────────────────────────────────────
  app.get(
    '/api/v1/conversations/:id/messages',
    {
      preHandler: requireZaloAccess('read'),
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const user = request.user!;

      const { id } = request.params as {
        id: string;
      };

      const {
        page = '1',
        limit = '50',
      } = request.query as QueryParams;

      const conversation =
        await prisma.conversation.findFirst({
          where: {
            id,
            orgId: user.orgId,
          },

          select: {
            id: true,
          },
        });

      if (!conversation) {
        return reply
          .status(404)
          .send({
            error: 'Conversation not found',
          });
      }

      const [messages, total] =
        await Promise.all([
          prisma.message.findMany({
            where: {
              conversationId: id,
            },

            orderBy: {
              sentAt: 'desc',
            },

            skip:
              (parseInt(page) - 1) *
              parseInt(limit),

            take: parseInt(limit),
          }),

          prisma.message.count({
            where: {
              conversationId: id,
            },
          }),
        ]);

      return {
        messages: messages.reverse(),
        total,
        page: parseInt(page),
        limit: parseInt(limit),
      };
    },
  );

  // ── Send message ─────────────────────────────────────────────────────────
  app.post(
    '/api/v1/conversations/:id/messages',
    {
      preHandler: requireZaloAccess('chat'),
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const user = request.user!;

      const { id } = request.params as {
        id: string;
      };

      const { content } =
        request.body as {
          content: string;
        };

      if (!content?.trim()) {
        return reply
          .status(400)
          .send({
            error: 'Content required',
          });
      }

      const conversation =
        await prisma.conversation.findFirst({
          where: {
            id,
            orgId: user.orgId,
          },

          include: {
            zaloAccount: true,
          },
        });

      if (!conversation) {
        return reply
          .status(404)
          .send({
            error: 'Conversation not found',
          });
      }

      const instance =
        zaloPool.getInstance(
          conversation.zaloAccountId,
        );

      if (!instance?.api) {
        return reply
          .status(400)
          .send({
            error:
              'Zalo account not connected',
          });
      }

      // Rate limit
      const limits =
        zaloRateLimiter.checkLimits(
          conversation.zaloAccountId,
        );

      if (!limits.allowed) {
        return reply
          .status(429)
          .send({
            error: limits.reason,
          });
      }

      try {
        const threadId =
          conversation.externalThreadId || '';

        // zca-js:
        // 0 = User
        // 1 = Group
        const threadType =
          conversation.threadType === 'group'
            ? 1
            : 0;

        zaloRateLimiter.recordSend(
          conversation.zaloAccountId,
        );

        /**
         * IMPORTANT:
         *
         * Do NOT create prisma.message here.
         *
         * Because selfListen=true, zca-js will emit
         * this message back through listener.on('message').
         *
         * The listener is now the single source of truth
         * for inserting + emitting messages.
         */
        await instance.api.sendMessage(
          {
            msg: content.trim(),
          },
          threadId,
          threadType,
        );

        /**
         * The actual message will be returned to the
         * frontend through Socket.IO by zalo-listener-factory.
         */
        return {
          success: true,
        };
      } catch (err) {
        logger.error(
          '[chat] Send message error:',
          err,
        );

        return reply
          .status(500)
          .send({
            error: 'Failed to send message',
          });
      }
    },
  );

  // ── Mark conversation as read ────────────────────────────────────────────
  app.post(
    '/api/v1/conversations/:id/mark-read',
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const user = request.user!;

      const { id } = request.params as {
        id: string;
      };

      await prisma.conversation.updateMany({
        where: {
          id,
          orgId: user.orgId,
        },

        data: {
          unreadCount: 0,
        },
      });

      return {
        success: true,
      };
    },
  );
}