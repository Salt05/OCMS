import { z } from 'zod';

/**
 * Regex kiểm tra số điện thoại di động Việt Nam:
 * - Hỗ trợ đầu số 03, 05, 07, 08, 09 (10 chữ số)
 * - Hỗ trợ cả định dạng quốc tế bắt đầu bằng +84
 */
export const VN_PHONE_REGEX = /^(0|\+84)[35789][0-9]{8}$/;

/**
 * Schema kiểm duyệt từng dòng sản phẩm trong đơn hàng
 */
export const StandardOrderItemSchema = z.object({
  sku: z
    .string()
    .trim()
    .max(100, 'Mã SKU tối đa 100 ký tự')
    .optional()
    .nullable()
    .default(''),

  product_name: z
    .string()
    .trim()
    .max(255, 'Tên sản phẩm tối đa 255 ký tự')
    .optional()
    .nullable(),

  odoo_product_id: z
    .number()
    .int('ID sản phẩm Odoo phải là số nguyên')
    .positive('ID sản phẩm Odoo phải lớn hơn 0')
    .optional()
    .nullable(),

  quantity: z
    .number({ required_error: 'Số lượng sản phẩm là bắt buộc' })
    .min(1, 'Số lượng sản phẩm phải lớn hơn hoặc bằng 1'),

  price: z
    .number({ required_error: 'Đơn giá sản phẩm là bắt buộc' })
    .min(0, 'Đơn giá sản phẩm không được âm'),

  original_price: z
    .number()
    .min(0, 'Giá niêm yết không được âm')
    .optional()
    .nullable(),

  discount: z
    .number()
    .min(0, 'Chiết khấu không được âm')
    .max(100, 'Chiết khấu tối đa 100%')
    .optional()
    .default(0),
}).passthrough();

/**
 * Schema kiểm duyệt gói đơn hàng chuẩn hóa đầu vào từ Web Bán Hàng & OCMS CRM
 * Ánh xạ 1:1 theo đặc tả kỹ thuật trong docs/openapi.yaml
 */
export const StandardOrderPayloadSchema = z.object({
  order_code: z
    .string({ required_error: 'Mã đơn hàng (order_code) là bắt buộc' })
    .trim()
    .min(3, 'Mã đơn hàng phải có ít nhất 3 ký tự')
    .max(80, 'Mã đơn hàng tối đa 80 ký tự'),

  partner_id: z
    .number()
    .int('ID đối tác Odoo phải là số nguyên')
    .positive('ID đối tác Odoo phải lớn hơn 0')
    .optional()
    .nullable(),

  customer_name: z
    .string()
    .trim()
    .max(150, 'Họ tên khách hàng tối đa 150 ký tự')
    .optional()
    .nullable()
    .default('Khách hàng'),

  customer_phone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .default(''),

  customer_email: z
    .string()
    .trim()
    .email('Địa chỉ email không đúng định dạng')
    .optional()
    .nullable(),

  company_name: z
    .string()
    .trim()
    .max(200, 'Tên công ty tối đa 200 ký tự')
    .optional()
    .nullable(),

  vat_number: z
    .string()
    .trim()
    .max(50, 'Mã số thuế tối đa 50 ký tự')
    .optional()
    .nullable(),

  shipping_address: z
    .string()
    .trim()
    .max(500, 'Địa chỉ giao hàng tối đa 500 ký tự')
    .optional()
    .nullable()
    .default('Giao tại cửa hàng / Chưa cập nhật'),

  items: z
    .array(StandardOrderItemSchema, { required_error: 'Danh sách sản phẩm (items) là bắt buộc' })
    .min(1, 'Đơn hàng phải có ít nhất 1 sản phẩm'),

  subtotal_amount: z
    .number()
    .min(0, 'Tổng tiền trước giảm giá không được âm')
    .optional()
    .nullable(),

  discount_amount: z
    .number()
    .min(0, 'Số tiền giảm giá không được âm')
    .optional()
    .default(0),

  shipping_fee: z
    .number()
    .min(0, 'Phí vận chuyển không được âm')
    .optional()
    .default(0),

  total_amount: z
    .number({ required_error: 'Tổng tiền thanh toán là bắt buộc' })
    .min(0, 'Tổng tiền thanh toán không được âm'),

  voucher_code: z
    .string()
    .trim()
    .max(50, 'Mã voucher tối đa 50 ký tự')
    .optional()
    .nullable(),

  payment_method: z
    .string()
    .optional()
    .default('cod'),

  note: z
    .string()
    .trim()
    .max(1000, 'Ghi chú tối đa 1000 ký tự')
    .optional()
    .nullable(),

  user_id: z
    .number()
    .int()
    .optional()
    .nullable(),

  validity_date: z
    .string()
    .optional()
    .nullable(),

  payment_term_id: z
    .number()
    .int()
    .optional()
    .nullable(),

  contactId: z
    .string()
    .optional()
    .nullable(),

  conversationId: z
    .string()
    .optional()
    .nullable(),

  source: z
    .string()
    .optional()
    .default('zalo_chat'),

  metadata: z
    .record(z.any())
    .optional()
    .nullable(),
}).passthrough();

export type StandardOrderPayload = z.infer<typeof StandardOrderPayloadSchema>;
export type StandardOrderItem = z.infer<typeof StandardOrderItemSchema>;

/**
 * Helper format lỗi từ Zod thành danh sách chi tiết theo chuẩn OpenAPI:
 * details: [{ field: "customer_phone", message: "..." }]
 */
export function formatZodErrors(error: z.ZodError): Array<{ field: string; message: string }> {
  return error.errors.map((err) => ({
    field: err.path.join('.') || 'body',
    message: err.message,
  }));
}
