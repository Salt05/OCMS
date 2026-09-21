/**
 * tests/sms-gateway-compatibility.test.ts
 * Automated verification of OCMS Mobile Gateway & OCMS Backend compatibility:
 * 1. GET /api/v1/payments/sms-webhook/health with valid Bearer token -> 200 { status: 'healthy' }
 * 2. GET /api/v1/payments/sms-webhook/health with invalid Bearer token -> 401 { status: 'unauthorized' }
 * 3. GET /api/v1/payments/sms-webhook/health with missing token -> 401 { status: 'unauthorized' }
 * 4. GET /api/v1/payments/sms-webhook/health with x-webhook-secret header -> 200 { status: 'healthy' }
 * 5. POST /api/v1/payments/sms-webhook with Android Gateway payload (Bearer, messageId, deviceId, message, receivedAt) -> 200
 * 6. POST /api/v1/payments/sms-webhook with Duplicate messageId -> 200 { isDuplicate: true }
 * 7. POST /api/v1/payments/sms-webhook with Legacy payload (x-webhook-secret, content, timestamp) -> 200
 * 8. POST /api/v1/payments/sms-webhook with Invalid Token -> 401
 */

import Fastify from 'fastify';
import { paymentRoutes } from '../src/modules/payments/payment-routes.js';
import { prisma } from '../src/shared/database/prisma-client.js';

const VALID_TOKEN = 'ocms_gateway_secret_key';
const INVALID_TOKEN = 'completely_invalid_secret_token';
const TEST_MESSAGE_ID = 'test_gateway_msg_' + Date.now();
const TEST_DEVICE_ID = 'android_test_device_001';

