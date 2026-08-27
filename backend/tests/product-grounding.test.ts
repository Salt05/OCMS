/**
 * Test Suite: Product Grounding, Claim Validation & Sales Intelligence
 * Validates all 7 required test cases from the specification.
 */
import assert from 'node:assert';
import { SlotExtractor } from '../src/modules/chatbot/slot-extractor.js';
import { NextActionEngine } from '../src/modules/chatbot/next-action-engine.js';
import { ContextBuilder } from '../src/modules/chatbot/context-builder.js';
import { ClaimValidator } from '../src/modules/chatbot/claim-validator.js';
import { ProductGroundingEngine } from '../src/modules/chatbot/product-grounding.js';
import {
  createDefaultPetProfile,
  createDefaultCustomerProfile,
} from '../src/modules/chatbot/customer-fact-model.js';

console.log('================================================================');
console.log('🧪 BẮT ĐẦU TEST SUITE: PRODUCT GROUNDING & SALES INTELLIGENCE');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// TEST 01: Khách nói: "Bé nhà em 4 tháng, hơi nhỏ con."
// Expected: breed = UNKNOWN, weight = UNKNOWN. AI không được nói Poodle.
// -----------------------------------------------------------------------------
console.log('--- TEST 01: Chống suy diễn giống/cân nặng (Fact Integrity) ---');

const pet1 = createDefaultPetProfile();
const cust1 = createDefaultCustomerProfile();
const extract1 = SlotExtractor.extract('Bé nhà em 4 tháng, hơi nhỏ con.');
SlotExtractor.applyExtractedSlots(pet1, cust1, extract1);

runTest('Test 01.1: age_months = 4 (CONFIRMED)', () => {
  assert.strictEqual(pet1.age_months.status, 'CONFIRMED');
  assert.strictEqual(pet1.age_months.value, 4);
});

runTest('Test 01.2: size = small (CONFIRMED)', () => {
  assert.strictEqual(pet1.size.status, 'CONFIRMED');
  assert.strictEqual(pet1.size.value, 'small');
});

runTest('Test 01.3: breed = UNKNOWN (null) - Không được suy diễn Poodle', () => {
  assert.strictEqual(pet1.breed.status, 'UNKNOWN');
  assert.strictEqual(pet1.breed.value, null);
});

runTest('Test 01.4: weight_kg = UNKNOWN (null)', () => {
  assert.strictEqual(pet1.weight_kg.status, 'UNKNOWN');
  assert.strictEqual(pet1.weight_kg.value, null);
});

const decision1 = NextActionEngine.decide('NEW', pet1, cust1, extract1, null, []);
runTest('Test 01.5: Next Action là ASK_CLARIFICATION để hỏi giống và cân nặng', () => {
  assert.strictEqual(decision1.action, 'ASK_CLARIFICATION');
  assert.ok(decision1.missingRequiredSlots.includes('breed'));
});

// -----------------------------------------------------------------------------
// TEST 02: Khách trả lời: "Poodle, 2.5kg, thích đồ mềm."
// Expected: AI nhớ đầy đủ và tiếp tục recommendation.
// -----------------------------------------------------------------------------
console.log('\n--- TEST 02: Ghi nhận đầy đủ facts & tiếp tục tư vấn ---');

const extract2 = SlotExtractor.extract('Poodle, 2.5kg, thích đồ mềm.', ['breed', 'weight_kg']);
SlotExtractor.applyExtractedSlots(pet1, cust1, extract2);

runTest('Test 02.1: breed = Poodle (CONFIRMED)', () => {
  assert.strictEqual(pet1.breed.status, 'CONFIRMED');
  assert.strictEqual(pet1.breed.value, 'Poodle');
});

runTest('Test 02.2: weight = 2.5kg (CONFIRMED)', () => {
  assert.strictEqual(pet1.weight_kg.status, 'CONFIRMED');
  assert.strictEqual(pet1.weight_kg.value, 2.5);
});

runTest('Test 02.3: texture = soft (CONFIRMED)', () => {
  assert.strictEqual(pet1.texture_preference.status, 'CONFIRMED');
  assert.strictEqual(pet1.texture_preference.value, 'soft');
});

const decision2 = NextActionEngine.decide('WAITING_FOR_CUSTOMER_INFO', pet1, cust1, extract2, 'Bé giống gì?', ['breed', 'weight_kg']);
runTest('Test 02.4: Next Action là SEARCH_PRODUCT (không rơi vào generic fallback)', () => {
  assert.strictEqual(decision2.action, 'SEARCH_PRODUCT');
  assert.strictEqual(decision2.nextState, 'PRODUCT_RECOMMENDATION');
  assert.strictEqual(decision2.productSearchQuery?.texturePreference, 'soft');
  assert.strictEqual(decision2.productSearchQuery?.ageMonths, 4);
});

