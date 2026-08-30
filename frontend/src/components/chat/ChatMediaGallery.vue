<template>
  <div class="chat-media-gallery d-flex flex-column h-100">
    <!-- Sub-tabs for Media / Documents / Links -->
    <v-tabs v-model="mediaSubTab" density="compact" color="primary" class="border-b px-2 flex-shrink-0">
      <v-tab value="photos" class="text-caption font-weight-bold">
        <v-icon start size="14">lucide-image</v-icon>
        Ảnh / Video ({{ mediaItems.length }})
      </v-tab>
      <v-tab value="docs" class="text-caption font-weight-bold">
        <v-icon start size="14">lucide-file-text</v-icon>
        Tệp tin ({{ docItems.length }})
      </v-tab>
      <v-tab value="links" class="text-caption font-weight-bold">
        <v-icon start size="14">lucide-link-2</v-icon>
        Liên kết ({{ linkItems.length }})
      </v-tab>
    </v-tabs>

    <div class="flex-grow-1 overflow-y-auto pa-3 custom-scrollbar">
      
      <!-- SUB-TAB 1: PHOTOS & VIDEOS -->
      <div v-if="mediaSubTab === 'photos'">
        <div v-if="mediaItems.length === 0" class="text-center text-medium-emphasis py-8">
          <v-icon size="40" color="grey" class="mb-2">lucide-image-off</v-icon>
          <div class="text-caption">Chưa có hình ảnh hoặc video nào trong đoạn chat</div>
        </div>

        <div v-else class="media-grid">
          <div
            v-for="(item, idx) in mediaItems"
            :key="idx"
            class="media-thumb-box cursor-pointer rounded-lg overflow-hidden position-relative"
            @click="openLightbox(item)"
          >
            <v-img
              v-if="item.isImage"
              :src="item.url"
              cover
              aspect-ratio="1"
              class="bg-grey-lighten-3"
            >
              <template #placeholder>
                <div class="d-flex align-center justify-center fill-height">
                  <v-progress-circular indeterminate size="18" width="2" color="primary" />
                </div>
              </template>
            </v-img>

            <div v-else-if="item.isVideo" class="video-thumb-placeholder d-flex align-center justify-center bg-grey-darken-3 h-100">
              <v-icon size="28" color="white">lucide-play-circle</v-icon>
            </div>

            <div class="media-overlay pa-1 d-flex justify-space-between align-end">
              <span class="text-caption text-white font-weight-medium text-truncate" style="font-size: 10px;">
                {{ item.date }}
              </span>
              <v-btn
                icon="lucide-download"
                size="x-small"
                variant="text"
                color="white"
                density="compact"
                title="Tải về"
                @click.stop="downloadFile(item.url, item.name)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- SUB-TAB 2: DOCUMENTS & FILES -->
      <div v-if="mediaSubTab === 'docs'" class="d-flex flex-column gap-2">
        <div v-if="docItems.length === 0" class="text-center text-medium-emphasis py-8">
          <v-icon size="40" color="grey" class="mb-2">lucide-file-x</v-icon>
          <div class="text-caption">Chưa có tệp tin hoặc tài liệu đính kèm nào</div>
        </div>

        <v-card
          v-for="(doc, idx) in docItems"
          :key="idx"
          variant="outlined"
          class="pa-2.5 rounded-lg doc-item-card d-flex align-center justify-space-between gap-2"
        >
          <div class="d-flex align-center gap-2.5 overflow-hidden">
            <v-avatar size="36" :color="getFileColor(doc.name)" variant="tonal" rounded="lg" class="flex-shrink-0">
              <v-icon size="18">{{ getFileIcon(doc.name) }}</v-icon>
            </v-avatar>
            <div class="overflow-hidden">
              <div class="text-caption font-weight-bold text-truncate" :title="doc.name">
                {{ doc.name }}
              </div>
              <div class="text-caption text-medium-emphasis d-flex align-center gap-1.5 mt-0.5" style="font-size: 11px;">
                <span>{{ doc.size ? formatFileSize(doc.size) : 'Tài liệu' }}</span>
                <span>•</span>
                <span>{{ doc.date }}</span>
              </div>
            </div>
          </div>

          <v-btn
            icon="lucide-download"
            size="small"
            variant="text"
            color="primary"
            title="Tải về tệp này"
            @click="downloadFile(doc.url, doc.name)"
          />
        </v-card>
      </div>

      <!-- SUB-TAB 3: LINKS -->
      <div v-if="mediaSubTab === 'links'" class="d-flex flex-column gap-2">
        <div v-if="linkItems.length === 0" class="text-center text-medium-emphasis py-8">
          <v-icon size="40" color="grey" class="mb-2">lucide-link-2-off</v-icon>
          <div class="text-caption">Không tìm thấy liên kết website nào trong đoạn chat</div>
        </div>

        <v-card
          v-for="(link, idx) in linkItems"
          :key="idx"
          variant="outlined"
          class="pa-2.5 rounded-lg link-item-card d-flex align-center justify-space-between gap-2"
        >
          <div class="d-flex align-center gap-2.5 overflow-hidden">
            <v-avatar size="34" color="info" variant="tonal" rounded="lg" class="flex-shrink-0">
              <v-icon size="16">lucide-globe</v-icon>
            </v-avatar>
            <div class="overflow-hidden">
              <a
                :href="link.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-caption font-weight-medium text-primary text-truncate d-block"
                :title="link.url"
              >
                {{ link.url }}
              </a>
              <div class="text-caption text-medium-emphasis mt-0.5" style="font-size: 11px;">
                {{ link.date }}
              </div>
            </div>
          </div>

          <v-btn
            icon="lucide-external-link"
            size="small"
            variant="text"
            color="info"
            title="Mở liên kết"
            :href="link.url"
            target="_blank"
          />
        </v-card>
      </div>

    </div>

    <!-- Lightbox Preview Dialog -->
    <v-dialog v-model="showLightbox" max-width="800">
      <v-card class="rounded-xl overflow-hidden bg-black text-white">
        <div class="d-flex align-center justify-space-between pa-3 border-b border-grey-darken-3">
          <span class="text-caption font-weight-medium text-truncate text-white">{{ activeLightboxItem?.name || 'Xem ảnh' }}</span>
          <div class="d-flex align-center gap-1">
            <v-btn
              icon="lucide-download"
              variant="text"
              size="small"
              color="white"
              title="Tải về"
              @click="downloadFile(activeLightboxItem?.url, activeLightboxItem?.name)"
            />
            <v-btn icon="lucide-x" variant="text" size="small" color="white" @click="showLightbox = false" />
          </div>
        </div>
        <div class="d-flex align-center justify-center pa-2" style="max-height: 80vh; overflow: auto;">
          <img
            v-if="activeLightboxItem?.isImage"
            :src="activeLightboxItem.url"
            alt="Preview"
            style="max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 8px;"
          />
          <video
            v-else-if="activeLightboxItem?.isVideo"
            :src="activeLightboxItem.url"
            controls
            autoplay
            style="max-width: 100%; max-height: 70vh; border-radius: 8px;"
          />
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface Message {
  id: string;
  contentType: string;
  content: string;
  mediaUrl?: string | null;
  createdAt: string;
  senderType?: string;
  attachments?: any;
}

