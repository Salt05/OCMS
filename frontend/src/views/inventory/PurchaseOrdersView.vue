<template>
  <div class="pa-6">
    <!-- Header -->
    <div class="d-flex justify-space-between align-center mb-6 flex-wrap gap-3">
      <div class="d-flex align-center gap-3">
        <v-btn
          variant="tonal"
          color="secondary"
          prepend-icon="lucide-arrow-left"
          to="/inventory"
          class="text-none font-weight-medium"
        >
          Trở về kho
        </v-btn>
        <div>
          <h1 class="text-h4 font-weight-bold">Phiếu Nhập Hàng (PO)</h1>
          <div class="text-caption text-grey mt-0.5">Quản lý yêu cầu báo giá và phiếu nhập kho đồng bộ với Odoo ERP</div>
        </div>
      </div>
      <div class="d-flex align-center gap-2">
        <v-btn
          variant="outlined"
          color="teal"
          prepend-icon="lucide-cloud-download"
          :loading="syncingPOs"
          @click="syncPOsFromOdoo"
          class="text-none font-weight-medium"
        >
          Đồng bộ từ Odoo
        </v-btn>
        <v-btn
          variant="outlined"
          color="primary"
          prepend-icon="lucide-rotate-cw"
          :loading="loading"
          @click="loadPOs"
          class="text-none"
        >
          Làm mới
        </v-btn>
        <v-btn
          color="primary"
          prepend-icon="lucide-plus"
          @click="openCreateDialog"
          class="font-weight-bold text-none"
        >
          Tạo Phiếu Nhập
        </v-btn>
      </div>
    </div>

    <!-- PO List Table Card -->
    <v-card rounded="lg" elevation="2" class="mb-6">
      <div class="pa-4 border-b d-flex justify-space-between align-center flex-wrap gap-3">
        <v-text-field
          v-model="search"
          prepend-inner-icon="lucide-search"
          label="Tìm kiếm mã phiếu, nhà cung cấp, kho..."
          variant="outlined"
          density="compact"
          hide-details
          class="max-w-400"
          clearable
        ></v-text-field>
        <div class="text-caption text-grey">
          Tổng số: <strong class="text-high-emphasis">{{ filteredPos.length }}</strong> phiếu
        </div>
      </div>

      <v-table hover class="purchase-order-table">
        <thead>
          <tr>
            <th style="width: 150px; min-width: 150px;">Mã Phiếu</th>
            <th style="width: 240px; min-width: 220px;">Nhà cung cấp</th>
            <th style="width: 240px; min-width: 220px;">Hoạt động</th>
            <th style="width: 200px; min-width: 180px;">Địa điểm giao</th>
            <th style="width: 150px; min-width: 120px;">Hạn đặt hàng</th>
            <th style="width: 150px; min-width: 120px;">Ngày dự kiến về</th>
            <th style="width: 180px; min-width: 160px;" class="text-right">Tổng tiền</th>
            <th style="width: 180px; min-width: 150px;" class="text-center">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="8" class="text-center pa-6">
              <v-progress-circular indeterminate color="primary"></v-progress-circular>
              <div class="text-caption text-grey mt-2">Đang tải danh sách phiếu nhập...</div>
            </td>
          </tr>
          <tr v-else-if="filteredPos.length === 0">
            <td colspan="8" class="text-center pa-8 text-grey">Không có phiếu nhập hàng nào phù hợp</td>
          </tr>
          <tr
            v-else
            v-for="po in filteredPos"
            :key="po.id"
            class="po-row"
            @click="openDetailDialog(po)"
          >
            <td class="font-weight-bold text-primary purchase-code-cell">
              <div class="d-flex align-center gap-1.5">
                <v-icon size="16" color="primary">lucide-file-text</v-icon>
                <span>{{ po.odooPurchaseId ? 'PO' + String(po.odooPurchaseId).padStart(5, '0') : ('PO-' + po.id.slice(0, 6).toUpperCase()) }}</span>
              </div>
            </td>
            <td class="vendor-cell">
              <div class="font-weight-medium text-high-emphasis text-truncate" :title="po.vendorName || '—'">
                {{ po.vendorName || '—' }}
              </div>
            </td>
            <td class="activity-cell">
              <div class="text-truncate" :title="po.activitySummary || '—'">
                {{ po.activitySummary || '—' }}
              </div>
            </td>
            <td>
              <v-chip size="x-small" variant="tonal" color="info" v-if="po.deliverTo" class="text-truncate max-w-100">
                <v-icon start size="12">lucide-warehouse</v-icon>
                {{ po.deliverTo }}
              </v-chip>
              <span v-else class="text-grey">—</span>
            </td>
            <td>{{ po.orderDeadline ? formatDate(po.orderDeadline) : '—' }}</td>
            <td>{{ po.expectedDate ? formatDate(po.expectedDate) : '—' }}</td>
            <td class="text-right font-weight-bold text-primary">
              {{ formatCurrency(po.amountTotal || po.amountUntaxed) }}
            </td>
            <td class="text-center">
              <v-chip size="small" :color="getStateColor(po.state)">
                {{ getStateLabel(po.state) }}
              </v-chip>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- ==================== POPUP CHI TIẾT & CHỈNH SỬA PHIẾU NHẬP ==================== -->
    <v-dialog v-model="detailDialog" max-width="920px" scrollable persistent>
      <v-card rounded="xl" class="d-flex flex-column overflow-hidden elevation-12" style="max-height: 88vh;">
        <!-- Header -->
        <v-card-title class="pa-4 px-6 bg-slate-900 text-white d-flex justify-space-between align-center flex-shrink-0" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);">
          <div class="d-flex align-center gap-3">
            <v-avatar color="primary" size="40" class="rounded-lg">
              <v-icon size="22" color="white">lucide-clipboard-check</v-icon>
            </v-avatar>
            <div>
              <div class="text-h6 font-weight-bold d-flex align-center gap-2">
                <span>Chi tiết Phiếu Nhập #{{ getPoCode(detailForm) }}</span>
                <v-chip size="small" :color="getStateColor(detailForm.state)" class="font-weight-medium">
                  {{ getStateLabel(detailForm.state) }}
                </v-chip>
              </div>
              <div class="text-caption text-grey-lighten-2">
                <span v-if="detailForm.odooPurchaseId">Đã đồng bộ Odoo PO#{{ detailForm.odooPurchaseId }}</span>
                <span v-else>Phiếu nhập nội bộ</span>
                <span v-if="detailForm.createdBy?.fullName"> • Người tạo: {{ detailForm.createdBy.fullName }}</span>
              </div>
            </div>
          </div>

          <div class="d-flex align-center gap-2">
            <v-btn
              variant="flat"
              size="small"
              color="primary"
              prepend-icon="lucide-download"
              class="text-none font-weight-medium"
              :loading="downloadingId === detailForm.id"
              @click="downloadPdf(detailForm.id, getPoCode(detailForm))"
            >
              Tải PDF
            </v-btn>
            <v-btn icon="lucide-x" variant="text" size="small" color="white" @click="detailDialog = false"></v-btn>
          </div>
        </v-card-title>

        <!-- Body Scrollable -->
        <v-card-text class="purchase-detail-body pa-6 overflow-y-auto flex-grow-1">
          <!-- Loading state -->
          <div v-if="detailLoading" class="text-center py-12">
            <v-progress-circular indeterminate color="primary" size="48"></v-progress-circular>
            <div class="text-body-2 text-grey mt-3">Đang tải thông tin chi tiết đơn hàng...</div>
          </div>

          <v-form v-else>
            <!-- Box 1: Thông tin đơn hàng -->
            <v-card rounded="lg" class="pa-4 mb-4 bg-white border" elevation="0">
              <div class="text-subtitle-2 font-weight-bold text-grey-darken-3 mb-3 d-flex align-center gap-2">
                <v-icon size="18" color="primary">lucide-info</v-icon>
                Thông tin chung
              </div>

              <v-row dense>
                <!-- Nhà cung cấp -->
                <v-col cols="12" md="6" class="mb-2">
                  <v-autocomplete
                    v-model="detailSelectedVendor"
                    :items="vendorOptions"
                    item-title="name"
                    item-value="id"
                    return-object
                    label="Nhà cung cấp (NCC) *"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="lucide-building"
                    :loading="loadingVendors"
                    @update:search="onVendorSearch"
                  ></v-autocomplete>
                </v-col>

                <!-- Địa điểm nhận hàng -->
                <v-col cols="12" md="6" class="mb-2">
                  <v-combobox
                    v-model="detailForm.deliverTo"
                    :items="locationOptionNames"
                    label="Địa điểm kho nhận hàng"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="lucide-warehouse"
                  ></v-combobox>
                </v-col>

                <!-- Hạn đặt hàng -->
                <v-col cols="12" md="4" class="mb-2">
                  <v-text-field
                    v-model="detailForm.orderDeadline"
                    label="Hạn đặt hàng"
                    type="date"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="lucide-calendar"
                  ></v-text-field>
                </v-col>

                <!-- Ngày dự kiến về -->
                <v-col cols="12" md="4" class="mb-2">
                  <v-text-field
                    v-model="detailForm.expectedDate"
                    label="Ngày hàng về dự kiến"
                    type="date"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="lucide-calendar-clock"
                  ></v-text-field>
                </v-col>

                <!-- Trạng thái -->
                <v-col cols="12" md="4" class="mb-2">
                  <v-select
                    v-model="detailForm.state"
                    :items="stateOptions"
                    item-title="label"
                    item-value="value"
                    label="Trạng thái đơn hàng"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="lucide-check-circle"
                  ></v-select>
                </v-col>

                <!-- Ghi chú -->
                <v-col cols="12">
                  <v-textarea
                    v-model="detailForm.notes"
                    label="Ghi chú đơn hàng"
                    variant="outlined"
                    rows="2"
                    density="comfortable"
                    hide-details
                    placeholder="Ghi chú thêm thông tin giao nhận, thanh toán..."
                  ></v-textarea>
                </v-col>
              </v-row>
            </v-card>

            <!-- Box 2: Danh sách sản phẩm -->
            <v-card rounded="lg" class="pa-4 bg-white border" elevation="0">
              <div class="d-flex justify-space-between align-center mb-3">
                <div class="d-flex align-center gap-2">
                  <v-icon size="18" color="primary">lucide-boxes</v-icon>
                  <span class="text-subtitle-2 font-weight-bold text-grey-darken-3">Danh sách sản phẩm trong đơn</span>
                  <v-chip size="x-small" color="primary" variant="tonal" class="font-weight-medium">
                    {{ detailForm.lines.length }} sản phẩm
                  </v-chip>
                </div>

                <v-btn
                  size="small"
                  color="primary"
                  variant="tonal"
                  prepend-icon="lucide-plus"
                  class="text-none font-weight-medium"
                  @click="openPickerForEdit"
                >
                  Thêm sản phẩm
                </v-btn>
              </div>

              <!-- Empty product state -->
              <div v-if="detailForm.lines.length === 0" class="text-center py-6 px-4 border border-dashed rounded-lg bg-grey-lighten-5 mb-2">
                <v-icon size="32" color="grey">lucide-package-open</v-icon>
                <div class="text-body-2 font-weight-medium text-grey-darken-2 mt-2">Phiếu nhập này chưa có sản phẩm nào</div>
                <v-btn size="small" color="primary" variant="text" class="text-none mt-2" @click="openPickerForEdit">
                  Chọn sản phẩm ngay
                </v-btn>
              </div>

              <!-- Product Lines Table -->
              <div v-else class="border rounded-lg overflow-hidden">
                <table class="w-100 detail-table">
                  <thead class="bg-grey-lighten-4 text-caption font-weight-bold text-grey-darken-2">
                    <tr>
                      <th class="text-center py-2 px-3" style="width: 40px;">#</th>
                      <th class="text-left py-2 px-3">Tên sản phẩm</th>
                      <th class="text-center py-2 px-2" style="width: 140px;">Số lượng</th>
                      <th class="text-right py-2 px-2" style="width: 160px;">Đơn giá</th>
                      <th class="text-right py-2 px-3" style="width: 150px;">Thành tiền</th>
                      <th class="text-center py-2 px-2" style="width: 50px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(line, index) in detailForm.lines" :key="index" class="border-b">
                      <td class="text-center py-2 px-3 text-caption text-grey">
                        {{ Number(index) + 1 }}
                      </td>
                      <td class="py-2 px-3">
                        <div class="font-weight-medium text-body-2 text-high-emphasis">
                          {{ line.productName }}
                        </div>
                        <div class="text-caption text-grey" v-if="line.productId">
                          ID SP: {{ line.productId }}
                        </div>
                      </td>
                      <td class="py-2 px-2 text-center">
                        <div class="d-flex align-center justify-center gap-1">
                          <v-btn
                            icon="lucide-minus"
                            size="x-small"
                            variant="text"
                            density="compact"
                            :disabled="Number(line.quantity) <= 1"
                            @click="decrementLineQty(line)"
                          ></v-btn>
                          <v-text-field
                            v-model.number="line.quantity"
                            type="number"
                            min="1"
                            density="compact"
                            variant="outlined"
                            hide-details
                            class="qty-field text-center"
                            style="width: 60px;"
                          ></v-text-field>
                          <v-btn
                            icon="lucide-plus"
                            size="x-small"
                            variant="text"
                            density="compact"
                            @click="incrementLineQty(line)"
                          ></v-btn>
                        </div>
                      </td>
                      <td class="py-2 px-2 text-right">
                        <v-text-field
                          v-model.number="line.priceUnit"
                          type="number"
                          min="0"
                          density="compact"
                          variant="outlined"
                          hide-details
                          suffix="₫"
                          class="price-field text-right"
                          style="max-width: 140px; margin-left: auto;"
                        ></v-text-field>
                      </td>
                      <td class="py-2 px-3 text-right font-weight-bold text-primary">
                        {{ formatCurrency((Number(line.quantity) || 0) * (Number(line.priceUnit) || 0)) }}
                      </td>
                      <td class="py-2 px-2 text-center">
                        <v-btn
                          icon="lucide-trash-2"
                          size="x-small"
                          color="error"
                          variant="text"
                          title="Xóa dòng sản phẩm"
                          @click="removeDetailLine(Number(index))"
                        ></v-btn>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </v-card>
          </v-form>
        </v-card-text>

        <!-- Sticky Footer -->
        <v-card-actions class="px-6 py-3.5 border-t bg-white d-flex justify-space-between align-center flex-shrink-0">
          <div class="d-flex align-center gap-4 flex-wrap">
            <div class="text-caption text-grey-darken-1">
              Số mặt hàng: <strong class="text-grey-darken-3">{{ detailForm.lines.length }}</strong>
            </div>
            <div class="text-caption text-grey-darken-1">
              Tổng số lượng: <strong class="text-grey-darken-3">{{ detailTotalQty }}</strong>
            </div>
            <div class="d-flex align-center">
              <span class="text-caption text-grey-darken-1 mr-1.5">Tổng tiền:</span>
              <span class="text-h6 font-weight-bold text-primary">{{ formatCurrency(detailTotalAmount) }}</span>
            </div>
          </div>

          <div class="d-flex align-center gap-2">
            <v-btn variant="text" @click="detailDialog = false" :disabled="savingDetail" class="text-none px-4">
              Đóng
            </v-btn>
            <v-btn
              color="primary"
              variant="flat"
              @click="saveDetailChanges"
              :loading="savingDetail"
              prepend-icon="lucide-save"
              class="text-none px-5 font-weight-bold"
            >
              Lưu thay đổi
            </v-btn>
          </div>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ==================== POPUP TẠO PHIẾU NHẬP MỚI ==================== -->
    <v-dialog v-model="dialog" max-width="880px" scrollable persistent>
      <v-card rounded="xl" class="d-flex flex-column overflow-hidden elevation-10" style="max-height: 85vh;">
        <!-- Header -->
        <v-card-title class="pa-4 px-6 bg-primary text-white d-flex justify-space-between align-center flex-shrink-0">
          <div>
            <div class="text-h6 font-weight-bold d-flex align-center gap-2">
              <v-icon size="22">lucide-file-text</v-icon>
              Tạo Yêu Cầu Báo Giá / Phiếu Nhập
            </div>
            <div class="text-caption text-white opacity-80">
              Đồng bộ hai chiều với hệ thống Odoo ERP
            </div>
          </div>
          <div class="d-flex align-center gap-2">
            <v-chip size="small" variant="tonal" color="white" class="mr-1 d-none d-sm-inline-flex">
              Odoo: {{ vendorOptions.length }} NCC • {{ locationOptions.length }} Kho
            </v-chip>
            <v-tooltip text="Làm mới dữ liệu Nhà cung cấp & Kho từ Odoo" location="bottom">
              <template #activator="{ props: tipProps }">
                <v-btn
                  v-bind="tipProps"
                  variant="tonal"
                  size="small"
                  color="white"
                  :loading="loadingOdooData"
                  @click="loadOdooData"
                  prepend-icon="lucide-refresh-cw"
                  class="text-none font-weight-medium"
                >
                  Đồng bộ Odoo
                </v-btn>
              </template>
            </v-tooltip>
            <v-btn icon="lucide-x" variant="text" size="small" color="white" @click="dialog = false"></v-btn>
          </div>
        </v-card-title>

        <!-- Body -->
        <v-card-text class="pa-6 overflow-y-auto flex-grow-1">
          <v-form ref="form" v-model="valid">
            <v-row dense>
              <!-- Nhà cung cấp -->
              <v-col cols="12" md="6" class="mb-2">
                <v-autocomplete
                  v-model="selectedVendor"
                  :items="vendorOptions"
                  item-title="name"
                  item-value="id"
                  return-object
                  label="Nhà cung cấp (Odoo Partner) *"
                  placeholder="Chọn hoặc gõ tìm kiếm nhà cung cấp..."
                  variant="outlined"
                  density="comfortable"
                  :loading="loadingVendors || loadingOdooData"
                  no-data-text="Không tìm thấy nhà cung cấp nào trên Odoo"
                  prepend-inner-icon="lucide-building"
                  :rules="[v => !!v || 'Bắt buộc chọn NCC']"
                  clearable
                  @update:search="onVendorSearch"
                >
                  <template #append-inner>
                    <v-tooltip text="Làm mới danh sách NCC" location="top">
                      <template #activator="{ props: tipProps }">
                        <v-btn
                          v-bind="tipProps"
                          icon="lucide-refresh-cw"
                          variant="text"
                          size="x-small"
                          density="compact"
                          class="text-medium-emphasis"
                          :loading="loadingVendors"
                          @click.stop="syncVendors"
                        ></v-btn>
                      </template>
                    </v-tooltip>
                  </template>
                  <template #item="{ props, item }">
                    <v-list-item v-bind="props" :title="(item?.raw || item)?.name || props?.title">
                      <template #subtitle v-if="(item?.raw || item)?.phone || (item?.raw || item)?.email || (item?.raw || item)?.id">
                        <div class="d-flex align-center gap-2 text-caption text-grey">
                          <span v-if="(item?.raw || item)?.phone"><v-icon size="12" class="mr-0.5">lucide-phone</v-icon>{{ (item?.raw || item)?.phone }}</span>
                          <span v-if="(item?.raw || item)?.email"><v-icon size="12" class="mr-0.5">lucide-mail</v-icon>{{ (item?.raw || item)?.email }}</span>
                          <span class="text-primary font-weight-medium">#ID: {{ (item?.raw || item)?.id }}</span>
                        </div>
                      </template>
                    </v-list-item>
                  </template>
                </v-autocomplete>
              </v-col>

              <!-- Địa điểm giao đến -->
              <v-col cols="12" md="6" class="mb-2">
                <v-autocomplete
                  v-model="selectedLocation"
                  :items="locationOptions"
                  item-title="display_name"
                  item-value="id"
                  return-object
                  label="Địa điểm giao đến (Kho nhận) *"
                  placeholder="Chọn kho / địa điểm nhận từ Odoo..."
                  variant="outlined"
                  density="comfortable"
                  :loading="loadingLocations || loadingOdooData"
                  no-data-text="Không tìm thấy địa điểm kho nào trên Odoo"
                  prepend-inner-icon="lucide-warehouse"
                  :rules="[v => !!v || 'Bắt buộc chọn địa điểm giao đến']"
                  clearable
                >
                  <template #append-inner>
                    <v-tooltip text="Làm mới danh sách kho" location="top">
                      <template #activator="{ props: tipProps }">
                        <v-btn
                          v-bind="tipProps"
                          icon="lucide-refresh-cw"
                          variant="text"
                          size="x-small"
                          density="compact"
                          class="text-medium-emphasis"
                          :loading="loadingLocations"
                          @click.stop="syncLocations"
                        ></v-btn>
                      </template>
                    </v-tooltip>
                  </template>
                  <template #item="{ props, item }">
                    <v-list-item v-bind="props" :title="(item?.raw || item)?.display_name || props?.title">
                      <template #subtitle v-if="(item?.raw || item)?.warehouse_name || (item?.raw || item)?.dest_location_name">
                        <div class="text-caption text-grey">
                          <span v-if="(item?.raw || item)?.warehouse_name" class="font-weight-medium text-primary">Kho: {{ (item?.raw || item)?.warehouse_name }}</span>
                          <span v-if="(item?.raw || item)?.dest_location_name"> • Đích: {{ (item?.raw || item)?.dest_location_name }}</span>
                        </div>
                      </template>
                    </v-list-item>
                  </template>
                </v-autocomplete>
              </v-col>

              <!-- Hạn đặt hàng -->
              <v-col cols="12" md="6" class="mb-1">
                <v-text-field
                  v-model="txForm.orderDeadline"
                  label="Hạn đặt hàng"
                  type="date"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="lucide-calendar"
                ></v-text-field>
              </v-col>

              <!-- Ngày hàng về dự kiến -->
              <v-col cols="12" md="6" class="mb-1">
                <v-text-field
                  v-model="txForm.expectedDate"
                  label="Ngày hàng về dự kiến"
                  type="date"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="lucide-calendar-clock"
                ></v-text-field>
              </v-col>
            </v-row>

            <v-divider class="my-3"></v-divider>
            
            <!-- Product Lines Header -->
            <div class="d-flex justify-space-between align-center mb-3">
              <div>
                <span class="text-subtitle-1 font-weight-bold text-grey-darken-3">Sản phẩm cần nhập</span>
                <span v-if="txForm.lines.length" class="text-caption text-primary ml-2 font-weight-medium">
                  ({{ txForm.lines.length }} sản phẩm)
                </span>
              </div>
              <v-btn
                size="small"
                color="primary"
                variant="tonal"
                prepend-icon="lucide-plus"
                class="text-none font-weight-medium"
                @click="openPickerForCreate"
              >
                Chọn sản phẩm
              </v-btn>
            </div>

            <!-- Empty Product Lines State -->
            <div v-if="txForm.lines.length === 0" class="text-center py-7 px-4 border border-dashed rounded-xl bg-grey-lighten-5 mb-4">
              <v-avatar size="44" color="primary" variant="tonal" class="mb-2">
                <v-icon size="22" color="primary">lucide-package-plus</v-icon>
              </v-avatar>
              <div class="text-subtitle-2 font-weight-bold text-grey-darken-3 mb-1">
                Chưa có sản phẩm nào trong phiếu nhập
              </div>
              <div class="text-caption text-grey-darken-1 mb-3">
                Nhấn vào nút bên dưới để chọn sản phẩm từ danh mục Directus & Odoo
              </div>
              <v-btn
                color="primary"
                variant="flat"
                size="small"
                prepend-icon="lucide-plus"
                class="text-none font-weight-medium"
                @click="openPickerForCreate"
              >
                Chọn sản phẩm ngay
              </v-btn>
            </div>

            <!-- Product Lines Table List -->
            <div v-else class="border rounded-xl overflow-hidden mb-4 bg-white">
              <div class="d-flex align-center px-4 py-2.5 bg-grey-lighten-4 border-b text-caption font-weight-bold text-grey-darken-2">
                <div style="flex: 2">Sản phẩm</div>
                <div style="width: 130px;" class="text-center">Số lượng</div>
                <div style="width: 140px;" class="text-right">Đơn giá</div>
                <div style="width: 130px;" class="text-right">Thành tiền</div>
                <div style="width: 44px;"></div>
              </div>

              <div
                v-for="(line, idx) in txForm.lines"
                :key="idx"
                class="d-flex align-center px-4 py-3 border-b hover-bg"
              >
                <!-- Cột Sản phẩm -->
                <div style="flex: 2" class="pr-3">
                  <div class="d-flex align-center gap-2.5">
                    <v-avatar size="36" rounded="lg" color="grey-lighten-3" class="flex-shrink-0">
                      <v-img
                        v-if="line.selectedProduct?.imageUrl || line.selectedProduct?.thumbnailUrl"
                        :src="line.selectedProduct.imageUrl || line.selectedProduct.thumbnailUrl"
                        cover
                      ></v-img>
                      <v-icon v-else size="18" color="grey-darken-1">lucide-package</v-icon>
                    </v-avatar>
                    <div class="overflow-hidden">
                      <div class="text-subtitle-2 font-weight-medium text-grey-darken-4 text-truncate">
                        {{ line.selectedProduct?.name }}
                      </div>
                      <div class="d-flex align-center gap-2 text-caption text-grey">
                        <span v-if="line.selectedProduct?.sku" class="font-weight-medium text-primary">
                          SKU: {{ line.selectedProduct.sku }}
                        </span>
                        <span v-if="line.selectedProduct?.odooId || line.selectedProduct?.id">
                          #{{ line.selectedProduct.odooId || line.selectedProduct.id }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Cột Số lượng -->
                <div style="width: 130px;" class="text-center px-2">
                  <div class="d-flex align-center justify-center gap-1">
                    <v-btn
                      icon="lucide-minus"
                      size="x-small"
                      variant="text"
                      density="compact"
                      :disabled="Number(line.quantity) <= 1"
                      @click="decrementLineQty(line)"
                    ></v-btn>
                    <v-text-field
                      v-model.number="line.quantity"
                      type="number"
                      min="1"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="text-center"
                      style="width: 55px;"
                    ></v-text-field>
                    <v-btn
                      icon="lucide-plus"
                      size="x-small"
                      variant="text"
                      density="compact"
                      @click="incrementLineQty(line)"
                    ></v-btn>
                  </div>
                </div>

                <!-- Cột Đơn giá -->
                <div style="width: 140px;" class="text-right px-2">
                  <v-text-field
                    v-model.number="line.priceUnit"
                    type="number"
                    min="0"
                    density="compact"
                    variant="outlined"
                    hide-details
                    suffix="₫"
                    class="text-right"
                  ></v-text-field>
                </div>

                <!-- Cột Thành tiền -->
                <div style="width: 130px;" class="text-right font-weight-bold text-primary px-2">
                  {{ formatCurrency((Number(line.quantity) || 0) * (Number(line.priceUnit) || 0)) }}
                </div>

                <!-- Nút Xóa -->
                <div style="width: 44px;" class="text-right">
                  <v-btn
                    icon="lucide-trash-2"
                    size="small"
                    variant="text"
                    color="error"
                    @click="removeLine(Number(idx))"
                  ></v-btn>
                </div>
              </div>
            </div>

            <!-- Notes -->
            <v-textarea
              v-model="txForm.notes"
              label="Ghi chú đơn hàng"
              variant="outlined"
              rows="2"
              placeholder="Ghi chú kèm theo phiếu nhập hàng (sẽ đồng bộ vào notes của Odoo purchase order)..."
              density="comfortable"
              hide-details
            ></v-textarea>
          </v-form>
        </v-card-text>

        <!-- Sticky Footer -->
        <v-card-actions class="px-6 py-3.5 border-t bg-white d-flex justify-space-between align-center flex-shrink-0">
          <div class="d-flex align-center gap-4 flex-wrap">
            <div class="text-caption text-grey-darken-1">
              Số mặt hàng: <strong class="text-grey-darken-3">{{ txForm.lines.length }}</strong>
            </div>
            <div class="d-flex align-center">
              <span class="text-caption text-grey-darken-1 mr-1.5">Tổng tiền trước thuế:</span>
              <span class="text-h6 font-weight-bold text-primary">{{ formatCurrency(totalAmount) }}</span>
            </div>
          </div>
          <div class="d-flex align-center gap-2">
            <v-btn variant="text" @click="dialog = false" :disabled="submitting" class="text-none px-4">
              Hủy
            </v-btn>
            <v-btn
              color="primary"
              variant="flat"
              @click="submitPO"
              :loading="submitting"
              :disabled="!isFormValid"
              prepend-icon="lucide-check-circle"
              class="text-none px-5 font-weight-bold"
            >
              Tạo phiếu & Đồng bộ Odoo
            </v-btn>
          </div>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Product Picker Dialog (Shared for Create & Edit) -->
    <ProductPickerDialog
      v-model="showProductPicker"
      @select="handleProductPicked"
    />

    <!-- Toast Notification -->
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3500" location="top right">
      {{ snackbar.text }}
      <template #actions>
        <v-btn variant="text" color="white" @click="snackbar.show = false">Đóng</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api';
