<template>
  <Teleport to="body">
    <Transition name="viewer-fade">
      <div
        v-if="modelValue"
        class="image-viewer-overlay"
        tabindex="-1"
        ref="overlayRef"
        @keydown="handleKeyDown"
      >
        <!-- Top Navigation Bar -->
        <div class="viewer-top-bar d-flex align-center justify-space-between px-4 py-3">
          <!-- Image Info & Counter -->
          <div class="d-flex align-center gap-3 overflow-hidden mr-2">
            <!-- Counter Chip -->
            <div v-if="normalizedImages.length > 1" class="viewer-counter-badge">
              <v-icon size="14" class="mr-1">lucide-image</v-icon>
              <span>{{ currentIndex + 1 }} / {{ normalizedImages.length }}</span>
            </div>

            <div class="text-truncate">
              <div class="text-subtitle-2 font-weight-bold text-white text-truncate">
                {{ currentItem?.title || currentItem?.name || 'Xem ảnh' }}
              </div>
              <div v-if="currentItem?.caption || currentItem?.date || currentItem?.sender" class="text-caption text-grey-lighten-1 text-truncate">
                <span v-if="currentItem?.sender" class="mr-2 font-weight-medium text-primary-lighten-2">
                  {{ currentItem.sender }}
                </span>
                <span v-if="currentItem?.date" class="mr-2 opacity-80">
                  {{ currentItem.date }}
                </span>
                <span v-if="currentItem?.caption" class="font-italic opacity-90">
                  "{{ currentItem.caption }}"
                </span>
              </div>
            </div>
          </div>

          <!-- Top Quick Actions -->
          <div class="d-flex align-center gap-1.5 flex-shrink-0">
            <!-- Download Button -->
            <button
              class="viewer-tool-btn"
              title="Tải ảnh về máy"
              @click.stop="downloadCurrentImage"
            >
              <v-icon size="18">lucide-download</v-icon>
            </button>

            <!-- Open Original in New Tab -->
            <button
              class="viewer-tool-btn"
              title="Mở trong tab mới"
              @click.stop="openInNewTab"
            >
              <v-icon size="18">lucide-external-link</v-icon>
            </button>

            <!-- Fullscreen Toggle -->
            <button
              class="viewer-tool-btn"
              :title="isFullscreen ? 'Thu nhỏ (f)' : 'Toàn màn hình (f)'"
              @click.stop="toggleFullscreen"
            >
              <v-icon size="18">{{ isFullscreen ? 'lucide-shrink' : 'lucide-expand' }}</v-icon>
            </button>

            <!-- Close Button -->
            <button
              class="viewer-tool-btn close-btn"
              title="Đóng (Esc)"
              @click.stop="close"
            >
              <v-icon size="20">lucide-x</v-icon>
            </button>
          </div>
        </div>

        <!-- Main Viewport Area -->
        <div
          class="viewer-viewport"
          ref="viewportRef"
          @wheel.prevent="handleWheel"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @mouseup="handleMouseUp"
          @mouseleave="handleMouseUp"
          @touchstart="handleTouchStart"
          @touchmove="handleTouchMove"
          @touchend="handleTouchEnd"
          :class="{
            'is-dragging': isDragging,
            'is-zoomed': scale > 1
          }"
        >
          <!-- Loading Spinner -->
          <div v-if="imageLoading" class="viewer-loader">
            <v-progress-circular indeterminate color="primary" size="48" width="4" />
            <span class="mt-3 text-caption text-grey-lighten-2">Đang tải ảnh chất lượng cao...</span>
          </div>

          <!-- Error State -->
          <div v-if="imageError" class="viewer-error text-center pa-6">
            <v-avatar size="64" color="grey-darken-3" class="mb-3">
              <v-icon size="32" color="error">lucide-image-off</v-icon>
            </v-avatar>
            <div class="text-body-1 font-weight-bold text-white mb-1">Không thể tải hình ảnh</div>
            <div class="text-caption text-grey-lighten-1 mb-4">Đường dẫn ảnh có thể đã hết hạn hoặc bị lỗi</div>
            <v-btn
              variant="tonal"
              color="primary"
              size="small"
              prepend-icon="lucide-refresh-cw"
              @click="reloadImage"
            >
              Thử lại
            </v-btn>
          </div>

          <!-- The Rendered Image with 2D/3D Matrix Transform (Double-click to zoom only on the image) -->
          <img
            v-show="!imageError"
            ref="imageRef"
            :src="currentImageUrl"
            :alt="currentItem?.title || 'Preview'"
            class="viewer-image"
            :style="imageTransformStyle"
            @load="onImageLoad"
            @error="onImageError"
            @dblclick.stop="handleDoubleClick"
            draggable="false"
          />

          <!-- Side Navigation Chevron: PREVIOUS (<) -->
          <button
            v-if="normalizedImages.length > 1"
            class="viewer-nav-btn nav-prev"
            :class="{ 'disabled': !canGoPrev && !loop }"
            :disabled="!canGoPrev && !loop"
            title="Ảnh trước (< hoặc Mũi tên trái)"
            @click.stop="prevImage"
            @dblclick.stop.prevent
            @mousedown.stop
          >
            <v-icon size="32">lucide-chevron-left</v-icon>
          </button>

          <!-- Side Navigation Chevron: NEXT (>) -->
          <button
            v-if="normalizedImages.length > 1"
            class="viewer-nav-btn nav-next"
            :class="{ 'disabled': !canGoNext && !loop }"
            :disabled="!canGoNext && !loop"
            title="Ảnh tiếp theo (> hoặc Mũi tên phải)"
            @click.stop="nextImage"
            @dblclick.stop.prevent
            @mousedown.stop
          >
            <v-icon size="32">lucide-chevron-right</v-icon>
          </button>
        </div>

        <!-- Floating Bottom Glassmorphic Control Toolbar -->
        <div class="viewer-toolbar-wrapper">
          <div class="viewer-toolbar d-flex align-center">
            <!-- Navigation buttons in toolbar -->
            <template v-if="normalizedImages.length > 1">
              <button
                class="toolbar-btn"
                :disabled="!canGoPrev && !loop"
                title="Ảnh trước (Phím ←)"
                @click.stop="prevImage"
                @dblclick.stop.prevent
                @mousedown.stop
              >
                <v-icon size="17">lucide-chevron-left</v-icon>
              </button>

              <span class="toolbar-counter-text">
                {{ currentIndex + 1 }}/{{ normalizedImages.length }}
              </span>

              <button
                class="toolbar-btn"
                :disabled="!canGoNext && !loop"
                title="Ảnh sau (Phím →)"
                @click.stop="nextImage"
                @dblclick.stop.prevent
                @mousedown.stop
              >
                <v-icon size="17">lucide-chevron-right</v-icon>
              </button>

              <div class="toolbar-divider"></div>
            </template>

            <!-- Zoom Out (-) -->
            <button
              class="toolbar-btn"
              :disabled="scale <= MIN_SCALE"
              title="Thu nhỏ (-)"
              @click.stop="() => zoomOut()"
            >
              <v-icon size="17">lucide-zoom-out</v-icon>
            </button>

            <!-- Zoom Percentage / Reset to 100% -->
            <button
              class="toolbar-btn zoom-indicator"
              title="Nhấp để đặt lại kích thước gốc (0 hoặc r)"
              @click.stop="resetTransform"
            >
              <span>{{ Math.round(scale * 100) }}%</span>
            </button>

            <!-- Zoom In (+) -->
            <button
              class="toolbar-btn"
              :disabled="scale >= MAX_SCALE"
              title="Phóng to (+)"
              @click.stop="() => zoomIn()"
            >
              <v-icon size="17">lucide-zoom-in</v-icon>
            </button>

            <div class="toolbar-divider"></div>

            <!-- Fit to Screen / Reset -->
            <button
              class="toolbar-btn"
              title="Vừa màn hình (0)"
              @click.stop="resetTransform"
            >
              <v-icon size="17">lucide-scan</v-icon>
            </button>

            <!-- Rotate Left (-90 deg) -->
            <button
              class="toolbar-btn"
              title="Xoay trái 90° ([)"
              @click.stop="rotateLeft"
            >
              <v-icon size="17">lucide-rotate-ccw</v-icon>
            </button>

            <!-- Rotate Right (+90 deg) -->
            <button
              class="toolbar-btn"
              title="Xoay phải 90° (])"
              @click.stop="rotateRight"
            >
              <v-icon size="17">lucide-rotate-cw</v-icon>
            </button>

            <!-- Flip Horizontal -->
            <button
              class="toolbar-btn"
              :class="{ 'active': flipX === -1 }"
              title="Lật ảnh ngang"
              @click.stop="toggleFlipX"
            >
              <v-icon size="17">lucide-flip-horizontal-2</v-icon>
            </button>

            <!-- Toggle Thumbnail Strip (if multiple images) -->
            <template v-if="normalizedImages.length > 1">
              <div class="toolbar-divider"></div>
              <button
                class="toolbar-btn"
                :class="{ 'active': showThumbnailStrip }"
                title="Hiện/Ẩn danh sách ảnh thu nhỏ"
                @click.stop="showThumbnailStrip = !showThumbnailStrip"
              >
                <v-icon size="17">lucide-layout-grid</v-icon>
              </button>
            </template>
          </div>
        </div>

        <!-- Bottom Thumbnail Strip (Gallery Mode) -->
        <Transition name="slide-up">
          <div
            v-if="normalizedImages.length > 1 && showThumbnailStrip"
            class="viewer-thumbnails-bar custom-scrollbar"
          >
            <div class="thumbnails-track d-flex align-center justify-center gap-2 pa-2">
              <div
                v-for="(img, idx) in normalizedImages"
                :key="img.url + idx"
                class="thumb-item"
                :class="{ 'active': idx === currentIndex }"
                @click.stop="selectImage(idx)"
              >
                <img :src="img.thumb || img.url" :alt="img.title || `Thumbnail ${idx + 1}`" loading="lazy" @error="(e: any) => { e.target.style.opacity = '0.35'; }" />
                <div v-if="idx === currentIndex" class="thumb-indicator"></div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted, type CSSProperties } from 'vue';
