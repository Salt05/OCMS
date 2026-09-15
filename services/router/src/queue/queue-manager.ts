import { Queue, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config.js';
import { routingRegistry } from '../registry/routing-registry.js';
import { routerLogger } from '../logger/router-logger.js';

// Khởi tạo Redis Connection
export const redisConnection = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null, // Bắt buộc đối với BullMQ
  retryStrategy(times: number) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
});

redisConnection.on('connect', () => {
  console.log(`[QueueManager] Connected to Redis at ${config.redis.host}:${config.redis.port}`);
  routerLogger.add({
    level: 'INFO',
    service: 'REDIS',
    message: `Kết nối Redis thành công tại ${config.redis.host}:${config.redis.port}`,
    event: 'redis.connected',
  });
});

redisConnection.on('error', (err: Error) => {
  console.error('[QueueManager] Redis connection error:', err.message);
  routerLogger.add({
    level: 'ERROR',
    service: 'REDIS',
    message: `Lỗi kết nối Redis: ${err.message}`,
    event: 'redis.error',
  });
});

// Map các hàng đợi BullMQ (2 Trụ Cột: ERP Odoo & CRM OCMS kiêm Zalo)
export const queues: Record<string, Queue> = {
  queue_odoo: new Queue('queue_odoo', {
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
    },
  }),
  queue_ocms: new Queue('queue_ocms', {
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  }),
};

export interface DispatchedJobInfo {
  target_id: string;
  target_name: string;
  target_system: string;
  queue: string;
  action: string;
  job_id: string | undefined;
}

/**
 * Điều phối sự kiện sang các hàng đợi dựa trên Danh Bạ Phân Luồng (Routing Registry)
 */
export async function dispatchEvent(
  eventId: string,
  eventData: {
    event_id: string;
    event_type: string;
    timestamp: string;
    data: any;
  }
): Promise<{ dispatched: DispatchedJobInfo[]; skipped: string[] }> {
  const activeTargets = routingRegistry.getActiveTargets(eventId);
  const allTargets = routingRegistry.getRules().events[eventId]?.targets || [];

  const dispatched: DispatchedJobInfo[] = [];
  const skipped: string[] = [];

  for (const target of allTargets) {
    if (!target.enabled) {
      skipped.push(`${target.name} (${target.target_system}) - Đã bị TẮT trong Danh bạ`);
      continue;
    }

    const queue = queues[target.queue];
    if (!queue) {
      console.warn(`[QueueManager] Queue ${target.queue} not found for target ${target.id}`);
      skipped.push(`${target.name} - Không tìm thấy hàng đợi ${target.queue}`);
      continue;
    }

    try {
      const job = await queue.add(
        target.action,
        {
          target_id: target.id,
          action: target.action,
          payload: eventData,
        },
        {
          attempts: target.retry_attempts || 3,
          jobId: `${eventData.event_id}-${target.target_system}`,
        }
      );

      dispatched.push({
        target_id: target.id,
        target_name: target.name,
        target_system: target.target_system,
        queue: target.queue,
        action: target.action,
        job_id: job.id,
      });

      routerLogger.add({
        level: 'INFO',
        service: 'ROUTER',
        queue: target.queue,
        event: eventId,
        order_id: eventData.data?.order_code,
        message: `Điều phối sự kiện [${eventId}] sang hàng đợi [${target.queue}] (Job #${job.id})`,
      });
    } catch (err: any) {
      console.error(`[QueueManager] Failed to dispatch job to ${target.queue}:`, err.message);
      skipped.push(`${target.name} - Lỗi: ${err.message}`);
      routerLogger.add({
        level: 'ERROR',
        service: 'ROUTER',
        queue: target.queue,
        event: eventId,
        order_id: eventData.data?.order_code,
        message: `Lỗi điều phối sự kiện [${eventId}] vào hàng đợi [${target.queue}]: ${err.message}`,
      });
    }
  }

  return { dispatched, skipped };
}

/**
 * Thu thập số liệu thống kê realtime của các Hàng Đợi
 */
