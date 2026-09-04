<template>
  <div class="orders-view">
    <!-- Page Header -->
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-3" style="gap: 16px;">
      <div>
        <h1 class="editorial-heading d-flex align-center gap-2">
          <v-icon color="primary" class="page-icon">lucide-shopping-bag</v-icon>
          Quản lý Đơn hàng
        </h1>
      </div>

      <div class="d-flex align-center flex-wrap ga-3" style="gap: 16px;">
        <!-- Countdown Widget -->
        <div class="d-flex align-center ga-2 text-caption text-medium-emphasis border rounded-lg px-3 py-2 bg-surface" style="gap: 8px;">
          <v-icon size="14" color="primary" class="animate-spin-slow">lucide-timer</v-icon>
          <span>Tự động đồng bộ sau:</span>
          <span class="font-weight-bold text-primary font-monospace" style="min-width: 24px; display: inline-block; text-align: right;">
            {{ countdown }}s
          </span>
        </div>

        <v-btn
          color="primary"
          prepend-icon="lucide-refresh-cw"
          :loading="syncing"
          @click="handleQuickSync"
        >
          Đồng bộ Odoo
        </v-btn>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <v-tabs v-model="activeTab" color="primary" class="border-b mb-4" :grow="$vuetify.display.smAndDown" show-arrows>
      <v-tab value="orders" class="text-none font-weight-medium">
        <v-icon start size="18">lucide-list</v-icon>
        Danh sách Đơn hàng
      </v-tab>
      <v-tab value="pending" class="text-none font-weight-medium">
        <v-icon start size="18" color="amber-darken-2">lucide-clock</v-icon>
        Đơn cần xác nhận
        <v-chip v-if="pendingTotal > 0" size="x-small" color="error" variant="flat" class="ml-2 font-weight-bold">
          {{ pendingTotal }}
        </v-chip>
      </v-tab>
      <v-tab value="staff" class="text-none font-weight-medium">
        <v-icon start size="18">lucide-users</v-icon>
        Hiệu suất Nhân viên
      </v-tab>
    </v-tabs>

    <!-- Window for Tabs -->
    <v-window v-model="activeTab" :touch="false">
      
      <!-- TAB 1: ALL ORDERS -->
      <v-window-item value="orders">
        <!-- Filter Card -->
        <v-card variant="outlined" class="rounded-lg mb-4 pa-3">
          <v-row dense align="center">
            <!-- Search -->
            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model="filters.search"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Tìm mã đơn, tên khách..."
                prepend-inner-icon="lucide-search"
                clearable
                @update:model-value="onFilterChange"
              />
            </v-col>

            <!-- State Filter -->
            <v-col cols="6" sm="6" md="2">
              <v-select
                v-model="filters.state"
                :items="ODOO_ORDER_STATES"
                item-title="text"
                item-value="value"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Trạng thái"
                @update:model-value="onFilterChange"
              />
            </v-col>

            <!-- Salesperson Filter -->
            <v-col cols="6" sm="6" md="2">
              <v-select
                v-model="filters.salesperson"
                :items="salespersonOptions"
                item-title="title"
                item-value="value"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Nhân viên"
                clearable
                @update:model-value="onFilterChange"
              />
            </v-col>

            <!-- Delivery Status Filter -->
            <v-col cols="6" sm="6" md="2">
              <v-select
                v-model="filters.deliveryStatus"
                :items="ODOO_DELIVERY_STATUSES"
                item-title="text"
                item-value="value"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Vận chuyển"
                @update:model-value="onFilterChange"
              />
            </v-col>

            <!-- Quick Date Filter -->
            <v-col cols="6" sm="6" md="2">
              <v-select
                v-model="quickDate"
                :items="quickDateOptions"
                item-title="text"
                item-value="value"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Thời gian"
                @update:model-value="onQuickDateChange"
              />
            </v-col>

            <!-- Reset Filter (Only shown when active filters exist) -->
            <v-col v-if="hasActiveFilters" cols="12" sm="6" md="1" class="d-flex align-center justify-end">
              <v-btn icon size="small" variant="text" color="error" title="Xóa bộ lọc" @click="resetFilters">
                <v-icon size="18">lucide-filter-x</v-icon>
              </v-btn>
            </v-col>
          </v-row>
        </v-card>

        <!-- Orders Data Table -->
        <v-card variant="outlined" class="rounded-lg mb-4 overflow-hidden">
          <v-progress-linear v-if="loading" indeterminate color="primary" />

          <v-table density="compact" hover class="orders-table">
            <thead>
              <tr class="bg-surface-variant">
                <th class="text-center" :style="isMobile ? 'width: 15%;' : ''">Mã đơn</th>
                <th class="text-left" :style="isMobile ? 'width: 23%;' : ''">Khách hàng</th>
                <th v-if="!isMobile" class="text-left">Nhân viên</th>
                <th class="text-center" :style="isMobile ? 'width: 16%;' : ''">Ngày tạo</th>
                <th v-if="!isMobile" class="text-center">Số món</th>
                <th class="text-right" :style="isMobile ? 'width: 22%;' : ''">Tổng tiền</th>
                <th class="text-center" :style="isMobile ? 'width: 24%;' : ''">Trạng thái</th>
                <th v-if="!isMobile" class="text-center">Giao hàng</th>
                <th v-if="!isMobile" class="text-center"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && orders.length === 0">
                <td :colspan="isMobile ? 5 : 9" class="text-center text-medium-emphasis py-12">
                  <v-icon icon="lucide-inbox" size="48" color="grey" class="mb-2" />
                  <div class="text-body-1 font-weight-medium">Không tìm thấy đơn hàng nào</div>
                  <div class="text-caption text-grey">Thử thay đổi bộ lọc hoặc bấm "Đồng bộ Odoo"</div>
                </td>
              </tr>

              <tr
                v-for="o in orders"
                :key="o.id"
                class="cursor-pointer order-row"
                @click="openDetail(o.id)"
              >
                <!-- Order Code (Centered) -->
                <td class="text-center">
                  <span class="font-weight-bold font-monospace text-caption text-primary">
                    {{ o.orderCode }}
                  </span>
                </td>

                <!-- Customer (Single line on desktop) -->
                <td class="text-left">
                  <div v-if="isMobile" class="font-weight-medium text-caption text-truncate" :title="o.partnerName || o.customerProfile?.name || ''">
                    {{ formatCustomerName(o.partnerName || o.customerProfile?.name) }}
                  </div>
                  <div v-else class="d-flex align-center gap-1 flex-nowrap" :title="o.partnerName || o.customerProfile?.name || ''">
                    <span class="font-weight-medium text-caption text-high-emphasis">{{ o.partnerName || o.customerProfile?.name || '—' }}</span>
                    <span v-if="o.customerProfile?.phone || o.customerProfile?.city" class="text-caption text-medium-emphasis ml-1.5 font-weight-regular">
                      ({{ [o.customerProfile?.phone, o.customerProfile?.city].filter(Boolean).join(' • ') }})
                    </span>
                  </div>
                </td>

                <!-- Salesperson -->
                <td v-if="!isMobile" class="text-left">
                  <span class="text-caption text-medium-emphasis">{{ o.salesperson || '—' }}</span>
                </td>

                <!-- Date Order (Single line on desktop) -->
                <td class="text-center">
                  <div v-if="isMobile" class="text-caption">{{ formatDate(o.dateOrder) }}</div>
                  <div v-else class="text-caption text-medium-emphasis text-nowrap">
                    {{ formatDateTime(o.dateOrder) }}
                  </div>
                </td>

                <!-- Items count -->
                <td v-if="!isMobile" class="text-center">
                  <v-chip size="x-small" variant="tonal" color="grey">
                    {{ o._count?.lines ?? o.lines?.length ?? 0 }} món
                  </v-chip>
                </td>

                <!-- Total Amount -->
                <td class="text-right">
                  <span class="font-weight-bold text-caption text-primary font-monospace">
                    {{ formatVND(o.amountTotal) }}
                  </span>
                </td>

                <!-- Order State -->
                <td class="text-center">
                  <v-chip size="x-small" :color="stateColor(o.state)" variant="flat" class="font-weight-medium px-2" style="white-space: nowrap;">
                    {{ stateLabel(o.state) }}
                  </v-chip>
                </td>

                <!-- Delivery Status -->
                <td v-if="!isMobile" class="text-center">
                  <v-chip v-if="o.deliveryStatus" size="x-small" :color="deliveryStatusColor(o.deliveryStatus)" variant="tonal">
                    {{ deliveryStatusLabel(o.deliveryStatus) }}
                  </v-chip>
                  <span v-else class="text-caption text-medium-emphasis">—</span>
                </td>

                <!-- Action -->
                <td v-if="!isMobile" class="text-center" @click.stop>
                  <v-btn icon size="x-small" variant="text" color="primary" title="Xem chi tiết" @click="openDetail(o.id)">
                    <v-icon size="16">lucide-eye</v-icon>
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>

          <!-- Pagination Bar -->
          <div class="d-flex align-center justify-space-between pa-4 border-t flex-wrap gap-2">
            <div class="text-caption text-medium-emphasis">
              Hiển thị <strong>{{ orders.length }}</strong> trên tổng số <strong>{{ total.toLocaleString('vi-VN') }}</strong> đơn hàng
            </div>

            <v-pagination
              v-model="page"
              :length="totalPages"
              :total-visible="7"
              density="compact"
              @update:model-value="onPageChange"
            />
          </div>
        </v-card>
      </v-window-item>

      <!-- TAB 2: PENDING ORDERS (AI DRAFTS) -->
      <v-window-item value="pending">
        <v-card variant="outlined" class="rounded-lg mb-4 overflow-hidden">
          <div class="pa-4 bg-surface-variant d-flex align-center justify-space-between border-b">
            <div>
              <div class="font-weight-bold text-subtitle-1 d-flex align-center gap-2">
                <v-icon color="amber-darken-2" size="20">lucide-alert-circle</v-icon>
                Danh sách Đơn hàng chờ Nhân viên Xác nhận
              </div>
              <div class="text-caption text-medium-emphasis mt-0.5">
                Các đơn nháp do AI tạo từ tin nhắn Zalo. Khi xác nhận, hệ thống sẽ đẩy đơn sang Odoo và gửi tin nhắn Zalo cho khách hàng.
              </div>
            </div>
            <v-chip color="amber-darken-2" variant="tonal" class="font-weight-bold">
              {{ pendingTotal }} đơn chờ duyệt
            </v-chip>
          </div>

          <v-progress-linear v-if="pendingLoading" indeterminate color="amber-darken-2" />

          <v-table density="compact" hover class="orders-table">
            <thead>
              <tr class="bg-surface-variant">
                <th v-if="!isMobile" class="text-center">Mã đơn</th>
                <th class="text-left" :style="isMobile ? 'width: 28%;' : ''">Tên khách hàng</th>
                <th class="text-left" :style="isMobile ? 'width: 22%;' : ''">Nhân viên</th>
                <th class="text-center" :style="isMobile ? 'width: 24%;' : ''">Thời gian tạo</th>
                <th v-if="!isMobile" class="text-center">Số món</th>
                <th class="text-right" :style="isMobile ? 'width: 26%;' : ''">Tổng tiền</th>
                <th v-if="!isMobile" class="text-center">Trạng thái</th>
                <th v-if="!isMobile" class="text-left">Phương thức thanh toán</th>
                <th v-if="!isMobile" class="text-center">Hành động</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!pendingLoading && pendingOrders.length === 0">
                <td :colspan="isMobile ? 4 : 9" class="text-center text-medium-emphasis py-12">
                  <v-icon icon="lucide-check-circle" size="48" color="success" class="mb-2" />
                  <div class="text-body-1 font-weight-medium">Không có đơn hàng nào chờ xác nhận</div>
                  <div class="text-caption text-grey">Tất cả đơn hàng nháp đã được xử lý hoàn tất!</div>
                </td>
              </tr>

              <tr
                v-for="o in pendingOrders"
                :key="o.id"
                class="cursor-pointer order-row"
                @click="openDetail(o.id)"
              >
                <!-- Order Code (Desktop only) -->
                <td v-if="!isMobile" class="text-center">
                  <span class="font-weight-bold font-monospace text-caption text-primary">
                    {{ o.orderCode }}
                  </span>
                </td>

                <!-- Customer (Tên khách hàng - single line on desktop) -->
                <td class="text-left">
                  <div v-if="isMobile" class="font-weight-medium text-caption text-truncate" :title="o.partnerName || o.customerProfile?.name || ''">
                    {{ formatCustomerName(o.partnerName || o.customerProfile?.name) }}
                  </div>
                  <div v-else class="d-flex align-center gap-1 flex-nowrap" :title="o.partnerName || o.customerProfile?.name || ''">
                    <span class="font-weight-medium text-caption text-high-emphasis">{{ o.partnerName || o.customerProfile?.name || '—' }}</span>
                    <span v-if="o.customerProfile?.phone || o.customerProfile?.city" class="text-caption text-medium-emphasis ml-1.5 font-weight-regular">
                      ({{ [o.customerProfile?.phone, o.customerProfile?.city].filter(Boolean).join(' • ') }}
                    </span>
                  </div>
                </td>

                <!-- Salesperson (Nhân viên) -->
                <td class="text-left">
                  <span class="text-caption text-medium-emphasis text-truncate d-inline-block" :title="o.salesperson || ''">
                    {{ o.salesperson ? (isMobile ? formatCustomerName(o.salesperson) : o.salesperson) : '—' }}
                  </span>
                </td>

                <!-- Date Order (Thời gian tạo - single line on desktop) -->
                <td class="text-center">
                  <div v-if="isMobile">
                    <div class="text-caption">{{ formatDate(o.dateOrder) }}</div>
                    <div class="text-caption text-medium-emphasis" style="font-size: 11px;">{{ formatTime(o.dateOrder) }}</div>
                  </div>
                  <div v-else class="text-caption text-medium-emphasis text-nowrap">
                    {{ formatDateTime(o.dateOrder) }}
                  </div>
                </td>

                <!-- Items count (Desktop only) -->
                <td v-if="!isMobile" class="text-center">
                  <v-chip size="x-small" variant="tonal" color="grey">
                    {{ o._count?.lines ?? o.lines?.length ?? 0 }} món
                  </v-chip>
                </td>

                <!-- Total Amount (Tổng tiền) -->
                <td class="text-right">
                  <span class="font-weight-bold text-caption text-primary font-monospace">
                    {{ formatVND(o.amountTotal) }}
                  </span>
                </td>

                <!-- Order State (Desktop only) -->
                <td v-if="!isMobile" class="text-center">
                  <v-chip size="x-small" color="warning" variant="flat" class="font-weight-medium px-2">
                    Chờ duyệt
                  </v-chip>
                </td>

                <!-- Payment Method (Phương thức thanh toán - Desktop only) -->
                <td v-if="!isMobile" class="text-left">
                  <v-chip v-if="o.paymentTerm" size="x-small" variant="tonal" color="teal" prepend-icon="lucide-credit-card">
                    {{ o.paymentTerm }}
                  </v-chip>
                  <span v-else class="text-caption text-medium-emphasis">—</span>
                </td>

                <!-- Actions (Desktop only) -->
                <td v-if="!isMobile" class="text-center" @click.stop>
                  <div class="d-flex align-center justify-center gap-1 flex-nowrap">
                    <v-btn
                      size="small"
                      color="success"
                      variant="flat"
                      class="text-none px-2"
                      prepend-icon="lucide-check-circle-2"
                      @click="openConfirmModal(o)"
                      title="Xác nhận & Đồng bộ sang Odoo"
                    >
                      Duyệt
                    </v-btn>

                    <v-btn
                      size="small"
                      color="error"
                      variant="outlined"
                      class="text-none px-2"
                      prepend-icon="lucide-x-circle"
                      @click="openRejectModal(o)"
                      title="Từ chối đơn hàng"
                    >
                      Từ chối
                    </v-btn>

                    <v-btn
                      size="small"
                      color="primary"
                      variant="text"
                      icon
                      title="Xem trong khung Chat"
                      @click="goToChat(o.conversationId)"
                    >
                      <v-icon size="18">lucide-message-square</v-icon>
                    </v-btn>
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>

      <!-- TAB 3: STAFF PERFORMANCE -->
      <v-window-item value="staff">
        <OrderStaffTable :staff-stats="staffStats" :loading="loading" />
      </v-window-item>
    </v-window>

    <!-- Order Detail Modal -->
    <OrderDetailModal
      v-model="showDetail"
      :order="selectedOrder"
      :loading="detailLoading"
      @confirm="onDetailConfirm"
      @reject="onDetailReject"
    />

    <!-- Confirm Order Dialog with Zalo Preview -->
    <v-dialog v-model="showConfirmDialog" max-width="560">
      <v-card class="rounded-xl overflow-hidden">
        <div class="pa-4 bg-primary text-white d-flex align-center justify-space-between">
          <div class="d-flex align-center gap-2">
            <v-icon size="22">lucide-check-circle-2</v-icon>
            <span class="font-weight-bold text-subtitle-1">
              Xác nhận Đơn hàng #{{ targetOrder?.orderCode }}
            </span>
          </div>
          <v-btn icon="lucide-x" variant="text" size="small" color="white" @click="showConfirmDialog = false" />
        </div>

        <v-card-text class="pa-4">
          <div class="text-body-2 mb-3">
            Hệ thống sẽ chuyển trạng thái đơn sang <strong>Báo giá (Quotation)</strong>, đồng bộ sang Odoo ERP và tự động gửi tin nhắn xác nhận đến Zalo của khách hàng.
          </div>

          <!-- Order Summary Card -->
          <v-card variant="outlined" class="pa-3 rounded-lg mb-3 bg-surface-variant">
            <div class="d-flex justify-space-between text-body-2 mb-1">
              <span class="text-medium-emphasis">Khách hàng:</span>
              <span class="font-weight-bold">{{ targetOrder?.partnerName || '—' }}</span>
            </div>
            <div class="d-flex justify-space-between text-body-2 mb-1">
              <span class="text-medium-emphasis">Tổng tiền:</span>
              <span class="font-weight-bold text-primary font-monospace">{{ formatVND(targetOrder?.amountTotal) }}</span>
            </div>
            <div class="d-flex justify-space-between text-body-2">
              <span class="text-medium-emphasis">Số sản phẩm:</span>
              <span class="font-weight-bold">{{ targetOrder?._count?.lines ?? targetOrder?.lines?.length ?? 0 }} món</span>
            </div>
          </v-card>

          <!-- Custom Note -->
          <v-textarea
            v-model="confirmNote"
            label="Ghi chú thêm (tuỳ chọn)"
            rows="2"
            variant="outlined"
            density="compact"
            hide-details
            placeholder="Ghi chú nội bộ cho đơn hàng..."
            class="mb-3"
          />

          <!-- Zalo Preview & Edit Box -->
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption font-weight-bold text-medium-emphasis">
              Xem trước & Chỉnh sửa tin nhắn Zalo gửi khách hàng:
            </span>
            <v-btn
              size="x-small"
              variant="text"
              color="primary"
              class="text-none"
              prepend-icon="lucide-rotate-ccw"
              @click="resetConfirmZaloMessage"
            >
              Khôi phục mẫu
            </v-btn>
          </div>
          <v-textarea
            v-model="customConfirmZaloMessage"
            rows="5"
            variant="outlined"
            density="compact"
            placeholder="Nhập nội dung tin nhắn gửi khách hàng..."
            class="mb-3 font-mono text-body-2"
          />
          <!-- In-Popup Real-time Confirm Progress -->
          <v-expand-transition>
            <div v-if="confirmProgress.show" class="pa-3 rounded-lg mt-3 bg-surface-variant border">
              <div class="d-flex align-center gap-2 mb-2 font-weight-bold text-caption text-primary">
                <v-icon size="16">lucide-layers</v-icon>
                <span>TIẾN TRÌNH XỬ LÝ & ĐỒNG BỘ</span>
              </div>
              <!-- Step 1: Tạo đơn báo giá -->
              <div class="d-flex align-center gap-3 py-1">
                <div class="progress-step-icon">
                  <v-icon v-if="confirmProgress.step1Done" size="18" color="success" class="scale-up-anim">
                    lucide-check-circle-2
                  </v-icon>
                  <v-progress-circular v-else indeterminate size="16" width="2" color="primary" />
                </div>
                <div class="text-caption" :class="{ 'font-weight-bold text-success': confirmProgress.step1Done }">
                  {{ confirmProgress.step1Done ? 'Đã tạo' : 'Đang tạo' }} đơn báo giá chi tiết cho đơn hàng <strong class="font-mono text-primary">#{{ confirmProgress.odooCode }}</strong>
                </div>
              </div>

              <!-- Step 2: Gửi nội dung cho khách hàng -->
              <div class="d-flex align-center gap-3 py-1">
                <div class="progress-step-icon">
                  <v-icon v-if="confirmProgress.step2Done" size="18" color="success" class="scale-up-anim">
                    lucide-check-circle-2
                  </v-icon>
                  <v-progress-circular v-else indeterminate size="16" width="2" color="amber-darken-2" />
                </div>
                <div class="text-caption" :class="{ 'font-weight-bold text-success': confirmProgress.step2Done }">
                  {{ confirmProgress.step2Done ? 'Đã gửi' : 'Đang gửi' }} nội dung cho khách hàng <strong>{{ confirmProgress.customerName }}</strong>
                </div>
              </div>
            </div>
          </v-expand-transition>
        </v-card-text>

        <v-divider />
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="outlined" color="grey" :disabled="actionLoading || confirmProgress.show" @click="showConfirmDialog = false">Đóng</v-btn>
          <v-btn
            color="success"
            variant="flat"
            :loading="actionLoading"
            :disabled="actionLoading || confirmProgress.show"
            prepend-icon="lucide-send"
            @click="executeConfirmOrder"
          >
            Xác nhận & Gửi tin Zalo
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Reject Order Dialog with Preset Reasons & Zalo Preview -->
    <v-dialog v-model="showRejectDialog" max-width="560">
      <v-card class="rounded-xl overflow-hidden">
        <div class="pa-4 bg-error text-white d-flex align-center justify-space-between">
          <div class="d-flex align-center gap-2">
            <v-icon size="22">lucide-alert-triangle</v-icon>
            <span class="font-weight-bold text-subtitle-1">Từ chối Đơn hàng #{{ targetOrder?.orderCode }}</span>
          </div>
          <v-btn icon="lucide-x" variant="text" size="small" color="white" @click="showRejectDialog = false" />
        </div>

        <v-card-text class="pa-4">
          <div class="text-body-2 mb-3">
            Vui lòng chọn lý do từ chối từ danh sách của shop bên dưới hoặc nhập lý do cụ thể. Bạn có thể chỉnh sửa nội dung tin nhắn gửi khách hàng trước khi gửi.
          </div>

          <!-- Reason Dropdown -->
          <v-select
            v-model="selectedReasonPreset"
            :items="rejectionReasonOptions"
            label="Lý do từ chối (Từ phía Shop) *"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="lucide-store"
            class="mb-3"
          />

          <!-- Custom Reason Input -->
          <v-textarea
            v-if="selectedReasonPreset === 'custom'"
            v-model="customRejectReason"
            label="Nhập lý do từ chối chi tiết *"
            rows="2"
            variant="outlined"
            density="compact"
            placeholder="Ví dụ: Sản phẩm đã ngưng sản xuất, số lượng đặt vượt quá tồn kho..."
            class="mb-3"
          />

          <!-- Zalo Preview & Edit Box -->
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption font-weight-bold text-medium-emphasis">
              Xem trước & Chỉnh sửa tin nhắn Zalo gửi khách hàng:
            </span>
            <v-btn
              size="x-small"
              variant="text"
              color="primary"
              class="text-none"
              prepend-icon="lucide-rotate-ccw"
              @click="resetRejectZaloMessage"
            >
              Khôi phục mẫu
            </v-btn>
          </div>
          <v-textarea
            v-model="customRejectZaloMessage"
            rows="5"
            variant="outlined"
            density="compact"
            placeholder="Nhập nội dung tin nhắn thông báo từ chối gửi khách hàng..."
            class="mb-3 font-mono text-body-2"
          />
        </v-card-text>

        <v-divider />
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="outlined" color="grey" @click="showRejectDialog = false">Hủy bỏ</v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="actionLoading"
            prepend-icon="lucide-x-circle"
            @click="executeRejectOrder"
          >
            Xác nhận Từ chối
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Notification Snackbar -->
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="5000" location="top">
      {{ snackbar.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { io, Socket } from 'socket.io-client';
import { useOrders, ODOO_ORDER_STATES, ODOO_DELIVERY_STATUSES, type OrderItem } from '@/composables/use-orders';
import { useAppBadges } from '@/composables/use-app-badges';
import OrderDetailModal from '@/components/orders/OrderDetailModal.vue';
import OrderStaffTable from '@/components/orders/OrderStaffTable.vue';

const router = useRouter();
const display = useDisplay();
const isMobile = computed(() => display.smAndDown.value);

function formatCustomerName(name?: string | null): string {
  if (!name) return '—';
  const trimmed = name.trim();
  if (trimmed.length > 15) {
    return trimmed.slice(0, 12) + '...';
  }
  return trimmed;
}

function onDetailConfirm(order: OrderItem) {
  showDetail.value = false;
  openConfirmModal(order);
}

function onDetailReject(order: OrderItem) {
  showDetail.value = false;
  openRejectModal(order);
}

const {
  orders,
  selectedOrder,
  total,
  totalPages,
  loading,
  detailLoading,
  syncing,
  staffStats,
  salespersons,
  pendingOrders,
  pendingTotal,
  pendingLoading,
  fetchOrders,
  fetchPendingOrders,
  confirmOrder,
  rejectOrder,
  fetchOrderDetail,
  fetchStaffStats,
  fetchSalespersons,
  syncOrders,
  stateColor,
  stateLabel,
  deliveryStatusColor,
  deliveryStatusLabel,
} = useOrders();

const { fetchAllBadges } = useAppBadges();

const activeTab = ref('orders');
const page = ref(1);
const limit = ref(25);
const showDetail = ref(false);
const quickDate = ref('');

// Confirm / Reject state
const showConfirmDialog = ref(false);
const showRejectDialog = ref(false);
const targetOrder = ref<OrderItem | null>(null);
const confirmNote = ref('');
const customConfirmZaloMessage = ref('');
const customRejectZaloMessage = ref('');

const rejectionReasonOptions = [
  { title: 'Số lượng đặt hàng không hợp lệ / Vượt quá giới hạn cho phép', value: 'Số lượng đặt hàng không hợp lệ / Vượt quá giới hạn cho phép' },
  { title: 'Sản phẩm đã ngừng kinh doanh / Tạm thời không còn phân phối', value: 'Sản phẩm đã ngừng kinh doanh / Tạm thời không còn phân phối' },
  { title: 'Hết hàng tồn kho / Kho thực tế không đủ số lượng để cung ứng', value: 'Hết hàng tồn kho / Kho thực tế không đủ số lượng để cung ứng' },
  { title: 'Địa chỉ giao hàng nằm ngoài phạm vi phục vụ của shop', value: 'Địa chỉ giao hàng nằm ngoài phạm vi phục vụ của shop' },
  { title: 'Thông tin người nhận / Số điện thoại không hợp lệ (nghi vấn đơn ảo/spam)', value: 'Thông tin người nhận / Số điện thoại không hợp lệ (nghi vấn đơn ảo/spam)' },
  { title: 'Sai lệch thông tin bảng giá / Chính sách chiết khấu không thỏa điều kiện', value: 'Sai lệch thông tin bảng giá / Chính sách chiết khấu không thỏa điều kiện' },
  { title: 'Đơn hàng bị trùng lặp với đơn đã tạo trước đó', value: 'Đơn hàng bị trùng lặp với đơn đã tạo trước đó' },
  { title: 'Khách hàng yêu cầu hủy hoặc thay đổi đơn hàng', value: 'Khách hàng yêu cầu hủy hoặc thay đổi đơn hàng' },
  { title: 'Lý do khác (Tự nhập chi tiết...)', value: 'custom' },
];

const selectedReasonPreset = ref(rejectionReasonOptions[0].value);
const customRejectReason = ref(rejectionReasonOptions[0].value);
const actionLoading = ref(false);

const confirmProgress = reactive({
  show: false,
  step1Done: false,
  step2Done: false,
  odooCode: '',
  customerName: '',
});

const activeRejectReason = computed(() => {
  if (selectedReasonPreset.value === 'custom') {
    return customRejectReason.value || 'Thông tin đơn hàng chưa hợp lệ';
  }
  return selectedReasonPreset.value;
});

watch(selectedReasonPreset, (newVal) => {
  if (newVal !== 'custom') {
    customRejectReason.value = newVal;
    resetRejectZaloMessage();
  }
});

watch(customRejectReason, () => {
  resetRejectZaloMessage();
});

const snackbar = reactive({
  show: false,
  text: '',
  color: 'success',
});

const filters = reactive({
  search: '',
  state: '',
  salesperson: '',
  deliveryStatus: '',
  from: '',
  to: '',
});

const salespersonOptions = computed(() => {
  return [{ title: 'Tất cả nhân viên', value: '' }, ...salespersons.value.map(s => ({ title: s, value: s }))];
});

const quickDateOptions = [
  { text: 'Tất cả thời gian', value: '' },
  { text: 'Hôm nay', value: 'today' },
  { text: '7 ngày qua', value: '7days' },
  { text: 'Tháng này', value: 'thisMonth' },
];

function formatVND(n?: number) {
  if (n === undefined || n === null) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function formatDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

function formatTime(d?: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(d?: string | null) {
  if (!d) return '—';
  const date = formatDate(d);
  const time = formatTime(d);
  return time ? `${date} ${time}` : date;
}

const hasActiveFilters = computed(() => {
  return !!(
    (filters.search && filters.search.trim()) ||
    filters.state ||
    filters.salesperson ||
    filters.deliveryStatus ||
    quickDate.value
  );
});

function buildParams() {
  const p: Record<string, string | number> = {
    page: page.value,
    limit: limit.value,
  };
  if (filters.search) p.search = filters.search.trim();
  if (filters.state) p.state = filters.state;
  if (filters.salesperson) p.salesperson = filters.salesperson;
  if (filters.deliveryStatus) p.deliveryStatus = filters.deliveryStatus;
  if (filters.from) p.from = filters.from;
  if (filters.to) p.to = filters.to;
  return p;
}

let searchTimer: any = null;
function onFilterChange() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    loadData();
  }, 300);
}

function onQuickDateChange(val: string) {
  const now = new Date();
  if (val === 'today') {
    const todayStr = now.toISOString().split('T')[0];
    filters.from = todayStr;
    filters.to = todayStr;
  } else if (val === '7days') {
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    filters.from = d7.toISOString().split('T')[0];
    filters.to = now.toISOString().split('T')[0];
  } else if (val === 'thisMonth') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    filters.from = monthStart.toISOString().split('T')[0];
    filters.to = now.toISOString().split('T')[0];
  } else {
    filters.from = '';
    filters.to = '';
  }
  page.value = 1;
  loadData();
}

function resetFilters() {
  filters.search = '';
  filters.state = '';
  filters.salesperson = '';
  filters.deliveryStatus = '';
  filters.from = '';
  filters.to = '';
  quickDate.value = '';
  page.value = 1;
  loadData();
}

function onPageChange(newPage: number) {
  page.value = newPage;
  fetchOrders(buildParams());
}

async function loadData() {
  await Promise.all([
    fetchOrders(buildParams()),
    fetchPendingOrders(),
  ]);
}

async function openDetail(id: string) {
  // Populate from local cache immediately so modal opens with data instantly
  const cached = pendingOrders.value.find(o => o.id === id || o.conversationId === id)
    || orders.value.find(o => o.id === id || o.orderCode === id);
  if (cached) {
    selectedOrder.value = cached;
  }
  showDetail.value = true;
  await fetchOrderDetail(id);
}

function goToChat(conversationId: string | undefined) {
  if (!conversationId) return;
  router.push({ path: '/chat', query: { id: conversationId } });
}

function resetConfirmZaloMessage() {
  if (!targetOrder.value) return;
  const customerName = targetOrder.value.partnerName || 'Quý khách';
  const total = formatVND(targetOrder.value.amountTotal);
  const odooCode = targetOrder.value.orderCode;
  const noteStr = confirmNote.value ? `Ghi chú: ${confirmNote.value}\n` : '';
  customConfirmZaloMessage.value = `Dạ đơn hàng ${odooCode} của ${customerName} đã được xác nhận và đang được chuyển sang bộ phận đóng gói ạ. Tổng giá trị đơn hàng là ${total}.
${noteStr}
Em cảm ơn ${customerName} đã ủng hộ shop ạ!`.trim();
}

function resetRejectZaloMessage() {
  if (!targetOrder.value) return;
  customRejectZaloMessage.value = `Xin lỗi khách hàng, đơn hàng trên không thể được tạo với lý do: ${activeRejectReason.value}.
Quý khách có thể sửa lại nội dung đơn hàng để hợp lệ không ạ?
Mong khách hàng thông cảm.`;
}

// @ts-ignore
function openConfirmModal(order: OrderItem) {
  targetOrder.value = order;
  confirmNote.value = '';
  confirmProgress.show = false;
  confirmProgress.step1Done = false;
  confirmProgress.step2Done = false;
  resetConfirmZaloMessage();
  showConfirmDialog.value = true;
}

// @ts-ignore
function openRejectModal(order: OrderItem) {
  targetOrder.value = order;
  selectedReasonPreset.value = rejectionReasonOptions[0].value;
  customRejectReason.value = rejectionReasonOptions[0].value;
  resetRejectZaloMessage();
  showRejectDialog.value = true;
}

let progressDismissTimer: ReturnType<typeof setTimeout> | null = null;

async function executeConfirmOrder() {
  if (!targetOrder.value || actionLoading.value) return;

  if (progressDismissTimer) {
    clearTimeout(progressDismissTimer);
    progressDismissTimer = null;
  }

  const initialCode = targetOrder.value.orderCode;
  const customerName = targetOrder.value.partnerName || 'Khách hàng';
  const targetId = targetOrder.value.id;
  const note = confirmNote.value;
  const customZalo = customConfirmZaloMessage.value;

  confirmProgress.odooCode = initialCode;
  confirmProgress.customerName = customerName;
  confirmProgress.step1Done = false; // Step 1 spinning
  confirmProgress.step2Done = false; // Step 2 spinning
  confirmProgress.show = true;

  actionLoading.value = true;
  try {
    // 1. Await real creation of quotation / order in DB & Odoo
    const res = await confirmOrder(targetId, note, customZalo, targetOrder.value?.lines);
    if (res?.order?.orderCode) {
      confirmProgress.odooCode = res.order.orderCode;
    }
    confirmProgress.step1Done = true; // Step 1 is REALLY complete!

    await loadData();
    await fetchAllBadges();

    // If step 2 already completed (via fast socket event), dismiss after 1.5s
    if (confirmProgress.step2Done) {
      progressDismissTimer = setTimeout(() => {
        showConfirmDialog.value = false;
        confirmProgress.show = false;
        targetOrder.value = null;
        actionLoading.value = false;
      }, 1500);
    }
  } catch (err: any) {
    confirmProgress.show = false;
    snackbar.text = err.response?.data?.error || err.message || 'Lỗi khi xác nhận đơn hàng';
    snackbar.color = 'error';
    snackbar.show = true;
    actionLoading.value = false;
    await loadData();
    await fetchAllBadges();
  }
}

async function executeRejectOrder() {
  if (!targetOrder.value || actionLoading.value) return;
  const orderCode = targetOrder.value.orderCode;
  actionLoading.value = true;
  try {
    const res = await rejectOrder(
      targetOrder.value.id,
      activeRejectReason.value,
      customRejectZaloMessage.value
    );
    showRejectDialog.value = false;
    targetOrder.value = null;
    snackbar.text = res.zaloSent
      ? `Đã từ chối đơn #${orderCode} & gửi tin nhắn thông báo đến khách hàng!`
      : `Đã từ chối đơn #${orderCode} (${res.message || 'Đã từ chối'})`;
    snackbar.color = 'warning';
    snackbar.show = true;

    await loadData();
    await fetchAllBadges();
  } catch (err: any) {
    snackbar.text = err.response?.data?.error || err.message || 'Lỗi khi từ chối đơn hàng';
    snackbar.color = 'error';
    snackbar.show = true;
    await loadData();
    await fetchAllBadges();
  } finally {
    actionLoading.value = false;
  }
}

const countdown = ref(30);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  
  const updateCountdown = () => {
    const now = new Date();
    // Calculate seconds remaining until the next clock :00 or :30 mark
    countdown.value = 30 - (now.getSeconds() % 30);
  };
  
  updateCountdown();
  countdownTimer = setInterval(updateCountdown, 1000);
}

