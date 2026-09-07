/**
 * CLI Interactive Chat Test Tool for LA PET AI Chatbot (Groq Engine).
 * Upgraded to use Conversation Agent Architecture:
 * - Customer Fact Integrity (CONFIRMED / UNKNOWN / INFERRED)
 * - Deterministic Slot Extractor
 * - Next Action Engine
 * - Context Builder with Anti-Hallucination rules
 */
import fs from 'node:fs';
import path from 'node:path';

// Automatically load .env if available
try {
  if (typeof process.loadEnvFile === 'function') {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  }
} catch (e) {
  // Ignore if already loaded
}

process.env.NODE_ENV = 'production';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { prisma } from '../shared/database/prisma-client.js';
import { config } from '../config/index.js';
import { chatbotStateMachine } from '../modules/chatbot/chatbot-state-machine.js';
import { CHATBOT_TOOL_DEFINITIONS, ChatbotToolExecutor } from '../modules/chatbot/chatbot-tools.js';
import { ChatbotGuardrails } from '../modules/chatbot/chatbot-guardrails.js';
import { knowledgeService } from '../modules/chatbot/knowledge-service.js';
import { SlotExtractor } from '../modules/chatbot/slot-extractor.js';
import { NextActionEngine } from '../modules/chatbot/next-action-engine.js';
import { ContextBuilder } from '../modules/chatbot/context-builder.js';
import { ClaimValidator } from '../modules/chatbot/claim-validator.js';

// ANSI Color Helpers for Rich Terminal Output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

function getLlmApiUrl(): string {
  return config.llm?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
}

