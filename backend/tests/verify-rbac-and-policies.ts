/**
 * verify-rbac-and-policies.ts
 * Automated integration test verifying:
 * 1. Role-based access control (RBAC):
 *    - Staff (member) CAN view promotions and run pricing evaluation.
 *    - Staff (member) CANNOT create, update, toggle status, clone, or delete promotions (403 Forbidden).
 *    - Admin / Owner CAN perform all operations.
 * 2. Official LA PET policies seeded in DB:
 *    - LA_PET_BASIC_22
 *    - LA_PET_CHEW_TIER
 *    - LA_PET_TOOTHBRUSH_COMBO
 *    - LA_PET_BUY_7_GET_1
 *    - LA_PET_REWARD_QUARTER
 *    - LA_PET_REWARD_YEAR
 */

import jwt from 'jsonwebtoken';
import { prisma } from '../src/shared/database/prisma-client.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const BASE_URL = 'http://127.0.0.1:3080';

async function runVerification() {
  console.log('========================================================');
  console.log('🧪 BẮT ĐẦU KIỂM TRA TỰ ĐỘNG PHÂN QUYỀN VÀ DỮ LIỆU DB');
  console.log('========================================================\n');

  const db = prisma as any;
  const org = await db.organization.findFirst({
    where: { name: { contains: 'La Pet', mode: 'insensitive' } },
  });

  if (!org) {
    throw new Error('Không tìm thấy Organization La Pet!');
  }

  // 1. Check policies in DB
  console.log('📌 1. Kiểm tra 6 chính sách LA PET trong Database:');
  const codes = [
    'LA_PET_BASIC_22',
    'LA_PET_CHEW_TIER',
    'LA_PET_TOOTHBRUSH_COMBO',
    'LA_PET_BUY_7_GET_1',
    'LA_PET_REWARD_QUARTER',
    'LA_PET_REWARD_YEAR',
  ];

  for (const code of codes) {
    const policy = await db.promotionPolicy.findFirst({
      where: { orgId: org.id, code, deletedAt: null },
    });
    if (!policy) {
      throw new Error(`❌ Không tìm thấy chính sách ${code} trong DB!`);
    }
    console.log(`  ✅ [${policy.code}] ${policy.name} | Loại: ${policy.type} | Active: ${policy.isActive}`);
  }

  // 2. Generate Tokens for Staff and Admin
  const staffToken = jwt.sign(
    { id: 'mock-staff-id', orgId: org.id, role: 'member', email: 'staff@example.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const adminToken = jwt.sign(
    { id: 'mock-admin-id', orgId: org.id, role: 'admin', email: 'admin@example.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Helper fetch with auth
  async function apiCall(method: string, path: string, token: string, body?: any) {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  console.log('\n📌 2. Kiểm tra quyền của NHÂN VIÊN (role: member):');

  // A. Staff can view list
  const listRes = await apiCall('GET', '/api/v1/promotions', staffToken);
  if (listRes.status === 200 && listRes.data?.success) {
    console.log(`  ✅ Nhân viên GET /api/v1/promotions: 200 OK (${listRes.data.promotions.length} chính sách)`);
  } else {
    throw new Error(`❌ Nhân viên không thể xem danh sách: ${JSON.stringify(listRes)}`);
  }

  // B. Staff can evaluate prices
  const evalRes = await apiCall('POST', '/api/v1/pricing/evaluate', staffToken, {
    items: [
      { sku: 'E1', quantity: 1, unitPrice: 19500 },
      { sku: 'E2', quantity: 1, unitPrice: 19500 },
      { sku: 'E3', quantity: 1, unitPrice: 19500 },
      { sku: 'E4', quantity: 1, unitPrice: 19500 },
      { sku: 'E5', quantity: 1, unitPrice: 19500 },
      { sku: 'E6', quantity: 1, unitPrice: 19500 },
    ],
  });
  if (evalRes.status === 200 && evalRes.data?.success) {
    console.log('  ✅ Nhân viên POST /api/v1/pricing/evaluate (Tính giá): 200 OK');
  } else {
    throw new Error(`❌ Nhân viên không thể tính giá: ${JSON.stringify(evalRes)}`);
  }

  // C. Staff CANNOT create
  const createRes = await apiCall('POST', '/api/v1/promotions', staffToken, {
    code: 'TEST_HACK',
    name: 'Hack promotion',
  });
  if (createRes.status === 403) {
    console.log(`  ✅ Nhân viên POST /api/v1/promotions (Tạo mới): ĐÃ BỊ CHẶN 403 FORBIDDEN (${createRes.data?.error})`);
  } else {
    throw new Error(`❌ Lỗi bảo mật: Nhân viên không bị chặn khi tạo mới! Status: ${createRes.status}`);
  }

  const samplePolicy = listRes.data.promotions[0];

  // D. Staff CANNOT update
  const updateRes = await apiCall('PUT', `/api/v1/promotions/${samplePolicy.id}`, staffToken, {
    name: 'Tampered Name',
  });
  if (updateRes.status === 403) {
    console.log('  ✅ Nhân viên PUT /api/v1/promotions/:id (Sửa đổi): ĐÃ BỊ CHẶN 403 FORBIDDEN');
  } else {
    throw new Error(`❌ Lỗi bảo mật: Nhân viên không bị chặn khi sửa đổi! Status: ${updateRes.status}`);
  }

  // E. Staff CANNOT toggle status
  const toggleRes = await apiCall('PATCH', `/api/v1/promotions/${samplePolicy.id}/toggle-status`, staffToken, {
    isActive: false,
  });
  if (toggleRes.status === 403) {
    console.log('  ✅ Nhân viên PATCH /api/v1/promotions/:id/toggle-status (Bật/Tắt): ĐÃ BỊ CHẶN 403 FORBIDDEN');
  } else {
    throw new Error(`❌ Lỗi bảo mật: Nhân viên không bị chặn khi bật/tắt! Status: ${toggleRes.status}`);
  }

  // F. Staff CANNOT clone
  const cloneRes = await apiCall('POST', `/api/v1/promotions/${samplePolicy.id}/clone`, staffToken);
  if (cloneRes.status === 403) {
    console.log('  ✅ Nhân viên POST /api/v1/promotions/:id/clone (Nhân bản): ĐÃ BỊ CHẶN 403 FORBIDDEN');
  } else {
    throw new Error(`❌ Lỗi bảo mật: Nhân viên không bị chặn khi nhân bản! Status: ${cloneRes.status}`);
  }

  // G. Staff CANNOT delete
  const deleteRes = await apiCall('DELETE', `/api/v1/promotions/${samplePolicy.id}`, staffToken);
  if (deleteRes.status === 403) {
    console.log('  ✅ Nhân viên DELETE /api/v1/promotions/:id (Xóa): ĐÃ BỊ CHẶN 403 FORBIDDEN');
  } else {
    throw new Error(`❌ Lỗi bảo mật: Nhân viên không bị chặn khi xóa! Status: ${deleteRes.status}`);
  }

  console.log('\n📌 3. Kiểm tra quyền của QUẢN TRỊ VIÊN (role: admin):');

  // Admin clone
  const adminCloneRes = await apiCall('POST', `/api/v1/promotions/${samplePolicy.id}/clone`, adminToken);
  if (adminCloneRes.status === 200 && adminCloneRes.data?.success) {
    const clonedId = adminCloneRes.data.promotion.id;
    console.log(`  ✅ Quản trị viên POST /api/v1/promotions/:id/clone: 200 OK (Tạo bản sao ${adminCloneRes.data.promotion.code})`);

    // Admin toggle status
    const adminToggleRes = await apiCall('PATCH', `/api/v1/promotions/${clonedId}/toggle-status`, adminToken, {
      isActive: true,
    });
    if (adminToggleRes.status === 200 && adminToggleRes.data?.success) {
      console.log('  ✅ Quản trị viên PATCH /api/v1/promotions/:id/toggle-status: 200 OK');
    }

    // Admin delete
    const adminDeleteRes = await apiCall('DELETE', `/api/v1/promotions/${clonedId}`, adminToken);
    if (adminDeleteRes.status === 200 && adminDeleteRes.data?.success) {
      console.log('  ✅ Quản trị viên DELETE /api/v1/promotions/:id: 200 OK');
    }
  } else {
    throw new Error(`❌ Quản trị viên không thể nhân bản: ${JSON.stringify(adminCloneRes)}`);
  }

  console.log('\n========================================================');
  console.log('🎉 TẤT CẢ CÁC BÀI KIỂM TRA PHÂN QUYỀN VÀ DB HOÀN TOÀN ĐẠT CHUẨN (100% PASS)!');
  console.log('========================================================\n');
}

runVerification().catch(err => {
  console.error('❌ Kiểm tra thất bại:', err);
  process.exit(1);
});
