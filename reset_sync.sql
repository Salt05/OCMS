UPDATE odoo_sync_states SET last_write_date = NULL, status = 'idle' WHERE model_name = 'sale.order';
