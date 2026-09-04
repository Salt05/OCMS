<template>
  <div 
    class="chatbot-sidebar-container d-flex flex-column h-100" 
    :class="{ 'is-dark': isDark }"
  >
    <!-- Chat Messages Scroll Area -->
    <div ref="messagesContainerRef" class="chat-history flex-grow-1 overflow-y-auto d-flex flex-column">
      
      <!-- Welcome screen when empty -->
      <div v-if="messages.length === 0" class="welcome-section my-auto py-8 text-center px-4">
        <div v-if="customerName" class="mb-3">
          <v-chip size="small" color="primary" variant="tonal" class="font-weight-medium px-3" style="border-radius: 12px !important;">
            <v-icon size="13" class="mr-1.5">lucide-user-check</v-icon>
            Hội thoại: <strong class="ml-1">{{ customerName }}</strong>
            <span v-if="customerPhone" class="ml-1 text-caption opacity-80">({{ customerPhone }})</span>
          </v-chip>
        </div>
        <h2 class="welcome-title text-subtitle-1 font-weight-bold mb-1" style="line-height: 1.4;">
          Xin chào {{ userName }}!
        </h2>
        <p class="welcome-subtitle text-caption">
          {{ customerName ? `Hỏi AI về thông tin, lịch sử mua hàng, hoặc tạo đơn cho ${customerName}` : 'Hôm nay tôi có thể giúp gì cho bạn' }}
        </p>
      </div>

      <!-- Messages List -->
      <template v-else>
        <div 
          v-for="(msg, index) in messages" 
          :key="index" 
          class="message-row d-flex flex-column"
        >
          <!-- User Bubble Row (Right-aligned) -->
          <div v-if="msg.role === 'user'" class="d-flex align-start justify-end w-100">
            <div class="user-bubble-wrapper d-flex flex-column align-end">
              <div class="user-bubble px-3 py-2 text-body-2">
                {{ msg.content }}
              </div>
              
              <!-- User Question Action Buttons on Hover -->
              <div class="user-actions d-flex align-center gap-1 mt-1">
                <button 
                  type="button"
                  class="action-btn"
                  title="Sửa câu hỏi" 
                  @click="handleEditQuestion(msg.content)"
                >
                  <v-icon size="13">lucide-pencil</v-icon>
                </button>
                <button 
                  type="button"
                  class="action-btn"
                  title="Sao chép câu hỏi" 
                  @click="copyToClipboard(msg.content)"
                >
                  <v-icon size="13">lucide-copy</v-icon>
                </button>
              </div>
            </div>
          </div>

          <!-- Assistant Response Row (Left-aligned) -->
          <div v-else class="d-flex align-start justify-start w-100">
            <div class="assistant-wrapper d-flex flex-column align-start flex-grow-1">
              <!-- Assistant Card Bubble -->
              <div class="assistant-card w-100">
                <!-- Loading state: 'đang suy nghĩ' -->
                <div v-if="!msg.content" class="d-flex align-center gap-2 py-1 loading-text">
                  <v-progress-circular indeterminate size="16" width="2" color="primary"></v-progress-circular>
                  <span class="text-caption font-weight-medium">đang suy nghĩ...</span>
                </div>

                <!-- 🧠 Collapsible Thinking / Reasoning Process Dropdown -->
                <div v-if="msg.thinking || msg.orderDraft?.thinking" class="thinking-accordion mb-2.5">
                  <button 
                    type="button" 
                    class="thinking-toggle-btn d-flex align-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-weight-medium transition-all"
                    :class="msg.showThinking ? 'bg-primary-lighten-5 text-primary border-primary-light' : 'bg-surface-variant-subtle text-medium-emphasis border'"
                    @click="msg.showThinking = !msg.showThinking"
                  >
                    <v-icon size="14" :color="msg.showThinking ? 'primary' : 'medium-emphasis'">
                      {{ msg.showThinking ? 'lucide-brain' : 'lucide-sparkles' }}
                    </v-icon>
                    <span class="font-weight-semibold">{{ msg.showThinking ? 'Thu gọn phân tích suy nghĩ' : '💭 Xem quá trình suy nghĩ & phân tích' }}</span>
                    <v-icon size="13" class="ml-1 opacity-70">
                      {{ msg.showThinking ? 'lucide-chevron-up' : 'lucide-chevron-down' }}
                    </v-icon>
                  </button>

                  <v-expand-transition>
                    <div v-if="msg.showThinking" class="thinking-content-box mt-2 pa-3 rounded-xl border bg-surface-variant-subtle">
                      <div class="d-flex align-center gap-1.5 text-caption font-weight-bold text-primary mb-1.5 pb-1 border-b">
                        <v-icon size="14" color="primary">lucide-cpu</v-icon>
                        <span>Chi tiết các bước suy luận của AI:</span>
                      </div>
                      <div class="thinking-text text-caption text-high-emphasis whitespace-pre-line font-mono" style="font-size: 12px; line-height: 1.65; opacity: 0.9;">
                        {{ msg.thinking || msg.orderDraft?.thinking }}
                      </div>
                    </div>
                  </v-expand-transition>
                </div>

                <!-- Rendered Markdown Content with Tables -->
                <div 
                  v-if="msg.content" 
                  class="markdown-body text-body-2" 
                  v-html="renderMarkdown(msg.content)"
                ></div>

                <!-- 🛒 Interactive Order Form Card (When staff asks AI to create an order) -->
                <div v-if="msg.orderDraft" class="order-draft-card w-100 mt-3 border rounded-2xl overflow-hidden bg-surface shadow-sm">
                  <!-- Header: Basic Customer & Order Info -->
                  <div class="order-draft-header px-4 py-3.5 d-flex align-center justify-space-between border-b bg-surface-variant-subtle">
                    <div class="d-flex align-center gap-2.5 overflow-hidden mr-2">
                      <v-avatar size="36" color="success" variant="tonal" class="rounded-xl flex-shrink-0">
                        <v-icon size="18" color="success">lucide-shopping-cart</v-icon>
                      </v-avatar>
                      <div class="overflow-hidden">
                        <div class="text-body-2 font-weight-bold text-high-emphasis text-truncate">
                          Đơn hàng: {{ msg.orderDraft.customer?.name || contact?.fullName || 'Khách hàng' }}
                        </div>
                        <div class="text-caption text-medium-emphasis text-truncate mt-0.5">
                          {{ msg.orderDraft.customer?.phone || contact?.phone || 'Chưa có SĐT' }} • {{ msg.orderDraft.customer?.shippingAddress || contact?.address || 'Chưa có địa chỉ' }}
                        </div>
                      </div>
                    </div>
                    <v-chip
                      size="small"
                      :color="msg.orderDraft.orderCreated ? 'success' : 'deep-purple-accent-3'"
                      variant="tonal"
                      class="font-weight-bold flex-shrink-0 px-3"
                    >
                      {{ msg.orderDraft.orderCreated ? (msg.orderDraft.orderCode || 'Đã tạo Odoo') : 'Bản nháp AI' }}
                    </v-chip>
                  </div>

                  <!-- Missing info warning alert if any -->
                  <div v-if="msg.orderDraft.missingInfo && msg.orderDraft.missingInfo.length > 0 && !msg.orderDraft.orderCreated" class="mx-4 mt-3">
                    <div class="text-caption text-warning d-flex align-start gap-2 font-weight-medium bg-amber-lighten-5 pa-3 rounded-xl border border-warning-light">
                      <v-icon size="15" color="warning" class="mt-0.5 flex-shrink-0">lucide-alert-circle</v-icon>
                      <span>Thiếu: {{ msg.orderDraft.missingInfo.join(', ') }}</span>
                    </div>
                  </div>

                  <!-- Body: List of Product Cards (Matches exact user screenshot design) -->
                  <div class="order-draft-items pa-4 d-flex flex-column gap-3.5">
                    <div v-if="!msg.orderDraft.items || msg.orderDraft.items.length === 0" class="pa-5 text-center text-body-2 text-medium-emphasis border-dashed rounded-xl">
                      Chưa có sản phẩm nào trong đơn hàng đề xuất. Bấm nút "+ Thêm sản phẩm" bên dưới để chọn.
                    </div>

                    <div
                      v-for="(line, lineIdx) in msg.orderDraft.items"
                      :key="lineIdx"
                      class="chat-product-card border rounded-xl pa-3.5 bg-surface shadow-xs transition-all"
                    >
                      <!-- Top Section: Image + Name & SKU + Delete Button -->
                      <div class="d-flex align-start justify-space-between gap-3">
                        <div class="d-flex align-start gap-3 overflow-hidden flex-grow-1">
                          <!-- Image Thumbnail Box -->
                          <div class="chat-product-img-box rounded-xl border flex-shrink-0 bg-surface overflow-hidden">
                            <img
                              v-if="line.product?.image_url"
                              :src="line.product.image_url"
                              :alt="line.product.name"
                              class="chat-product-img-render"
                            />
                            <div v-else class="w-100 h-100 d-flex align-center justify-center text-medium-emphasis">
                              <v-icon size="20" class="opacity-50">lucide-package</v-icon>
                            </div>
                          </div>

                          <!-- Product Name & SKU -->
                          <div class="overflow-hidden flex-grow-1" style="min-width: 0;">
                            <div class="chat-product-name-title font-weight-bold text-high-emphasis leading-snug text-truncate mb-1">
                              {{ line.product?.name || line.productNameRaw || 'Sản phẩm' }}
                            </div>
                            <div class="chat-product-meta-sub text-caption text-medium-emphasis">
                              SKU: {{ line.product?.default_code || line.product?.sku || line.sku || 'N/A' }} · #{{ line.product?.odoo_id || line.product?.id || '---' }}
                            </div>
                          </div>
                        </div>

                        <!-- Trash/Delete Button -->
                        <button
                          v-if="!msg.orderDraft.orderCreated"
                          type="button"
                          class="chat-delete-line-btn flex-shrink-0 mt-0.5"
                          title="Xóa sản phẩm"
                          @click="removeDraftItem(msg, lineIdx)"
                        >
                          <v-icon size="16">lucide-trash-2</v-icon>
                        </button>
                      </div>

                      <!-- Dashed Divider -->
                      <div class="chat-product-dashed-divider my-3"></div>

                      <!-- Bottom Section: Unit Price × Stepper ... Discount ... Subtotal -->
                      <div class="d-flex align-center justify-space-between flex-wrap gap-2">
                        <!-- Left: Unit Price × Stepper -->
                        <div class="d-flex align-center gap-2 flex-shrink-0">
                          <div class="d-flex flex-column align-start">
                            <span v-if="line.originalPrice && line.originalPrice > line.price" class="text-caption text-decoration-line-through text-medium-emphasis leading-none" style="font-size: 11px;">
                              {{ formatCurrency(line.originalPrice) }}
                            </span>
                            <span class="chat-unit-price text-body-2 font-weight-semibold" :class="line.originalPrice && line.originalPrice > line.price ? 'text-success font-weight-bold' : 'text-high-emphasis'">
                              {{ formatCurrency(line.price) }}
                            </span>
                          </div>
                          <span class="text-medium-emphasis text-caption font-weight-medium">×</span>

                          <!-- Quantity Stepper -->
                          <div class="chat-quantity-stepper d-inline-flex align-center border rounded-lg overflow-hidden bg-surface">
                            <button
                              type="button"
                              class="chat-stepper-btn"
                              :disabled="msg.orderDraft.orderCreated || (line.qty ?? 0) <= 0"
                              title="Giảm 1"
                              @click="decrementDraftItemQty(line)"
                            >
                              <v-icon size="12">lucide-minus</v-icon>
                            </button>
                            <input
                              type="number"
                              v-model.number="line.qty"
                              min="0"
                              :disabled="msg.orderDraft.orderCreated"
                              class="chat-stepper-input text-center font-weight-bold text-high-emphasis"
                            />
                            <button
                              type="button"
                              class="chat-stepper-btn"
                              :disabled="msg.orderDraft.orderCreated"
                              title="Tăng 1"
                              @click="incrementDraftItemQty(line)"
                            >
                              <v-icon size="12">lucide-plus</v-icon>
                            </button>
                          </div>
                        </div>

                        <!-- Middle: Discount Input (CK %) for Staff -->
                        <div class="chat-discount-group d-flex align-center gap-1 flex-shrink-0">
                          <span class="text-caption text-medium-emphasis font-weight-medium">CK:</span>
                          <div class="d-inline-flex align-center border rounded-lg overflow-hidden bg-surface px-1.5 py-0.5" style="border-color: rgba(var(--v-border-color), 0.25);">
                            <input
                              type="number"
                              v-model.number="line.discount"
                              min="0"
                              max="100"
                              step="1"
                              :disabled="msg.orderDraft.orderCreated"
                              class="chat-discount-input text-center font-weight-bold text-error"
                              style="width: 40px; font-size: 0.8rem; border: none; outline: none; background: transparent;"
                              placeholder="0"
                            />
                            <span class="text-caption font-weight-bold text-error">%</span>
                          </div>
                        </div>

                        <!-- Right: Subtotal (Thành tiền) -->
                        <div class="chat-subtotal-group d-flex align-center gap-1.5 ml-auto flex-shrink-0">
                          <span class="text-caption text-medium-emphasis">Thành tiền:</span>
                          <span class="chat-line-subtotal font-weight-bold text-body-2 text-primary">
                            {{ formatCurrency(calcLineSubtotal(line)) }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Footer: Total Summary & Interaction Buttons -->
                  <div class="order-draft-footer px-4 py-3.5 border-t bg-surface-variant-subtle d-flex flex-column gap-2.5">
                    <div v-if="calcDraftUndiscountedTotal(msg.orderDraft) > calcDraftTotal(msg.orderDraft)" class="d-flex align-center justify-space-between text-caption text-medium-emphasis">
                      <span>Tổng tiền hàng (chưa giảm):</span>
                      <span class="font-weight-medium text-high-emphasis">{{ formatCurrency(calcDraftUndiscountedTotal(msg.orderDraft)) }}</span>
                    </div>
                    <div v-if="calcDraftUndiscountedTotal(msg.orderDraft) > calcDraftTotal(msg.orderDraft)" class="d-flex align-center justify-space-between text-caption text-error">
                      <span>Tổng chiết khấu & ưu đãi:</span>
                      <span class="font-weight-bold">-{{ formatCurrency(calcDraftUndiscountedTotal(msg.orderDraft) - calcDraftTotal(msg.orderDraft)) }}</span>
                    </div>
                    <div class="d-flex align-center justify-space-between mb-0.5">
                      <span class="text-body-2 font-weight-bold text-high-emphasis">Tổng thanh toán:</span>
                      <span class="text-subtitle-1 font-weight-bold text-success total-draft-amount">
                        {{ formatCurrency(calcDraftTotal(msg.orderDraft)) }}
                      </span>
                    </div>

                    <!-- Action buttons (Thêm sản phẩm / Xác nhận) -->
                    <div v-if="!msg.orderDraft.orderCreated" class="d-flex align-center gap-2.5">
                      <v-btn
                        height="38"
                        variant="tonal"
                        color="primary"
                        prepend-icon="lucide-plus"
                        class="text-body-2 font-weight-bold rounded-xl flex-grow-1"
                        @click="openPickerForDraft(msg)"
                      >
                        Thêm sản phẩm
                      </v-btn>

                      <v-btn
                        height="38"
                        color="success"
                        prepend-icon="lucide-check-circle"
                        :loading="msg.orderDraft.submitting"
                        :disabled="!msg.orderDraft.items || msg.orderDraft.items.length === 0"
                        class="text-body-2 font-weight-bold rounded-xl flex-grow-1 text-white shadow-sm"
                        @click="submitDraftOrder(msg)"
                      >
                        Xác nhận tạo đơn
                      </v-btn>
                    </div>

                    <!-- Success State Notice -->
                    <div v-else class="text-body-2 text-success font-weight-bold text-center py-2.5 px-3 bg-success-lighten-5 rounded-xl border border-success-light">
                      🎉 Đã tạo đơn thành công trên Odoo: {{ msg.orderDraft.orderCode }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- External Actions Below Card: Visible ONLY on HOVER -->
              <div v-if="msg.content" class="assistant-external-actions d-flex align-center justify-space-between mt-1 px-1 text-caption w-100">
                <!-- Left group: Time + Action Icon Buttons (Table & Copy) -->
                <div class="d-flex align-center gap-1">
                  <span v-if="msg.duration" class="d-flex align-center gap-1 execution-time mr-2">
                    <v-icon size="12">lucide-clock</v-icon> {{ msg.duration }}s
                  </span>

                  <!-- 1. Bảng dữ liệu Icon Button -->
                  <button
                    v-if="hasDataOrChart(msg)"
                    type="button"
                    class="action-btn"
                    @click="openDataModal(msg, 'table')"
                    title="Mở Bảng dữ liệu & Biểu đồ"
                  >
                    <v-icon size="13">lucide-table-2</v-icon>
                  </button>

                  <!-- 2. Sao chép Icon Button -->
                  <button
                    type="button"
                    class="action-btn"
                    @click="copyToClipboard(msg.content)"
                    title="Sao chép nội dung"
                  >
                    <v-icon size="13">lucide-copy</v-icon>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Input Area (1 line compact with Order Mode Toggle) -->
    <div class="input-section px-3 pb-3 pt-2">
      <div class="input-box-wrapper d-flex align-center px-2 py-1" :class="{ 'is-order-mode': isOrderMode }">
        <!-- Order Mode Toggle Button (Icon Cart) -->
        <button
          type="button"
          class="order-mode-toggle-btn flex-shrink-0 d-flex align-center justify-center mr-1"
          :class="{ 'is-active': isOrderMode }"
          :title="isOrderMode ? 'Chế độ Tạo/Sửa đơn hàng: ĐANG BẬT (Bấm để chuyển về Chat thường)' : 'Bấm để BẬT chế độ Tạo/Sửa đơn hàng'"
          @click="isOrderMode = !isOrderMode"
        >
          <v-icon size="15">{{ isOrderMode ? 'lucide-shopping-cart' : 'lucide-shopping-bag' }}</v-icon>
        </button>

        <!-- Text Input Field (1 line, no outline) -->
        <input
          v-model="inputText"
          type="text"
          :placeholder="isOrderMode ? 'Nhập yêu cầu tạo hoặc sửa đơn hàng (VD: 30 bao E01, giảm 5 C24...)' : 'Hỏi về khách hàng, sản phẩm, chi tiêu, tin nhắn...'"
          class="sidebar-chat-input flex-grow-1 text-body-2"
          @keydown.enter="sendMessage"
        />
        
        <!-- Send Button -->
        <button 
          type="button"
          class="send-btn flex-shrink-0 ml-1 d-flex align-center justify-center"
          :disabled="!inputText.trim() || isLoading"
          @click="sendMessage"
        >
          <v-progress-circular v-if="isLoading" indeterminate size="14" width="2" color="white" />
          <v-icon v-else size="15">lucide-send</v-icon>
        </button>
      </div>
    </div>

    <!-- Data Table & Chart Centered Modal Dialog -->
    <v-dialog 
      v-model="showDataDialog" 
      max-width="960" 
      width="92vw" 
      persistent
      scrollable
    >
      <v-card class="data-modal-card rounded-lg elevation-8 overflow-hidden" :class="{ 'is-dark': isDark }">
        <!-- Modal Header -->
        <div class="data-modal-header px-4 py-3 d-flex align-center justify-space-between border-b">
          <div class="d-flex align-center gap-2">
            <v-icon color="primary" size="20">lucide-bar-chart-2</v-icon>
            <span class="font-weight-bold text-subtitle-2 modal-title">Chi tiết Dữ liệu & Biểu đồ</span>
          </div>

          <!-- High-Contrast Tab Switcher -->
          <div class="modal-tab-group d-flex align-center">
            <button
              type="button"
              class="modal-tab-btn"
              :class="{ 'is-active': activeDataTab === 'table' }"
              @click="activeDataTab = 'table'"
            >
              <v-icon size="14" class="mr-1">lucide-table</v-icon> Bảng dữ liệu
            </button>
            <button
              type="button"
              class="modal-tab-btn"
              :class="{ 'is-active': activeDataTab === 'chart' }"
              @click="switchToChartTab"
            >
              <v-icon size="14" class="mr-1">lucide-pie-chart</v-icon> Biểu đồ
            </button>
          </div>

          <!-- Close Button -->
          <button
            type="button"
            class="modal-close-btn"
            title="Đóng cửa sổ"
            @click="showDataDialog = false"
          >
            <v-icon size="18">lucide-x</v-icon>
          </button>
        </div>

        <!-- Modal Body: Table Tab -->
        <div v-show="activeDataTab === 'table'" class="data-modal-body pa-4 overflow-y-auto" style="max-height: 70vh;">
          <!-- Controls: Search & CSV Export -->
          <div class="d-flex align-center justify-space-between gap-3 mb-3">
            <div class="search-box-wrapper d-flex align-center px-2 py-1 rounded-md border flex-grow-1" style="max-width: 320px; border-radius: 6px !important;">
              <v-icon size="14" color="medium-emphasis" class="mr-1">lucide-search</v-icon>
              <input
                v-model="tableSearchQuery"
                type="text"
                placeholder="Tìm kiếm trong bảng..."
                class="modal-search-input text-caption flex-grow-1"
                style="background: transparent; border: none; outline: none;"
              />
            </div>

            <div class="d-flex align-center gap-2">
              <span class="text-caption table-count-text">
                {{ filteredTableRows.length }} dòng, {{ modalTableData?.columns?.length || 0 }} cột
              </span>
              <button
                type="button"
                class="btn-export-csv"
                @click="exportTableToCSV"
              >
                <v-icon size="14" class="mr-1">lucide-download</v-icon> Xuất CSV
              </button>
            </div>
          </div>

          <!-- Table Container -->
          <div class="table-responsive rounded-md border" style="border-radius: 6px !important; overflow: auto; max-height: 55vh;">
            <table class="modal-interactive-table w-100">
              <thead>
                <tr>
                  <th v-for="col in modalTableData?.columns || []" :key="col">
                    {{ col }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="filteredTableRows.length === 0">
                  <td :colspan="modalTableData?.columns?.length || 1" class="text-center py-4 text-medium-emphasis">
                    Không tìm thấy dòng nào khớp với từ khóa tìm kiếm.
                  </td>
                </tr>
                <tr v-else v-for="(row, rIdx) in filteredTableRows" :key="rIdx">
                  <td v-for="col in modalTableData?.columns || []" :key="col">
                    {{ row[col] !== undefined ? row[col] : '' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Modal Body: Chart Tab -->
        <div v-show="activeDataTab === 'chart'" class="data-modal-body pa-4" style="min-height: 480px; max-height: 70vh;">
          <div ref="plotlyChartRef" class="w-100 h-100" style="min-height: 440px;"></div>
        </div>
      </v-card>
    </v-dialog>

    <!-- Product Picker Modal Dialog for Chat Order Form -->
    <ProductPickerDialog
      v-model="showPickerForDraft"
      :loading="loadingProducts"
      :order-lines="[]"
      @select="onProductFromPickerForDraft"
    />

    <!-- Snackbar Copy Notification -->
    <v-snackbar v-model="showCopySnackbar" timeout="1500" location="bottom center" rounded="md" density="compact" color="success">
      <div class="d-flex align-center gap-1 text-caption">
        <v-icon size="14">lucide-check</v-icon> {{ copySnackbarText }}
      </div>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { marked } from 'marked';
import { useTheme } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api';
import { useOdoo, type OdooProduct } from '@/composables/use-odoo';
import ProductPickerDialog from '@/components/chat/ProductPickerDialog.vue';

// Declare Plotly from global window
declare const Plotly: any;

const props = defineProps<{
  contact?: any;
  conversation?: any;
  messages?: any[];
}>();

const emit = defineEmits<{
  (e: 'sessionsUpdated', sessions: any[]): void;
  (e: 'orderCreated', order: any): void;
}>();

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  duration?: number | string;
  chart?: any;
  dataframe?: any;
  sql?: string;
  thinking?: string | null;
  showThinking?: boolean;
  orderDraft?: {
    thinking?: string | null;
    customer?: { name?: string | null; phone?: string | null; shippingAddress?: string | null };
    items: Array<{
      product: OdooProduct | null;
      productNameRaw?: string;
      sku?: string | null;
      qty: number;
      price: number;
      originalPrice?: number | null;
      discountedPrice?: number | null;
      discount?: number;
      aiConfidence?: number;
    }>;
    notes?: string | null;
    paymentTermId?: number | null;
    missingInfo?: string[];
    orderCreated?: boolean;
    orderCode?: string;
    submitting?: boolean;
  } | null;
}

// Configure marked parser
marked.setOptions({
  gfm: true,
  breaks: true,
});

const activeContact = computed(() => {
  return props.contact || props.conversation?.contact || null;
});

const activeConversation = computed(() => {
  return props.conversation || null;
});

const customerName = computed(() => {
  return (
    activeContact.value?.fullName ||
    activeContact.value?.zaloName ||
    activeConversation.value?.contact?.fullName ||
    activeConversation.value?.contact?.zaloName ||
    ''
  );
});

const customerPhone = computed(() => {
  return activeContact.value?.phone || activeConversation.value?.contact?.phone || '';
});

const customerAddress = computed(() => {
  return activeContact.value?.address || activeConversation.value?.contact?.address || '';
});

const customerOdooId = computed(() => {
  return activeContact.value?.customerId || activeConversation.value?.contact?.customerId || '';
});

const crmContactId = computed(() => {
  return activeContact.value?.id || activeConversation.value?.contact?.id || '';
});

const staffName = computed(() => {
  return (
    activeConversation.value?.zaloAccount?.displayName ||
    authStore.user?.fullName ||
    authStore.user?.email?.split('@')[0] ||
    ''
  );
});

const assignedStaff = computed(() => {
  return activeContact.value?.assignedUser?.fullName || '';
});

const contactTags = computed(() => {
  const t = activeContact.value?.tags;
  if (Array.isArray(t)) return t.join(', ');
  return t ? String(t) : '';
});

const contactNotes = computed(() => {
  return activeContact.value?.notes || '';
});

const recentThreadMessages = computed(() => {
  if (!props.messages || !Array.isArray(props.messages) || props.messages.length === 0) return '';
  const lastMsgs = props.messages
    .filter((m: any) => !m.isDeleted && m.content)
    .slice(-8);

  if (lastMsgs.length === 0) return '';

  return lastMsgs.map((m: any) => {
    const sender = m.senderType === 'self' ? (staffName.value || 'Nhân viên') : (customerName.value || 'Khách hàng');
    const time = m.sentAt ? new Date(m.sentAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
    const rawContent = (m.content || '').trim();
    const content = rawContent.length > 200 ? rawContent.substring(0, 200) + '...' : rawContent;
    return `+ [${time}] ${sender}: ${content}`;
  }).join('\n');
});

function buildEnrichedQuestion(userText: string): string {
  const cName = customerName.value;
  const cPhone = customerPhone.value;
  const cAddress = customerAddress.value;
  const cOdoo = customerOdooId.value;
  const cCrm = crmContactId.value;
  const sName = staffName.value;
  const cAssigned = assignedStaff.value;
  const cTags = contactTags.value;
  const cNotes = contactNotes.value;
  const threadMsgs = recentThreadMessages.value;

  if (cName || cPhone || cOdoo || cCrm || sName || threadMsgs) {
    let ctx = `[NGỮ CẢNH HỘI THOẠI HIỆN TẠI]:\n`;
    if (cName) ctx += `- Khách hàng: ${cName}${activeContact.value?.zaloName && activeContact.value?.zaloName !== cName ? ` (Tên Zalo: ${activeContact.value.zaloName})` : ''}\n`;
    if (cPhone) ctx += `- Số điện thoại: ${cPhone}\n`;
    if (cAddress) ctx += `- Địa chỉ: ${cAddress}\n`;
    if (cOdoo) ctx += `- Mã khách hàng Odoo (Partner ID): ${cOdoo}\n`;
    if (cCrm) ctx += `- Mã CRM Contact ID: ${cCrm}\n`;
    if (sName) ctx += `- Nhân viên đang phụ trách/chat: ${sName}\n`;
    if (cAssigned && cAssigned !== sName) ctx += `- Nhân viên được phân công: ${cAssigned}\n`;
    if (cTags) ctx += `- Thẻ phân loại: ${cTags}\n`;
    if (cNotes) ctx += `- Ghi chú CRM: ${cNotes}\n`;

    if (threadMsgs) {
      ctx += `- Các tin nhắn gần nhất giữa nhân viên và khách hàng trong hội thoại này:\n${threadMsgs}\n`;
    }

    ctx += `\n[CÂU HỎI / YÊU CẦU CỦA NHÂN VIÊN]: ${userText}`;
    return ctx;
  }

  return userText;
}

function cleanDisplayUserMessage(content: string): string {
  if (!content) return '';
  if (content.includes('[CÂU HỎI / YÊU CẦU CỦA NHÂN VIÊN]:')) {
    const parts = content.split(/\[CÂU HỎI \/ YÊU CẦU CỦA NHÂN VIÊN\]:\s*/);
    return (parts[parts.length - 1] || content).trim();
  }
  if (content.includes('Câu hỏi của nhân viên:')) {
    const parts = content.split(/Câu hỏi của nhân viên:\s*/);
    return (parts[parts.length - 1] || content).trim();
  }
  return content;
}

const theme = useTheme();
const isDark = computed(() => theme.global.current.value.dark);

const authStore = useAuthStore();
const userName = computed(() => {
  return authStore.user?.fullName || authStore.user?.email?.split('@')[0] || 'bạn';
});

const {
  products,
  loadingProducts,
  fetchProducts,
  formatCurrency,
} = useOdoo();

const CHATBOT_API_BASE = 'http://localhost:8000';

const inputText = ref('');
const isOrderMode = ref(false);
const isLoading = ref(false);
const messagesContainerRef = ref<HTMLDivElement | null>(null);

const messages = ref<ChatMessage[]>([]);
const sessions = ref<any[]>([]);
const activeSessionId = ref<string | null>(null);
const showCopySnackbar = ref(false);
const copySnackbarText = ref('Đã sao chép vào bộ nhớ tạm!');

// Product Picker for Chat Order Form
const showPickerForDraft = ref(false);
const activeDraftMessage = ref<ChatMessage | null>(null);

// Modal Data Dialog States
const showDataDialog = ref(false);
const activeDataTab = ref<'table' | 'chart'>('table');
const modalTableData = ref<{ columns: string[]; data: any[] } | null>(null);
const modalChartData = ref<any>(null);
const tableSearchQuery = ref('');
const plotlyChartRef = ref<HTMLDivElement | null>(null);

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainerRef.value) {
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight;
    }
  });
}

function copyToClipboard(text: string) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showCopySnackbar.value = true;
  });
}