import { useInventoryStore } from '@/stores/inventory';
import ProductPickerDialog from '@/components/chat/ProductPickerDialog.vue';

const inventoryStore = useInventoryStore();

// State
const loading = ref(false);
const pos = ref<any[]>([]);
const search = ref('');
const dialog = ref(false);
const valid = ref(false);
const form = ref<any>(null);
const submitting = ref(false);

const vendorOptions = ref<any[]>([]);
const locationOptions = ref<any[]>([]);
const selectedVendor = ref<any>(null);
const selectedLocation = ref<any>(null);

const loadingOdooData = ref(false);
const loadingVendors = ref(false);
const loadingLocations = ref(false);

const downloadingId = ref<string | null>(null);
const syncingPOs = ref(false);

const snackbar = ref({
  show: false,
  text: '',
  color: 'success'
});

const txForm = ref({
  orderDeadline: '',
  expectedDate: '',
  notes: '',
  lines: [] as any[]
});

// Detail & Edit Dialog State
const detailDialog = ref(false);
const detailLoading = ref(false);
const savingDetail = ref(false);
const detailSelectedVendor = ref<any>(null);
const detailForm = ref<any>({
  id: '',
  odooPurchaseId: null,
  vendorId: null,
  vendorName: '',
  deliverTo: '',
  orderDeadline: '',
  expectedDate: '',
  state: 'draft',
  notes: '',
  createdBy: null,
  lines: [] as any[]
});

