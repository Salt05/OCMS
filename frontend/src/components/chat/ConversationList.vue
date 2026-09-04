<template>
  <div class="conversation-list d-flex flex-column" style="width: 100%; border-right: 1px solid var(--v-border-color, rgba(128,128,128,0.15)); height: 100%;">
    <!-- 1. Zalo PC Top Header: Search Box with Search Button -->
    <div class="zalo-conv-header px-3 pt-3 pb-2 d-flex align-center gap-2">
      <div class="zalo-search-box flex-grow-1 d-flex align-center px-2.5 py-1 rounded-lg border bg-surface">
        <input
          type="text"
          :value="search"
          @input="onSearchInput(($event.target as HTMLInputElement).value)"
          @keydown.enter="handleSearchTrigger"
          placeholder="Tìm kiếm hoặc nhập SĐT..."
          class="zalo-search-input flex-grow-1"
        />
        <button
          type="button"
          class="zalo-search-action-btn d-flex align-center justify-center pa-1 cursor-pointer"
          :class="search ? 'text-primary' : 'text-grey'"
          title="Tìm kiếm trên Zalo (Enter)"
          @click="handleSearchTrigger"
        >
          <v-icon size="16">lucide-search</v-icon>
        </button>
      </div>
    </div>

    <!-- Loading State when searching Zalo by phone -->
    <div v-if="zaloSearchLoading" class="px-3 py-2 border-b bg-surface d-flex align-center justify-center text-caption text-grey gap-2">
      <v-progress-circular indeterminate size="16" width="2" color="primary" />
      <span>Đang tìm kiếm thông tin trên Zalo...</span>
    </div>

    <!-- Result Found: Clickable Customer Card with Avatar + Name -->
    <div
      v-if="!zaloSearchLoading && zaloSearchResult"
      class="px-3 py-2 border-b bg-surface"
    >
      <div
        class="zalo-user-search-card pa-2.5 rounded-lg border d-flex align-center gap-3 cursor-pointer"
        @click="startChatWithZaloUser"
        title="Bấm để mở cuộc trò chuyện"
      >
        <v-avatar size="44" color="primary" class="flex-shrink-0">
          <v-img v-if="zaloSearchResult.avatar" :src="zaloSearchResult.avatar">
            <template #error>
              <span class="text-white font-weight-bold">{{ (zaloSearchResult.displayName || 'Z').charAt(0) }}</span>
            </template>
          </v-img>
          <span v-else class="text-white font-weight-bold">{{ (zaloSearchResult.displayName || 'Z').charAt(0) }}</span>
        </v-avatar>

        <div class="overflow-hidden flex-grow-1">
          <div class="d-flex align-center justify-space-between mb-0.5">
            <span class="font-weight-bold text-body-2 text-truncate">{{ zaloSearchResult.displayName }}</span>
            <v-chip size="x-small" color="primary" variant="tonal" class="font-weight-medium">Zalo</v-chip>
          </div>
          <div class="text-caption text-grey text-truncate">
            {{ zaloSearchResult.phone ? `SĐT: ${zaloSearchResult.phone}` : 'Tài khoản Zalo' }}
            <span v-if="zaloSearchResultExistingConvId" class="text-success font-weight-medium ml-1">• Đã có tin nhắn</span>
          </div>
        </div>

        <v-icon size="18" class="text-grey flex-shrink-0">lucide-chevron-right</v-icon>
      </div>
    </div>

    <!-- Not Found / Error State -->
    <div v-if="!zaloSearchLoading && zaloSearchError" class="px-3 py-2 border-b bg-surface">
      <div class="pa-2 rounded-lg bg-red-lighten-5 text-caption text-error d-flex align-center justify-space-between">
        <div class="d-flex align-center gap-1.5 flex-grow-1">
          <v-icon size="14" class="flex-shrink-0">lucide-alert-circle</v-icon>
          <span>{{ zaloSearchError }}</span>
        </div>
        <v-btn icon size="x-small" variant="text" color="error" @click="zaloSearchError = ''">
          <v-icon size="12">lucide-x</v-icon>
        </v-btn>
      </div>
    </div>

    <!-- 2. Zalo PC Tab Filter Row: Tất cả | Chưa đọc | Khu vực | Phân loại ▾ | ... -->
    <div class="zalo-conv-tabs-row d-flex align-center justify-space-between px-3 pb-2 border-b">
      <div class="d-flex align-center gap-2 flex-nowrap overflow-x-auto">
        <button
          type="button"
          class="zalo-tab-btn flex-shrink-0"
          :class="{ 'is-active': activeTab === 'all' }"
          @click="activeTab = 'all'"
        >
          Tất cả
        </button>
        <button
          type="button"
          class="zalo-tab-btn d-flex align-center gap-1 flex-shrink-0"
          :class="{ 'is-active': activeTab === 'unread' }"
          @click="activeTab = 'unread'"
        >
          <span>Chưa đọc</span>
          <span v-if="unreadTotalCount > 0" class="zalo-tab-badge">{{ unreadTotalCount }}</span>
        </button>
        <button
          type="button"
          class="zalo-tab-btn d-flex align-center gap-1 flex-shrink-0"
          :class="{ 'is-active': activeTab === 'zone' }"
          @click="activeTab = 'zone'"
        >
          <span>Khu vực</span>
          <span v-if="zoneGroups.length > 0" class="zalo-tab-badge-neutral">{{ zoneGroups.length }}</span>
        </button>
      </div>

      <div class="d-flex align-center gap-1">
        <!-- Phân loại / Tag Filter Menu -->
        <v-menu
          v-model="filterMenuOpen"
          :close-on-content-click="false"
          location="bottom end"
          offset="8"
        >
          <template #activator="{ props: menuProps }">
            <button
              type="button"
              v-bind="menuProps"
              class="zalo-tab-btn d-flex align-center gap-1"
              :class="{ 'is-active': activeFilterCount > 0 }"
              title="Phân loại theo Tag"
            >
              <span>Phân loại</span>
              <v-icon size="14">lucide-chevron-down</v-icon>
              <span v-if="activeFilterCount > 0" class="zalo-filter-count-dot"></span>
            </button>
          </template>

          <!-- Tag Filter Popup Card -->
          <v-card class="tag-filter-card" elevation="4" width="340">
            <div class="pa-3 d-flex align-center justify-space-between border-b">
              <div class="d-flex align-center font-weight-medium text-body-2">
                <v-icon size="16" class="mr-1.5 text-primary">lucide-filter</v-icon>
                <span>Phân loại theo Tag</span>
                <span v-if="activeFilterCount > 0" class="ml-1 text-caption text-primary font-weight-bold">
                  ({{ activeFilterCount }})
                </span>
              </div>
              <div class="d-flex align-center gap-1">
                <v-btn
                  v-if="activeFilterCount > 0"
                  size="x-small"
                  variant="text"
                  color="error"
                  @click="resetTagFilter"
                >
                  Đặt lại
                </v-btn>
                <v-btn icon size="x-small" variant="text" @click="filterMenuOpen = false">
                  <v-icon size="14">lucide-x</v-icon>
                </v-btn>
              </div>
            </div>

            <!-- Tab Switch: Nhóm Tag / Tất cả Tag -->
            <div class="px-3 pt-2">
              <v-btn-toggle
                v-model="filterSubTab"
                mandatory
                density="compact"
                variant="outlined"
                color="primary"
                rounded="lg"
                class="w-100 d-flex mb-2"
              >
                <v-btn value="groups" size="small" class="flex-grow-1 font-weight-medium" style="font-size: 0.76rem;">
                  <v-icon size="14" class="mr-1">lucide-folder</v-icon>
                  Nhóm tag ({{ tagGroups.length }})
                </v-btn>
                <v-btn value="tags" size="small" class="flex-grow-1 font-weight-medium" style="font-size: 0.76rem;">
                  <v-icon size="14" class="mr-1">lucide-tags</v-icon>
                  Tất cả tag ({{ tags.length }})
                </v-btn>
              </v-btn-toggle>
            </div>

            <!-- SUB-TAB 1: NHÓM TAG -->
            <div v-if="filterSubTab === 'groups'" class="px-3 pb-3">
              <div class="d-flex align-center gap-1 mb-2">
                <v-text-field
                  v-model="groupSearchInFilter"
                  placeholder="Tìm nhóm tag..."
                  prepend-inner-icon="lucide-search"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="flex-grow-1"
                />
                <v-btn
                  color="primary"
                  size="small"
                  variant="tonal"
                  density="comfortable"
                  class="px-2 font-weight-bold"
                  title="Tạo nhóm tag mới"
                  @click="openCreateGroup()"
                >
                  <v-icon size="14" class="mr-1">lucide-plus</v-icon>
                  Tạo nhóm
                </v-btn>
              </div>

              <!-- Groups List -->
              <div class="tag-filter-list overflow-y-auto" style="max-height: 220px;">
                <div
                  v-for="group in filteredTagGroups"
                  :key="group.id"
                  class="tag-group-filter-item pa-2 rounded cursor-pointer mb-1 border"
                  :class="{ 'is-selected': selectedGroupId === group.id }"
                  @click="toggleSelectGroup(group)"
                >
                  <div class="d-flex align-center justify-space-between mb-1">
                    <div class="d-flex align-center flex-grow-1 min-w-0 mr-1">
                      <span
                        class="tag-color-indicator mr-2"
                        :style="{ backgroundColor: group.color || '#4F46E5', borderColor: group.color || '#4F46E5' }"
                      />
                      <span class="text-body-2 font-weight-bold text-truncate">
                        {{ group.name }}
                      </span>
                      <span class="text-caption text-grey ml-1.5 flex-shrink-0 font-weight-regular">
                        ({{ group.tags.length }} tag)
                      </span>
                    </div>

                    <!-- Actions: Edit / Delete -->
                    <div class="d-flex align-center gap-0.5 flex-shrink-0" @click.stop>
                      <v-icon
                        v-if="selectedGroupId === group.id"
                        size="16"
                        color="primary"
                        class="mr-1"
                      >
                        lucide-check-circle-2
                      </v-icon>
                      <v-btn
                        icon
                        size="x-small"
                        variant="text"
                        density="compact"
                        title="Chỉnh sửa nhóm"
                        @click.stop="openEditGroup(group)"
                      >
                        <v-icon size="13" color="grey-darken-1">lucide-pencil</v-icon>
                      </v-btn>
                      <v-btn
                        icon
                        size="x-small"
                        variant="text"
                        density="compact"
                        title="Xóa nhóm"
                        @click.stop="confirmDeleteGroup(group)"
                      >
                        <v-icon size="13" color="error">lucide-trash-2</v-icon>
                      </v-btn>
                    </div>
                  </div>

                  <!-- Tags Preview Chips in Group -->
                  <div class="d-flex flex-wrap gap-1 mt-1">
                    <span
                      v-for="tagName in group.tags.slice(0, 4)"
                      :key="tagName"
                      class="tag-mini-chip text-truncate"
                      :style="getTagStyle(tagName)"
                    >
                      {{ tagName }}
                    </span>
                    <span v-if="group.tags.length > 4" class="tag-mini-more text-caption text-grey">
                      +{{ group.tags.length - 4 }}
                    </span>
                  </div>
                </div>

                <div
                  v-if="filteredTagGroups.length === 0"
                  class="text-center py-4 text-caption text-grey"
                >
                  <v-icon size="24" class="mb-1 d-block mx-auto text-grey-lighten-1">lucide-folder-x</v-icon>
                  {{ groupSearchInFilter ? 'Không tìm thấy nhóm tag phù hợp' : 'Chưa có nhóm tag nào.' }}
                  <div class="mt-1">
                    <a
                      href="javascript:void(0)"
                      class="text-primary text-decoration-none font-weight-medium"
                      @click="openCreateGroup()"
                    >
                      + Tạo nhóm tag đầu tiên
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <!-- SUB-TAB 2: TẤT CẢ TAG -->
            <div v-else class="pa-3 pt-0">
              <div class="mb-2">
                <div class="text-caption font-weight-medium mb-1 text-grey-darken-1">Kiểu kết hợp:</div>
                <v-btn-toggle v-model="combineMode" mandatory density="compact" variant="outlined" color="primary" rounded="lg" class="w-100 d-flex">
                  <v-btn value="and" size="small" class="flex-grow-1" style="font-size: 0.8rem;">Và</v-btn>
                  <v-btn value="or" size="small" class="flex-grow-1" style="font-size: 0.8rem;">Hoặc</v-btn>
                </v-btn-toggle>
              </div>

              <div class="mb-2">
                <div class="text-caption font-weight-medium mb-1 text-grey-darken-1">Điều kiện lọc:</div>
                <v-btn-toggle v-model="presenceMode" mandatory density="compact" variant="outlined" color="primary" rounded="lg" class="w-100 d-flex">
                  <v-btn value="include" size="small" class="flex-grow-1" style="font-size: 0.73rem;">Có chứa tag</v-btn>
                  <v-btn value="exclude" size="small" class="flex-grow-1" style="font-size: 0.73rem;">Không chứa tag</v-btn>
                </v-btn-toggle>
              </div>

              <v-text-field
                v-model="tagSearchInFilter"
                placeholder="Tìm tag..."
                prepend-inner-icon="lucide-search"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-2"
              />

              <div class="tag-filter-list overflow-y-auto" style="max-height: 160px;">
                <div
                  v-for="t in filteredTagsInPopup"
                  :key="t.id || t.name"
                  class="tag-filter-item d-flex align-center pa-1.5 rounded cursor-pointer mb-0.5"
                  :class="{ 'is-selected': selectedFilterTags.includes(t.name) }"
                  @click="toggleFilterTag(t.name)"
                >
                  <span class="tag-color-indicator mr-2" :style="{ backgroundColor: t.color, borderColor: t.color }" />
                  <span class="text-body-2 flex-grow-1 text-truncate font-weight-medium">{{ t.name }}</span>
                  <v-icon v-if="selectedFilterTags.includes(t.name)" size="16" color="primary">lucide-check</v-icon>
                </div>
              </div>

              <!-- Shortcut to save selected tags as a group -->
              <div v-if="selectedFilterTags.length > 0" class="mt-2 pt-2 border-t">
                <v-btn
                  block
                  size="small"
                  variant="tonal"
                  color="primary"
                  prepend-icon="lucide-folder-plus"
                  @click="openCreateGroup(selectedFilterTags)"
                >
                  Lưu {{ selectedFilterTags.length }} tag này thành nhóm mới
                </v-btn>
              </div>
            </div>
          </v-card>
        </v-menu>

        <!-- More Options Menu (...) -->
        <v-menu location="bottom end" offset="8" :close-on-content-click="false">
          <template #activator="{ props: moreProps }">
            <button type="button" v-bind="moreProps" class="zalo-tab-btn px-1" title="Tùy chọn khác">
              <v-icon size="16">lucide-more-horizontal</v-icon>
            </button>
          </template>
          <v-card width="240" class="pa-1 elevation-4 rounded-lg">
            <v-list density="compact" nav class="pa-0">
              <v-list-item
                prepend-icon="lucide-check-check"
                title="Đánh dấu đã đọc tất cả"
                rounded="lg"
                @click="markAllAsRead"
              />
              <v-divider class="my-1" />
              <!-- Account filter sub item -->
              <div class="px-3 py-1">
                <div class="text-caption text-grey font-weight-medium mb-1">Lọc theo tài khoản Zalo:</div>
                <v-select
                  v-model="selectedAccountId"
                  :items="accountOptions"
                  item-title="text"
                  item-value="value"
                  label="Tất cả Zalo"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  @update:model-value="$emit('filter-account', $event)"
                />
              </div>
            </v-list>
          </v-card>
        </v-menu>
      </div>
    </div>

    <!-- Active Tag Filter Chips Bar (if filtered) -->
    <div v-if="activeFilterCount > 0" class="px-3 py-1.5 d-flex flex-wrap align-center gap-1 border-b">
      <span class="text-caption text-grey" style="font-size: 0.7rem;">
        Đang lọc ({{ presenceMode === 'include' ? 'Có' : 'Không có' }}):
      </span>

      <!-- Group badge if filtering by a group -->
      <span
        v-if="activeSelectedGroup"
        class="tag-group-chip d-inline-flex align-center"
        :style="{
          backgroundColor: `${activeSelectedGroup.color || '#4F46E5'}18`,
          color: activeSelectedGroup.color || '#4F46E5',
          border: `1px solid ${activeSelectedGroup.color || '#4F46E5'}50`,
        }"
      >
        <v-icon size="12" class="mr-1">lucide-folder</v-icon>
        <span class="font-weight-bold text-truncate" style="max-width: 110px;">{{ activeSelectedGroup.name }}</span>
        <button
          type="button"
          class="tag-chip-remove d-flex align-center justify-center ml-1"
          title="Bỏ lọc nhóm này"
          @click.stop="resetTagFilter"
        >
          <v-icon size="11">lucide-x</v-icon>
        </button>
      </span>

      <!-- Individual tag chips -->
      <span
        v-for="tagName in selectedFilterTags"
        :key="tagName"
        class="tag-chip d-inline-flex align-center"
        :style="getTagStyle(tagName)"
      >
        <span class="tag-chip-text text-truncate">{{ tagName }}</span>
        <button
          type="button"
          class="tag-chip-remove d-flex align-center justify-center"
          @click.stop="toggleFilterTag(tagName)"
        >
          <v-icon size="11">lucide-x</v-icon>
        </button>
      </span>
      <button
        type="button"
        class="text-caption text-error ml-1"
        style="background:none; border:none; cursor:pointer; font-size: 0.7rem; text-decoration: underline;"
        @click="resetTagFilter"
      >
        Xóa lọc
      </button>
    </div>

    <!-- 3. Zalo Conversation List -->
    <div class="zalo-conv-items-scroll flex-grow-1 overflow-y-auto pa-0">
      <v-progress-linear v-if="loading" indeterminate color="primary" />

      <!-- ZONE TAB VIEW: GROUPED BY ZONE (ACCORDION) -->
      <template v-if="activeTab === 'zone'">
        <!-- Zone Toolbar (Summary + Quick Expand/Collapse & Pills) -->
        <div v-if="zoneGroups.length > 0" class="zone-filter-toolbar px-3 py-2 border-b">
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption text-medium-emphasis font-weight-medium d-flex align-center gap-1" style="font-size: 0.72rem;">
              <v-icon size="12" color="primary">lucide-map-pin</v-icon>
              {{ zoneGroups.length }} khu vực • {{ displayedConversations.length }} khách
            </span>
            <button
              type="button"
              class="zone-toggle-all-btn text-caption text-primary"
              @click="isAllZonesCollapsed ? expandAllZones() : collapseAllZones()"
            >
              {{ isAllZonesCollapsed ? 'Mở tất cả' : 'Thu gọn tất cả' }}
            </button>
          </div>

          <!-- Zone Pills Scrollable Bar -->
          <div v-if="zoneGroups.length > 1" class="zone-pills-row d-flex align-center gap-1 overflow-x-auto pt-1">
            <button
              type="button"
              class="zone-pill-btn flex-shrink-0"
              :class="{ 'is-active': selectedZoneFilter === null }"
              @click="selectedZoneFilter = null"
            >
              Tất cả ({{ displayedConversations.length }})
            </button>
            <button
              v-for="grp in zoneGroups"
              :key="grp.name"
              type="button"
              class="zone-pill-btn flex-shrink-0"
              :class="{ 'is-active': selectedZoneFilter === grp.name }"
              @click="selectedZoneFilter = selectedZoneFilter === grp.name ? null : grp.name"
            >
              {{ grp.name }} ({{ grp.conversations.length }})
            </button>
          </div>
        </div>

        <!-- Zone Accordion Groups List -->
        <div
          v-for="group in filteredZoneGroups"
          :key="group.name"
          class="zone-group-block"
        >
          <!-- Zone Accordion Header -->
          <div
            class="zone-group-header d-flex align-center justify-space-between px-3 py-2 cursor-pointer"
            @click="toggleZoneCollapse(group.name)"
          >
            <div class="d-flex align-center gap-1.5 min-w-0 mr-2 text-truncate">
              <v-icon size="14" :color="group.name === 'Chưa có khu vực' ? 'grey' : 'primary'" class="flex-shrink-0">
                {{ group.name === 'Chưa có khu vực' ? 'lucide-map-pin-off' : 'lucide-map-pin' }}
              </v-icon>
              <span class="text-caption font-weight-bold text-truncate text-high-emphasis">
                {{ group.name }}
              </span>
              <span class="zone-group-count-badge flex-shrink-0">
                {{ group.conversations.length }}
              </span>
              <span v-if="group.unreadCount > 0" class="zone-unread-pill flex-shrink-0 ml-1">
                {{ group.unreadCount }} chưa đọc
              </span>
            </div>
            <v-icon size="14" class="text-medium-emphasis flex-shrink-0">
              {{ collapsedZones.has(group.name) ? 'lucide-chevron-right' : 'lucide-chevron-down' }}
            </v-icon>
          </div>

          <!-- Zone Conversations Items -->
          <div v-show="!collapsedZones.has(group.name)" class="zone-group-items">
            <div
              v-for="conv in group.conversations"
              :key="conv.id"
              class="zalo-conv-item d-flex align-center px-3 py-2 cursor-pointer position-relative"
              :class="{
                'is-active': conv.id === selectedId,
                'is-pinned': conv.isPinned,
                'is-unread': conv.unreadCount > 0 && conv.id !== selectedId,
                'needs-confirmation-blink': conv.currentState === 'CONFIRMATION',
                'needs-handoff-blink': conv.currentState === 'HUMAN_REQUESTED' && conv.id !== selectedId
              }"
              @click="$emit('select', conv.id)"
              @contextmenu.prevent="openContextMenu($event, conv)"
            >
              <!-- Avatar -->
              <div class="zalo-conv-avatar-wrap mr-3.5 position-relative flex-shrink-0">
                <v-avatar size="44" class="zalo-conv-avatar">
                  <v-img v-if="conv.contact?.avatarUrl" :src="conv.contact.avatarUrl">
                    <template #error>
                      <v-icon :icon="conv.threadType === 'group' ? 'lucide-users' : 'lucide-user'" color="white" size="22" />
                    </template>
                  </v-img>
                  <v-icon v-else-if="conv.threadType === 'group'" icon="lucide-users" color="white" size="22" />
                  <v-icon v-else icon="lucide-user" color="white" size="22" />
                </v-avatar>
                <span v-if="conv.threadType !== 'group'" class="zalo-conv-online-dot"></span>
              </div>

              <!-- Conversation Details -->
              <div class="zalo-conv-body flex-grow-1 overflow-hidden d-flex flex-column justify-center">
                <!-- Top Row: Name + Time + Pin Icon & Button -->
                <div class="d-flex align-center justify-space-between mb-1">
                  <div class="d-flex align-center gap-1.5 overflow-hidden flex-grow-1 mr-2">
                    <v-icon
                      v-if="conv.isPinned"
                      size="13"
                      color="amber-darken-2"
                      class="flex-shrink-0"
                      title="Đã ghim lên đầu"
                    >
                      lucide-pin
                    </v-icon>
                    <span
                      class="zalo-conv-title text-truncate"
                      :class="{ 'font-weight-bold': conv.unreadCount > 0 || conv.id === selectedId }"
                    >
                      {{ getConversationTitle(conv) }}
                    </span>
                  </div>

                  <div class="d-flex align-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      class="zalo-conv-pin-btn"
                      :class="{ 'is-pinned': conv.isPinned }"
                      :title="conv.isPinned ? 'Bỏ ghim cuộc trò chuyện' : 'Ghim cuộc trò chuyện lên đầu'"
                      @click.stop="togglePinConv(conv)"
                    >
                      <v-icon size="13" :color="conv.isPinned ? 'amber-darken-2' : 'grey'">
                        {{ conv.isPinned ? 'lucide-pin-off' : 'lucide-pin' }}
                      </v-icon>
                    </button>
                    <span class="zalo-conv-time text-caption text-grey">
                      {{ formatTime(conv.lastMessageAt) }}
                    </span>
                  </div>
                </div>

                <!-- Bottom Row: Snippet + Unread Badge -->
                <div class="d-flex align-center justify-space-between mb-0.5">
                  <span
                    class="zalo-conv-snippet text-truncate text-caption"
                    :class="{ 'text-high-emphasis font-weight-medium': conv.unreadCount > 0, 'text-grey': conv.unreadCount === 0 }"
                  >
                    {{ lastMessagePreview(conv) }}
                  </span>
                  <span v-if="conv.unreadCount > 0" class="zalo-unread-badge ml-2 flex-shrink-0">
                    {{ conv.unreadCount > 99 ? '99+' : conv.unreadCount }}
                  </span>
                </div>

                <!-- Extra row: Zone badge + Tags (if any) -->
                <div v-if="getContactTags(conv).length > 0 || conv.contact?.zone || (conv.currentState === 'HUMAN_REQUESTED' && conv.id !== selectedId)" class="conv-tags-row d-flex align-center flex-wrap mt-1">
                  <span
                    v-if="conv.currentState === 'HUMAN_REQUESTED' && conv.id !== selectedId"
                    class="conv-handoff-badge text-truncate mr-1"
                    :title="`Cần hỗ trợ: ${conv.handoffReason || 'Khách yêu cầu gặp nhân viên'}`"
                  >
                    <v-icon size="10" class="mr-0.5">lucide-user-check</v-icon>
                    Cần hỗ trợ
                  </span>
                  <span
                    v-if="conv.contact?.zone"
                    class="conv-zone-badge text-truncate"
                    :title="`Khu vực: ${conv.contact.zone}`"
                  >
                    <v-icon size="10" class="mr-0.5">lucide-map-pin</v-icon>
                    {{ conv.contact.zone }}
                  </span>
                  <span
                    v-for="(tag, idx) in getContactTags(conv).slice(0, 3)"
                    :key="idx"
                    class="conv-tag-badge text-truncate"
                    :style="getTagStyle(tag)"
                    :title="getTagName(tag)"
                  >
                    {{ getTagName(tag) }}
                  </span>
                  <span v-if="getContactTags(conv).length > 3" class="conv-tag-more">
                    +{{ getContactTags(conv).length - 3 }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ALL / UNREAD TAB VIEW: FLAT LIST -->
      <template v-else>
        <div
          v-for="conv in displayedConversations"
          :key="conv.id"
          class="zalo-conv-item d-flex align-center px-3 py-2 cursor-pointer position-relative"
          :class="{
            'is-active': conv.id === selectedId,
            'is-pinned': conv.isPinned,
            'is-unread': conv.unreadCount > 0 && conv.id !== selectedId,
            'needs-confirmation-blink': conv.currentState === 'CONFIRMATION',
            'needs-handoff-blink': conv.currentState === 'HUMAN_REQUESTED' && conv.id !== selectedId
          }"
          @click="$emit('select', conv.id)"
          @contextmenu.prevent="openContextMenu($event, conv)"
        >
          <!-- Avatar -->
          <div class="zalo-conv-avatar-wrap mr-3.5 position-relative flex-shrink-0">
            <v-avatar size="44" class="zalo-conv-avatar">
              <v-img v-if="conv.contact?.avatarUrl" :src="conv.contact.avatarUrl">
                <template #error>
                  <v-icon :icon="conv.threadType === 'group' ? 'lucide-users' : 'lucide-user'" color="white" size="22" />
                </template>
              </v-img>
              <v-icon v-else-if="conv.threadType === 'group'" icon="lucide-users" color="white" size="22" />
              <v-icon v-else icon="lucide-user" color="white" size="22" />
            </v-avatar>
            <span v-if="conv.threadType !== 'group'" class="zalo-conv-online-dot"></span>
          </div>

          <!-- Conversation Details -->
          <div class="zalo-conv-body flex-grow-1 overflow-hidden d-flex flex-column justify-center">
            <!-- Top Row: Name + Time + Pin Icon & Button -->
            <div class="d-flex align-center justify-space-between mb-1">
              <div class="d-flex align-center gap-1.5 overflow-hidden flex-grow-1 mr-2">
                <v-icon
                  v-if="conv.isPinned"
                  size="13"
                  color="amber-darken-2"
                  class="flex-shrink-0"
                  title="Đã ghim lên đầu"
                >
                  lucide-pin
                </v-icon>
                <span
                  class="zalo-conv-title text-truncate"
                  :class="{ 'font-weight-bold': conv.unreadCount > 0 || conv.id === selectedId }"
                >
                  {{ getConversationTitle(conv) }}
                </span>
              </div>

              <div class="d-flex align-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  class="zalo-conv-pin-btn"
                  :class="{ 'is-pinned': conv.isPinned }"
                  :title="conv.isPinned ? 'Bỏ ghim cuộc trò chuyện' : 'Ghim cuộc trò chuyện lên đầu'"
                  @click.stop="togglePinConv(conv)"
                >
                  <v-icon size="13" :color="conv.isPinned ? 'amber-darken-2' : 'grey'">
                    {{ conv.isPinned ? 'lucide-pin-off' : 'lucide-pin' }}
                  </v-icon>
                </button>
                <span class="zalo-conv-time text-caption text-grey">
                  {{ formatTime(conv.lastMessageAt) }}
                </span>
              </div>
            </div>

            <!-- Bottom Row: Snippet + Unread Badge -->
            <div class="d-flex align-center justify-space-between mb-0.5">
              <span
                class="zalo-conv-snippet text-truncate text-caption"
                :class="{ 'text-high-emphasis font-weight-medium': conv.unreadCount > 0, 'text-grey': conv.unreadCount === 0 }"
              >
                {{ lastMessagePreview(conv) }}
              </span>
              <span v-if="conv.unreadCount > 0" class="zalo-unread-badge ml-2 flex-shrink-0">
                {{ conv.unreadCount > 99 ? '99+' : conv.unreadCount }}
              </span>
            </div>

            <!-- Extra row: Zone badge + Tags (if any) -->
            <div v-if="getContactTags(conv).length > 0 || conv.contact?.zone || (conv.currentState === 'HUMAN_REQUESTED' && conv.id !== selectedId)" class="conv-tags-row d-flex align-center flex-wrap mt-1">
              <span
                v-if="conv.currentState === 'HUMAN_REQUESTED' && conv.id !== selectedId"
                class="conv-handoff-badge text-truncate mr-1"
                :title="`Cần hỗ trợ: ${conv.handoffReason || 'Khách yêu cầu gặp nhân viên'}`"
              >
                <v-icon size="10" class="mr-0.5">lucide-user-check</v-icon>
                Cần hỗ trợ
              </span>
              <span
                v-if="conv.contact?.zone"
                class="conv-zone-badge text-truncate"
                :title="`Khu vực: ${conv.contact.zone}`"
              >
                <v-icon size="10" class="mr-0.5">lucide-map-pin</v-icon>
                {{ conv.contact.zone }}
              </span>
              <span
                v-for="(tag, idx) in getContactTags(conv).slice(0, 3)"
                :key="idx"
                class="conv-tag-badge text-truncate"
                :style="getTagStyle(tag)"
                :title="getTagName(tag)"
              >
                {{ getTagName(tag) }}
              </span>
              <span v-if="getContactTags(conv).length > 3" class="conv-tag-more">
                +{{ getContactTags(conv).length - 3 }}
              </span>
            </div>
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <div v-if="!loading && displayedConversations.length === 0" class="text-center pa-8 text-grey">
        <div v-if="activeFilterCount > 0">
          <v-icon size="32" class="mb-2 text-grey">lucide-filter-x</v-icon>
          <div>Không tìm thấy cuộc trò chuyện phù hợp bộ lọc</div>
          <v-btn size="small" variant="text" color="primary" class="mt-2" @click="resetTagFilter">
            Xóa bộ lọc
          </v-btn>
        </div>
        <div v-else-if="activeTab === 'unread'">
          <v-icon size="32" class="mb-2 text-grey">lucide-check-circle</v-icon>
          <div>Không có tin nhắn chưa đọc</div>
        </div>
        <div v-else-if="activeTab === 'zone'">
          <v-icon size="32" class="mb-2 text-grey">lucide-map-pin-off</v-icon>
          <div>Chưa có dữ liệu cuộc trò chuyện theo khu vực</div>
        </div>
        <div v-else>
          Chưa có cuộc trò chuyện nào
        </div>
      </div>
    </div>

    <!-- Tag Group Create / Edit Dialog -->
    <TagGroupDialog
      v-model="showGroupDialog"
      :group="editingGroup"
      :initial-tags="groupInitialTags"
      @saved="onGroupSaved"
    />

    <!-- Delete Tag Group Confirmation Dialog -->
    <v-dialog v-model="showDeleteGroupConfirm" max-width="400">
      <v-card class="rounded-lg">
        <v-card-title class="pa-4 font-weight-bold text-body-1">
          Xác nhận xóa nhóm tag
        </v-card-title>
        <v-card-text class="px-4 py-2 text-body-2">
          Bạn có chắc muốn xóa nhóm tag <strong>"{{ groupToDelete?.name }}"</strong>?
          <div class="text-caption text-grey mt-1">Các tag gắn trên khách hàng sẽ không bị ảnh hưởng.</div>
        </v-card-text>
        <v-card-actions class="pa-4 d-flex justify-end gap-2">
          <v-btn variant="outlined" density="comfortable" @click="showDeleteGroupConfirm = false" :disabled="deletingGroup">
            Hủy
          </v-btn>
          <v-btn color="error" variant="flat" density="comfortable" :loading="deletingGroup" @click="handleDeleteGroup">
            Xóa nhóm
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Context Menu for Pin / Unpin -->
    <v-menu
      v-model="contextMenuVisible"
      :target="contextMenuTarget"
      location="bottom start"
      transition="fade-transition"
    >
      <v-list density="compact" class="py-1 rounded-lg elevation-4 border bg-surface" min-width="190">
        <v-list-item
          v-if="contextMenuConv"
          density="compact"
          class="cursor-pointer"
          @click="handleContextMenuPin"
        >
          <template #prepend>
            <v-icon size="16" :color="contextMenuConv.isPinned ? 'amber-darken-2' : 'medium-emphasis'">
              {{ contextMenuConv.isPinned ? 'lucide-pin-off' : 'lucide-pin' }}
            </v-icon>
          </template>
          <v-list-item-title class="text-body-2 font-weight-medium">
            {{ contextMenuConv.isPinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại lên đầu' }}
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { Conversation } from '@/composables/use-chat';
import { useTags, type TagGroup } from '@/composables/use-tags';
import TagGroupDialog from '@/components/common/TagGroupDialog.vue';
import { api } from '@/api/index';
import { isCallMessage, getCallInfo } from '@/utils/call-helpers';

const props = defineProps<{
  conversations: Conversation[];
  selectedId: string | null;
  loading: boolean;
  search: string;
}>();

const emit = defineEmits<{
  select: [id: string];
  'update:search': [value: string];
  'filter-account': [accountId: string | null];
  'toggle-pin': [payload: { conversationId: string; pinned: boolean }];
}>();

const contextMenuVisible = ref(false);
const contextMenuTarget = ref<[number, number]>([0, 0]);
const contextMenuConv = ref<Conversation | null>(null);

function openContextMenu(e: MouseEvent, conv: Conversation) {
  contextMenuConv.value = conv;
  contextMenuTarget.value = [e.clientX, e.clientY];
  contextMenuVisible.value = true;
}

function handleContextMenuPin() {
  if (contextMenuConv.value) {
    togglePinConv(contextMenuConv.value);
  }
  contextMenuVisible.value = false;
}

function togglePinConv(conv: Conversation) {
  emit('toggle-pin', {
    conversationId: conv.id,
    pinned: !conv.isPinned,
  });
}

const { tags, tagGroups, getTagStyle, getTagName, fetchTags, fetchTagGroups, deleteTagGroup } = useTags();

const accountOptions = ref<{ text: string; value: string }[]>([]);
const selectedAccountId = ref<string | null>(null);

// ── Phone Search on Zalo State ──────────────────────────────────────────────
const isPhoneSearch = computed(() => {
  const s = (props.search || '').trim().replace(/[\s.-]/g, '');
  return /^(0|\+?84)[0-9]{7,10}$/.test(s) || (s.length >= 9 && /^\d+$/.test(s));
});

const zaloSearchLoading = ref(false);
const zaloSearchResult = ref<any>(null);
const zaloSearchResultExistingConvId = ref<string | null>(null);
const zaloSearchError = ref('');
const startingChat = ref(false);

function onSearchInput(val: string) {
  emit('update:search', val);
  zaloSearchResult.value = null;
  zaloSearchError.value = '';
}

function clearSearch() {
  emit('update:search', '');
  clearZaloSearchResult();
}

function clearZaloSearchResult() {
  zaloSearchResult.value = null;
  zaloSearchResultExistingConvId.value = null;
  zaloSearchError.value = '';
}

async function searchZaloByPhone() {
  const phone = props.search.trim();
  if (!phone) return;

  zaloSearchLoading.value = true;
  zaloSearchError.value = '';
  zaloSearchResult.value = null;
  zaloSearchResultExistingConvId.value = null;

  try {
    const res = await api.post('/zalo/search-phone', {
      phone,
      accountId: selectedAccountId.value || undefined,
    });

    if (res.data.found && res.data.user) {
      zaloSearchResult.value = res.data.user;
      zaloSearchResultExistingConvId.value = res.data.existingConversationId || null;
    } else {
      zaloSearchError.value = res.data.message || 'Không tìm thấy tài khoản Zalo với số điện thoại này.';
    }
  } catch (err: any) {
    zaloSearchError.value = err.response?.data?.error || 'Lỗi khi tìm kiếm trên Zalo. Vui lòng thử lại sau.';
  } finally {
    zaloSearchLoading.value = false;
  }
}

function handleSearchTrigger() {
  const q = (props.search || '').trim();
  if (!q) return;

  if (isPhoneSearch.value) {
    searchZaloByPhone();
  }
}

async function startChatWithZaloUser() {
  if (!zaloSearchResult.value) return;

  // If already exists in conversation list
  if (zaloSearchResultExistingConvId.value) {
    const convId = zaloSearchResultExistingConvId.value;
    clearSearch();
    emit('select', convId);
    return;
  }

  startingChat.value = true;
  try {
    const res = await api.post('/zalo/start-chat-by-phone', {
      phone: zaloSearchResult.value.phone,
      uid: zaloSearchResult.value.uid,
      displayName: zaloSearchResult.value.displayName,
      avatarUrl: zaloSearchResult.value.avatar,
      accountId: selectedAccountId.value || zaloSearchResult.value.zaloAccountId || undefined,
    });

    if (res.data.conversationId) {
      const convId = res.data.conversationId;
      clearSearch();
      emit('select', convId);
    }
  } catch (err: any) {
    zaloSearchError.value = err.response?.data?.error || 'Không thể tạo cuộc trò chuyện';
  } finally {
    startingChat.value = false;
  }
}

const activeTab = ref<'all' | 'unread' | 'zone'>('all');
const selectedZoneFilter = ref<string | null>(null);
const collapsedZones = ref<Set<string>>(new Set());

interface ZoneGroupItem {
  name: string;
  conversations: Conversation[];
  unreadCount: number;
}

function getConversationZone(conv: Conversation): string {
  const z = conv.contact?.zone?.trim();
  if (z) return z;
  return 'Chưa có khu vực';
}

const zoneGroups = computed<ZoneGroupItem[]>(() => {
  const list = displayedConversations.value;
  const map = new Map<string, Conversation[]>();

  for (const conv of list) {
    const zone = getConversationZone(conv);
    if (!map.has(zone)) {
      map.set(zone, []);
    }
    map.get(zone)!.push(conv);
  }

  const groups: ZoneGroupItem[] = [];
  map.forEach((convs, zone) => {
    const unread = convs.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    // Sort pinned conversations first inside zone
    const sortedConvs = [...convs].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return timeB - timeA;
    });
    groups.push({
      name: zone,
      conversations: sortedConvs,
      unreadCount: unread,
    });
  });

  // Sắp xếp các khu vực theo thứ tự bảng chữ cái tiếng Việt, 'Chưa có khu vực' ở cuối cùng
  groups.sort((a, b) => {
    if (a.name === 'Chưa có khu vực') return 1;
    if (b.name === 'Chưa có khu vực') return -1;
    return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
  });

  return groups;
});

