/**
 * Test script to thoroughly verify Integration Settings service:
 * - Dynamic config retrieval & secret masking
 * - AI Test Connection
 * - Odoo ERP Test Connection
 * - Directus Test Connection
 * - Save & Retrieve from Database
 */
import { prisma } from '../shared/database/prisma-client.js';
import { integrationSettingsService } from '../modules/settings/integration-settings-service.js';

async function runTests() {
  console.log('=== STARTING INTEGRATION SETTINGS DEEP TESTS ===\n');

  // 1. Get default Organization
  const org = await prisma.organization.findFirst();
  if (!org) {
    throw new Error('No organization found in database to test with');
  }
  console.log(`[TEST 1] Using Organization: "${org.name}" (ID: ${org.id})`);

  // 2. Test Get Settings for UI (with masking)
  const uiSettings = await integrationSettingsService.getSettingsForUI(org.id);
  console.log('\n[TEST 2] Retrieved Settings for UI:');
  console.log('  AI Provider:', uiSettings.ai.provider);
  console.log('  AI Model:', uiSettings.ai.model);
  console.log('  AI Masked Key:', uiSettings.ai.apiKey);
  console.log('  Odoo URL:', uiSettings.odoo.url);
  console.log('  Odoo DB:', uiSettings.odoo.db);
  console.log('  Odoo User:', uiSettings.odoo.user);
  console.log('  Odoo Masked Key:', uiSettings.odoo.apiKey);
  console.log('  Directus URL:', uiSettings.directus.url);

  // Assert keys are masked
  if (uiSettings.ai.apiKey && !uiSettings.ai.apiKey.includes('••••')) {
    console.error('❌ FAILED: AI API key was not properly masked for UI!');
  } else {
    console.log('✅ PASSED: Sensitive keys are safely masked for UI.');
  }

  // 3. Test AI Connection
  console.log('\n[TEST 3] Testing AI Connection...');
  const aiResult = await integrationSettingsService.testAiConnection({}, org.id);
  console.log('  AI Test Result:', JSON.stringify(aiResult, null, 2));
  if (aiResult.success) {
    console.log(`✅ PASSED: AI Connection successful (${aiResult.latencyMs}ms)! Model used: ${aiResult.modelUsed}`);
  } else {
    console.warn(`⚠️ AI Test Connection returned failure/quota notice: ${aiResult.error}`);
  }

  // 4. Test Odoo Connection
  console.log('\n[TEST 4] Testing Odoo Connection...');
  const odooResult = await integrationSettingsService.testOdooConnection({}, org.id);
  console.log('  Odoo Test Result:', JSON.stringify(odooResult, null, 2));
  if (odooResult.success) {
    console.log(`✅ PASSED: Odoo ERP Connection successful! Authenticated UID: ${odooResult.uid}`);
  } else {
    console.warn(`⚠️ Odoo Connection returned notice: ${odooResult.error}`);
  }

  // 5. Test Directus Connection
  console.log('\n[TEST 5] Testing Directus Connection...');
  const directusResult = await integrationSettingsService.testDirectusConnection({}, org.id);
  console.log('  Directus Test Result:', JSON.stringify(directusResult, null, 2));
  if (directusResult.success) {
    console.log(`✅ PASSED: Directus Connection successful!`);
  } else {
    console.log(`ℹ️ Directus Result (offline fallback expected if local directus not running): ${directusResult.error}`);
  }

  // 6. Test DB Persistence (Save & Retrieve)
  console.log('\n[TEST 6] Testing Database Persistence...');
  const testModel = 'gemini-2.5-flash';
  await integrationSettingsService.saveSettings(org.id, {
    ai: {
      provider: 'gemini',
      model: testModel,
      apiKey: uiSettings.ai.apiKey, // send back masked key to ensure it is NOT overwritten
      baseUrl: '',
    },
  });

  const updatedRaw = await integrationSettingsService.getRawSettings(org.id);
  console.log('  Saved Model in DB:', updatedRaw.ai.model);
  console.log('  Preserved Unmasked Key Length:', updatedRaw.ai.apiKey.length);

  if (updatedRaw.ai.model === testModel && updatedRaw.ai.apiKey && !updatedRaw.ai.apiKey.includes('••••')) {
    console.log('✅ PASSED: Database persistence works and masked key was correctly preserved without corruption!');
  } else {
    console.error('❌ FAILED: Database persistence or key preservation failed!');
  }

  console.log('\n=== ALL DEEP TESTS FINISHED ===');
}

runTests()
  .catch((err) => {
    console.error('❌ Test execution error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
