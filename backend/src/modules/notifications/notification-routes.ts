/**
 * Notification routes — computed on-the-fly notifications for the authenticated user.
 * Sources: unreplied conversations, today/tomorrow appointments, disconnected Zalo accounts.
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloPool } from '../zalo/zalo-pool.js';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  detail: string;
  priority: string;
  createdAt: string;
}

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/notifications', async (request) => {
    const user = request.user!;
    const isAdmin = ['owner', 'admin'].includes(user.role);
    const notifications: NotificationItem[] = [];

    // 1. Unreplied conversations > 30 min (scoped to staff if not admin)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60000);
    const unreplied = await prisma.conversation.count({
      where: {
        orgId: user.orgId,
        isReplied: false,
        lastMessageAt: { lt: thirtyMinAgo },
        ...(isAdmin ? {} : { contact: { assignedUserId: user.id } }),
      },
    });
    if (unreplied > 0) {
      notifications.push({
        id: 'unreplied',
        type: 'warning',
        priority: 'high',
        title: `${unreplied} cuộc trò chuyện chưa trả lời`,
        detail: 'Có tin nhắn chưa phản hồi quá 30 phút',
        createdAt: new Date().toISOString(),
      });
    }

    // 2. Today's appointments
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const todayApts = await prisma.appointment.findMany({
      where: {
        orgId: user.orgId,
        appointmentDate: { gte: todayStart, lt: todayEnd },
        status: 'scheduled',
        ...(isAdmin ? {} : { assignedUserId: user.id }),
      },
      include: { contact: { select: { fullName: true } } },
      take: 5,
    });
    for (const apt of todayApts) {
      notifications.push({
        id: `apt-${apt.id}`,
        type: 'info',
        priority: 'medium',
        title: `Lịch hẹn: ${apt.contact?.fullName || 'KH'}`,
        detail: `${apt.appointmentTime || ''} - ${apt.notes || 'Tái khám'}`,
        createdAt: apt.appointmentDate.toISOString(),
      });
    }

    // 3. Tomorrow's appointments (scoped to staff if not admin)
    const tomorrowStart = new Date(todayEnd);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

    const tmrApts = await prisma.appointment.count({
      where: {
        orgId: user.orgId,
        appointmentDate: { gte: tomorrowStart, lt: tomorrowEnd },
        status: 'scheduled',
        ...(isAdmin ? {} : { assignedUserId: user.id }),
      },
    });
    if (tmrApts > 0) {
      notifications.push({
        id: 'tmr-apts',
        type: 'info',
        priority: 'low',
        title: `${tmrApts} lịch hẹn ngày mai`,
        detail: 'Chuẩn bị cho ngày mai',
        createdAt: new Date().toISOString(),
      });
    }

    // 4. Disconnected Zalo accounts (only shown to admin/owner)
    if (isAdmin) {
      const accounts = await prisma.zaloAccount.findMany({
        where: { orgId: user.orgId, deletedAt: null },
        select: { id: true, displayName: true },
      });
      for (const acc of accounts) {
        const status = zaloPool.getStatus(acc.id);
        if (status !== 'connected') {
          notifications.push({
            id: `zalo-${acc.id}`,
            type: 'error',
            priority: 'high',
            title: `Zalo "${acc.displayName}" mất kết nối`,
            detail: `Trạng thái: ${status}`,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    // 5. Database persistent notifications (scoped so staff do not see other staff's customers)
    try {
      const dbNotifications = await prisma.notification.findMany({
        where: { userId: user.id, isRead: false },
        include: {
          conversation: {
            select: { contact: { select: { assignedUserId: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const filteredDb = isAdmin
        ? dbNotifications
        : dbNotifications.filter(n => {
            const assigned = n.conversation?.contact?.assignedUserId;
            // If the conversation's contact is assigned to someone else, hide from this member
            if (assigned && assigned !== user.id) return false;
            return true;
          });

      const dbItems = filteredDb.map(n => ({
        id: 'db-' + n.id,
        type: n.type === 'customer_needs_human' ? 'warning' : 'info',
        priority: 'high',
        title: n.title,
        detail: n.detail,
        createdAt: n.createdAt.toISOString(),
        conversationId: n.conversationId || undefined,
      }));
      notifications.unshift(...dbItems);
    } catch (err) {
      // ignore
    }

    return { notifications };
  });

  // PUT /api/v1/notifications/:id/read — mark database notification as read
  app.put('/api/v1/notifications/:id/read', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    try {
      await prisma.notification.updateMany({
        where: { id, userId: user.id },
        data: { isRead: true },
      });
      return { success: true };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to mark notification as read' });
    }
  });
}
