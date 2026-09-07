/**
 * integration-settings-service.ts
 * Manages dynamic configuration for AI (Gemini/Groq), Odoo ERP, and Directus CMS.
 * Stores settings persistently in PostgreSQL (app_settings table) per organization.
 * Falls back seamlessly to environment variables (.env) when not configured in DB.
 */

import { prisma } from '../../shared/database/prisma-client.js';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';

export interface AiSettings {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  isCustomConfigured?: boolean;
}

export interface OdooSettings {
  url: string;
  db: string;
  user: string;
  apiKey: string;
  isCustomConfigured?: boolean;
}

export interface DirectusSettings {
  url: string;
  token: string;
  email: string;
  password: string;
  productCollection: string;
  isCustomConfigured?: boolean;
}

export interface IntegrationSettingsResponse {
  ai: AiSettings;
  odoo: OdooSettings;
  directus: DirectusSettings;
}

export class IntegrationSettingsService {
  private cache: Map<string, { data: IntegrationSettingsResponse; expiresAt: number }> = new Map();
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute in-memory cache

  /**
   * Helper to mask sensitive keys for display in UI
   */
  maskSecret(val?: string | null): string {
    if (!val || typeof val !== 'string') return '';
    const trimmed = val.trim();
    if (trimmed.length <= 8) return '••••••••';
    return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
  }

  /**
   * Check if a string is a masked placeholder
   */
  isMasked(val?: string | null): boolean {
    if (!val) return false;
    return val.includes('••••') || val.includes('****');
  }