import { api } from '@/api/index';

export interface ViewerImageItem {
  url: string;
  thumb?: string;
  title?: string;
  caption?: string;
  sender?: string;
  date?: string;
  rawUrl?: string;
  name?: string;
  [key: string]: any;
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    images: (ViewerImageItem | string)[] | ViewerImageItem | string;
    initialIndex?: number;
    loop?: boolean;
  }>(),
  {
    initialIndex: 0,
    loop: true,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'change', index: number): void;
}>();

// ── Normalize images prop into uniform array ─────────────────────────────────
const normalizedImages = computed<ViewerImageItem[]>(() => {
  if (!props.images) return [];
  const list = Array.isArray(props.images) ? props.images : [props.images];
  return list.map((item, idx) => {
    if (typeof item === 'string') {
      return { url: item, title: `Ảnh ${idx + 1}` };
    }
    return item;
  });
});

const currentIndex = ref(0);
const currentItem = computed(() => normalizedImages.value[currentIndex.value] || null);
const currentImageUrl = computed(() => currentItem.value?.url || '');

const canGoPrev = computed(() => currentIndex.value > 0);
const canGoNext = computed(() => currentIndex.value < normalizedImages.value.length - 1);

// ── State for Transform (Zoom, Pan, Rotate, Flip) ────────────────────────────
const MIN_SCALE = 0.2;
const MAX_SCALE = 10.0;
const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);
const rotate = ref(0);
const flipX = ref<1 | -1>(1);

