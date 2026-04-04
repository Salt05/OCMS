/**
 * Order management routes — CRUD + stats + per-staff report.
 * All routes require authentication via authMiddleware.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { randomUUID } from 'node:crypto';

export async function orderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // Generate order code: ORD-YYYYMMDD-NNN
  async function generateOrderCode(orgId: string): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await prisma.order.count({
      where: { orgId, orderCode: { startsWith: `ORD-${today}` } },
    });
    return `ORD-${today}-${String(count + 1).padStart(3, '0')}`;
  }

  // List orders (paginated, filterable by status/contactId/createdByUserId)
  app.get('/api/v1/orders', async (request: FastifyRequest) => {
    const user = request.user!;
    const {
      page = '1',
      limit = '50',
      status = '',
      contactId = '',
      createdByUserId = '',
    } = request.query as Record<string, string>;

    const where: any = { orgId: user.orgId };
    if (status) where.status = status;
    if (contactId) where.contactId = contactId;
    if (createdByUserId) where.createdByUserId = createdByUserId;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          contact: { select: { id: true, fullName: true, phone: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.order.count({ where }),
    ]);

    return { orders, total };
  });

  // Create order
  app.post('/api/v1/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = request.body as any;

    if (!body.contactId || body.totalAmount === undefined) {
      return reply.status(400).send({ error: 'contactId và totalAmount là bắt buộc' });
    }

    const orderCode = await generateOrderCode(user.orgId);

    const order = await prisma.order.create({
      data: {
        id: randomUUID(),
        orgId: user.orgId,
        contactId: body.contactId,
        createdByUserId: user.id,
        conversationId: body.conversationId || null,
        orderCode,
        totalAmount: parseFloat(body.totalAmount),
        status: body.status || 'new',
        notes: body.notes || null,
      },
      include: {
        contact: { select: { id: true, fullName: true, phone: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    return order;
  });

  // Update order (totalAmount, status, notes)
  app.put('/api/v1/orders/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;

    const updateData: any = {};
    if (body.totalAmount !== undefined) updateData.totalAmount = parseFloat(body.totalAmount);
    if (body.status !== undefined) updateData.status = body.status;
    if (body.notes !== undefined) updateData.notes = body.notes;

    const order = await prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        contact: { select: { id: true, fullName: true, phone: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    return order;
  });

  // Delete order
  app.delete('/api/v1/orders/:id', async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    await prisma.order.delete({ where: { id } });
    return { success: true };
  });

  // Orders for a specific contact
  app.get('/api/v1/contacts/:id/orders', async (request: FastifyRequest) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const orders = await prisma.order.findMany({
      where: { contactId: id, orgId: user.orgId },
      include: { createdBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { orders };
  });

  // Order stats — revenue summary with optional date range
  app.get('/api/v1/orders/stats', async (request: FastifyRequest) => {
    const user = request.user!;
    const { from = '', to = '' } = request.query as Record<string, string>;

    const where: any = { orgId: user.orgId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to + 'T23:59:59');
    }

    const [total, completed, revenue, todayRevenue] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.count({ where: { ...where, status: 'completed' } }),
      prisma.order.aggregate({ where: { ...where, status: 'completed' }, _sum: { totalAmount: true } }),
      prisma.order.aggregate({
        where: {
          orgId: user.orgId,
          status: 'completed',
          createdAt: { gte: new Date(new Date().toISOString().split('T')[0]) },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      totalOrders: total,
      completedOrders: completed,
      totalRevenue: revenue._sum.totalAmount || 0,
      todayRevenue: todayRevenue._sum.totalAmount || 0,
    };
  });

  // Staff performance — per-staff order count and revenue
  app.get('/api/v1/orders/by-staff', async (request: FastifyRequest) => {
    const user = request.user!;

    const staffStats = await prisma.order.groupBy({
      by: ['createdByUserId'],
      where: { orgId: user.orgId },
      _count: true,
      _sum: { totalAmount: true },
    });

    const userIds = staffStats.map(s => s.createdByUserId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    const userMap = new Map(users.map(u => [u.id, u.fullName]));

    const result = staffStats.map(s => ({
      userId: s.createdByUserId,
      fullName: userMap.get(s.createdByUserId) || 'Unknown',
      orderCount: s._count,
      totalRevenue: s._sum.totalAmount || 0,
    }));

    return { staffStats: result };
  });
}
