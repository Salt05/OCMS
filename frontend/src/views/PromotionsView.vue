<template>
  <div class="promotions-view pa-4 pa-md-6">
    <!-- Header Section -->
    <div class="d-flex flex-column flex-sm-row justify-space-between align-start align-sm-center mb-6 gap-3">
      <div>
        <div class="d-flex align-center gap-2 mb-1">
          <v-icon color="primary" size="28">mdi-percent-outline</v-icon>
          <h1 class="text-h5 font-weight-bold text-slate-900 dark:text-white">
            Quản lý ưu đãi & chiết khấu
          </h1>
        </div>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Chính sách giá, chiết khấu theo bậc, combo quà tặng và thưởng doanh số data-driven.
        </p>
      </div>

      <div class="d-flex align-center gap-2 flex-wrap">
        <v-btn
          color="secondary"
          variant="tonal"
          prepend-icon="mdi-calculator-variant-outline"
          class="text-none font-weight-medium"
          @click="openPreviewModal"
        >
          Kiểm tra ưu đãi
        </v-btn>

        <v-btn
          v-if="isAdmin"
          color="primary"
          prepend-icon="mdi-plus"
          class="text-none font-weight-medium elevation-1"
          @click="openCreateModal"
        >
          Thêm ưu đãi mới
        </v-btn>

        <v-chip
          v-else
          size="default"
          color="blue-grey"
          variant="tonal"
          prepend-icon="mdi-shield-account-outline"
          class="font-weight-medium px-3"
        >
          Quyền Nhân viên: Chỉ xem (Read-only)
        </v-chip>
      </div>
    </div>

    <!-- Status Tabs -->
    <v-card class="mb-4 rounded-lg" elevation="0" border>
      <v-tabs
        v-model="activeTab"
        color="primary"
        align-tabs="start"
        @update:model-value="fetchPromotions"
      >
        <v-tab value="all" class="text-none font-weight-medium">
          Tất cả
          <v-chip size="x-small" class="ml-2 font-weight-bold" variant="flat" color="grey-lighten-2">
            {{ counts.all || 0 }}
          </v-chip>
        </v-tab>
        <v-tab value="active" class="text-none font-weight-medium">
          Đang chạy
          <v-chip size="x-small" class="ml-2 font-weight-bold" variant="flat" color="success">
            {{ counts.active || 0 }}
          </v-chip>
        </v-tab>
        <v-tab value="upcoming" class="text-none font-weight-medium">
          Sắp diễn ra
          <v-chip size="x-small" class="ml-2 font-weight-bold" variant="flat" color="info">
            {{ counts.upcoming || 0 }}
          </v-chip>
        </v-tab>
        <v-tab value="expired" class="text-none font-weight-medium">
          Đã kết thúc
          <v-chip size="x-small" class="ml-2 font-weight-bold" variant="flat" color="grey">
            {{ counts.expired || 0 }}
          </v-chip>
        </v-tab>
        <v-tab value="paused" class="text-none font-weight-medium">
          Tạm dừng
          <v-chip size="x-small" class="ml-2 font-weight-bold" variant="flat" color="warning">
            {{ counts.paused || 0 }}
          </v-chip>
        </v-tab>
      </v-tabs>
    </v-card>

    <!-- Filter & Search Toolbar -->
    <v-card class="mb-4 pa-4 rounded-lg" elevation="0" border>
      <div class="d-flex flex-column flex-sm-row align-center justify-space-between gap-3">
        <v-text-field
          v-model="searchQuery"
          density="compact"
          variant="outlined"
          placeholder="Tìm theo mã, tên hoặc mô tả chính sách..."
          prepend-inner-icon="mdi-magnify"
          hide-details
          clearable
          style="max-width: 420px; width: 100%"
          @update:model-value="onSearchDebounced"
        />

        <div class="d-flex align-center gap-2">
          <v-btn
            icon="mdi-refresh"
            variant="text"
            size="small"
            color="primary"
            :loading="loading"
            @click="fetchPromotions"
          />
        </div>
      </div>
    </v-card>

    <!-- Promotions Table -->
    <v-card class="rounded-lg overflow-hidden" elevation="0" border>
      <v-data-table
        :headers="headers"
        :items="promotions"
        :loading="loading"
        hover
        class="promotions-table"
        no-data-text="Chưa có chính sách khuyến mãi nào phù hợp"
      >
        <!-- Policy Code & Name -->
        <template #item.name="{ item }">
          <div class="py-2 d-flex align-center gap-2 min-w-0" style="min-width: 280px; max-width: 460px;" :title="item.name">
            <div class="d-inline-flex align-center gap-1 flex-shrink-0">
              <v-chip size="x-small" color="primary" variant="outlined" class="font-weight-bold font-mono">
                {{ item.code }}
              </v-chip>
              <v-chip size="x-small" color="indigo" variant="tonal" class="font-weight-bold">
                v{{ item.version }}
              </v-chip>
            </div>
            <span
              class="font-weight-bold text-subtitle-2 text-slate-800 dark:text-slate-100 text-truncate min-w-0 flex-grow-1"
              style="line-height: 1.4; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;"
            >
              {{ item.name }}
            </span>
          </div>
        </template>

        <!-- Promotion Type -->
        <template #item.type="{ item }">
          <v-chip
            size="small"
            :color="getTypeChipColor(item.type)"
            variant="tonal"
            class="font-weight-medium"
          >
            {{ formatTypeName(item.type) }}
          </v-chip>
        </template>

        <!-- Scope -->
        <template #item.targetScope="{ item }">
          <div v-if="item.targetScope === 'ORDER_TOTAL' || item.targetScope === 'ALL_PRODUCTS'">
            <v-chip size="small" color="blue-grey" variant="tonal" class="font-weight-medium">
              <v-icon start size="14">mdi-cart-outline</v-icon>
              Toàn bộ đơn hàng
            </v-chip>
          </div>
          <div v-else-if="item.targetScope === 'SPECIFIC_SKUS' || item.conditions?.applicableSkus?.length">
            <v-tooltip
              :text="(item.conditions?.applicableSkus || []).join(', ') || 'Chưa chọn SKU'"
              location="top"
            >
              <template #activator="{ props }">
                <v-chip
                  v-bind="props"
                  size="small"
                  color="primary"
                  variant="tonal"
                  class="font-weight-medium cursor-help"
                >
                  <v-icon start size="14">mdi-package-variant-closed</v-icon>
                  {{ (item.conditions?.applicableSkus?.length || 0) }} sản phẩm
                </v-chip>
              </template>
            </v-tooltip>
          </div>
          <div v-else-if="item.targetScope === 'CATEGORY' || item.conditions?.applicableCategories?.length">
            <v-chip size="small" color="indigo" variant="tonal" class="font-weight-medium">
              <v-icon start size="14">mdi-shape-outline</v-icon>
              Ngành: {{ (item.conditions?.applicableCategories || []).slice(0, 2).join(', ') }}
            </v-chip>
          </div>
          <div v-else-if="item.targetScope === 'BRAND' || item.conditions?.applicableBrands?.length">
            <v-chip size="small" color="teal" variant="tonal" class="font-weight-medium">
              <v-icon start size="14">mdi-tag-outline</v-icon>
              Hiệu: {{ (item.conditions?.applicableBrands || []).slice(0, 2).join(', ') }}
            </v-chip>
          </div>
          <div v-else>
            <v-chip size="small" color="grey" variant="tonal">
              {{ formatScope(item.targetScope) }}
            </v-chip>
          </div>
        </template>

        <!-- Validity Dates with Status Color Box -->
        <template #item.validity="{ item }">
          <div
            class="pa-2 px-3 rounded-lg border d-inline-flex flex-column gap-1"
            :class="[
              getValidityStatus(item.startDate, item.endDate).bgClass,
              getValidityStatus(item.startDate, item.endDate).borderClass,
            ]"
            style="min-width: 155px;"
          >
            <!-- Status Badge Tag -->
            <div class="d-flex align-center gap-1.5">
              <v-icon size="14" :color="getValidityStatus(item.startDate, item.endDate).badgeColor">
                {{ getValidityStatus(item.startDate, item.endDate).icon }}
              </v-icon>
              <span
                class="font-weight-bold"
                style="font-size: 0.75rem;"
                :class="getValidityStatus(item.startDate, item.endDate).textClass"
              >
                {{ getValidityStatus(item.startDate, item.endDate).label }}
              </span>
            </div>

            <!-- Date range -->
            <div class="text-caption font-medium" :class="getValidityStatus(item.startDate, item.endDate).textClass">
              <template v-if="item.startDate || item.endDate">
                <div v-if="item.startDate">Từ: {{ formatDate(item.startDate) }}</div>
                <div v-if="item.endDate">Đến: {{ formatDate(item.endDate) }}</div>
              </template>
              <span v-else>Vô thời hạn</span>
            </div>
          </div>
        </template>

        <!-- Priority -->
        <template #item.priority="{ item }">
          <v-chip size="x-small" variant="flat" color="blue-grey-lighten-4" class="font-weight-bold">
            Ưu tiên: {{ item.priority }}
          </v-chip>
        </template>

        <!-- Status Toggle -->
        <template #item.isActive="{ item }">
          <div v-if="isAdmin" class="d-flex align-center gap-2">
            <v-switch
              :model-value="item.isActive"
              color="success"
              density="compact"
              hide-details
              inset
              @update:model-value="(val) => handleToggleStatus(item, val)"
            />
            <span
              class="text-caption font-weight-medium"
              :class="item.isActive ? 'text-success' : 'text-medium-emphasis'"
            >
              {{ item.isActive ? 'Bật' : 'Tắt' }}
            </span>
          </div>
          <div v-else class="d-flex align-center">
            <v-chip
              size="x-small"
              :color="item.isActive ? 'success' : 'grey'"
              variant="flat"
              class="font-weight-medium"
            >
              {{ item.isActive ? 'Đang chạy' : 'Tạm dừng' }}
            </v-chip>
          </div>
        </template>

        <!-- Actions -->
        <template #item.actions="{ item }">
          <div class="d-flex align-center justify-end gap-1">
            <!-- Staff Read-only Action -->
            <v-tooltip v-if="!isAdmin" text="Xem chi tiết" location="top">
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  icon="mdi-eye-outline"
                  size="small"
                  variant="text"
                  color="primary"
                  @click="openEditModal(item)"
                />
              </template>
            </v-tooltip>

            <!-- Admin Actions -->
            <template v-if="isAdmin">
              <v-tooltip text="Chỉnh sửa" location="top">
                <template #activator="{ props }">
                  <v-btn
                    v-bind="props"
                    icon="mdi-pencil-outline"
                    size="small"
                    variant="text"
                    color="primary"
                    @click="openEditModal(item)"
                  />
                </template>
              </v-tooltip>

              <v-tooltip text="Nhân bản" location="top">
                <template #activator="{ props }">
                  <v-btn
                    v-bind="props"
                    icon="mdi-content-copy"
                    size="small"
                    variant="text"
                    color="secondary"
                    @click="handleClone(item)"
                  />
                </template>
              </v-tooltip>

              <v-tooltip text="Xóa" location="top">
                <template #activator="{ props }">
                  <v-btn
                    v-bind="props"
                    icon="mdi-delete-outline"
                    size="small"
                    variant="text"
                    color="error"
                    @click="handleDelete(item)"
                  />
                </template>
              </v-tooltip>
            </template>

            <v-tooltip text="Lịch sử phiên bản" location="top">
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  icon="mdi-history"
                  size="small"
                  variant="text"
                  color="info"
                  @click="openAuditModal(item)"
                />
              </template>
            </v-tooltip>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- ── MODAL 1: VISUAL RULE BUILDER (CREATE / EDIT) ───────────────────────── -->
    <v-dialog v-model="ruleModalVisible" max-width="840px" persistent scrollable>
      <v-card class="rounded-xl" :class="{ 'view-only-dialog': !isAdmin }">
        <v-card-title class="d-flex align-center justify-space-between pa-4 border-b">
          <div class="d-flex align-center gap-2">
            <v-icon color="primary">
              {{ !isAdmin ? 'mdi-file-document-outline' : (isEditing ? 'mdi-pencil-box-outline' : 'mdi-plus-box-outline') }}
            </v-icon>
            <span class="text-h6 font-weight-bold">
              {{ !isAdmin ? `Chi tiết ưu đãi: ${form.name}` : (isEditing ? `Chỉnh sửa ưu đãi: ${form.name}` : 'Tạo mới chính sách ưu đãi') }}
            </span>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" @click="ruleModalVisible = false" />
        </v-card-title>

        <v-card-text class="pa-5" style="max-height: 75vh">
          <v-form ref="ruleFormRef" :readonly="!isAdmin" :class="{ 'view-only-form': !isAdmin }">
            <v-alert
              v-if="!isAdmin"
              type="warning"
              variant="tonal"
              density="compact"
              class="mb-4"
              icon="mdi-lock-outline"
            >
              <strong>Chế độ chỉ xem dành cho nhân viên:</strong> Bạn không có quyền thêm, sửa, xóa hoặc thay đổi trạng thái chính sách này. Chỉ Quản trị viên (Admin/Owner) mới có quyền quản trị.
            </v-alert>

            <v-alert
              v-if="isAdmin && isEditing && editingPolicyUsedInOrders"
              type="info"
              variant="tonal"
              density="compact"
              class="mb-4"
              icon="mdi-shield-check-outline"
            >
              Chính sách này đã được áp dụng trong đơn hàng cũ. Để bảo toàn tính bất biến (Immutability), hệ thống sẽ tự động tạo một <strong>phiên bản mới (v{{ (form.version || 1) + 1 }})</strong> và lưu giữ nguyên vẹn lịch sử đơn cũ.
            </v-alert>

            <!-- 1. General Info -->
            <div class="text-subtitle-1 font-weight-bold mb-3 d-flex align-center gap-2 text-primary">
              <v-icon size="20">mdi-information-outline</v-icon>
              1. Thông tin chung
            </div>

            <v-row dense>
              <v-col cols="12" sm="8">
                <v-text-field
                  v-model="form.name"
                  label="Tên chương trình ưu đãi *"
                  variant="outlined"
                  density="compact"
                  placeholder="Ví dụ: Chiết khấu Xương gặm theo bậc giá trị"
                  :rules="[v => !!v || 'Vui lòng nhập tên chương trình']"
                />
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model="form.code"
                  label="Mã chương trình (Code) *"
                  variant="outlined"
                  density="compact"
                  placeholder="Ví dụ: LA_PET_CHEW_TIER"
                  style="text-transform: uppercase"
                  :disabled="isEditing"
                  :rules="[v => !!v || 'Vui lòng nhập mã chương trình']"
                />
              </v-col>

              <v-col cols="12">
                <v-textarea
                  v-model="form.description"
                  label="Mô tả chính sách"
                  variant="outlined"
                  density="compact"
                  rows="2"
                  placeholder="Mô tả chi tiết để nhân viên và Chatbot AI giải thích cho khách..."
                />
              </v-col>

              <v-col cols="12" sm="6">
                <v-select
                  v-model="form.type"
                  label="Loại hình ưu đãi *"
                  variant="outlined"
                  density="compact"
                  :items="promotionTypeOptions"
                  item-title="label"
                  item-value="value"
                />
              </v-col>

              <v-col cols="12" sm="6">
                <v-select
                  v-model="form.targetScope"
                  label="Phạm vi áp dụng *"
                  variant="outlined"
                  density="compact"
                  :items="scopeOptions"
                  item-title="label"
                  item-value="value"
                />
              </v-col>

              <v-col cols="12" sm="6">
                <v-text-field
                  v-model.number="form.priority"
                  label="Mức độ ưu tiên (Số càng cao càng tính trước)"
                  type="number"
                  variant="outlined"
                  density="compact"
                  hint="Ví dụ: Combo (50) > Bánh thưởng (40) > Bậc xương gặm (20) > Chiết khấu cơ bản (10)"
                  persistent-hint
                />
              </v-col>

              <v-col cols="12" sm="6" class="d-flex align-center">
                <v-checkbox
                  v-model="form.isStackable"
                  label="Cho phép cộng dồn với ưu đãi khác"
                  density="compact"
                  hide-details
                  color="primary"
                  :disabled="!isAdmin"
                />
              </v-col>
            </v-row>

            <v-divider class="my-4" />

            <!-- 2. Validity Time -->
            <div class="text-subtitle-1 font-weight-bold mb-3 d-flex align-center gap-2 text-primary">
              <v-icon size="20">mdi-calendar-clock-outline</v-icon>
              2. Thời hạn hiệu lực
            </div>

            <v-row dense>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="form.startDate"
                  label="Ngày bắt đầu"
                  type="datetime-local"
                  variant="outlined"
                  density="compact"
                  hint="Để trống nếu áp dụng ngay"
                  persistent-hint
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="form.endDate"
                  label="Ngày kết thúc"
                  type="datetime-local"
                  variant="outlined"
                  density="compact"
                  hint="Để trống nếu áp dụng vô thời hạn"
                  persistent-hint
                />
              </v-col>
            </v-row>

            <!-- ── SECTION 3: DANH SÁCH SẢN PHẨM ÁP DỤNG (CHỈ KHI CHỌN SPECIFIC_SKUS) ── -->
            <template v-if="form.targetScope === 'SPECIFIC_SKUS'">
              <v-divider class="my-4" />

              <div class="d-flex flex-column flex-sm-row align-start align-sm-center justify-space-between gap-2 mb-3">
                <div class="text-subtitle-1 font-weight-bold d-flex align-center gap-2 text-primary">
                  <v-icon size="20">mdi-package-variant-closed-check</v-icon>
                  3. Danh sách sản phẩm áp dụng ưu đãi *
                </div>
                <div class="d-flex align-center gap-2 flex-wrap">
                  <v-chip size="small" color="primary" variant="flat" class="font-weight-bold">
                    Đã chọn: {{ form.conditions.applicableSkus?.length || 0 }} sản phẩm
                  </v-chip>
                  <v-btn
                    v-if="isAdmin"
                    size="small"
                    color="primary"
                    variant="tonal"
                    prepend-icon="mdi-package-variant-plus"
                    class="text-none font-weight-medium"
                    @click="productSelectorVisible = true"
                  >
                    Chọn / Thêm sản phẩm
                  </v-btn>
                  <v-btn
                    v-if="isAdmin && form.conditions.applicableSkus?.length"
                    size="small"
                    color="error"
                    variant="text"
                    class="text-none"
                    @click="form.conditions.applicableSkus = []"
                  >
                    Xóa tất cả
                  </v-btn>
                </div>
              </div>

              <!-- Empty state if no products selected -->
              <v-card
                v-if="!form.conditions.applicableSkus?.length"
                class="pa-6 text-center border-dashed rounded-lg bg-slate-50 dark:bg-slate-800/40 mb-4"
                elevation="0"
              >
                <v-icon size="40" color="medium-emphasis" class="mb-2">mdi-package-variant-closed-plus</v-icon>
                <div class="text-subtitle-2 font-weight-medium mb-1">Chưa có sản phẩm nào được chọn</div>
                <div class="text-caption text-medium-emphasis mb-3">
                  Nhấn nút bên dưới để mở giao diện lọc nhanh theo Ngành hàng & Thương hiệu và chọn các sản phẩm tham gia ưu đãi.
                </div>
                <v-btn
                  v-if="isAdmin"
                  size="small"
                  color="primary"
                  prepend-icon="mdi-plus"
                  class="text-none font-weight-bold"
                  @click="productSelectorVisible = true"
                >
                  Mở bảng chọn sản phẩm
                </v-btn>
              </v-card>

              <!-- Selected products badge list -->
              <div
                v-else
                class="selected-products-container pa-3 border rounded-lg bg-surface mb-4"
                style="max-height: 340px; overflow-y: auto;"
              >
                <div class="d-flex flex-column" style="gap: 12px;">
                  <div
                    v-for="sku in form.conditions.applicableSkus"
                    :key="sku"
                    class="selected-product-item w-100 d-flex align-center justify-space-between px-4 py-2.5 rounded-lg border border-primary bg-blue-50/40 dark:bg-blue-950/20"
                    style="border-color: rgba(var(--v-theme-primary), 0.6) !important; min-height: 52px;"
                  >
                    <!-- Left: SKU & Product Name -->
                    <div class="d-flex align-center gap-2 flex-grow-1 min-w-0 mr-3">
                      <span class="font-mono font-weight-bold text-primary flex-shrink-0" style="font-size: 1rem;">{{ sku }}</span>
                      <span class="text-medium-emphasis flex-shrink-0" style="font-size: 1rem;">-</span>
                      <span
                        class="font-weight-medium text-slate-800 dark:text-slate-100 text-truncate"
                        style="font-size: 0.95rem; line-height: 1.35;"
                        :title="selectedProductsMap[sku]?.name || sku"
                      >
                        {{ selectedProductsMap[sku]?.name || `Sản phẩm ${sku}` }}
                      </span>
                    </div>

                    <!-- Right: Brand & Category chips & Delete Button -->
                    <div class="d-flex align-center gap-2 flex-shrink-0">
                      <!-- Brand pill -->
                      <v-chip
                        v-if="selectedProductsMap[sku]?.brand"
                        size="small"
                        color="teal"
                        variant="flat"
                        class="font-weight-medium px-3"
                        style="font-size: 0.85rem; height: 28px;"
                      >
                        {{ selectedProductsMap[sku].brand }}
                      </v-chip>

                      <!-- Category pill -->
                      <v-chip
                        v-if="selectedProductsMap[sku]?.category"
                        size="small"
                        color="indigo"
                        variant="flat"
                        class="font-weight-medium text-white px-3"
                        style="font-size: 0.85rem; height: 28px;"
                      >
                        {{ selectedProductsMap[sku].category }}
                      </v-chip>

                      <!-- Delete Button -->
                      <v-btn
                        v-if="isAdmin"
                        icon
                        variant="text"
                        size="small"
                        color="primary"
                        density="comfortable"
                        title="Xóa sản phẩm này"
                        @click="removeSelectedSku(sku)"
                      >
                        <v-icon size="22" color="primary">mdi-close-circle</v-icon>
                      </v-btn>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <v-divider class="my-4" />

            <!-- ── SECTION 4: DYNAMIC RULE BUILDER BASED ON TYPE ──────────────────────── -->
            <div class="text-subtitle-1 font-weight-bold mb-3 d-flex align-center gap-2 text-primary">
              <v-icon size="20">mdi-tune-variant</v-icon>
              {{ form.targetScope === 'SPECIFIC_SKUS' ? '4. Cấu hình quy tắc & mức ưu đãi' : '3. Cấu hình quy tắc & mức ưu đãi' }}
            </div>

            <!-- Case A: Percent Discount / Basic Discount -->
            <div v-if="form.type === 'BASIC_DISCOUNT' || form.type === 'PERCENT_DISCOUNT'">
              <v-row dense>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model.number="form.actions.discountPercent"
                    label="Tỷ lệ giảm giá (%) *"
                    type="number"
                    min="0"
                    max="100"
                    suffix="%"
                    variant="outlined"
                    density="compact"
                  />
                </v-col>
                <v-col cols="12" sm="6" class="d-flex align-center">
                  <div class="text-caption text-medium-emphasis">
                    Áp dụng giảm <strong>{{ form.actions.discountPercent || 0 }}%</strong> cho {{ form.targetScope === 'ORDER_TOTAL' ? 'toàn bộ đơn hàng' : `${form.conditions.applicableSkus?.length || 0} sản phẩm đã chọn` }}.
                  </div>
                </v-col>
              </v-row>
            </div>

            <!-- Case B: Tiered Discount (Bậc chiết khấu) -->
            <div v-else-if="form.type === 'TIER_DISCOUNT'">
              <div class="d-flex justify-space-between align-center mb-2">
                <span class="text-body-2 font-weight-medium">Bảng các bậc giá trị & % giảm tương ứng:</span>
                <v-btn v-if="isAdmin" size="small" variant="tonal" color="primary" prepend-icon="mdi-plus" @click="addTier">
                  Thêm bậc
                </v-btn>
              </div>

              <v-table density="compact" class="border rounded mb-3">
                <thead>
                  <tr class="bg-slate-50 dark:bg-slate-800">
                    <th class="font-weight-bold">Bậc</th>
                    <th class="font-weight-bold">Giá trị tối thiểu (VNĐ)</th>
                    <th class="font-weight-bold">% Giảm</th>
                    <th v-if="isAdmin" class="text-right font-weight-bold">Xóa</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(tier, idx) in form.actions.tiers" :key="idx">
                    <td>Bậc {{ idx + 1 }}</td>
                    <td>
                      <CurrencyInput
                        v-model="tier.minAmount"
                        density="compact"
                        variant="outlined"
                        hide-details
                        suffix="đ"
                        :disabled="!isAdmin"
                        style="max-width: 200px"
                      />
                    </td>
                    <td>
                      <v-text-field
                        v-model.number="tier.percent"
                        type="number"
                        density="compact"
                        variant="outlined"
                        hide-details
                        suffix="%"
                        :disabled="!isAdmin"
                        style="max-width: 120px"
                      />
                    </td>
                    <td v-if="isAdmin" class="text-right">
                      <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="error" @click="removeTier(idx)" />
                    </td>
                  </tr>
                </tbody>
              </v-table>
              <div class="text-caption text-medium-emphasis">
                Tính tổng tiền của {{ form.targetScope === 'ORDER_TOTAL' ? 'toàn đơn' : `${form.conditions.applicableSkus?.length || 0} sản phẩm đã chọn` }}, đạt ngưỡng bậc nào thì tự động áp dụng % chiết khấu của bậc đó.
              </div>
            </div>

            <!-- Case C: Special Unit Price / Combo E1-E6 -->
            <div v-else-if="form.type === 'SPECIAL_PRICE' || form.type === 'COMBO'">
              <v-row dense>
                <v-col cols="12" sm="6">
                  <CurrencyInput
                    v-model="form.actions.specialUnitPrice"
                    label="Đơn giá hỗ trợ đặc biệt (VNĐ) *"
                    variant="outlined"
                    density="compact"
                    suffix="đ"
                    placeholder="15.000"
                  />
                </v-col>
                <v-col cols="12" sm="6" class="d-flex align-center">
                  <v-checkbox
                    v-model="form.conditions.requireComboAll"
                    label="Bắt buộc mua đủ tất cả SKU trong danh sách (Combo)"
                    density="compact"
                    hide-details
                    color="primary"
                    hint="Chỉ nhận đơn giá ưu đãi khi giỏ hàng có đầy đủ mọi SKU đã chọn"
                    persistent-hint
                    :disabled="!isAdmin"
                  />
                </v-col>
              </v-row>
            </div>

            <!-- Case D: Buy X Get Y -->
            <div v-else-if="form.type === 'BUY_X_GET_Y'">
              <v-row dense>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model.number="form.actions.buyQuantity"
                    label="Số lượng mua tối thiểu *"
                    type="number"
                    variant="outlined"
                    density="compact"
                    placeholder="7"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model.number="form.actions.getQuantity"
                    label="Số lượng tặng kèm *"
                    type="number"
                    variant="outlined"
                    density="compact"
                    placeholder="1"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-select
                    v-model="form.actions.giftType"
                    label="Hình thức tặng quà"
                    density="compact"
                    variant="outlined"
                    :items="[
                      { title: 'Tặng sản phẩm cùng loại', value: 'SAME_PRODUCT' },
                      { title: 'Tặng sản phẩm chỉ định cụ thể', value: 'SPECIFIC_SKU' },
                    ]"
                  />
                </v-col>
                <v-col cols="12" sm="6" v-if="form.actions.giftType === 'SPECIFIC_SKU'">
                  <div class="d-flex flex-column gap-1">
                    <div class="text-caption text-medium-emphasis">Sản phẩm quà tặng chỉ định *</div>
                    <div v-if="!form.actions.giftSku && !form.actions.giftName">
                      <v-btn
                        size="large"
                        color="primary"
                        variant="tonal"
                        prepend-icon="mdi-gift-outline"
                        class="text-none font-weight-medium w-100 justify-start"
                        style="height: 40px;"
                        @click="openGiftProductSelector"
                      >
                        Mở bảng chọn quà tặng...
                      </v-btn>
                    </div>

                    <!-- Selected Gift Product Badge -->
                    <div
                      v-else
                      class="selected-gift-item d-flex align-center justify-space-between w-100 px-4 py-2.5 rounded-lg border border-primary bg-amber-50/50 dark:bg-amber-950/20"
                      style="border-color: rgba(var(--v-theme-primary), 0.6) !important; min-height: 52px;"
                    >
                      <div class="d-flex align-center gap-2 text-truncate mr-2">
                        <v-icon color="deep-orange" size="22">mdi-gift</v-icon>
                        <span class="font-mono font-weight-bold text-primary" style="font-size: 1rem;">{{ form.actions.giftSku || 'SKU' }}</span>
                        <span class="text-medium-emphasis" style="font-size: 1rem;">-</span>
                        <span
                          class="font-weight-medium text-slate-800 dark:text-slate-100 text-truncate"
                          style="max-width: 250px; font-size: 0.95rem;"
                          :title="form.actions.giftName"
                        >
                          {{ form.actions.giftName || selectedProductsMap[form.actions.giftSku]?.name || form.actions.giftSku }}
                        </span>
                        <v-chip
                          v-if="selectedProductsMap[form.actions.giftSku]?.brand"
                          size="small"
                          color="teal"
                          variant="flat"
                          class="font-weight-medium px-2.5"
                          style="font-size: 0.85rem; height: 28px;"
                        >
                          {{ selectedProductsMap[form.actions.giftSku].brand }}
                        </v-chip>
                      </div>

                      <div class="d-flex align-center gap-1">
                        <v-btn
                          size="small"
                          variant="text"
                          color="primary"
                          class="text-none font-weight-medium px-2"
                          title="Đổi sản phẩm khác"
                          @click="openGiftProductSelector"
                        >
                          Đổi
                        </v-btn>
                        <v-btn
                          icon
                          variant="text"
                          size="small"
                          color="error"
                          title="Bỏ chọn quà tặng"
                          @click="clearGiftProduct"
                        >
                          <v-icon size="22" color="error">mdi-close-circle</v-icon>
                        </v-btn>
                      </div>
                    </div>
                  </div>
                </v-col>
              </v-row>
            </div>

            <!-- Case E: Sales Rewards (Quarter / Year) -->
            <div v-else-if="form.type === 'SALES_REWARD_QUARTER' || form.type === 'SALES_REWARD_YEAR'">
              <div class="d-flex justify-space-between align-center mb-2">
                <span class="text-body-2 font-weight-medium">Bảng bậc thưởng doanh số:</span>
                <v-btn v-if="isAdmin" size="small" variant="tonal" color="primary" prepend-icon="mdi-plus" @click="addRewardTier">
                  Thêm mốc doanh số
                </v-btn>
              </div>

              <v-table density="compact" class="border rounded mb-3">
                <thead>
                  <tr class="bg-slate-50 dark:bg-slate-800">
                    <th class="font-weight-bold">Mốc doanh số tối thiểu</th>
                    <th class="font-weight-bold">% Thưởng</th>
                    <th v-if="isAdmin" class="text-right font-weight-bold">Xóa</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(rt, idx) in form.actions.rewardTiers" :key="idx">
                    <td>
                      <CurrencyInput
                        v-model="rt.minAmount"
                        density="compact"
                        variant="outlined"
                        hide-details
                        suffix="đ"
                        :disabled="!isAdmin"
                        style="max-width: 220px"
                      />
                    </td>
                    <td>
                      <v-text-field
                        v-model.number="rt.rewardPercent"
                        type="number"
                        density="compact"
                        variant="outlined"
                        hide-details
                        suffix="%"
                        :disabled="!isAdmin"
                        style="max-width: 120px"
                      />
                    </td>
                    <td v-if="isAdmin" class="text-right">
                      <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="error" @click="removeRewardTier(idx)" />
                    </td>
                  </tr>
                </tbody>
              </v-table>

              <!-- Additional criteria for Annual reward -->
              <div v-if="form.type === 'SALES_REWARD_YEAR'" class="mt-4 pa-3 bg-slate-50 dark:bg-slate-800 rounded">
                <div class="text-subtitle-2 font-weight-bold mb-2">Điều kiện xét thưởng năm khắt khe:</div>
                <v-row dense>
                  <v-col cols="12" sm="6">
                    <v-text-field
                      v-model.number="form.conditions.rewardConditions.onTimePaymentPercent"
                      label="Thanh toán đúng hạn tối thiểu (%)"
                      type="number"
                      variant="outlined"
                      density="compact"
                      suffix="%"
                    />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-text-field
                      v-model.number="form.conditions.rewardConditions.minActiveMonths"
                      label="Duy trì mua hàng tối thiểu (tháng)"
                      type="number"
                      variant="outlined"
                      density="compact"
                      suffix="tháng"
                    />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-text-field
                      v-model.number="form.conditions.rewardConditions.minDistributedSkus"
                      label="Phân phối tối thiểu (số SKU)"
                      type="number"
                      variant="outlined"
                      density="compact"
                      suffix="SKU"
                    />
                  </v-col>
                  <v-col cols="12" sm="6" class="d-flex align-center">
                    <v-switch
                      v-model="form.conditions.rewardConditions.noPriceDumping"
                      label="Bắt buộc không bán phá giá"
                      density="compact"
                      hide-details
                      color="success"
                      inset
                      :disabled="!isAdmin"
                    />
                  </v-col>
                </v-row>
              </div>
            </div>

            <!-- Case F: Custom Unformatted Text Promotion -->
            <div v-else-if="form.type === 'CUSTOM_TEXT'">
              <v-alert
                type="info"
                variant="tonal"
                density="compact"
                class="mb-3"
                icon="mdi-text-box-outline"
              >
                Loại ưu đãi này dùng để lưu trữ các chính sách, thỏa thuận hoặc quyền lợi ưu đãi chưa định dạng theo công thức cố định của hệ thống. Dữ liệu được lưu trữ dạng văn bản tự do, hỗ trợ nhân viên bán hàng và Chatbot AI tra cứu, tư vấn cho khách.
              </v-alert>

              <v-textarea
                v-model="form.actions.textContent"
                label="Nội dung ưu đãi / Thể lệ áp dụng (Dạng văn bản) *"
                variant="outlined"
                density="compact"
                rows="4"
                placeholder="Ví dụ: Tặng 1 bộ lịch độc quyền và voucher giảm 50.000đ cho đơn hàng tiếp theo khi mua trên 5 triệu; Miễn phí vận chuyển toàn quốc cho đại lý thân thiết..."
                hint="Nhập chi tiết điều khoản, thể lệ hoặc quyền lợi ưu đãi lưu dạng văn bản"
                persistent-hint
                :rules="[v => !!v || 'Vui lòng nhập nội dung ưu đãi dạng văn bản']"
              />
            </div>

            <!-- Live Policy Rule Summary -->
            <v-alert
              type="info"
              variant="tonal"
              density="compact"
              class="mt-4"
              icon="mdi-lightbulb-outline"
            >
              <div class="text-caption font-weight-medium">
                <strong>Tóm tắt quy tắc:</strong> {{ getLiveRuleSummary() }}
              </div>
            </v-alert>
          </v-form>
        </v-card-text>

        <v-card-actions class="pa-4 border-t d-flex justify-end gap-2">
          <v-btn variant="outlined" @click="ruleModalVisible = false">
            {{ !isAdmin ? 'Đóng' : 'Hủy' }}
          </v-btn>
          <v-btn v-if="isAdmin" color="primary" :loading="saving" @click="submitRuleForm">
            {{ isEditing ? 'Lưu cập nhật' : 'Tạo chương trình' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── MODAL 2: INTERACTIVE PRICING PREVIEW TESTER ("Kiểm tra ưu đãi") ──────── -->
    <v-dialog v-model="previewModalVisible" max-width="960px" scrollable>
      <v-card class="rounded-xl">
        <v-card-title class="d-flex align-center justify-space-between pa-4 border-b">
          <div class="d-flex align-center gap-2">
            <v-icon color="secondary">mdi-calculator-variant-outline</v-icon>
            <span class="text-h6 font-weight-bold">Kiểm tra & Giả lập ưu đãi (Pricing Tester)</span>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" @click="previewModalVisible = false" />
        </v-card-title>

        <v-card-text class="pa-5" style="max-height: 80vh">
          <!-- Preset buttons for rapid LA PET testing -->
          <div class="mb-4">
            <div class="text-caption text-medium-emphasis mb-2 font-weight-bold">
              KỊCH BẢN MẪU LA PET KIỂM TRA NHANH:
            </div>
            <div class="d-flex gap-2 flex-wrap">
              <v-btn size="small" variant="tonal" color="purple" @click="loadPreset('TOOTHBRUSH_FULL')">
                Mua đủ 6 SKU E1-E6 (Giá 15k)
              </v-btn>
              <v-btn size="small" variant="tonal" color="amber-darken-2" @click="loadPreset('TOOTHBRUSH_MISSING')">
                Mua thiếu E6 (Chỉ E1-E5)
              </v-btn>
              <v-btn size="small" variant="tonal" color="indigo" @click="loadPreset('CHEW_40M')">
                Đơn 40 triệu Xương gặm (Bậc 9%)
              </v-btn>
              <v-btn size="small" variant="tonal" color="deep-orange" @click="loadPreset('TREATS_BUY_14')">
                Mua 14 bánh thưởng (Tặng 2)
              </v-btn>
            </div>
          </div>

          <!-- Items in test cart -->
          <div class="d-flex justify-space-between align-center mb-2">
            <div class="text-subtitle-2 font-weight-bold">Danh sách sản phẩm trong giỏ kiểm tra:</div>
            <v-btn
              size="small"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-package-variant-plus"
              class="text-none font-weight-medium"
              @click="openTesterProductSelector"
            >
              Thêm sản phẩm
            </v-btn>
          </div>

          <v-table density="compact" class="border rounded mb-4">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-800">
                <th>SKU</th>
                <th>Tên sản phẩm</th>
                <th>Ngành hàng / Thương hiệu</th>
                <th style="width: 100px">Số lượng</th>
                <th style="width: 140px">Đơn giá</th>
                <th class="text-right">Tạm tính</th>
                <th class="text-right" style="width: 40px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(it, idx) in testCart.items" :key="idx">
                <td>
                  <v-text-field v-model="it.sku" density="compact" variant="outlined" hide-details />
                </td>
                <td>
                  <v-text-field v-model="it.productName" density="compact" variant="outlined" hide-details />
                </td>
                <td>
                  <div class="d-flex gap-1">
                    <v-text-field v-model="it.category" placeholder="Ngành hàng" density="compact" variant="outlined" hide-details />
                    <v-text-field v-model="it.brand" placeholder="Hiệu" density="compact" variant="outlined" hide-details />
                  </div>
                </td>
                <td>
                  <v-text-field v-model.number="it.quantity" type="number" density="compact" variant="outlined" hide-details min="1" />
                </td>
                <td>
                  <CurrencyInput v-model="it.priceUnit" density="compact" variant="outlined" hide-details suffix="đ" />
                </td>
                <td class="text-right font-weight-medium">
                  {{ formatVND(it.quantity * it.priceUnit) }}
                </td>
                <td class="text-right">
                  <v-btn icon="mdi-close" size="x-small" variant="text" color="error" @click="testCart.items.splice(idx, 1)" />
                </td>
              </tr>
            </tbody>
          </v-table>

          <!-- Evaluation parameters -->
          <v-row dense class="mb-4">
            <v-col cols="12" sm="4">
              <v-text-field
                v-model="testCart.orderDate"
                label="Ngày tạo đơn (Kiểm tra hiệu lực)"
                type="date"
                variant="outlined"
                density="compact"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-select
                v-model="testCart.customerType"
                label="Nhóm khách hàng"
                :items="['DEALER', 'RETAIL']"
                variant="outlined"
                density="compact"
              />
            </v-col>
            <v-col cols="12" sm="4" class="d-flex align-center">
              <v-btn color="primary" block prepend-icon="mdi-lightning-bolt" :loading="evaluating" @click="runEvaluation">
                Chạy tính toán ưu đãi
              </v-btn>
            </v-col>
          </v-row>

          <!-- Evaluation Results Display -->
          <div v-if="evaluationResult" class="pa-4 bg-slate-50 dark:bg-slate-800 rounded-lg border">
            <div class="text-subtitle-1 font-weight-bold mb-3 d-flex align-center gap-2">
              <v-icon color="success">mdi-check-decagram</v-icon>
              Kết quả tính toán của Pricing Engine
            </div>

            <!-- Financial Summary -->
            <v-row dense class="mb-4">
              <v-col cols="12" sm="4">
                <div class="pa-3 bg-white dark:bg-slate-700 rounded border">
                  <div class="text-caption text-medium-emphasis">Tổng tiền gốc (Chưa giảm)</div>
                  <div class="text-h6 font-weight-bold">{{ formatVND(evaluationResult.originalSubtotal) }}</div>
                </div>
              </v-col>
              <v-col cols="12" sm="4">
                <div class="pa-3 bg-white dark:bg-slate-700 rounded border">
                  <div class="text-caption text-error font-weight-medium">Tổng tiền giảm / Ưu đãi</div>
                  <div class="text-h6 font-weight-bold text-error">-{{ formatVND(evaluationResult.discountAmount) }}</div>
                </div>
              </v-col>
              <v-col cols="12" sm="4">
                <div class="pa-3 bg-emerald-50 dark:bg-emerald-950/40 rounded border border-emerald-300">
                  <div class="text-caption text-emerald-700 dark:text-emerald-400 font-weight-bold">Tổng thanh toán cuối</div>
                  <div class="text-h6 font-weight-bold text-emerald-700 dark:text-emerald-400">
                    {{ formatVND(evaluationResult.finalTotal) }}
                  </div>
                </div>
              </v-col>
            </v-row>

            <!-- Applied Promotions breakdown -->
            <div v-if="evaluationResult.appliedPromotions?.length" class="mb-4">
              <div class="text-subtitle-2 font-weight-bold mb-2">Chương trình đã áp dụng:</div>
              <v-card
                v-for="(ap, idx) in evaluationResult.appliedPromotions"
                :key="idx"
                class="mb-2 pa-3 rounded border elevation-0"
              >
                <div class="d-flex justify-space-between align-center mb-1">
                  <div class="d-flex align-center gap-2 min-w-0 mr-2">
                    <v-chip size="x-small" color="success" class="font-weight-bold flex-shrink-0">Áp dụng</v-chip>
                    <span class="font-weight-bold text-truncate" :title="ap.promotionName">{{ ap.promotionName }}</span>
                    <span class="text-caption font-mono text-medium-emphasis flex-shrink-0">({{ ap.promotionCode }})</span>
                  </div>
                  <div v-if="ap.discountAmount > 0" class="text-subtitle-2 font-weight-bold text-error">
                    -{{ formatVND(ap.discountAmount) }}
                  </div>
                </div>
                <div class="text-caption text-medium-emphasis">{{ ap.explanation }}</div>
              </v-card>
            </div>

            <!-- Free Gifts -->
            <div v-if="evaluationResult.freeItems?.length" class="mb-4">
              <div class="text-subtitle-2 font-weight-bold mb-2 text-deep-orange">Sản phẩm quà tặng kèm (Free Items):</div>
              <div
                v-for="(gift, idx) in evaluationResult.freeItems"
                :key="idx"
                class="pa-2 px-3 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-300 d-flex align-center justify-space-between mb-1"
              >
                <div class="d-flex align-center gap-2">
                  <v-icon color="deep-orange" size="18">mdi-gift</v-icon>
                  <span class="font-weight-medium text-body-2">{{ gift.name }} (Mã: {{ gift.sku }})</span>
                </div>
                <v-chip size="small" color="deep-orange" class="font-weight-bold">
                  Số lượng: {{ gift.quantity }}
                </v-chip>
              </div>
            </div>

            <!-- Suggestions & Near Tiers -->
            <div v-if="evaluationResult.suggestions?.length" class="mb-3">
              <v-alert
                v-for="(sug, idx) in evaluationResult.suggestions"
                :key="idx"
                type="info"
                variant="tonal"
                density="compact"
                class="mb-1"
                icon="mdi-lightbulb-on-outline"
              >
                {{ sug }}
              </v-alert>
            </div>

            <!-- Missed Promotions Warning (e.g. Thiếu SKU E6) -->
            <div v-if="evaluationResult.missedPromotions?.length">
              <v-alert
                v-for="(miss, idx) in evaluationResult.missedPromotions"
                :key="idx"
                type="warning"
                variant="tonal"
                density="compact"
                class="mb-1"
                icon="mdi-alert-circle-outline"
              >
                <strong>{{ miss.name }}:</strong> {{ miss.reason }}
              </v-alert>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- ── MODAL 3: AUDIT HISTORY & VERSION LINEAGE ───────────────────────────── -->
    <v-dialog v-model="auditModalVisible" max-width="720px" scrollable>
      <v-card class="rounded-xl">
        <v-card-title class="d-flex align-center justify-space-between pa-4 border-b">
          <div class="d-flex align-center gap-2">
            <v-icon color="info">mdi-history</v-icon>
            <span class="text-h6 font-weight-bold">
              Lịch sử phiên bản: {{ selectedPolicyForAudit?.name }}
            </span>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" @click="auditModalVisible = false" />
        </v-card-title>

        <v-card-text class="pa-5" style="max-height: 70vh">
          <v-timeline density="compact" align="start">
            <v-timeline-item
              v-for="(log, idx) in auditLogs"
              :key="idx"
              :dot-color="getAuditColor(log.changeType)"
              size="small"
            >
              <div class="d-flex justify-space-between align-center mb-1">
                <span class="font-weight-bold text-subtitle-2">
                  {{ formatAuditType(log.changeType) }} — Phiên bản v{{ log.version }}
                </span>
                <span class="text-caption text-medium-emphasis">
                  {{ formatDate(log.createdAt) }}
                </span>
              </div>
              <div class="text-body-2 text-medium-emphasis mb-2">
                {{ log.comment || 'Không có ghi chú' }}
              </div>
              <div v-if="log.diff" class="pa-2 bg-slate-100 dark:bg-slate-800 rounded font-mono text-caption">
                {{ JSON.stringify(log.diff, null, 2) }}
              </div>
            </v-timeline-item>
          </v-timeline>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- ── MODAL 4: PRODUCT SELECTOR DIALOG ──────────────────────────────────── -->
    <ProductSelectorModal
      v-model="productSelectorVisible"
      :selected-skus="form.conditions.applicableSkus || []"
      @confirm="handleProductSelectorConfirm"
    />

    <!-- ── MODAL 5: GIFT PRODUCT SELECTOR DIALOG (CHỌN QUÀ TẶNG CHỈ ĐỊNH) ──────── -->
    <ProductSelectorModal
      v-model="giftSelectorVisible"
      :selected-skus="form.actions.giftSku ? [form.actions.giftSku] : []"
      :multiple="false"
      title="Chọn sản phẩm quà tặng chỉ định"
      subtitle="Tìm và chọn sản phẩm để làm quà tặng kèm cho chương trình Mua X Tặng Y."
      @confirm="handleGiftProductConfirm"
    />

    <!-- ── MODAL 6: TESTER PRODUCT SELECTOR DIALOG (CHỌN SẢN PHẨM VÀO GIỎ TEST) ─ -->
    <ProductSelectorModal
      v-model="testerProductSelectorVisible"
      :selected-skus="testCart.items.map(it => it.sku).filter(Boolean)"
      title="Chọn sản phẩm vào giỏ kiểm tra"
      subtitle="Tìm và chọn các sản phẩm thực tế từ hệ thống để đưa vào giỏ kiểm tra tính toán ưu đãi."
      @confirm="handleTesterProductSelectorConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import ProductSelectorModal from '@/components/promotions/ProductSelectorModal.vue';
import CurrencyInput from '@/components/common/CurrencyInput.vue';

const authStore = useAuthStore();
const isAdmin = computed(() => ['owner', 'admin'].includes(authStore.user?.role || ''));

// ── State ────────────────────────────────────────────────────────────────────
const loading = ref(false);
const saving = ref(false);
const evaluating = ref(false);

const activeTab = ref('all');
const searchQuery = ref('');
const promotions = ref<any[]>([]);
const counts = reactive({
  all: 0,
  active: 0,
  upcoming: 0,
  expired: 0,
  paused: 0,
});

// Modals
const ruleModalVisible = ref(false);
const previewModalVisible = ref(false);
const auditModalVisible = ref(false);
const productSelectorVisible = ref(false);
const giftSelectorVisible = ref(false);
const testerProductSelectorVisible = ref(false);
const selectedProductsMap = ref<Record<string, any>>({});
const isEditing = ref(false);
const editingPolicyUsedInOrders = ref(false);
const selectedPolicyForAudit = ref<any>(null);
const auditLogs = ref<any[]>([]);

// Table headers
const headers = [
  { title: 'Tên & Mã chương trình', key: 'name', sortable: true, width: '420px' },
  { title: 'Loại hình', key: 'type', sortable: true, width: '160px' },
  { title: 'Phạm vi', key: 'targetScope', sortable: false, width: '180px' },
  { title: 'Thời gian áp dụng', key: 'validity', sortable: false, width: '190px' },
  { title: 'Ưu tiên', key: 'priority', sortable: true, width: '110px' },
  { title: 'Trạng thái', key: 'isActive', sortable: false, width: '130px' },
  { title: 'Thao tác', key: 'actions', sortable: false, align: 'end' as const, width: '110px' },
];

const promotionTypeOptions = [
  { label: 'Chiết khấu cơ bản (%)', value: 'BASIC_DISCOUNT' },
  { label: 'Bậc chiết khấu theo giá trị (Tiered)', value: 'TIER_DISCOUNT' },
  { label: 'Giá đặc biệt / Combo (Special Price)', value: 'SPECIAL_PRICE' },
  { label: 'Mua X tặng Y (Buy X Get Y)', value: 'BUY_X_GET_Y' },
  { label: 'Thưởng doanh số Quý', value: 'SALES_REWARD_QUARTER' },
  { label: 'Thưởng doanh số Năm', value: 'SALES_REWARD_YEAR' },
  { label: 'Ưu đãi chưa định dạng (Dạng văn bản)', value: 'CUSTOM_TEXT' },
];

const scopeOptions = [
  { label: 'Toàn bộ đơn hàng (Order Total)', value: 'ORDER_TOTAL' },
  { label: 'Theo danh sách sản phẩm cụ thể', value: 'SPECIFIC_SKUS' },
];

// Form data for Rule Builder
const defaultForm = () => ({
  id: '',
  name: '',
  code: '',
  description: '',
  type: 'BASIC_DISCOUNT',
  targetScope: 'SPECIFIC_SKUS',
  priority: 10,
  isStackable: true,
  isActive: true,
  startDate: '',
  endDate: '',
  version: 1,
  conditions: {
    customerTypes: ['DEALER', 'RETAIL'],
    applicableSkus: [] as string[],
    requiredAllSkus: [] as string[],
    requireComboAll: false,
    applicableCategories: [] as string[],
    applicableBrands: [] as string[],
    rewardConditions: {
      onTimePaymentPercent: 95,
      noPriceDumping: true,
      minActiveMonths: 10,
      minDistributedSkus: 15,
    },
  },
  actions: {
    discountPercent: 22,
    discountAmount: 0,
    specialUnitPrice: 15000,
    buyQuantity: 7,
    getQuantity: 1,
    giftType: 'SAME_PRODUCT',
    giftSku: '',
    giftName: '',
    textContent: '',
    tiers: [
      { minAmount: 3000000, percent: 4 },
      { minAmount: 5000000, percent: 5 },
      { minAmount: 8000000, percent: 6 },
      { minAmount: 12000000, percent: 7 },
      { minAmount: 20000000, percent: 8 },
      { minAmount: 40000000, percent: 9 },
      { minAmount: 60000000, percent: 10 },
      { minAmount: 100000000, percent: 13 },
    ],
    rewardTiers: [
      { minAmount: 25000000, rewardPercent: 6 },
      { minAmount: 50000000, rewardPercent: 6.5 },
      { minAmount: 100000000, rewardPercent: 7 },
    ],
  },
});

const form = reactive(defaultForm());

// Preview Test Cart
const testCart = reactive({
  orderDate: new Date().toISOString().slice(0, 10),
  customerType: 'DEALER',
  items: [
    { sku: 'E1', productName: 'Xương bàn chải vị sữa', category: 'Xương bàn chải', brand: 'Lapati', quantity: 2, priceUnit: 19500 },
    { sku: 'E2', productName: 'Xương bàn chải vị phô mai', category: 'Xương bàn chải', brand: 'Lapati', quantity: 2, priceUnit: 19500 },
  ],
});

const evaluationResult = ref<any>(null);

// ── Lifecycle & API Calls ────────────────────────────────────────────────────
onMounted(() => {
  fetchPromotions();
});

let searchTimeout: any = null;
function onSearchDebounced() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    fetchPromotions();
  }, 350);
}

