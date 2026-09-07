<template>
  <div class="message-thread d-flex flex-column flex-grow-1" style="height: 100%;">
    <!-- Empty state -->
    <div v-if="!conversation" class="d-flex align-center justify-center flex-grow-1">
      <div class="text-center text-grey">
        <v-icon icon="lucide-message-circle" size="96" color="grey-lighten-2" />
        <p class="text-h6 mt-4">Chọn cuộc trò chuyện</p>
      </div>
    </div>

    <template v-else>
      <!-- Zalo Chat Header (Responsive for Desktop & Mobile) -->
      <div class="zalo-chat-header d-flex align-center justify-space-between border-b px-2 px-md-3">
        <!-- Left: Back button (Mobile) + Avatar + Title + Subtitle -->
        <div class="d-flex align-center overflow-hidden mr-2 flex-grow-1">
          <v-btn
            v-if="isMobile"
            icon
            variant="text"
            size="small"
            class="mr-1 flex-shrink-0"
            @click="$emit('back')"
            title="Quay lại danh sách"
          >
            <v-icon size="22">lucide-chevron-left</v-icon>
          </v-btn>

          <v-avatar size="40" class="mr-2 mr-md-3 flex-shrink-0 zalo-header-avatar">
            <v-img v-if="conversation.contact?.avatarUrl" :src="conversation.contact.avatarUrl">
              <template #error>
                <v-icon :icon="conversation.threadType === 'group' ? 'lucide-users' : 'lucide-user'" color="white" size="20" />
              </template>
            </v-img>
            <v-icon v-else-if="conversation.threadType === 'group'" icon="lucide-users" color="white" size="20" />
            <v-icon v-else icon="lucide-user" color="white" size="20" />
          </v-avatar>
          <div class="overflow-hidden d-flex flex-column justify-center">
            <div class="d-flex align-center gap-1 mb-0.5">
              <span class="text-subtitle-1 font-weight-bold text-truncate" style="font-size: 15px !important; line-height: 1.2;">
                {{ getContactDisplayName(conversation) }}
              </span>
            </div>
            <div class="text-caption text-grey d-flex align-center gap-1 text-truncate" style="font-size: 11.5px !important; line-height: 1.2;">
              <span v-if="conversation.threadType === 'group'" class="d-flex align-center">
                <v-icon size="12" class="mr-1">lucide-users</v-icon>
                {{ conversation.contact?.tags?.length ? `${conversation.contact.tags.length} thành viên` : 'Nhóm Zalo' }}
              </span>
              <span v-else>
                {{ conversation.zaloAccount?.displayName || 'Đang hoạt động' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Right: Action Icons (Add User, Video, Search, Info Sidebar Toggle) -->
        <div class="d-flex align-center gap-1 gap-md-2 flex-shrink-0">
          <!-- AI Auto Chat Control Badge (Only visible for 'customer' contacts) -->
          <v-menu
            v-if="conversation.threadType === 'user' && conversation.contact?.contactType === 'customer'"
            location="bottom end"
            :close-on-content-click="true"
          >
            <template v-slot:activator="{ props: aiMenuProps }">
              <v-btn
                v-bind="aiMenuProps"
                size="small"
                variant="tonal"
                rounded="md"
                class="text-none font-weight-medium px-1.5 px-md-2"
                :color="conversation.aiPaused ? 'warning' : (conversation.aiActive ? 'success' : 'grey')"
                style="height: 28px; text-transform: none !important;"
              >
                <v-icon start size="14" class="mr-0.5 mr-md-1">
                  {{ conversation.aiPaused ? 'lucide-pause-circle' : (conversation.aiActive ? 'lucide-bot' : 'lucide-bot-off') }}
                </v-icon>
                <span class="d-none d-sm-inline">{{ conversation.aiPaused ? 'AI Tạm dừng' : (conversation.aiActive ? 'AI Đang trực' : 'AI Tắt') }}</span>
                <span class="d-inline d-sm-none">{{ conversation.aiPaused ? 'Tạm dừng' : (conversation.aiActive ? 'AI Bật' : 'AI Tắt') }}</span>
                <v-icon end size="12" class="ml-0.5 opacity-70">lucide-chevron-down</v-icon>
              </v-btn>
            </template>
            <v-list density="compact" class="py-1 elevation-4 rounded-lg" min-width="210">
              <v-list-item
                v-if="conversation.aiPaused"
                prepend-icon="lucide-play"
                title="Bật lại AI Auto Chat"
                @click="$emit('resume-ai', conversation.id)"
              />
              <v-list-item
                v-else-if="conversation.aiActive"
                prepend-icon="lucide-pause"
                title="Tạm dừng AI (60 phút)"
                @click="$emit('pause-ai', conversation.id)"
              />
              <v-list-item
                v-if="conversation.aiActive"
                prepend-icon="lucide-power-off"
                title="Tắt AI cuộc trò chuyện"
                @click="$emit('toggle-ai', conversation.id, false)"
              />
              <v-list-item
                v-else
                prepend-icon="lucide-power"
                title="Bật AI cho Khách hàng này"
                @click="$emit('toggle-ai', conversation.id, true)"
              />
              <v-divider class="my-1" />
              <v-list-item
                v-if="conversation.contextStartMsgId || conversation.contextEndMsgId"
                prepend-icon="lucide-rotate-cw"
                title="Xóa mốc ngữ cảnh (Tự động)"
                subtitle="Đưa về cơ chế đọc tự động"
                @click="$emit('set-context-boundary', { startMessageId: null, endMessageId: null })"
              />
              <v-list-item
                v-if="messages.length > 0"
                prepend-icon="lucide-sparkles"
                title="Bắt đầu phiên AI từ tin nhắn mới nhất"
                subtitle="Ghim mốc tại tin cuối & làm mới giỏ hàng"
                @click="$emit('set-context-boundary', { startMessageId: messages[messages.length - 1].id, resetDraft: true })"
              />
            </v-list>
          </v-menu>

          <button
            type="button"
            class="zalo-header-btn"
            :class="{ 'is-active': conversation.isPinned }"
            :title="conversation.isPinned ? 'Bỏ ghim cuộc trò chuyện' : 'Ghim cuộc trò chuyện lên đầu'"
            @click="$emit('toggle-pin', { conversationId: conversation.id, pinned: !conversation.isPinned })"
          >
            <v-icon size="18" :color="conversation.isPinned ? 'amber-darken-2' : undefined">
              {{ conversation.isPinned ? 'lucide-pin-off' : 'lucide-pin' }}
            </v-icon>
          </button>

          <button
            type="button"
            class="zalo-header-btn"
            :class="{ 'is-active': showContactPanel }"
            @click="$emit('toggle-contact-panel')"
            title="Thông tin hội thoại"
          >
            <v-icon size="19">lucide-panel-right</v-icon>
          </button>
        </div>
      </div>

      <!-- Messages -->
      <div ref="messagesContainer" class="flex-grow-1 overflow-y-auto pa-3 chat-messages-area position-relative" @scroll="onScroll">
        <!-- Centered loading spinner when loading conversation messages -->
        <div v-if="loading && messages.length === 0" class="d-flex flex-column align-center justify-center h-100 py-12" style="min-height: 260px;">
          <v-progress-circular indeterminate size="42" width="3" color="primary" />
          <span class="text-caption text-medium-emphasis mt-3 font-weight-medium">Đang tải cuộc trò chuyện...</span>
        </div>

        <div v-if="loadingMore" class="text-center py-2">
          <v-progress-circular indeterminate size="20" width="2" color="primary" />
          <span class="text-caption text-grey ml-2">Đang tải tin cũ hơn...</span>
        </div>
        <v-progress-linear v-if="loading && messages.length > 0" indeterminate color="primary" class="mb-2" />
        <template v-for="msg in messages.filter(m => !isUndoSyncMessage(m))" :key="msg.id">
          <!-- AI Context Start Marker Divider -->
          <div
            v-if="isContextStart(msg)"
            class="w-100 d-flex justify-center my-3 ai-context-boundary-divider ai-context-start"
          >
            <div class="ai-context-pill ai-context-start-pill elevation-2 d-flex align-center gap-2 px-3 py-1.5 rounded-pill">
              <v-icon size="15" color="white">lucide-sparkles</v-icon>
              <span class="ai-context-pill-title">Bắt đầu ngữ cảnh AI</span>
              <span class="ai-context-pill-sub d-none d-sm-inline">(AI ghi nhớ từ tin nhắn này)</span>
              <button
                type="button"
                class="ai-context-close-btn ml-1.5"
                title="Xóa mốc bắt đầu"
                @click.stop="$emit('set-context-boundary', { startMessageId: null })"
              >
                <v-icon size="13" color="white">lucide-x</v-icon>
              </button>
            </div>
          </div>

          <div class="mb-3 d-flex message-row-wrapper" :class="msg.senderType === 'self' ? 'justify-end' : 'justify-start'">
            <div class="message-container position-relative" style="max-width: 70%;">
              <!-- Floating Reaction Bar on hover -->
              <div class="message-action-bar" :class="msg.senderType === 'self' ? 'message-action-bar-self' : 'message-action-bar-contact'">
                <div class="floating-reaction-bar elevation-2">
                  <button
                    v-for="r in quickReactions"
                    :key="r.icon"
                    class="reaction-btn"
                    :class="{ 'active-reaction': getUserReaction(msg)?.icon === r.icon }"
                    :title="r.label"
                    @click.stop="onToggleReaction(msg, r.icon)"
                  >
                    <span class="reaction-emoji">{{ r.emoji }}</span>
                  </button>

                  <!-- Plus button for extra emojis -->
                  <v-menu location="top center" :close-on-content-click="true">
                    <template v-slot:activator="{ props: menuProps }">
                      <button class="reaction-btn reaction-btn-more" v-bind="menuProps" title="Thêm biểu tượng">
                        <v-icon size="16">lucide-plus</v-icon>
                      </button>
                    </template>
                    <v-card width="300" class="pa-2 emoji-picker-popover rounded-lg">
                      <div class="d-flex flex-wrap" style="max-height: 220px; overflow-y: auto;">
                        <div
                          v-for="extra in extraReactionEmojis"
                          :key="extra.icon"
                          class="pa-1 text-center cursor-pointer emoji-item-mini"
                          :title="extra.label"
                          @click="onToggleReaction(msg, extra.icon)"
                        >
                          {{ extra.emoji }}
                        </div>
                      </div>
                    </v-card>
                  </v-menu>

                  <!-- Remove reaction button if already reacted -->
                  <button
                    v-if="getUserReaction(msg)"
                    class="reaction-btn reaction-btn-remove"
                    title="Gỡ cảm xúc"
                    @click.stop="onToggleReaction(msg, '')"
                  >
                    <v-icon size="16" color="grey-darken-1">lucide-heart-off</v-icon>
                  </button>

                  <!-- Reply Button -->
                  <div class="reaction-separator mx-1 align-self-center" style="width: 1px; height: 16px; background-color: rgba(0,0,0,0.12);"></div>
                  <button
                    class="reaction-btn"
                    title="Trả lời"
                    @click.stop="replyingToMessage = msg"
                  >
                    <v-icon size="16" color="grey-darken-2">lucide-reply</v-icon>
                  </button>

                  <!-- AI Context Marker Button -->
                  <div class="reaction-separator mx-1 align-self-center" style="width: 1px; height: 16px; background-color: rgba(0,0,0,0.12);"></div>
                  <v-menu location="top center" :close-on-content-click="true">
                    <template v-slot:activator="{ props: ctxMenuProps }">
                      <button
                        class="reaction-btn"
                        v-bind="ctxMenuProps"
                        :class="{ 'active-context-marker text-primary font-weight-bold': isContextStart(msg) || isContextEnd(msg) }"
                        title="Ngữ cảnh AI"
                      >
                        <v-icon size="15" :color="isContextStart(msg) ? 'primary' : 'grey-darken-2'">lucide-sparkles</v-icon>
                      </button>
                    </template>
                    <v-list density="compact" class="py-1 elevation-4 rounded-lg" min-width="240">
                      <v-list-item
                        prepend-icon="lucide-play"
                        title="Đặt làm BẮT ĐẦU ngữ cảnh AI"
                        subtitle="AI chỉ đọc từ tin nhắn này trở đi"
                        @click="$emit('set-context-boundary', { startMessageId: msg.id })"
                      />
                      <v-list-item
                        prepend-icon="lucide-rotate-ccw"
                        title="Bắt đầu phiên AI mới từ đây"
                        subtitle="Ghim mốc & làm mới giỏ hàng"
                        @click="$emit('set-context-boundary', { startMessageId: msg.id, resetDraft: true })"
                      />
                      <v-list-item
                        prepend-icon="lucide-flag"
                        title="Đặt làm KẾT THÚC ngữ cảnh AI"
                        subtitle="Chặn AI không đọc sau tin nhắn này"
                        @click="$emit('set-context-boundary', { endMessageId: msg.id })"
                      />
                      <v-divider v-if="isContextStart(msg) || isContextEnd(msg)" class="my-1" />
                      <v-list-item
                        v-if="isContextStart(msg)"
                        prepend-icon="lucide-trash-2"
                        title="Xóa mốc Bắt đầu"
                        class="text-error"
                        @click="$emit('set-context-boundary', { startMessageId: null })"
                      />
                      <v-list-item
                        v-if="isContextEnd(msg)"
                        prepend-icon="lucide-trash-2"
                        title="Xóa mốc Kết thúc"
                        class="text-error"
                        @click="$emit('set-context-boundary', { endMessageId: null })"
                      />
                    </v-list>
                  </v-menu>
                </div>
              </div>

            <div v-if="(conversation.threadType === 'group' && msg.senderType !== 'self') || (msg.isNote && msg.senderName)" class="text-caption mb-1 sender-name-label font-weight-medium">
              {{ msg.senderName || 'Unknown' }}
            </div>
            <div
              class="message-bubble position-relative elevation-0"
              :class="[
                isTransparentBubble(msg) ? 'bubble-transparent' : (
                  msg.isNote ? 'note-message-bubble' : (
                    msg.senderType === 'self' ? 'bubble-outbound' : 'bubble-inbound'
                  )
                ),
                getImageCaption(msg) ? 'bubble-with-image-caption' : '',
                msg.status === 'failed' ? 'bubble-failed-border' : ''
              ]"
              style="word-wrap: break-word;">
              <!-- Quote Block -->
              <div v-if="msg.replyTo" class="quoted-message-box pa-2 mb-2 rounded text-caption border-l-2">
                <div class="font-weight-bold text-caption text-truncate text-warning">
                  {{ msg.replyTo.senderName || 'Khách hàng' }}
                </div>
                <div class="text-truncate text-grey-darken-2" style="font-size: 0.75rem;">
                  {{ msg.replyTo.content }}
                </div>
              </div>

              <!-- Image -->
              <div v-if="getImageUrl(msg)" class="chat-image-container">
                <div v-if="failedImages[msg.id]" class="chat-image-error-box pa-3 rounded-lg d-flex align-center gap-2">
                  <v-icon size="20" color="grey">lucide-image-off</v-icon>
                  <div class="text-caption text-grey-darken-1">
                    <div class="font-weight-medium" style="font-size: 12px; line-height: 1.3;">Ảnh không khả dụng</div>
                    <div style="font-size: 11px; opacity: 0.8; line-height: 1.2;">Liên kết ảnh Zalo đã hết hạn</div>
                  </div>
                </div>
                <div v-else class="chat-image-wrapper position-relative">
                  <img
                    :src="getImageUrl(msg)!"
                    alt="Hình ảnh"
                    class="chat-image"
                    :class="{'chat-image-with-caption': !!getImageCaption(msg)}"
                    loading="lazy"
                    @error="onMessageImageError(msg.id)"
                    @click="openMessageImage(msg)"
                  />
                  <!-- Optimistic uploading overlay for images -->
                  <div v-if="msg.status === 'sending'" class="chat-image-uploading-overlay d-flex align-center justify-center">
                    <v-progress-circular indeterminate size="28" width="3" color="white" />
                  </div>
                </div>
                <div v-if="getImageCaption(msg)" class="message-text-content image-caption-text" v-html="parseDisplayContentHtml(getImageCaption(msg))"></div>
              </div>
              <!-- Video (rendered with video player) -->
              <div v-else-if="isVideoMessage(msg)" class="video-message">
                <video v-if="getVideoUrl(msg)" :src="getVideoUrl(msg)!" controls preload="metadata" class="chat-video" playsinline />
                <div v-else class="d-flex align-center pa-2">
                  <v-icon size="20" class="mr-2" color="info">lucide-video</v-icon>
                  <span>🎥 Video</span>
                </div>
              </div>
              <!-- File/PDF -->
              <div v-else-if="getFileInfo(msg)" class="file-card">
                <v-icon size="20" class="mr-2" color="info">lucide-file-text</v-icon>
                <div class="flex-grow-1">
                  <div class="text-body-2 font-weight-medium">{{ getFileInfo(msg)!.name }}</div>
                  <div class="text-caption" style="opacity: 0.6;">{{ getFileInfo(msg)!.size }}</div>
                </div>
                <v-btn
                  v-if="getFileInfo(msg)!.href"
                  icon
                  size="x-small"
                  variant="text"
                  title="Tải về"
                  @click.stop="downloadFile(getFileInfo(msg)!.href, getFileInfo(msg)!.name)"
                >
                  <v-icon size="16">lucide-download</v-icon>
                </v-btn>
              </div>
              <!-- Sticker/Voice/GIF -->
              <div v-else-if="msg.contentType === 'sticker'" class="d-flex align-center">
                <v-img :src="getStickerUrl(msg) || ''" alt="Sticker" width="120" height="120" contain />
              </div>
              <div v-else-if="msg.contentType === 'voice'">🎤 Tin nhắn thoại</div>
              <div v-else-if="msg.contentType === 'gif'">
                <div v-if="failedImages[msg.id]" class="chat-image-error-box pa-3 rounded-lg d-flex align-center gap-2">
                  <v-icon size="20" color="grey">lucide-image-off</v-icon>
                  <div class="text-caption text-grey-darken-1">
                    <div class="font-weight-medium" style="font-size: 12px; line-height: 1.3;">GIF không khả dụng</div>
                    <div style="font-size: 11px; opacity: 0.8; line-height: 1.2;">Liên kết ảnh đã hết hạn</div>
                  </div>
                </div>
                <img
                  v-else
                  :src="getParsedContent(msg)?.href"
                  alt="GIF"
                  style="max-width: 200px; border-radius: 8px; cursor: pointer;"
                  @error="onMessageImageError(msg.id)"
                  @click="openMessageImage(msg)"
                />
              </div>
              <!-- Reminder/Calendar -->
              <div v-else-if="isReminderMessage(msg)" class="reminder-card">
                <div class="d-flex align-center mb-1">
                  <v-icon size="16" color="warning" class="mr-1">lucide-calendar-clock</v-icon>
                  <span class="text-caption font-weight-medium text-graphite">Nhắc hẹn</span>
                </div>
                <div class="text-body-2">{{ getReminderTitle(msg) }}</div>
                <div v-if="getReminderTime(msg)" class="text-caption mt-1" style="opacity: 0.7;">
                  <v-icon size="12" class="mr-1">lucide-clock</v-icon>{{ getReminderTime(msg) }}
                </div>
                <v-btn size="x-small" variant="tonal" color="warning" class="mt-2" prepend-icon="lucide-calendar-sync" @click="syncAppointment(msg)">
                  Đồng bộ lịch
                </v-btn>
              </div>
              <!-- Call Event (Cuộc gọi thoại / Video / Cuộc gọi nhỡ) -->
              <div v-else-if="!isVideoMessage(msg) && isCallMessage(msg)" class="call-event-card">
                <div class="d-flex align-center">
                  <div
                    class="call-icon-circle d-flex align-center justify-center flex-shrink-0 mr-3"
                    :style="{ background: getCallInfo(msg).iconBg }"
                  >
                    <v-icon :color="getCallInfo(msg).iconColor" size="20">{{ getCallInfo(msg).icon }}</v-icon>
                  </div>
                  <div class="call-info flex-grow-1 min-w-0 pr-2">
                    <div class="d-flex align-center gap-2">
                      <span class="call-title font-weight-bold text-body-2" :style="{ color: getCallInfo(msg).iconColor }">
                        {{ getCallInfo(msg).title }}
                      </span>
                      <span
                        v-if="getCallInfo(msg).status === 'connected' && getCallInfo(msg).formattedDuration"
                        class="call-duration-badge"
                      >
                        {{ getCallInfo(msg).formattedDuration }}
                      </span>
                    </div>
                    <div class="call-subtitle text-caption text-grey-darken-1 mt-0.5">
                      {{ getCallInfo(msg).subtitle }}
                    </div>
                  </div>
                </div>
              </div>
              <!-- Default text -->
              <div v-else class="message-text-content" v-html="parseDisplayContentHtml(msg.content)"></div>
              <!-- Timestamp & Sending Status -->
              <div class="text-caption msg-time d-flex align-center" :class="[
                isTransparentBubble(msg) ? 'text-grey justify-end' : (
                  msg.isNote ? 'msg-time-note' : (
                    msg.senderType === 'self' ? 'msg-time-self justify-end' : 'msg-time-contact justify-start'
                  )
                )
              ]">
                <span v-if="msg.isAi" class="mr-1 font-weight-bold" style="font-size: 10px; color: #10b981; background: rgba(16, 185, 129, 0.15); padding: 1px 4px; border-radius: 4px;">AI</span>
                <span>{{ formatMessageTime(msg.sentAt) }}</span>
                <!-- Status icon for self messages -->
                <span v-if="msg.senderType === 'self' && msg.status === 'sending'" class="ml-1 d-inline-flex align-center" title="Đang gửi...">
                  <v-progress-circular indeterminate size="10" width="1.5" color="grey" />
                </span>
                <span v-else-if="msg.senderType === 'self' && msg.status === 'failed'" class="ml-1 d-inline-flex align-center text-error" title="Gửi thất bại">
                  <v-icon size="13" color="error">lucide-alert-circle</v-icon>
                </span>
                <span v-else-if="msg.senderType === 'self' && msg.status === 'sent'" class="ml-1 d-inline-flex align-center text-primary" title="Đã gửi">
                  <v-icon size="12">lucide-check</v-icon>
                </span>
              </div>

              <!-- Error & Retry toolbar for failed message -->
              <div v-if="msg.senderType === 'self' && msg.status === 'failed'" class="msg-failed-actions mt-1 pt-1 border-t d-flex align-center justify-space-between gap-1">
                <span class="text-caption text-error font-weight-medium d-flex align-center" style="font-size: 11px;">
                  <v-icon size="12" color="error" class="mr-1">lucide-alert-triangle</v-icon>
                  Chưa gửi được
                </span>
                <div class="d-flex align-center gap-1">
                  <v-btn
                    size="x-small"
                    variant="tonal"
                    color="primary"
                    density="compact"
                    class="text-none font-weight-bold px-1.5"
                    style="height: 22px; font-size: 11px;"
                    title="Thử gửi lại tin nhắn này"
                    @click.stop="handleRetry(msg)"
                  >
                    <v-icon size="11" class="mr-0.5">lucide-rotate-cw</v-icon> Thử lại
                  </v-btn>
                  <v-btn
                    size="x-small"
                    variant="tonal"
                    color="warning"
                    density="compact"
                    class="text-none font-weight-bold px-1.5"
                    style="height: 22px; font-size: 11px;"
                    title="Đưa nội dung trở lại ô nhập để không bị mất"
                    @click.stop="handleRestore(msg)"
                  >
                    <v-icon size="11" class="mr-0.5">lucide-edit-3</v-icon> Khôi phục
                  </v-btn>
                </div>
              </div>

              <!-- Reaction Summary Pill on message -->
              <div
                v-if="msg.reactions && msg.reactions.length > 0"
                class="reaction-summary-pill"
                :class="msg.senderType === 'self' ? 'reaction-pill-self' : 'reaction-pill-contact'"
                @click.stop="openReactionDetail(msg)"
                title="Xem chi tiết cảm xúc"
              >
                <span v-for="distinct in getDistinctReactions(msg)" :key="distinct.emoji" class="pill-emoji">
                  {{ distinct.emoji }}
                </span>
                <span class="pill-count font-weight-bold">{{ getTotalReactionsCount(msg) }}</span>
              </div>
            </div>
          </div>
        </div>

          <!-- AI Context End Marker Divider -->
          <div
            v-if="isContextEnd(msg)"
            class="w-100 d-flex justify-center my-3 ai-context-boundary-divider ai-context-end"
          >
            <div class="ai-context-pill ai-context-end-pill elevation-2 d-flex align-center gap-2 px-3 py-1.5 rounded-pill">
              <v-icon size="15" color="white">lucide-flag</v-icon>
              <span class="ai-context-pill-title">Kết thúc ngữ cảnh AI</span>
              <span class="ai-context-pill-sub d-none d-sm-inline">(AI dừng đọc tại đây)</span>
              <button
                type="button"
                class="ai-context-close-btn ml-1.5"
                title="Xóa mốc kết thúc"
                @click.stop="$emit('set-context-boundary', { endMessageId: null })"
              >
                <v-icon size="13" color="white">lucide-x</v-icon>
              </button>
            </div>
          </div>
        </template>
        <div v-if="!loading && messages.filter(m => !isUndoSyncMessage(m)).length === 0" class="text-center pa-8 text-grey">Chưa có tin nhắn</div>
      </div>

      <!-- Input -->
      <div
        class="chat-input-area bg-surface"
        :class="{ 'is-drag-over': isDraggingOver }"
        style="position: relative;"
        @paste="handlePaste"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <!-- Drag & Drop overlay cue -->
        <transition name="fade-transition">
          <div v-if="isDraggingOver" class="chat-drag-overlay d-flex flex-column align-center justify-center">
            <v-icon size="36" color="primary" class="mb-1">lucide-image-plus</v-icon>
            <span class="text-subtitle-2 font-weight-bold text-primary">Thả hình ảnh vào đây để đính kèm</span>
          </div>
        </transition>

        <!-- Mode selection (Reply / Note / Order) -->
        <div class="px-3 pt-2 pb-1 d-flex align-center gap-2 border-b">
          <v-btn
            size="small"
            :color="(!isNoteMode) ? 'primary' : 'grey-darken-1'"
            class="font-weight-bold"
            prepend-icon="lucide-message-square"
            @click="switchToReplyMode"
            style="text-transform: none; border-radius: 4px;"
            :variant="(!isNoteMode) ? 'tonal' : 'text'"
          >
            Trả lời
          </v-btn>
          <v-btn
            size="small"
            :color="isNoteMode ? 'warning' : 'grey-darken-1'"
            class="font-weight-bold"
            prepend-icon="lucide-lock"
            @click="switchToNoteMode"
            style="text-transform: none; border-radius: 4px;"
            :variant="isNoteMode ? 'tonal' : 'text'"
          >
            Ghi chú (Private)
          </v-btn>
          <v-btn
            size="small"
            :color="showOrderPanel ? 'success' : 'grey-darken-1'"
            class="font-weight-bold"
            prepend-icon="lucide-shopping-cart"
            @click="$emit('open-order-panel')"
            style="text-transform: none; border-radius: 6px;"
            :variant="showOrderPanel ? 'tonal' : 'text'"
          >
            Tạo đơn
          </v-btn>
        </div>

        <!-- Confirmation dialog: Note → Reply mode switch -->
        <v-dialog v-model="showSwitchModeDialog" max-width="420" persistent>
          <v-card rounded="lg">
            <v-card-title class="text-body-1 font-weight-bold pa-4 pb-2 d-flex align-center gap-2">
              <v-icon color="warning" size="22">lucide-alert-triangle</v-icon>
              Chuyển sang chế độ Trả lời?
            </v-card-title>
            <v-card-text class="px-4 pb-4 text-body-2">
              Nội dung hiện tại đang ở chế độ <strong>Ghi chú nội bộ</strong>. Nếu chuyển sang <strong>Trả lời</strong>, tin nhắn sẽ được gửi trực tiếp tới khách hàng qua Zalo.
            </v-card-text>
            <v-card-actions class="px-4 pb-4">
              <v-spacer />
              <v-btn variant="text" color="grey-darken-1" @click="showSwitchModeDialog = false">
                Hủy
              </v-btn>
              <v-btn variant="tonal" color="primary" @click="confirmSwitchToReply">
                Chuyển sang Trả lời
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Quick messages suggestion dropdown -->
        <div
          v-if="showQuickMessagesDropdown && filteredQuickMessages.length > 0"
          class="quick-messages-dropdown elevation-4 rounded-lg border"
        >
          <div class="pa-2 bg-surface border-b text-caption text-grey d-flex justify-space-between align-center">
            <span class="font-weight-medium">
              Gợi ý tin nhắn nhanh (Nhấn ↑↓ để chọn, Enter để áp dụng)
            </span>
            <v-btn
              icon
              size="x-small"
              variant="text"
              @click="showQuickMessagesDropdown = false"
            >
              <v-icon size="14">lucide-x</v-icon>
            </v-btn>
          </div>
          <div class="quick-messages-list overflow-y-auto" style="max-height: 200px;">
            <div
              v-for="(msg, idx) in filteredQuickMessages"
              :key="msg.id"
              class="quick-message-option-item pa-2.5 cursor-pointer d-flex align-center justify-space-between border-b"
              :class="{ 'active-option': idx === activeQuickMessageIndex, 'note-trigger-option': msg.isNoteTrigger }"
              @click="selectQuickMessage(msg)"
              @mouseenter="activeQuickMessageIndex = idx"
            >
              <div class="flex-grow-1 text-truncate mr-2">
                <div class="d-flex align-center flex-wrap gap-1 mb-0.5">
                  <span class="font-weight-bold text-primary text-body-2">/{{ msg.shortcut }}</span>
                  <span class="text-caption text-grey font-weight-medium">— {{ msg.title }}</span>
                </div>
                <div class="text-caption text-grey-darken-1 text-truncate" style="max-width: 480px;">
                  {{ msg.content }}
                </div>
              </div>
              <v-icon v-if="idx === activeQuickMessageIndex" size="16" color="primary">
                lucide-corner-down-left
              </v-icon>
            </div>
          </div>
        </div>

        <!-- Mentions suggestion dropdown -->
        <div
          v-if="showMentionsDropdown && filteredMentionUsers.length > 0"
          class="quick-messages-dropdown elevation-4 rounded-lg border"
        >
          <div class="pa-2 bg-surface border-b text-caption text-grey d-flex justify-space-between align-center">
            <span class="font-weight-medium">
              {{ isNoteMode ? 'Nhắc tên đồng nghiệp nội bộ (Nhấn ↑↓ để chọn, Enter để áp dụng)' : 'Nhắc tên thành viên (Nhấn ↑↓ để chọn, Enter để áp dụng)' }}
            </span>
            <v-btn
              icon
              size="x-small"
              variant="text"
              @click="showMentionsDropdown = false"
            >
              <v-icon size="14">lucide-x</v-icon>
            </v-btn>
          </div>
          <div class="quick-messages-list overflow-y-auto" style="max-height: 220px;">
            <div
              v-for="(u, idx) in filteredMentionUsers"
              :key="u.id"
              class="quick-message-option-item pa-3 cursor-pointer d-flex align-center gap-3 border-b"
              :class="{ 'active-option': idx === activeMentionIndex }"
              @click="selectMentionUser(u)"
              @mouseenter="activeMentionIndex = idx"
            >
              <v-avatar v-if="u.isStaff" size="32" class="border flex-shrink-0" style="background-color: #f5f5f5;">
                <v-img :src="logoLight" alt="Avatar" />
              </v-avatar>
              <v-avatar v-else-if="u.isAll" size="32" color="primary" class="text-white flex-shrink-0">
                <v-icon size="18">lucide-users</v-icon>
              </v-avatar>
              <v-avatar v-else-if="u.avatarUrl" size="32" class="border flex-shrink-0">
                <v-img :src="u.avatarUrl" alt="Avatar" />
              </v-avatar>
              <v-avatar v-else size="32" color="blue-lighten-4" class="text-primary font-weight-bold text-caption flex-shrink-0">
                {{ u.name ? u.name.charAt(0).toUpperCase() : '@' }}
              </v-avatar>

              <div class="flex-grow-1">
                <div class="font-weight-bold text-body-2 mb-0.5" style="line-height: 1.2;">
                  {{ u.name }}
                </div>
                <div class="text-caption text-grey-darken-1" style="line-height: 1.2;">
                  {{ u.subtitle }}
                </div>
              </div>
              <v-icon v-if="idx === activeMentionIndex" size="18" color="primary">
                lucide-corner-down-left
              </v-icon>
            </div>
          </div>
        </div>

        <!-- Quote Reply Preview Bar -->
        <v-expand-transition>
          <div v-if="replyingToMessage" class="px-3 py-2 border-b bg-surface d-flex align-center justify-space-between">
            <div class="d-flex align-center flex-grow-1 text-truncate border-l-3 pl-2" style="border-left: 3px solid #ff9800;">
              <div class="text-truncate">
                <div class="text-caption font-weight-bold text-warning">
                  Đang trả lời {{ replyingToMessage.senderName || 'Khách hàng' }}
                </div>
                <div class="text-caption text-grey-darken-1 text-truncate" style="max-width: 500px;">
                  {{ replyingToMessage.content }}
                </div>
              </div>
            </div>
            <v-btn
              icon
              size="x-small"
              variant="text"
              color="grey-darken-1"
              @click="replyingToMessage = null"
              class="ml-2"
            >
              <v-icon size="14">lucide-x</v-icon>
            </v-btn>
          </div>
        </v-expand-transition>

        <!-- Pending Attachments Preview Bar -->
        <v-expand-transition>
          <div v-if="pendingAttachments.length > 0" class="pending-attachments-bar px-3 py-2 border-b d-flex align-center gap-2 overflow-x-auto">
            <div
              v-for="att in pendingAttachments"
              :key="att.id"
              class="pending-attachment-item position-relative flex-shrink-0"
            >
              <!-- Image/Video thumbnail -->
              <v-card
                v-if="att.type === 'image' || att.type === 'video'"
                variant="outlined"
                class="rounded-lg overflow-hidden border"
                width="72"
                height="72"
              >
                <v-img :src="att.preview" width="72" height="72" cover style="cursor: pointer;" @click="openSingleImagePreview(att.preview, att.name)" />
                <div v-if="att.type === 'video'" class="d-flex align-center justify-center" style="position: absolute; inset: 0; background: rgba(0,0,0,0.3);">
                  <v-icon color="white" size="24">lucide-play</v-icon>
                </div>
              </v-card>
              <!-- File icon -->
              <v-card
                v-else
                variant="outlined"
                class="rounded-lg d-flex flex-column align-center justify-center border pa-1"
                width="72"
                height="72"
              >
                <v-icon size="24" color="grey-darken-1">lucide-file-text</v-icon>
                <span class="text-caption text-truncate mt-1" style="max-width: 60px; font-size: 9px;">{{ att.name }}</span>
              </v-card>
              <!-- Delete button -->
              <v-btn
                icon
                size="18"
                color="error"
                variant="flat"
                class="position-absolute"
                style="top: -5px; right: -5px; z-index: 10;"
                @click="removePendingAttachment(att.id)"
              >
                <v-icon size="10">lucide-x</v-icon>
              </v-btn>
            </div>
          </div>
        </v-expand-transition>

        <!-- Zalo PC Input & Toolbar Container -->
        <div class="zalo-chat-input-container border-t">
          <!-- 1. Horizontal Toolbar Row (Snug fit) -->
          <div class="zalo-chat-toolbar d-flex align-center px-3 py-0 gap-1">
            <!-- Hidden file input for media and documents -->
            <input type="file" ref="fileInput" class="d-none" multiple @change="handleFileChange" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar" />

            <!-- Sticker Picker -->
            <v-menu location="top start" :close-on-content-click="false" @update:model-value="onStickerMenuToggle">
              <template #activator="{ props: stickerProps }">
                <button type="button" class="zalo-tool-icon-btn d-flex align-center justify-center" v-bind="stickerProps" title="Gửi Sticker Zalo">
                  <v-icon size="19">lucide-smile-plus</v-icon>
                </button>
              </template>
              <v-card width="330" class="pa-2 zalo-sticker-popover elevation-4">
                <div class="d-flex align-center justify-space-between mb-2 px-1">
                  <span class="text-subtitle-2 font-weight-bold">Nhãn dán Zalo</span>
                  <v-text-field
                    v-model="stickerSearchQuery"
                    placeholder="Tìm sticker..."
                    variant="outlined"
                    density="compact"
                    hide-details
                    append-inner-icon="lucide-search"
                    class="sticker-search-input"
                    @keydown.enter="fetchStickers"
                    style="max-width: 140px;"
                  />
                </div>
                <v-divider class="mb-2"></v-divider>
                <div v-if="loadingStickers" class="d-flex justify-center align-center py-6">
                  <v-progress-circular indeterminate size="24" color="primary"></v-progress-circular>
                </div>
                <div v-else-if="stickersList.length === 0" class="text-center py-6 text-grey text-caption">
                  Không tìm thấy sticker nào cho "{{ stickerSearchQuery }}"
                </div>
                <v-row v-else dense style="max-height: 250px; overflow-y: auto;">
                  <v-col cols="3" v-for="sticker in stickersList" :key="sticker.id">
                    <v-card variant="flat" class="pa-1 text-center cursor-pointer sticker-card-item" @click="sendSticker(sticker)">
                      <v-img :src="sticker.stickerUrl || sticker.stickerWebpUrl" height="60" contain />
                    </v-card>
                  </v-col>
                </v-row>
              </v-card>
            </v-menu>

            <!-- Send Image -->
            <button type="button" class="zalo-tool-icon-btn d-flex align-center justify-center" @click="triggerFileInput" title="Gửi hình ảnh">
              <v-icon size="19">lucide-image</v-icon>
            </button>

            <!-- Attach File -->
            <button type="button" class="zalo-tool-icon-btn d-flex align-center justify-center" @click="triggerFileInput" title="Đính kèm file">
              <v-icon size="19">lucide-paperclip</v-icon>
            </button>

            <!-- Send Contact Card -->
            <button type="button" class="zalo-tool-icon-btn d-flex align-center justify-center" title="Gửi danh thiếp">
              <v-icon size="19">lucide-contact</v-icon>
            </button>

            <!-- Quick Template Messages -->
            <button
              type="button"
              class="zalo-tool-icon-btn d-flex align-center justify-center"
              title="Tin nhắn mẫu nhanh (Gõ /)"
              @click="inputText = '/' + inputText"
            >
              <v-icon size="19">lucide-zap</v-icon>
            </button>

            <!-- Note Mode Switch (CRM Staff only) -->
            <button
              type="button"
              class="zalo-tool-icon-btn d-flex align-center justify-center"
              :class="{ 'is-note-active': isNoteMode }"
              @click="isNoteMode = !isNoteMode"
              :title="isNoteMode ? 'Đang bật Ghi chú nội bộ (Khách không thấy)' : 'Chuyển sang Ghi chú nội bộ'"
            >
              <v-icon size="19">lucide-sticky-note</v-icon>
            </button>
          </div>

          <!-- 2. Text Input Row (Aligned with hint text) -->
          <div class="zalo-chat-input-row d-flex align-start px-4 pb-3 pt-1 gap-2">
            <v-textarea
              v-model="inputText"
              :placeholder="placeholderText"
              variant="plain"
              density="compact"
              hide-details
              auto-grow
              rows="2"
              max-rows="8"
              @keydown.down.exact.prevent="handleQuickMsgKeyDown"
              @keydown.up.exact.prevent="handleQuickMsgKeyUp"
              @keydown.enter.exact.prevent="handleQuickMsgKeyEnter"
              @paste="handlePaste"
              class="zalo-input-textarea flex-grow-1"
              :class="{ 'note-mode-textarea': isNoteMode }"
            />

            <!-- Right Actions: Emoji Picker + Send/Like Button -->
            <div class="d-flex align-center gap-1.5 flex-shrink-0" style="margin-top: 4px;">
              <!-- Emoji Picker -->
              <v-menu location="top end" :close-on-content-click="false">
                <template #activator="{ props: smileProps }">
                  <button type="button" class="zalo-tool-icon-btn d-flex align-center justify-center" v-bind="smileProps" title="Biểu tượng cảm xúc">
                    <v-icon size="20">lucide-smile</v-icon>
                  </button>
                </template>
                <v-card width="340" class="pa-2 elevation-4">
                  <div class="text-subtitle-2 font-weight-bold mb-2 px-1">Biểu tượng cảm xúc</div>
                  <v-divider class="mb-2"></v-divider>
                  <div class="d-flex flex-wrap" style="max-height: 260px; overflow-y: auto;">
                    <div v-for="emoji in standardEmojis" :key="emoji" class="pa-1.5 text-center cursor-pointer emoji-item" @click="insertEmoji(emoji)">
                      {{ emoji }}
                    </div>
                  </div>
                </v-card>
              </v-menu>

              <!-- Send Button or Thumbs-up (Like) Button -->
              <button
                v-if="inputText.trim() || pendingAttachments.length > 0"
                type="button"
                class="zalo-send-circle-btn d-flex align-center justify-center"
                :disabled="!canSend || sending"
                @click="handleSend"
                title="Gửi tin nhắn (Enter)"
              >
                <v-icon size="16" color="white">lucide-send</v-icon>
              </button>
              <button
                v-else
                type="button"
                class="zalo-like-btn d-flex align-center justify-center"
                @click="sendLikeEmoji"
                title="Gửi nút thích 👍"
              >
                <v-icon size="22" color="#f59e0b">lucide-thumbs-up</v-icon>
              </button>
            </div>
          </div>
          
          <!-- No Tab Tạo Đơn since it's moved to a right drawer -->
        </div>
      </div>
    </template>

    <!-- Modern Image Viewer Modal with Zoom, Pan, Rotate, and Gallery Navigation -->
    <ImageViewerModal
      v-model="showImageViewer"
      :images="standaloneViewerImages.length > 0 ? standaloneViewerImages : conversationImages"
      :initial-index="activeViewerIndex"
    />

    <!-- Reaction Detail Dialog (Zalo Style Modal) -->
    <v-dialog v-model="showReactionModal" max-width="420" scrollable>
      <v-card class="rounded-xl reaction-detail-dialog elevation-4">
        <!-- Drag bar handle -->
        <div class="d-flex justify-center pt-3 pb-1">
          <div class="drag-bar-indicator"></div>
        </div>

        <!-- Reaction Category Tabs -->
        <div class="reaction-tabs-header px-4 pt-1 d-flex align-center">
          <div
            class="reaction-tab-item cursor-pointer"
            :class="{ 'active-tab': activeReactionTab === 'all' }"
            @click="activeReactionTab = 'all'"
          >
            <span class="font-weight-medium">Tất cả</span>
            <span class="ml-1 text-body-2 font-weight-bold">{{ getTotalReactionsCount(selectedReactionMsg) }}</span>
          </div>

          <div
            v-for="item in modalDistinctReactions"
            :key="item.emoji"
            class="reaction-tab-item cursor-pointer ml-3 d-flex align-center"
            :class="{ 'active-tab': activeReactionTab === item.emoji }"
            @click="activeReactionTab = item.emoji"
          >
            <span class="mr-1 pill-emoji">{{ item.emoji }}</span>
            <span class="text-body-2 font-weight-bold">{{ item.count }}</span>
          </div>
        </div>

        <!-- User Reaction List (Grouped by User as in Zalo) -->
        <v-card-text class="pa-3" style="max-height: 380px; min-height: 160px;">
          <div v-if="groupedReactionUsers.length === 0" class="text-center py-8 text-grey text-body-2">
            Không có cảm xúc nào
          </div>

          <div
            v-for="user in groupedReactionUsers"
            :key="user.uid"
            class="reaction-user-row d-flex align-center justify-space-between pa-2 px-3 mb-2 rounded-lg"
          >
            <div class="d-flex align-center flex-grow-1 mr-2">
              <v-avatar size="44" class="mr-3 avatar-container position-relative">
                <v-img v-if="user.avatarUrl" :src="user.avatarUrl" />
                <v-avatar v-else color="grey-lighten-3" size="44">
                  <v-icon icon="lucide-user" color="grey-darken-1" size="22" />
                </v-avatar>
              </v-avatar>
              <div class="user-reaction-info">
                <div class="font-weight-bold text-body-2 text-graphite">
                  {{ user.userName }}
                </div>
                <div class="d-flex align-center mt-1">
                  <!-- On 'all' tab: list all emojis and total count -->
                  <template v-if="activeReactionTab === 'all'">
                    <span v-for="re in user.reactions" :key="re.emoji" class="mr-1.5 user-row-emoji">
                      {{ re.emoji }}
                    </span>
                    <span class="text-caption text-grey-darken-1 font-weight-bold ml-0.5">{{ user.displayCount }}</span>
                  </template>

                  <!-- On specific emoji tab: show ONLY this emoji and its count for this user -->
                  <template v-else>
                    <span class="mr-1.5 user-row-emoji">
                      {{ activeReactionTab }}
                    </span>
                    <span class="text-caption text-grey-darken-1 font-weight-bold">{{ user.displayCount }}</span>
                  </template>
                </div>
              </div>
            </div>

            <!-- "Gỡ" button if this is self reaction -->
            <button
              v-if="user.isSelf"
              class="reaction-remove-pill-btn"
              @click="removeSelfReactionInModal"
            >
              Gỡ
            </button>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Sync snackbar -->
    <v-snackbar v-model="syncSnack.show" :color="syncSnack.color" timeout="3000">{{ syncSnack.text }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted } from 'vue';