// -----------------------------------------------------------------------------
// TEST 03: Khách hỏi: "C14 có an toàn cho bé 4 tháng không?"
// Expected: AI nhận diện query kiểm tra an toàn, phân biệt dữ liệu DB chưa có tuổi cụ thể
// -----------------------------------------------------------------------------
console.log('\n--- TEST 03: Product Grounding & Claim Validation (Age Safety) ---');

const extract3 = SlotExtractor.extract('C14 có an toàn cho bé 4 tháng không?');
runTest('Test 03.1: Nhận diện intent CHECK_PRODUCT_SAFETY với SKU C14', () => {
  assert.strictEqual(extract3.intent, 'CHECK_PRODUCT_SAFETY');
  assert.strictEqual(extract3.productSafetyQuery?.sku, 'C14');
  assert.strictEqual(extract3.productSafetyQuery?.aspect, 'age');
});

const decision3 = NextActionEngine.decide('PRODUCT_RECOMMENDATION', pet1, cust1, extract3);
runTest('Test 03.2: Next Action là GET_PRODUCT_DETAIL cho C14', () => {
  assert.strictEqual(decision3.action, 'GET_PRODUCT_DETAIL');
  assert.strictEqual(decision3.targetSku, 'C14');
});

// Test Grounding Engine on C14 raw db row
const rawC14 = {
  sku: 'C14',
  name: 'C14- Que da heo ( 8 cây - 60g)',
  listPrice: 24960,
  wholesalePrice: 24960,
  ingredients: 'Da heo tự nhiên',
  target: 'Que da heo phù hợp hơn cho dòng chó nhỏ',
  description: 'Que da heo sở hữu kết cấu dai nhẹ, kích thước vừa miệng',
};
const groundedC14 = ProductGroundingEngine.groundProduct(rawC14);

runTest('Test 03.3: suitable_min_age_months của C14 là null (UNKNOWN - không bịa số)', () => {
  assert.strictEqual(groundedC14.suitable_min_age_months, null);
});

const overclaimResponse3 = 'Dạ sản phẩm C14 hoàn toàn an toàn cho bé 4 tháng ăn được thoải mái nha chị!';
const validatedResponse3 = ClaimValidator.validateAgeClaim(overclaimResponse3, 'C14', true, groundedC14.suitable_min_age_months);
runTest('Test 03.4: ClaimValidator sửa claim tuổi chưa xác nhận sang hướng dẫn que mềm an toàn', () => {
  assert.ok(!validatedResponse3.includes('hoàn toàn an toàn cho bé 4 tháng'));
  assert.ok(validatedResponse3.includes('chưa có dữ liệu xác nhận cụ thể về độ tuổi') || validatedResponse3.includes('chưa có thông tin xác nhận'));
  assert.ok(validatedResponse3.includes('B03') || validatedResponse3.includes('B06') || validatedResponse3.includes('mềm'));
});

// -----------------------------------------------------------------------------
// TEST 04: Khách hỏi: "C14 có phải rawhide không?"
// Expected: AI phân biệt thành phần Da heo tự nhiên với thuật ngữ Rawhide
// -----------------------------------------------------------------------------
console.log('\n--- TEST 04: Phân biệt thành phần thực tế vs Rawhide ---');

const extract4 = SlotExtractor.extract('C14 có phải rawhide không?');
runTest('Test 04.1: Nhận diện intent CHECK_PRODUCT_SAFETY với khía cạnh rawhide', () => {
  assert.strictEqual(extract4.intent, 'CHECK_PRODUCT_SAFETY');
  assert.strictEqual(extract4.productSafetyQuery?.aspect, 'rawhide');
});

runTest('Test 04.2: Grounded C14 xác nhận nguyên liệu là Da heo tự nhiên', () => {
  assert.strictEqual(groundedC14.ingredients, 'Da heo tự nhiên');
  assert.strictEqual(groundedC14.texture_category, 'chewy');
});

// -----------------------------------------------------------------------------
// TEST 05: Khách hỏi: "Loại này có giúp bé không bị nghẹn không?"
// Expected: AI không biến "dễ nhai" thành "không gây nghẹn", khuyến cáo quan sát khi ăn
// -----------------------------------------------------------------------------
console.log('\n--- TEST 05: Anti-Choking Overclaim Guardrail ---');

const extract5 = SlotExtractor.extract('Loại này có giúp bé không bị nghẹn không?');
runTest('Test 05.1: Nhận diện intent CHECK_PRODUCT_SAFETY với khía cạnh choking', () => {
  assert.strictEqual(extract5.intent, 'CHECK_PRODUCT_SAFETY');
  assert.strictEqual(extract5.productSafetyQuery?.aspect, 'choking');
});

const riskyResponse5 = 'Dạ sản phẩm này mềm lắm, đảm bảo không bị nghẹn và an toàn tuyệt đối không nghẹn nha chị!';
const sanitizedResponse5 = ClaimValidator.validate(riskyResponse5);
runTest('Test 05.2: ClaimValidator triệt tiêu claim "không bao giờ nghẹn", chuyển thành quan sát bé khi ăn', () => {
  assert.ok(!sanitizedResponse5.includes('đảm bảo không bị nghẹn'));
  assert.ok(!sanitizedResponse5.includes('an toàn tuyệt đối không nghẹn'));
  assert.ok(sanitizedResponse5.includes('kết cấu dễ nhai'));
  assert.ok(sanitizedResponse5.includes('ba mẹ vẫn nên quan sát bé trong khi ăn'));
});