const filteredZoneGroups = computed(() => {
  if (!selectedZoneFilter.value) return zoneGroups.value;
  return zoneGroups.value.filter((g) => g.name === selectedZoneFilter.value);
});

function toggleZoneCollapse(zoneName: string) {
  const newSet = new Set(collapsedZones.value);
  if (newSet.has(zoneName)) {
    newSet.delete(zoneName);
  } else {
    newSet.add(zoneName);
  }
  collapsedZones.value = newSet;
}

function expandAllZones() {
  collapsedZones.value = new Set();
}

function collapseAllZones() {
  collapsedZones.value = new Set(zoneGroups.value.map((g) => g.name));
}

const isAllZonesCollapsed = computed(() => {
  if (zoneGroups.value.length === 0) return false;
  return zoneGroups.value.every((g) => collapsedZones.value.has(g.name));
});

const unreadTotalCount = computed(() => {
  return props.conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
});

// Tag Filter State
const filterMenuOpen = ref(false);
const filterSubTab = ref<'groups' | 'tags'>('groups');
const selectedGroupId = ref<string | null>(null);
const selectedFilterTags = ref<string[]>([]);
const combineMode = ref<'and' | 'or'>('and');
const presenceMode = ref<'include' | 'exclude'>('include');
const tagSearchInFilter = ref('');
const groupSearchInFilter = ref('');

