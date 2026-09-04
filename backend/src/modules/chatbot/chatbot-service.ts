/**
 * Core Chatbot Orchestration Engine (Upgraded to Conversation Agent).
 * Features:
 * - Customer Fact Integrity (CONFIRMED / UNKNOWN / INFERRED)
 * - Deterministic Slot Filling & Correction Handling
 * - Conversation State Machine & Last Question Tracking
 * - Next Action Engine
 * - Product Grounding & Product Comparison
 * - Context Builder with Anti-Hallucination rules
 * - Claim Validator & Safety Guardrails
 */
import { randomUUID } from 'crypto';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { chatbotStateMachine } from './chatbot-state-machine.js';
import { CHATBOT_TOOL_DEFINITIONS, ChatbotToolExecutor } from './chatbot-tools.js';
import { ChatbotGuardrails } from './chatbot-guardrails.js';
import { knowledgeService } from './knowledge-service.js';
import { SlotExtractor } from './slot-extractor.js';
import { NextActionEngine, type NextActionDecision } from './next-action-engine.js';
import { ContextBuilder } from './context-builder.js';
import { ClaimValidator } from './claim-validator.js';
import { createConfirmedFact } from './customer-fact-model.js';
import { PersonaToneExtractor } from './persona-extractor.js';
import { extractImageUrls, convertAllToDataUris } from './image-helper.js';
import { formatDraftOrderProductList, formatDraftOrderPromotionsAndPricing, formatFullOrderDeclaration } from './draft-order-formatter.js';

export const recentAiMessages = new Map<string, number>();

export function markAiMessageSending(conversationId: string, content: string) {
  const key = `${conversationId}:${content.trim()}`;
  recentAiMessages.set(key, Date.now());
}

export function isRecentAiMessage(conversationId: string, content: string): boolean {
  const key = `${conversationId}:${content.trim()}`;
  const ts = recentAiMessages.get(key);
  if (ts && Date.now() - ts < 45000) {
    recentAiMessages.delete(key);
    return true;
  }
  return false;
}

class ChatbotService {
  private activeProcessingLocks = new Map<string, number>();
  private pendingOrderWaitTimers = new Map<
    string,
    {
      timer: NodeJS.Timeout;
      createdAt: number;
      conversationId: string;
      orgId: string;
      zaloAccountId: string;
      salutation: string;
    }
  >();

  private get LLM_API_URL(): string {
    return config.llm?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  }
  private get modelName(): string {
    return config.llm?.model || config.groq?.model || 'gemini-3.5-flash-lite';
  }

  /**
   * Cancel any pending order wait timer for this conversation
   */
  cancelPendingOrderWait(conversationId: string): void {
    const existing = this.pendingOrderWaitTimers.get(conversationId);
    if (existing) {
      clearTimeout(existing.timer);
      this.pendingOrderWaitTimers.delete(conversationId);
      logger.info(`[chatbot-service] Cancelled pending order wait timer for conv ${conversationId}`);
    }
  }

  /**
   * Schedule 2-minute order wait timer. If customer doesn't send order info in time, reminds customer.
   */
  private scheduleOrderWaitTimer(params: {
    conversationId: string;
    orgId: string;
    zaloAccountId: string;
    salutation: string;
    originalUserMessage: string;
    waitMs?: number;
  }): void {
    this.cancelPendingOrderWait(params.conversationId);

    const waitDuration = params.waitMs ?? 120000; // default 2 minutes (120 seconds)
    const timerCreatedAt = Date.now();

    const timer = setTimeout(async () => {
      try {
        // 1. Verify that AI is still eligible to reply (not paused, enabled)
        const eligibility = await chatbotStateMachine.canAiReply(params.conversationId);
        if (!eligibility.canReply) {
          logger.info(`[chatbot-service] Wait timer fired for conv ${params.conversationId}, but AI cannot reply (${eligibility.reason})`);
          return;
        }

        // 2. Check DB if customer has sent any new message since timer started
        const recentCustomerMsg = await prisma.message.findFirst({
          where: {
            conversationId: params.conversationId,
            senderType: { not: 'self' },
            sentAt: { gt: new Date(timerCreatedAt) },
          },
        });
        if (recentCustomerMsg) {
          logger.info(`[chatbot-service] Wait timer fired for conv ${params.conversationId}, but customer already sent a message at ${recentCustomerMsg.sentAt}. Reminder skipped.`);
          return;
        }

        // 3. Check if draft order has already been populated with items
        const mem = await chatbotStateMachine.loadMemoryContext(params.conversationId, params.orgId);
        if (mem.sessionState.draftOrder?.items && mem.sessionState.draftOrder.items.length > 0) {
          logger.info(`[chatbot-service] Wait timer fired for conv ${params.conversationId}, but draft order already has items. Reminder skipped.`);
          return;
        }

        // 4. Send reminder since customer did not send any order info in 2 minutes
        const reminderMsg = `Dạ em vẫn chưa nhận được thông tin đơn hàng từ ${params.salutation}. Khi nào thuận tiện, nhờ ${params.salutation} gửi hình ảnh hoặc danh sách sản phẩm để em hỗ trợ lên đơn nhé ạ.`;
        await this.sendAiResponse(params.conversationId, params.zaloAccountId, reminderMsg, params.orgId);

        await this.logAudit({
          orgId: params.orgId,
          conversationId: params.conversationId,
          userMessage: params.originalUserMessage,
          intentDetected: 'WAIT_TIMER_EXPIRED_REMINDER',
          toolCalls: [],
          aiResponse: reminderMsg,
          latencyMs: Date.now() - timerCreatedAt,
          modelUsed: 'rule-wait-timer',
          isHandoff: false,
        });
      } catch (err: any) {
        logger.error(`[chatbot-service] Error in order wait timer for conv ${params.conversationId}: ${err.message}`);
      } finally {
        this.pendingOrderWaitTimers.delete(params.conversationId);
      }
    }, waitDuration);

    this.pendingOrderWaitTimers.set(params.conversationId, {
      timer,
      createdAt: timerCreatedAt,
      conversationId: params.conversationId,
      orgId: params.orgId,
      zaloAccountId: params.zaloAccountId,
      salutation: params.salutation,
    });
    logger.info(`[chatbot-service] Scheduled ${waitDuration / 1000}s order wait timer for conv ${params.conversationId}`);
  }

