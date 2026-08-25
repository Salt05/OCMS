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
      if (assignedUserId) where.assignedUserId = assignedUserId;
      if (contactType) where.contactType = contactType;
      
      if (tags) {
        const tagList = tags.split(',');
        where.tags = { array_contains: tagList };
      }

      if (search) {
        where.OR = [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
          { customerId: { contains: search, mode: 'insensitive' } },
        ];
      }
      
      // Members cannot see 'other' contacts
      if (user.role === 'member') {
        if (!where.contactType) {
          where.contactType = { not: 'other' };
        } else if (where.contactType === 'other') {
          // Member trying to filter by 'other' which they can't see
          where.contactType = 'invalid_role_access'; 
        }
      }

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      const [contacts, total] = await Promise.all([
        prisma.contact.findMany({
          where,
          include: {
            assignedUser: { select: { id: true, fullName: true, email: true } },
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

  // ── GET /api/v1/contacts/pipeline — kanban grouped by generic status ──────
  app.get('/api/v1/contacts/pipeline', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const orgId = user.orgId;

      const pipeline = await prisma.contact.groupBy({
        by: ['status'],
        where: { orgId, status: { not: null } },
        _count: true,
      });

      // Fetch contacts per status for kanban cards (limit 20 per column)
      const statuses = ['new', 'contacted', 'interested', 'converted', 'lost'];
      const contactsByStatus: Record<string, any[]> = {};

      await Promise.all(
        statuses.map(async (st) => {
          const where: any = { orgId, status: st ?? null };
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
          assignedUserId: body.assignedUserId,
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

      const existing = await prisma.contact.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

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
        assignedUserId: body.assignedUserId,
        notes: body.notes,
        tags: body.tags,
        metadata: body.metadata,
      };
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

      const existing = await prisma.contact.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

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
