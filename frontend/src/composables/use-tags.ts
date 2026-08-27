import { ref, computed } from 'vue';
import { api } from '@/api/index';

export interface Tag {
  id?: string;
  name: string;
  color: string;
  createdAt?: string;
  updatedAt?: string;
}

// 42 distinct, high-contrast, modern colors
export const TAG_PALETTE = [
  '#2563EB', // Blue
  '#059669', // Emerald
  '#D97706', // Amber
  '#DC2626', // Red
  '#7C3AED', // Violet
  '#0891B2', // Cyan
  '#DB2777', // Pink
  '#4F46E5', // Indigo
  '#EA580C', // Orange
  '#16A34A', // Green
  '#0284C7', // Sky
  '#9333EA', // Purple
  '#CA8A04', // Yellow
  '#65A30D', // Lime
  '#0D9488', // Teal
  '#E11D48', // Rose
  '#475569', // Slate
  '#8B5CF6', // Purple light
  '#F43F5E', // Rose bright
  '#10B981', // Emerald bright
  '#3B82F6', // Blue medium
  '#F59E0B', // Amber medium
  '#EF4444', // Red bright
  '#84CC16', // Lime bright
  '#06B6D4', // Cyan bright
  '#A855F7', // Purple medium
  '#EC4899', // Pink medium
  '#6366F1', // Indigo bright
  '#14B8A6', // Teal medium
  '#F97316', // Orange bright
  '#64748B', // Cool Slate
  '#B91C1C', // Dark Red
  '#15803D', // Dark Green
  '#1D4ED8', // Dark Blue
  '#6D28D9', // Deep Violet
  '#BE185D', // Deep Pink
  '#0F766E', // Deep Teal
  '#C2410C', // Deep Orange
  '#A16207', // Deep Yellow
  '#4338CA', // Deep Indigo
  '#047857', // Deep Emerald
  '#B45309', // Deep Amber
];

export interface TagGroup {
  id: string;
  name: string;
  color?: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}

// Global reactive tag state so all components stay in sync
const tags = ref<Tag[]>([]);
const loading = ref(false);
let hasFetched = false;

const tagGroups = ref<TagGroup[]>([]);
const groupsLoading = ref(false);
let hasFetchedGroups = false;

function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/**
 * Generates the next distinct, non-duplicating tag color based on existing tags
 */
export function generateNextUniqueTagColor(existingTags: (Tag | { color?: string | null })[] = []): string {
  const existingSet = new Set(existingTags.map((t) => t.color?.toUpperCase()).filter(Boolean));

  // 1. Pick first unused from palette
  for (const c of TAG_PALETTE) {
    if (!existingSet.has(c.toUpperCase())) {
      return c;
    }
  }

  // 2. Golden Ratio distribution
  const count = existingTags.length;
  const hue = Math.round((count * 137.50776405) % 360);
  const saturation = 70 + ((count * 7) % 15);
  const lightness = 42 + ((count * 5) % 12);

  return hslToHex(hue, saturation, lightness);
}

/**
 * Deterministically picks a color from palette based on string hash
 */
export function getDeterministicColor(str: string): string {
  if (!str) return TAG_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % TAG_PALETTE.length;
  return TAG_PALETTE[index];
}

