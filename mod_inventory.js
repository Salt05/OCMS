const fs = require('fs');
const file = 'c:/Users/ADMIN/OneDrive/Project/Work/New folder/OCMS/frontend/src/views/inventory/InventoryDashboardView.vue';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove the top buttons and stats (Lines 5 to 49)
content = content.replace(/<div class="d-flex gap-3">[\s\S]*?<\/v-row>/, '');

// 2. Add category filter next to statusFilter
const searchHtml = `<v-col cols="12" md="3">
            <v-select
              v-model="categoryFilter"
              :items="['Tất cả ngành hàng', ...inventoryStore.categories]"
              label="Ngành hàng"
              variant="outlined"
              density="compact"
              hide-details
              @update:modelValue="loadItems"
            ></v-select>
          </v-col>`;
content = content.replace(/<v-col cols="12" md="4">/, searchHtml + '\n          <v-col cols="12" md="4">');

// 3. Increase text size and add click event
content = content.replace(/<tr v-else v-for="item in items" :key="item.id" class="align-middle">/, '<tr v-else v-for="item in items" :key="item.id" class="align-middle text-body-1 cursor-pointer" @click="openDetail(item)" hover>');

// 4. Add ProductDetailModal at the end of template
const modalHtml = `    <!-- Detail Modal -->
    <ProductDetailModal
      v-model="detailModalVisible"
      :product="detailItem"
      show-inventory-history
    />
  </div>`;
content = content.replace(/<\/div>\n<\/template>/, modalHtml + '\n</template>');

// 5. Add script imports and vars
content = content.replace(/import \{ useInventoryStore \} from '@\/stores\/inventory';/, `import { useInventoryStore } from '@/stores/inventory';\nimport ProductDetailModal from '@/components/common/ProductDetailModal.vue';`);

content = content.replace(/const statusFilter = ref\(''\);/, `const statusFilter = ref('');\nconst categoryFilter = ref('Tất cả ngành hàng');\nconst detailModalVisible = ref(false);\nconst detailItem = ref<any>(null);\n\nfunction openDetail(item: any) {\n  detailItem.value = {\n    ...item,\n    name: item.productName\n  };\n  detailModalVisible.value = true;\n  // How to default to history tab? The modal doesn't support a prop for default tab yet.\n  // We will pass a ref to it later.\n}`);

// Add category to fetchItems payload
content = content.replace(/status: statusFilter\.value,/, `status: statusFilter.value,\n    category: categoryFilter.value === 'Tất cả ngành hàng' ? '' : categoryFilter.value,`);

fs.writeFileSync(file, content);
console.log('Modified InventoryDashboardView.vue');
