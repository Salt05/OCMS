/**
 * Test Suite: Brand & Category Grounding, Search & Prompt Verification
 * Validates:
 * 1. ProductGroundingEngine extracts brand and category.
 * 2. Product comparison includes brand and category.
 * 3. System Prompt rules:
 *    - Preserves existing conversational tone.
 *    - Only mentions brand when customer or staff asks.
 *    - Leverages category (ngành hàng) to search and filter products.
 * 4. Tool definitions and SlotExtractor support brand and category.
 */
import assert from 'node:assert';
import { ProductGroundingEngine } from '../src/modules/chatbot/product-grounding.js';
import { ContextBuilder } from '../src/modules/chatbot/context-builder.js';
import { CHATBOT_TOOL_DEFINITIONS } from '../src/modules/chatbot/chatbot-tools.js';
import { SlotExtractor } from '../src/modules/chatbot/slot-extractor.js';
import {
  createDefaultPetProfile,
  createDefaultCustomerProfile,
} from '../src/modules/chatbot/customer-fact-model.js';

console.log('================================================================');
console.log('🧪 TEST SUITE: BRAND & CATEGORY GROUNDING & PROMPT CONSTRAINTS');
console.log('================================================================\n');

let passed = 0;
let total = 0;

function runTest(name: string, fn: () => void) {
  total++;
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// TEST 1: ProductGroundingEngine extracts brand and category
// -----------------------------------------------------------------------------
console.log('--- TEST 1: Trích xuất trường Brand & Category (Ngành hàng) ---');

const sampleProduct1 = {
  sku: 'C24',
  name: 'Que gặm da heo quấn gà 100g',
  brand: 'Lapati',
  category: 'Xương gặm',
  wholesalePrice: 35100,
  listPrice: 39000,
  ingredients: 'Da heo tự nhiên, thịt gà tươi',
  specification: '10 xương/túi',
};

const grounded1 = ProductGroundingEngine.groundProduct(sampleProduct1);

runTest('Test 1.1: grounded1 có brand = "Lapati"', () => {
  assert.strictEqual(grounded1.brand, 'Lapati');
});

runTest('Test 1.2: grounded1 có category = "Xương gặm"', () => {
  assert.strictEqual(grounded1.category, 'Xương gặm');
});

const sampleProduct2 = {
  sku: 'DX-TREAT-01',
  name: 'Bánh thưởng Dexinbone vị sữa canxi',
  brand: 'Dexinbone',
  category: 'Bánh thưởng',
  wholesalePrice: 38000,
  listPrice: 42000,
};

const grounded2 = ProductGroundingEngine.groundProduct(sampleProduct2);

runTest('Test 1.3: grounded2 có brand = "Dexinbone"', () => {
  assert.strictEqual(grounded2.brand, 'Dexinbone');
});

runTest('Test 1.4: grounded2 có category = "Bánh thưởng"', () => {
  assert.strictEqual(grounded2.category, 'Bánh thưởng');
});

// -----------------------------------------------------------------------------
// TEST 2: Product Comparison includes brand and category
// -----------------------------------------------------------------------------
console.log('\n--- TEST 2: So sánh sản phẩm hiển thị đúng Brand & Ngành hàng ---');

const comparison = ProductGroundingEngine.buildComparison([grounded1, grounded2]);

runTest('Test 2.1: Comparison text chứa thông tin ngành hàng Xương gặm', () => {
  assert.ok(comparison.includes('Ngành hàng: Xương gặm'));
});

runTest('Test 2.2: Comparison text chứa thông tin ngành hàng Bánh thưởng', () => {
  assert.ok(comparison.includes('Ngành hàng: Bánh thưởng'));
});

runTest('Test 2.3: Comparison text chứa thông tin thương hiệu Lapati', () => {
  assert.ok(comparison.includes('Thương hiệu (Brand): Lapati'));
});

runTest('Test 2.4: Comparison text chứa thông tin thương hiệu Dexinbone', () => {
  assert.ok(comparison.includes('Thương hiệu (Brand): Dexinbone'));
});

// -----------------------------------------------------------------------------
// TEST 3: System Prompt constraints for Brand & Category
// -----------------------------------------------------------------------------
console.log('\n--- TEST 3: Kiểm tra System Prompt chứa đầy đủ chỉ dẫn ---');

const prompt = ContextBuilder.buildSystemPrompt({
  pet: createDefaultPetProfile(),
  customer: createDefaultCustomerProfile(),
  currentState: 'INFORMATION',
  nextDecision: {
    action: 'PROVIDE_INFO',
    nextState: 'INFORMATION',
    reason: 'Khách hỏi thông tin sản phẩm',
    missingRequiredSlots: [],
  },
});

runTest('Test 3.1: Prompt giữ nguyên cách nói chuyện hiện tại (VĂN PHONG VÀ CÁCH TRÒ CHUYỆN)', () => {
  assert.ok(prompt.includes('Giữ nguyên 100% cách nói chuyện'));
});

runTest('Test 3.2: Prompt chỉ định CHỈ NÓI VỀ BRAND KHI ĐƯỢC HỎI', () => {
  assert.ok(prompt.includes('CHỈ NÓI VỀ BRAND KHI ĐƯỢC HỎI') || prompt.includes('chỉ khi khách hàng hoặc nhân viên có hỏi'));
  assert.ok(prompt.includes('KHÔNG TỰ TIỆN NÊU TÊN BRAND') || prompt.includes('Tuyệt đối không tự ý'));
});

runTest('Test 3.3: Prompt hướng dẫn TẬN DỤNG ĐỂ TRA CỨU SẢN PHẨM theo ngành hàng', () => {
  assert.ok(prompt.includes('TẬN DỤNG ĐỂ TRA CỨU SẢN PHẨM') || prompt.includes('ngành hàng'));
});

// -----------------------------------------------------------------------------
// TEST 4: Tool Definitions & Slot Extractor support
// -----------------------------------------------------------------------------
console.log('\n--- TEST 4: Khai báo Tools & Slot Extractor cho Brand & Ngành hàng ---');

const searchProductTool = CHATBOT_TOOL_DEFINITIONS.find(t => t.function.name === 'search_product');

runTest('Test 4.1: Tool search_product có tham số category (ngành hàng)', () => {
  assert.ok(searchProductTool);
  const props = (searchProductTool.function.parameters as any).properties;
  assert.ok(props.category);
  assert.ok(props.category.description.includes('Ngành hàng'));
});

runTest('Test 4.2: Tool search_product có tham số brand (thương hiệu)', () => {
  assert.ok(searchProductTool);
  const props = (searchProductTool.function.parameters as any).properties;
  assert.ok(props.brand);
  assert.ok(props.brand.description.includes('Thương hiệu'));
});

const slotBrand = SlotExtractor.extract('Sản phẩm C24 của thương hiệu nào vậy em?');
runTest('Test 4.3: SlotExtractor nhận diện câu hỏi về thương hiệu là INFORMATION_SEEKING', () => {
  assert.strictEqual(slotBrand.intent, 'INFORMATION_SEEKING');
});

const slotCategory = SlotExtractor.extract('Bên em có những ngành hàng nào vậy?');
runTest('Test 4.4: SlotExtractor nhận diện câu hỏi về ngành hàng là INFORMATION_SEEKING', () => {
  assert.strictEqual(slotCategory.intent, 'INFORMATION_SEEKING');
});

console.log('\n================================================================');
console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passed}/${total} TEST CASES PASSED!`);
console.log('================================================================\n');
