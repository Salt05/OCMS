/**
 * internal-routes.ts
 * Cổng API nội bộ dành riêng cho Universal Router và Background Workers
 * Kết nối động với CSDL PostgreSQL và cấu hình Odoo ERP từ /settings
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { integrationSettingsService } from '../settings/integration-settings-service.js';
import { odooService } from '../odoo/odoo-service.js';
import { zaloPool } from '../zalo/zalo-pool.js';

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export async function internalRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Helper lấy orgId mặc định của hệ thống
   */
  async function getDefaultOrgId(): Promise<string> {
    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!org) throw new Error('Không tìm thấy Organization nào trong CSDL');
    return org.id;
  }

  /**
   * Helper: Gửi tin nhắn Zalo đến khách hàng
   */
  async function sendOrderNotificationToCustomer(
    orgId: string,
    order: any,
    messageText: string,
    targetConversationId?: string
  ): Promise<{ sent: boolean; conversationId?: string; reason?: string }> {
    try {
      let conversation: any = null;

      if (targetConversationId) {
        conversation = await prisma.conversation.findFirst({
          where: { id: targetConversationId, orgId },
        });
      }

      if (!conversation && order.customerProfileId) {
        const contact = await prisma.contact.findFirst({
          where: { orgId, customerId: order.customerProfileId },
          include: { conversations: { orderBy: { lastMessageAt: 'desc' }, take: 1 } },
        });
        if (contact?.conversations?.length) conversation = contact.conversations[0];
      }

      if (!conversation && order.customerPhone) {
        const cleanPhone = String(order.customerPhone).replace(/\D/g, '');
        if (cleanPhone.length >= 9) {
          const contact = await prisma.contact.findFirst({
            where: { orgId, phone: { contains: cleanPhone.slice(-9) } },
            include: { conversations: { orderBy: { lastMessageAt: 'desc' }, take: 1 } },
          });
          if (contact?.conversations?.length) conversation = contact.conversations[0];
        }
      }

      if (!conversation && order.customerName) {
        const contact = await prisma.contact.findFirst({
          where: { orgId, fullName: { contains: order.customerName, mode: 'insensitive' } },
          include: { conversations: { orderBy: { lastMessageAt: 'desc' }, take: 1 } },
        });
        if (contact?.conversations?.length) conversation = contact.conversations[0];
      }

      if (!conversation) {
        logger.info(`[internal-routes] Không tìm thấy hội thoại Zalo cho khách hàng: ${order.customerName} (${order.customerPhone})`);
        return { sent: false, reason: 'Chưa có hội thoại Zalo của khách hàng' };
      }

      // Gửi qua tài khoản Zalo OA nếu đang kết nối
      const instance = zaloPool.getInstance(conversation.zaloAccountId);
      const isRealZalo = instance && instance.api && conversation.externalThreadId && !conversation.externalThreadId.startsWith('test_');

      if (isRealZalo) {
        try {
          const sendPromise = instance.api.sendMessage(
            { msg: messageText },
            conversation.externalThreadId,
            conversation.threadType === 'group' ? 1 : 0
          );
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout gửi tin nhắn Zalo (10s)')), 10000)
          );
          await Promise.race([sendPromise, timeoutPromise]);
          logger.info(`[internal-routes] Đã gửi thông báo đơn qua Zalo API đến thread ${conversation.externalThreadId}`);
          return { sent: true, conversationId: conversation.id };
        } catch (err: any) {
          logger.warn(`[internal-routes] Lỗi gửi qua Zalo API: ${err.message}`);
        }
      }

      // Lưu tin nhắn vào CSDL và bắn socket nội bộ
      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'self',
          content: messageText,
          contentType: 'text',
          sentAt: new Date(),
        },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), isReplied: true },
      });

      zaloPool.getIO()?.to(`conversation:${conversation.id}`).emit('chat:message', {
        message,
        conversationId: conversation.id,
      });

      return { sent: true, conversationId: conversation.id };
    } catch (err: any) {
      logger.error('[internal-routes] Lỗi sendOrderNotificationToCustomer:', err);
      return { sent: false, reason: err.message };
    }
  }

  /**
   * Helper: Gửi file PDF đơn hàng đính kèm qua Zalo
   */
  async function sendPdfAttachmentToCustomer(
    orgId: string,
    order: any,
    reportPdf: { buffer: Buffer; filename: string },
    targetConversationId?: string
  ): Promise<{ sent: boolean; reason?: string }> {
    let tempFilePath: string | null = null;
    try {
      let conversation: any = null;

      if (targetConversationId) {
        conversation = await prisma.conversation.findFirst({
          where: { id: targetConversationId, orgId },
        });
      }

      if (!conversation && order.customerPhone) {
        const cleanPhone = String(order.customerPhone).replace(/\D/g, '');
        if (cleanPhone.length >= 9) {
          const contact = await prisma.contact.findFirst({
            where: { orgId, phone: { contains: cleanPhone.slice(-9) } },
            include: { conversations: { orderBy: { lastMessageAt: 'desc' }, take: 1 } },
          });
          if (contact?.conversations?.length) conversation = contact.conversations[0];
        }
      }

      if (!conversation) return { sent: false, reason: 'Không tìm thấy hội thoại để gửi PDF' };

      const safeCode = (order.orderCode || 'order').replace(/[^a-zA-Z0-9_-]/g, '_');
      const tempDir = path.join(os.tmpdir(), 'ocms-pdf');
      await fs.promises.mkdir(tempDir, { recursive: true });
      tempFilePath = path.join(tempDir, `${safeCode}.pdf`);
      await fs.promises.writeFile(tempFilePath, reportPdf.buffer);

      const instance = zaloPool.getInstance(conversation.zaloAccountId);
      const isRealZalo = instance && instance.api && conversation.externalThreadId && !conversation.externalThreadId.startsWith('test_');

      if (isRealZalo) {
        try {
          const sendPromise = instance.api.sendMessage(
            { msg: '', attachments: [tempFilePath] },
            conversation.externalThreadId,
            conversation.threadType === 'group' ? 1 : 0
          );
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout tải lên PDF qua Zalo API (10s)')), 10000)
          );
          await Promise.race([sendPromise, timeoutPromise]);
          logger.info(`[internal-routes] Đã gửi file PDF qua Zalo API đến thread ${conversation.externalThreadId}`);
          return { sent: true };
        } catch (zErr: any) {
          logger.warn(`[internal-routes] Gửi file PDF qua Zalo API cảnh báo: ${zErr.message}`);
        }
      }

      const savedFileMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'self',
          content: `[File PDF] ${reportPdf.filename || `${safeCode}.pdf`}`,
          contentType: 'file',
          attachments: [{ name: reportPdf.filename || `${safeCode}.pdf`, size: reportPdf.buffer.length, type: 'application/pdf' }],
          sentAt: new Date(),
        },
      });

      zaloPool.getIO()?.to(`conversation:${conversation.id}`).emit('chat:message', {
        message: savedFileMessage,
        conversationId: conversation.id,
      });

      return { sent: true };
    } catch (err: any) {
      logger.error('[internal-routes] Lỗi sendPdfAttachmentToCustomer:', err);
      return { sent: false, reason: err.message };
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.promises.unlink(tempFilePath).catch(() => {});
      }
    }
  }

  // ── 1. LẤY CẤU HÌNH ODOO ĐỘNG TỪ /settings ─────────────────────────────────
  app.get('/api/v1/internal/config/odoo', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = await getDefaultOrgId();
      const odooCfg = await integrationSettingsService.getOdooConfig(orgId);

      return reply.send({
        success: true,
        data: {
          url: odooCfg.url,
          db: odooCfg.db,
          user: odooCfg.user,
          has_api_key: Boolean(odooCfg.apiKey),
        },
      });
    } catch (err: any) {
      logger.error('[internal-routes] Lỗi lấy cấu hình Odoo:', err.message);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 2. ODOO WORKER: TẠO ĐƠN HÀNG THẬT TRÊN ODOO DÙNG CẤU HÌNH TỪ /settings ─
  app.post('/api/v1/internal/odoo/create-order', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        order_code: string;
        partner_id?: number | null;
        note?: string;
        odoo_target?: {
          url: string;
          db: string;
          user: string;
          apiKey: string;
        };
        items: Array<{
          sku: string;
          product_name?: string;
          odoo_product_id?: number | null;
          quantity: number;
          price: number;
          discount?: number;
        }>;
      };

      const orgId = await getDefaultOrgId();
      const partnerId = body.partner_id ? Number(body.partner_id) : 17871; // Fallback nếu chưa có

      // Chuẩn bị danh sách sản phẩm Odoo lines
      const validLines: Array<{
        product_id: number;
        product_uom_qty: number;
        price_unit: number;
        discount?: number;
      }> = [];

      for (const item of body.items || []) {
        let pId = item.odoo_product_id;

        // Nếu có SKU và có odoo_target, tra cứu trực tiếp theo SKU trên Odoo đích để đảm bảo ID chính xác (Test vs Prod)
        if (body.odoo_target && item.sku) {
          try {
            const remoteProd = await odooService.searchProductBySku(item.sku, body.odoo_target);
            if (remoteProd && remoteProd.id) {
              pId = remoteProd.id;
            }
          } catch (err: any) {
            logger.warn(`[internal-routes] Không thể tìm SKU ${item.sku} trên Odoo đích: ${err.message}`);
          }
        }

        if (!pId) {
          const cache = await prisma.productCache.findFirst({
            where: {
              orgId,
              OR: [
                { sku: { equals: item.sku, mode: 'insensitive' } },
                { name: { contains: item.sku, mode: 'insensitive' } },
              ],
            },
          });
          if (cache?.odooId) pId = cache.odooId;
        }

        if (pId) {
          validLines.push({
            product_id: pId,
            product_uom_qty: item.quantity || 1,
            price_unit: item.price || 0,
            discount: item.discount || 0,
          });
        }
      }

      if (validLines.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Không tìm thấy ID sản phẩm Odoo hợp lệ trong cơ sở dữ liệu để tạo đơn',
        });
      }

      const targetInfo = body.odoo_target ? `Máy chủ Router chỉ định: ${body.odoo_target.url}` : 'Cấu hình /settings';
      logger.info(`[internal-routes] Đang gọi odooService.createOrder (${targetInfo}) cho khách #${partnerId}...`);

      // Chuẩn bị ghi chú đơn hàng (Note):
      // Nếu có ghi chú từ người dùng / chatbot thì đính kèm điều khoản mặc định.
      // Nếu không có ghi chú riêng thì để undefined để Odoo tự động áp dụng Điều khoản & Điều kiện mặc định (http://odooo.fonti.vn/terms)
      let resolvedNote: string | undefined = undefined;
      const defaultTermsHtml = '<p>Điều khoản &amp; điều kiện: <a href="https://odooo.fonti.vn/terms" target="_blank" rel="noreferrer noopener">https://odooo.fonti.vn/terms</a></p>';
      if (body.note && body.note.trim()) {
        const cleanNote = body.note.trim();
        if (cleanNote.includes('odooo.fonti.vn/terms') || cleanNote.toLowerCase().includes('điều khoản & điều kiện')) {
          resolvedNote = cleanNote;
        } else {
          resolvedNote = `<p>${cleanNote}</p>${defaultTermsHtml}`;
        }
      }

      const createdOdooId = await odooService.createOrder({
        partner_id: partnerId,
        note: resolvedNote,
        client_order_ref: body.order_code,
        origin: body.order_code,
        order_line: validLines,
      }, body.odoo_target);

      if (!createdOdooId) {
        throw new Error('Odoo không trả về mã đơn hàng sau khi tạo');
      }

      // Lấy thông tin đơn hàng vừa tạo trên Odoo để có mã SO chính thức
      const odooOrder = await odooService.getOrder(createdOdooId, body.odoo_target);
      const officialCode = odooOrder?.name || body.order_code;
      const officialTotal = odooOrder?.amount_total || 0;
      const amountUntaxed = odooOrder?.amount_untaxed ?? officialTotal;
      const partnerName = Array.isArray(odooOrder?.partner_id) && odooOrder.partner_id.length > 1
        ? String(odooOrder.partner_id[1])
        : `Partner #${partnerId}`;
      const salesperson = Array.isArray(odooOrder?.user_id) && odooOrder.user_id.length > 1
        ? String(odooOrder.user_id[1])
        : null;
      const salespersonId = Array.isArray(odooOrder?.user_id) && odooOrder.user_id.length > 0
        ? Number(odooOrder.user_id[0])
        : null;
      const warehouseName = Array.isArray(odooOrder?.warehouse_id) && odooOrder.warehouse_id.length > 1
        ? String(odooOrder.warehouse_id[1])
        : 'TPHCM';

      logger.info(`[internal-routes] ✅ Đã tạo thành công Báo giá Odoo #${createdOdooId} (${officialCode}) - NV: ${salesperson || 'N/A'}`);

      // Lưu hoặc cập nhật đầy đủ thông tin vào bảng OrderHistory & OrderLineHistory
      try {
        const savedOrder = await prisma.orderHistory.upsert({
          where: {
            orgId_odooOrderId: { orgId, odooOrderId: createdOdooId },
          },
          create: {
            id: randomUUID(),
            orgId,
            odooOrderId: createdOdooId,
            orderCode: officialCode,
            odooPartnerId: partnerId,
            partnerName,
            salesperson,
            salespersonId,
            warehouseName,
            amountUntaxed,
            amountTotal: officialTotal,
            amountUndiscounted: amountUntaxed,
            state: odooOrder?.state || 'draft',
            dateOrder: new Date(),
            note: odooOrder?.note || resolvedNote || null,
          },
          update: {
            orderCode: officialCode,
            partnerName,
            salesperson,
            salespersonId,
            warehouseName,
            amountUntaxed,
            amountTotal: officialTotal,
            amountUndiscounted: amountUntaxed,
            state: odooOrder?.state || 'draft',
            note: odooOrder?.note || resolvedNote || null,
          },
        });

        // Lưu toàn bộ dòng sản phẩm vào OrderLineHistory
        if (savedOrder && Array.isArray(odooOrder?.lines) && odooOrder.lines.length > 0) {
          await prisma.orderLineHistory.deleteMany({
            where: { orderHistoryId: savedOrder.id },
          });

          for (const line of odooOrder.lines) {
            const prodName = Array.isArray(line.product_id) && line.product_id.length > 1
              ? String(line.product_id[1])
              : (line.name || 'Sản phẩm');
            const prodSku = prodName.match(/\[(.*?)\]/)?.[1] || null;

            await prisma.orderLineHistory.create({
              data: {
                orderHistoryId: savedOrder.id,
                odooLineId: line.id,
                productName: prodName,
                productSku: prodSku,
                odooProductId: Array.isArray(line.product_id) ? line.product_id[0] : null,
                uomName: Array.isArray(line.product_uom) && line.product_uom.length > 1 ? line.product_uom[1] : 'Units',
                quantity: line.product_uom_qty || 1,
                priceUnit: line.price_unit || 0,
                discount: line.discount || 0,
                priceSubtotal: line.price_subtotal || 0,
                priceTotal: line.price_total || line.price_subtotal || 0,
              },
            });
          }
        }
        logger.info(`[internal-routes] Đã đồng bộ OrderHistory & ${odooOrder?.lines?.length || 0} sản phẩm cho Báo giá #${createdOdooId} (${officialCode})`);
      } catch (crmErr: any) {
        logger.warn(`[internal-routes] Ghi nhận OrderHistory/OrderLineHistory: ${crmErr.message}`);
      }

      return reply.send({
        success: true,
        odoo_order_id: createdOdooId,
        order_code: officialCode,
        salesperson,
        amount_total: officialTotal,
        amount_untaxed: amountUntaxed,
      });
    } catch (err: any) {
      logger.error(`[internal-routes] Lỗi tạo đơn Odoo: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 2B. ODOO WORKER: HỦY ĐƠN HÀNG TRÊN ODOO QUA ROUTER ───────────────────
  app.post('/api/v1/internal/odoo/cancel-order', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        order_code: string;
        reason?: string;
        odoo_target?: { url: string; db: string; user: string; apiKey: string };
      };

      if (!body?.order_code) {
        return reply.status(400).send({ success: false, error: 'Thiếu mã đơn hàng order_code' });
      }

      const orgId = await getDefaultOrgId();
      // Tìm đơn hàng theo orderCode hoặc ID
      const order = await prisma.orderHistory.findFirst({
        where: {
          orgId,
          OR: [
            { orderCode: body.order_code },
            { id: body.order_code },
          ],
        },
      });

      const odooOrderId = order?.odooOrderId || (Number(body.order_code) > 0 ? Number(body.order_code) : null);
      if (odooOrderId) {
        await odooService.cancelOrder(odooOrderId, body.odoo_target);
        if (order) {
          await prisma.orderHistory.update({
            where: { id: order.id },
            data: { state: 'cancel' },
          });
        }
      }

      logger.info(`[internal-routes] ✅ Đã xử lý hủy đơn hàng #${body.order_code} (Odoo ID: ${odooOrderId || 'N/A'})`);
      return reply.send({ success: true, message: 'Đã hủy đơn hàng thành công' });
    } catch (err: any) {
      logger.error(`[internal-routes] Lỗi hủy đơn Odoo: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 2.2. ODOO WORKER: TẠO ĐỐI TÁC KHÁCH HÀNG TRÊN ODOO DÙNG CẤU HÌNH TỪ ROUTER ───
  app.post('/api/v1/internal/odoo/create-customer', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        customer?: any;
        name?: string;
        phone?: string;
        email?: string;
        street?: string;
        contact_id?: string;
        odoo_target?: {
          url: string;
          db: string;
          user: string;
          apiKey: string;
        };
      };

      const customerData = body.customer || {
        is_company: false,
        name: body.name || 'Khách hàng mới',
        phone: body.phone,
        email: body.email,
        street: body.street,
      };

      const orgId = await getDefaultOrgId();
      const newPartnerId = await odooService.createCustomer(customerData, body.odoo_target);

      if (!newPartnerId) {
        throw new Error('Tạo đối tác trên Odoo thất bại');
      }

      // Cập nhật CRM Contact nếu có contact_id
      const contactId = body.contact_id || body.customer?.contact_id;
      if (contactId) {
        await prisma.contact.update({
          where: { id: contactId },
          data: {
            customerId: String(newPartnerId),
          },
        }).catch((e: any) => logger.warn(`[internal-routes] Không thể cập nhật customerId cho contact: ${e.message}`));

        // Cập nhật customerProfile
        await prisma.customerProfile.upsert({
          where: { orgId_odooPartnerId: { orgId, odooPartnerId: newPartnerId } },
          update: {
            name: customerData.name,
            phone: customerData.phone || null,
            email: customerData.email || null,
          },
          create: {
            orgId,
            odooPartnerId: newPartnerId,
            name: customerData.name,
            phone: customerData.phone || null,
            email: customerData.email || null,
          },
        }).catch((e: any) => logger.warn(`[internal-routes] Không thể upsert customerProfile: ${e.message}`));
      }

      logger.info(`[internal-routes] ✅ Đã tạo thành công khách hàng #${newPartnerId} (${customerData.name})`);
      return reply.send({
        success: true,
        odoo_partner_id: newPartnerId,
        name: customerData.name,
      });
    } catch (err: any) {
      logger.error(`[internal-routes] Lỗi tạo khách hàng Odoo: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 2.3. ODOO WORKER: CẬP NHẬT ĐỐI TÁC KHÁCH HÀNG TRÊN ODOO DÙNG CẤU HÌNH TỪ ROUTER ───
  app.post('/api/v1/internal/odoo/update-customer', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        partner_id: number;
        data: any;
        odoo_target?: {
          url: string;
          db: string;
          user: string;
          apiKey: string;
        };
      };

      const partnerId = Number(body.partner_id);
      if (!partnerId || isNaN(partnerId)) {
        return reply.status(400).send({ success: false, error: 'Thiếu partner_id hợp lệ' });
      }

      const success = await odooService.updateCustomer(partnerId, body.data, body.odoo_target);
      logger.info(`[internal-routes] ✅ Đã cập nhật đối tác #${partnerId} trên Odoo: ${success ? 'Thành công' : 'Không có thay đổi'}`);

      return reply.send({
        success: true,
        partner_id: partnerId,
        updated: success,
      });
    } catch (err: any) {
      logger.error(`[internal-routes] Lỗi cập nhật đối tác Odoo: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 2.4. ODOO WORKER: CẬP NHẬT ĐƠN HÀNG TRÊN ODOO DÙNG CẤU HÌNH TỪ ROUTER ──────
  app.post('/api/v1/internal/odoo/update-order', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        odoo_order_id: number;
        note?: string;
        lines?: Array<{
          odooLineId?: number;
          odooProductId?: number;
          quantity: number;
          priceUnit: number;
          discount?: number;
        }>;
        editor_name?: string;
        staff_odoo_uid?: number;
        odoo_target?: {
          url: string;
          db: string;
          user: string;
          apiKey: string;
        };
      };

      const odooOrderId = Number(body.odoo_order_id);
      if (!odooOrderId || isNaN(odooOrderId)) {
        return reply.status(400).send({ success: false, error: 'Thiếu odoo_order_id hợp lệ' });
      }

      const updatePayload: Record<string, any> = {};
      if (body.note !== undefined) {
        updatePayload.note = body.note;
      }

      if (body.lines && Array.isArray(body.lines)) {
        const existingOrder = await odooService.executeKw<any>('sale.order', 'read', [
          [odooOrderId], ['order_line']
        ], {}, body.odoo_target);

        const currentOdooLineIds = new Set<number>(
          existingOrder && Array.isArray(existingOrder[0]?.order_line) ? existingOrder[0].order_line : []
        );
        const updatedLineOdooIds = new Set<number>();
        const lineCommands: any[] = [];

        for (const line of body.lines) {
          const qty = Number(line.quantity) || 0;
          const price = Number(line.priceUnit) || 0;
          const discount = Number(line.discount) || 0;

          if (line.odooLineId && currentOdooLineIds.has(line.odooLineId)) {
            updatedLineOdooIds.add(line.odooLineId);
            lineCommands.push([
              1,
              line.odooLineId,
              { product_uom_qty: qty, price_unit: price, discount: discount },
            ]);
          } else if (line.odooProductId) {
            lineCommands.push([
              0,
              0,
              { product_id: line.odooProductId, product_uom_qty: qty, price_unit: price, discount: discount },
            ]);
          }
        }

        for (const oldLineId of currentOdooLineIds) {
          if (!updatedLineOdooIds.has(oldLineId)) {
            lineCommands.push([2, oldLineId, 0]);
          }
        }

        if (lineCommands.length > 0) {
          updatePayload.order_line = lineCommands;
        }
      }

      if (Object.keys(updatePayload).length > 0) {
        await odooService.executeKw('sale.order', 'write', [[odooOrderId], updatePayload], {}, body.odoo_target);

        if (body.editor_name) {
          try {
            await odooService.executeKw(
              'sale.order',
              'message_post',
              [[odooOrderId]],
              {
                body: `Đơn hàng đã được điều chỉnh từ OCMS bởi: ${body.editor_name}${body.staff_odoo_uid ? ` (Odoo ID: #${body.staff_odoo_uid})` : ''}`,
                message_type: 'comment',
                subtype_xmlid: 'mail.mt_note',
              },
              body.odoo_target
            );
          } catch (postErr: any) {
            logger.warn(`[internal-routes] Không thể đăng chatter lên Odoo:`, postErr.message);
          }
        }
      }

      logger.info(`[internal-routes] ✅ Đã cập nhật đơn hàng #${odooOrderId} trên Odoo thành công qua Router`);
      return reply.send({ success: true, odoo_order_id: odooOrderId, updated: true });
    } catch (err: any) {
      logger.error(`[internal-routes] Lỗi cập nhật đơn hàng Odoo: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 2.5. ODOO WORKER: THÊM / SỬA / XÓA HOẠT ĐỘNG (GHI CHÚ GIAO VIỆC) QUA ROUTER ──
  app.post('/api/v1/internal/odoo/manage-activity', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        odoo_order_id: number;
        action: 'create' | 'update' | 'delete';
        summary?: string;
        activity_type_id?: number;
        date_deadline?: string;
        user_id?: number;
        odoo_target?: {
          url: string;
          db: string;
          user: string;
          apiKey: string;
        };
      };

      const odooOrderId = Number(body.odoo_order_id);
      if (!odooOrderId || isNaN(odooOrderId)) {
        return reply.status(400).send({ success: false, error: 'Thiếu odoo_order_id hợp lệ' });
      }

      const actText = typeof body.summary === 'string' ? body.summary.trim() : '';

      const existingActs = await odooService.executeKw<any[]>('mail.activity', 'search_read', [
        [['res_model', '=', 'sale.order'], ['res_id', '=', odooOrderId]],
      ], { fields: ['id', 'summary'] }, body.odoo_target);

      if (body.action === 'delete' || (!actText && body.action === 'update')) {
        if (existingActs && existingActs.length > 0) {
          const actIds = existingActs.map((a) => a.id);
          await odooService.executeKw('mail.activity', 'unlink', [actIds], {}, body.odoo_target);
        }
        logger.info(`[internal-routes] 🗑️ Đã xóa hoạt động cho đơn #${odooOrderId} trên Odoo qua Router`);
        return reply.send({ success: true, activitySummary: null });
      }

      if (actText) {
        if (existingActs && existingActs.length > 0) {
          await odooService.executeKw('mail.activity', 'write', [[existingActs[0].id], { summary: actText }], {}, body.odoo_target);
        } else {
          await odooService.executeKw('sale.order', 'activity_schedule', [[odooOrderId]], {
            summary: actText,
            activity_type_id: body.activity_type_id || 4, // To-Do
            date_deadline: body.date_deadline || new Date().toISOString().slice(0, 10),
            user_id: body.user_id || undefined,
          }, body.odoo_target);
        }
        logger.info(`[internal-routes] ✨ Đã cập nhật hoạt động "${actText}" cho đơn #${odooOrderId} trên Odoo qua Router`);
        return reply.send({ success: true, activitySummary: actText });
      }

      return reply.send({ success: true, activitySummary: null });
    } catch (err: any) {
      logger.error(`[internal-routes] Lỗi quản lý hoạt động Odoo qua Router: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 3. OCMS WORKER: GHI NHẬN CRM & GỬI TIN NHẮN ZALO KÈM PDF CHO KHÁCH ───
  app.post('/api/v1/internal/ocms/notify-customer', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        order_code: string;
        customer_name: string;
        customer_phone: string;
        shipping_address?: string;
        total_amount: number;
        payment_method?: string;
        note?: string;
        odoo_order_id?: number | null;
        odoo_target?: {
          url: string;
          db: string;
          user: string;
          apiKey: string;
        };
        items?: any[];
        conversation_id?: string;
        conversationId?: string;
        contact_id?: string;
        contactId?: string;
        web_order_code?: string;
      };

      const orgId = await getDefaultOrgId();
      const customerName = body.customer_name || 'Quý khách';
      const totalVND = formatVND(body.total_amount || 0);
      const noteText = body.note ? `Ghi chú: ${body.note}\n` : '';
      const targetConversationId = body.conversation_id || body.conversationId;
      const targetContactId = body.contact_id || body.contactId;

      // 1. Tìm odoo_order_id nếu chưa có sẵn trong payload
      let resolvedOdooOrderId = body.odoo_order_id && Number(body.odoo_order_id) < 1000000 ? Number(body.odoo_order_id) : null;
      if (!resolvedOdooOrderId) {
        for (let i = 0; i < 4; i++) {
          const match = await prisma.orderHistory.findFirst({
            where: {
              orgId,
              OR: [
                { orderCode: body.order_code },
                { note: { contains: body.order_code } },
                ...(body.web_order_code ? [{ orderCode: body.web_order_code }, { note: { contains: body.web_order_code } }] : []),
              ],
            },
          });
          if (match?.odooOrderId && match.odooOrderId < 1000000) {
            resolvedOdooOrderId = match.odooOrderId;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // CHỐT CHẶN BẢO VỆ (Guardrail): Nếu đơn chưa được tạo trên Odoo (không có resolvedOdooOrderId),
      // TUYỆT ĐỐI KHÔNG gửi tin nhắn Zalo thông báo đóng gói thành công cho khách hàng!
      if (!resolvedOdooOrderId) {
        logger.warn(`[internal-routes] ⚠️ Đơn hàng [${body.order_code}] chưa có Odoo Order ID (chưa được tạo trên Odoo ERP). Từ chối gửi tin nhắn xác nhận đóng gói cho khách hàng.`);
        return reply.status(400).send({
          success: false,
          error: `Đơn hàng [${body.order_code}] chưa được tạo trên Odoo ERP (thiếu odoo_order_id). Không thể gửi thông báo xác nhận đơn hàng thành công cho khách hàng.`,
        });
      }

      // 2. Tìm đơn hàng hiện có trong CRM để lấy mã Odoo chính thức (vd: S02398)
      let existingOrder: any = null;
      if (resolvedOdooOrderId) {
        existingOrder = await prisma.orderHistory.findUnique({
          where: { orgId_odooOrderId: { orgId, odooOrderId: resolvedOdooOrderId } },
        });
      }
      if (!existingOrder) {
        existingOrder = await prisma.orderHistory.findFirst({
          where: {
            orgId,
            OR: [
              { orderCode: body.order_code },
              { note: { contains: body.order_code } },
              ...(body.web_order_code ? [{ orderCode: body.web_order_code }, { note: { contains: body.web_order_code } }] : []),
            ],
          },
        });
      }

      // Xác định mã đơn hàng chuẩn hiển thị (ưu tiên mã Odoo như S02398)
      let displayOrderCode = existingOrder?.orderCode;
      if (!displayOrderCode || displayOrderCode.startsWith('WEB-B2B-') || displayOrderCode.startsWith('CHAT-')) {
        displayOrderCode = (!body.order_code.startsWith('WEB-B2B-') && !body.order_code.startsWith('CHAT-'))
          ? body.order_code
          : (existingOrder?.orderCode || body.order_code);
      }

      // Mẫu tin nhắn chuẩn gửi khách hàng với mã đơn Odoo chính thức
      const zaloMessage = `Dạ đơn hàng ${displayOrderCode} của ${customerName} đã được xác nhận và đang được chuyển sang bộ phận đóng gói ạ. Tổng giá trị đơn hàng là ${totalVND}.
${noteText}
Em cảm ơn ${customerName} đã ủng hộ shop ạ!`.trim();

      // Ghi nhận / cập nhật đơn vào bảng OrderHistory của CRM
      let savedOrder: any = existingOrder;
      try {
        if (existingOrder) {
          savedOrder = await prisma.orderHistory.update({
            where: { id: existingOrder.id },
            data: {
              partnerName: customerName,
              amountTotal: body.total_amount || existingOrder.amountTotal,
              ...(resolvedOdooOrderId ? { odooOrderId: resolvedOdooOrderId } : {}),
            },
          });
        } else if (resolvedOdooOrderId) {
          savedOrder = await prisma.orderHistory.create({
            data: {
              id: randomUUID(),
              orgId,
              odooOrderId: resolvedOdooOrderId,
              orderCode: displayOrderCode,
              odooPartnerId: 17871,
              partnerName: customerName,
              amountTotal: body.total_amount || 0,
              state: 'draft',
              dateOrder: new Date(),
              note: body.note || null,
            },
          });
        }
        logger.info(`[internal-routes] Đã đồng bộ CRM thành công cho đơn [${displayOrderCode}] (Odoo ID: #${resolvedOdooOrderId || 'N/A'})`);
      } catch (crmErr: any) {
        logger.warn(`[internal-routes] Ghi nhận CRM cảnh báo: ${crmErr.message}`);
      }

      // 3. Tải file PDF từ Odoo bằng mã odoo_order_id chính thức
      let reportPdf: { buffer: Buffer; filename: string } | null = null;
      if (resolvedOdooOrderId) {
        try {
          reportPdf = await odooService.getOrderReportPdf(resolvedOdooOrderId, body.odoo_target);
          if (reportPdf) {
            logger.info(`[internal-routes] Đã tải file PDF báo giá Odoo #${resolvedOdooOrderId} (${reportPdf.filename})`);
          }
        } catch (pdfErr: any) {
          logger.warn(`[internal-routes] Chưa tải được PDF Odoo #${resolvedOdooOrderId}: ${pdfErr.message}`);
        }
      }

      // 4. Gửi tin nhắn xác nhận Zalo (sử dụng targetConversationId trực tiếp)
      const notifResult = await sendOrderNotificationToCustomer(
        orgId,
        {
          orderCode: displayOrderCode,
          customerName,
          customerPhone: body.customer_phone,
        },
        zaloMessage,
        targetConversationId
      );

      // 5. Gửi đính kèm PDF nếu có
      let pdfSent = false;
      if (reportPdf) {
        const pdfResult = await sendPdfAttachmentToCustomer(
          orgId,
          {
            orderCode: displayOrderCode,
            customerName,
            customerPhone: body.customer_phone,
          },
          reportPdf,
          targetConversationId || notifResult.conversationId
        );
        pdfSent = pdfResult.sent;
        if (savedOrder && pdfSent) {
          await prisma.orderHistory.update({
            where: { id: savedOrder.id },
            data: { pdfSentAt: new Date() },
          }).catch(() => {});
        }
      }

      // 6. Cập nhật trạng thái trong bảng orders của CRM (chuyển processing -> confirmed)
      try {
        await prisma.order.updateMany({
          where: {
            orgId,
            OR: [
              { orderCode: displayOrderCode },
              { orderCode: body.order_code },
              ...(body.web_order_code ? [{ orderCode: body.web_order_code }] : []),
              ...(targetConversationId ? [{ conversationId: targetConversationId, status: 'processing' }] : []),
            ],
          },
          data: {
            orderCode: displayOrderCode,
            status: 'confirmed',
            totalAmount: body.total_amount || undefined,
          },
        });
      } catch (orderUpdateErr: any) {
        logger.warn(`[internal-routes] Cập nhật bảng orders: ${orderUpdateErr.message}`);
      }

      // 7. Nếu không gửi được tin nhắn Zalo cho khách hàng (chưa có hội thoại Zalo):
      // Đơn hàng đã được lưu an toàn trong CRM, nhưng hành động thông báo Zalo thất bại.
      // Báo lỗi 422 để Router đưa vào Dead-Letter Queue kèm lý do cụ thể, hỗ trợ 1-Click Retry sau khi khách kết nối Zalo.
      if (!notifResult.sent) {
        const errorReason = notifResult.reason || `Chưa có hội thoại Zalo của khách hàng ${customerName}`;
        logger.warn(`[internal-routes] ⚠️ ${errorReason} cho đơn [${displayOrderCode}]. Đã lưu CRM nhưng chưa thể gửi tin Zalo.`);
        return reply.status(422).send({
          success: false,
          crm_synced: true,
          zalo_sent: false,
          pdf_sent: pdfSent,
          order_code: displayOrderCode,
          error: `Chưa gửi được tin nhắn Zalo cho khách hàng ${customerName}: ${errorReason}`,
          message: zaloMessage,
        });
      }

      return reply.send({
        success: true,
        crm_synced: true,
        zalo_sent: true,
        pdf_sent: pdfSent,
        order_code: displayOrderCode,
        message: zaloMessage,
      });
    } catch (err: any) {
      logger.error(`[internal-routes] Lỗi xử lý Zalo & CRM: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 5. TRA CỨU ĐƠN HÀNG NỘI BỘ (CHO STORE LAPET TRA THEO MÃ WEB HOẶC SO) ────
  app.get('/api/v1/internal/orders/lookup', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { code, partner_id } = request.query as { code?: string; partner_id?: string };
      if (!code || code.trim().length === 0) {
        return reply.status(400).send({ success: false, error: 'Thiếu tham số code' });
      }

      const cleanCode = code.trim();
      const orgId = await getDefaultOrgId();
      const isNumeric = /^\d+$/.test(cleanCode);

      const order = await prisma.orderHistory.findFirst({
        where: {
          orgId,
          ...(partner_id ? { odooPartnerId: Number(partner_id) } : {}),
          OR: [
            { orderCode: cleanCode },
            { note: { contains: cleanCode } },
            ...(isNumeric ? [{ odooOrderId: Number(cleanCode) }] : []),
          ],
        },
        include: {
          lines: {
            orderBy: { odooLineId: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!order) {
        return reply.status(404).send({ success: false, error: 'Không tìm thấy đơn hàng trong CRM' });
      }

      const items = (order.lines || []).map((line) => ({
        id: line.odooLineId || line.id,
        name: line.productName || 'Sản phẩm',
        qty: Number(line.quantity) || 1,
        price: Number(line.priceUnit) || 0,
        subtotal: Number(line.priceSubtotal) || 0,
      }));

      return reply.send({
        success: true,
        data: {
          id: order.orderCode,
          order_code: order.orderCode,
          raw_id: order.odooOrderId,
          amount_total: Number(order.amountTotal) || 0,
          state: order.state || 'draft',
          salesperson: order.salesperson,
          items,
        },
      });
    } catch (err: any) {
      logger.error('[internal-routes] Lỗi /api/v1/internal/orders/lookup:', err.message);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 6. LẤY LỊCH SỬ ĐƠN HÀNG THEO PARTNER_ID CHO STORE LAPET ─────────────────
  app.get('/api/v1/internal/orders/by-partner/:partnerId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { partnerId } = request.params as { partnerId: string };
      const numericPartnerId = Number(partnerId);
      if (!Number.isInteger(numericPartnerId) || numericPartnerId <= 0) {
        return reply.status(400).send({ success: false, error: 'partnerId không hợp lệ' });
      }

      const orgId = await getDefaultOrgId();
      const orders = await prisma.orderHistory.findMany({
        where: {
          orgId,
          odooPartnerId: numericPartnerId,
        },
        include: {
          lines: true,
        },
        orderBy: { dateOrder: 'desc' },
        take: 50,
      });

      const result = orders.map((ord) => ({
        id: ord.orderCode,
        raw_id: ord.odooOrderId,
        date: ord.dateOrder ? ord.dateOrder.toISOString().split('T')[0] : '',
        amount_total: Number(ord.amountTotal) || 0,
        state: ord.state || 'draft',
        items_count: ord.lines ? ord.lines.length : 0,
      }));

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      logger.error('[internal-routes] Lỗi /api/v1/internal/orders/by-partner:', err.message);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