// Product Picker routing
const showProductPicker = ref(false);
const pickerTarget = ref<'create' | 'edit'>('create');

const stateOptions = [
  { label: 'Bản nháp (draft)', value: 'draft' },
  { label: 'Đã gửi (sent)', value: 'sent' },
  { label: 'Đơn mua hàng (purchase)', value: 'purchase' },
  { label: 'Hoàn thành (done)', value: 'done' },
  { label: 'Đã hủy (cancel)', value: 'cancel' }
];

function getPurchaseOrderSortNumber(po: any): number {
  const rawCode = po?.purchaseCode || (po?.odooPurchaseId ? `PO${String(po.odooPurchaseId).padStart(5, '0')}` : '');
  const match = String(rawCode || '').match(/(\d+)/g);
  if (match && match.length > 0) {
    const last = Number(match[match.length - 1]);
    if (Number.isFinite(last)) return last;
  }
  const fallback = Number(po?.odooPurchaseId || 0);
  return Number.isFinite(fallback) ? fallback : 0;
}

function comparePurchaseOrderCodes(a: any, b: any) {
  const aCode = getPurchaseOrderSortNumber(a);
  const bCode = getPurchaseOrderSortNumber(b);
  if (bCode !== aCode) return bCode - aCode;
  return String(b?.purchaseCode || b?.odooPurchaseId || b?.id || '').localeCompare(String(a?.purchaseCode || a?.odooPurchaseId || a?.id || ''));
}