async function fetchPromotions() {
  loading.value = true;
  try {
    const res = await api.get('/promotions', {
      params: {
        status: activeTab.value,
        search: searchQuery.value,
      },
    });
    if (res.data.success) {
      promotions.value = res.data.promotions;
      Object.assign(counts, res.data.counts);
    }
  } catch (err: any) {
    console.error('Error fetching promotions:', err);
  } finally {
    loading.value = false;
  }
}

async function handleToggleStatus(item: any, newVal: boolean) {
  try {
    await api.patch(`/promotions/${item.id}/toggle-status`, { isActive: newVal });
    item.isActive = newVal;
    fetchPromotions();
  } catch (err: any) {
    alert(err.response?.data?.error || 'Lỗi khi cập nhật trạng thái');
  }
}

async function handleClone(item: any) {
  if (!confirm(`Bạn có chắc muốn nhân bản chương trình "${item.name}"?`)) return;
  try {
    await api.post(`/promotions/${item.id}/clone`);
    fetchPromotions();
  } catch (err: any) {
    alert(err.response?.data?.error || 'Lỗi khi nhân bản');
  }
}

async function handleDelete(item: any) {
  if (!confirm(`Bạn có chắc chắn muốn xóa chương trình "${item.name}"?`)) return;
  try {
    await api.delete(`/promotions/${item.id}`);
    fetchPromotions();
  } catch (err: any) {
    alert(err.response?.data?.error || 'Lỗi khi xóa chương trình');
  }
}

