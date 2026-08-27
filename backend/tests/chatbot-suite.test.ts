/**
 * Comprehensive Automated Test Suite for AI Auto Chat Overhaul.
 * Covers Test 1 to 7 and End-to-End Problem Reproduction Scenario.
 */
import {
  createDefaultPetProfile,
  createDefaultCustomerProfile,
  createConfirmedFact,
  updateFact,
} from '../src/modules/chatbot/customer-fact-model.js';
import { SlotExtractor } from '../src/modules/chatbot/slot-extractor.js';
import { NextActionEngine } from '../src/modules/chatbot/next-action-engine.js';
import { ContextBuilder } from '../src/modules/chatbot/context-builder.js';
import { ChatbotGuardrails } from '../src/modules/chatbot/chatbot-guardrails.js';

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalCount++;
  if (condition) {
    console.log(`\x1b[32m✓ PASS:\x1b[0m ${testName}`);
    passedCount++;
  } else {
    console.error(`\x1b[31m✗ FAIL:\x1b[0m ${testName}`);
    if (detail) console.error(`   \x1b[33mDetail: ${detail}\x1b[0m`);
  }
}

async function runAllTests() {
  console.log('\n================================================================');
  console.log('🤖 BẮT ĐẦU CHẠY TEST SUITE HỆ THỐNG AI AUTO CHAT AGENT');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1 — Không bịa breed (Anti-Hallucination)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Kiểm tra chống suy diễn / bịa giống thú cưng ---');
  const pet1 = createDefaultPetProfile();
  const customer1 = createDefaultCustomerProfile();
  const msg1 = 'Shop ơi, em đang muốn mua snack cho bé cún nhà em mà chưa biết chọn loại nào. Bé nhà em mới 4 tháng, hơi nhỏ con á.';

  const extracted1 = SlotExtractor.extract(msg1);
  SlotExtractor.applyExtractedSlots(pet1, customer1, extracted1);

  assert(pet1.type.value === 'dog' && pet1.type.status === 'CONFIRMED', 'Test 1.1: Nhận diện type = dog (CONFIRMED)');
  assert(pet1.age_months.value === 4 && pet1.age_months.status === 'CONFIRMED', 'Test 1.2: Nhận diện age_months = 4 (CONFIRMED)');
  assert(pet1.size.value === 'small' && pet1.size.status === 'CONFIRMED', 'Test 1.3: Nhận diện size = small (CONFIRMED)');
  assert(pet1.breed.status === 'UNKNOWN' && pet1.breed.value === null, 'Test 1.4: Breed BẮT BUỘC là UNKNOWN (null), không được suy diễn Poodle');
  assert(pet1.weight_kg.status === 'UNKNOWN' && pet1.weight_kg.value === null, 'Test 1.5: Weight BẮT BUỘC là UNKNOWN (null)');

  const decision1 = NextActionEngine.decide('NEW', pet1, customer1, extracted1);
  assert(decision1.action === 'ASK_CLARIFICATION', 'Test 1.6: Next Action là ASK_CLARIFICATION để thu thập thông tin còn thiếu');
  assert(decision1.missingRequiredSlots.includes('breed'), 'Test 1.7: Missing slots gồm breed');

  // Guardrail check
  const fakeAiReplyWithHallucination = 'Dạ Anh/Chị vui lòng cho em biết cân nặng (kg) và giống Poodle của bé nhé?';
  const sanitizedReply1 = ChatbotGuardrails.checkFactHallucination(fakeAiReplyWithHallucination, pet1.breed.status);
  assert(!sanitizedReply1.includes('giống Poodle'), 'Test 1.8: Guardrail đã triệt tiêu hallucination giống Poodle khi breed = UNKNOWN');

  // ---------------------------------------------------------------------------
  // TEST 2 — Nhận thông tin (Slot Filling & Fact Confirmation)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Bóc tách slot và xác nhận sự thật (CONFIRMED) ---');
  const pet2 = createDefaultPetProfile();
  const customer2 = createDefaultCustomerProfile();
  const msg2 = 'Bé nhà em là Poodle á, cân nặng khoảng 2,5kg. Em muốn tìm loại nào mềm mềm, bé dễ ăn một chút.';

  const extracted2 = SlotExtractor.extract(msg2, ['breed', 'weight_kg']);
  SlotExtractor.applyExtractedSlots(pet2, customer2, extracted2);

  assert(pet2.breed.value === 'Poodle' && pet2.breed.status === 'CONFIRMED', 'Test 2.1: Breed = Poodle (CONFIRMED)');
  assert(pet2.weight_kg.value === 2.5 && pet2.weight_kg.status === 'CONFIRMED', 'Test 2.2: Weight = 2.5kg (CONFIRMED)');
  assert(pet2.texture_preference.value === 'soft' && pet2.texture_preference.status === 'CONFIRMED', 'Test 2.3: Texture Preference = soft (CONFIRMED)');
  assert(extracted2.answeredPendingSlots.includes('breed') && extracted2.answeredPendingSlots.includes('weight_kg'), 'Test 2.4: Đã trả lời đúng các pending slots');

  // ---------------------------------------------------------------------------
  // TEST 3 — Tiếp tục luồng tư vấn (No Generic Fallback)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Tiếp tục luồng tư vấn và Next Action (No generic fallback) ---');
  // Combine pet1 (age=4m) and pet2 (Poodle, 2.5kg, soft)
  pet1.breed = pet2.breed;
  pet1.weight_kg = pet2.weight_kg;
  pet1.texture_preference = pet2.texture_preference;

  const decision3 = NextActionEngine.decide(
    'WAITING_FOR_CUSTOMER_INFO',
    pet1,
    customer1,
    extracted2,
    'Dạ bé thuộc giống cún nào và nặng bao nhiêu kg ạ?',
    ['breed', 'weight_kg']
  );

  assert(decision3.action === 'SEARCH_PRODUCT', 'Test 3.1: Next Action chuyển sang SEARCH_PRODUCT sau khi có đủ thông tin');
  assert(decision3.nextState === 'PRODUCT_RECOMMENDATION', 'Test 3.2: Next State chuyển sang PRODUCT_RECOMMENDATION');
  assert(decision3.productSearchQuery?.texturePreference === 'soft', 'Test 3.3: Search Query ưu tiên độ mềm (soft)');
  assert(decision3.productSearchQuery?.ageMonths === 4, 'Test 3.4: Search Query gắn kèm ageMonths = 4');

  // ---------------------------------------------------------------------------
  // TEST 4 — Multi-turn Memory Retention
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Multi-turn Context Retention qua 4 lượt hội thoại ---');
  const pet4 = createDefaultPetProfile();
  const customer4 = createDefaultCustomerProfile();

  // Turn 1: "Bé cún 4 tháng."
  SlotExtractor.applyExtractedSlots(pet4, customer4, SlotExtractor.extract('Bé cún 4 tháng.'));
  // Turn 2: "Bé là Poodle."
  SlotExtractor.applyExtractedSlots(pet4, customer4, SlotExtractor.extract('Bé là Poodle.'));
  // Turn 3: "Nặng 2.5kg."
  SlotExtractor.applyExtractedSlots(pet4, customer4, SlotExtractor.extract('Nặng 2.5kg.'));
  // Turn 4: "Bé thích que mềm nha."
  SlotExtractor.applyExtractedSlots(pet4, customer4, SlotExtractor.extract('Bé thích que mềm nha.'));

  assert(pet4.type.value === 'dog', 'Test 4.1: Nhớ pet type = dog');
  assert(pet4.age_months.value === 4, 'Test 4.2: Nhớ age = 4 tháng');
  assert(pet4.breed.value === 'Poodle', 'Test 4.3: Nhớ breed = Poodle');
  assert(pet4.weight_kg.value === 2.5, 'Test 4.4: Nhớ weight = 2.5kg');
  assert(pet4.texture_preference.value === 'soft', 'Test 4.5: Nhớ texture_preference = soft');

  // ---------------------------------------------------------------------------
  // TEST 5 — Cập nhật sửa đổi (Correction Handling)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Sửa đổi thông tin (Correction) ---');
  const pet5 = createDefaultPetProfile();
  const customer5 = createDefaultCustomerProfile();

  SlotExtractor.applyExtractedSlots(pet5, customer5, SlotExtractor.extract('Bé nặng 2.5kg.'));
  assert(pet5.weight_kg.value === 2.5, 'Test 5.1: Cân nặng ban đầu 2.5kg');

  // User corrects: "À nhầm, bé 3kg."
  const correctionExtracted = SlotExtractor.extract('À nhầm, bé 3kg.');
  assert(correctionExtracted.isCorrection === true, 'Test 5.2: Nhận diện isCorrection = true');
  SlotExtractor.applyExtractedSlots(pet5, customer5, correctionExtracted);

  assert(pet5.weight_kg.value === 3, 'Test 5.3: Cân nặng đã được cập nhật chính xác thành 3kg');
  assert(pet5.weight_kg.status === 'CONFIRMED', 'Test 5.4: Trạng thái cân nặng vẫn là CONFIRMED');

  // ---------------------------------------------------------------------------
  // TEST 6 — Xử lý xung đột nguồn dữ liệu (Source Priority)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: Xử lý xung đột nguồn dữ liệu (Customer vs CRM) ---');
  let crmBreedFact = createConfirmedFact('Poodle', 'crm');
  assert(crmBreedFact.value === 'Poodle' && crmBreedFact.source === 'crm', 'Test 6.1: Dữ liệu CRM ban đầu là Poodle');

  // Customer says: "Bé nhà em là Chihuahua ạ."
  const customerExtracted = SlotExtractor.extract('Bé nhà em là Chihuahua ạ.');
  crmBreedFact = updateFact(crmBreedFact, {
    value: customerExtracted.breed,
    status: 'CONFIRMED',
    source: 'customer_message',
  });

  assert(crmBreedFact.value === 'Chihuahua', 'Test 6.2: Dữ liệu khách hàng đã ghi đè thành công dữ liệu CRM');
  assert(crmBreedFact.source === 'customer_message', 'Test 6.3: Source được cập nhật thành customer_message');

  // ---------------------------------------------------------------------------
  // TEST 7 — Context dài (> 10 turns)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: Giữ vững Facts qua chuỗi hội thoại dài > 10 turns ---');
  const pet7 = createDefaultPetProfile();
  const customer7 = createDefaultCustomerProfile();

  // Setup initial facts
  SlotExtractor.applyExtractedSlots(pet7, customer7, SlotExtractor.extract('Cún Poodle 4 tháng 2.5kg thích đồ mềm.'));

  // 10 chit-chat turns
  const chitChat = [
    'Shop ở đâu dạ?',
    'Phí ship về Quận 1 thế nào?',
    'Giao trong ngày được không?',
    'Có freeship đơn từ bao nhiêu?',
    'Có chính sách đổi trả không?',
    'Bao bì có khóa zip không shop?',
    'Bảo quản được bao lâu sau khi mở?',
    'Thành phần có an toàn không?',
    'Có sợ bị tắc ruột không?',
    'Cho em xem hình sản phẩm nha.',
  ];

  for (const text of chitChat) {
    const ext = SlotExtractor.extract(text);
    SlotExtractor.applyExtractedSlots(pet7, customer7, ext);
  }

  assert(pet7.breed.value === 'Poodle', 'Test 7.1: Vẫn nhớ giống Poodle sau 10 turns');
  assert(pet7.age_months.value === 4, 'Test 7.2: Vẫn nhớ 4 tháng tuổi');
  assert(pet7.weight_kg.value === 2.5, 'Test 7.3: Vẫn nhớ 2.5kg');
  assert(pet7.texture_preference.value === 'soft', 'Test 7.4: Vẫn nhớ thích đồ mềm');

  // ---------------------------------------------------------------------------
  // TEST END-TO-END: Kịch bản thực tế 2 lượt phát hiện lỗi
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST E2E: Kịch bản thực tế 2 lượt phát hiện lỗi ---');

  // Lượt 1: Khách nói: "Shop ơi, em đang muốn mua snack cho bé cún nhà em mà chưa biết chọn loại nào. Bé nhà em mới 4 tháng, hơi nhỏ con á."
  const e2ePet = createDefaultPetProfile();
  const e2eCustomer = createDefaultCustomerProfile();

  const turn1Extracted = SlotExtractor.extract('Shop ơi, em đang muốn mua snack cho bé cún nhà em mà chưa biết chọn loại nào. Bé nhà em mới 4 tháng, hơi nhỏ con á.');
  SlotExtractor.applyExtractedSlots(e2ePet, e2eCustomer, turn1Extracted);

  assert(e2ePet.breed.status === 'UNKNOWN', 'E2E Turn 1: Breed là UNKNOWN');
  assert(e2ePet.age_months.value === 4, 'E2E Turn 1: Tuổi là 4 tháng');

  const turn1Decision = NextActionEngine.decide('NEW', e2ePet, e2eCustomer, turn1Extracted);
  assert(turn1Decision.action === 'ASK_CLARIFICATION', 'E2E Turn 1: Action là ASK_CLARIFICATION');

  const systemPrompt1 = ContextBuilder.buildSystemPrompt({
    pet: e2ePet,
    customer: e2eCustomer,
    currentState: 'NEW',
    nextDecision: turn1Decision,
  });

  assert(systemPrompt1.includes('Giống (Breed): UNKNOWN'), 'E2E Turn 1: Prompt thể hiện rõ Breed = UNKNOWN');
  assert(systemPrompt1.includes('TUYỆT ĐỐI KHÔNG TỰ BỊA ĐẶT'), 'E2E Turn 1: Prompt chứa luật Anti-Hallucination');

  // Lượt 2: Khách trả lời: "Bé nhà em là Poodle á, cân nặng khoảng 2,5kg. Em muốn tìm loại nào mềm mềm, bé dễ ăn một chút."
  const turn2Extracted = SlotExtractor.extract(
    'Bé nhà em là Poodle á, cân nặng khoảng 2,5kg. Em muốn tìm loại nào mềm mềm, bé dễ ăn một chút.',
    turn1Decision.missingRequiredSlots
  );
  SlotExtractor.applyExtractedSlots(e2ePet, e2eCustomer, turn2Extracted);

  assert(e2ePet.breed.value === 'Poodle' && e2ePet.breed.status === 'CONFIRMED', 'E2E Turn 2: Breed = Poodle (CONFIRMED)');
  assert(e2ePet.weight_kg.value === 2.5 && e2ePet.weight_kg.status === 'CONFIRMED', 'E2E Turn 2: Weight = 2.5kg (CONFIRMED)');
  assert(e2ePet.texture_preference.value === 'soft', 'E2E Turn 2: Texture = soft (CONFIRMED)');

  const turn2Decision = NextActionEngine.decide(
    'WAITING_FOR_CUSTOMER_INFO',
    e2ePet,
    e2eCustomer,
    turn2Extracted,
    'Dạ bé thuộc giống nào và nặng bao nhiêu kg ạ?',
    ['breed', 'weight_kg']
  );

  assert(turn2Decision.action === 'SEARCH_PRODUCT', 'E2E Turn 2: Action BẮT BUỘC là SEARCH_PRODUCT để tư vấn que gặm mềm');
  assert(turn2Decision.nextState === 'PRODUCT_RECOMMENDATION', 'E2E Turn 2: State chuyển sang PRODUCT_RECOMMENDATION, không rơi vào generic');

  console.log('\n================================================================');
  console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passedCount}/${totalCount} TEST CASES PASSED!`);
  console.log('================================================================\n');

  if (passedCount === totalCount) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Lỗi khi chạy test suite:', err);
  process.exit(1);
});