// Computed
const filteredPos = computed(() => {
  const source = [...(pos.value || [])].sort(comparePurchaseOrderCodes);
  if (!search.value) return source;
  const q = search.value.toLowerCase().trim();
  return source.filter(p => 
    (p.vendorName && p.vendorName.toLowerCase().includes(q)) || 
    (p.deliverTo && p.deliverTo.toLowerCase().includes(q)) ||
    (p.odooPurchaseId && String(p.odooPurchaseId).includes(q)) ||
    (p.id && p.id.toLowerCase().includes(q)) ||
    (p.purchaseCode && p.purchaseCode.toLowerCase().includes(q))
  );
});

const locationOptionNames = computed(() => {
  return locationOptions.value.map(l => l.display_name || l.name);
});

const isFormValid = computed(() => {
  if (!selectedVendor.value || !selectedLocation.value) return false;
  if (!txForm.value.lines || txForm.value.lines.length === 0) return false;
  for (const line of txForm.value.lines) {
    if (!line.selectedProduct || line.quantity <= 0) return false;
  }
  return true;
});

const totalAmount = computed<number>(() => {
  return txForm.value.lines.reduce((sum: number, line: any) => sum + ((Number(line.quantity) || 0) * (Number(line.priceUnit) || 0)), 0);
});