// ── Rule Builder Form Handlers ───────────────────────────────────────────────
function openCreateModal() {
  isEditing.value = false;
  editingPolicyUsedInOrders.value = false;
  Object.assign(form, defaultForm());
  ruleModalVisible.value = true;
}

async function prefillProductCache(skus: string[]) {
  if (!skus || skus.length === 0) return;
  const missing = skus.filter((s) => !selectedProductsMap.value[s]);
  if (missing.length === 0) return;
  try {
    const res = await api.get('/products', { params: { limit: 100 } });
    if (res.data.success && res.data.products) {
      res.data.products.forEach((p: any) => {
        if (p.sku) selectedProductsMap.value[p.sku] = p;
      });
    }
  } catch (err) {
    console.warn('Could not prefill products in promo edit:', err);
  }
}

function handleProductSelectorConfirm(skus: string[], productMap: Record<string, any>) {
  form.conditions.applicableSkus = skus;
  Object.assign(selectedProductsMap.value, productMap);
}

function openGiftProductSelector() {
  giftSelectorVisible.value = true;
}

function handleGiftProductConfirm(skus: string[], productMap: Record<string, any>) {
  if (skus.length > 0) {
    const selectedSku = skus[0];
    form.actions.giftSku = selectedSku;
    const prod = productMap[selectedSku] || selectedProductsMap.value[selectedSku];
    if (prod) {
      form.actions.giftName = prod.name || selectedSku;
      selectedProductsMap.value[selectedSku] = prod;
    } else {
      form.actions.giftName = selectedSku;
    }
  }
}