async function handleQuickSync() {
  try {
    const res = await syncOrders();
    snackbar.text = res?.message || 'Đồng bộ đơn hàng Odoo thành công!';
    snackbar.color = 'success';
    snackbar.show = true;
    await loadData();
    await fetchStaffStats();
    await fetchSalespersons();
    await fetchAllBadges();
  } catch (err: any) {
    snackbar.text = err.response?.data?.error || err.message || 'Lỗi khi đồng bộ đơn hàng';
    snackbar.color = 'error';
    snackbar.show = true;
  }
}

let socket: Socket | null = null;

onMounted(async () => {
  await Promise.all([
    loadData(),
    fetchStaffStats(),
    fetchSalespersons(),
  ]);

  startCountdown();

  // Setup Socket listener to refresh orders list in real-time
  try {
    socket = io({ transports: ['websocket', 'polling'] });
    socket.on('order:updated', async () => {
      await Promise.all([
        loadData(),
        fetchStaffStats(),
        fetchSalespersons(),
      ]);
    });

    // Real-time listener for when Zalo message and PDF delivery finishes
    socket.on('order:delivery_complete', (_data: any) => {
      if (confirmProgress.show) {
        confirmProgress.step2Done = true; // Step 2 is ACTUALLY complete
        if (confirmProgress.step1Done) {
          if (progressDismissTimer) clearTimeout(progressDismissTimer);
          progressDismissTimer = setTimeout(() => {
            showConfirmDialog.value = false;
            confirmProgress.show = false;
            targetOrder.value = null;
            actionLoading.value = false;
          }, 1500);
        }
      }
    });
  } catch (err) {
    console.error('Failed to setup socket listener in OrdersView:', err);
  }
});

