<template>
  <div class="mb-3">
    <!-- Top Row: Search input + Square Filter Toggle Button -->
    <div class="d-flex align-center gap-2">
      <v-text-field
        v-model="filters.search"
        density="compact"
        variant="outlined"
        prepend-inner-icon="lucide-search"
        placeholder="Tìm kiếm tên, SĐT, email..."
        clearable
        hide-details
        autocomplete="off"
        name="contact_search_query"
        class="flex-grow-1"
        @update:model-value="emit('search')"
      />

      <!-- Square Filter Toggle Button -->
      <v-btn
        icon
        size="40"
        variant="outlined"
        :color="showFilters || activeFilterCount > 0 ? 'primary' : undefined"
        class="rounded-lg filter-square-btn"
        title="Bộ lọc nâng cao"
        @click="showFilters = !showFilters"
      >
        <v-badge v-if="activeFilterCount > 0" :content="activeFilterCount" color="error" offset-x="-2" offset-y="-2">
          <v-icon size="18">lucide-sliders-horizontal</v-icon>
        </v-badge>
        <v-icon v-else size="18">lucide-sliders-horizontal</v-icon>
      </v-btn>

      <!-- Clear Filter Button (Shown when filters active) -->
      <v-btn
        v-if="hasAnyFilter"
        icon
        size="40"
        variant="text"
        color="error"
        title="Đặt lại bộ lọc"
        @click="resetFilters"
      >
        <v-icon size="18">lucide-filter-x</v-icon>
      </v-btn>
    </div>

    <!-- Expandable Filter Section: Trạng thái, Loại tài khoản, Tags, Tài khoản Zalo (Hidden by default) -->
    <v-expand-transition>
      <div v-if="showFilters" class="mt-2.5 pa-3 bg-surface-variant rounded-lg border">
        <v-row dense class="align-center">
          <!-- Status filter -->
          <v-col cols="12" sm="6" :md="isAdmin ? 4 : 3" :lg="isAdmin ? 2 : 3">
            <v-select
              v-model="filters.status"
              :items="statusOptions"
              item-title="text"
              item-value="value"
              density="compact"
              variant="outlined"
              label="Trạng thái"
              clearable
              hide-details
              @update:model-value="emit('search')"
            />
          </v-col>

          <!-- Type filter -->
          <v-col cols="12" sm="6" :md="isAdmin ? 4 : 3" :lg="isAdmin ? 2 : 3">
            <v-select
              v-model="filters.contactType"
              :items="typeOptions"
              item-title="text"
              item-value="value"
              density="compact"
              variant="outlined"
              label="Loại tài khoản"
              clearable
              hide-details
              @update:model-value="emit('search')"
            />
          </v-col>

          <!-- Tags filter -->
          <v-col cols="12" sm="6" :md="isAdmin ? 4 : 3" :lg="isAdmin ? 3 : 3">
            <v-autocomplete
              v-model="filters.tags"
              :items="tagItems"
              item-title="name"
              item-value="name"
              density="compact"
              variant="outlined"
              label="Tags / Nhãn"
              multiple
              chips
              closable-chips
              clearable
              hide-details
              autocomplete="off"
              name="filter-tags-no-autofill"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              @update:model-value="emit('search')"
            >
              <template #chip="{ props, item }">
                <v-chip v-bind="props" :color="((item as any).raw || item as any).color" size="x-small" variant="tonal">
                  {{ ((item as any).raw || item as any).name }}
                </v-chip>
              </template>
              <template #item="{ props, item }">
                <v-list-item v-bind="props">
                  <template #prepend>
                    <v-icon :color="((item as any).raw || item as any).color" size="small" class="mr-2">lucide-circle</v-icon>
                  </template>
                </v-list-item>
              </template>
            </v-autocomplete>
          </v-col>

          <!-- Zalo Account filter -->
          <v-col cols="12" sm="6" :md="isAdmin ? 6 : 3" :lg="isAdmin ? 2 : 3">
            <v-select
              v-model="filters.zaloAccountId"
              :items="accountOptions"
              item-title="text"
              item-value="value"
              label="Tất cả Zalo"
              density="compact"
              variant="outlined"
              clearable
              hide-details
              @update:model-value="emit('search')"
            />
          </v-col>

          <!-- Sale filter (Admin only) -->
          <v-col v-if="isAdmin" cols="12" sm="6" md="6" lg="3">
            <v-autocomplete
              v-model="filters.assignedUserId"
              :items="userItems"
              item-title="fullName"
              item-value="id"
              label="Nhân viên sale"
              density="compact"
              variant="outlined"
              clearable
              hide-details
              autocomplete="off"
              @update:model-value="emit('search')"
            >
              <template #item="{ props, item }">
                <v-list-item v-bind="props">
                  <template #title>
                    {{ ((item as any).raw || item as any).fullName }}
                  </template>
                  <template #subtitle v-if="((item as any).raw || item as any).id !== 'unassigned'">
                    <span v-if="((item as any).raw || item as any).odooName">
                      Odoo: {{ ((item as any).raw || item as any).odooName }}
                    </span>
                    <span v-else-if="((item as any).raw || item as any).email">
                      {{ ((item as any).raw || item as any).email }}
                    </span>
                  </template>
                </v-list-item>
              </template>
            </v-autocomplete>
          </v-col>
        </v-row>
      </div>
    </v-expand-transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { ContactFilters } from '@/composables/use-contacts';