  /**
   * Main entry point for processing incoming messages
   */
  async processIncomingMessage(
    conversationId: string,
    messageText: string,
    orgId: string,
    zaloAccountId: string,
    contactId?: string,
    attachments?: any[],
    contentType?: string
  ): Promise<void> {
    const startTime = Date.now();
    let isHandoff = false;
    let intentDetected = 'GENERAL';
    const executedTools: Array<{ name: string; args: any }> = [];
    let ackMsgSent = false;

    // Deduplicate only identical webhook retries within 3 seconds
    const msgFingerprint = `${conversationId}:${(messageText || '').slice(0, 40)}:${contentType || 'text'}:${attachments?.length || 0}`;
    const existingLock = this.activeProcessingLocks.get(msgFingerprint);
    if (existingLock && Date.now() - existingLock < 3000) {
      logger.warn(`[chatbot-service] Skipped duplicate concurrent webhook for conversation ${conversationId}`);
      return;
    }
    this.activeProcessingLocks.set(msgFingerprint, Date.now());

    // Cancel any pending wait timer for this conversation when customer sends a new message
    this.cancelPendingOrderWait(conversationId);

    try {
      // 1. Check AI reply eligibility
      const eligibility = await chatbotStateMachine.canAiReply(conversationId);
      if (!eligibility.canReply) {
        logger.info(`[chatbot-service] Skipped AI reply for conversation ${conversationId}: ${eligibility.reason}`);
        return;
      }

      // 2. Anti-Ban Rate Limit Check
      const rateLimitOk = await ChatbotGuardrails.checkDailyRateLimit(orgId, zaloAccountId);
      if (!rateLimitOk) {
        logger.warn(`[chatbot-service] Daily rate limit reached for org ${orgId}. Skipping auto-reply.`);
        return;
      }

      // 3. Medical / Emergency Guardrail Check
      const medicalCheck = ChatbotGuardrails.checkMedicalSafety(messageText);
      if (medicalCheck.isMedicalEmergency && medicalCheck.warningAdvice) {
        await this.sendAiResponse(conversationId, zaloAccountId, medicalCheck.warningAdvice, orgId);
        await this.logAudit({
          orgId,
          conversationId,
          userMessage: messageText,
          intentDetected: 'MEDICAL_EMERGENCY',
          toolCalls: [],
          aiResponse: medicalCheck.warningAdvice,
          latencyMs: Date.now() - startTime,
          modelUsed: 'rule-engine',
          isHandoff: false,
        });
        return;
      }

      // 3.1. Data Privacy & Internal Security Guardrail Check
      const privacyCheck = ChatbotGuardrails.checkDataPrivacySafety(messageText);
      if (privacyCheck.isViolating && privacyCheck.cannedResponse) {
        await this.sendAiResponse(conversationId, zaloAccountId, privacyCheck.cannedResponse, orgId);
        await this.logAudit({
          orgId,
          conversationId,
          userMessage: messageText,
          intentDetected: 'PRIVACY_VIOLATION_BLOCKED',
          toolCalls: [],
          aiResponse: privacyCheck.cannedResponse,
          latencyMs: Date.now() - startTime,
          modelUsed: 'privacy-guardrail',
          isHandoff: false,
        });
        return;
      }

      // 4. Load 3-Tier Memory Context
      const memory = await chatbotStateMachine.loadMemoryContext(conversationId, orgId);
      const toolExecutor = new ChatbotToolExecutor(orgId, conversationId, contactId);

      // 4.1 Check direct image attachments & notify user immediately
      let directImageUrls = extractImageUrls(messageText, attachments, contentType);

      // If current message has no image, check if the customer sent an image within the last 3 minutes
      if (directImageUrls.length === 0) {
        try {
          const recentImgMsg = await prisma.message.findFirst({
            where: {
              conversationId,
              senderType: { not: 'self' },
              sentAt: { gte: new Date(Date.now() - 3 * 60 * 1000) },
              OR: [
                { contentType: 'image' },
                { content: { contains: 'zdn.vn' } },
                { content: { contains: 'http' } },
              ],
            },
            orderBy: { sentAt: 'desc' },
          });
          if (recentImgMsg) {
            const foundUrls = extractImageUrls(recentImgMsg.content, recentImgMsg.attachments as any[], recentImgMsg.contentType);
            for (const u of foundUrls) {
              directImageUrls.push(u);
            }
            directImageUrls = Array.from(new Set(directImageUrls));
          }
        } catch (e) {
          // ignore DB lookup error
        }
      }
      const hasDirectImages = directImageUrls.length > 0;
      ackMsgSent = false;
      let ackSentAt = 0;
      const isReexamineImage = /(?:nhìn lại|xem lại|kiểm tra lại|coi lại|đọc lại|xem kỹ lại|nhìn kỹ lại)\s*(?:ảnh|hình|hinh|danh sách|anh|bảng|đơn)?/i.test(messageText);
      const currentMsgHasImages = extractImageUrls(messageText, attachments, contentType).length > 0;

      // Only send waiting acknowledgment if CURRENT message attached an image OR customer asks to re-examine image
      if (currentMsgHasImages || (isReexamineImage && hasDirectImages)) {
        const rawPet = (memory.sessionState.petInfo as any) || {};
        const salutation = (memory.contact as any)?.salutation?.trim() || rawPet._savedCustomerPronoun || 'anh/chị';
        const ackMsg = currentMsgHasImages
          ? `Dạ em đã nhận được hình ảnh rồi ạ! ${salutation} đợi em một lát để em kiểm tra và đối chiếu danh sách sản phẩm với kho nhé ạ.`
          : `Dạ em đang xem lại hình ảnh và đối chiếu danh sách sản phẩm với kho, ${salutation} chờ em một lát nhé ạ!`;
        await this.sendAiResponse(conversationId, zaloAccountId, ackMsg, orgId);
        ackMsgSent = true;
        ackSentAt = Date.now();
      }

      // 5. Rule-based Slot Extractor
      const extracted = SlotExtractor.extract(
        messageText,
        memory.sessionState.pendingSlots,
        attachments,
        contentType
      );
      intentDetected = extracted.intent;

      // 5.1 Determine if customer is referencing past context/order vs starting a new session
      const hasActiveDraft = Boolean(
        memory.sessionState.draftOrder?.items &&
        memory.sessionState.draftOrder.items.length > 0 &&
        !memory.sessionState.draftOrder.isConfirmedByCustomer
      );

      const isAnsweringOrder =
        Boolean(extracted.paymentTerm) ||
        Boolean(extracted.phone) ||
        Boolean(extracted.address) ||
        extracted.intent === 'CONFIRM_ORDER' ||
        extracted.intent === 'CHECK_REMAINING_ITEMS' ||
        extracted.intent === 'CLARIFY_ORDER_ITEM' ||
        (memory.sessionState.pendingSlots?.length > 0 && extracted.answeredPendingSlots?.length > 0) ||
        /(?:thanh toán|tiền mặt|chuyển khoản|công nợ|giao|ship|đúng rồi|chuẩn rồi|ok|oke|lên đơn|chốt|ngay|\d+\s*ngày)/i.test(messageText);

      const referencesPastContext =
        hasActiveDraft ||
        isAnsweringOrder ||
        /(?:đơn\s*(?:nãy|này|vừa rồi|hồi nãy|cũ|trước|hôm nay|vừa gửi|vừa đặt)|ảnh\s*(?:nãy|vừa gửi|hồi nãy|trước)|phiếu\s*(?:nãy|vừa gửi)|mấy món\s*(?:nãy|trên|vừa rồi)|nhìn lại|xem lại|kiểm tra lại|coi lại|sửa đơn|đổi món|bỏ món|thêm món|hủy đơn|chốt đơn|tính tiền|báo giá lại|sao rồi|xong chưa|tiếp tục|như đã nói|như nãy|như trên)/i.test(messageText);

      // Check session inactivity timeout (only timeout if idle for > 4 hours and not continuing an active draft)
      let isSessionTimedOut = false;
      if (memory.shortTermMessages.length > 0 && !hasActiveDraft) {
        const lastMsg = memory.shortTermMessages[memory.shortTermMessages.length - 1];
        if (lastMsg?.sentAt) {
          const diffMs = Date.now() - new Date(lastMsg.sentAt).getTime();
          if (diffMs > 4 * 60 * 60 * 1000) {
            isSessionTimedOut = true;
          }
        }
      }

      const isGreeting = extracted.intent === 'GREETING';
      const hasRecentHistory = memory.shortTermMessages.length > 0;
      // Only start a brand new conversation if there is NO past history in session OR idle timeout > 4 hours
      const isNewConversation = !hasRecentHistory || isSessionTimedOut;

      if (isNewConversation) {
        logger.info(`[chatbot-service] Starting a NEW conversation session for conv ${conversationId} (isGreeting=${isGreeting}, isSessionTimedOut=${isSessionTimedOut})`);
        memory.sessionState.draftOrder = { items: [] };
        memory.sessionState.pendingSlots = [];
        memory.currentState = 'GREETING';
        await chatbotStateMachine.updateSessionState(conversationId, orgId, {
          draftOrder: { items: [] },
          pendingSlots: [],
        }, 'GREETING');

        // Automatically mark Context Boundary start at the latest incoming customer message
        try {
          const latestCustMsg = await prisma.message.findFirst({
            where: { conversationId, senderType: { not: 'self' } },
            orderBy: { sentAt: 'desc' },
          });
          if (latestCustMsg) {
            await prisma.conversation.update({
              where: { id: conversationId },
              data: {
                contextStartMsgId: latestCustMsg.id,
                contextStartedAt: latestCustMsg.sentAt,
                contextEndMsgId: null,
                contextEndedAt: null,
              } as any,
            });
            zaloPool.getIO()?.emit('chat:context_boundary_updated', {
              conversationId,
              contextStartMsgId: latestCustMsg.id,
              contextStartedAt: latestCustMsg.sentAt,
              contextEndMsgId: null,
              contextEndedAt: null,
            });
          }
        } catch (e: any) {
          logger.warn(`[chatbot-service] Auto-setting context boundary start failed: ${e.message}`);
        }
      }

      // Update draft order payment term if customer just selected one
      if (extracted.paymentTerm) {
        if (!memory.sessionState.draftOrder) {
          memory.sessionState.draftOrder = { items: [] };
        }
        memory.sessionState.draftOrder.paymentTerm = extracted.paymentTerm;
      }

      // 6. Apply extracted slots to Fact Integrity Layer
      SlotExtractor.applyExtractedSlots(
        memory.sessionState.petInfo,
        memory.sessionState.customerInfo,
        extracted
      );

      // Remove answered slots from pending list
      if (extracted.answeredPendingSlots.length > 0) {
        memory.sessionState.pendingSlots = memory.sessionState.pendingSlots.filter(
          s => !extracted.answeredPendingSlots.includes(s)
        );
      }

      // 6.0 Priority 1: Check for Unhandled Situation or Direct Human Handoff Request immediately
      if (extracted.intent === 'UNHANDLED_SITUATION') {
        const handoffReason = 'Tình huống chưa được thiết lập trong hệ thống (yêu cầu đàm phán riêng/ngoài phạm vi)';
        await this.executeSilentHandoff(
          conversationId,
          orgId,
          memory.contact?.fullName,
          handoffReason,
          messageText,
          startTime
        );
        return;
      }

      if (extracted.intent === 'HANDOFF_REQUEST') {
        isHandoff = true;
        const handoffReason = 'Khách yêu cầu gặp tư vấn viên trực tiếp';
        await chatbotStateMachine.pauseAi(conversationId, handoffReason);
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { currentState: 'HUMAN_REQUESTED' },
        });
        zaloPool.getIO()?.emit('chat:state_updated', {
          conversationId,
          currentState: 'HUMAN_REQUESTED',
          aiPaused: true,
          handoffReason,
        });
        const replyText = 'Dạ em xin phép kết nối ngay với Chuyên viên tư vấn LA PET để hỗ trợ trực tiếp cho mình nhé ạ. Chuyên viên sẽ phản hồi lại ngay sau ít phút!';
        await this.sendAiResponse(conversationId, zaloAccountId, replyText, orgId);

        // Notify CRM staff via bell notification
        await this.notifyStaffHandoff(
          orgId,
          conversationId,
          memory.contact?.fullName,
          handoffReason
        );

        await this.logAudit({
          orgId,
          conversationId,
          userMessage: messageText,
          intentDetected: 'HANDOFF_REQUEST',
          toolCalls: [{ name: 'handoff_to_human', args: { reason: handoffReason } }],
          aiResponse: replyText,
          latencyMs: Date.now() - startTime,
          modelUsed: 'next-action-engine',
          isHandoff: true,
        });
        return;
      }

