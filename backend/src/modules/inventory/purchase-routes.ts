import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { routerClient } from '../../shared/services/router-client.js';
import { odooService } from '../odoo/odoo-service.js';
import { odooSyncService } from '../sync/odoo-sync-service.js';

function getPurchaseOrderSortNumber(po: any): number {
  const rawCode = po?.purchaseCode || po?.odooPurchaseId ? `PO${String(po?.odooPurchaseId || '').padStart(5, '0')}` : '';
  const match = String(rawCode || '').match(/(\d+)/g);
  if (!match || match.length === 0) {
    const numericId = Number(po?.odooPurchaseId || 0);
    return Number.isFinite(numericId) ? numericId : 0;
  }
  const lastNumber = Number(match[match.length - 1]);
  return Number.isFinite(lastNumber) ? lastNumber : 0;
}

function sortPurchaseOrdersByCode(a: any, b: any) {
  const aCode = getPurchaseOrderSortNumber(a);
  const bCode = getPurchaseOrderSortNumber(b);
  if (bCode !== aCode) return bCode - aCode;
  return String(b?.purchaseCode || b?.odooPurchaseId || b?.id || '').localeCompare(String(a?.purchaseCode || a?.odooPurchaseId || a?.id || ''));
}

function buildAttachmentHeader(filename: string, fallbackName = 'download.pdf') {
  const rawName = (filename || fallbackName).trim() || fallbackName;
  const asciiName = rawName
    .replace(/[\\/"<>|?*\r\n\t]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^\x20-\x7E]/g, '_')
    || fallbackName;

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`;
}

export async function purchaseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // POST /api/v1/inventory/purchase/sync - Đồng bộ danh sách phiếu nhập hàng từ Odoo
  app.post('/api/v1/inventory/purchase/sync', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = request.user?.orgId;
      if (!orgId) return reply.status(401).send({ error: 'Unauthorized' });

      const res = await odooSyncService.syncPurchaseOrders(orgId);
      let message = 'Dữ liệu phiếu nhập Odoo đã ở trạng thái mới nhất';
      if (res.deletedCount > 0 && res.newCount > 0 && res.updatedCount > 0) {
        message = `Đồng bộ thành công: ${res.newCount} phiếu mới, ${res.updatedCount} phiếu cập nhật, ${res.deletedCount} phiếu đã bị xóa khỏi Odoo`;
      } else if (res.deletedCount > 0 && res.newCount > 0) {
        message = `Đồng bộ thành công: ${res.newCount} phiếu mới, ${res.deletedCount} phiếu đã bị xóa khỏi Odoo`;
      } else if (res.deletedCount > 0 && res.updatedCount > 0) {
        message = `Đồng bộ thành công: ${res.updatedCount} phiếu cập nhật, ${res.deletedCount} phiếu đã bị xóa khỏi Odoo`;
      } else if (res.deletedCount > 0) {
        message = `Đồng bộ thành công: ${res.deletedCount} phiếu đã bị xóa khỏi Odoo`;
      } else if (res.newCount > 0 && res.updatedCount > 0) {
        message = `Đồng bộ thành công: ${res.newCount} phiếu mới, ${res.updatedCount} phiếu cập nhật từ Odoo`;
      } else if (res.newCount > 0) {
        message = `Đồng bộ thành công: ${res.newCount} phiếu nhập mới từ Odoo`;
      } else if (res.updatedCount > 0) {
        message = `Đồng bộ thành công: Đã cập nhật ${res.updatedCount} phiếu nhập từ Odoo`;
      }

      return reply.send({ success: true, message, ...res });
    } catch (error: any) {
      logger.error('Error syncing purchase orders from Odoo:', error);
      const isAccessError = error.message && (error.message.includes('AccessError') || error.message.includes('không được phép truy cập'));
      const errorMsg = isAccessError
        ? 'Tài khoản Odoo chưa được cấp quyền Mua hàng (Purchase). Vui lòng vào Cài đặt Odoo -> Người dùng để bật quyền Purchase cho tài khoản kết nối.'
        : ('Lỗi khi đồng bộ phiếu nhập từ Odoo: ' + error.message);
      return reply.status(500).send({ success: false, error: errorMsg });
    }
  });

  // GET /api/v1/inventory/purchase - Danh sách đơn nhập hàng
  app.get('/api/v1/inventory/purchase', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = request.user?.orgId;
      if (!orgId) return reply.status(401).send({ error: 'Unauthorized' });

      const pos = await prisma.purchaseOrder.findMany({
        where: { orgId },
        include: {
          lines: true,
          createdBy: { select: { fullName: true } }
        },
        take: 100,
      });

      const sortedPos = [...pos].sort(sortPurchaseOrdersByCode);
      return { success: true, data: sortedPos };
    } catch (error: any) {
      logger.error('Error fetching purchase orders:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/inventory/purchase/:id - Chi tiết 1 đơn nhập hàng
  app.get('/api/v1/inventory/purchase/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const orgId = request.user?.orgId;
      if (!orgId) return reply.status(401).send({ error: 'Unauthorized' });

      const { id } = request.params;
      const po = await prisma.purchaseOrder.findFirst({
        where: { id, orgId },
        include: {
          lines: true,
          createdBy: { select: { fullName: true } }
        }
      });

      if (!po) {
        return reply.status(404).send({ error: 'Không tìm thấy phiếu nhập hàng' });
      }

      return { success: true, data: po };
    } catch (error: any) {
      logger.error('Error fetching purchase order detail:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/inventory/purchase - Tạo đơn nhập hàng mới
  app.post('/api/v1/inventory/purchase', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = request.user?.orgId;
      const userId = request.user?.id;
      if (!orgId) return reply.status(401).send({ error: 'Unauthorized' });

      const {
        vendorId,
        vendorName,
        partnerRef,
        orderDeadline,
        expectedDate,
        locationId,
        deliverTo,
        lines,
        notes
      } = request.body as any;

      if (!vendorId || !lines || !lines.length) {
        return reply.status(400).send({ error: 'Missing vendor or lines' });
      }

      // 1. Calculate totals
      let amountUntaxed = 0;
      const orderLinesData = lines.map((line: any) => {
        const qty = Number(line.quantity) || 1;
        const price = Number(line.priceUnit) || 0;
        const subtotal = qty * price;
        amountUntaxed += subtotal;
        return {
          product_id: Number(line.productId),
          product_qty: qty,
          price_unit: price,
        };
      });

      // 2. Gửi lệnh tạo phiếu nhập hàng qua Router Gateway
      let odooPurchaseId: number | null = null;
      try {
        const routerRes = await routerClient.createPurchaseOrder({
          partner_id: Number(vendorId),
          partner_ref: partnerRef,
          picking_type_id: locationId ? Number(locationId) : undefined,
          date_order: orderDeadline ? new Date(orderDeadline).toISOString().split('T')[0] : undefined,
          date_planned: expectedDate ? new Date(expectedDate).toISOString().split('T')[0] : undefined,
          note: notes,
          order_line: orderLinesData
        });
        odooPurchaseId = routerRes.odooPurchaseId || null;
      } catch (odooErr: any) {
        logger.error('Failed to sync PO via Router to Odoo:', odooErr);
        return reply.status(500).send({ error: 'Lỗi đồng bộ Odoo: ' + odooErr.message });
      }

      // 3. Save to Local DB
      const po = await prisma.purchaseOrder.create({
        data: {
          orgId,
          vendorId: Number(vendorId),
          vendorName: vendorName || 'Unknown Vendor',
          orderDeadline: orderDeadline ? new Date(orderDeadline) : null,
          expectedDate: expectedDate ? new Date(expectedDate) : null,
          deliverTo: deliverTo || null,
          amountUntaxed,
          amountTotal: amountUntaxed,
          odooPurchaseId,
          state: 'draft',
          notes,
          createdById: userId,
          lines: {
            create: lines.map((l: any) => ({
              productId: Number(l.productId),
              productName: l.productName || 'Sản phẩm',
              quantity: Number(l.quantity) || 1,
              priceUnit: Number(l.priceUnit) || 0,
              priceSubtotal: (Number(l.quantity) || 1) * (Number(l.priceUnit) || 0)
            }))
          }
        },
        include: { lines: true }
      });

      return { success: true, data: po };
    } catch (error: any) {
      logger.error('Error creating purchase order:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/inventory/purchase/:id - Chỉnh sửa đơn nhập hàng
  app.put('/api/v1/inventory/purchase/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const orgId = request.user?.orgId;
      if (!orgId) return reply.status(401).send({ error: 'Unauthorized' });

      const { id } = request.params;
      const {
        vendorId,
        vendorName,
        deliverTo,
        orderDeadline,
        expectedDate,
        notes,
        state,
        lines
      } = request.body as any;

      const existing = await prisma.purchaseOrder.findFirst({
        where: { id, orgId }
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Không tìm thấy phiếu nhập hàng' });
      }

      let amountUntaxed = 0;
      const validatedLines = (lines || []).map((l: any) => {
        const qty = Number(l.quantity) || 1;
        const price = Number(l.priceUnit) || 0;
        const subtotal = qty * price;
        amountUntaxed += subtotal;
        return {
          productId: Number(l.productId),
          productName: String(l.productName || 'Sản phẩm'),
          quantity: qty,
          priceUnit: price,
          priceSubtotal: subtotal
        };
      });

      // Update in transaction: replace lines & update PO fields
      const updated = await prisma.$transaction(async (tx) => {
        if (lines && lines.length >= 0) {
          await tx.purchaseOrderLine.deleteMany({
            where: { purchaseOrderId: id }
          });
        }

        return tx.purchaseOrder.update({
          where: { id },
          data: {
            vendorId: vendorId !== undefined ? Number(vendorId) : existing.vendorId,
            vendorName: vendorName !== undefined ? vendorName : existing.vendorName,
            deliverTo: deliverTo !== undefined ? deliverTo : existing.deliverTo,
            orderDeadline: orderDeadline !== undefined ? (orderDeadline ? new Date(orderDeadline) : null) : existing.orderDeadline,
            expectedDate: expectedDate !== undefined ? (expectedDate ? new Date(expectedDate) : null) : existing.expectedDate,
            notes: notes !== undefined ? notes : existing.notes,
            state: state || existing.state,
            amountUntaxed,
            amountTotal: amountUntaxed,
            lines: {
              create: validatedLines
            }
          },
          include: {
            lines: true,
            createdBy: { select: { fullName: true } }
          }
        });
      });

      return { success: true, data: updated };
    } catch (error: any) {
      logger.error('Error updating purchase order:', error);
      return reply.status(500).send({ error: 'Lỗi khi cập nhật phiếu nhập: ' + error.message });
    }
  });

  // GET /api/v1/inventory/purchase/:id/pdf - Tải hoặc xuất file PDF phiếu nhập hàng
  app.get('/api/v1/inventory/purchase/:id/pdf', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const orgId = request.user?.orgId;
      if (!orgId) return reply.status(401).send({ error: 'Unauthorized' });

      const { id } = request.params;
      const po = await prisma.purchaseOrder.findFirst({
        where: { id, orgId },
        include: {
          lines: true,
          createdBy: { select: { fullName: true } }
        }
      });

      if (!po) {
        return reply.status(404).send({ error: 'Không tìm thấy phiếu nhập hàng' });
      }

      // Phiếu đã đồng bộ phải dùng đúng báo cáo chính thức từ Odoo.
      if (po.odooPurchaseId) {
        try {
          const activeOdoo = await routerClient.getActiveOdooConfig();
          const odooPdf = await odooService.getPurchaseOrderReportPdf(po.odooPurchaseId, activeOdoo || undefined);
          if (odooPdf && odooPdf.buffer && odooPdf.buffer.length > 0) {
            logger.info(`[purchase-routes] Đã tải thành công file PDF phiếu nhập #${po.odooPurchaseId} trực tiếp từ Odoo`);
            reply.header('Content-Type', 'application/pdf');
            reply.header('Content-Disposition', buildAttachmentHeader(odooPdf.filename || `Yeu_Cau_Bao_Gia_P${String(po.odooPurchaseId).padStart(5, '0')}.pdf`));
            return reply.send(odooPdf.buffer);
          }
        } catch (odooPdfErr: any) {
          logger.error(`[purchase-routes] Không thể tải PDF từ Odoo (#${po.odooPurchaseId}): ${odooPdfErr.message}`);
        }

        return reply.status(502).send({ error: 'Không thể lấy báo cáo PDF chính thức từ Odoo. Vui lòng kiểm tra quyền báo cáo Purchase trên Odoo.' });
      }

      return reply.status(502).send({ error: 'Không có báo cáo PDF chính thức từ Odoo cho phiếu nhập này.' });
    } catch (error: any) {
      logger.error('Error generating PO PDF:', error);
      return reply.status(500).send({ error: 'Lỗi khi tạo file PDF: ' + error.message });
    }
  });
}
