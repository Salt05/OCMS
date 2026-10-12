/**
 * media-service.ts — Private local media storage and download service.
 * Handles downloading remote assets (Zalo/Facebook CDN), saving them into a secure,
 * date-partitioned folder structure, normalizing MIME types, and protecting against path traversal.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

// Executable and potentially dangerous file extensions to strictly disallow
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.bin', '.js', '.vbs', '.msi',
  '.scr', '.ps1', '.py', '.php', '.phtml', '.jar', '.com', '.dll', '.so',
]);

export interface StoredMediaInfo {
  localKey: string;      // Relative path: YYYY/MM/uuid.ext
  fullPath: string;      // Full filesystem path
  fileName: string;      // User-friendly display file name
  mimeType: string;      // Standardized MIME type
  sizeBytes: number;     // File size in bytes
  originalUrl: string;   // Original remote CDN URL
  isReused?: boolean;    // True if deduplicated without extra download
}

export interface DownloadMessageResult {
  updated: boolean;
  downloaded: number;
  reused: number;
  expired: number;
  failed: number;
}

/**
 * Standardize and sanitize MIME types
 */
export function resolveStandardMimeType(filePath: string, storedMimeType?: string): string {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.m4a':
      return 'audio/mp4';
    case '.ogg':
      return 'audio/ogg';
    case '.wav':
      return 'audio/wav';
    case '.pdf':
      return 'application/pdf';
    case '.doc':
      return 'application/msword';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.xls':
      return 'application/vnd.ms-excel';
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.zip':
      return 'application/zip';
    case '.rar':
      return 'application/x-rar-compressed';
    case '.txt':
      return 'text/plain';
    case '.csv':
      return 'text/csv';
  }

  if (storedMimeType) {
    const clean = storedMimeType.split(';')[0].trim().toLowerCase();
    if (clean === 'image/jpg') return 'image/jpeg';
    if (clean !== 'application/octet-stream' && clean !== 'binary/octet-stream') {
      return clean;
    }
  }

  return 'application/octet-stream';
}

/**
 * Extract image/video/file URLs from message content JSON or plain string
 */
export function extractUrlsFromContent(content: string | null): string[] {
  if (!content || typeof content !== 'string') return [];
  if (content.startsWith('http')) return [content];
  if (content.startsWith('{')) {
    try {
      const p = JSON.parse(content);
      const urls: string[] = [];
      const candidate = p.hdUrl || p.hd || p.href || p.url || p.thumb || p.downloadUrl;
      if (candidate && typeof candidate === 'string' && candidate.startsWith('http')) {
        urls.push(candidate);
      }
      if (p.thumb && typeof p.thumb === 'string' && p.thumb.startsWith('http') && !urls.includes(p.thumb)) {
        urls.push(p.thumb);
      }
      if (p.params && typeof p.params === 'string') {
        try {
          const paramsObj = JSON.parse(p.params);
          if (paramsObj.hd && typeof paramsObj.hd === 'string' && paramsObj.hd.startsWith('http') && !urls.includes(paramsObj.hd)) {
            urls.push(paramsObj.hd);
          }
        } catch {}
      }
      return urls;
    } catch {}
  }
  return [];
}

export class MediaService {
  private baseDir: string;

  constructor() {
    this.baseDir = config.mediaStorageDir;
    this.ensureBaseDir();
  }

