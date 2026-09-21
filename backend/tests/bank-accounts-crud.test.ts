/**
 * tests/bank-accounts-crud.test.ts
 * Automated verification of Bank Accounts CRUD operations:
 * 1. Create a new bank account -> 200
 * 2. Prevent duplicate account number in same org -> 400
 * 3. Update bank account (change holder, secret, status) -> 200
 * 4. Verify account listed in GET /api/v1/payments/accounts
 * 5. Delete bank account -> 200
 * 6. Verify account is removed from list
 */

import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { paymentRoutes } from '../src/modules/payments/payment-routes.js';
import { prisma } from '../src/shared/database/prisma-client.js';

const JWT_SECRET = '834c311ad36e1c0709b11e2f41b3e8e1245084931a1040375a34e0cd003deff0';
const ORG_ID = 'f4a9d7b5-0181-47cf-948d-5af48a77236e';
const TEST_ACC_NUM = '999988887777';
const TEST_SECRET = 'sec_crud_test_' + Date.now();

async function runAccountsCrudTest() {
  console.log('🚀 Starting Bank Accounts CRUD API Tests...\n');

  const app = Fastify({ logger: false });
  await app.register(fastifyJwt, { secret: JWT_SECRET });
  await app.register(paymentRoutes);
  await app.ready();

  const token = app.jwt.sign({
    id: 'df3e4dc7-3ac6-4053-ada4-e422124ff956',
    orgId: ORG_ID,
    role: 'owner',
    email: 'admin@gmail.com',
  });

  const authHeader = { authorization: `Bearer ${token}` };

  let createdAccountId = '';
  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, name: string, detail?: string) {
    if (cond) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  try {
    // 1. Create Account
    console.log('[1] Create New Bank Account:');
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/accounts',
      headers: authHeader,
      payload: {
        bankName: 'Techcombank',
        bankCode: 'TCB',
        accountNumber: TEST_ACC_NUM,
        accountHolder: 'NGUYEN VAN TEST',
        branch: 'Hà Nội',
        webhookSecret: TEST_SECRET,
        autoApprove: true,
        minTrustScore: 90,
        isActive: true,
      },
    });

    const createBody = JSON.parse(createRes.body);
    assert(createRes.statusCode === 200 && createBody.success === true, 'Create account returns 200 success');
    createdAccountId = createBody.account?.id;
    assert(!!createdAccountId, 'Created account has a valid ID', `ID: ${createdAccountId}`);

    // 2. Prevent duplicate account number in same org
    console.log('\n[2] Duplicate Account Number Prevention:');
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/accounts',
      headers: authHeader,
      payload: {
        bankName: 'Techcombank',
        bankCode: 'TCB',
        accountNumber: TEST_ACC_NUM,
        accountHolder: 'NGUYEN VAN TEST 2',
      },
    });
    assert(dupRes.statusCode === 400, 'Duplicate account number returns 400 Bad Request', `Got ${dupRes.statusCode}`);

    // 3. Update Account
    console.log('\n[3] Update Bank Account:');
    const updateRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/accounts',
      headers: authHeader,
      payload: {
        id: createdAccountId,
        accountNumber: TEST_ACC_NUM,
        accountHolder: 'NGUYEN VAN TEST UPDATED',
        bankName: 'Techcombank Chi Nhanh 2',
        autoApprove: false,
        isActive: false,
      },
    });
    const updateBody = JSON.parse(updateRes.body);
    assert(
      updateRes.statusCode === 200 &&
      updateBody.account?.accountHolder === 'NGUYEN VAN TEST UPDATED' &&
      updateBody.account?.isActive === false,
      'Update account by ID returns 200 and reflects changes'
    );

    // 4. List Accounts
    console.log('\n[4] List Accounts Verification:');
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/payments/accounts',
      headers: authHeader,
    });
    const listBody = JSON.parse(listRes.body);
    const found = listBody.accounts?.some((a: any) => a.id === createdAccountId);
    assert(listRes.statusCode === 200 && found, 'GET /api/v1/payments/accounts lists updated account');

    // 5. Delete Account
    console.log('\n[5] Delete Account:');
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/payments/accounts/${createdAccountId}`,
      headers: authHeader,
    });
    const deleteBody = JSON.parse(deleteRes.body);
    assert(deleteRes.statusCode === 200 && deleteBody.success === true, 'DELETE /api/v1/payments/accounts/:id returns 200 success');

    // 6. Verify removed
    const listAfterDelete = await app.inject({
      method: 'GET',
      url: '/api/v1/payments/accounts',
      headers: authHeader,
    });
    const listAfterBody = JSON.parse(listAfterDelete.body);
    const notFound = !listAfterBody.accounts?.some((a: any) => a.id === createdAccountId);
    assert(notFound, 'Account is successfully removed from database');

  } catch (err: any) {
    console.error('Test error:', err);
    failed++;
  } finally {
    // Cleanup if anything lingered
    if (createdAccountId) {
      await prisma.bankAccount.deleteMany({ where: { id: createdAccountId } });
    }
    await app.close();
    await prisma.$disconnect();
  }

  console.log(`\n========================================`);
  console.log(`CRUD TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);

  if (failed > 0) process.exit(1);
}

runAccountsCrudTest();
