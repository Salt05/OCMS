<template>
  <div class="payments-view pa-4">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-3" style="gap: 16px;">
      <div>
        <h1 class="editorial-heading d-flex align-center gap-2">
          <v-icon color="primary" class="page-icon">lucide-credit-card</v-icon>
          Đối soát & Tự động Kiểm tra Thanh toán
        </h1>
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
          v-if="isAdmin"
          icon
          size="small"
          color="primary"
          variant="tonal"
          title="Cấu hình tài khoản ngân hàng"
          aria-label="Cấu hình tài khoản ngân hàng"
          @click="showBankAccountsDialog = true"
        >
          <v-icon size="18">lucide-settings</v-icon>
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

    <!-- Navigation Tabs -->
    <v-tabs v-model="reviewSubTab" color="primary" class="border-b mb-4" @update:model-value="onReviewTabChange">
      <v-tab value="pending" class="text-none font-weight-medium">
        <v-icon start size="18" color="warning">lucide-clock</v-icon>
        CHƯA DUYỆT
        <v-chip size="x-small" color="warning" variant="flat" class="ml-2 font-weight-bold">{{ pendingCount }}</v-chip>
      </v-tab>
      <v-tab value="ignored" class="text-none font-weight-medium">
        <v-icon start size="18" color="grey">lucide-archive</v-icon>
        ĐÃ BỎ QUA
        <v-chip size="x-small" color="grey" variant="flat" class="ml-2 font-weight-bold">{{ ignoredCount }}</v-chip>
      </v-tab>
      <v-tab value="approved" class="text-none font-weight-medium">
        <v-icon start size="18" color="success">lucide-check-check</v-icon>
        ĐÃ DUYỆT
        <v-chip size="x-small" color="success" variant="flat" class="ml-2 font-weight-bold">{{ approvedCount }}</v-chip>
      </v-tab>
    </v-tabs>

    <!-- Transactions -->
    <div>
          <div class="text-caption text-medium-emphasis d-none d-md-block">
            <span v-if="reviewSubTab === 'pending'" class="d-flex align-center ga-1">
              <v-icon size="14" color="warning">lucide-alert-circle</v-icon>
              Giao dịch mới nhận được giữ ở trạng thái <strong>Chờ duyệt</strong>. Bấm <strong>Xác nhận thanh toán</strong> để cập nhật đơn sang <strong>PAID</strong>.
            </span>
            <span v-else-if="reviewSubTab === 'approved'" class="d-flex align-center ga-1">
              <v-icon size="14" color="success">lucide-shield-check</v-icon>
              Lịch sử các giao dịch đã được nhân viên/kế toán xác nhận thanh toán thành công.
            </span>
            <span v-else class="d-flex align-center ga-1">
              <v-icon size="14" color="grey">lucide-archive</v-icon>
              Các giao dịch đã bỏ qua vẫn có thể mở đơn hoặc xác nhận lại.
            </span>
          </div>

        <v-card variant="outlined" class="rounded-lg mb-4 overflow-hidden shadow-sm">
          <v-progress-linear v-if="loading" indeterminate color="primary" />

          <!-- TAB 1 CONTENT: CHƯA DUYỆT -->
          <v-table v-if="reviewSubTab !== 'approved'" density="compact" hover class="payments-table">
            <thead>
              <tr class="bg-surface-variant">
                <th style="width: 125px;" class="text-left sort-header" @click="sortTransactions('time')">
                  Thời gian <v-icon v-if="sortKey === 'time'" size="14">{{ sortDirection === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down' }}</v-icon>
                </th>
                <th style="width: 110px;" class="text-left sort-header" @click="sortTransactions('account')">
                  TK nhận <v-icon v-if="sortKey === 'account'" size="14">{{ sortDirection === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down' }}</v-icon>
                </th>
                <th class="text-left sort-header" @click="sortTransactions('message')">
                  Nội dung tin nhắn <v-icon v-if="sortKey === 'message'" size="14">{{ sortDirection === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down' }}</v-icon>
                </th>
                <th style="width: 180px;" class="text-left sort-header" @click="sortTransactions('order')">
                  Đề xuất <v-icon v-if="sortKey === 'order'" size="14">{{ sortDirection === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down' }}</v-icon>
                </th>
                <th style="width: 150px;" class="text-right sort-header" @click="sortTransactions('remaining')">
                  Cần thanh toán <v-icon v-if="sortKey === 'remaining'" size="14">{{ sortDirection === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down' }}</v-icon>
                </th>
                <th style="width: 140px;" class="text-right sort-header" @click="sortTransactions('amount')">
                  Số tiền nhận <v-icon v-if="sortKey === 'amount'" size="14">{{ sortDirection === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down' }}</v-icon>
                </th>
                <th style="width: 150px;" class="text-center">Thao tác</th>
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

              <tr v-for="tx in sortedTransactions" :key="tx.id">
                <!-- Time -->
                <td class="text-caption text-medium-emphasis">
                  {{ formatDateTime(tx.transactionTime) }}
                </td>

                <!-- Account -->
                <td class="order-code-column">
                  <v-chip size="x-small" color="primary" variant="tonal" class="font-monospace font-weight-bold">
                    MB *{{ tx.accountNumber ? tx.accountNumber.slice(-4) : '...' }}
                  </v-chip>
                </td>

                <!-- Message content -->
                <td class="message-content-cell">
                  <span class="text-caption text-high-emphasis" :title="tx.description">{{ tx.description || '—' }}</span>
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
                  </div>
                  <span v-else class="text-caption text-medium-emphasis">Chưa có</span>
                </td>

                <!-- Remaining amount -->
                <td class="text-right font-monospace font-weight-bold">
                  {{ getRemainingAmount(tx) }}
                </td>

                <!-- Received amount -->
                <td class="text-right font-monospace font-weight-bold text-success">
                  +{{ formatVND(tx.amount) }}
                </td>

                <!-- Actions -->
                <td class="text-center">
                  <div class="d-flex align-center justify-center ga-1" style="gap: 6px;">
                    <!-- Nút Xác nhận thanh toán (Khi đã có đơn đề xuất) -->
                    <template v-if="isAdmin && (tx.suggestedOrderHistoryId || tx.suggestedOrderId || tx.matchedOrderCode)">
                      <v-btn
                        icon
                        size="30"
                        color="success"
                        variant="tonal"
                        :loading="approvingId === tx.id"
                        title="Xác nhận thanh toán và cập nhật đơn hàng thành PAID"
                        @click="approveTransaction(tx.id)"
                      >
                        <v-icon size="17">lucide-check</v-icon>
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
                    <template v-else-if="isAdmin">
                      <v-btn
                        icon
                        size="30"
                        color="primary"
                        variant="tonal"
                        title="Chọn đơn hàng"
                        @click="openManualMatch(tx)"
                      >
                        <v-icon size="17">lucide-search</v-icon>
                      </v-btn>
                    </template>
                    <v-btn v-if="isAdmin" icon size="30" color="grey" variant="tonal" title="Bỏ qua giao dịch" @click="ignoreTransaction(tx.id)">
                      <v-icon size="17">lucide-archive</v-icon>
                    </v-btn>
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>

          <!-- TAB 2 CONTENT: ĐÃ DUYỆT -->
          <v-table v-else density="compact" hover class="payments-table">
            <thead>
              <tr class="bg-surface-variant">
                <th style="width: 125px;" class="text-left sort-header" @click="sortTransactions('time')">
                  Thời gian <v-icon v-if="sortKey === 'time'" size="14">{{ sortDirection === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down' }}</v-icon>
                </th>
                <th style="width: 110px;" class="text-left sort-header" @click="sortTransactions('account')">
                  TK nhận <v-icon v-if="sortKey === 'account'" size="14">{{ sortDirection === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down' }}</v-icon>
                </th>
                <th class="text-left sort-header" @click="sortTransactions('message')">
                  Nội dung tin nhắn <v-icon v-if="sortKey === 'message'" size="14">{{ sortDirection === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down' }}</v-icon>
                </th>
                <th style="width: 180px;" class="text-left sort-header" @click="sortTransactions('order')">
                  Mã đơn <v-icon v-if="sortKey === 'order'" size="14">{{ sortDirection === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down' }}</v-icon>
                </th>
                <th style="width: 170px;" class="text-left sort-header" @click="sortTransactions('approver')">
                  Người duyệt <v-icon v-if="sortKey === 'approver'" size="14">{{ sortDirection === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down' }}</v-icon>
                </th>
                <th style="width: 150px;" class="text-left sort-header" @click="sortTransactions('approvedAt')">
                  Thời gian duyệt <v-icon v-if="sortKey === 'approvedAt'" size="14">{{ sortDirection === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down' }}</v-icon>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && transactions.length === 0">
                <td colspan="6" class="text-center text-medium-emphasis py-8">
                  <v-icon icon="lucide-inbox" size="36" color="grey" class="mb-2" />
                  <div class="text-subtitle-2 font-weight-medium">Chưa có giao dịch nào trong danh sách đã duyệt</div>
                  <div class="text-caption text-grey">Khi kế toán xác nhận thanh toán ở tab "Chưa duyệt", giao dịch sẽ hiển thị tại đây.</div>
                </td>
              </tr>

              <tr v-for="tx in sortedTransactions" :key="tx.id" class="clickable-row" @click="openOrderDetailByCode(tx.matchedOrderCode)">
                <!-- Time -->
                <td class="text-caption text-medium-emphasis">
                  {{ formatDateTime(tx.transactionTime) }}
                </td>

                <!-- Account -->
                <td class="customer-column">
                  <v-chip size="x-small" color="primary" variant="tonal" class="font-monospace font-weight-bold">
                    MB *{{ tx.accountNumber ? tx.accountNumber.slice(-4) : '...' }}
                  </v-chip>
                </td>

                <!-- Message content -->
                <td class="message-content-cell">
                  <span class="text-caption text-high-emphasis" :title="tx.description">{{ tx.description || '—' }}</span>
                </td>

                <!-- Matched Order -->
                <td>
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
                </td>

                <td>
                  <div class="d-flex align-center ga-1 text-caption font-weight-medium text-high-emphasis">
                    <v-icon size="13" color="primary">lucide-user-check</v-icon>
                    <span>{{ tx.matchedUser?.fullName || (tx.matchedBy === 'MANUAL_STAFF' ? 'Kế toán duyệt' : (tx.matchedBy || 'Nhân viên')) }}</span>
                  </div>
                </td>

                <td class="text-caption text-medium-emphasis font-monospace">
                  {{ formatDateTime(tx.matchedAt || tx.updatedAt) }}
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
    </div>

    <!-- Bank account configuration -->
    <v-dialog v-model="showBankAccountsDialog" max-width="1100" scrollable>
      <v-card>
        <v-card variant="outlined" class="rounded-lg pa-4">
          <div class="d-flex flex-wrap align-center justify-space-between gap-3 mb-4">
            <div>
              <div class="text-subtitle-1 font-weight-bold mb-1">Cấu hình Tài khoản Ngân hàng & Cổng Webhook</div>
              <div class="text-caption text-medium-emphasis">
                Điện thoại Android sử dụng Webhook URL và Secret Token của từng tài khoản để đẩy tin nhắn SMS về OCMS.
              </div>
            </div>
            <v-btn
              v-if="isAdmin"
              color="primary"
              variant="flat"
              prepend-icon="lucide-plus"
              class="text-none font-weight-bold rounded-lg"
              @click="openAddAccountDialog"
            >
              Thêm tài khoản mới
            </v-btn>
          </div>

          <!-- LAN Server IP & Webhook Status Banner -->
          <v-alert
            color="primary"
            variant="tonal"
            class="rounded-xl mb-4 py-3"
            density="compact"
          >
            <div class="d-flex flex-wrap align-center justify-space-between gap-3">
              <div class="d-flex align-center gap-3">
                <v-avatar color="primary" variant="flat" size="36">
                  <v-icon color="white" size="20">lucide-wifi</v-icon>
                </v-avatar>
                <div>
                  <div class="text-subtitle-2 font-weight-bold text-high-emphasis d-flex align-center gap-2 flex-wrap">
                    <span>IP Máy chủ mạng LAN:</span>
                    <v-chip size="small" color="primary" variant="flat" class="font-monospace font-weight-bold">
                      {{ selectedServerIp || 'Đang nhận diện...' }}
                    </v-chip>
                    <span v-if="serverNetworkInfo?.port" class="text-caption text-medium-emphasis font-monospace">
                      (Cổng: {{ serverNetworkInfo.port }})
                    </span>
                  </div>
                  <div class="text-caption text-medium-emphasis mt-0.5">
                    💡 Hệ thống tự động phát hiện IP card mạng (tương tự ipconfig). Điện thoại Android cần kết nối chung mạng Wi-Fi/LAN này để gửi tin nhắn SMS.
                  </div>
                </div>
              </div>

              <div class="d-flex align-center gap-2">
                <!-- Dropdown chọn card mạng nếu có nhiều card -->
                <v-menu v-if="availableInterfaces.length > 1" offset-y>
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      variant="outlined"
                      size="small"
                      color="primary"
                      class="text-none rounded-lg"
                      prepend-icon="lucide-network"
                      append-icon="lucide-chevron-down"
                    >
                      Đổi card mạng ({{ availableInterfaces.length }})
                    </v-btn>
                  </template>
                  <v-list density="compact" class="rounded-lg elevation-3">
                    <v-list-subheader>Danh sách card mạng máy tính</v-list-subheader>
                    <v-list-item
                      v-for="item in availableInterfaces"
                      :key="item.ip"
                      :value="item.ip"
                      :active="selectedServerIp === item.ip"
                      @click="selectInterfaceIp(item.ip)"
                    >
                      <template #prepend>
                        <v-icon size="16" :color="item.isRecommended ? 'success' : 'medium-emphasis'">
                          {{ item.type === 'wifi' ? 'lucide-wifi' : (item.type === 'ethernet' ? 'lucide-network' : 'lucide-server') }}
                        </v-icon>
                      </template>
                      <v-list-item-title class="font-monospace text-caption">
                        {{ item.name }}: <strong>{{ item.ip }}</strong>
                      </v-list-item-title>
                      <template #append>
                        <v-chip v-if="item.isRecommended" size="x-small" color="success" variant="tonal" class="ml-2 font-weight-bold">
                          Khuyên dùng
                        </v-chip>
                      </template>
                    </v-list-item>
                  </v-list>
                </v-menu>
              </div>
            </div>
          </v-alert>

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
                <div class="text-caption mb-2 d-flex align-center flex-wrap">
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
                  <span class="text-caption text-disabled ml-2">(Mã xác thực trên App)</span>
                </div>

                <v-divider class="my-3" />

                <div class="d-flex align-center justify-space-between mb-1">
                  <div class="text-caption text-medium-emphasis">Webhook URL gửi SMS (trên App):</div>
                  <v-btn
                    variant="text"
                    size="x-small"
                    color="primary"
                    class="text-none px-1"
                    prepend-icon="lucide-refresh-cw"
                    :loading="detectingIp"
                    @click="fetchNetworkInfo(true)"
                  >
                    Reset IP
                  </v-btn>
                </div>
                <div class="d-flex align-center justify-space-between bg-surface-variant pa-2 rounded mb-3">
                  <span class="text-caption font-monospace text-truncate mr-2 font-weight-medium text-high-emphasis">{{ webhookEndpointUrl }}</span>
                  <div class="d-flex align-center">
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
                </div>

                <!-- Card Actions: Edit & Delete -->
                <div class="d-flex align-center justify-end gap-2">
                  <v-btn
                    v-if="isAdmin"
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
                    v-if="isAdmin"
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
              v-if="isAdmin"
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
      </v-card>
    </v-dialog>

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

    <!-- Dialog: Chọn Đơn Hàng Để Khớp Thanh Toán (Manual Match Order Picker) -->
    <v-dialog v-model="showOrderMatchDialog" class="order-match-dialog" max-width="900" scrollable>
      <v-card class="rounded-xl overflow-hidden order-match-card">
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
        <div v-if="selectedTxForMatch" class="pa-4 bg-surface-variant border-b order-match-context">
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
          <div class="pa-3 rounded-lg border bg-surface d-flex flex-column ga-2 payment-content-box">
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
              class="font-monospace text-body-2 text-high-emphasis user-select-text payment-description"
            >
              {{ selectedTxForMatch.description || selectedTxForMatch.rawSms || '— Không có nội dung thanh toán —' }}
            </div>

            <!-- SMS gốc đầy đủ nếu khác với description -->
            <div
              v-if="selectedTxForMatch.rawSms && selectedTxForMatch.description && selectedTxForMatch.rawSms.trim() !== selectedTxForMatch.description.trim()"
              class="text-xs text-medium-emphasis pt-2 mt-1 border-t font-monospace user-select-text payment-raw-sms"
            >
              <span class="text-disabled font-weight-medium">SMS gốc:</span> {{ selectedTxForMatch.rawSms }}
            </div>
          </div>
        </div>

        <!-- Search -->
        <div class="pa-3 border-b bg-surface order-match-search">
          <v-text-field
            v-model="orderSearchQuery"
            placeholder="Tìm kiếm theo mã đơn (ORD-..., SO...) hoặc tên khách hàng..."
            variant="outlined"
            density="compact"
            hide-details
            prepend-inner-icon="lucide-search"
            clearable
            @update:model-value="scheduleOrdersLookup"
            @keydown.enter="fetchOrdersForLookup"
          />
        </div>

        <!-- Order List Body -->
        <v-card-text class="pa-0 order-match-list">
          <!-- Loading State -->
          <div v-if="orderLookupLoading" class="text-center py-8 text-medium-emphasis">
            <v-progress-circular indeterminate color="primary" size="32" class="mb-2" />
            <div class="text-caption">Đang tìm kiếm danh sách đơn hàng...</div>
          </div>

          <!-- Empty State -->
          <div v-else-if="sortedLookupOrders.length === 0" class="text-center py-8 text-medium-emphasis">
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
                <th class="font-weight-bold order-code-column" @click="sortLookupOrders('code')">MÃ ĐƠN <v-icon size="14">{{ lookupSortIcon('code') }}</v-icon></th>
                <th class="font-weight-bold customer-column" @click="sortLookupOrders('customer')">TÊN KHÁCH HÀNG <v-icon size="14">{{ lookupSortIcon('customer') }}</v-icon></th>
                <th class="font-weight-bold order-date-column" @click="sortLookupOrders('date')">THỜI GIAN ĐẶT <v-icon size="14">{{ lookupSortIcon('date') }}</v-icon></th>
                <th class="font-weight-bold order-status-column text-center" @click="sortLookupOrders('status')">TRẠNG THÁI <v-icon size="14">{{ lookupSortIcon('status') }}</v-icon></th>
                <th class="font-weight-bold amount-column text-right" @click="sortLookupOrders('amount')">SỐ TIỀN <v-icon size="14">{{ lookupSortIcon('amount') }}</v-icon></th>
                <th class="font-weight-bold paid-column text-right" @click="sortLookupOrders('paid')">ĐÃ THANH TOÁN <v-icon size="14">{{ lookupSortIcon('paid') }}</v-icon></th>
                <th class="font-weight-bold text-center" style="width: 100px;">THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="order in sortedLookupOrders"
                :key="order.id"
                class="hover-row"
              >
                <!-- Mã đơn -->
                <td class="order-code-column">
                  <div class="d-flex align-center gap-1" style="gap: 6px;">
                    <span class="font-monospace font-weight-bold text-primary">#{{ truncateOrderCode(order.orderCode) }}</span>
                    <v-chip v-if="isExactAmountMatch(order)" size="x-small" color="success" variant="flat" class="font-weight-bold">
                      Khớp 100% tiền
                    </v-chip>
                  </div>
                  <div class="text-xs text-medium-emphasis">{{ order.source }}</div>
                </td>

                <!-- Tên khách hàng -->
                <td class="customer-column">
                  <div class="font-weight-medium text-high-emphasis text-truncate" style="max-width: 200px;">
                    {{ truncateCustomerName(order.customerName) }}
                  </div>
                  <div v-if="order.customerPhone" class="text-xs text-medium-emphasis font-monospace">
                    {{ order.customerPhone }}
                  </div>
                </td>

                <!-- Thời gian đặt -->
                <td class="order-date-column text-caption font-monospace text-medium-emphasis">
                  {{ formatDate(order.orderDate) }}
                </td>

                <!-- Trạng thái đơn -->
                <td class="order-status-column text-center">
                  <v-chip size="x-small" :color="getOrderStatusColor(order.status)" variant="tonal" class="font-weight-medium">
                    {{ getOrderStatusText(order.status) }}
                  </v-chip>
                </td>

                <!-- Số tiền -->
                <td class="amount-column text-right font-monospace font-weight-bold" :class="isExactAmountMatch(order) ? 'text-success' : 'text-high-emphasis'">
                  {{ formatVND(order.amountTotal) }}
                </td>

                <!-- Đã thanh toán -->
                <td class="paid-column text-right font-monospace font-weight-medium text-success">
                  {{ formatVND(order.paidAmount) }}
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
        <v-card-actions class="pa-3 border-t bg-surface justify-space-between text-caption text-medium-emphasis order-match-footer">
          <div>Trang <strong>{{ currentLookupPage }}</strong> · Hiển thị <strong>{{ availableOrders.length }}</strong> đơn hàng</div>
          <div class="d-flex align-center ga-2">
            <v-btn icon size="small" variant="tonal" :disabled="currentLookupPage === 1 || orderLookupLoading" title="Trang trước" aria-label="Trang trước" @click="changeLookupPage(-1)">
              <v-icon size="18">lucide-chevron-left</v-icon>
            </v-btn>
            <v-btn icon size="small" variant="tonal" :disabled="!lookupHasMore || orderLookupLoading" title="Trang sau" aria-label="Trang sau" @click="changeLookupPage(1)">
              <v-icon size="18">lucide-chevron-right</v-icon>
            </v-btn>
            <v-btn variant="text" size="small" class="text-none" @click="showOrderMatchDialog = false">
              Đóng
            </v-btn>
          </div>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Order Detail Popup -->
    <OrderDetailModal
      v-model="showOrderDetail"
      :order="orderDetailData"
      :loading="orderDetailLoading"
      :read-only="!isAdmin"
      @saved="onOrderDetailSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { api } from '@/api';
import { io, Socket } from 'socket.io-client';
import OrderDetailModal from '@/components/orders/OrderDetailModal.vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.isAdmin);
const loading = ref(false);
const approvingId = ref<string | null>(null);

// Order detail popup state
const showOrderDetail = ref(false);
const orderDetailData = ref<any>(null);
const orderDetailLoading = ref(false);

// Account CRUD State
const showAccountDialog = ref(false);
const showBankAccountsDialog = ref(false);
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
let orderLookupDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let orderLookupRequestId = 0;
const matchingOrderLoading = ref(false);
const targetMatchingOrderId = ref<string | null>(null);
const orderSearchQuery = ref('');
const availableOrders = ref<any[]>([]);
const currentLookupPage = ref(1);
const lookupHasMore = ref(false);

type LookupSortKey = 'code' | 'customer' | 'date' | 'status' | 'amount' | 'paid';
const lookupSortKey = ref<LookupSortKey>('date');
const lookupSortDirection = ref<'asc' | 'desc'>('desc');

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
const accounts = ref<any[]>([]);

const reviewSubTab = ref<'pending' | 'ignored' | 'approved'>('pending');
const pendingCount = ref(0);
const approvedCount = ref(0);
const ignoredCount = ref(0);
type TransactionSortKey = 'time' | 'account' | 'message' | 'order' | 'remaining' | 'amount' | 'approver' | 'approvedAt';
const sortKey = ref<TransactionSortKey>('time');
const sortDirection = ref<'asc' | 'desc'>('desc');

const sortedLookupOrders = computed(() => {
  const orders = [...availableOrders.value];
  orders.sort((first, second) => {
    const firstValue = getLookupSortValue(first, lookupSortKey.value);
    const secondValue = getLookupSortValue(second, lookupSortKey.value);
    const comparison = typeof firstValue === 'number' && typeof secondValue === 'number'
      ? firstValue - secondValue
      : String(firstValue).localeCompare(String(secondValue), 'vi');
    return lookupSortDirection.value === 'asc' ? comparison : -comparison;
  });
  return orders;
});

function getLookupSortValue(order: any, key: LookupSortKey): number | string {
  switch (key) {
    case 'code': return order.orderCode || '';
    case 'customer': return order.customerName || '';
    case 'date': return new Date(order.orderDate || 0).getTime();
    case 'status': return getOrderStatusText(order.status);
    case 'amount': return Number(order.amountTotal || 0);
    case 'paid': return Number(order.paidAmount || 0);
  }
}

function sortLookupOrders(key: LookupSortKey) {
  if (lookupSortKey.value === key) {
    lookupSortDirection.value = lookupSortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  lookupSortKey.value = key;
  lookupSortDirection.value = key === 'date' ? 'desc' : 'asc';
}

function lookupSortIcon(key: LookupSortKey): string {
  if (lookupSortKey.value !== key) return 'lucide-arrow-up-down';
  return lookupSortDirection.value === 'asc' ? 'lucide-arrow-up' : 'lucide-arrow-down';
}

function onReviewTabChange() {
  filters.status = '';
  fetchTransactions();
}

// Network & LAN IP Auto-detection State
interface NetworkInterfaceDetail {
  name: string;
  ip: string;
  family: string;
  type: 'wifi' | 'ethernet' | 'virtual' | 'other';
  isRecommended: boolean;
  label: string;
}

interface ServerNetworkInfo {
  success: boolean;
  primaryIp: string;
  port: number;
  webhookUrl: string;
  healthUrl: string;
  interfaces: NetworkInterfaceDetail[];
}

const serverNetworkInfo = ref<ServerNetworkInfo | null>(null);
const selectedServerIp = ref<string>('');
const detectingIp = ref(false);

const availableInterfaces = computed(() => {
  return serverNetworkInfo.value?.interfaces || [];
});

const webhookEndpointUrl = computed(() => {
  let ip = selectedServerIp.value || serverNetworkInfo.value?.primaryIp;
  // Nếu là IP ảo của Docker (172.x) hoặc loopback, ưu tiên hostname thực tế trên trình duyệt
  if (!ip || ip.startsWith('172.') || ip === '127.0.0.1' || ip === 'localhost') {
    if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !window.location.hostname.startsWith('172.')) {
      ip = window.location.hostname;
    } else {
      ip = serverNetworkInfo.value?.primaryIp || (typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1');
    }
  }
  const port = window.location.port || serverNetworkInfo.value?.port || 3080;
  return `http://${ip}:${port}/api/v1/payments/sms-webhook`;
});

function selectInterfaceIp(ip: string) {
  selectedServerIp.value = ip;
  try {
    localStorage.setItem('ocms_preferred_lan_ip', ip);
  } catch {}
  notify(`Đã chuyển Webhook URL sang card mạng: ${ip}`, 'info');
}

async function fetchNetworkInfo(forceRefresh = false) {
  detectingIp.value = true;
  try {
    const res = await api.get('/payments/network-info');
    if (res.data?.success) {
      serverNetworkInfo.value = res.data;

      const savedIp = typeof localStorage !== 'undefined' ? localStorage.getItem('ocms_preferred_lan_ip') : null;
      let targetIp = res.data.primaryIp;

      // Nếu targetIp là IP ảo Docker (172.x) hoặc 127.0.0.1, fallback về hostname của browser nếu có
      if (!targetIp || res.data.isDocker || targetIp.startsWith('172.') || targetIp === '127.0.0.1') {
        if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !window.location.hostname.startsWith('172.')) {
          targetIp = window.location.hostname;
        } else {
          targetIp = res.data.primaryIp || window.location.hostname;
        }
      }

      // Xóa cache cũ nếu là IP nội bộ Docker 172.x hoặc localhost
      if (savedIp && (savedIp.startsWith('172.') || savedIp === '127.0.0.1' || savedIp === 'localhost')) {
        try { localStorage.removeItem('ocms_preferred_lan_ip'); } catch {}
      }

      if (forceRefresh || !savedIp || savedIp.startsWith('172.') || savedIp === '127.0.0.1' || savedIp === 'localhost') {
        selectedServerIp.value = targetIp;
        try {
          localStorage.setItem('ocms_preferred_lan_ip', targetIp);
        } catch {}
      } else {
        selectedServerIp.value = savedIp;
      }

      if (forceRefresh) {
        notify(`Đã làm mới IP máy chủ thành công: ${selectedServerIp.value} (Port: ${res.data.port || 3080})`, 'success');
      }
    }
  } catch (err: any) {
    console.error('Lỗi nhận diện IP máy chủ:', err);
    if (!selectedServerIp.value || selectedServerIp.value.startsWith('172.')) {
      selectedServerIp.value = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
    }
    if (forceRefresh) {
      notify(`Không thể lấy IP máy chủ tự động, đang dùng: ${selectedServerIp.value}`, 'info');
    }
  } finally {
    detectingIp.value = false;
  }
}

function formatVND(n?: number | null): string {
  if (!n) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function formatDateTime(d?: string | Date | null): string {
  if (!d) return '—';
  const date = new Date(d);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const dateKey = date.toLocaleDateString('en-CA');
  const todayKey = now.toLocaleDateString('en-CA');
  const yesterdayKey = yesterday.toLocaleDateString('en-CA');
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (dateKey === todayKey) return `Hôm nay ${time}`;
  if (dateKey === yesterdayKey) return `Hôm qua ${time}`;
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function getRemainingAmount(tx: any): string {
  const order = tx.suggestedOrder;
  if (!order) return '—';
  return formatVND(Math.max(0, Number(order.amountTotal || 0) - Number(order.paidAmount || 0)));
}

const sortedTransactions = computed(() => {
  const sorted = [...transactions.value];
  sorted.sort((a, b) => {
    const getValue = (tx: any): number | string => {
      switch (sortKey.value) {
        case 'time':
          return new Date(tx.transactionTime || 0).getTime();
        case 'account':
          return tx.accountNumber || '';
        case 'message':
          return tx.description || '';
        case 'order':
          return tx.suggestedOrder?.orderCode || tx.matchedOrderCode || '';
        case 'remaining':
          return tx.suggestedOrder
            ? Math.max(0, Number(tx.suggestedOrder.amountTotal || 0) - Number(tx.suggestedOrder.paidAmount || 0))
            : -1;
        case 'amount':
          return Number(tx.amount || 0);
        case 'approver':
          return tx.matchedUser?.fullName || tx.matchedBy || '';
        case 'approvedAt':
          return new Date(tx.matchedAt || tx.updatedAt || 0).getTime();
      }
    };

    const valueA = getValue(a);
    const valueB = getValue(b);
    const comparison = typeof valueA === 'number' && typeof valueB === 'number'
      ? valueA - valueB
      : String(valueA).localeCompare(String(valueB), 'vi');
    return sortDirection.value === 'asc' ? comparison : -comparison;
  });
  return sorted;
});

function sortTransactions(key: TransactionSortKey) {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  sortKey.value = key;
  sortDirection.value = key === 'time' || key === 'approvedAt' ? 'desc' : 'asc';
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

    await fetchTransactions();
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
    ignoredCount.value = res.data.ignoredCount || 0;
  } catch (err) {
    console.error('Lỗi lấy giao dịch:', err);
  }
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

async function ignoreTransaction(id: string) {
  try {
    await api.post(`/payments/transactions/${id}/ignore`);
    notify('Đã bỏ qua giao dịch.', 'success');
    await fetchData();
  } catch (err: any) {
    alert(err.response?.data?.error || 'Lỗi khi bỏ qua giao dịch');
  }
}

async function openManualMatch(tx: any) {
  selectedTxForMatch.value = tx;
  orderSearchQuery.value = tx.matchedOrderCode || tx.parsedOrderCode || tx.suggestedOrder?.orderCode || '';
  currentLookupPage.value = 1;
  showOrderMatchDialog.value = true;
  await fetchOrdersForLookup();
}

function searchByParsedCode(code: string) {
  if (!code) return;
  orderSearchQuery.value = code;
  currentLookupPage.value = 1;
  fetchOrdersForLookup();
}

async function fetchOrdersForLookup() {
  const requestId = ++orderLookupRequestId;
  orderLookupLoading.value = true;
  try {
    const res = await api.get('/payments/orders-lookup', {
      params: {
        search: String(orderSearchQuery.value || '').trim(),
        status: 'all',
        limit: 50,
        page: currentLookupPage.value,
      },
    });
    // Typing quickly can leave older requests in flight. Only the latest query may win.
    if (requestId !== orderLookupRequestId) return;
    availableOrders.value = res.data.orders || [];
    lookupHasMore.value = Boolean(res.data.hasMore);
  } catch (err: any) {
    if (requestId !== orderLookupRequestId) return;
    console.error('Lỗi tra cứu đơn hàng:', err);
    availableOrders.value = [];
    lookupHasMore.value = false;
  } finally {
    if (requestId === orderLookupRequestId) {
      orderLookupLoading.value = false;
    }
  }
}

function scheduleOrdersLookup() {
  currentLookupPage.value = 1;
  if (orderLookupDebounceTimer) clearTimeout(orderLookupDebounceTimer);
  orderLookupDebounceTimer = setTimeout(() => {
    orderLookupDebounceTimer = null;
    fetchOrdersForLookup();
  }, 250);
}

function changeLookupPage(delta: number) {
  const nextPage = currentLookupPage.value + delta;
  if (nextPage < 1 || (delta > 0 && !lookupHasMore.value)) return;
  currentLookupPage.value = nextPage;
  fetchOrdersForLookup();
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
      return 'Đã xác nhận';
    case 'confirmed':
      return 'Đã xác nhận';
    case 'done':
      return 'Hoàn tất (Done)';
    case 'paid':
      return 'Đã thanh toán';
    case 'completed':
      return 'Hoàn thành';
    case 'draft':
      return 'Báo giá';
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

function truncateOrderCode(orderCode?: string | null): string {
  const code = String(orderCode || '');
  return code.length > 10 ? `${code.slice(0, 10)}...` : code;
}

function truncateCustomerName(customerName?: string | null): string {
  const name = String(customerName || '');
  return name.length > 20 ? `${name.slice(0, 20)}...` : name;
}

function notify(text: string, color = 'success') {
  snackbarText.value = text;
  snackbarColor.value = color;
  showSnackbar.value = true;
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
  fetchNetworkInfo();
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
  if (orderLookupDebounceTimer) clearTimeout(orderLookupDebounceTimer);
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
.payments-table th.sort-header {
  cursor: pointer;
  user-select: none;
}
.payments-table th.sort-header:hover {
  color: rgb(var(--v-theme-primary));
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

:deep(.order-match-dialog .v-overlay__content) {
  width: 900px;
  max-width: calc(100vw - 32px);
  height: 700px;
  max-height: calc(100vh - 32px);
}

:deep(.order-match-card) {
  display: flex;
  flex-direction: column;
  position: relative;
  height: 700px !important;
  min-height: 700px;
  max-height: 700px;
}

.order-match-context {
  flex: 0 0 auto;
}

.payment-content-box {
  padding: 14px 16px !important;
}

.payment-description,
.payment-raw-sms {
  word-break: break-word;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.payment-description {
  line-height: 1.6;
}

.payment-raw-sms {
  line-height: 1.5;
}

.order-match-footer {
  flex: 0 0 auto;
}

:deep(.orders-lookup-table th) {
  cursor: pointer;
  user-select: none;
}

:deep(.orders-lookup-table th:hover) {
  color: rgb(var(--v-theme-primary));
}

.order-match-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

:deep(.orders-lookup-table) {
  width: 100%;
  table-layout: auto;
}

:deep(.orders-lookup-table th),
:deep(.orders-lookup-table td) {
  padding: 8px 10px;
  overflow-wrap: anywhere;
}

:deep(.orders-lookup-table .order-code-column),
:deep(.orders-lookup-table .order-date-column),
:deep(.orders-lookup-table .order-status-column),
:deep(.orders-lookup-table .amount-column),
:deep(.orders-lookup-table .paid-column),
:deep(.orders-lookup-table th:last-child),
:deep(.orders-lookup-table td:last-child) {
  white-space: nowrap !important;
  overflow-wrap: normal;
  word-break: normal;
}

:deep(.orders-lookup-table .order-code-column) {
  width: 1%;
}

:deep(.orders-lookup-table .customer-column) {
  width: auto;
}

:deep(.orders-lookup-table .order-date-column) {
  width: 1%;
}

:deep(.orders-lookup-table .order-status-column) {
  width: 1%;
}

:deep(.orders-lookup-table .amount-column),
:deep(.orders-lookup-table .paid-column) {
  width: 1%;
}

:deep(.orders-lookup-table th:last-child),
:deep(.orders-lookup-table td:last-child) {
  width: 1%;
}

@media (max-width: 700px) {
  :deep(.order-match-dialog .v-overlay__content) {
    width: calc(100vw - 16px);
    max-width: calc(100vw - 16px);
    height: calc(100vh - 16px);
    max-height: calc(100vh - 16px);
  }

  :deep(.order-match-card) {
    height: calc(100vh - 16px) !important;
    min-height: calc(100vh - 16px);
    max-height: calc(100vh - 16px);
  }
}
</style>