function clearGiftProduct() {
  form.actions.giftSku = '';
  form.actions.giftName = '';
}

function removeSelectedSku(sku: string) {
  if (!form.conditions.applicableSkus) return;
  form.conditions.applicableSkus = form.conditions.applicableSkus.filter((s: string) => s !== sku);
}

function openEditModal(item: any) {
  isEditing.value = true;
  editingPolicyUsedInOrders.value = (item._count?.appliedPromotions || 0) > 0;

  Object.assign(form, {
    id: item.id,
    name: item.name,
    code: item.code,
    description: item.description || '',
    type: item.type,
    targetScope: ['ORDER_TOTAL', 'SPECIFIC_SKUS'].includes(item.targetScope)
      ? item.targetScope
      : (item.conditions?.applicableSkus?.length ? 'SPECIFIC_SKUS' : 'ORDER_TOTAL'),
    priority: item.priority,
    isStackable: item.isStackable,
    isActive: item.isActive,
    version: item.version,
    startDate: item.startDate ? item.startDate.slice(0, 16) : '',
    endDate: item.endDate ? item.endDate.slice(0, 16) : '',
    conditions: JSON.parse(JSON.stringify(item.conditions || {})),
    actions: JSON.parse(JSON.stringify(item.actions || {})),
  });

  if (!form.conditions.applicableSkus) form.conditions.applicableSkus = [];
  if (!form.conditions.applicableCategories) form.conditions.applicableCategories = [];
  if (!form.conditions.applicableBrands) form.conditions.applicableBrands = [];
  if (!form.conditions.requiredAllSkus) form.conditions.requiredAllSkus = [];
  form.conditions.requireComboAll = (item.conditions?.requiredAllSkus?.length || 0) > 0;

  if (!form.conditions.rewardConditions) {
    form.conditions.rewardConditions = {
      onTimePaymentPercent: 95,
      noPriceDumping: true,
      minActiveMonths: 10,
      minDistributedSkus: 15,
    };
  }

  if (form.conditions.applicableSkus.length > 0) {
    prefillProductCache(form.conditions.applicableSkus);
  }
  if (item.actions?.giftSku) {
    prefillProductCache([item.actions.giftSku]);
  }

  if (!form.actions.textContent && item.description) {
    form.actions.textContent = item.description;
  }

  ruleModalVisible.value = true;
}

