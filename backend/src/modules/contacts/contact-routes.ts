/**
 * contact-routes.ts — REST API for CRM contact management.
 * Supports list, detail, create, update, delete, pipeline view, and tag updates.
 * All routes require JWT auth and are scoped to user's org.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { ensureTagsExist, cleanupUnusedTags } from '../tags/tag-routes.js';
import { mergeContacts } from './contact-merge-service.js';
import { odooService } from '../odoo/odoo-service.js';
import { zaloPool } from '../zalo/zalo-pool.js';

type QueryParams = Record<string, string>;

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/contacts — list with filters and pagination ───────────────
  app.get('/api/v1/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const {
        page = '1',
        limit = '50',
        search = '',
        source = '',
        status = '',
        assignedUserId = '',
        tags = '',
        contactType = '',
      } = request.query as QueryParams;

      const where: any = { orgId: user.orgId };
      if (source) where.source = source;
      if (status) where.status = status;
      if (contactType) where.contactType = contactType;

      // Staff (member) CAN ONLY see contacts assigned directly to them by Admin
      if (user.role === 'member') {
        where.assignedUserId = user.id;
        // Members cannot see 'other' contacts
        if (!where.contactType) {
          where.contactType = { not: 'other' };
        } else if (where.contactType === 'other') {
          where.contactType = 'invalid_role_access';
        }
      } else {
        // Admin / Owner can filter by any staff or unassigned
        if (assignedUserId === 'unassigned') {
          where.assignedUserId = null;
        } else if (assignedUserId) {
          where.assignedUserId = assignedUserId;
        }
      }
      
      if (tags) {
        const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
        if (tagList.length === 1) {
          where.tags = { array_contains: tagList[0] };
        } else if (tagList.length > 1) {
          where.AND = tagList.map((tag) => ({ tags: { array_contains: tag } }));
        }
      }

      if (search) {
        where.OR = [
          { fullName: { contains: search, mode: 'insensitive' } },
          { zaloName: { contains: search, mode: 'insensitive' } },
          { salutation: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
          { customerId: { contains: search, mode: 'insensitive' } },
        ];
      }

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      const [contacts, total] = await Promise.all([
        prisma.contact.findMany({
          where,
          include: {
            assignedUser: { select: { id: true, fullName: true, email: true } },
            conversations: {
              select: { id: true, aiActive: true, aiPaused: true, pausedUntil: true, currentState: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            _count: { select: { conversations: true, appointments: true } },
          },
          orderBy: { updatedAt: 'desc' },
          ...(limitNum > 0 ? { skip: (pageNum - 1) * limitNum, take: limitNum } : {}),
        }),
        prisma.contact.count({ where }),
      ]);

      return { contacts, total, page: pageNum, limit: limitNum };
    } catch (err) {
      logger.error('[contacts] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contacts' });
    }
  });

  // ── POST /api/v1/contacts/:id/toggle-ai — toggle AI for all conversations of this contact ──
  app.post('/api/v1/contacts/:id/toggle-ai', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { aiActive } = (request.body as { aiActive?: boolean }) || {};

      const contactWhere: any = { id, orgId: user.orgId };
      if (user.role === 'member') {
        contactWhere.assignedUserId = user.id;
      }

      const contact = await prisma.contact.findFirst({
        where: contactWhere,
      });

      if (!contact) {
        return reply.status(403).send({ error: 'Không tìm thấy hoặc bạn không có quyền thao tác với khách hàng này' });
      }

      if (aiActive && contact.contactType !== 'customer') {
        return reply.status(400).send({
          error: 'Chỉ có thể bật AI cho liên hệ thuộc loại Khách hàng (customer).',
        });
      }

      await prisma.conversation.updateMany({
        where: { contactId: id, orgId: user.orgId },
        data: {
          aiActive: typeof aiActive === 'boolean' ? aiActive : false,
          ...(aiActive ? {} : { aiPaused: false, pausedUntil: null }),
        },
      });

      return reply.send({ success: true, aiActive });
    } catch (err: any) {
      logger.error('[contacts] Toggle AI error:', err);
      return reply.status(500).send({ error: 'Failed to toggle AI for contact' });
    }
  });

  // ── GET /api/v1/contacts/pipeline — kanban grouped by generic status ──────
  app.get('/api/v1/contacts/pipeline', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const orgId = user.orgId;

      const groupWhere: any = { orgId, status: { not: null } };
      if (user.role === 'member') {
        groupWhere.assignedUserId = user.id;
        groupWhere.contactType = { not: 'other' };
      }

      const pipeline = await prisma.contact.groupBy({
        by: ['status'],
        where: groupWhere,
        _count: true,
      });

      // Fetch contacts per status for kanban cards (limit 20 per column)
      const statuses = ['new', 'contacted', 'interested', 'converted', 'lost'];
      const contactsByStatus: Record<string, any[]> = {};

      await Promise.all(
        statuses.map(async (st) => {
          const where: any = { orgId, status: st ?? null };
          if (user.role === 'member') {
            where.assignedUserId = user.id;
            where.contactType = { not: 'other' };
          }
          const contacts = await prisma.contact.findMany({
            where,
            select: {
              id: true,
              fullName: true,
              customerId: true,
              phone: true,
              email: true,
              avatarUrl: true,
              status: true,
              assignedUser: { select: { id: true, fullName: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 20,
          });
          contactsByStatus[st ?? 'unknown'] = contacts;
        }),
      );

      const result = pipeline.map((g) => ({
        status: g.status ?? 'unknown',
        count: g._count,
        contacts: contactsByStatus[g.status ?? 'unknown'] ?? [],
      }));

      return { pipeline: result };
    } catch (err) {
      logger.error('[contacts] Pipeline error:', err);
      return reply.status(500).send({ error: 'Failed to fetch pipeline' });
    }
  });

  // ── GET /api/v1/contacts/:id — detail with appointments + conversation count + CRM stats ──
  app.get('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const contact = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId },
        include: {
          assignedUser: { select: { id: true, fullName: true, email: true } },
          appointments: { orderBy: { appointmentDate: 'desc' }, take: 10 },
          _count: { select: { conversations: true } },
        },
      });

      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      // Member can only view contact if assigned to them
      if (user.role === 'member' && contact.assignedUserId !== user.id) {
        return reply.status(403).send({ error: 'Bạn không có quyền xem thông tin khách hàng này' });
      }

      let totalRevenue = 0;
      let totalOrders = 0;
      let lastOrderDate: string | Date | null = null;
      let customerProfile: any = null;

      const numericOdooId = contact.customerId ? parseInt(contact.customerId, 10) : NaN;
      if (!isNaN(numericOdooId) && numericOdooId > 0) {
        customerProfile = await prisma.customerProfile.findFirst({
          where: { orgId: user.orgId, odooPartnerId: numericOdooId },
        });

        if (customerProfile) {
          totalRevenue = customerProfile.totalRevenue || 0;
          totalOrders = customerProfile.totalOrders || 0;
          lastOrderDate = customerProfile.lastOrderDate || null;
        }

        // Aggregate from orderHistory in database if exists
        const odooOrdersAgg = await prisma.orderHistory.aggregate({
          where: { orgId: user.orgId, odooPartnerId: numericOdooId, state: { not: 'cancel' } },
          _sum: { amountTotal: true },
          _count: { id: true },
          _max: { dateOrder: true },
        });

        if (odooOrdersAgg && odooOrdersAgg._count.id > 0) {
          totalRevenue = odooOrdersAgg._sum.amountTotal || 0;
          totalOrders = odooOrdersAgg._count.id || 0;
          lastOrderDate = odooOrdersAgg._max.dateOrder || lastOrderDate;
        } else if (totalOrders === 0) {
          // If no local stats yet, query live from Odoo
          try {
            const odooStats = await odooService.getCustomerOrderStats(numericOdooId);
            if (odooStats.totalOrders > 0) {
              totalRevenue = odooStats.totalRevenue;
              totalOrders = odooStats.totalOrders;
              lastOrderDate = odooStats.lastOrderDate;
            }
          } catch (e) {
            // Ignore odoo query error
          }
        }
      }

      // Check internal OCMS orders
      const internalOrdersAgg = await prisma.order.aggregate({
        where: { orgId: user.orgId, contactId: id, status: { notIn: ['cancelled', 'cancel'] } },
        _sum: { totalAmount: true },
        _count: { id: true },
        _max: { createdAt: true },
      });

      if (internalOrdersAgg && internalOrdersAgg._count.id > 0) {
        if (totalOrders === 0) {
          totalRevenue = internalOrdersAgg._sum.totalAmount || 0;
          totalOrders = internalOrdersAgg._count.id || 0;
          lastOrderDate = internalOrdersAgg._max.createdAt || lastOrderDate;
        }
      }

      return {
        ...contact,
        customer: {
          totalRevenue,
          totalOrders,
          lastOrderDate,
          customerProfile,
        },
      };
    } catch (err) {
      logger.error('[contacts] Detail error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contact' });
    }
  });

  // ── POST /api/v1/contacts — create new contact ────────────────────────────
  app.post('/api/v1/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = request.body as Record<string, any>;

      if (Array.isArray(body.tags) && body.tags.length > 0) {
        await ensureTagsExist(user.orgId, body.tags);
      }

      // If created by member, automatically assign to themselves if not specified
      const assignedUserId = user.role === 'member' ? user.id : body.assignedUserId;

      const contact = await prisma.contact.create({
        data: {
          orgId: user.orgId,
          fullName: body.fullName,
          salutation: body.salutation !== undefined ? (body.salutation || null) : null,
          zaloName: body.zaloName,
          phone: body.phone,
          email: body.email,
          zaloUid: body.zaloUid,
          avatarUrl: body.avatarUrl,
          source: body.source,
          sourceDate: body.sourceDate ? new Date(body.sourceDate) : undefined,
          status: body.status ?? 'new',
          customerId: body.customerId,
          contactType: body.contactType !== undefined ? String(body.contactType) : 'other',
          address: body.address,
          zone: body.zone,
          salesperson: body.salesperson,
          assignedUserId: assignedUserId || null,
          notes: body.notes,
          tags: body.tags ?? [],
          metadata: body.metadata ?? {},
        },
      });

      return reply.status(201).send(contact);
    } catch (err) {
      logger.error('[contacts] Create error:', err);
      return reply.status(500).send({ error: 'Failed to create contact' });
    }
  });

  // ── PUT /api/v1/contacts/:id — update CRM fields ─────────────────────────
  app.put('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;

      const existing = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true, assignedUserId: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

      // Permission check for member
      if (user.role === 'member') {
        if (existing.assignedUserId !== user.id) {
          return reply.status(403).send({ error: 'Bạn không có quyền sửa thông tin khách hàng này' });
        }
        if (body.assignedUserId !== undefined && body.assignedUserId !== user.id) {
          return reply.status(403).send({ error: 'Chỉ quản trị viên mới có quyền chuyển giao khách hàng cho nhân viên khác' });
        }
      }

      if (Array.isArray(body.tags) && body.tags.length > 0) {
        await ensureTagsExist(user.orgId, body.tags);
      }

      const updateData: any = {
        fullName: body.fullName,
        customerId: body.customerId,
        phone: body.phone,
        email: body.email,
        avatarUrl: body.avatarUrl,
        source: body.source,
        sourceDate: body.sourceDate ? new Date(body.sourceDate) : undefined,
        status: body.status,
        address: body.address,
        zone: body.zone,
        salesperson: body.salesperson,
        notes: body.notes,
        tags: body.tags,
        metadata: body.metadata,
      };

      if (body.salutation !== undefined) {
        updateData.salutation = body.salutation ? String(body.salutation).trim() : null;
      }

      // Only allow updating assignedUserId if admin or assigning to self
      if (['owner', 'admin'].includes(user.role)) {
        updateData.assignedUserId = body.assignedUserId;
      }

      if (body.zaloName !== undefined) {
        updateData.zaloName = body.zaloName;
      }
      if (body.contactType !== undefined) {
        updateData.contactType = String(body.contactType);
      }
      if (body.firstContactDate !== undefined) {
        updateData.firstContactDate = body.firstContactDate ? new Date(body.firstContactDate) : null;
      }

      const updated = await prisma.contact.update({
        where: { id },
        data: updateData,
        include: {
          assignedUser: { select: { id: true, fullName: true, email: true, odooId: true } },
          appointments: { orderBy: { appointmentDate: 'desc' }, take: 10 },
          _count: { select: { conversations: true } },
        },
      });

      // ── Sync salesperson to Odoo when assignedUserId changes ──
      if (body.assignedUserId !== undefined && updated.customerId) {
        try {
          const partnerId = parseInt(updated.customerId);
          if (!isNaN(partnerId) && partnerId > 0) {
            if (body.assignedUserId) {
              // User assigned: find their Odoo user ID and sync
              const assignedUser = await prisma.user.findUnique({
                where: { id: body.assignedUserId },
                select: { odooId: true, fullName: true },
              });
              if (assignedUser?.odooId) {
                const odooUserId = parseInt(assignedUser.odooId);
                if (!isNaN(odooUserId) && odooUserId > 0) {
                  await odooService.updateCustomer(partnerId, { user_id: odooUserId });
                  // Update local salesperson name
                  await prisma.contact.update({
                    where: { id },
                    data: { salesperson: assignedUser.fullName },
                  });
                  logger.info(`[contacts] Synced salesperson to Odoo: partner #${partnerId} → user #${odooUserId} (${assignedUser.fullName})`);
                }
              }
            } else {
              // NV CSKH was cleared: clear salesperson on Odoo too
              await odooService.updateCustomer(partnerId, { user_id: false as any });
              await prisma.contact.update({
                where: { id },
                data: { salesperson: null },
              });
              logger.info(`[contacts] Cleared salesperson on Odoo for partner #${partnerId}`);
            }
          }
        } catch (err: any) {
          logger.warn(`[contacts] Failed to sync salesperson to Odoo: ${err.message}`);
          // Non-blocking: don't fail the contact update
        }
      }

      // Clean up any tags with usage count = 0
      await cleanupUnusedTags(user.orgId);

      return updated;
    } catch (err) {
      logger.error('[contacts] Update error:', err);
      return reply.status(500).send({ error: 'Failed to update contact' });
    }
  });

  // ── PUT /api/v1/contacts/:id/tags — update tags only ─────────────────────
  app.put('/api/v1/contacts/:id/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { tags } = request.body as { tags: string[] };

      if (!Array.isArray(tags)) return reply.status(400).send({ error: 'tags must be an array' });

      const existing = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true, assignedUserId: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

      if (user.role === 'member' && existing.assignedUserId !== user.id) {
        return reply.status(403).send({ error: 'Bạn không có quyền sửa thông tin khách hàng này' });
      }

      await ensureTagsExist(user.orgId, tags);

      const updated = await prisma.contact.update({ where: { id }, data: { tags } });

      // Clean up any tags with usage count = 0
      await cleanupUnusedTags(user.orgId);

      return updated;
    } catch (err) {
      logger.error('[contacts] Update tags error:', err);
      return reply.status(500).send({ error: 'Failed to update tags' });
    }
  });

  // ── DELETE /api/v1/contacts/:id ───────────────────────────────────────────
  app.delete('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      if (!['owner', 'admin'].includes(user.role)) {
        return reply.status(403).send({ error: 'Chỉ quản trị viên mới có quyền xóa khách hàng' });
      }

      const existing = await prisma.contact.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

      await prisma.contact.delete({ where: { id } });

      // Clean up any tags with usage count = 0
      await cleanupUnusedTags(user.orgId);

      return { success: true };
    } catch (err) {
      logger.error('[contacts] Delete error:', err);
      return reply.status(500).send({ error: 'Failed to delete contact' });
    }
  });

  // ── POST /api/v1/contacts/merge — Merge multiple contacts into one ────────
  app.post('/api/v1/contacts/merge', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      if (!['owner', 'admin'].includes(user.role)) {
        return reply.status(403).send({ error: 'Chỉ quản trị viên mới có quyền gộp khách hàng' });
      }

      const body = request.body as { primaryContactId: string; sourceContactIds: string[] };
      if (!body.primaryContactId || !Array.isArray(body.sourceContactIds) || body.sourceContactIds.length === 0) {
        return reply.status(400).send({ error: 'Vui lòng cung cấp primaryContactId và danh sách sourceContactIds' });
      }

      const merged = await mergeContacts(user.orgId, body.primaryContactId, body.sourceContactIds);
      return { success: true, contact: merged };
    } catch (err) {
      logger.error('[contacts] Merge error:', err);
      return reply.status(500).send({ error: 'Lỗi gộp khách hàng: ' + String(err) });
    }
  });

  // ── POST /api/v1/contacts/bulk-update — Bulk update non-unique fields ────────
  app.post<{
    Body: {
      contactIds: string[];
      data: {
        contactType?: 'customer' | 'employee' | 'other';
        salutation?: string | null;
        address?: string | null;
        zone?: string | null;
        assignedUserId?: string | null;
        status?: string | null;
        source?: string | null;
        tags?: string[];
        notes?: string | null;
      };
    };
  }>('/api/v1/contacts/bulk-update', async (request, reply) => {
    try {
      const user = request.user!;
      const { contactIds, data } = request.body || {};

      if (!Array.isArray(contactIds) || contactIds.length === 0) {
        return reply.status(400).send({ error: 'Danh sách contactIds không hợp lệ' });
      }

      if (!data || typeof data !== 'object') {
        return reply.status(400).send({ error: 'Dữ liệu cập nhật không hợp lệ' });
      }

      const where: any = {
        id: { in: contactIds },
        orgId: user.orgId,
      };

      // Staff (member) can only update contacts assigned to them
      if (user.role === 'member') {
        where.assignedUserId = user.id;
      }

      const updateData: any = {};

      if (data.contactType !== undefined) {
        updateData.contactType = data.contactType;
      }
      if (data.salutation !== undefined) {
        updateData.salutation = data.salutation ? data.salutation.trim() : null;
      }
      if (data.address !== undefined) {
        updateData.address = data.address ? data.address.trim() : null;
      }
      if (data.zone !== undefined) {
        updateData.zone = data.zone ? data.zone.trim() : null;
      }
      if (data.status !== undefined) {
        updateData.status = data.status || 'new';
      }
      if (data.source !== undefined) {
        updateData.source = data.source ? data.source.trim() : null;
      }
      if (data.notes !== undefined) {
        updateData.notes = data.notes ? data.notes.trim() : null;
      }

      // Member cannot reassign staff
      if (data.assignedUserId !== undefined && ['owner', 'admin'].includes(user.role)) {
        updateData.assignedUserId = data.assignedUserId || null;
      }

      if (Array.isArray(data.tags)) {
        await ensureTagsExist(user.orgId, data.tags);
        updateData.tags = data.tags;
      }

      const result = await prisma.contact.updateMany({
        where,
        data: updateData,
      });

      if (Array.isArray(data.tags)) {
        await cleanupUnusedTags(user.orgId);
      }

      return {
        success: true,
        count: result.count,
        message: `Đã cập nhật thành công ${result.count} khách hàng`,
      };
    } catch (err: any) {
      logger.error('[contacts] Bulk update error:', err);
      return reply.status(500).send({ error: 'Lỗi cập nhật hàng loạt: ' + err.message });
    }
  });

  // ── POST /api/v1/contacts/bulk-open-chat — Activate/create conversations for multiple contacts ──
  app.post<{
    Body: {
      contactIds: string[];
    };
  }>('/api/v1/contacts/bulk-open-chat', async (request, reply) => {
    try {
      const user = request.user!;
      const { contactIds } = request.body || {};

      if (!Array.isArray(contactIds) || contactIds.length === 0) {
        return reply.status(400).send({ error: 'Vui lòng cung cấp danh sách contactIds' });
      }

      // 1. Find connected or primary Zalo account
      const accs = await prisma.zaloAccount.findMany({
        where: { orgId: user.orgId },
        select: { id: true },
      });
      const targetAccountId = accs.find((a) => zaloPool.getStatus(a.id) === 'connected')?.id || accs[0]?.id;

      if (!targetAccountId) {
        return reply.status(400).send({ error: 'Chưa có tài khoản Zalo nào được kết nối trong hệ thống' });
      }

      // 2. Fetch contacts
      const contacts = await prisma.contact.findMany({
        where: {
          id: { in: contactIds },
          orgId: user.orgId,
        },
        include: {
          conversations: {
            select: { id: true, externalThreadId: true },
          },
        },
      });

      let activatedCount = 0;
      const conversationIds: string[] = [];

      for (const contact of contacts) {
        // Ensure contactType is not 'other' so /chat displays them
        if (contact.contactType === 'other') {
          await prisma.contact.update({
            where: { id: contact.id },
            data: { contactType: 'customer' },
          });
        }

        // If contact already has a conversation, touch lastMessageAt to bring it to top
        if (contact.conversations && contact.conversations.length > 0) {
          const existingConv = contact.conversations[0];
          await prisma.conversation.update({
            where: { id: existingConv.id },
            data: { lastMessageAt: new Date() },
          });
          conversationIds.push(existingConv.id);
          activatedCount++;
          continue;
        }

        // Contact doesn't have a conversation yet. Resolve UID:
        let uid = contact.zaloUid || '';
        if (!uid && contact.phone) {
          const cleanPhone = contact.phone.replace(/[\s.-]/g, '').trim();
          let formattedPhone = cleanPhone;
          if (formattedPhone.startsWith('+84')) formattedPhone = '84' + formattedPhone.slice(3);
          else if (formattedPhone.startsWith('0')) formattedPhone = '84' + formattedPhone.slice(1);

          const api = zaloPool.getApi(targetAccountId);
          if (api?.findUser) {
            try {
              const resFind = await api.findUser(formattedPhone);
              if (resFind?.uid) {
                uid = String(resFind.uid);
                await prisma.contact.update({
                  where: { id: contact.id },
                  data: { zaloUid: uid },
                });
              }
            } catch {}
          }
        }

        // Fallback to phone or contact.id if UID is not known yet
        const threadId = uid || contact.phone || `contact_${contact.id}`;

        const newConv = await prisma.conversation.create({
          data: {
            id: randomUUID(),
            orgId: user.orgId,
            zaloAccountId: targetAccountId,
            contactId: contact.id,
            threadType: 'user',
            externalThreadId: threadId,
            lastMessageAt: new Date(),
            unreadCount: 0,
            isReplied: true,
          },
        });

        conversationIds.push(newConv.id);
        activatedCount++;
      }

      return {
        success: true,
        count: activatedCount,
        conversationIds,
        message: `Đã kích hoạt hiển thị ${activatedCount} khách hàng trên màn hình Chat!`,
      };
    } catch (err: any) {
      logger.error('[contacts] Bulk open chat error:', err);
      return reply.status(500).send({ error: 'Lỗi kích hoạt cuộc trò chuyện: ' + err.message });
    }
  });
}

