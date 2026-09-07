/**
 * Chatbot Fastify Routes Plugin.
 * Endpoints for Conversation AI state, Pause/Resume, KnowledgeBase CRUD, and AI Analytics.
 */
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { chatbotStateMachine } from './chatbot-state-machine.js';
import { chatbotService } from './chatbot-service.js';
import { knowledgeService } from './knowledge-service.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloPool } from '../zalo/zalo-pool.js';

export const chatbotRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', authMiddleware);
  // 1. Get AI State for a Conversation
  app.get('/conversations/:id/state', async (req: any, reply) => {
    try {
      const { id } = req.params;
      const conv = await prisma.conversation.findUnique({
        where: { id },
        include: {
          aiState: true,
          zaloAccount: {
            select: { id: true, displayName: true, aiAutoReply: true, aiWorkingHoursOnly: true },
          },
        },
      });

      if (!conv) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      return reply.send({
        conversationId: conv.id,
        aiActive: conv.aiActive,
        aiPaused: conv.aiPaused,
        pausedUntil: conv.pausedUntil,
        handoffReason: conv.handoffReason,
        currentState: conv.currentState,
        zaloAccount: conv.zaloAccount,
        aiState: conv.aiState || null,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 2. Pause AI for a Conversation
  app.post('/conversations/:id/pause', async (req: any, reply) => {
    try {
      const { id } = req.params;
      const { reason = 'Nhân viên tạm dừng AI', durationMinutes = 60 } = req.body || {};
      const updated = await chatbotStateMachine.pauseAi(id, reason, durationMinutes);
      return reply.send({ success: true, conversation: updated });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 3. Resume AI for a Conversation
  app.post('/conversations/:id/resume', async (req: any, reply) => {
    try {
      const { id } = req.params;
      const updated = await chatbotStateMachine.resumeAi(id);
      const orgId = req.user?.orgId || updated.orgId;
      if (orgId) {
        chatbotService.checkAndAutoReplyOnResume(id, orgId).catch(err => {
          logger.warn(`[chatbot-routes] Failed to trigger auto-reply on resume: ${err.message}`);
        });
      }
      return reply.send({ success: true, conversation: updated });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 4. Toggle AI Active for a Conversation
  app.post('/conversations/:id/toggle', async (req: any, reply) => {
    try {
      const { id } = req.params;
      const { aiActive } = req.body || {};

      if (aiActive) {
        const conv = await prisma.conversation.findUnique({
          where: { id },
          include: { contact: true },
        });
        if (conv?.contact && conv.contact.contactType !== 'customer') {
          return reply.status(400).send({
            error: 'AI Auto Chat chỉ áp dụng cho liên hệ thuộc loại Khách hàng (customer). Loại "Nhân viên" và "Khác" không thể bật AI.',
          });
        }
      }

      const updated = await prisma.conversation.update({
        where: { id },
        data: { aiActive: typeof aiActive === 'boolean' ? aiActive : false },
      });

      if (updated.aiActive) {
        const orgId = req.user?.orgId || updated.orgId;
        if (orgId) {
          chatbotService.checkAndAutoReplyOnResume(id, orgId).catch(err => {
            logger.warn(`[chatbot-routes] Failed to trigger auto-reply on toggle active: ${err.message}`);
          });
        }
      }

      return reply.send({ success: true, conversation: updated });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 4.1. Set or Adjust AI Context Boundary
  app.post('/conversations/:id/context-boundary', async (req: any, reply) => {
    try {
      const { id } = req.params;
      const { startMessageId, endMessageId, resetDraft } = req.body || {};

      const existingConv = await prisma.conversation.findUnique({
        where: { id },
      });
      if (!existingConv) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      const updateData: any = {};

      if (startMessageId !== undefined) {
        if (startMessageId === null) {
          updateData.contextStartMsgId = null;
          updateData.contextStartedAt = null;
        } else {
          const startMsg = await prisma.message.findFirst({
            where: {
              conversationId: id,
              OR: [{ id: startMessageId }, { zaloMsgId: startMessageId }],
            },
            select: { id: true, sentAt: true },
          });
          if (!startMsg) {
            return reply.status(400).send({ error: 'Start message not found in this conversation' });
          }
          updateData.contextStartMsgId = startMsg.id;
          updateData.contextStartedAt = startMsg.sentAt;
        }
      }

      if (endMessageId !== undefined) {
        if (endMessageId === null) {
          updateData.contextEndMsgId = null;
          updateData.contextEndedAt = null;
        } else {
          const endMsg = await prisma.message.findFirst({
            where: {
              conversationId: id,
              OR: [{ id: endMessageId }, { zaloMsgId: endMessageId }],
            },
            select: { id: true, sentAt: true },
          });
          if (!endMsg) {
            return reply.status(400).send({ error: 'End message not found in this conversation' });
          }
          updateData.contextEndMsgId = endMsg.id;
          updateData.contextEndedAt = endMsg.sentAt;
        }
      }

      if (resetDraft) {
        updateData.currentState = 'NEW';
      }

      const updated = await prisma.conversation.update({
        where: { id },
        data: updateData,
      });

      if (resetDraft) {
        await chatbotStateMachine.updateSessionState(id, existingConv.orgId, {
          draftOrder: { items: [] },
          pendingSlots: [],
          lastAiQuestion: null,
        }, 'NEW');
      }

      // Emit real-time update
      const uAny = updated as any;
      try {
        zaloPool.getIO()?.emit('chat:context_boundary_updated', {
          conversationId: id,
          contextStartMsgId: uAny.contextStartMsgId,
          contextEndMsgId: uAny.contextEndMsgId,
          contextStartedAt: uAny.contextStartedAt,
          contextEndedAt: uAny.contextEndedAt,
          currentState: uAny.currentState,
          resetDraft: !!resetDraft,
        });
      } catch (e: any) {
        logger.warn(`[chatbot-routes] Socket emit chat:context_boundary_updated failed: ${e.message}`);
      }

      return reply.send({ success: true, conversation: updated });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 5. Register knowledgeRoutes within chatbotRoutes
  await app.register(knowledgeRoutes);

  // 9. AI Analytics & Audit Logs
  app.get('/analytics', async (req: any, reply) => {
    try {
      const orgId = req.user?.orgId || req.query.orgId;
      if (!orgId) return reply.status(400).send({ error: 'orgId is required' });

      const totalMessages = await prisma.aiAuditLog.count({ where: { orgId } });
      const handoffs = await prisma.aiAuditLog.count({ where: { orgId, isHandoff: true } });
      const recentLogs = await prisma.aiAuditLog.findMany({
        where: { orgId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      return reply.send({
        totalAutomatedMessages: totalMessages,
        totalHandoffs: handoffs,
        automationRate: totalMessages > 0 ? `${(((totalMessages - handoffs) / totalMessages) * 100).toFixed(1)}%` : '100%',
        recentLogs,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
};

// KnowledgeBase sub-plugin: supports mounting at /api/v1/knowledge or inside /api/v1/chatbot
export const knowledgeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', authMiddleware);

  const getKnowledge = async (req: any, reply: any) => {
    try {
      const orgId = req.user?.orgId || req.query.orgId;
      if (!orgId) return reply.status(400).send({ error: 'orgId is required' });

      // Seed default policies/guides if none exist yet for this org
      await knowledgeService.seedDefaultKnowledgeIfEmpty(orgId);

      const items = await knowledgeService.listKnowledge(orgId, {
        category: req.query.category,
      });
      return reply.send(items);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  };

  const createKnowledge = async (req: any, reply: any) => {
    try {
      const currentUser = req.user;
      if (!['owner', 'admin'].includes(currentUser?.role)) {
        return reply.status(403).send({ error: 'Chỉ Quản trị viên mới có quyền tạo tài liệu / chính sách' });
      }

      const orgId = currentUser?.orgId || req.body.orgId;
      if (!orgId) return reply.status(400).send({ error: 'orgId is required' });

      const item = await knowledgeService.createKnowledge(orgId, req.body);
      return reply.status(201).send(item);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  };

  const updateKnowledge = async (req: any, reply: any) => {
    try {
      const currentUser = req.user;
      if (!['owner', 'admin'].includes(currentUser?.role)) {
        return reply.status(403).send({ error: 'Chỉ Quản trị viên mới có quyền chỉnh sửa tài liệu / chính sách' });
      }

      const orgId = currentUser?.orgId || req.body.orgId;
      const { id } = req.params;
      await knowledgeService.updateKnowledge(id, orgId, req.body);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  };

  const deleteKnowledge = async (req: any, reply: any) => {
    try {
      const currentUser = req.user;
      if (!['owner', 'admin'].includes(currentUser?.role)) {
        return reply.status(403).send({ error: 'Chỉ Quản trị viên mới có quyền xóa tài liệu / chính sách' });
      }

      const orgId = currentUser?.orgId || req.query.orgId;
      const { id } = req.params;
      await knowledgeService.deleteKnowledge(id, orgId);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  };

  // Support directly mounted route '/' and sub-path '/knowledge'
  app.get('/', getKnowledge);
  app.get('/knowledge', getKnowledge);

  app.post('/', createKnowledge);
  app.post('/knowledge', createKnowledge);

  app.put('/:id', updateKnowledge);
  app.put('/knowledge/:id', updateKnowledge);

  app.delete('/:id', deleteKnowledge);
  app.delete('/knowledge/:id', deleteKnowledge);
};