function addTier() {
  if (!form.actions.tiers) form.actions.tiers = [];
  form.actions.tiers.push({ minAmount: 1000000, percent: 5 });
}

function removeTier(idx: number) {
  form.actions.tiers.splice(idx, 1);
}

function addRewardTier() {
  if (!form.actions.rewardTiers) form.actions.rewardTiers = [];
  form.actions.rewardTiers.push({ minAmount: 100000000, rewardPercent: 5 });
}

function removeRewardTier(idx: number) {
  form.actions.rewardTiers.splice(idx, 1);
}

function getLiveRuleSummary(): string {
  const scopeDesc =
    form.targetScope === 'ORDER_TOTAL'
      ? 'Toàn bộ đơn hàng'
      : `${form.conditions.applicableSkus?.length || 0} sản phẩm cụ thể`;

  switch (form.type) {
    case 'BASIC_DISCOUNT':
    case 'PERCENT_DISCOUNT':
      return `Chiết khấu ${form.actions.discountPercent || 0}% cho ${scopeDesc}.`;
    case 'TIER_DISCOUNT':
      return `Bậc chiết khấu theo giá trị (${form.actions.tiers?.length || 0} bậc) tính trên ${scopeDesc}.`;
    case 'SPECIAL_PRICE':
    case 'COMBO':
      return `Giá hỗ trợ đặc biệt ${formatVND(form.actions.specialUnitPrice || 0)}/sản phẩm cho ${scopeDesc}${
        form.conditions.requireComboAll ? ' (bắt buộc mua trọn bộ SKU combo)' : ''
      }.`;
    case 'BUY_X_GET_Y':
      return `Mua tối thiểu ${form.actions.buyQuantity || 7} sản phẩm trong ${scopeDesc}, tặng ${form.actions.getQuantity || 1} sản phẩm ${
        form.actions.giftType === 'SPECIFIC_SKU' ? (form.actions.giftName || 'quà chỉ định') : 'cùng loại'
      }.`;
    case 'SALES_REWARD_QUARTER':
      return `Thưởng doanh số Quý gồm ${form.actions.rewardTiers?.length || 0} mốc thưởng theo ${scopeDesc}.`;
    case 'SALES_REWARD_YEAR':
      return `Thưởng doanh số Năm gồm ${form.actions.rewardTiers?.length || 0} mốc thưởng theo ${scopeDesc} và điều kiện thanh toán/mua hàng.`;
    case 'CUSTOM_TEXT':
      return `Ưu đãi dạng văn bản: "${form.actions.textContent || form.description || 'Chưa nhập nội dung'}" áp dụng cho ${scopeDesc}.`;
    default:
      return `${formatTypeName(form.type)} áp dụng cho ${scopeDesc}.`;
  }
}

