<template>
  <div class="chat-media-gallery d-flex flex-column h-100">
    <!-- Sub-tabs for Media / Documents / Links -->
    <v-tabs
      v-model="mediaSubTab"
      density="compact"
      color="primary"
      class="border-b px-2 flex-shrink-0 media-sub-tabs"
      align-tabs="start"
    >
      <v-tab value="photos" class="text-caption font-weight-bold text-none px-3">
        <v-icon start size="15">lucide-image</v-icon>
        Ảnh / Video ({{ mediaItems.length }})
      </v-tab>
      <v-tab value="docs" class="text-caption font-weight-bold text-none px-3">
        <v-icon start size="15">lucide-file-text</v-icon>
        Tệp tin ({{ docItems.length }})
      </v-tab>
      <v-tab value="links" class="text-caption font-weight-bold text-none px-3">
        <v-icon start size="15">lucide-link-2</v-icon>
        Liên kết ({{ linkItems.length }})
      </v-tab>
      <v-spacer />
      <div class="d-flex align-center pr-1">
        <v-btn
          icon="lucide-refresh-cw"
          size="28"
          variant="text"
          color="medium-emphasis"
          class="rounded-lg"
          :loading="loadingHistory"
          title="Tải lại toàn bộ media trong hội thoại"
          @click="fetchMediaHistory(conversationId)"
        />
      </div>
    </v-tabs>

    <!-- Top Loading Bar when querying history -->
    <v-progress-linear v-if="loadingHistory" indeterminate color="primary" height="2" />

    <div class="flex-grow-1 overflow-y-auto pa-3 custom-scrollbar">
      
      <!-- SUB-TAB 1: PHOTOS & VIDEOS -->
      <div v-if="mediaSubTab === 'photos'">
        <div v-if="mediaItems.length === 0" class="text-center text-medium-emphasis py-12">
          <v-avatar size="56" color="grey-lighten-4" class="mb-3">
            <v-icon size="28" color="grey">lucide-image-off</v-icon>
          </v-avatar>
          <div class="text-body-2 font-weight-medium">Chưa có hình ảnh hoặc video</div>
          <div class="text-caption text-disabled mt-1">Các ảnh và video trong toàn bộ lịch sử cuộc trò chuyện sẽ xuất hiện ở đây</div>
        </div>

        <div v-else class="media-grid">
          <div
            v-for="(item, idx) in mediaItems"
            :key="item.id || idx"
            class="media-thumb-box cursor-pointer rounded-xl overflow-hidden position-relative elevation-1"
            @click="openLightbox(item)"
          >
            <!-- Image Thumbnail -->
            <v-img
              v-if="item.isImage"
              :src="item.thumbUrl || item.url"
              cover
              aspect-ratio="1"
              class="bg-grey-lighten-4 w-100 h-100"
            >
              <template #placeholder>
                <div class="d-flex align-center justify-center fill-height">
                  <v-progress-circular indeterminate size="20" width="2" color="primary" />
                </div>
              </template>
              <template #error>
                <div class="d-flex flex-column align-center justify-center fill-height bg-grey-lighten-3 text-grey-darken-1 pa-2 text-center">
                  <v-icon size="22" color="grey">lucide-image-off</v-icon>
                  <span style="font-size: 9px;" class="mt-1 font-weight-medium">Không tải được ảnh</span>
                </div>
              </template>
            </v-img>

            <!-- Video Thumbnail -->
            <div v-else-if="item.isVideo" class="video-thumb-placeholder d-flex align-center justify-center bg-grey-darken-4 h-100 w-100 position-relative">
              <v-img
                v-if="item.thumbUrl"
                :src="item.thumbUrl"
                cover
                aspect-ratio="1"
                class="w-100 h-100 opacity-60"
              />
              <div class="video-play-badge position-absolute d-flex align-center justify-center">
                <v-icon size="26" color="white">lucide-play</v-icon>
              </div>
              <div class="video-tag position-absolute">
                <v-chip size="x-small" color="black" variant="flat" class="font-weight-bold" style="font-size: 9px; height: 16px; opacity: 0.85;">
                  VIDEO
                </v-chip>
              </div>
            </div>

            <!-- Overlay with date and quick download -->
            <div class="media-overlay pa-2 d-flex justify-space-between align-end">
              <span class="text-caption text-white font-weight-medium text-truncate" style="font-size: 11px; text-shadow: 0 1px 2px rgba(0,0,0,0.8);">
                {{ item.date }}
              </span>
              <v-btn
                icon="lucide-download"
                size="x-small"
                variant="flat"
                color="rgba(0,0,0,0.6)"
                class="text-white download-btn-hover"
                density="compact"
                title="Tải về"
                @click.stop="downloadFile(item.rawUrl || item.url, item.name)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- SUB-TAB 2: DOCUMENTS & FILES -->
      <div v-if="mediaSubTab === 'docs'" class="d-flex flex-column gap-2">
        <div v-if="docItems.length === 0" class="text-center text-medium-emphasis py-12">
          <v-avatar size="56" color="grey-lighten-4" class="mb-3">
            <v-icon size="28" color="grey">lucide-file-x</v-icon>
          </v-avatar>
          <div class="text-body-2 font-weight-medium">Chưa có tệp tin hoặc tài liệu</div>
          <div class="text-caption text-disabled mt-1">Các file PDF, Word, Excel, ZIP... trong toàn bộ lịch sử sẽ xuất hiện ở đây</div>
        </div>

        <v-card
          v-for="(doc, idx) in docItems"
          :key="doc.id || idx"
          variant="flat"
          class="gallery-item-card px-3.5 py-2.5 rounded-xl d-flex align-center justify-space-between gap-3 mb-2"
        >
          <div class="d-flex align-center gap-3 overflow-hidden flex-grow-1 min-w-0">
            <!-- Distinct Avatar by Extension -->
            <v-avatar size="40" :color="getFileColor(doc.name, doc.ext)" variant="tonal" rounded="lg" class="flex-shrink-0">
              <v-icon size="20">{{ getFileIcon(doc.name, doc.ext) }}</v-icon>
            </v-avatar>

            <!-- File Details -->
            <div class="overflow-hidden flex-grow-1 min-w-0">
              <div class="item-title text-truncate font-weight-bold" :title="doc.name">
                {{ doc.name }}
              </div>
              <div class="d-flex align-center gap-1.5 mt-0.5 flex-wrap">
                <v-chip
                  v-if="doc.ext"
                  size="x-small"
                  :color="getFileColor(doc.name, doc.ext)"
                  variant="flat"
                  class="font-weight-bold px-1.5 ext-chip"
                >
                  {{ doc.ext.toUpperCase() }}
                </v-chip>
                <span class="text-caption text-medium-emphasis font-weight-medium" style="font-size: 11.5px;">
                  {{ doc.size ? formatFileSize(doc.size) : 'Tài liệu' }}
                </span>
                <span class="text-disabled" style="font-size: 10px;">•</span>
                <span class="text-caption text-medium-emphasis d-flex align-center gap-1" style="font-size: 11.5px;">
                  <v-icon size="11" color="grey">lucide-calendar</v-icon>
                  {{ doc.date }}
                </span>
              </div>
            </div>
          </div>

          <!-- Actions Group (Download & Copy Link) -->
          <div class="action-btn-group d-flex align-center gap-1.5 flex-shrink-0">
            <v-btn
              v-if="doc.url"
              icon="lucide-copy"
              size="32"
              variant="tonal"
              color="medium-emphasis"
              class="rounded-lg item-action-btn"
              title="Sao chép đường dẫn tải"
              @click="copyLink(doc.url)"
            />
            <v-btn
              icon="lucide-download"
              size="32"
              variant="tonal"
              color="primary"
              class="rounded-lg item-action-btn"
              title="Tải về tệp này"
              @click="downloadFile(doc.url, doc.name)"
            />
          </div>
        </v-card>
      </div>

      <!-- SUB-TAB 3: LINKS -->
      <div v-if="mediaSubTab === 'links'" class="d-flex flex-column gap-2">
        <div v-if="linkItems.length === 0" class="text-center text-medium-emphasis py-12">
          <v-avatar size="56" color="grey-lighten-4" class="mb-3">
            <v-icon size="28" color="grey">lucide-link-2-off</v-icon>
          </v-avatar>
          <div class="text-body-2 font-weight-medium">Không tìm thấy liên kết website nào</div>
          <div class="text-caption text-disabled mt-1">Các đường link chia sẻ trong toàn bộ lịch sử sẽ được tự động tổng hợp tại đây</div>
        </div>

        <v-card
          v-for="(link, idx) in linkItems"
          :key="link.id || idx"
          variant="flat"
          class="gallery-item-card px-3.5 py-2.5 rounded-xl d-flex align-center justify-space-between gap-3 mb-2"
        >
          <div class="d-flex align-center gap-3 overflow-hidden flex-grow-1 min-w-0">
            <!-- Globe Icon Avatar -->
            <v-avatar size="40" color="primary" variant="tonal" rounded="lg" class="flex-shrink-0">
              <v-icon size="20">lucide-globe</v-icon>
            </v-avatar>

            <!-- Link Info -->
            <div class="overflow-hidden flex-grow-1 min-w-0">
              <div class="item-title text-truncate font-weight-bold" :title="link.title || link.domain">
                {{ link.title || link.domain }}
              </div>
              <a
                :href="link.url"
                target="_blank"
                rel="noopener noreferrer"
                class="item-url text-truncate d-block mt-0.5"
                :title="link.url"
              >
                {{ link.url }}
              </a>
              <div class="item-meta text-caption text-medium-emphasis mt-0.5 d-flex align-center gap-1.5 flex-wrap">
                <span class="d-flex align-center gap-1">
                  <v-icon size="11" color="grey">lucide-calendar</v-icon>
                  <span>{{ link.date }}</span>
                </span>
                <span v-if="link.domain" class="text-disabled" style="font-size: 10px;">•</span>
                <span v-if="link.domain" class="domain-badge">{{ link.domain }}</span>
              </div>
            </div>
          </div>

          <!-- Actions: Copy & Open -->
          <div class="action-btn-group d-flex align-center gap-1.5 flex-shrink-0">
            <v-btn
              icon="lucide-copy"
              size="32"
              variant="tonal"
              color="medium-emphasis"
              class="rounded-lg item-action-btn"
              title="Sao chép liên kết"
              @click="copyLink(link.url)"
            />
            <v-btn
              icon="lucide-external-link"
              size="32"
              variant="tonal"
              color="primary"
              class="rounded-lg item-action-btn"
              title="Mở liên kết trong tab mới"
              :href="link.url"
              target="_blank"
            />
          </div>
        </v-card>
      </div>

    </div>

    <!-- Lightbox Preview Dialog -->
    <v-dialog v-model="showLightbox" max-width="880">
      <v-card class="rounded-2xl overflow-hidden bg-grey-darken-4 text-white elevation-24">
        <div class="d-flex align-center justify-space-between px-4 py-3 border-b border-grey-darken-3">
          <div class="d-flex align-center gap-2 overflow-hidden mr-2">
            <v-icon size="18" :color="activeLightboxItem?.isVideo ? 'info' : 'primary'">
              {{ activeLightboxItem?.isVideo ? 'lucide-video' : 'lucide-image' }}
            </v-icon>
            <span class="text-subtitle-2 font-weight-bold text-truncate text-white">
              {{ activeLightboxItem?.name || (activeLightboxItem?.isVideo ? 'Xem video' : 'Xem ảnh') }}
            </span>
          </div>
          <div class="d-flex align-center gap-1">
            <v-btn
              icon="lucide-download"
              variant="tonal"
              size="small"
              color="white"
              title="Tải về"
              @click="downloadFile(activeLightboxItem?.rawUrl || activeLightboxItem?.url, activeLightboxItem?.name)"
            />
            <v-btn
              icon="lucide-x"
              variant="text"
              size="small"
              color="white"
              @click="showLightbox = false"
            />
          </div>
        </div>

        <div class="d-flex align-center justify-center pa-4" style="max-height: 80vh; min-height: 280px; overflow: auto; background-color: #111;">
          <img
            v-if="activeLightboxItem?.isImage"
            :src="activeLightboxItem.url"
            alt="Preview"
            style="max-width: 100%; max-height: 72vh; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);"
          />
          <video
            v-else-if="activeLightboxItem?.isVideo"
            :src="activeLightboxItem.url"
            controls
            autoplay
            playsinline
            style="max-width: 100%; max-height: 72vh; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);"
          />
        </div>

        <div class="px-4 py-2 bg-grey-darken-4 d-flex align-center justify-space-between text-caption text-grey-lighten-1 border-t border-grey-darken-3">
          <span>Thời gian gửi: {{ activeLightboxItem?.fullDate || activeLightboxItem?.date }}</span>
          <span v-if="activeLightboxItem?.isImage" class="font-weight-medium text-white">Ảnh chất lượng cao</span>
          <span v-else-if="activeLightboxItem?.isVideo" class="font-weight-medium text-info">Video</span>
        </div>
      </v-card>
    </v-dialog>

    <!-- Copy Feedback Snackbar -->
    <v-snackbar v-model="showCopySnack" timeout="2000" color="success" location="bottom right" rounded="lg">
      <div class="d-flex align-center gap-2">
        <v-icon size="16">lucide-check</v-icon>
        <span>Đã sao chép liên kết vào bộ nhớ tạm!</span>
      </div>
    </v-snackbar>

    <!-- Download Feedback Snackbar -->
    <v-snackbar v-model="downloadSnack.show" :color="downloadSnack.color" timeout="3000" location="bottom right" rounded="lg">
      <div class="d-flex align-center gap-2">
        <v-icon size="16">{{ downloadSnack.color === 'success' ? 'lucide-check' : 'lucide-info' }}</v-icon>
        <span>{{ downloadSnack.text }}</span>
      </div>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { api } from '@/api/index';