const isDragging = ref(false);
const dragStart = { x: 0, y: 0 };
const translateStart = { x: 0, y: 0 };

const imageLoading = ref(true);
const imageError = ref(false);
const showThumbnailStrip = ref(true);
const isFullscreen = ref(false);

const overlayRef = ref<HTMLElement | null>(null);
const viewportRef = ref<HTMLElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);

// ── Touch Handling (Pinch-to-zoom & Touch Pan) ───────────────────────────────
let initialPinchDistance = 0;
let initialPinchScale = 1;
let isPinching = false;

// ── Image Transform Style ───────────────────────────────────────────────────
const imageTransformStyle = computed<CSSProperties>(() => {
  return {
    transform: `translate3d(${translateX.value}px, ${translateY.value}px, 0) scale(${scale.value}) rotate(${rotate.value}deg) scaleX(${flipX.value})`,
    cursor: scale.value > 1 ? (isDragging.value ? 'grabbing' : 'grab') : 'zoom-in',
    transition: isDragging.value || isPinching ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)',
  };
});

// ── Reset & Navigate ────────────────────────────────────────────────────────
function resetTransform() {
  scale.value = 1;
  translateX.value = 0;
  translateY.value = 0;
  rotate.value = 0;
  flipX.value = 1;
}

function selectImage(index: number) {
  if (index < 0 || index >= normalizedImages.value.length) return;
  if (currentIndex.value === index) return;
  currentIndex.value = index;
  imageLoading.value = true;
  imageError.value = false;
  resetTransform();
  emit('change', index);
}