import type { Conversation, Message, MessageReactionItem } from '@/composables/use-chat';
import { api } from '@/api/index';
import logoLight from '@/assets/logo-light.png';
import ImageViewerModal from '@/components/common/ImageViewerModal.vue';
import { isCallMessage, getCallInfo, isVideoPayload } from '@/utils/call-helpers';

const props = defineProps<{
  conversation: Conversation | null;
  messages: Message[];
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  sending: boolean;
  showContactPanel?: boolean;
  showOrderPanel?: boolean;
  isMobile?: boolean;
}>();

const emit = defineEmits<{
  send: [content: string, contentType?: string, isNote?: boolean, replyToId?: string];
  'send-attachment': [file: File];
  'retry-message': [tempId: string];
  'retry-attachment': [tempId: string];
  'remove-optimistic-message': [tempId: string];
  'toggle-contact-panel': [];
  'open-order-panel': [];
  'load-more': [];
  'pause-ai': [convId: string];
  'resume-ai': [convId: string];
  'toggle-ai': [convId: string, aiActive: boolean];
  'set-context-boundary': [payload: { startMessageId?: string | null; endMessageId?: string | null; resetDraft?: boolean }];
  'toggle-pin': [payload: { conversationId: string; pinned: boolean }];
  react: [messageId: string, icon: string];
  back: [];
}>();

