/**
 * bulk-chat-routes.ts — REST API for bulk messaging sessions and attachments.
 * Scoped to organization and user with JWT auth.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { config } from '../../config/index.js';

export async function bulkChatRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/bulk-chat/session ─────────────────────────────────────────
  app.get('/api/v1/bulk-chat/session', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const settingKey = `bulk_chat_session_${user.id}`;

      const setting = await prisma.appSetting.findFirst({
        where: {
          orgId: user.orgId,
          settingKey,
        },
      });

      if (!setting?.valuePlain) {
        return { session: null };
      }

      try {
        const session = JSON.parse(setting.valuePlain);
        return { session };
      } catch {
        return { session: null };
      }
    } catch (err) {
      logger.error('[bulk-chat] GET session error:', err);
      return reply.status(500).send({ error: 'Failed to fetch bulk chat session' });
    }
  });

  // ── POST /api/v1/bulk-chat/session ────────────────────────────────────────
  app.post('/api/v1/bulk-chat/session', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const settingKey = `bulk_chat_session_${user.id}`;
      const { session } = request.body as { session: any };

      if (!session) {
        return reply.status(400).send({ error: 'Session data is required' });
      }

      await prisma.appSetting.upsert({
        where: {
          orgId_settingKey: {
            orgId: user.orgId,
            settingKey,
          },
        },
        create: {
          orgId: user.orgId,
          settingKey,
          valuePlain: JSON.stringify(session),
        },
        update: {
          valuePlain: JSON.stringify(session),
        },
      });

      return { success: true };
    } catch (err) {
      logger.error('[bulk-chat] POST session error:', err);
      return reply.status(500).send({ error: 'Failed to save bulk chat session' });
    }
  });

  // ── POST /api/v1/bulk-chat/upload ─────────────────────────────────────────
  app.post('/api/v1/bulk-chat/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const originalName = data.filename || 'file';
      const mimeType = data.mimetype || 'application/octet-stream';
      const ext = path.extname(originalName) || '';
      const fileName = `${randomUUID()}${ext}`;
      const targetPath = path.join(config.uploadDir, fileName);

      await pipeline(data.file, fs.createWriteStream(targetPath));

      let size = 0;
      try {
        const stats = await fs.promises.stat(targetPath);
        size = stats.size;
      } catch {}

      const protocol = (request.headers['x-forwarded-proto'] as string) || 'http';
      const host = request.headers.host;
      const fileUrl = `${protocol}://${host}/uploads/${fileName}`;
      const isImage = mimeType.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(ext);

      return {
        url: fileUrl,
        name: originalName,
        type: isImage ? 'image' : 'file',
        mimeType,
        size,
      };
    } catch (err) {
      logger.error('[bulk-chat] Upload error:', err);
      return reply.status(500).send({ error: 'Không thể tải lên tệp đính kèm' });
    }
  });
}