  /**
   * Invalidate in-memory cache for an org
   */
  clearCache(orgId?: string) {
    if (orgId) {
      this.cache.delete(orgId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Resolve default LLM base URL from provider
   */
  resolveDefaultLlmUrl(provider?: string): string {
    const p = (provider || config.llm.provider || 'gemini').toLowerCase();
    if (p === 'groq') {
      return 'https://api.groq.com/openai/v1/chat/completions';
    }
    return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  }

  /**
   * Get all integration settings for an org, with masked secrets for UI display
   */
  async getSettingsForUI(orgId: string): Promise<IntegrationSettingsResponse> {
    const raw = await this.getRawSettings(orgId);
    return {
      ai: {
        provider: raw.ai.provider,
        apiKey: this.maskSecret(raw.ai.apiKey),
        model: raw.ai.model,
        baseUrl: raw.ai.baseUrl,
        isCustomConfigured: raw.ai.isCustomConfigured,
      },
      odoo: {
        url: raw.odoo.url,
        db: raw.odoo.db,
        user: raw.odoo.user,
        apiKey: this.maskSecret(raw.odoo.apiKey),
        isCustomConfigured: raw.odoo.isCustomConfigured,
      },
      directus: {
        url: raw.directus.url,
        token: this.maskSecret(raw.directus.token),
        email: raw.directus.email,
        password: this.maskSecret(raw.directus.password),
        productCollection: raw.directus.productCollection,
        isCustomConfigured: raw.directus.isCustomConfigured,
      },
    };
  }

  /**
   * Get raw unmasked settings for internal backend usage (with DB + .env fallback)
   */
  async getRawSettings(orgId: string): Promise<IntegrationSettingsResponse> {
    const cached = this.cache.get(orgId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const settings = await prisma.appSetting.findMany({
      where: { orgId },
    });

    const kv = new Map<string, string>();
    for (const s of settings) {
      if (s.valuePlain !== null && s.valuePlain !== undefined) {
        kv.set(s.settingKey, s.valuePlain);
      }
    }

    const aiProvider = kv.get('ai_provider') || config.llm.provider || 'gemini';
    const aiApiKey = kv.get('ai_api_key') || config.llm.apiKey || '';
    const aiModel = kv.get('ai_model') || config.llm.model || (aiProvider === 'groq' ? 'llama-3.3-70b-versatile' : 'gemini-2.5-flash');
    const aiBaseUrl = kv.get('ai_base_url') || config.llm.baseUrl || this.resolveDefaultLlmUrl(aiProvider);

    const odooUrl = kv.get('odoo_url') || config.odoo.url || '';
    const odooDb = kv.get('odoo_db') || config.odoo.db || '';
    const odooUser = kv.get('odoo_user') || config.odoo.user || '';
    const odooApiKey = kv.get('odoo_api_key') || config.odoo.apiKey || '';

    const directusUrl = kv.get('directus_url') || config.directus.url || '';
    const directusToken = kv.get('directus_token') || config.directus.token || '';
    const directusEmail = kv.get('directus_email') || config.directus.email || '';
    const directusPassword = kv.get('directus_password') || config.directus.password || '';
    const directusProductCollection = kv.get('directus_product_collection') || config.directus.productCollection || 'products';

    const result: IntegrationSettingsResponse = {
      ai: {
        provider: aiProvider,
        apiKey: aiApiKey,
        model: aiModel,
        baseUrl: aiBaseUrl,
        isCustomConfigured: kv.has('ai_api_key') || kv.has('ai_model'),
      },
      odoo: {
        url: odooUrl,
        db: odooDb,
        user: odooUser,
        apiKey: odooApiKey,
        isCustomConfigured: kv.has('odoo_url') || kv.has('odoo_api_key'),
      },
      directus: {
        url: directusUrl,
        token: directusToken,
        email: directusEmail,
        password: directusPassword,
        productCollection: directusProductCollection,
        isCustomConfigured: kv.has('directus_url') || kv.has('directus_password'),
      },
    };

    this.cache.set(orgId, { data: result, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return result;
  }

  /**
   * Save integration settings to DB (skips masked unchanged values)
   */
  async saveSettings(orgId: string, payload: Partial<IntegrationSettingsResponse>): Promise<void> {
    const existing = await this.getRawSettings(orgId);
    const upserts: Promise<any>[] = [];

    const saveKey = (key: string, value: string) => {
      upserts.push(
        prisma.appSetting.upsert({
          where: { orgId_settingKey: { orgId, settingKey: key } },
          create: { orgId, settingKey: key, valuePlain: value },
          update: { valuePlain: value },
        })
      );
    };

    // 1. AI Settings
    if (payload.ai) {
      if (payload.ai.provider !== undefined) saveKey('ai_provider', payload.ai.provider.trim().toLowerCase());
      if (payload.ai.model !== undefined && payload.ai.model.trim()) saveKey('ai_model', payload.ai.model.trim());
      if (payload.ai.baseUrl !== undefined) saveKey('ai_base_url', payload.ai.baseUrl.trim());

      if (payload.ai.apiKey !== undefined && payload.ai.apiKey.trim() && !this.isMasked(payload.ai.apiKey)) {
        saveKey('ai_api_key', payload.ai.apiKey.trim());
      }
    }

    // 2. Odoo Settings
    if (payload.odoo) {
      if (payload.odoo.url !== undefined) saveKey('odoo_url', payload.odoo.url.trim().replace(/\/+$/, ''));
      if (payload.odoo.db !== undefined) saveKey('odoo_db', payload.odoo.db.trim());
      if (payload.odoo.user !== undefined) saveKey('odoo_user', payload.odoo.user.trim());

      if (payload.odoo.apiKey !== undefined && payload.odoo.apiKey.trim() && !this.isMasked(payload.odoo.apiKey)) {
        saveKey('odoo_api_key', payload.odoo.apiKey.trim());
      }
    }

    // 3. Directus Settings
    if (payload.directus) {
      if (payload.directus.url !== undefined) saveKey('directus_url', payload.directus.url.trim().replace(/\/+$/, ''));
      if (payload.directus.email !== undefined) saveKey('directus_email', payload.directus.email.trim());
      if (payload.directus.productCollection !== undefined) saveKey('directus_product_collection', payload.directus.productCollection.trim());

      if (payload.directus.token !== undefined && payload.directus.token.trim() && !this.isMasked(payload.directus.token)) {
        saveKey('directus_token', payload.directus.token.trim());
      }
      if (payload.directus.password !== undefined && payload.directus.password.trim() && !this.isMasked(payload.directus.password)) {
        saveKey('directus_password', payload.directus.password.trim());
      }
    }

    await Promise.all(upserts);
    this.clearCache(orgId);
    logger.info(`[integration-settings] Successfully updated integration settings for org ${orgId}`);
  }

  /**
   * Get dynamic AI config for Chatbot or Order Extraction
   */
  async getAiConfig(orgId?: string): Promise<{ provider: string; apiKey: string; model: string; baseUrl: string }> {
    if (!orgId) {
      return {
        provider: config.llm.provider,
        apiKey: config.llm.apiKey,
        model: config.llm.model,
        baseUrl: config.llm.baseUrl,
      };
    }
    const s = await this.getRawSettings(orgId);
    return s.ai;
  }

  /**
   * Get dynamic Odoo config
   */
  async getOdooConfig(orgId?: string): Promise<{ url: string; db: string; user: string; apiKey: string }> {
    if (!orgId) {
      return config.odoo;
    }
    const s = await this.getRawSettings(orgId);
    return s.odoo;
  }

  /**
   * Get dynamic Directus config
   */
  async getDirectusConfig(orgId?: string): Promise<{ url: string; token: string; email: string; password: string; productCollection: string }> {
    if (!orgId) {
      return config.directus;
    }
    const s = await this.getRawSettings(orgId);
    return s.directus;
  }

  // ── TEST CONNECTION IMPLEMENTATIONS ──────────────────────────────────────────

  /**
   * Test AI Connection (Gemini / Groq)
   */
  async testAiConnection(
    params: Partial<AiSettings>,
    orgId?: string
  ): Promise<{ success: boolean; message?: string; latencyMs?: number; modelUsed?: string; error?: string }> {
    const startTime = Date.now();
    try {
      let currentSettings: AiSettings | undefined;
      if (orgId) {
        const raw = await this.getRawSettings(orgId);
        currentSettings = raw.ai;
      }

      const provider = params.provider || currentSettings?.provider || config.llm.provider || 'gemini';
      let apiKey = params.apiKey;
      if (!apiKey || this.isMasked(apiKey)) {
        apiKey = currentSettings?.apiKey || config.llm.apiKey;
      }

      if (!apiKey) {
        return {
          success: false,
          error: 'Vui lòng cung cấp API Key hợp lệ để kiểm tra kết nối AI.',
        };
      }

      const model = params.model || currentSettings?.model || config.llm.model || (provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gemini-2.5-flash');
      
      let baseUrl = params.baseUrl || currentSettings?.baseUrl || this.resolveDefaultLlmUrl(provider);
      if (!baseUrl.endsWith('/chat/completions')) {
        baseUrl = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
      }

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(20000), // 20s timeout
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Bạn là trợ lý kiểm tra kết nối API. Trả lời cực ngắn.' },
            { role: 'user', content: 'Phản hồi đúng 1 từ: OK.' },
          ],
          max_tokens: 20,
          temperature: 0.1,
        }),
      });

      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        const errText = await res.text();
        logger.warn(`[integration-settings] AI Test connection failed (status ${res.status}): ${errText}`);
        return {
          success: false,
          latencyMs,
          error: `Máy chủ AI phản hồi lỗi HTTP ${res.status}: ${errText.slice(0, 200)}`,
        };
      }

      const data = (await res.json()) as any;
      const replyContent = data.choices?.[0]?.message?.content?.trim() || 'OK';

      return {
        success: true,
        message: `Kết nối AI thành công! Phản hồi từ model ${model}: "${replyContent}"`,
        latencyMs,
        modelUsed: model,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      logger.error(`[integration-settings] AI Test connection exception: ${err.message}`);
      return {
        success: false,
        latencyMs,
        error: `Lỗi kết nối AI: ${err.message}`,
      };
    }
  }

  /**
   * Test Odoo Connection (XML-RPC JSON endpoint)
   */
  async testOdooConnection(
    params: Partial<OdooSettings>,
    orgId?: string
  ): Promise<{ success: boolean; message?: string; uid?: number; error?: string }> {
    try {
      let currentSettings: OdooSettings | undefined;
      if (orgId) {
        const raw = await this.getRawSettings(orgId);
        currentSettings = raw.odoo;
      }

      const url = (params.url || currentSettings?.url || config.odoo.url || '').trim().replace(/\/+$/, '');
      const db = (params.db || currentSettings?.db || config.odoo.db || '').trim();
      const user = (params.user || currentSettings?.user || config.odoo.user || '').trim();

      let apiKey = params.apiKey;
      if (!apiKey || this.isMasked(apiKey)) {
        apiKey = currentSettings?.apiKey || config.odoo.apiKey;
      }

      if (!url || !db || !user || !apiKey) {
        return {
          success: false,
          error: 'Vui lòng điền đầy đủ URL, Database, Email người dùng và API Key của Odoo.',
        };
      }

      const endpoint = `${url}/jsonrpc`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            service: 'common',
            method: 'authenticate',
            args: [db, user, apiKey, {}],
          },
        }),
      });

      if (!res.ok) {
        return {
          success: false,
          error: `Không thể kết nối tới máy chủ Odoo (${res.status} ${res.statusText})`,
        };
      }

      const data = (await res.json()) as any;
      if (data.error) {
        const errMsg = data.error?.data?.message || data.error.message || 'Lỗi xác thực Odoo';
        return {
          success: false,
          error: `Lỗi từ Odoo: ${errMsg}`,
        };
      }

      const uid = data.result;
      if (typeof uid === 'number' && uid > 0) {
        return {
          success: true,
          message: `Kết nối Odoo thành công! Đã xác thực tài khoản "${user}" (UID: ${uid}) trên DB "${db}".`,
          uid,
        };
      } else {
        return {
          success: false,
          error: 'Xác thực Odoo thất bại (Sai email, mật khẩu/API Key hoặc Database).',
        };
      }
    } catch (err: any) {
      logger.error(`[integration-settings] Odoo Test connection exception: ${err.message}`);
      return {
        success: false,
        error: `Không thể kết nối máy chủ Odoo: ${err.message}`,
      };
    }
  }

  /**
   * Test Directus Connection (Health check and Authentication)
   */
  async testDirectusConnection(
    params: Partial<DirectusSettings>,
    orgId?: string
  ): Promise<{ success: boolean; message?: string; isOnline?: boolean; error?: string }> {
    try {
      let currentSettings: DirectusSettings | undefined;
      if (orgId) {
        const raw = await this.getRawSettings(orgId);
        currentSettings = raw.directus;
      }

      const url = (params.url || currentSettings?.url || config.directus.url || '').trim().replace(/\/+$/, '');
      if (!url) {
        return {
          success: false,
          error: 'Vui lòng nhập địa chỉ URL máy chủ Directus.',
        };
      }

      let token = params.token;
      if (!token || this.isMasked(token)) {
        token = currentSettings?.token || config.directus.token || '';
      }

      const email = (params.email || currentSettings?.email || config.directus.email || '').trim();
      let password = params.password;
      if (!password || this.isMasked(password)) {
        password = currentSettings?.password || config.directus.password || '';
      }

      // Step 1: Health Check
      let isHealthOk = false;
      try {
        const healthRes = await fetch(`${url}/server/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        isHealthOk = healthRes.ok;
      } catch (e: any) {
        isHealthOk = false;
      }

      // Step 2: Test Authentication if credentials provided
      if (token) {
        try {
          const authRes = await fetch(`${url}/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          });
          if (authRes.ok) {
            return {
              success: true,
              isOnline: true,
              message: `Kết nối Directus thành công! Xác thực Token hợp lệ.`,
            };
          }
        } catch {}
      }

      if (email && password) {
        try {
          const loginRes = await fetch(`${url}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000),
            body: JSON.stringify({ email, password }),
          });
          if (loginRes.ok) {
            return {
              success: true,
              isOnline: true,
              message: `Kết nối Directus thành công! Đăng nhập tài khoản "${email}" thành công.`,
            };
          } else {
            return {
              success: false,
              isOnline: isHealthOk,
              error: `Máy chủ Directus phản hồi nhưng sai Email hoặc Mật khẩu (HTTP ${loginRes.status}).`,
            };
          }
        } catch (e: any) {
          return {
            success: false,
            isOnline: isHealthOk,
            error: `Lỗi đăng nhập Directus: ${e.message}`,
          };
        }
      }

      if (isHealthOk) {
        return {
          success: true,
          isOnline: true,
          message: 'Máy chủ Directus đang hoạt động trực tuyến (/server/health OK).',
        };
      }

      return {
        success: false,
        error: `Không thể kết nối tới máy chủ Directus tại ${url}. Vui lòng kiểm tra lại địa chỉ IP/Port.`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Lỗi kiểm tra kết nối Directus: ${err.message}`,
      };
    }
  }

  /**
   * Fetch available models directly from AI Provider (Google Gemini / Groq Cloud)
   */
  async fetchAvailableAiModels(
    params: { provider?: string; apiKey?: string },
    orgId?: string
  ): Promise<{ success: boolean; models: { id: string; name: string; description?: string }[]; error?: string }> {
    let currentSettings: AiSettings | undefined;
    if (orgId) {
      const raw = await this.getRawSettings(orgId);
      currentSettings = raw.ai;
    }

    const provider = (params.provider || currentSettings?.provider || config.llm.provider || 'gemini').toLowerCase();
    let apiKey = params.apiKey;
    if (!apiKey || this.isMasked(apiKey)) {
      apiKey = currentSettings?.apiKey || (provider === 'gemini' ? process.env.GEMINI_API_KEY || config.llm.apiKey : process.env.GROQ_API_KEY || config.groq.apiKey);
    }

    if (provider === 'gemini') {
      try {
        if (!apiKey) {
          return {
            success: true,
            models: this.getDefaultGeminiModels(),
          };
        }

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          logger.warn(`[integration-settings] Gemini list models failed HTTP ${res.status}`);
          return {
            success: false,
            error: `Không thể lấy danh sách từ Google (HTTP ${res.status}). Đang hiển thị danh sách khuyến nghị.`,
            models: this.getDefaultGeminiModels(),
          };
        }

        const data = (await res.json()) as any;
        const rawList: any[] = data?.models || [];

        const filtered = rawList
          .filter((m: any) => {
            const id = (m.name?.replace(/^models\//, '') || '').toLowerCase();
            const methods: string[] = m.supportedGenerationMethods || [];
            if (!methods.includes('generateContent')) return false;
            if (
              id.includes('embedding') ||
              id.includes('aqa') ||
              id.includes('veo') ||
              id.includes('tts') ||
              id.includes('transcribe') ||
              id.includes('image')
            ) {
              return false;
            }
            return true;
          })
          .map((m: any) => {
            const cleanId = m.name.replace(/^models\//, '');
            return {
              id: cleanId,
              name: m.displayName && m.displayName !== cleanId ? `${m.displayName} (${cleanId})` : cleanId,
              description: m.description,
            };
          });

        return {
          success: true,
          models: filtered.length > 0 ? filtered : this.getDefaultGeminiModels(),
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Lỗi kết nối khi lấy danh sách Model: ${err.message}`,
          models: this.getDefaultGeminiModels(),
        };
      }
    } else {
      // Groq Cloud
      try {
        if (!apiKey) {
          return {
            success: true,
            models: this.getDefaultGroqModels(),
          };
        }

        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          logger.warn(`[integration-settings] Groq list models failed HTTP ${res.status}`);
          return {
            success: false,
            error: `Không thể lấy danh sách từ Groq (HTTP ${res.status}). Đang hiển thị danh sách khuyến nghị.`,
            models: this.getDefaultGroqModels(),
          };
        }

        const data = (await res.json()) as any;
        const rawList: any[] = data?.data || [];
        const filtered = rawList
          .filter((m: any) => {
            const id = (m.id || '').toLowerCase();
            if (id.includes('whisper') || id.includes('guard')) return false;
            return true;
          })
          .map((m: any) => ({
            id: m.id,
            name: m.id,
          }));

        return {
          success: true,
          models: filtered.length > 0 ? filtered : this.getDefaultGroqModels(),
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Lỗi kết nối khi lấy danh sách Model: ${err.message}`,
          models: this.getDefaultGroqModels(),
        };
      }
    }
  }

  private getDefaultGeminiModels(): { id: string; name: string }[] {
    return [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Khuyến nghị - Nhanh & Rẻ)' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (Tối ưu chi phí)' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Tư duy & Độ chính xác cao)' },
      { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
      { id: 'gemini-flash-lite-latest', name: 'Gemini Flash-Lite Latest' },
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite' },
    ];
  }

  private getDefaultGroqModels(): { id: string; name: string }[] {
    return [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
      { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B' },
      { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B' },
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B' },
    ];
  }
}

export const integrationSettingsService = new IntegrationSettingsService();

