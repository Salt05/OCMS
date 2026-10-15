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
   * Handler for retrieving message media/attachments across 3 tiers
   */
  const handleGetAttachment = async (request: FastifyRequest, reply: FastifyReply) => {
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

      // Prioritize raw index in attachments array if it has valid media fields
      const rawAttachment = attachments[index];
      const targetAttachment =
        rawAttachment && typeof rawAttachment === 'object' && (rawAttachment.localKey || rawAttachment.url || rawAttachment.originalUrl || rawAttachment.href)
          ? rawAttachment
          : (mediaAttachments[index] || mediaAttachments[0] || {});

      // Parse message content JSON for extra metadata or fallback URLs
      let contentUrl = '';
      let contentTitle = '';
      if (message.content && typeof message.content === 'string') {
        if (message.content.startsWith('{')) {
          try {
            const p = JSON.parse(message.content);
            const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
            contentTitle = p.title || p.name || p.fileName || params?.fileName || params?.title || '';
            const cand = p.href || p.url || p.downloadUrl || p.hdUrl || p.thumb;
            if (cand && typeof cand === 'string' && cand.startsWith('http')) {
              contentUrl = cand;
            }
            if (!contentUrl && params?.hd && typeof params.hd === 'string' && params.hd.startsWith('http')) {
              contentUrl = params.hd;
            }
          } catch {}
        } else if (message.content.startsWith('http')) {
          contentUrl = message.content.trim();
        }
      }

      const remoteFallbackUrl =
        targetAttachment?.originalUrl ||
        targetAttachment?.url ||
        targetAttachment?.href ||
        targetAttachment?.thumbUrl ||
        contentUrl;

      const preferredFileName =
        targetAttachment?.fileName ||
        targetAttachment?.title ||
        contentTitle ||
        undefined;

      // 5. 3-TIER RETRIEVAL ARCHITECTURE (Tier 1: VM -> Tier 2: NAS -> Tier 3: Zalo CDN)
      let foundMedia = targetAttachment?.localKey
        ? mediaService.findMediaInTiers(targetAttachment.localKey, preferredFileName)
        : null;

      // If not found by localKey but remoteFallbackUrl exists, search across all tiers by URL hash
      if (!foundMedia && remoteFallbackUrl) {
        foundMedia = mediaService.findMediaInTiers(remoteFallbackUrl, preferredFileName);
        // If discovered in VM or NAS, update message attachment metadata in DB asynchronously
        if (foundMedia && targetAttachment) {
          targetAttachment.localKey = foundMedia.localKey;
          targetAttachment.mimeType = foundMedia.mimeType;
          targetAttachment.sizeBytes = foundMedia.sizeBytes;
          targetAttachment.fileName = targetAttachment.fileName || foundMedia.fileName;
          prisma.message.update({
            where: { id: messageId },
            data: { attachments },
          }).catch(() => {});
        }
      }

      // TIER 1 (Local VM) & TIER 2 (NAS Storage): Serve directly from disk!
      let isValidDiskFile = false;
      if (foundMedia && fs.existsSync(foundMedia.fullPath)) {
        try {
          const st = fs.statSync(foundMedia.fullPath);
          if (st.size > 0) {
            isValidDiskFile = true;
          } else {
            // Corrupt 0-byte file: remove so Tier 3 can re-download clean content
            fs.unlinkSync(foundMedia.fullPath);
          }
        } catch {}
      }

      if (isValidDiskFile && foundMedia) {
        const mimeType = foundMedia.mimeType || resolveStandardMimeType(foundMedia.fullPath);
        const fileName = preferredFileName || foundMedia.fileName || `file_${messageId.slice(0, 8)}`;

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
        reply.header('Cache-Control', 'private, max-age=604800');
        reply.header('X-Storage-Tier', foundMedia.tier); // 'vm' or 'nas'

        return reply.send(fs.createReadStream(foundMedia.fullPath));
      }

      // TIER 3 (Zalo CDN Fallback + Instant Auto-Archive to VM & NAS)
      if (remoteFallbackUrl && typeof remoteFallbackUrl === 'string' && remoteFallbackUrl.startsWith('http')) {
        const saved = await mediaService.downloadAndSave(remoteFallbackUrl, preferredFileName, { forceDownload: true });

        if (saved && fs.existsSync(saved.fullPath)) {
          // Update attachment in message
          if (targetAttachment) {
            targetAttachment.localKey = saved.localKey;
            targetAttachment.mimeType = saved.mimeType;
            targetAttachment.sizeBytes = saved.sizeBytes;
            targetAttachment.fileName = saved.fileName;
            targetAttachment.downloadStatus = 'completed';
            prisma.message.update({
              where: { id: messageId },
              data: { attachments },
            }).catch(() => {});
          }

          const mimeType = saved.mimeType || resolveStandardMimeType(saved.fullPath);
          const fileName = saved.fileName || preferredFileName || `file_${messageId.slice(0, 8)}`;

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
          reply.header('X-Storage-Tier', 'zalo-saved');

          return reply.send(fs.createReadStream(saved.fullPath));
        }

        // If downloading failed (link expired on Zalo), return 410 Gone
        return reply.status(410).send({
          error: 'Tập tin đã hết hạn trên Zalo và không tìm thấy bản lưu trên Máy ảo hoặc NAS.',
          expiredUrl: remoteFallbackUrl,
        });
      }

      return reply.status(404).send({ error: 'Media not available' });
    } catch (err: any) {
      logger.error(`[MediaRoutes] Error serving attachment for message: ${err?.message || err}`);
      return reply.status(500).send({ error: 'Internal server error serving media' });
    }
  };

  // Register endpoint with all compatible path variants
  app.get('/api/v1/media/messages/:messageId/attachment/:attachmentIndex?', handleGetAttachment);
  app.get('/api/v1/api/v1/media/messages/:messageId/attachment/:attachmentIndex?', handleGetAttachment);
  app.get('/media/messages/:messageId/attachment/:attachmentIndex?', handleGetAttachment);
}
