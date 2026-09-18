<template>
  <v-dialog :model-value="modelValue" max-width="960" :fullscreen="$vuetify.display.xs" scrollable @update:model-value="$emit('update:modelValue', $event)">
    <v-card class="order-detail-card rounded-lg">
      <!-- Dialog Header -->
      <v-card-item class="border-b py-3 px-6 bg-surface">
        <div class="d-flex align-center justify-space-between w-100 flex-wrap gap-2">
          <div class="d-flex align-center gap-2">
            <v-avatar color="primary" variant="tonal" size="36">
              <v-icon icon="lucide-file-text" size="18" />
            </v-avatar>
            <div>
              <div class="d-flex align-center gap-2">
                <span class="text-h6 font-weight-bold font-monospace">{{ order?.orderCode }}</span>
                <v-btn icon size="x-small" variant="text" color="grey" title="Sao chép mã đơn" @click="copyOrderCode">
                  <v-icon size="14">lucide-copy</v-icon>
                </v-btn>
              </div>
              <!-- Order Metadata: Created at + Last Edited & Modifier -->
              <div class="text-caption text-medium-emphasis d-flex align-center flex-wrap gap-x-2 gap-y-0.5">
                <span>Odoo ID: #{{ order?.odooOrderId }}</span>
                <span>•</span>
                <span>Tạo lúc: {{ formatDateTime(order?.dateOrder) }}</span>
                <template v-if="order?.writeDate || order?.updatedAt">
                  <span>•</span>
                  <span class="text-primary font-weight-medium">
                    Sửa cuối: {{ formatDateTime(order?.writeDate || order?.updatedAt) }}
                  </span>
                  <span v-if="order?.writeUserName" class="text-teal-darken-2 font-weight-medium">
                    ({{ order.writeUserName }})
                  </span>
                </template>
              </div>
            </div>
          </div>

          <div class="d-flex align-center gap-2 flex-wrap">
            <!-- Nút Xác nhận đơn (chuyển Báo giá thành Đơn hàng) -->
            <v-btn
              v-if="!isEditing && canConfirmQuotation"
              size="small"
              color="success"
              variant="flat"
              prepend-icon="lucide-check-circle-2"
              class="text-none font-weight-bold mr-1"
              :loading="confirmingQuotation"
              @click="promptConfirmQuotation"
            >
              Xác nhận đơn
            </v-btn>

            <!-- Edit Mode Toggle Button -->
            <v-btn
              v-if="!isEditing && order"
              size="small"
              color="primary"
              variant="tonal"
              prepend-icon="lucide-edit-3"
              class="text-none font-weight-bold mr-1"
              @click="startEdit"
            >
              Chỉnh sửa
            </v-btn>

            <v-chip v-if="order" size="small" :color="stateColor(order.state)" variant="flat" class="font-weight-medium">
              {{ stateLabel(order.state) }}
            </v-chip>
            <v-chip v-if="order?.deliveryStatus" size="small" :color="deliveryStatusColor(order.deliveryStatus)" variant="tonal">
              <v-icon start size="14">lucide-truck</v-icon>
              {{ deliveryStatusLabel(order.deliveryStatus) }}
            </v-chip>
            <v-chip v-if="order?.invoiceStatus" size="small" :color="invoiceStatusColor(order.invoiceStatus)" variant="tonal">
              <v-icon start size="14">lucide-receipt</v-icon>
              {{ invoiceStatusLabel(order.invoiceStatus) }}
            </v-chip>
            <v-btn icon size="small" variant="text" @click="$emit('update:modelValue', false)">
              <v-icon size="18">lucide-x</v-icon>
            </v-btn>
          </div>
        </div>
      </v-card-item>

      <v-card-text :class="isMobile ? 'pa-3' : 'pa-6'" style="max-height: 75vh;">
        <!-- Loading State -->
        <div v-if="loading" class="text-center py-12">
          <v-progress-circular indeterminate color="primary" size="48" />
          <div class="text-body-2 text-medium-emphasis mt-3">Đang tải chi tiết đơn hàng...</div>
        </div>

        <div v-else-if="order">
          <!-- Information Grid -->
          <v-row class="mb-4">
            <!-- Customer Info -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="h-100 rounded-lg info-box">
                <v-card-title class="text-subtitle-2 font-weight-bold d-flex align-center gap-2 pb-2">
                  <v-icon color="primary" size="16">lucide-user</v-icon>
                  Thông tin khách hàng
                </v-card-title>
                <v-divider />
                <v-card-text class="pa-4 text-body-2 space-y-2">
                  <div class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Tên khách hàng:</span>
                    <span class="font-weight-medium text-right">{{ order.partnerName || order.customerProfile?.name || '—' }}</span>
                  </div>
                  <div v-if="order.customerProfile?.phone" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Số điện thoại:</span>
                    <span class="font-weight-medium">{{ order.customerProfile.phone }}</span>
                  </div>
                  <div v-if="order.customerProfile?.email" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Email:</span>
                    <span>{{ order.customerProfile.email }}</span>
                  </div>
                  <div v-if="order.customerProfile?.city" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Khu vực / Tỉnh thành:</span>
                    <span>{{ order.customerProfile.city }}</span>
                  </div>
                  <div class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Bảng giá:</span>
                    <span>{{ order.pricelistName || 'Mặc định' }}</span>
                  </div>
                  <div v-if="order.paymentTerm" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Điều khoản thanh toán:</span>
                    <span class="font-weight-medium text-teal-darken-1">{{ order.paymentTerm }}</span>
                  </div>
                </v-card-text>
              </v-card>
            </v-col>

            <!-- Sales & Operation Info -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="h-100 rounded-lg info-box">
                <v-card-title class="text-subtitle-2 font-weight-bold d-flex align-center gap-2 pb-2">
                  <v-icon color="teal" size="16">lucide-store</v-icon>
                  Vận hành & Kinh doanh
                </v-card-title>
                <v-divider />
                <v-card-text class="pa-4 text-body-2 space-y-2">
                  <div class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Nhân viên phụ trách:</span>
                    <span class="font-weight-medium text-primary">{{ order.salesperson || order.customerProfile?.salesperson || 'Chưa phân công' }}</span>
                  </div>
                  <div class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Kho xuất hàng:</span>
                    <span class="font-weight-medium">{{ order.warehouseName || 'TPHCM' }}</span>
                  </div>
                  <div v-if="order.expectedDate" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Ngày dự kiến giao:</span>
                    <span>{{ formatDate(order.expectedDate) }}</span>
                  </div>
                  <div v-if="order.validityDate" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Hạn hiệu lực:</span>
                    <span>{{ formatDate(order.validityDate) }}</span>
                  </div>
                  <!-- Hoạt động / Ghi chú giao việc -->
                  <div class="d-flex justify-space-between align-start py-1 gap-2">
                    <span class="text-medium-emphasis flex-shrink-0" style="margin-top: 3px;">Ghi chú giao việc:</span>
                    <!-- View mode -->
                    <div v-if="!isEditing" class="d-flex align-start gap-1.5 flex-grow-1 justify-end ml-2">
                      <template v-if="order.activitySummary">
                        <div
                          class="activity-summary-badge d-inline-flex align-start"
                          :title="order.activitySummary"
                        >
                          <v-icon size="13" color="amber-darken-3" class="mr-1 flex-shrink-0" style="margin-top: 2px;">lucide-clipboard-list</v-icon>
                          <span>{{ order.activitySummary }}</span>
                        </div>
                        <div class="d-inline-flex align-center flex-shrink-0">
                          <v-btn
                            icon
                            size="24"
                            variant="text"
                            color="primary"
                            title="Sửa ghi chú giao việc"
                            @click="openActivityModal(order.activitySummary)"
                          >
                            <v-icon size="13">lucide-edit-2</v-icon>
                          </v-btn>
                          <v-btn
                            icon
                            size="24"
                            variant="text"
                            color="error"
                            title="Xóa ghi chú giao việc"
                            :loading="deletingActivity"
                            @click="deleteActivityNote"
                          >
                            <v-icon size="13">lucide-trash-2</v-icon>
                          </v-btn>
                        </div>
                      </template>
                      <template v-else>
                        <v-btn
                          size="x-small"
                          variant="tonal"
                          color="amber-darken-3"
                          prepend-icon="lucide-plus"
                          class="font-weight-medium text-none"
                          @click="openActivityModal('')"
                        >
                          Thêm giao việc
                        </v-btn>
                      </template>
                    </div>

                    <!-- Edit mode -->
                    <div v-else style="max-width: 230px;" class="flex-grow-1 ml-2">
                      <v-text-field
                        v-model="editedActivitySummary"
                        placeholder="Nhập ghi chú giao việc..."
                        variant="outlined"
                        density="compact"
                        hide-details
                        clearable
                        class="text-caption font-weight-medium"
                      />
                    </div>
                  </div>
                  <!-- Audit Info: Thời gian sửa cuối & Người sửa cuối -->
                  <div v-if="order.writeDate || order.updatedAt" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Sửa lần cuối:</span>
                    <span class="font-weight-medium text-primary">{{ formatDateTime(order.writeDate || order.updatedAt) }}</span>
                  </div>
                  <div v-if="order.writeUserName" class="d-flex justify-space-between">
                    <span class="text-medium-emphasis">Người sửa cuối:</span>
                    <span class="font-weight-medium text-teal-darken-1">{{ order.writeUserName }}</span>
                  </div>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>

          <!-- Order Lines Table -->
          <div class="mb-4">
            <div class="d-flex align-center justify-space-between mb-2 flex-wrap gap-2">
              <span class="text-subtitle-2 font-weight-bold d-flex align-center gap-2">
                <v-icon color="primary" size="16">lucide-package</v-icon>
                Danh sách sản phẩm ({{ isEditing ? editedLines.length : productLines.length }})
              </span>

              <!-- Secondary Action in Edit Mode: Thêm sản phẩm -->
              <v-btn
                v-if="isEditing"
                size="small"
                color="primary"
                variant="tonal"
                prepend-icon="lucide-plus"
                class="font-weight-bold text-none rounded-lg"
                @click="showAddProductDialog = true"
              >
                Thêm sản phẩm
              </v-btn>
            </div>

            <v-card variant="outlined" class="rounded-lg overflow-hidden">
              <v-table density="compact" class="order-lines-table">
                <thead>
                  <tr class="bg-surface-variant">
                    <th class="text-center" :style="!isMobile ? 'width: 40px;' : ''">#</th>
                    <th :class="isMobile ? 'text-left' : ''">
                      {{ isMobile ? 'Mã SP' : 'Sản phẩm' }}
                    </th>
                    <th v-if="!isMobile" style="width: 80px;" class="text-center">ĐVT</th>
                    <th :style="!isMobile ? 'width: 100px;' : ''" class="text-center">SL</th>
                    <th :style="!isMobile ? 'width: 140px;' : ''" class="text-right">Đơn giá</th>
                    <th :style="!isMobile ? 'width: 90px;' : ''" class="text-center">CK %</th>
                    <th :style="!isMobile ? 'width: 130px;' : ''" class="text-right">Thành tiền</th>
                    <th v-if="isEditing" style="width: 45px;" class="text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  <!-- ── 1. READ ONLY MODE ── -->
                  <template v-if="!isEditing">
                    <tr v-if="productLines.length === 0">
                      <td :colspan="isMobile ? 6 : 7" class="text-center text-medium-emphasis py-6">Không có dữ liệu dòng sản phẩm</td>
                    </tr>
                    <tr v-for="(line, idx) in productLines" :key="line.id">
                      <td class="text-center text-caption text-medium-emphasis">{{ idx + 1 }}</td>
                      <td>
                        <!-- Desktop: Tên sản phẩm + SKU -->
                        <div v-if="!isMobile">
                          <div class="font-weight-medium text-body-2 line-clamp-1">{{ line.productName }}</div>
                          <div v-if="line.productSku" class="text-caption text-medium-emphasis font-monospace">
                            SKU: {{ line.productSku }}
                          </div>
                        </div>
                        <!-- Mobile: Chỉ hiển thị mã sản phẩm -->
                        <div v-else class="font-monospace text-caption font-weight-medium text-primary">
                          {{ line.productSku || line.productName }}
                        </div>
                      </td>
                      <td v-if="!isMobile" class="text-center text-caption">{{ line.uomName || 'Units' }}</td>
                      <td class="text-center font-weight-medium">{{ line.quantity }}</td>
                      <td class="text-right text-caption">
                        <div v-if="!isMobile && line.originalPrice && line.originalPrice > line.priceUnit" class="text-caption text-decoration-line-through text-medium-emphasis">
                          {{ formatVND(line.originalPrice) }}
                        </div>
                        <div :class="['font-weight-medium', (line.originalPrice && line.originalPrice > line.priceUnit) ? 'text-success font-weight-bold' : '']">
                          {{ formatVND(line.priceUnit) }}
                        </div>
                      </td>
                      <td class="text-center text-caption">
                        <span v-if="line.discount > 0" class="text-error font-weight-medium">-{{ line.discount }}%</span>
                        <span v-else class="text-medium-emphasis">—</span>
                      </td>
                      <td class="text-right font-weight-bold text-body-2">{{ formatVND(line.priceSubtotal) }}</td>
                    </tr>
                  </template>

                  <!-- ── 2. EDIT MODE ── -->
                  <template v-else>
                    <tr v-if="editedLines.length === 0">
                      <td :colspan="isMobile ? 6 : 8" class="text-center text-medium-emphasis py-6">
                        Chưa có sản phẩm nào. Bấm "+ Thêm sản phẩm" ở trên để chọn.
                      </td>
                    </tr>
                    <tr v-for="(line, idx) in editedLines" :key="idx">
                      <td class="text-center text-caption text-medium-emphasis">{{ idx + 1 }}</td>
                      <td>
                        <div class="font-weight-medium text-body-2 line-clamp-1">{{ line.productName }}</div>
                        <div v-if="line.productSku" class="text-caption text-medium-emphasis font-monospace">
                          SKU: {{ line.productSku }}
                        </div>
                      </td>
                      <td v-if="!isMobile" class="text-center text-caption">{{ line.uomName || 'Units' }}</td>
                      <!-- Quantity Edit -->
                      <td class="text-center">
                        <div class="d-inline-flex align-center border rounded-lg overflow-hidden bg-surface px-1 py-0.5" style="border-color: rgba(var(--v-border-color), 0.25);">
                          <input
                            type="number"
                            v-model.number="line.quantity"
                            min="1"
                            class="text-center font-weight-bold"
                            style="width: 48px; font-size: 0.85rem; border: none; outline: none; background: transparent;"
                          />
                        </div>
                      </td>
                      <!-- Price Unit Edit -->
                      <td class="text-right">
                        <div class="d-inline-flex align-center border rounded-lg overflow-hidden bg-surface px-1.5 py-0.5" style="border-color: rgba(var(--v-border-color), 0.25);">
                          <input
                            type="text"
                            :value="formatThousand(line.priceUnit)"
                            @input="onPriceUnitInput(line, $event)"
                            class="text-right font-weight-bold"
                            style="width: 88px; font-size: 0.85rem; border: none; outline: none; background: transparent;"
                          />
                          <span class="text-caption font-weight-medium text-medium-emphasis ml-0.5">₫</span>
                        </div>
                      </td>
                      <!-- Discount Edit -->
                      <td class="text-center">
                        <div class="d-inline-flex align-center border rounded-lg overflow-hidden bg-surface px-1 py-0.5" style="border-color: rgba(var(--v-border-color), 0.25);">
                          <input
                            type="number"
                            v-model.number="line.discount"
                            min="0"
                            max="100"
                            step="1"
                            class="text-center font-weight-bold text-error"
                            style="width: 40px; font-size: 0.85rem; border: none; outline: none; background: transparent;"
                          />
                          <span class="text-caption font-weight-bold text-error">%</span>
                        </div>
                      </td>
                      <!-- Calculated Subtotal -->
                      <td class="text-right font-weight-bold text-body-2 text-primary">
                        {{ formatVND(Math.round(line.quantity * line.priceUnit * (1 - (line.discount || 0) / 100))) }}
                      </td>
                      <!-- Delete Line -->
                      <td class="text-center">
                        <v-btn
                          icon
                          size="28"
                          variant="text"
                          color="error"
                          title="Xóa sản phẩm này"
                          @click="removeEditedLine(idx)"
                        >
                          <v-icon size="15">lucide-trash-2</v-icon>
                        </v-btn>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </v-table>
            </v-card>
          </div>

          <!-- Applied Promotions & Free Gifts Section -->
          <div v-if="!isEditing && ((order as any).appliedPromotions?.length || (order as any).freeItems?.length)" class="mb-4">
            <v-card variant="outlined" class="rounded-lg pa-3 bg-amber-50/40 dark:bg-amber-950/20 border-amber-200">
              <div class="text-subtitle-2 font-weight-bold text-amber-800 dark:text-amber-400 d-flex align-center gap-1 mb-2">
                <v-icon size="18">lucide-gift</v-icon>
                Ưu đãi & Quà tặng áp dụng cho đơn:
              </div>
              <div class="d-flex flex-wrap gap-2 mb-2">
                <v-chip
                  v-for="(p, pidx) in (order as any).appliedPromotions"
                  :key="pidx"
                  size="small"
                  color="primary"
                  variant="flat"
                  class="font-weight-medium"
                >
                  🎉 {{ p.promotionName || p.name }} (v{{ p.policyVersion || 1 }})
                  <span v-if="p.discountAmount > 0" class="ml-1 font-weight-bold">-{{ formatVND(p.discountAmount) }}</span>
                </v-chip>
              </div>

              <!-- Free Gifts -->
              <div v-for="(p, pidx) in (order as any).appliedPromotions" :key="'g-' + pidx">
                <div v-if="p.freeItems?.length" class="d-flex flex-wrap gap-2">
                  <div
                    v-for="(g, gidx) in p.freeItems"
                    :key="gidx"
                    class="text-caption font-weight-bold text-deep-orange bg-deep-orange-lighten-5 px-2 py-1 rounded border"
                  >
                    🎁 Tặng kèm: {{ g.quantity }}x {{ g.name }} (SKU: {{ g.sku }})
                  </div>
                </div>
              </div>
            </v-card>
          </div>

          <!-- Bottom: Notes and Financial Summary -->
          <v-row>
            <!-- Left: Notes -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="h-100 rounded-lg pa-4">
                <div class="text-subtitle-2 font-weight-bold mb-2 d-flex align-center gap-1">
                  <v-icon color="grey" size="16">lucide-message-square</v-icon>
                  Ghi chú
                </div>

                <!-- Read Only Notes -->
                <template v-if="!isEditing">
                  <div v-if="cleanNote(order.note)" class="text-body-2 text-medium-emphasis order-note-content mb-2" style="white-space: pre-wrap;">{{ cleanNote(order.note) }}</div>
                  <div v-if="extractedNotes.length > 0" class="space-y-1 mt-1">
                    <div v-for="(nt, nidx) in extractedNotes" :key="nidx" class="text-caption text-primary bg-primary-lighten-5 px-2 py-1 rounded border">
                      📌 {{ nt }}
                    </div>
                  </div>
                  <div v-if="!cleanNote(order.note) && extractedNotes.length === 0" class="text-body-2 text-medium-emphasis font-italic">Không có ghi chú thêm</div>
                </template>

                <!-- Edit Mode Notes -->
                <template v-else>
                  <v-textarea
                    v-model="editedNote"
                    variant="outlined"
                    density="compact"
                    rows="3"
                    auto-grow
                    hide-details
                    placeholder="Nhập ghi chú đơn hàng..."
                    class="rounded-lg"
                  />
                </template>
              </v-card>
            </v-col>

            <!-- Right: Financial Totals -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="rounded-lg pa-4 bg-surface">
                <div class="space-y-2 text-body-2">
                  <div class="d-flex justify-space-between text-medium-emphasis">
                    <span>Tổng tiền hàng:</span>
                    <span class="font-monospace">
                      {{ formatVND(isEditing ? calculatedSubtotal : (order.amountUndiscounted || order.amountUntaxed)) }}
                    </span>
                  </div>

                  <div v-if="!isEditing && order.amountUndiscounted > order.amountUntaxed" class="d-flex justify-space-between text-error">
                    <span>Tổng chiết khấu:</span>
                    <span class="font-monospace">-{{ formatVND(order.amountUndiscounted - order.amountUntaxed) }}</span>
                  </div>

                  <div v-if="!isEditing && order.amountTax > 0" class="d-flex justify-space-between text-medium-emphasis">
                    <span>Thuế VAT:</span>
                    <span class="font-monospace">{{ formatVND(order.amountTax) }}</span>
                  </div>

                  <v-divider class="my-2" />

                  <!-- Tổng thanh toán -->
                  <div class="d-flex justify-space-between align-center">
                    <span class="text-subtitle-1 font-weight-bold">Tổng thanh toán:</span>
                    <span class="text-h6 font-weight-bold text-primary font-monospace">
                      {{ formatVND(isEditing ? calculatedSubtotal : order.amountTotal) }}
                    </span>
                  </div>
                </div>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="px-4 px-md-6 py-3 bg-surface d-flex align-center justify-space-between flex-wrap ga-2" style="gap: 8px;">
        <!-- Edit Mode Actions -->
        <template v-if="isEditing">
          <div class="d-flex align-center ga-2" style="gap: 8px;">
            <v-btn
              color="primary"
              variant="flat"
              prepend-icon="lucide-save"
              class="text-none font-weight-bold px-4"
              :loading="saving"
              @click="saveOrderChanges"
            >
              Lưu thay đổi
            </v-btn>
            <v-btn
              variant="outlined"
              color="grey"
              class="text-none"
              :disabled="saving"
              @click="cancelEdit"
            >
              Hủy
            </v-btn>
          </div>
          <v-spacer />
        </template>

        <!-- Read Only Mode Actions -->
        <template v-else>
          <div class="d-flex align-center gap-2">
            <!-- Nút Xác nhận đơn (chuyển Báo giá thành Đơn hàng) -->
            <v-btn
              v-if="canConfirmQuotation"
              color="success"
              variant="flat"
              prepend-icon="lucide-check-circle-2"
              class="text-none font-weight-bold"
              :loading="confirmingQuotation"
              @click="promptConfirmQuotation"
            >
              Xác nhận đơn
            </v-btn>

            <template v-if="canApproveOrReject">
              <v-btn
                color="success"
                variant="flat"
                prepend-icon="lucide-check-circle-2"
                class="text-none font-weight-bold"
                @click="$emit('confirm', order!)"
              >
                Duyệt
              </v-btn>
              <v-btn
                color="error"
                variant="outlined"
                prepend-icon="lucide-x-circle"
                class="text-none font-weight-bold"
                @click="$emit('reject', order!)"
              >
                Từ chối
              </v-btn>
            </template>
          </div>
          <v-spacer />
          <v-btn variant="outlined" color="grey" @click="$emit('update:modelValue', false)">Đóng</v-btn>
        </template>
      </v-card-actions>
    </v-card>

    <!-- Dialog xác nhận chuyển Báo giá thành Đơn hàng -->
    <v-dialog v-model="showConfirmQuotationDialog" max-width="380px">
      <v-card class="rounded-xl pa-5">
        <div class="d-flex align-center gap-3">
          <v-avatar color="success" variant="tonal" size="44">
            <v-icon icon="lucide-check-circle-2" size="24" color="success" />
          </v-avatar>
          <div class="flex-grow-1">
            <div class="text-subtitle-1 font-weight-bold">Xác nhận đơn hàng?</div>
            <div class="text-caption text-medium-emphasis">
              Mã đơn: <strong class="text-primary font-monospace">{{ order?.orderCode }}</strong>
            </div>
          </div>
        </div>

        <div class="d-flex justify-end align-center gap-2 mt-5">
          <v-btn
            variant="outlined"
            color="grey"
            class="text-none px-4"
            :disabled="confirmingQuotation"
            @click="showConfirmQuotationDialog = false"
          >
            Hủy
          </v-btn>
          <v-btn
            color="success"
            variant="flat"
            class="text-none font-weight-bold px-4"
            :loading="confirmingQuotation"
            prepend-icon="lucide-check"
            @click="executeConfirmQuotation"
          >
            Xác nhận đơn
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Product Picker Modal for Adding Products to Order -->
    <ProductPickerDialog
      v-model="showAddProductDialog"
      @select="onProductFromPicker"
    />

    <!-- Feedback Snackbar -->
    <!-- Dialog Thêm / Sửa Ghi chú giao việc -->
    <v-dialog v-model="activityDialog.show" max-width="440px">
      <v-card class="rounded-xl pa-4">
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="text-subtitle-1 font-weight-bold d-flex align-center gap-2">
            <v-icon color="amber-darken-3" size="20">lucide-clipboard-list</v-icon>
            <span>{{ activityDialog.isEdit ? 'Sửa ghi chú giao việc' : 'Thêm ghi chú giao việc' }}</span>
          </div>
          <v-btn icon size="28" variant="text" @click="activityDialog.show = false">
            <v-icon size="18">lucide-x</v-icon>
          </v-btn>
        </div>
        <div class="text-caption text-medium-emphasis mb-3">
          Nội dung này được đồng bộ vào Hoạt động (Activity) của đơn hàng trên Odoo.
        </div>
        <v-textarea
          v-model="activityDialog.text"
          label="Nội dung ghi chú giao việc / Hoạt động"
          placeholder="Ví dụ: ĐÃ THANH TOÁN CK 28/7, Giao trước 16h..."
          variant="outlined"
          density="compact"
          rows="3"
          auto-grow
          autofocus
          hide-details
          class="mb-4 text-caption"
        />
        <div class="d-flex justify-end gap-2">
          <v-btn variant="text" class="text-none" @click="activityDialog.show = false">Hủy</v-btn>
          <v-btn
            color="amber-darken-3"
            variant="flat"
            class="text-none font-weight-bold"
            :loading="activityDialog.saving"
            :disabled="!activityDialog.text.trim()"
            @click="saveActivityNote"
          >
            Lưu ghi chú
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <v-snackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      timeout="3500"
      location="top"
      class="rounded-xl"
    >
      <div class="d-flex align-center gap-2 font-weight-medium">
        <v-icon size="18">{{ snackbar.color === 'success' ? 'lucide-check-circle' : 'lucide-alert-circle' }}</v-icon>
        <span>{{ snackbar.text }}</span>
      </div>
    </v-snackbar>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { useOrders } from '@/composables/use-orders';