// Tag Group Dialogs
const showGroupDialog = ref(false);
const editingGroup = ref<TagGroup | null>(null);
const groupInitialTags = ref<string[]>([]);
const showDeleteGroupConfirm = ref(false);
const groupToDelete = ref<TagGroup | null>(null);
const deletingGroup = ref(false);

const activeFilterCount = computed(() => {
  if (selectedGroupId.value) return 1;
  return selectedFilterTags.value.length;
});

const activeSelectedGroup = computed(() => {
  if (!selectedGroupId.value) return null;
  return tagGroups.value.find((g) => g.id === selectedGroupId.value) || null;
});

const filteredTagGroups = computed(() => {
  const q = groupSearchInFilter.value.trim().toLowerCase();
  if (!q) return tagGroups.value;
  return tagGroups.value.filter((g) => {
    if (g.name.toLowerCase().includes(q)) return true;
    return g.tags.some((t) => t.toLowerCase().includes(q));
  });
});

const filteredTagsInPopup = computed(() => {
  const q = tagSearchInFilter.value.trim().toLowerCase();
  if (!q) return tags.value;
  return tags.value.filter((t) => t.name.toLowerCase().includes(q));
});

function toggleSelectGroup(group: TagGroup) {
  if (selectedGroupId.value === group.id) {
    selectedGroupId.value = null;
    selectedFilterTags.value = [];
  } else {
    selectedGroupId.value = group.id;
    selectedFilterTags.value = [...group.tags];
  }
}

