/**
 * tests/payment-reconciliation.test.ts
 * Unit tests cho hệ thống Payment Reconciliation 2 tầng (Hard Rules + Scoring)
 *
 * Test cases:
 *  1.  Đúng mã + đúng tiền → AUTO_PAID
 *  2.  Đúng mã + thiếu tiền → PARTIAL_PAYMENT
 *  3.  Đúng mã + thừa tiền → OVERPAYMENT
 *  4.  Đúng mã + Order đã PAID → PAYMENT_AFTER_PAID
 *  5.  Sai mã / mã không tồn tại → ORDER_NOT_FOUND
 *  6.  Không có mã + đúng tên + đúng tiền → CANDIDATE_FOUND
 *  7.  Không có mã + không đủ dữ liệu → NEED_REVIEW
 *  8.  Transaction time < Order createdAt → INVALID_TRANSACTION_TIME
 *  9.  Duplicate gatewayMessageId → Idempotent
 *  10. DEBIT transaction → DEBIT_IGNORED
 *  11. Raw SMS vẫn lưu nguyên vẹn
 *  12. Parser bóc tách S02312 + NGUYEN VAN A từ nhiều format
 */

import { parseIncomingSms, type SmsPayloadInput } from '../src/modules/payments/sms-parser.js';
import {
  extractCandidateOrderCodes,
  extractTransferContent,
  extractSenderNameFromMB,
  type ParsedTransferContent,
} from '../src/modules/payments/mb-sms-parser.js';
import { RECON_STATUS, RECON_REASON, SCORING_WEIGHTS } from '../src/modules/payments/reconciliation-service.js';