function getContactDisplayName(conv?: Conversation | null): string {
  if (!conv) return 'Khách hàng';
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

function isContextStart(msg: Message): boolean {
  if (!props.conversation?.contextStartMsgId) return false;
  return props.conversation.contextStartMsgId === msg.id || props.conversation.contextStartMsgId === msg.zaloMsgId;
}

function isContextEnd(msg: Message): boolean {
  if (!props.conversation?.contextEndMsgId) return false;
  return props.conversation.contextEndMsgId === msg.id || props.conversation.contextEndMsgId === msg.zaloMsgId;
}

const isNoteMode = ref(false);
const showSwitchModeDialog = ref(false);
const placeholderText = computed(() => {
  return isNoteMode.value
    ? 'Đây là tin nhắn ghi chú nội bộ'
    : 'Nhập tin nhắn, dán ảnh Ctrl+V... (Gõ / để dùng tin nhắn nhanh)';
});

function switchToReplyMode() {
  if (!isNoteMode.value) return; // Already in reply mode
  
  if (isNoteMode.value && inputText.value.trim()) {
    showSwitchModeDialog.value = true;
  } else {
    isNoteMode.value = false;
  }
}

function switchToNoteMode() {
  isNoteMode.value = true;
}

function confirmSwitchToReply() {
  showSwitchModeDialog.value = false;
  isNoteMode.value = false;
}

const quickReactions = [
  { icon: '/-heart', emoji: '❤️', label: 'Yêu thích' },
  { icon: '/-strong', emoji: '👍', label: 'Thích' },
  { icon: ':>', emoji: '😆', label: 'Haha' },
  { icon: ':o', emoji: '😲', label: 'Wow' },
  { icon: ':-((', emoji: '😭', label: 'Buồn' },
  { icon: ':-h', emoji: '😡', label: 'Phẫn nộ' },
];

const extraReactionEmojis = [
  { icon: ':-*', emoji: '😘', label: 'Hôn' },
  { icon: ":')", emoji: '😂', label: 'Cười nước mắt' },
  { icon: '/-rose', emoji: '🌹', label: 'Hoa hồng' },
  { icon: '/-break', emoji: '💔', label: 'Tan vỡ' },
  { icon: '/-weak', emoji: '👎', label: 'Không thích' },
  { icon: ';xx', emoji: '😍', label: 'Mê mẩn' },
  { icon: ';-)', emoji: '😉', label: 'Nháy mắt' },
  { icon: '/-bd', emoji: '🎂', label: 'Sinh nhật' },
  { icon: '/-bome', emoji: '💣', label: 'Bom' },
  { icon: '/-ok', emoji: '👌', label: 'OK' },
  { icon: '/-thanks', emoji: '🙏', label: 'Cảm ơn' },
  { icon: ':))', emoji: '😁', label: 'Cười lớn' },
  { icon: '/-loveu', emoji: '🤟', label: 'Love' },
  { icon: '/-shit', emoji: '💩', label: 'Shit' },
  { icon: '/-beer', emoji: '🍺', label: 'Bia' },
];

const showReactionModal = ref(false);
const selectedReactionMsg = ref<Message | null>(null);
const activeReactionTab = ref('all');

function getDistinctReactions(msg: Message | null): { emoji: string; icon: string; count: number }[] {
  if (!msg?.reactions || msg.reactions.length === 0) return [];
  const map: Record<string, { emoji: string; icon: string; count: number }> = {};
  for (const r of msg.reactions) {
    const e = r.emoji || '❤️';
    if (!map[e]) {
      map[e] = { emoji: e, icon: r.icon, count: 0 };
    }
    map[e].count += (r.count || 1);
  }
  return Object.values(map);
}

const modalDistinctReactions = computed(() => {
  const distinct = getDistinctReactions(selectedReactionMsg.value);
  // Sort descending by count (highest count first e.g. 👍 22 before ❤️ 1)
  return distinct.sort((a, b) => b.count - a.count);
});

function getTotalReactionsCount(msg: Message | null): number {
  if (!msg?.reactions || msg.reactions.length === 0) return 0;
  return msg.reactions.reduce((sum, r) => sum + (r.count || 1), 0);
}

function getUserReaction(msg: Message): MessageReactionItem | undefined {
  return msg.reactions?.find(r => r.isSelf);
}

function onToggleReaction(msg: Message, icon: string) {
  emit('react', msg.id, icon);
}

function openReactionDetail(msg: Message) {
  selectedReactionMsg.value = msg;
  activeReactionTab.value = 'all';
  showReactionModal.value = true;
}

interface GroupedUserReaction {
  uid: string;
  userName: string;
  avatarUrl?: string;
  isSelf: boolean;
  totalCount: number;
  reactions: { emoji: string; count: number }[];
  displayCount: number;
}

const groupedReactionUsers = computed(() => {
  if (!selectedReactionMsg.value?.reactions) return [];
  const usersMap: Record<string, GroupedUserReaction> = {};

  for (const r of selectedReactionMsg.value.reactions) {
    const key = r.uid || (r.isSelf ? 'self' : 'unknown');
    if (!usersMap[key]) {
      const fallbackAvatar = r.isSelf ? props.conversation?.zaloAccount?.avatarUrl : props.conversation?.contact?.avatarUrl;
      const fallbackName = r.isSelf ? (props.conversation?.zaloAccount?.displayName || 'Bạn') : getContactDisplayName(props.conversation);
      usersMap[key] = {
        uid: r.uid || key,
        userName: r.userName || fallbackName,
        avatarUrl: r.avatarUrl || fallbackAvatar || undefined,
        isSelf: r.isSelf,
        totalCount: 0,
        reactions: [],
        displayCount: 0,
      };
    }
    const count = r.count || 1;
    usersMap[key].totalCount += count;
    
    const existingEmoji = usersMap[key].reactions.find(e => e.emoji === r.emoji);
    if (existingEmoji) {
      existingEmoji.count += count;
    } else {
      usersMap[key].reactions.push({ emoji: r.emoji, count });
    }
  }

  const allUsers = Object.values(usersMap);

  if (activeReactionTab.value === 'all') {
    return allUsers.map(u => ({
      ...u,
      displayCount: u.totalCount,
    }));
  }

  // Filter users who reacted with the active emoji and set displayCount to this emoji's count
  return allUsers
    .filter(u => u.reactions.some(re => re.emoji === activeReactionTab.value))
    .map(u => {
      const matched = u.reactions.find(re => re.emoji === activeReactionTab.value);
      return {
        ...u,
        reactions: matched ? [matched] : [],
        displayCount: matched?.count || 0,
      };
    });
});

function removeSelfReactionInModal() {
  if (selectedReactionMsg.value) {
    emit('react', selectedReactionMsg.value.id, '');
    if (selectedReactionMsg.value.reactions) {
      selectedReactionMsg.value.reactions = selectedReactionMsg.value.reactions.filter(r => !r.isSelf);
    }
  }
}

const inputText = ref('');

// ── Quick Messages (Canned Responses) Autocomplete State ───────────────────
const quickMessages = ref<any[]>([]);
const showQuickMessagesDropdown = ref(false);
const quickMessageSearchQuery = ref('');
const activeQuickMessageIndex = ref(0);

// Mentions and Replies states
const usersList = ref<any[]>([]);
const showMentionsDropdown = ref(false);
const mentionSearchQuery = ref('');
const activeMentionIndex = ref(0);
const replyingToMessage = ref<any | null>(null);

async function fetchQuickMessages() {
  try {
    const res = await api.get('/quick-messages');
    quickMessages.value = res.data.quickMessages || [];
  } catch (err) {
    console.error('Failed to fetch quick messages:', err);
  }
}

async function fetchUsers() {
  try {
    const res = await api.get('/users');
    usersList.value = res.data.users || [];
  } catch (err) {
    console.error('Failed to fetch users:', err);
  }
}

onMounted(() => {
  fetchQuickMessages();
  fetchUsers();
});

watch(() => props.conversation?.id, () => {
  replyingToMessage.value = null; // Clear reply state when conversation changes
  if (quickMessages.value.length === 0) fetchQuickMessages();
  if (usersList.value.length === 0) fetchUsers();
});

const filteredQuickMessages = computed(() => {
  const q = quickMessageSearchQuery.value.trim().toLowerCase();
  if (!q) return quickMessages.value;
  return quickMessages.value.filter(
    (m) =>
      m.shortcut.toLowerCase().includes(q) ||
      m.title.toLowerCase().includes(q) ||
      m.content.toLowerCase().includes(q)
  );
});

interface MentionItem {
  id: string;
  name: string;
  subtitle: string;
  avatarUrl?: string | null;
  isAll?: boolean;
  isStaff?: boolean;
}

const mentionCandidates = computed<MentionItem[]>(() => {
  if (isNoteMode.value) {
    // In note mode: show internal staff
    return (usersList.value || []).map((u) => ({
      id: u.id,
      name: u.fullName || u.email,
      subtitle: u.role === 'owner' ? 'Chủ sở hữu' : (u.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'),
      avatarUrl: null,
      isStaff: true,
    }));
  }

  // In regular Reply/Chat mode: show group members / chat contacts
  const list: MentionItem[] = [];

  if (props.conversation?.threadType === 'group') {
    // 1. Tag all
    list.push({
      id: '-1',
      name: 'All',
      subtitle: 'Nhắc tất cả mọi người trong nhóm',
      isAll: true,
    });

    // 2. Extract distinct members from messages
    const seenUids = new Set<string>();
    const seenNames = new Set<string>();

    for (const m of props.messages || []) {
      if (m.senderType !== 'self' && m.senderName) {
        const uid = m.senderUid || m.senderName;
        if (!seenUids.has(uid) && !seenNames.has(m.senderName.toLowerCase())) {
          seenUids.add(uid);
          seenNames.add(m.senderName.toLowerCase());
          list.push({
            id: uid,
            name: m.senderName,
            subtitle: 'Thành viên nhóm',
            avatarUrl: null,
          });
        }
      }
    }

    // 3. If contact is available and not already added
    if (props.conversation.contact?.fullName && !seenNames.has(props.conversation.contact.fullName.toLowerCase())) {
      list.push({
        id: props.conversation.contact.zaloUid || props.conversation.contact.id,
        name: props.conversation.contact.fullName,
        subtitle: 'Thành viên nhóm',
        avatarUrl: props.conversation.contact.avatarUrl,
      });
    }
  } else {
    // 1-on-1 chat
    if (props.conversation?.contact?.fullName) {
      list.push({
        id: props.conversation.contact.zaloUid || props.conversation.contact.id,
        name: props.conversation.contact.fullName,
        subtitle: 'Khách hàng',
        avatarUrl: props.conversation.contact.avatarUrl,
      });
    }
  }

  return list;
});

const filteredMentionUsers = computed(() => {
  const q = mentionSearchQuery.value.trim().toLowerCase();
  if (!q) return mentionCandidates.value;
  return mentionCandidates.value.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(q))
  );
});