interface Message {
  id: string;
  contentType: string;
  content: string | null;
  mediaUrl?: string | null;
  sentAt?: string;
  createdAt?: string;
  senderType?: string;
  attachments?: any;
}

const props = defineProps<{
  conversationId?: string | null;
  messages?: Message[];
}>();

const mediaSubTab = ref<'photos' | 'docs' | 'links'>('photos');
const showLightbox = ref(false);
const activeLightboxItem = ref<any>(null);
const showCopySnack = ref(false);
const downloadSnack = ref({ show: false, text: '', color: 'info' });

const historicalMessages = ref<Message[]>([]);
const loadingHistory = ref(false);

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'heic', 'ico'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi', 'mkv', '3gp', 'm4v', 'ogv', 'flv', 'wmv'];
const DOC_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'zip', 'rar', '7z', 'tar', 'gz', 'txt', 'pptx', 'ppt', 'json', 'xml'];

async function fetchMediaHistory(convId?: string | null) {
  if (!convId) {
    historicalMessages.value = [];
    return;
  }

  loadingHistory.value = true;
  try {
    const res = await api.get(`/conversations/${convId}/media`);
    if (res.data?.messages) {
      historicalMessages.value = res.data.messages;
    }
  } catch (err) {
    console.error('Failed to fetch conversation media history:', err);
  } finally {
    loadingHistory.value = false;
  }
}