// ── Test helpers ────────────────────────────────────────────────────────────────
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` — ${detail}` : ''}`);
    failedTests++;
  }
}

function assertEq(actual: any, expected: any, testName: string) {
  const ok = actual === expected;
  assert(ok, testName, ok ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertIncludes(arr: string[], value: string, testName: string) {
  const ok = arr.includes(value);
  assert(ok, testName, ok ? undefined : `expected array to include "${value}", got [${arr.join(', ')}]`);
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: SMS Parser & Transfer Content Extraction
// ══════════════════════════════════════════════════════════════════════════════

async function runParserTests() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('TEST GROUP 12: SMS Parser — Bóc tách Order Code & Customer Name');
  console.log('═══════════════════════════════════════════════════\n');

  // ── 12a: extractCandidateOrderCodes phải match S0XXXX ──
  console.log('[12a] extractCandidateOrderCodes S0XXXX:');
  const codes1 = extractCandidateOrderCodes('TT S02312 NGUYEN VAN A');
  assertIncludes(codes1, 'S02312', 'S02312 found in "TT S02312 NGUYEN VAN A"');

  const codes2 = extractCandidateOrderCodes('THANH TOAN S02300');
  assertIncludes(codes2, 'S02300', 'S02300 found in "THANH TOAN S02300"');

  const codes3 = extractCandidateOrderCodes('Thanh toan don S12345 chuyen tien');
  assertIncludes(codes3, 'S12345', 'S12345 found in long text');

  const codes4 = extractCandidateOrderCodes('ORD-20260920-001 payment');
  assert(codes4.some(c => c.includes('ORD')), 'ORD format still works', JSON.stringify(codes4));

  const codes5 = extractCandidateOrderCodes('DH99999 xin cam on');
  assert(codes5.length > 0, 'DH format still works', JSON.stringify(codes5));

  // ── 12b: extractTransferContent bóc tách đúng ──
  console.log('\n[12b] extractTransferContent:');

  const tc1 = extractTransferContent('TT S02312 NGUYEN VAN A');
  assertEq(tc1.orderCode, 'S02312', 'Order code from "TT S02312 NGUYEN VAN A"');
  assertEq(tc1.customerName, 'NGUYEN VAN A', 'Customer name from "TT S02312 NGUYEN VAN A"');

  const tc2 = extractTransferContent('THANH TOAN S02312 NGUYEN VAN A');
  assertEq(tc2.orderCode, 'S02312', 'Order code from "THANH TOAN S02312 NGUYEN VAN A"');
  assertEq(tc2.customerName, 'NGUYEN VAN A', 'Customer name from THANH TOAN prefix');

  const tc3 = extractTransferContent('S02312 NGUYEN VAN A');
  assertEq(tc3.orderCode, 'S02312', 'Order code from "S02312 NGUYEN VAN A"');
  assertEq(tc3.customerName, 'NGUYEN VAN A', 'Customer name without prefix');

  const tc4 = extractTransferContent('Thanh toan don S02312');
  assertEq(tc4.orderCode, 'S02312', 'Order code from "Thanh toan don S02312"');
  assertEq(tc4.customerName, null, 'No customer name when not present');

  const tc5 = extractTransferContent('S02312');
  assertEq(tc5.orderCode, 'S02312', 'Order code from standalone "S02312"');
  assertEq(tc5.customerName, null, 'No customer name from standalone code');

  const tc6 = extractTransferContent('random text without order info');
  assertEq(tc6.orderCode, null, 'No order code from random text');
  assertEq(tc6.customerName, null, 'No customer name from random text');

  // Extra whitespace handling
  const tc7 = extractTransferContent('  TT  S02312   NGUYEN   VAN   A  ');
  assertEq(tc7.orderCode, 'S02312', 'Order code with extra whitespace');
  assertEq(tc7.customerName, 'NGUYEN VAN A', 'Customer name normalized whitespace');

  // ── 12c: Full parseIncomingSms pipeline ──
  console.log('\n[12c] Full parseIncomingSms pipeline:');

  const fullSms: SmsPayloadInput = {
    sender: 'MBBANK',
    content: 'TK 0123456789 GD: +500,000VND 20/09/26 14:30 ND: TT S02312 NGUYEN VAN A',
    timestamp: Date.now(),
  };
  const fullResult = parseIncomingSms(fullSms);

  assertEq(fullResult.parsedOrderCode, 'S02312', 'parsedOrderCode from full SMS');
  assertEq(fullResult.parsedCustomerName, 'NGUYEN VAN A', 'parsedCustomerName from full SMS');
  assertEq(fullResult.amount, 500000, 'Amount parsed correctly');
  assertEq(fullResult.type, 'IN', 'Type is IN (credit)');
  assertEq(fullResult.accountNumber, '0123456789', 'Account number parsed');
  assert(fullResult.candidateOrderCodes.includes('S02312'), 'S02312 in candidateOrderCodes');
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Reconciliation Constants & Scoring Weights
// ══════════════════════════════════════════════════════════════════════════════

async function runReconConstantsTests() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('TEST GROUP: Reconciliation Constants & Scoring');
  console.log('═══════════════════════════════════════════════════\n');

  // Verify scoring weights match spec
  assertEq(SCORING_WEIGHTS.ORDER_CODE_MATCH, 90, 'ORDER_CODE_MATCH weight = 90');
  assertEq(SCORING_WEIGHTS.AMOUNT_MATCH, 10, 'AMOUNT_MATCH weight = 10');
  assertEq(SCORING_WEIGHTS.AMOUNT_MISMATCH, -10, 'AMOUNT_MISMATCH weight = -10');
  assertEq(SCORING_WEIGHTS.CUSTOMER_NAME_MATCH, 10, 'CUSTOMER_NAME_MATCH weight = 10');
  assertEq(SCORING_WEIGHTS.VALID_TRANSACTION_TIME, 5, 'VALID_TRANSACTION_TIME weight = 5');

  // Verify all expected statuses exist
  assertEq(RECON_STATUS.AUTO_PAID, 'AUTO_PAID', 'AUTO_PAID status defined');
  assertEq(RECON_STATUS.PARTIAL_PAYMENT, 'PARTIAL_PAYMENT', 'PARTIAL_PAYMENT status defined');
  assertEq(RECON_STATUS.OVERPAYMENT, 'OVERPAYMENT', 'OVERPAYMENT status defined');
  assertEq(RECON_STATUS.ORDER_NOT_FOUND, 'ORDER_NOT_FOUND', 'ORDER_NOT_FOUND status defined');
  assertEq(RECON_STATUS.PAYMENT_AFTER_PAID, 'PAYMENT_AFTER_PAID', 'PAYMENT_AFTER_PAID status defined');
  assertEq(RECON_STATUS.ORDER_CANCELLED, 'ORDER_CANCELLED', 'ORDER_CANCELLED status defined');
  assertEq(RECON_STATUS.INVALID_TRANSACTION_TIME, 'INVALID_TRANSACTION_TIME', 'INVALID_TRANSACTION_TIME status defined');
  assertEq(RECON_STATUS.NEED_REVIEW, 'NEED_REVIEW', 'NEED_REVIEW status defined');
  assertEq(RECON_STATUS.DEBIT_IGNORED, 'DEBIT_IGNORED', 'DEBIT_IGNORED status defined');
  assertEq(RECON_STATUS.CANDIDATE_FOUND, 'CANDIDATE_FOUND', 'CANDIDATE_FOUND status defined');

  // Verify all expected reasons exist
  assertEq(RECON_REASON.ORDER_CODE_MATCH, 'ORDER_CODE_MATCH', 'ORDER_CODE_MATCH reason defined');
  assertEq(RECON_REASON.AMOUNT_MATCH, 'AMOUNT_MATCH', 'AMOUNT_MATCH reason defined');
  assertEq(RECON_REASON.AMOUNT_MISMATCH, 'AMOUNT_MISMATCH', 'AMOUNT_MISMATCH reason defined');
  assertEq(RECON_REASON.CUSTOMER_NAME_MATCH, 'CUSTOMER_NAME_MATCH', 'CUSTOMER_NAME_MATCH reason defined');
  assertEq(RECON_REASON.VALID_TRANSACTION_TIME, 'VALID_TRANSACTION_TIME', 'VALID_TRANSACTION_TIME reason defined');
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: DEBIT Transaction (Case 10)
// ══════════════════════════════════════════════════════════════════════════════

async function runDebitTests() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('TEST 10: DEBIT Transaction → không AUTO_PAID');
  console.log('═══════════════════════════════════════════════════\n');

  const debitSms: SmsPayloadInput = {
    sender: 'MBBANK',
    content: 'TK 0123456789 GD: -500,000VND 20/09/26 14:30 ND: TT S02312',
    timestamp: Date.now(),
  };
  const parsed = parseIncomingSms(debitSms);

  assertEq(parsed.type, 'OUT', 'DEBIT SMS parsed as type OUT');
  assert(parsed.amount > 0, 'DEBIT amount is positive (absolute value)', `amount = ${parsed.amount}`);
  // Note: Reconciliation would return DEBIT_IGNORED but that requires DB access
  // Here we verify the parser correctly identifies debit transactions
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Raw SMS Preservation (Case 11)
// ══════════════════════════════════════════════════════════════════════════════

async function runRawSmsTests() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('TEST 11: Raw SMS Preservation');
  console.log('═══════════════════════════════════════════════════\n');

  const rawContent = 'TK 0123456789 GD: +500,000VND 20/09/26 14:30 ND: TT S02312 NGUYEN VAN A';
  const smsInput: SmsPayloadInput = {
    sender: 'MBBANK',
    content: rawContent,
    timestamp: Date.now(),
  };
  const parsed = parseIncomingSms(smsInput);

  assertEq(parsed.rawSms, rawContent, 'rawSms equals original content exactly');
  assert(parsed.rawSms.length === rawContent.length, 'rawSms length preserved');
  assert(
    parsed.rawSms.includes('TT S02312 NGUYEN VAN A'),
    'rawSms still contains original transfer description'
  );
  assert(parsed.idempotencyHash.length === 64, 'idempotencyHash is SHA-256 (64 chars)');
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Various SMS Formats (Case 12 extended)
// ══════════════════════════════════════════════════════════════════════════════

async function runVariousFormatTests() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('TEST 12+: Various SMS Formats — MB Bank');
  console.log('═══════════════════════════════════════════════════\n');

  // Format 1: Standard MB Bank
  const sms1 = parseIncomingSms({
    sender: 'MBBANK',
    content: 'TK 0380123456789 GD: +500,000VND 20/09/26 14:30 SD: 15,200,000VND ND: TT S02312 NGUYEN VAN A',
    timestamp: Date.now(),
  });
  assertEq(sms1.parsedOrderCode, 'S02312', 'Format 1: Standard MB Bank');
  assertEq(sms1.parsedCustomerName, 'NGUYEN VAN A', 'Format 1: Customer name');
  assertEq(sms1.amount, 500000, 'Format 1: Amount');
  assert(sms1.balanceAfter === 15200000, 'Format 1: Balance after', `got ${sms1.balanceAfter}`);

  // Format 2: Without "TT" prefix
  const sms2 = parseIncomingSms({
    sender: 'MBBANK',
    content: 'TK 0123456789 GD: +300,000VND ND: S02300 TRAN THI B',
    timestamp: Date.now(),
  });
  assertEq(sms2.parsedOrderCode, 'S02300', 'Format 2: Without TT prefix');
  assertEq(sms2.parsedCustomerName, 'TRAN THI B', 'Format 2: Customer name');

  // Format 3: THANH TOAN prefix
  const sms3 = parseIncomingSms({
    sender: 'MBBANK',
    content: 'TK 0123456789 GD: +1,250,000VND ND: THANH TOAN S02400 LE VAN C',
    timestamp: Date.now(),
  });
  assertEq(sms3.parsedOrderCode, 'S02400', 'Format 3: THANH TOAN prefix');
  assertEq(sms3.parsedCustomerName, 'LE VAN C', 'Format 3: Customer name');
  assertEq(sms3.amount, 1250000, 'Format 3: Amount 1,250,000');

  // Format 4: Only order code, no customer name
  const sms4 = parseIncomingSms({
    sender: 'MBBANK',
    content: 'TK 0123456789 GD: +200,000VND ND: S02500',
    timestamp: Date.now(),
  });
  assertEq(sms4.parsedOrderCode, 'S02500', 'Format 4: Only order code');
  assertEq(sms4.parsedCustomerName, null, 'Format 4: No customer name');

  // Format 5: Debit (tiền ra)
  const sms5 = parseIncomingSms({
    sender: 'MBBANK',
    content: 'TK 0123456789 GD: -100,000VND ND: CHUYEN TIEN',
    timestamp: Date.now(),
  });
  assertEq(sms5.type, 'OUT', 'Format 5: Debit transaction');
  assertEq(sms5.amount, 100000, 'Format 5: Debit amount');

  // Format 6: Alternative amount format (tang / cong)
  const sms6 = parseIncomingSms({
    sender: 'MBBANK',
    content: 'TK 0123456789 tang 500.000 VND ND: S02312',
    timestamp: Date.now(),
  });
  assertEq(sms6.amount, 500000, 'Format 6: "tang" amount format');
  assertEq(sms6.type, 'IN', 'Format 6: "tang" is credit');

  // Format 7: No order code — random content
  const sms7 = parseIncomingSms({
    sender: 'MBBANK',
    content: 'TK 0123456789 GD: +50,000VND ND: HOC PHI THANG 9',
    timestamp: Date.now(),
  });
  assertEq(sms7.parsedOrderCode, null, 'Format 7: No order code in random text');
  assertEq(sms7.parsedCustomerName, null, 'Format 7: No customer name');

  // Format 8: Exact user format: MBBANK: TK <Số_Tài_Khoản> +<Số_Tiền_VND> luc <Giờ> <Ngày>. So du: <Số_Dư_Hiện_Tại>VND. ND: <Nội_dung_chuyển_tiền>
  const sms8 = parseIncomingSms({
    sender: 'MBBANK',
    content: 'MBBANK: TK 0380123456789 +500,000VND luc 14:30 20/09/2026. So du: 15,200,000VND. ND: TT S02312 NGUYEN VAN A',
    timestamp: Date.now(),
  });
  assertEq(sms8.accountNumber, '0380123456789', 'Format 8: Account number');
  assertEq(sms8.amount, 500000, 'Format 8: Amount');
  assertEq(sms8.type, 'IN', 'Format 8: Credit type');
  assertEq(sms8.balanceAfter, 15200000, 'Format 8: Balance after');
  assertEq(sms8.parsedOrderCode, 'S02312', 'Format 8: Order code');
  assertEq(sms8.parsedCustomerName, 'NGUYEN VAN A', 'Format 8: Customer name');
  assert(sms8.isValid, 'Format 8: Is valid');

  // Format 9: Debit in exact user format: MBBANK: TK <acc> -<amount>VND luc ...
  const sms9 = parseIncomingSms({
    sender: 'MBBANK',
    content: 'MBBANK: TK 0380123456789 -250,000VND luc 15:45 20/09/2026. So du: 14,950,000VND. ND: CHUYEN TIEN CHO BAN',
    timestamp: Date.now(),
  });
  assertEq(sms9.accountNumber, '0380123456789', 'Format 9: Account number');
  assertEq(sms9.amount, 250000, 'Format 9: Debit amount');
  assertEq(sms9.type, 'OUT', 'Format 9: Type is OUT');
  assertEq(sms9.balanceAfter, 14950000, 'Format 9: Balance after');
  assert(sms9.isValid, 'Format 9: Is valid');
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Idempotency (Case 9)
// ══════════════════════════════════════════════════════════════════════════════

async function runIdempotencyTests() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('TEST 9: Idempotency — Same SMS → Same Hash');
  console.log('═══════════════════════════════════════════════════\n');

  const input: SmsPayloadInput = {
    sender: 'MBBANK',
    content: 'TK 0123456789 GD: +500,000VND 20/09/26 14:30 ND: TT S02312 NGUYEN VAN A',
    timestamp: 1695207000000,
  };

  const result1 = parseIncomingSms(input);
  const result2 = parseIncomingSms(input);

  assertEq(result1.idempotencyHash, result2.idempotencyHash, 'Same SMS → same idempotencyHash');
  assertEq(result1.parsedOrderCode, result2.parsedOrderCode, 'Same SMS → same parsedOrderCode');
  assertEq(result1.amount, result2.amount, 'Same SMS → same amount');

  // Different content → different hash
  const input3: SmsPayloadInput = {
    sender: 'MBBANK',
    content: 'TK 0123456789 GD: +600,000VND 20/09/26 14:31 ND: TT S02313',
    timestamp: 1695207100000,
  };
  const result3 = parseIncomingSms(input3);
  assert(result1.idempotencyHash !== result3.idempotencyHash, 'Different SMS → different idempotencyHash');
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN — Run all tests
// ══════════════════════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('🚀 Starting Payment Reconciliation 2-Tier Test Suite...\n');
  console.log('═══════════════════════════════════════════════════');
  console.log('NOTE: Tests 1-8 require database access (reconciliation-service).');
  console.log('Here we test parser, constants, and pure logic without DB.');
  console.log('═══════════════════════════════════════════════════');

  try {
    await runReconConstantsTests();
    await runDebitTests();
    await runRawSmsTests();
    await runIdempotencyTests();
    await runParserTests();
    await runVariousFormatTests();
  } catch (err) {
    console.error('\n💥 Unexpected error during testing:', err);
    failedTests++;
  }

  console.log(`\n════════════════════════════════════════════════════`);
  console.log(`PAYMENT RECONCILIATION TEST RESULTS: ${passedTests} passed, ${failedTests} failed`);
  console.log(`════════════════════════════════════════════════════`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests();