watch(inputText, (newVal) => {
  // 1. Detect quick message command "/"
  const triggerMatch = newVal.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);
  if (triggerMatch) {
    quickMessageSearchQuery.value = triggerMatch[1];
    showQuickMessagesDropdown.value = true;
    showMentionsDropdown.value = false;
    if (activeQuickMessageIndex.value >= filteredQuickMessages.value.length) {
      activeQuickMessageIndex.value = 0;
    }
    return;
  } else {
    showQuickMessagesDropdown.value = false;
  }

  // 2. Detect mention trigger "@" (in both Note mode and Reply/Chat mode)
  const mentionMatch = newVal.match(/(?:^|\s)@([a-zA-Z0-9_\-\s]*)$/);
  if (mentionMatch) {
    mentionSearchQuery.value = mentionMatch[1];
    showMentionsDropdown.value = true;
    showQuickMessagesDropdown.value = false;
    if (activeMentionIndex.value >= filteredMentionUsers.value.length) {
      activeMentionIndex.value = 0;
    }
    return;
  } else {
    showMentionsDropdown.value = false;
  }
});

function selectMentionUser(u: any) {
  const nameToInsert = u.name || u.fullName || u.email;
  const lastIndex = inputText.value.lastIndexOf('@');
  if (lastIndex !== -1) {
    inputText.value = inputText.value.substring(0, lastIndex) + `@${nameToInsert} `;
  }
  showMentionsDropdown.value = false;
}