function prevImage() {
  if (canGoPrev.value) {
    selectImage(currentIndex.value - 1);
  } else if (props.loop && normalizedImages.value.length > 1) {
    selectImage(normalizedImages.value.length - 1);
  }
}

function nextImage() {
  if (canGoNext.value) {
    selectImage(currentIndex.value + 1);
  } else if (props.loop && normalizedImages.value.length > 1) {
    selectImage(0);
  }
}

function close() {
  emit('update:modelValue', false);
}

function onImageLoad() {
  imageLoading.value = false;
  imageError.value = false;
}

function onImageError() {
  imageLoading.value = false;
  imageError.value = true;
}

function reloadImage() {
  imageError.value = false;
  imageLoading.value = true;
  if (imageRef.value) {
    const src = currentImageUrl.value;
    imageRef.value.src = '';
    setTimeout(() => {
      if (imageRef.value) imageRef.value.src = src;
    }, 50);
  }
}

// ── Zoom In / Out Math ───────────────────────────────────────────────────────
function zoomIn(step = 1.3) {
  const newScale = Math.min(MAX_SCALE, scale.value * step);
  scale.value = Number(newScale.toFixed(2));
}

function zoomOut(step = 1.3) {
  const newScale = Math.max(MIN_SCALE, scale.value / step);
  scale.value = Number(newScale.toFixed(2));
  if (scale.value <= 1) {
    translateX.value = 0;
    translateY.value = 0;
  }
}

function rotateLeft() {
  rotate.value = (rotate.value - 90) % 360;
}

function rotateRight() {
  rotate.value = (rotate.value + 90) % 360;
}

function toggleFlipX() {
  flipX.value = flipX.value === 1 ? -1 : 1;
}

// ── Mouse Wheel Zoom (Focusing on cursor position) ──────────────────────────
function handleWheel(e: WheelEvent) {
  if (!viewportRef.value) return;

  const rect = viewportRef.value.getBoundingClientRect();
  const mouseX = e.clientX - rect.left - rect.width / 2;
  const mouseY = e.clientY - rect.top - rect.height / 2;

  const delta = e.deltaY < 0 ? 1.18 : 1 / 1.18;
  const oldScale = scale.value;
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * delta));

  if (newScale === oldScale) return;

  const ratio = newScale / oldScale;
  translateX.value = mouseX - (mouseX - translateX.value) * ratio;
  translateY.value = mouseY - (mouseY - translateY.value) * ratio;
  scale.value = Number(newScale.toFixed(3));

  if (scale.value <= 1) {
    translateX.value = 0;
    translateY.value = 0;
  }
}