const props = defineProps<{
  messages: Message[];
}>();

const mediaSubTab = ref<'photos' | 'docs' | 'links'>('photos');
const showLightbox = ref(false);
const activeLightboxItem = ref<any>(null);

function formatDateShort(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatFileSize(bytes: number) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(name: string = '') {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return 'lucide-file-text';
  if (['doc', 'docx'].includes(ext)) return 'lucide-file-text';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'lucide-sheet';
  if (['zip', 'rar', '7z'].includes(ext)) return 'lucide-archive';
  return 'lucide-file';
}

function getFileColor(name: string = '') {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return 'error';
  if (['doc', 'docx'].includes(ext)) return 'primary';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'success';
  if (['zip', 'rar'].includes(ext)) return 'amber-darken-2';
  return 'grey-darken-1';
}

// Extract Media Items (Images & Videos)
const mediaItems = computed(() => {
  const list: any[] = [];
  for (const m of props.messages || []) {
    const isImage = m.contentType === 'image' || (m.mediaUrl && /\.(jpeg|jpg|gif|png|webp)/i.test(m.mediaUrl));
    const isVideo = m.contentType === 'video' || (m.mediaUrl && /\.(mp4|mov|webm|avi)/i.test(m.mediaUrl));

    if ((isImage || isVideo) && (m.mediaUrl || m.content)) {
      const url = m.mediaUrl || m.content;
      list.push({
        id: m.id,
        isImage,
        isVideo,
        url,
        name: url.split('/').pop()?.split('?')[0] || (isImage ? 'Ảnh' : 'Video'),
        date: formatDateShort(m.createdAt),
      });
    }
  }
  return list.reverse();
});

// Extract Document Items (PDF, Word, Excel, Files)
const docItems = computed(() => {
  const list: any[] = [];
  for (const m of props.messages || []) {
    const isDoc = m.contentType === 'file' || m.contentType === 'document' || (m.mediaUrl && /\.(pdf|doc|docx|xls|xlsx|csv|zip|rar|txt)/i.test(m.mediaUrl));
    if (isDoc && (m.mediaUrl || m.content)) {
      const url = m.mediaUrl || m.content;
      const fileName = url.split('/').pop()?.split('?')[0] || 'Tài liệu';
      list.push({
        id: m.id,
        url,
        name: fileName,
        size: m.attachments?.size || null,
        date: formatDateShort(m.createdAt),
      });
    }
  }
  return list.reverse();
});

// Extract Web Links from Message Texts
const linkItems = computed(() => {
  const list: any[] = [];
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  for (const m of props.messages || []) {
    if (m.contentType === 'text' && m.content) {
      const matches = m.content.match(urlRegex);
      if (matches) {
        for (const url of matches) {
          list.push({
            id: m.id,
            url,
            date: formatDateShort(m.createdAt),
          });
        }
      }
    }
  }
  return list.reverse();
});

function openLightbox(item: any) {
  activeLightboxItem.value = item;
  showLightbox.value = true;
}

function downloadFile(url?: string, filename?: string) {
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
</script>

<style scoped>
.media-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.media-thumb-box {
  aspect-ratio: 1;
  background-color: rgba(var(--v-theme-on-surface), 0.06);
  position: relative;
  transition: transform 0.15s ease;
}
.media-thumb-box:hover {
  transform: scale(1.02);
}
.media-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%);
  opacity: 0;
  transition: opacity 0.2s ease;
}
.media-thumb-box:hover .media-overlay {
  opacity: 1;
}
.doc-item-card, .link-item-card {
  transition: background-color 0.15s ease;
}
.doc-item-card:hover, .link-item-card:hover {
  background-color: rgba(var(--v-theme-primary), 0.04);
}
</style>