const detailTotalQty = computed<number>(() => {
  return (detailForm.value.lines || []).reduce((sum: number, l: any) => sum + (Number(l.quantity) || 0), 0);
});

const detailTotalAmount = computed<number>(() => {
  return (detailForm.value.lines || []).reduce((sum: number, l: any) => sum + ((Number(l.quantity) || 0) * (Number(l.priceUnit) || 0)), 0);
});

// Helper functions
function getPoCode(po: any) {
  if (!po) return '';
  if (po.odooPurchaseId) return 'PO' + String(po.odooPurchaseId).padStart(5, '0');
  if (po.id) return 'PO-' + po.id.slice(0, 6).toUpperCase();
  return 'PO';
}

function formatDate(dateStr: any) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN');
}

function formatCurrency(val: any): string {
  const num = typeof val === 'number' ? val : Number(val) || 0;
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
}

function getStateLabel(state: string) {
  switch (state) {
    case 'draft': return 'Bản nháp';
    case 'sent': return 'Đã gửi';
    case 'purchase': return 'Đơn mua hàng';
    case 'done': return 'Hoàn tất';
    case 'cancel': return 'Đã hủy';
    default: return state || 'Bản nháp';
  }
}

function getStateColor(state: string) {
  switch (state) {
    case 'done': return 'success';
    case 'draft': return 'warning';
    case 'purchase': return 'primary';
    case 'sent': return 'info';
    case 'cancel': return 'grey';
    default: return 'primary';
  }
}