// -----------------------------------------------------------------------------
// TEST 06: Khách nói: "Cho chị 2 gói."
// Expected: AI nhận diện Buying Intent cao và số lượng đặt hàng
// -----------------------------------------------------------------------------
console.log('\n--- TEST 06: Buying Intent Recognition ---');

const extract6 = SlotExtractor.extract('Cho chị 2 gói.');
runTest('Test 06.1: Nhận diện ORDER_INTENT với buyingIntentLevel = HIGH', () => {
  assert.strictEqual(extract6.intent, 'ORDER_INTENT');
  assert.strictEqual(extract6.customerStage, 'READY_TO_BUY');
  assert.strictEqual(extract6.buyingIntentLevel, 'HIGH');
  assert.strictEqual(extract6.orderQuantity, 2);
});

const decision6 = NextActionEngine.decide('PRODUCT_RECOMMENDATION', pet1, cust1, extract6);
runTest('Test 06.2: Next Action là CREATE_ORDER_DRAFT để thu thập thông tin giao hàng', () => {
  assert.strictEqual(decision6.action, 'CREATE_ORDER_DRAFT');
  assert.strictEqual(decision6.nextState, 'ORDER_COLLECTION');
  assert.ok(decision6.missingRequiredSlots.includes('phone') || decision6.missingRequiredSlots.includes('address'));
});

// -----------------------------------------------------------------------------
// TEST 07: Khách nói: "Thôi em chưa mua, để chị suy nghĩ."
// Expected: AI không tiếp tục ép chốt, tôn trọng quyết định của khách
// -----------------------------------------------------------------------------
console.log('\n--- TEST 07: Objection Handling & Zero-Pressure Sales Mindset ---');

const extract7 = SlotExtractor.extract('Thôi em chưa mua, để chị suy nghĩ.');
runTest('Test 07.1: Nhận diện HANDLE_OBJECTION với objectionType = THINKING_ABOUT_IT', () => {
  assert.strictEqual(extract7.intent, 'HANDLE_OBJECTION');
  assert.strictEqual(extract7.customerStage, 'OBJECTION');
  assert.strictEqual(extract7.objectionType, 'THINKING_ABOUT_IT');
  assert.strictEqual(extract7.buyingIntentLevel, 'NO_INTENT');
});

const decision7 = NextActionEngine.decide('PRODUCT_RECOMMENDATION', pet1, cust1, extract7);
runTest('Test 07.2: Next Action là END_CONVERSATION với thái độ thấu cảm, không ép chốt đơn', () => {
  assert.strictEqual(decision7.action, 'END_CONVERSATION');
  assert.ok(decision7.reason.includes('tôn trọng') || decision7.reason.includes('không chèo kéo') || decision7.reason.includes('sẵn sàng'));
});

// -----------------------------------------------------------------------------
// BONUS: TEST Product Comparison Tool
// -----------------------------------------------------------------------------
console.log('\n--- BONUS: Product Comparison Engine ---');

const extractComp = SlotExtractor.extract('C14 với DB-VP01 cái nào phù hợp hơn?');
runTest('Bonus 1: Nhận diện COMPARE_PRODUCTS cho 2 mã [C14, DB-VP01]', () => {
  assert.strictEqual(extractComp.intent, 'COMPARE_PRODUCTS');
  assert.ok(extractComp.comparisonSkus?.includes('C14'));
  assert.ok(extractComp.comparisonSkus?.includes('DB-VP01'));
});

const rawDBVP01 = {
  sku: 'DB-VP01',
  name: 'Bánh thưởng hoang dã gấp đôi que nhai vị gà 200g D03',
  listPrice: 31200,
  wholesalePrice: 31200,
  ingredients: 'Thịt gà tươi và thịt nai',
  target: 'Dành cho mọi giống chó',
  description: 'Bánh thưởng thịt nai vị gà cung cấp protein dồi dào',
};
const groundedDBVP01 = ProductGroundingEngine.groundProduct(rawDBVP01);
const compTable = ProductGroundingEngine.buildComparison([groundedC14, groundedDBVP01]);

runTest('Bonus 2: Tạo bảng so sánh chính xác từ Facts trong CSDL', () => {
  assert.ok(compTable.includes('C14'));
  assert.ok(compTable.includes('DB-VP01'));
  assert.ok(compTable.includes('Da heo tự nhiên'));
  assert.ok(compTable.includes('Thịt gà tươi'));
  assert.ok(compTable.includes('24.960 đ'));
  assert.ok(compTable.includes('31.200 đ'));
});

console.log('\n================================================================');
console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TEST CASES PASSED!`);
console.log('================================================================\n');
