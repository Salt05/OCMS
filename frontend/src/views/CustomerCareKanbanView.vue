<template>
  <div class="benchmark-kanban-page d-flex flex-column pa-3 pa-md-5">
    <!-- 1. Top Filters Box (Warm Beige / White Container) -->
    <v-card class="filter-card pa-4 pa-md-5 mb-4 rounded-xl border bg-white" elevation="0">
      <!-- Search & Score Filter Row with Caramel "Tìm kiếm" button -->
      <div class="d-flex align-center gap-2.5 flex-wrap mb-4">
        <!-- Search text input -->
        <div class="search-input-wrapper position-relative flex-grow-1" style="min-width: 260px;">
          <v-text-field
            v-model="searchQuery"
            placeholder="Tên hoặc mã khách hàng"
            prepend-inner-icon="lucide-search"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            class="custom-search-input"
            @keyup.enter="handleSearchSubmit"
          />
        </div>

        <!-- Dropdown "Mọi customer score" -->
        <div style="min-width: 190px;">
          <v-select
            v-model="selectedScoreFilter"
            :items="scoreOptions"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="compact"
            hide-details
            class="custom-select-score"
          />
        </div>

        <!-- Button "Tìm kiếm" (Caramel Brown) -->
        <v-btn
          color="#b45309"
          class="text-none font-weight-bold text-white px-5 rounded-lg caramel-btn"
          height="40"
          elevation="0"
          :loading="kanbanStore.loading"
          @click="handleSearchSubmit"
        >
          Tìm kiếm
        </v-btn>

        <!-- Button "Đặt lại" (White Outlined) -->
        <v-btn
          variant="outlined"
          color="grey-darken-1"
          class="text-none font-weight-medium px-4 rounded-lg reset-btn"
          height="40"
          elevation="0"
          @click="handleResetFilters"
        >
          Đặt lại
        </v-btn>
      </div>

      <!-- Filter Row 1: MIỀN / THỊ TRƯỜNG -->
      <div class="d-flex align-center gap-2.5 mb-3 overflow-x-auto pb-1 filter-pills-row">
        <span class="filter-row-label text-caption font-weight-bold flex-shrink-0" style="min-width: 130px;">
          MIỀN / THỊ TRƯỜNG
        </span>
        <div class="d-flex gap-2 flex-nowrap align-center">
          <!-- "Tất cả" Pill -->
          <button
            type="button"
            class="pill-btn"
            :class="{ 'pill-btn-active': selectedZone === 'all' }"
            @click="selectZone('all')"
          >
            Tất cả
          </button>

          <!-- Zone Pills -->
          <button
            v-for="z in topZones"
            :key="z.name"
            type="button"
            class="pill-btn"
            :class="{ 'pill-btn-active': selectedZone === z.name }"
            @click="selectZone(z.name)"
          >
            {{ z.name }} <span class="pill-count">{{ z.count }}</span>
          </button>
        </div>
      </div>

      <!-- Filter Row 2: SALE QUẢN LÝ (Only visible if manager/admin has multiple salespeople to choose from) -->
      <div
        v-if="kanbanStore.filterOptions.salespeople && kanbanStore.filterOptions.salespeople.length > 1"
        class="d-flex align-center gap-2.5 overflow-x-auto pb-1 filter-pills-row"
      >
        <span class="filter-row-label text-caption font-weight-bold flex-shrink-0" style="min-width: 130px;">
          SALE QUẢN LÝ
        </span>
        <div class="d-flex gap-2 flex-nowrap align-center">
          <!-- "Tất cả sale" Pill -->
          <button
            type="button"
            class="pill-btn"
            :class="{ 'pill-btn-active': selectedSalesperson === 'all' }"
            @click="selectSalesperson('all')"
          >
            Tất cả sale
          </button>

          <!-- Salesperson Pills -->
          <button
            v-for="sp in kanbanStore.filterOptions.salespeople"
            :key="sp.name"
            type="button"
            class="pill-btn"
            :class="{ 'pill-btn-active': selectedSalesperson === sp.name }"
            @click="selectSalesperson(sp.name)"
          >
            {{ sp.name }} <span class="pill-count">{{ sp.count }}</span>
          </button>
        </div>
      </div>
    </v-card>

    <!-- 2. 4 Metric Cards Row (White cards with soft shadow & icons on left) -->
    <v-row class="mb-4">
      <!-- Metric 1: Khách đang theo dõi -->
      <v-col cols="6" sm="3">
        <v-card class="pa-3.5 pa-md-4 rounded-xl border bg-white metric-summary-card h-100" elevation="0">
          <div class="d-flex align-center gap-3">
            <div class="metric-icon-circle bg-emerald-light d-flex align-center justify-center flex-shrink-0">
              <v-icon size="18" color="#059669">lucide-user</v-icon>
            </div>
            <div>
              <div class="text-caption text-medium-emphasis mb-0.5" style="font-size: 11.5px;">
                Khách đang theo dõi
              </div>
              <div class="text-h6 font-weight-black text-high-emphasis lh-1" style="font-size: 1.25rem !important;">
                {{ kanbanStore.summary.totalCustomers.toLocaleString('vi-VN') }}
              </div>
            </div>
          </div>
        </v-card>
      </v-col>

      <!-- Metric 2: Doanh thu 180 ngày -->
      <v-col cols="6" sm="3">
        <v-card class="pa-3.5 pa-md-4 rounded-xl border bg-white metric-summary-card h-100" elevation="0">
          <div class="d-flex align-center gap-3">
            <div class="metric-icon-circle bg-blue-light d-flex align-center justify-center flex-shrink-0">
              <v-icon size="18" color="#2563eb">lucide-trending-up</v-icon>
            </div>
            <div>
              <div class="text-caption text-medium-emphasis mb-0.5" style="font-size: 11.5px;">
                Doanh thu 180 ngày
              </div>
              <div class="text-h6 font-weight-black text-high-emphasis lh-1" style="font-size: 1.25rem !important;">
                {{ formatAbbreviatedBillion(kanbanStore.summary.totalRevenue180) }}
              </div>
            </div>
          </div>
        </v-card>
      </v-col>

      <!-- Metric 3: Khách cần cứu -->
      <v-col cols="6" sm="3">
        <v-card class="pa-3.5 pa-md-4 rounded-xl border bg-white metric-summary-card h-100" elevation="0">
          <div class="d-flex align-center gap-3">
            <div class="metric-icon-circle bg-red-light d-flex align-center justify-center flex-shrink-0">
              <v-icon size="18" color="#dc2626">lucide-alert-triangle</v-icon>
            </div>
            <div>
              <div class="text-caption text-medium-emphasis mb-0.5" style="font-size: 11.5px;">
                Khách cần cứu
              </div>
              <div class="text-h6 font-weight-black text-high-emphasis lh-1" style="font-size: 1.25rem !important;">
                {{ kanbanStore.summary.customersNeedingRescue || 0 }}
              </div>
            </div>
          </div>
        </v-card>
      </v-col>

      <!-- Metric 4: Khách hạng A -->
      <v-col cols="6" sm="3">
        <v-card class="pa-3.5 pa-md-4 rounded-xl border bg-white metric-summary-card h-100" elevation="0">
          <div class="d-flex align-center gap-3">
            <div class="metric-icon-circle bg-amber-light d-flex align-center justify-center flex-shrink-0">
              <v-icon size="18" color="#d97706">lucide-award</v-icon>
            </div>
            <div>
              <div class="text-caption text-medium-emphasis mb-0.5" style="font-size: 11.5px;">
                Khách hạng A
              </div>
              <div class="text-h6 font-weight-black text-high-emphasis lh-1" style="font-size: 1.25rem !important;">
                {{ kanbanStore.summary.tierACustomers || 0 }}
              </div>
            </div>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- 3. Kanban Grouping Switcher: "Nhóm cột Kanban" -->
    <v-card class="pa-3 px-4 mb-4 rounded-xl border bg-white d-flex align-center justify-space-between flex-wrap gap-2.5" elevation="0">
      <div class="d-flex align-center gap-3">
        <span class="text-caption font-weight-bold text-medium-emphasis" style="font-size: 12.5px;">Nhóm cột Kanban:</span>
        <div class="d-flex gap-1 bg-surface-variant-subtle pa-1 rounded-lg border">
          <button
            type="button"
            class="group-toggle-btn"
            :class="{ 'group-toggle-btn-active': groupingMode === 'status' }"
            @click="groupingMode = 'status'"
          >
            Theo trạng thái
          </button>
          <button
            type="button"
            class="group-toggle-btn"
            :class="{ 'group-toggle-btn-active': groupingMode === 'zone' }"
            @click="groupingMode = 'zone'"
          >
            Theo khu vực
          </button>
        </div>
      </div>

      <div class="d-flex align-center gap-2">
        <v-fade-transition>
          <span v-if="kanbanStore.isRevalidating" class="text-caption text-medium-emphasis d-flex align-center gap-1">
            <v-progress-circular indeterminate size="12" width="2" color="primary" />
            <span>Đang cập nhật...</span>
          </span>
        </v-fade-transition>

        <v-btn
          variant="text"
          size="small"
          prepend-icon="lucide-refresh-cw"
          class="text-none font-weight-medium"
          :loading="kanbanStore.loading"
          @click="handleForceRefresh"
        >
          Làm mới
        </v-btn>
      </div>
    </v-card>

    <!-- 4. 5 Kanban Columns: Natural Flow on Page with Clean Proportional Sticky Header -->
    <div class="kanban-columns-scroll-wrapper">
      <!-- Loading Skeleton (First time load with no cache) -->
      <div v-if="kanbanStore.loading && !hasAnyData" class="benchmark-grid-layout">
        <div v-for="i in 5" :key="i" class="column-card-container rounded-xl pa-3 border bg-white">
          <v-skeleton-loader type="heading, article, article" />
        </div>
      </div>

      <!-- Unified 5-Column Grid -->
      <div v-else class="benchmark-grid-layout">
        <div
          v-for="col in activeColumnsList"
          :key="col.id"
          class="column-card-container d-flex flex-column rounded-xl border"
          :class="`column-status-${col.id}`"
        >
          <!-- Sticky Column Header with Balanced Height & Padding -->
          <div class="column-sticky-header">
            <div class="d-flex align-center justify-space-between w-100 gap-1.5">
              <span class="column-heading font-weight-black text-truncate" :title="col.title">
                {{ col.title }}
              </span>
              <span class="column-count-badge font-weight-bold flex-shrink-0">
                {{ col.count }}
              </span>
            </div>
          </div>

          <!-- Cards List -->
          <div class="column-cards-body pa-2 flex-grow-1">
            <div v-if="col.items.length === 0" class="text-center py-8 text-medium-emphasis text-caption">
              <v-icon size="24" class="text-disabled mb-1">lucide-inbox</v-icon>
              <div>Không có khách hàng</div>
            </div>

            <CareKanbanCard
              v-for="card in col.items"
              :key="card.id"
              :card="card"
              @click="openCustomerDetail"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 5. Customer Detail Sidebar Drawer (Auto-scaled Cards, Spacious Gap, Scrollable) -->
    <v-navigation-drawer
      v-model="showDetailDrawer"
      location="right"
      temporary
      :width="$vuetify.display.xs ? '100%' : drawerWidth"
      style="max-width: 95vw; z-index: 1050;"
      class="elevation-10 resizable-drawer"
    >
      <!-- Resize Handle on the left border -->
      <div
        v-if="!$vuetify.display.xs"
        class="drawer-resize-handle"
        :class="{ 'is-resizing': isResizingDrawer }"
        @mousedown.prevent="startDrawerResize"
        title="Kéo sang trái/phải để điều chỉnh độ rộng sidebar"
      >
        <div class="resize-line"></div>
      </div>

      <div v-if="selectedCard" class="drawer-layout-wrap d-flex flex-column h-100 overflow-hidden">
        <!-- Fixed Header: Balanced, evenly padded header -->
        <div class="drawer-header-wrap px-5 py-4 border-b bg-white flex-shrink-0">
          <!-- Row 1: Customer title + badges + actions (Harmonious vertical alignment) -->
          <div class="d-flex align-center justify-space-between gap-3 mb-3">
            <!-- Customer title + badges on a single line -->
            <div class="d-flex align-center gap-2.5 overflow-hidden flex-grow-1 min-w-0">
              <span class="text-subtitle-1 font-weight-bold text-slate-900 text-truncate" style="font-size: 1.15rem !important; line-height: 1.3;" :title="selectedCard.name">
                {{ selectedCard.name }}
              </span>
              <v-chip size="small" variant="flat" :class="getParetoClass(selectedCard.paretoTier)" class="font-weight-bold px-2.5 flex-shrink-0" style="height: 26px;">
                Hạng {{ selectedCard.paretoTier }}
              </v-chip>
              <v-chip size="small" variant="tonal" :color="getColumnBadgeColor(selectedCard.columnId)" class="font-weight-medium px-2.5 flex-shrink-0 d-none d-sm-inline-flex" style="height: 26px;">
                {{ getColumnTitle(selectedCard.columnId) }}
              </v-chip>
            </div>

            <!-- Actions: Mở Chat (when in chat tab) + Close [X] -->
            <div class="d-flex align-center gap-1.5 flex-shrink-0">
              <v-btn
                v-if="activeDrawerTab === 'chat' && selectedCard.conversationId"
                variant="tonal"
                size="small"
                color="primary"
                height="32"
                class="text-none font-weight-medium rounded-lg px-3 text-caption mr-1"
                prepend-icon="lucide-external-link"
                :to="{ path: '/chat', query: { id: selectedCard.conversationId } }"
                title="Mở toàn màn hình trang Chat để nhắn tin"
              >
                Mở Chat
              </v-btn>

              <v-btn icon variant="text" size="small" density="comfortable" @click="showDetailDrawer = false" title="Đóng">
                <v-icon size="20">lucide-x</v-icon>
              </v-btn>
            </div>
          </div>

          <!-- Row 2: Tabs Switcher (Even spacing & clean padding) -->
          <div class="drawer-tabs-nav d-flex align-center gap-2 pt-2.5 border-t">
            <button
              type="button"
              class="drawer-tab-btn"
              :class="{ 'is-active': activeDrawerTab === 'info' }"
              @click="activeDrawerTab = 'info'"
            >
              <v-icon size="15" class="mr-1.5">lucide-user</v-icon>
              <span>Hồ sơ & Chỉ số</span>
            </button>
            <button
              type="button"
              class="drawer-tab-btn"
              :class="{ 'is-active': activeDrawerTab === 'chat' }"
              @click="switchToChatTab"
            >
              <v-icon size="15" class="mr-1.5">lucide-message-circle</v-icon>
              <span>Tin nhắn Zalo</span>
              <span v-if="selectedCard.lastMessageAt" class="chat-tab-dot"></span>
            </button>
          </div>
        </div>

        <!-- TAB 1: Scrollable Body for Customer Details -->
        <div v-if="activeDrawerTab === 'info'" class="drawer-scroll-body pa-5 pa-md-6 bg-warm-light flex-grow-1 overflow-y-auto">
          <!-- Section 1: THÔNG TIN ĐỐI TÁC & CSKH -->
          <v-card class="pa-5 rounded-2xl border bg-white detail-group-card" elevation="0">
            <div class="section-title d-flex align-center gap-2 mb-4 text-primary font-weight-bold text-caption text-uppercase">
              <v-icon size="16">lucide-user</v-icon>
              <span>Thông tin đối tác & CSKH</span>
            </div>

            <div class="detail-cards-grid">
              <!-- Mã khách hàng -->
              <div class="metric-box-item d-flex align-center gap-3">
                <div class="metric-box-icon bg-blue-subtle">
                  <v-icon size="18" color="#2563eb">lucide-hash</v-icon>
                </div>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="metric-box-label text-caption text-medium-emphasis">Mã đối tác</div>
                  <div class="metric-box-value text-body-2 font-weight-bold text-high-emphasis text-truncate font-monospace">
                    {{ selectedCard.customerId && selectedCard.customerId !== '0' ? '#' + selectedCard.customerId : 'Chưa có mã' }}
                  </div>
                </div>
              </div>

              <!-- Số điện thoại -->
              <div class="metric-box-item d-flex align-center gap-3">
                <div class="metric-box-icon bg-emerald-subtle">
                  <v-icon size="18" color="#059669">lucide-phone</v-icon>
                </div>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="metric-box-label text-caption text-medium-emphasis">Số điện thoại</div>
                  <div class="metric-box-value text-body-2 font-weight-bold text-high-emphasis text-truncate font-monospace">
                    {{ selectedCard.phone || 'Chưa có SĐT' }}
                  </div>
                </div>
              </div>

              <!-- Khu vực / Thị trường -->
              <div class="metric-box-item d-flex align-center gap-3">
                <div class="metric-box-icon bg-orange-subtle">
                  <v-icon size="18" color="#ea580c">lucide-map-pin</v-icon>
                </div>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="metric-box-label text-caption text-medium-emphasis">Khu vực / Miền</div>
                  <div class="metric-box-value text-body-2 font-weight-bold text-high-emphasis text-truncate">
                    {{ selectedCard.zone || 'Khác' }}
                  </div>
                </div>
              </div>

              <!-- Nhân viên CSKH -->
              <div class="metric-box-item d-flex align-center gap-3">
                <div class="metric-box-icon bg-purple-subtle">
                  <v-icon size="18" color="#7c3aed">lucide-user-check</v-icon>
                </div>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="metric-box-label text-caption text-medium-emphasis">Nhân viên CSKH</div>
                  <div class="metric-box-value text-body-2 font-weight-bold text-high-emphasis text-truncate">
                    {{ selectedCard.salesperson || 'Chưa gán Sale' }}
                  </div>
                </div>
              </div>
            </div>
          </v-card>

          <!-- Section 2: CHỈ SỐ TÀI CHÍNH & MUA HÀNG -->
          <v-card class="pa-5 rounded-2xl border bg-white detail-group-card" elevation="0">
            <div class="section-title d-flex align-center gap-2 mb-4 text-primary font-weight-bold text-caption text-uppercase">
              <v-icon size="16">lucide-bar-chart-2</v-icon>
              <span>Chỉ số tài chính & Đơn hàng</span>
            </div>

            <div class="detail-cards-grid">
              <!-- Doanh số 180 ngày -->
              <div class="metric-box-item d-flex align-center gap-3">
                <div class="metric-box-icon bg-emerald-subtle">
                  <v-icon size="18" color="#059669">lucide-dollar-sign</v-icon>
                </div>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="metric-box-label text-caption text-medium-emphasis">Doanh số 180 ngày</div>
                  <div class="metric-box-value text-body-1 font-weight-black text-high-emphasis text-truncate">
                    {{ formatFullCurrency(selectedCard.revenue180) }}
                  </div>
                </div>
              </div>

              <!-- Tăng trưởng -->
              <div class="metric-box-item d-flex align-center gap-3">
                <div class="metric-box-icon" :class="selectedCard.growthRate >= 0 ? 'bg-emerald-subtle' : 'bg-red-subtle'">
                  <v-icon size="18" :color="selectedCard.growthRate >= 0 ? '#059669' : '#dc2626'">
                    {{ selectedCard.growthRate >= 0 ? 'lucide-trending-up' : 'lucide-trending-down' }}
                  </v-icon>
                </div>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="metric-box-label text-caption text-medium-emphasis">Tăng trưởng</div>
                  <div class="metric-box-value text-body-1 font-weight-bold text-truncate" :class="selectedCard.growthRate >= 0 ? 'text-success' : 'text-error'">
                    {{ selectedCard.growthRate > 0 ? '+' + selectedCard.growthRate + '%' : selectedCard.growthRate + '%' }}
                  </div>
                </div>
              </div>

              <!-- Đơn trung bình (AOV) -->
              <div class="metric-box-item d-flex align-center gap-3">
                <div class="metric-box-icon bg-blue-subtle">
                  <v-icon size="18" color="#0284c7">lucide-shopping-bag</v-icon>
                </div>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="metric-box-label text-caption text-medium-emphasis">Đơn TB (AOV)</div>
                  <div class="metric-box-value text-body-2 font-weight-bold text-high-emphasis text-truncate">
                    {{ formatFullCurrency(selectedCard.aov) }}
                  </div>
                </div>
              </div>

              <!-- Điểm sức khỏe (Score) -->
              <div class="metric-box-item d-flex align-center gap-3">
                <div class="metric-box-icon bg-amber-subtle">
                  <v-icon size="18" color="#d97706">lucide-activity</v-icon>
                </div>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="metric-box-label text-caption text-medium-emphasis">Điểm sức khỏe</div>
                  <div class="metric-box-value text-body-2 font-weight-bold text-high-emphasis text-truncate">
                    {{ selectedCard.healthScore }}/100 điểm
                  </div>
                </div>
              </div>

              <!-- Tỷ trọng doanh thu -->
              <div class="metric-box-item d-flex align-center gap-3">
                <div class="metric-box-icon bg-purple-subtle">
                  <v-icon size="18" color="#db2777">lucide-pie-chart</v-icon>
                </div>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="metric-box-label text-caption text-medium-emphasis">Tỷ trọng doanh thu</div>
                  <div class="metric-box-value text-body-2 font-weight-bold text-high-emphasis text-truncate">
                    {{ selectedCard.revenueShare }}% tổng DT
                  </div>
                </div>
              </div>

              <!-- Lần mua gần nhất -->
              <div class="metric-box-item d-flex align-center gap-3">
                <div class="metric-box-icon bg-slate-subtle">
                  <v-icon size="18" color="#475569">lucide-clock</v-icon>
                </div>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="metric-box-label text-caption text-medium-emphasis">Lần mua gần nhất</div>
                  <div class="metric-box-value text-body-2 font-weight-bold text-high-emphasis text-truncate">
                    {{ selectedCard.daysSinceLastOrder !== null ? selectedCard.daysSinceLastOrder + ' ngày trước' : 'Chưa có đơn' }}
                  </div>
                </div>
              </div>
            </div>
          </v-card>

          <!-- Section 3: CHĂM SÓC & TƯƠNG TÁC ZALO -->
          <v-card class="pa-5 rounded-2xl border bg-white detail-group-card" elevation="0">
            <div class="section-title d-flex align-center gap-2 mb-4 text-primary font-weight-bold text-caption text-uppercase">
              <v-icon size="16">lucide-message-circle</v-icon>
              <span>Chăm sóc & Tương tác Zalo</span>
            </div>

            <div class="detail-cards-grid">
              <!-- Thời gian gắn bó -->
              <div class="metric-box-item d-flex align-center gap-3">
                <div class="metric-box-icon bg-amber-subtle">
                  <v-icon size="18" color="#ca8a04">lucide-sparkles</v-icon>
                </div>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="metric-box-label text-caption text-medium-emphasis">Thời gian gắn bó</div>
                  <div class="metric-box-value text-body-2 font-weight-bold text-high-emphasis text-truncate">
                    {{ selectedCard.tenureMonths }} tháng
                  </div>
                </div>
              </div>

              <!-- Ngày đặt hàng cuối -->
              <div class="metric-box-item d-flex align-center gap-3">
                <div class="metric-box-icon bg-blue-subtle">
                  <v-icon size="18" color="#0284c7">lucide-calendar</v-icon>
                </div>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="metric-box-label text-caption text-medium-emphasis">Ngày đặt cuối</div>
                  <div class="metric-box-value text-body-2 font-weight-bold text-high-emphasis text-truncate">
                    {{ selectedCard.lastOrderDate ? new Date(selectedCard.lastOrderDate).toLocaleDateString('vi-VN') : 'Chưa có' }}
                  </div>
                </div>
              </div>

              <!-- Tin nhắn Zalo gần nhất -->
              <div class="metric-box-item d-flex align-center gap-3">
                <div class="metric-box-icon bg-teal-subtle">
                  <v-icon size="18" color="#0d9488">lucide-message-square</v-icon>
                </div>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="metric-box-label text-caption text-medium-emphasis">Tin nhắn Zalo gần nhất</div>
                  <div class="metric-box-value text-body-2 font-weight-bold text-high-emphasis text-truncate">
                    {{ selectedCard.lastMessageAt ? new Date(selectedCard.lastMessageAt).toLocaleString('vi-VN') : 'Chưa có lịch sử chat' }}
                  </div>
                </div>
              </div>

              <!-- Cảnh báo Zalo -->
              <div class="metric-box-item d-flex align-center gap-3">
                <div class="metric-box-icon" :class="selectedCard.contactUrgency === 'good' ? 'bg-emerald-subtle' : (selectedCard.contactUrgency === 'warning' ? 'bg-amber-subtle' : 'bg-red-subtle')">
                  <v-icon size="18" :color="selectedCard.contactUrgency === 'good' ? '#059669' : (selectedCard.contactUrgency === 'warning' ? '#d97706' : '#dc2626')">
                    lucide-alert-triangle
                  </v-icon>
                </div>
                <div class="flex-grow-1 overflow-hidden">
                  <div class="metric-box-label text-caption text-medium-emphasis">Tình trạng chăm sóc</div>
                  <div class="metric-box-value text-body-2 font-weight-black text-truncate" :class="selectedCard.contactUrgency === 'good' ? 'text-success' : (selectedCard.contactUrgency === 'warning' ? 'text-warning' : 'text-error')">
                    {{ selectedCard.daysSinceLastMessage !== null ? selectedCard.daysSinceLastMessage + ' ngày chưa nhắn' : 'Chưa từng nhắn Zalo' }}
                  </div>
                </div>
              </div>
            </div>
          </v-card>
        </div>

        <!-- Fixed Footer (Only on Info Tab) -->
        <div v-if="activeDrawerTab === 'info'" class="drawer-footer-wrap pa-4 px-6 border-t bg-white flex-shrink-0">
          <v-btn
            color="#0f766e"
            variant="flat"
            block
            height="48"
            prepend-icon="lucide-message-circle"
            class="text-none font-weight-bold rounded-xl elevation-1 text-white text-body-1"
            :loading="openingChat"
            @click="handleSidebarChat"
          >
            Nhắn tin Zalo ngay
          </v-btn>
        </div>

        <!-- TAB 2: Chat Thread embedded directly in the Sidebar -->
        <div v-else-if="activeDrawerTab === 'chat'" class="drawer-chat-body flex-grow-1 overflow-hidden h-100 bg-white">
          <MessageThread
            :conversation="selectedConv"
            :messages="messages"
            :loading="loadingMsgs"
            :loading-more="loadingMoreMsgs"
            :has-more="hasMoreMessages"
            :sending="sendingMsg"
            :hide-header="true"
            :hide-create-order="true"
            :show-order-panel="false"
            :show-contact-panel="false"
            :is-mobile="$vuetify.display.xs"
            :send-fn="sendMessage"
            :send-attachment-fn="sendAttachment"
            :undo-fn="undoMessage"
            :get-friend-status-fn="getFriendStatus"
            :send-friend-request-fn="sendFriendRequest"
            :accept-friend-request-fn="acceptFriendRequest"
            :undo-friend-request-fn="undoFriendRequest"
            @back="activeDrawerTab = 'info'"
            @send="(content, contentType, isNote, replyToId) => sendMessage(content, contentType, isNote, replyToId)"
            @send-attachment="sendAttachment"
            @retry-message="retrySendMessage"
            @retry-attachment="retrySendAttachment"
            @remove-optimistic-message="removeOptimisticMessage"
            @react="sendReaction"
            @load-more="loadMoreMessages"
            @pause-ai="pauseAi"
            @resume-ai="resumeAi"
            @toggle-ai="toggleAi"
            @set-context-boundary="handleSetContextBoundary"
            style="height: 100%;"
          />
        </div>
      </div>
    </v-navigation-drawer>

    
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api } from '@/api';
import { useCareKanbanStore } from '@/stores/careKanban';
import CareKanbanCard, { type CareKanbanCardProps } from '@/components/contacts/CareKanbanCard.vue';
import MessageThread from '@/components/chat/MessageThread.vue';
import { useChat } from '@/composables/use-chat';