// ── Mouse Drag & Double Click ────────────────────────────────────────────────
function handleMouseDown(e: MouseEvent) {
  if (e.button !== 0) return; // Only left click
  isDragging.value = true;
  dragStart.x = e.clientX;
  dragStart.y = e.clientY;
  translateStart.x = translateX.value;
  translateStart.y = translateY.value;
}

function handleMouseMove(e: MouseEvent) {
  if (!isDragging.value) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  translateX.value = translateStart.x + dx;
  translateY.value = translateStart.y + dy;
}

function handleMouseUp() {
  isDragging.value = false;
}

function handleDoubleClick(e: MouseEvent) {
  // Only trigger zoom if double clicked directly on the image element
  if (e.target !== imageRef.value) return;

  if (scale.value > 1.2) {
    resetTransform();
  } else {
    // Zoom in 2.5x towards clicked point
    if (!viewportRef.value) return;
    const rect = viewportRef.value.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;

    const targetScale = 2.5;
    const ratio = targetScale / scale.value;
    translateX.value = mouseX - (mouseX - translateX.value) * ratio;
    translateY.value = mouseY - (mouseY - translateY.value) * ratio;
    scale.value = targetScale;
  }
}

// ── Touch Gestures (Pinch & Pan) ─────────────────────────────────────────────
function getTouchDistance(t1: Touch, t2: Touch): number {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length === 2) {
    isPinching = true;
    initialPinchDistance = getTouchDistance(e.touches[0], e.touches[1]);
    initialPinchScale = scale.value;
  } else if (e.touches.length === 1) {
    isDragging.value = true;
    dragStart.x = e.touches[0].clientX;
    dragStart.y = e.touches[0].clientY;
    translateStart.x = translateX.value;
    translateStart.y = translateY.value;
  }
}

function handleTouchMove(e: TouchEvent) {
  if (isPinching && e.touches.length === 2) {
    e.preventDefault();
    const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
    if (initialPinchDistance > 0) {
      const factor = currentDistance / initialPinchDistance;
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, initialPinchScale * factor));
    }
  } else if (isDragging.value && e.touches.length === 1 && scale.value > 1) {
    e.preventDefault();
    const dx = e.touches[0].clientX - dragStart.x;
    const dy = e.touches[0].clientY - dragStart.y;
    translateX.value = translateStart.x + dx;
    translateY.value = translateStart.y + dy;
  }
}

function handleTouchEnd(e: TouchEvent) {
  if (e.touches.length < 2) isPinching = false;
  if (e.touches.length === 0) isDragging.value = false;
}

// ── Keyboard Shortcuts ───────────────────────────────────────────────────────
function handleKeyDown(e: KeyboardEvent) {
  if (!props.modelValue) return;

  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      close();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      prevImage();
      break;
    case 'ArrowRight':
      e.preventDefault();
      nextImage();
      break;
    case '+':
    case '=':
      e.preventDefault();
      zoomIn();
      break;
    case '-':
    case '_':
      e.preventDefault();
      zoomOut();
      break;
    case '0':
    case 'r':
    case 'R':
      e.preventDefault();
      resetTransform();
      break;
    case '[':
      e.preventDefault();
      rotateLeft();
      break;
    case ']':
      e.preventDefault();
      rotateRight();
      break;
    case 'f':
    case 'F':
      e.preventDefault();
      toggleFullscreen();
      break;
  }
}