function handleEditQuestion(questionText: string) {
  if (!questionText) return;
  inputText.value = questionText;
}

function isToolOutput(text: string): boolean {
  if (!text) return false;
  if (text.includes("Results saved to file:") || 
      text.includes("FOR VISUALIZE_DATA") || 
      text.includes("Results truncated to") ||
      text.includes("Query executed successfully. No rows returned") ||
      text.includes("Created visualization from")) {
    return true;
  }
  if (/^[a-zA-Z0-9_]+(,[a-zA-Z0-9_]+){2,}/m.test(text.trim())) {
    return true;
  }
  return false;
}

// Helper to extract <think>...</think>, [suy nghĩ]... or numbered reasoning preamble from text
function extractThinkingFromText(text: string): { thinking: string | null; cleanContent: string } {
  if (!text) return { thinking: null, cleanContent: '' };
  
  // 1. Explicit <think> or [suy nghĩ] / [thinking] tags
  const thinkTagMatch = text.match(/<(?:think|thinking|suy_nghi)>([\s\S]*?)(?:<\/(?:think|thinking|suy_nghi)>|$)/i) ||
                        text.match(/\[(?:think|thinking|suy\s*nghĩ|phân\s*tích)\]([\s\S]*?)(?:\[\/(?:think|thinking|suy\s*nghĩ|phân\s*tích)\]|$)/i);
  if (thinkTagMatch) {
    const thinking = thinkTagMatch[1].trim() || null;
    const cleanContent = text.replace(/<(?:think|thinking|suy_nghi)>[\s\S]*?(?:<\/(?:think|thinking|suy_nghi)>|$)/gi, '')
                             .replace(/\[(?:think|thinking|suy\s*nghĩ|phân\s*tích)\][\s\S]*?(?:\[\/(?:think|thinking|suy\s*nghĩ|phân\s*tích)\]|$)/gi, '')
                             .trim();
    return { thinking, cleanContent };
  }

  // 2. Numbered reasoning preamble (e.g. "1. Xác định... 2. Thực hiện... 3. Kiểm tra... 4. Tổng hợp...")
  const lines = text.trim().split('\n');
  if (lines.length > 1 && /^(?:1\.|Bước 1:?|Xác định:?|Nhận diện:?)/i.test(lines[0].trim())) {
    let splitIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        splitIndex = i;
        break;
      }
      if (i > 0 && /^(?:#{1,6}\s|\*\*|[A-ZÀ-Ỹ]|\|)/.test(line) && !/^\d+\.|\bBước \d+/.test(line)) {
        splitIndex = i;
        break;
      }
    }

    if (splitIndex > 0) {
      const candidateThinking = lines.slice(0, splitIndex).join('\n').trim();
      const cleanContent = lines.slice(splitIndex).join('\n').trim();
      if (candidateThinking.length > 20 && /(\b2\.|Bước 2|Kiểm tra|Phân tích|Truy vấn|Xác định|Tổng hợp)/i.test(candidateThinking)) {
        return { thinking: candidateThinking, cleanContent };
      }
    }
  }

  return { thinking: null, cleanContent: text };
}

