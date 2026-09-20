/**
 * Unit test for MB Bank SMS Parser & Idempotency
 * Chạy: npx tsx src/scripts/test-mb-sms.ts
 */
import { parseMbBankSms } from '../modules/payments/mb-sms-parser.js';
import { parseIncomingSms } from '../modules/payments/sms-parser.js';

console.log('============================================================');
console.log('     KIỂM THỬ BỘ BÓC TÁCH SMS MB BANK (MB-SMS-PARSER)     ');
console.log('============================================================\n');

// ── Test Case 1: Tin nhắn chuẩn MB Bank có mã ORD ─────────────────────────
const sms1 = 'TK 0380123456789|GD: +500,000VND 20/09/26 14:30|SD: 15,200,000VND|ND: NGUYEN VAN A CHUYEN TIEN ORD-20260920-001';
const res1 = parseMbBankSms(sms1);
console.log('Test Case 1 (Chuẩn MB + Mã ORD):');
console.log(' - Hợp lệ:', res1.isValid);
console.log(' - STK nhận:', res1.accountNumber);
console.log(' - Số tiền:', res1.amount, `(Loại: ${res1.type})`);
console.log(' - Số dư sau GD:', res1.balanceAfter);
console.log(' - Tên người gửi:', res1.senderNameRaw);
console.log(' - Mã đơn tìm thấy:', res1.candidateOrderCodes);
console.log(' - Thời gian:', res1.transactionTime.toLocaleString('vi-VN'));
console.log(' => Kết quả:', res1.amount === 500000 && res1.candidateOrderCodes.includes('ORD-20260920-001') && res1.accountNumber === '0380123456789' ? '✅ PASS' : '❌ FAIL');
console.log('------------------------------------------------------------\n');

// ── Test Case 2: Tin nhắn NAPAS liên ngân hàng vào MB có mã SO Odoo ───────
const sms2 = 'MB: 20/09/26 15:45|TK 0380987654321|GD: +1,250,000VND|SD: 20,450,000VND|ND: MBVCB.987654.TRAN THI B CHUYEN TIEN SO02345';
const res2 = parseMbBankSms(sms2);
console.log('Test Case 2 (NAPAS VCB vào MB + Mã SO Odoo):');
console.log(' - Hợp lệ:', res2.isValid);
console.log(' - STK nhận:', res2.accountNumber);
console.log(' - Số tiền:', res2.amount);
console.log(' - Tên người gửi bóc tách:', res2.senderNameRaw);
console.log(' - Mã đơn tìm thấy:', res2.candidateOrderCodes);
console.log(' => Kết quả:', res2.amount === 1250000 && res2.candidateOrderCodes.includes('SO02345') && res2.senderNameRaw?.includes('TRAN THI B') ? '✅ PASS' : '❌ FAIL');
console.log('------------------------------------------------------------\n');

// ── Test Case 3: Khách không ghi mã đơn nhưng có SĐT ─────────────────────
const sms3 = 'TK 0380123456789 GD: +350,000VND 20/09/26 16:00 SD: 2,500,000VND ND: LE THI C 0987654321 CK TIEN HANG';
const res3 = parseMbBankSms(sms3);
console.log('Test Case 3 (Không mã đơn, có SĐT 0987654321):');
console.log(' - Hợp lệ:', res3.isValid);
console.log(' - Số tiền:', res3.amount);
console.log(' - SĐT trích xuất:', res3.candidatePhones);
console.log(' => Kết quả:', res3.amount === 350000 && res3.candidatePhones.includes('0987654321') ? '✅ PASS' : '❌ FAIL');
console.log('------------------------------------------------------------\n');

// ── Test Case 4: Tin nhắn trừ tiền (Tiền ra - OUT) ─────────────────────────
const sms4 = 'TK 0380123456789|GD: -22,000VND 20/09/26 17:00|SD: 15,178,000VND|ND: PHI DUY TRI TAI KHOAN';
const res4 = parseMbBankSms(sms4);
console.log('Test Case 4 (Tiền ra - OUT):');
console.log(' - Số tiền:', res4.amount, `(Loại: ${res4.type})`);
console.log(' => Kết quả:', res4.type === 'OUT' && res4.amount === 22000 ? '✅ PASS (Nhận diện đúng tiền ra)' : '❌ FAIL');
console.log('------------------------------------------------------------\n');

// ── Test Case 5: Băm chống trùng lặp (Idempotency Hash) ───────────────────
const full1 = parseIncomingSms({ content: sms1, sender: 'MBBANK' });
const full2 = parseIncomingSms({ content: sms1, sender: 'MBBANK' });
console.log('Test Case 5 (Chống trùng lặp Idempotency):');
console.log(' - Hash lần 1:', full1.idempotencyHash);
console.log(' - Hash lần 2:', full2.idempotencyHash);
console.log(' => Kết quả:', full1.idempotencyHash === full2.idempotencyHash ? '✅ PASS (2 lần gửi cùng SMS sinh hash trùng 100% để chặn)' : '❌ FAIL');

console.log('\n============================================================');
console.log('             TẤT CẢ TEST CASES ĐÃ HOÀN TẤT!               ');
console.log('============================================================');
