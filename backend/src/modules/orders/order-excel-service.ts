/**
 * order-excel-service.ts
 * Service for filtering, counting, and generating professional Excel exports for orders.
 */
import ExcelJS from 'exceljs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export interface OrderExportFilters {
  search?: string;
  hasPhone?: 'all' | 'yes' | 'no';
  hasEmail?: 'all' | 'yes' | 'no';
  zones?: string[];
  includeEmptyZone?: boolean;
  salespersons?: string[];
  includeEmptySalesperson?: boolean;
  fromDate?: string;
  toDate?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  productIds?: number[];
  productSkus?: string[];
  states?: string[];
  deliveryStatuses?: string[];
  includeEmptyDelivery?: boolean;
}

export interface ExportColumnDefinition {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  numFmt?: string;
}

export const ALL_EXPORT_COLUMNS: ExportColumnDefinition[] = [
  { key: 'orderCode', label: 'Mã đơn hàng', width: 16, align: 'center' },
  { key: 'customerName', label: 'Tên khách hàng', width: 26, align: 'left' },
  { key: 'phone', label: 'Số điện thoại', width: 16, align: 'center' },
  { key: 'email', label: 'Email', width: 24, align: 'left' },
  { key: 'zone', label: 'Khu vực / Tỉnh thành', width: 20, align: 'left' },
  { key: 'address', label: 'Địa chỉ nhận hàng', width: 32, align: 'left' },
  { key: 'salesperson', label: 'Nhân viên phụ trách', width: 22, align: 'left' },
  { key: 'dateOrder', label: 'Ngày tạo đơn', width: 18, align: 'center' },
  { key: 'state', label: 'Trạng thái đơn', width: 18, align: 'center' },
  { key: 'deliveryStatus', label: 'Trạng thái giao hàng', width: 20, align: 'center' },
  { key: 'invoiceStatus', label: 'Trạng thái hóa đơn', width: 18, align: 'center' },
  { key: 'warehouseName', label: 'Kho hàng', width: 18, align: 'left' },
  { key: 'paymentTerm', label: 'Điều khoản thanh toán', width: 22, align: 'left' },
  { key: 'amountUntaxed', label: 'Tiền trước thuế', width: 18, align: 'right', numFmt: '#,##0 "₫"' },
  { key: 'amountTax', label: 'Tiền thuế', width: 16, align: 'right', numFmt: '#,##0 "₫"' },
  { key: 'discountAmount', label: 'Tiền chiết khấu', width: 16, align: 'right', numFmt: '#,##0 "₫"' },
  { key: 'amountTotal', label: 'Tổng tiền', width: 20, align: 'right', numFmt: '#,##0 "₫"' },
  { key: 'margin', label: 'Lợi nhuận', width: 18, align: 'right', numFmt: '#,##0 "₫"' },
  { key: 'productsSummary', label: 'Sản phẩm trong đơn', width: 42, align: 'left' },
  { key: 'activitySummary', label: 'Hoạt động (Odoo)', width: 24, align: 'left' },
  { key: 'note', label: 'Ghi chú đơn hàng', width: 30, align: 'left' },
];

export const DEFAULT_SELECTED_COLUMNS = [
  'orderCode',
  'customerName',
  'phone',
  'zone',
  'salesperson',
  'dateOrder',
  'state',
  'deliveryStatus',
  'amountTotal',
  'productsSummary',
];

export function stateLabelVi(state?: string | null): string {
  switch (state) {
    case 'draft': return 'Báo giá (Draft)';
    case 'sent': return 'Đã gửi báo giá';
    case 'sale': return 'Đã xác nhận';
    case 'done': return 'Hoàn thành';
    case 'cancel': return 'Đã hủy';
    default: return state || '—';
  }
}

export function deliveryStatusLabelVi(status?: string | null): string {
  switch (status) {
    case 'pending': return 'Chờ giao hàng';
    case 'started': return 'Đang giao';
    case 'full': return 'Đã giao đủ';
    default: return status ? status : 'Chưa giao / Chưa có';
  }
}

