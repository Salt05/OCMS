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
  private get LLM_API_URL(): string {
    return config.llm?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  }
  private get modelName(): string {
    return config.llm?.model || config.groq?.model || 'gemini-3.5-flash-lite';
  }

  /**
   * Main entry point for processing incoming messages
   */
  async processIncomingMessage(
    conversationId: string,
    messageText: string,
    orgId: string,
    zaloAccountId: string,
    contactId?: string
  ): Promise<void> {
    const startTime = Date.now();
    let isHandoff = false;
    let intentDetected = 'GENERAL';
    const executedTools: Array<{ name: string; args: any }> = [];

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

      // 4. Load 3-Tier Memory Context
      const memory = await chatbotStateMachine.loadMemoryContext(conversationId, orgId);
      const toolExecutor = new ChatbotToolExecutor(orgId, conversationId, contactId);

      // 5. Rule-based Slot Extractor
      const extracted = SlotExtractor.extract(messageText, memory.sessionState.pendingSlots);
      intentDetected = extracted.intent;

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

      // 7. Next Action Engine Decision
      const nextDecision: NextActionDecision = NextActionEngine.decide(
        memory.currentState,
        memory.sessionState.petInfo,
        memory.sessionState.customerInfo,
        extracted,
        memory.sessionState.lastAiQuestion,
        memory.sessionState.pendingSlots
      );

      let toolResultsSummary: string | undefined;

      // 8. Execute Deterministic Tools based on Next Action
      if (nextDecision.action === 'HANDOFF_HUMAN') {
        isHandoff = true;
        await chatbotStateMachine.pauseAi(conversationId, nextDecision.handoffReason || 'Khách yêu cầu hỗ trợ trực tiếp');
        const replyText = 'Dạ em xin phép kết nối ngay với Chuyên viên tư vấn LA PET để hỗ trợ trực tiếp cho mình nhé ạ. Chuyên viên sẽ phản hồi lại ngay sau ít phút!';
        await this.sendAiResponse(conversationId, zaloAccountId, replyText, orgId);
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
          toolResultsSummary = `Chi tiết sản phẩm [${detailResult.sku}] ${detailResult.name}: Thành phần: ${detailResult.ingredients || 'Chưa có thông tin xác nhận trong CSDL'}, Đối tượng: ${detailResult.target || 'Chưa có thông tin xác nhận'}, Độ tuổi tối thiểu: ${detailResult.suitable_min_age_months !== null ? detailResult.suitable_min_age_months + ' tháng' : 'Chưa có dữ liệu xác nhận trong CSDL'}, Giá sỉ: ${detailResult.formatted_price}`;
        }
      } else if (nextDecision.action === 'SEARCH_PRODUCT' && nextDecision.productSearchQuery) {
        const queryParams = nextDecision.productSearchQuery;
        const searchResult = await toolExecutor.searchProduct(
          queryParams.query,
          queryParams.petType,
          queryParams.excludeIngredients,
          queryParams.ageMonths,
          queryParams.texturePreference
        );
        executedTools.push({ name: 'search_product', args: queryParams });

        if (searchResult?.products && searchResult.products.length > 0) {
          toolResultsSummary = searchResult.products
            .map((p: any, idx: number) => `${idx + 1}. [Mã ${p.sku}] ${p.name} - Giá sỉ: ${p.formatted_price} (${p.specification}) - Đặc điểm: ${p.highlights}`)
            .join('\n');
        }
      }

      // 9. Build Context & Messages
      const systemPrompt = ContextBuilder.buildSystemPrompt({
        pet: memory.sessionState.petInfo,
        customer: memory.sessionState.customerInfo,
        currentState: memory.currentState,
        nextDecision,
        lastAiQuestion: memory.sessionState.lastAiQuestion,
        pendingSlots: memory.sessionState.pendingSlots,
        draftOrder: memory.sessionState.draftOrder,
        toolResultsSummary,
      });

      const messages: any[] = [{ role: 'system', content: systemPrompt }];

      // Inject clean short-term history
      for (const msg of memory.shortTermMessages.slice(-8)) {
        messages.push({
          role: msg.senderType === 'self' ? 'assistant' : 'user',
          content: msg.content || '',
        });
      }

      // Append current user message
      messages.push({ role: 'user', content: messageText });

      // 10. Call LLM with Tool Calling Loop
      const apiKey = config.llm?.apiKey || config.groq?.apiKey || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || '';
      if (!apiKey) {
        logger.warn('[chatbot-service] LLM API key (GEMINI_API_KEY/GROQ_API_KEY) is not configured in environment!');
        return;
      }

      let response = await this.callGroqApi(apiKey, messages, CHATBOT_TOOL_DEFINITIONS);
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
            await chatbotStateMachine.pauseAi(conversationId, fnArgs.reason || 'Khách yêu cầu hỗ trợ trực tiếp');
          }

          const toolResult = await toolExecutor.executeTool(fnName, fnArgs);

          if (fnName === 'extract_order_draft' && toolResult?.draft) {
            const d = toolResult.draft;
            if (d.items && d.items.length > 0) {
              memory.sessionState.draftOrder = {
                items: d.items.map((it: any) => ({
                  sku: it.sku || '',
                  name: it.matchedProductName || it.productNameRaw || '',
                  qty: it.quantity || 1,
                  price: it.priceUnit || 0,
                })),
                recipientName: d.customer?.name || memory.contact?.fullName || undefined,
                phone: d.customer?.phone || memory.contact?.phone || undefined,
                address: d.shippingAddress?.fullAddress || memory.contact?.address || undefined,
                subtotal: d.totalAmount || 0,
              };
            }
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(toolResult),
          });
        }

        response = await this.callGroqApi(apiKey, messages, CHATBOT_TOOL_DEFINITIONS);
        assistantMsg = response?.choices?.[0]?.message;
      }

      // 11. Extract and Sanitize Response
      let generatedReply = assistantMsg?.content || '';

      // If empty response, provide smart contextual recovery
      if (!generatedReply) {
        if (nextDecision.action === 'ASK_CLARIFICATION' && nextDecision.suggestedQuestions?.length) {
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
      const isBuyingFlow = extracted.buyingIntentLevel === 'HIGH' || extracted.intent === 'ORDER_INTENT';
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

      // Customer-First Guardrails: Strip unsolicited CTA, Empathy control, Response length
      generatedReply = ChatbotGuardrails.stripUnsolicitedCTA(generatedReply, isBuyingFlow);
      generatedReply = ChatbotGuardrails.checkEmpathyOveruse(generatedReply, hasCustomerConcern);
      generatedReply = ChatbotGuardrails.enforceResponseLength(generatedReply, isBuyingFlow);

      const allergyCheck = ChatbotGuardrails.checkAllergyConflict(
        generatedReply,
        memory.sessionState.petInfo.allergies.value || []
      );
      if (allergyCheck.conflict) {
        logger.warn(`[chatbot-service] Allergy conflict detected (${allergyCheck.conflictingAllergy}), overriding response.`);
        generatedReply = `Dạ để đảm bảo an toàn cho bé do bé có tiền sử dị ứng ${allergyCheck.conflictingAllergy}, em xin phép chọn lọc lại các dòng thức ăn/que gặm phù hợp nhất cho bé nhà mình ngay ạ!`;
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

      // 13. Send Outbound AI Reply to Zalo
      await this.sendAiResponse(conversationId, zaloAccountId, generatedReply, orgId);

      // 14. Persist updated session state and conversation state
      await chatbotStateMachine.updateSessionState(
        conversationId,
        orgId,
        memory.sessionState,
        nextDecision.nextState
      );

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
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            model: this.modelName,
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.5,
            max_tokens: 1024,
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
   * Send outbound AI message through ZaloPool and persist to DB
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

      // Simulated typing delay (1.2s) to mimic human response and prevent Zalo spam detection
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Mark as AI outbound so listener does NOT auto-pause AI and tags isAi: true
      markAiMessageSending(conversationId, text);

      const instance = zaloPool.getInstance(zaloAccountId);
      if (instance && instance.api) {
        // Send outbound message to real Zalo
        try {
          await instance.api.sendMessage(
            { msg: text },
            conv.externalThreadId,
            conv.threadType === 'group' ? 1 : 0
          );
          logger.info(`[chatbot-service] Sent AI reply via Zalo API to conv ${conversationId}`);
        } catch (e: any) {
          logger.warn(`[chatbot-service] Failed to deliver via Zalo API: ${e.message}`);
        }
      } else {
        logger.info(`[chatbot-service] Zalo account ${zaloAccountId} offline (saved to CRM database fallback)`);
        await prisma.message.create({
          data: {
            conversationId,
            senderType: 'self',
            content: text,
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

      logger.info(`[chatbot-service] Saved & Sent AI reply to conv ${conversationId}`);
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
}

export const chatbotService = new ChatbotService();