// Helper to extract [ORDER_DRAFT]...[/ORDER_DRAFT] JSON payload from text
function extractOrderDraftFromText(text: string): { draft: any | null; cleanContent: string } {
  if (!text || typeof text !== 'string') return { draft: null, cleanContent: text };
  const draftRegex = /\[ORDER_DRAFT\]\s*([\s\S]*?)\s*\[\/ORDER_DRAFT\]/i;
  const match = text.match(draftRegex);
  if (match && match[1]) {
    let jsonStr = match[1].trim();
    // 1. Remove markdown code blocks if wrapped in ```json or ```
    jsonStr = jsonStr.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    // 2. Remove single-line comments // ...
    jsonStr = jsonStr.replace(/\/\/.*/g, '');
    // 3. Remove multi-line comments /* ... */
    jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');
    // 4. Remove trailing commas before } or ]
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

    let draftObj: any = null;
    try {
      draftObj = JSON.parse(jsonStr);
    } catch {
      try {
        draftObj = Function('"use strict";return (' + jsonStr + ')')();
      } catch (e2) {
        console.warn('Failed to parse ORDER_DRAFT JSON:', e2);
      }
    }

    if (draftObj) {
      const cleanContent = text.replace(draftRegex, '').trim();
      return { draft: draftObj, cleanContent };
    }
  }
  return { draft: null, cleanContent: text };
}