function openCreateGroup(initialTags: string[] = []) {
  editingGroup.value = null;
  groupInitialTags.value = Array.isArray(initialTags) ? [...initialTags] : [];
  showGroupDialog.value = true;
}

function openEditGroup(group: TagGroup) {
  editingGroup.value = group;
  groupInitialTags.value = [];
  showGroupDialog.value = true;
}

function confirmDeleteGroup(group: TagGroup) {
  groupToDelete.value = group;
  showDeleteGroupConfirm.value = true;
}

async function handleDeleteGroup() {
  if (!groupToDelete.value) return;
  deletingGroup.value = true;
  try {
    await deleteTagGroup(groupToDelete.value.id);
    if (selectedGroupId.value === groupToDelete.value.id) {
      selectedGroupId.value = null;
      selectedFilterTags.value = [];
    }
    showDeleteGroupConfirm.value = false;
  } finally {
    deletingGroup.value = false;
  }
}

function onGroupSaved(savedGroup: TagGroup) {
  if (selectedGroupId.value === savedGroup.id) {
    selectedFilterTags.value = [...savedGroup.tags];
  }
}

function toggleFilterTag(tagName: string) {
  const idx = selectedFilterTags.value.findIndex((t) => t.toLowerCase() === tagName.toLowerCase());
  if (idx >= 0) {
    selectedFilterTags.value.splice(idx, 1);
  } else {
    selectedFilterTags.value.push(tagName);
  }

  if (activeSelectedGroup.value) {
    const groupTagsLower = activeSelectedGroup.value.tags.map((t) => t.toLowerCase());
    const currentTagsLower = selectedFilterTags.value.map((t) => t.toLowerCase());
    if (groupTagsLower.length !== currentTagsLower.length || !groupTagsLower.every((t) => currentTagsLower.includes(t))) {
      selectedGroupId.value = null;
    }
  }
}