// ── Download & External Link ─────────────────────────────────────────────────
function getValidImageFilename(item: ViewerImageItem | null, index: number, url: string): string {
  let name = (item?.name || item?.title || '').trim();

  // Extract extension from URL if available
  const cleanUrl = url.split('?')[0].split('#')[0];
  let extFromUrl = cleanUrl.split('.').pop()?.toLowerCase() || '';
  if (!['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(extFromUrl)) {
    extFromUrl = '';
  }

  // Check if name already has a recognized image extension
  const nameExt = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(nameExt)) {
    return name.replace(/[<>:"/\\|?*]+/g, '_');
  }

  // Determine final extension
  const finalExt = extFromUrl || 'jpg';

  if (!name || name === 'Xem ảnh' || name.startsWith('Ảnh ')) {
    name = `image_${Date.now()}_${index + 1}`;
  } else {
    name = name.replace(/[<>:"/\\|?*]+/g, '_').slice(0, 50);
  }

  return `${name}.${finalExt}`;
}

async function downloadCurrentImage() {
  const url = currentItem.value?.rawUrl || currentImageUrl.value;
  if (!url) return;

  const filename = getValidImageFilename(currentItem.value, currentIndex.value, url);

  // 1. If it's a browser-local blob: or data: URL, trigger direct anchor download
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  // 2. Direct client fetch (fast & keeps proper image MIME type)
  try {
    const directRes = await fetch(url, { mode: 'cors' });
    if (directRes.ok) {
      const blob = await directRes.blob();
      let mimeType = blob.type;
      if (!mimeType || mimeType === 'application/octet-stream') {
        const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
        mimeType = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : (ext === 'gif' ? 'image/gif' : 'image/jpeg'));
      }
      const typedBlob = new Blob([blob], { type: mimeType });
      const blobUrl = window.URL.createObjectURL(typedBlob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
      return;
    }
  } catch {
    // CORS prevented direct fetch, proceed to backend proxy
  }

  // 3. Backend Proxy Download via API
  try {
    const res = await api.get('/files/download', {
      params: { url, filename },
      responseType: 'blob',
    });

    let blobType = res.data.type || '';
    if (!blobType || blobType === 'application/octet-stream') {
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      blobType = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : (ext === 'gif' ? 'image/gif' : 'image/jpeg'));
    }

    const typedBlob = new Blob([res.data], { type: blobType });
    const blobUrl = window.URL.createObjectURL(typedBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(blobUrl);
    document.body.removeChild(a);
    return;
  } catch (apiErr) {
    console.warn('Backend proxy download failed, trying canvas fallback:', apiErr);
  }

  // 4. Canvas Draw Fallback (Convert rendered image element to JPEG Blob)
  try {
    const img = imageRef.value;
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
          }
        }, 'image/jpeg', 0.95);
        return;
      }
    }
  } catch {
    // Canvas tainted by CORS
  }

  // 5. Ultimate Fallback: Open in new window
  window.open(url, '_blank');
}

function openInNewTab() {
  const url = currentItem.value?.rawUrl || currentImageUrl.value;
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    overlayRef.value?.requestFullscreen?.().catch(() => {});
    isFullscreen.value = true;
  } else {
    document.exitFullscreen?.().catch(() => {});
    isFullscreen.value = false;
  }
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement;
}

// ── Lifecycle & Watchers ────────────────────────────────────────────────────
watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      currentIndex.value = Math.min(
        Math.max(0, props.initialIndex || 0),
        Math.max(0, normalizedImages.value.length - 1)
      );
      resetTransform();
      imageLoading.value = true;
      imageError.value = false;
      document.body.style.overflow = 'hidden';
      nextTick(() => {
        overlayRef.value?.focus();
      });
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    }
  }
);

watch(
  () => props.initialIndex,
  (newIdx) => {
    if (props.modelValue && newIdx !== undefined && newIdx !== currentIndex.value) {
      selectImage(newIdx);
    }
  }
);

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange);
});

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  window.removeEventListener('keydown', handleKeyDown);
  document.body.style.overflow = '';
});
</script>