      // 6.1 Check for Customer Asking to Wait (e.g. "đợi xíu nhé", "chờ tí em đang chụp", "đợi tí nhé")
      const isWaitRequest = /(?:chờ|đợi)\s*(?:em|anh|chị|mình|tí|chút|xíu|lát|ti|mot lat|1 lat)|đang chụp|dang chup|chụp xong|chụp gửi/i.test(messageText);

      // 6.2 Check for Bare Order Request without products or images:
      // (e.g. "tạo đơn này cho tôi", "lên đơn này giúp em", "tạo đơn cho anh", "bóc tách đơn này cho tôi", "lên đơn", "tạo đơn")
      const referencesEarlierContext = /(?:phía\s*trên|ở\s*trên|như\s*trên|như\s*nãy|vừa\s*gửi|hồi\s*nãy|nãy\s*giờ|đã\s*gửi|tiếp\s*tục|ảnh\s*trên|đơn\s*nãy|đơn\s*trên|mấy\s*món\s*(?:nãy|trên)|như\s*đã\s*nói)/i.test(messageText);

      const isBareOrderRequest =
        !hasDirectImages &&
        !referencesEarlierContext &&
        !referencesPastContext &&
        (!extracted.mentionedSkus || extracted.mentionedSkus.length === 0) &&
        !extracted.orderQuantity &&
        (!memory.sessionState.draftOrder?.items || memory.sessionState.draftOrder.items.length === 0) &&
        !extracted.phone &&
        !extracted.address &&
        !extracted.paymentTerm &&
        extracted.intent !== 'CONFIRM_ORDER' &&
        (
          extracted.intent === 'ORDER_INTENT' ||
          /(?:tạo\s*đơn|lên\s*đơn|bóc\s*tách\s*đơn|đặt\s*đơn|tạo\s*order|lên\s*order|mở\s*đơn|làm\s*đơn)/i.test(messageText)
        );

      if (isBareOrderRequest) {
        // Customer may have sent "mình muốn đặt đơn này" or similar text concurrently with or immediately before an image.
        // Wait 2.5 seconds to see if an image arrived concurrently in DB
        await new Promise(resolve => setTimeout(resolve, 2500));

        const concurrentImgMsg = await prisma.message.findFirst({
          where: {
            conversationId,
            senderType: { not: 'self' },
            sentAt: { gte: new Date(Date.now() - 15 * 1000) },
            OR: [
              { contentType: 'image' },
              { content: { contains: 'zdn.vn' } },
              { content: { contains: 'http' } },
            ],
          },
          orderBy: { sentAt: 'desc' },
        });

        if (concurrentImgMsg) {
          logger.info(`[chatbot-service] Image arrived concurrently with bare order text ("${messageText}"). Skipping redundant "em đang chờ gửi ảnh" reply.`);
          return;
        }

        const rawPet = (memory.sessionState.petInfo as any) || {};
        const salutation = (memory.contact as any)?.salutation?.trim() || rawPet._savedCustomerPronoun || 'anh/chị';
        const waitReply = `Dạ vâng, em đang chờ ${salutation} gửi hình ảnh hoặc thông tin sản phẩm để lên đơn nhé ạ.`;

        await this.sendAiResponse(conversationId, zaloAccountId, waitReply, orgId);

        await chatbotStateMachine.updateSessionState(
          conversationId,
          orgId,
          {
            lastAiQuestion: waitReply,
            expectedInformation: 'order_items_or_images',
          },
          'WAITING_FOR_CUSTOMER_INFO'
        );

        this.scheduleOrderWaitTimer({
          conversationId,
          orgId,
          zaloAccountId,
          salutation,
          originalUserMessage: messageText,
          waitMs: 120000, // Wait at least 2 minutes
        });

        await this.logAudit({
          orgId,
          conversationId,
          userMessage: messageText,
          intentDetected: 'WAITING_FOR_ORDER_INFO',
          toolCalls: [],
          aiResponse: waitReply,
          latencyMs: Date.now() - startTime,
          modelUsed: 'rule-waiting-timer',
          isHandoff: false,
        });

        return;
      }

      if (isWaitRequest && (memory.currentState === 'WAITING_FOR_CUSTOMER_INFO' || memory.currentState === 'ORDER_COLLECTION')) {
        const rawPet = (memory.sessionState.petInfo as any) || {};
        const salutation = (memory.contact as any)?.salutation?.trim() || rawPet._savedCustomerPronoun || 'anh/chị';
        const waitReply = `Dạ vâng, em đợi ${salutation} nhé ạ.`;

        await this.sendAiResponse(conversationId, zaloAccountId, waitReply, orgId);

        this.scheduleOrderWaitTimer({
          conversationId,
          orgId,
          zaloAccountId,
          salutation,
          originalUserMessage: messageText,
          waitMs: 120000, // Reset 2 minutes wait
        });

        await this.logAudit({
          orgId,
          conversationId,
          userMessage: messageText,
          intentDetected: 'CUSTOMER_ASKED_TO_WAIT',
          toolCalls: [],
          aiResponse: waitReply,
          latencyMs: Date.now() - startTime,
          modelUsed: 'rule-waiting-timer',
          isHandoff: false,
        });

        return;
      }

      // 6.3 Check for Pointer Message or short text accompanying image ("đây", "ảnh đây", "đây nè", "nè", "gửi đây"...)
      const isPointerMessage = /^(?:dạ\s*)?(?:đây|day|đây nè|day ne|đây nha|đây nhé|nè|ne|gửi đây|ảnh đây|hinh day|hình đây|đây shop|đây em|đây ạ|dạ đây|đây anh|đây chị|đây nè shop|xem nè|xem này|này nè|này)[\s\.\,\!\?]*$/i.test(messageText.trim());

      if (isPointerMessage) {
        // Customer may have sent "đây" or short text concurrently with or immediately before an image.
        // Wait 2.5 seconds to see if image arrived concurrently in DB
        await new Promise(resolve => setTimeout(resolve, 2500));

        const concurrentImgMsg = await prisma.message.findFirst({
          where: {
            conversationId,
            senderType: { not: 'self' },
            sentAt: { gte: new Date(Date.now() - 15 * 1000) },
            OR: [
              { contentType: 'image' },
              { content: { contains: 'zdn.vn' } },
              { content: { contains: 'http' } },
            ],
          },
          orderBy: { sentAt: 'desc' },
        });

        if (concurrentImgMsg) {
          logger.info(`[chatbot-service] Image arrived concurrently with pointer text ("${messageText}"). Skipping duplicate text reply.`);
          return;
        }

        // If no image arrived yet, but we are waiting for customer info, keep waiting without generating complaints
        if (memory.currentState === 'WAITING_FOR_CUSTOMER_INFO') {
          const rawPet = (memory.sessionState.petInfo as any) || {};
          const salutation = (memory.contact as any)?.salutation?.trim() || rawPet._savedCustomerPronoun || 'anh/chị';
          const waitReply = `Dạ vâng, em đang chờ ${salutation} gửi hình ảnh hoặc thông tin sản phẩm để lên đơn nhé ạ.`;
          await this.sendAiResponse(conversationId, zaloAccountId, waitReply, orgId);
          this.scheduleOrderWaitTimer({
            conversationId,
            orgId,
            zaloAccountId,
            salutation,
            originalUserMessage: messageText,
            waitMs: 120000,
          });
          return;
        }
      }