export async function getQueueMetrics() {
  const metrics: Record<string, any> = {};

  for (const [queueName, queue] of Object.entries(queues)) {
    try {
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
      metrics[queueName] = {
        name: queueName,
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
      };
    } catch (err: any) {
      metrics[queueName] = {
        name: queueName,
        error: err.message,
      };
    }
  }

  return metrics;
}

export interface FailedJobDetail {
  job_id: string;
  queue_name: string;
  action: string;
  order_code?: string;
  failed_reason: string;
  attempts_made: number;
  max_attempts: number;
  timestamp: number;
  failed_at?: string;
}

/**
 * Lấy danh sách các đơn lỗi trong Dead-Letter Queue (Failed Jobs)
 */
export async function getFailedJobs(): Promise<FailedJobDetail[]> {
  const failedJobs: FailedJobDetail[] = [];

  for (const [queueName, queue] of Object.entries(queues)) {
    try {
      const jobs = await queue.getFailed(0, 50);
      for (const job of jobs) {
        const payloadData = job.data?.payload?.data || job.data?.payload || {};
        failedJobs.push({
          job_id: String(job.id),
          queue_name: queueName,
          action: job.name,
          order_code: payloadData.order_code || 'N/A',
          failed_reason: job.failedReason || 'Lỗi không xác định',
          attempts_made: job.attemptsMade,
          max_attempts: job.opts.attempts || 3,
          timestamp: job.timestamp,
          failed_at: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined,
        });
      }
    } catch (err: any) {
      console.error(`[QueueManager] Lỗi lấy danh sách failed jobs từ ${queueName}:`, err.message);
    }
  }

  return failedJobs.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Thử lại một đơn hàng trong hàng đợi đơn lỗi (1-Click Retry)
 */
export async function retryFailedJob(queueName: string, jobId: string): Promise<boolean> {
  const queue = queues[queueName];
  if (!queue) return false;

  const job = await queue.getJob(jobId);
  if (!job) return false;

  await job.retry();
  console.log(`[QueueManager] Đã kích hoạt Retry cho Job #${jobId} trong hàng đợi ${queueName}`);

  routerLogger.add({
    level: 'INFO',
    service: queueName.includes('odoo') ? 'ODOO' : 'OCMS',
    queue: queueName,
    order_id: job.data?.payload?.data?.order_code,
    message: `Kích hoạt 1-Click Retry cho Job #${jobId} trên hàng đợi ${queueName}`,
    event: 'queue.retry',
  });

  return true;
}

/**
 * Xóa bỏ một đơn hàng lỗi khỏi hàng đợi
 */
export async function removeFailedJob(queueName: string, jobId: string): Promise<boolean> {
  const queue = queues[queueName];
  if (!queue) return false;

  const job = await queue.getJob(jobId);
  if (!job) return false;

  await job.remove();
  console.log(`[QueueManager] Đã xóa Job #${jobId} khỏi hàng đợi ${queueName}`);

  routerLogger.add({
    level: 'WARN',
    service: 'ROUTER',
    queue: queueName,
    order_id: job.data?.payload?.data?.order_code,
    message: `Đã xóa Job #${jobId} khỏi hàng đợi lỗi ${queueName}`,
    event: 'queue.remove_failed',
  });

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA ACCESS LAYER CHO OPERATIONS DASHBOARD (ĐƠN HÀNG, KPI, TIMELINE)
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderTimelineItem {
  step: number;
  time: string;
  title: string;
  description: string;
  status: 'completed' | 'processing' | 'failed' | 'waiting';
  node: string;
}

export interface OrderItemLine {
  sku: string;
  product_name?: string;
  odoo_product_id?: number | null;
  quantity: number;
  price: number;
  discount?: number;
}

export interface OrderSummary {
  order_code: string;
  tracking_id?: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  amount: number;
  payment_method: string;
  source: string;
  created_at: string;
  odoo_status: string;
  odoo_order_id: number | string | null;
  ocms_status: string;
  zalo_sent: boolean;
  pdf_sent: boolean;
  status: 'SUCCESS' | 'PROCESSING' | 'RETRYING' | 'FAILED' | 'CANCELLED';
  processing_time_ms: number;
  items_count: number;
  salesperson?: string;
  error_reason?: string;
}

export interface OrderDetail extends OrderSummary {
  items: OrderItemLine[];
  note?: string;
  timeline: OrderTimelineItem[];
  odoo_job_id?: string;
  ocms_job_id?: string;
}

export interface ExecutiveKpi {
  orders_today: number;
  successful: number;
  processing: number;
  retrying: number;
  failed: number;
  success_rate: string;
  avg_processing_time_s: string;
  hourly_distribution: Array<{
    hour: string;
    created: number;
    completed: number;
    failed: number;
  }>;
}

let historySeeded = false;

/**
 * Đọc tất cả đơn hàng từ BullMQ jobs và kết nối thành danh sách thống nhất
 */
export async function getAllOrders(filter: {
  search?: string;
  status?: string;
  source?: string;
  page?: number;
  limit?: number;
}): Promise<{
  kpi: ExecutiveKpi;
  total: number;
  page: number;
  limit: number;
  orders: OrderSummary[];
}> {
  const odooQueue = queues.queue_odoo;
  const ocmsQueue = queues.queue_ocms;

  // Lấy danh sách jobs từ cả 2 hàng đợi
  const [odooJobs, ocmsJobs] = await Promise.all([
    odooQueue ? odooQueue.getJobs(['completed', 'failed', 'active', 'waiting', 'delayed'], 0, 500, false) : [],
    ocmsQueue ? ocmsQueue.getJobs(['completed', 'failed', 'active', 'waiting', 'delayed'], 0, 500, false) : [],
  ]);

  // Seed history log nếu chưa seed
  if (!historySeeded && (odooJobs.length > 0 || ocmsJobs.length > 0)) {
    seedHistoryLogs(odooJobs, ocmsJobs);
    historySeeded = true;
  }

  // Lập bản đồ cho queue_ocms theo order_code
  const ocmsMap = new Map<string, Job>();
  for (const job of ocmsJobs) {
    const payload = job.data?.payload?.data || job.data?.payload || {};
    const code = payload.order_code || payload.web_order_code;
    if (code) {
      ocmsMap.set(code, job);
    }
  }

  // Nhóm theo order_code
  const ordersMap = new Map<string, OrderSummary>();

  for (const job of odooJobs) {
    const payload = job.data?.payload?.data || job.data?.payload || {};
    const code = payload.order_code;
    if (!code) continue;

    const odooReturn = job.returnvalue || {};
    const ocmsJob = ocmsMap.get(code);
    const ocmsReturn = ocmsJob?.returnvalue || {};

    const isOdooFailed = Boolean(job.failedReason) || job.finishedOn && !odooReturn.success && odooReturn.success !== undefined;
    const isOcmsFailed = ocmsJob ? Boolean(ocmsJob.failedReason) : false;
    const isOdooActive = !job.finishedOn && Boolean(job.processedOn);
    const isOcmsActive = ocmsJob && !ocmsJob.finishedOn && Boolean(ocmsJob.processedOn);
    const isWaiting = !job.processedOn && !job.finishedOn;

    let overallStatus: OrderSummary['status'] = 'SUCCESS';
    if (isOdooFailed || isOcmsFailed) {
      overallStatus = 'FAILED';
    } else if (isOdooActive || isOcmsActive || isWaiting) {
      overallStatus = 'PROCESSING';
    } else if (job.attemptsMade > 1) {
      overallStatus = 'RETRYING';
    }

    const durationMs = job.finishedOn && job.processedOn
      ? job.finishedOn - job.processedOn
      : (job.finishedOn ? job.finishedOn - job.timestamp : (Date.now() - job.timestamp));

    const summary: OrderSummary = {
      order_code: code,
      tracking_id: job.data?.payload?.event_id,
      customer_name: payload.customer_name || 'Khách hàng',
      customer_phone: payload.customer_phone || 'N/A',
      shipping_address: payload.shipping_address || 'N/A',
      amount: Number(payload.total_amount || 0),
      payment_method: payload.payment_method || 'cod',
      source: payload.source || 'store_lapet',
      created_at: payload.timestamp || new Date(job.timestamp).toISOString(),
      odoo_status: isOdooFailed ? 'failed' : (job.finishedOn ? 'completed' : (job.processedOn ? 'active' : 'waiting')),
      odoo_order_id: odooReturn.odoo_order_id || null,
      ocms_status: ocmsJob ? (isOcmsFailed ? 'failed' : (ocmsJob.finishedOn ? 'completed' : 'active')) : 'waiting',
      zalo_sent: Boolean(ocmsReturn.zalo_sent),
      pdf_sent: Boolean(ocmsReturn.pdf_sent),
      status: overallStatus,
      processing_time_ms: Math.max(durationMs, 100),
      items_count: Array.isArray(payload.items) ? payload.items.length : 1,
      salesperson: payload.salesperson || odooReturn.salesperson,
      error_reason: job.failedReason || ocmsJob?.failedReason || undefined,
    };

    ordersMap.set(code, summary);
  }

  // Bổ sung các đơn trong queue_ocms nếu queue_odoo chưa có
  for (const [code, job] of ocmsMap.entries()) {
    if (!ordersMap.has(code)) {
      const payload = job.data?.payload?.data || job.data?.payload || {};
      const ocmsReturn = job.returnvalue || {};
      const isFailed = Boolean(job.failedReason);
      const isFinished = Boolean(job.finishedOn);

      ordersMap.set(code, {
        order_code: code,
        tracking_id: job.data?.payload?.event_id,
        customer_name: payload.customer_name || 'Khách hàng',
        customer_phone: payload.customer_phone || 'N/A',
        shipping_address: payload.shipping_address || 'N/A',
        amount: Number(payload.total_amount || 0),
        payment_method: payload.payment_method || 'cod',
        source: payload.source || 'zalo_chat',
        created_at: payload.timestamp || new Date(job.timestamp).toISOString(),
        odoo_status: 'completed',
        odoo_order_id: payload.odoo_order_id || null,
        ocms_status: isFailed ? 'failed' : (isFinished ? 'completed' : 'active'),
        zalo_sent: Boolean(ocmsReturn.zalo_sent),
        pdf_sent: Boolean(ocmsReturn.pdf_sent),
        status: isFailed ? 'FAILED' : (isFinished ? 'SUCCESS' : 'PROCESSING'),
        processing_time_ms: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 1200,
        items_count: Array.isArray(payload.items) ? payload.items.length : 1,
        salesperson: payload.salesperson,
        error_reason: job.failedReason,
      });
    }
  }

  const allOrdersList = Array.from(ordersMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Tính toán KPI
  let successCount = 0;
  let processingCount = 0;
  let retryingCount = 0;
  let failedCount = 0;
  let totalDurationMs = 0;
  let durationSamples = 0;

  // Khởi tạo bảng phân bổ theo giờ (24 giờ)
  const hourlyMap: Record<number, { created: number; completed: number; failed: number }> = {};
  for (let i = 0; i < 24; i++) {
    hourlyMap[i] = { created: 0, completed: 0, failed: 0 };
  }

  for (const o of allOrdersList) {
    if (o.status === 'SUCCESS') successCount++;
    else if (o.status === 'PROCESSING') processingCount++;
    else if (o.status === 'RETRYING') retryingCount++;
    else if (o.status === 'FAILED') failedCount++;

    if (o.processing_time_ms > 0 && o.status === 'SUCCESS') {
      totalDurationMs += o.processing_time_ms;
      durationSamples++;
    }

    const orderHour = new Date(o.created_at).getHours();
    if (hourlyMap[orderHour]) {
      hourlyMap[orderHour].created++;
      if (o.status === 'SUCCESS') hourlyMap[orderHour].completed++;
      if (o.status === 'FAILED') hourlyMap[orderHour].failed++;
    }
  }

  const totalOrders = allOrdersList.length;
  const successRate = totalOrders > 0
    ? ((successCount / totalOrders) * 100).toFixed(1)
    : '100.0';
  const avgProcessingTimeS = durationSamples > 0
    ? (totalDurationMs / durationSamples / 1000).toFixed(1)
    : '1.2';

  const hourly_distribution = Object.entries(hourlyMap).map(([hour, stats]) => ({
    hour: `${String(hour).padStart(2, '0')}:00`,
    created: stats.created,
    completed: stats.completed,
    failed: stats.failed,
  }));

  const kpi: ExecutiveKpi = {
    orders_today: totalOrders,
    successful: successCount,
    processing: processingCount,
    retrying: retryingCount,
    failed: failedCount,
    success_rate: `${successRate}%`,
    avg_processing_time_s: `${avgProcessingTimeS}s`,
    hourly_distribution,
  };

  // Lọc theo điều kiện
  let filtered = [...allOrdersList];

  if (filter.status && filter.status !== 'ALL') {
    filtered = filtered.filter(o => o.status === filter.status);
  }

  if (filter.source && filter.source !== 'ALL') {
    filtered = filtered.filter(o => o.source === filter.source);
  }

  if (filter.search && filter.search.trim()) {
    const q = filter.search.trim().toLowerCase();
    filtered = filtered.filter(
      o =>
        o.order_code.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_phone.includes(q) ||
        (o.odoo_order_id && String(o.odoo_order_id).includes(q))
    );
  }

  const page = Math.max(Number(filter.page) || 1, 1);
  const limit = Math.max(Number(filter.limit) || 20, 5);
  const offset = (page - 1) * limit;
  const paginatedOrders = filtered.slice(offset, offset + limit);

  return {
    kpi,
    total: filtered.length,
    page,
    limit,
    orders: paginatedOrders,
  };
}

/**
 * Lấy chi tiết đơn hàng cùng timeline phục vụ Order Detail Drawer
 */
export async function getOrderDetail(orderCode: string): Promise<OrderDetail | null> {
  const odooQueue = queues.queue_odoo;
  const ocmsQueue = queues.queue_ocms;

  const [odooJobs, ocmsJobs] = await Promise.all([
    odooQueue ? odooQueue.getJobs(['completed', 'failed', 'active', 'waiting', 'delayed'], 0, 500, false) : [],
    ocmsQueue ? ocmsQueue.getJobs(['completed', 'failed', 'active', 'waiting', 'delayed'], 0, 500, false) : [],
  ]);

  let odooJob = odooJobs.find(j => {
    const p = j.data?.payload?.data || j.data?.payload || {};
    return p.order_code === orderCode;
  });

  let ocmsJob = ocmsJobs.find(j => {
    const p = j.data?.payload?.data || j.data?.payload || {};
    return p.order_code === orderCode || p.web_order_code === orderCode;
  });

  if (!odooJob && !ocmsJob) {
    return null;
  }

  const primaryJob = odooJob || ocmsJob!;
  const payload = primaryJob.data?.payload?.data || primaryJob.data?.payload || {};
  const odooReturn = odooJob?.returnvalue || {};
  const ocmsReturn = ocmsJob?.returnvalue || {};

  const createdAt = payload.timestamp || new Date(primaryJob.timestamp).toISOString();
  const createdDate = new Date(createdAt);

  const timeline: OrderTimelineItem[] = [];

  // Step 1: Order received
  timeline.push({
    step: 1,
    time: createdDate.toLocaleTimeString('vi-VN'),
    title: 'Tiếp nhận đơn hàng',
    description: `Router tiếp nhận đơn [${orderCode}] từ nguồn [${payload.source || 'Web Store LaPet'}] (${payload.customer_name || 'Khách'})`,
    status: 'completed',
    node: 'Store / Router',
  });

  // Step 2: Router dispatched
  const dispatchedTime = new Date(createdDate.getTime() + 200).toLocaleTimeString('vi-VN');
  timeline.push({
    step: 2,
    time: dispatchedTime,
    title: 'Phân luồng định tuyến (Routing Dispatch)',
    description: 'Thẩm định Zod Schema hợp lệ -> Đẩy job vào hàng đợi queue_odoo và chuẩn bị luồng đồng bộ',
    status: 'completed',
    node: 'Router Engine',
  });

  // Step 3: Odoo ERP processed
  if (odooJob) {
    const odooTime = odooJob.finishedOn
      ? new Date(odooJob.finishedOn).toLocaleTimeString('vi-VN')
      : new Date(createdDate.getTime() + 600).toLocaleTimeString('vi-VN');

    if (odooJob.failedReason) {
      timeline.push({
        step: 3,
        time: odooTime,
        title: 'Đồng bộ Odoo ERP thất bại',
        description: `Lỗi kết nối hoặc xử lý Odoo: ${odooJob.failedReason}`,
        status: 'failed',
        node: 'Odoo ERP Worker',
      });
    } else if (odooJob.finishedOn) {
      timeline.push({
        step: 3,
        time: odooTime,
        title: 'Tạo đơn bán Odoo thành công',
        description: `Đã tạo Báo giá/Sale Order #${odooReturn.odoo_order_id || 'Thành công'} trên máy chủ Odoo ERP (${odooReturn.order_code || orderCode})`,
        status: 'completed',
        node: 'Odoo ERP Worker',
      });
    } else {
      timeline.push({
        step: 3,
        time: odooTime,
        title: 'Đang xử lý tạo đơn Odoo...',
        description: 'Worker đang gửi yêu cầu XML-RPC tạo báo giá sang Odoo ERP',
        status: 'processing',
        node: 'Odoo ERP Worker',
      });
    }
  }

  // Step 4: OCMS CRM synced
  const ocmsTime = ocmsJob?.finishedOn
    ? new Date(ocmsJob.finishedOn).toLocaleTimeString('vi-VN')
    : new Date(createdDate.getTime() + 1000).toLocaleTimeString('vi-VN');

  if (ocmsJob?.failedReason) {
    timeline.push({
      step: 4,
      time: ocmsTime,
      title: 'Đồng bộ OCMS / Zalo thất bại',
      description: ocmsJob.failedReason,
      status: 'failed',
      node: 'OCMS Worker',
    });
  } else if (ocmsJob?.finishedOn) {
    timeline.push({
      step: 4,
      time: ocmsTime,
      title: 'Ghi nhận CRM & Kích hoạt thông báo',
      description: `Đã cập nhật dữ liệu khách hàng vào CRM OCMS (Hội thoại Zalo & Số ĐT: ${payload.customer_phone || 'N/A'})`,
      status: 'completed',
      node: 'OCMS Core',
    });

    // Step 5: Zalo notification sent
    timeline.push({
      step: 5,
      time: ocmsTime,
      title: 'Gửi thông báo Zalo OA',
      description: ocmsReturn.zalo_sent
        ? `Đã bắn tin nhắn Zalo kèm hóa đơn PDF tới ${payload.customer_phone || 'khách hàng'}`
        : 'Chưa gửi Zalo OA do chưa có liên kết hội thoại Zalo trước đó',
      status: ocmsReturn.zalo_sent ? 'completed' : 'waiting',
      node: 'Zalo OA Gateway',
    });
  } else if (odooJob?.finishedOn && !odooJob.failedReason) {
    timeline.push({
      step: 4,
      time: ocmsTime,
      title: 'Đang chuẩn bị gửi Zalo OA & CRM',
      description: 'Đang chờ worker queue_ocms tiếp nhận và xử lý hóa đơn PDF',
      status: 'waiting',
      node: 'OCMS Core',
    });
  }

  // Step 6: Final completion
  const isAllDone = odooJob?.finishedOn && !odooJob.failedReason && (!ocmsJob || (ocmsJob.finishedOn && !ocmsJob.failedReason));
  const isFailed = Boolean(odooJob?.failedReason || ocmsJob?.failedReason);

  timeline.push({
    step: 6,
    time: isAllDone ? timeline[timeline.length - 1].time : '---',
    title: isAllDone ? 'Quy trình hoàn tất thành công' : (isFailed ? 'Quy trình gặp sự cố (Cần xử lý)' : 'Đang xử lý phân luồng'),
    description: isAllDone
      ? 'Đơn hàng đã lưu an toàn trên Odoo, OCMS và gửi thông tin xác nhận tới khách hàng.'
      : (isFailed ? 'Đơn hàng đang nằm trong Dead-Letter Queue để quản trị viên kiểm tra.' : 'Hệ thống đang tiếp tục luồng tự động.'),
    status: isAllDone ? 'completed' : (isFailed ? 'failed' : 'processing'),
    node: 'Universal Router',
  });

  const durationMs = odooJob?.finishedOn && odooJob?.processedOn
    ? odooJob.finishedOn - odooJob.processedOn
    : 1200;

  return {
    order_code: orderCode,
    tracking_id: primaryJob.data?.payload?.event_id,
    customer_name: payload.customer_name || 'Khách hàng',
    customer_phone: payload.customer_phone || 'N/A',
    shipping_address: payload.shipping_address || 'N/A',
    amount: Number(payload.total_amount || 0),
    payment_method: payload.payment_method || 'cod',
    source: payload.source || 'store_lapet',
    created_at: createdAt,
    odoo_status: odooJob?.failedReason ? 'failed' : (odooJob?.finishedOn ? 'completed' : 'active'),
    odoo_order_id: odooReturn.odoo_order_id || null,
    ocms_status: ocmsJob?.failedReason ? 'failed' : (ocmsJob?.finishedOn ? 'completed' : 'waiting'),
    zalo_sent: Boolean(ocmsReturn.zalo_sent),
    pdf_sent: Boolean(ocmsReturn.pdf_sent),
    status: isFailed ? 'FAILED' : (isAllDone ? 'SUCCESS' : 'PROCESSING'),
    processing_time_ms: durationMs,
    items_count: Array.isArray(payload.items) ? payload.items.length : 1,
    salesperson: payload.salesperson || odooReturn.salesperson,
    items: Array.isArray(payload.items) ? payload.items : [],
    note: payload.note,
    timeline,
    odoo_job_id: odooJob?.id ? String(odooJob.id) : undefined,
    ocms_job_id: ocmsJob?.id ? String(ocmsJob.id) : undefined,
    error_reason: odooJob?.failedReason || ocmsJob?.failedReason,
  };
}

/**
 * Tự động trích xuất các đơn hiện có để nạp vào routerLogger
 */
function seedHistoryLogs(odooJobs: Job[], ocmsJobs: Job[]) {
  // Lấy tối đa 30 jobs gần nhất
  const sample = odooJobs.slice(0, 30);
  for (const job of sample) {
    const payload = job.data?.payload?.data || {};
    const code = payload.order_code || 'N/A';
    const timestamp = job.finishedOn ? new Date(job.finishedOn).toISOString() : new Date(job.timestamp).toISOString();

    if (job.failedReason) {
      routerLogger.add({
        level: 'ERROR',
        service: 'ODOO',
        queue: 'queue_odoo',
        order_id: code,
        message: `Đơn [${code}] lỗi trên queue_odoo: ${job.failedReason}`,
        timestamp,
      });
    } else if (job.finishedOn) {
      const odooId = job.returnvalue?.odoo_order_id;
      routerLogger.add({
        level: 'SUCCESS',
        service: 'ODOO',
        queue: 'queue_odoo',
        order_id: code,
        message: `Đơn [${code}] đã tạo báo giá Odoo thành công${odooId ? ` (Odoo #${odooId})` : ''}`,
        timestamp,
      });
    }
  }

  // Tương tự cho ocmsJobs
  const sampleOcms = ocmsJobs.slice(0, 20);
  for (const job of sampleOcms) {
    const payload = job.data?.payload?.data || {};
    const code = payload.order_code || payload.web_order_code || 'N/A';
    const timestamp = job.finishedOn ? new Date(job.finishedOn).toISOString() : new Date(job.timestamp).toISOString();

    if (job.failedReason) {
      routerLogger.add({
        level: 'WARN',
        service: 'OCMS',
        queue: 'queue_ocms',
        order_id: code,
        message: `Đơn [${code}] chưa thể gửi Zalo OA: ${job.failedReason}`,
        timestamp,
      });
    } else if (job.finishedOn) {
      routerLogger.add({
        level: 'SUCCESS',
        service: 'OCMS',
        queue: 'queue_ocms',
        order_id: code,
        message: `Đơn [${code}] đã đồng bộ CRM và gửi thông báo Zalo thành công`,
        timestamp,
      });
    }
  }
}

export interface ResetQueuesResult {
  success: boolean;
  message: string;
  cleared_queues: string[];
  legacy_keys_removed: number;
  configs_preserved: {
    active_odoo_target: string;
    systems_count: number;
    routing_events_count: number;
  };
  timestamp: string;
}

/**
 * Reset sạch sẽ toàn bộ hàng đợi và lịch sử đơn hàng (BullMQ + Redis)
 * ĐẢM BẢO GIỮ NGUYÊN 100% CẤU HÌNH HỆ THỐNG (Routing rules, Odoo config, systems registry)
 */
export async function resetOrderQueues(options: { clearLogs?: boolean } = { clearLogs: true }): Promise<ResetQueuesResult> {
  const clearedQueues: string[] = [];

  // 1. Làm sạch các hàng đợi chính thức được quản lý trong queues
  for (const [queueName, queue] of Object.entries(queues)) {
    try {
      // Drain các jobs đang chờ hoặc delayed
      await queue.drain(true).catch(() => {});

      // Clean các trạng thái job
      await Promise.allSettled([
        queue.clean(0, 100000, 'completed'),
        queue.clean(0, 100000, 'failed'),
        queue.clean(0, 100000, 'wait'),
        queue.clean(0, 100000, 'active'),
        queue.clean(0, 100000, 'delayed'),
        queue.clean(0, 100000, 'paused'),
      ]);

      // Obliterate để dọn sạch toàn bộ metadata và keys của hàng đợi
      await queue.obliterate({ force: true }).catch(err => {
        console.warn(`[QueueManager] Lưu ý khi obliterate ${queueName}:`, err.message);
      });

      clearedQueues.push(queueName);
      console.log(`[QueueManager] Đã dọn sạch hàng đợi: ${queueName}`);
    } catch (err: any) {
      console.error(`[QueueManager] Lỗi khi dọn hàng đợi ${queueName}:`, err.message);
    }
  }

  // 2. Dọn các keys BullMQ tàn dư / legacy (ví dụ queue_zalo cũ hoặc các keys bull:* khác)
  let legacyKeysRemoved = 0;
  try {
    if (redisConnection && redisConnection.status === 'ready') {
      const bullKeys = await redisConnection.keys('bull:*');
      if (bullKeys && bullKeys.length > 0) {
        legacyKeysRemoved = await redisConnection.del(...bullKeys);
        console.log(`[QueueManager] Đã dọn ${legacyKeysRemoved} Redis bull keys tàn dư`);
      }
    }
  } catch (err: any) {
    console.warn(`[QueueManager] Không thể quét dọn bull keys tàn dư:`, err.message);
  }

  // 3. Đặt lại cờ seed lịch sử
  historySeeded = false;

  // 4. Dọn log đơn hàng gần đây nếu được yêu cầu
  if (options.clearLogs !== false) {
    routerLogger.clearLogs();
  }

  // 5. Ghi log kiểm toán thao tác reset
  routerLogger.add({
    level: 'INFO',
    service: 'ROUTER',
    message: 'Toàn bộ hàng đợi và lịch sử đơn hàng đã được reset (Cấu hình danh bạ được giữ nguyên)',
    event: 'queue.reset',
  });

  // 6. Đọc cấu hình hiện tại để kiểm chứng tính toàn vẹn
  const systems = routingRegistry.getSystems();
  const rules = routingRegistry.getRules();
  const activeOdoo = routingRegistry.getActiveOdooConfig();

  return {
    success: true,
    message: 'Đã reset sạch sẽ toàn bộ hàng đợi và lịch sử đơn hàng (giữ nguyên cấu hình hệ thống)',
    cleared_queues: clearedQueues,
    legacy_keys_removed: legacyKeysRemoved,
    configs_preserved: {
      active_odoo_target: activeOdoo?.name || routingRegistry.getSystems().active_odoo_target,
      systems_count: Object.keys(systems.systems || {}).length,
      routing_events_count: Object.keys(rules.events || {}).length,
    },
    timestamp: new Date().toISOString(),
  };
}