// Watch conversationId to fetch whenever a different conversation is opened
watch(
  () => props.conversationId,
  (newId) => {
    fetchMediaHistory(newId);
  },
  { immediate: true },
);

// Combined message pool: Merge historical messages with real-time in-memory messages
const allMessages = computed(() => {
  const map = new Map<string, Message>();

  // 1. Historical messages from database
  for (const m of historicalMessages.value) {
    if (m && m.id) {
      map.set(m.id, m);
    }
  }

  // 2. Real-time messages from props
  for (const m of props.messages || []) {
    if (m && m.id) {
      map.set(m.id, m);
    }
  }

  return Array.from(map.values());
});

/** Safe JSON Parser supporting nested stringified JSON */
function parseJsonSafe(val: any): any {
  if (!val) return null;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    let str = val.trim();
    if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
      try {
        let parsed = JSON.parse(str);
        if (typeof parsed === 'string' && (parsed.startsWith('{') || parsed.startsWith('['))) {
          try { parsed = JSON.parse(parsed); } catch {}
        }
        return parsed;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function getFileExtension(filenameOrUrl: string): string {
  if (!filenameOrUrl || typeof filenameOrUrl !== 'string') return '';
  const clean = filenameOrUrl.split('?')[0].split('#')[0].trim();
  const dotIndex = clean.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return clean.substring(dotIndex + 1).toLowerCase();
}

function formatDateShort(dateStr?: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatDateFull(dateStr?: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function formatFileSize(bytes: number) {
  if (!bytes || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function extractDomain(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    return u.hostname || urlStr;
  } catch {
    const parts = urlStr.replace(/^https?:\/\//, '').split('/');
    return parts[0] || urlStr;
  }
}

function getFileIcon(name: string = '', ext: string = '') {
  const detected = (ext || name.split('.').pop() || '').toLowerCase();
  if (['pdf'].includes(detected)) return 'lucide-file-text';
  if (['doc', 'docx'].includes(detected)) return 'lucide-file-text';
  if (['xls', 'xlsx', 'csv'].includes(detected)) return 'lucide-sheet';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(detected)) return 'lucide-archive';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(detected)) return 'lucide-music';
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(detected)) return 'lucide-video';
  return 'lucide-file';
}

function getFileColor(name: string = '', ext: string = '') {
  const detected = (ext || name.split('.').pop() || '').toLowerCase();
  if (['pdf'].includes(detected)) return 'error';
  if (['doc', 'docx'].includes(detected)) return 'primary';
  if (['xls', 'xlsx', 'csv'].includes(detected)) return 'success';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(detected)) return 'amber-darken-2';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(detected)) return 'purple';
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(detected)) return 'indigo';
  return 'grey-darken-1';
}