const kanbanStore = useCareKanbanStore();

// Local States
const searchQuery = ref('');
const selectedZone = ref('all');
const selectedSalesperson = ref('all');
const selectedScoreFilter = ref('all');
const groupingMode = ref<'status' | 'zone'>('status');

const showDetailDrawer = ref(false);
const selectedCard = ref<CareKanbanCardProps | null>(null);
const openingChat = ref(false);
const activeDrawerTab = ref<'info' | 'chat'>('info');

// Drawer Width & Drag-to-Resize
const drawerWidth = ref(580);
const isResizingDrawer = ref(false);
let resizeStartX = 0;
let resizeStartWidth = 0;

function startDrawerResize(e: MouseEvent) {
  isResizingDrawer.value = true;
  resizeStartX = e.clientX;
  resizeStartWidth = drawerWidth.value;

  document.addEventListener('mousemove', onDrawerResize);
  document.addEventListener('mouseup', stopDrawerResize);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function onDrawerResize(e: MouseEvent) {
  if (!isResizingDrawer.value) return;
  // Dragging mouse left expands right-docked drawer
  const delta = resizeStartX - e.clientX;
  const maxWidth = Math.floor(window.innerWidth * 0.95);
  drawerWidth.value = Math.max(450, Math.min(maxWidth, resizeStartWidth + delta));
}

function stopDrawerResize() {
  if (!isResizingDrawer.value) return;
  isResizingDrawer.value = false;
  document.removeEventListener('mousemove', onDrawerResize);
  document.removeEventListener('mouseup', stopDrawerResize);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

const {
  selectedConvId,
  selectedConv,
  messages,
  loadingMsgs,
  loadingMoreMsgs,
  sendingMsg,
  hasMoreMessages,
  selectConversation,
  loadMoreMessages,
  sendMessage,
  retrySendMessage,
  sendAttachment,
  retrySendAttachment,
  removeOptimisticMessage,
  sendReaction,
  undoMessage,
  getFriendStatus,
  sendFriendRequest,
  acceptFriendRequest,
  undoFriendRequest,
  pauseAi,
  resumeAi,
  toggleAi,
  setContextBoundary,
  initSocket,
  destroySocket,
} = useChat();

async function handleSetContextBoundary(payload: { startMessageId?: string | null; endMessageId?: string | null; resetDraft?: boolean }) {
  if (!selectedConvId.value) return;
  try {
    await setContextBoundary(selectedConvId.value, payload);
  } catch (err) {
    console.error('Failed to set context boundary:', err);
  }
}

const scoreOptions = [
  { title: 'Mọi customer score', value: 'all' },
  { title: 'Score >= 70 (Tốt)', value: 'high' },
  { title: 'Score 40-69 (Trung bình)', value: 'mid' },
  { title: 'Score < 40 (Nguy hiểm)', value: 'low' },
];

// Order of 5 Status Columns
const statusColumnOrder = ['dormant', 'extreme_risk', 'needs_attention', 'active', 'high_potential'];

const hasAnyData = computed(() => {
  return Object.values(kanbanStore.columns).some((col) => col.items && col.items.length > 0);
});

// Top zones for pills
const topZones = computed(() => {
  return kanbanStore.filterOptions.zones.slice(0, 8);
});

// Active columns based on grouping mode
const activeColumnsList = computed(() => {
  if (groupingMode.value === 'zone') {
    // Group all cards by zone
    const allCards: CareKanbanCardProps[] = [];
    for (const col of Object.values(kanbanStore.columns)) {
      if (col.items) allCards.push(...col.items);
    }

    const zoneGroups = new Map<string, CareKanbanCardProps[]>();
    for (const card of allCards) {
      const z = card.zone || 'Khác';
      if (!zoneGroups.has(z)) zoneGroups.set(z, []);
      zoneGroups.get(z)!.push(card);
    }

    return Array.from(zoneGroups.entries()).map(([zoneName, items]) => ({
      id: zoneName,
      title: zoneName,
      count: items.length,
      totalRevenue: items.reduce((s, c) => s + c.revenue180, 0),
      items,
    }));
  }

  // Default: Status columns
  return statusColumnOrder.map((key) => {
    let items = kanbanStore.columns[key]?.items || [];

    // Apply client-side score filter if selected
    if (selectedScoreFilter.value === 'high') {
      items = items.filter((c) => c.healthScore >= 70);
    } else if (selectedScoreFilter.value === 'mid') {
      items = items.filter((c) => c.healthScore >= 40 && c.healthScore < 70);
    } else if (selectedScoreFilter.value === 'low') {
      items = items.filter((c) => c.healthScore < 40);
    }

    return {
      id: key,
      title: getColumnTitle(key),
      count: items.length,
      totalRevenue: items.reduce((s, c) => s + c.revenue180, 0),
      items,
    };
  });
});

function getColumnTitle(colId: string): string {
  switch (colId) {
    case 'dormant': return 'Ngủ đông';
    case 'extreme_risk': return 'Cực kỳ nguy hiểm';
    case 'needs_attention': return 'Cần theo dõi';
    case 'active': return 'Đang mua';
    case 'high_potential': return 'Tiềm năng tăng trưởng';
    default: return colId;
  }
}

function getColumnBadgeColor(colId: string): string {
  switch (colId) {
    case 'dormant': return 'grey-darken-1';
    case 'extreme_risk': return 'error';
    case 'needs_attention': return 'warning';
    case 'active': return 'info';
    case 'high_potential': return 'success';
    default: return 'primary';
  }
}

function getParetoClass(tier: string): string {
  switch (tier) {
    case 'A': return 'bg-teal-darken-3 text-white';
    case 'B': return 'bg-blue-darken-3 text-white';
    case 'C':
    default: return 'bg-amber-darken-3 text-white';
  }
}

// Format "7,1 T đ" matching benchmark screenshot
function formatAbbreviatedBillion(amount: number): string {
  if (!amount || amount === 0) return '0 đ';
  if (amount >= 1_000_000_000) {
    return (amount / 1_000_000_000).toFixed(1).replace('.', ',') + ' T đ';
  }
  if (amount >= 1_000_000) {
    return (amount / 1_000_000).toFixed(0) + ' Tr đ';
  }
  return amount.toLocaleString('vi-VN') + ' đ';
}

function formatFullCurrency(amount: number): string {
  if (!amount) return '0 đ';
  return Math.round(amount).toLocaleString('vi-VN') + ' đ';
}

function getActiveFilters() {
  const filters: Record<string, string> = {};
  if (searchQuery.value) filters.search = searchQuery.value.trim();
  if (selectedZone.value && selectedZone.value !== 'all') filters.zone = selectedZone.value;
  if (selectedSalesperson.value && selectedSalesperson.value !== 'all') filters.salesperson = selectedSalesperson.value;
  return filters;
}

async function loadData(force = false) {
  try {
    await kanbanStore.fetchKanban(getActiveFilters(), { force });
  } catch (err) {
    console.error('Failed to load Kanban data:', err);
  }
}

function handleSearchSubmit() {
  loadData();
}

function handleResetFilters() {
  searchQuery.value = '';
  selectedZone.value = 'all';
  selectedSalesperson.value = 'all';
  selectedScoreFilter.value = 'all';
  loadData(true);
}

function handleForceRefresh() {
  loadData(true);
}

function selectZone(zone: string) {
  selectedZone.value = zone;
  loadData();
}

function selectSalesperson(sp: string) {
  selectedSalesperson.value = sp;
  loadData();
}

function openCustomerDetail(card: CareKanbanCardProps) {
  selectedCard.value = card;
  activeDrawerTab.value = 'info';
  showDetailDrawer.value = true;
}

async function switchToChatTab() {
  activeDrawerTab.value = 'chat';
  // If drawer is too narrow for comfortable chat reading, widen it to at least 700px on desktop
  if (drawerWidth.value < 680 && window.innerWidth > 960) {
    drawerWidth.value = 720;
  }
  await loadChatForSelectedCard();
}

async function handleSidebarChat() {
  await switchToChatTab();
}

async function loadChatForSelectedCard() {
  if (!selectedCard.value) return;

  openingChat.value = true;
  try {
    let convId = selectedCard.value.conversationId;
    if (!convId) {
      const res = await api.post('/zalo/start-chat-by-phone', {
        contactId: selectedCard.value.contactId || undefined,
        phone: selectedCard.value.phone || undefined,
        displayName: selectedCard.value.name,
      });

      if (res.data?.conversationId) {
        convId = res.data.conversationId as string;
        selectedCard.value.conversationId = convId;
        if (selectedCard.value.customerProfileId) {
          kanbanStore.updateCustomerZaloStatus(selectedCard.value.customerProfileId, convId);
        }
      }
    }

    if (convId) {
      await selectConversation(convId);
    }
  } catch (err) {
    console.error('Failed to load chat from sidebar:', err);
  } finally {
    openingChat.value = false;
  }
}

onMounted(() => {
  loadData();
  initSocket();
});

onUnmounted(() => {
  stopDrawerResize();
  destroySocket();
});
</script>

<style scoped>
/* ── Warm Beige Background matching benchmark image ──────────────── */
.benchmark-kanban-page {
  background-color: #fcf9f2 !important;
  min-height: 100%;
}

.bg-warm-light {
  background-color: #fbf8f2 !important;
}

.filter-card {
  border-color: #eee5d3 !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03) !important;
}

.filter-row-label {
  color: #64748b;
  font-size: 11px;
  letter-spacing: 0.5px;
}

/* ── Pill Chips (Caramel Active vs White Pill) ────────────────────── */
.pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 500;
  border: 1px solid #e2e8f0;
  background-color: #ffffff;
  color: #334155;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.pill-btn:hover {
  border-color: #cbd5e1;
  background-color: #f8fafc;
}

.pill-btn-active {
  background-color: #a0522d !important; /* Caramel Brown */
  border-color: #a0522d !important;
  color: #ffffff !important;
  font-weight: 700;
}

.pill-count {
  font-size: 10.5px;
  opacity: 0.85;
}

.caramel-btn {
  background-color: #a0522d !important;
}

.caramel-btn:hover {
  background-color: #8c4524 !important;
}

.reset-btn {
  border-color: #cbd5e1 !important;
  background-color: #ffffff !important;
}

/* ── Metric Cards ─────────────────────────────────────────────────── */
.metric-summary-card {
  border-color: #eee5d3 !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03) !important;
}

.metric-icon-circle {
  width: 38px;
  height: 38px;
  border-radius: 50%;
}

.bg-emerald-light {
  background-color: #dcfce7;
}

.bg-blue-light {
  background-color: #dbeafe;
}

.bg-red-light {
  background-color: #fee2e2;
}

.bg-amber-light {
  background-color: #fef3c7;
}

/* ── Group Toggle Buttons ─────────────────────────────────────────── */
.group-toggle-btn {
  padding: 5px 14px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 500;
  color: #64748b;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.group-toggle-btn-active {
  background-color: #ffffff !important;
  color: #0f172a !important;
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* ── 5 Equal Columns Grid (Page-level Natural Scroll) ─────────────── */
.kanban-columns-scroll-wrapper {
  width: 100%;
}

.benchmark-grid-layout {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
  align-items: start;
}

.column-card-container {
  background-color: #f6f3eb !important;
  border-color: #e8e0ce !important;
  min-width: 0;
  position: relative;
}

/* Sticky Column Header: Compact & proportional */
.column-sticky-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: #ffffff;
  border-bottom: 1px solid #e8e0ce;
  border-left: 1px solid #e8e0ce;
  border-right: 1px solid #e8e0ce;
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
  border-top: 4px solid #64748b;
  margin-top: -1px;
  margin-left: -1px;
  margin-right: -1px;
  padding: 12px 14px !important;
  min-height: 48px;
  display: flex;
  align-items: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.column-heading {
  color: #0f172a;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.2;
}

.column-count-badge {
  background-color: #f1f5f9;
  color: #475569;
  padding: 2px 9px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 700;
}

/* ── Colored Top Accent Border on Sticky Header (Identical Always) ── */
.column-status-dormant .column-sticky-header {
  border-top-color: #64748b !important;
}

.column-status-extreme_risk .column-sticky-header {
  border-top-color: #ef4444 !important;
}

.column-status-needs_attention .column-sticky-header {
  border-top-color: #f59e0b !important;
}

.column-status-active .column-sticky-header {
  border-top-color: #0ea5e9 !important;
}

.column-status-high_potential .column-sticky-header {
  border-top-color: #10b981 !important;
}

/* ── Detail Drawer Layout, Scrolling & Auto-Scaling Height ─────────── */
.drawer-layout-wrap {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background-color: #ffffff;
}

.drawer-header-wrap {
  flex-shrink: 0;
}

.drawer-scroll-body {
  flex: 1 1 auto;
  min-height: 0 !important; /* CRITICAL: Enables smooth flexbox overflow-y scrolling */
  overflow-y: auto !important;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  gap: 20px; /* Generous gap between big cards */
}

.drawer-scroll-body::-webkit-scrollbar {
  width: 6px;
}

.drawer-scroll-body::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
}

.drawer-footer-wrap {
  flex-shrink: 0;
}

/* Scale big card by total height of children & never shrink */
.detail-group-card {
  flex-shrink: 0 !important;
  height: auto !important;
  min-height: fit-content !important;
  border-color: #eee5d3 !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03) !important;
  margin-bottom: 0 !important;
}

.section-title {
  letter-spacing: 0.5px;
  font-size: 12px !important;
}

.detail-cards-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.metric-box-item {
  background-color: #faf8f3;
  border: 1px solid #f0e8d8;
  border-radius: 12px;
  padding: 10px 14px;
  transition: all 0.15s ease;
  min-width: 0;
  height: auto;
}

.metric-box-item:hover {
  background-color: #f5f0e4;
  border-color: #e4d8c2;
}

.metric-box-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.metric-box-label {
  font-size: 11px;
  letter-spacing: 0.2px;
  line-height: 1.25;
  margin-bottom: 2px;
}

.metric-box-value {
  font-size: 13px;
  line-height: 1.3;
}

/* Subtly tinted icon backgrounds */
.bg-blue-subtle { background-color: #eff6ff; }
.bg-emerald-subtle { background-color: #ecfdf5; }
.bg-orange-subtle { background-color: #fff7ed; }
.bg-purple-subtle { background-color: #faf5ff; }
.bg-amber-subtle { background-color: #fffbeb; }
.bg-red-subtle { background-color: #fef2f2; }
.bg-slate-subtle { background-color: #f8fafc; }
.bg-teal-subtle { background-color: #f0fdfa; }

@media (max-width: 1250px) {
  .kanban-columns-scroll-wrapper {
    overflow-x: auto;
    padding-bottom: 16px;
  }
  .benchmark-grid-layout {
    min-width: 1350px;
  }
}

/* Resizable Drawer Handle */
.resizable-drawer {
  transition: none !important;
}

.drawer-resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  width: 10px;
  height: 100%;
  cursor: col-resize;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  background: transparent;
  transition: background-color 0.15s ease;
}

.drawer-resize-handle:hover,
.drawer-resize-handle.is-resizing {
  background-color: rgba(15, 118, 110, 0.15);
}

.drawer-resize-handle .resize-line {
  width: 2px;
  height: 38px;
  border-radius: 2px;
  background-color: rgba(0, 0, 0, 0.2);
  transition: all 0.15s ease;
}

.drawer-resize-handle:hover .resize-line,
.drawer-resize-handle.is-resizing .resize-line {
  height: 56px;
  background-color: #0f766e;
  width: 3px;
}

/* Drawer Tabs */
.drawer-tabs-nav {
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.drawer-tab-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  background: transparent;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  cursor: pointer;
}

.drawer-tab-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.drawer-tab-btn.is-active {
  background: #f0fdf4;
  color: #0f766e;
  border-color: rgba(15, 118, 110, 0.2);
}

.chat-tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #0f766e;
  margin-left: 6px;
}

</style>