// Clean internal tool outputs / raw CSV dump from LLM response
function cleanAssistantText(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed === 'Query executed successfully. No rows returned.' || trimmed.startsWith('Query executed successfully.')) {
    return ''; // Ignore intermediate tool output from memory search
  }
  if (isToolOutput(text) && !text.includes("Dưới đây") && !text.includes("Thông tin") && !text.includes("Đơn hàng") && !text.includes("Doanh thu") && !text.includes("Xin chào") && !text.includes("chào") && !text.includes("Khách hàng")) {
    return '';
  }
  let cleaned = text;
  cleaned = cleaned.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '');
  cleaned = cleaned.replace(/\[ORDER_DRAFT\][\s\S]*?(?:\[\/ORDER_DRAFT\]|$)/gi, '');
  cleaned = cleaned.replace(/Created visualization from '[^']+' \(\d+ rows, \d+ columns\)\.?/gi, '');
  cleaned = cleaned.replace(/\(Results truncated to \d+ characters[\s\S]*?\)/gi, '');
  cleaned = cleaned.replace(/\*{0,2}Results saved to file:\s*[^\n\r*]+\*{0,2}/gi, '');
  cleaned = cleaned.replace(/\*{0,2}IMPORTANT:\s*FOR VISUALIZE_DATA[^\n\r*]+\*{0,2}/gi, '');
  cleaned = cleaned.replace(/(?:^|\n)[a-zA-Z0-9_]+(,[a-zA-Z0-9_]+)+[\s\S]*?(?=\n\n|\n[A-ZÀ-Ỹ]|$)/gi, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

function renderMarkdown(content: string): string {
  if (!content) return '';
  const cleaned = cleanAssistantText(content);
  try {
    return marked.parse(cleaned) as string;
  } catch (e) {
    return cleaned;
  }
}

// Helper to convert dataframe object to markdown table string
function dataframeToMarkdownTable(df: any): string {
  if (!df) return '';
  const cols = df.columns || [];
  const rows = df.data || [];
  if (cols.length === 0 || rows.length === 0) return '';
  
  let md = '| ' + cols.join(' | ') + ' |\n';
  md += '| ' + cols.map(() => '---').join(' | ') + ' |\n';
  rows.forEach((r: any) => {
    const line = cols.map((c: string) => {
      const v = r[c] !== undefined ? String(r[c]).replace(/\|/g, '\\|') : '';
      return v;
    }).join(' | ');
    md += '| ' + line + ' |\n';
  });
  return md;
}

// Helper to parse markdown table from assistant text
function parseMarkdownTable(markdownText: string): { columns: string[]; data: any[]; row_count: number } | null {
  if (!markdownText || !markdownText.includes('|')) return null;
  const lines = markdownText.split('\n').map(l => l.trim()).filter(l => l.startsWith('|') && l.endsWith('|'));
  if (lines.length < 3) return null;

  const parseRow = (line: string) => line.slice(1, -1).split('|').map(cell => cell.trim());
  const headers = parseRow(lines[0]);
  const isSep = lines[1].split('|').slice(1, -1).every(c => c.replace(/:/g, '').replace(/-/g, '').trim() === '');
  if (!isSep) return null;

  const dataRows: any[] = [];
  for (let i = 2; i < lines.length; i++) {
    const rowValues = parseRow(lines[i]);
    if (rowValues.length === headers.length) {
      const rowObj: any = {};
      headers.forEach((h, idx) => {
        rowObj[h] = rowValues[idx];
      });
      dataRows.push(rowObj);
    }
  }

  if (dataRows.length === 0) return null;
  return { columns: headers, data: dataRows, row_count: dataRows.length };
}

function hasDataOrChart(msg: any): boolean {
  if (msg.chart || msg.dataframe) return true;
  return Boolean(parseMarkdownTable(msg.content));
}

// Filter table rows based on user search query
const filteredTableRows = computed(() => {
  if (!modalTableData.value || !modalTableData.value.data) return [];
  const q = tableSearchQuery.value.toLowerCase().trim();
  if (!q) return modalTableData.value.data;

  return modalTableData.value.data.filter(row => {
    return Object.values(row).some(val => String(val).toLowerCase().includes(q));
  });
});

// Export table to CSV
function exportTableToCSV() {
  if (!modalTableData.value || !modalTableData.value.data || modalTableData.value.data.length === 0) return;
  const cols = modalTableData.value.columns;
  const rows = modalTableData.value.data;

  let csvContent = '\uFEFF'; // UTF-8 BOM
  csvContent += cols.map(c => `"${c.replace(/"/g, '""')}"`).join(',') + '\r\n';

  rows.forEach(r => {
    const line = cols.map(c => {
      const v = r[c] !== undefined ? String(r[c]) : '';
      return `"${v.replace(/"/g, '""')}"`;
    }).join(',');
    csvContent += line + '\r\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `dulieu_ai_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Open Data Modal with specified initial tab ('table' | 'chart')
function openDataModal(msg: any, initialTab: 'table' | 'chart' = 'table') {
  let table = msg.dataframe;
  if (!table) {
    table = parseMarkdownTable(msg.content);
  }

  modalTableData.value = table ? { columns: table.columns, data: table.data } : null;
  modalChartData.value = msg.chart || null;
  tableSearchQuery.value = '';
  activeDataTab.value = initialTab;
  showDataDialog.value = true;

  if (initialTab === 'chart') {
    nextTick(() => {
      renderChart();
    });
  }
}

// Lazy load Plotly only on demand when chart is opened
let plotlyLoadingPromise: Promise<any> | null = null;
function loadPlotly(): Promise<any> {
  if (typeof (window as any).Plotly !== 'undefined') {
    return Promise.resolve((window as any).Plotly);
  }
  if (plotlyLoadingPromise) return plotlyLoadingPromise;
  plotlyLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.plot.ly/plotly-2.35.2.min.js';
    script.async = true;
    script.onload = () => resolve((window as any).Plotly);
    script.onerror = (err) => {
      plotlyLoadingPromise = null;
      reject(err);
    };
    document.head.appendChild(script);
  });
  return plotlyLoadingPromise;
}

// Switch to Chart Tab and render Plotly
function switchToChartTab() {
  activeDataTab.value = 'chart';
  nextTick(() => {
    renderChart();
  });
}

async function renderChart() {
  if (!plotlyChartRef.value) return;

  if (typeof (window as any).Plotly === 'undefined') {
    plotlyChartRef.value.innerHTML = '<div class="pa-4 text-center text-medium-emphasis">Đang tải thư viện biểu đồ Plotly...</div>';
    try {
      await loadPlotly();
    } catch {
      if (plotlyChartRef.value) {
        plotlyChartRef.value.innerHTML = '<div class="pa-4 text-center text-error">Không thể tải thư viện biểu đồ Plotly. Vui lòng kiểm tra kết nối mạng.</div>';
      }
      return;
    }
  }

  const Plotly = (window as any).Plotly;
  if (!Plotly || !plotlyChartRef.value) return;

  // 1. If explicit Plotly chart figure exists from AI
  if (modalChartData.value) {
    try {
      let fig = typeof modalChartData.value === 'string' ? JSON.parse(modalChartData.value) : modalChartData.value;
      let data = fig.data || (Array.isArray(fig) ? fig : [fig]);
      let layout = fig.layout || {
        margin: { t: 40, b: 60, l: 60, r: 30 },
        paper_bgcolor: isDark.value ? '#252522' : '#FFFFFF',
        plot_bgcolor: isDark.value ? '#252522' : '#FFFFFF',
        font: { color: isDark.value ? '#F8FAFC' : '#023D60', family: 'Plus Jakarta Sans, sans-serif' },
        autosize: true
      };
      Plotly.newPlot(plotlyChartRef.value, data, layout, { responsive: true });
      return;
    } catch (e) {
      console.warn('Cannot parse explicit plotly data:', e);
    }
  }

  // 2. Auto-generate Bar Chart from Table Data if no explicit chart
  if (modalTableData.value && modalTableData.value.columns.length >= 2 && modalTableData.value.data.length > 0) {
    const cols = modalTableData.value.columns;
    const rows = modalTableData.value.data;

    const labelCol = cols[0];
    let valueCol = cols[1];

    for (let i = 1; i < cols.length; i++) {
      const sample = rows[0][cols[i]];
      const cleanNum = String(sample).replace(/[^0-9.-]/g, '');
      if (cleanNum && !isNaN(Number(cleanNum))) {
        valueCol = cols[i];
        break;
      }
    }

    const xVals = rows.map(r => String(r[labelCol]));
    const yVals = rows.map(r => {
      const raw = String(r[valueCol] || '0').replace(/[^0-9.-]/g, '');
      return parseFloat(raw) || 0;
    });

    const trace = {
      x: xVals,
      y: yVals,
      type: 'bar',
      marker: {
        color: isDark.value ? '#38BDF8' : '#023D60',
        line: { color: isDark.value ? '#15A8A8' : '#01243A', width: 1 }
      }
    };

    const layout = {
      title: {
        text: `Biểu đồ phân tích: ${valueCol} theo ${labelCol}`,
        font: { color: isDark.value ? '#F8FAFC' : '#023D60', family: 'Space Grotesk, sans-serif', size: 16 }
      },
      xaxis: {
        title: labelCol,
        color: isDark.value ? '#CBD5E1' : '#023D60',
        tickangle: -25
      },
      yaxis: {
        title: valueCol,
        color: isDark.value ? '#CBD5E1' : '#023D60'
      },
      margin: { t: 50, b: 80, l: 70, r: 30 },
      paper_bgcolor: isDark.value ? '#252522' : '#FFFFFF',
      plot_bgcolor: isDark.value ? '#252522' : '#FFFFFF',
      font: { color: isDark.value ? '#F8FAFC' : '#023D60', family: 'Plus Jakarta Sans, sans-serif' },
      autosize: true
    };

    Plotly.newPlot(plotlyChartRef.value, [trace], layout, { responsive: true });
  } else {
    plotlyChartRef.value.innerHTML = '<div class="pa-8 text-center text-medium-emphasis">Không có đủ dữ liệu dạng số để vẽ biểu đồ tự động.</div>';
  }
}

// Fetch list of conversations for staff user (all sessions)
async function fetchSessions() {
  try {
    const res = await fetch(`${CHATBOT_API_BASE}/api/conversations`);
    if (res.ok) {
      const data = await res.json();
      sessions.value = data.conversations || [];
      emit('sessionsUpdated', sessions.value);
    }
  } catch (e) {
    console.warn('Cannot fetch chatbot sessions:', e);
  }
}

// Load a specific conversation session
async function loadSession(sessionId: string) {
  activeSessionId.value = sessionId;
  isLoading.value = true;
  try {
    const res = await fetch(`${CHATBOT_API_BASE}/api/conversations/${sessionId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.conversation && data.conversation.messages) {
        messages.value = data.conversation.messages.map((m: any) => {
          const rawContent = m.content || '';
          let thinking = m.metadata?.thinking || m.metadata?.orderDraft?.thinking || null;
          let content = rawContent;
          let orderDraft = m.metadata?.orderDraft || null;
          if (m.role === 'user') {
            content = cleanDisplayUserMessage(rawContent);
          } else {
            const extracted = extractThinkingFromText(rawContent);
            if (extracted.thinking) {
              thinking = extracted.thinking;
            }
            const draftExtracted = extractOrderDraftFromText(extracted.cleanContent);
            if (draftExtracted.draft) {
              orderDraft = draftExtracted.draft;
            }
            content = cleanAssistantText(draftExtracted.cleanContent);
          }

          if (orderDraft && Array.isArray(orderDraft.items)) {
            orderDraft.items = orderDraft.items.map((it: any) => {
              const origPrice = it.originalPrice || it.product?.wholesale_price || it.product?.list_price || null;
              const discPrice = it.discountedPrice || null;
              const finalPrice = discPrice || it.price || it.priceUnit || it.product?.wholesale_price || it.product?.list_price || 0;
              return {
                ...it,
                price: finalPrice,
                originalPrice: origPrice,
                discountedPrice: discPrice,
                discount: it.discount || 0,
              };
            });
          }
          return {
            role: m.role,
            content,
            dataframe: m.dataframe || parseMarkdownTable(content),
            chart: m.chart || null,
            thinking,
            showThinking: false,
            orderDraft,
          };
        });
      } else {
        messages.value = [];
      }
    }
  } catch (e) {
    console.error('Failed to load session:', e);
  } finally {
    isLoading.value = false;
    scrollToBottom();
  }
}

// Create a new session
function createNewSession() {
  activeSessionId.value = null;
  messages.value = [];
  inputText.value = '';
}

// Delete a session
async function deleteSession(sessionId: string) {
  try {
    await fetch(`${CHATBOT_API_BASE}/api/conversations/${sessionId}`, { method: 'DELETE' });
    if (activeSessionId.value === sessionId) {
      createNewSession();
    }
    await fetchSessions();
  } catch (e) {
    console.error('Failed to delete session:', e);
  }
}

// ── Interactive Draft Order Helpers ──────────────────────────────────────────
function incrementDraftItemQty(line: any) {
  line.qty = (Number(line.qty) || 0) + 1;
}

function decrementDraftItemQty(line: any) {
  if ((line.qty ?? 0) > 0) {
    line.qty -= 1;
  }
}

function removeDraftItem(msg: ChatMessage, index: number) {
  if (msg.orderDraft?.items) {
    msg.orderDraft.items.splice(index, 1);
  }
}

function calcLineSubtotal(line: any): number {
  const qty = Number(line?.qty) || 0;
  const price = Number(line?.price) || 0;
  const discount = Number(line?.discount) || 0;
  return Math.round(qty * price * (1 - discount / 100));
}

function calcDraftUndiscountedTotal(draft: any): number {
  if (!draft || !draft.items) return 0;
  return draft.items.reduce((sum: number, l: any) => {
    const qty = Number(l.qty) || 0;
    const basePrice = (l.originalPrice && Number(l.originalPrice) > 0) ? Number(l.originalPrice) : (Number(l.price) || 0);
    return sum + (qty * basePrice);
  }, 0);
}

function calcDraftTotal(draft: any): number {
  if (!draft || !draft.items) return 0;
  return draft.items.reduce((sum: number, l: any) => sum + calcLineSubtotal(l), 0);
}

function openPickerForDraft(msg: ChatMessage) {
  activeDraftMessage.value = msg;
  showPickerForDraft.value = true;
}

function onProductFromPickerForDraft(product: OdooProduct, addQty: number = 1) {
  if (!activeDraftMessage.value?.orderDraft) return;
  const draft = activeDraftMessage.value.orderDraft;
  const odooProductId = Number(product.odoo_id || product.id);

  const existing = draft.items.find(
    (l) => Number(l.product?.odoo_id || l.product?.id) === odooProductId
  );

  const basePrice = product.wholesale_price || product.list_price || 0;
  if (existing) {
    existing.qty += (typeof addQty === 'number' && addQty >= 0 ? addQty : 1);
  } else {
    draft.items.push({
      product: {
        ...product,
        id: odooProductId,
      },
      productNameRaw: product.name,
      sku: product.default_code || product.sku || null,
      qty: typeof addQty === 'number' && addQty >= 0 ? addQty : 1,
      price: basePrice,
      originalPrice: basePrice,
      discountedPrice: null,
      discount: 0,
    });
  }

  copySnackbarText.value = `Đã thêm "${product.name}" vào đơn!`;
  showCopySnackbar.value = true;
}

async function submitDraftOrder(msg: ChatMessage) {
  if (!msg.orderDraft || msg.orderDraft.orderCreated) return;
  const draft = msg.orderDraft;

  if (!props.contact?.customerId) {
    copySnackbarText.value = 'Khách hàng này chưa có mã Odoo! Vui lòng cập nhật thông tin khách trước.';
    showCopySnackbar.value = true;
    return;
  }

  const payloadLines = draft.items
    .filter(l => l.product?.id != null && Number(l.qty) >= 0)
    .map(l => ({
      product_id: Number(l.product!.odoo_id || l.product!.id),
      product_uom_qty: Number(l.qty) || 0,
      price_unit: l.price,
      discount: l.discount || 0,
    }));

  if (payloadLines.length === 0) {
    copySnackbarText.value = 'Vui lòng chọn ít nhất 1 sản phẩm!';
    showCopySnackbar.value = true;
    return;
  }

  draft.submitting = true;
  try {
    const payload = {
      partner_id: parseInt(props.contact.customerId),
      contactId: props.contact.id,
      conversationId: props.conversation?.id,
      notes: draft.notes || undefined,
      payment_term_id: draft.paymentTermId || undefined,
      order_line: payloadLines,
    };

    const res = await api.post('/odoo/orders', payload);
    if (res.data?.success) {
      draft.orderCreated = true;
      draft.orderCode = res.data.orderCode;
      copySnackbarText.value = `🎉 Tạo đơn thành công: ${res.data.orderCode}`;
      showCopySnackbar.value = true;
      emit('orderCreated', res.data);
    }
  } catch (err: any) {
    console.error('[submitDraftOrder error]', err);
    copySnackbarText.value = err.response?.data?.error || 'Lỗi khi tạo đơn sang Odoo';
    showCopySnackbar.value = true;
  } finally {
    draft.submitting = false;
  }
}

// ── Send message to chatbot / Handle Order Intent ────────────────────────────
async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || isLoading.value) return;

  const requestStartTime = Date.now();
  messages.value.push({ role: 'user', content: text });
  inputText.value = '';
  isLoading.value = true;
  scrollToBottom();

  if (!activeSessionId.value) {
    activeSessionId.value = generateUUID();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // A. CHẾ ĐỘ TẠO / SỬA ĐƠN HÀNG (ĐƯỢC BẬT QUA NÚT ICON GIỎ HÀNG)
  const isExplicitOrderCommand = /\b(tạo đơn|tao don|lên đơn|len don|lập đơn|lap don|bóc tách đơn|boc tach don|tạo order|lên order)\b/i.test(text);

  // ─────────────────────────────────────────────────────────────────────────────
  // A. CHẾ ĐỘ TẠO / SỬA ĐƠN HÀNG (KHI BẬT NÚT HOẶC CÂU LỆNH YÊU CẦU TẠO ĐƠN RÕ RÀNG)
  // ─────────────────────────────────────────────────────────────────────────────
  if (isOrderMode.value || isExplicitOrderCommand) {
    // 1. Kiểm tra nếu tin nhắn trợ lý trước đó là 1 phiếu đơn hàng nháp -> SỬA ĐƠN HÀNG
    const lastAssistantMsg = [...messages.value].slice(0, -1).filter(m => m.role === 'assistant').pop();
    const hasActiveDraft = !!(lastAssistantMsg?.orderDraft && !lastAssistantMsg.orderDraft.orderCreated);
    const activeDraft = hasActiveDraft ? lastAssistantMsg!.orderDraft : null;

    if (hasActiveDraft && activeDraft && activeDraft.items && activeDraft.items.length > 0) {
      messages.value.push({
        role: 'assistant',
        content: '🔍 Đang điều chỉnh đơn hàng theo yêu cầu của bạn...',
        orderDraft: null,
      });
      const assistantMsgIndex = messages.value.length - 1;
      scrollToBottom();

      try {
        await fetchProducts();

        const res = await api.post('/orders/ai-modify-draft', {
          currentDraft: activeDraft,
          instruction: text,
        });

        const updatedDraft = res.data?.draft;
        const explanation = res.data?.explanation || 'Tôi đã cập nhật đơn hàng theo yêu cầu của bạn:';

        if (updatedDraft && Array.isArray(updatedDraft.items)) {
          const enrichedItems = updatedDraft.items.map((it: any) => {
            let matched: OdooProduct | null = null;
            if (it.matchedProductOdooId) {
              matched = products.value.find(p => Number(p.odoo_id || p.id) === it.matchedProductOdooId) || null;
            }
            if (!matched && it.sku) {
              matched = products.value.find(p => (p.default_code || p.sku || '').toLowerCase() === it.sku.toLowerCase()) || null;
            }
            const origPrice = it.originalPrice || matched?.wholesale_price || matched?.list_price || null;
            const discPrice = it.discountedPrice || null;
            const finalPrice = discPrice || it.priceUnit || it.price || matched?.wholesale_price || matched?.list_price || 0;
            return {
              product: matched ? { ...matched, id: Number(matched.odoo_id || matched.id) } : null,
              productNameRaw: it.productNameRaw || matched?.name || 'Sản phẩm',
              sku: matched?.default_code || matched?.sku || it.sku || null,
              qty: it.quantity ?? 0,
              price: finalPrice,
              originalPrice: origPrice,
              discountedPrice: discPrice,
              discount: it.discount || 0,
              aiConfidence: it.confidence,
            };
          });

          const validItems = enrichedItems.filter((it: any) => it.product?.id != null && it.price > 0);

          messages.value[assistantMsgIndex].content = explanation;
          messages.value[assistantMsgIndex].thinking = updatedDraft.thinking || null;
          messages.value[assistantMsgIndex].showThinking = false;
          messages.value[assistantMsgIndex].orderDraft = {
            thinking: updatedDraft.thinking || null,
            customer: {
              name: updatedDraft.customer?.name || activeDraft.customer?.name || null,
              phone: updatedDraft.customer?.phone || activeDraft.customer?.phone || null,
              shippingAddress: updatedDraft.customer?.shippingAddress || activeDraft.customer?.shippingAddress || null,
            },
            items: validItems,
            notes: updatedDraft.notes || activeDraft.notes || null,
            missingInfo: updatedDraft.missingInfo || [],
            orderCreated: false,
          };

          if (lastAssistantMsg) {
            lastAssistantMsg.orderDraft = messages.value[assistantMsgIndex].orderDraft;
          }
        } else {
          messages.value[assistantMsgIndex].content = explanation;
          messages.value[assistantMsgIndex].thinking = updatedDraft?.thinking || null;
        }

        // Persist to ChatBot database
        if (activeSessionId.value) {
          fetch(`${CHATBOT_API_BASE}/api/conversations/${activeSessionId.value}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'user', content: text }),
          }).catch(e => console.warn('Cannot persist user edit message:', e));

          fetch(`${CHATBOT_API_BASE}/api/conversations/${activeSessionId.value}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: 'assistant',
              content: messages.value[assistantMsgIndex].content,
              metadata: {
                thinking: messages.value[assistantMsgIndex].thinking,
                orderDraft: messages.value[assistantMsgIndex].orderDraft,
              },
            }),
          }).catch(e => console.warn('Cannot persist assistant edit message:', e));

          fetchSessions();
        }
      } catch (err: any) {
        console.error('[AI Order modification error]', err);
        messages.value[assistantMsgIndex].content = `⚠️ Lỗi khi chỉnh sửa đơn hàng: ${err.response?.data?.error || err.message}`;
      } finally {
        messages.value[assistantMsgIndex].duration = ((Date.now() - requestStartTime) / 1000).toFixed(1);
        isLoading.value = false;
        scrollToBottom();
      }
      return;
    }

    // 2. Không có phiếu nháp đang mở -> TẠO PHIẾU ĐƠN HÀNG MỚI
    const hasConversation = !!props.conversation?.id;
    const mode = hasConversation ? 'conversation' : 'text';

    messages.value.push({
      role: 'assistant',
      content: mode === 'text' 
        ? '🔍 Đang trích xuất đơn hàng từ thông tin bạn vừa nhập...' 
        : '🔍 Đang phân tích tin nhắn Zalo để bóc tách đơn hàng...',
      orderDraft: null,
    });
    const assistantMsgIndex = messages.value.length - 1;
    scrollToBottom();

    try {
      await fetchProducts();

      const res = await api.post('/orders/ai-extract', {
        mode: mode,
        conversationId: props.conversation?.id,
        text: text,
        customerName: customerName.value,
        customerPhone: customerPhone.value,
        customerAddress: customerAddress.value,
        customerId: customerOdooId.value,
      });

      const draft = res.data?.draft;
      if (draft && Array.isArray(draft.items)) {
        const enrichedItems = draft.items.map((it: any) => {
          let matched: OdooProduct | null = null;
          if (it.matchedProductOdooId) {
            matched = products.value.find(p => Number(p.odoo_id || p.id) === it.matchedProductOdooId) || null;
          }
          if (!matched && it.sku) {
            matched = products.value.find(p => (p.default_code || p.sku || '').toLowerCase() === it.sku.toLowerCase()) || null;
          }
          const origPrice = it.originalPrice || matched?.wholesale_price || matched?.list_price || null;
          const discPrice = it.discountedPrice || null;
          const finalPrice = discPrice || it.priceUnit || it.price || matched?.wholesale_price || matched?.list_price || 0;
          return {
            product: matched ? { ...matched, id: Number(matched.odoo_id || matched.id) } : null,
            productNameRaw: it.productNameRaw || matched?.name || 'Sản phẩm',
            sku: matched?.default_code || matched?.sku || it.sku || null,
            qty: it.quantity || 1,
            price: finalPrice,
            originalPrice: origPrice,
            discountedPrice: discPrice,
            discount: it.discount || 0,
            aiConfidence: it.confidence,
          };
        });

        const validItems = enrichedItems.filter((it: any) => it.product?.id != null && it.price > 0);
        const cName = draft.customer?.name || customerName.value || 'khách hàng';

        messages.value[assistantMsgIndex].thinking = draft.thinking || null;
        messages.value[assistantMsgIndex].showThinking = false;

        if (validItems.length > 0) {
          messages.value[assistantMsgIndex].content = mode === 'text'
            ? `Tôi đã lập **phiếu đơn hàng** theo thông tin bạn vừa yêu cầu cho **${cName}**. Bạn có thể kiểm tra số lượng, thêm/xóa sản phẩm và bấm **Xác nhận tạo đơn**:`
            : `Tôi đã kiểm tra hội thoại và lập **phiếu đơn hàng đề xuất** cho **${cName}**. Bạn có thể điều chỉnh số lượng (+/-), thêm/xóa sản phẩm và bấm **Xác nhận tạo đơn**:`;

          messages.value[assistantMsgIndex].orderDraft = {
            thinking: draft.thinking || null,
            customer: {
              name: draft.customer?.name || customerName.value || null,
              phone: draft.customer?.phone || customerPhone.value || null,
              shippingAddress: draft.customer?.shippingAddress || customerAddress.value || null,
            },
            items: validItems,
            notes: draft.notes || null,
            missingInfo: draft.missingInfo || [],
            orderCreated: false,
          };
        } else {
          let msgText = mode === 'text'
            ? `⚠️ Không tìm thấy sản phẩm nào khớp trong danh mục kho của hệ thống.`
            : `⚠️ Không tìm thấy yêu cầu đặt hàng hợp lệ nào trong các tin nhắn.`;

          if (draft.missingInfo && draft.missingInfo.length > 0) {
            msgText += `\n- ${draft.missingInfo.join('\n- ')}`;
          }

          msgText += `\n\nBạn có thể bấm **"+ Thêm sản phẩm"** bên dưới để chọn trực tiếp từ danh mục nhé:`;

          messages.value[assistantMsgIndex].content = msgText;
          messages.value[assistantMsgIndex].orderDraft = {
            thinking: draft.thinking || null,
            customer: {
              name: draft.customer?.name || customerName.value || null,
              phone: draft.customer?.phone || customerPhone.value || null,
              shippingAddress: draft.customer?.shippingAddress || customerAddress.value || null,
            },
            items: [],
            notes: draft.notes || null,
            missingInfo: draft.missingInfo || [],
            orderCreated: false,
          };
        }
      } else {
        messages.value[assistantMsgIndex].content = '⚠️ Không thể bóc tách đơn hàng. Bạn có thể thử lại hoặc nhập rõ tên sản phẩm và số lượng nhé!';
      }

      // Persist to ChatBot database
      if (activeSessionId.value) {
        fetch(`${CHATBOT_API_BASE}/api/conversations/${activeSessionId.value}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'user',
            content: text,
          }),
        }).catch(e => console.warn('Cannot persist user order message:', e));

        fetch(`${CHATBOT_API_BASE}/api/conversations/${activeSessionId.value}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'assistant',
            content: messages.value[assistantMsgIndex].content,
            metadata: {
              thinking: messages.value[assistantMsgIndex].thinking,
              orderDraft: messages.value[assistantMsgIndex].orderDraft,
            },
          }),
        }).catch(e => console.warn('Cannot persist assistant order message:', e));

        fetchSessions();
      }
    } catch (err: any) {
      console.error('[AI Order extraction in Chat error]', err);
      messages.value[assistantMsgIndex].content = `⚠️ Lỗi khi bóc tách đơn hàng: ${err.response?.data?.error || err.message}`;
    } finally {
      messages.value[assistantMsgIndex].duration = ((Date.now() - requestStartTime) / 1000).toFixed(1);
      isLoading.value = false;
      scrollToBottom();
    }
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // B. CHẾ ĐỘ TRÒ CHUYỆN / HỎI THÔNG TIN BÌNH THƯỜNG (MẶC ĐỊNH KHI TẮT NÚT)
  // ─────────────────────────────────────────────────────────────────────────────

  messages.value.push({ role: 'assistant', content: '', dataframe: null, chart: null, orderDraft: null });
  const assistantMsgIndex = messages.value.length - 1;
  scrollToBottom();

  try {
    const enrichedQuestion = buildEnrichedQuestion(text);

    const res = await fetch(`${CHATBOT_API_BASE}/api/ai/chat_sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: enrichedQuestion,
        conversation_id: activeSessionId.value,
        request_id: generateUUID(),
        metadata: {
          customer_name: customerName.value,
          customer_phone: customerPhone.value,
          customer_id: customerOdooId.value || crmContactId.value,
          staff_name: staffName.value,
        }
      })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    const toolExecutionSteps: string[] = [];

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.replace(/^data:\s*/, '');
          if (dataStr === '[DONE]') break;

          try {
            const chunk = JSON.parse(dataStr);
            const rich = chunk.rich || chunk.rich_component;
            const simple = chunk.simple || chunk.simple_component;

            // 1. Rich Components
            if (rich) {
              const type = rich.type || rich.component_type;
              const data = rich.data || rich;

              // Tool execution card or status
              if (type === 'status_card' || rich.status || rich.title) {
                const title = rich.title || data?.title;
                const desc = rich.description || data?.description;
                const sql = rich.metadata?.sql || data?.metadata?.sql;
                if (sql) {
                  toolExecutionSteps.push(`⚡ Thực thi SQL:\n\`\`\`sql\n${sql}\n\`\`\``);
                } else if (title && !title.includes('Executing search_saved')) {
                  toolExecutionSteps.push(`⚙️ ${title}${desc ? `: ${desc}` : ''}`);
                }
              }

              // Dataframe
              if (type === 'dataframe' || data?.columns) {
                const df = data.dataframe || data;
                messages.value[assistantMsgIndex].dataframe = df;
              }

              // Plotly Chart
              if (type === 'chart' || type === 'plotly_chart' || data?.figure || data?.data) {
                const chartData = data.data || data.figure || data;
                messages.value[assistantMsgIndex].chart = chartData;
              }

              // Text Component
              if (type === 'text' && data?.content) {
                const rawText = data.content;
                if (!isToolOutput(rawText)) {
                  const { thinking, cleanContent } = extractThinkingFromText(rawText);
                  if (thinking) {
                    messages.value[assistantMsgIndex].thinking = thinking;
                  }
                  const cleaned = cleanAssistantText(cleanContent);
                  if (cleaned) {
                    messages.value[assistantMsgIndex].content = cleaned;
                    scrollToBottom();
                  }
                }
              }
            }

            // 2. Simple Component Text
            if (simple && simple.text) {
              const rawText = simple.text;
              if (!isToolOutput(rawText)) {
                const { thinking, cleanContent } = extractThinkingFromText(rawText);
                if (thinking) {
                  messages.value[assistantMsgIndex].thinking = thinking;
                }
                const cleaned = cleanAssistantText(cleanContent);
                if (cleaned) {
                  messages.value[assistantMsgIndex].content = cleaned;
                  scrollToBottom();
                }
              }
            }

            // 3. Raw chunk content if any
            if (chunk.content) {
              const { thinking, cleanContent } = extractThinkingFromText(chunk.content);
              if (thinking) {
                messages.value[assistantMsgIndex].thinking = (messages.value[assistantMsgIndex].thinking ? messages.value[assistantMsgIndex].thinking + '\n' : '') + thinking;
              }
              if (cleanContent) {
                messages.value[assistantMsgIndex].content += cleanContent;
                scrollToBottom();
              }
            }
          } catch {
            // Ignore non-json lines
          }
        }
      }
    }

    // Final pass on full accumulated content to extract thinking / order draft / clean content
    if (messages.value[assistantMsgIndex].content) {
      const { thinking, cleanContent: afterThink } = extractThinkingFromText(messages.value[assistantMsgIndex].content);
      if (thinking && !messages.value[assistantMsgIndex].thinking) {
        messages.value[assistantMsgIndex].thinking = thinking;
      }
      const { draft, cleanContent: afterDraft } = extractOrderDraftFromText(afterThink);
      if (draft && !messages.value[assistantMsgIndex].orderDraft) {
        const enrichedItems = (draft.items || []).map((it: any) => {
          const prodObj = it.product || it;
          let matched = products.value.find(p => Number(p.odoo_id || p.id) === Number(prodObj.id || prodObj.odoo_id)) || null;
          if (!matched && (prodObj.sku || prodObj.default_code)) {
            const s = (prodObj.sku || prodObj.default_code || '').toLowerCase();
            matched = products.value.find(p => (p.default_code || p.sku || '').toLowerCase() === s) || null;
          }
          const origPrice = it.originalPrice || prodObj.wholesale_price || prodObj.list_price || null;
          const discPrice = it.discountedPrice || null;
          const finalPrice = discPrice || it.price || it.priceUnit || prodObj.list_price || 0;
          return {
            product: matched ? { ...matched, id: Number(matched.odoo_id || matched.id) } : {
              id: prodObj.id || prodObj.odoo_id || 1001,
              name: prodObj.name || it.productNameRaw || 'Sản phẩm',
              sku: prodObj.sku || prodObj.default_code || it.sku || null,
              default_code: prodObj.default_code || prodObj.sku || null,
              list_price: prodObj.list_price || it.price || 0,
            },
            productNameRaw: it.productNameRaw || prodObj.name || 'Sản phẩm',
            sku: prodObj.sku || prodObj.default_code || it.sku || null,
            qty: Number(it.qty || it.quantity || 1),
            price: finalPrice,
            originalPrice: origPrice,
            discountedPrice: discPrice,
            discount: Number(it.discount || 0),
          };
        });

        messages.value[assistantMsgIndex].orderDraft = {
          thinking: messages.value[assistantMsgIndex].thinking || null,
          customer: {
            name: draft.customer?.name || customerName.value || null,
            phone: draft.customer?.phone || customerPhone.value || null,
            shippingAddress: draft.customer?.shippingAddress || customerAddress.value || null,
          },
          items: enrichedItems,
          notes: draft.notes || null,
          missingInfo: draft.missingInfo || [],
          orderCreated: false,
        };
      }
      messages.value[assistantMsgIndex].content = cleanAssistantText(afterDraft);
    }

    // Fallback if content is still empty
    if (!messages.value[assistantMsgIndex].content) {
      if (messages.value[assistantMsgIndex].dataframe) {
        messages.value[assistantMsgIndex].content = dataframeToMarkdownTable(messages.value[assistantMsgIndex].dataframe);
      } else {
        const cName = customerName.value;
        if (cName) {
          messages.value[assistantMsgIndex].content = `Tôi chưa tìm thấy thông tin đơn hàng hoặc chi tiêu nào được ghi nhận cho khách hàng **${cName}**. Bạn vui lòng cung cấp thêm thông tin chi tiết hơn nhé!`;
        } else {
          messages.value[assistantMsgIndex].content = 'Tôi chưa có đủ thông tin để trả lời câu hỏi này. Bạn vui lòng cung cấp thêm thông tin cụ thể (ví dụ: tên khách hàng, mã đơn hoặc sản phẩm) nhé!';
        }
      }
    }

    // If no thinking was generated by LLM, but we captured tool execution steps:
    if (!messages.value[assistantMsgIndex].thinking && toolExecutionSteps.length > 0) {
      messages.value[assistantMsgIndex].thinking = [
        '1. Đã nhận diện yêu cầu và đối chiếu ngữ cảnh hội thoại.',
        ...toolExecutionSteps.map((step, i) => `${i + 2}. ${step}`),
        `${toolExecutionSteps.length + 2}. Phân tích dữ liệu kết quả và phản hồi thông tin.`
      ].join('\n');
    }

    // Parse dataframe if available in markdown
    if (!messages.value[assistantMsgIndex].dataframe) {
      messages.value[assistantMsgIndex].dataframe = parseMarkdownTable(messages.value[assistantMsgIndex].content);
    }

    // Persist assistant message with metadata into SQLite conversation history
    if (activeSessionId.value) {
      fetch(`${CHATBOT_API_BASE}/api/conversations/${activeSessionId.value}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          content: messages.value[assistantMsgIndex].content,
          metadata: {
            thinking: messages.value[assistantMsgIndex].thinking || null,
            dataframe: messages.value[assistantMsgIndex].dataframe || null,
          }
        })
      }).catch(e => console.warn('Cannot persist assistant message metadata:', e));
    }

    await fetchSessions();
  } catch (error: any) {
    messages.value[assistantMsgIndex].content = `⚠️ Lỗi kết nối Chatbot (${error.message || 'Error'}). Vui lòng kiểm tra lại dịch vụ backend.`;
  } finally {
    const durationSec = Math.max(1, Math.round((Date.now() - requestStartTime) / 1000));
    messages.value[assistantMsgIndex].duration = durationSec;
    isLoading.value = false;
    scrollToBottom();
  }
}

onMounted(() => {
  fetchSessions();
});

defineExpose({
  sessions,
  activeSessionId,
  fetchSessions,
  loadSession,
  createNewSession,
  deleteSession
});
</script>

<style scoped>
/* ==========================================================================
   LIGHT MODE: PURE #FFFFFF (DEFAULT)
   ========================================================================== */
.chatbot-sidebar-container {
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  background-color: #FFFFFF !important;
  color: #0F172A !important;
  scrollbar-width: thin;
}

.chat-history {
  scrollbar-width: thin;
  padding: 14px 12px 24px 12px !important;
}
.chat-history::-webkit-scrollbar {
  width: 4px;
}
.chat-history::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
}

.message-row {
  margin-bottom: 18px;
}

/* User Bubble (Right-aligned, standard compact) */
.user-bubble-wrapper {
  max-width: 88%;
}

.user-bubble {
  background: #023D60 !important;
  color: #FFFFFF !important;
  border-radius: 8px;
  word-break: break-word;
  line-height: 1.45;
  box-shadow: none !important;
  font-weight: 500;
  padding: 10px 14px !important;
}

.user-actions {
  opacity: 0;
  transition: opacity 0.15s ease-in-out;
}
.user-bubble-wrapper:hover .user-actions {
  opacity: 1;
}

/* Unified Action Buttons with Light Padding */
.action-btn {
  background: #F1F5F9;
  border: 1px solid #CBD5E1;
  border-radius: 6px;
  padding: 4px 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s ease;
}
.action-btn:hover {
  background: #023D60;
  color: #FFFFFF;
  border-color: #023D60;
}

/* Assistant Message Wrapper */
.assistant-wrapper {
  max-width: calc(100% - 32px);
  margin-right: 32px;
}

.assistant-card {
  background: #F8FAFC !important;
  border: 1px solid #E2E8F0 !important;
  border-radius: 8px;
  box-shadow: none !important;
  color: #0F172A !important;
  padding: 12px 14px !important;
  word-break: break-word;
  width: 100%;
}

.loading-text {
  color: #64748B;
}

/* Assistant Actions visible ONLY on Hover */
.assistant-external-actions {
  font-size: 11px;
  opacity: 0;
  transition: opacity 0.15s ease-in-out;
}
.assistant-wrapper:hover .assistant-external-actions {
  opacity: 1;
}

.execution-time {
  color: #64748B;
}

/* Welcome Screen in Light Mode */
.welcome-title {
  font-family: 'Space Grotesk', 'Plus Jakarta Sans', sans-serif;
  color: #023D60;
}

.welcome-subtitle {
  color: #64748B;
}

/* Input Section in Light Mode */
.input-section {
  background: #F8FAFC !important;
  border-top: 1px solid #E2E8F0 !important;
  padding: 10px 12px 14px 12px !important;
}

.input-box-wrapper {
  background: #FFFFFF !important;
  border: 1px solid #CBD5E1 !important;
  border-radius: 8px;
  min-height: 38px;
}

.sidebar-chat-input {
  background: transparent;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  color: #0F172A !important;
  min-width: 0;
  -webkit-appearance: none;
  padding: 4px 8px;
}

.sidebar-chat-input:focus,
.sidebar-chat-input:focus-visible,
.sidebar-chat-input:active {
  outline: none !important;
  box-shadow: none !important;
  border: none !important;
}

.sidebar-chat-input::placeholder {
  color: #94A3B8 !important;
}

.send-btn {
  background: #023D60 !important;
  color: #FFFFFF !important;
  width: 28px !important;
  height: 28px !important;
  border-radius: 6px !important;
  border: none !important;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.send-btn:hover:not(:disabled) {
  background: #035282 !important;
}
.send-btn:disabled {
  opacity: 0.35 !important;
  cursor: not-allowed;
}

/* Order Mode Toggle Button */
.order-mode-toggle-btn {
  width: 28px !important;
  height: 28px !important;
  border-radius: 6px !important;
  border: 1px solid transparent !important;
  background: transparent !important;
  color: #64748B !important;
  cursor: pointer;
  transition: all 0.15s ease;
}
.order-mode-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  color: #0F172A !important;
}
.order-mode-toggle-btn.is-active {
  background: #10B981 !important;
  color: #FFFFFF !important;
  box-shadow: 0 1px 3px rgba(16, 185, 129, 0.35);
}

.input-box-wrapper.is-order-mode {
  border-color: #10B981 !important;
  box-shadow: 0 0 0 1.5px rgba(16, 185, 129, 0.25) !important;
}

/* Dark Mode Overrides for Order Mode */
.is-dark .order-mode-toggle-btn {
  color: #94A3B8 !important;
}
.is-dark .order-mode-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.08) !important;
  color: #F8FAFC !important;
}
.is-dark .order-mode-toggle-btn.is-active {
  background: #059669 !important;
  color: #FFFFFF !important;
}

/* Markdown and Tables in Light Mode */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  margin-top: 10px;
  margin-bottom: 6px;
  color: #023D60;
  line-height: 1.3;
}

.markdown-body :deep(p) {
  margin-bottom: 8px;
  line-height: 1.5;
  color: #0F172A;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(strong) {
  font-weight: 700;
  color: #023D60;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 20px;
  margin-bottom: 8px;
}
.markdown-body :deep(li) {
  margin-bottom: 4px;
  line-height: 1.45;
}

/* Inline Tables in sidebar (Light Mode) */
.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
  font-size: 12px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #E2E8F0;
  display: table;
}

.markdown-body :deep(th) {
  background: #023D60 !important;
  color: #FFFFFF !important;
  padding: 6px 8px;
  text-align: left;
  font-weight: 600;
  font-size: 11.5px;
}

.markdown-body :deep(td) {
  padding: 6px 8px;
  border-bottom: 1px solid #E2E8F0;
  background-color: #FFFFFF;
  color: #0F172A;
}

.markdown-body :deep(tr:nth-child(even) td) {
  background-color: #F8FAFC;
}

.markdown-body :deep(tr:hover td) {
  background-color: #F1F5F9;
}

.markdown-body :deep(code) {
  font-family: 'Space Mono', Consolas, monospace;
  background-color: rgba(2, 61, 96, 0.08);
  color: #023D60;
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 12px;
}

.markdown-body :deep(pre) {
  background: #F1F5F9;
  padding: 10px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
}

.markdown-body :deep(pre code) {
  background: transparent;
  padding: 0;
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid #15A8A8;
  padding-left: 10px;
  margin: 8px 0;
  color: #64748B;
  font-style: italic;
}


/* ==========================================================================
   DARK MODE: #252522 THEME OVERRIDES
   ========================================================================== */
.chatbot-sidebar-container.is-dark {
  background-color: #252522 !important;
  background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1.2px, transparent 1.2px) !important;
  background-size: 24px 24px;
  color: #F8FAFC !important;
}

.is-dark .chat-history::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.15);
}

.is-dark .action-btn {
  background: #383834;
  border-color: rgba(255, 255, 255, 0.18);
  color: #CBD5E1;
}
.is-dark .action-btn:hover {
  background: #38BDF8;
  color: #0F172A;
  border-color: #38BDF8;
}

.is-dark .assistant-card {
  background: #2D2D29 !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  color: #F8FAFC !important;
  padding: 12px 14px !important;
}

.is-dark .loading-text,
.is-dark .execution-time,
.is-dark .welcome-subtitle {
  color: #94A3B8;
}

.is-dark .welcome-title {
  color: #38BDF8;
}

.is-dark .input-section {
  background: #1F1F1C !important;
  border-top-color: rgba(255, 255, 255, 0.08) !important;
}

.is-dark .input-box-wrapper {
  background: #2D2D29 !important;
  border-color: rgba(255, 255, 255, 0.14) !important;
}

.is-dark .sidebar-chat-input {
  color: #F8FAFC !important;
}
.is-dark .sidebar-chat-input::placeholder {
  color: rgba(255, 255, 255, 0.45) !important;
}

.is-dark .markdown-body :deep(h1),
.is-dark .markdown-body :deep(h2),
.is-dark .markdown-body :deep(h3),
.is-dark .markdown-body :deep(h4) {
  color: #38BDF8;
}

.is-dark .markdown-body :deep(p) {
  color: #F8FAFC;
}
.is-dark .markdown-body :deep(strong) {
  color: #FFFFFF;
}

.is-dark .markdown-body :deep(table) {
  border-color: rgba(255, 255, 255, 0.1);
}
.is-dark .markdown-body :deep(td) {
  border-bottom-color: rgba(255, 255, 255, 0.06);
  background-color: #2D2D29;
  color: #F8FAFC;
}
.is-dark .markdown-body :deep(tr:nth-child(even) td) {
  background-color: #252522;
}
.is-dark .markdown-body :deep(tr:hover td) {
  background-color: rgba(21, 168, 168, 0.18);
}
.is-dark .markdown-body :deep(code) {
  background-color: rgba(21, 168, 168, 0.15);
  color: #38BDF8;
}
.is-dark .markdown-body :deep(pre) {
  background: #1C1C1A;
}
.is-dark .markdown-body :deep(blockquote) {
  color: #94A3B8;
}


/* ==========================================================================
   DATA MODAL STYLES (HIGH CONTRAST IN BOTH LIGHT & DARK MODES)
   ========================================================================== */
.data-modal-card {
  background: #FFFFFF !important;
  color: #0F172A !important;
  font-family: 'Plus Jakarta Sans', sans-serif;
  border: 1px solid rgba(0, 0, 0, 0.12);
}
.data-modal-card.is-dark {
  background: #252522 !important;
  color: #F8FAFC !important;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.data-modal-header {
  background: #F8FAFC;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
.data-modal-card.is-dark .data-modal-header {
  background: #252522;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-title {
  font-family: 'Space Grotesk', sans-serif;
  color: #023D60;
}
.data-modal-card.is-dark .modal-title {
  color: #F8FAFC;
}

/* High Contrast Tab Switcher */
.modal-tab-group {
  background: #E2E8F0;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  padding: 3px;
  gap: 3px;
}
.data-modal-card.is-dark .modal-tab-group {
  background: #181816;
  border-color: rgba(255, 255, 255, 0.14);
}

.modal-tab-btn {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: #334155;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}
.modal-tab-btn:hover {
  color: #0F172A;
  background: rgba(0, 0, 0, 0.05);
}
.modal-tab-btn.is-active {
  background: #023D60 !important;
  color: #FFFFFF !important;
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.data-modal-card.is-dark .modal-tab-btn {
  color: #CBD5E1;
}
.data-modal-card.is-dark .modal-tab-btn:hover {
  color: #FFFFFF;
  background: rgba(255, 255, 255, 0.08);
}
.data-modal-card.is-dark .modal-tab-btn.is-active {
  background: #38BDF8 !important;
  color: #0F172A !important;
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.modal-close-btn {
  background: transparent;
  border: none;
  border-radius: 6px;
  padding: 4px;
  color: #64748B;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.modal-close-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #0F172A;
}
.data-modal-card.is-dark .modal-close-btn {
  color: #94A3B8;
}
.data-modal-card.is-dark .modal-close-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #F8FAFC;
}

.search-box-wrapper {
  background: #FFFFFF;
  border-color: #CBD5E1 !important;
}
.data-modal-card.is-dark .search-box-wrapper {
  background: #2D2D29;
  border-color: rgba(255, 255, 255, 0.15) !important;
}

.modal-search-input {
  color: #0F172A;
}
.data-modal-card.is-dark .modal-search-input {
  color: #F8FAFC;
}

.table-count-text {
  color: #64748B;
}
.data-modal-card.is-dark .table-count-text {
  color: #94A3B8;
}

.btn-export-csv {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 600;
  background: #023D60;
  color: #FFFFFF;
  border: none;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.btn-export-csv:hover {
  background: #01243A;
}
.data-modal-card.is-dark .btn-export-csv {
  background: #38BDF8;
  color: #0F172A;
}
.data-modal-card.is-dark .btn-export-csv:hover {
  background: #7DD3FC;
}

.modal-interactive-table {
  border-collapse: collapse;
  font-size: 13px;
}
.modal-interactive-table th {
  background: #023D60 !important;
  color: #FFFFFF !important;
  padding: 10px 14px;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 2;
}

.modal-interactive-table td {
  padding: 9px 14px;
  border-bottom: 1px solid #E2E8F0;
  background-color: #FFFFFF;
  color: #0F172A;
}
.modal-interactive-table tr:nth-child(even) td {
  background-color: #F8FAFC;
}
.modal-interactive-table tr:hover td {
  background-color: #F1F5F9;
}

.data-modal-card.is-dark .modal-interactive-table th {
  background: #01243A !important;
  color: #FFFFFF !important;
}
.data-modal-card.is-dark .modal-interactive-table td {
  padding: 9px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background-color: #2D2D29;
  color: #F8FAFC;
}
.data-modal-card.is-dark .modal-interactive-table tr:nth-child(even) td {
  background-color: #252522;
}
.data-modal-card.is-dark .modal-interactive-table tr:hover td {
  background-color: rgba(56, 189, 248, 0.15);
}

/* ==========================================================================
   INTERACTIVE ORDER FORM CARD IN CHATBOT
   ========================================================================== */
.order-draft-card {
  border: 1px solid var(--color-chalk, #e2e8f0) !important;
  background-color: #ffffff;
}

.is-dark .order-draft-card {
  border-color: rgba(255, 255, 255, 0.12) !important;
  background-color: #2a2a26 !important;
}

.order-draft-header {
  background-color: rgba(0, 0, 0, 0.02);
}

.is-dark .order-draft-header {
  background-color: rgba(255, 255, 255, 0.03);
}

.font-size-11 {
  font-size: 11px !important;
}

.chat-product-card {
  background-color: #ffffff;
  border: 1px solid #e2e8f0 !important;
  border-radius: 14px !important;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px 0 rgba(0, 0, 0, 0.02);
}

.is-dark .chat-product-card {
  background-color: #2b2b27 !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.2);
}

.chat-product-img-box {
  width: 52px;
  height: 52px;
  border-radius: 10px !important;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f8fafc;
}

.is-dark .chat-product-img-box {
  border-color: rgba(255, 255, 255, 0.12);
  background-color: rgba(0, 0, 0, 0.25);
}

.chat-product-img-render {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-product-name-title {
  font-size: 14px;
  color: #0f172a;
  letter-spacing: -0.1px;
}

.is-dark .chat-product-name-title {
  color: #f8fafc;
}

.chat-delete-line-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.chat-delete-line-btn:hover {
  color: #ef4444;
  background-color: rgba(239, 68, 68, 0.1);
}

/* Dashed divider between product header and price row */
.chat-product-dashed-divider {
  border-top: 1px dashed #cbd5e1 !important;
  width: 100%;
}

.is-dark .chat-product-dashed-divider {
  border-top: 1px dashed rgba(255, 255, 255, 0.15) !important;
}

.chat-unit-price {
  font-size: 13.5px;
  color: #0f172a;
}

.is-dark .chat-unit-price {
  color: #f8fafc;
}

/* Stepper [- 1 +] */
.chat-quantity-stepper {
  border: 1px solid #cbd5e1 !important;
  border-radius: 8px !important;
  height: 30px;
  background-color: #ffffff;
}

.is-dark .chat-quantity-stepper {
  border-color: rgba(255, 255, 255, 0.2) !important;
  background-color: #252522 !important;
}

.chat-stepper-btn {
  background: transparent;
  border: none;
  width: 28px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #64748b;
  transition: background-color 0.15s ease;
}

.chat-stepper-btn:hover:not(:disabled) {
  background-color: rgba(0, 0, 0, 0.06);
  color: #0f172a;
}

.is-dark .chat-stepper-btn:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.12);
  color: #f8fafc;
}

.chat-stepper-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.chat-stepper-input {
  width: 36px;
  height: 100%;
  font-size: 13px;
  border: none;
  outline: none;
  border-left: 1px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
  background: transparent;
  color: #0f172a;
  appearance: textfield;
  -moz-appearance: textfield;
}

.chat-stepper-input::-webkit-outer-spin-button,
.chat-stepper-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.is-dark .chat-stepper-input {
  border-left-color: rgba(255, 255, 255, 0.15);
  border-right-color: rgba(255, 255, 255, 0.15);
  color: #f8fafc;
}

.chat-line-subtotal {
  font-size: 14px;
  letter-spacing: -0.1px;
}

.total-draft-amount {
  font-size: 16px;
  letter-spacing: -0.2px;
}
</style>