<style scoped>
/* ── Overlay Modal ── */
.image-viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background-color: rgba(6, 7, 10, 0.94);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  display: flex;
  flex-direction: column;
  user-select: none;
  outline: none;
  touch-action: none;
}

/* ── Top Bar ── */
.viewer-top-bar {
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0) 100%);
  z-index: 10;
}

.viewer-counter-badge {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border-radius: 9999px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
}

.viewer-tool-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.18s ease;
  backdrop-filter: blur(8px);
}

.viewer-tool-btn:hover {
  background: rgba(255, 255, 255, 0.22);
  transform: translateY(-1px);
}

.viewer-tool-btn.close-btn:hover {
  background: rgba(239, 68, 68, 0.8);
  border-color: rgba(239, 68, 68, 1);
}

/* ── Viewport Area ── */
.viewer-viewport {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  touch-action: none;
}

.viewer-image {
  max-width: 90vw;
  max-height: 80vh;
  object-fit: contain;
  border-radius: 4px;
  will-change: transform;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
}

/* ── Loader & Error ── */
.viewer-loader,
.viewer-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 5;
}

/* ── Side Navigation Arrows (< và >) ── */
.viewer-nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: rgba(20, 22, 28, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
  backdrop-filter: blur(12px);
  z-index: 10;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.viewer-nav-btn:hover:not(.disabled) {
  background: rgba(0, 104, 255, 0.85);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-50%) scale(1.08);
  box-shadow: 0 6px 24px rgba(0, 104, 255, 0.4);
}

.viewer-nav-btn:active:not(.disabled) {
  transform: translateY(-50%) scale(0.96);
}

.viewer-nav-btn.nav-prev {
  left: 20px;
}

.viewer-nav-btn.nav-next {
  right: 20px;
}

.viewer-nav-btn.disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

/* ── Bottom Floating Toolbar ── */
.viewer-toolbar-wrapper {
  position: absolute;
  bottom: 24px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 20;
}

.viewer-toolbar {
  pointer-events: auto;
  background: rgba(18, 20, 26, 0.78);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 9999px;
  padding: 6px 14px;
  gap: 6px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
  transition: all 0.2s ease;
}

.viewer-toolbar:hover {
  background: rgba(18, 20, 26, 0.9);
  border-color: rgba(255, 255, 255, 0.22);
}

.toolbar-btn {
  background: transparent;
  color: #e4e6eb;
  border: none;
  border-radius: 9999px;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.16s ease;
}

.toolbar-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  transform: scale(1.06);
}

.toolbar-btn:active:not(:disabled) {
  transform: scale(0.94);
}

.toolbar-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.toolbar-btn.active {
  background: rgba(0, 104, 255, 0.7);
  color: #ffffff;
}

.toolbar-btn.zoom-indicator {
  width: auto;
  min-width: 52px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.toolbar-counter-text {
  font-size: 12px;
  font-weight: 600;
  color: #e4e6eb;
  padding: 0 4px;
  user-select: none;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.16);
  margin: 0 4px;
}

/* ── Bottom Thumbnail Strip ── */
.viewer-thumbnails-bar {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 90vw;
  background: rgba(14, 16, 20, 0.85);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  overflow-x: auto;
  z-index: 15;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
}

.thumb-item {
  width: 54px;
  height: 54px;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.18s ease;
  background: rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
}

.thumb-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.65;
  transition: opacity 0.18s ease;
}

.thumb-item:hover img {
  opacity: 0.9;
}

.thumb-item.active {
  border-color: #0068ff;
  transform: scale(1.05);
}

.thumb-item.active img {
  opacity: 1;
}

.thumb-indicator {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: #0068ff;
}

/* ── Animations ── */
.viewer-fade-enter-active,
.viewer-fade-leave-active {
  transition: opacity 0.22s ease;
}

.viewer-fade-enter-from,
.viewer-fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translate(-50%, 15px);
  opacity: 0;
}
</style>
