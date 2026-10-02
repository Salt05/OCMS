const fs = require('fs');
const file = 'c:/Users/ADMIN/OneDrive/Project/Work/New folder/OCMS/frontend/src/views/ProductsView.vue';
let content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');
lines.splice(340, 320, `    <ProductDetailModal
      v-model="detailModalVisible"
      :product="detailItem"
      show-inventory-history
    >
      <template #edit-fields>
        <div class="detail-item border rounded-lg pa-3 bg-surface shadow-xs mb-3">
          <div class="text-subtitle-2 font-weight-bold text-primary mb-2">Ngành hàng (Category)</div>
          <v-combobox v-model="editForm.category" :items="suggestedCategories" placeholder="Chọn hoặc nhập ngành hàng..." variant="outlined" density="compact" hide-details clearable />
        </div>
        <div class="detail-item border rounded-lg pa-3 bg-surface shadow-xs mb-3">
          <div class="text-subtitle-2 font-weight-bold text-success mb-2">Thương hiệu (Brand)</div>
          <v-combobox v-model="editForm.brand" :items="suggestedBrands" placeholder="Chọn hoặc nhập thương hiệu..." variant="outlined" density="compact" hide-details clearable />
        </div>
      </template>
      <template #actions>
        <v-card-actions class="pa-3 border-t bg-surface-variant d-flex justify-space-between flex-shrink-0">
          <v-btn variant="text" rounded="lg" @click="detailModalVisible = false">Đóng</v-btn>
          <v-btn color="primary" variant="flat" rounded="lg" class="font-weight-bold px-5" prepend-icon="lucide-save" :loading="saving" @click="saveSingleProduct">Lưu phân loại</v-btn>
        </v-card-actions>
      </template>
    </ProductDetailModal>`);
fs.writeFileSync(file, lines.join('\n'));
console.log('Replaced successfully');