export function invoiceStatusLabelVi(status?: string | null): string {
  switch (status) {
    case 'to invoice': return 'Cần xuất HĐ';
    case 'invoiced': return 'Đã xuất HĐ';
    case 'no': return 'Không xuất HĐ';
    default: return status || '—';
  }
}

/**
 * Builds the Prisma where input from the 9 filter conditions
 */
export function buildExportWhereClause(orgId: string, filters: OrderExportFilters = {}): Prisma.OrderHistoryWhereInput {
  const andConditions: any[] = [];

  // Base exclusion of AI draft codes
  andConditions.push({
    NOT: [
      { orderCode: { startsWith: 'SO-AI-' } },
      { orderCode: { startsWith: 'AI-' } },
      { orderCode: { startsWith: 'ORD-' } },
    ],
  });

  // Global keyword search
  if (filters.search && filters.search.trim()) {
    const s = filters.search.trim();
    andConditions.push({
      OR: [
        { orderCode: { contains: s, mode: 'insensitive' } },
        { partnerName: { contains: s, mode: 'insensitive' } },
        { note: { contains: s, mode: 'insensitive' } },
        { salesperson: { contains: s, mode: 'insensitive' } },
        { customerProfile: { name: { contains: s, mode: 'insensitive' } } },
        { customerProfile: { phone: { contains: s, mode: 'insensitive' } } },
      ],
    });
  }

  // 1. Condition: Có số điện thoại không (hasPhone)
  if (filters.hasPhone === 'yes') {
    andConditions.push({
      customerProfile: {
        OR: [
          {
            AND: [
              { phone: { not: null } },
              { phone: { not: '' } },
            ],
          },
          {
            AND: [
              { mobile: { not: null } },
              { mobile: { not: '' } },
            ],
          },
        ],
      },
    });
  } else if (filters.hasPhone === 'no') {
    andConditions.push({
      OR: [
        { customerProfile: null },
        {
          customerProfile: {
            AND: [
              { OR: [{ phone: null }, { phone: '' }] },
              { OR: [{ mobile: null }, { mobile: '' }] },
            ],
          },
        },
      ],
    });
  }

  // 2. Condition: Có email không (hasEmail)
  if (filters.hasEmail === 'yes') {
    andConditions.push({
      customerProfile: {
        AND: [
          { email: { not: null } },
          { email: { not: '' } },
        ],
      },
    });
  } else if (filters.hasEmail === 'no') {
    andConditions.push({
      OR: [
        { customerProfile: null },
        { customerProfile: { OR: [{ email: null }, { email: '' }] } },
      ],
    });
  }

  // 3. Condition: Khu vực ở đâu (khu vực A, khu vực B, không có, hoặc ở cả khu vực A và B)
  const hasZones = Array.isArray(filters.zones) && filters.zones.length > 0;
  const includeEmptyZone = !!filters.includeEmptyZone;

  if (hasZones && includeEmptyZone) {
    // Both selected zones OR no zone
    andConditions.push({
      OR: [
        { customerProfile: null },
        { customerProfile: { AND: [{ OR: [{ zone: null }, { zone: '' }] }, { OR: [{ city: null }, { city: '' }] }] } },
        {
          customerProfile: {
            OR: [
              { zone: { in: filters.zones, mode: 'insensitive' } },
              { city: { in: filters.zones, mode: 'insensitive' } },
            ],
          },
        },
      ],
    });
  } else if (hasZones) {
    // Only selected zones
    andConditions.push({
      customerProfile: {
        OR: [
          { zone: { in: filters.zones, mode: 'insensitive' } },
          { city: { in: filters.zones, mode: 'insensitive' } },
        ],
      },
    });
  } else if (includeEmptyZone) {
    // Only empty zones
    andConditions.push({
      OR: [
        { customerProfile: null },
        { customerProfile: { AND: [{ OR: [{ zone: null }, { zone: '' }] }, { OR: [{ city: null }, { city: '' }] }] } },
      ],
    });
  }

  // 4. Condition: Nhân viên phụ trách là ai hoặc những ai hay không có
  const hasSalespersons = Array.isArray(filters.salespersons) && filters.salespersons.length > 0;
  const includeEmptySp = !!filters.includeEmptySalesperson;

  if (hasSalespersons && includeEmptySp) {
    andConditions.push({
      OR: [
        { salesperson: { in: filters.salespersons, mode: 'insensitive' } },
        { customerProfile: { salesperson: { in: filters.salespersons, mode: 'insensitive' } } },
        { salesperson: null },
        { salesperson: '' },
        { salesperson: '—' },
        { customerProfile: null },
        { customerProfile: { OR: [{ salesperson: null }, { salesperson: '' }, { salesperson: '—' }] } },
      ],
    });
  } else if (hasSalespersons) {
    andConditions.push({
      OR: [
        { salesperson: { in: filters.salespersons, mode: 'insensitive' } },
        { customerProfile: { salesperson: { in: filters.salespersons, mode: 'insensitive' } } },
      ],
    });
  } else if (includeEmptySp) {
    andConditions.push({
      OR: [
        { salesperson: null },
        { salesperson: '' },
        { salesperson: '—' },
        { customerProfile: null },
        { customerProfile: { OR: [{ salesperson: null }, { salesperson: '' }, { salesperson: '—' }] } },
      ],
    });
  }

  // 5. Condition: Ngày tạo từ khoảng nào (fromDate - toDate)
  if (filters.fromDate || filters.toDate) {
    const dateCond: any = {};
    if (filters.fromDate) {
      dateCond.gte = new Date(filters.fromDate);
    }
    if (filters.toDate) {
      dateCond.lte = new Date(filters.toDate.includes('T') ? filters.toDate : `${filters.toDate}T23:59:59.999Z`);
    }
    andConditions.push({ dateOrder: dateCond });
  }

  // 6. Condition: Số tiền từ bao nhiêu tới bao nhiêu
  const minAmt = filters.minAmount !== undefined && filters.minAmount !== null && (filters.minAmount as any) !== '' ? Number(filters.minAmount) : null;
  const maxAmt = filters.maxAmount !== undefined && filters.maxAmount !== null && (filters.maxAmount as any) !== '' ? Number(filters.maxAmount) : null;
  if (minAmt !== null || maxAmt !== null) {
    const amountCond: any = {};
    if (minAmt !== null && !isNaN(minAmt)) amountCond.gte = minAmt;
    if (maxAmt !== null && !isNaN(maxAmt)) amountCond.lte = maxAmt;
    andConditions.push({ amountTotal: amountCond });
  }

  // 7. Condition: Order đó có những sản phẩm nào
  const hasProdIds = Array.isArray(filters.productIds) && filters.productIds.length > 0;
  const hasProdSkus = Array.isArray(filters.productSkus) && filters.productSkus.length > 0;
  if (hasProdIds || hasProdSkus) {
    const prodOrs: any[] = [];
    if (hasProdIds) prodOrs.push({ odooProductId: { in: filters.productIds } });
    if (hasProdSkus) prodOrs.push({ productSku: { in: filters.productSkus, mode: 'insensitive' } });
    andConditions.push({
      lines: {
        some: {
          OR: prodOrs,
        },
      },
    });
  }

  // 8. Condition: Trạng thái đơn (draft, sale, done, cancel)
  if (Array.isArray(filters.states) && filters.states.length > 0) {
    andConditions.push({ state: { in: filters.states } });
  }

  // 9. Condition: Trạng thái giao hàng (pending, started, full, or unassigned)
  const hasDelivery = Array.isArray(filters.deliveryStatuses) && filters.deliveryStatuses.length > 0;
  const includeEmptyDel = !!filters.includeEmptyDelivery;

  if (hasDelivery && includeEmptyDel) {
    andConditions.push({
      OR: [
        { deliveryStatus: { in: filters.deliveryStatuses } },
        { deliveryStatus: null },
        { deliveryStatus: '' },
      ],
    });
  } else if (hasDelivery) {
    andConditions.push({ deliveryStatus: { in: filters.deliveryStatuses } });
  } else if (includeEmptyDel) {
    andConditions.push({
      OR: [
        { deliveryStatus: null },
        { deliveryStatus: '' },
      ],
    });
  }

  return {
    orgId,
    AND: andConditions,
  };
}