function incrementLineQty(line: any) {
  line.quantity = (Number(line.quantity) || 0) + 1;
}

function decrementLineQty(line: any) {
  line.quantity = Math.max(1, (Number(line.quantity) || 1) - 1);
}

// Picker trigger functions
function openPickerForCreate() {
  pickerTarget.value = 'create';
  showProductPicker.value = true;
}

function openPickerForEdit() {
  pickerTarget.value = 'edit';
  showProductPicker.value = true;
}

function handleProductPicked(product: any, qty: number) {
  if (pickerTarget.value === 'edit') {
    onEditProductPicked(product, qty);
  } else {
    onCreateProductPicked(product, qty);
  }
}

function onCreateProductPicked(product: any, qty: number) {
  const existing = txForm.value.lines.find(l => 
    (l.selectedProduct?.id && l.selectedProduct.id === product.id) || 
    (l.selectedProduct?.odooId && l.selectedProduct.odooId === product.id)
  );
  const unitPrice = product.priceUnit || product.list_price || product.listPrice || product.retail_price || 0;

  if (existing) {
    existing.quantity += (qty || 1);
  } else {
    txForm.value.lines.push({
      selectedProduct: product,
      quantity: qty || 1,
      priceUnit: unitPrice
    });
  }
}

function onEditProductPicked(product: any, qty: number) {
  const pId = product.odooId || product.id;
  const existing = (detailForm.value.lines || []).find((l: any) => l.productId === pId);
  const unitPrice = product.priceUnit || product.list_price || product.listPrice || product.retail_price || 0;

  if (existing) {
    existing.quantity = (Number(existing.quantity) || 0) + (qty || 1);
  } else {
    detailForm.value.lines.push({
      productId: pId,
      productName: product.name,
      quantity: qty || 1,
      priceUnit: unitPrice,
      priceSubtotal: (qty || 1) * unitPrice
    });
  }
}