async function runGatewayCompatibilityTests() {
  console.log('🚀 Starting OCMS Mobile Gateway Compatibility Tests...\n');

  const app = Fastify({ logger: false });
  await app.register(paymentRoutes);
  await app.ready();

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
      failedTests++;
    }
  }

  try {
    // ── Test 1: Health check with valid Bearer token ──
    console.log('[1] Health Check Verification:');
    const healthValid = await app.inject({
      method: 'GET',
      url: '/api/v1/payments/sms-webhook/health',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
      },
    });
    const healthValidBody = JSON.parse(healthValid.body);
    assert(
      healthValid.statusCode === 200 && healthValidBody.status === 'healthy',
      'GET /health with valid Bearer token returns 200 {"status": "healthy"}',
      `Got ${healthValid.statusCode} ${healthValid.body}`
    );

    // ── Test 2: Health check with invalid Bearer token ──
    const healthInvalid = await app.inject({
      method: 'GET',
      url: '/api/v1/payments/sms-webhook/health',
      headers: {
        authorization: `Bearer ${INVALID_TOKEN}`,
      },
    });
    const healthInvalidBody = JSON.parse(healthInvalid.body);
    assert(
      healthInvalid.statusCode === 401 && healthInvalidBody.status === 'unauthorized',
      'GET /health with invalid Bearer token returns 401 {"status": "unauthorized"}',
      `Got ${healthInvalid.statusCode} ${healthInvalid.body}`
    );

    // ── Test 3: Health check without token ──
    const healthNoToken = await app.inject({
      method: 'GET',
      url: '/api/v1/payments/sms-webhook/health',
    });
    assert(
      healthNoToken.statusCode === 401,
      'GET /health with no token returns 401',
      `Got ${healthNoToken.statusCode}`
    );

    // ── Test 4: Health check with legacy x-webhook-secret header ──
    const healthLegacy = await app.inject({
      method: 'GET',
      url: '/api/v1/payments/sms-webhook/health',
      headers: {
        'x-webhook-secret': VALID_TOKEN,
      },
    });
    const healthLegacyBody = JSON.parse(healthLegacy.body);
    assert(
      healthLegacy.statusCode === 200 && healthLegacyBody.status === 'healthy',
      'GET /health with x-webhook-secret header returns 200 {"status": "healthy"}',
      `Got ${healthLegacy.statusCode} ${healthLegacy.body}`
    );

    // ── Test 5: POST SMS Webhook with Android Mobile Gateway payload ──
    console.log('\n[2] Android Mobile Gateway SMS Webhook:');
    const androidPayload = {
      messageId: TEST_MESSAGE_ID,
      deviceId: TEST_DEVICE_ID,
      sender: 'MBBANK',
      message: 'TK 0380123456789 GD: +150,000VND 20/09/26 15:45 ND: LAPET DH9999',
      receivedAt: '2026-09-20T15:45:00.000Z',
    };

    const smsRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/sms-webhook',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      payload: androidPayload,
    });

    const smsBody = JSON.parse(smsRes.body);
    assert(
      smsRes.statusCode === 200 && smsBody.success === true,
      'POST /sms-webhook with Android Gateway payload returns 200 success',
      `Got ${smsRes.statusCode} ${smsRes.body}`
    );

    // Check DB persistence
    const savedTx = await prisma.bankTransaction.findUnique({
      where: { gatewayMessageId: TEST_MESSAGE_ID },
    });
    assert(
      !!savedTx && savedTx.deviceId === TEST_DEVICE_ID && savedTx.amount === 150000,
      'Database contains BankTransaction with gatewayMessageId and deviceId saved',
      `Found: ${JSON.stringify(savedTx ? { id: savedTx.id, deviceId: savedTx.deviceId, amount: savedTx.amount } : null)}`
    );

    // ── Test 6: Idempotency Layer 1 - Duplicate messageId ──
    console.log('\n[3] Idempotency & Deduplication:');
    const duplicateRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/sms-webhook',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      payload: androidPayload,
    });

    const duplicateBody = JSON.parse(duplicateRes.body);
    assert(
      duplicateRes.statusCode === 200 &&
        duplicateBody.success === true &&
        duplicateBody.isDuplicate === true,
      'POST /sms-webhook with duplicate messageId returns 200 with isDuplicate: true',
      `Got ${duplicateRes.statusCode} ${duplicateRes.body}`
    );

    const totalMatchingTxs = await prisma.bankTransaction.count({
      where: { gatewayMessageId: TEST_MESSAGE_ID },
    });
    assert(
      totalMatchingTxs === 1,
      'Duplicate request did not create additional BankTransaction row in DB',
      `Total count: ${totalMatchingTxs}`
    );

    // ── Test 7: Legacy SMS payload (x-webhook-secret, content, timestamp) ──
    console.log('\n[4] Legacy Payload Compatibility:');
    const legacyPayload = {
      sender: 'MBBank',
      content: 'TK 0380123456789 GD: +80,000VND 20/09/26 15:50 ND: LEGACY_PAYLOAD_TEST',
      timestamp: Date.now(),
    };

    const legacySmsRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/sms-webhook',
      headers: {
        'x-webhook-secret': VALID_TOKEN,
      },
      payload: legacyPayload,
    });

    const legacySmsBody = JSON.parse(legacySmsRes.body);
    assert(
      legacySmsRes.statusCode === 200 && legacySmsBody.success === true,
      'POST /sms-webhook with legacy content, timestamp, x-webhook-secret returns 200 success',
      `Got ${legacySmsRes.statusCode} ${legacySmsRes.body}`
    );

    // ── Test 8: Unauthorized SMS Webhook ──
    console.log('\n[5] Unauthorized Request Handling:');
    const unauthRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/sms-webhook',
      headers: {
        authorization: `Bearer ${INVALID_TOKEN}`,
      },
      payload: {
        message: 'TK 0380123456789 GD: +50,000VND ND: UNAUTHORIZED',
      },
    });

    assert(
      unauthRes.statusCode === 401,
      'POST /sms-webhook with invalid Bearer token returns 401',
      `Got ${unauthRes.statusCode}`
    );

  } catch (error: any) {
    console.error('Unexpected error during testing:', error);
    failedTests++;
  } finally {
    // Clean up test records
    try {
      await prisma.bankTransaction.deleteMany({
        where: {
          gatewayMessageId: TEST_MESSAGE_ID,
        },
      });
      console.log('\n🧹 Cleaned up test BankTransaction records.');
    } catch (e) {}

    await app.close();
    await prisma.$disconnect();
  }

  console.log(`\n========================================`);
  console.log(`TEST RESULTS: ${passedTests} passed, ${failedTests} failed`);
  console.log(`========================================`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runGatewayCompatibilityTests();