/**
 * Returns match count and sum of totalAmount for the given filters
 */
export async function getExportCount(orgId: string, filters: OrderExportFilters = {}): Promise<{ count: number; totalAmount: number }> {
  const where = buildExportWhereClause(orgId, filters);

  const [count, aggregate] = await Promise.all([
    prisma.orderHistory.count({ where }),
    prisma.orderHistory.aggregate({
      where,
      _sum: {
        amountTotal: true,
      },
    }),
  ]);

  return {
    count,
    totalAmount: aggregate._sum.amountTotal || 0,
  };
}

/**
 * Generates an Excel workbook buffer containing filtered orders and optional line items breakdown
 */
export async function generateOrdersExcel(
  orgId: string,
  filters: OrderExportFilters = {},
  selectedColumnKeys: string[] = DEFAULT_SELECTED_COLUMNS,
  includeLinesSheet: boolean = true,
  exportedBy: string = 'Hệ thống'
): Promise<Buffer> {
  const where = buildExportWhereClause(orgId, filters);

  // Fetch all matching orders with customer profile and lines
  const orders = await prisma.orderHistory.findMany({
    where,
    include: {
      customerProfile: {
        select: {
          id: true,
          name: true,
          phone: true,
          mobile: true,
          email: true,
          city: true,
          zone: true,
          street: true,
          fullAddress: true,
          salesperson: true,
          salespersonId: true,
        },
      },
      lines: {
        orderBy: { odooLineId: 'asc' },
      },
    },
    orderBy: { dateOrder: 'desc' },
  });

  // Pre-fetch contacts for orders missing customerProfile salesperson or phone
  const missingPartnerIds = orders
    .filter((o) => (!o.customerProfile?.salesperson || !o.customerProfile?.phone) && o.odooPartnerId)
    .map((o) => String(o.odooPartnerId));

  const contactMap = new Map<string, { salesperson?: string | null; phone?: string | null; address?: string | null; zone?: string | null }>();
  if (missingPartnerIds.length > 0) {
    const contacts = await prisma.contact.findMany({
      where: { orgId, customerId: { in: missingPartnerIds } },
      select: {
        customerId: true,
        phone: true,
        address: true,
        zone: true,
        salesperson: true,
        assignedUser: { select: { fullName: true } },
      },
    });
    for (const c of contacts) {
      if (c.customerId) {
        contactMap.set(c.customerId, {
          salesperson: c.salesperson?.trim() || c.assignedUser?.fullName?.trim(),
          phone: c.phone?.trim(),
          address: c.address?.trim(),
          zone: c.zone?.trim(),
        });
      }
    }
  }

  // Filter columns based on user selection
  const validColumnKeys = new Set(selectedColumnKeys.length > 0 ? selectedColumnKeys : DEFAULT_SELECTED_COLUMNS);
  const activeColumns = ALL_EXPORT_COLUMNS.filter((c) => validColumnKeys.has(c.key));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OCMS Order Management';
  workbook.lastModifiedBy = exportedBy;
  workbook.created = new Date();
  workbook.modified = new Date();

  // ═══════════════════════════════════════════════════════════════════════════
  // SHEET 1: DANH SÁCH ĐƠN HÀNG
  // ═══════════════════════════════════════════════════════════════════════════
  const sheet = workbook.addWorksheet('Danh sách Đơn hàng', {
    views: [{ showGridLines: true }],
  });

  // Title Banner
  const titleRow = sheet.addRow(['BÁO CÁO DANH SÁCH ĐƠN HÀNG']);
  titleRow.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
  titleRow.height = 32;

  const nowFormatted = new Date().toLocaleString('vi-VN');
  const subtitleRow = sheet.addRow([`Thời gian xuất: ${nowFormatted} | Người xuất: ${exportedBy} | Tổng số đơn: ${orders.length}`]);
  subtitleRow.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
  subtitleRow.height = 20;

  // Blank row
  sheet.addRow([]);

  // Header Row (Row 4)
  const headerTitles = ['STT', ...activeColumns.map((c) => c.label)];
  const headerRow = sheet.addRow(headerTitles);
  headerRow.height = 28;

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0284C7' }, // Modern Cyan/Blue
    };
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0369A1' } },
      bottom: { style: 'medium', color: { argb: 'FF0369A1' } },
      left: { style: 'thin', color: { argb: 'FF38BDF8' } },
      right: { style: 'thin', color: { argb: 'FF38BDF8' } },
    };
  });

  // Populate data rows
  let totalUntaxed = 0;
  let totalTax = 0;
  let totalDiscount = 0;
  let totalAmount = 0;
  let totalMargin = 0;

  orders.forEach((o, index) => {
    const contactInfo = o.odooPartnerId ? contactMap.get(String(o.odooPartnerId)) : null;
    const customerPhone = o.customerProfile?.phone || o.customerProfile?.mobile || contactInfo?.phone || '';
    const customerZone = o.customerProfile?.zone || o.customerProfile?.city || contactInfo?.zone || '';
    const customerAddress = o.customerProfile?.fullAddress || o.customerProfile?.street || contactInfo?.address || '';
    const salesperson = o.customerProfile?.salesperson?.trim() || contactInfo?.salesperson || o.salesperson || '—';

    // Summary of products
    const productsSummary = (o.lines || [])
      .map((l) => `${l.quantity}x ${l.productName}`)
      .join('; ');

    const dateOrderStr = o.dateOrder ? new Date(o.dateOrder).toLocaleString('vi-VN') : '';

    totalUntaxed += o.amountUntaxed || 0;
    totalTax += o.amountTax || 0;
    totalDiscount += o.discountAmount || 0;
    totalAmount += o.amountTotal || 0;
    totalMargin += o.margin || 0;

    const rowValues: any[] = [index + 1];

    activeColumns.forEach((col) => {
      switch (col.key) {
        case 'orderCode':
          rowValues.push(o.orderCode);
          break;
        case 'customerName':
          rowValues.push(o.partnerName || o.customerProfile?.name || '—');
          break;
        case 'phone':
          rowValues.push(customerPhone);
          break;
        case 'email':
          rowValues.push(o.customerProfile?.email || '');
          break;
        case 'zone':
          rowValues.push(customerZone);
          break;
        case 'address':
          rowValues.push(customerAddress);
          break;
        case 'salesperson':
          rowValues.push(salesperson);
          break;
        case 'dateOrder':
          rowValues.push(dateOrderStr);
          break;
        case 'state':
          rowValues.push(stateLabelVi(o.state));
          break;
        case 'deliveryStatus':
          rowValues.push(deliveryStatusLabelVi(o.deliveryStatus));
          break;
        case 'invoiceStatus':
          rowValues.push(invoiceStatusLabelVi(o.invoiceStatus));
          break;
        case 'warehouseName':
          rowValues.push(o.warehouseName || '—');
          break;
        case 'paymentTerm':
          rowValues.push((o as any).paymentTerm || '—');
          break;
        case 'amountUntaxed':
          rowValues.push(o.amountUntaxed || 0);
          break;
        case 'amountTax':
          rowValues.push(o.amountTax || 0);
          break;
        case 'discountAmount':
          rowValues.push(o.discountAmount || 0);
          break;
        case 'amountTotal':
          rowValues.push(o.amountTotal || 0);
          break;
        case 'margin':
          rowValues.push(o.margin || 0);
          break;
        case 'productsSummary':
          rowValues.push(productsSummary);
          break;
        case 'activitySummary':
          rowValues.push(o.activitySummary || '');
          break;
        case 'note':
          rowValues.push(o.note || '');
          break;
        default:
          rowValues.push('');
      }
    });

    const dataRow = sheet.addRow(rowValues);
    dataRow.height = 22;

    // Alternating zebra row fill
    const isEven = index % 2 === 0;
    const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    dataRow.eachCell((cell, colIndex) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowBg },
      };
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if (colIndex === 1) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        const colDef = activeColumns[colIndex - 2];
        if (colDef) {
          cell.alignment = {
            vertical: 'middle',
            horizontal: colDef.align || 'left',
            wrapText: colDef.key === 'productsSummary' || colDef.key === 'address' || colDef.key === 'note',
          };
          if (colDef.numFmt) {
            cell.numFmt = colDef.numFmt;
          }
        }
      }
    });
  });

  // Summary Row (Dòng Tổng Cộng)
  const summaryRowValues: any[] = ['TỔNG CỘNG', ...activeColumns.map((col) => {
    switch (col.key) {
      case 'amountUntaxed': return totalUntaxed;
      case 'amountTax': return totalTax;
      case 'discountAmount': return totalDiscount;
      case 'amountTotal': return totalAmount;
      case 'margin': return totalMargin;
      case 'orderCode': return `${orders.length} đơn hàng`;
      default: return '';
    }
  })];

  const summaryRow = sheet.addRow(summaryRowValues);
  summaryRow.height = 26;
  summaryRow.eachCell((cell, colIndex) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF64748B' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
    if (colIndex > 1) {
      const colDef = activeColumns[colIndex - 2];
      if (colDef) {
        cell.alignment = { vertical: 'middle', horizontal: colDef.align || 'left' };
        if (colDef.numFmt) cell.numFmt = colDef.numFmt;
      }
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
  });

  // Auto-adjust column widths
  sheet.columns = [
    { width: 6 }, // STT
    ...activeColumns.map((c) => ({ width: Math.max(c.width, 12) })),
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // SHEET 2: CHI TIẾT DÒNG HÀNG (OPTIONAL)
  // ═══════════════════════════════════════════════════════════════════════════
  if (includeLinesSheet) {
    const linesSheet = workbook.addWorksheet('Chi tiết Dòng hàng', {
      views: [{ showGridLines: true }],
    });

    const lTitleRow = linesSheet.addRow(['BÁO CÁO CHI TIẾT SẢN PHẨM THEO ĐƠN HÀNG']);
    lTitleRow.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
    lTitleRow.height = 32;

    const lSubRow = linesSheet.addRow([`Thời gian xuất: ${nowFormatted} | Tổng đơn: ${orders.length}`]);
    lSubRow.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
    lSubRow.height = 20;

    linesSheet.addRow([]);

    const lineHeaders = [
      'STT',
      'Mã đơn hàng',
      'Ngày tạo đơn',
      'Tên khách hàng',
      'Nhân viên phụ trách',
      'Trạng thái đơn',
      'Mã SKU',
      'Tên sản phẩm',
      'ĐVT',
      'Số lượng',
      'Đơn giá',
      'Chiết khấu (%)',
      'Thành tiền',
      'SL đã giao',
      'SL đã xuất HĐ',
    ];

    const lHeaderRow = linesSheet.addRow(lineHeaders);
    lHeaderRow.height = 28;

    lHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0D9488' }, // Teal
      };
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF0F766E' } },
        bottom: { style: 'medium', color: { argb: 'FF0F766E' } },
        left: { style: 'thin', color: { argb: 'FF2DD4BF' } },
        right: { style: 'thin', color: { argb: 'FF2DD4BF' } },
      };
    });

    let lineIndex = 0;
    let totalQty = 0;
    let totalLineSubtotal = 0;

    orders.forEach((o) => {
      const contactInfo = o.odooPartnerId ? contactMap.get(String(o.odooPartnerId)) : null;
      const salesperson = o.customerProfile?.salesperson?.trim() || contactInfo?.salesperson || o.salesperson || '—';
      const customerName = o.partnerName || o.customerProfile?.name || '—';
      const dateOrderStr = o.dateOrder ? new Date(o.dateOrder).toLocaleDateString('vi-VN') : '';

      const lines = o.lines && o.lines.length > 0 ? o.lines : [null];
      const startRowNumber = linesSheet.rowCount + 1;

      lines.forEach((line) => {
        lineIndex++;
        if (line) {
          totalQty += line.quantity || 0;
          totalLineSubtotal += line.priceSubtotal || 0;
        }

        const rowValues = [
          lineIndex,
          o.orderCode,
          dateOrderStr,
          customerName,
          salesperson,
          stateLabelVi(o.state),
          line ? (line.productSku || '—') : '—',
          line ? line.productName : '(Không có sản phẩm)',
          line ? (line.uomName || 'Cái') : '—',
          line ? (line.quantity || 0) : 0,
          line ? (line.priceUnit || 0) : 0,
          line ? (line.discount || 0) : 0,
          line ? (line.priceSubtotal || 0) : 0,
          line ? (line.qtyDelivered || 0) : 0,
          line ? (line.qtyInvoiced || 0) : 0,
        ];

        const row = linesSheet.addRow(rowValues);
        row.height = 22;

        const isEven = lineIndex % 2 === 0;
        const rowBg = isEven ? 'FFFFFFFF' : 'FFF0FDFA';

        row.eachCell((cell, colNum) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: rowBg },
          };
          cell.font = { name: 'Calibri', size: 10 };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };

          // Alignment and formats
          if (colNum === 1 || colNum === 2 || colNum === 3 || colNum === 6 || colNum === 7 || colNum === 9) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else if (colNum === 10 || colNum === 14 || colNum === 15) {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
            cell.numFmt = '#,##0';
          } else if (colNum === 11 || colNum === 13) {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
            cell.numFmt = '#,##0 "₫"';
          } else if (colNum === 12) {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
            cell.numFmt = '0.0"%"';
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          }
        });
      });

      const endRowNumber = linesSheet.rowCount;

      // Merge order columns (B: Mã đơn, C: Ngày tạo, D: Khách hàng, E: Nhân viên, F: Trạng thái) if order has multiple lines
      if (endRowNumber > startRowNumber) {
        // First format cells in the merged range to maintain borders and clean fill
        for (let r = startRowNumber; r <= endRowNumber; r++) {
          for (let c = 2; c <= 6; c++) {
            const cell = linesSheet.getCell(r, c);
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFFFFF' },
            };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            };
          }
        }

        // Merge each column vertically from startRowNumber to endRowNumber
        for (let col = 2; col <= 6; col++) {
          linesSheet.mergeCells(startRowNumber, col, endRowNumber, col);
        }

        // Set vertical middle alignment on merged cells
        linesSheet.getCell(startRowNumber, 2).alignment = { vertical: 'middle', horizontal: 'center' };
        linesSheet.getCell(startRowNumber, 3).alignment = { vertical: 'middle', horizontal: 'center' };
        linesSheet.getCell(startRowNumber, 4).alignment = { vertical: 'middle', horizontal: 'left' };
        linesSheet.getCell(startRowNumber, 5).alignment = { vertical: 'middle', horizontal: 'left' };
        linesSheet.getCell(startRowNumber, 6).alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });

    // Summary row for lines
    const lineSummaryValues = [
      'TỔNG',
      '',
      '',
      '',
      '',
      '',
      '',
      `${lineIndex} món hàng`,
      '',
      totalQty,
      '',
      '',
      totalLineSubtotal,
      '',
      '',
    ];

    const lSummaryRow = linesSheet.addRow(lineSummaryValues);
    lSummaryRow.height = 26;
    lSummaryRow.eachCell((cell, colNum) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'double', color: { argb: 'FF64748B' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
      if (colNum === 10) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0';
      } else if (colNum === 13) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0 "₫"';
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });

    linesSheet.columns = [
      { width: 6 },  // STT
      { width: 16 }, // Mã đơn
      { width: 14 }, // Ngày tạo
      { width: 24 }, // Khách hàng
      { width: 20 }, // Nhân viên
      { width: 16 }, // Trạng thái
      { width: 16 }, // SKU
      { width: 34 }, // Tên SP
      { width: 10 }, // ĐVT
      { width: 12 }, // SL
      { width: 16 }, // Đơn giá
      { width: 14 }, // Chiết khấu
      { width: 18 }, // Thành tiền
      { width: 12 }, // SL đã giao
      { width: 12 }, // SL đã xuất HĐ
    ];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