function selectQuickMessage(msg: any) {

  let content = msg.content || '';
  if (content && props.conversation?.contact?.fullName) {
    content = content.replace(/{fullName}/g, props.conversation.contact.fullName);
  }

  const match = inputText.value.match(/(?:^|\s)\/[a-zA-Z0-9_-]*$/);
  const imageObj = Array.isArray(msg.attachments) ? msg.attachments.find((a: any) => a.type === 'image') : null;

  // Populate text into input area
  if (content.trim()) {
    if (match && typeof match.index === 'number') {
      const index = match.index + (match[0].startsWith(' ') ? 1 : 0);
      inputText.value = inputText.value.slice(0, index) + content;
    } else {
      inputText.value = content;
    }
  } else {
    // Clear the slash trigger even if no text content
    if (match && typeof match.index === 'number') {
      const index = match.index + (match[0].startsWith(' ') ? 1 : 0);
      inputText.value = inputText.value.slice(0, index);
    }
  }

  // Queue image as pending attachment instead of sending immediately
  if (imageObj?.url) {
    const fileName = imageObj.url.split('/').pop()?.split('?')[0] || 'image.jpg';
    pendingAttachments.value.push({
      id: crypto.randomUUID(),
      url: imageObj.url,
      name: fileName,
      type: 'image',
      preview: imageObj.url,
    });
  }

  showQuickMessagesDropdown.value = false;
}

function handleQuickMsgKeyDown() {
  if (showQuickMessagesDropdown.value && filteredQuickMessages.value.length > 0) {
    activeQuickMessageIndex.value = (activeQuickMessageIndex.value + 1) % filteredQuickMessages.value.length;
  } else if (showMentionsDropdown.value && filteredMentionUsers.value.length > 0) {
    activeMentionIndex.value = (activeMentionIndex.value + 1) % filteredMentionUsers.value.length;
  }
}

function handleQuickMsgKeyUp() {
  if (showQuickMessagesDropdown.value && filteredQuickMessages.value.length > 0) {
    activeQuickMessageIndex.value =
      (activeQuickMessageIndex.value - 1 + filteredQuickMessages.value.length) % filteredQuickMessages.value.length;
  } else if (showMentionsDropdown.value && filteredMentionUsers.value.length > 0) {
    activeMentionIndex.value =
      (activeMentionIndex.value - 1 + filteredMentionUsers.value.length) % filteredMentionUsers.value.length;
  }
}

function handleQuickMsgKeyEnter() {
  if (showQuickMessagesDropdown.value && filteredQuickMessages.value.length > 0) {
    selectQuickMessage(filteredQuickMessages.value[activeQuickMessageIndex.value]);
  } else if (showMentionsDropdown.value && filteredMentionUsers.value.length > 0) {
    selectMentionUser(filteredMentionUsers.value[activeMentionIndex.value]);
  } else {
    handleSend();
  }
}
const messagesContainer = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

// ── Image Viewer & Gallery State ───────────────────────────────────────────
const showImageViewer = ref(false);
const activeViewerIndex = ref(0);
const standaloneViewerImages = ref<any[]>([]);
const failedImages = ref<Record<string, boolean>>({});

function onMessageImageError(msgId: string) {
  if (msgId) {
    failedImages.value[msgId] = true;
  }
}

