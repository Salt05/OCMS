/**
 * Centralized configuration loader.
 * All environment variables are read once at startup and typed here.
 */
import fs from 'node:fs';
import path from 'node:path';

// Automatically load .env before evaluating config
try {
  if (typeof process.loadEnvFile === 'function') {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  }
} catch (e) {
  // Ignore if already loaded or not supported
}

function resolveLlmBaseUrl(): string {
  const customUrl = process.env.GEMINI_BASE_URL || process.env.LLM_BASE_URL;
  if (customUrl) {
    if (customUrl.endsWith('/chat/completions')) return customUrl;
    if (customUrl.endsWith('/')) return `${customUrl}chat/completions`;
    return `${customUrl}/chat/completions`;
  }
  const provider = (process.env.LLM_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : 'groq')).toLowerCase();
  if (provider === 'gemini' || process.env.GEMINI_API_KEY) {
    return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  }
  return 'https://api.groq.com/openai/v1/chat/completions';
}

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  encryptionKey: process.env.ENCRYPTION_KEY || 'dev-key-change-me-16b',
  databaseUrl: process.env.DATABASE_URL || '',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  isProduction: process.env.NODE_ENV === 'production',
  odoo: {
    url: process.env.ODOO_URL || '',
    db: process.env.ODOO_DB || '',
    user: process.env.ODOO_USER || '',
    apiKey: process.env.ODOO_API_KEY || '',
  },
  directus: {
    url: process.env.DIRECTUS_URL || '',
    token: process.env.DIRECTUS_TOKEN || '',
    email: process.env.DIRECTUS_EMAIL || '',
    password: process.env.DIRECTUS_PASSWORD || '',
    productCollection: process.env.DIRECTUS_PRODUCT_COLLECTION || 'products',
  },
  llm: {
    provider: (process.env.LLM_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : 'groq')).toLowerCase(),
    apiKey: process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || '',
    model: process.env.GEMINI_MODEL || process.env.LLM_MODEL || process.env.GROQ_MODEL || process.env.MODEL_NAME || 'gemini-flash-lite-latest',
    baseUrl: resolveLlmBaseUrl(),
  },
  groq: {
    apiKey: process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || '',
    model: process.env.GEMINI_MODEL || process.env.GROQ_MODEL || process.env.MODEL_NAME || 'gemini-flash-lite-latest',
  },
};

