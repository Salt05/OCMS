x<template>
  <v-row dense class="mb-2 align-center">
    <!-- Search -->
    <v-col cols="12" md="3" sm="6">
      <v-text-field
        v-model="filters.search"
        prepend-inner-icon="lucide-search"
        label="Tìm kiếm tên / SĐT / email"
        clearable
        hide-details
        @update:model-value="emit('search')"
      />
    </v-col>

    <!-- Status filter -->
    <v-col cols="12" md="3" sm="6">
      <v-select
        v-model="filters.status"
        :items="statusOptions"
        item-title="text"
        item-value="value"
        label="Trạng thái"
        clearable
        hide-details
        @update:model-value="emit('search')"
      />
    </v-col>

    <!-- Type filter -->
    <v-col cols="12" md="3" sm="6">
      <v-select
        v-model="filters.contactType"
        :items="typeOptions"
        item-title="text"
        item-value="value"
        label="Loại tài khoản"
        clearable
        hide-details
        @update:model-value="emit('search')"
      />
    </v-col>

    <!-- Tags filter -->
    <v-col cols="12" md="3" sm="6">
      <v-autocomplete
        v-model="filters.tags"
        :items="tagItems"
        item-title="name"
        item-value="name"
        label="Tags"
        multiple
        chips
        closable-chips
        clearable
        hide-details
        @update:model-value="emit('search')"
      >
        <template #chip="{ props, item }">
          <v-chip v-bind="props" :color="(item as any).raw.color" size="small" variant="tonal">
            {{ (item as any).raw.name }}
          </v-chip>
        </template>
        <template #item="{ props, item }">
          <v-list-item v-bind="props">
            <template #prepend>
              <v-icon :color="(item as any).raw.color" size="small" class="mr-2">lucide-circle</v-icon>
            </template>
            <v-list-item-title>{{ (item as any).raw.name }}</v-list-item-title>
          </v-list-item>
        </template>
      </v-autocomplete>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import type { ContactFilters } from '@/composables/use-contacts';
import { STATUS_OPTIONS, CONTACT_TYPE_OPTIONS } from '@/composables/use-contacts';
import { useTags } from '@/composables/use-tags';

defineProps<{ filters: ContactFilters }>();
const emit = defineEmits<{ search: [] }>();

const statusOptions = STATUS_OPTIONS;
const typeOptions = CONTACT_TYPE_OPTIONS;

const { tags, fetchTags } = useTags();

const tagItems = computed(() => tags.value);

onMounted(() => {
  fetchTags();
});
</script>