function removeLine(index: number | string) {
  txForm.value.lines.splice(Number(index), 1);
}

function removeDetailLine(index: number | string) {
  detailForm.value.lines.splice(Number(index), 1);
}

// Open Detail & Edit Dialog
async function openDetailDialog(po: any) {
  detailDialog.value = true;
  detailLoading.value = true;
  try {
    const res = await api.get(`/inventory/purchase/${po.id}`);
    const data = res.data?.data || po;

    detailForm.value = {
      id: data.id,
      odooPurchaseId: data.odooPurchaseId,
      vendorId: data.vendorId,
      vendorName: data.vendorName,
      deliverTo: data.deliverTo || '',
      orderDeadline: data.orderDeadline ? data.orderDeadline.split('T')[0] : '',
      expectedDate: data.expectedDate ? data.expectedDate.split('T')[0] : '',
      state: data.state || 'draft',
      notes: data.notes || '',
      createdBy: data.createdBy,
      lines: (data.lines || []).map((l: any) => ({
        id: l.id,
        productId: l.productId,
        productName: l.productName,
        quantity: l.quantity,
        priceUnit: l.priceUnit,
        priceSubtotal: l.priceSubtotal
      }))
    };

    // Match vendor in options
    detailSelectedVendor.value = vendorOptions.value.find(v => v.id === data.vendorId) || {
      id: data.vendorId,
      name: data.vendorName
    };
  } catch (error: any) {
    console.error('Lỗi khi tải chi tiết phiếu nhập:', error);
    snackbar.value = {
      show: true,
      text: error.response?.data?.error || 'Không thể tải chi tiết phiếu nhập',
      color: 'error'
    };
  } finally {
    detailLoading.value = false;
  }
}

// Save Detail Changes
async function saveDetailChanges() {
  if (!detailForm.value.lines || detailForm.value.lines.length === 0) {
    snackbar.value = {
      show: true,
      text: 'Phiếu nhập phải có ít nhất 1 sản phẩm!',
      color: 'warning'
    };
    return;
  }

  savingDetail.value = true;
  try {
    const vendorId = detailSelectedVendor.value?.id || detailForm.value.vendorId;
    const vendorName = detailSelectedVendor.value?.name || detailForm.value.vendorName;

    const payload = {
      vendorId,
      vendorName,
      deliverTo: detailForm.value.deliverTo,
      orderDeadline: detailForm.value.orderDeadline || null,
      expectedDate: detailForm.value.expectedDate || null,
      state: detailForm.value.state,
      notes: detailForm.value.notes,
      lines: detailForm.value.lines.map((l: any) => ({
        productId: l.productId,
        productName: l.productName,
        quantity: Number(l.quantity) || 1,
        priceUnit: Number(l.priceUnit) || 0
      }))
    };

    await api.put(`/inventory/purchase/${detailForm.value.id}`, payload);
    snackbar.value = {
      show: true,
      text: 'Cập nhật phiếu nhập hàng thành công!',
      color: 'success'
    };
    detailDialog.value = false;
    await loadPOs();
  } catch (error: any) {
    console.error('Lỗi khi lưu phiếu nhập:', error);
    snackbar.value = {
      show: true,
      text: error.response?.data?.error || 'Lỗi khi cập nhật phiếu nhập hàng',
      color: 'error'
    };
  } finally {
    savingDetail.value = false;
  }
}

// Open Create Dialog
function openCreateDialog() {
  dialog.value = true;
  txForm.value.lines = [];
  setTimeout(() => {
    form.value?.resetValidation?.();
  }, 50);
  if (vendorOptions.value.length === 0 || locationOptions.value.length === 0) {
    loadOdooData();
  }
}

// Load PO list
async function loadPOs() {
  loading.value = true;
  try {
    const res = await api.get('/inventory/purchase');
    pos.value = [...(res.data?.data || [])].sort(comparePurchaseOrderCodes);
  } catch (error: any) {
    console.error('Lỗi khi tải danh sách PO:', error);
    snackbar.value = {
      show: true,
      text: error.response?.data?.error || 'Lỗi khi tải danh sách phiếu nhập hàng',
      color: 'error'
    };
  } finally {
    loading.value = false;
  }
}

// Sync Vendors
async function syncVendors() {
  loadingVendors.value = true;
  try {
    const res = await api.get('/odoo/vendors');
    vendorOptions.value = res.data?.vendors || [];
    snackbar.value = {
      show: true,
      text: `Đã đồng bộ ${vendorOptions.value.length} nhà cung cấp từ Odoo!`,
      color: 'success'
    };
  } catch (e: any) {
    console.error('Failed to sync vendors from Odoo', e);
    snackbar.value = {
      show: true,
      text: e.response?.data?.error || 'Không thể đồng bộ nhà cung cấp từ Odoo',
      color: 'error'
    };
  } finally {
    loadingVendors.value = false;
  }
}

// Sync Purchase Orders from Odoo
async function syncPOsFromOdoo() {
  syncingPOs.value = true;
  try {
    const res = await api.post('/inventory/purchase/sync');
    snackbar.value = {
      show: true,
      text: res.data?.message || 'Đồng bộ phiếu nhập từ Odoo thành công!',
      color: 'success'
    };
    await loadPOs();
  } catch (err: any) {
    console.error('Failed to sync POs from Odoo:', err);
    snackbar.value = {
      show: true,
      text: err.response?.data?.error || 'Không thể đồng bộ phiếu nhập từ Odoo',
      color: 'error'
    };
  } finally {
    syncingPOs.value = false;
  }
}

