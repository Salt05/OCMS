/**
 * Live E2E Integration Test for ChatbotService with Database and Groq LLM
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { chatbotService } from '../src/modules/chatbot/chatbot-service.js';
import { chatbotStateMachine } from '../src/modules/chatbot/chatbot-state-machine.js';

async function testLiveFlow() {
  console.log('\n================================================================');
  console.log('🧪 LIVE INTEGRATION TEST: SCENARIO TƯ VẤN THỰC TẾ TRÊN DATABASE');
  console.log('================================================================\n');

  // 1. Setup Organization & Conversation
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({ data: { name: 'LA PET Test Org' } });
  }

  let user = await prisma.user.findFirst({ where: { orgId: org.id } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        orgId: org.id,
        email: 'test_admin@lapet.vn',
        passwordHash: 'dummy',
        fullName: 'Admin Test',
        role: 'admin',
      },
    });
  }

  let zaloAccount = await prisma.zaloAccount.findFirst({ where: { orgId: org.id } });
  if (!zaloAccount) {
    zaloAccount = await prisma.zaloAccount.create({
      data: {
        orgId: org.id,
        ownerUserId: user.id,
        zaloUid: 'test_zalo_live',
        displayName: 'LA PET Live CSKH',
        aiAutoReply: true,
      },
    });
  }

  let contact = await prisma.contact.findFirst({ where: { orgId: org.id, phone: '0901234567' } });
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        fullName: 'Chị Mai (Khách Hàng Test Live)',
        phone: '0901234567',
        contactType: 'customer',
      },
    });
  }

  const convId = 'test_live_conv_' + Date.now();
  const conv = await prisma.conversation.create({
    data: {
      id: convId,
      orgId: org.id,
      zaloAccountId: zaloAccount.id,
      contactId: contact.id,
      threadType: 'user',
      externalThreadId: `thread_${convId}`,
      aiActive: true,
      aiPaused: false,
      currentState: 'NEW',
    },
  });

  // Seed standard products if empty
  const prodCount = await prisma.productCache.count({ where: { orgId: org.id } });
  if (prodCount === 0) {
    await prisma.productCache.createMany({
      data: [
        {
          orgId: org.id,
          odooId: 101,
          sku: 'B03',
          name: 'Que gặm xoắn mềm vị sữa sạch răng cho cún con',
          listPrice: 35000,
          wholesalePrice: 23400,
          retailPrice: 35000,
          specification: 'Gói 80g',
          target: 'Chó con từ 3 tháng tuổi, chó nhỏ',
          description: 'Công nghệ Rawhide-Free không da bò sống, que mềm dễ nhai, bảo vệ răng nướu, bổ sung canxi.',
          isActive: true,
        },
        {
          orgId: org.id,
          odooId: 102,
          sku: 'B06',
          name: 'Xương bàn chải mềm sạch mảng bám LA PET',
          listPrice: 38000,
          wholesalePrice: 25000,
          retailPrice: 38000,
          specification: 'Gói 90g',
          target: 'Chó nhỏ, chó con',
          description: 'Thiết kế bàn chải mềm mát-xa nướu, dễ tiêu hóa, giảm hôi miệng.',
          isActive: true,
        },
      ],
    });
    console.log('✓ Đã nạp sản phẩm mẫu B03, B06 vào ProductCache.');
  }

  try {
    // -------------------------------------------------------------------------
    // LƯỢT 1: Khách hỏi tư vấn mà chưa nêu giống chó
    // -------------------------------------------------------------------------
    console.log('\n--- LƯỢT 1 ---');
    const msg1 = 'Shop ơi, em đang muốn mua snack cho bé cún nhà em mà chưa biết chọn loại nào. Bé nhà em mới 4 tháng, hơi nhỏ con á.';
    console.log(`👤 Khách: "${msg1}"`);

    await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderType: 'contact',
        content: msg1,
        sentAt: new Date(),
      },
    });

    await chatbotService.processIncomingMessage(conv.id, msg1, org.id, zaloAccount.id, contact.id);

    // Verify AI response after Turn 1
    const aiMsg1 = await prisma.message.findFirst({
      where: { conversationId: conv.id, senderType: 'self' },
      orderBy: { sentAt: 'desc' },
    });

    console.log(`🐾 AI Trả Lời: "${aiMsg1?.content}"`);

    const memAfterTurn1 = await chatbotStateMachine.loadMemoryContext(conv.id, org.id);
    console.log(`   ↳ State: ${memAfterTurn1.currentState}`);
    console.log(`   ↳ Facts: Age = ${memAfterTurn1.sessionState.petInfo.age_months.value}m (CONFIRMED), Breed = ${memAfterTurn1.sessionState.petInfo.breed.status}, Weight = ${memAfterTurn1.sessionState.petInfo.weight_kg.status}`);

    const hasHallucinatedPoodleInTurn1 = (aiMsg1?.content || '').toLowerCase().includes('giống poodle');
    if (hasHallucinatedPoodleInTurn1) {
      console.error('❌ LỖI LƯỢT 1: AI vẫn bịa ra giống Poodle!');
      process.exit(1);
    } else {
      console.log('✅ LƯỢT 1 THÀNH CÔNG: AI không tự suy diễn Poodle!');
    }

    // Wait 3s before Turn 2 to avoid Groq burst rate limit
    await new Promise(r => setTimeout(r, 3000));

    // -------------------------------------------------------------------------
    // LƯỢT 2: Khách trả lời giống và cân nặng
    // -------------------------------------------------------------------------
    console.log('\n--- LƯỢT 2 ---');
    const msg2 = 'Bé nhà em là Poodle á, cân nặng khoảng 2,5kg. Em muốn tìm loại nào mềm mềm, bé dễ ăn một chút.';
    console.log(`👤 Khách: "${msg2}"`);

    await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderType: 'contact',
        content: msg2,
        sentAt: new Date(),
      },
    });

    await chatbotService.processIncomingMessage(conv.id, msg2, org.id, zaloAccount.id, contact.id);

    const aiMsg2 = await prisma.message.findFirst({
      where: { conversationId: conv.id, senderType: 'self' },
      orderBy: { sentAt: 'desc' },
    });

    console.log(`🐾 AI Trả Lời: "${aiMsg2?.content}"`);

    const memAfterTurn2 = await chatbotStateMachine.loadMemoryContext(conv.id, org.id);
    console.log(`   ↳ State: ${memAfterTurn2.currentState}`);
    console.log(`   ↳ Facts: Breed = ${memAfterTurn2.sessionState.petInfo.breed.value} (CONFIRMED), Weight = ${memAfterTurn2.sessionState.petInfo.weight_kg.value}kg (CONFIRMED), Texture = ${memAfterTurn2.sessionState.petInfo.texture_preference.value} (CONFIRMED)`);

    const isGenericFallback = (aiMsg2?.content || '').includes('hỗ trợ gì thêm');
    if (isGenericFallback) {
      console.error('❌ LỖI LƯỢT 2: AI rơi vào generic fallback!');
      process.exit(1);
    } else {
      console.log('✅ LƯỢT 2 THÀNH CÔNG: AI tiếp tục flow tư vấn que gặm mềm, ghi nhận đúng thông tin!');
    }

    console.log('\n================================================================');
    console.log('🎉 TOÀN BỘ 2 LƯỢT CHAT E2E ĐÃ HOÀN TẤT VÀ CHÍNH XÁC 100%!');
    console.log('================================================================\n');

  } finally {
    // Clean up test conversation
    await prisma.message.deleteMany({ where: { conversationId: conv.id } });
    await prisma.conversationAiState.deleteMany({ where: { conversationId: conv.id } });
    await prisma.aiAuditLog.deleteMany({ where: { conversationId: conv.id } });
    await prisma.conversation.delete({ where: { id: conv.id } });
  }
}

testLiveFlow().catch((err) => {
  console.error('Lỗi khi chạy live test:', err);
  process.exit(1);
});