async function submitRuleForm() {
  if (!form.name || !form.code) {
    alert('Vui lòng nhập tên và mã chương trình');
    return;
  }

  if (
    form.targetScope === 'SPECIFIC_SKUS' &&
    (!form.conditions.applicableSkus || form.conditions.applicableSkus.length === 0)
  ) {
    alert('Vui lòng chọn ít nhất một sản phẩm áp dụng ưu đãi.');
    return;
  }

  if (form.type === 'CUSTOM_TEXT') {
    if (!form.actions.textContent?.trim() && !form.description?.trim()) {
      alert('Vui lòng nhập nội dung ưu đãi dạng văn bản.');
      return;
    }
    if (form.actions.textContent?.trim() && !form.description?.trim()) {
      form.description = form.actions.textContent.trim();
    }
  }

  if (form.type === 'BUY_X_GET_Y' && form.actions.giftType === 'SPECIFIC_SKU') {
    if (!form.actions.giftSku && !form.actions.giftName) {
      alert('Vui lòng chọn sản phẩm quà tặng chỉ định.');
      return;
    }
  }

  // Handle combo required all skus
  if (form.type === 'SPECIAL_PRICE' || form.type === 'COMBO') {
    if (form.conditions.requireComboAll) {
      form.conditions.requiredAllSkus = [...(form.conditions.applicableSkus || [])];
    } else {
      form.conditions.requiredAllSkus = [];
    }
  }

  saving.value = true;
  try {
    const payload = {
      name: form.name,
      code: form.code,
      description: form.description,
      type: form.type,
      targetScope: form.targetScope,
      priority: form.priority,
      isStackable: form.isStackable,
      isActive: form.isActive,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
      endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
      conditions: form.conditions,
      actions: form.actions,
    };

    if (isEditing.value) {
      await api.put(`/promotions/${form.id}`, payload);
    } else {
      await api.post('/promotions', payload);
    }

    ruleModalVisible.value = false;
    fetchPromotions();
  } catch (err: any) {
    alert(err.response?.data?.error || 'Lỗi khi lưu chính sách');
  } finally {
    saving.value = false;
  }
}