function resetTagFilter() {
  selectedGroupId.value = null;
  selectedFilterTags.value = [];
  combineMode.value = 'and';
  presenceMode.value = 'include';
  tagSearchInFilter.value = '';
  groupSearchInFilter.value = '';
}

async function markAllAsRead() {
  for (const conv of props.conversations) {
    if ((conv.unreadCount || 0) > 0) {
      conv.unreadCount = 0;
      try { await api.post(`/chat/conversations/${conv.id}/read`); } catch {}
    }
  }
}

const displayedConversations = computed(() => {
  let list = props.conversations;
  if (activeTab.value === 'unread') list = list.filter((c) => (c.unreadCount || 0) > 0);

  if (selectedFilterTags.value.length > 0) {
    const filterLower = selectedFilterTags.value.map((t) => t.toLowerCase());
    list = list.filter((conv) => {
      const contactTags = getContactTags(conv).map((t) => getTagName(t).toLowerCase());
      let hasMatch = combineMode.value === 'and'
        ? filterLower.every((ft) => contactTags.includes(ft))
        : filterLower.some((ft) => contactTags.includes(ft));
      return presenceMode.value === 'include' ? hasMatch : !hasMatch;
    });
  }

  // Always sort pinned conversations to the very top
  return [...list].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return timeB - timeA;
  });
});