/** Sanitize file name to avoid raw JSON leaks */
function sanitizeFileName(rawName: string, fallback: string = 'Tài liệu'): string {
  if (!rawName || typeof rawName !== 'string') return fallback;
  const trimmed = rawName.trim();
  if (trimmed.startsWith('{') || trimmed.includes('":"') || trimmed.includes('","') || trimmed.endsWith('}')) {
    return fallback;
  }
  return trimmed;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. EXTRACT PHOTOS & VIDEOS (STRICT: NO PDFs OR DOCS)
// ─────────────────────────────────────────────────────────────────────────────
const mediaItems = computed(() => {
  const list: any[] = [];

  for (const m of allMessages.value) {
    const rawContent = m.content || '';
    const parsed = parseJsonSafe(rawContent);
    const date = formatDateShort(m.sentAt || m.createdAt);
    const fullDate = formatDateFull(m.sentAt || m.createdAt);

    const params = parsed && typeof parsed.params === 'string' ? parseJsonSafe(parsed.params) : parsed?.params;
    const paramExt = (params?.fileExt || '').toLowerCase();
    const titleExt = getFileExtension(parsed?.title || parsed?.name || m.mediaUrl || '');
    const urlCandidate = parsed?.hdUrl || parsed?.href || parsed?.url || parsed?.sdUrl || parsed?.normalUrl || parsed?.thumb || parsed?.src || m.mediaUrl || (typeof rawContent === 'string' && rawContent.startsWith('http') ? rawContent : '');
    const urlExt = getFileExtension(urlCandidate);

    const detectedExt = paramExt || titleExt || urlExt;

    // STRICT CHECK: If it's a PDF or document or fType 1, DO NOT treat as image/video!
    const isDoc = DOC_EXTENSIONS.includes(detectedExt) || m.contentType === 'file' || m.contentType === 'document' || params?.fType === 1;
    if (isDoc) {
      continue;
    }

    // 1.1 Check Video
    let isVideo = m.contentType === 'video' || VIDEO_EXTENSIONS.includes(detectedExt);
    let videoUrl = '';
    let videoThumb = '';
    let videoTitle = '';

    if (isVideo) {
      if (parsed) {
        videoUrl = parsed.hdUrl || parsed.href || parsed.url || parsed.sdUrl || parsed.normalUrl || '';
        videoThumb = parsed.thumb || parsed.thumbUrl || parsed.thumbnail || '';
        videoTitle = sanitizeFileName(parsed.title, 'Video');
      } else if (m.mediaUrl) {
        videoUrl = m.mediaUrl;
        videoTitle = 'Video';
      } else if (rawContent.startsWith('http')) {
        videoUrl = rawContent;
        videoTitle = 'Video';
      }

      if (videoUrl && !videoUrl.startsWith('{')) {
        let streamUrl = videoUrl;
        if (videoUrl.includes('zfcloud.zdn.vn') || videoUrl.includes('zdn.vn')) {
          const token = localStorage.getItem('token') || '';
          streamUrl = `/api/v1/files/stream?url=${encodeURIComponent(videoUrl)}&type=video/mp4&token=${encodeURIComponent(token)}`;
        }

        list.push({
          id: m.id,
          isImage: false,
          isVideo: true,
          url: streamUrl,
          rawUrl: videoUrl,
          thumbUrl: videoThumb,
          name: videoTitle || 'Video',
          date,
          fullDate,
        });
        continue;
      }
    }

    // 1.2 Check Image (STRICT: Must have image extension or image contentType / photo CDN)
    let isImage = false;
    let imgUrl = '';
    let imgThumb = '';
    let imgTitle = '';

    if (IMAGE_EXTENSIONS.includes(detectedExt)) {
      isImage = true;
    } else if (m.contentType === 'image' || m.contentType === 'photo') {
      isImage = true;
    } else if (urlCandidate && (urlCandidate.includes('chat-photo') || urlCandidate.includes('zdn.vn/photo') || urlCandidate.includes('res-zalo')) && !urlCandidate.includes('zfcloud.zdn.vn/file/')) {
      isImage = true;
    }

    if (isImage) {
      if (parsed) {
        if (Array.isArray(parsed)) {
          for (const p of parsed) {
            const u = p.hdUrl || p.href || p.url || p.normalUrl || p.thumb;
            const pExt = getFileExtension(p.title || u || '');
            if (u && typeof u === 'string' && u.startsWith('http') && !DOC_EXTENSIONS.includes(pExt)) {
              list.push({
                id: `${m.id}-${list.length}`,
                isImage: true,
                isVideo: false,
                url: u,
                thumbUrl: p.thumb || p.thumbUrl || u,
                name: sanitizeFileName(p.title || p.description, 'Ảnh'),
                date,
                fullDate,
              });
            }
          }
          continue;
        } else {
          imgUrl = parsed.hdUrl || parsed.href || parsed.url || parsed.normalUrl || parsed.thumb || parsed.src || '';
          imgThumb = parsed.thumb || parsed.thumbUrl || imgUrl;
          imgTitle = sanitizeFileName(parsed.title || parsed.description, 'Ảnh');
        }
      } else if (m.mediaUrl) {
        imgUrl = m.mediaUrl;
        imgThumb = m.mediaUrl;
      } else if (typeof rawContent === 'string' && rawContent.startsWith('http')) {
        imgUrl = rawContent;
        imgThumb = rawContent;
      }

      // Attachments array check
      if (!imgUrl && m.attachments) {
        const atts = Array.isArray(m.attachments) ? m.attachments : parseJsonSafe(m.attachments);
        if (Array.isArray(atts) && atts.length > 0) {
          for (const att of atts) {
            const u = att.url || att.thumbUrl;
            const attExt = getFileExtension(att.title || u || '');
            if (u && !DOC_EXTENSIONS.includes(attExt)) {
              list.push({
                id: `${m.id}-${list.length}`,
                isImage: att.type !== 'video',
                isVideo: att.type === 'video',
                url: u,
                thumbUrl: att.thumbUrl || u,
                name: sanitizeFileName(att.title, att.type === 'video' ? 'Video' : 'Ảnh'),
                date,
                fullDate,
              });
            }
          }
          continue;
        }
      }

      if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('http') && !imgUrl.startsWith('{')) {
        list.push({
          id: m.id,
          isImage: true,
          isVideo: false,
          url: imgUrl,
          thumbUrl: imgThumb || imgUrl,
          name: imgTitle || 'Ảnh',
          date,
          fullDate,
        });
      }
    }
  }

  return list.reverse();
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. EXTRACT DOCUMENTS & FILES (INCLUDING PDFs, EXCEL, WORD, ZIP, ETC.)
// ─────────────────────────────────────────────────────────────────────────────
const docItems = computed(() => {
  const list: any[] = [];

  for (const m of allMessages.value) {
    const rawContent = m.content || '';
    const parsed = parseJsonSafe(rawContent);
    const date = formatDateShort(m.sentAt || m.createdAt);

    const params = parsed && typeof parsed.params === 'string' ? parseJsonSafe(parsed.params) : parsed?.params;
    const paramExt = (params?.fileExt || '').toLowerCase();
    const rawTitle = parsed?.title || parsed?.name || m.mediaUrl || '';
    const titleExt = getFileExtension(rawTitle);
    const urlCandidate = parsed?.href || parsed?.url || parsed?.downloadUrl || m.mediaUrl || (typeof rawContent === 'string' && rawContent.startsWith('http') ? rawContent : '');
    const urlExt = getFileExtension(urlCandidate);

    const detectedExt = paramExt || titleExt || urlExt;

    // Exclude videos and pure images from doc items
    if (VIDEO_EXTENSIONS.includes(detectedExt)) {
      continue;
    }
    if (IMAGE_EXTENSIONS.includes(detectedExt) && (m.contentType === 'image' || m.contentType === 'photo')) {
      continue;
    }

    let isDoc =
      DOC_EXTENSIONS.includes(detectedExt) ||
      m.contentType === 'file' ||
      m.contentType === 'document' ||
      params?.fType === 1;

    let fileUrl = '';
    let fileName = '';
    let fileSize: number | null = null;
    let fileExt = detectedExt.toUpperCase();

    if (parsed) {
      if (isDoc || params?.fileExt || params?.fType === 1) {
        isDoc = true;
        fileUrl = parsed.href || parsed.url || parsed.downloadUrl || '';
        fileExt = (detectedExt || params?.fileExt || '').toUpperCase();
        fileName = sanitizeFileName(parsed.title || parsed.name, `Tài liệu${fileExt ? '.' + fileExt.toLowerCase() : ''}`);
        fileSize = parseInt(params?.fileSize || parsed.size || parsed.fileSize || '0') || null;
      }
    } else if (m.mediaUrl && (isDoc || DOC_EXTENSIONS.includes(urlExt))) {
      isDoc = true;
      fileUrl = m.mediaUrl;
      fileExt = urlExt.toUpperCase();
      fileName = sanitizeFileName(m.mediaUrl.split('/').pop()?.split('?')[0] || '', `Tài liệu.${urlExt}`);
      fileSize = m.attachments?.size || null;
    } else if (typeof rawContent === 'string' && rawContent.startsWith('http') && (isDoc || DOC_EXTENSIONS.includes(urlExt))) {
      isDoc = true;
      fileUrl = rawContent;
      fileExt = urlExt.toUpperCase();
      fileName = sanitizeFileName(rawContent.split('/').pop()?.split('?')[0] || '', `Tài liệu.${urlExt}`);
    }

    if (isDoc && fileUrl && !fileUrl.startsWith('{')) {
      if (!fileExt && fileName.includes('.')) {
        fileExt = fileName.split('.').pop()?.toUpperCase() || '';
      }

      list.push({
        id: m.id,
        url: fileUrl,
        name: fileName || 'Tài liệu đính kèm',
        ext: fileExt || 'FILE',
        size: fileSize,
        date,
      });
    }
  }

  return list.reverse();
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. EXTRACT WEB LINKS
// ─────────────────────────────────────────────────────────────────────────────
const linkItems = computed(() => {
  const list: any[] = [];
  const urlRegex = /(https?:\/\/[^\s"'<>\)]+)/g;
  const seenUrls = new Set<string>();

  for (const m of allMessages.value) {
    const rawContent = m.content || '';
    const date = formatDateShort(m.sentAt || m.createdAt);
    const parsed = parseJsonSafe(rawContent);

    // If message is JSON link preview (Zalo link card)
    if (parsed && (parsed.href || parsed.url)) {
      const u = (parsed.href || parsed.url || '').trim();
      if (u.startsWith('http') && !isMediaOrCdnUrl(u) && !seenUrls.has(u)) {
        seenUrls.add(u);
        list.push({
          id: m.id,
          url: u,
          title: sanitizeFileName(parsed.title, extractDomain(u)),
          domain: extractDomain(u),
          date,
        });
        continue;
      }
    }

    // Extract URLs from text message content
    if (typeof rawContent === 'string' && !rawContent.startsWith('{')) {
      const matches = rawContent.match(urlRegex);
      if (matches) {
        for (let cleanUrl of matches) {
          cleanUrl = cleanUrl.replace(/[.,;:)\]]+$/, ''); // Strip trailing punctuations
          if (cleanUrl.startsWith('http') && !isMediaOrCdnUrl(cleanUrl) && !seenUrls.has(cleanUrl)) {
            seenUrls.add(cleanUrl);
            list.push({
              id: `${m.id}-${cleanUrl}`,
              url: cleanUrl,
              title: extractDomain(cleanUrl),
              domain: extractDomain(cleanUrl),
              date,
            });
          }
        }
      }
    }
  }

  return list.reverse();
});

/** Filter out internal media & file CDN URLs from Links tab */
function isMediaOrCdnUrl(url: string): boolean {
  const ext = getFileExtension(url);
  if ([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...DOC_EXTENSIONS].includes(ext)) {
    return true;
  }
  if (url.includes('chat-photo') || url.includes('zfcloud.zdn.vn/file/')) {
    return true;
  }
  return false;
}

function openLightbox(item: any) {
  activeLightboxItem.value = item;
  showLightbox.value = true;
}

function copyLink(url: string) {
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    showCopySnack.value = true;
  }).catch(() => {
    // Fallback
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showCopySnack.value = true;
  });
}

/** Robust File Download using API Proxy Blob and Fallback */
async function downloadFile(url?: string, filename?: string) {
  if (!url) return;
  const cleanName = filename || 'download';

  downloadSnack.value = {
    show: true,
    text: `Đang tải xuống ${cleanName}...`,
    color: 'info'
  };

  try {
    const res = await api.get('/files/download', {
      params: { url, filename: cleanName },
      responseType: 'blob',
    });
    const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = cleanName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(blobUrl);
    document.body.removeChild(a);

    downloadSnack.value = {
      show: true,
      text: `Tải xuống ${cleanName} thành công`,
      color: 'success'
    };
  } catch (err) {
    // Fallback to direct anchor download
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = cleanName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      downloadSnack.value = {
        show: true,
        text: `Đang tải xuống ${cleanName}`,
        color: 'success'
      };
    } catch {
      downloadSnack.value = {
        show: true,
        text: `Tải xuống ${cleanName} thất bại`,
        color: 'error'
      };
    }
  }
}
</script>

<style scoped>
.chat-media-gallery {
  font-family: inherit;
  background-color: rgb(var(--v-theme-surface));
}

.media-sub-tabs {
  background-color: rgba(var(--v-theme-on-surface), 0.02);
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.media-thumb-box {
  aspect-ratio: 1;
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  position: relative;
  transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.18s ease;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.media-thumb-box:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12) !important;
}

.video-play-badge {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  border: 1.5px solid rgba(255, 255, 255, 0.4);
}

.video-tag {
  top: 6px;
  left: 6px;
}

.media-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.3) 60%, transparent 100%);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.media-thumb-box:hover .media-overlay {
  opacity: 1;
}