// ── Preview Tester Handlers ─────────────────────────────────────────────────
function openPreviewModal() {
  evaluationResult.value = null;
  previewModalVisible.value = true;
}

function openTesterProductSelector() {
  testerProductSelectorVisible.value = true;
}

function handleTesterProductSelectorConfirm(skus: string[], productMap: Record<string, any>) {
  Object.assign(selectedProductsMap.value, productMap);
  const existingMap = new Map(testCart.items.map((it) => [it.sku, it]));
  const updatedItems: any[] = [];

  for (const sku of skus) {
    if (existingMap.has(sku)) {
      updatedItems.push(existingMap.get(sku)!);
    } else {
      const p = productMap[sku] || selectedProductsMap.value[sku] || {};
      const unitPrice = p.wholesalePrice || p.listPrice || p.retailPrice || 0;
      updatedItems.push({
        sku: p.sku || sku,
        productName: p.name || `Sản phẩm ${sku}`,
        category: p.category || '',
        brand: p.brand || '',
        quantity: 1,
        priceUnit: unitPrice,
      });
    }
  }

  testCart.items = updatedItems;
}

function loadPreset(presetName: string) {
  if (presetName === 'TOOTHBRUSH_FULL') {
    testCart.orderDate = '2026-08-20';
    testCart.items = [
      { sku: 'E1', productName: 'Xương bàn chải vị sữa', category: 'Xương bàn chải', brand: 'Lapati', quantity: 2, priceUnit: 19500 },
      { sku: 'E2', productName: 'Xương bàn chải vị phô mai', category: 'Xương bàn chải', brand: 'Lapati', quantity: 2, priceUnit: 19500 },
      { sku: 'E3', productName: 'Xương bàn chải gà + hươu', category: 'Xương bàn chải', brand: 'Lapati', quantity: 2, priceUnit: 19500 },
      { sku: 'E4', productName: 'Xương bàn chải vị bò', category: 'Xương bàn chải', brand: 'Lapati', quantity: 2, priceUnit: 19500 },
      { sku: 'E5', productName: 'Xương bàn chải vị bạc hà', category: 'Xương bàn chải', brand: 'Lapati', quantity: 2, priceUnit: 19500 },
      { sku: 'E6', productName: 'Xương bàn chải ba rọi hun khói', category: 'Xương bàn chải', brand: 'Lapati', quantity: 2, priceUnit: 19500 },
    ];
  } else if (presetName === 'TOOTHBRUSH_MISSING') {
    testCart.orderDate = '2026-08-20';
    testCart.items = [
      { sku: 'E1', productName: 'Xương bàn chải vị sữa', category: 'Xương bàn chải', brand: 'Lapati', quantity: 2, priceUnit: 19500 },
      { sku: 'E2', productName: 'Xương bàn chải vị phô mai', category: 'Xương bàn chải', brand: 'Lapati', quantity: 2, priceUnit: 19500 },
      { sku: 'E3', productName: 'Xương bàn chải gà + hươu', category: 'Xương bàn chải', brand: 'Lapati', quantity: 2, priceUnit: 19500 },
      { sku: 'E4', productName: 'Xương bàn chải vị bò', category: 'Xương bàn chải', brand: 'Lapati', quantity: 2, priceUnit: 19500 },
      { sku: 'E5', productName: 'Xương bàn chải vị bạc hà', category: 'Xương bàn chải', brand: 'Lapati', quantity: 2, priceUnit: 19500 },
    ];
  } else if (presetName === 'CHEW_40M') {
    testCart.orderDate = new Date().toISOString().slice(0, 10);
    testCart.items = [
      { sku: 'B03', productName: 'Que gặm xoắn canxi sữa', category: 'Xương gặm', brand: 'Lapati', quantity: 1000, priceUnit: 40000 },
    ];
  } else if (presetName === 'TREATS_BUY_14') {
    testCart.orderDate = new Date().toISOString().slice(0, 10);
    testCart.items = [
      { sku: 'DX-TREAT-01', productName: 'Bánh thưởng Dexinbone sữa canxi', category: 'Bánh thưởng', brand: 'Dexinbone', quantity: 14, priceUnit: 38000 },
    ];
  }
}

async function runEvaluation() {
  evaluating.value = true;
  try {
    const res = await api.post('/pricing/evaluate', {
      orderDate: testCart.orderDate,
      customerType: testCart.customerType,
      items: testCart.items,
    });
    if (res.data.success) {
      evaluationResult.value = res.data.result;
    }
  } catch (err: any) {
    alert(err.response?.data?.error || 'Lỗi khi tính toán');
  } finally {
    evaluating.value = false;
  }
}

