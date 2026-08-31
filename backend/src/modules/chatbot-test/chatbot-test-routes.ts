/**
 * chatbot-test-routes.ts — Test Environment & AI Training Lab API.
 * Allows all staff members to simulate customer conversations, observe AI reasoning,
 * test tool calling (Odoo/Directus), and evaluate conversion/safety guardrails.
 * All test sessions use the REAL chatbot engine without mocking.
 */
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { chatbotService } from '../chatbot/chatbot-service.js';
import { logger } from '../../shared/utils/logger.js';
import { randomUUID } from 'node:crypto';

export const chatbotTestRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // All test routes require authenticated user (available for all staff)
  app.addHook('preHandler', authMiddleware);

  // ── 1. List conversations (Test sandbox + Real Zalo) ──────────────────────
  app.get('/api/v1/chatbot-test/conversations', async (req: any, reply) => {
    try {
      const orgId = req.user.orgId;
      const { filter = 'test', search = '' } = req.query as any;

      const where: any = { orgId };

      // Filter: 'test' (default) = test sessions, 'real' = Zalo chats, 'all' = both
      if (filter === 'test') {
        where.externalThreadId = { startsWith: 'test_' };
      } else if (filter === 'real') {
        where.NOT = { externalThreadId: { startsWith: 'test_' } };
      }

      if (search) {
        where.contact = {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { zaloName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ],
        };
      }

      const conversations = await prisma.conversation.findMany({
        where,
        include: {
          contact: {
            select: {
              id: true,
              fullName: true,
              zaloName: true,
              zaloUid: true,
              phone: true,
              status: true,
              avatarUrl: true,
              metadata: true,
            },
          },
          zaloAccount: {
            select: { id: true, displayName: true, status: true },
          },
          aiState: true,
          messages: {
            take: 1,
            orderBy: { sentAt: 'desc' },
            select: {
              content: true,
              contentType: true,
              senderType: true,
              sentAt: true,
              isAi: true,
            },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 100,
      });

      const annotated = conversations.map((c) => ({
        ...c,
        isTest: c.externalThreadId?.startsWith('test_') || false,
      }));

      return reply.send({ conversations: annotated });
    } catch (err: any) {
      logger.error('[chatbot-test] List conversations error:', err.message);
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── 2. Create new Test Session / Persona ─────────────────────────────────
  app.post('/api/v1/chatbot-test/conversations', async (req: any, reply) => {
    try {
      const orgId = req.user.orgId;
      const {
        contactName = 'Khách Hàng Thử Nghiệm',
        phone,
        petType = 'dog',
        breed,
        ageMonths,
        allergies = [],
        personaDescription,
        existingContactId,
      } = req.body || {};

      // Find any Zalo account in the org (fallback or connected) to satisfy schema relation
      let zaloAccount = await prisma.zaloAccount.findFirst({
        where: { orgId, status: 'connected' },
        select: { id: true, displayName: true },
      });

      if (!zaloAccount) {
        zaloAccount = await prisma.zaloAccount.findFirst({
          where: { orgId },
          select: { id: true, displayName: true },
        });
      }

      if (!zaloAccount) {
        return reply.status(400).send({
          error: 'Cần có ít nhất 1 hồ sơ Zalo Account trong tổ chức để khởi tạo phiên test.',
        });
      }

      let contactId: string;

      if (existingContactId) {
        const existing = await prisma.contact.findFirst({
          where: { id: existingContactId, orgId },
          select: { id: true },
        });
        if (!existing) {
          return reply.status(404).send({ error: 'Không tìm thấy khách hàng được chỉ định' });
        }
        contactId = existing.id;
      } else {
        const testUid = `test_${randomUUID().slice(0, 8)}`;
        
        // Fetch or default Odoo Profile 17871
        const odooProf = await prisma.customerProfile.findFirst({
          where: { orgId, odooPartnerId: 17871 },
        });

        const testContact = await prisma.contact.create({
          data: {
            id: randomUUID(),
            orgId,
            zaloUid: testUid,
            fullName: odooProf?.name || contactName || 'Phạm Minh Phát',
            zaloName: odooProf?.name || contactName || 'Phạm Minh Phát',
            phone: odooProf?.phone || phone || '0355785209',
            email: odooProf?.email || 'pminhphathi@gmail.com',
            address: odooProf?.fullAddress || 'Rung Sen, My Hanh Bac, HCM - Q10',
            zone: odooProf?.zone || 'HCM - Q10',
            customerId: '17871',
            salesperson: odooProf?.salesperson || 'Võ Tấn Dũng',
            contactType: 'customer',
            source: 'test_lab',
            assignedUserId: req.user.id,
            metadata: {
              isTestContact: true,
              odooPartnerId: 17871,
              salesperson: 'Võ Tấn Dũng',
              personaDescription: personaDescription || 'Khách hàng Odoo 17871 - Phạm Minh Phát',
              initialPetInfo: { petType, breed, ageMonths, allergies },
            },
          },
        });
        contactId = testContact.id;
      }

      const testThreadId = `test_${randomUUID().slice(0, 12)}`;
      const conversation = await prisma.conversation.create({
        data: {
          id: randomUUID(),
          orgId,
          zaloAccountId: zaloAccount.id,
          contactId,
          threadType: 'user',
          externalThreadId: testThreadId,
          lastMessageAt: new Date(),
          unreadCount: 0,
          isReplied: false,
          aiActive: true, // Always active for test sandbox
          currentState: 'NEW',
        },
        include: {
          contact: true,
          zaloAccount: { select: { id: true, displayName: true } },
        },
      });

      // Initialize clean ConversationAiState
      await prisma.conversationAiState.create({
        data: {
          id: randomUUID(),
          orgId,
          conversationId: conversation.id,
          petInfo: {},
          customerSegment: 'wholesale',
          draftOrder: {},
          contextSummary: personaDescription || 'Khách hàng Odoo ID 17871: Phạm Minh Phát',
        },
      });

      logger.info(`[chatbot-test] Created test session ${conversation.id} (${testThreadId}) by user ${req.user.email}`);

      return reply.status(201).send({
        conversation: { ...conversation, isTest: true },
      });
    } catch (err: any) {
      logger.error('[chatbot-test] Create conversation error:', err.message);
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── 3. Simulate Inbound Customer Message (Triggers Real AI Engine) ────────
  app.post('/api/v1/chatbot-test/conversations/:id/simulate', async (req: any, reply) => {
    try {
      const orgId = req.user.orgId;
      const { id } = req.params;
      const { content, senderName } = req.body || {};

      if (!content?.trim()) {
        return reply.status(400).send({ error: 'Nội dung tin nhắn không được để trống' });
      }

      const conversation = await prisma.conversation.findFirst({
        where: { id, orgId },
        include: {
          contact: { select: { id: true, fullName: true, zaloUid: true } },
          zaloAccount: { select: { id: true } },
        },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Không tìm thấy cuộc hội thoại' });
      }

      // Persist customer simulated message into database
      const message = await prisma.message.create({
        data: {
          id: randomUUID(),
          conversationId: conversation.id,
          zaloMsgId: null,
          senderType: 'contact',
          senderUid: conversation.contact?.zaloUid || 'test_customer',
          senderName: senderName || conversation.contact?.fullName || 'Khách Hàng',
          content: content.trim(),
          contentType: 'text',
          attachments: [],
          isNote: false,
          isAi: false,
          sentAt: new Date(),
        },
      });

      // Update conversation timestamps & unread counters
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: message.sentAt,
          unreadCount: { increment: 1 },
          isReplied: false,
        },
      });

      // Emit realtime event to Socket.IO
      const io = (req.server as any).io;
      io?.emit('chat:message', {
        accountId: conversation.zaloAccountId,
        message,
        conversationId: conversation.id,
      });

      // Asynchronously trigger REAL AI Chatbot Pipeline
      chatbotService
        .processIncomingMessage(
          conversation.id,
          content.trim(),
          orgId,
          conversation.zaloAccountId!,
          conversation.contactId || undefined,
        )
        .catch((e) => {
          logger.error('[chatbot-test] AI pipeline error:', e.message);
        });

      return reply.send({
        success: true,
        message,
        note: 'Tin nhắn đã lưu DB và gửi tới Chatbot Engine. Phản hồi AI sẽ được phát qua Socket.IO realtime.',
      });
    } catch (err: any) {
      logger.error('[chatbot-test] Simulate message error:', err.message);
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── 4. Get Conversation Messages ─────────────────────────────────────────
  app.get('/api/v1/chatbot-test/conversations/:id/messages', async (req: any, reply) => {
    try {
      const orgId = req.user.orgId;
      const { id } = req.params;
      const { limit = '100', before = '' } = req.query as any;

      const conversation = await prisma.conversation.findFirst({
        where: { id, orgId },
        select: { id: true },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Không tìm thấy cuộc hội thoại' });
      }

      const messageWhere: any = { conversationId: id };
      if (before) {
        messageWhere.sentAt = { lt: new Date(before) };
      }

      const [messages, total] = await Promise.all([
        prisma.message.findMany({
          where: messageWhere,
          orderBy: { sentAt: 'desc' },
          take: parseInt(limit),
          include: {
            replyTo: {
              select: {
                id: true,
                senderName: true,
                content: true,
                contentType: true,
                isNote: true,
              },
            },
          },
        }),
        prisma.message.count({ where: messageWhere }),
      ]);

      return reply.send({
        messages: messages.reverse(),
        total,
      });
    } catch (err: any) {
      logger.error('[chatbot-test] Get messages error:', err.message);
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── 5. Get Deep Debug & AI Brain Observability ────────────────────────────
  app.get('/api/v1/chatbot-test/conversations/:id/debug', async (req: any, reply) => {
    try {
      const orgId = req.user.orgId;
      const { id } = req.params;

      const conversation = await prisma.conversation.findFirst({
        where: { id, orgId },
        include: {
          aiState: true,
          contact: true,
          zaloAccount: {
            select: { id: true, displayName: true, aiAutoReply: true },
          },
        },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Không tìm thấy cuộc hội thoại' });
      }

      // Fetch AI audit logs (last 30 turns)
      const auditLogs = await prisma.aiAuditLog.findMany({
        where: { conversationId: id, orgId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });

      // Aggregated message counts
      const messageStats = await prisma.message.groupBy({
        by: ['senderType', 'isAi'],
        where: { conversationId: id },
        _count: true,
      });

      return reply.send({
        conversation: {
          id: conversation.id,
          externalThreadId: conversation.externalThreadId,
          threadType: conversation.threadType,
          isTest: conversation.externalThreadId?.startsWith('test_') || false,
          aiActive: conversation.aiActive,
          aiPaused: conversation.aiPaused,
          pausedUntil: conversation.pausedUntil,
          handoffReason: conversation.handoffReason,
          currentState: conversation.currentState,
          lastMessageAt: conversation.lastMessageAt,
          unreadCount: conversation.unreadCount,
        },
        contact: conversation.contact,
        zaloAccount: conversation.zaloAccount,
        aiState: conversation.aiState,
        auditLogs,
        messageStats,
      });
    } catch (err: any) {
      logger.error('[chatbot-test] Get debug info error:', err.message);
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── 6. Reply as Human Staff (Test Human Takeover / Handoff) ───────────────
  app.post('/api/v1/chatbot-test/conversations/:id/reply', async (req: any, reply) => {
    try {
      const orgId = req.user.orgId;
      const { id } = req.params;
      const { content } = req.body || {};

      if (!content?.trim()) {
        return reply.status(400).send({ error: 'Nội dung phản hồi không được để trống' });
      }

      const conversation = await prisma.conversation.findFirst({
        where: { id, orgId },
        select: { id: true, externalThreadId: true, zaloAccountId: true },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Không tìm thấy cuộc hội thoại' });
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { fullName: true },
      });

      const message = await prisma.message.create({
        data: {
          id: randomUUID(),
          conversationId: conversation.id,
          zaloMsgId: null,
          senderType: 'self',
          senderUid: req.user.id,
          senderName: dbUser?.fullName || req.user.email,
          content: content.trim(),
          contentType: 'text',
          attachments: [],
          isNote: false,
          isAi: false,
          sentAt: new Date(),
        },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: message.sentAt,
          isReplied: true,
          unreadCount: 0,
        },
      });

      const io = (req.server as any).io;
      io?.emit('chat:message', {
        accountId: conversation.zaloAccountId,
        message,
        conversationId: conversation.id,
      });

      return reply.send({ success: true, message });
    } catch (err: any) {
      logger.error('[chatbot-test] Reply error:', err.message);
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── 7. Reset State / Memory for a Test Conversation ──────────────────────
  app.post('/api/v1/chatbot-test/conversations/:id/reset-state', async (req: any, reply) => {
    try {
      const orgId = req.user.orgId;
      const { id } = req.params;

      const conversation = await prisma.conversation.findFirst({
        where: { id, orgId },
        select: { id: true, externalThreadId: true },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Không tìm thấy cuộc hội thoại' });
      }

      await prisma.conversationAiState.deleteMany({ where: { conversationId: id } });
      await prisma.conversation.update({
        where: { id },
        data: {
          currentState: 'NEW',
          aiPaused: false,
          handoffReason: null,
          pausedUntil: null,
        },
      });

      logger.info(`[chatbot-test] Reset AI state for conversation ${id}`);
      return reply.send({ success: true, message: 'Đã làm mới trạng thái và bộ nhớ AI' });
    } catch (err: any) {
      logger.error('[chatbot-test] Reset state error:', err.message);
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── 7.1 Complete Reset (Wipes all messages and AI Memory for clean re-test) ──
  app.post('/api/v1/chatbot-test/conversations/:id/reset-full', async (req: any, reply) => {
    try {
      const orgId = req.user.orgId;
      const { id } = req.params;

      const conversation = await prisma.conversation.findFirst({
        where: { id, orgId },
        select: { id: true, externalThreadId: true, zaloAccountId: true },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Không tìm thấy cuộc hội thoại' });
      }

      // Delete messages and audit logs
      await prisma.message.deleteMany({ where: { conversationId: id } });
      await prisma.aiAuditLog.deleteMany({ where: { conversationId: id } });
      await prisma.conversationAiState.deleteMany({ where: { conversationId: id } });

      // Initialize fresh ConversationAiState
      await prisma.conversationAiState.create({
        data: {
          id: randomUUID(),
          orgId,
          conversationId: id,
          petInfo: {},
          customerSegment: 'wholesale',
          draftOrder: {},
          contextSummary: 'Khách hàng Odoo ID 17871: Phạm Minh Phát (NV Sale: Võ Tấn Dũng)',
        },
      });

      // Reset conversation status
      await prisma.conversation.update({
        where: { id },
        data: {
          currentState: 'NEW',
          unreadCount: 0,
          isReplied: false,
          aiPaused: false,
          handoffReason: null,
          pausedUntil: null,
          lastMessageAt: new Date(),
        },
      });

      const io = (req.server as any).io;
      io?.emit('chat:message', {
        accountId: conversation.zaloAccountId,
        conversationId: id,
        reset: true,
      });
      io?.emit('chat:state_updated', { conversationId: id, currentState: 'NEW' });
      io?.emit('chat:order_draft_updated', { conversationId: id, draftOrder: null });
      io?.emit('order:updated');

      logger.info(`[chatbot-test] Reset FULL messages and memory for conversation ${id}`);
      return reply.send({ success: true, message: 'Đã xóa toàn bộ tin nhắn và reset bộ nhớ Chatbot thành công!' });
    } catch (err: any) {
      logger.error('[chatbot-test] Reset full error:', err.message);
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── 8. Delete Test Session ───────────────────────────────────────────────
  app.delete('/api/v1/chatbot-test/conversations/:id', async (req: any, reply) => {
    try {
      const orgId = req.user.orgId;
      const { id } = req.params;

      const conversation = await prisma.conversation.findFirst({
        where: { id, orgId },
        select: { id: true, externalThreadId: true, contactId: true },
      });

      if (!conversation) {
        return reply.status(404).send({ error: 'Không tìm thấy cuộc hội thoại' });
      }

      if (!conversation.externalThreadId?.startsWith('test_')) {
        return reply.status(400).send({
          error: 'Chỉ được phép xóa các phiên hội thoại Test. Hội thoại Zalo thực tế được bảo vệ.',
        });
      }

      await prisma.aiAuditLog.deleteMany({ where: { conversationId: id } });
      await prisma.conversationAiState.deleteMany({ where: { conversationId: id } });
      await prisma.message.deleteMany({ where: { conversationId: id } });
      await prisma.conversation.delete({ where: { id } });

      if (conversation.contactId) {
        const contact = await prisma.contact.findUnique({
          where: { id: conversation.contactId },
          select: { zaloUid: true },
        });
        if (contact?.zaloUid?.startsWith('test_')) {
          const count = await prisma.conversation.count({ where: { contactId: conversation.contactId } });
          if (count === 0) {
            await prisma.contact.delete({ where: { id: conversation.contactId } });
          }
        }
      }

      logger.info(`[chatbot-test] Deleted test session ${id}`);
      return reply.send({ success: true });
    } catch (err: any) {
      logger.error('[chatbot-test] Delete conversation error:', err.message);
      return reply.status(500).send({ error: err.message });
    }
  });
};
