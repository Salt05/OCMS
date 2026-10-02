const fs = require('fs');
const file = 'c:/Users/ADMIN/OneDrive/Project/Work/New folder/OCMS/frontend/src/views/inventory/PurchaseOrdersView.vue';
let content = fs.readFileSync(file, 'utf8');

// 1. Replace the top row containing vendor autocomplete and partnerRef
const oldVendorRow = `              <v-col cols="12" md="6">
                <!-- Autocomplete for Vendor (using Odoo Customers/Partners) -->
                <v-autocomplete
                  v-model="selectedVendor"
                  :items="vendorOptions"
                  item-title="name"
                  item-value="id"
                  return-object
                  label="Nhà cung cấp *"
                  variant="outlined"
                  :loading="searchingVendor"
                  @update:search="searchVendor"
                  placeholder="Gõ để tìm NCC từ Odoo..."
                  no-data-text="Không tìm thấy nhà cung cấp"
                  prepend-inner-icon="lucide-building"
                  :rules="[v => !!v || 'Bắt buộc chọn NCC']"
                  hide-no-data
                ></v-autocomplete>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="txForm.partnerRef"
                  label="Mã nhà cung cấp (Tham chiếu)"
                  variant="outlined"
                ></v-text-field>
              </v-col>`;

const newVendorRow = `              <v-col cols="12" md="6">
                <v-autocomplete
                  v-model="selectedVendor"
                  :items="vendorOptions"
                  item-title="name"
                  item-value="id"
                  return-object
                  label="Nhà cung cấp *"
                  variant="outlined"
                  :loading="loadingOdooData"
                  placeholder="Chọn nhà cung cấp từ Odoo..."
                  no-data-text="Không có nhà cung cấp"
                  prepend-inner-icon="lucide-building"
                  :rules="[v => !!v || 'Bắt buộc chọn NCC']"
                ></v-autocomplete>
              </v-col>
              <v-col cols="12" md="6">
                <v-autocomplete
                  v-model="txForm.destinationLocation"
                  :items="locationOptions"
                  item-title="display_name"
                  item-value="id"
                  label="Địa điểm giao đến *"
                  variant="outlined"
                  :loading="loadingOdooData"
                  placeholder="Chọn địa điểm kho từ Odoo..."
                  no-data-text="Không có địa điểm kho"
                  prepend-inner-icon="lucide-map-pin"
                  :rules="[v => !!v || 'Bắt buộc chọn địa điểm']"
                ></v-autocomplete>
              </v-col>`;
content = content.replace(oldVendorRow, newVendorRow);

// 2. Remove partnerRef from txForm and add destinationLocation
content = content.replace(/partnerRef: '',/, `destinationLocation: null as number | null,`);
content = content.replace(/partnerRef: txForm\.value\.partnerRef,/, `locationId: txForm.value.destinationLocation,`); // We might need to map this in backend later or just keep it in notes for now, or just pass it in payload.

// 3. Update the script setup variables
content = content.replace(/const vendorOptions = ref<any\[\]>\(\[\]\);\nconst selectedVendor = ref<any>\(null\);\nlet searchTimeout: any = null;\nconst searchingVendor = ref\(false\);/, `const vendorOptions = ref<any[]>([]);
const locationOptions = ref<any[]>([]);
const selectedVendor = ref<any>(null);
const loadingOdooData = ref(false);`);

// 4. Replace searchVendor with loadOdooData
const oldSearchVendorRegex = /async function searchVendor\(val: string\) \{[\s\S]*?\}/;
const newLoadOdooData = `async function loadOdooData() {
  loadingOdooData.value = true;
  try {
    const [venRes, locRes] = await Promise.all([
      api.get('/api/v1/odoo/vendors'),
      api.get('/api/v1/odoo/locations')
    ]);
    vendorOptions.value = venRes.data?.vendors || [];
    locationOptions.value = locRes.data?.locations || [];
  } catch (e) {
    console.error('Failed to load Odoo data', e);
  } finally {
    loadingOdooData.value = false;
  }
}
onMounted(() => {
  loadOdooData();
});`;
content = content.replace(oldSearchVendorRegex, newLoadOdooData);

fs.writeFileSync(file, content);
console.log('Modified PurchaseOrdersView.vue');
