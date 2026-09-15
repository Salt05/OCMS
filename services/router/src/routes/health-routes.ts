import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'ocms-router',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/api/v1/health', async () => {
    return {
      status: 'ok',
      service: 'ocms-router',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  });
}
