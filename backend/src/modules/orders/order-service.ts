import { prisma } from '../../shared/database/prisma-client.js';
import { InventoryService } from '../inventory/inventory-service.js';
import { logger } from '../../shared/utils/logger.js';

export class OrderDomainService {
  private inventoryService: InventoryService;

  constructor() {
    this.inventoryService = new InventoryService();
  }

  /**
   * Handle stock reservation when order is confirmed
   */
  async handleOrderConfirmed(orgId: string, orderId: string, orderCode: string, lines: { id: string, sku: string, quantity: number }[], userId?: string) {
    try {
      await this.inventoryService.reserveStock(orgId, orderId, orderCode, lines, userId);
      logger.info(`[OrderDomainService] Reserved stock for order ${orderCode}`);
    } catch (err: any) {
      logger.error(`[OrderDomainService] Error reserving stock for order ${orderCode}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle stock release when order is cancelled
   */
  async handleOrderCancelled(orgId: string, orderId: string, lines: { id: string, sku: string }[]) {
    try {
      await this.inventoryService.releaseReservedStock(orgId, orderId, lines);
      logger.info(`[OrderDomainService] Released reserved stock for cancelled order ${orderId}`);
    } catch (err: any) {
      logger.error(`[OrderDomainService] Error releasing stock for order ${orderId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle stock shipping (actual deduction) when order is shipped
   */
  async handleOrderShipped(orgId: string, orderId: string, orderCode: string, lines: { id: string, sku: string, quantity: number }[], userId?: string) {
    try {
      await this.inventoryService.shipStock(orgId, orderId, orderCode, lines, userId);
      logger.info(`[OrderDomainService] Shipped stock for order ${orderCode}`);
    } catch (err: any) {
      logger.error(`[OrderDomainService] Error shipping stock for order ${orderCode}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle stock return when items are returned
   */
  async handleOrderReturned(orgId: string, orderId: string, orderCode: string, lines: { id: string, sku: string, quantity: number }[], userId?: string) {
    try {
      await this.inventoryService.returnStock(orgId, orderId, orderCode, lines, userId);
      logger.info(`[OrderDomainService] Returned stock for order ${orderCode}`);
    } catch (err: any) {
      logger.error(`[OrderDomainService] Error returning stock for order ${orderCode}: ${err.message}`);
      throw err;
    }
  }
}

export const orderDomainService = new OrderDomainService();
