<template>
  <div class="payments-view pa-4">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-3" style="gap: 16px;">
      <div>
        <h1 class="editorial-heading d-flex align-center gap-2">
          <v-icon color="primary" class="page-icon">lucide-credit-card</v-icon>
          Đối soát & Tự động Kiểm tra Thanh toán
        </h1>
        <div class="text-caption text-medium-emphasis">
          Quản lý biến động số dư 2 tài khoản MB Bank, chấm điểm tin cậy và tự động khớp đơn hàng
        </div>
      </div>

      <div class="d-flex align-center flex-wrap ga-2" style="gap: 12px;">
        <v-btn
          to="/mobile-gateway"
          color="info"
          variant="tonal"
          prepend-icon="lucide-smartphone"
          class="text-none font-weight-medium"
        >
          Test Định Dạng SMS
        </v-btn>

        <v-btn
          color="secondary"
          variant="outlined"
          prepend-icon="lucide-qr-code"
          class="text-none font-weight-medium"
          @click="showQrModal = true"
        >
          Kết nối Điện thoại (Test QR)
        </v-btn>

        <v-btn
          color="primary"
          prepend-icon="lucide-refresh-cw"
          :loading="loading"
          class="text-none font-weight-medium"
          @click="fetchData"
        >
          Làm mới
        </v-btn>
      </div>
    </div>

    <!-- Metric Cards -->
    <v-row class="mb-4" dense>
      <v-col cols="12" sm="6" md="3">
        <v-card variant="outlined" class="pa-3 rounded-lg border bg-surface">
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption text-medium-emphasis">Thu hôm nay (2 TK MB)</span>
            <v-icon color="success" size="18">lucide-arrow-down-left</v-icon>
          </div>
          <div class="text-h6 font-weight-bold font-monospace text-success">
            {{ formatVND(stats.todayTotalAmount) }}
          </div>
          <div class="text-caption text-medium-emphasis">{{ stats.todayTxCount }} giao dịch phát sinh</div>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <v-card variant="outlined" class="pa-3 rounded-lg border bg-surface">
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption text-medium-emphasis">Đã khớp hôm nay</span>
            <v-icon color="primary" size="18">lucide-check-circle</v-icon>
          </div>
          <div class="text-h6 font-weight-bold font-monospace text-primary">
            {{ stats.todayMatchedCount }}
          </div>
          <div class="text-caption text-medium-emphasis">Đơn hàng đã được xác nhận tiền</div>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <v-card variant="outlined" class="pa-3 rounded-lg border bg-surface">
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption text-medium-emphasis">Cần kế toán duyệt</span>
            <v-chip v-if="stats.pendingReviewCount > 0" size="x-small" color="warning" variant="flat" class="font-weight-bold">
              CẦN XỬ LÝ
            </v-chip>
          </div>
          <div class="text-h6 font-weight-bold font-monospace" :class="stats.pendingReviewCount > 0 ? 'text-warning' : 'text-medium-emphasis'">
            {{ stats.pendingReviewCount }}
          </div>
          <div class="text-caption text-medium-emphasis">Gợi ý 1-click hoặc duyệt thủ công</div>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <v-card variant="outlined" class="pa-3 rounded-lg border bg-surface">
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption text-medium-emphasis">Tài khoản kết nối</span>
            <v-icon color="info" size="18">lucide-landmark</v-icon>
          </div>
          <div class="text-h6 font-weight-bold font-monospace text-high-emphasis">
            {{ accounts.length }} Tài khoản
          </div>
          <div class="text-caption text-success font-weight-medium">🟢 Đang sẵn sàng nhận tin</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Navigation Tabs -->
    <v-tabs v-model="activeTab" color="primary" class="border-b mb-4">
      <v-tab value="transactions" class="text-none font-weight-medium">
        <v-icon start size="18">lucide-list</v-icon>
        Biến động số dư & Đối soát
        <v-chip v-if="stats.pendingReviewCount > 0" size="x-small" color="warning" variant="flat" class="ml-2 font-weight-bold">
          {{ stats.pendingReviewCount }}
        </v-chip>
      </v-tab>
      <v-tab value="senders" class="text-none font-weight-medium">
        <v-icon start size="18">lucide-user-check</v-icon>
        Khách quen & Điểm uy tín
      </v-tab>
      <v-tab value="accounts" class="text-none font-weight-medium">
        <v-icon start size="18">lucide-settings</v-icon>
        Cấu hình Tài khoản Ngân hàng
      </v-tab>
    </v-tabs>

    <!-- Tab Contents -->
    <v-window v-model="activeTab">
      <!-- TAB 1: TRANSACTIONS -->
      <v-window-item value="transactions">
        <!-- Sub-Tabs: CHƯA DUYỆT vs ĐÃ DUYỆT -->
        <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-4">
          <v-btn-toggle
            v-model="reviewSubTab"
            mandatory
            color="primary"
            variant="outlined"
            density="comfortable"
            class="rounded-lg bg-surface border elevation-1"
            @update:model-value="onSubTabChange"
          >
            <v-btn value="pending" class="text-none font-weight-bold px-4 py-2">
              <v-icon start size="18" color="warning">lucide-clock</v-icon>
              CHƯA DUYỆT
              <v-chip
                size="x-small"
                color="warning"
                variant="flat"
                class="ml-2 font-weight-bold"
              >
                {{ pendingCount }}
              </v-chip>
            </v-btn>

            <v-btn value="approved" class="text-none font-weight-bold px-4 py-2">
              <v-icon start size="18" color="success">lucide-check-check</v-icon>
              ĐÃ DUYỆT
              <v-chip
                size="x-small"
                color="success"
                variant="flat"
                class="ml-2 font-weight-bold"
              >
                {{ approvedCount }}
              </v-chip>
            </v-btn>
          </v-btn-toggle>

          <div class="text-caption text-medium-emphasis d-none d-md-block">
            <span v-if="reviewSubTab === 'pending'" class="d-flex align-center ga-1">
              <v-icon size="14" color="warning">lucide-alert-circle</v-icon>
              Giao dịch mới nhận được giữ ở trạng thái <strong>Chờ duyệt</strong>. Bấm <strong>Xác nhận thanh toán</strong> để cập nhật đơn sang <strong>PAID</strong>.
            </span>
            <span v-else class="d-flex align-center ga-1">
              <v-icon size="14" color="success">lucide-shield-check</v-icon>
              Lịch sử các giao dịch đã được nhân viên/kế toán xác nhận thanh toán thành công.
            </span>
          </div>
        </div>

        <!-- Filters -->
        <v-card variant="outlined" class="rounded-lg mb-4 pa-3">
          <v-row dense align="center">
            <v-col cols="12" sm="6" md="4">
              <v-text-field
                v-model="filters.search"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Tìm nội dung SMS, mã đơn, người gửi, STK..."
                prepend-inner-icon="lucide-search"
                clearable
                @update:model-value="fetchTransactions"
              />
            </v-col>

            <v-col v-if="reviewSubTab === 'pending'" cols="6" sm="6" md="3">
              <v-select
                v-model="filters.status"
                :items="pendingStatusOptions"
                item-title="text"
                item-value="value"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Lọc trạng thái chưa duyệt"
                @update:model-value="fetchTransactions"
              />
            </v-col>

            <v-col :cols="reviewSubTab === 'pending' ? '6' : '12'" sm="6" :md="reviewSubTab === 'pending' ? '3' : '6'">
              <v-select
                v-model="filters.bankAccountId"
                :items="accountFilterOptions"
                item-title="text"
                item-value="value"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="Tài khoản MB"
                @update:model-value="fetchTransactions"
              />
            </v-col>

            <v-col cols="12" sm="6" md="2" class="d-flex justify-end">
              <v-btn
                variant="tonal"
                size="small"
                color="secondary"
                prepend-icon="lucide-rotate-ccw"
                class="text-none"
                @click="resetFilters"
              >
                Đặt lại
              </v-btn>
            </v-col>
          </v-row>
        </v-card>

        <!-- Transactions Table -->
        <v-card variant="outlined" class="rounded-lg mb-4 overflow-hidden shadow-sm">
          <v-progress-linear v-if="loading" indeterminate color="primary" />

          <!-- TAB 1 CONTENT: CHƯA DUYỆT -->
          <v-table v-if="reviewSubTab === 'pending'" density="compact" hover class="payments-table">
            <thead>
              <tr class="bg-surface-variant">
                <th style="width: 120px;" class="text-left">Thời gian</th>
                <th style="width: 110px;" class="text-left">TK nhận</th>
                <th style="width: 130px;" class="text-right">Số tiền nhận</th>
                <th style="width: 220px;" class="text-left">Người gửi & ND tin nhắn</th>
                <th style="width: 210px;" class="text-left">Đơn hàng đề xuất</th>
                <th style="width: 200px;" class="text-left">Trạng thái & Cảnh báo</th>
                <th style="width: 190px;" class="text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && transactions.length === 0">
                <td colspan="7" class="text-center text-medium-emphasis py-8">
                  <v-avatar color="warning" variant="tonal" size="48" class="mb-2">
                    <v-icon icon="lucide-check-circle" size="28" color="warning" />
                  </v-avatar>
                  <div class="text-subtitle-2 font-weight-bold">Không có giao dịch nào đang chờ duyệt!</div>
                  <div class="text-caption text-grey">Tất cả giao dịch biến động số dư đã được xử lý xong.</div>
                </td>
              </tr>

              <tr v-for="tx in transactions" :key="tx.id">
                <!-- Time -->
                <td class="text-caption text-medium-emphasis">
                  {{ formatDateTime(tx.transactionTime) }}
                </td>

                <!-- Account -->
                <td>
                  <v-chip size="x-small" color="primary" variant="tonal" class="font-monospace font-weight-bold">
                    MB *{{ tx.accountNumber ? tx.accountNumber.slice(-4) : '...' }}
                  </v-chip>
                </td>

                <!-- Amount -->
                <td class="text-right">
                  <span class="font-weight-bold font-monospace text-subtitle-2" :class="tx.type === 'IN' ? 'text-success' : 'text-error'">
                    {{ tx.type === 'IN' ? '+' : '-' }}{{ formatVND(tx.amount) }}
                  </span>
                </td>

                <!-- Sender & SMS Description -->
                <td style="max-width: 220px;">
                  <div class="font-weight-medium text-caption text-high-emphasis text-truncate" :title="tx.senderNameRaw || ''">
                    <v-icon size="12" color="medium-emphasis" class="mr-1">lucide-user</v-icon>
                    <span>{{ tx.senderNameRaw || 'Khách vãng lai' }}</span>
                  </div>
                  <div class="text-xs text-medium-emphasis text-truncate font-monospace" :title="tx.description">
                    {{ tx.description }}
                  </div>
                </td>

                <!-- Suggested Order -->
                <td style="max-width: 210px;">
                  <!-- Có đơn đề xuất -->
                  <div v-if="tx.suggestedOrder || tx.matchedOrderCode">
                    <div class="d-flex align-center ga-1">
                      <v-chip
                        size="x-small"
                        color="primary"
                        variant="flat"
                        class="font-weight-bold font-monospace cursor-pointer order-code-chip"
                        prepend-icon="lucide-file-text"
                        @click="openOrderDetailByCode(tx.suggestedOrder?.orderCode || tx.matchedOrderCode)"
                      >
                        {{ tx.suggestedOrder?.orderCode || tx.matchedOrderCode }}
                      </v-chip>
                    </div>
                    <div v-if="tx.suggestedOrder?.customerName" class="text-xs text-medium-emphasis text-truncate mt-1" :title="tx.suggestedOrder.customerName">
                      {{ tx.suggestedOrder.customerName }}
                    </div>
                    <div v-if="tx.suggestedOrder?.amountTotal" class="text-xs font-monospace font-weight-medium text-high-emphasis">
                      Cần thu: {{ formatVND(tx.suggestedOrder.amountTotal) }}
                    </div>
                  </div>
                  <!-- Chưa có đơn -->
                  <div v-else class="text-caption text-disabled d-flex align-center ga-1">
                    <v-icon size="14" color="grey">lucide-help-circle</v-icon>
                    <span>Chưa nhận diện được đơn</span>
                  </div>
                </td>

                <!-- Status & Warning Reasons -->
                <td style="max-width: 200px;">
                  <div class="d-flex flex-column ga-1 align-start">
                    <v-chip
                      size="x-small"
                      :color="getTransactionWarning(tx).color"
                      variant="flat"
                      class="font-weight-bold"
                    >
                      <v-icon start size="12" v-if="getTransactionWarning(tx).icon">{{ getTransactionWarning(tx).icon }}</v-icon>
                      {{ getTransactionWarning(tx).title }}
                    </v-chip>
                    <div v-if="getTransactionWarning(tx).subtitle" class="text-xs font-weight-medium" :class="`text-${getTransactionWarning(tx).color}`">
                      {{ getTransactionWarning(tx).subtitle }}
                    </div>
                  </div>
                </td>

                <!-- Actions -->
                <td class="text-center">
                  <div class="d-flex align-center justify-center ga-1" style="gap: 6px;">
                    <!-- Nút Xác nhận thanh toán (Khi đã có đơn đề xuất) -->
                    <template v-if="tx.suggestedOrderHistoryId || tx.suggestedOrderId || tx.matchedOrderCode">
                      <v-btn
                        color="success"
                        size="small"
                        variant="elevated"
                        class="text-none font-weight-bold shadow-sm"
                        :loading="approvingId === tx.id"
                        title="Xác nhận thanh toán và cập nhật đơn hàng thành PAID"
                        @click="approveTransaction(tx.id)"
                      >
                        <v-icon start size="15">lucide-check</v-icon>
                        Xác nhận thanh toán
                      </v-btn>

                      <!-- Nút đổi sang đơn khác -->
                      <v-btn
                        icon
                        size="28"
                        variant="text"
                        color="medium-emphasis"
                        title="Đổi sang đơn hàng khác"
                        @click="openManualMatch(tx)"
                      >
                        <v-icon size="16">lucide-edit-3</v-icon>
                      </v-btn>
                    </template>

                    <!-- Nút Chọn đơn (Khi chưa có đơn đề xuất) -->
                    <template v-else>
                      <v-btn
                        color="primary"
                        size="small"
                        variant="outlined"
                        class="text-none font-weight-bold"
                        @click="openManualMatch(tx)"
                      >
                        <v-icon start size="15">lucide-search</v-icon>
                        Chọn đơn
                      </v-btn>
                    </template>
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>

          <!-- TAB 2 CONTENT: ĐÃ DUYỆT -->
          <v-table v-else density="compact" hover class="payments-table">
            <thead>
              <tr class="bg-surface-variant">
                <th style="width: 120px;" class="text-left">Thời gian GD</th>
                <th style="width: 110px;" class="text-left">TK nhận</th>
                <th style="width: 130px;" class="text-right">Số tiền</th>
                <th style="width: 220px;" class="text-left">Người chuyển & ND SMS</th>
                <th style="width: 180px;" class="text-left">Đơn hàng đã khớp</th>
                <th style="width: 130px;" class="text-center">Trạng thái</th>
                <th style="width: 200px;" class="text-left">Người duyệt & Thời gian</th>
                <th style="width: 110px;" class="text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && transactions.length === 0">
                <td colspan="8" class="text-center text-medium-emphasis py-8">
                  <v-icon icon="lucide-inbox" size="36" color="grey" class="mb-2" />
                  <div class="text-subtitle-2 font-weight-medium">Chưa có giao dịch nào trong danh sách đã duyệt</div>
                  <div class="text-caption text-grey">Khi kế toán xác nhận thanh toán ở tab "Chưa duyệt", giao dịch sẽ hiển thị tại đây.</div>
                </td>
              </tr>

              <tr v-for="tx in transactions" :key="tx.id">
                <!-- Time -->
                <td class="text-caption text-medium-emphasis">
                  {{ formatDateTime(tx.transactionTime) }}
                </td>

                <!-- Account -->
                <td>
                  <v-chip size="x-small" color="primary" variant="tonal" class="font-monospace font-weight-bold">
                    MB *{{ tx.accountNumber ? tx.accountNumber.slice(-4) : '...' }}
                  </v-chip>
                </td>

                <!-- Amount -->
                <td class="text-right">
                  <span class="font-weight-bold font-monospace text-subtitle-2 text-success">
                    +{{ formatVND(tx.amount) }}
                  </span>
                </td>

                <!-- Sender Name & SMS -->
                <td style="max-width: 220px;">
                  <div class="text-caption font-weight-medium text-high-emphasis text-truncate" :title="tx.senderNameRaw || ''">
                    {{ tx.senderNameRaw || 'Khách vãng lai' }}
                  </div>
                  <div class="text-xs text-medium-emphasis text-truncate font-monospace" :title="tx.description">
                    {{ tx.description }}
                  </div>
                </td>

                <!-- Matched Order -->
                <td>
                  <div class="d-flex align-center ga-1">
                    <v-icon size="14" color="success">lucide-check-circle-2</v-icon>
                    <v-chip
                      size="x-small"
                      color="success"
                      variant="flat"
                      class="font-weight-bold font-monospace cursor-pointer order-code-chip"
                      prepend-icon="lucide-file-text"
                      @click="openOrderDetailByCode(tx.matchedOrderCode)"
                    >
                      {{ tx.matchedOrderCode }}
                    </v-chip>
                  </div>
                  <div v-if="tx.matchedOrderHistory?.partnerName || tx.matchedOrder?.contact?.fullName" class="text-xs text-medium-emphasis text-truncate mt-1">
                    {{ tx.matchedOrderHistory?.partnerName || tx.matchedOrder?.contact?.fullName }}
                  </div>
                </td>

                <!-- Status -->
                <td class="text-center">
                  <v-chip size="x-small" color="success" variant="flat" class="font-weight-bold">
                    ✓ Đã duyệt
                  </v-chip>
                </td>

                <!-- Approver & Approval Time -->
                <td>
                  <div class="d-flex align-center ga-1 text-caption font-weight-medium text-high-emphasis">
                    <v-icon size="13" color="primary">lucide-user-check</v-icon>
                    <span>{{ tx.matchedUser?.fullName || (tx.matchedBy === 'MANUAL_STAFF' ? 'Kế toán duyệt' : (tx.matchedBy || 'Nhân viên')) }}</span>
                  </div>
                  <div class="text-xs text-medium-emphasis font-monospace">
                    {{ formatDateTime(tx.matchedAt || tx.updatedAt) }}
                  </div>
                </td>

                <!-- Actions: View Order -->
                <td class="text-center">
                  <v-btn
                    color="primary"
                    size="x-small"
                    variant="tonal"
                    class="text-none font-weight-medium"
                    @click="openOrderDetailByCode(tx.matchedOrderCode)"
                  >
                    Xem đơn
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>

      <!-- TAB 2: SENDER IDENTITIES (WHITELIST) -->
      <v-window-item value="senders">
        <v-card variant="outlined" class="rounded-lg pa-4">
          <div class="d-flex align-center justify-space-between mb-3">
            <div>
              <div class="text-subtitle-1 font-weight-bold">Danh sách Khách Quen & Hồ sơ Người Chuyển Khoản</div>
              <div class="text-caption text-medium-emphasis">
                Hệ thống tự động ghi nhớ sau mỗi lần duyệt. Những khách hàng tin cậy cao được bật "Tự động duyệt" sẽ không cần người duyệt ở các lần sau.
              </div>
            </div>
          </div>

          <v-table density="compact" hover>
            <thead>
              <tr class="bg-surface-variant">
                <th class="text-left">Tên người chuyển (Bóc từ SMS)</th>
                <th class="text-left">Khách hàng liên kết trong CRM</th>
                <th class="text-center">Số lần khớp thành công</th>
                <th class="text-center">Cấp độ uy tín</th>
                <th class="text-center">Tự động duyệt</th>
                <th class="text-left">Giao dịch gần nhất</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="senders.length === 0">
                <td colspan="6" class="text-center py-6 text-medium-emphasis">
                  Chưa có dữ liệu danh tính người chuyển. Khi kế toán duyệt khớp các giao dịch đầu tiên, hệ thống sẽ tự động học và lưu vào đây.
                </td>
              </tr>
              <tr v-for="s in senders" :key="s.id">
                <td>
                  <strong class="text-high-emphasis font-monospace">{{ s.senderNameClean }}</strong>
                </td>
                <td>
                  <span v-if="s.contact?.fullName" class="text-primary font-weight-medium">
                    {{ s.contact.fullName }} ({{ s.contact.phone || 'Không SĐT' }})
                  </span>
                  <span v-else class="text-medium-emphasis">—</span>
                </td>
                <td class="text-center font-weight-bold">
                  {{ s.successMatchCount }} lần
                </td>
                <td class="text-center">
                  <v-chip size="x-small" :color="s.trustLevel === 'TRUSTED' ? 'success' : 'primary'" variant="tonal">
                    {{ s.trustLevel }}
                  </v-chip>
                </td>
                <td class="text-center">
                  <v-switch
                    :model-value="s.isAutoApproved"
                    color="success"
                    density="compact"
                    hide-details
                    class="d-inline-flex"
                    @update:model-value="(val) => toggleAutoApprove(s.id, val)"
                  />
                </td>
                <td class="text-caption text-medium-emphasis">
                  {{ formatDateTime(s.lastMatchedAt) }}
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>

      <!-- TAB 3: BANK ACCOUNTS CONFIG (CRUD) -->
      <v-window-item value="accounts">
        <v-card variant="outlined" class="rounded-lg pa-4">
          <div class="d-flex flex-wrap align-center justify-space-between gap-3 mb-4">
            <div>
              <div class="text-subtitle-1 font-weight-bold mb-1">Cấu hình Tài khoản Ngân hàng & Cổng Webhook</div>
              <div class="text-caption text-medium-emphasis">
                Điện thoại Android sử dụng Webhook URL và Secret Token của từng tài khoản để đẩy tin nhắn SMS về OCMS.
              </div>
            </div>
            <v-btn
              color="primary"
              variant="flat"
              prepend-icon="lucide-plus"
              class="text-none font-weight-bold rounded-lg"
              @click="openAddAccountDialog"
            >
              Thêm tài khoản mới
            </v-btn>
          </div>

          <v-row v-if="accounts.length > 0">
            <v-col v-for="acc in accounts" :key="acc.id" cols="12" md="6">
              <v-card variant="outlined" class="pa-4 rounded-xl border bg-surface position-relative">
                <div class="d-flex align-center justify-space-between mb-3">
                  <div class="d-flex align-center gap-2">
                    <v-avatar color="primary" size="36">
                      <v-icon color="white" size="18">lucide-landmark</v-icon>
                    </v-avatar>
                    <div>
                      <div class="font-weight-bold text-subtitle-2">{{ acc.bankName }} ({{ acc.bankCode || 'BANK' }})</div>
                      <div class="text-caption text-medium-emphasis">{{ acc.branch || 'Chưa đặt chi nhánh' }}</div>
                    </div>
                  </div>
                  <div class="d-flex align-center gap-2">
                    <v-chip size="small" :color="acc.isActive ? 'success' : 'grey'" variant="flat">
                      {{ acc.isActive ? 'HOẠT ĐỘNG' : 'TẠM DỪNG' }}
                    </v-chip>
                  </div>
                </div>

                <div class="text-caption mb-1">
                  <span class="text-medium-emphasis">Số tài khoản:</span>
                  <strong class="ml-2 font-monospace text-high-emphasis text-body-2">{{ acc.accountNumber }}</strong>
                </div>
                <div class="text-caption mb-1">
                  <span class="text-medium-emphasis">Chủ tài khoản:</span>
                  <strong class="ml-2 text-high-emphasis">{{ acc.accountHolder }}</strong>
                </div>
                <div class="text-caption mb-2 d-flex align-center">
                  <span class="text-medium-emphasis">Webhook Secret:</span>
                  <code class="ml-2 font-monospace text-primary bg-surface-variant px-2 py-0.5 rounded text-truncate" style="max-width: 220px;">
                    {{ acc.webhookSecret }}
                  </code>
                  <v-btn
                    icon
                    size="x-small"
                    variant="text"
                    color="primary"
                    class="ml-1"
                    title="Sao chép Token"
                    @click="copyText(acc.webhookSecret, 'Đã sao chép Webhook Secret!')"
                  >
                    <v-icon size="14">lucide-copy</v-icon>
                  </v-btn>
                </div>

                <div class="text-caption mb-2">
                  <span class="text-medium-emphasis">Tự động duyệt:</span>
                  <v-chip size="x-small" :color="acc.autoApprove ? 'primary' : 'default'" variant="tonal" class="ml-2 font-weight-bold">
                    {{ acc.autoApprove ? `BẬT (Điểm >= ${acc.minTrustScore})` : 'TẮT' }}
                  </v-chip>
                </div>

                <v-divider class="my-3" />

                <div class="text-caption text-medium-emphasis mb-1">Webhook URL gửi SMS (trên App):</div>
                <div class="d-flex align-center justify-space-between bg-surface-variant pa-2 rounded mb-3">
                  <span class="text-caption font-monospace text-truncate mr-2">{{ webhookEndpointUrl }}</span>
                  <v-btn
                    icon
                    size="x-small"
                    variant="text"
                    color="medium-emphasis"
                    title="Sao chép URL"
                    @click="copyText(webhookEndpointUrl, 'Đã sao chép Webhook URL!')"
                  >
                    <v-icon size="14">lucide-copy</v-icon>
                  </v-btn>
                </div>

                <!-- Card Actions: Edit & Delete -->
                <div class="d-flex align-center justify-end gap-2">
                  <v-btn
                    size="small"
                    variant="tonal"
                    color="primary"
                    prepend-icon="lucide-edit"
                    class="text-none font-weight-medium rounded-lg"
                    @click="openEditAccountDialog(acc)"
                  >
                    Chỉnh sửa
                  </v-btn>
                  <v-btn
                    size="small"
                    variant="tonal"
                    color="error"
                    prepend-icon="lucide-trash-2"
                    class="text-none font-weight-medium rounded-lg"
                    @click="openDeleteAccountDialog(acc)"
                  >
                    Xóa
                  </v-btn>
                </div>
              </v-card>
            </v-col>
          </v-row>

          <!-- Empty State -->
          <div v-else class="text-center py-10">
            <v-avatar color="surface-variant" size="56" class="mb-3">
              <v-icon size="28" color="medium-emphasis">lucide-landmark</v-icon>
            </v-avatar>
            <div class="text-subtitle-1 font-weight-bold mb-1">Chưa có tài khoản ngân hàng nào</div>
            <div class="text-caption text-medium-emphasis mb-4">
              Hãy thêm ít nhất một tài khoản ngân hàng để tiếp nhận SMS đối soát thanh toán.
            </div>
            <v-btn
              color="primary"
              variant="flat"
              prepend-icon="lucide-plus"
              class="text-none font-weight-bold rounded-lg"
              @click="openAddAccountDialog"
            >
              Thêm tài khoản ngay
            </v-btn>
          </div>
        </v-card>
      </v-window-item>
    </v-window>

    <!-- Dialog: Thêm / Chỉnh sửa Tài khoản Ngân hàng -->
    <v-dialog v-model="showAccountDialog" max-width="580" persistent>
      <v-card class="rounded-xl pa-2">
        <v-card-title class="d-flex align-center justify-space-between pb-2 border-b">
          <div class="d-flex align-center gap-2">
            <v-icon color="primary" size="22">{{ isEditingAccount ? 'lucide-edit' : 'lucide-plus-circle' }}</v-icon>
            <span class="text-subtitle-1 font-weight-bold">
              {{ isEditingAccount ? 'Chỉnh sửa Tài khoản Ngân hàng' : 'Thêm Tài khoản Ngân hàng mới' }}
            </span>
          </div>
          <v-btn icon size="small" variant="text" @click="showAccountDialog = false">
            <v-icon size="18">lucide-x</v-icon>
          </v-btn>
        </v-card-title>

        <v-card-text class="pt-4">
          <v-row dense>
            <!-- Chọn ngân hàng -->
            <v-col cols="12" sm="8">
              <v-combobox
                v-model="accountForm.bankName"
                :items="bankPresets.map(b => b.name)"
                label="Ngân hàng *"
                variant="outlined"
                density="compact"
                placeholder="VD: MB Bank (Quân Đội)"
                @update:model-value="onBankSelect"
              />
            </v-col>
            <!-- Mã ngân hàng -->
            <v-col cols="12" sm="4">
              <v-text-field
                v-model="accountForm.bankCode"
                label="Mã ngân hàng *"
                variant="outlined"
                density="compact"
                placeholder="VD: MB"
              />
            </v-col>

            <!-- Số tài khoản -->
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="accountForm.accountNumber"
                label="Số tài khoản *"
                variant="outlined"
                density="compact"
                placeholder="VD: 0380123456789"
              />
            </v-col>

            <!-- Tên chủ tài khoản -->
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="accountForm.accountHolder"
                label="Tên chủ tài khoản *"
                variant="outlined"
                density="compact"
                placeholder="VD: CTY TNHH LA PET"
                @input="accountForm.accountHolder = accountForm.accountHolder.toUpperCase()"
              />
            </v-col>

            <!-- Chi nhánh -->
            <v-col cols="12">
              <v-text-field
                v-model="accountForm.branch"
                label="Chi nhánh (tùy chọn)"
                variant="outlined"
                density="compact"
                placeholder="VD: Chi nhánh Sài Gòn"
              />
            </v-col>

            <!-- Webhook Secret -->
            <v-col cols="12">
              <div class="text-caption font-weight-medium mb-1 text-medium-emphasis">
                Mã Webhook Secret (Device Token điền vào App Android) *
              </div>
              <div class="d-flex align-center gap-2">
                <v-text-field
                  v-model="accountForm.webhookSecret"
                  variant="outlined"
                  density="compact"
                  placeholder="Mã secret xác thực..."
                  hide-details
                  class="font-monospace"
                />
                <v-btn
                  variant="tonal"
                  color="primary"
                  class="text-none font-weight-medium"
                  prepend-icon="lucide-sparkles"
                  @click="generateRandomSecret"
                >
                  Tạo mã
                </v-btn>
              </div>
            </v-col>

            <!-- Cấu hình tự động duyệt -->
            <v-col cols="12" class="mt-2">
              <v-card variant="tonal" color="surface-variant" class="pa-3 rounded-lg">
                <div class="d-flex align-center justify-space-between">
                  <div>
                    <div class="text-subtitle-2 font-weight-bold">Tự động duyệt đơn khi khớp tiền</div>
                    <div class="text-caption text-medium-emphasis">
                      Hệ thống tự động chuyển trạng thái đơn hàng sang ĐÃ THANH TOÁN
                    </div>
                  </div>
                  <v-switch
                    v-model="accountForm.autoApprove"
                    color="primary"
                    hide-details
                    density="compact"
                  />
                </div>

                <div v-if="accountForm.autoApprove" class="mt-3">
                  <div class="d-flex justify-space-between text-caption mb-1">
                    <span>Điểm tin cậy tối thiểu để tự duyệt:</span>
                    <strong>{{ accountForm.minTrustScore }} / 100</strong>
                  </div>
                  <v-slider
                    v-model="accountForm.minTrustScore"
                    min="50"
                    max="100"
                    step="5"
                    color="primary"
                    hide-details
                  />
                </div>
              </v-card>
            </v-col>

            <!-- Kích hoạt -->
            <v-col cols="12" class="mt-2">
              <v-switch
                v-model="accountForm.isActive"
                label="Kích hoạt nhận SMS cho tài khoản này"
                color="success"
                hide-details
                density="compact"
              />
            </v-col>
          </v-row>
        </v-card-text>

        <v-card-actions class="d-flex justify-end gap-2 pa-3 border-t">
          <v-btn
            variant="text"
            class="text-none"
            @click="showAccountDialog = false"
          >
            Hủy bỏ
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            class="text-none font-weight-bold px-4"
            :loading="savingAccount"
            @click="saveAccount"
          >
            {{ isEditingAccount ? 'Lưu thay đổi' : 'Tạo tài khoản' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: Xác nhận Xóa Tài khoản -->
    <v-dialog v-model="showDeleteDialog" max-width="440">
      <v-card class="rounded-xl pa-4">
        <div class="d-flex align-center gap-3 mb-3">
          <v-avatar color="error" variant="tonal" size="40">
            <v-icon color="error" size="22">lucide-alert-triangle</v-icon>
          </v-avatar>
          <div>
            <div class="text-subtitle-1 font-weight-bold">Xác nhận xóa tài khoản</div>
            <div class="text-caption text-medium-emphasis">Hành động này không thể hoàn tác</div>
          </div>
        </div>

        <div class="text-body-2 mb-4">
          Bạn có chắc chắn muốn xóa tài khoản <strong>{{ accountToDelete?.bankName }} - {{ accountToDelete?.accountNumber }}</strong> ({{ accountToDelete?.accountHolder }})?
          <div class="text-caption text-medium-emphasis mt-2">
            💡 Lưu ý: Các giao dịch đối soát lịch sử đã phát sinh của tài khoản này vẫn được lưu trữ nguyên vẹn trên hệ thống.
          </div>
        </div>

        <div class="d-flex justify-end gap-2">
          <v-btn variant="text" class="text-none" @click="showDeleteDialog = false">Hủy</v-btn>
          <v-btn
            color="error"
            variant="flat"
            class="text-none font-weight-bold"
            :loading="deletingAccount"
            @click="confirmDeleteAccount"
          >
            Xóa tài khoản
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Snackbar thông báo -->
    <v-snackbar v-model="showSnackbar" :color="snackbarColor" timeout="3000" location="top">
      {{ snackbarText }}
    </v-snackbar>

    <!-- Dialog: Test QR Code Connection -->
    <v-dialog v-model="showQrModal" max-width="480">
      <v-card class="rounded-xl pa-4 text-center">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="font-weight-bold text-subtitle-1">Kết nối Điện thoại Test</div>
          <v-btn icon size="small" variant="text" @click="showQrModal = false">
            <v-icon size="18">lucide-x</v-icon>
          </v-btn>
        </div>

        <div class="text-caption text-medium-emphasis mb-3">
          Mở camera điện thoại hoặc trình duyệt quét mã QR này để truy cập ngay màn hình <strong>Mobile Gateway Test</strong>:
        </div>

        <div class="d-flex justify-center my-3">
          <v-img
            :src="mobileGatewayQrUrl"
            width="220"
            height="220"
            class="elevation-2 rounded-lg border bg-white pa-2"
          />
        </div>

        <div class="text-caption font-monospace bg-surface-variant pa-2 rounded text-truncate mb-3">
          {{ mobileGatewayDirectUrl }}
        </div>

        <v-btn
          color="primary"
          variant="flat"
          block
          class="text-none font-weight-bold"
          @click="openMobileTestInNewTab"
        >
          Mở thử trên Tab mới trình duyệt máy tính
        </v-btn>
      </v-card>
    </v-dialog>

    <!-- Dialog: Chọn Đơn Hàng Để Khớp Thanh Toán (Manual Match Order Picker) -->
    <v-dialog v-model="showOrderMatchDialog" max-width="900" scrollable>
      <v-card class="rounded-xl overflow-hidden">
        <!-- Dialog Header -->
        <v-card-title class="pa-4 bg-surface border-b d-flex align-center justify-space-between">
          <div class="d-flex align-center gap-2" style="gap: 10px;">
            <v-avatar color="primary" size="38" class="text-white elevation-1">
              <v-icon size="20">lucide-shopping-bag</v-icon>
            </v-avatar>
            <div>
              <div class="text-subtitle-1 font-weight-bold">Chọn Đơn Hàng Để Khớp Thanh Toán</div>
              <div class="text-caption text-medium-emphasis">
                Tra cứu danh sách đơn hàng để gán và hoàn tất thanh toán
              </div>
            </div>
          </div>
          <v-btn icon size="small" variant="text" @click="showOrderMatchDialog = false">
            <v-icon size="18">lucide-x</v-icon>
          </v-btn>
        </v-card-title>

        <!-- Transaction Context Bar -->
        <div v-if="selectedTxForMatch" class="pa-3 bg-surface-variant border-b">
          <!-- Row 1: Thông tin tiền, tài khoản, thời gian, người gửi -->
          <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
            <div class="d-flex align-center flex-wrap ga-2">
              <span class="text-caption text-medium-emphasis font-weight-medium">Giao dịch cần gán:</span>
              <span class="font-weight-bold font-monospace text-success text-subtitle-1">
                +{{ formatVND(selectedTxForMatch.amount) }}
              </span>
              <v-chip size="x-small" color="primary" variant="flat" class="font-monospace font-weight-bold">
                {{ selectedTxForMatch.bankCode }} · {{ selectedTxForMatch.accountNumber ? '*' + selectedTxForMatch.accountNumber.slice(-4) : '****' }}
              </v-chip>
              <v-chip v-if="selectedTxForMatch.transactionTime" size="x-small" variant="text" class="text-medium-emphasis font-monospace px-1">
                <v-icon start size="12">lucide-clock</v-icon>
                {{ formatDateTime(selectedTxForMatch.transactionTime) }}
              </v-chip>
              <v-chip v-if="selectedTxForMatch.senderNameRaw" size="x-small" color="info" variant="tonal" class="font-weight-medium">
                <v-icon start size="12">lucide-user</v-icon>
                {{ selectedTxForMatch.senderNameRaw }}
              </v-chip>
              <v-chip v-if="selectedTxForMatch.refCode" size="x-small" variant="outlined" class="text-medium-emphasis font-monospace">
                Mã GD: {{ selectedTxForMatch.refCode }}
              </v-chip>
            </div>

            <div v-if="selectedTxForMatch.parsedOrderCode" class="d-flex align-center ga-1">
              <span class="text-caption text-medium-emphasis">Mã gợi ý:</span>
              <v-chip
                size="x-small"
                color="primary"
                variant="outlined"
                class="font-monospace font-weight-bold cursor-pointer"
                title="Bấm để lọc theo mã gợi ý này"
                @click="searchByParsedCode(selectedTxForMatch.parsedOrderCode)"
              >
                #{{ selectedTxForMatch.parsedOrderCode }}
              </v-chip>
            </div>
          </div>

          <!-- Row 2: Khung hiển thị đầy đủ Nội dung thanh toán (Full Payment Content) -->
          <div class="pa-2.5 rounded-lg border bg-surface d-flex flex-column ga-1">
            <div class="d-flex align-center justify-space-between ga-2">
              <div class="text-caption font-weight-bold text-primary d-flex align-center ga-1">
                <v-icon size="14">lucide-message-square</v-icon>
                <span>Nội dung thanh toán:</span>
              </div>
              <v-btn
                v-if="selectedTxForMatch.description || selectedTxForMatch.rawSms"
                size="x-small"
                variant="tonal"
                color="primary"
                class="text-none font-weight-medium"
                prepend-icon="lucide-copy"
                title="Sao chép toàn bộ nội dung thanh toán"
                @click="copyText(selectedTxForMatch.description || selectedTxForMatch.rawSms, 'Đã sao chép nội dung thanh toán')"
              >
                Sao chép nội dung
              </v-btn>
            </div>

            <!-- Nội dung thanh toán đầy đủ 100%, không bị cắt xén, tự xuống dòng -->
            <div
              class="font-monospace text-body-2 text-high-emphasis user-select-text"
              style="word-break: break-word; overflow-wrap: anywhere; white-space: pre-wrap; line-height: 1.5;"
            >
              {{ selectedTxForMatch.description || selectedTxForMatch.rawSms || '— Không có nội dung thanh toán —' }}
            </div>

            <!-- SMS gốc đầy đủ nếu khác với description -->
            <div
              v-if="selectedTxForMatch.rawSms && selectedTxForMatch.description && selectedTxForMatch.rawSms.trim() !== selectedTxForMatch.description.trim()"
              class="text-xs text-medium-emphasis pt-1 mt-1 border-t font-monospace user-select-text"
              style="word-break: break-word; overflow-wrap: anywhere; line-height: 1.4;"
            >
              <span class="text-disabled font-weight-medium">SMS gốc:</span> {{ selectedTxForMatch.rawSms }}
            </div>
          </div>
        </div>

        <!-- Search & Filter Controls -->
        <div class="pa-3 border-b bg-surface">
          <v-row dense align="center">
            <!-- Search field -->
            <v-col cols="12" sm="7">
              <v-text-field
                v-model="orderSearchQuery"
                placeholder="Tìm kiếm theo mã đơn (ORD-..., SO...) hoặc tên khách hàng..."
                variant="outlined"
                density="compact"
                hide-details
                prepend-inner-icon="lucide-search"
                clearable
                @update:model-value="fetchOrdersForLookup"
                @keydown.enter="fetchOrdersForLookup"
              />
            </v-col>

            <!-- Status filter dropdown -->
            <v-col cols="12" sm="4">
              <v-select
                v-model="orderStatusFilter"
                :items="orderStatusFilterOptions"
                item-title="text"
                item-value="value"
                variant="outlined"
                density="compact"
                hide-details
                prepend-inner-icon="lucide-filter"
                @update:model-value="fetchOrdersForLookup"
              />
            </v-col>

            <!-- Refresh button -->
            <v-col cols="12" sm="1" class="text-right">
              <v-btn
                icon
                variant="tonal"
                color="primary"
                size="small"
                :loading="orderLookupLoading"
                title="Tải lại danh sách đơn"
                @click="fetchOrdersForLookup"
              >
                <v-icon size="16">lucide-refresh-cw</v-icon>
              </v-btn>
            </v-col>
          </v-row>
        </div>

        <!-- Order List Body -->
        <v-card-text class="pa-0" style="max-height: 480px; overflow-y: auto;">
          <!-- Loading State -->
          <div v-if="orderLookupLoading" class="text-center py-8 text-medium-emphasis">
            <v-progress-circular indeterminate color="primary" size="32" class="mb-2" />
            <div class="text-caption">Đang tìm kiếm danh sách đơn hàng...</div>
          </div>

          <!-- Empty State -->
          <div v-else-if="availableOrders.length === 0" class="text-center py-8 text-medium-emphasis">
            <v-icon size="42" class="mb-2 opacity-50">lucide-search-x</v-icon>
            <div class="text-subtitle-2 font-weight-medium">Không tìm thấy đơn hàng nào</div>
            <div class="text-caption mt-1">
              Thử tìm với từ khóa khác hoặc chuyển bộ lọc sang "Tất cả trạng thái".
            </div>
          </div>

          <!-- Order Table -->
          <v-table v-else density="compact" class="orders-lookup-table">
            <thead>
              <tr class="bg-surface-variant text-caption">
                <th class="font-weight-bold">MÃ ĐƠN</th>
                <th class="font-weight-bold">TÊN KHÁCH HÀNG</th>
                <th class="font-weight-bold">THỜI GIAN ĐẶT</th>
                <th class="font-weight-bold text-center">TRẠNG THÁI</th>
                <th class="font-weight-bold text-right">SỐ TIỀN</th>
                <th class="font-weight-bold text-center" style="width: 100px;">THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="order in availableOrders"
                :key="order.id"
                class="hover-row"
              >
                <!-- Mã đơn -->
                <td>
                  <div class="d-flex align-center gap-1" style="gap: 6px;">
                    <span class="font-monospace font-weight-bold text-primary">#{{ order.orderCode }}</span>
                    <v-chip v-if="isExactAmountMatch(order)" size="x-small" color="success" variant="flat" class="font-weight-bold">
                      Khớp 100% tiền
                    </v-chip>
                  </div>
                  <div class="text-xs text-medium-emphasis">{{ order.source }}</div>
                </td>

                <!-- Tên khách hàng -->
                <td>
                  <div class="font-weight-medium text-high-emphasis text-truncate" style="max-width: 200px;">
                    {{ order.customerName }}
                  </div>
                  <div v-if="order.customerPhone" class="text-xs text-medium-emphasis font-monospace">
                    {{ order.customerPhone }}
                  </div>
                </td>

                <!-- Thời gian đặt -->
                <td class="text-caption font-monospace text-medium-emphasis">
                  {{ formatDate(order.orderDate) }}
                </td>

                <!-- Trạng thái đơn -->
                <td class="text-center">
                  <v-chip size="x-small" :color="getOrderStatusColor(order.status)" variant="tonal" class="font-weight-medium">
                    {{ getOrderStatusText(order.status) }}
                  </v-chip>
                </td>

                <!-- Số tiền -->
                <td class="text-right font-monospace font-weight-bold" :class="isExactAmountMatch(order) ? 'text-success' : 'text-high-emphasis'">
                  {{ formatVND(order.amountTotal) }}
                </td>

                <!-- Thao tác chọn -->
                <td class="text-center">
                  <v-btn
                    color="primary"
                    size="small"
                    variant="elevated"
                    class="text-none font-weight-bold rounded-lg"
                    :loading="matchingOrderLoading && targetMatchingOrderId === order.id"
                    @click="selectOrderToMatch(order)"
                  >
                    Chọn
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>

        <!-- Dialog Footer -->
        <v-card-actions class="pa-3 border-t bg-surface justify-space-between text-caption text-medium-emphasis">
          <div>Hiển thị <strong>{{ availableOrders.length }}</strong> đơn hàng</div>
          <v-btn variant="text" size="small" class="text-none" @click="showOrderMatchDialog = false">
            Đóng
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Order Detail Popup -->
    <OrderDetailModal
      v-model="showOrderDetail"
      :order="orderDetailData"
      :loading="orderDetailLoading"
      @saved="onOrderDetailSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { api } from '@/api';
import { io, Socket } from 'socket.io-client';
import OrderDetailModal from '@/components/orders/OrderDetailModal.vue';

const activeTab = ref('transactions');
const loading = ref(false);
const showQrModal = ref(false);
const approvingId = ref<string | null>(null);

// Order detail popup state
const showOrderDetail = ref(false);
const orderDetailData = ref<any>(null);
const orderDetailLoading = ref(false);

// Account CRUD State
const showAccountDialog = ref(false);
const isEditingAccount = ref(false);
const savingAccount = ref(false);
const showDeleteDialog = ref(false);
const deletingAccount = ref(false);
const accountToDelete = ref<any>(null);

const showSnackbar = ref(false);
const snackbarText = ref('');
const snackbarColor = ref('success');

// Manual Match Order State
const showOrderMatchDialog = ref(false);
const selectedTxForMatch = ref<any>(null);
const orderLookupLoading = ref(false);
const matchingOrderLoading = ref(false);
const targetMatchingOrderId = ref<string | null>(null);
const orderSearchQuery = ref('');
const orderStatusFilter = ref('all');
const availableOrders = ref<any[]>([]);

const orderStatusFilterOptions = [
  { text: 'Tất cả trạng thái', value: 'all' },
  { text: 'Chờ thanh toán / Đang xử lý', value: 'pending' },
  { text: 'Đã thanh toán / Hoàn tất', value: 'done' },
  { text: 'Đã hủy', value: 'cancel' },
];

const bankPresets = [
  { name: 'MB Bank (Quân Đội)', code: 'MB' },
  { name: 'Vietcombank', code: 'VCB' },
  { name: 'Techcombank', code: 'TCB' },
  { name: 'VPBank', code: 'VPB' },
  { name: 'ACB (Á Châu)', code: 'ACB' },
  { name: 'BIDV', code: 'BIDV' },
  { name: 'VietinBank', code: 'CTG' },
  { name: 'TPBank', code: 'TPB' },
  { name: 'Sacombank', code: 'STB' },
  { name: 'VIB', code: 'VIB' },
  { name: 'HDBank', code: 'HDB' },
];

const accountForm = reactive({
  id: '',
  bankName: 'MB Bank',
  bankCode: 'MB',
  accountNumber: '',
  accountHolder: '',
  branch: '',
  webhookSecret: '',
  autoApprove: true,
  minTrustScore: 85,
  isActive: true,
});

const stats = reactive({
  todayTotalAmount: 0,
  todayTxCount: 0,
  todayMatchedCount: 0,
  pendingReviewCount: 0,
  accountsCount: 2,
});

const filters = reactive({
  search: '',
  status: '',
  bankAccountId: '',
});

const transactions = ref<any[]>([]);
const senders = ref<any[]>([]);
const accounts = ref<any[]>([]);

const reviewSubTab = ref<'pending' | 'approved'>('pending');
const pendingCount = ref(0);
const approvedCount = ref(0);

const pendingStatusOptions = [
  { text: 'Tất cả trạng thái chưa duyệt', value: '' },
  { text: 'Khớp đề xuất / Chờ duyệt', value: 'SUGGESTED' },
  { text: 'Chuyển thiếu tiền', value: 'PARTIAL' },
  { text: 'Chuyển thừa tiền', value: 'OVERPAID' },
  { text: 'Cần chọn đơn / Kiểm tra', value: 'MANUAL_REVIEW' },
];

function onSubTabChange() {
  filters.status = '';
  fetchTransactions();
}

const accountFilterOptions = computed(() => [
  { text: 'Tất cả tài khoản', value: '' },
  ...accounts.value.map(a => ({
    text: `${a.bankName} - *${a.accountNumber.slice(-4)} (${a.accountHolder})`,
    value: a.id,
  })),
]);

const webhookEndpointUrl = computed(() => {
  return `${window.location.origin}/api/v1/payments/sms-webhook`;
});

const mobileGatewayDirectUrl = computed(() => {
  return `${window.location.origin}/mobile-gateway`;
});

const mobileGatewayQrUrl = computed(() => {
  return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(mobileGatewayDirectUrl.value)}`;
});

function formatVND(n?: number | null): string {
  if (!n) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function formatDateTime(d?: string | Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}


function getTransactionWarning(tx: any): { type: string; title: string; subtitle?: string; color: string; icon?: string } {
  const reasons: string[] = Array.isArray(tx.reconciliationReasons)
    ? tx.reconciliationReasons
    : (typeof tx.reconciliationReasons === 'string' ? JSON.parse(tx.reconciliationReasons || '[]') : []);

  // 1. Thiếu tiền
  if (tx.status === 'PARTIAL' || reasons.includes('AMOUNT_PARTIAL')) {
    const orderAmt = tx.suggestedOrder?.amountTotal || 0;
    const diff = orderAmt > tx.amount ? orderAmt - tx.amount : 0;
    return {
      type: 'partial',
      title: 'Thiếu tiền',
      subtitle: diff > 0 ? `Thiếu ${formatVND(diff)}` : undefined,
      color: 'amber-darken-3',
      icon: 'lucide-alert-triangle',
    };
  }

  // 2. Thừa tiền
  if (tx.status === 'OVERPAID' || reasons.includes('AMOUNT_OVER')) {
    const orderAmt = tx.suggestedOrder?.amountTotal || 0;
    const diff = tx.amount > orderAmt ? tx.amount - orderAmt : 0;
    return {
      type: 'overpaid',
      title: 'Thừa tiền',
      subtitle: diff > 0 ? `Thừa +${formatVND(diff)}` : undefined,
      color: 'info',
      icon: 'lucide-info',
    };
  }

  // 3. Đơn đã thanh toán trước đó
  if (tx.reconciliationStatus === 'PAYMENT_AFTER_PAID' || reasons.includes('ORDER_ALREADY_PAID')) {
    return {
      type: 'already_paid',
      title: 'Đơn đã thanh toán',
      subtitle: 'Đã thu đủ trước đó (tránh thu trùng)',
      color: 'warning',
      icon: 'lucide-alert-circle',
    };
  }

  // 4. Đơn đã hủy
  if (tx.reconciliationStatus === 'ORDER_CANCELLED' || reasons.includes('ORDER_CANCELLED')) {
    return {
      type: 'cancelled',
      title: 'Đơn đã hủy',
      subtitle: 'Đơn trên hệ thống đã bị hủy',
      color: 'error',
      icon: 'lucide-x-circle',
    };
  }

  // 5. Không tìm thấy đơn
  if (
    tx.reconciliationStatus === 'ORDER_NOT_FOUND' ||
    reasons.includes('ORDER_NOT_FOUND') ||
    (!tx.matchedOrderCode && !tx.suggestedOrder && !tx.suggestedOrderHistoryId && !tx.suggestedOrderId)
  ) {
    return {
      type: 'not_found',
      title: 'Không tìm thấy đơn',
      subtitle: 'Mã trong SMS không khớp đơn nào',
      color: 'error',
      icon: 'lucide-help-circle',
    };
  }

  // 6. Điểm tin cậy thấp
  if ((tx.confidenceScore || 0) < 60 || reasons.includes('NO_ORDER_CODE')) {
    return {
      type: 'low_score',
      title: 'Điểm tin cậy thấp',
      subtitle: `Độ tin cậy: ${tx.confidenceScore || 0}/100`,
      color: 'error',
      icon: 'lucide-shield-alert',
    };
  }

  // 7. Khớp đề xuất / Chờ duyệt
  return {
    type: 'suggested',
    title: 'Khớp đề xuất / Chờ duyệt',
    subtitle: `Độ tin cậy: ${tx.confidenceScore || 90}/100`,
    color: 'warning',
    icon: 'lucide-sparkles',
  };
}

async function fetchData() {
  loading.value = true;
  try {
    const [statsRes, accountsRes] = await Promise.all([
      api.get('/payments/stats'),
      api.get('/payments/accounts'),
    ]);

    Object.assign(stats, statsRes.data);
    accounts.value = accountsRes.data.accounts || [];

    await Promise.all([fetchTransactions(), fetchSenders()]);
  } catch (err) {
    console.error('Lỗi tải dữ liệu thanh toán:', err);
  } finally {
    loading.value = false;
  }
}

function onBankSelect(val: string) {
  const match = bankPresets.find(b => b.name === val);
  if (match) {
    accountForm.bankCode = match.code;
  }
}

function generateRandomSecret() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'sec_';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  accountForm.webhookSecret = result;
}

function copyText(text: string, msg: string) {
  if (!text) return;
  navigator.clipboard?.writeText(text);
  snackbarText.value = msg;
  snackbarColor.value = 'success';
  showSnackbar.value = true;
}

function openAddAccountDialog() {
  isEditingAccount.value = false;
  accountForm.id = '';
  accountForm.bankName = 'MB Bank';
  accountForm.bankCode = 'MB';
  accountForm.accountNumber = '';
  accountForm.accountHolder = '';
  accountForm.branch = '';
  generateRandomSecret();
  accountForm.autoApprove = true;
  accountForm.minTrustScore = 85;
  accountForm.isActive = true;
  showAccountDialog.value = true;
}

function openEditAccountDialog(acc: any) {
  isEditingAccount.value = true;
  accountForm.id = acc.id;
  accountForm.bankName = acc.bankName || 'MB Bank';
  accountForm.bankCode = acc.bankCode || 'MB';
  accountForm.accountNumber = acc.accountNumber || '';
  accountForm.accountHolder = acc.accountHolder || '';
  accountForm.branch = acc.branch || '';
  accountForm.webhookSecret = acc.webhookSecret || '';
  accountForm.autoApprove = acc.autoApprove ?? false;
  accountForm.minTrustScore = acc.minTrustScore ?? 85;
  accountForm.isActive = acc.isActive ?? true;
  showAccountDialog.value = true;
}

async function saveAccount() {
  if (!accountForm.accountNumber.trim()) {
    snackbarText.value = 'Vui lòng nhập số tài khoản!';
    snackbarColor.value = 'error';
    showSnackbar.value = true;
    return;
  }
  if (!accountForm.accountHolder.trim()) {
    snackbarText.value = 'Vui lòng nhập tên chủ tài khoản!';
    snackbarColor.value = 'error';
    showSnackbar.value = true;
    return;
  }
  if (!accountForm.webhookSecret.trim()) {
    generateRandomSecret();
  }

  savingAccount.value = true;
  try {
    const payload: any = {
      bankName: accountForm.bankName.trim(),
      bankCode: accountForm.bankCode.trim(),
      accountNumber: accountForm.accountNumber.trim(),
      accountHolder: accountForm.accountHolder.trim().toUpperCase(),
      branch: accountForm.branch.trim() || null,
      webhookSecret: accountForm.webhookSecret.trim(),
      autoApprove: accountForm.autoApprove,
      minTrustScore: accountForm.minTrustScore,
      isActive: accountForm.isActive,
    };
    if (isEditingAccount.value && accountForm.id) {
      payload.id = accountForm.id;
    }

    await api.post('/payments/accounts', payload);
    snackbarText.value = isEditingAccount.value
      ? 'Đã cập nhật tài khoản thành công!'
      : 'Đã thêm tài khoản mới thành công!';
    snackbarColor.value = 'success';
    showSnackbar.value = true;
    showAccountDialog.value = false;

    // Refresh accounts
    const accRes = await api.get('/payments/accounts');
    accounts.value = accRes.data.accounts || [];
  } catch (err: any) {
    snackbarText.value = err.response?.data?.error || 'Lỗi khi lưu tài khoản';
    snackbarColor.value = 'error';
    showSnackbar.value = true;
  } finally {
    savingAccount.value = false;
  }
}

function openDeleteAccountDialog(acc: any) {
  accountToDelete.value = acc;
  showDeleteDialog.value = true;
}

async function confirmDeleteAccount() {
  if (!accountToDelete.value) return;
  deletingAccount.value = true;
  try {
    await api.delete(`/payments/accounts/${accountToDelete.value.id}`);
    snackbarText.value = 'Đã xóa tài khoản thành công!';
    snackbarColor.value = 'success';
    showSnackbar.value = true;
    showDeleteDialog.value = false;
    accountToDelete.value = null;

    // Refresh accounts
    const accRes = await api.get('/payments/accounts');
    accounts.value = accRes.data.accounts || [];
  } catch (err: any) {
    snackbarText.value = err.response?.data?.error || 'Lỗi khi xóa tài khoản';
    snackbarColor.value = 'error';
    showSnackbar.value = true;
  } finally {
    deletingAccount.value = false;
  }
}

async function fetchTransactions() {
  try {
    const res = await api.get('/payments/transactions', {
      params: {
        tab: reviewSubTab.value,
        status: filters.status,
        bankAccountId: filters.bankAccountId,
        search: filters.search,
      },
    });
    transactions.value = res.data.transactions || [];
    pendingCount.value = res.data.pendingCount || 0;
    approvedCount.value = res.data.approvedCount || 0;
  } catch (err) {
    console.error('Lỗi lấy giao dịch:', err);
  }
}

async function fetchSenders() {
  try {
    const res = await api.get('/payments/senders');
    senders.value = res.data.senders || [];
  } catch (err) {
    console.error('Lỗi lấy danh tính người chuyển:', err);
  }
}

function resetFilters() {
  filters.search = '';
  filters.status = '';
  filters.bankAccountId = '';
  fetchTransactions();
}

async function approveTransaction(id: string) {
  approvingId.value = id;
  try {
    const res = await api.post(`/payments/transactions/${id}/approve`, {});
    notify(`Đã xác nhận thanh toán thành công cho đơn #${res.data?.orderCode || ''}!`, 'success');
    await fetchData();
  } catch (err: any) {
    alert(err.response?.data?.error || 'Lỗi khi duyệt giao dịch');
  } finally {
    approvingId.value = null;
  }
}

async function openManualMatch(tx: any) {
  selectedTxForMatch.value = tx;
  orderSearchQuery.value = tx.matchedOrderCode || tx.parsedOrderCode || tx.suggestedOrder?.orderCode || '';
  orderStatusFilter.value = 'all';
  showOrderMatchDialog.value = true;
  await fetchOrdersForLookup();
}

function searchByParsedCode(code: string) {
  if (!code) return;
  orderSearchQuery.value = code;
  fetchOrdersForLookup();
}

async function fetchOrdersForLookup() {
  orderLookupLoading.value = true;
  try {
    const res = await api.get('/payments/orders-lookup', {
      params: {
        search: orderSearchQuery.value.trim(),
        status: orderStatusFilter.value,
        limit: 50,
      },
    });
    availableOrders.value = res.data.orders || [];
  } catch (err: any) {
    console.error('Lỗi tra cứu đơn hàng:', err);
    availableOrders.value = [];
  } finally {
    orderLookupLoading.value = false;
  }
}

async function selectOrderToMatch(order: any) {
  if (!selectedTxForMatch.value) return;
  targetMatchingOrderId.value = order.id;
  matchingOrderLoading.value = true;
  try {
    await api.post(`/payments/transactions/${selectedTxForMatch.value.id}/approve`, {
      targetOrderId: order.id,
      isHistoryOrder: order.isHistoryOrder,
    });
    showOrderMatchDialog.value = false;
    notify(`Đã khớp thành công giao dịch với đơn #${order.orderCode}!`, 'success');
    await fetchData();
  } catch (err: any) {
    alert(err.response?.data?.error || 'Lỗi khi gán đơn hàng cho giao dịch');
  } finally {
    matchingOrderLoading.value = false;
    targetMatchingOrderId.value = null;
  }
}

function isExactAmountMatch(order: any): boolean {
  if (!selectedTxForMatch.value) return false;
  const txAmt = selectedTxForMatch.value.amount || 0;
  const orderAmt = order.amountTotal || 0;
  return Math.abs(txAmt - orderAmt) <= 1000;
}

function formatDate(dateStr?: string | Date): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${time} ${date}`;
}

function getOrderStatusColor(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'sale':
    case 'confirmed':
      return 'primary';
    case 'done':
    case 'paid':
    case 'completed':
      return 'success';
    case 'draft':
    case 'new':
    case 'pending':
    case 'processing':
      return 'warning';
    case 'cancel':
    case 'cancelled':
      return 'error';
    default:
      return 'grey';
  }
}

function getOrderStatusText(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'sale':
      return 'Đã xác nhận (Sale)';
    case 'confirmed':
      return 'Đã xác nhận';
    case 'done':
      return 'Hoàn tất (Done)';
    case 'paid':
      return 'Đã thanh toán';
    case 'completed':
      return 'Hoàn thành';
    case 'draft':
      return 'Báo giá / Nháp';
    case 'new':
      return 'Đơn mới';
    case 'pending':
      return 'Chờ xử lý';
    case 'processing':
      return 'Đang giao';
    case 'cancel':
    case 'cancelled':
      return 'Đã hủy';
    default:
      return status || 'Khác';
  }
}

function notify(text: string, color = 'success') {
  snackbarText.value = text;
  snackbarColor.value = color;
  showSnackbar.value = true;
}

async function toggleAutoApprove(senderId: string, value: boolean) {
  try {
    await api.patch(`/payments/senders/${senderId}`, {
      isAutoApproved: value,
    });
    await fetchSenders();
  } catch (err) {
    console.error('Lỗi cập nhật auto approve:', err);
  }
}

function openMobileTestInNewTab() {
  window.open(mobileGatewayDirectUrl.value, '_blank');
}

async function openOrderDetailByCode(code: string) {
  if (!code) return;
  showOrderDetail.value = true;
  orderDetailLoading.value = true;
  orderDetailData.value = null;
  try {
    const res = await api.get(`/orders/${encodeURIComponent(code)}`);
    orderDetailData.value = res.data.order;
  } catch (err: any) {
    console.error('[Payments] Lỗi tải chi tiết đơn:', err);
    orderDetailData.value = null;
  } finally {
    orderDetailLoading.value = false;
  }
}

async function onOrderDetailSaved() {
  await fetchData();
}

// Khi đóng popup chi tiết đơn, tự động làm mới danh sách giao dịch
watch(showOrderDetail, (open) => {
  if (!open) {
    fetchTransactions();
  }
});

let socket: Socket | null = null;

onMounted(() => {
  fetchData();
  try {
    socket = io({ transports: ['websocket', 'polling'] });
    socket.on('payment:new_transaction', () => fetchData());
    socket.on('payment:matched', () => fetchData());
    socket.on('payment:unmatched', () => fetchData());
    socket.on('order:updated', () => fetchData());
  } catch (err) {
    console.warn('Lỗi kết nối Socket.IO ở PaymentsView:', err);
  }
});

onUnmounted(() => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
});
</script>

<style scoped>
.payments-table th {
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.payments-table td {
  height: 48px;
}

.order-code-chip {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.order-code-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(var(--v-theme-success), 0.35);
}
</style>
