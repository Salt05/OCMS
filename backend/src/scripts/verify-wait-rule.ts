import { SlotExtractor } from '../modules/chatbot/slot-extractor.js';
import { NextActionEngine } from '../modules/chatbot/next-action-engine.js';
import { ChatbotToolExecutor } from '../modules/chatbot/chatbot-tools.js';
import { ChatbotGuardrails } from '../modules/chatbot/chatbot-guardrails.js';

async function main() {
  console.log('=== TEST 1: Normal Query (SKU Inquiry) ===');
  const userMsg = '2 món xương nơ da bò trắng vàng có mã là gì';
  const extracted = SlotExtractor.extract(userMsg);
  console.log('Extracted intent:', extracted.intent);
  console.log('Extracted skuInquiryQuery:', extracted.skuInquiryQuery);

  const mockPet: any = { type: {}, breed: {}, age_months: {}, weight_kg: {}, size: {}, texture_preference: {}, allergies: {} };
  const mockCustomer: any = { name: { value: 'Phạm' }, phone: {}, address: {}, customer_type: {}, payment_term: {} };
  
  const nextDecision = NextActionEngine.decide(
    'ORDER_COLLECTION',
    mockPet,
    mockCustomer,
    extracted,
    null,
    [],
    false,
    true
  );
  console.log('Next decision action:', nextDecision.action);
  console.log('Next decision reason:', nextDecision.reason);
  console.log('Product search query:', nextDecision.productSearchQuery);

  console.log('\n=== TEST 2: Product Search Tool ===');
  const orgId = 'f4a9d7b5-0181-47cf-948d-5af48a77236e';
  const executor = new ChatbotToolExecutor(orgId, 'test-conv');
  const searchRes = await executor.searchProduct(nextDecision.productSearchQuery?.query || userMsg);
  console.log('Found products count:', searchRes.count);
  for (const p of searchRes.products || []) {
    console.log(`- [${p.sku}] ${p.name} (Giá: ${p.formatted_price})`);
  }

  console.log('\n=== TEST 3: Guardrail Unwanted Wait Interception ===');
  const badAiReply = 'Dạ để em kiểm tra lại danh sách mã xương nơ da bò cho mình nhé ạ. Chị chờ em một chút nha!';
  const isUnwantedWait = ChatbotGuardrails.detectUnwantedWaitResponse(badAiReply);
  console.log(`Is "${badAiReply}" flagged as unwanted wait?`, isUnwantedWait);

  const goodAiReply = 'Dạ 2 món xương da bò của mình có mã là: C42 (trắng) và C41 (vàng) nhé ạ!';
  const isGoodReplyFlagged = ChatbotGuardrails.detectUnwantedWaitResponse(goodAiReply);
  console.log(`Is concrete reply "${goodAiReply}" flagged?`, isGoodReplyFlagged);

  console.log('\n=== ALL ASSERTIONS ===');
  if (extracted.skuInquiryQuery && nextDecision.action === 'SEARCH_PRODUCT' && (searchRes?.count || 0) > 0 && isUnwantedWait && !isGoodReplyFlagged) {
    console.log('>>> SUCCESS: All checks PASSED perfectly! <<<');
  } else {
    console.error('>>> FAILURE: Some checks failed! <<<');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