const conversationImages = computed(() => {
  const list: any[] = [];
  if (!props.messages) return list;
  for (const m of props.messages) {
    if (isUndoSyncMessage(m)) continue;
    const url = getImageUrl(m);
    if (url) {
      list.push({
        id: m.id,
        url,
        caption: getImageCaption(m) || '',
        sender: m.senderName || (m.senderType === 'self' ? 'Bạn' : getContactDisplayName(props.conversation)),
        date: m.sentAt ? new Date(m.sentAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
        title: getImageCaption(m) || `Ảnh ${list.length + 1}`,
        name: `image_${m.id || list.length + 1}.jpg`,
        rawUrl: url,
      });
    } else if (m.contentType === 'gif') {
      const parsed = getParsedContent(m);
      if (parsed?.href) {
        list.push({
          id: m.id,
          url: parsed.href,
          caption: 'Ảnh động (GIF)',
          sender: m.senderName || (m.senderType === 'self' ? 'Bạn' : getContactDisplayName(props.conversation)),
          date: m.sentAt ? new Date(m.sentAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
          title: 'Ảnh GIF',
          name: `gif_${m.id || list.length + 1}.gif`,
          rawUrl: parsed.href,
        });
      }
    }
  }
  return list;
});

function openMessageImage(msg: Message) {
  const url = getImageUrl(msg) || (msg.contentType === 'gif' ? getParsedContent(msg)?.href : null);
  if (!url) return;

  const allImgs = conversationImages.value;
  const idx = allImgs.findIndex((img) => img.url === url || img.id === msg.id);
  if (idx !== -1) {
    standaloneViewerImages.value = [];
    activeViewerIndex.value = idx;
  } else {
    const isGif = msg.contentType === 'gif';
    standaloneViewerImages.value = [{
      url,
      caption: getImageCaption(msg) || '',
      sender: msg.senderName || (msg.senderType === 'self' ? 'Bạn' : getContactDisplayName(props.conversation)),
      date: msg.sentAt ? new Date(msg.sentAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
      title: getImageCaption(msg) || 'Xem ảnh',
      name: `image_${msg.id}.${isGif ? 'gif' : 'jpg'}`,
      rawUrl: url,
    }];
    activeViewerIndex.value = 0;
  }
  showImageViewer.value = true;
}

function openSingleImagePreview(url: string, title = 'Xem ảnh') {
  const cleanExt = url.startsWith('blob:') ? 'jpg' : (url.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg');
  const validExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(cleanExt) ? cleanExt : 'jpg';
  const name = title.includes('.') ? title : `${title}.${validExt}`;
  standaloneViewerImages.value = [{ url, title, name, rawUrl: url }];
  activeViewerIndex.value = 0;
  showImageViewer.value = true;
}
const syncSnack = ref({ show: false, text: '', color: 'success' });

// ── Pending Attachments Queue ────────────────────────────────────────────────
interface PendingAttachment {
  id: string;
  file?: File;
  url?: string;
  name: string;
  type: 'image' | 'video' | 'file';
  preview: string;
}

const pendingAttachments = ref<PendingAttachment[]>([]);

const canSend = computed(() => {
  return !!(inputText.value.trim() || pendingAttachments.value.length > 0);
});

function removePendingAttachment(id: string) {
  const idx = pendingAttachments.value.findIndex(a => a.id === id);
  if (idx !== -1) {
    const att = pendingAttachments.value[idx];
    // Revoke blob URL to free memory
    if (att.file && att.preview.startsWith('blob:')) {
      URL.revokeObjectURL(att.preview);
    }
    pendingAttachments.value.splice(idx, 1);
  }
}

function getAttachmentType(file: File): 'image' | 'video' | 'file' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

function getFilePreview(file: File, type: 'image' | 'video' | 'file'): string {
  if (type === 'image' || type === 'video') {
    return URL.createObjectURL(file);
  }
  return '';
}

function triggerFileInput() {
  fileInput.value?.click();
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    const files = Array.from(target.files);
    processPastedFiles(files);
    target.value = ''; // Reset input
  }
}

// ── Clipboard Paste & Drag-Drop Handling ─────────────────────────────────────
const isDraggingOver = ref(false);
let dragTimer: any = null;
let lastProcessedPasteEvent: ClipboardEvent | null = null;

function processPastedFiles(files: File[]) {
  if (!files || files.length === 0) return;

  // Auto-switch to reply mode if in note mode, because note messages do not send attachments
  if (isNoteMode.value) {
    isNoteMode.value = false;
  }

  let imageCount = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const type = getAttachmentType(file);

    // Generate friendly timestamped filename if generic
    let fileName = file.name;
    if (!fileName || fileName === 'image.png' || fileName === 'blob') {
      const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
      fileName = `dan_anh_${timeStr}_${i + 1}.${ext}`;
    }
    const cleanFile = new File([file], fileName, { type: file.type || 'image/png' });

    pendingAttachments.value.push({
      id: crypto.randomUUID(),
      file: cleanFile,
      name: fileName,
      type,
      preview: getFilePreview(cleanFile, type),
    });
    if (type === 'image') imageCount++;
  }

  if (imageCount > 0) {
    syncSnack.value = {
      show: true,
      text: `Đã đính kèm ${imageCount} hình ảnh vào khung chat`,
      color: 'success',
    };
  } else if (files.length > 0) {
    syncSnack.value = {
      show: true,
      text: `Đã đính kèm ${files.length} tệp vào khung chat`,
      color: 'success',
    };
  }
}

function handlePaste(e: ClipboardEvent) {
  // Prevent duplicate execution if event bubbles from textarea to parent container
  if (lastProcessedPasteEvent === e) return;
  lastProcessedPasteEvent = e;

  const clipboardData = e.clipboardData;
  if (!clipboardData) return;

  const items = clipboardData.items;
  const files: File[] = [];

  if (items && items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/') || item.kind === 'file') {
        const file = item.getAsFile();
        if (file && (file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(file.name))) {
          files.push(file);
        }
      }
    }
  }

  // Fallback to clipboardData.files if items didn't populate files
  if (files.length === 0 && clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const file = clipboardData.files[i];
      if (file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(file.name)) {
        files.push(file);
      }
    }
  }

  if (files.length > 0) {
    // Only prevent default if there is no text being pasted alongside or if the text is just the file name
    const pastedText = clipboardData.getData('text/plain');
    if (!pastedText || !pastedText.trim() || files.some(f => f.name === pastedText.trim())) {
      e.preventDefault();
    }
    processPastedFiles(files);
  }
}

function handleDragOver(e: DragEvent) {
  if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault();
    isDraggingOver.value = true;
    if (dragTimer) clearTimeout(dragTimer);
  }
}

function handleDragLeave(_e?: DragEvent) {
  if (dragTimer) clearTimeout(dragTimer);
  dragTimer = setTimeout(() => {
    isDraggingOver.value = false;
  }, 100);
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDraggingOver.value = false;
  if (dragTimer) clearTimeout(dragTimer);

  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      f => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp|pdf|doc|docx|xls|xlsx)$/i.test(f.name)
    );
    if (droppedFiles.length > 0) {
      processPastedFiles(droppedFiles);
    }
  }
}

const standardEmojis = [
  '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '🙂', '🤗',
  '🤩', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '🥱', '😴', '😌', '😛', '😜',
  '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '☹️', '🙁', '😖', '😞', '😟', '😤', '😢', '😭', '😦', '😧', '😨',
  '😩', '🤯', '😬', '😰', '😱', '😳', '🤪', '😵', '😡', '😠', '🤬', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '😇', '🥳', '🥺',
  '🤠', '🤡', '🤥', '🤫', '🤭', '🧐', '🤓', '😈', '👿', '👹', '👺', '💀', '👻', '👽', '👾', '🤖', '💩', '😺', '😸', '😹',
  '😻', '😼', '😽', '🙀', '😿', '😾', '🙈', '🙉', '🙊', '💋', '💌', '💘', '💝', '💖', '💗', '💓', '💞', '💕', '💟', '❣️',
  '💔', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️',
  '🗨️', '🗯️', '💭', '💤', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕',
  '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿'
];

const insertEmoji = (emoji: string) => {
  inputText.value += emoji;
};

const stickersList = ref<any[]>([]);
const stickerSearchQuery = ref('like');
const loadingStickers = ref(false);

async function fetchStickers() {
  if (!props.conversation?.zaloAccount?.id) return;
  loadingStickers.value = true;
  try {
    const res = await api.get('/stickers', {
      params: {
        accountId: props.conversation.zaloAccount.id,
        keyword: stickerSearchQuery.value || 'like'
      }
    });
    stickersList.value = res.data;
  } catch (err) {
    console.error('Failed to fetch stickers:', err);
  } finally {
    loadingStickers.value = false;
  }
}

function onStickerMenuToggle(isOpen: boolean) {
  if (isOpen && stickersList.value.length === 0) {
    fetchStickers();
  }
}

function sendLikeEmoji() {
  emit('send', '👍', 'text', false, replyingToMessage.value?.id);
  replyingToMessage.value = null;
}

function handleRetry(msg: Message) {
  if (msg.contentType === 'image' || msg.pendingFile) {
    emit('retry-attachment', msg.id);
  } else {
    emit('retry-message', msg.id);
  }
}

function handleRestore(msg: Message) {
  if (msg.content) {
    inputText.value = msg.content;
  }
  emit('remove-optimistic-message', msg.id);
  syncSnack.value = { show: true, text: 'Đã khôi phục nội dung vào ô soạn thảo', color: 'info' };
}

async function handleSend() {
  if (!canSend.value) return;

  const isNoteReply = replyingToMessage.value?.isNote === true;
  const finalIsNote = isNoteMode.value || isNoteReply;
  const textToSend = inputText.value;
  const quoteReplyId = replyingToMessage.value?.id;

  // Reset quote reply state
  replyingToMessage.value = null;

  // 1. Send text message if present
  if (textToSend.trim()) {
    emit('send', textToSend, 'text', finalIsNote, quoteReplyId);
  }

  // 2. Send all pending attachments (but ONLY if not in note mode)
  const attachmentsToSend = finalIsNote ? [] : [...pendingAttachments.value];
  pendingAttachments.value = [];
  inputText.value = '';

  for (const att of attachmentsToSend) {
    try {
      let fileToSend: File | null = null;

      if (att.file) {
        fileToSend = att.file;
      } else if (att.url) {
        // Convert URL to File object so we use multipart upload
        // This avoids the backend trying to fetch URLs from inside Docker
        try {
          const response = await fetch(att.url);
          const blob = await response.blob();
          const ext = att.name.split('.').pop() || 'jpg';
          const mimeType = blob.type || `image/${ext}`;
          fileToSend = new File([blob], att.name, { type: mimeType });
        } catch (fetchErr) {
          console.error('Failed to fetch image URL for upload:', fetchErr);
          syncSnack.value = { show: true, text: `Không thể tải ảnh: ${att.name}`, color: 'error' };
          continue;
        }
      }

      if (fileToSend) {
        emit('send-attachment', fileToSend);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (err) {
      console.error('Failed to send attachment:', att.name, err);
      syncSnack.value = { show: true, text: `Gửi ${att.name} thất bại`, color: 'error' };
    }
    // Revoke blob URL
    if (att.preview.startsWith('blob:')) {
      URL.revokeObjectURL(att.preview);
    }
  }
}
function sendSticker(sticker: any) { emit('send', JSON.stringify(sticker), 'sticker'); }
function formatMessageTime(d: string) { return new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); }

async function downloadFile(url: string, filename: string) {
  if (!url) return;
  syncSnack.value = { show: true, text: `Đang tải xuống ${filename}...`, color: 'info' };
  try {
    const res = await api.get('/files/download', {
      params: { url, filename },
      responseType: 'blob',
    });
    const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(blobUrl);
    document.body.removeChild(a);
    syncSnack.value = { show: true, text: `Tải xuống ${filename} thành công`, color: 'success' };
  } catch (err: any) {
    console.error('Download error:', err);
    syncSnack.value = { show: true, text: `Tải xuống ${filename} thất bại`, color: 'error' };
  }
}

/** Extract image URL from JSON content */
function getImageUrl(msg: Message): string | null {
  if (isVideoMessage(msg)) return null;
  if (msg.contentType === 'image' && msg.content) {
    if (msg.content.startsWith('http')) return msg.content;
    try { const p = JSON.parse(msg.content); return p.href || p.thumb || p.hdUrl || null; } catch {}
  }
  if (msg.content?.startsWith('{')) {
    try {
      const p = JSON.parse(msg.content);
      const href = p.href || p.thumb || '';
      if (href && /\.(jpg|jpeg|png|webp|gif)/i.test(href)) return href;
      if (href && href.includes('zdn.vn') && !p.params?.includes('fileExt')) return href;
    } catch {}
  }
  return null;
}

/** Extract image caption from JSON content */
function getImageCaption(msg: Message): string | null {
  if (isUndoSyncMessage(msg)) return null;
  if (!msg.content?.startsWith('{')) return null;
  try {
    const p = JSON.parse(msg.content);
    // Zalo usually puts the caption in description
    if (p.description) return p.description;
    // Fallback to title if it doesn't look like a raw filename
    if (p.title && !/\.(jpg|jpeg|png|webp|gif)$/i.test(p.title)) return p.title;
  } catch {}
  return null;
}

function isUndoSyncMessage(msg: Message): boolean {
  if (!msg.content || !msg.content.startsWith('{')) return false;
  try {
    const p = JSON.parse(msg.content);
    if (p.globalMsgId !== undefined && p.deleteMsg !== undefined) return true;
  } catch {}
  return false;
}

/** Check if message is a video (either contentType === 'video' or file with video extension) */
function isVideoMessage(msg: Message): boolean {
  if (msg.contentType === 'video') return true;
  if (isVideoPayload(msg.content)) return true;
  const parsed = getParsedContent(msg);
  if (parsed) {
    if (isVideoPayload(parsed)) return true;
    let ext = '';
    try {
      const params = typeof parsed.params === 'string' ? JSON.parse(parsed.params) : parsed.params;
      if (params?.video_width || params?.video_original_width || params?.video_height) {
        return true;
      }
      ext = (params?.fileExt || '').toLowerCase();
    } catch {}
    if (!ext && parsed.title) {
      ext = (parsed.title.split('.').pop() || '').toLowerCase();
    }
    if (['mp4', 'mov', 'webm', 'avi', 'mkv', '3gp', 'm4v', 'ogv'].includes(ext)) {
      return true;
    }
    if (parsed.href && (parsed.href.includes('/video-') || parsed.href.includes('.mp4') || parsed.href.includes('.mov') || parsed.href.includes('dlmd.me'))) {
      return true;
    }
  }
  return false;
}

/** Extract file info from JSON content (PDF, docs, etc.) */
function getFileInfo(msg: Message): { name: string; size: string; href: string } | null {
  if (isVideoMessage(msg)) return null;
  if (getImageUrl(msg)) return null;

  if (msg.content?.startsWith('{')) {
    try {
      const p = JSON.parse(msg.content);
      const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
      const paramExt = (params?.fileExt || '').toLowerCase();
      const title = p.title || p.name || '';
      const titleExt = title.split('.').pop()?.toLowerCase() || '';
      const href = p.href || p.url || p.downloadUrl || '';
      const hrefExt = href.split('?')[0].split('.').pop()?.toLowerCase() || '';

      const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'zip', 'rar', '7z', 'tar', 'gz', 'txt', 'pptx', 'ppt'];
      const isDoc =
        params?.fType === 1 ||
        docExts.includes(paramExt) ||
        docExts.includes(titleExt) ||
        docExts.includes(hrefExt) ||
        msg.contentType === 'file' ||
        msg.contentType === 'document' ||
        (href && (href.includes('dlf1.vn') || href.includes('zfcloud.zdn.vn')));

      if (isDoc && (href || title)) {
        const bytes = parseInt(params?.fileSize || p.size || p.fileSize || '0');
        const size = bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : (bytes > 0 ? `${Math.round(bytes / 1024)} KB` : 'Tài liệu');
        const ext = paramExt || titleExt || (hrefExt.length <= 4 ? hrefExt : '') || 'pdf';
        const finalName = title ? (title.includes('.') ? title : `${title}.${ext}`) : `Tài liệu.${ext}`;
        return { name: finalName, size, href };
      }
    } catch {}
  } else if ((msg as any).mediaUrl && (msg.contentType === 'file' || msg.contentType === 'document')) {
    const mediaUrl = (msg as any).mediaUrl as string;
    const ext = mediaUrl.split('?')[0].split('.').pop() || 'pdf';
    return { name: mediaUrl.split('/').pop()?.split('?')[0] || `Tài liệu.${ext}`, size: 'Tài liệu', href: mediaUrl };
  }
  return null;
}

