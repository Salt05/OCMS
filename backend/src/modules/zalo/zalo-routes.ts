/**
 * Zalo account management routes.
 * All endpoints require authentication via authMiddleware.
 */
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloPool } from './zalo-pool.js';
import { prisma } from '../../shared/database/prisma-client.js';

export async function zaloRoutes(app: FastifyInstance): Promise<void> {
  // All routes in this plugin require auth
  app.addHook('preHandler', authMiddleware);

  // POST /api/v1/zalo-accounts/reconnect-all — force check and reconnect all disconnected accounts in org
  app.post('/api/v1/zalo-accounts/reconnect-all', async (request) => {
    const user = request.user!;
    const accounts = await prisma.zaloAccount.findMany({
      where: {
        orgId: user.orgId,
        deletedAt: null,
        sessionData: { not: Prisma.JsonNull },
      },
      select: { id: true, displayName: true, sessionData: true },
    });

    let reconnectedCount = 0;
    let alreadyConnectedCount = 0;

    for (const acc of accounts) {
      const status = zaloPool.getStatus(acc.id);
      if (status === 'connected') {
        alreadyConnectedCount++;
      } else {
        const session = acc.sessionData as any;
        if (session?.imei) {
          reconnectedCount++;
          zaloPool.reconnect(acc.id, session, 1).catch(() => {});
        }
      }
    }

    return {
      message: `Đã kích hoạt kiểm tra: ${alreadyConnectedCount} tài khoản đang hoạt động, ${reconnectedCount} tài khoản đang được kết nối lại`,
      reconnectedCount,
      alreadyConnectedCount,
      totalCount: accounts.length,
    };
  });

  // GET /api/v1/zalo-accounts — list accounts with live status from pool
  app.get('/api/v1/zalo-accounts', async (request) => {
    const user = request.user!;
    const accounts = await prisma.zaloAccount.findMany({
      where: { orgId: user.orgId, deletedAt: null },
      select: {
        id: true,
        zaloUid: true,
        displayName: true,
        avatarUrl: true,
        phone: true,
        status: true,
        aiAutoReply: true,
        aiWorkingHoursOnly: true,
        lastConnectedAt: true,
        createdAt: true,
        owner: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Merge live status from pool
    return accounts.map((a) => ({
      ...a,
      liveStatus: zaloPool.getStatus(a.id),
    }));
  });

  // PATCH /api/v1/zalo-accounts/:id/ai-settings — update account-level AI settings
  app.patch<{
    Params: { id: string };
    Body: { aiAutoReply?: boolean; aiWorkingHoursOnly?: boolean };
  }>('/api/v1/zalo-accounts/:id/ai-settings', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params;
    const { aiAutoReply, aiWorkingHoursOnly } = request.body || {};

    const account = await prisma.zaloAccount.findFirst({
      where: { id, orgId: user.orgId },
    });

    if (!account) {
      return reply.status(404).send({ error: 'Zalo account not found' });
    }

    const updated = await prisma.zaloAccount.update({
      where: { id },
      data: {
        ...(typeof aiAutoReply === 'boolean' ? { aiAutoReply } : {}),
        ...(typeof aiWorkingHoursOnly === 'boolean' ? { aiWorkingHoursOnly } : {}),
      },
    });

    return reply.send({ success: true, account: updated });
  });

  // POST /api/v1/zalo-accounts — create a new account record
  app.post<{ Body: { displayName?: string } }>(
    '/api/v1/zalo-accounts',
    async (request, reply) => {
      const user = request.user!;
      const { displayName } = request.body ?? {};

      const account = await prisma.zaloAccount.create({
        data: {
          orgId: user.orgId,
          ownerUserId: user.id,
          displayName: displayName ?? null,
          status: 'qr_pending',
        },
      });

      return reply.status(201).send(account);
    },
  );

  // POST /api/v1/zalo-accounts/:id/login — initiate QR login
  app.post<{ Params: { id: string } }>(
    '/api/v1/zalo-accounts/:id/login',
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId },
      });
      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      // Fire-and-forget — QR delivered via Socket.IO
      zaloPool.loginQR(id).catch(() => {
        // errors are emitted via socket; no need to crash here
      });

      return { message: 'QR login initiated — subscribe to account:' + id + ' socket room' };
    },
  );

  // POST /api/v1/zalo-accounts/:id/reconnect — force reconnect using saved session
  app.post<{ Params: { id: string } }>(
    '/api/v1/zalo-accounts/:id/reconnect',
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId },
      });
      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      const session = account.sessionData as {
        cookie: any;
        imei: string;
        userAgent: string;
      } | null;

      if (!session?.imei) {
        return reply.status(400).send({ error: 'No saved session — please login with QR first' });
      }

      // Fire-and-forget — result emitted via Socket.IO
      zaloPool.reconnect(id, session).catch(() => {});

      return { message: 'Reconnect initiated' };
    },
  );

  // DELETE /api/v1/zalo-accounts/:id — soft delete: disconnect, clear session, mark as deleted
  app.delete<{ Params: { id: string } }>(
    '/api/v1/zalo-accounts/:id',
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId, deletedAt: null },
      });
      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      zaloPool.disconnect(id);
      await prisma.zaloAccount.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          sessionData: Prisma.JsonNull,
          status: 'disconnected',
        },
      });

      return reply.status(204).send();
    },
  );

  // GET /api/v1/zalo-accounts/:id/status — live status from pool
  app.get<{ Params: { id: string } }>(
    '/api/v1/zalo-accounts/:id/status',
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;

      const account = await prisma.zaloAccount.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true, status: true },
      });
      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      return { accountId: id, liveStatus: zaloPool.getStatus(id) };
    },
  );

  // ── POST /api/v1/zalo/search-phone — Search user by phone number on Zalo Web ──
  app.post<{
    Body: { phone: string; accountId?: string };
  }>('/api/v1/zalo/search-phone', async (request, reply) => {
    const user = request.user!;
    const { phone, accountId } = request.body || {};

    const cleanPhone = (phone || '').replace(/[\s.-]/g, '').trim();
    if (!cleanPhone || cleanPhone.length < 8) {
      return reply.status(400).send({ error: 'Số điện thoại không hợp lệ (cần ít nhất 9 số)' });
    }

    // Find a connected Zalo account in this org
    let targetAccountId = accountId;
    if (!targetAccountId) {
      const accs = await prisma.zaloAccount.findMany({
        where: { orgId: user.orgId, deletedAt: null },
        select: { id: true },
      });
      targetAccountId = accs.find((a) => zaloPool.getStatus(a.id) === 'connected')?.id || accs[0]?.id;
    }

    if (!targetAccountId) {
      return reply.status(400).send({ error: 'Chưa có tài khoản Zalo nào được kết nối' });
    }

    const api = zaloPool.getApi(targetAccountId);
    if (!api || !api.findUser) {
      return reply.status(503).send({ error: 'Tài khoản Zalo đang ngắt kết nối. Vui lòng kết nối lại tài khoản Zalo trước.' });
    }

    try {
      // Normalize phone for Zalo: 0912345678 -> 84912345678
      let formattedPhone = cleanPhone;
      if (formattedPhone.startsWith('+84')) formattedPhone = '84' + formattedPhone.slice(3);
      else if (formattedPhone.startsWith('0')) formattedPhone = '84' + formattedPhone.slice(1);

      const result = await api.findUser(formattedPhone);
      const uid = String(result?.uid || result?.userId || result?.id || '');
      if (!result || !uid || uid === '0') {
        return {
          found: false,
          message: 'Không tìm thấy người dùng Zalo với số điện thoại này hoặc người dùng đã tắt tính năng tìm kiếm.',
        };
      }

      const displayName = result.display_name || result.zalo_name || result.displayName || result.zaloName || result.name || cleanPhone;
      const avatar = result.avatar || result.avatarUrl || null;

      // Find matching contact in DB by phone or UID
      const contact = await prisma.contact.findFirst({
        where: {
          orgId: user.orgId,
          OR: [
            { zaloUid: uid },
            ...(cleanPhone ? [{ phone: { contains: cleanPhone } }] : []),
          ],
        },
      });

      // Find existing conversation in DB across any matching threadId / contactId
      const existingConv = await prisma.conversation.findFirst({
        where: {
          orgId: user.orgId,
          OR: [
            { externalThreadId: uid },
            ...(contact ? [{ contactId: contact.id }] : []),
          ],
        },
        select: { id: true, zaloAccountId: true },
        orderBy: { lastMessageAt: 'desc' },
      });

      return {
        found: true,
        user: {
          uid,
          displayName: contact?.fullName || displayName,
          avatar: contact?.avatarUrl || avatar,
          phone: contact?.phone || cleanPhone,
          gender: result.gender,
          zaloAccountId: existingConv?.zaloAccountId || targetAccountId,
        },
        existingConversationId: existingConv?.id || null,
      };
    } catch (err: any) {
      return {
        found: false,
        message: err?.message?.includes('216')
          ? 'Không tìm thấy tài khoản Zalo với số điện thoại này hoặc người dùng đã ẩn tìm kiếm bằng số điện thoại.'
          : (err?.message || 'Không tìm thấy tài khoản Zalo.'),
      };
    }
  });

  // ── POST /api/v1/zalo/start-chat-by-phone — Open/create chat for searched phone or contact ──
  app.post<{
    Body: {
      phone?: string;
      uid?: string;
      displayName?: string;
      avatarUrl?: string;
      accountId?: string;
      contactId?: string;
    };
  }>('/api/v1/zalo/start-chat-by-phone', async (request, reply) => {
    const user = request.user!;
    const { phone, uid: providedUid, displayName, avatarUrl, accountId, contactId } = request.body || {};

    let targetAccountId = accountId;
    if (!targetAccountId) {
      const accs = await prisma.zaloAccount.findMany({
        where: { orgId: user.orgId },
        select: { id: true },
      });
      targetAccountId = accs.find((a) => zaloPool.getStatus(a.id) === 'connected')?.id || accs[0]?.id;
    }

    if (!targetAccountId) {
      return reply.status(400).send({ error: 'Chưa có tài khoản Zalo nào được kết nối' });
    }

    // 1. Find contact if contactId or phone or uid is provided
    let contact = await prisma.contact.findFirst({
      where: {
        orgId: user.orgId,
        OR: [
          ...(contactId ? [{ id: contactId }] : []),
          ...(providedUid ? [{ zaloUid: providedUid }] : []),
          ...(phone ? [{ phone: { contains: phone.trim() } }] : []),
        ],
      },
    });

    let uid = providedUid || contact?.zaloUid || '';

    // If still no UID but phone is present, try finding UID from Zalo
    if (!uid && (phone || contact?.phone)) {
      const cleanPhone = (phone || contact?.phone || '').replace(/[\s.-]/g, '').trim();
      let formattedPhone = cleanPhone;
      if (formattedPhone.startsWith('+84')) formattedPhone = '84' + formattedPhone.slice(3);
      else if (formattedPhone.startsWith('0')) formattedPhone = '84' + formattedPhone.slice(1);

      const api = zaloPool.getApi(targetAccountId);
      if (api?.findUser) {
        try {
          const result = await api.findUser(formattedPhone);
          if (result?.uid) {
            uid = String(result.uid);
          }
        } catch {}
      }
    }

    if (!uid && !contact) {
      return reply.status(400).send({ error: 'Không tìm thấy thông tin Zalo hoặc số điện thoại' });
    }

    if (!contact && uid) {
      contact = await prisma.contact.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          zaloUid: uid,
          phone: phone ? phone.trim() : null,
          fullName: (displayName && displayName !== 'Khách hàng') ? displayName : (displayName || null),
          zaloName: (displayName && displayName !== 'Khách hàng') ? displayName : null,
          avatarUrl: avatarUrl || null,
          contactType: 'customer',
          assignedUserId: user.role === 'member' ? user.id : null,
        },
      });
    } else if (contact) {
      // Update contact avatar / zaloUid / zaloName if missing
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          ...(uid && !contact.zaloUid ? { zaloUid: uid } : {}),
          ...(avatarUrl && !contact.avatarUrl ? { avatarUrl } : {}),
          ...(phone && !contact.phone ? { phone: phone.trim() } : {}),
          ...(displayName && displayName !== 'Khách hàng' && (!contact.zaloName || contact.zaloName === 'Khách hàng') ? { zaloName: displayName } : {}),
          ...(displayName && displayName !== 'Khách hàng' && (!contact.fullName || contact.fullName === 'Khách hàng' || contact.fullName === 'Unknown') ? { fullName: displayName } : {}),
        },
      }).catch(() => {});
    }

    // 2. Find or create conversation
    let conv = await prisma.conversation.findFirst({
      where: {
        orgId: user.orgId,
        OR: [
          ...(uid ? [{ externalThreadId: uid }] : []),
          ...(contact ? [{ contactId: contact.id }] : []),
        ],
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    if (!conv && contact && uid) {
      conv = await prisma.conversation.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          zaloAccountId: targetAccountId,
          contactId: contact.id,
          threadType: 'user',
          externalThreadId: uid,
          lastMessageAt: new Date(),
          unreadCount: 0,
          isReplied: true,
        },
      });
    }

    if (!conv) {
      return reply.status(404).send({ error: 'Khách hàng này chưa có cuộc trò chuyện và không tìm thấy UID Zalo để tạo mới.' });
    }

    return {
      conversationId: conv.id,
      contactId: contact?.id || null,
      displayName: contact?.fullName,
      avatarUrl: contact?.avatarUrl,
    };
  });
}
