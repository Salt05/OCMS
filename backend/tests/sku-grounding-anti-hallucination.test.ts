import assert from 'node:assert';
import { ChatbotToolExecutor } from '../src/modules/chatbot/chatbot-tools.js';
import { ChatbotGuardrails } from '../src/modules/chatbot/chatbot-guardrails.js';
import { prisma } from '../src/shared/database/prisma-client.js';

console.log('================================================================');
console.log('🧪 TEST SUITE: ANTI-HALLUCINATION & SKU GROUNDING VERIFICATION');
console.log('================================================================\n');

let passed = 0;
let total = 0;

async function runAsyncTest(name: string, fn: () => Promise<void>) {
  total++;
  try {
    await fn();
    console.log(`✓ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.message}`);
  }
}

async function main() {
  const org = await prisma.organization.findFirst();
  const orgId = org?.id || 'f4a9d7b5-0181-47cf-948d-5af48a77236e';
  const toolExecutor = new ChatbotToolExecutor(orgId);

  // ---------------------------------------------------------------------------
  // TEST 1: Smart Category Fallback for "bàn chải" with category "Xương gặm"
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Smart Category Fallback tra cứu sản phẩm ---');

  await runAsyncTest('Test 1.1: Tìm "bàn chải" kèm category "Xương gặm" tìm được đúng dòng xương bàn chải E01-E06/DO03', async () => {
    const result = await toolExecutor.searchProduct('bàn chải', undefined, undefined, undefined, undefined, 'Xương gặm');
    assert(result.products && result.products.length > 0, 'Phải tìm thấy ít nhất 1 sản phẩm xương bàn chải');
    const skus = result.products.map((p: any) => p.sku);
    console.log('   Found SKUs:', skus.join(', '));
    // Must contain actual toothbrush bone SKUs (e.g. E01, E02, DO03)
    const hasValidSku = skus.some((s: string) => ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'DO03'].includes(s));
    assert(hasValidSku, 'Danh sách trả về phải chứa các mã xương bàn chải thực tế E01-E06 hoặc DO03');
  });

  // ---------------------------------------------------------------------------
  // TEST 2: ChatbotGuardrails.validateProductSkuGrounding chặn mã SKU bịa đặt
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Guardrail chặn thông tin SKU và giá bịa đặt ---');

  await runAsyncTest('Test 2.1: Chặn tin nhắn bịa đặt chứa C28/C29/C30/C31 xương bàn chải', async () => {
    const hallucinatedText = `Dạ dòng xương gặm hình bàn chải của Lapati hiện đang có các sản phẩm tiêu biểu sau ạ:
- C28 - Xương bàn chải sữa lớn (100g): 33.280 đ (Quy cách: 4 cái/túi)
- C29 - Xương bàn chải sữa nhỏ (100g): 33.280 đ (Quy cách: 8 cái/túi)
- C30 - Xương bàn chải matcha lớn (100g): 33.280 đ (Quy cách: 4 cái/túi)
- C31 - Xương bàn chải matcha nhỏ (100g): 33.280 đ (Quy cách: 8 cái/túi)
Mình cần em hỗ trợ gì thêm không ạ?`;

    const validated = await ChatbotGuardrails.validateProductSkuGrounding(
      hallucinatedText,
      orgId,
      '1. [Mã E01] Xương bàn chải hương sữa - Giá sỉ: 19.500 đ\n2. [Mã E02] Xương bàn chải hương phô mai - Giá sỉ: 19.500 đ'
    );

    console.log('   Validated response output:\n' + validated);
    assert(!validated.includes('C29'), 'Không được chứa mã bịa C29');
    assert(!validated.includes('C30'), 'Không được chứa mã bịa C30');
    assert(!validated.includes('33.280'), 'Không được chứa giá bịa 33.280 đ');
    assert(validated.includes('E01'), 'Phải thay thế bằng thông tin sản phẩm chuẩn xác E01');
  });

  await runAsyncTest('Test 2.2: Cho phép tin nhắn chứa SKU thật hợp lệ đi qua', async () => {
    const legitimateText = `Dạ sản phẩm E01 Xương bàn chải hương sữa hiện có giá sỉ là 19.500 đ ạ.`;
    const validated = await ChatbotGuardrails.validateProductSkuGrounding(
      legitimateText,
      orgId
    );
    assert.strictEqual(validated, legitimateText, 'Tin nhắn chuẩn không được bị thay đổi');
  });

  console.log('\n================================================================');
  console.log(`🎉 KẾT QUẢ: ${passed}/${total} TESTS PASSED!`);
  console.log('================================================================');
}

main().finally(() => prisma.$disconnect());