// Dynamic Remote Search for Vendors
let vendorSearchTimeout: any = null;
async function onVendorSearch(query: string) {
  if (!query || query.trim().length < 2) return;
  clearTimeout(vendorSearchTimeout);
  vendorSearchTimeout = setTimeout(async () => {
    loadingVendors.value = true;
    try {
      const res = await api.get(`/odoo/vendors?query=${encodeURIComponent(query.trim())}`);
      const newVendors = res.data?.vendors || [];
      const existingIds = new Set(vendorOptions.value.map(v => v.id));
      for (const nv of newVendors) {
        if (!existingIds.has(nv.id)) {
          vendorOptions.value.push(nv);
          existingIds.add(nv.id);
        }
      }
    } catch (e) {
      console.warn('Failed to search vendors dynamically:', e);
    } finally {
      loadingVendors.value = false;
    }
  }, 350);
}

// Sync Locations
async function syncLocations() {
  loadingLocations.value = true;
  try {
    const res = await api.get('/odoo/locations');
    locationOptions.value = res.data?.locations || [];
    snackbar.value = {
      show: true,
      text: `Đã đồng bộ ${locationOptions.value.length} địa điểm kho từ Odoo!`,
      color: 'success'
    };
  } catch (e: any) {
    console.error('Failed to sync locations from Odoo', e);
    snackbar.value = {
      show: true,
      text: e.response?.data?.error || 'Không thể đồng bộ địa điểm kho từ Odoo',
      color: 'error'
    };
  } finally {
    loadingLocations.value = false;
  }
}

// Load Odoo Data
async function loadOdooData() {
  loadingOdooData.value = true;
  try {
    const [venRes, locRes] = await Promise.all([
      api.get('/odoo/vendors'),
      api.get('/odoo/locations')
    ]);
    vendorOptions.value = venRes.data?.vendors || [];
    locationOptions.value = locRes.data?.locations || [];
    snackbar.value = {
      show: true,
      text: `Đã đồng bộ Odoo: ${vendorOptions.value.length} NCC, ${locationOptions.value.length} địa điểm kho`,
      color: 'success'
    };
  } catch (e: any) {
    console.error('Failed to load Odoo data', e);
    snackbar.value = {
      show: true,
      text: e.response?.data?.error || 'Lỗi khi tải dữ liệu từ Odoo',
      color: 'error'
    };
  } finally {
    loadingOdooData.value = false;
  }
}

// Submit New PO
async function submitPO() {
  if (!isFormValid.value) return;
  submitting.value = true;
  try {
    const payload = {
      vendorId: selectedVendor.value.id,
      vendorName: selectedVendor.value.name,
      locationId: selectedLocation.value?.id,
      deliverTo: selectedLocation.value?.display_name || selectedLocation.value?.name,
      orderDeadline: txForm.value.orderDeadline || undefined,
      expectedDate: txForm.value.expectedDate || undefined,
      notes: txForm.value.notes,
      lines: txForm.value.lines.map(l => ({
        productId: l.selectedProduct.id || l.selectedProduct.odooId,
        productName: l.selectedProduct.name,
        quantity: l.quantity,
        priceUnit: l.priceUnit
      }))
    };

    const res = await api.post('/inventory/purchase', payload);
    dialog.value = false;
    
    selectedVendor.value = null;
    selectedLocation.value = null;
    txForm.value = {
      orderDeadline: '',
      expectedDate: '',
      notes: '',
      lines: []
    };
    
    snackbar.value = {
      show: true,
      text: res.data?.data?.odooPurchaseId 
        ? `Tạo thành công phiếu PO#${res.data.data.odooPurchaseId} và đồng bộ Odoo!` 
        : 'Tạo phiếu nhập hàng thành công!',
      color: 'success'
    };

    await loadPOs();
  } catch (error: any) {
    snackbar.value = {
      show: true,
      text: error.response?.data?.error || 'Lỗi khi tạo phiếu nhập hàng',
      color: 'error'
    };
  } finally {
    submitting.value = false;
  }
}

// Download PDF
async function downloadPdf(id: string, poCodeStr?: string) {
  if (!id) return;
  downloadingId.value = id;
  try {
    const res = await api.get(`/inventory/purchase/${id}/pdf`, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const name = poCodeStr ? `Phieu_Nhap_${poCodeStr}.pdf` : `PurchaseOrder_${id}.pdf`;
    link.setAttribute('download', name);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);

    snackbar.value = {
      show: true,
      text: 'Tải file PDF thành công!',
      color: 'success'
    };
  } catch (error: any) {
    console.error('Download PDF error:', error);
    snackbar.value = {
      show: true,
      text: error.response?.data?.error || 'Không thể tải PDF. Vui lòng thử lại sau.',
      color: 'error'
    };
  } finally {
    downloadingId.value = null;
  }
}

onMounted(() => {
  loadPOs();
  loadOdooData();
  if (inventoryStore.productList.length === 0) {
    inventoryStore.fetchProductList();
  }
});
</script>

<style scoped>
.border-b { border-bottom: 1px solid rgba(0,0,0,0.08); }
.max-w-400 { max-width: 400px; }
.text-none { text-transform: none; }
.po-row {
  cursor: pointer;
  transition: background-color 0.15s ease-in-out;
}
.po-row:hover {
  background-color: rgba(0, 0, 0, 0.02);
}
.purchase-order-table {
  table-layout: fixed;
}
.purchase-order-table th,
.purchase-order-table td {
  white-space: nowrap;
  vertical-align: middle;
}
.purchase-order-table .vendor-cell,
.purchase-order-table .activity-cell {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.purchase-order-table .purchase-code-cell {
  min-width: 150px;
}
.purchase-detail-dialog {
  background: #0f172a;
}
.purchase-detail-body {
  background: #0f172a;
  color: #f8fafc;
}
:deep(.v-theme--dark) .purchase-detail-dialog,
:deep(.v-theme--dark) .purchase-detail-body {
  background: #0f172a !important;
  color: #f8fafc !important;
}
:deep(.v-theme--dark) .v-card,
:deep(.v-theme--dark) .v-card-text,
:deep(.v-theme--dark) .v-dialog > .v-card {
  background: #0f172a !important;
  color: #f8fafc !important;
}
:deep(.v-theme--dark) .v-sheet,
:deep(.v-theme--dark) .v-card-title,
:deep(.v-theme--dark) .v-card-actions {
  background: #0f172a !important;
  color: #f8fafc !important;
}
</style>
