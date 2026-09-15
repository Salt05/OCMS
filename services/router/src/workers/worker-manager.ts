import { odooWorkerService } from './odoo-worker.js';
import { ocmsWorkerService } from './ocms-worker.js';

export class WorkerManager {
  private started = false;

  async init(): Promise<void> {
    if (this.started) return;

    console.log('\n🔧 [WorkerManager] Đang khởi chạy các Workers xử lý bất đồng bộ...');
    odooWorkerService.start();
    ocmsWorkerService.start();
    this.started = true;
    console.log('✨ [WorkerManager] Tất cả Workers (Odoo & OCMS) đã sẵn sàng phục vụ!\n');
  }

  async stopAll(): Promise<void> {
    console.log('[WorkerManager] Đang dừng tất cả Workers...');
    await Promise.all([
      odooWorkerService.stop(),
      ocmsWorkerService.stop(),
    ]);
    this.started = false;
  }

  async getStatus(): Promise<{
    odoo_worker: {
      name: string;
      running: boolean;
      odoo_server_status: { healthy: boolean; status?: number; error?: string };
    };
    ocms_worker: {
      name: string;
      running: boolean;
    };
  }> {
    const odooHealth = await odooWorkerService.checkOdooHealth();

    return {
      odoo_worker: {
        name: 'Odoo ERP Sync Worker',
        running: odooWorkerService.isRunning(),
        odoo_server_status: odooHealth,
      },
      ocms_worker: {
        name: 'OCMS Core (CRM & Zalo) Worker',
        running: ocmsWorkerService.isRunning(),
      },
    };
  }
}

export const workerManager = new WorkerManager();

