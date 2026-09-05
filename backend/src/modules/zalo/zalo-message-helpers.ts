/**
 * zalo-message-helpers.ts — utilities for processing incoming Zalo messages.
 * Detects content type from msgType and updates contact avatars fire-and-forget.
 */
import { prisma } from '../../shared/database/prisma-client.js';

/**
 * Check if the message content represents a video (from video_width, file extension, or video URL).
 */
export function isVideoContent(msgType: string | undefined, content: any): boolean {
  if (msgType && (msgType.includes('video') || msgType.includes('mp4'))) return true;
  if (!content) return false;

  let parsed = content;
  if (typeof content === 'string') {
    if (
      content.startsWith('{') ||
      content.includes('video_width') ||
      content.includes('video_original_width') ||
      content.includes('/video-') ||
      content.includes('.mp4') ||
      content.includes('dlmd.me')
    ) {
      try {
        parsed = JSON.parse(content);
      } catch {
        return false;
      }
    } else {
      return false;
    }
  }

  if (typeof parsed === 'object' && parsed !== null) {
    if (parsed.params) {
      let p = parsed.params;
      if (typeof p === 'string') {
        try { p = JSON.parse(p); } catch {}
      }
      if (p && typeof p === 'object') {
        if (p.video_width || p.video_original_width || p.video_height) return true;
        const ext = (p.fileExt || '').toLowerCase();
        if (['mp4', 'mov', 'webm', 'avi', 'mkv', '3gp', 'm4v', 'ogv'].includes(ext)) return true;
      }
    }
    if (parsed.href) {
      const h = String(parsed.href).toLowerCase();
      if (h.includes('/video-') || h.includes('.mp4') || h.includes('.mov') || h.includes('.webm') || h.includes('dlmd.me')) {
        return true;
      }
    }
    if (parsed.title) {
      const ext = (parsed.title.split('.').pop() || '').toLowerCase();
      if (['mp4', 'mov', 'webm', 'avi', 'mkv', '3gp', 'm4v', 'ogv'].includes(ext)) return true;
    }
  }

  return false;
}

/**
 * Check if the message is a call event (voice call, video call, missed call) from Zalo.
 */
export function isCallEvent(msgType: string | undefined, content: any): boolean {
  // If it is a video, image, sticker, or voice message, it is NEVER a call!
  if (isVideoContent(msgType, content)) return false;
  if (msgType && (msgType.includes('video') || msgType.includes('photo') || msgType.includes('image') || msgType.includes('sticker') || msgType.includes('voice') || msgType.includes('file'))) {
    return false;
  }
  if (msgType && (msgType.includes('calltime') || msgType === 'chat.call')) return true;
  if (!content) return false;

  let parsed = content;
  if (typeof content === 'string') {
    if (
      content.includes('calltime') ||
      content.includes('recommened.call') ||
      (content.includes('sendBubbleMessage') && content.toLowerCase().includes('cuộc gọi'))
    ) {
      try {
        parsed = JSON.parse(content);
      } catch {
        return false;
      }
    } else {
      return false;
    }
  }

  if (typeof parsed === 'object' && parsed !== null) {
    if (typeof parsed.action === 'string' && (parsed.action.includes('calltime') || parsed.action === 'recommened.calltime' || parsed.action.includes('.call'))) {
      return true;
    }
    if (
      parsed.title === 'sendBubbleMessage' &&
      typeof parsed.description === 'string' &&
      parsed.description.toLowerCase().includes('cuộc gọi')
    ) {
      return true;
    }
    if (parsed.params) {
      let p = parsed.params;
      if (typeof p === 'string') {
        try { p = JSON.parse(p); } catch {}
      }
      if (typeof p === 'object' && p !== null) {
        if (p.isEnableCallback !== undefined || (p.isCaller !== undefined && p.calltype !== undefined)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Map zca-js msgType string to a normalized content type label.
 * Falls back to 'text' for unrecognised types or plain-string content.
 */
export function detectContentType(msgType: string | undefined, content: any): string {
  if (isVideoContent(msgType, content)) return 'video';
  if (isCallEvent(msgType, content)) return 'call';
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
  if (isCallEvent(msgType, content)) return [];
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
        const isVideo = isVideoContent(msgType, item);
        const type =
          item.type ||
          (isVideo ? 'video' : msgType?.includes('file') ? 'file' : 'image');
        attachments.push({
          type,
          url: url || thumbUrl,
          thumbUrl: thumbUrl || url,
          title: item.title || item.name || '',
          size: item.size || item.fileSize || 0,
          width: item.width || item.video_width || 0,
          height: item.height || item.video_height || 0,
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