import type { OrderItem } from '@/composables/use-orders';
import ProductPickerDialog from '@/components/chat/ProductPickerDialog.vue';

const display = useDisplay();
const isMobile = computed(() => display.smAndDown.value);
const authStore = useAuthStore();

const props = defineProps<{
  modelValue: boolean;
  order: OrderItem | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'confirm', order: OrderItem): void;
  (e: 'reject', order: OrderItem): void;
  (e: 'saved', order: OrderItem): void;
}>();

const {
  stateColor,
  stateLabel,
  deliveryStatusColor,
  deliveryStatusLabel,
  invoiceStatusColor,
  invoiceStatusLabel,
  confirmSaleOrder,
} = useOrders();

// ── Confirm Quotation (Báo giá -> Đơn hàng) State ──────────────────────────
const canConfirmQuotation = computed(() => {
  // Chỉ tài khoản có vai trò Quản trị viên (Admin / Owner) mới có quyền xác nhận đơn
  if (!authStore.isAdmin) return false;
  if (!props.order) return false;
  return props.order.state === 'draft' || props.order.state === 'sent';
});

const confirmingQuotation = ref(false);
const showConfirmQuotationDialog = ref(false);

function promptConfirmQuotation() {
  showConfirmQuotationDialog.value = true;
}

async function executeConfirmQuotation() {
  if (!props.order) return;
  confirmingQuotation.value = true;
  try {
    const res = await confirmSaleOrder(props.order.id);
    if (res?.success) {
      if (res.order) {
        Object.assign(props.order, res.order);
      } else {
        props.order.state = 'sale';
      }
      showConfirmQuotationDialog.value = false;
      snackbar.value = {
        show: true,
        text: res.message || 'Đã chuyển trạng thái báo giá thành Đơn hàng thành công!',
        color: res.odooWarning ? 'warning' : 'success',
      };
      emit('saved', props.order);
    }
  } catch (err: any) {
    console.error('Confirm order error:', err);
    snackbar.value = {
      show: true,
      text: err.response?.data?.error || err.message || 'Lỗi khi xác nhận đơn hàng',
      color: 'error',
    };
  } finally {
    confirmingQuotation.value = false;
  }
}

