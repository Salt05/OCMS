const fs = require('fs');
const path1 = 'c:/Users/ADMIN/OneDrive/Project/Work/New folder/OCMS/frontend/src/views/ProductsView.vue';
let content1 = fs.readFileSync(path1, 'utf8');

// Remove the unused vars/functions using regex
content1 = content1.replace(/const historyCols = \[([\s\S]*?)\];/g, '');
content1 = content1.replace(/const historyTotalPages = computed\(\(\) => Math\.ceil\(currentSkuHistory\.value\.length \/ historyLimit\.value\)\);/g, '');
content1 = content1.replace(/const currentSkuStock = computed\(\(\) => \{[\s\S]*?\}\);/g, '');
content1 = content1.replace(/const sortedHistoryRows = computed\(\(\) => \{[\s\S]*?\}\);/g, '');
content1 = content1.replace(/async function loadSkuHistory\(\) \{[\s\S]*?\}\n/g, '');
content1 = content1.replace(/function toggleHistorySort\(col: any\) \{[\s\S]*?\}/g, '');
content1 = content1.replace(/function txTypeLabel\(type: string\) \{[\s\S]*?\}/g, '');
content1 = content1.replace(/function txTypeColor\(type: string\) \{[\s\S]*?\}/g, '');
content1 = content1.replace(/function formatDate\(date: string\) \{[\s\S]*?\}/g, '');

fs.writeFileSync(path1, content1);

const path2 = 'c:/Users/ADMIN/OneDrive/Project/Work/New folder/OCMS/frontend/src/views/inventory/PurchaseOrdersView.vue';
let content2 = fs.readFileSync(path2, 'utf8');
content2 = content2.replace(/const productOptions = computed\(\(\) => inventoryStore\.productList\.map\(p => \(\{[\s\S]*?\}\)\)\);/g, '');
fs.writeFileSync(path2, content2);
console.log('Fixed TS errors');
