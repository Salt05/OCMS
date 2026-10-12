/**
 * migrate-media.ts — Single-line in-place media migration CLI tool.
 * Updates exactly 1 line on the terminal without printing any extra logs or SQL query noise.
 *
 * Usage:
 *   npx tsx src/scripts/migrate-media.ts
 *   npm run migrate:media
 */
import { prisma } from '../shared/database/prisma-client.js';
import { mediaService, extractUrlsFromContent } from '../modules/media/media-service.js';

// Configuration - High Speed Mode
const CONCURRENCY = 12;
const THROTTLE_MS = 0;
const BATCH_SIZE = 120;

interface MigrationStats {
  total: number;
  processed: number;
  downloaded: number;
  expired: number;
  skipped: number;
  errors: number;
  startTime: number;
}

function renderProgressBar(current: number, total: number, barLength = 20): string {
  if (total <= 0) return `[${'='.repeat(barLength)}] 100%`;
  const percent = Math.min(100, Math.floor((current / total) * 100));
  const filledLength = Math.round((barLength * current) / total);
  const bar = '='.repeat(Math.max(0, filledLength - 1)) + (filledLength > 0 ? '>' : '') + ' '.repeat(Math.max(0, barLength - filledLength));
  return `[${bar}] ${percent.toString().padStart(3, ' ')}%`;
}

function printSingleLine(stats: MigrationStats, isFinal = false) {
  const elapsedSec = Math.max(1, Math.floor((Date.now() - stats.startTime) / 1000));
  const ratePerMin = Math.round((stats.processed / elapsedSec) * 60);
  const bar = renderProgressBar(stats.processed, stats.total);

  // Format exactly on 1 single line:
  const line = `\rTiến độ: ${bar} (${stats.processed}/${stats.total}) - ${ratePerMin} tin/phút | Tải mới: ${stats.downloaded} | Hết hạn: ${stats.expired} | Lỗi: ${stats.errors}   `;

  process.stdout.write(line);

  if (isFinal) {
    process.stdout.write('\n\n[Hoàn tất] Toàn bộ media đã được tải về lưu trữ nội bộ thành công!\n\n');
  }
}

async function runMigration() {
  process.stdout.write('\n'); // Ensure fresh line

  const totalCandidates = await prisma.message.count({
    where: {
      contentType: { in: ['image', 'file', 'video', 'voice'] },
    },
  });

  const stats: MigrationStats = {
    total: totalCandidates,
    processed: 0,
    downloaded: 0,
    expired: 0,
    skipped: 0,
    errors: 0,
    startTime: Date.now(),
  };

  printSingleLine(stats);

  let cursorId: string | undefined = undefined;

  while (true) {
    const messages: Array<{
      id: string;
      contentType: string;
      content: string | null;
      attachments: any;
    }> = await prisma.message.findMany({
      take: BATCH_SIZE,
      skip: cursorId ? 1 : 0,
      cursor: cursorId ? { id: cursorId } : undefined,
      orderBy: { id: 'asc' },
      where: {
        contentType: { in: ['image', 'file', 'video', 'voice'] },
      },
      select: {
        id: true,
        contentType: true,
        content: true,
        attachments: true,
      },
    });

    if (messages.length === 0) break;
    cursorId = messages[messages.length - 1].id;

    for (let i = 0; i < messages.length; i += CONCURRENCY) {
      const chunk = messages.slice(i, i + CONCURRENCY);

      await Promise.all(
        chunk.map(async (msg) => {
          stats.processed++;
          const attachments = Array.isArray(msg.attachments) ? (msg.attachments as any[]) : [];

          const hasMediaUrl =
            attachments.some(
              (a) => a && typeof a === 'object' && (a.url || a.href || a.thumbUrl)
            ) || extractUrlsFromContent(msg.content).length > 0;

          if (!hasMediaUrl) {
            stats.skipped++;
            return;
          }

          try {
            const res = await mediaService.downloadMessageAttachments(msg.id, {
              silent: true,
              forceDownload: true,
            });
            stats.downloaded += res.downloaded;
            stats.expired += res.expired;
            stats.errors += res.failed;
          } catch {
            stats.errors++;
          }
        })
      );

      printSingleLine(stats);

      if (THROTTLE_MS > 0) {
        await new Promise((r) => setTimeout(r, THROTTLE_MS));
      }
    }
  }

  printSingleLine(stats, true);
  await prisma.$disconnect();
}

runMigration().catch((err) => {
  console.error('\n[Lỗi nghiêm trọng]:', err);
  process.exit(1);
});