function isTransparentBubble(msg: Message): boolean {
  if (msg.isDeleted || isUndoSyncMessage(msg)) return false;
  if (getImageUrl(msg) && getImageCaption(msg)) return false;
  return Boolean(
    msg.contentType === 'sticker' ||
    msg.contentType === 'gif' ||
    getImageUrl(msg) ||
    isVideoMessage(msg)
  );
}



function parseDisplayContentHtml(content: string | null): string {
  if (!content) return '';
  let text = content;
  if (content.startsWith('{')) {
    try {
      const p = JSON.parse(content);
      if (p.action?.includes('call') || p.action === 'recommened.calltime' || isCallMessage({ content })) {
        const info = getCallInfo({ content });
        return `${info.title}${info.subtitle ? ` (${info.subtitle})` : ''}`;
      }
      if (p.title && p.title !== 'sendBubbleMessage' && p.href) text = `🔗 ${p.title}`;
      else if (p.title && p.title !== 'sendBubbleMessage') text = p.title;
      else if (p.description && p.description !== 'Cuộc gọi') text = p.description;
      else if (p.href) text = `🔗 ${p.href}`;
    } catch {
      text = content;
    }
  }

  // Escape HTML entities to prevent XSS
  let escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // Collect all known mention candidate names (CRM users, group members, contact, all/tất cả)
  const candidateNames = new Set<string>();
  candidateNames.add('All');
  candidateNames.add('all');
  candidateNames.add('Tất cả');
  candidateNames.add('tất cả');

  if (usersList.value && usersList.value.length > 0) {
    for (const u of usersList.value) {
      if (u.fullName) candidateNames.add(u.fullName.trim());
      if (u.email) candidateNames.add(u.email.trim());
    }
  }

  if (mentionCandidates.value && mentionCandidates.value.length > 0) {
    for (const c of mentionCandidates.value) {
      if (c.name) candidateNames.add(c.name.trim());
    }
  }

  if (props.conversation?.contact?.fullName) {
    candidateNames.add(props.conversation.contact.fullName.trim());
  }

  if (props.messages && props.messages.length > 0) {
    for (const m of props.messages) {
      if (m.senderName) candidateNames.add(m.senderName.trim());
    }
  }

  // Sort candidate names by length descending so longer names match first
  const sortedNames = Array.from(candidateNames)
    .filter((name) => name.length > 0)
    .sort((a, b) => b.length - a.length);

  for (const name of sortedNames) {
    const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(?<=^|\\s)@${escapedName}(?=\\s|$|[.,!?:;])`, 'gi');
    escapedText = escapedText.replace(regex, (match) => {
      return `<span class="mention-tag" style="color: #0068ff !important; font-weight: bold; cursor: pointer;">${match}</span>`;
    });
  }

  // Fallback 1: Multi-word TitleCase proper names (e.g. @Hoàng Minh, @Trần Văn A)
  escapedText = escapedText.replace(/(?<=^|\s)@(\p{Lu}[\p{Ll}\p{Lu}\d_\-]*(?:\s+\p{Lu}[\p{Ll}\p{Lu}\d_\-]*){1,4})(?=$|\s|[.,!?:;])/gu, (match) => {
    if (match.includes('<span')) return match;
    return `<span class="mention-tag" style="color: #0068ff !important; font-weight: bold; cursor: pointer;">${match}</span>`;
  });

  // Fallback 2: Single-word mentions (e.g. @all, @username, @minh)
  escapedText = escapedText.replace(/(?<=^|\s)@([\p{L}\d_\-]+)(?=$|\s|[.,!?:;])/gu, (match) => {
    if (match.includes('<span')) return match;
    return `<span class="mention-tag" style="color: #0068ff !important; font-weight: bold; cursor: pointer;">${match}</span>`;
  });

  return escapedText;
}

function isReminderMessage(msg: Message): boolean {
  if (!msg.content) return false;
  try { const p = JSON.parse(msg.content); return p.action === 'msginfo.actionlist'; } catch { return false; }
}

function getReminderTitle(msg: Message): string {
  try { return JSON.parse(msg.content!).title || ''; } catch { return msg.content || ''; }
}

function getReminderTime(msg: Message): string | null {
  try {
    const p = JSON.parse(msg.content!);
    const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
    for (const h of (params?.highLightsV2 || [])) {
      if (h.ts > 1e12) return new Date(h.ts).toLocaleString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  } catch {}
  return null;
}

/** Helper to parse JSON content */
function getParsedContent(msg: Message): any {
  if (!msg.content?.startsWith('{')) return null;
  try { return JSON.parse(msg.content); } catch { return null; }
}

/** Extract sticker image URL from message content - handles various formats */
function getStickerUrl(msg: Message): string | null {
  const parsed = getParsedContent(msg);
  if (!parsed) return null;
  // Prefer direct URL fields from getStickersDetail response (WebP for animations)
  if (parsed.stickerWebpUrl) return parsed.stickerWebpUrl;
  if (parsed.stickerUrl) return parsed.stickerUrl;
  if (parsed.url) return parsed.url;
  // Nested spriteUrl or url in sticker data
  if (parsed.spriteUrl) return parsed.spriteUrl;
  // href fallback
  if (parsed.href) return parsed.href;
  // If content has an 'id' field, try to build Zalo sticker URL
  // Zalo CDN format: https://zalo-api.zadn.vn/api/emoticon/sticker/webpc/<id>
  if (parsed.id) {
    return `https://zalo-api.zadn.vn/api/emoticon/sticker/webpc/${parsed.id}`;
  }
  return null;
}

/** Extract video URL from message content */
function getVideoUrl(msg: Message): string | null {
  let rawUrl: string | null = null;
  if (msg.content?.startsWith('http')) {
    rawUrl = msg.content;
  } else {
    const parsed = getParsedContent(msg);
    if (parsed) {
      rawUrl = parsed.href || parsed.url || parsed.hdUrl || parsed.sdUrl || parsed.normalUrl || null;
    }
  }

  if (!rawUrl) return null;

  // If URL is from Zalo File CDN (zfcloud.zdn.vn which sends application/octet-stream),
  // route through streaming proxy with Content-Type: video/mp4
  if (rawUrl.includes('zfcloud.zdn.vn') || rawUrl.includes('zdn.vn')) {
    const token = localStorage.getItem('token') || '';
    return `/api/v1/files/stream?url=${encodeURIComponent(rawUrl)}&type=video/mp4&token=${encodeURIComponent(token)}`;
  }

  return rawUrl;
}

/** Sync Zalo reminder to CRM appointments via API */
async function syncAppointment(msg: Message) {
  if (!props.conversation?.contact?.id) { syncSnack.value = { show: true, text: 'Không có thông tin khách hàng', color: 'error' }; return; }
  try {
    const p = JSON.parse(msg.content!);
    const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
    let appointmentDate: string | null = null;
    for (const h of (params?.highLightsV2 || [])) {
      if (h.ts > 1e12) { appointmentDate = new Date(h.ts).toISOString(); break; }
    }
    if (!appointmentDate) { syncSnack.value = { show: true, text: 'Không tìm thấy thời gian hẹn', color: 'warning' }; return; }
    await api.post('/appointments', {
      contactId: props.conversation.contact.id,
      appointmentDate,
      appointmentTime: new Date(appointmentDate).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      type: 'tai_kham',
      notes: `[Zalo] ${p.title || ''}`,
    });
    syncSnack.value = { show: true, text: 'Đã đồng bộ lịch hẹn thành công!', color: 'success' };
  } catch (err: any) {
    syncSnack.value = { show: true, text: err.response?.data?.error || 'Đồng bộ thất bại', color: 'error' };
  }
}

let isNearBottom = true;

function onScroll() {
  if (!messagesContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
  isNearBottom = scrollHeight - scrollTop - clientHeight < 120;

  // Trigger infinite scroll up if near top
  if (scrollTop < 40 && props.hasMore && !props.loadingMore && !props.loading) {
    const oldScrollHeight = scrollHeight;
    emit('load-more');
    nextTick(() => {
      if (messagesContainer.value) {
        const newScrollHeight = messagesContainer.value.scrollHeight;
        messagesContainer.value.scrollTop = newScrollHeight - oldScrollHeight;
      }
    });
  }
}

// Scroll to bottom on initial conversation load or when sending/receiving new message at bottom
watch(() => props.conversation?.id, async () => {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    isNearBottom = true;
  }
});

watch(() => props.messages.length, async (newLen, oldLen) => {
  await nextTick();
  if (!messagesContainer.value) return;
  // If new messages appended at bottom and user was near bottom, scroll down
  if (isNearBottom && newLen > (oldLen || 0)) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
});
</script>