.download-btn-hover {
  backdrop-filter: blur(4px);
  transition: transform 0.15s ease, background-color 0.15s ease;
}
.download-btn-hover:hover {
  transform: scale(1.1);
  background-color: rgba(var(--v-theme-primary), 0.9) !important;
}

/* ─────────────────────────────────────────────────────────────────────────────
   ENHANCED CARD STYLING FOR DOCS & LINKS
   ───────────────────────────────────────────────────────────────────────────── */
.gallery-item-card {
  min-height: 64px;
  background-color: rgba(var(--v-theme-on-surface), 0.03) !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

.gallery-item-card:hover {
  transform: translateY(-1px);
  border-color: rgba(var(--v-theme-primary), 0.35) !important;
  background-color: rgba(var(--v-theme-primary), 0.04) !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08) !important;
}

.item-title {
  font-size: 13.5px;
  line-height: 1.35;
  color: rgb(var(--v-theme-on-surface));
}

.item-url {
  font-size: 11.5px;
  line-height: 1.3;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  opacity: 0.9;
  transition: opacity 0.15s ease, text-decoration 0.15s ease;
}

.item-url:hover {
  opacity: 1;
  text-decoration: underline;
}

.item-meta {
  font-size: 11px;
  line-height: 1.3;
}

.domain-badge {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  background-color: rgba(var(--v-theme-on-surface), 0.06);
  padding: 1px 6px;
  border-radius: 4px;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.ext-chip {
  font-size: 9.5px !important;
  height: 16px !important;
  letter-spacing: 0.5px;
}

.item-action-btn {
  width: 32px !important;
  height: 32px !important;
  min-width: 32px !important;
  transition: transform 0.15s ease, background-color 0.15s ease;
}

.item-action-btn:hover {
  transform: scale(1.06);
}
</style>
