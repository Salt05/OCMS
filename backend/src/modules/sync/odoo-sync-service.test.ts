import test from 'node:test';
import assert from 'node:assert/strict';

import { findMissingPurchaseOrderIds } from './odoo-sync-service.js';

test('findMissingPurchaseOrderIds keeps active Odoo purchase orders and deletes stale local ones', () => {
  const localIds = [101, 102, 103, 104];
  const remoteIds = [101, 103, 104, 105];

  assert.deepEqual(findMissingPurchaseOrderIds(localIds, remoteIds), [102]);
});

test('findMissingPurchaseOrderIds returns all local ids when Odoo has none', () => {
  const localIds = [11, 12, 13];
  const remoteIds: number[] = [];

  assert.deepEqual(findMissingPurchaseOrderIds(localIds, remoteIds), [11, 12, 13]);
});
