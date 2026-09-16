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

      // All members in the org see all quick messages (both shared and personal)
      const quickMessages = await prisma.quickMessage.findMany({
        where: { orgId: user.orgId },
        orderBy: { shortcut: 'asc' },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
      });

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
      const content = (body.content !== undefined && body.content !== null) ? body.content.trim() : '';
      const isShared = !!body.isShared;

      if (!shortcut || !title) {
        return reply.status(400).send({ error: 'Phím tắt và tiêu đề là bắt buộc' });
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

      // Normalize attachments array (images, documents, files)
      const parseList = (raw: any): any[] => {
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
          } catch {}
          if (raw.startsWith('http') || raw.startsWith('/uploads/')) {
            const isImg = /\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(raw.split('?')[0]);
            return [{ type: isImg ? 'image' : 'file', url: raw }];
          }
        }
        return [];
      };

      const attachments = parseList(body.attachments).map((item: any) => {
        if (typeof item === 'string') {
          const isImg = /\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(item.split('?')[0]);
          const name = item.split('/').pop()?.split('?')[0] || (isImg ? 'image.jpg' : 'file');
          return { type: isImg ? 'image' : 'file', url: item, name };
        }
        const url = item?.url || '';
        const isImg = item?.type === 'image' || (!item?.type && /\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(url.split('?')[0]));
        const name = item?.name || url.split('/').pop()?.split('?')[0] || (isImg ? 'image.jpg' : 'file');
        return {
          type: item?.type || (isImg ? 'image' : 'file'),
          url,
          name,
          size: item?.size,
          mimeType: item?.mimeType,
        };
      }).filter((item: any) => item.url);

      // Require at least content or attachments
      if (!content && attachments.length === 0) {
        return reply.status(400).send({ error: 'Cần có ít nhất 1 trong 2: nội dung tin nhắn hoặc tệp/hình ảnh đính kèm' });
      }

      const newQuickMessage = await prisma.quickMessage.create({
        data: {
          orgId: user.orgId,
          userId: user.id,
          shortcut,
          title,
          content,
          isShared,
          attachments,
        },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
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

      // Access control: only admin/owner OR creator can edit
      if (!isAdminOrOwner) {
        if (existing.userId !== user.id) {
          return reply.status(403).send({ error: 'Chỉ quản trị viên hoặc người tạo mới có quyền chỉnh sửa tin nhắn mẫu này' });
        }
        if (body.isShared === true && !existing.isShared) {
          return reply.status(403).send({ error: 'Chỉ quản trị viên hoặc chủ sở hữu mới có quyền đặt tin nhắn mẫu thành dùng chung' });
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

      let attachments = undefined;
      if (body.attachments !== undefined) {
        const parseList = (raw: any): any[] => {
          if (Array.isArray(raw)) return raw;
          if (typeof raw === 'string') {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) return parsed;
            } catch {}
            if (raw.startsWith('http') || raw.startsWith('/uploads/')) {
              const isImg = /\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(raw.split('?')[0]);
              return [{ type: isImg ? 'image' : 'file', url: raw }];
            }
          }
          return [];
        };

        attachments = parseList(body.attachments).map((item: any) => {
          if (typeof item === 'string') {
            const isImg = /\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(item.split('?')[0]);
            const name = item.split('/').pop()?.split('?')[0] || (isImg ? 'image.jpg' : 'file');
            return { type: isImg ? 'image' : 'file', url: item, name };
          }
          const url = item?.url || '';
          const isImg = item?.type === 'image' || (!item?.type && /\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(url.split('?')[0]));
          const name = item?.name || url.split('/').pop()?.split('?')[0] || (isImg ? 'image.jpg' : 'file');
          return {
            type: item?.type || (isImg ? 'image' : 'file'),
            url,
            name,
            size: item?.size,
            mimeType: item?.mimeType,
          };
        }).filter((item: any) => item.url);
      }

      // Check that at least content or attachments remains
      const nextContent = body.content !== undefined ? body.content.trim() : existing.content;
      const nextAttachments = attachments !== undefined ? attachments : (existing.attachments as any[]);
      const hasContent = !!nextContent;
      const hasAttachments = Array.isArray(nextAttachments) && nextAttachments.length > 0;

      if (!hasContent && !hasAttachments) {
        return reply.status(400).send({ error: 'Cần có ít nhất 1 trong 2: nội dung tin nhắn hoặc tệp/hình ảnh đính kèm' });
      }

      const updated = await prisma.quickMessage.update({
        where: { id },
        data: {
          shortcut: shortcut || undefined,
          title: body.title?.trim() || undefined,
          content: body.content !== undefined ? body.content.trim() : undefined,
          isShared: body.isShared !== undefined ? !!body.isShared : undefined,
          attachments: attachments !== undefined ? attachments : undefined,
        },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
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

      // Access control: only admin/owner OR creator can delete
      if (!isAdminOrOwner) {
        if (existing.userId !== user.id) {
          return reply.status(403).send({ error: 'Chỉ quản trị viên hoặc người tạo mới có quyền xóa tin nhắn mẫu này' });
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

      const originalName = data.filename || 'file';
      const mimeType = data.mimetype || 'application/octet-stream';
      const ext = path.extname(originalName) || '';
      const fileName = `${randomUUID()}${ext}`;
      const targetPath = path.join(config.uploadDir, fileName);

      // Stream data to target path
      await pipeline(data.file, fs.createWriteStream(targetPath));

      let size = 0;
      try {
        const stats = await fs.promises.stat(targetPath);
        size = stats.size;
      } catch {}

      // Return absolute URL based on host header
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
      logger.error('[quick-messages] Upload error:', err);
      return reply.status(500).send({ error: 'Không thể tải lên tệp đính kèm' });
    }
  });
}