onMounted(async () => {
  fetchTags();
  fetchTagGroups();
  try {
    const res = await api.get('/zalo-accounts');
    const accounts = Array.isArray(res.data) ? res.data : (res.data.accounts || []);
    accountOptions.value = accounts.map((a: any) => ({ text: a.displayName || a.zaloUid, value: a.id }));
  } catch {}
});

function getConversationTitle(conv: Conversation): string {
  if (conv.threadType === 'group') {
    return conv.contact?.fullName || 'Nhóm';
  }
  const zaloName = conv.contact?.zaloName?.trim();
  const fullName = conv.contact?.fullName?.trim();

  const isInvalid = (name?: string | null) =>
    !name || name === 'Khách hàng' || name === 'Khách hàng Zalo' || name === 'Unknown';

  if (!isInvalid(zaloName)) {
    return zaloName!;
  }
  if (!isInvalid(fullName)) {
    return fullName!;
  }
  return zaloName || fullName || 'Khách hàng';
}

function getContactTags(conv: Conversation): any[] {
  const tagsList = conv.contact?.tags;
  return Array.isArray(tagsList) ? tagsList.filter((t: any) => t) : [];
}

function isUndoSyncMessage(msg: any): boolean {
  if (!msg || !msg.content || !msg.content.startsWith('{')) return false;
  try {
    const p = JSON.parse(msg.content);
    if (p.globalMsgId !== undefined && p.deleteMsg !== undefined) return true;
  } catch {}
  return false;
}

