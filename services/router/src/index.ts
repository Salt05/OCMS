import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { orderRoutes } from './routes/order-routes.js';
import { healthRoutes } from './routes/health-routes.js';
import { adminRoutes } from './routes/admin-routes.js';
import { mutationRoutes } from './routes/mutation-routes.js';
import { workerManager } from './workers/worker-manager.js';

async function bootstrap() {
  const app = Fastify({
    logger: {
      level: config.isProduction ? 'info' : 'debug',
    },
  });

  // Đăng ký CORS để Web Bán Hàng (store-lapet) có thể gọi API an toàn
  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Đăng ký các routes
  await app.register(healthRoutes);
  await app.register(orderRoutes);
  await app.register(adminRoutes);
  await app.register(mutationRoutes);

  // Xử lý lỗi toàn cục
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    reply.status(500).send({
      success: false,
      error: 'Lỗi hệ thống máy chủ nội bộ trong quá trình tiếp nhận đơn',
    });
  });

  try {
    const address = await app.listen({ port: config.port, host: config.host });
    app.log.info(`🚀 OCMS Universal Router Microservice is running at: ${address}`);
    app.log.info(`👉 Standard Order Ingestion Endpoint: ${address}/api/v1/orders/standard`);

    // Khởi động các Workers bất đồng bộ (Odoo Worker & Zalo Worker)
    await workerManager.init();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      await workerManager.stopAll();
      await app.close();
      process.exit(0);
    });
  }
}

bootstrap();
