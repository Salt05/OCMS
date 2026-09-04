/**
 * Conversation State Machine & 3-Tier Memory Manager for AI Auto Chat.
 * Integrates Customer Fact Integrity, Slot Filling, and Last Question Tracking.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import {
  StructuredPetProfile,
  StructuredCustomerProfile,
  hydratePetProfile,
  hydrateCustomerProfile,
  createConfirmedFact,
} from './customer-fact-model.js';
import type { ConversationState } from './next-action-engine.js';

export type { ConversationState };

export interface DraftOrderItem {
  sku: string;
  name: string;
  qty: number;
  price: number;
  uom?: string;
}

export interface DraftOrderState {
  items: DraftOrderItem[];
  recipientName?: string;
  phone?: string;
  address?: string;
  notes?: string;
  paymentTerm?: string | null;
  subtotal?: number;
  isConfirmedByCustomer?: boolean;
  unclearItems?: any[];
  hasShownToCustomer?: boolean;
  appliedPromotions?: any[];
  freeItems?: any[];
  explanations?: any[];
  discountAmount?: number;
  amountTotal?: number;
}

export interface SessionAiState {
  petInfo: StructuredPetProfile;
  customerInfo: StructuredCustomerProfile;
  customerSegment: 'retail' | 'wholesale';
  draftOrder: DraftOrderState;
  lastAiQuestion?: string | null;
  expectedInformation?: string | null;
  pendingSlots: string[];
  contextSummary?: string;
  failedAttempts: number;
  turnCount: number;
}

class ChatbotStateMachine {
  /**
   * Check if conversation is eligible for AI auto-reply
   */
  async canAiReply(conversationId: string): Promise<{ canReply: boolean; reason?: string; conversation?: any }> {
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          zaloAccount: true,
          contact: true,
        },
      });

      if (!conv) {
        return { canReply: false, reason: 'Conversation not found' };
      }

      if (conv.threadType !== 'user') {
        return { canReply: false, reason: 'Group chats not supported for AI auto-reply' };
      }

      // Condition: Strictly ONLY contacts of type 'customer' (Khách hàng) are eligible.
      // Types 'employee' (Nhân viên) and 'other' (Khác) are strictly excluded.
      if (conv.contact && conv.contact.contactType !== 'customer') {
        return {
          canReply: false,
          reason: `AI auto reply only applies to 'customer' contacts, current type is '${conv.contact.contactType}'`,
        };
      }

      if (!conv.zaloAccount?.aiAutoReply) {
        return { canReply: false, reason: 'AI auto reply disabled on Zalo account' };
      }

      if (!conv.aiActive) {
        return { canReply: false, reason: 'AI deactivated for this conversation (aiActive is false)' };
      }

      // Check if paused and if timeout has expired
      if (conv.aiPaused) {
        if (conv.pausedUntil && conv.pausedUntil <= new Date()) {
          // Auto resume after timeout
          await prisma.conversation.update({
            where: { id: conversationId },
            data: {
              aiPaused: false,
              pausedUntil: null,
              handoffReason: null,
            },
          });
          conv.aiPaused = false;
        } else {
          return { canReply: false, reason: 'AI is currently paused by human handoff or staff intervention' };
        }
      }

      // Check working hours constraint if enabled
      if (conv.zaloAccount?.aiWorkingHoursOnly) {
        const now = new Date();
        const vnHour = (now.getUTCHours() + 7) % 24;
        const isWorkingHours = vnHour >= 8 && vnHour < 18;
        if (isWorkingHours) {
          return { canReply: false, reason: 'AI configured to run outside working hours only' };
        }
      }

      return { canReply: true, conversation: conv };
    } catch (err: any) {
      logger.error('[chatbot-state-machine] canAiReply error:', err.message);
      return { canReply: false, reason: err.message };
    }
  }

  /**
   * Pause AI for a conversation (manual or human handoff)
   */
  async pauseAi(conversationId: string, reason: string, durationMinutes = 60) {
    const pausedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        aiPaused: true,
        pausedUntil,
        handoffReason: reason,
        currentState: 'AI_PAUSED',
      },
    });

    try {
      zaloPool.getIO()?.emit('chat:state_updated', {
        conversationId,
        currentState: 'AI_PAUSED',
        aiPaused: true,
        handoffReason: reason,
        pausedUntil: pausedUntil.toISOString(),
      });
    } catch (e: any) {
      logger.warn(`[chatbot-state-machine] Socket emit chat:state_updated failed: ${e.message}`);
    }

    return updated;
  }

  /**
   * Resume AI for a conversation
   */
  async resumeAi(conversationId: string) {
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        aiPaused: false,
        pausedUntil: null,
        handoffReason: null,
        currentState: 'GREETING',
      },
    });

    try {
      zaloPool.getIO()?.emit('chat:state_updated', {
        conversationId,
        currentState: 'GREETING',
        aiPaused: false,
        handoffReason: null,
        pausedUntil: null,
      });
    } catch (e: any) {
      logger.warn(`[chatbot-state-machine] Socket emit chat:state_updated failed: ${e.message}`);
    }

    return updated;
  }

  /**
   * Load 3-Tier Memory Context for LLM injection
   */
  async loadMemoryContext(conversationId: string, orgId: string) {
    // Tier 3: Long-term CRM contact & Customer profile
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        contact: true,
      },
    });

    // Check Context Boundary (Start / End markers)
    const cAny = conv as any;
    let sentAtGte: Date | undefined = cAny?.contextStartedAt || undefined;
    let sentAtLte: Date | undefined = cAny?.contextEndedAt || undefined;

    if (cAny?.contextStartMsgId && !sentAtGte) {
      const startMsg = await prisma.message.findUnique({
        where: { id: cAny.contextStartMsgId },
        select: { sentAt: true },
      });
      if (startMsg) sentAtGte = startMsg.sentAt;
    }
    if (cAny?.contextEndMsgId && !sentAtLte) {
      const endMsg = await prisma.message.findUnique({
        where: { id: cAny.contextEndMsgId },
        select: { sentAt: true },
      });
      if (endMsg) sentAtLte = endMsg.sentAt;
    }

    // Tier 1: Sliding window bounded by Context Boundary
    let shortTermMessages: any[] = [];
    if (sentAtGte) {
      const msgWhere: any = { conversationId, isDeleted: false, sentAt: { gte: sentAtGte } };
      if (sentAtLte) {
        msgWhere.sentAt.lte = sentAtLte;
      }
      shortTermMessages = await prisma.message.findMany({
        where: msgWhere,
        orderBy: { sentAt: 'asc' },
        take: 30,
      });
    } else {
      const recentMessages = await prisma.message.findMany({
        where: { conversationId, isDeleted: false },
        orderBy: { sentAt: 'desc' },
        take: 15,
      });
      shortTermMessages = recentMessages.reverse();
    }

    // Tier 2: Session state
    let aiState = await prisma.conversationAiState.findUnique({
      where: { conversationId },
    });

    if (!aiState) {
      aiState = await prisma.conversationAiState.create({
        data: {
          orgId,
          conversationId,
          petInfo: {},
          customerSegment: 'retail',
          draftOrder: { items: [] },
          failedAttempts: 0,
        },
      });
    }

    const rawPet = (aiState.petInfo as any) || {};
    const rawDraft = (aiState.draftOrder as any) || { items: [] };

    let customerProfile: any = null;
    let orderHistory: any[] = [];

    if (conv?.contact?.customerId || conv?.contact?.phone) {
      customerProfile = await prisma.customerProfile.findFirst({
        where: {
          orgId,
          OR: [
            conv.contact.customerId ? { odooPartnerId: parseInt(conv.contact.customerId, 10) || -1 } : {},
            conv.contact.phone ? { phone: conv.contact.phone } : {},
          ],
        },
      });

      if (customerProfile) {
        orderHistory = await prisma.orderHistory.findMany({
          where: { customerProfileId: customerProfile.id },
          orderBy: { dateOrder: 'desc' },
          take: 3,
          include: { lines: true },
        });
      }
    }

    const structuredPet = hydratePetProfile(rawPet);
    const structuredCustomer = hydrateCustomerProfile(rawDraft.customer || {}, conv?.contact);

    // Persistent CRM & Customer preference preservation (Payment Term & Pronoun)
    const persistentPaymentTerm =
      rawPet._preferredPaymentTerm ||
      orderHistory[0]?.paymentTerm ||
      (customerProfile as any)?.propertyPaymentTermId ||
      undefined;

    if (persistentPaymentTerm && (!structuredCustomer.payment_term.value || structuredCustomer.payment_term.status !== 'CONFIRMED')) {
      structuredCustomer.payment_term = createConfirmedFact(persistentPaymentTerm, 'crm');
    }

    // Session Expiration Check:
    // Only timeout if NO explicit context boundary is pinned AND last message > 3 hours ago
    const lastMsgTime = shortTermMessages[shortTermMessages.length - 1]?.sentAt
      ? new Date(shortTermMessages[shortTermMessages.length - 1].sentAt).getTime()
      : 0;
    const isNewSession = !sentAtGte && lastMsgTime > 0 && (Date.now() - lastMsgTime > 3 * 60 * 60 * 1000);

    const activeDraft = isNewSession ? { items: [] } : (rawDraft.items ? rawDraft : { items: [] });
    // Pre-populate preferred payment term to active draft if not yet selected
    if (persistentPaymentTerm && activeDraft && !activeDraft.paymentTerm) {
      activeDraft.paymentTerm = persistentPaymentTerm;
    }

    const activePendingSlots = isNewSession ? [] : (Array.isArray(rawPet._pendingSlots) ? rawPet._pendingSlots : []);
    const activeLastQuestion = isNewSession ? null : (rawPet._lastAiQuestion || null);

    const sessionState: SessionAiState = {
      petInfo: structuredPet,
      customerInfo: structuredCustomer,
      customerSegment: (aiState.customerSegment as any) || 'retail',
      draftOrder: activeDraft,
      lastAiQuestion: activeLastQuestion,
      expectedInformation: isNewSession ? null : (rawPet._expectedInformation || null),
      pendingSlots: activePendingSlots,
      contextSummary: aiState.contextSummary || undefined,
      failedAttempts: aiState.failedAttempts || 0,
      turnCount: isNewSession ? 0 : (rawPet._turnCount || shortTermMessages.length),
    };

    return {
      conversation: conv,
      currentState: (conv?.currentState as ConversationState) || 'NEW',
      shortTermMessages,
      sessionState,
      contact: conv?.contact,
      customerProfile,
      orderHistory,
    };
  }

  /**
   * Save / Update Session State
   */
  async updateSessionState(
    conversationId: string,
    orgId: string,
    state: Partial<SessionAiState>,
    nextState?: ConversationState
  ) {
    try {
      const petPayload: any = state.petInfo ? { ...state.petInfo } : {};
      if (state.lastAiQuestion !== undefined) petPayload._lastAiQuestion = state.lastAiQuestion;
      if (state.expectedInformation !== undefined) petPayload._expectedInformation = state.expectedInformation;
      if (state.pendingSlots !== undefined) petPayload._pendingSlots = state.pendingSlots;
      if (state.turnCount !== undefined) petPayload._turnCount = state.turnCount;

      const draftPayload: any = state.draftOrder ? { ...state.draftOrder } : undefined;
      if (draftPayload && state.customerInfo) {
        draftPayload.customer = {
          name: state.customerInfo.name?.value || draftPayload.customer?.name || null,
          phone: state.customerInfo.phone?.value || draftPayload.customer?.phone || null,
          shippingAddress: state.customerInfo.address?.value || draftPayload.customer?.shippingAddress || null,
        };
      }

      await prisma.conversationAiState.upsert({
        where: { conversationId },
        create: {
          orgId,
          conversationId,
          petInfo: petPayload,
          customerSegment: state.customerSegment || 'retail',
          draftOrder: draftPayload || { items: [] },
          contextSummary: state.contextSummary || null,
          failedAttempts: state.failedAttempts || 0,
        },
        update: {
          petInfo: Object.keys(petPayload).length > 0 ? petPayload : undefined,
          customerSegment: state.customerSegment || undefined,
          draftOrder: draftPayload !== undefined ? draftPayload : undefined,
          contextSummary: state.contextSummary !== undefined ? state.contextSummary : undefined,
          failedAttempts: state.failedAttempts !== undefined ? state.failedAttempts : undefined,
        },
      });

      if (nextState) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { currentState: nextState },
        });
      }
    } catch (err: any) {
      logger.error('[chatbot-state-machine] updateSessionState error:', err.message);
    }
  }
}

export const chatbotStateMachine = new ChatbotStateMachine();