import { STATUS_OPTIONS, CONTACT_TYPE_OPTIONS } from '@/composables/use-contacts';
import { useTags } from '@/composables/use-tags';
import { useZaloAccounts } from '@/composables/use-zalo-accounts';
import { useAuthStore } from '@/stores/auth';
import { useUsers } from '@/composables/use-users';

const props = defineProps<{ filters: ContactFilters }>();
const emit = defineEmits<{ search: [] }>();

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.isAdmin);

const showFilters = ref(false);

const statusOptions = STATUS_OPTIONS;
const typeOptions = CONTACT_TYPE_OPTIONS;

const { tags, fetchTags } = useTags();
const tagItems = computed(() => {
  const seen = new Set<string>();
  const list: any[] = [];
  for (const t of tags.value) {
    const key = (t.name || '').trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      list.push(t);
    }
  }
  return list;
});

const { accounts, fetchAccounts } = useZaloAccounts();
const accountOptions = computed(() => {
  return accounts.value.map((a: any) => ({
    text: a.displayName || a.phone || a.zaloUid || 'Tài khoản Zalo',
    value: a.id,
  }));
});

const { users, fetchUsers } = useUsers();
const userItems = computed(() => {
  return [
    { id: 'unassigned', fullName: 'Chưa phân công', email: '', odooName: '' },
    ...users.value.map((u) => ({
      id: u.id,
      fullName: u.fullName || u.email,
      email: u.email,
      odooName: u.odooName || '',
    })),
  ];
});

const activeFilterCount = computed(() => {
  let count = 0;
  if (props.filters.status) count++;
  if (props.filters.contactType) count++;
  if (props.filters.zaloAccountId) count++;
  if (props.filters.assignedUserId) count++;
  if (props.filters.tags && props.filters.tags.length > 0) count++;
  return count;
});

const hasAnyFilter = computed(() => {
  return !!(
    (props.filters.search && props.filters.search.trim()) ||
    activeFilterCount.value > 0
  );
});

function resetFilters() {
  props.filters.search = '';
  props.filters.status = '';
  props.filters.contactType = '';
  props.filters.zaloAccountId = '';
  props.filters.assignedUserId = '';
  props.filters.tags = [];
  emit('search');
}

onMounted(() => {
  fetchTags();
  fetchAccounts();
  if (isAdmin.value) {
    fetchUsers();
  }
  if (props.filters.assignedUserId) {
    showFilters.value = true;
  }
});

watch(isAdmin, (admin) => {
  if (admin && users.value.length === 0) {
    fetchUsers();
  }
});
</script>

<style scoped>
.filter-square-btn {
  width: 40px !important;
  height: 40px !important;
  min-width: 40px !important;
  border-radius: 8px !important;
}
</style>
