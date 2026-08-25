/**
 * quick-message-routes.ts — Quick Messages (Canned Responses) module.
 * Scoped to organization with strict role-based permission control.
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

interface QuickMessageBody {
  shortcut: string;
  title: string;
  content: string;
  isShared?: boolean;
  attachments?: any;
}

export async function quickMessageRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/quick-messages ──────────────────────────────────────────
  app.get('/api/v1/quick-messages', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const isAdminOrOwner = ['owner', 'admin'].includes(user.role);

      let quickMessages;
      if (isAdminOrOwner) {
        // Admin & Owner see everything in the org
        quickMessages = await prisma.quickMessage.findMany({
          where: { orgId: user.orgId },
          orderBy: { shortcut: 'asc' },
          include: {
            user: { select: { fullName: true, email: true } },
          },
        });
      } else {
        // Regular members see shared messages OR their own personal ones
        quickMessages = await prisma.quickMessage.findMany({
          where: {
            orgId: user.orgId,
            OR: [
              { isShared: true },
              { userId: user.id },
            ],
          },
          orderBy: { shortcut: 'asc' },
          include: {
            user: { select: { fullName: true, email: true } },
          },
        });
      }

      return { quickMessages };
    } catch (err) {
      logger.error('[quick-messages] GET error:', err);
      return reply.status(500).send({ error: 'Failed to fetch quick messages' });
    }
  });

  // ── POST /api/v1/quick-messages ─────────────────────────────────────────
  app.post('/api/v1/quick-messages', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = request.body as QuickMessageBody;

      const shortcut = body.shortcut?.trim().toLowerCase();
      const title = body.title?.trim();
      const content = body.content?.trim();
      const isShared = !!body.isShared;

      if (!shortcut || !title || !content) {
        return reply.status(400).send({ error: 'Shortcut, title, and content are required' });
      }

      // Shortcut format validation: letters, numbers, hyphens, underscores only
      if (!/^[a-z0-9_-]+$/.test(shortcut)) {
        return reply.status(400).send({ error: 'Shortcut must contain only alphanumeric characters, hyphens or underscores (no spaces/slashes)' });
      }

      // Check permissions: only admin or owner can create shared templates
      const isAdminOrOwner = ['owner', 'admin'].includes(user.role);
      if (isShared && !isAdminOrOwner) {
        return reply.status(403).send({ error: 'Only owners or admins can create shared quick messages' });
      }

      // Check unique constraint for shortcut per org
      const existing = await prisma.quickMessage.findFirst({
        where: {
          orgId: user.orgId,
          shortcut,
        },
      });

      if (existing) {
        return reply.status(409).send({ error: `Phím tắt /${shortcut} đã tồn tại trong hệ thống` });
      }

      const newQuickMessage = await prisma.quickMessage.create({
        data: {
          orgId: user.orgId,
          userId: user.id,
          shortcut,
          title,
          content,
          isShared,
          attachments: body.attachments ?? [],
        },
      });

      return reply.status(201).send(newQuickMessage);
    } catch (err) {
      logger.error('[quick-messages] POST error:', err);
      return reply.status(500).send({ error: 'Failed to create quick message' });
    }
  });

  // ── PUT /api/v1/quick-messages/:id ──────────────────────────────────────
  app.put('/api/v1/quick-messages/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as Partial<QuickMessageBody>;

      const existing = await prisma.quickMessage.findFirst({
        where: { id, orgId: user.orgId },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Quick message not found' });
      }

      const isAdminOrOwner = ['owner', 'admin'].includes(user.role);

      // Access control: regular members cannot edit shared messages or templates they do not own
      if (!isAdminOrOwner) {
        if (existing.isShared) {
          return reply.status(403).send({ error: 'You do not have permission to edit shared templates' });
        }
        if (existing.userId !== user.id) {
          return reply.status(403).send({ error: 'You do not own this template' });
        }
        if (body.isShared === true) {
          return reply.status(403).send({ error: 'Only admins or owners can set template as shared' });
        }
      }

      const shortcut = body.shortcut?.trim().toLowerCase();
      if (shortcut) {
        if (!/^[a-z0-9_-]+$/.test(shortcut)) {
          return reply.status(400).send({ error: 'Shortcut must contain only alphanumeric characters, hyphens or underscores (no spaces/slashes)' });
        }

        // Check if new shortcut is taken by another record
        const duplicate = await prisma.quickMessage.findFirst({
          where: {
            orgId: user.orgId,
            shortcut,
            id: { not: id },
          },
        });
        if (duplicate) {
          return reply.status(409).send({ error: `Phím tắt /${shortcut} đã tồn tại trong hệ thống` });
        }
      }

      const updated = await prisma.quickMessage.update({
        where: { id },
        data: {
          shortcut: shortcut || undefined,
          title: body.title?.trim() || undefined,
          content: body.content?.trim() || undefined,
          isShared: body.isShared !== undefined ? !!body.isShared : undefined,
          attachments: body.attachments !== undefined ? body.attachments : undefined,
        },
      });

      return updated;
    } catch (err) {
      logger.error('[quick-messages] PUT error:', err);
      return reply.status(500).send({ error: 'Failed to update quick message' });
    }
  });

  // ── DELETE /api/v1/quick-messages/:id ───────────────────────────────────
  app.delete('/api/v1/quick-messages/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const existing = await prisma.quickMessage.findFirst({
        where: { id, orgId: user.orgId },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Quick message not found' });
      }

      const isAdminOrOwner = ['owner', 'admin'].includes(user.role);

      // Access control: regular members can only delete their own personal templates
      if (!isAdminOrOwner) {
        if (existing.isShared) {
          return reply.status(403).send({ error: 'You do not have permission to delete shared templates' });
        }
        if (existing.userId !== user.id) {
          return reply.status(403).send({ error: 'You do not own this template' });
        }
      }

      await prisma.quickMessage.delete({ where: { id } });

      return { success: true };
    } catch (err) {
      logger.error('[quick-messages] DELETE error:', err);
      return reply.status(500).send({ error: 'Failed to delete quick message' });
    }
  });

  // ── POST /api/v1/quick-messages/upload ───────────────────────────────────
  app.post('/api/v1/quick-messages/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      // Check if it's an image
      const mimeType = data.mimetype;
      if (!mimeType.startsWith('image/')) {
        return reply.status(400).send({ error: 'Chỉ chấp nhận file hình ảnh' });
      }

      // Preserve original filename extension
      const ext = path.extname(data.filename) || '.png';
      const fileName = `${randomUUID()}${ext}`;
      const targetPath = path.join(config.uploadDir, fileName);

      // Stream data to target path
      await pipeline(data.file, fs.createWriteStream(targetPath));

      // Return absolute URL based on host header
      const protocol = (request.headers['x-forwarded-proto'] as string) || 'http';
      const host = request.headers.host;
      const fileUrl = `${protocol}://${host}/uploads/${fileName}`;

      return { url: fileUrl };
    } catch (err) {
      logger.error('[quick-messages] Upload error:', err);
      return reply.status(500).send({ error: 'Không thể upload file ảnh' });
    }
  });
}