  private ensureBaseDir(): void {
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true, mode: 0o755 });
      }
    } catch (err) {
      logger.error(`[MediaService] Failed to create media directory at ${this.baseDir}:`, err);
    }
  }

  /**
   * Determine safe file extension from Content-Type header, original name, or URL
   */
  private getExtension(url: string, contentTypeHeader?: string | null, originalName?: string): string {
    if (originalName) {
      const ext = path.extname(originalName).toLowerCase();
      if (ext && !BLOCKED_EXTENSIONS.has(ext) && ext.length <= 6) {
        return ext;
      }
    }

    if (contentTypeHeader) {
      const mime = contentTypeHeader.split(';')[0].trim().toLowerCase();
      switch (mime) {
        case 'image/jpeg':
        case 'image/jpg':
          return '.jpg';
        case 'image/png':
          return '.png';
        case 'image/webp':
          return '.webp';
        case 'image/gif':
          return '.gif';
        case 'video/mp4':
          return '.mp4';
        case 'video/quicktime':
          return '.mov';
        case 'video/webm':
          return '.webm';
        case 'audio/mpeg':
          return '.mp3';
        case 'audio/mp4':
          return '.m4a';
        case 'audio/ogg':
          return '.ogg';
        case 'audio/wav':
          return '.wav';
        case 'application/pdf':
          return '.pdf';
        case 'application/msword':
          return '.doc';
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          return '.docx';
        case 'application/vnd.ms-excel':
          return '.xls';
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
          return '.xlsx';
        case 'application/zip':
          return '.zip';
        case 'application/x-rar-compressed':
          return '.rar';
        case 'text/plain':
          return '.txt';
        case 'text/csv':
          return '.csv';
      }
    }

    // Try parsing extension from URL
    try {
      const parsedUrl = new URL(url);
      const ext = path.extname(parsedUrl.pathname).toLowerCase();
      if (ext && !BLOCKED_EXTENSIONS.has(ext) && ext.length <= 6) {
        return ext;
      }
    } catch {}

    return '.jpg'; // Sensible default for chat media
  }

  /**
   * Download file from external URL and save to local disk
   */
  public async downloadAndSave(
    url: string,
    originalFileName?: string,
    options?: { silent?: boolean; forceDownload?: boolean }
  ): Promise<StoredMediaInfo | null> {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return null;
    }

    const silent = Boolean(options?.silent);
    const forceDownload = Boolean(options?.forceDownload);

    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const subDir = path.join(year, month);
    const targetDir = path.join(this.baseDir, subDir);
    const urlHash = createHash('sha256').update(url).digest('hex').slice(0, 32);

    // Fast check: If file was already downloaded for this exact URL, reuse it instantly (unless forceDownload)!
    try {
      if (!forceDownload && fs.existsSync(targetDir)) {
        const existingFiles = fs.readdirSync(targetDir);
        const matched = existingFiles.find((f) => f.startsWith(urlHash));
        if (matched) {
          const fullPath = path.join(targetDir, matched);
          const stats = fs.statSync(fullPath);
          const localKey = `${year}/${month}/${matched}`.replace(/\\/g, '/');
          const mimeType = resolveStandardMimeType(fullPath);
          const fileName = originalFileName || `attachment_${urlHash.slice(0, 8)}${path.extname(matched)}`;
          return {
            localKey,
            fullPath,
            fileName,
            mimeType,
            sizeBytes: stats.size,
            originalUrl: url,
            isReused: true,
          };
        }
      }
    } catch {}

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (!silent) {
          logger.warn(`[MediaService] Download failed HTTP ${response.status} for URL: ${url.slice(0, 80)}...`);
        }
        return null;
      }

      const contentType = response.headers.get('content-type');
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

      // Max file size check: 100 MB limit
      if (contentLength > 100 * 1024 * 1024) {
        if (!silent) {
          logger.warn(`[MediaService] File size exceeds 100MB limit (${contentLength} bytes). Skipped.`);
        }
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let ext = this.getExtension(url, contentType, originalFileName);

      // Magic bytes check for PDF
      if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
        ext = '.pdf';
      } else if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        ext = '.jpg';
      } else if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        ext = '.png';
      } else if (buffer.length >= 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        ext = '.gif';
      }

      if (BLOCKED_EXTENSIONS.has(ext)) {
        if (!silent) {
          logger.warn(`[MediaService] Blocked unsafe file extension '${ext}' from URL: ${url}`);
        }
        return null;
      }

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true, mode: 0o755 });
      }

      const filename = `${urlHash}${ext}`;
      const fullPath = path.join(targetDir, filename);
      const localKey = `${year}/${month}/${filename}`.replace(/\\/g, '/');

      if (!fs.existsSync(fullPath)) {
        await fs.promises.writeFile(fullPath, buffer);
      }

      const sizeBytes = buffer.length;
      const mimeType = resolveStandardMimeType(fullPath, contentType || undefined);
      const fileName = originalFileName || `attachment_${urlHash.slice(0, 8)}${ext}`;

      if (!silent) {
        logger.info(`[MediaService] Saved file locally: ${localKey} (${(sizeBytes / 1024).toFixed(1)} KB)`);
      }

      return {
        localKey,
        fullPath,
        fileName,
        mimeType,
        sizeBytes,
        originalUrl: url,
      };
    } catch (err: any) {
      logger.error(`[MediaService] Error downloading media from ${url.slice(0, 80)}: ${err?.message || err}`);
      return null;
    }
  }

  /**
   * Process all remote media attachments of a given message and store them locally
   */
  public async downloadMessageAttachments(
    messageId: string,
    options?: { silent?: boolean; forceDownload?: boolean }
  ): Promise<DownloadMessageResult> {
    const silent = Boolean(options?.silent);
    const forceDownload = Boolean(options?.forceDownload);
    const result: DownloadMessageResult = {
      updated: false,
      downloaded: 0,
      reused: 0,
      expired: 0,
      failed: 0,
    };

    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
      });

      if (!message) return result;

      const rawAttachments = Array.isArray(message.attachments) ? (message.attachments as any[]) : [];
      const newAttachments = [...rawAttachments];

      for (let i = 0; i < newAttachments.length; i++) {
        const att = newAttachments[i];
        if (!att || typeof att !== 'object') continue;

        // Skip non-media metadata (like cliMsgId)
        const remoteUrl = att.url || att.hdUrl || att.href || att.thumbUrl;
        if (!remoteUrl || typeof remoteUrl !== 'string' || !remoteUrl.startsWith('http')) {
          continue;
        }

        // Skip if already downloaded locally and file exists on disk (unless forceDownload)
        if (!forceDownload && att.localKey && att.downloadStatus === 'completed') {
          const abs = this.getAbsolutePath(att.localKey);
          if (abs && fs.existsSync(abs)) {
            result.reused++;
            continue;
          }
        }

        const saved = await this.downloadAndSave(remoteUrl, att.title || att.fileName || att.name, { silent, forceDownload });
        if (saved) {
          newAttachments[i] = {
            ...att,
            localKey: saved.localKey,
            mimeType: saved.mimeType,
            sizeBytes: saved.sizeBytes,
            originalUrl: remoteUrl,
            downloadStatus: 'completed',
            downloadedAt: new Date().toISOString(),
          };
          if (saved.isReused) {
            result.reused++;
          } else {
            result.downloaded++;
          }
          result.updated = true;
        } else {
          newAttachments[i] = {
            ...att,
            downloadStatus: 'failed',
            failedAt: new Date().toISOString(),
          };
          result.expired++;
          result.updated = true;
        }
      }

      // Also check if message content (plain URL or Zalo JSON payload) has image/video/file URLs
      const contentUrls = extractUrlsFromContent(message.content);
      for (const contentUrl of contentUrls) {
        const alreadyExists = !forceDownload && newAttachments.some((a) => a && (a.originalUrl === contentUrl || a.url === contentUrl || (a.localKey && a.downloadStatus === 'completed')));
        if (!alreadyExists) {
          const saved = await this.downloadAndSave(contentUrl, undefined, { silent, forceDownload });
          if (saved) {
            newAttachments.push({
              type: message.contentType || 'image',
              url: contentUrl,
              localKey: saved.localKey,
              mimeType: saved.mimeType,
              sizeBytes: saved.sizeBytes,
              originalUrl: contentUrl,
              downloadStatus: 'completed',
              downloadedAt: new Date().toISOString(),
            });
            if (saved.isReused) {
              result.reused++;
            } else {
              result.downloaded++;
            }
            result.updated = true;
          } else {
            result.expired++;
          }
        }
      }

      if (result.updated) {
        await prisma.message.update({
          where: { id: messageId },
          data: { attachments: newAttachments },
        });
      }

      return result;
    } catch (err: any) {
      logger.error(`[MediaService] Error processing attachments for message ${messageId}: ${err?.message || err}`);
      result.failed++;
      return result;
    }
  }

  /**
   * Get absolute system file path for a given localKey, verifying safety against Path Traversal
   */
  public getAbsolutePath(localKey: string): string | null {
    if (!localKey || typeof localKey !== 'string') return null;

    // Normalize slashes and remove any relative traversal sequences
    const safeKey = path.normalize(localKey).replace(/^(\.\.[\/\\])+/, '');
    const absolutePath = path.resolve(this.baseDir, safeKey);

    // Security check: path MUST be within baseDir
    if (!absolutePath.startsWith(path.resolve(this.baseDir))) {
      logger.warn(`[MediaService] Path traversal attempt detected: ${localKey}`);
      return null;
    }

    return absolutePath;
  }
}

export const mediaService = new MediaService();
