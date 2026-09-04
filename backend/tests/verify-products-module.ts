/**
 * verify-products-module.ts
 * Automated verification of the Product Catalog and Classification Module:
 * 1. Test pagination, filtering and search
 * 2. Test autocomplete suggestions (DISTINCT)
 * 3. Test strict security whitelist (only category and brand allowed, core Odoo fields protected)
 * 4. Test bulk classification update
 */

import jwt from 'jsonwebtoken';

const BASE_URL = 'http://127.0.0.1:3080/api/v1';
const JWT_SECRET = '834c311ad36e1c0709b11e2f41b3e8e1245084931a1040375a34e0cd003deff0';
const ORG_ID = 'f4a9d7b5-0181-47cf-948d-5af48a77236e';

const adminToken = jwt.sign(
  {
    id: 'df3e4dc7-3ac6-4053-ada4-e422124ff956',
    orgId: ORG_ID,
    role: 'owner',
    email: 'admin@gmail.com',
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

async function api(path: string, options: any = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
    ...(options.headers || {}),
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function runTests() {
  console.log('🚀 Bắt đầu kiểm thử tự động Module Quản lý Sản phẩm...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // ── 1. Test List Products API ───────────────────────────────────────────────
  console.log('1. Kiểm tra API GET /api/v1/products:');
  const listRes = await api('/products?limit=10');
  assert(listRes.status === 200, `Status 200 (nhận được: ${listRes.status})`);
  assert(listRes.data.success === true, 'Response data success = true');
  assert(Array.isArray(listRes.data.products), 'Danh sách products là mảng');
  assert(listRes.data.total > 0, `Tổng số sản phẩm trong hệ thống: ${listRes.data.total}`);
  assert(typeof listRes.data.stats?.totalAll === 'number', 'Thống kê stats.totalAll tồn tại');
  assert(typeof listRes.data.stats?.uncategorizedCount === 'number', 'Thống kê stats.uncategorizedCount tồn tại');

  // ── 2. Test Filter & Search ────────────────────────────────────────────────
  console.log('\n2. Kiểm tra Tìm kiếm & Bộ lọc:');
  const searchRes = await api('/products?search=B03');
  assert(searchRes.status === 200, 'Tìm kiếm theo từ khóa "B03" thành công');
  assert(searchRes.data.products.length > 0, `Tìm thấy ${searchRes.data.products.length} sản phẩm chứa "B03"`);

  const uncatRes = await api('/products?status=uncategorized');
  assert(uncatRes.status === 200, 'Lọc sản phẩm chưa phân loại thành công');
  const allUncat = uncatRes.data.products.every((p: any) => !p.category || p.category === '');
  assert(allUncat, 'Tất cả sản phẩm trả về đều chưa có category');

  // ── 3. Test Autocomplete Suggestions ───────────────────────────────────────
  console.log('\n3. Kiểm tra API Gợi ý Autocomplete (SELECT DISTINCT):');
  const suggRes = await api('/products/suggestions');
  assert(suggRes.status === 200, 'Lấy danh sách gợi ý thành công');
  assert(Array.isArray(suggRes.data.categories), 'suggRes.categories là mảng');
  assert(Array.isArray(suggRes.data.brands), 'suggRes.brands là mảng');
  console.log(`     Danh mục hiện có: [${suggRes.data.categories.join(', ')}]`);
  console.log(`     Thương hiệu hiện có: [${suggRes.data.brands.join(', ')}]`);

  // ── 4. Test Strict Security Whitelist on PATCH /products/:id ───────────────
  console.log('\n4. Kiểm tra Bảo mật & Whitelist (Khóa toàn bộ thông tin Odoo):');
  const targetProd = listRes.data.products[0];
  const origSku = targetProd.sku;
  const origName = targetProd.name;
  const origPrice = targetProd.listPrice;

  // Cố tình gửi các trường bị cấm sửa
  const attackPayload = {
    sku: 'HACKED_SKU_TEST',
    name: 'HACKED_NAME_TEST',
    listPrice: 999999999,
    category: 'Xương gặm cao cấp',
    brand: 'Lapati Official',
  };

  const updateRes = await api(`/products/${targetProd.id}`, {
    method: 'PATCH',
    body: JSON.stringify(attackPayload),
  });

  assert(updateRes.status === 200, 'API PATCH cập nhật thành công');
  assert(updateRes.data.product.category === 'Xương gặm cao cấp', 'Trường category được cập nhật');
  assert(updateRes.data.product.brand === 'Lapati Official', 'Trường brand được cập nhật');
  assert(updateRes.data.product.sku === origSku, `Mã SKU Odoo được bảo vệ tuyệt đối (giữ nguyên "${origSku}")`);
  assert(updateRes.data.product.name === origName, `Tên sản phẩm Odoo được bảo vệ (giữ nguyên "${origName}")`);
  assert(updateRes.data.product.listPrice === origPrice, `Giá niêm yết Odoo được bảo vệ (giữ nguyên ${origPrice})`);

  // ── 5. Test Bulk Update API ────────────────────────────────────────────────
  console.log('\n5. Kiểm tra Gán phân loại Hàng loạt (Bulk Update):');
  const bulkTargets = listRes.data.products.slice(1, 4).map((p: any) => p.id);
  const bulkPayload = {
    productIds: bulkTargets,
    category: 'Bánh thưởng dinh dưỡng',
    brand: 'Dexinbone Pet',
  };

  const bulkRes = await api('/products/bulk-update', {
    method: 'PATCH',
    body: JSON.stringify(bulkPayload),
  });

  assert(bulkRes.status === 200, 'API Bulk Update trả về 200');
  assert(bulkRes.data.count === bulkTargets.length, `Cập nhật chính xác ${bulkTargets.length} sản phẩm`);

  // ── 6. Test Autocomplete Update ────────────────────────────────────────────
  console.log('\n6. Kiểm tra Danh mục gợi ý tự động sau khi cập nhật:');
  const newSuggRes = await api('/products/suggestions');
  assert(newSuggRes.data.categories.includes('Xương gặm cao cấp'), 'Danh mục mới "Xương gặm cao cấp" tự động xuất hiện');
  assert(newSuggRes.data.categories.includes('Bánh thưởng dinh dưỡng'), 'Danh mục mới "Bánh thưởng dinh dưỡng" tự động xuất hiện');
  assert(newSuggRes.data.brands.includes('Dexinbone Pet'), 'Thương hiệu mới "Dexinbone Pet" tự động xuất hiện');

  console.log(`\n========================================`);
  console.log(`KẾT QUẢ KIỂM THỬ: ${passed} PASS, ${failed} FAIL`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Lỗi khi chạy kiểm thử:', err);
  process.exit(1);
});
