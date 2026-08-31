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

    <!-- Expandable Filter Section: Trạng thái, Loại tài khoản, Tags (Hidden by default) -->
    <v-expand-transition>
      <div v-if="showFilters" class="mt-2.5 pa-3 bg-surface-variant rounded-lg border">
        <v-row dense class="align-center">
          <!-- Status filter -->
          <v-col cols="12" sm="6" md="3">
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
          <v-col cols="12" sm="6" md="3">
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
          <v-col cols="12" sm="6" md="3">
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
                  <v-list-item-title>{{ ((item as any).raw || item as any).name }}</v-list-item-title>
                </v-list-item>
              </template>
            </v-autocomplete>
          </v-col>

          <!-- User filter (Admin only) -->
          <v-col cols="12" sm="6" md="3" v-if="isAdmin">
            <v-autocomplete
              v-model="filters.assignedUserId"
              :items="userItems"
              item-title="fullName"
              item-value="id"
              density="compact"
              variant="outlined"
              label="Sale phụ trách"
              clearable
              hide-details
              @update:model-value="emit('search')"
            >
              <template #item="{ props, item }">
                <v-list-item v-bind="props" :title="((item as any).raw || item as any).fullName" :subtitle="((item as any).raw || item as any).email" />
              </template>
            </v-autocomplete>
          </v-col>
        </v-row>
      </div>
    </v-expand-transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { ContactFilters } from '@/composables/use-contacts';
import { STATUS_OPTIONS, CONTACT_TYPE_OPTIONS } from '@/composables/use-contacts';
import { useTags } from '@/composables/use-tags';
import { useAuthStore } from '@/stores/auth';
import { useUsers } from '@/composables/use-users';

const props = defineProps<{ filters: ContactFilters }>();
const emit = defineEmits<{ search: [] }>();

const showFilters = ref(false);

const statusOptions = STATUS_OPTIONS;
const typeOptions = CONTACT_TYPE_OPTIONS;

const { tags, fetchTags } = useTags();
const tagItems = computed(() => tags.value);

const authStore = useAuthStore();
const isAdmin = computed(() => ['owner', 'admin'].includes(authStore.user?.role || ''));

const { users, fetchUsers } = useUsers();
const userItems = computed(() => {
  return [{ id: 'unassigned', fullName: 'Chưa phân công', email: '' }, ...users.value];
});

const activeFilterCount = computed(() => {
  let count = 0;
  if (props.filters.status) count++;
  if (props.filters.contactType) count++;
  if (props.filters.tags && props.filters.tags.length > 0) count++;
  if (props.filters.assignedUserId) count++;
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
  props.filters.tags = [];
  props.filters.assignedUserId = '';
  emit('search');
}

onMounted(() => {
  fetchTags();
  if (isAdmin.value) {
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
