<template>
  <div class="w-100 pb-10">
    <!-- Top Action Header -->
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap gap-2">
      <div>
        <h2 class="text-h6 font-weight-bold d-flex align-center">
          <v-icon color="primary" class="mr-2">lucide-cpu</v-icon>
          Cấu hình Tích hợp Hệ thống
        </h2>
        <p class="text-caption text-medium-emphasis mb-0">
          Điều chỉnh trực tiếp thông số kết nối AI, Odoo ERP và Directus. Dữ liệu được lưu an toàn trong CSDL và ưu tiên áp dụng ngay lập tức.
        </p>
      </div>
      <v-btn
        color="primary"
        prepend-icon="lucide-save"
        :loading="saving"
        elevation="2"
        @click="saveAllSettings"
      >
        Lưu tất cả thay đổi
      </v-btn>
    </div>

    <!-- Alert for general loading / errors -->
    <v-alert v-if="loadingError" type="error" variant="tonal" class="mb-4" closable @click:close="loadingError = ''">
      {{ loadingError }}
    </v-alert>

    <v-progress-linear v-if="fetching" indeterminate color="primary" class="mb-4" />

    <form v-else autocomplete="off" @submit.prevent novalidate class="w-100">
      <!-- Decoy hidden inputs to divert browser eager autofill heuristics -->
      <input type="text" style="display: none !important;" aria-hidden="true" tabindex="-1" autocomplete="false" />
      <input type="password" style="display: none !important;" aria-hidden="true" tabindex="-1" autocomplete="false" />

      <div class="d-flex flex-column gap-4">
        <!-- ── CARD 1: AI & CHATBOT CONFIG ──────────────────────────────────── -->
        <v-card variant="outlined" class="pa-4 rounded-lg">
          <div class="d-flex align-center justify-space-between mb-3">
            <div class="d-flex align-center">
              <v-avatar color="purple-lighten-5" size="38" class="mr-3 text-purple">
                <v-icon size="20">lucide-sparkles</v-icon>
              </v-avatar>
              <div>
                <div class="font-weight-bold text-subtitle-1">1. Trí tuệ nhân tạo (AI & Chatbot Engine)</div>
                <div class="text-caption text-medium-emphasis">Tự động trả lời khách hàng Zalo và bóc tách đơn hàng thông minh</div>
              </div>
            </div>
            <v-chip
              size="small"
              :color="settings.ai.provider === 'gemini' ? 'blue' : 'orange'"
              variant="tonal"
              class="font-weight-medium"
            >
              {{ settings.ai.provider === 'gemini' ? 'Google Gemini' : 'Groq Cloud' }}
            </v-chip>
          </div>

          <v-divider class="mb-4" />

          <v-row dense>
            <v-col cols="12" md="4">
              <v-select
                v-model="settings.ai.provider"
                :items="aiProviderOptions"
                item-title="title"
                item-value="value"
                label="Nhà cung cấp AI *"
                variant="outlined"
                density="compact"
                prepend-inner-icon="lucide-bot"
                autocomplete="off"
                @update:model-value="onProviderChanged"
              />
            </v-col>

            <v-col cols="12" md="8">
              <v-combobox
                v-model="settings.ai.model"
                :items="availableModels"
                item-title="name"
                item-value="id"
                :return-object="false"
                label="Tên Model AI *"
                variant="outlined"
                density="compact"
                prepend-inner-icon="lucide-box"
                :loading="fetchingModels"
                autocomplete="off"
                :input-props="{
                  autocomplete: 'off',
                  'data-lpignore': 'true',
                  'data-1p-ignore': 'true',
                  'data-form-type': 'other',
                  name: 'cfg_ai_model_name',
                  spellcheck: 'false',
                  autocorrect: 'off',
                  autocapitalize: 'off',
                }"
                hint="Chọn từ danh sách Model của nhà cung cấp hoặc tự nhập tên tùy chỉnh"
                persistent-hint
              >
                <template #append-inner>
                  <v-tooltip text="Tải lại danh sách Model từ nhà cung cấp" location="top">
                    <template #activator="{ props }">
                      <v-btn
                        v-bind="props"
                        icon
                        size="x-small"
                        variant="text"
                        color="primary"
                        :loading="fetchingModels"
                        @click.stop="fetchModels(true)"
                      >
                        <v-icon size="16">lucide-refresh-cw</v-icon>
                      </v-btn>
                    </template>
                  </v-tooltip>
                </template>
              </v-combobox>
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="settings.ai.apiKey"
                :type="showAiKey ? 'text' : (isWebkitSecuritySupported ? 'text' : 'password')"
                :class="{ 'masked-key-input': !showAiKey }"
                label="API Key AI *"
                variant="outlined"
                density="compact"
                prepend-inner-icon="lucide-key"
                :append-inner-icon="showAiKey ? 'lucide-eye-off' : 'lucide-eye'"
                placeholder="Để nguyên nếu không muốn đổi key cũ"
                hint="Khóa API cấp từ Google AI Studio hoặc Groq Console"
                persistent-hint
                autocomplete="new-password"
                :input-props="{
                  autocomplete: 'new-password',
                  'data-lpignore': 'true',
                  'data-1p-ignore': 'true',
                  'data-form-type': 'other',
                  name: 'cfg_ai_secret_key',
                  spellcheck: 'false',
                  autocorrect: 'off',
                  autocapitalize: 'off',
                }"
                @click:append-inner="showAiKey = !showAiKey"
              />
            </v-col>
          </v-row>

          <!-- Test result banner -->
          <v-alert
            v-if="aiTestResult"
            :type="aiTestResult.success ? 'success' : 'error'"
            variant="tonal"
            density="compact"
            class="mt-3 mb-1"
            closable
            @click:close="aiTestResult = null"
          >
            <div class="font-weight-medium">{{ aiTestResult.message || aiTestResult.error }}</div>
            <div v-if="aiTestResult.latencyMs" class="text-caption mt-1">
              Độ trễ: <strong>{{ aiTestResult.latencyMs }}ms</strong> | Model: <strong>{{ aiTestResult.modelUsed || settings.ai.model }}</strong>
            </div>
          </v-alert>

          <div class="d-flex justify-end mt-3">
            <v-btn
              variant="tonal"
              color="primary"
              prepend-icon="lucide-zap"
              :loading="testingAi"
              @click="testAiConnection"
            >
              Kiểm tra kết nối AI
            </v-btn>
          </div>
        </v-card>

        <!-- ── CARD 2: ODOO ERP CONFIG ──────────────────────────────────────── -->
        <v-card variant="outlined" class="pa-4 rounded-lg">
          <div class="d-flex align-center justify-space-between mb-3">
            <div class="d-flex align-center">
              <v-avatar color="indigo-lighten-5" size="38" class="mr-3 text-indigo">
                <v-icon size="20">lucide-layers</v-icon>
              </v-avatar>
              <div>
                <div class="font-weight-bold text-subtitle-1">2. Tích hợp Odoo ERP</div>
                <div class="text-caption text-medium-emphasis">Đồng bộ khách hàng, sản phẩm và tạo đơn hàng bán (sale.order)</div>
              </div>
            </div>
            <v-chip size="small" color="indigo" variant="tonal">XML-RPC API</v-chip>
          </div>

          <v-divider class="mb-4" />

          <v-row dense>
            <v-col cols="12" sm="6" md="4">
              <v-text-field
                v-model="settings.odoo.url"
                label="Địa chỉ máy chủ Odoo (URL) *"
                placeholder="https://test-odoo.fonti.vn"
                variant="outlined"
                density="compact"
                prepend-inner-icon="lucide-globe"
                autocomplete="off"
                :input-props="{
                  autocomplete: 'off',
                  'data-lpignore': 'true',
                  'data-1p-ignore': 'true',
                  'data-form-type': 'other',
                  name: 'cfg_odoo_server_url',
                  spellcheck: 'false',
                  autocorrect: 'off',
                  autocapitalize: 'off',
                }"
              />
            </v-col>

            <v-col cols="12" sm="6" md="2">
              <v-text-field
                v-model="settings.odoo.db"
                label="Tên Database Odoo *"
                placeholder="odoo_it_test_20260905"
                variant="outlined"
                density="compact"
                prepend-inner-icon="lucide-database"
                autocomplete="off"
                :input-props="{
                  autocomplete: 'off',
                  'data-lpignore': 'true',
                  'data-1p-ignore': 'true',
                  'data-form-type': 'other',
                  name: 'cfg_odoo_database_name',
                  spellcheck: 'false',
                  autocorrect: 'off',
                  autocapitalize: 'off',
                }"
              />
            </v-col>

            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model="settings.odoo.user"
                label="Tài khoản kết nối Odoo *"
                placeholder="user@example.com"
                variant="outlined"
                density="compact"
                prepend-inner-icon="lucide-mail"
                autocomplete="off"
                :input-props="{
                  autocomplete: 'new-password',
                  'data-lpignore': 'true',
                  'data-1p-ignore': 'true',
                  'data-form-type': 'other',
                  name: 'cfg_odoo_account_identifier',
                  spellcheck: 'false',
                  autocorrect: 'off',
                  autocapitalize: 'off',
                }"
              />
            </v-col>

            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model="settings.odoo.apiKey"
                :type="showOdooKey ? 'text' : (isWebkitSecuritySupported ? 'text' : 'password')"
                :class="{ 'masked-key-input': !showOdooKey }"
                label="Odoo API Key / Token kết nối *"
                variant="outlined"
                density="compact"
                prepend-inner-icon="lucide-key-round"
                :append-inner-icon="showOdooKey ? 'lucide-eye-off' : 'lucide-eye'"
                placeholder="Để nguyên nếu không muốn đổi mật khẩu"
                hint="Khóa API được cấp trong hồ sơ người dùng trên Odoo"
                persistent-hint
                autocomplete="new-password"
                :input-props="{
                  autocomplete: 'new-password',
                  'data-lpignore': 'true',
                  'data-1p-ignore': 'true',
                  'data-form-type': 'other',
                  name: 'cfg_odoo_token_secret',
                  spellcheck: 'false',
                  autocorrect: 'off',
                  autocapitalize: 'off',
                }"
                @click:append-inner="showOdooKey = !showOdooKey"
              />
            </v-col>
          </v-row>

          <!-- Test result banner -->
          <v-alert
            v-if="odooTestResult"
            :type="odooTestResult.success ? 'success' : 'error'"
            variant="tonal"
            density="compact"
            class="mt-3 mb-1"
            closable
            @click:close="odooTestResult = null"
          >
            <div class="font-weight-medium">{{ odooTestResult.message || odooTestResult.error }}</div>
          </v-alert>

          <div class="d-flex justify-end mt-3">
            <v-btn
              variant="tonal"
              color="indigo"
              prepend-icon="lucide-refresh-cw"
              :loading="testingOdoo"
              @click="testOdooConnection"
            >
              Kiểm tra kết nối Odoo
            </v-btn>
          </div>
        </v-card>

        <!-- ── CARD 3: DIRECTUS CMS CONFIG ──────────────────────────────────── -->
        <v-card variant="outlined" class="pa-4 rounded-lg">
          <div class="d-flex align-center justify-space-between mb-3">
            <div class="d-flex align-center">
              <v-avatar color="teal-lighten-5" size="38" class="mr-3 text-teal">
                <v-icon size="20">lucide-image</v-icon>
              </v-avatar>
              <div>
                <div class="font-weight-bold text-subtitle-1">3. Directus CMS (Kho ảnh & Media sản phẩm)</div>
                <div class="text-caption text-medium-emphasis">Lưu trữ hình ảnh catalog sản phẩm để hiển thị và gửi cho khách qua Zalo</div>
              </div>
            </div>
            <v-chip size="small" color="teal" variant="tonal">REST Assets</v-chip>
          </div>

          <v-divider class="mb-4" />

          <v-row dense>
            <v-col cols="12" sm="8" md="5">
              <v-text-field
                v-model="settings.directus.url"
                label="Địa chỉ Directus URL *"
                placeholder="http://192.168.1.110:8055 hoặc https://directus.domain.com"
                variant="outlined"
                density="compact"
                prepend-inner-icon="lucide-server"
                autocomplete="off"
                :input-props="{
                  autocomplete: 'off',
                  'data-lpignore': 'true',
                  'data-1p-ignore': 'true',
                  'data-form-type': 'other',
                  name: 'cfg_directus_server_url',
                  spellcheck: 'false',
                  autocorrect: 'off',
                  autocapitalize: 'off',
                }"
              />
            </v-col>

            <v-col cols="12" sm="4" md="2">
              <v-text-field
                v-model="settings.directus.productCollection"
                label="Tên Bảng Sản phẩm (Collection)"
                placeholder="products"
                variant="outlined"
                density="compact"
                hint="Mặc định: products"
                persistent-hint
                autocomplete="off"
                :input-props="{
                  autocomplete: 'off',
                  'data-lpignore': 'true',
                  'data-1p-ignore': 'true',
                  'data-form-type': 'other',
                  name: 'cfg_directus_collection_name',
                  spellcheck: 'false',
                  autocorrect: 'off',
                  autocapitalize: 'off',
                }"
              />
            </v-col>

            <v-col cols="12" sm="6" md="2">
              <v-text-field
                v-model="settings.directus.email"
                label="Tài khoản kết nối Directus"
                placeholder="admin@example.com"
                variant="outlined"
                density="compact"
                prepend-inner-icon="lucide-user"
                autocomplete="off"
                :input-props="{
                  autocomplete: 'new-password',
                  'data-lpignore': 'true',
                  'data-1p-ignore': 'true',
                  'data-form-type': 'other',
                  name: 'cfg_directus_account_identifier',
                  spellcheck: 'false',
                  autocorrect: 'off',
                  autocapitalize: 'off',
                }"
              />
            </v-col>

            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model="settings.directus.password"
                :type="showDirectusPassword ? 'text' : (isWebkitSecuritySupported ? 'text' : 'password')"
                :class="{ 'masked-key-input': !showDirectusPassword }"
                label="Directus Token / Mật mã API"
                variant="outlined"
                density="compact"
                prepend-inner-icon="lucide-lock"
                :append-inner-icon="showDirectusPassword ? 'lucide-eye-off' : 'lucide-eye'"
                placeholder="Để nguyên nếu không muốn đổi mật khẩu"
                autocomplete="new-password"
                :input-props="{
                  autocomplete: 'new-password',
                  'data-lpignore': 'true',
                  'data-1p-ignore': 'true',
                  'data-form-type': 'other',
                  name: 'cfg_directus_token_secret',
                  spellcheck: 'false',
                  autocorrect: 'off',
                  autocapitalize: 'off',
                }"
                @click:append-inner="showDirectusPassword = !showDirectusPassword"
              />
            </v-col>
          </v-row>

          <!-- Test result banner -->
          <v-alert
            v-if="directusTestResult"
            :type="directusTestResult.success ? 'success' : 'error'"
            variant="tonal"
            density="compact"
            class="mt-3 mb-1"
            closable
            @click:close="directusTestResult = null"
          >
            <div class="font-weight-medium">{{ directusTestResult.message || directusTestResult.error }}</div>
          </v-alert>

          <div class="d-flex justify-end mt-3">
            <v-btn
              variant="tonal"
              color="teal"
              prepend-icon="lucide-check-circle"
              :loading="testingDirectus"
              @click="testDirectusConnection"
            >
              Kiểm tra kết nối Directus
            </v-btn>
          </div>
        </v-card>
      </div>
    </form>

    <!-- Toast Snackbar -->
    <v-snackbar v-model="snack.show" :color="snack.color" :timeout="4000" location="top right">
      {{ snack.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api';

interface AiForm {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface OdooForm {
  url: string;
  db: string;
  user: string;
  apiKey: string;
}

interface DirectusForm {
  url: string;
  token: string;
  email: string;
  password: string;
  productCollection: string;
}

interface SettingsForm {
  ai: AiForm;
  odoo: OdooForm;
  directus: DirectusForm;
}

const fetching = ref(true);
const saving = ref(false);
const loadingError = ref('');

const showAiKey = ref(false);
const showOdooKey = ref(false);
const showDirectusPassword = ref(false);
const isWebkitSecuritySupported = ref(true);

const testingAi = ref(false);
const aiTestResult = ref<{ success: boolean; message?: string; error?: string; latencyMs?: number; modelUsed?: string } | null>(null);

const testingOdoo = ref(false);
const odooTestResult = ref<{ success: boolean; message?: string; error?: string; uid?: number } | null>(null);

const testingDirectus = ref(false);
const directusTestResult = ref<{ success: boolean; message?: string; error?: string; isOnline?: boolean } | null>(null);

const fetchingModels = ref(false);
const availableModels = ref<{ id: string; name: string }[]>([]);

const snack = ref({ show: false, text: '', color: 'success' });

const aiProviderOptions = [
  { title: 'Google Gemini (Khuyến nghị)', value: 'gemini' },
  { title: 'Groq Cloud (Tốc độ cao)', value: 'groq' },
];

const settings = ref<SettingsForm>({
  ai: {
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-2.5-flash',
    baseUrl: '',
  },
  odoo: {
    url: '',
    db: '',
    user: '',
    apiKey: '',
  },
  directus: {
    url: '',
    token: '',
    email: '',
    password: '',
    productCollection: 'products',
  },
});

function onProviderChanged(val: string) {
  if (val === 'groq') {
    if (!settings.value.ai.model || settings.value.ai.model.startsWith('gemini')) {
      settings.value.ai.model = 'llama-3.3-70b-versatile';
    }
  } else {
    if (!settings.value.ai.model || settings.value.ai.model.includes('llama') || settings.value.ai.model.includes('qwen')) {
      settings.value.ai.model = 'gemini-2.5-flash';
    }
  }
  fetchModels(false);
}

async function fetchModels(showToast = false) {
  fetchingModels.value = true;
  try {
    const res = await api.post('/settings/integrations/ai-models', {
      provider: settings.value.ai.provider,
      apiKey: settings.value.ai.apiKey,
    });
    if (res.data?.models && res.data.models.length > 0) {
      availableModels.value = res.data.models;
      if (showToast) {
        showSnack(`Đã tải ${res.data.models.length} model từ ${settings.value.ai.provider === 'gemini' ? 'Google Gemini' : 'Groq Cloud'}`);
      }
    }
  } catch (err: any) {
    if (showToast) {
      showSnack('Không thể tải danh sách model: ' + (err.response?.data?.error || err.message), 'error');
    }
  } finally {
    fetchingModels.value = false;
  }
}

function showSnack(text: string, color = 'success') {
  snack.value = { show: true, text, color };
}

async function loadSettings() {
  fetching.value = true;
  loadingError.value = '';
  try {
    const res = await api.get('/settings/integrations');
    if (res.data) {
      if (res.data.ai) settings.value.ai = { ...settings.value.ai, ...res.data.ai };
      if (res.data.odoo) settings.value.odoo = { ...settings.value.odoo, ...res.data.odoo };
      if (res.data.directus) settings.value.directus = { ...settings.value.directus, ...res.data.directus };
    }
    fetchModels(false);
  } catch (err: any) {
    loadingError.value = err.response?.data?.error || 'Không thể tải cấu hình tích hợp hệ thống.';
  } finally {
    fetching.value = false;
  }
}

async function saveAllSettings() {
  saving.value = true;
  try {
    const payload = {
      ai: {
        provider: settings.value.ai.provider,
        apiKey: settings.value.ai.apiKey,
        model: settings.value.ai.model,
        baseUrl: settings.value.ai.baseUrl,
      },
      odoo: {
        url: settings.value.odoo.url,
        db: settings.value.odoo.db,
        user: settings.value.odoo.user,
        apiKey: settings.value.odoo.apiKey,
      },
      directus: {
        url: settings.value.directus.url,
        email: settings.value.directus.email,
        password: settings.value.directus.password,
        productCollection: settings.value.directus.productCollection,
      },
    };

    const res = await api.put('/settings/integrations', payload);
    if (res.data?.settings) {
      if (res.data.settings.ai) settings.value.ai = { ...settings.value.ai, ...res.data.settings.ai };
      if (res.data.settings.odoo) settings.value.odoo = { ...settings.value.odoo, ...res.data.settings.odoo };
      if (res.data.settings.directus) settings.value.directus = { ...settings.value.directus, ...res.data.settings.directus };
    }
    showSnack('Đã lưu thành công toàn bộ cấu hình tích hợp!');
  } catch (err: any) {
    showSnack(err.response?.data?.error || 'Lỗi khi lưu cấu hình tích hợp', 'error');
  } finally {
    saving.value = false;
  }
}

async function testAiConnection() {
  testingAi.value = true;
  aiTestResult.value = null;
  try {
    const res = await api.post('/settings/integrations/test/ai', {
      provider: settings.value.ai.provider,
      apiKey: settings.value.ai.apiKey,
      model: settings.value.ai.model,
      baseUrl: settings.value.ai.baseUrl,
    });
    aiTestResult.value = res.data;
    if (res.data.success) {
      showSnack('Kiểm tra AI thành công!');
    } else {
      showSnack(res.data.error || 'Kiểm tra AI thất bại', 'error');
    }
  } catch (err: any) {
    aiTestResult.value = {
      success: false,
      error: err.response?.data?.error || err.message,
    };
    showSnack('Lỗi kết nối tới AI API', 'error');
  } finally {
    testingAi.value = false;
  }
}

async function testOdooConnection() {
  testingOdoo.value = true;
  odooTestResult.value = null;
  try {
    const res = await api.post('/settings/integrations/test/odoo', {
      url: settings.value.odoo.url,
      db: settings.value.odoo.db,
      user: settings.value.odoo.user,
      apiKey: settings.value.odoo.apiKey,
    });
    odooTestResult.value = res.data;
    if (res.data.success) {
      showSnack('Kết nối Odoo ERP thành công!');
    } else {
      showSnack(res.data.error || 'Kết nối Odoo thất bại', 'error');
    }
  } catch (err: any) {
    odooTestResult.value = {
      success: false,
      error: err.response?.data?.error || err.message,
    };
    showSnack('Lỗi kết nối máy chủ Odoo', 'error');
  } finally {
    testingOdoo.value = false;
  }
}

async function testDirectusConnection() {
  testingDirectus.value = true;
  directusTestResult.value = null;
  try {
    const res = await api.post('/settings/integrations/test/directus', {
      url: settings.value.directus.url,
      email: settings.value.directus.email,
      password: settings.value.directus.password,
      productCollection: settings.value.directus.productCollection,
    });
    directusTestResult.value = res.data;
    if (res.data.success) {
      showSnack('Kết nối Directus thành công!');
    } else {
      showSnack(res.data.error || 'Kết nối Directus thất bại', 'error');
    }
  } catch (err: any) {
    directusTestResult.value = {
      success: false,
      error: err.response?.data?.error || err.message,
    };
    showSnack('Lỗi kết nối máy chủ Directus', 'error');
  } finally {
    testingDirectus.value = false;
  }
}

onMounted(() => {
  if (typeof window !== 'undefined' && (window as any).CSS && (window as any).CSS.supports) {
    isWebkitSecuritySupported.value = (window as any).CSS.supports('-webkit-text-security', 'disc');
  }
  loadSettings();
});
</script>

<style scoped>
.gap-1 {
  gap: 4px;
}
.gap-2 {
  gap: 8px;
}
.gap-4 {
  gap: 16px;
}

.masked-key-input :deep(input) {
  -webkit-text-security: disc !important;
  font-family: text-security-disc, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
}
</style>
