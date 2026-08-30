<template>
  <div class="orders-view">
    <!-- Page Header -->
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap gap-3">
      <div>
        <h1 class="editorial-heading d-flex align-center gap-2">
          <v-icon color="primary" class="page-icon">lucide-shopping-bag</v-icon>
          Quản lý Đơn hàng
        </h1>
        <div class="text-caption text-medium-emphasis mt-1">
          Dữ liệu đơn hàng đồng bộ trực tiếp từ Odoo ERP • Lưu trữ cục bộ siêu tốc
        </div>
      </div>

      <div class="d-flex align-center gap-3">
        <!-- Countdown Widget -->
        <div class="d-flex align-center gap-1.5 text-caption text-medium-emphasis border rounded-lg px-3 py-2 bg-surface">
          <v-icon size="14" color="primary" class="animate-spin-slow">lucide-timer</v-icon>
          Tự động đồng bộ sau:
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

    <!-- KPI Summary Cards -->
    <v-row class="mb-4">
      <v-col cols="6" sm="6" md="3">
        <v-card variant="outlined" class="kpi-card rounded-lg">
          <v-card-text class="pa-4">
            <div class="d-flex justify-space-between align-start">
              <div>
                <div class="text-caption text-medium-emphasis font-weight-medium">TỔNG ĐƠN HÀNG</div>
                <div class="text-h5 font-weight-bold mt-1 text-primary">
                  {{ stats?.totalOrders ? stats.totalOrders.toLocaleString('vi-VN') : '—' }}
                </div>
              </div>
              <v-avatar color="primary" variant="tonal" size="40" rounded="lg">
                <v-icon icon="lucide-shopping-bag" size="20" />
              </v-avatar>
            </div>
            <div class="text-caption text-medium-emphasis mt-2">
              Báo giá: <span class="font-weight-bold text-amber-darken-3">{{ stats?.draftOrders || 0 }}</span> • Đã huỷ: {{ stats?.cancelledOrders || 0 }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="6" sm="6" md="3">
        <v-card variant="outlined" class="kpi-card rounded-lg">
          <v-card-text class="pa-4">
            <div class="d-flex justify-space-between align-start">
              <div>
                <div class="text-caption text-medium-emphasis font-weight-medium">ĐÃ XÁC NHẬN / HOÀN THÀNH</div>
                <div class="text-h5 font-weight-bold mt-1 text-success">
                  {{ stats?.confirmedOrders ? stats.confirmedOrders.toLocaleString('vi-VN') : '—' }}
                </div>
              </div>
              <v-avatar color="success" variant="tonal" size="40" rounded="lg">
                <v-icon icon="lucide-check-circle-2" size="20" />
              </v-avatar>
            </div>
            <div class="text-caption text-medium-emphasis mt-2">
              Tỷ lệ chốt: <span class="font-weight-medium">{{ getConversionRate() }}%</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="6" sm="6" md="3">
        <v-card variant="outlined" class="kpi-card rounded-lg">
          <v-card-text class="pa-4">
            <div class="d-flex justify-space-between align-start">
              <div>
                <div class="text-caption text-medium-emphasis font-weight-medium">TỔNG DOANH THU</div>
                <div class="text-h6 font-weight-bold mt-1 text-teal font-monospace">
                  {{ formatVND(stats?.totalRevenue ?? 0) }}
                </div>
              </div>
              <v-avatar color="teal" variant="tonal" size="40" rounded="lg">
                <v-icon icon="lucide-badge-dollar-sign" size="20" />
              </v-avatar>
            </div>
            <div class="text-caption text-medium-emphasis mt-2">
              Lợi nhuận gộp: <span class="font-weight-medium text-teal">{{ formatVND(stats?.totalMargin ?? 0) }}</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="6" sm="6" md="3">
        <v-card variant="outlined" class="kpi-card rounded-lg">
          <v-card-text class="pa-4">
            <div class="d-flex justify-space-between align-start">
              <div>
                <div class="text-caption text-medium-emphasis font-weight-medium">DOANH THU HÔM NAY</div>
                <div class="text-h6 font-weight-bold mt-1 text-orange-darken-2 font-monospace">
                  {{ formatVND(stats?.todayRevenue ?? 0) }}
                </div>
              </div>
              <v-avatar color="orange" variant="tonal" size="40" rounded="lg">
                <v-icon icon="lucide-calendar" size="20" />
              </v-avatar>
            </div>
            <div class="text-caption text-medium-emphasis mt-2">
              Giá trị TB/đơn: <span class="font-weight-medium">{{ formatVND(stats?.avgOrderValue ?? 0) }}</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Navigation Tabs -->
    <v-tabs v-model="activeTab" color="primary" class="border-b mb-4">
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
      <v-tab value="processed_ai" class="text-none font-weight-medium">
        <v-icon start size="18" color="info">lucide-bot</v-icon>
        Đơn nháp AI đã xử lý
        <v-chip v-if="processedAiTotal > 0" size="x-small" color="info" variant="tonal" class="ml-2 font-weight-bold">
          {{ processedAiTotal }}
        </v-chip>
      </v-tab>
      <v-tab value="staff" class="text-none font-weight-medium">
        <v-icon start size="18">lucide-users</v-icon>
        Hiệu suất Nhân viên
      </v-tab>
    </v-tabs>

    <!-- Window for Tabs -->
    <v-window v-model="activeTab">
      
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

            <!-- Reset Filter -->
            <v-col cols="12" md="1" class="text-right">
              <v-btn icon size="small" variant="text" color="grey" title="Đặt lại bộ lọc" @click="resetFilters">
                <v-icon size="18">lucide-filter-x</v-icon>
              </v-btn>
            </v-col>
          </v-row>
        </v-card>

        <!-- Orders Data Table -->
        <v-card variant="outlined" class="rounded-lg mb-4 overflow-hidden">
          <v-progress-linear v-if="loading" indeterminate color="primary" />

          <v-table density="comfortable" hover class="orders-table">
            <thead>
              <tr class="bg-surface-variant">
                <th style="width: 120px;">Mã đơn</th>
                <th>Khách hàng</th>
                <th style="width: 150px;">Nhân viên</th>
                <th style="width: 130px;">Ngày tạo</th>
                <th style="width: 80px;" class="text-center">Số món</th>
                <th style="width: 150px;" class="text-right">Tổng tiền</th>
                <th style="width: 130px;" class="text-center">Trạng thái</th>
                <th style="width: 120px;" class="text-center">Giao hàng</th>
                <th style="width: 60px;" class="text-center"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && orders.length === 0">
                <td colspan="9" class="text-center text-medium-emphasis py-12">
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
                <!-- Order Code -->
                <td>
                  <span class="font-weight-bold font-monospace text-body-2 text-primary">
                    {{ o.orderCode }}
                  </span>
                </td>

                <!-- Customer -->
                <td>
                  <div class="font-weight-medium text-body-2 line-clamp-1">
                    {{ o.partnerName || o.customerProfile?.name || '—' }}
                  </div>
                  <div v-if="o.customerProfile?.phone || o.customerProfile?.city" class="text-caption text-medium-emphasis">
                    {{ [o.customerProfile?.phone, o.customerProfile?.city].filter(Boolean).join(' • ') }}
                  </div>
                </td>

                <!-- Salesperson -->
                <td>
                  <span class="text-body-2 text-medium-emphasis">{{ o.salesperson || '—' }}</span>
                </td>

                <!-- Date Order -->
                <td>
                  <div class="text-body-2">{{ formatDate(o.dateOrder) }}</div>
                  <div class="text-caption text-medium-emphasis">{{ formatTime(o.dateOrder) }}</div>
                </td>

                <!-- Items count -->
                <td class="text-center">
                  <v-chip size="x-small" variant="tonal" color="grey">
                    {{ o._count?.lines ?? o.lines?.length ?? 0 }} món
                  </v-chip>
                </td>

                <!-- Total Amount -->
                <td class="text-right">
                  <span class="font-weight-bold text-body-2 text-primary font-monospace">
                    {{ formatVND(o.amountTotal) }}
                  </span>
                </td>

                <!-- Order State -->
                <td class="text-center">
                  <v-chip size="x-small" :color="stateColor(o.state)" variant="flat" class="font-weight-medium">
                    {{ stateLabel(o.state) }}
                  </v-chip>
                </td>

                <!-- Delivery Status -->
                <td class="text-center">
                  <v-chip v-if="o.deliveryStatus" size="x-small" :color="deliveryStatusColor(o.deliveryStatus)" variant="tonal">
                    {{ deliveryStatusLabel(o.deliveryStatus) }}
                  </v-chip>
                  <span v-else class="text-caption text-medium-emphasis">—</span>
                </td>

                <!-- Action -->
                <td class="text-center" @click.stop>
                  <v-btn icon size="small" variant="text" color="primary" title="Xem chi tiết" @click="openDetail(o.id)">
                    <v-icon size="18">lucide-eye</v-icon>
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

          <v-table density="comfortable" hover class="orders-table">
            <thead>
              <tr class="bg-surface-variant">
                <th style="width: 120px;">Mã đơn</th>
                <th>Khách hàng</th>
                <th style="width: 150px;">Nhân viên</th>
                <th style="width: 130px;">Thời gian tạo</th>
                <th style="width: 80px;" class="text-center">Số món</th>
                <th style="width: 150px;" class="text-right">Tổng tiền</th>
                <th style="width: 120px;" class="text-center">Trạng thái</th>
                <th>Ghi chú</th>
                <th style="width: 180px;" class="text-center">Hành động</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!pendingLoading && pendingOrders.length === 0">
                <td colspan="8" class="text-center text-medium-emphasis py-12">
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
                <!-- Order Code -->
                <td>
                  <span class="font-weight-bold font-monospace text-body-2 text-primary">
                    {{ o.orderCode }}
                  </span>
                </td>

                <!-- Customer -->
                <td>
                  <div class="font-weight-medium text-body-2 line-clamp-1">
                    {{ o.partnerName || o.customerProfile?.name || '—' }}
                  </div>
                  <div v-if="o.customerProfile?.phone || o.customerProfile?.city" class="text-caption text-medium-emphasis">
                    {{ [o.customerProfile?.phone, o.customerProfile?.city].filter(Boolean).join(' • ') }}
                  </div>
                </td>

                <!-- Salesperson -->
                <td>
                  <span class="text-body-2 text-medium-emphasis">{{ o.salesperson || '—' }}</span>
                </td>

                <!-- Date Order -->
                <td>
                  <div class="text-body-2">{{ formatDate(o.dateOrder) }}</div>
                  <div class="text-caption text-medium-emphasis">{{ formatTime(o.dateOrder) }}</div>
                </td>

                <!-- Items count -->
                <td class="text-center">
                  <v-chip size="x-small" variant="tonal" color="grey">
                    {{ o._count?.lines ?? o.lines?.length ?? 0 }} món
                  </v-chip>
                </td>

                <!-- Total Amount -->
                <td class="text-right">
                  <span class="font-weight-bold text-body-2 text-primary font-monospace">
                    {{ formatVND(o.amountTotal) }}
                  </span>
                </td>

                <!-- Order State -->
                <td class="text-center">
                  <v-chip size="x-small" color="warning" variant="flat" class="font-weight-medium">
                    Chờ duyệt
                  </v-chip>
                </td>

                <!-- Note -->
                <td>
                  <div class="text-caption text-medium-emphasis line-clamp-2" :title="o.note || ''">
                    {{ o.note || '—' }}
                  </div>
                </td>

                <!-- Actions -->
                <td class="text-center" @click.stop>
                  <div class="d-flex align-center justify-center">
                    <v-btn
                      size="small"
                      color="primary"
                      variant="flat"
                      class="text-none px-3"
                      prepend-icon="lucide-message-square"
                      @click="goToChat(o.conversationId)"
                    >
                      Duyệt đơn trong Chat
                    </v-btn>
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>

      <!-- TAB 3: PROCESSED AI DRAFTS -->
      <v-window-item value="processed_ai">
        <v-card variant="outlined" class="rounded-lg mb-4 overflow-hidden">
          <div class="pa-4 bg-surface-variant d-flex align-center justify-space-between border-b">
            <div>
              <div class="font-weight-bold text-subtitle-1 d-flex align-center gap-2">
                <v-icon color="info" size="20">lucide-bot</v-icon>
                Danh sách Đơn nháp AI đã được Nhân viên Xử lý
              </div>
              <div class="text-caption text-medium-emphasis mt-0.5">
                Các đơn nháp do AI tạo đã được duyệt chuyển sang Odoo hoặc đã từ chối kèm lý do.
              </div>
            </div>
            <v-chip color="info" variant="tonal" class="font-weight-bold">
              {{ processedAiTotal }} đơn đã xử lý
            </v-chip>
          </div>

          <v-progress-linear v-if="processedAiLoading" indeterminate color="info" />

          <v-table density="comfortable" hover class="orders-table">
            <thead>
              <tr class="bg-surface-variant">
                <th style="width: 120px;">Mã đơn</th>
                <th>Khách hàng</th>
                <th style="width: 140px;">Nhân viên</th>
                <th style="width: 130px;">Thời gian</th>
                <th style="width: 140px;" class="text-right">Tổng tiền</th>
                <th style="width: 120px;" class="text-center">Trạng thái</th>
                <th>Lý do từ chối / Ghi chú</th>
                <th style="width: 60px;" class="text-center"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!processedAiLoading && processedAiOrders.length === 0">
                <td colspan="8" class="text-center text-medium-emphasis py-12">
                  <v-icon icon="lucide-inbox" size="48" color="grey" class="mb-2" />
                  <div class="text-body-1 font-weight-medium">Chưa có đơn nháp AI nào được xử lý</div>
                </td>
              </tr>

              <tr
                v-for="o in processedAiOrders"
                :key="o.id"
                class="cursor-pointer order-row"
                @click="openDetail(o.id)"
              >
                <!-- Order Code -->
                <td>
                  <span class="font-weight-bold font-monospace text-body-2 text-primary">
                    {{ o.orderCode }}
                  </span>
                </td>

                <!-- Customer -->
                <td>
                  <div class="font-weight-medium text-body-2 line-clamp-1">
                    {{ o.partnerName || o.customerProfile?.name || '—' }}
                  </div>
                  <div v-if="o.customerProfile?.phone" class="text-caption text-medium-emphasis">
                    {{ o.customerProfile?.phone }}
                  </div>
                </td>

                <!-- Salesperson -->
                <td>
                  <span class="text-body-2 text-medium-emphasis">{{ o.salesperson || '—' }}</span>
                </td>

                <!-- Updated At / Date Order -->
                <td>
                  <div class="text-body-2">{{ formatDate(o.updatedAt || o.dateOrder) }}</div>
                  <div class="text-caption text-medium-emphasis">{{ formatTime(o.updatedAt || o.dateOrder) }}</div>
                </td>

                <!-- Total Amount -->
                <td class="text-right">
                  <span class="font-weight-bold text-body-2 text-primary font-monospace">
                    {{ formatVND(o.amountTotal) }}
                  </span>
                </td>

                <!-- Order State -->
                <td class="text-center">
                  <v-chip size="x-small" :color="stateColor(o.state)" variant="flat" class="font-weight-medium">
                    {{ stateLabel(o.state) }}
                  </v-chip>
                </td>

                <!-- Rejection Reason / Note -->
                <td>
                  <div v-if="o.state === 'cancel' && o.note" class="text-caption text-error font-weight-medium line-clamp-2">
                    {{ o.note }}
                  </div>
                  <div v-else-if="o.note" class="text-caption text-medium-emphasis line-clamp-2">
                    {{ o.note }}
                  </div>
                  <span v-else class="text-caption text-medium-emphasis">—</span>
                </td>

                <!-- Action -->
                <td class="text-center" @click.stop>
                  <v-btn icon size="small" variant="text" color="primary" title="Xem chi tiết" @click="openDetail(o.id)">
                    <v-icon size="18">lucide-eye</v-icon>
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>

      <!-- TAB 4: STAFF PERFORMANCE -->
      <v-window-item value="staff">
        <OrderStaffTable :staff-stats="staffStats" :loading="loading" />
      </v-window-item>
    </v-window>

    <!-- Order Detail Modal -->
    <OrderDetailModal
      v-model="showDetail"
      :order="selectedOrder"
      :loading="detailLoading"
    />

    <!-- Confirm Order Dialog with Zalo Preview -->
    <v-dialog v-model="showConfirmDialog" max-width="560">
      <v-card class="rounded-xl overflow-hidden">
        <div class="pa-4 bg-primary text-white d-flex align-center justify-space-between">
          <div class="d-flex align-center gap-2">
            <v-icon size="22">lucide-check-circle-2</v-icon>
            <span class="font-weight-bold text-subtitle-1">Xác nhận Đơn hàng #{{ targetOrder?.orderCode }}</span>
          </div>
          <v-btn icon="lucide-x" variant="text" size="small" color="white" @click="showConfirmDialog = false" />
        </div>

        <v-card-text class="pa-4">
          <div class="text-body-2 mb-3">
            Hệ thống sẽ chuyển trạng thái đơn sang <strong>Đã xác nhận (Sale)</strong>, đồng bộ sang Odoo ERP và tự động gửi tin nhắn xác nhận đến Zalo của khách hàng.
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

          <!-- Zalo Preview Box -->
          <div class="text-caption font-weight-bold text-medium-emphasis mb-1">
            Xem trước tin nhắn Zalo gửi khách hàng:
          </div>
          <v-card variant="outlined" class="pa-3 rounded-lg bg-surface zalo-preview-bubble text-caption">
            <div class="font-weight-bold mb-1 text-primary">🔔 [OCMS] XÁC NHẬN ĐƠN HÀNG #{{ targetOrder?.orderCode }}</div>
            <div>Kính gửi Quý khách {{ targetOrder?.partnerName || 'Quý khách' }},</div>
            <div class="mt-1">Đơn hàng của Quý khách đã được xác nhận thành công!</div>
            <div class="mt-1 font-weight-medium">💰 Tổng giá trị dự kiến: {{ formatVND(targetOrder?.amountTotal) }}</div>
            <div class="mt-1 text-medium-emphasis">Nhân viên sẽ sớm liên hệ gửi báo giá chi tiết và tiến hành giao hàng. Xin cảm ơn!</div>
          </v-card>
        </v-card-text>

        <v-divider />
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="outlined" color="grey" @click="showConfirmDialog = false">Đóng</v-btn>
          <v-btn
            color="success"
            variant="flat"
            :loading="actionLoading"
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
            Vui lòng chọn hoặc nhập lý do từ chối. Lý do này sẽ được lưu vào lịch sử đơn và gửi trực tiếp qua Zalo cho khách hàng.
          </div>

          <!-- Reason Presets -->
          <v-radio-group v-model="selectedReasonPreset" density="compact" class="mb-2">
            <v-radio
              label="Hết hàng tạm thời hoặc số lượng trong kho không đủ đáp ứng"
              value="Hết hàng tạm thời hoặc số lượng trong kho không đủ đáp ứng"
            />
            <v-radio
              label="Khách hàng yêu cầu hủy / Đã đổi ý"
              value="Khách hàng yêu cầu hủy / Đã đổi ý"
            />
            <v-radio
              label="Thông tin liên hệ / Địa chỉ giao hàng chưa đầy đủ hoặc không liên lạc được"
              value="Thông tin liên hệ / Địa chỉ giao hàng chưa đầy đủ hoặc không liên lạc được"
            />
            <v-radio
              label="Lý do khác (Tự nhập)"
              value="custom"
            />
          </v-radio-group>

          <!-- Custom Reason Input -->
          <v-textarea
            v-if="selectedReasonPreset === 'custom'"
            v-model="customRejectReason"
            label="Nhập lý do từ chối cụ thể"
            rows="2"
            variant="outlined"
            density="compact"
            placeholder="Ví dụ: Sản phẩm đã ngưng sản xuất..."
            class="mb-3"
          />

          <!-- Zalo Preview Box -->
          <div class="text-caption font-weight-bold text-medium-emphasis mb-1">
            Xem trước tin nhắn Zalo thông báo hủy gửi khách hàng:
          </div>
          <v-card variant="outlined" class="pa-3 rounded-lg bg-surface zalo-preview-bubble zalo-preview-reject text-caption">
            <div class="font-weight-bold mb-1 text-error">⚠️ [OCMS] THÔNG BÁO VỀ ĐƠN HÀNG #{{ targetOrder?.orderCode }}</div>
            <div>Kính gửi Quý khách {{ targetOrder?.partnerName || 'Quý khách' }},</div>
            <div class="mt-1">Rất tiếc, đơn hàng #{{ targetOrder?.orderCode }} tạm thời chưa thể xác nhận.</div>
            <div class="mt-1 font-weight-medium text-error">❌ Lý do: {{ activeRejectReason }}</div>
            <div class="mt-1 text-medium-emphasis">Quý khách vui lòng nhắn tin trực tiếp để nhân viên hỗ trợ tư vấn. Trân trọng cảm ơn!</div>
          </v-card>
        </v-card-text>

        <v-divider />
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="outlined" color="grey" @click="showRejectDialog = false">Đóng</v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="actionLoading"
            prepend-icon="lucide-send"
            @click="executeRejectOrder"
          >
            Từ chối & Gửi tin Zalo
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
import { io, Socket } from 'socket.io-client';
import { useOrders, ODOO_ORDER_STATES, ODOO_DELIVERY_STATUSES, type OrderItem } from '@/composables/use-orders';
import { useAppBadges } from '@/composables/use-app-badges';
import OrderDetailModal from '@/components/orders/OrderDetailModal.vue';
import OrderStaffTable from '@/components/orders/OrderStaffTable.vue';

const router = useRouter();

const {
  orders,
  selectedOrder,
  total,
  totalPages,
  loading,
  detailLoading,
  syncing,
  stats,
  staffStats,
  salespersons,
  pendingOrders,
  pendingTotal,
  pendingLoading,
  processedAiOrders,
  processedAiTotal,
  processedAiLoading,
  fetchOrders,
  fetchPendingOrders,
  fetchProcessedAiOrders,
  confirmOrder,
  rejectOrder,
  fetchOrderDetail,
  fetchStats,
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
const selectedReasonPreset = ref('Hết hàng tạm thời hoặc số lượng trong kho không đủ đáp ứng');
const customRejectReason = ref('Hết hàng tạm thời hoặc số lượng trong kho không đủ đáp ứng');
const actionLoading = ref(false);

const activeRejectReason = computed(() => {
  if (selectedReasonPreset.value === 'custom') {
    return customRejectReason.value || 'Thông tin đơn hàng chưa đầy đủ';
  }
  return selectedReasonPreset.value;
});

watch(selectedReasonPreset, (newVal) => {
  if (newVal !== 'custom') {
    customRejectReason.value = newVal;
  }
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

function getConversionRate() {
  if (!stats.value?.totalOrders) return 0;
  return ((stats.value.confirmedOrders / stats.value.totalOrders) * 100).toFixed(1);
}

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
    fetchProcessedAiOrders(),
    fetchStats(buildParams() as any),
  ]);
}

async function openDetail(id: string) {
  showDetail.value = true;
  await fetchOrderDetail(id);
}

function goToChat(conversationId: string | undefined) {
  if (!conversationId) return;
  router.push({ path: '/chat', query: { id: conversationId } });
}

// @ts-ignore
function openConfirmModal(order: OrderItem) {
  targetOrder.value = order;
  confirmNote.value = '';
  showConfirmDialog.value = true;
}

// @ts-ignore
function openRejectModal(order: OrderItem) {
  targetOrder.value = order;
  selectedReasonPreset.value = 'Hết hàng tạm thời hoặc số lượng trong kho không đủ đáp ứng';
  customRejectReason.value = 'Hết hàng tạm thời hoặc số lượng trong kho không đủ đáp ứng';
  showRejectDialog.value = true;
}

async function executeConfirmOrder() {
  if (!targetOrder.value) return;
  actionLoading.value = true;
  try {
    const res = await confirmOrder(targetOrder.value.id, confirmNote.value);
    showConfirmDialog.value = false;
    snackbar.text = res.zaloSent
      ? `Đã xác nhận đơn #${targetOrder.value.orderCode} & gửi tin nhắn Zalo cho khách hàng!`
      : `Đã xác nhận đơn #${targetOrder.value.orderCode} (${res.zaloReason || 'Không có Zalo chat'})`;
    snackbar.color = 'success';
    snackbar.show = true;

    await loadData();
    await fetchAllBadges();
  } catch (err: any) {
    snackbar.text = err.response?.data?.error || err.message || 'Lỗi khi xác nhận đơn hàng';
    snackbar.color = 'error';
    snackbar.show = true;
  } finally {
    actionLoading.value = false;
  }
}

async function executeRejectOrder() {
  if (!targetOrder.value) return;
  actionLoading.value = true;
  try {
    const res = await rejectOrder(targetOrder.value.id, activeRejectReason.value);
    showRejectDialog.value = false;
    snackbar.text = res.zaloSent
      ? `Đã từ chối đơn #${targetOrder.value.orderCode} & gửi tin nhắn thông báo đến khách hàng!`
      : `Đã từ chối đơn #${targetOrder.value.orderCode} (${res.zaloReason || 'Không có Zalo chat'})`;
    snackbar.color = 'warning';
    snackbar.show = true;

    await loadData();
    await fetchAllBadges();
  } catch (err: any) {
    snackbar.text = err.response?.data?.error || err.message || 'Lỗi khi từ chối đơn hàng';
    snackbar.color = 'error';
    snackbar.show = true;
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
.orders-table th {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
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
</style>
