/**
 * Main application entry point.
 * Bootstraps Fastify server with all plugins, Socket.IO, and route handlers.
 * The process never exits — all errors are caught and logged.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import { Prisma } from '@prisma/client';
import { config } from './config/index.js';
import { prisma } from './shared/database/prisma-client.js';
import { logger } from './shared/utils/logger.js';
import { authRoutes } from './modules/auth/auth-routes.js';
import { zaloRoutes } from './modules/zalo/zalo-routes.js';
import { chatRoutes } from './modules/chat/chat-routes.js';
import { contactRoutes } from './modules/contacts/contact-routes.js';
import { contactSubResourceRoutes } from './modules/contacts/contact-sub-resource-routes.js';
import { appointmentRoutes } from './modules/contacts/appointment-routes.js';
import { startAppointmentReminder } from './modules/contacts/appointment-reminder.js';
import { dashboardRoutes } from './modules/dashboard/dashboard-routes.js';
import { reportRoutes } from './modules/dashboard/report-routes.js';
import { userRoutes } from './modules/auth/user-routes.js';
import { teamRoutes } from './modules/auth/team-routes.js';
import { orgRoutes } from './modules/auth/org-routes.js';
import { zaloAccessRoutes } from './modules/zalo/zalo-access-routes.js';
import { zaloSyncRoutes } from './modules/zalo/zalo-sync-routes.js';
import { zaloPool } from './modules/zalo/zalo-pool.js';
import { registerZaloSocketHandlers } from './modules/zalo/zalo-socket.js';
import { notificationRoutes } from './modules/notifications/notification-routes.js';
import { searchRoutes } from './modules/search/search-routes.js';
import { startZaloHealthCheck } from './modules/zalo/zalo-health-check.js';
import { publicApiRoutes } from './modules/api/public-api-routes.js';
import { webhookSettingsRoutes } from './modules/api/webhook-settings-routes.js';
import { orderRoutes } from './modules/orders/order-routes.js';
import { tagRoutes } from './modules/tags/tag-routes.js';
import { quickMessageRoutes } from './modules/quick-messages/quick-message-routes.js';
import { odooRoutes } from './modules/odoo/odoo-routes.js';
import { syncRoutes } from './modules/sync/sync-routes.js';
import { chatbotRoutes } from './modules/chatbot/chatbot-routes.js';
import { chatbotTestRoutes } from './modules/chatbot-test/chatbot-test-routes.js';
import { odooSyncService } from './modules/sync/odoo-sync-service.js';
import cron from 'node-cron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bootstrap() {
  const app = Fastify({ logger: false });

  // ── Plugins ──────────────────────────────────────────────────────────────

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server) or in dev mode
      if (!config.isProduction || !origin) {
        return cb(null, true);
      }
      // In production, allow configured appUrl, localhost, 127.0.0.1, or local IP
      try {
        const url = new URL(origin);
        const hostname = url.hostname;
        if (
          origin === config.appUrl ||
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.')
        ) {
          return cb(null, true);
        }
      } catch {
        // ignore url parse error
      }
      return cb(null, true);
    },
    credentials: true,
  });

  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
  });

  // Rate limiting with higher limits and per-key tracking
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
    // Use different limits for different clients
    keyGenerator: (request) => {
      // Use API key for authenticated requests
      const apiKey = request.headers['x-api-key'] as string;
      if (apiKey) {
        return `api:${apiKey}`;
      }
      // Use IP for other requests
      return request.ip;
    },
  });

  // Multipart file upload support (25 MB limit)
  await app.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024, // 25 MB
    },
  });

  // Serve persistent uploaded files
  if (!fs.existsSync(config.uploadDir)) {
    fs.mkdirSync(config.uploadDir, { recursive: true });
  }
  await app.register(fastifyStatic, {
    root: config.uploadDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // Serve compiled frontend assets in production
  if (config.isProduction) {
    await app.register(fastifyStatic, {
      root: path.join(__dirname, '../static'),
      prefix: '/',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else {
          // Hashed assets in /assets/ can be safely cached long-term
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });
  }

  // ── Socket.IO ─────────────────────────────────────────────────────────────

  const io = new Server(app.server, {
    cors: {
      origin: '*',
      credentials: true,
    },
  });

  // Attach io to app so route handlers can emit events
  app.decorate('io', io);

  // Pass io to zalo pool for real-time event emission
  zaloPool.setIO(io);

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);
    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  // Register Zalo Socket.IO event handlers
  registerZaloSocketHandlers(io);

  // ── Routes ────────────────────────────────────────────────────────────────

  await app.register(authRoutes);
  await app.register(zaloRoutes);
  await app.register(chatRoutes);
  await app.register(contactRoutes);
  await app.register(contactSubResourceRoutes);
  await app.register(appointmentRoutes);
  await app.register(dashboardRoutes);
  await app.register(reportRoutes);
  await app.register(userRoutes);
  await app.register(teamRoutes);
  await app.register(orgRoutes);
  await app.register(zaloAccessRoutes);
  await app.register(zaloSyncRoutes);
  await app.register(notificationRoutes);
  await app.register(searchRoutes);
  await app.register(publicApiRoutes);
  await app.register(webhookSettingsRoutes);
  await app.register(orderRoutes);
  await app.register(tagRoutes);
  await app.register(quickMessageRoutes);
  await app.register(odooRoutes);
  await app.register(syncRoutes);
  await app.register(chatbotRoutes, { prefix: '/api/v1/chatbot' });
  await app.register(chatbotTestRoutes);

  // Liveness/readiness probe — also checks DB connectivity
  app.get('/health', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'connected', timestamp: new Date().toISOString() };
    } catch {
      return { status: 'error', db: 'disconnected', timestamp: new Date().toISOString() };
    }
  });

  // Public debug route for stickers
  app.get('/stickers-test', async () => {
    const account = await prisma.zaloAccount.findFirst({
      where: { status: 'connected' },
      select: { id: true }
    });
    if (!account) return { error: 'No connected account' };
    const instance = zaloPool.getInstance(account.id);
    if (!instance?.api) return { error: 'No api instance' };
    try {
      const stickers = await instance.api.searchSticker('like');
      if (stickers && stickers.length > 0) {
        const details = await instance.api.getStickersDetail([stickers[0].sticker_id || stickers[0].stickerId]);
        return { stickers, details };
      }
      return { stickers, error: 'No stickers found' };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  // API version banner
  app.get('/api/v1/status', async () => {
    return { version: '1.0.0', name: 'Zalo CRM' };
  });

  // Favicon handler
  app.get('/favicon.ico', async (_request, reply) => {
    return reply.status(204).send();
  });

  // SPA fallback — serve index.html for non-API routes in production
  if (config.isProduction) {
    app.setNotFoundHandler(async (request, reply) => {
      // Return 404 for missing API endpoints, static assets, or files with extensions
      if (
        request.url.startsWith('/api/') ||
        request.url.startsWith('/assets/') ||
        request.url.startsWith('/uploads/') ||
        /\.[a-zA-Z0-9]+(\?.*)?$/.test(request.url)
      ) {
        return reply.status(404).send({ error: 'not_found' });
      }
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
      return reply.sendFile('index.html');
    });
  }

  // ── Error handler ─────────────────────────────────────────────────────────

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    logger.error('Request error:', error.message);
    reply.status(error.statusCode ?? 500).send({
      error: error.message || 'Internal Server Error',
    });
  });

  // ── Start ─────────────────────────────────────────────────────────────────

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(`Zalo CRM running on http://${config.host}:${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    startAppointmentReminder(io);
    startZaloHealthCheck();

    // ── Odoo Data Sync ───────────────────────────────────────────────────────
    // Run incremental sync precisely at seconds :00 and :30 of every minute
    function scheduleNextSync() {
      const now = new Date();
      const delay = 30000 - (now.getTime() % 30000); // ms until the next :00 or :30 mark
      setTimeout(() => {
        odooSyncService.runIncrementalSync()
          .then((results) => {
            const totalChanged = Object.values(results).reduce((a, b) => a + b, 0);
            if (totalChanged > 0) {
              logger.info(`[sync] Incremental sync: ${totalChanged} records updated. Broadcasting order:updated socket event.`);
              zaloPool.getIO()?.emit('order:updated');
            }
          })
          .catch(err => {
            logger.warn('[cron] Incremental sync error:', err.message);
          });
        scheduleNextSync();
      }, delay);
    }
    scheduleNextSync();
    logger.info('[sync] Precise scheduler registered: incremental sync aligned to :00 and :30 system seconds');

    // Run initial sync 30 seconds after server start (non-blocking)
    setTimeout(() => {
      odooSyncService.runIncrementalSync()
        .then((results) => {
          const totalChanged = Object.values(results).reduce((a, b) => a + b, 0);
          if (totalChanged > 0) {
            zaloPool.getIO()?.emit('order:updated');
          }
        })
        .catch(err => {
          logger.warn('[sync] Initial sync error:', err.message);
        });
    }, 30_000);
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }

  // Reconnect Zalo accounts that have saved sessions (staggered to avoid rate limits)
  try {
    const accounts = await prisma.zaloAccount.findMany({
      where: { sessionData: { not: Prisma.JsonNull } },
      select: { id: true, sessionData: true },
    });
    logger.info(`Attempting reconnect for ${accounts.length} Zalo account(s)`);
    for (const account of accounts) {
      const session = account.sessionData as {
        cookie: any;
        imei: string;
        userAgent: string;
      } | null;
      if (session?.imei) {
        // Stagger reconnects: 10 seconds between each account to avoid rate limits
        await new Promise((r) => setTimeout(r, 10_000));
        zaloPool.reconnect(account.id, session).catch((err) => {
          logger.warn(`Auto-reconnect failed for account ${account.id}:`, err);
        });
      }
    }
  } catch (err) {
    logger.error('Failed to load accounts for reconnect:', err);
  }
}

// Keep process alive — log but never crash on unhandled errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

bootstrap();