function lastMessagePreview(conv: Conversation): string {
  const msg = conv.messages?.[0];
  if (!msg) return '';
  if (msg.isDeleted || isUndoSyncMessage(msg)) {
    if (msg.senderType === 'self') return 'Bạn đã thu hồi một tin nhắn';
    const contactName = getConversationTitle(conv);
    return `${contactName} đã thu hồi một tin nhắn`;
  }

  if (msg.contentType === 'call' || isCallMessage(msg)) {
    return getCallInfo(msg).snippet;
  }

  if (msg.contentType === 'image') return 'Hình ảnh';
  if (msg.contentType === 'video') return 'Video';
  if (msg.contentType === 'sticker') return 'Nhãn dán';
  if (msg.contentType === 'voice') return 'Tin nhắn thoại';
  if (msg.contentType === 'gif') return 'GIF';

  if (msg.content?.startsWith('{')) {
    try {
      const p = JSON.parse(msg.content);

      // Cuộc gọi thoại / Video
      if (p.action?.includes('call') || p.action === 'recommened.calltime' || p.title === 'sendBubbleMessage') {
        return getCallInfo(msg).snippet;
      }
      
      // Lịch hẹn / Reminder
      if (p.action === 'msginfo.actionlist') return 'Nhắc hẹn';
      
      const paramsStr = typeof p.params === 'string' ? p.params : JSON.stringify(p.params || {});
      if (paramsStr.includes('fileExt') || paramsStr.includes('"fType":1')) {
        return 'Tệp tin đính kèm';
      }
      
      const href = p.href || p.thumb || '';
      if (href && /\.(jpg|jpeg|png|webp|gif)/i.test(href)) {
        return 'Hình ảnh';
      }
      
      if (p.title && p.href) {
        return 'Liên kết';
      }
      if (p.href) {
        return 'Liên kết';
      }
    } catch {
      // Ignore parse error
    }
  }

  return msg.content || '...';
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}
</script>

