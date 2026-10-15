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
  if (content.startsWith('http')) {
    // Check if URL is an actual media/file asset or Zalo CDN media
    const clean = content.split('?')[0].toLowerCase();
    const hasMediaExt = /\.(jpe?g|png|webp|gif|svg|bmp|mp4|mov|webm|mp3|m4a|wav|pdf|docx?|xlsx?|pptx?|zip|rar|7z)(\?|$)/i.test(content);
    const isZaloMediaCdn = clean.includes('zdn.vn') || clean.includes('dlfl.vn') || clean.includes('dlf1.vn') || clean.includes('zfcloud.zdn.vn') || clean.includes('dl.zdn.vn') || clean.includes('dlmd.me') || clean.includes('zadn.vn');
    if (hasMediaExt || isZaloMediaCdn) {
      return [content];
    }
    // Generic web links (e.g. portal.huflit.edu.vn, vnexpress, news, etc.) are web links, NOT media files!
    return [];
  }
  if (content.startsWith('{')) {
    try {
      const p = JSON.parse(content);
      // Disqualify web link recommendation/preview actions from extracting target web page as media
      if (p.action === 'recommened.link' || p.action === 'recommended.link' || p.action === 'show.profile') {
        return [];
      }
      const urls: string[] = [];
      const candidate = p.hdUrl || p.hd || p.href || p.url || p.thumb || p.downloadUrl;
      if (candidate && typeof candidate === 'string' && candidate.startsWith('http')) {
        const clean = candidate.split('?')[0].toLowerCase();
        const hasMediaExt = /\.(jpe?g|png|webp|gif|svg|bmp|mp4|mov|webm|mp3|m4a|wav|pdf|docx?|xlsx?|pptx?|zip|rar|7z)(\?|$)/i.test(candidate);
        const isZaloMediaCdn = clean.includes('zdn.vn') || clean.includes('dlfl.vn') || clean.includes('dlf1.vn') || clean.includes('zfcloud.zdn.vn') || clean.includes('dl.zdn.vn') || clean.includes('dlmd.me') || clean.includes('zadn.vn');
        if (hasMediaExt || isZaloMediaCdn) {
          urls.push(candidate);
        }
      }
      if (p.thumb && typeof p.thumb === 'string' && p.thumb.startsWith('http') && !urls.includes(p.thumb)) {
        const cleanThumb = p.thumb.split('?')[0].toLowerCase();
        if (cleanThumb.includes('zdn.vn') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(cleanThumb)) {
          urls.push(p.thumb);
        }
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

export interface FoundTierMedia {
  fullPath: string;
  localKey: string;
  tier: 'vm' | 'nas';
  fileName: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Extract original filename from HTTP Content-Disposition header
 * Supports both RFC 5987 (filename*=UTF-8'') and standard (filename="...")
 */
export function parseContentDispositionFilename(header: string | null | undefined): string | null {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {}
  }
  const standardMatch = header.match(/filename="?([^";]+)"?/i);
  if (standardMatch && standardMatch[1]) {
    return standardMatch[1].trim();
  }
  return null;
}

export class MediaService {
  private baseDir: string;
  private nasDir: string;

  constructor() {
    this.baseDir = config.mediaStorageDir;
    this.nasDir = config.nasMediaStorageDir;
    this.ensureDirs();
  }

  private ensureDirs(): void {
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true, mode: 0o755 });
      }
    } catch (err) {
      logger.error(`[MediaService] Failed to create media directory at ${this.baseDir}:`, err);
    }

    try {
      if (this.nasDir && fs.existsSync(this.nasDir)) {
        logger.info(`[MediaService] NAS storage is accessible at ${this.nasDir}`);
      }
    } catch (err) {
      logger.warn(`[MediaService] NAS storage directory check failed at ${this.nasDir}:`, err);
    }
  }

  private ramCache = new Map<string, FoundTierMedia>();
  private readonly MAX_CACHE_SIZE = 10000;

  private getFromCache(key: string): FoundTierMedia | null {
    if (!key) return null;
    const cached = this.ramCache.get(key);
    if (!cached) return null;
    if (fs.existsSync(cached.fullPath)) {
      return cached;
    }
    this.ramCache.delete(key);
    return null;
  }

  private setCache(key: string, item: FoundTierMedia): void {
    if (!key || !item) return;
    if (this.ramCache.size >= this.MAX_CACHE_SIZE) {
      const keysToEvict = Array.from(this.ramCache.keys()).slice(0, 1000);
      for (const k of keysToEvict) this.ramCache.delete(k);
    }
    this.ramCache.set(key, item);
  }

  /**
   * 3-Tier Media Lookup (O(1) Memory Cache & Direct Local Path):
   * 1. RAM Cache (fastest <0.1ms)
   * 2. Direct localKey on VM or NAS
   * Returns FoundTierMedia or null (which triggers direct Tier 3 download and save)
   */
  public findMediaInTiers(urlOrLocalKey: string, preferredFileName?: string): FoundTierMedia | null {
    if (!urlOrLocalKey || typeof urlOrLocalKey !== 'string') return null;

    // 1. Check RAM Cache
    const cached = this.getFromCache(urlOrLocalKey);
    if (cached) {
      return preferredFileName && cached.fileName !== preferredFileName
        ? { ...cached, fileName: preferredFileName }
        : cached;
    }

    // If remote URL, also check clean URL in RAM cache
    if (urlOrLocalKey.startsWith('http://') || urlOrLocalKey.startsWith('https://')) {
      const cleanUrl = urlOrLocalKey.split('?')[0];
      if (cleanUrl !== urlOrLocalKey) {
        const cachedClean = this.getFromCache(cleanUrl);
        if (cachedClean) {
          return preferredFileName && cachedClean.fileName !== preferredFileName
            ? { ...cachedClean, fileName: preferredFileName }
            : cachedClean;
        }
      }
      // No duplicate scanning on disk — if not in RAM cache, return null to directly download & save
      return null;
    }

    // 2. Direct localKey lookup (e.g. 2026/10/xyz.jpg) - direct path check only, no directory walks
    const safeKey = path.normalize(urlOrLocalKey).replace(/^(\.\.[\/\\])+/, '');

    // Tier 1: Local VM
    const candidateDirs = [this.baseDir, path.resolve('./media_store'), path.resolve('./backend/media_store'), '/app/media_store', '/data/ocms-media'];
    for (const dir of candidateDirs) {
      if (!dir || !fs.existsSync(dir)) continue;
      const vmPath = path.resolve(dir, safeKey);
      if (fs.existsSync(vmPath)) {
        try {
          const stats = fs.statSync(vmPath);
          if (stats.size > 0) {
            const item: FoundTierMedia = {
              fullPath: vmPath,
              localKey: safeKey,
              tier: 'vm',
              fileName: preferredFileName || path.basename(vmPath),
              sizeBytes: stats.size,
              mimeType: resolveStandardMimeType(vmPath),
            };
            this.setCache(urlOrLocalKey, item);
            this.setCache(safeKey, item);
            return item;
          }
        } catch {}
      }
    }

    // Tier 2: NAS Storage
    if (this.nasDir && fs.existsSync(this.nasDir)) {
      const nasPath = path.resolve(this.nasDir, safeKey);
      if (nasPath.startsWith(path.resolve(this.nasDir)) && fs.existsSync(nasPath)) {
        try {
          const stats = fs.statSync(nasPath);
          if (stats.size > 0) {
            const item: FoundTierMedia = {
              fullPath: nasPath,
              localKey: safeKey,
              tier: 'nas',
              fileName: preferredFileName || path.basename(nasPath),
              sizeBytes: stats.size,
              mimeType: resolveStandardMimeType(nasPath),
            };
            this.setCache(urlOrLocalKey, item);
            this.setCache(safeKey, item);
            return item;
          }
        } catch {}
      }
    }

    return null;
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

    // Only default to .jpg if contentTypeHeader is an image or URL is on Zalo photo CDN
    const lower = url.toLowerCase();
    if (
      (contentTypeHeader && contentTypeHeader.toLowerCase().startsWith('image/')) ||
      lower.includes('photo-') ||
      (lower.includes('zdn.vn') && (lower.includes('/jpg/') || lower.includes('/png/') || lower.includes('/webp/')))
    ) {
      return '.jpg';
    }

    return ''; // Unknown non-media or web page format
  }

  /**
   * Download file from external URL and save to local disk
   * Follows 3-Tier storage architecture:
   * 1. Tier 1 (VM) & Tier 2 (NAS) - Instant reuse if already archived
   * 2. Tier 3 (Zalo CDN) - Fetch from remote, parse Content-Disposition for actual filename, save to VM and mirror to NAS
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
    const cleanUrl = url.split('?')[0] || url;
    const urlHash = createHash('sha256').update(cleanUrl).digest('hex').slice(0, 32);

    // Fast check RAM cache: if already in RAM cache and not forced, reuse immediately without network/disk search
    if (!forceDownload) {
      const cached = this.getFromCache(url) || this.getFromCache(cleanUrl);
      if (cached) {
        return {
          localKey: cached.localKey,
          fullPath: cached.fullPath,
          fileName: originalFileName || cached.fileName || `attachment_${urlHash.slice(0, 8)}${path.extname(cached.fullPath)}`,
          mimeType: cached.mimeType,
          sizeBytes: cached.sizeBytes,
          originalUrl: url,
          isReused: true,
        };
      }
    }

    // Direct download from remote CDN (no disk/NAS duplicate scanning)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes for large files up to 100MB

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

      const contentType = response.headers.get('content-type') || '';
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      const contentDisposition = response.headers.get('content-disposition');
      const dispositionName = parseContentDispositionFilename(contentDisposition);
      const effectiveOriginalName = originalFileName || dispositionName || undefined;

      // Disqualify HTML web pages, XML, or plain text web documents from being saved as media!
      const lowerContentType = contentType.toLowerCase();
      if (
        lowerContentType.includes('text/html') ||
        lowerContentType.includes('application/xhtml+xml') ||
        lowerContentType.includes('text/xml')
      ) {
        if (!silent) {
          logger.info(`[MediaService] URL returned HTML/webpage (${contentType}), skipped media download: ${url.slice(0, 80)}`);
        }
        return null;
      }

      // Max file size check: 100 MB limit
      if (contentLength > 100 * 1024 * 1024) {
        if (!silent) {
          logger.warn(`[MediaService] File size exceeds 100MB limit (${contentLength} bytes). Skipped.`);
        }
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (!buffer || buffer.length === 0) {
        if (!silent) {
          logger.warn(`[MediaService] Downloaded empty 0-byte file from URL: ${url.slice(0, 80)}`);
        }
        return null;
      }

      let ext = this.getExtension(url, contentType, effectiveOriginalName);

      // Magic bytes check for PDF and images
      if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
        ext = '.pdf';
      } else if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        ext = '.jpg';
      } else if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        ext = '.png';
      } else if (buffer.length >= 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        ext = '.gif';
      } else if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
        // Zip / Office document magic header (PK\x03\x04)
        if (!['.docx', '.xlsx', '.pptx', '.zip', '.jar'].includes(ext)) {
          ext = effectiveOriginalName ? path.extname(effectiveOriginalName).toLowerCase() || '.zip' : '.zip';
        }
      }

      if (!ext || BLOCKED_EXTENSIONS.has(ext)) {
        if (!silent) {
          logger.warn(`[MediaService] Blocked or unknown file extension '${ext}' from URL: ${url.slice(0, 80)}`);
        }
        return null;
      }

      if (!fs.existsSync(targetDir)) {
        await fs.promises.mkdir(targetDir, { recursive: true, mode: 0o755 });
      }

      const filename = `${urlHash}${ext}`;
      const fullPath = path.join(targetDir, filename);
      const localKey = `${year}/${month}/${filename}`.replace(/\\/g, '/');

      // Direct write to Local VM
      await fs.promises.writeFile(fullPath, buffer);

      // ── Mirror to NAS Storage asynchronously in background (Non-blocking) ──
      if (this.nasDir && fs.existsSync(this.nasDir)) {
        const nasTargetDir = path.join(this.nasDir, subDir);
        const nasFullPath = path.join(nasTargetDir, filename);
        (async () => {
          try {
            if (!fs.existsSync(nasTargetDir)) {
              await fs.promises.mkdir(nasTargetDir, { recursive: true, mode: 0o755 });
            }
            await fs.promises.writeFile(nasFullPath, buffer);
          } catch (nasErr) {
            logger.warn(`[MediaService] Background mirror ${localKey} to NAS failed:`, nasErr);
          }
        })();
      }

      const sizeBytes = buffer.length;
      const mimeType = resolveStandardMimeType(fullPath, contentType || undefined);
      const fileName = effectiveOriginalName || originalFileName || `attachment_${urlHash.slice(0, 8)}${ext}`;

      // Save to RAM cache for instant future retrieval
      const cacheItem: FoundTierMedia = {
        fullPath,
        localKey,
        tier: 'vm',
        fileName,
        sizeBytes,
        mimeType,
      };
      this.setCache(url, cacheItem);
      this.setCache(cleanUrl, cacheItem);
      this.setCache(localKey, cacheItem);

      if (!silent) {
        logger.info(`[MediaService] Saved file locally: ${localKey} (${(sizeBytes / 1024).toFixed(1)} KB) - Name: ${fileName}`);
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
        const cleanContentUrl = contentUrl.split('?')[0];
        const existingAttIdx = newAttachments.findIndex(
          (a) => a && typeof a === 'object' && (
            (a.originalUrl && a.originalUrl.split('?')[0] === cleanContentUrl) ||
            (a.url && a.url.split('?')[0] === cleanContentUrl) ||
            (a.href && a.href.split('?')[0] === cleanContentUrl)
          )
        );

        const isDocumentOrFile =
          contentUrl.includes('dlfl.vn') ||
          contentUrl.includes('dlf1.vn') ||
          contentUrl.includes('zfcloud.zdn.vn') ||
          contentUrl.includes('dl.zdn.vn') ||
          /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|csv)(\?|$)/i.test(contentUrl) ||
          message.contentType === 'file' ||
          message.contentType === 'document';

        if (existingAttIdx !== -1) {
          // If attachment already exists, update in-place if forceDownload or not yet downloaded
          const existingAtt = newAttachments[existingAttIdx];
          if (forceDownload || !existingAtt.localKey || existingAtt.downloadStatus !== 'completed') {
            const saved = await this.downloadAndSave(contentUrl, existingAtt.title || existingAtt.fileName, { silent, forceDownload });
            if (saved) {
              newAttachments[existingAttIdx] = {
                ...existingAtt,
                localKey: saved.localKey,
                mimeType: saved.mimeType,
                sizeBytes: saved.sizeBytes,
                size: saved.sizeBytes,
                originalUrl: contentUrl,
                downloadStatus: 'completed',
                downloadedAt: new Date().toISOString(),
              };
              if (saved.isReused) {
                result.reused++;
              } else {
                result.downloaded++;
              }
              result.updated = true;
            }
          }
        } else {
          // Genuinely new attachment
          const saved = await this.downloadAndSave(contentUrl, undefined, { silent, forceDownload });
          if (saved) {
            const detectedType = isDocumentOrFile
              ? 'file'
              : (saved.mimeType.startsWith('video/')
                  ? 'video'
                  : saved.mimeType.startsWith('image/')
                    ? 'image'
                    : (message.contentType || 'file'));

            newAttachments.push({
              type: detectedType,
              url: contentUrl,
              fileName: saved.fileName,
              title: saved.fileName,
              localKey: saved.localKey,
              mimeType: saved.mimeType,
              sizeBytes: saved.sizeBytes,
              size: saved.sizeBytes,
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

      // Deduplicate newAttachments by URL or localKey before saving to DB
      const seenAttKeys = new Set<string>();
      const deduplicatedAttachments: any[] = [];
      for (const att of newAttachments) {
        if (!att || typeof att !== 'object') continue;
        if (att.cliMsgId && !att.url && !att.localKey) {
          deduplicatedAttachments.push(att);
          continue;
        }
        const u = (att.originalUrl || att.url || att.href || '').split('?')[0];
        const key = u || att.localKey;
        if (key && !seenAttKeys.has(key)) {
          seenAttKeys.add(key);
          deduplicatedAttachments.push(att);
        } else if (!key) {
          deduplicatedAttachments.push(att);
        }
      }

      if (result.updated || deduplicatedAttachments.length !== rawAttachments.length) {
        await prisma.message.update({
          where: { id: messageId },
          data: { attachments: deduplicatedAttachments },
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

    // 1. Tier 1: Check if file exists on local VM disk (fastest) and has non-zero size
    if (fs.existsSync(absolutePath)) {
      try {
        const st = fs.statSync(absolutePath);
        if (st.size > 0) return absolutePath;
        // Clean up corrupt 0-byte file so it can be redownloaded
        fs.unlinkSync(absolutePath);
      } catch {}
    }

    // 2. Tier 2: Check if file exists on NAS storage (for archived files > 15 days) and has non-zero size
    if (this.nasDir) {
      try {
        const nasPath = path.resolve(this.nasDir, safeKey);
        if (nasPath.startsWith(path.resolve(this.nasDir)) && fs.existsSync(nasPath)) {
          const st = fs.statSync(nasPath);
          if (st.size > 0) return nasPath;
          fs.unlinkSync(nasPath);
        }
      } catch (err) {
        logger.warn(`[MediaService] Error checking NAS storage for ${localKey}:`, err);
      }
    }

    return null;
  }
}

export const mediaService = new MediaService();
