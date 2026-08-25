/**
 * zalo-message-helpers.ts — utilities for processing incoming Zalo messages.
 * Detects content type from msgType and updates contact avatars fire-and-forget.
 */
import { prisma } from '../../shared/database/prisma-client.js';

/**
 * Map zca-js msgType string to a normalized content type label.
 * Falls back to 'text' for unrecognised types or plain-string content.
 */
export function detectContentType(msgType: string | undefined, content: any): string {
  if (!msgType) return 'text';
  if (msgType.includes('photo') || msgType.includes('image')) return 'image';
  if (msgType.includes('sticker')) return 'sticker';
  if (msgType.includes('video')) return 'video';
  if (msgType.includes('voice')) return 'voice';
  if (msgType.includes('gif')) return 'gif';
  if (msgType.includes('link')) return 'link';
  if (msgType.includes('location')) return 'location';
  if (msgType.includes('file') || msgType.includes('doc')) {
    if (typeof content === 'object' && content !== null) {
      let ext = '';
      try {
        const params = typeof content.params === 'string' ? JSON.parse(content.params) : content.params;
        ext = (params?.fileExt || '').toLowerCase();
      } catch {}
      if (!ext && content.title) {
        ext = (content.title.split('.').pop() || '').toLowerCase();
      }
      if (['mp4', 'mov', 'webm', 'avi', 'mkv', '3gp', 'm4v', 'ogv'].includes(ext)) {
        return 'video';
      }
    }
    return 'file';
  }
  if (msgType.includes('recommended') || msgType.includes('card')) return 'contact_card';
  if (typeof content === 'object' && content !== null) return 'rich';
  return 'text';
}

/**
 * Extract attachments metadata (image url, thumbnail, dimensions, file info) from rawContent
 */
export function extractAttachments(msgType: string | undefined, content: any): any[] {
  const attachments: any[] = [];
  if (!content) return attachments;

  let parsed = content;
  if (typeof content === 'string') {
    try {
      if (content.startsWith('{') || content.startsWith('[')) {
        parsed = JSON.parse(content);
      }
    } catch {}
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      const url = item.hdUrl || item.href || item.url || item.thumb || item.normalUrl;
      const thumbUrl = item.thumb || item.url || item.href || item.normalUrl;
      if (url || thumbUrl) {
        const type =
          item.type ||
          (msgType?.includes('video') ? 'video' : msgType?.includes('file') ? 'file' : 'image');
        attachments.push({
          type,
          url: url || thumbUrl,
          thumbUrl: thumbUrl || url,
          title: item.title || item.name || '',
          size: item.size || item.fileSize || 0,
          width: item.width || 0,
          height: item.height || 0,
        });
      }
    }
  }

  return attachments;
}

/**
 * Fire-and-forget: fill in a missing avatarUrl on a Contact row.
 * Only updates rows where avatarUrl is currently null.
 */
export function updateContactAvatar(zaloUid: string, avatarUrl: string): void {
  prisma.contact
    .updateMany({
      where: { zaloUid, avatarUrl: null },
      data: { avatarUrl },
    })
    .catch(() => {});
}