async function callLlmApi(apiKey: string, model: string, messages: any[], tools: any[], maxRetries = 3) {
  const apiUrl = getLlmApiUrl();
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          model,
          messages,
          tools,
          tool_choice: 'auto',
          temperature: 0.5,
          max_tokens: 1024,
        }),
      });

      if (res.status === 429) {
        const errText = await res.text();
        if (attempt < maxRetries) {
          let waitSec = 8;
          const match = errText.match(/try again in ([\d\.]+)s/i);
          if (match && match[1]) {
            waitSec = Math.ceil(parseFloat(match[1])) + 1;
          }
          console.log(`${colors.yellow}⏳ [Rate Limit] Đang tự động đợi ${waitSec}s trước khi tiếp tục lượt ${attempt + 1}...${colors.reset}`);
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }
        throw new Error(`LLM API Rate Limit: ${errText}`);
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`LLM API HTTP ${res.status} (${apiUrl}): ${errText}`);
      }

      return await res.json();
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      console.log(`${colors.yellow}⚠️ [Lỗi kết nối AI LLM] ${err.message}. Đang thử lại trong 3s...${colors.reset}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function setupTestEnvironment() {
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: { name: 'LA PET Vietnam Corp' },
    });
  }

  let user = await prisma.user.findFirst({
    where: { orgId: org.id },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        orgId: org.id,
        email: 'admin@example.com',
        passwordHash: 'dummy_hash',
        fullName: 'Quản trị viên Hệ thống',
        role: 'admin',
      },
    });
  }

  let zaloAccount = await prisma.zaloAccount.findFirst({
    where: { orgId: org.id },
  });
  if (!zaloAccount) {
    zaloAccount = await prisma.zaloAccount.create({
      data: {
        orgId: org.id,
        ownerUserId: user.id,
        zaloUid: 'cli_test_zalo_account',
        displayName: 'LA PET Official CSKH',
        aiAutoReply: true,
      },
    });
  } else if (!zaloAccount.aiAutoReply) {
    zaloAccount = await prisma.zaloAccount.update({
      where: { id: zaloAccount.id },
      data: { aiAutoReply: true },
    });
  }

  let contact = await prisma.contact.findFirst({
    where: {
      orgId: org.id,
      phone: '0988776655',
    },
  });
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        fullName: 'Nguyễn Hoàng Minh (Khách Test CLI)',
        zaloName: 'Minh Hoàng',
        phone: '0988776655',
        contactType: 'customer',
        address: '72 Lê Thánh Tôn, Quận 1, TP.HCM',
      },
    });
  }

  let conversation = await prisma.conversation.findFirst({
    where: {
      orgId: org.id,
      contactId: contact.id,
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        orgId: org.id,
        zaloAccountId: zaloAccount.id,
        contactId: contact.id,
        externalThreadId: `cli_thread_${Date.now()}`,
        threadType: 'user',
        aiActive: true,
        aiPaused: false,
        currentState: 'NEW',
      },
    });
  } else {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        aiActive: true,
        aiPaused: false,
        pausedUntil: null,
        handoffReason: null,
      },
    });
  }

  await knowledgeService.seedDefaultKnowledgeIfEmpty(org.id);

  return { org, zaloAccount, contact, conversation };
}

async function startCliChat() {
  console.clear();
  console.log(`${colors.cyan}${colors.bold}`);
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║       🐾 LA PET CRM - CÔNG CỤ TEST CONVERSATION AGENT CLI        ║');
  console.log('║  (Fact Integrity • Slot Filling • State Machine • Next Action)   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log(`${colors.reset}`);

  const apiKey = config.llm?.apiKey || config.groq?.apiKey || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || '';
  const modelName = config.llm?.model || config.groq?.model || process.env.GEMINI_MODEL || process.env.GROQ_MODEL || 'gemini-flash-lite-latest';
  const provider = config.llm?.provider === 'gemini' || process.env.GEMINI_API_KEY ? 'Google Gemini' : 'Groq Cloud';

  if (!apiKey) {
    console.log(`${colors.red}❌ LỖI: Chưa cấu hình GEMINI_API_KEY hoặc GROQ_API_KEY trong file .env!${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.gray}⚙️  Đang khởi tạo môi trường thử nghiệm và kết nối CSDL...${colors.reset}`);
  let { org, zaloAccount, contact, conversation } = await setupTestEnvironment();

  console.log(`${colors.green}✓ Sẵn sàng!${colors.reset}`);
  console.log(`${colors.dim}-------------------------------------------------------------------`);
  console.log(`• Provider:        ${colors.cyan}${colors.bold}${provider}${colors.reset}`);
  console.log(`• Model AI:        ${colors.bold}${modelName}${colors.reset}`);
  console.log(`• Khách hàng test: ${colors.bold}${contact.fullName}${colors.reset} (SĐT: ${contact.phone})`);
  console.log(`• Hội thoại ID:    ${colors.gray}${conversation.id}${colors.reset}`);
  console.log(`${colors.dim}-------------------------------------------------------------------`);
  console.log(`${colors.yellow}💡 Các lệnh nhanh trong terminal:`);
  console.log(`   /reset    : Xóa lịch sử, reset ngữ cảnh thú cưng và bắt đầu hội thoại mới`);
  console.log(`   /state    : Xem trạng thái Facts, Slots, State Machine & Pending Slots`);
  console.log(`   /history  : Xem lại toàn bộ lịch sử tin nhắn`);
  console.log(`   /clear    : Xóa sạch màn hình console`);
  console.log(`   /exit     : Thoát chương trình test`);
  console.log(`${colors.dim}-------------------------------------------------------------------${colors.reset}\n`);

  const rl = readline.createInterface({ input, output });

  while (true) {
    try {
      const userMessage = await rl.question(`${colors.green}${colors.bold}👤 Bạn (Khách hàng) > ${colors.reset}`);
      const trimmed = userMessage.trim();

      if (!trimmed) continue;

      if (trimmed.toLowerCase() === '/exit' || trimmed.toLowerCase() === 'exit') {
        console.log(`\n${colors.cyan}👋 Đã thoát phiên kiểm thử Chatbot. Hẹn gặp lại!${colors.reset}\n`);
        break;
      }

      if (trimmed.toLowerCase() === '/clear') {
        console.clear();
        continue;
      }

      if (trimmed.toLowerCase() === '/reset') {
        console.log(`\n${colors.yellow}🔄 Đang reset phiên hội thoại...${colors.reset}`);
        await prisma.message.deleteMany({ where: { conversationId: conversation.id } });
        await prisma.conversationAiState.deleteMany({ where: { conversationId: conversation.id } });
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            currentState: 'NEW',
            aiActive: true,
            aiPaused: false,
            pausedUntil: null,
            handoffReason: null,
          },
        });
        console.log(`${colors.green}✓ Đã làm mới hoàn toàn lịch sử và bộ nhớ hội thoại!${colors.reset}\n`);
        continue;
      }

      if (trimmed.toLowerCase() === '/state') {
        const mem = await chatbotStateMachine.loadMemoryContext(conversation.id, org.id);
        console.log(`\n${colors.magenta}${colors.bold}=== TRẠNG THÁI FACTS & STATE MACHINE ===${colors.reset}`);
        console.log(`Current State: ${colors.bold}${mem.currentState}${colors.reset}`);
        console.log(`Last AI Question: "${mem.sessionState.lastAiQuestion || 'None'}"`);
        console.log(`Pending Slots: [${mem.sessionState.pendingSlots.join(', ')}]`);
        console.log('\n🐾 PET PROFILE (FACTS):');
        console.log(JSON.stringify(mem.sessionState.petInfo, null, 2));
        console.log('\n👤 CUSTOMER PROFILE (FACTS):');
        console.log(JSON.stringify(mem.sessionState.customerInfo, null, 2));
        console.log(`${colors.magenta}========================================${colors.reset}\n`);
        continue;
      }

      if (trimmed.toLowerCase() === '/history') {
        const msgs = await prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { sentAt: 'asc' },
        });
        console.log(`\n${colors.cyan}${colors.bold}=== LỊCH SỬ TIN NHẮN (${msgs.length} tin) ===${colors.reset}`);
        for (const m of msgs) {
          const sender = m.senderType === 'contact' ? `${colors.green}Khách hàng` : `${colors.cyan}Chatbot AI`;
          console.log(`[${m.sentAt.toLocaleTimeString('vi-VN')}] ${sender}: ${colors.reset}${m.content}`);
        }
        console.log(`${colors.cyan}===========================================${colors.reset}\n`);
        continue;
      }

      // 1. Lưu tin nhắn của Khách hàng vào Database
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'contact',
          content: trimmed,
          contentType: 'text',
          sentAt: new Date(),
        },
      });

      // 2. Bắt đầu xử lý phản hồi AI
      process.stdout.write(`${colors.gray}💭 [AI đang phân tích Intent & Facts...]${colors.reset}\r`);
      const startTime = Date.now();

      // Guardrail Check
      const medicalCheck = ChatbotGuardrails.checkMedicalSafety(trimmed);
      if (medicalCheck.isMedicalEmergency && medicalCheck.warningAdvice) {
        console.log(`\r${' '.repeat(50)}\r`);
        console.log(`${colors.red}${colors.bold}🚨 [GUARDRAIL: CẢNH BÁO Y TẾ KHẨN CẤP]${colors.reset}`);
        console.log(`${colors.cyan}${colors.bold}🐾 LA PET Bot:${colors.reset} ${medicalCheck.warningAdvice}\n`);
        continue;
      }

      // Load Memory
      const memory = await chatbotStateMachine.loadMemoryContext(conversation.id, org.id);
      const toolExecutor = new ChatbotToolExecutor(org.id, conversation.id, contact.id);

      // Slot Extraction & Facts Update
      const extracted = SlotExtractor.extract(trimmed, memory.sessionState.pendingSlots);
      console.log(`\r${' '.repeat(50)}\r`);
      console.log(`${colors.gray}🔍 [SLOT EXTRACT] Intent: ${colors.bold}${extracted.intent}${colors.reset}${colors.gray}, Extracted: ${JSON.stringify(extracted.answeredPendingSlots)}${colors.reset}`);

      SlotExtractor.applyExtractedSlots(
        memory.sessionState.petInfo,
        memory.sessionState.customerInfo,
        extracted
      );

      if (extracted.answeredPendingSlots.length > 0) {
        memory.sessionState.pendingSlots = memory.sessionState.pendingSlots.filter(
          s => !extracted.answeredPendingSlots.includes(s)
        );
      }

      // Next Action Decision Engine
      const nextDecision = NextActionEngine.decide(
        memory.currentState,
        memory.sessionState.petInfo,
        memory.sessionState.customerInfo,
        extracted,
        memory.sessionState.lastAiQuestion,
        memory.sessionState.pendingSlots
      );

      console.log(`${colors.magenta}🎯 [NEXT ACTION] ${colors.bold}${nextDecision.action}${colors.reset}${colors.magenta} -> Next State: ${nextDecision.nextState} (${nextDecision.reason})${colors.reset}`);

      let toolResultsSummary = '';

      if (nextDecision.action === 'HANDOFF_HUMAN') {
        console.log(`${colors.red}🔔 [HANDOFF] Bàn giao nhân viên: ${nextDecision.handoffReason}${colors.reset}`);
        await chatbotStateMachine.pauseAi(conversation.id, nextDecision.handoffReason || 'Khách yêu cầu hỗ trợ trực tiếp');
        const handoffReply = 'Dạ em xin phép kết nối ngay với Chuyên viên tư vấn LA PET để hỗ trợ trực tiếp cho mình nhé ạ. Chuyên viên sẽ phản hồi lại ngay sau ít phút!';
        console.log(`${colors.cyan}${colors.bold}🐾 LA PET Bot:${colors.reset} ${handoffReply}\n`);
        continue;
      }

      if (nextDecision.action === 'COMPARE_PRODUCTS' && nextDecision.comparisonSkus) {
        const compResult = await toolExecutor.executeTool('compare_products', { skus: nextDecision.comparisonSkus });
        console.log(`${colors.yellow}🛠️  [DETERMINISTIC COMPARE] So sánh ${compResult?.compared_count || 0} sản phẩm.${colors.reset}`);
        if (compResult?.summary) {
          toolResultsSummary = compResult.summary;
        }
      } else if (nextDecision.action === 'GET_PRODUCT_DETAIL' && nextDecision.targetSku) {
        const detailResult = await toolExecutor.executeTool('get_product_detail', { sku: nextDecision.targetSku });
        console.log(`${colors.yellow}🛠️  [DETERMINISTIC DETAIL] Tra cứu chi tiết sản phẩm: ${nextDecision.targetSku}${colors.reset}`);
        if (detailResult?.found) {
          toolResultsSummary = `Chi tiết sản phẩm [${detailResult.sku}] ${detailResult.name}: Ngành hàng: ${detailResult.category || 'Chưa phân loại'}, Thương hiệu: ${detailResult.brand || 'LA PET'}, Thành phần: ${detailResult.ingredients || 'Chưa có thông tin xác nhận trong CSDL'}, Đối tượng: ${detailResult.target || 'Chưa có thông tin xác nhận'}, Độ tuổi tối thiểu: ${detailResult.suitable_min_age_months !== null ? detailResult.suitable_min_age_months + ' tháng' : 'Chưa có dữ liệu xác nhận trong CSDL'}, Giá sỉ: ${detailResult.formatted_price}`;
        }
      } else if (nextDecision.action === 'SEARCH_PRODUCT' && nextDecision.productSearchQuery) {
        const qParams = nextDecision.productSearchQuery;
        const searchResult = await toolExecutor.searchProduct(
          qParams.query,
          qParams.petType,
          qParams.excludeIngredients,
          qParams.ageMonths,
          qParams.texturePreference,
          qParams.category,
          qParams.brand
        );
        console.log(`${colors.yellow}🛠️  [DETERMINISTIC SEARCH] Tìm thấy ${searchResult?.products?.length || 0} sản phẩm phù hợp.${colors.reset}`);
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

      // Build Messages Context
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

      for (const msg of memory.shortTermMessages.slice(-6)) {
        messages.push({
          role: msg.senderType === 'self' ? 'assistant' : 'user',
          content: msg.content || '',
        });
      }

      messages.push({ role: 'user', content: trimmed });

      // Execute Tool Calling Loop
      let response = await callLlmApi(apiKey, modelName, messages, CHATBOT_TOOL_DEFINITIONS);
      let assistantMsg = response.choices?.[0]?.message;
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

          console.log(`${colors.yellow}🛠️  [TOOL CALL] ${colors.bold}${fnName}${colors.reset}${colors.yellow}(${JSON.stringify(fnArgs)})${colors.reset}`);

          if (fnName === 'handoff_to_human') {
            console.log(`${colors.red}🔔 [HANDOFF] Bàn giao nhân viên: ${fnArgs.reason || 'Yêu cầu hỗ trợ trực tiếp'}${colors.reset}`);
            await chatbotStateMachine.pauseAi(conversation.id, fnArgs.reason || 'Khách yêu cầu hỗ trợ trực tiếp');
          }

          const toolResult = await toolExecutor.executeTool(fnName, fnArgs);

          if (fnName === 'extract_order_draft' && toolResult?.draft) {
            const itemCount = toolResult?.draft?.items?.length || 0;
            console.log(`${colors.magenta}   🛒 [ĐƠN HÀNG NHÁP] ${itemCount} sản phẩm, Tổng tiền: ${(toolResult?.draft?.totalAmount || 0).toLocaleString('vi-VN')}đ${colors.reset}`);
            if (toolResult?.draft?.items) {
              memory.sessionState.draftOrder = {
                items: toolResult.draft.items.map((it: any) => ({
                  sku: it.sku || '',
                  name: it.matchedProductName || it.productNameRaw || '',
                  qty: it.quantity || 1,
                  price: it.priceUnit || 0,
                })),
                recipientName: toolResult.draft.customer?.name || memory.contact?.fullName || undefined,
                phone: toolResult.draft.customer?.phone || memory.contact?.phone || undefined,
                address: toolResult.draft.shippingAddress?.fullAddress || memory.contact?.address || undefined,
                subtotal: toolResult.draft.totalAmount || 0,
              };
            }
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(toolResult),
          });
        }

        process.stdout.write(`${colors.gray}💭 [AI đang tổng hợp câu trả lời...]${colors.reset}\r`);
        response = await callLlmApi(apiKey, modelName, messages, CHATBOT_TOOL_DEFINITIONS);
        assistantMsg = response.choices?.[0]?.message;
      }

      console.log(`\r${' '.repeat(50)}\r`);

      let replyContent = assistantMsg?.content || '';
      if (!replyContent) {
        if (nextDecision.action === 'ASK_CLARIFICATION' && nextDecision.suggestedQuestions?.length) {
          replyContent = nextDecision.suggestedQuestions[0];
        } else if (toolResultsSummary) {
          replyContent = `Dạ em gửi mình một số dòng que gặm mềm dinh dưỡng rất thích hợp cho bé nhà mình ạ:\n${toolResultsSummary}\n\nMình tham khảo xem bé thích vị nào nhất nhé ạ!`;
        } else {
          replyContent = 'Dạ em có thể tư vấn chi tiết hơn về các dòng que gặm mềm sạch răng phù hợp với thể trạng của bé nhà mình ạ!';
        }
      }

      replyContent = ChatbotGuardrails.sanitizeOutput(replyContent);
      replyContent = ChatbotGuardrails.checkFactHallucination(
        replyContent,
        memory.sessionState.petInfo.breed.status,
        memory.sessionState.petInfo.breed.value
      );
      replyContent = ClaimValidator.validate(replyContent);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      // Track last AI question
      if (replyContent.includes('?') || replyContent.includes('ạ') || replyContent.includes('nhé')) {
        memory.sessionState.lastAiQuestion = replyContent;
        if (nextDecision.missingRequiredSlots.length > 0) {
          memory.sessionState.pendingSlots = Array.from(
            new Set([...memory.sessionState.pendingSlots, ...nextDecision.missingRequiredSlots])
          );
        }
      }

      // Cập nhật session state
      await chatbotStateMachine.updateSessionState(
        conversation.id,
        org.id,
        memory.sessionState,
        nextDecision.nextState
      );

      // Lưu tin nhắn Bot vào Database
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'self',
          content: replyContent,
          contentType: 'text',
          isAi: true,
          sentAt: new Date(),
        },
      });

      // In câu trả lời của Bot
      console.log(`${colors.cyan}${colors.bold}🐾 LA PET Bot:${colors.reset} ${replyContent}`);
      console.log(`${colors.gray}${colors.dim}⏱️  (${elapsed}s | ${modelName})${colors.reset}\n`);

    } catch (err: any) {
      console.log(`\n${colors.red}❌ Lỗi: ${err.message}${colors.reset}\n`);
    }
  }
}

startCliChat().catch(console.error);