<style scoped>
.zalo-search-box { background-color: rgba(0,0,0,0.05); border-radius: 8px; height: 36px; }
.zalo-search-input { border: none; background: transparent; outline: none; font-size: 13px; }
.zalo-tab-btn { background: transparent; border: none; padding: 4px 8px; border-radius: 6px; cursor: pointer; }
.zalo-tab-btn.is-active { background: rgba(0, 104, 255, 0.1); color: #0068ff; }
.zalo-filter-count-dot { width: 6px; height: 6px; background: #0068ff; border-radius: 50%; display: inline-block; }
.tag-group-filter-item { border: 1px solid rgba(0,0,0,0.1); }
.tag-group-filter-item.is-selected { border-color: #0068ff; background: rgba(0, 104, 255, 0.05); }
.tag-group-chip { font-size: 11px; padding: 2px 6px; border-radius: 4px; }
.tag-mini-chip { font-size: 10px; padding: 2px 4px; border-radius: 4px; }
.tag-filter-item:hover { background: rgba(0,0,0,0.05); }
.tag-filter-item.is-selected { background: rgba(0, 104, 255, 0.1); }
.zalo-conv-avatar-wrap { margin-right: 14px !important; }
.conv-tags-row { gap: 4px; }
.conv-tag-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  line-height: 1.2;
  max-width: 110px;
  transition: all 0.2s ease;
}
.conv-tag-more {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  background: rgba(0, 0, 0, 0.06);
  padding: 2px 6px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
}

/* Zone Group Styling */
.zone-filter-toolbar {
  background: rgba(var(--v-theme-on-surface, 128, 128, 128), 0.02);
}
.zone-toggle-all-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0;
}
.zone-toggle-all-btn:hover {
  text-decoration: underline;
}
.zone-pills-row {
  scrollbar-width: thin;
}
.zone-pills-row::-webkit-scrollbar {
  height: 3px;
}
.zone-pill-btn {
  background: rgba(var(--v-theme-on-surface, 128, 128, 128), 0.06);
  color: inherit;
  border: 1px solid rgba(var(--v-theme-on-surface, 128, 128, 128), 0.1);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
}
.zone-pill-btn:hover {
  background: rgba(var(--v-theme-on-surface, 128, 128, 128), 0.12);
}
.zone-pill-btn.is-active {
  background: rgba(0, 104, 255, 0.12);
  color: #0068ff;
  border-color: rgba(0, 104, 255, 0.3);
  font-weight: 700;
}
.zone-group-header {
  background: rgba(var(--v-theme-on-surface, 128, 128, 128), 0.05);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface, 128, 128, 128), 0.08);
  border-top: 1px solid rgba(var(--v-theme-on-surface, 128, 128, 128), 0.04);
  position: sticky;
  top: 0;
  z-index: 2;
  backdrop-filter: blur(8px);
  user-select: none;
  transition: background-color 0.15s ease;
}
.zone-group-header:hover {
  background: rgba(var(--v-theme-on-surface, 128, 128, 128), 0.09);
}
.zone-group-count-badge {
  font-size: 10px;
  font-weight: 600;
  background: rgba(var(--v-theme-on-surface, 128, 128, 128), 0.1);
  color: inherit;
  border-radius: 999px;
  padding: 1px 6px;
}
.zone-unread-pill {
  font-size: 9px;
  font-weight: 700;
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 999px;
  padding: 0 5px;
}
.conv-zone-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  line-height: 1.2;
  max-width: 120px;
  background: rgba(14, 165, 233, 0.12);
  color: #0284c7;
  border: 1px solid rgba(14, 165, 233, 0.25);
}
.zalo-tab-badge {
  background: #ef4444;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 999px;
  padding: 1px 6px;
  line-height: 1.2;
}
.zalo-tab-badge-neutral {
  background: rgba(var(--v-theme-on-surface, 128, 128, 128), 0.1);
  color: inherit;
  font-size: 10px;
  font-weight: 600;
  border-radius: 999px;
  padding: 1px 5px;
  line-height: 1.2;
}
.zalo-unread-badge {
  background: #ef4444;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 999px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.zalo-conv-online-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #10b981;
  border: 2px solid var(--v-theme-surface, #ffffff);
}
.zalo-conv-item {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface, 128, 128, 128), 0.06);
  transition: background-color 0.15s ease;
}
.zalo-conv-item:hover {
  background-color: rgba(var(--v-theme-on-surface, 128, 128, 128), 0.04);
}
.zalo-conv-item.is-pinned {
  background-color: rgba(245, 158, 11, 0.035);
}
.zalo-conv-item.is-pinned:hover {
  background-color: rgba(245, 158, 11, 0.07);
}
.zalo-conv-item.is-active {
  background-color: rgba(0, 104, 255, 0.1) !important;
}

.zalo-conv-pin-btn {
  opacity: 0;
  transition: opacity 0.15s ease, transform 0.15s ease;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.zalo-conv-item:hover .zalo-conv-pin-btn,
.zalo-conv-pin-btn.is-pinned {
  opacity: 1;
}
.zalo-conv-pin-btn:hover {
  background: rgba(var(--v-theme-on-surface, 128, 128, 128), 0.1);
  transform: scale(1.15);
}

.zalo-search-action-btn {
  background: transparent;
  border: none;
  outline: none;
  transition: color 0.15s ease, transform 0.15s ease;
}
.zalo-search-action-btn:hover {
  transform: scale(1.1);
}

.zalo-user-search-card {
  background-color: rgba(var(--v-theme-primary), 0.04);
  border-color: rgba(var(--v-theme-primary), 0.2) !important;
  transition: all 0.15s ease;
}
.zalo-user-search-card:hover {
  background-color: rgba(var(--v-theme-primary), 0.1) !important;
  border-color: rgba(var(--v-theme-primary), 0.45) !important;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.needs-confirmation-blink {
  border-left: 4px solid #10B981 !important;
  animation: blink-green 2.5s infinite ease-in-out;
}

@keyframes blink-green {
  0%, 100% { background-color: rgba(16, 185, 129, 0.02); }
  50% { background-color: rgba(16, 185, 129, 0.12); }
}

.needs-handoff-blink {
  border-left: 4px solid #F59E0B !important;
  animation: blink-amber 2.5s infinite ease-in-out;
}

@keyframes blink-amber {
  0%, 100% { background-color: rgba(245, 158, 11, 0.02); }
  50% { background-color: rgba(245, 158, 11, 0.12); }
}

.conv-handoff-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  line-height: 1.2;
  background: rgba(245, 158, 11, 0.15);
  color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.35);
}
</style>
