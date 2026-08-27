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
import { syncConversationMessages } from '../zalo/zalo-message-recovery.js';
import { handleMessageReaction, getMessageCliMsgId, getRTypeFromIcon } from './message-handler.js';
import { logger } from '../../shared/utils/logger.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';

export const pendingReplies = new Map<string, string>(); // conversationId -> replyToId

type QueryParams = Record<string, string>;

export async function checkConversationContactAccess(conversationId: string, user: { id: string; role: string; orgId: string }): Promise<boolean> {
  if (['owner', 'admin'].includes(user.role)) return true;
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId: user.orgId },
    select: { contact: { select: { assignedUserId: true } } },
  });
  if (!conv || !conv.contact) return false;
  return conv.contact.assignedUserId === user.id;
}

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

      // NO ONE (including admins) should see 'other' contacts in the Chat list
      where.contact = {
        ...where.contact,
        contactType: { not: 'other' }
      };

      if (user.role === 'member') {
        where.contact.assignedUserId = user.id;
      }

      const [conversations, total] =
        await Promise.all([
          prisma.conversation.findMany({
            where,

            include: {
              contact: {
                include: {
                  assignedUser: {
                    select: {
                      id: true,
                      fullName: true,
                      email: true,
                    },
                  },
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
            contact: {
              include: {
                assignedUser: {
                  select: {
                    id: true,
                    fullName: true,
                    email: true,
                  },
                },
              },
            },

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

      const hasAccess = await checkConversationContactAccess(id, user);
      if (!hasAccess) {
        return reply.status(403).send({ error: 'Forbidden' });
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
        before = '',
      } = request.query as QueryParams;

      const conversation =
        await prisma.conversation.findFirst({
          where: {
            id,
            orgId: user.orgId,
          },

          select: {
            id: true,
            zaloAccountId: true,
            externalThreadId: true,
            threadType: true,
            unreadCount: true,
          },
        });

      if (!conversation) {
        return reply
          .status(404)
          .send({
            error: 'Conversation not found',
          });
      }

      const hasAccess = await checkConversationContactAccess(id, user);
      if (!hasAccess) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      // On-demand thread sync: when viewing page 1 of a conversation, sync latest messages from Zalo
      if (page === '1' && !before && conversation.externalThreadId) {
        const api = zaloPool.getApi(conversation.zaloAccountId);
        if (api) {
          try {
            await Promise.race([
              syncConversationMessages(
                {
                  accountId: conversation.zaloAccountId,
                  api,
                  io: zaloPool.getIO(),
                  userInfoCache: zaloPool.getUserInfoCache(),
                },
                conversation.externalThreadId,
                conversation.threadType as any,
              ),
              new Promise((r) => setTimeout(r, 1500)),
            ]);
          } catch (err) {
            logger.warn(`[chat-routes] On-demand sync error for ${conversation.externalThreadId}:`, err);
          }
        }
      }

      const messageWhere: any = {
        conversationId: id,
      };

      if (before) {
        messageWhere.sentAt = {
          lt: new Date(before),
        };
      }

      const [messages, total] =
        await Promise.all([
          prisma.message.findMany({
            where: messageWhere,

            orderBy: {
              sentAt: 'desc',
            },

            include: {
              replyTo: {
                select: {
                  id: true,
                  senderName: true,
                  content: true,
                  contentType: true,
                  isNote: true,
                },
              },
            },

            skip:
              (parseInt(page) - 1) *
              parseInt(limit),

            take: parseInt(limit),
          }),

          prisma.message.count({
            where: messageWhere,
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

      const { content, contentType = 'text', isNote = false, replyToId } =
        request.body as {
          content: string;
          contentType?: string;
          isNote?: boolean;
          replyToId?: string;
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
            contact: true,
          },
        });

      if (!conversation) {
        return reply
          .status(404)
          .send({
            error: 'Conversation not found',
          });
      }

      const hasAccess = await checkConversationContactAccess(id, user);
      if (!hasAccess) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      if (isNote) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { fullName: true },
          });
          const senderName = dbUser?.fullName || user.email;

          const message = await prisma.message.create({
            data: {
              id: randomUUID(),
              conversationId: conversation.id,
              zaloMsgId: null,
              senderType: 'self',
              senderUid: user.id,
              senderName,
              content: content.trim(),
              contentType: 'text',
              attachments: [],
              isNote: true,
              replyToId: replyToId || null,
              sentAt: new Date(),
            },
            include: {
              replyTo: {
                select: {
                  id: true,
                  senderName: true,
                  content: true,
                  contentType: true,
                  isNote: true,
                },
              },
            },
          });

          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              lastMessageAt: message.sentAt,
              isReplied: true,
              unreadCount: 0,
            },
          });

          // Handle mentions asynchronously
          handleMentions(content.trim(), conversation.id, senderName, user.id, user.orgId, request.server);

          const io = (request.server as any).io;
          io?.emit('chat:message', {
            accountId: conversation.zaloAccountId,
            message,
            conversationId: conversation.id,
          });

          return {
            success: true,
            message,
          };
        } catch (err) {
          logger.error('[chat] Create internal note error:', err);
          return reply.status(500).send({ error: 'Failed to create internal note' });
        }
      }

      if (replyToId) {
        pendingReplies.set(conversation.id, replyToId);
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

        let quotePayload: any = undefined;
        if (replyToId) {
          try {
            const parentMsg = await prisma.message.findUnique({
              where: { id: replyToId }
            });
            if (parentMsg && parentMsg.zaloMsgId) {
              quotePayload = {
                content: parentMsg.content || '',
                msgType: parentMsg.contentType === 'text' ? 'normal' : parentMsg.contentType,
                propertyExt: undefined,
                uidFrom: parentMsg.senderUid,
                msgId: parentMsg.zaloMsgId,
                cliMsgId: parentMsg.zaloMsgId,
                ts: String(parentMsg.sentAt.getTime()),
                ttl: 0
              };
            }
          } catch (err) {
            logger.error('[chat] Failed to build reply quote payload:', err);
          }
        }

        // Build Zalo API mentions array from @mentions in message content
        let mentionsPayload: { pos: number; uid: string; len: number; type?: number }[] | undefined;
        if (contentType === 'text' && !isNote) {
          try {
            const trimmedContent = content.trim();
            const recentSenders = await prisma.message.findMany({
              where: {
                conversationId: conversation.id,
                senderType: 'contact',
                senderName: { not: null },
                senderUid: { not: null },
              },
              select: { senderName: true, senderUid: true },
              distinct: ['senderUid'],
            });

            const senderMap = new Map<string, string>();
            for (const s of recentSenders) {
              if (s.senderName && s.senderUid) {
                senderMap.set(s.senderName.toLowerCase(), s.senderUid);
              }
            }

            // Include contact name if available
            if (conversation.contact?.fullName && conversation.contact?.zaloUid) {
              senderMap.set(conversation.contact.fullName.toLowerCase(), conversation.contact.zaloUid);
            }

            mentionsPayload = [];

            // 1. Check for @all / @tất cả
            const allRegex = /(?<=^|\s)@(all|tất cả)(?=\s|$|[.,!?:;])/gi;
            let allMatch;
            while ((allMatch = allRegex.exec(trimmedContent)) !== null) {
              mentionsPayload.push({
                pos: allMatch.index,
                uid: '-1',
                len: allMatch[0].length,
                type: 0,
              });
            }

            // 2. Check for specific member names
            for (const [name, uid] of senderMap.entries()) {
              const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
              const regex = new RegExp(`(?<=^|\\s)@${escapedName}(?=\\s|$|[.,!?:;])`, 'gi');
              let match;
              while ((match = regex.exec(trimmedContent)) !== null) {
                mentionsPayload.push({
                  pos: match.index,
                  uid: uid,
                  len: match[0].length,
                  type: 0,
                });
              }
            }

            // Sort mentions by position
            mentionsPayload.sort((a, b) => a.pos - b.pos);

            if (mentionsPayload.length === 0) {
              mentionsPayload = undefined;
            }
          } catch (err) {
            logger.error('[chat] Failed to build mentions payload:', err);
          }
        }

        let sendPayload: any = {
          msg: content.trim(),
          quote: quotePayload,
          mentions: mentionsPayload,
        };
        
        // Mở rộng hỗ trợ gửi sticker/ảnh nếu có contentType
        if (contentType === 'sticker') {
          let stickerPayload: any = null;
          try {
            const parsed = JSON.parse(content);
            stickerPayload = {
              id: Number(parsed.id || parsed.stickerId || parsed.sticker_id),
              cateId: Number(parsed.cateId || parsed.cate_id || 0),
              type: Number(parsed.type ?? 1),
            };
          } catch (e) {
            stickerPayload = {
              id: Number(content.trim()),
              cateId: 0,
              type: 1,
            };
          }
          await instance.api.sendSticker(stickerPayload, threadId, threadType);
        } else if (contentType === 'image') {
          const imageUrl = content.trim();
          const originalName = imageUrl.split('/').pop()?.split('?')[0] || 'image.jpg';
          const uploadId = randomUUID();
          const tempDir = path.join(os.tmpdir(), 'zalo-crm-uploads', uploadId);
          await fs.promises.mkdir(tempDir, { recursive: true });
          const tempFilePath = path.join(tempDir, originalName);

          try {
            const imgRes = await fetch(imageUrl);
            if (!imgRes.ok) throw new Error(`Failed to fetch image URL: ${imgRes.statusText}`);
            const arrayBuffer = await imgRes.arrayBuffer();
            await fs.promises.writeFile(tempFilePath, Buffer.from(arrayBuffer));

            await instance.api.sendMessage(
              {
                msg: '',
                attachments: [tempFilePath],
              },
              threadId,
              threadType,
            );
          } finally {
            fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
          }
        } else {
           await instance.api.sendMessage(
            sendPayload,
            threadId,
            threadType,
          );
        }

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

  // ── Upload and send attachment (image/video/file) ───────────────────────
  app.post(
    '/api/v1/conversations/:id/upload',
    {
      preHandler: requireZaloAccess('chat'),
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const conversation = await prisma.conversation.findFirst({
        where: { id, orgId: user.orgId },
        include: { zaloAccount: true },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      const hasAccess = await checkConversationContactAccess(id, user);
      if (!hasAccess) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const instance = zaloPool.getInstance(conversation.zaloAccountId);
      if (!instance?.api) {
        return reply.status(400).send({ error: 'Zalo account not connected' });
      }

      // Rate limit
      const limits = zaloRateLimiter.checkLimits(conversation.zaloAccountId);
      if (!limits.allowed) {
        return reply.status(429).send({ error: limits.reason });
      }

      // Save file to temp directory preserving original filename
      const originalName = data.filename || `file_${Date.now()}`;
      const uploadId = randomUUID();
      const tempDir = path.join(os.tmpdir(), 'zalo-crm-uploads', uploadId);
      await fs.promises.mkdir(tempDir, { recursive: true });
      const tempFilePath = path.join(tempDir, originalName);

      try {
        // Write uploaded stream to temp file
        await pipeline(data.file, fs.createWriteStream(tempFilePath));

        const threadId = conversation.externalThreadId || '';
        const threadType = conversation.threadType === 'group' ? 1 : 0;

        zaloRateLimiter.recordSend(conversation.zaloAccountId);

        // Send via zca-js with attachments
        await instance.api.sendMessage(
          {
            msg: '',
            attachments: [tempFilePath],
          },
          threadId,
          threadType,
        );

        /**
         * The actual message will be returned to the
         * frontend through Socket.IO by zalo-listener-factory.
         */
        return { success: true };
      } catch (err) {
        logger.error('[chat] Upload/send attachment error:', err);
        return reply.status(500).send({ error: 'Failed to send attachment' });
      } finally {
        // Clean up temp directory
        fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  );

  // ── Proxy download file with original filename ─────────────────────────
  app.get(
    '/api/v1/files/download',
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const { url, filename } = request.query as { url?: string; filename?: string };
      if (!url) {
        return reply.status(400).send({ error: 'URL required' });
      }

      try {
        const response = await fetch(url);
        if (!response.ok) {
          return reply.status(response.status).send({ error: 'Failed to fetch file from source' });
        }

        const rawName = filename || 'download';
        const safeFilename = encodeURIComponent(rawName).replace(/['()]/g, escape);
        const asciiFilename = rawName.replace(/[^\x20-\x7E]/g, '_');

        reply.header(
          'Content-Disposition',
          `attachment; filename="${asciiFilename}"; filename*=UTF-8''${safeFilename}`,
        );

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        reply.header('Content-Type', contentType);

        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          reply.header('Content-Length', contentLength);
        }

        const arrayBuffer = await response.arrayBuffer();
        return reply.send(Buffer.from(arrayBuffer));
      } catch (err) {
        logger.error('[chat] File proxy download error:', err);
        return reply.status(500).send({ error: 'Download error' });
      }
    },
  );

  // ── Proxy stream video/audio with Range support & proper mime type ──────────
  app.get(
    '/api/v1/files/stream',
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const { url, type } = request.query as { url?: string; type?: string };
      if (!url) {
        return reply.status(400).send({ error: 'URL required' });
      }

      try {
        const range = request.headers.range;
        const fetchHeaders: Record<string, string> = {};
        if (range) {
          fetchHeaders['Range'] = range;
        }

        const response = await fetch(url, { headers: fetchHeaders });
        if (!response.ok && response.status !== 206) {
          return reply.status(response.status).send({ error: 'Failed to stream media from source' });
        }

        const mimeType = type || 'video/mp4';
        reply.header('Content-Type', mimeType);
        reply.header('Accept-Ranges', 'bytes');

        const contentRange = response.headers.get('content-range');
        if (contentRange) {
          reply.header('Content-Range', contentRange);
          reply.status(206);
        } else {
          reply.status(response.status);
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          reply.header('Content-Length', contentLength);
        }

        const arrayBuffer = await response.arrayBuffer();
        return reply.send(Buffer.from(arrayBuffer));
      } catch (err) {
        logger.error('[chat] File proxy stream error:', err);
        return reply.status(500).send({ error: 'Stream error' });
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

      const hasAccess = await checkConversationContactAccess(id, user);
      if (!hasAccess) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

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

  // ── Search stickers via Zalo API ─────────────────────────────────────────
  app.get(
    '/api/v1/stickers',
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const user = request.user!;
      const { accountId, keyword = 'nice' } = request.query as {
        accountId?: string;
        keyword?: string;
      };

      if (!accountId) {
        return reply.status(400).send({ error: 'accountId required' });
      }

      if (user.role === 'member') {
        const hasAccess = await prisma.zaloAccountAccess.findUnique({
          where: {
            zaloAccountId_userId: {
              zaloAccountId: accountId,
              userId: user.id,
            },
          },
        });
        if (!hasAccess) {
          return reply.status(403).send({ error: 'Forbidden' });
        }
      }

      const instance = zaloPool.getInstance(accountId);
      if (!instance?.api) {
        return reply.status(400).send({ error: 'Zalo account not connected' });
      }

      try {
        const stickers = await instance.api.searchSticker(keyword);
        if (!stickers || stickers.length === 0) {
          return [];
        }

        const ids = stickers.map((s: any) => s.sticker_id || s.stickerId);
        const details = await instance.api.getStickersDetail(ids);
        return details;
      } catch (err) {
        logger.error('[chat] Search stickers error:', err);
        return reply.status(500).send({ error: 'Failed to fetch stickers' });
      }
    },
  );

  // ── Send / Remove Reaction on message ─────────────────────────────────
  app.post(
    '/api/v1/conversations/:id/messages/:msgId/reaction',
    {
      preHandler: requireZaloAccess('chat'),
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const user = request.user!;
      const { id, msgId } = request.params as {
        id: string;
        msgId: string;
      };

      const { icon } = request.body as {
        icon: string; // e.g. '/-heart', '/-strong', ':>', ':o', ':-((', ':-h', or '' to remove
      };

      const conversation = await prisma.conversation.findFirst({
        where: {
          id,
          orgId: user.orgId,
        },
        include: {
          zaloAccount: true,
        },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      const hasAccess = await checkConversationContactAccess(id, user);
      if (!hasAccess) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const message = await prisma.message.findFirst({
        where: {
          OR: [
            { id: msgId, conversationId: id },
            { zaloMsgId: msgId, conversationId: id },
          ],
        },
      });

      if (!message) {
        return reply.status(404).send({ error: 'Message not found' });
      }

      const instance = zaloPool.getInstance(conversation.zaloAccountId);
      if (!instance?.api) {
        return reply.status(400).send({ error: 'Zalo account not connected' });
      }

      if (!message.zaloMsgId) {
        return reply.status(400).send({ error: 'Message does not have a Zalo message ID' });
      }

      try {
        const threadId = conversation.externalThreadId || '';
        // 0 = User, 1 = Group
        const threadType = conversation.threadType === 'group' ? 1 : 0;

        const cliMsgId = getMessageCliMsgId(message);
        const rType = getRTypeFromIcon(icon);
        const reactionPayload = icon ? { icon, rType, source: 6 } : '';

        logger.info(`[chat] addReaction sending to Zalo: icon="${icon}", rType=${rType}, msgId=${message.zaloMsgId}, cliMsgId=${cliMsgId}, threadId=${threadId}, type=${threadType}`);

        try {
          const apiRes = await instance.api.addReaction(reactionPayload as any, {
            data: {
              msgId: String(message.zaloMsgId),
              cliMsgId,
            },
            threadId,
            type: threadType,
          });
          logger.info(`[chat] addReaction Zalo response: ${JSON.stringify(apiRes)}`);
        } catch (apiErr) {
          logger.error(`[chat] addReaction Zalo API error:`, apiErr);
        }

        return {
          success: true,
        };
      } catch (err: any) {
        logger.error('[chat] Add reaction error:', err);
        return reply.status(500).send({ error: err.message || 'Failed to add reaction' });
      }
    },
  );

  // ── Get group info & avatar for a group conversation ────────────────────
  app.get(
    '/api/v1/conversations/:id/group-info',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const user = request.user!;
      const { id } = request.params;

      const conversation = await prisma.conversation.findFirst({
        where: { id, orgId: user.orgId },
        include: { contact: true, zaloAccount: true },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      const hasAccess = await checkConversationContactAccess(id, user);
      if (!hasAccess) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      if (conversation.threadType !== 'group' || !conversation.externalThreadId) {
        return reply.status(400).send({ error: 'Not a group conversation' });
      }

      const groupId = conversation.externalThreadId;
      const instance = zaloPool.getInstance(conversation.zaloAccountId);

      if (!instance?.api) {
        // Fallback: return DB info if Zalo account instance is offline
        return {
          groupId,
          name: conversation.contact?.fullName || 'Nhóm Zalo',
          avatarUrl: conversation.contact?.avatarUrl || null,
          fullAvatarUrl: conversation.contact?.avatarUrl || null,
          desc: '',
          totalMember: 0,
          creatorId: '',
          adminIds: [],
          members: [],
          online: false,
        };
      }

      try {
        const result = await instance.api.getGroupInfo(groupId);
        const info = result?.gridInfoMap?.[groupId];

        if (!info) {
          return {
            groupId,
            name: conversation.contact?.fullName || 'Nhóm Zalo',
            avatarUrl: conversation.contact?.avatarUrl || null,
            fullAvatarUrl: conversation.contact?.avatarUrl || null,
            desc: '',
            totalMember: 0,
            creatorId: '',
            adminIds: [],
            members: [],
            online: true,
          };
        }

        const avatarUrl = info.avt || info.fullAvt || null;
        const fullAvatarUrl = info.fullAvt || info.avt || null;
        const groupName = info.name || conversation.contact?.fullName || 'Nhóm Zalo';

        // Update contact in DB if changed
        if (conversation.contactId) {
          await prisma.contact
            .update({
              where: { id: conversation.contactId },
              data: {
                fullName: groupName,
                ...(avatarUrl ? { avatarUrl } : {}),
              },
            })
            .catch(() => {});
        }

        const members = (info.currentMems || []).map((m: any) => ({
          uid: String(m.id || ''),
          name: m.dName || m.zaloName || 'Thành viên',
          zaloName: m.zaloName || '',
          avatarUrl: m.avatar || m.avatar_25 || null,
          type: m.type,
        }));

        return {
          groupId,
          name: groupName,
          desc: info.desc || '',
          avatarUrl,
          fullAvatarUrl,
          totalMember: info.totalMember || (info.memberIds ? info.memberIds.length : members.length),
          creatorId: info.creatorId || '',
          adminIds: info.adminIds || [],
          members,
          online: true,
        };
      } catch (err) {
        logger.warn(`[chat] Failed to fetch live group info for ${groupId}:`, err);
        return {
          groupId,
          name: conversation.contact?.fullName || 'Nhóm Zalo',
          avatarUrl: conversation.contact?.avatarUrl || null,
          fullAvatarUrl: conversation.contact?.avatarUrl || null,
          desc: '',
          totalMember: 0,
          creatorId: '',
          adminIds: [],
          members: [],
          online: false,
        };
      }
    },
  );
}

async function handleMentions(content: string, conversationId: string, senderName: string, senderId: string, orgId: string, server: any) {
  try {
    const users = await prisma.user.findMany({
      where: { orgId, isActive: true },
      select: { id: true, fullName: true, email: true }
    });

    const io = server.io;

    for (const u of users) {
      if (u.id === senderId) continue;

      const nameToMatch = u.fullName || u.email;
      if (!nameToMatch) continue;
      const escapedName = nameToMatch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`(?<=^|\\s)@${escapedName}(?=\\s|$|[.,!?:;])`, 'i');

      if (regex.test(content)) {
        const notification = await prisma.notification.create({
          data: {
            id: randomUUID(),
            userId: u.id,
            type: 'mention',
            title: 'Bạn được nhắc đến',
            detail: `${senderName} đã nhắc đến bạn trong một ghi chú cuộc trò chuyện.`,
            conversationId,
          }
        });

        io?.emit(`notification:created:${u.id}`, {
          notification: {
            id: 'db-' + notification.id,
            type: 'info',
            title: notification.title,
            detail: notification.detail,
            priority: 'high',
            createdAt: notification.createdAt.toISOString(),
            conversationId,
          }
        });
      }
    }
  } catch (err) {
    logger.error('[chat] Handle mentions error:', err);
  }
}