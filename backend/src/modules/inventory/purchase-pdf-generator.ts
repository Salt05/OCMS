import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to format currency VND standard (e.g. 163.800 đ)
function formatMoney(amount: number): string {
  const formatted = new Intl.NumberFormat('vi-VN').format(Math.round(amount || 0));
  return `${formatted} đ`;
}

// Helper to format unit price standard Odoo (e.g. 23.400,00)
function formatUnitPrice(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
}

// Helper to format date standard Odoo (DD/MM/YYYY)
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export async function generatePurchaseOrderPdf(po: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 30, bottom: 30, left: 35, right: 35 },
        info: {
          Title: `Phiếu Nhập Hàng - ${po.odooPurchaseId ? 'P' + String(po.odooPurchaseId).padStart(5, '0') : po.id}`,
          Author: 'CÔNG TY TNHH LA PET'
        }
      });

      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      // Font loading
      let regularFont = 'Helvetica';
      let boldFont = 'Helvetica-Bold';

      const possibleFontPaths = [
        path.join(__dirname, '../../../assets/fonts/arial.ttf'),
        path.join(process.cwd(), 'assets/fonts/arial.ttf'),
        path.join(process.cwd(), 'backend/assets/fonts/arial.ttf'),
        '/app/assets/fonts/arial.ttf',
        '/app/backend/assets/fonts/arial.ttf'
      ];
      const possibleBoldPaths = [
        path.join(__dirname, '../../../assets/fonts/arialbd.ttf'),
        path.join(process.cwd(), 'assets/fonts/arialbd.ttf'),
        path.join(process.cwd(), 'backend/assets/fonts/arialbd.ttf'),
        '/app/assets/fonts/arialbd.ttf',
        '/app/backend/assets/fonts/arialbd.ttf'
      ];

      for (let i = 0; i < possibleFontPaths.length; i++) {
        if (fs.existsSync(possibleFontPaths[i])) {
          try {
            doc.registerFont('ArialRegular', possibleFontPaths[i]);
            regularFont = 'ArialRegular';
            if (fs.existsSync(possibleBoldPaths[i])) {
              doc.registerFont('ArialBold', possibleBoldPaths[i]);
              boldFont = 'ArialBold';
            }
            break;
          } catch (e) {
            console.error('Failed to register custom font:', e);
          }
        }
      }

      const poCode = po.odooPurchaseId
        ? `P${String(po.odooPurchaseId).padStart(5, '0')}`
        : (po.code || `PO${po.id.slice(0, 6).toUpperCase()}`);

      const TEAL = '#00979e';
      const TEAL_BG = '#e8f6f6';
      const BORDER_COLOR = '#cfd8dc';
      const TEXT_MAIN = '#111827';
      const TEXT_MUTED = '#475569';

      // --- 1. DECORATIVE TOP-RIGHT WAVE ---
      doc.save();
      doc.path('M 320 0 C 370 70, 480 120, 595.28 100 L 595.28 0 Z')
         .fill(TEAL_BG);
      doc.restore();

      // --- 2. HEADER: LOGO LAPET (LEFT) & COMPANY INFO (RIGHT) ---
      // Logo box
      const logoBoxX = 35;
      const logoBoxY = 32;
      const logoBoxW = 98;
      const logoBoxH = 58;

      doc.roundedRect(logoBoxX, logoBoxY, logoBoxW, logoBoxH, 4).fill(TEAL);

      // White logo image inside teal box if exists
      const possibleLogoPaths = [
        path.join(__dirname, '../../../assets/logo-white.png'),
        path.join(process.cwd(), 'assets/logo-white.png'),
        path.join(process.cwd(), 'backend/assets/logo-white.png'),
        '/app/assets/logo-white.png',
        '/app/backend/assets/logo-white.png'
      ];
      let logoDrawn = false;
      for (const lPath of possibleLogoPaths) {
        if (fs.existsSync(lPath)) {
          try {
            doc.image(lPath, logoBoxX + 6, logoBoxY + 11, { width: logoBoxW - 12 });
            logoDrawn = true;
            break;
          } catch (e) {
            console.error('Failed to draw logo image:', e);
          }
        }
      }

      if (!logoDrawn) {
        doc.fillColor('#FFFFFF').font(boldFont).fontSize(19).text('LAPET', logoBoxX, logoBoxY + 18, { width: logoBoxW, align: 'center' });
      }

      // Slogan under logo
      doc.fillColor('#00827b').font(boldFont).fontSize(8.5).text('An tâm trong từng miếng thưởng', logoBoxX, logoBoxY + logoBoxH + 6);

      // Company info (Right side)
      const companyX = 340;
      const companyY = 35;
      doc.fillColor(TEXT_MAIN).font(boldFont).fontSize(8.5).text('CÔNG TY TNHH LA PET', companyX, companyY, { align: 'right', width: 220 });
      doc.font(regularFont).fontSize(8.5).fillColor('#333333');
      doc.text('143/36/13 LIÊN KHU 5-6', companyX, doc.y + 2, { align: 'right', width: 220 });
      doc.text('PHƯỜNG BÌNH TÂN, TPHCM', companyX, doc.y + 2, { align: 'right', width: 220 });
      doc.text('0977919827 - 0902375166', companyX, doc.y + 2, { align: 'right', width: 220 });

      // --- 3. TWO COLUMNS: SHIPPING ADDRESS (LEFT) & VENDOR (RIGHT) ---
      const addressY = 135;
      const colWidth = 250;

      // Left Column: Shipping Address
      doc.fillColor(TEXT_MAIN).font(boldFont).fontSize(9.5).text('Shipping address:', 35, addressY);
      doc.font(boldFont).fontSize(9).text((po.deliverTo || 'TRẢNG BÀNG').toUpperCase(), 35, doc.y + 2);
      doc.font(regularFont).fontSize(8.5).fillColor('#222222');
      doc.text('143/36/13 LIÊN KHU 5-6', 35, doc.y + 2);
      doc.text('PHƯỜNG BÌNH HƯNG HÒA B, BÌNH TÂN', 35, doc.y + 2);
      doc.text('HỒ CHÍ MINH', 35, doc.y + 2);
      doc.text('📞 0902375166', 35, doc.y + 2);

      // Right Column: Vendor Name
      doc.fillColor(TEXT_MAIN).font(boldFont).fontSize(10.5).text((po.vendorName || 'NHÀ CUNG CẤP').toUpperCase(), 290, addressY + 2, {
        width: 270,
        align: 'left'
      });

      // --- 4. TITLE: "Yêu cầu báo giá #P00046" / "Đơn mua hàng #..." ---
      const isConfirmed = po.state === 'purchase' || po.state === 'done';
      const titleText = isConfirmed ? `Đơn mua hàng #${poCode}` : `Yêu cầu báo giá #${poCode}`;
      const titleY = 220;

      doc.fillColor(TEAL).font(boldFont).fontSize(20).text(titleText, 35, titleY, { align: 'right', width: 525 });

      // --- 5. INFO BOX WITH ROUNDED BORDER ---
      const infoBoxY = 252;
      const infoBoxW = 525;
      const infoBoxH = 46;

      doc.roundedRect(35, infoBoxY, infoBoxW, infoBoxH, 6)
         .lineWidth(1)
         .strokeColor(TEAL)
         .stroke();

      const creatorName = po.createdBy?.fullName || 'Phạm Minh Phát';
      const deadlineStr = formatDate(po.orderDeadline || po.createdAt);
      const expectedStr = formatDate(po.expectedDate || po.createdAt);

      // Column 1: Bên mua
      doc.font(regularFont).fontSize(8.5).fillColor(TEXT_MUTED).text('Bên mua', 47, infoBoxY + 8);
      doc.font(boldFont).fontSize(9.5).fillColor(TEXT_MAIN).text(creatorName, 47, infoBoxY + 24);

      // Column 2: Hạn chót đơn hàng
      doc.font(regularFont).fontSize(8.5).fillColor(TEXT_MUTED).text('Hạn chót đơn', 320, infoBoxY + 8);
      doc.text('hàng:', 320, infoBoxY + 18);
      doc.font(boldFont).fontSize(9.5).fillColor(TEXT_MAIN).text(deadlineStr, 320, infoBoxY + 30);

      // Column 3: Ngày nhận hàng dự kiến
      doc.font(regularFont).fontSize(8.5).fillColor(TEXT_MUTED).text('Ngày nhận hàng', 415, infoBoxY + 8);
      doc.text('dự kiến:', 415, infoBoxY + 18);
      doc.font(boldFont).fontSize(9.5).fillColor(TEXT_MAIN).text(expectedStr, 415, infoBoxY + 30);

      // --- 6. PRODUCTS TABLE (ODOO GRID STYLE) ---
      const tableX = 35;
      const tableW = 525;
      const tableStartY = 312;

      const cols = {
        desc: { x: 35, w: 220 },
        qty: { x: 255, w: 65 },
        price: { x: 320, w: 65 },
        discount: { x: 385, w: 40 },
        tax: { x: 425, w: 40 },
        subtotal: { x: 465, w: 95 }
      };

      // Header background
      doc.rect(tableX, tableStartY, tableW, 24).fill(TEAL);
      doc.font(boldFont).fontSize(8.5).fillColor('#FFFFFF');

      doc.text('DIỄN GIẢI', cols.desc.x + 8, tableStartY + 7, { width: cols.desc.w - 12, align: 'left' });
      doc.text('SL', cols.qty.x, tableStartY + 7, { width: cols.qty.w - 6, align: 'right' });
      doc.text('ĐƠN GIÁ', cols.price.x, tableStartY + 7, { width: cols.price.w - 6, align: 'right' });
      doc.text('CK', cols.discount.x, tableStartY + 7, { width: cols.discount.w, align: 'center' });
      doc.text('THUẾ', cols.tax.x, tableStartY + 7, { width: cols.tax.w, align: 'center' });
      doc.text('SỐ TIỀN', cols.subtotal.x, tableStartY + 7, { width: cols.subtotal.w - 8, align: 'right' });

      // Table lines
      let currentY = tableStartY + 24;
      const lines = po.lines || [];

      lines.forEach((line: any) => {
        if (currentY > 730) {
          doc.addPage();
          currentY = 40;
        }

        const qty = Number(line.quantity) || 1;
        const price = Number(line.priceUnit) || 0;
        const subtotal = Number(line.priceSubtotal) || (qty * price);
        const rowH = 26;

        // Row border grid
        doc.rect(tableX, currentY, tableW, rowH)
           .lineWidth(0.5)
           .strokeColor(BORDER_COLOR)
           .stroke();

        // Vertical lines for cells
        const vLines = [cols.qty.x, cols.price.x, cols.discount.x, cols.tax.x, cols.subtotal.x];
        vLines.forEach(vx => {
          doc.moveTo(vx, currentY).lineTo(vx, currentY + rowH).strokeColor(BORDER_COLOR).stroke();
        });

        // Content
        doc.fillColor(TEXT_MAIN).font(boldFont).fontSize(8.5);
        doc.text(line.productName || 'Sản phẩm', cols.desc.x + 8, currentY + 8, {
          width: cols.desc.w - 14,
          ellipsis: true
        });

        doc.font(boldFont).fontSize(8.5);
        const qtyFormatted = `${new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(qty)} Đơn vị`;
        doc.text(qtyFormatted, cols.qty.x, currentY + 8, { width: cols.qty.w - 6, align: 'right' });

        doc.text(formatUnitPrice(price), cols.price.x, currentY + 8, { width: cols.price.w - 6, align: 'right' });

        doc.font(regularFont).fontSize(8.5);
        doc.text('0,00%', cols.discount.x, currentY + 8, { width: cols.discount.w, align: 'center' });

        doc.text('', cols.tax.x, currentY + 8, { width: cols.tax.w, align: 'center' });

        doc.font(boldFont).fontSize(8.5);
        doc.text(formatMoney(subtotal), cols.subtotal.x, currentY + 8, { width: cols.subtotal.w - 8, align: 'right' });

        currentY += rowH;
      });

      // --- 7. TOTAL SUMMARY TABLE (RIGHT-ALIGNED) ---
      const totalTableX = 365;
      const totalTableW = 195;
      const totalAmount = po.amountTotal || po.amountUntaxed || 0;

      // Row 1: Số tiền trước thuế
      doc.rect(totalTableX, currentY, totalTableW, 24)
         .lineWidth(0.5)
         .strokeColor(BORDER_COLOR)
         .stroke();

      doc.font(boldFont).fontSize(8.5).fillColor(TEXT_MAIN);
      doc.text('Số tiền trước thuế', totalTableX + 8, currentY + 7);
      doc.text(formatMoney(totalAmount), totalTableX + 85, currentY + 7, { width: 102, align: 'right' });

      currentY += 24;

      // Row 2: Tổng (Teal background, White bold text)
      doc.rect(totalTableX, currentY, totalTableW, 26).fill(TEAL);
      doc.font(boldFont).fontSize(9.5).fillColor('#FFFFFF');
      doc.text('Tổng', totalTableX + 8, currentY + 8);
      doc.text(formatMoney(totalAmount), totalTableX + 85, currentY + 8, { width: 102, align: 'right' });

      currentY += 40;

      // --- 8. NOTES SECTION (BOTTOM LEFT) ---
      if (po.notes) {
        doc.font(regularFont).fontSize(9).fillColor(TEXT_MAIN).text(po.notes, 35, currentY, { width: 500 });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