onUnmounted(() => {
  if (socket) {
    socket.disconnect();
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
});
</script>

<style scoped>
.orders-table {
  width: 100% !important;
}
.orders-table th {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  white-space: nowrap;
}
.orders-table th,
.orders-table td {
  padding-left: 8px !important;
  padding-right: 8px !important;
  white-space: nowrap;
}
/* Desktop: Proportional auto-fit with evenly distributed space */
@media (min-width: 769px) {
  :deep(.v-table__wrapper > table) {
    width: 100% !important;
    table-layout: auto !important;
  }
  .orders-table th,
  .orders-table td {
    padding-left: 10px !important;
    padding-right: 10px !important;
    white-space: nowrap !important;
  }
}
/* Mobile: Fixed layout with percentage columns, no scroll */
@media (max-width: 768px) {
  :deep(.v-table__wrapper) {
    overflow-x: hidden !important;
    width: 100% !important;
  }
  :deep(.v-table__wrapper > table) {
    width: 100% !important;
    min-width: 100% !important;
    table-layout: fixed !important;
  }
  .orders-table th {
    padding-left: 2px !important;
    padding-right: 2px !important;
    font-size: 11.5px !important;
  }
  .orders-table td {
    padding-left: 2px !important;
    padding-right: 2px !important;
    font-size: 12px !important;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .orders-table .v-chip {
    font-size: 11px !important;
    height: 20px !important;
  }
}
.order-row:hover {
  background-color: rgba(var(--v-theme-primary), 0.04) !important;
}
.kpi-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}
.zalo-preview-bubble {
  background-color: rgba(0, 104, 255, 0.05);
  border-color: rgba(0, 104, 255, 0.2) !important;
  font-family: inherit;
  line-height: 1.5;
}
.zalo-preview-reject {
  background-color: rgba(239, 68, 68, 0.05);
  border-color: rgba(239, 68, 68, 0.2) !important;
}
:deep(.v-theme--dark) .orders-table td,
:deep(.v-theme--dark) .orders-table .text-medium-emphasis,
:deep(.v-theme--dark) .orders-table .text-caption {
  color: #ffffff !important;
}
@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.animate-spin-slow {
  animation: spin-slow 8s linear infinite;
}

.confirm-progress-toast {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 99999;
  min-width: 360px;
  max-width: 440px;
  background: rgba(var(--v-theme-surface), 0.98);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(var(--v-border-color), 0.2) !important;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22) !important;
}

.progress-step-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.scale-up-anim {
  animation: scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes scaleUp {
  0% { transform: scale(0.4); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.slide-fade-enter-active {
  transition: all 0.35s ease-out;
}
.slide-fade-leave-active {
  transition: all 0.25s cubic-bezier(1, 0.5, 0.8, 1);
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-20px);
  opacity: 0;
}
</style>