<style scoped>
.message-bubble { box-shadow: none; }
.recalled-message { padding: 2px 0; }
.recalled-content {
  border-left: 2px dashed rgba(245, 158, 11, 0.6);
  padding-left: 8px;
  margin-top: 2px;
}
.reminder-card {
  padding: 8px 12px;
  border-left: 3px solid var(--color-graphite);
  border-radius: var(--radius-inputs);
  background: var(--color-soft-stone);
}
.file-card {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: var(--radius-inputs);
  background: var(--color-soft-stone);
  border: 1px solid var(--color-chalk);
}
.chat-image-container {
  max-width: 360px;
  display: flex;
  flex-direction: column;
}
.chat-image-wrapper {
  position: relative;
  display: inline-flex;
  max-width: 100%;
  overflow: hidden;
  border-radius: var(--radius-cards, 10px);
}
.chat-image {
  max-width: min(100%, 360px);
  max-height: 320px;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: var(--radius-cards, 10px);
  cursor: pointer;
  transition: transform 0.2s var(--ease-claude, ease);
  display: block;
}
.chat-image:hover { transform: scale(1.02); }
.chat-image-uploading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(1.5px);
  border-radius: var(--radius-cards, 10px);
}
.chat-image-error-box {
  background: rgba(0, 0, 0, 0.04);
  border: 1px dashed rgba(0, 0, 0, 0.18);
  max-width: 240px;
  cursor: default;
  user-select: none;
}
:deep(.v-theme--dark) .chat-image-error-box {
  background: rgba(255, 255, 255, 0.05);
  border: 1px dashed rgba(255, 255, 255, 0.2);
}
.chat-video { max-width: 100%; max-height: 300px; border-radius: var(--radius-cards); }
.emoji-item {
  width: 44px;
  height: 44px;
  font-size: 28px;
  line-height: 1.2;
  border-radius: 4px;
  transition: background-color 0.15s ease;
}
.emoji-item:hover {
  background-color: var(--color-chalk, #f0f0f0);
}

/* ── Reaction Bar & Buttons ── */
.message-row-wrapper {
  position: relative;
}

.message-container {
  position: relative;
}

.message-container:hover .message-action-bar {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.message-action-bar {
  position: absolute;
  top: -38px;
  z-index: 15;
  opacity: 0;
  pointer-events: none;
  transform: translateY(6px);
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.message-action-bar-self {
  right: 0;
}

.message-action-bar-contact {
  left: 0;
}

.floating-reaction-bar {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #ffffff;
  border-radius: 28px;
  padding: 4px 8px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.15);
}

.reaction-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.15s ease;
  font-size: 1.35rem;
  line-height: 1;
  padding: 0;
}

.reaction-btn:hover {
  transform: scale(1.4) translateY(-3px);
  background-color: rgba(0, 0, 0, 0.04);
}

.reaction-btn.active-reaction {
  background-color: rgba(0, 104, 255, 0.12);
  transform: scale(1.15);
}

.reaction-btn-more {
  width: 28px;
  height: 28px;
  color: #65676b;
  border-radius: 50%;
  background: #f0f2f5;
  margin-left: 2px;
}

.reaction-btn-more:hover {
  background: #e4e6eb;
  color: #050505;
}

.reaction-btn-remove {
  width: 28px;
  height: 28px;
  color: #e41e3f;
  border-radius: 50%;
  background: #fef0f0;
  margin-left: 2px;
}

.reaction-btn-remove:hover {
  background: #fde2e2;
}

/* ── Reaction Summary Pill on Message ── */
.reaction-summary-pill {
  position: absolute;
  bottom: -11px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: #ffffff;
  padding: 2px 8px;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  z-index: 5;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  user-select: none;
}

.reaction-summary-pill:hover {
  transform: scale(1.08);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}

.reaction-pill-self {
  right: 8px;
}

.reaction-pill-contact {
  right: 8px;
}

.pill-emoji {
  font-size: 0.95rem;
  line-height: 1;
}

.pill-count {
  font-size: 0.75rem;
  color: #4b4c4f;
  margin-left: 2px;
  line-height: 1;
}

/* ── Reaction Detail Dialog ── */
.reaction-detail-dialog {
  background: #ffffff;
}

.drag-bar-indicator {
  width: 40px;
  height: 4px;
  background: #dcdfe4;
  border-radius: 2px;
}

.reaction-tabs-header {
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  overflow-x: auto;
}

.reaction-tab-item {
  padding: 8px 12px;
  border-bottom: 2.5px solid transparent;
  color: #65676b;
  font-size: 0.95rem;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.reaction-tab-item:hover {
  color: #050505;
}

.reaction-tab-item.active-tab {
  color: #0068ff;
  border-bottom-color: #0068ff;
}

.reaction-user-row {
  background: #fdfaf3; /* Zalo soft warm highlight background */
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: background-color 0.15s ease;
}

.reaction-user-row:hover {
  background: #f7f3e8;
}

.user-row-emoji {
  font-size: 1.1rem;
}

.reaction-remove-pill-btn {
  background: #e4e6eb;
  color: #050505;
  border: none;
  border-radius: 18px;
  padding: 5px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.reaction-remove-pill-btn:hover {
  background: #d8dadf;
}

.emoji-item-mini {
  width: 36px;
  height: 36px;
  font-size: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: background-color 0.15s ease;
}

.emoji-item-mini:hover {
  background-color: #f0f2f5;
}

/* Quick messages dropdown styling */
.quick-messages-dropdown {
  position: absolute;
  bottom: 100%;
  left: 8px;
  right: 8px;
  margin-bottom: 8px;
  background-color: #ffffff;
  z-index: 105;
  overflow: hidden;
  box-shadow: 0 -6px 22px rgba(0, 0, 0, 0.12), 0 6px 22px rgba(0, 0, 0, 0.12);
}

.v-theme--dark .quick-messages-dropdown {
  background-color: #1e1e1a;
  border-color: rgba(255, 255, 255, 0.15);
}

.quick-message-option-item {
  transition: background-color 0.15s ease;
}

.quick-message-option-item.active-option {
  background-color: rgba(0, 0, 0, 0.05);
}

.v-theme--dark .quick-message-option-item.active-option {
  background-color: rgba(255, 255, 255, 0.08);
}

/* ── Pending Attachments Preview Bar ── */
.pending-attachments-bar {
  background: rgba(0, 0, 0, 0.02);
  scrollbar-width: thin;
  scrollbar-color: rgba(0,0,0,0.15) transparent;
}

.v-theme--dark .pending-attachments-bar {
  background: rgba(255, 255, 255, 0.04);
}

.pending-attachments-bar::-webkit-scrollbar {
  height: 4px;
}

.pending-attachments-bar::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.15);
  border-radius: 2px;
}

.pending-attachment-item {
  transition: transform 0.15s ease;
}

.pending-attachment-item:hover {
  transform: scale(1.05);
}

.pending-attachment-item .v-btn {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.pending-attachment-item:hover .v-btn {
  opacity: 1;
}
/* ── Internal Notes (Note Mode) Styles ── */
.note-mode-textarea .v-field,
.v-theme--dark .note-mode-textarea .v-field {
  background-color: #ffe0b2 !important;
  color: #5d4037 !important;
  border: none !important;
  box-shadow: none !important;
}

.note-mode-textarea textarea,
.note-mode-textarea input,
.v-theme--dark .note-mode-textarea textarea,
.v-theme--dark .note-mode-textarea input {
  color: #5d4037 !important;
}

.note-mode-textarea textarea::placeholder,
.v-theme--dark .note-mode-textarea textarea::placeholder {
  color: #8d6e63 !important;
  opacity: 0.8;
}

.message-bubble.note-message-bubble,
.v-theme--dark .message-bubble.note-message-bubble {
  background-color: #ffe0b2 !important;
  background: #ffe0b2 !important;
  color: #5d4037 !important;
  border: none !important;
}

.msg-time-note,
.v-theme--dark .msg-time-note {
  color: #8d6e63 !important;
  text-align: right;
}
/* Style for larger chat input text */
.chat-input-area .v-textarea textarea,
.chat-input-area .v-textarea input {
  font-size: 1.05rem !important;
  line-height: 1.5 !important;
}
/* Quote block styling */
.quoted-message-box {
  background-color: rgba(0, 104, 255, 0.08) !important;
  border-left: 3px solid #0068ff !important;
  border-radius: 6px;
}

.v-theme--dark .quoted-message-box {
  background-color: rgba(0, 104, 255, 0.15) !important;
  border-left: 3px solid #38bdf8 !important;
}

/* ── Chat Messages Area Background ── */
.chat-messages-area {
  background-color: #eef0f3 !important; /* Authentic Zalo Light Mode chat background */
}

.v-theme--dark .chat-messages-area {
  background-color: #18191a !important; /* Authentic Zalo Dark Mode chat background */
}

/* ── Sender Name Label in Groups ── */
.sender-name-label {
  color: #65676b;
  font-size: 12px;
}

.v-theme--dark .sender-name-label {
  color: #9ca3af;
}

/* ── Message Bubbles & Generous Balanced Padding ── */
.message-bubble {
  padding: 10px 14px !important;
  border-radius: 12px !important;
  display: inline-block;
  min-width: 64px;
  box-sizing: border-box;
  word-break: break-word;
  overflow-wrap: break-word;
  transition: all 0.15s ease;
}

.message-bubble.bubble-transparent {
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.message-text-content {
  font-size: 14px;
  line-height: 1.45;
  word-break: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  display: block;
}

/* ── Inbound Message Bubble (Other members / Contact) ── */
.bubble-inbound {
  background-color: #ffffff !important;
  color: #080808 !important;
  border: 1px solid rgba(0, 0, 0, 0.08) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
}

.v-theme--dark .bubble-inbound {
  background-color: #242526 !important;
  color: #e4e6eb !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  box-shadow: none !important;
}

/* ── Outbound Message Bubble (Self / My messages) ── */
.bubble-outbound {
  background-color: #e5efff !important; /* Zalo light blue bubble */
  color: #080808 !important;
  border: 1px solid #cce0ff !important;
  box-shadow: 0 1px 2px rgba(0, 104, 255, 0.06) !important;
}

.v-theme--dark .bubble-outbound {
  background-color: #1e3a5f !important; /* Zalo Dark blue bubble */
  color: #ffffff !important;
  border: 1px solid rgba(0, 104, 255, 0.3) !important;
  box-shadow: none !important;
}

.bubble-outbound .message-text-content {
  color: #080808 !important;
}

.v-theme--dark .bubble-outbound .message-text-content {
  color: #ffffff !important;
}

/* ── Timestamp inside bubbles ── */
.msg-time {
  margin-top: 5px !important;
  font-size: 11px !important;
  line-height: 1;
}

.msg-time-contact {
  color: #8a8d91 !important;
  text-align: left;
}

.v-theme--dark .msg-time-contact {
  color: #9ca3af !important;
}

.msg-time-self {
  color: #65676b !important;
  text-align: right;
}

.v-theme--dark .msg-time-self {
  color: rgba(255, 255, 255, 0.65) !important;
}

/* ── Image with Caption Bubble Overrides ── */
.bubble-with-image-caption {
  padding: 0 !important;
  overflow: hidden;
  max-width: 360px !important;
}

.chat-image-with-caption {
  border-bottom-left-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
  display: block;
  margin: 0;
  width: 100%;
  max-height: 280px;
  object-fit: cover;
  object-position: center;
}

.image-caption-text {
  padding: 8px 12px 6px 12px;
  word-break: break-word;
}

/* ── Failed Message Style Overrides ── */
.bubble-failed-border {
  border: 1.5px solid #ef4444 !important;
  background-color: rgba(239, 68, 68, 0.05) !important;
}

.msg-failed-actions {
  border-top: 1px solid rgba(239, 68, 68, 0.25) !important;
}

/* ── Mentions Highlight ── */
:deep(.mention-tag) {
  color: #0068ff !important;
  font-weight: 600 !important;
}

.v-theme--dark :deep(.mention-tag) {
  color: #38bdf8 !important;
  font-weight: 600 !important;
}

/* ── Zalo PC Header (Heightened & Balanced) ── */
.zalo-chat-header {
  height: 68px !important;
  min-height: 68px !important;
  padding: 12px 20px !important;
  background-color: var(--v-theme-surface);
  border-bottom: 1px solid rgba(128, 128, 128, 0.12);
  display: flex;
  align-items: center;
}

.zalo-header-avatar {
  background-color: #0068ff;
  border: 1px solid rgba(128, 128, 128, 0.12);
}

.zalo-header-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
  opacity: 0.75;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.zalo-header-btn:hover {
  background-color: rgba(128, 128, 128, 0.12);
  opacity: 1;
}

.zalo-header-btn.is-active {
  background-color: rgba(0, 104, 255, 0.15);
  color: #0068ff;
  opacity: 1;
}

/* ── Zalo PC Input & Toolbar ── */
.zalo-chat-input-container {
  background-color: var(--v-theme-surface);
  border-top: 1px solid rgba(128, 128, 128, 0.12);
  min-height: 105px;
}

.zalo-chat-toolbar {
  border-bottom: 1px solid rgba(128, 128, 128, 0.08);
  padding: 0 12px !important;
  height: 34px;
  min-height: 34px;
}

.zalo-chat-input-row {
  min-height: 58px;
  padding: 4px 16px 8px !important;
}

.zalo-tool-icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
  opacity: 0.7;
  transition: all 0.15s ease;
}

.zalo-tool-icon-btn:hover {
  background-color: rgba(128, 128, 128, 0.12);
  opacity: 1;
}

.zalo-tool-icon-btn.is-note-active {
  background-color: #ff9800;
  color: #ffffff;
  opacity: 1;
}

.zalo-input-textarea :deep(.v-field),
.zalo-input-textarea :deep(.v-field__outline),
.zalo-input-textarea :deep(.v-field__overlay),
.zalo-input-textarea :deep(.v-field__loader),
.zalo-input-textarea :deep(.v-field--focused),
.zalo-input-textarea :deep(.v-field--variant-plain) {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  --v-field-border-width: 0px !important;
  background: transparent !important;
}

.zalo-input-textarea :deep(.v-field__outline__start),
.zalo-input-textarea :deep(.v-field__outline__notch),
.zalo-input-textarea :deep(.v-field__outline__end) {
  border: none !important;
  display: none !important;
}

.zalo-input-textarea :deep(textarea) {
  font-size: 14.5px;
  line-height: 1.5;
  padding: 4px 0;
  min-height: 48px;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  resize: none;
}

.zalo-input-textarea :deep(textarea:focus),
.zalo-input-textarea :deep(textarea:focus-visible) {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

.zalo-send-circle-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-color: #0068ff;
  border: none;
  cursor: pointer;
  transition: transform 0.15s ease, background-color 0.15s ease;
  box-shadow: 0 2px 8px rgba(0, 104, 255, 0.35);
}

.zalo-send-circle-btn:hover {
  background-color: #005ae0;
  transform: scale(1.05);
}

.zalo-send-circle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.zalo-like-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.zalo-like-btn:hover {
  transform: scale(1.18);
}

/* ── AI Context Boundary Badges & Dividers ── */
.ai-context-boundary-divider {
  position: relative;
  z-index: 2;
  user-select: none;
}

.ai-context-pill {
  background: linear-gradient(135deg, #0068ff 0%, #0052cc 100%);
  color: #ffffff;
  box-shadow: 0 3px 12px rgba(0, 104, 255, 0.35);
  font-size: 12px;
  line-height: 1.2;
  border: 1px solid rgba(255, 255, 255, 0.25);
  transition: all 0.2s ease;
}

.ai-context-pill:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 104, 255, 0.45);
}

.ai-context-end-pill {
  background: linear-gradient(135deg, #495057 0%, #343a40 100%) !important;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.25) !important;
}

.ai-context-pill-title {
  font-weight: 700;
  letter-spacing: 0.2px;
}

.ai-context-pill-subtitle,
.ai-context-pill-sub {
  font-size: 11px;
  opacity: 0.85;
}

.ai-context-close-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ai-context-close-btn:hover {
  background: rgba(255, 255, 255, 0.4);
  transform: scale(1.1);
}

.active-context-marker {
  color: #0068ff !important;
  background-color: rgba(0, 104, 255, 0.1) !important;
}

/* ── Call Event Card ── */
.call-event-card {
  min-width: 200px;
  max-width: 320px;
  padding: 4px 2px;
}

.call-icon-circle {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  transition: transform 0.2s ease;
}

.call-event-card:hover .call-icon-circle {
  transform: scale(1.06);
}

.call-title {
  font-size: 13.5px;
  line-height: 1.3;
}

.call-duration-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.call-subtitle {
  font-size: 11.5px;
  line-height: 1.25;
}

/* ── Chat Drag & Drop Overlay ── */
.chat-drag-overlay {
  position: absolute;
  inset: 0;
  background: rgba(var(--v-theme-surface), 0.94);
  border: 2px dashed rgba(var(--v-theme-primary), 0.8);
  border-radius: 8px;
  z-index: 25;
  pointer-events: none;
  backdrop-filter: blur(3px);
  animation: pulse-border 1.5s infinite;
}

@keyframes pulse-border {
  0%, 100% {
    border-color: rgba(var(--v-theme-primary), 0.9);
  }
  50% {
    border-color: rgba(var(--v-theme-primary), 0.4);
  }
}

.chat-input-area.is-drag-over {
  border-color: rgba(var(--v-theme-primary), 0.8) !important;
}
</style>