      // 7. Next Action Engine Decision
      // Only treat draft as pending confirmation if it has items, not in a new session, and not yet confirmed
      const hasDraft = !isNewConversation && !!(
        memory.sessionState.draftOrder?.items &&
        memory.sessionState.draftOrder.items.length > 0 &&
        !memory.sessionState.draftOrder.isConfirmedByCustomer
      );
      const nextDecision: NextActionDecision = NextActionEngine.decide(
        memory.currentState,
        memory.sessionState.petInfo,
        memory.sessionState.customerInfo,
        extracted,
        memory.sessionState.lastAiQuestion,
        memory.sessionState.pendingSlots,
        !!(memory.sessionState.draftOrder?.paymentTerm),
        hasDraft
      );

      let toolResultsSummary: string | undefined;

      // 8. Execute Deterministic Tools based on Next Action
      if (nextDecision.action === 'HANDOFF_HUMAN_SILENT') {
        isHandoff = true;
        const handoffReason = nextDecision.handoffReason || 'Tình huống chưa được thiết lập trong hệ thống';
        await this.executeSilentHandoff(
          conversationId,
          orgId,
          memory.contact?.fullName,
          handoffReason,
          messageText,
          startTime
        );
        return;
      }

      if (nextDecision.action === 'HANDOFF_HUMAN') {
        isHandoff = true;
        const handoffReason = nextDecision.handoffReason || 'Khách yêu cầu hỗ trợ trực tiếp';
        await chatbotStateMachine.pauseAi(conversationId, handoffReason);
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { currentState: 'HUMAN_REQUESTED' },
        });
        zaloPool.getIO()?.emit('chat:state_updated', {
          conversationId,
          currentState: 'HUMAN_REQUESTED',
          aiPaused: true,
          handoffReason,
        });
        const replyText = 'Dạ em xin phép kết nối ngay với Chuyên viên tư vấn LA PET để hỗ trợ trực tiếp cho mình nhé ạ. Chuyên viên sẽ phản hồi lại ngay sau ít phút!';
        await this.sendAiResponse(conversationId, zaloAccountId, replyText, orgId);

        // Notify CRM staff via bell notification
        await this.notifyStaffHandoff(
          orgId,
          conversationId,
          memory.contact?.fullName,
          handoffReason
        );

        await this.logAudit({
          orgId,
          conversationId,
          userMessage: messageText,
          intentDetected: 'HANDOFF_REQUEST',
          toolCalls: [{ name: 'handoff_to_human', args: { reason: nextDecision.handoffReason } }],
          aiResponse: replyText,
          latencyMs: Date.now() - startTime,
          modelUsed: 'next-action-engine',
          isHandoff: true,
        });
        return;
      }

      if (nextDecision.action === 'CONFIRM_CUSTOMER_ORDER') {
        const confirmResult = await toolExecutor.confirmCustomerOrder();
        executedTools.push({ name: 'confirm_customer_order', args: {} });
        if (confirmResult?.message) {
          toolResultsSummary = confirmResult.message;
        }
      }

      if (nextDecision.action === 'COMPARE_PRODUCTS' && nextDecision.comparisonSkus) {
        const compResult = await toolExecutor.executeTool('compare_products', { skus: nextDecision.comparisonSkus });
        executedTools.push({ name: 'compare_products', args: { skus: nextDecision.comparisonSkus } });
        if (compResult?.summary) {
          toolResultsSummary = compResult.summary;
        }
      } else if (nextDecision.action === 'GET_PRODUCT_DETAIL' && nextDecision.targetSku) {
        const detailResult = await toolExecutor.executeTool('get_product_detail', { sku: nextDecision.targetSku });
        executedTools.push({ name: 'get_product_detail', args: { sku: nextDecision.targetSku } });
        if (detailResult?.found) {
          toolResultsSummary = `Chi tiết sản phẩm [${detailResult.sku}] ${detailResult.name}: Ngành hàng: ${detailResult.category || 'Chưa phân loại'}, Thương hiệu: ${detailResult.brand || 'LA PET'}, Thành phần: ${detailResult.ingredients || 'Chưa có thông tin xác nhận trong CSDL'}, Đối tượng: ${detailResult.target || 'Chưa có thông tin xác nhận'}, Độ tuổi tối thiểu: ${detailResult.suitable_min_age_months !== null ? detailResult.suitable_min_age_months + ' tháng' : 'Chưa có dữ liệu xác nhận trong CSDL'}, Giá sỉ: ${detailResult.formatted_price}`;
        }
      } else if (nextDecision.action === 'SEARCH_PRODUCT' && nextDecision.productSearchQuery) {
        const queryParams = nextDecision.productSearchQuery;
        const searchResult = await toolExecutor.searchProduct(
          queryParams.query,
          queryParams.petType,
          queryParams.excludeIngredients,
          queryParams.ageMonths,
          queryParams.texturePreference,
          queryParams.category,
          queryParams.brand
        );
        executedTools.push({ name: 'search_product', args: queryParams });

        if (searchResult?.products && searchResult.products.length > 0) {
          toolResultsSummary = searchResult.products
            .map((p: any, idx: number) => {
              const catStr = p.category ? ` (Ngành: ${p.category})` : '';
              const brandStr = p.brand ? ` (Brand: ${p.brand})` : '';
              return `${idx + 1}. [Mã ${p.sku}] ${p.name}${catStr}${brandStr} - Giá sỉ: ${p.formatted_price} (${p.specification}) - Đặc điểm: ${p.highlights}`;
            })
            .join('\n');
        }
      }

      // 9. Extract Dynamic Persona, Pronouns & Tone from conversation history + persistent pronouns
      const rawPet = (memory.sessionState.petInfo as any) || {};
      const contactSalutation = (memory.contact as any)?.salutation?.trim();
      const savedPronoun = {
        customerPronoun: contactSalutation || rawPet._savedCustomerPronoun || undefined,
        selfPronoun: rawPet._savedSelfPronoun || undefined,
      };

      const persona = PersonaToneExtractor.extractPersonaAndTone(
        memory.shortTermMessages,
        memory.contact?.fullName || memory.sessionState.customerInfo.name.value || undefined,
        savedPronoun
      );

      // Persist identified pronouns
      if (persona.customerPronoun && persona.customerPronoun !== 'anh/chị') {
        rawPet._savedCustomerPronoun = persona.customerPronoun;
        rawPet._savedSelfPronoun = persona.selfPronoun;
      }
      if (extracted.paymentTerm) {
        rawPet._preferredPaymentTerm = extracted.paymentTerm;
      }

      let hasShownDraftToCustomer = Boolean(memory.sessionState.draftOrder?.hasShownToCustomer);
      const isInitialImageListingContext = (hasDirectImages || isReexamineImage) && !hasShownDraftToCustomer;

      // Build Context & Messages with Persona instruction
      const systemPrompt = ContextBuilder.buildSystemPrompt({
        pet: memory.sessionState.petInfo,
        customer: memory.sessionState.customerInfo,
        currentState: memory.currentState,
        nextDecision,
        lastAiQuestion: memory.sessionState.lastAiQuestion,
        pendingSlots: memory.sessionState.pendingSlots,
        draftOrder: memory.sessionState.draftOrder,
        toolResultsSummary,
        invalidPaymentTerm: extracted.invalidPaymentTerm,
        personaInstruction: persona.promptInstruction,
        customerPronoun: persona.customerPronoun,
        selfPronoun: persona.selfPronoun,
        hasDirectImages: Boolean(hasDirectImages || isReexamineImage),
        isInitialImageListing: isInitialImageListingContext,
        hasShownDraftToCustomer,
      });

      const messages: any[] = [{ role: 'system', content: systemPrompt }];

      // Inject clean short-term history within the active context boundary (up to 25 messages)
      for (const msg of memory.shortTermMessages.slice(-25)) {
        messages.push({
          role: msg.senderType === 'self' ? 'assistant' : 'user',
          content: msg.content || '',
        });
      }

      // Extract current image attachments if any and convert to Base64 data URIs
      let currentImageUrls = directImageUrls;

      // Look back at past images if customer explicitly asked to re-examine or references earlier order/image
      const isReexamineOrReferencePast = /(?:nhìn lại|xem lại|kiểm tra lại|coi lại|đọc lại|xem kỹ lại|nhìn kỹ lại|tiếp tục|phía trên|ở trên|ảnh trên)\s*(?:ảnh|hình|hinh|danh sách|anh|bảng|đơn)?/i.test(messageText);
      if (currentImageUrls.length === 0 && (isReexamineOrReferencePast || referencesPastContext) && memory.shortTermMessages.length > 0) {
        for (const prevMsg of memory.shortTermMessages.slice(-10)) {
          const prevImgs = extractImageUrls(prevMsg.content, prevMsg.attachments, prevMsg.contentType);
          for (const u of prevImgs) {
            currentImageUrls.push(u);
          }
        }
        currentImageUrls = Array.from(new Set(currentImageUrls)).slice(-2);
      }

      const base64DataUris = await convertAllToDataUris(currentImageUrls);

      // Append current user message (multimodal if images present)
      if (base64DataUris.length > 0) {
        const isJsonOrUrl = !messageText || messageText.startsWith('{') || messageText.startsWith('http');
        const textPrompt = isJsonOrUrl
          ? 'Khách hàng gửi hình ảnh danh sách đơn hàng / sản phẩm. Hãy quan sát hình ảnh, đọc các món, số lượng, đối chiếu danh mục kho và bóc tách đơn hàng.'
          : messageText;
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: textPrompt },
            ...base64DataUris.map((url) => ({
              type: 'image_url',
              image_url: { url },
            })),
          ],
        });
      } else {
        messages.push({ role: 'user', content: messageText });
      }

      // 10. Determine State-Scoped Tools
      const isCheckingOut =
        memory.currentState === 'ORDER_COLLECTION' ||
        memory.currentState === 'CONFIRMATION' ||
        memory.currentState === 'ORDER_DRAFT' ||
        nextDecision.action === 'CREATE_ORDER_DRAFT';

      const wantsToExploreMore = /tìm thêm|xem thêm|sản phẩm khác|món khác|mua thêm loại|giới thiệu thêm|tư vấn thêm/i.test(messageText);
      const isAskingProductOrSku = /mã|sku|loại|xương|da bò|bánh|thịt|hương|vị|thành phần|còn|giá|tìm|xem|sản phẩm|nơ/i.test(messageText);

      let scopedTools = CHATBOT_TOOL_DEFINITIONS;
      if (isNewConversation || (isGreeting && memory.shortTermMessages.length <= 1)) {
        // Exclude order extraction and checkout tools during initial greeting to avoid false triggers
        scopedTools = CHATBOT_TOOL_DEFINITIONS.filter(
          t => t.function.name !== 'extract_order_draft' && t.function.name !== 'confirm_customer_order'
        );
      } else if (isCheckingOut && !wantsToExploreMore && !isAskingProductOrSku && nextDecision.action !== 'SEARCH_PRODUCT') {
        // Exclude broad product search and comparison during checkout to eliminate unnecessary latency and distraction
        scopedTools = CHATBOT_TOOL_DEFINITIONS.filter(
          t => t.function.name !== 'search_product' && t.function.name !== 'compare_products'
        );
      }

      // Call LLM with Tool Calling Loop
      const apiKey = config.llm?.apiKey || config.groq?.apiKey || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || '';
      if (!apiKey) {
        logger.warn('[chatbot-service] LLM API key (GEMINI_API_KEY/GROQ_API_KEY) is not configured in environment!');
        return;
      }

      let response = await this.callGroqApi(apiKey, messages, scopedTools);
      let assistantMsg = response?.choices?.[0]?.message;

      let iterations = 0;
      while (assistantMsg?.tool_calls && assistantMsg.tool_calls.length > 0 && iterations < 3) {
        iterations++;
        messages.push(assistantMsg);

        for (const tc of assistantMsg.tool_calls) {
          const fnName = tc.function.name;
          let fnArgs: any = {};
          try {
            fnArgs = JSON.parse(tc.function.arguments);
          } catch (e) {
            fnArgs = {};
          }

          executedTools.push({ name: fnName, args: fnArgs });

          if (fnName === 'handoff_to_human') {
            isHandoff = true;
            intentDetected = 'HUMAN_HANDOFF';
            const reason = fnArgs.reason || 'Khách yêu cầu hỗ trợ trực tiếp';
            const isSilent = fnArgs.silent === true ||
              reason.toLowerCase().includes('chưa thiết lập') ||
              reason.toLowerCase().includes('ngoài quy định') ||
              reason.toLowerCase().includes('đàm phán') ||
              reason.toLowerCase().includes('không có thông tin') ||
              reason.toLowerCase().includes('ngoài phạm vi');

            if (isSilent) {
              await this.executeSilentHandoff(
                conversationId,
                orgId,
                memory.contact?.fullName,
                reason,
                messageText,
                startTime
              );
              return;
            }

            await chatbotStateMachine.pauseAi(conversationId, reason);
            await prisma.conversation.update({
              where: { id: conversationId },
              data: { currentState: 'HUMAN_REQUESTED' },
            });
            zaloPool.getIO()?.emit('chat:state_updated', {
              conversationId,
              currentState: 'HUMAN_REQUESTED',
              aiPaused: true,
              handoffReason: reason,
            });
            await this.notifyStaffHandoff(
              orgId,
              conversationId,
              memory.contact?.fullName,
              reason
            );

            const replyText = 'Dạ em xin phép kết nối ngay với Chuyên viên tư vấn LA PET để hỗ trợ trực tiếp cho mình nhé ạ. Chuyên viên sẽ phản hồi lại ngay sau ít phút!';
            await this.sendAiResponse(conversationId, zaloAccountId, replyText, orgId);

            await this.logAudit({
              orgId,
              conversationId,
              userMessage: messageText,
              intentDetected: 'HANDOFF_REQUEST',
              toolCalls: [{ name: 'handoff_to_human', args: fnArgs }],
              aiResponse: replyText,
              latencyMs: Date.now() - startTime,
              modelUsed: this.modelName,
              isHandoff: true,
            });
            return;
          }

          const toolResult = await toolExecutor.executeTool(fnName, fnArgs);

          if (fnName === 'extract_order_draft' && toolResult?.draft) {
            const d = toolResult.draft;
            if (d.items && d.items.length > 0) {
              memory.sessionState.draftOrder = d;
            }
          }

          if (fnName === 'lookup_odoo_customer' && toolResult?.found) {
            if (toolResult.name) memory.sessionState.customerInfo.name = createConfirmedFact(toolResult.name, 'crm');
            if (toolResult.phone) memory.sessionState.customerInfo.phone = createConfirmedFact(toolResult.phone, 'crm');
            if (toolResult.address) memory.sessionState.customerInfo.address = createConfirmedFact(toolResult.address, 'crm');
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(toolResult),
          });
        }

        response = await this.callGroqApi(apiKey, messages, scopedTools);
        assistantMsg = response?.choices?.[0]?.message;
      }

      // 11. Extract and Sanitize Response
      let generatedReply = assistantMsg?.content || '';

      // If empty response, provide smart contextual recovery
      if (!generatedReply) {
        // Issue #2 fix: Auto-generate product listing from draft when LLM returns empty after extract_order_draft
        const hasExtractedDraftEarly = executedTools.some(t => t.name === 'extract_order_draft');
        const earlyDraftItems = memory.sessionState.draftOrder?.items || [];
        if (hasExtractedDraftEarly && earlyDraftItems.length > 0) {
          const salutation = persona.customerPronoun || 'anh/chị';
          generatedReply = formatFullOrderDeclaration(memory.sessionState.draftOrder, salutation, true);
        } else if (nextDecision.action === 'ASK_CLARIFICATION' && nextDecision.suggestedQuestions?.length) {
          generatedReply = nextDecision.suggestedQuestions[0];
        } else if (nextDecision.action === 'END_CONVERSATION') {
          generatedReply = 'Dạ vâng, mình cứ suy nghĩ nhé. Em sẵn sàng hỗ trợ khi mình cần ạ!';
        } else if (toolResultsSummary) {
          generatedReply = toolResultsSummary;
        } else {
          generatedReply = 'Mình cần em hỗ trợ gì thêm không ạ?';
        }
      }

      // Determine intent flags for Customer-First guardrails
      const isBuyingFlow =
        extracted.buyingIntentLevel === 'HIGH' ||
        extracted.intent === 'ORDER_INTENT' ||
        Boolean(extracted.paymentTerm) ||
        Boolean(memory.sessionState.draftOrder?.items?.length > 0);
      const hasCustomerConcern = extracted.objectionType !== 'NONE' || extracted.intent === 'HANDLE_OBJECTION' || extracted.intent === 'CHECK_PRODUCT_SAFETY';

      // Guardrail sanitization & Anti-Hallucination check
      generatedReply = ChatbotGuardrails.sanitizeOutput(generatedReply);
      generatedReply = ChatbotGuardrails.checkFactHallucination(
        generatedReply,
        memory.sessionState.petInfo.breed.status,
        memory.sessionState.petInfo.breed.value
      );

      // Product Claim Validation
      generatedReply = ClaimValidator.validate(generatedReply);

      const hasExtractedDraft = executedTools.some(t => t.name === 'extract_order_draft');
      const draftItems = memory.sessionState.draftOrder?.items || [];
      hasShownDraftToCustomer = Boolean(memory.sessionState.draftOrder?.hasShownToCustomer);
      const isInitialImageListing = (hasDirectImages || isReexamineImage) && (hasExtractedDraft || !hasShownDraftToCustomer);

      // Detect if user is asking about price/total/payment
      const isPriceOrTotalInquiry = /(?:tổng\s*(?:tiền|đơn|cộng|chi phí)|hết\s*(?:bao\s*nhiêu|nhiêu)|bao\s*nhiêu\s*tiền|giá\s*(?:tổng|tiền|sỉ)|chi\s*phí|thanh\s*toán\s*(?:bao\s*nhiêu|hết\s*nhiêu))/i.test(messageText);

      // Check if generatedReply already includes currency/total information
      const hasPriceInReply = /(?:\d{1,3}(?:\.\d{3})+|\d+)\s*(?:đ|vnđ|đồng)|tổng\s*(?:tiền|cộng|giá\s*trị)/i.test(generatedReply);

      // isListingOrder should ONLY be true for initial image extraction or checking remaining items, NEVER when asking for price
      const isListingOrder = !isPriceOrTotalInquiry && (
        isInitialImageListing ||
        extracted.intent === 'CHECK_REMAINING_ITEMS'
      );

      // Customer-First Guardrails: Strip unsolicited CTA, Empathy control, Response length
      generatedReply = ChatbotGuardrails.stripUnsolicitedCTA(generatedReply, isBuyingFlow);
      generatedReply = ChatbotGuardrails.checkEmpathyOveruse(generatedReply, hasCustomerConcern);
      generatedReply = ChatbotGuardrails.enforceResponseLength(generatedReply, isBuyingFlow, isListingOrder || hasPriceInReply);

      // 11.1 Guaranteed 100% Complete Product List Override & Promotion/Price Inclusion
      // If the message is an order draft listing, verify that ALL items from draft are present in response
      if (isListingOrder && draftItems.length >= 2 && !isPriceOrTotalInquiry) {
        const salutation = persona.customerPronoun || 'anh/chị';

        // Count how many draft items appear in generatedReply
        const mentionedCount = draftItems.filter(it => 
          (it.sku && generatedReply.toUpperCase().includes(it.sku.toUpperCase())) ||
          (it.name && generatedReply.toLowerCase().includes(it.name.toLowerCase().slice(0, 15)))
        ).length;

        const { itemsListStr, unclearListStr } = formatDraftOrderProductList(memory.sessionState.draftOrder, salutation);
        const promoAndPriceStr = formatDraftOrderPromotionsAndPricing(memory.sessionState.draftOrder, salutation);

        // If Gemini omitted items (e.g. only listed 13 or 8 out of 18) OR user specifically asks if there's anything else
        if (mentionedCount < draftItems.length || extracted.intent === 'CHECK_REMAINING_ITEMS') {
          if (mentionedCount < draftItems.length) {
            logger.warn(`[chatbot-service] LLM truncated draft items (${mentionedCount}/${draftItems.length}). Overriding with full official product list and promotions!`);
          }

          if (extracted.intent === 'CHECK_REMAINING_ITEMS') {
            generatedReply = `Dạ em đã kiểm tra lại toàn bộ đơn hàng, hệ thống hiện ghi nhận đầy đủ tất cả ${draftItems.length} sản phẩm của ${salutation} gồm:\n\n${itemsListStr}${unclearListStr}${promoAndPriceStr}\n\nDạ đây là toàn bộ các sản phẩm đã được bóc tách từ phiếu của mình rồi ạ. ${salutation} xem còn món nào mình cần lấy thêm hoặc cần điều chỉnh số lượng không nhé ạ!`;
          } else {
            generatedReply = formatFullOrderDeclaration(memory.sessionState.draftOrder, salutation, isInitialImageListing);
          }
        } else if (isInitialImageListing && !hasPriceInReply && promoAndPriceStr) {
          // Gemini listed all items, but omitted the promotions & pricing section -> attach it automatically
          logger.info('[chatbot-service] LLM omitted promotion/pricing in initial listing. Attaching promotion and price details.');
          const closing = memory.sessionState.draftOrder?.paymentTerm
            ? `\n\nDanh sách trên và các ưu đãi đã chính xác chưa ạ? Nhờ ${salutation} kiểm tra lại giúp em nhé ạ!`
            : `\n\nDanh sách trên và các ưu đãi đã chính xác chưa ạ? Nhờ ${salutation} xem qua và cho em biết mình muốn thanh toán ngay hay trong bao lâu nhé ạ!`;
          generatedReply = `${generatedReply.trim()}\n${promoAndPriceStr}${closing}`;
        }

        if (memory.sessionState.draftOrder) {
          memory.sessionState.draftOrder.hasShownToCustomer = true;
        }
      }

      const hasConfirmedTool = executedTools.some(t => t.name === 'confirm_customer_order');
      const isFinalConfirmation = nextDecision.action === 'CONFIRM_CUSTOMER_ORDER' ||
        hasConfirmedTool ||
        nextDecision.nextState === 'CONFIRMATION' ||
        (Boolean(memory.sessionState.draftOrder?.paymentTerm) && Boolean(memory.sessionState.customerInfo.phone?.value));

      // Guardrail: If draft was already shown to customer, PREVENT intermediate turns from repeating the full product list
      if (hasShownDraftToCustomer && !isInitialImageListing && !isFinalConfirmation && extracted.intent !== 'CHECK_REMAINING_ITEMS' && draftItems.length >= 3) {
        const productLinesCount = (generatedReply.match(/^[ \t]*[-•*]\s*(?:[A-Z0-9]+|[^\n:]+):?\s*\d+\s*(?:gói|cái|túi|hộp)/gim) || []).length;
        if (productLinesCount >= 3 || generatedReply.toLowerCase().includes('danh sách sản phẩm bao gồm đầy đủ')) {
          logger.warn(`[chatbot-service] Intermediate turn attempted to repeat product list (${productLinesCount} items). Trimming redundant product repetition.`);
          if (!memory.sessionState.draftOrder?.paymentTerm) {
            generatedReply = `Dạ cho em biết mình muốn thanh toán ngay hay trong bao lâu nhé ạ!`;
          }
        }
      }

      const allergyCheck = ChatbotGuardrails.checkAllergyConflict(
        generatedReply,
        memory.sessionState.petInfo.allergies.value || []
      );
      if (allergyCheck.conflict) {
        logger.warn(`[chatbot-service] Allergy conflict detected (${allergyCheck.conflictingAllergy}), overriding response.`);
        generatedReply = `Dạ để đảm bảo an toàn cho bé do bé có tiền sử dị ứng ${allergyCheck.conflictingAllergy}, em xin phép chọn lọc lại các dòng thức ăn/que gặm phù hợp nhất cho bé nhà mình ngay ạ!`;
      }

      // 11.2 Intercept Unwanted Stalling/Waiting Messages on Normal Tasks
      const isUnwantedWait = !hasDirectImages && !isReexamineImage && ChatbotGuardrails.detectUnwantedWaitResponse(generatedReply);
      if (isUnwantedWait) {
        logger.warn(`[chatbot-service] Detected unwanted stall response for normal task: "${generatedReply}". Intercepting and resolving concrete answer immediately.`);

        const salutation = persona.customerPronoun || 'anh/chị';

        // Check if query is asking for products / SKUs / codes
        const searchQuery = extracted.skuInquiryQuery || messageText;
        const searchRes = await toolExecutor.searchProduct(searchQuery);

        if (searchRes?.products && searchRes.products.length > 0) {
          const prods = searchRes.products.slice(0, 4);
          const prodLines = prods.map(p => `- ${p.sku}: ${p.name} (Giá sỉ: ${p.formatted_price})`).join('\n');
          generatedReply = `Dạ thông tin sản phẩm mình đang tìm kiếm có mã tương ứng trong hệ thống là:\n\n${prodLines}\n\n${salutation} xem đúng loại mình cần chưa nhé ạ!`;
        } else if (toolResultsSummary) {
          generatedReply = `Dạ em xin gửi thông tin mình quan tâm ạ:\n\n${toolResultsSummary}`;
        }
      }

      // 12. Track Last Question & Pending Slots if AI asked a question
      if (generatedReply.includes('?') || generatedReply.includes('ạ') || generatedReply.includes('nhé')) {
        memory.sessionState.lastAiQuestion = generatedReply;
        if (nextDecision.missingRequiredSlots.length > 0) {
          memory.sessionState.pendingSlots = Array.from(
            new Set([...memory.sessionState.pendingSlots, ...nextDecision.missingRequiredSlots])
          );
        }
      }

      // 12.1 Issue #1 fix: Suppress duplicate waiting messages when ack already sent
      if (ackMsgSent && ackSentAt > 0) {
        const isWaitingReply = ChatbotGuardrails.detectUnwantedWaitResponse(generatedReply) ||
          /(?:đang\s*(?:kiểm tra|đối chiếu|bóc tách|phân tích|xử lý|tiến hành)|đợi em|chờ em|một lát|một chút)/i.test(generatedReply);
        if (isWaitingReply) {
          const elapsedMs = Date.now() - ackSentAt;
          if (elapsedMs < 20000) {
            // Less than 20s since ack → suppress this duplicate waiting message entirely
            logger.info(`[chatbot-service] Suppressing duplicate waiting message (${elapsedMs}ms since ack): "${generatedReply.slice(0, 80)}..."`);
            // Don't send this message, but still persist state and log
            await chatbotStateMachine.updateSessionState(conversationId, orgId, memory.sessionState, nextDecision.nextState);
            await this.logAudit({ orgId, conversationId, userMessage: messageText, intentDetected: intentDetected || nextDecision.action, toolCalls: executedTools, aiResponse: `[SUPPRESSED] ${generatedReply}`, latencyMs: Date.now() - startTime, modelUsed: this.modelName, isHandoff: false });
            return;
          } else {
            // More than 20s elapsed → allow sending a 2nd waiting message
            logger.info(`[chatbot-service] Allowing 2nd waiting message after ${elapsedMs}ms delay`);
          }
        }
      }

      // 13. Send Outbound AI Reply to Zalo
      await this.sendAiResponse(conversationId, zaloAccountId, generatedReply, orgId);

      // 14. Persist updated session state and conversation state
      const resolvedNextState = hasConfirmedTool ? 'CONFIRMATION' : nextDecision.nextState;

      await chatbotStateMachine.updateSessionState(
        conversationId,
        orgId,
        memory.sessionState,
        resolvedNextState
      );

      // 14.1 Emit real-time socket events for order draft auto-population
      if (hasExtractedDraft) {
        zaloPool.getIO()?.emit('chat:order_draft_updated', {
          conversationId,
          draftOrder: memory.sessionState.draftOrder,
        });
      }

      // 14.2 If order was just confirmed, create bell notifications for assigned staff & admins
      if (hasConfirmedTool) {
        const conv = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { contact: { select: { assignedUserId: true } } },
        });
        const assignedUserId = conv?.contact?.assignedUserId || (memory.contact as any)?.assignedUserId || null;

        const targetUsers = await prisma.user.findMany({
          where: {
            orgId,
            isActive: true,
            OR: [
              { role: { in: ['admin', 'owner'] } },
              ...(assignedUserId ? [{ id: assignedUserId }] : []),
            ],
          },
        });

        for (const user of targetUsers) {
          const notif = await prisma.notification.create({
            data: {
              id: randomUUID(),
              userId: user.id,
              type: 'order_needs_confirmation',
              title: 'Cần xác nhận đơn hàng',
              detail: `Khách hàng ${memory.contact?.fullName || 'Chưa rõ'} đã xác nhận chốt đơn. Vui lòng duyệt đơn sang Odoo!`,
              conversationId,
            },
          });
          zaloPool.getIO()?.emit(`notification:created:${user.id}`, {
            notification: {
              id: 'db-' + notif.id,
              type: 'info',
              title: notif.title,
              detail: notif.detail,
              priority: 'high',
              createdAt: notif.createdAt.toISOString(),
              conversationId,
            },
          });
        }

        // Emit conversation state change to frontend so the chat list updates the blinking border
        zaloPool.getIO()?.emit('chat:state_updated', {
          conversationId,
          currentState: 'CONFIRMATION',
          assignedUserId,
        });
      }

      // 15. Record Audit Log (with CTA tracking)
      const hasCTA = /(?:muốn mua|lên đơn|chốt đơn|đặt hàng|ship cho)/i.test(generatedReply);
      await this.logAudit({
        orgId,
        conversationId,
        userMessage: messageText,
        intentDetected,
        toolCalls: executedTools,
        aiResponse: generatedReply,
        latencyMs: Date.now() - startTime,
        modelUsed: this.modelName,
        isHandoff,
        hasCTA,
      });

    } catch (err: any) {
      logger.error('[chatbot-service] processIncomingMessage error:', err.message);
      if (ackMsgSent) {
        try {
          const fallbackReply = 'Dạ em đã kiểm tra lại hình ảnh của mình, do đường truyền hoặc ảnh chưa rõ nên em chưa đọc được hết danh sách. Nhờ mình gửi lại hoặc nhắn tên các món giúp em với nhé ạ!';
          await this.sendAiResponse(conversationId, zaloAccountId, fallbackReply, orgId);
        } catch (e) {
          // ignore secondary error
        }
      }
    } finally {
      this.activeProcessingLocks.delete(conversationId);
    }
  }

  /**
   * Call LLM OpenAI-compatible Chat Completions API with automatic 429 backoff retry
   */
  private async callGroqApi(apiKey: string, messages: any[], tools: any[], maxRetries = 2): Promise<any> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(this.LLM_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          signal: AbortSignal.timeout(75000),
          body: JSON.stringify({
            model: this.modelName,
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.5,
            max_tokens: 3500,
          }),
        });

        if (res.status === 429 && attempt < maxRetries) {
          const errText = await res.text();
          let waitSec = 8;
          const match = errText.match(/try again in ([\d\.]+)s/i);
          if (match && match[1]) {
            waitSec = Math.ceil(parseFloat(match[1])) + 2;
          }
          logger.warn(`[chatbot-service] Groq Rate limit hit, backing off ${waitSec}s before retry (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Groq API HTTP ${res.status}: ${errText}`);
        }

        return await res.json();
      } catch (err: any) {
        if (attempt === maxRetries) throw err;
        logger.warn(`[chatbot-service] Groq call error: ${err.message}, retrying in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  /**
   * Helper to split long text into multiple well-formed message chunks
   */
  private splitMessageIntoChunks(text: string, maxLen = 950): string[] {
    if (!text || text.length <= maxLen) return [text];

    const lines = text.split('\n');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const line of lines) {
      if ((currentChunk + '\n' + line).length > maxLen && currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = line;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n' + line : line;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * Send outbound AI message through ZaloPool and persist to DB.
   * If message is long, automatically splits and sends sequential messages.
   */
  private async sendAiResponse(
    conversationId: string,
    zaloAccountId: string,
    text: string,
    orgId: string,
  ): Promise<void> {
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });

      if (!conv?.externalThreadId) {
        logger.warn(`[chatbot-service] No externalThreadId for conv ${conversationId}`);
        return;
      }

      const isTestConversation = conv.externalThreadId.startsWith('test_');
      const chunks = this.splitMessageIntoChunks(text, 950);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (i === 0) {
          // Simulated typing delay (1.2s for real Zalo, 300ms for test sandbox)
          await new Promise(resolve => setTimeout(resolve, isTestConversation ? 300 : 1200));
        } else {
          // Small pause between sequential multi-part messages
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        // Mark as AI outbound so listener does NOT auto-pause AI and tags isAi: true
        markAiMessageSending(conversationId, chunk);

        if (isTestConversation) {
          // Test conversation: save directly to DB and emit via Socket.IO
          const message = await prisma.message.create({
            data: {
              id: randomUUID(),
              conversationId,
              senderType: 'self',
              content: chunk,
              contentType: 'text',
              isAi: true,
              sentAt: new Date(),
            } as any,
          });

          await prisma.conversation.update({
            where: { id: conversationId },
            data: {
              lastMessageAt: new Date(),
              isReplied: true,
              unreadCount: 0,
            },
          });

          // Emit Socket.IO event for real-time Test Console update
          const io = zaloPool.getIO();
          io?.emit('chat:message', {
            accountId: zaloAccountId,
            message,
            conversationId,
          });
        } else {
          const instance = zaloPool.getInstance(zaloAccountId);
          if (instance && instance.api) {
            // Send outbound message to real Zalo
            try {
              await instance.api.sendMessage(
                { msg: chunk },
                conv.externalThreadId,
                conv.threadType === 'group' ? 1 : 0
              );
              logger.info(`[chatbot-service] Sent AI reply chunk ${i + 1}/${chunks.length} via Zalo API to conv ${conversationId}`);
            } catch (e: any) {
              logger.warn(`[chatbot-service] Failed to deliver chunk ${i + 1} via Zalo API: ${e.message}`);
            }
          } else {
            logger.info(`[chatbot-service] Zalo account ${zaloAccountId} offline (saved to CRM database fallback)`);
            await prisma.message.create({
              data: {
                conversationId,
                senderType: 'self',
                content: chunk,
                contentType: 'text',
                isAi: true,
                sentAt: new Date(),
              } as any,
            });

            await prisma.conversation.update({
              where: { id: conversationId },
              data: {
                lastMessageAt: new Date(),
                isReplied: true,
              },
            });
          }
        }
      }

      logger.info(`[chatbot-service] Saved & Sent AI reply (${chunks.length} chunks) to conv ${conversationId}`);
    } catch (err: any) {
      logger.error('[chatbot-service] sendAiResponse error:', err.message);
    }
  }

  /**
   * Record Audit Log for Observability
   */
  private async logAudit(data: {
    orgId: string;
    conversationId: string;
    userMessage: string;
    intentDetected: string;
    toolCalls: any[];
    aiResponse: string;
    latencyMs: number;
    modelUsed: string;
    isHandoff: boolean;
    hasCTA?: boolean;
  }) {
    try {
      await prisma.aiAuditLog.create({
        data: {
          orgId: data.orgId,
          conversationId: data.conversationId,
          userMessage: data.userMessage,
          intentDetected: data.intentDetected,
          toolCalls: data.toolCalls,
          aiResponse: data.aiResponse,
          latencyMs: data.latencyMs,
          modelUsed: data.modelUsed,
          isHandoff: data.isHandoff,
        },
      });

      await prisma.activityLog.create({
        data: {
          orgId: data.orgId,
          action: 'ai_reply',
          entityType: 'conversation',
          entityId: data.conversationId,
          details: {
            userMessage: data.userMessage,
            intentDetected: data.intentDetected,
            toolCalls: data.toolCalls,
            aiResponse: data.aiResponse,
            latencyMs: data.latencyMs,
            modelUsed: data.modelUsed,
            isHandoff: data.isHandoff,
          },
        },
      });
    } catch (err: any) {
      logger.warn('[chatbot-service] logAudit failed:', err.message);
    }
  }

  /**
   * Automatically evaluates recent customer messages and replies when AI is resumed/activated.
   * Differentiates Case A (Customer inquiry/purchase -> Auto-reply) vs Case B (Gratitude/closing -> No reply).
   */
  async checkAndAutoReplyOnResume(conversationId: string, orgId: string): Promise<void> {
    try {
      // 1. Verify eligibility for AI reply
      const eligibility = await chatbotStateMachine.canAiReply(conversationId);
      if (!eligibility.canReply || !eligibility.conversation) {
        logger.info(`[chatbot-service] checkAndAutoReplyOnResume: AI not eligible for conv ${conversationId}: ${eligibility.reason}`);
        return;
      }

      const conv = eligibility.conversation;
      const zaloAccountId = conv.zaloAccountId;
      if (!zaloAccountId) return;

      // 2. Fetch the recent messages
      const recentMessages = await prisma.message.findMany({
        where: { conversationId, isDeleted: false },
        orderBy: { sentAt: 'asc' },
        take: 15,
      });

      if (recentMessages.length === 0) return;

      // 3. Evaluate pending customer intent (Case A vs Case B)
      const evaluation = PersonaToneExtractor.evaluatePendingCustomerIntent(recentMessages);
      if (!evaluation.shouldReply || !evaluation.pendingText) {
        logger.info(`[chatbot-service] checkAndAutoReplyOnResume for conv ${conversationId}: ${evaluation.reason}. No auto-reply sent.`);
        return;
      }

      logger.info(
        `[chatbot-service] checkAndAutoReplyOnResume: Triggering auto-reply for Case A message: "${evaluation.pendingText.slice(0, 80)}" in conv ${conversationId}`
      );

      // 4. Process incoming message automatically
      await this.processIncomingMessage(
        conversationId,
        evaluation.pendingText,
        orgId,
        zaloAccountId,
        conv.contactId || undefined
      );
    } catch (err: any) {
      logger.error(`[chatbot-service] checkAndAutoReplyOnResume error for conv ${conversationId}:`, err.message);
    }
  }

  /**
   * Helper to send bell notifications to CRM staff when a human handoff occurs
   */
  private async notifyStaffHandoff(
    orgId: string,
    conversationId: string,
    customerName: string | null | undefined,
    reason: string
  ) {
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { contact: { select: { assignedUserId: true } } },
      });
      const assignedUserId = conv?.contact?.assignedUserId || null;

      const targetUsers = await prisma.user.findMany({
        where: {
          orgId,
          isActive: true,
          OR: [
            { role: { in: ['admin', 'owner'] } },
            ...(assignedUserId ? [{ id: assignedUserId }] : []),
          ],
        },
      });

      const title = 'Khách hàng yêu cầu hỗ trợ';
      const detail = `Khách hàng ${customerName || 'Chưa rõ'} cần gặp nhân viên: ${reason}`;

      for (const user of targetUsers) {
        const notif = await prisma.notification.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            type: 'customer_needs_human',
            title,
            detail,
            conversationId,
          },
        });

        zaloPool.getIO()?.emit(`notification:created:${user.id}`, {
          notification: {
            id: 'db-' + notif.id,
            type: 'warning',
            title: notif.title,
            detail: notif.detail,
            priority: 'high',
            createdAt: notif.createdAt.toISOString(),
            conversationId,
          },
        });
      }
    } catch (err: any) {
      logger.error('[chatbot-service] notifyStaffHandoff error:', err.message);
    }
  }

  /**
   * Helper to perform silent handoff to human staff when encountering an unhandled situation:
   * - Pauses AI for the conversation
   * - Updates DB currentState to 'HUMAN_REQUESTED'
   * - Emits socket event to CRM frontend
   * - Creates bell notification for CRM staff
   * - Records audit log
   * - DOES NOT send any reply to customer (100% silent)
   */
  private async executeSilentHandoff(
    conversationId: string,
    orgId: string,
    customerName: string | null | undefined,
    reason: string,
    userMessage: string,
    startTime: number
  ) {
    try {
      await chatbotStateMachine.pauseAi(conversationId, reason);
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { currentState: 'HUMAN_REQUESTED' },
      });
      zaloPool.getIO()?.emit('chat:state_updated', {
        conversationId,
        currentState: 'HUMAN_REQUESTED',
        aiPaused: true,
        handoffReason: reason,
      });

      // Notify CRM staff via bell notification
      await this.notifyStaffHandoff(orgId, conversationId, customerName, reason);

      await this.logAudit({
        orgId,
        conversationId,
        userMessage,
        intentDetected: 'UNHANDLED_SITUATION',
        toolCalls: [{ name: 'handoff_to_human', args: { reason, silent: true } }],
        aiResponse: '[SILENT_HANDOFF - NO_REPLY_SENT_TO_CUSTOMER]',
        latencyMs: Date.now() - startTime,
        modelUsed: this.modelName || 'next-action-engine',
        isHandoff: true,
      });
      logger.info(`[chatbot-service] Silent handoff executed for conversation ${conversationId}. AI paused, staff notified, 0 message sent to customer.`);
    } catch (err: any) {
      logger.error('[chatbot-service] executeSilentHandoff error:', err.message);
    }
  }
}

export const chatbotService = new ChatbotService();
