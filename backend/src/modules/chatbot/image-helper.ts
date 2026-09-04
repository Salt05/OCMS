import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * Extracts all valid image URLs / Base64 URIs from message content, attachments and Zalo JSON payload.
 */
export function extractImageUrls(
  content?: string | null,
  attachments?: any,
  contentType?: string
): string[] {
  const urls: string[] = [];

  // 1. From attachments array
  if (Array.isArray(attachments)) {
    for (const att of attachments) {
      const u = att?.url || att?.hdUrl || att?.thumbUrl || att?.href;
      if (u && typeof u === 'string' && (u.startsWith('http') || u.startsWith('data:image') || u.startsWith('/'))) {
        urls.push(u);
      }
    }
  }

  // 2. From content
  if (content && typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('http') || trimmed.startsWith('data:image')) {
      urls.push(trimmed);
    } else if (trimmed.startsWith('{') || trimmed.includes('zdn.vn')) {
      try {
        const parsed = JSON.parse(trimmed);
        const u = parsed.href || parsed.url || parsed.thumb || parsed.hd;
        if (u && typeof u === 'string') urls.push(u);
        if (parsed.params && typeof parsed.params === 'string') {
          try {
            const innerParams = JSON.parse(parsed.params);
            if (innerParams.rawUrl) urls.push(innerParams.rawUrl);
            if (innerParams.hd) urls.push(innerParams.hd);
          } catch {}
        }
      } catch {
        // Regex fallback for raw string containing zdn.vn URL
        const match = trimmed.match(/https?:\/\/[^\s"']+\.zdn\.vn[^\s"']+/i);
        if (match && match[0]) {
          urls.push(match[0]);
        }
      }
    }
  }

  return Array.from(new Set(urls.filter(Boolean)));
}

/**
 * Downloads an image URL or reads a local file and converts it into a Base64 data URI
 * (e.g. data:image/jpeg;base64,...).
 * This ensures Google Gemini servers can always read the image even when Zalo CDN
 * blocks foreign data center IP addresses.
 */
export async function convertToDataUri(imageUrl: string, maxRetries = 3): Promise<string> {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('data:image')) {
    return imageUrl;
  }

  // Local file path
  if (imageUrl.startsWith('/') || imageUrl.startsWith('C:') || imageUrl.startsWith('.')) {
    try {
      let resolvedPath = imageUrl;
      if (imageUrl.startsWith('/uploads/')) {
        resolvedPath = path.join(config.uploadDir, imageUrl.replace(/^\/uploads\//, ''));
      }
      if (fs.existsSync(resolvedPath)) {
        const ext = path.extname(resolvedPath).toLowerCase().replace('.', '') || 'jpeg';
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const fileBuffer = await fs.promises.readFile(resolvedPath);
        const b64 = fileBuffer.toString('base64');
        return `data:${mime};base64,${b64}`;
      }
    } catch (e: any) {
      logger.warn(`[image-helper] Failed to read local image file ${imageUrl}: ${e.message}`);
    }
  }

  // Remote URL (Zalo CDN / Web)
  if (imageUrl.startsWith('http')) {
    // Generate candidate URLs (including mirror Zalo CDN subdomains if applicable)
    const candidateUrls: string[] = [imageUrl];
    if (imageUrl.includes('b-f11-zpc.zdn.vn')) {
      candidateUrls.push(imageUrl.replace('b-f11-zpc.zdn.vn', 'f119-zpc.zdn.vn'));
    } else if (imageUrl.includes('f119-zpc.zdn.vn')) {
      candidateUrls.push(imageUrl.replace('f119-zpc.zdn.vn', 'b-f11-zpc.zdn.vn'));
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      for (const targetUrl of candidateUrls) {
        try {
          const res = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://chat.zalo.me/',
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(15000),
          });

          if (!res.ok) {
            logger.warn(`[image-helper] (Attempt ${attempt}/${maxRetries}) Failed to download from ${targetUrl}: HTTP ${res.status}`);
            continue;
          }

          const mimeType = res.headers.get('content-type') || 'image/jpeg';
          const arrayBuffer = await res.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          return `data:${mimeType};base64,${base64}`;
        } catch (err: any) {
          const causeMsg = err.cause ? ` (cause: ${err.cause.code || err.cause.message || err.cause})` : '';
          logger.warn(`[image-helper] (Attempt ${attempt}/${maxRetries}) Error downloading from ${targetUrl}: ${err.message}${causeMsg}`);
        }
      }

      if (attempt < maxRetries) {
        // Wait before next retry attempt (1s, 2s) to allow Zalo CDN propagation
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }

    // NEVER return raw HTTP URL on failure because Google Gemini does not support Zalo CDN URLs and will throw HTTP 400
    logger.error(`[image-helper] All ${maxRetries} download attempts failed for ${imageUrl}`);
    return '';
  }

  return '';
}

/**
 * Converts a list of image URLs to Base64 data URIs in parallel
 */
export async function convertAllToDataUris(urls: string[]): Promise<string[]> {
  if (!urls || urls.length === 0) return [];
  const results = await Promise.allSettled(urls.map((u) => convertToDataUri(u)));
  const uris: string[] = [];
  for (const r of results) {
    // Only accept valid data:image URIs
    if (r.status === 'fulfilled' && r.value && r.value.startsWith('data:image')) {
      uris.push(r.value);
    }
  }
  return uris;
}
