/**
 * Centralized configuration loader.
 * All environment variables are read once at startup and typed here.
 */
export const config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  encryptionKey: process.env.ENCRYPTION_KEY || 'dev-key-change-me-16b',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://crmuser:zalocrm_secure_password@localhost:5433/zalocrm',
  uploadDir: process.env.UPLOAD_DIR || '/var/lib/zalo-crm/files',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  isProduction: process.env.NODE_ENV === 'production',
  odoo: {
    url: process.env.ODOO_URL || 'https://odooo.fonti.vn',
    db: process.env.ODOO_DB || 'odoo',
    user: process.env.ODOO_USER || 'sale.order01@gmai.com',
    apiKey: process.env.ODOO_API_KEY || 'b09c7fa1deb1103abb6820be7d1d99c16129a243',
  },
  directus: {
    url: process.env.DIRECTUS_URL || 'http://localhost:8055',
    token: process.env.DIRECTUS_TOKEN || '',
    email: process.env.DIRECTUS_EMAIL || 'admin@lapet.vn',
    password: process.env.DIRECTUS_PASSWORD || 'Lapet@2026',
    productCollection: process.env.DIRECTUS_PRODUCT_COLLECTION || 'products',
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'qwen/qwen3.6-27b',
  },
};
