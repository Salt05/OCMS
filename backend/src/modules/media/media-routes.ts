/**
 * media-routes.ts — Protected API endpoints for serving local media and attachments.
 * Enforces JWT authentication, organization-scoped access permissions, path traversal protection,
 * and seamless fallback redirects to original CDN URLs when local files are not yet downloaded.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { mediaService, resolveStandardMimeType, extractUrlsFromContent } from './media-service.js';

export async function mediaRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/media/messages/:messageId/attachment/:attachmentIndex?
   * Secure endpoint for retrieving message media/attachments
   */
  app.get(
    '/api/v1/media/messages/:messageId/attachment/:attachmentIndex?',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 1. Verify JWT Authentication (supports Authorization header or ?token= query param for <img> tags)
        const queryToken = (request.query as any)?.token;
        if (queryToken && !request.headers.authorization) {
          request.headers.authorization = `Bearer ${queryToken}`;
        }

        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ error: 'Unauthorized' });
        }

        const user = request.user as { id: string; orgId: string; role: string };
        if (!user || !user.id || !user.orgId) {
          return reply.status(401).send({ error: 'Unauthorized' });
        }

        const { messageId, attachmentIndex } = request.params as { messageId: string; attachmentIndex?: string };
        const index = parseInt(attachmentIndex || '0', 10);

        // 2. Fetch message & conversation details
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: {
            id: true,
            contentType: true,
            content: true,
            attachments: true,
            conversation: {
              select: {
                id: true,
                orgId: true,
              },
            },
          },
        });

        if (!message || !message.conversation) {
          return reply.status(404).send({ error: 'Message not found' });
        }

        // 3. Verify Org scoping (all users within the organization have access to org messages)
        if (message.conversation.orgId !== user.orgId) {
          return reply.status(403).send({ error: 'Forbidden: Access denied across organizations' });
        }

        // 4. Locate media attachment (filter out non-media metadata items like cliMsgId)
        const filterMedia = (arr: any[]) =>
          arr.filter((a) => a && typeof a === 'object' && (a.localKey || a.url || a.href || a.thumbUrl || a.originalUrl));

        let attachments = Array.isArray(message.attachments) ? (message.attachments as any[]) : [];
        let mediaAttachments = filterMedia(attachments);

        // If attachments array has no media, try extracting from content JSON
        if (mediaAttachments.length === 0) {
          const contentUrls = extractUrlsFromContent(message.content);
          if (contentUrls.length > 0) {
            mediaAttachments = contentUrls.map((u) => ({
              type: message.contentType || 'image',
              url: u,
              originalUrl: u,
            }));
          }
        }

        const targetAttachment = mediaAttachments[index] || mediaAttachments[0];
        const remoteFallbackUrl =
          targetAttachment?.originalUrl ||
          targetAttachment?.url ||
          targetAttachment?.href ||
          targetAttachment?.thumbUrl;

        // 5. If target has a local file that exists on disk, serve it immediately!
        if (targetAttachment?.localKey) {
          const absolutePath = mediaService.getAbsolutePath(targetAttachment.localKey);
          if (absolutePath && fs.existsSync(absolutePath)) {
            const mimeType = resolveStandardMimeType(absolutePath, targetAttachment.mimeType);
            const fileName = targetAttachment.fileName || targetAttachment.title || `file_${messageId.slice(0, 8)}`;

            // Inline viewing for images, videos, audio, and PDF; attachment download for office/zip files
            const isInline =
              mimeType.startsWith('image/') ||
              mimeType.startsWith('video/') ||
              mimeType.startsWith('audio/') ||
              mimeType === 'application/pdf';

            const encodedFileName = encodeURIComponent(fileName);
            const dispositionHeader = isInline
              ? `inline; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
              : `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`;

            reply.header('Content-Type', mimeType);
            reply.header('Content-Disposition', dispositionHeader);
            reply.header('Cache-Control', 'private, max-age=604800'); // Cache privately in browser for 7 days

            return reply.send(fs.createReadStream(absolutePath));
          }
        }

        // 6. If local file is not on disk yet:
        // Trigger background download so subsequent requests are served locally
        mediaService.downloadMessageAttachments(messageId).catch((err) => {
          logger.warn(`[MediaRoutes] Background download failed for message ${messageId}:`, err);
        });

        // FAIL-SAFE REDIRECT: Redirect browser directly to original remote URL!
        if (remoteFallbackUrl && typeof remoteFallbackUrl === 'string' && remoteFallbackUrl.startsWith('http')) {
          return reply.redirect(remoteFallbackUrl, 302);
        }

        return reply.status(404).send({ error: 'Media not available' });
      } catch (err: any) {
        logger.error(`[MediaRoutes] Error serving attachment for message: ${err?.message || err}`);
        return reply.status(500).send({ error: 'Internal server error serving media' });
      }
    }
  );
}
