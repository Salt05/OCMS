import path from 'path';
import ExcelJS from 'exceljs';
import { odooService } from '../modules/odoo/odoo-service.js';
import { prisma } from '../shared/database/prisma-client.js';
import { logger } from '../shared/utils/logger.js';

interface OdooRawProduct {
  id: number;
  default_code?: string | boolean;
  barcode?: string | boolean;
  name: string;
  display_name?: string;
  categ_id?: [number, string] | boolean;
  type?: string;
  uom_id?: [number, string] | boolean;
  uom_po_id?: [number, string] | boolean;
  list_price?: number;
  standard_price?: number;
  qty_available?: number;
  virtual_available?: number;
  weight?: number;
  volume?: number;
  sale_ok?: boolean;
  purchase_ok?: boolean;
  active?: boolean;
  write_date?: string;
}

function formatType(type?: string): string {
  switch (type) {
    case 'consu':
      return 'Hàng tiêu hao (Consumable)';
    case 'product':
      return 'Sản phẩm lưu kho (Storable)';
    case 'service':
      return 'Dịch vụ (Service)';
    default:
      return type || '';
  }
}

async function exportProductsToExcel() {
  console.log('🚀 Đang kết nối Odoo và lấy danh sách sản phẩm...');
  const uid = await odooService.authenticate();
  if (!uid) {
    throw new Error('Không thể đăng nhập vào Odoo ERP');
  }

  // 1. Fetch all products directly from Odoo
  const fields = [
    'id',
    'default_code',
    'barcode',
    'name',
    'display_name',
    'categ_id',
    'type',
    'uom_id',
    'uom_po_id',
    'list_price',
    'standard_price',
    'qty_available',
    'virtual_available',
    'weight',
    'volume',
    'sale_ok',
    'purchase_ok',
    'active',
    'write_date'
  ];

  const odooProducts = await odooService.executeKw<OdooRawProduct[]>('product.product', 'search_read', [[]], {
    fields,
    context: { lang: 'vi_VN', active_test: false },
    order: 'default_code asc, name asc'
  }) || [];

  console.log(`✅ Đã lấy thành công ${odooProducts.length} sản phẩm từ Odoo`);

  // 2. Fetch extra metadata from ProductCache in database (if available)
  const cachedProducts = await prisma.productCache.findMany({
    select: {
      odooId: true,
      sku: true,
      brand: true,
      wholesalePrice: true,
      retailPrice: true,
      specification: true,
      category: true,
    }
  }).catch(() => []);

  const cacheByOdooId = new Map<number, any>();
  const cacheBySku = new Map<string, any>();
  for (const cp of cachedProducts) {
    if (cp.odooId) cacheByOdooId.set(cp.odooId, cp);
    if (cp.sku) cacheBySku.set(cp.sku.trim().toLowerCase(), cp);
  }

  // 3. Create Excel Workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OCMS System';
  workbook.created = new Date();

  // ----------------------------------------------------
  // SHEET 1: Danh sách chi tiết toàn bộ sản phẩm
  // ----------------------------------------------------
  const sheet = workbook.addWorksheet('Danh sách sản phẩm Odoo', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }]
  });

  // Title Row 1
  sheet.mergeCells('A1:W1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'DANH SÁCH TOÀN BỘ SẢN PHẨM TRÊN HỆ THỐNG ODOO ERP';
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' } // Deep Navy Blue
  };
  sheet.getRow(1).height = 35;

  // Subtitle Row 2
  sheet.mergeCells('A2:W2');
  const subtitleCell = sheet.getCell('A2');
  const exportTimeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  subtitleCell.value = `Thời gian xuất: ${exportTimeStr} | Tổng số sản phẩm: ${odooProducts.length} | Nguồn dữ liệu: Odoo JSON-RPC API`;
  subtitleCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF475569' } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  subtitleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' }
  };
  sheet.getRow(2).height = 22;

  // Empty spacer row 3
  sheet.getRow(3).height = 6;

  // Header definition
  const headers = [
    { key: 'stt', header: 'STT', width: 8, align: 'center' },
    { key: 'odooId', header: 'ID Odoo', width: 10, align: 'center' },
    { key: 'sku', header: 'Mã SKU / Mã nội bộ', width: 18, align: 'left' },
    { key: 'barcode', header: 'Mã vạch (Barcode)', width: 18, align: 'center' },
    { key: 'name', header: 'Tên sản phẩm', width: 35, align: 'left' },
    { key: 'displayName', header: 'Tên hiển thị đầy đủ Odoo', width: 40, align: 'left' },
    { key: 'brand', header: 'Thương hiệu', width: 16, align: 'left' },
    { key: 'category', header: 'Danh mục / Nhóm sản phẩm', width: 25, align: 'left' },
    { key: 'uom', header: 'ĐVT', width: 12, align: 'center' },
    { key: 'uomPo', header: 'ĐVT Mua', width: 12, align: 'center' },
    { key: 'productType', header: 'Loại sản phẩm', width: 24, align: 'left' },
    { key: 'listPrice', header: 'Giá bán niêm yết (VNĐ)', width: 22, align: 'right' },
    { key: 'wholesalePrice', header: 'Giá sỉ / Bán buôn (VNĐ)', width: 22, align: 'right' },
    { key: 'retailPrice', header: 'Giá bán lẻ (VNĐ)', width: 20, align: 'right' },
    { key: 'costPrice', header: 'Giá vốn (VNĐ)', width: 18, align: 'right' },
    { key: 'qtyAvailable', header: 'Tồn kho thực tế', width: 16, align: 'right' },
    { key: 'virtualAvailable', header: 'Dự báo tồn kho', width: 16, align: 'right' },
    { key: 'weight', header: 'Trọng lượng (g)', width: 15, align: 'right' },
    { key: 'specification', header: 'Quy cách', width: 18, align: 'left' },
    { key: 'saleOk', header: 'Có thể bán', width: 14, align: 'center' },
    { key: 'purchaseOk', header: 'Có thể mua', width: 14, align: 'center' },
    { key: 'active', header: 'Trạng thái', width: 16, align: 'center' },
    { key: 'writeDate', header: 'Ngày cập nhật Odoo', width: 20, align: 'center' }
  ];

  // Header Row 4
  const headerRow = sheet.getRow(4);
  headerRow.height = 28;
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h.header;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF334155' } // Slate-700
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } }
    };
  });

  // Category stats accumulator
  const categoryStats = new Map<string, { count: number; saleOkCount: number; totalQty: number; totalForecast: number; totalPrice: number }>();

  // Populate Data Rows
  odooProducts.forEach((p, idx) => {
    const rowNumber = idx + 5;
    const row = sheet.getRow(rowNumber);
    row.height = 22;

    const sku = (typeof p.default_code === 'string' ? p.default_code : '').trim();
    const barcode = (typeof p.barcode === 'string' ? p.barcode : '').trim();
    const categoryName = Array.isArray(p.categ_id) && p.categ_id.length > 1 ? String(p.categ_id[1]) : 'Chưa phân loại';
    const uomName = Array.isArray(p.uom_id) && p.uom_id.length > 1 ? String(p.uom_id[1]) : '';
    const uomPoName = Array.isArray(p.uom_po_id) && p.uom_po_id.length > 1 ? String(p.uom_po_id[1]) : '';

    // Lookup cache
    const cache = cacheByOdooId.get(p.id) || (sku ? cacheBySku.get(sku.toLowerCase()) : null);
    const brand = cache?.brand && cache.brand !== 'All' ? cache.brand : '';
    const wholesale = cache?.wholesalePrice || 0;
    const retail = cache?.retailPrice || 0;
    const spec = cache?.specification || '';

    // Category stats
    const currentStat = categoryStats.get(categoryName) || { count: 0, saleOkCount: 0, totalQty: 0, totalForecast: 0, totalPrice: 0 };
    currentStat.count++;
    if (p.sale_ok) currentStat.saleOkCount++;
    currentStat.totalQty += (p.qty_available || 0);
    currentStat.totalForecast += (p.virtual_available || 0);
    currentStat.totalPrice += (p.list_price || 0);
    categoryStats.set(categoryName, currentStat);

    const isEven = idx % 2 === 1;
    const bgArgb = isEven ? 'FFF8FAFC' : 'FFFFFFFF'; // Light alternating stripe

    const values = [
      idx + 1,
      p.id,
      sku || '-',
      barcode || '-',
      p.name || '',
      p.display_name || p.name || '',
      brand || '-',
      categoryName,
      uomName || '-',
      uomPoName || '-',
      formatType(p.type),
      p.list_price || 0,
      wholesale || (p.list_price || 0),
      retail || 0,
      p.standard_price || 0,
      p.qty_available || 0,
      p.virtual_available || 0,
      p.weight || 0,
      spec || '-',
      p.sale_ok ? 'Được bán' : 'Ngừng bán',
      p.purchase_ok ? 'Được mua' : 'Không mua',
      p.active ? 'Đang dùng' : 'Đã lưu trữ',
      p.write_date || '-'
    ];

    values.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { name: 'Arial', size: 9.5 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgArgb }
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      const hInfo = headers[cIdx];
      cell.alignment = {
        vertical: 'middle',
        horizontal: hInfo.align as any
      };

      // Format currency
      if (['listPrice', 'wholesalePrice', 'retailPrice', 'costPrice'].includes(hInfo.key)) {
        cell.numFmt = '#,##0';
      }
      // Format quantities
      if (['qtyAvailable', 'virtualAvailable', 'weight'].includes(hInfo.key)) {
        cell.numFmt = '#,##0.##';
      }

      // Highlight status badges
      if (hInfo.key === 'saleOk') {
        if (!p.sale_ok) {
          cell.font = { name: 'Arial', size: 9.5, color: { argb: 'FFDC2626' }, bold: true };
        } else {
          cell.font = { name: 'Arial', size: 9.5, color: { argb: 'FF16A34A' } };
        }
      }
      if (hInfo.key === 'active') {
        if (!p.active) {
          cell.font = { name: 'Arial', size: 9.5, color: { argb: 'FFDC2626' }, bold: true };
        } else {
          cell.font = { name: 'Arial', size: 9.5, color: { argb: 'FF2563EB' } };
        }
      }
    });
  });

  // Enable Auto Filter
  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: odooProducts.length + 4, column: headers.length }
  };

  // Set column widths
  headers.forEach((h, idx) => {
    sheet.getColumn(idx + 1).width = h.width;
  });

  // ----------------------------------------------------
  // SHEET 2: Thống kê tổng hợp theo Danh mục (Categories)
  // ----------------------------------------------------
  const summarySheet = workbook.addWorksheet('Thống kê theo danh mục', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }]
  });

  summarySheet.mergeCells('A1:G1');
  const sumTitle = summarySheet.getCell('A1');
  sumTitle.value = 'TỔNG HỢP VÀ THỐNG KÊ SẢN PHẨM THEO DANH MỤC TRÊN ODOO';
  sumTitle.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  sumTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  sumTitle.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF059669' } // Emerald green
  };
  summarySheet.getRow(1).height = 32;

  summarySheet.mergeCells('A2:G2');
  const sumSubtitle = summarySheet.getCell('A2');
  sumSubtitle.value = `Thống kê tự động từ toàn bộ ${odooProducts.length} sản phẩm Odoo`;
  sumSubtitle.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF475569' } };
  sumSubtitle.alignment = { vertical: 'middle', horizontal: 'center' };
  sumSubtitle.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' }
  };
  summarySheet.getRow(2).height = 20;

  const sumHeaders = [
    { header: 'STT', width: 8, align: 'center' },
    { header: 'Danh mục sản phẩm', width: 32, align: 'left' },
    { header: 'Số lượng sản phẩm', width: 20, align: 'right' },
    { header: 'SP được phép bán', width: 20, align: 'right' },
    { header: 'Tổng tồn kho thực tế', width: 22, align: 'right' },
    { header: 'Tổng dự báo tồn', width: 20, align: 'right' },
    { header: 'Giá bán TB (VNĐ)', width: 22, align: 'right' }
  ];

  const sumHeaderRow = summarySheet.getRow(4);
  sumHeaderRow.height = 26;
  sumHeaders.forEach((sh, sIdx) => {
    const cell = sumHeaderRow.getCell(sIdx + 1);
    cell.value = sh.header;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' }
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      bottom: { style: 'medium', color: { argb: 'FF111827' } },
      right: { style: 'thin', color: { argb: 'FF9CA3AF' } }
    };
    summarySheet.getColumn(sIdx + 1).width = sh.width;
  });

  let sumRowIndex = 5;
  let totalAllProducts = 0;
  let totalAllSaleOk = 0;
  let totalAllQty = 0;
  let totalAllForecast = 0;

  const sortedCategories = Array.from(categoryStats.entries()).sort((a, b) => b[1].count - a[1].count);

  sortedCategories.forEach(([catName, stat], sIdx) => {
    const sRow = summarySheet.getRow(sumRowIndex);
    sRow.height = 22;
    const avgPrice = stat.count > 0 ? Math.round(stat.totalPrice / stat.count) : 0;

    totalAllProducts += stat.count;
    totalAllSaleOk += stat.saleOkCount;
    totalAllQty += stat.totalQty;
    totalAllForecast += stat.totalForecast;

    const isEven = sIdx % 2 === 1;
    const bgArgb = isEven ? 'FFF9FAFB' : 'FFFFFFFF';

    const vals = [
      sIdx + 1,
      catName,
      stat.count,
      stat.saleOkCount,
      stat.totalQty,
      stat.totalForecast,
      avgPrice
    ];

    vals.forEach((v, cIdx) => {
      const cell = sRow.getCell(cIdx + 1);
      cell.value = v;
      cell.font = { name: 'Arial', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };
      cell.alignment = { vertical: 'middle', horizontal: sumHeaders[cIdx].align as any };
      if (cIdx >= 2 && cIdx <= 5) cell.numFmt = '#,##0.##';
      if (cIdx === 6) cell.numFmt = '#,##0';
    });

    sumRowIndex++;
  });

  // Total Summary Row
  const totalRow = summarySheet.getRow(sumRowIndex);
  totalRow.height = 25;
  const totalVals = [
    '',
    'TỔNG CỘNG',
    totalAllProducts,
    totalAllSaleOk,
    totalAllQty,
    totalAllForecast,
    ''
  ];
  totalVals.forEach((tv, cIdx) => {
    const cell = totalRow.getCell(cIdx + 1);
    cell.value = tv;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF111827' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF08A' } }; // Soft yellow
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF9CA3AF' } },
      left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      bottom: { style: 'double', color: { argb: 'FF111827' } },
      right: { style: 'thin', color: { argb: 'FF9CA3AF' } }
    };
    cell.alignment = { vertical: 'middle', horizontal: sumHeaders[cIdx].align as any };
    if (cIdx >= 2 && cIdx <= 5) cell.numFmt = '#,##0.##';
  });

  // File output path
  // Save to root directory of project for easy user access
  const projectRoot = path.resolve(process.cwd(), '..');
  const outputPath = path.join(projectRoot, 'Danh_Sach_San_Pham_Odoo.xlsx');

  await workbook.xlsx.writeFile(outputPath);
  console.log(`\n🎉 XUẤT THÀNH CÔNG FILE EXCEL!`);
  console.log(`📁 Đường dẫn: ${outputPath}`);
  console.log(`📊 Tổng số dòng sản phẩm: ${odooProducts.length}`);
}

exportProductsToExcel()
  .catch((e) => {
    console.error('❌ Lỗi xuất file Excel:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
