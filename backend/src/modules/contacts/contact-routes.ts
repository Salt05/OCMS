/**
 * contact-routes.ts — REST API for CRM contact management.
 * Supports list, detail, create, update, delete, pipeline view, and tag updates.
 * All routes require JWT auth and are scoped to user's org.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { ensureTagsExist, cleanupUnusedTags } from '../tags/tag-routes.js';

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

  // ── GET /api/v1/contacts/:id — detail with appointments + conversation count
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

      return contact;
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
          assignedUser: { select: { id: true, fullName: true, email: true } },
          appointments: { orderBy: { appointmentDate: 'desc' }, take: 10 },
          _count: { select: { conversations: true } },
        },
      });

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
}