export function useTags() {
  const tagMap = computed(() => {
    const map = new Map<string, Tag>();
    for (const t of tags.value) {
      map.set(t.name.toLowerCase(), t);
    }
    return map;
  });

  async function fetchTags(force = false): Promise<Tag[]> {
    if (hasFetched && !force && tags.value.length > 0) {
      return tags.value;
    }
    loading.value = true;
    try {
      const res = await api.get('/tags');
      tags.value = res.data.tags ?? [];
      hasFetched = true;
    } catch (err) {
      console.error('[useTags] fetchTags error:', err);
    } finally {
      loading.value = false;
    }
    return tags.value;
  }

  async function createTag(name: string, color?: string): Promise<Tag | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;

    // Check if already in local state
    const existing = tagMap.value.get(trimmed.toLowerCase());
    if (existing) return existing;

    try {
      const payload: { name: string; color?: string } = { name: trimmed };
      if (color) payload.color = color;

      const res = await api.post('/tags', payload);
      const created: Tag = res.data;
      if (created && !tags.value.some((t) => t.name.toLowerCase() === created.name.toLowerCase())) {
        tags.value.push(created);
      }
      return created;
    } catch (err) {
      console.error('[useTags] createTag error:', err);
      // Fallback local tag with unique color
      const fallbackColor = color || generateNextUniqueTagColor(tags.value);
      const fallback: Tag = {
        name: trimmed,
        color: fallbackColor,
      };
      tags.value.push(fallback);
      return fallback;
    }
  }

  async function updateTag(
    id: string,
    payload: { name?: string; color?: string }
  ): Promise<Tag | null> {
    try {
      const res = await api.put(`/tags/${id}`, payload);
      const updated: Tag = res.data;
      if (updated) {
        const idx = tags.value.findIndex((t) => t.id === id);
        if (idx >= 0) {
          tags.value[idx] = updated;
        }
        // Also refresh tag groups if name changed
        fetchTagGroups(true);
      }
      return updated;
    } catch (err) {
      console.error('[useTags] updateTag error:', err);
      throw err;
    }
  }

  async function deleteTag(id: string): Promise<boolean> {
    try {
      await api.delete(`/tags/${id}`);
      tags.value = tags.value.filter((t) => t.id !== id);
      return true;
    } catch (err) {
      console.error('[useTags] deleteTag error:', err);
      throw err;
    }
  }

  async function fetchTagGroups(force = false): Promise<TagGroup[]> {
    if (hasFetchedGroups && !force && tagGroups.value.length > 0) {
      return tagGroups.value;
    }
    groupsLoading.value = true;
    try {
      const res = await api.get('/tag-groups');
      tagGroups.value = res.data.tagGroups ?? [];
      hasFetchedGroups = true;
    } catch (err) {
      console.error('[useTags] fetchTagGroups error:', err);
    } finally {
      groupsLoading.value = false;
    }
    return tagGroups.value;
  }

  async function createTagGroup(payload: { name: string; tags: string[]; color?: string }): Promise<TagGroup | null> {
    const trimmedName = payload.name.trim();
    if (!trimmedName) return null;

    try {
      const res = await api.post('/tag-groups', {
        name: trimmedName,
        tags: payload.tags,
        color: payload.color || '#4F46E5',
      });
      const created: TagGroup = res.data;
      if (created) {
        const idx = tagGroups.value.findIndex((g) => g.id === created.id);
        if (idx >= 0) {
          tagGroups.value[idx] = created;
        } else {
          tagGroups.value.push(created);
        }
        // Refresh tags in case new tags were created with the group
        fetchTags(true);
      }
      return created;
    } catch (err) {
      console.error('[useTags] createTagGroup error:', err);
      throw err;
    }
  }

  async function updateTagGroup(
    id: string,
    payload: { name?: string; tags?: string[]; color?: string }
  ): Promise<TagGroup | null> {
    try {
      const res = await api.put(`/tag-groups/${id}`, payload);
      const updated: TagGroup = res.data;
      if (updated) {
        const idx = tagGroups.value.findIndex((g) => g.id === id);
        if (idx >= 0) {
          tagGroups.value[idx] = updated;
        }
        fetchTags(true);
      }
      return updated;
    } catch (err) {
      console.error('[useTags] updateTagGroup error:', err);
      throw err;
    }
  }

  async function deleteTagGroup(id: string): Promise<boolean> {
    try {
      await api.delete(`/tag-groups/${id}`);
      tagGroups.value = tagGroups.value.filter((g) => g.id !== id);
      return true;
    } catch (err) {
      console.error('[useTags] deleteTagGroup error:', err);
      throw err;
    }
  }

  function getTagColor(nameOrTag: string | Tag | null | undefined): string {
    if (!nameOrTag) return TAG_PALETTE[0];
    if (typeof nameOrTag === 'object') {
      if (nameOrTag.color) return nameOrTag.color;
      if (nameOrTag.name) return getTagColor(nameOrTag.name);
    }
    const name = String(nameOrTag).trim();
    const found = tagMap.value.get(name.toLowerCase());
    if (found?.color) return found.color;
    return getDeterministicColor(name);
  }

  function getTagName(tag: string | Tag | null | undefined): string {
    if (!tag) return '';
    if (typeof tag === 'object') return tag.name || '';
    return String(tag);
  }

  function getTagStyle(tag: string | Tag | null | undefined) {
    const color = getTagColor(tag);
    return {
      backgroundColor: `${color}18`,
      color: color,
      border: `1px solid ${color}45`,
      borderRadius: '6px',
    };
  }

  return {
    tags,
    loading,
    tagMap,
    tagGroups,
    groupsLoading,
    fetchTags,
    createTag,
    updateTag,
    deleteTag,
    fetchTagGroups,
    createTagGroup,
    updateTagGroup,
    deleteTagGroup,
    getTagColor,
    getTagName,
    getTagStyle,
    generateNextUniqueTagColor,
  };
}