// ── Audit History Modal Handlers ─────────────────────────────────────────────
async function openAuditModal(item: any) {
  selectedPolicyForAudit.value = item;
  try {
    const res = await api.get(`/promotions/${item.id}/audit-logs`);
    if (res.data.success) {
      auditLogs.value = res.data.logs;
    }
  } catch (err: any) {
    console.error('Error fetching audit logs:', err);
  }
  auditModalVisible.value = true;
}

// ── Formatters ───────────────────────────────────────────────────────────────
function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Math.round(amount || 0));
}

function formatDate(d?: string | Date): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTypeName(t: string): string {
  switch (t) {
    case 'BASIC_DISCOUNT': return 'Chiết khấu cơ bản';
    case 'TIER_DISCOUNT': return 'Bậc doanh số';
    case 'SPECIAL_PRICE': return 'Giá đặc biệt';
    case 'COMBO': return 'Combo sản phẩm';
    case 'BUY_X_GET_Y': return 'Mua X tặng Y';
    case 'SALES_REWARD_QUARTER': return 'Thưởng quý';
    case 'SALES_REWARD_YEAR': return 'Thưởng năm';
    case 'CUSTOM_TEXT': return 'Chưa định dạng (Văn bản)';
    default: return t;
  }
}

function getTypeChipColor(t: string): string {
  switch (t) {
    case 'BASIC_DISCOUNT': return 'cyan';
    case 'TIER_DISCOUNT': return 'indigo';
    case 'SPECIAL_PRICE': return 'purple';
    case 'BUY_X_GET_Y': return 'deep-orange';
    case 'SALES_REWARD_QUARTER': return 'teal';
    case 'SALES_REWARD_YEAR': return 'amber-darken-3';
    case 'CUSTOM_TEXT': return 'blue-grey';
    default: return 'primary';
  }
}

function formatScope(s: string): string {
  switch (s) {
    case 'ALL_PRODUCTS': return 'Toàn bộ sản phẩm';
    case 'CATEGORY': return 'Theo ngành hàng';
    case 'BRAND': return 'Theo thương hiệu';
    case 'SPECIFIC_SKUS': return 'SKU cụ thể';
    case 'ORDER_TOTAL': return 'Tổng giá trị đơn';
    default: return s;
  }
}

function formatAuditType(type: string): string {
  switch (type) {
    case 'CREATE': return 'Khởi tạo';
    case 'UPDATE': return 'Cập nhật';
    case 'NEW_VERSION': return 'Phiên bản mới';
    case 'ACTIVATE': return 'Kích hoạt';
    case 'DEACTIVATE': return 'Tạm dừng';
    default: return type;
  }
}

function getAuditColor(type: string): string {
  switch (type) {
    case 'CREATE': return 'primary';
    case 'UPDATE': return 'info';
    case 'NEW_VERSION': return 'purple';
    case 'ACTIVATE': return 'success';
    case 'DEACTIVATE': return 'warning';
    default: return 'grey';
  }
}

// ── Validity Status Evaluation (Màu sắc theo thời gian sự kiện) ─────────────
interface ValidityStatus {
  status: 'UPCOMING' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED';
  label: string;
  icon: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  badgeColor: string;
}

function getValidityStatus(startDate?: string | null, endDate?: string | null): ValidityStatus {
  const now = new Date();

  // 1. Đã kết thúc (Màu cam)
  if (endDate) {
    const end = new Date(endDate);
    if (end.getTime() < now.getTime()) {
      return {
        status: 'EXPIRED',
        label: 'Đã kết thúc',
        icon: 'mdi-clock-alert-outline',
        bgClass: 'bg-orange-50 dark:bg-orange-950/40',
        borderClass: 'border-orange-300 dark:border-orange-700',
        textClass: 'text-orange-900 dark:text-orange-200',
        badgeColor: 'deep-orange',
      };
    }
  }

  // 2. Sắp diễn ra (Xanh nước biển)
  if (startDate) {
    const start = new Date(startDate);
    if (start.getTime() > now.getTime()) {
      return {
        status: 'UPCOMING',
        label: 'Sắp diễn ra',
        icon: 'mdi-clock-start',
        bgClass: 'bg-sky-50 dark:bg-sky-950/40',
        borderClass: 'border-sky-300 dark:border-sky-700',
        textClass: 'text-sky-900 dark:text-sky-200',
        badgeColor: 'info',
      };
    }
  }

  // 3. Sắp kết thúc (Màu vàng - còn <= 3 ngày)
  if (endDate) {
    const end = new Date(endDate);
    const msRemaining = end.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
    if (daysRemaining <= 3) {
      return {
        status: 'EXPIRING_SOON',
        label: daysRemaining <= 1 ? 'Sắp kết thúc (hôm nay)' : `Sắp kết thúc (còn ${daysRemaining} ngày)`,
        icon: 'mdi-clock-fast',
        bgClass: 'bg-amber-50 dark:bg-amber-950/40',
        borderClass: 'border-amber-400 dark:border-amber-600',
        textClass: 'text-amber-950 dark:text-amber-200',
        badgeColor: 'amber-darken-2',
      };
    }
  }

  // 4. Đang diễn ra (Xanh lá)
  return {
    status: 'ACTIVE',
    label: 'Đang diễn ra',
    icon: 'mdi-check-circle-outline',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/40',
    borderClass: 'border-emerald-300 dark:border-emerald-700',
    textClass: 'text-emerald-900 dark:text-emerald-200',
    badgeColor: 'success',
  };
}
</script>

<style scoped>
.promotions-table :deep(th) {
  font-weight: 600 !important;
  color: rgb(100, 116, 139) !important;
}
.dark .promotions-table :deep(th) {
  color: rgb(203, 213, 225) !important;
}
.promotions-table :deep(td) {
  white-space: normal !important;
}
.selected-product-item,
.selected-gift-item {
  transition: all 0.2s ease;
}
.selected-product-item:hover,
.selected-gift-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
</style>

<style>
/* ── View-only Mode (Non-Admin / Staff): Sharp text, full contrast, no fading or blur ── */
.view-only-dialog .v-field--disabled,
.view-only-dialog .v-input--disabled,
.view-only-dialog .v-field--readonly,
.view-only-dialog .v-input--readonly {
  opacity: 1 !important;
}

.view-only-dialog .v-field__input,
.view-only-dialog input:not([type="checkbox"]):not([type="radio"]),
.view-only-dialog textarea,
.view-only-dialog .v-select__selection-text,
.view-only-dialog .v-field--disabled input:not([type="checkbox"]):not([type="radio"]),
.view-only-dialog .v-field--disabled textarea,
.view-only-dialog .v-field--disabled .v-field__input,
.view-only-dialog .v-field--readonly input:not([type="checkbox"]):not([type="radio"]),
.view-only-dialog .v-field--readonly textarea,
.view-only-dialog .v-field--readonly .v-field__input {
  opacity: 1 !important;
  color: #0f172a !important; /* Slate 900 */
  -webkit-text-fill-color: #0f172a !important;
  font-weight: 500 !important;
  cursor: default !important;
}

.dark .view-only-dialog .v-field__input,
.dark .view-only-dialog input:not([type="checkbox"]):not([type="radio"]),
.dark .view-only-dialog textarea,
.dark .view-only-dialog .v-select__selection-text,
.dark .view-only-dialog .v-field--disabled input:not([type="checkbox"]):not([type="radio"]),
.dark .view-only-dialog .v-field--disabled textarea,
.dark .view-only-dialog .v-field--disabled .v-field__input,
.dark .view-only-dialog .v-field--readonly input:not([type="checkbox"]):not([type="radio"]),
.dark .view-only-dialog .v-field--readonly textarea {
  color: #f8fafc !important;
  -webkit-text-fill-color: #f8fafc !important;
}

.view-only-dialog .v-label,
.view-only-dialog .v-field-label,
.view-only-dialog .v-field--disabled .v-label,
.view-only-dialog .v-field--readonly .v-label {
  opacity: 1 !important;
  color: #334155 !important; /* Slate 700 */
}

.dark .view-only-dialog .v-label,
.dark .view-only-dialog .v-field-label,
.dark .view-only-dialog .v-field--disabled .v-label,
.dark .view-only-dialog .v-field--readonly .v-label {
  color: #94a3b8 !important; /* Slate 400 */
}

.view-only-dialog .v-field__outline {
  --v-field-border-opacity: 0.65 !important;
  color: #94a3b8 !important;
}

/* Vuetify Checkbox & Radio controls */
.view-only-dialog .v-selection-control--disabled,
.view-only-dialog .v-selection-control--readonly {
  opacity: 1 !important;
}

/* Ensure native browser checkbox/radio remains 100% hidden behind Vuetify icon */
.view-only-dialog .v-selection-control input,
.view-only-dialog .v-selection-control--disabled input,
.view-only-dialog .v-selection-control--readonly input {
  opacity: 0 !important;
  cursor: default !important;
}

.view-only-dialog .v-selection-control--disabled .v-icon,
.view-only-dialog .v-selection-control--readonly .v-icon {
  opacity: 1 !important;
}

.view-only-dialog .v-selection-control--disabled .v-label,
.view-only-dialog .v-selection-control--readonly .v-label {
  opacity: 1 !important;
  color: #0f172a !important;
  font-weight: 500 !important;
  cursor: default !important;
}

.dark .view-only-dialog .v-selection-control--disabled .v-label,
.dark .view-only-dialog .v-selection-control--readonly .v-label {
  color: #f8fafc !important;
}

.view-only-dialog .v-table input:not([type="checkbox"]):not([type="radio"]) {
  opacity: 1 !important;
  color: #0f172a !important;
  -webkit-text-fill-color: #0f172a !important;
  font-weight: 500 !important;
}

.dark .view-only-dialog .v-table input:not([type="checkbox"]):not([type="radio"]) {
  color: #f8fafc !important;
  -webkit-text-fill-color: #f8fafc !important;
}
</style>