// ── Edit Mode State ─────────────────────────────────────────────────────────
const isEditing = ref(false);
const saving = ref(false);
const showAddProductDialog = ref(false);
const editedNote = ref('');
const editedActivitySummary = ref('');
const deletingActivity = ref(false);
const activityDialog = ref({
  show: false,
  isEdit: false,
  text: '',
  saving: false,
});
const editedLines = ref<Array<{
  id?: string;
  odooLineId?: number;
  odooProductId?: number;
  productName: string;
  productSku?: string;
  uomName?: string;
  quantity: number;
  priceUnit: number;
  discount: number;
}>>([]);

const snackbar = ref({
  show: false,
  text: '',
  color: 'success',
});

// Reset edit mode when modal is toggled or order changes
watch(
  () => [props.modelValue, props.order?.id],
  () => {
    isEditing.value = false;
  }
);

function formatThousand(val: number | string | undefined | null): string {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'number' ? Math.round(val) : parseInt(String(val).replace(/\D/g, ''), 10) || 0;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function onPriceUnitInput(line: any, event: Event) {
  const input = event.target as HTMLInputElement;
  const rawDigits = input.value.replace(/\D/g, '');
  const numericVal = rawDigits ? parseInt(rawDigits, 10) : 0;
  line.priceUnit = numericVal;
  input.value = formatThousand(numericVal);
}

function startEdit() {
  if (!props.order) return;
  editedNote.value = cleanNote(props.order.note);
  editedActivitySummary.value = props.order.activitySummary || '';
  editedLines.value = (props.order.lines || []).map((l) => ({
    id: l.id,
    odooLineId: l.odooLineId,
    odooProductId: (l as any).odooProductId,
    productName: l.productName,
    productSku: l.productSku || undefined,
    uomName: l.uomName || 'Units',
    quantity: l.quantity,
    priceUnit: l.priceUnit,
    discount: l.discount || 0,
  }));
  isEditing.value = true;
}

function cancelEdit() {
  isEditing.value = false;
}

function removeEditedLine(idx: number) {
  editedLines.value.splice(idx, 1);
}

function onProductFromPicker(product: any, qty: number) {
  editedLines.value.push({
    odooProductId: Number(product.odoo_id || product.id),
    productName: product.name || product.display_name,
    productSku: product.default_code || product.sku,
    uomName: product.uom_name || 'Gói',
    quantity: qty || 1,
    priceUnit: product.list_price || product.wholesale_price || 0,
    discount: 0,
  });
  showAddProductDialog.value = false;
}

const calculatedSubtotal = computed(() => {
  return editedLines.value.reduce(
    (sum, l) => sum + Math.round((Number(l.quantity) || 0) * (Number(l.priceUnit) || 0) * (1 - (Number(l.discount) || 0) / 100)),
    0
  );
});

async function saveOrderChanges() {
  if (!props.order) return;
  saving.value = true;
  try {
    const res = await api.put(`/orders/${props.order.id}`, {
      note: editedNote.value,
      activitySummary: editedActivitySummary.value,
      lines: editedLines.value,
    });
    if (res.data?.success) {
      if (res.data.order) {
        Object.assign(props.order, res.data.order);
      }
      isEditing.value = false;
      snackbar.value = {
        show: true,
        text: res.data.message || 'Cập nhật đơn hàng thành công!',
        color: res.data.odooWarning ? 'warning' : 'success',
      };
      emit('saved', res.data.order || props.order);
    }
  } catch (err: any) {
    console.error('Save order error:', err);
    snackbar.value = {
      show: true,
      text: err.response?.data?.error || 'Lỗi khi lưu đơn hàng',
      color: 'error',
    };
  } finally {
    saving.value = false;
  }
}

// ── Quick Activity (Ghi chú giao việc) Actions ──────────────────────────────
function openActivityModal(currentText?: string | null) {
  activityDialog.value = {
    show: true,
    isEdit: Boolean(currentText),
    text: currentText || '',
    saving: false,
  };
}

async function saveActivityNote() {
  if (!props.order) return;
  activityDialog.value.saving = true;
  try {
    const res = await api.post(`/orders/${props.order.id}/activity`, {
      summary: activityDialog.value.text.trim(),
    });
    if (res.data?.success) {
      props.order.activitySummary = res.data.activitySummary;
      activityDialog.value.show = false;
      snackbar.value = {
        show: true,
        text: 'Cập nhật ghi chú giao việc thành công!',
        color: 'success',
      };
      emit('saved', props.order);
    }
  } catch (err: any) {
    snackbar.value = {
      show: true,
      text: err.response?.data?.error || 'Lỗi khi lưu ghi chú giao việc',
      color: 'error',
    };
  } finally {
    activityDialog.value.saving = false;
  }
}

async function deleteActivityNote() {
  if (!props.order) return;
  deletingActivity.value = true;
  try {
    const res = await api.delete(`/orders/${props.order.id}/activity`);
    if (res.data?.success) {
      props.order.activitySummary = null;
      snackbar.value = {
        show: true,
        text: 'Đã xóa ghi chú giao việc!',
        color: 'success',
      };
      emit('saved', props.order);
    }
  } catch (err: any) {
    snackbar.value = {
      show: true,
      text: err.response?.data?.error || 'Lỗi khi xóa ghi chú giao việc',
      color: 'error',
    };
  } finally {
    deletingActivity.value = false;
  }
}

// ── Read Only Computed Helpers ──────────────────────────────────────────────
const productLines = computed(() => {
  if (!props.order?.lines) return [];
  return props.order.lines.filter((l) => {
    if (!l.odooProductId && !l.productSku && Number(l.quantity) === 0 && Number(l.priceUnit) === 0) {
      return false;
    }
    return true;
  });
});

const extractedNotes = computed(() => {
  if (!props.order?.lines) return [];
  return props.order.lines
    .filter((l) => !l.odooProductId && !l.productSku && Number(l.quantity) === 0 && Number(l.priceUnit) === 0)
    .map((l) => l.productName)
    .filter(Boolean);
});

function formatVND(n?: number) {
  if (n === undefined || n === null) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function formatDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

function formatDateTime(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${dt.toLocaleDateString('vi-VN')}`;
}

function copyOrderCode() {
  if (props.order?.orderCode && navigator.clipboard) {
    navigator.clipboard.writeText(props.order.orderCode);
    snackbar.value = {
      show: true,
      text: `Đã sao chép mã đơn ${props.order.orderCode}`,
      color: 'success',
    };
  }
}

function cleanNote(note: string | null | undefined) {
  if (!note) return '';
  let text = note;
  // Gỡ bỏ liên kết điều khoản điều kiện mặc định
  text = text.replace(/<a\s+[^>]*href=["'][^"']*terms[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '');
  text = text.replace(/Điều khoản\s*&\s*điều kiện\s*:?\s*https?:\/\/[^\s<]+/gi, '');
  text = text.replace(/Điều khoản\s*&\s*điều kiện\s*:?\s*/gi, '');
  // Đổi các thẻ xuống dòng sang ký tự newline
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  // Lọc sạch toàn bộ thẻ HTML còn lại
  text = text.replace(/<[^>]+>/g, '');
  // Giải mã các thực thể HTML phổ biến
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  // Chuẩn hóa nhiều dòng trắng liên tiếp
  text = text.replace(/\n\s*\n\s*\n+/g, '\n\n');
  return text.trim();
}

const canApproveOrReject = computed(() => {
  if (!props.order) return false;
  if (props.order.odooOrderId && typeof props.order.odooOrderId === 'number' && props.order.odooOrderId > 0) {
    return false;
  }
  return Boolean(props.order.isAiDraft);
});
</script>

<style scoped>
.space-y-2 > * + * {
  margin-top: 8px;
}
.order-lines-table {
  width: 100% !important;
}
:deep(.order-lines-table .v-table__wrapper > table) {
  width: 100% !important;
  table-layout: auto !important;
}
.order-lines-table th {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  white-space: nowrap;
}
.order-lines-table th,
.order-lines-table td {
  white-space: nowrap;
  padding-left: 8px !important;
  padding-right: 8px !important;
}
@media (max-width: 768px) {
  .order-lines-table th,
  .order-lines-table td {
    padding-left: 6px !important;
    padding-right: 6px !important;
    font-size: 0.75rem;
  }
}
.order-note-content {
  max-height: 120px;
  overflow-y: auto;
  font-size: 0.85rem;
}
.order-note-content :deep(p) {
  margin-bottom: 4px;
}
.order-note-content :deep(a) {
  color: var(--v-theme-primary);
  text-decoration: underline;
}
.activity-summary-badge {
  background-color: rgba(255, 179, 0, 0.12);
  color: #b45309;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.4;
  word-break: break-word;
  white-space: normal;
  text-align: left;
  max-width: 280px;
}
:deep(.v-theme--dark) .activity-summary-badge {
  background-color: rgba(255, 179, 0, 0.18);
  color: #fcd34d;
}
</style>
