/**
 * tag-routes.ts — Tag management endpoints.
 * Handles listing, creating, deleting, and auto-cleaning unused tags (usage count = 0).
 * All routes require JWT authentication and are org-scoped.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

// Rich curated palette of 42 high-contrast, harmonious colors
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

/**
 * Converts HSL to Hex color string
 */
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
 * Generates the next distinct, non-duplicating tag color.
 */
export function generateNextUniqueTagColor(existingColors: string[], offset = 0): string {
  const existingSet = new Set(existingColors.map((c) => c.toUpperCase()));

  // 1. Pick the first unused color from our curated 42-color palette
  for (const color of TAG_PALETTE) {
    if (!existingSet.has(color.toUpperCase())) {
      return color;
    }
  }

  // 2. Golden Ratio distribution for infinite distinct colors
  const count = existingColors.length + offset;
  const hue = Math.round((count * 137.50776405) % 360);
  const saturation = 70 + ((count * 7) % 15);
  const lightness = 42 + ((count * 5) % 12);

  return hslToHex(hue, saturation, lightness);
}

/**
 * Deletes any Tag record from DB that is not currently assigned to any contact in the organization.
 */
export async function cleanupUnusedTags(orgId: string): Promise<number> {
  try {
    // 1. Fetch all contacts with tags for this org
    const contacts = await prisma.contact.findMany({
      where: {
        orgId,
        tags: { not: Prisma.JsonNull },
      },
      select: { tags: true },
    });

    // 2. Collect all active tag names currently in use
    const activeTagNames = new Set<string>();
    for (const c of contacts) {
      if (Array.isArray(c.tags)) {
        for (const item of c.tags) {
          const name = typeof item === 'string'
            ? item.trim()
            : (item as any)?.name
            ? String((item as any).name).trim()
            : '';
          if (name) {
            activeTagNames.add(name.toLowerCase());
          }
        }
      }
    }

    // 3. Find all tags in DB for this org
    const dbTags = await prisma.tag.findMany({
      where: { orgId },
      select: { id: true, name: true },
    });

    // 4. Determine tags with usage = 0
    const unusedTagIds = dbTags
      .filter((t) => !activeTagNames.has(t.name.toLowerCase()))
      .map((t) => t.id);

    if (unusedTagIds.length > 0) {
      const deleted = await prisma.tag.deleteMany({
        where: { id: { in: unusedTagIds } },
      });
      logger.info(`[tags] Cleaned up ${deleted.count} unused tag(s) (usage count = 0) for org ${orgId}`);
      return deleted.count;
    }

    return 0;
  } catch (err) {
    logger.error('[tags] cleanupUnusedTags error:', err);
    return 0;
  }
}

/**
 * Ensures that all tag names in the array have a corresponding Tag record in DB.
 */
export async function ensureTagsExist(orgId: string, tagNames: string[]): Promise<void> {
  if (!Array.isArray(tagNames) || tagNames.length === 0) return;

  const validNames = Array.from(
    new Set(
      tagNames
        .map((t) => (typeof t === 'string' ? t.trim() : (t as any)?.name ? String((t as any).name).trim() : ''))
        .filter((t) => t.length > 0)
    )
  );

  if (validNames.length === 0) return;

  try {
    const existingTags = await prisma.tag.findMany({
      where: { orgId },
      select: { name: true, color: true },
    });

    const existingNames = new Set(existingTags.map((t) => t.name.toLowerCase()));
    const currentColors = existingTags.map((t) => t.color);
    const missingNames = validNames.filter((name) => !existingNames.has(name.toLowerCase()));

    for (let i = 0; i < missingNames.length; i++) {
      const name = missingNames[i];
      const color = generateNextUniqueTagColor(currentColors, i);
      currentColors.push(color);

      await prisma.tag.create({
        data: {
          orgId,
          name,
          color,
        },
      }).catch((err) => {
        logger.debug(`[tags] Tag '${name}' insert conflict:`, err);
      });
    }
  } catch (err) {
    logger.warn('[tags] ensureTagsExist error:', err);
  }
}

export async function tagRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/tags — list all active tags for current org ─────────────
  app.get('/api/v1/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;

      // Fetch all tags in DB for current org
      const tags = await prisma.tag.findMany({
        where: { orgId: user.orgId },
        orderBy: { name: 'asc' },
      });

      return { tags };
    } catch (err) {
      logger.error('[tags] GET /tags error:', err);
      return reply.status(500).send({ error: 'Failed to fetch tags' });
    }
  });

  // ── POST /api/v1/tags — create a new tag with unique color ────────────────
  app.post('/api/v1/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = request.body as { name?: string; color?: string };

      const rawName = body.name?.trim();
      if (!rawName) {
        return reply.status(400).send({ error: 'Tag name is required' });
      }

      // Check if tag already exists in this org (case-insensitive)
      const existing = await prisma.tag.findFirst({
        where: {
          orgId: user.orgId,
          name: { equals: rawName, mode: 'insensitive' },
        },
      });

      if (existing) {
        if (body.color && body.color !== existing.color) {
          const updated = await prisma.tag.update({
            where: { id: existing.id },
            data: { color: body.color },
          });
          return reply.status(200).send(updated);
        }
        return reply.status(200).send(existing);
      }

      // Find all existing colors in this organization to guarantee non-duplication
      const orgTags = await prisma.tag.findMany({
        where: { orgId: user.orgId },
        select: { color: true },
      });
      const existingColors = orgTags.map((t) => t.color);

      const color = body.color && /^#[0-9A-Fa-f]{6}$/.test(body.color)
        ? body.color
        : generateNextUniqueTagColor(existingColors);

      const newTag = await prisma.tag.create({
        data: {
          orgId: user.orgId,
          name: rawName,
          color,
        },
      });

      return reply.status(201).send(newTag);
    } catch (err: any) {
      logger.error('[tags] POST /tags error:', err);
      if (err.code === 'P2002') {
        return reply.status(409).send({ error: 'Tag already exists' });
      }
      return reply.status(500).send({ error: 'Failed to create tag' });
    }
  });

  // ── PUT /api/v1/tags/:id — update tag name and/or color ──────────────────
  app.put('/api/v1/tags/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as { name?: string; color?: string };

      const existing = await prisma.tag.findFirst({
        where: { id, orgId: user.orgId },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Tag not found' });
      }

      const dataToUpdate: any = {};
      const oldName = existing.name;
      const newName = body.name?.trim();

      if (newName && newName.toLowerCase() !== oldName.toLowerCase()) {
        const duplicate = await prisma.tag.findFirst({
          where: {
            orgId: user.orgId,
            name: { equals: newName, mode: 'insensitive' },
            id: { not: id },
          },
        });
        if (duplicate) {
          return reply.status(409).send({ error: 'Tag with this name already exists' });
        }
        dataToUpdate.name = newName;
      }

      if (body.color) {
        dataToUpdate.color = body.color;
      }

      const updated = await prisma.tag.update({
        where: { id },
        data: dataToUpdate,
      });

      // If tag name changed, also update contacts and tag groups referencing the old name
      if (newName && newName !== oldName) {
        // 1. Update contacts
        const contacts = await prisma.contact.findMany({
          where: { orgId: user.orgId },
          select: { id: true, tags: true },
        });
        for (const c of contacts) {
          if (Array.isArray(c.tags)) {
            let changed = false;
            const updatedTags = c.tags.map((t: any) => {
              if (typeof t === 'string' && t.toLowerCase() === oldName.toLowerCase()) {
                changed = true;
                return newName;
              }
              if (t && typeof t === 'object' && t.name && String(t.name).toLowerCase() === oldName.toLowerCase()) {
                changed = true;
                return { ...t, name: newName };
              }
              return t;
            });
            if (changed) {
              await prisma.contact.update({
                where: { id: c.id },
                data: { tags: updatedTags },
              });
            }
          }
        }

        // 2. Update tag groups
        const tagGroups = await prisma.tagGroup.findMany({
          where: { orgId: user.orgId },
        });
        for (const g of tagGroups) {
          if (Array.isArray(g.tags)) {
            let changed = false;
            const updatedGroupTags = (g.tags as string[]).map((t) => {
              if (t.toLowerCase() === oldName.toLowerCase()) {
                changed = true;
                return newName;
              }
              return t;
            });
            if (changed) {
              await prisma.tagGroup.update({
                where: { id: g.id },
                data: { tags: updatedGroupTags },
              });
            }
          }
        }
      }

      return reply.status(200).send(updated);
    } catch (err) {
      logger.error('[tags] PUT /tags/:id error:', err);
      return reply.status(500).send({ error: 'Failed to update tag' });
    }
  });

  // ── DELETE /api/v1/tags/:id — delete a tag ───────────────────────────────
  app.delete('/api/v1/tags/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const existing = await prisma.tag.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Tag not found' });
      }

      await prisma.tag.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      logger.error('[tags] DELETE /tags/:id error:', err);
      return reply.status(500).send({ error: 'Failed to delete tag' });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // ── TAG GROUPS (NHÓM TAG) ENDPOINTS ──────────────────────────────────────────
  // ═════════════════════════════════════════════════════════════════════════════

  // ── GET /api/v1/tag-groups — list all tag groups for org ──────────────────
  app.get('/api/v1/tag-groups', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const tagGroups = await prisma.tagGroup.findMany({
        where: { orgId: user.orgId },
        orderBy: { name: 'asc' },
      });

      return { tagGroups };
    } catch (err) {
      logger.error('[tags] GET /tag-groups error:', err);
      return reply.status(500).send({ error: 'Failed to fetch tag groups' });
    }
  });

  // ── POST /api/v1/tag-groups — create a new tag group ──────────────────────
  app.post('/api/v1/tag-groups', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = request.body as { name?: string; tags?: string[]; color?: string };

      const rawName = body.name?.trim();
      if (!rawName) {
        return reply.status(400).send({ error: 'Tag group name is required' });
      }

      const tagsArray = Array.isArray(body.tags)
        ? body.tags.map((t) => String(t).trim()).filter(Boolean)
        : [];

      // Ensure tags exist in Tag table
      if (tagsArray.length > 0) {
        await ensureTagsExist(user.orgId, tagsArray);
      }

      // Check if group with same name exists
      const existing = await prisma.tagGroup.findFirst({
        where: {
          orgId: user.orgId,
          name: { equals: rawName, mode: 'insensitive' },
        },
      });

      if (existing) {
        return reply.status(409).send({ error: 'Tag group with this name already exists' });
      }

      const color = body.color || '#4F46E5';

      const created = await prisma.tagGroup.create({
        data: {
          orgId: user.orgId,
          name: rawName,
          tags: tagsArray,
          color,
        },
      });

      return reply.status(201).send(created);
    } catch (err: any) {
      logger.error('[tags] POST /tag-groups error:', err);
      if (err.code === 'P2002') {
        return reply.status(409).send({ error: 'Tag group already exists' });
      }
      return reply.status(500).send({ error: 'Failed to create tag group' });
    }
  });

  // ── PUT /api/v1/tag-groups/:id — update a tag group ───────────────────────
  app.put('/api/v1/tag-groups/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as { name?: string; tags?: string[]; color?: string };

      const existing = await prisma.tagGroup.findFirst({
        where: { id, orgId: user.orgId },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Tag group not found' });
      }

      const dataToUpdate: any = {};

      if (body.name !== undefined) {
        const trimmedName = body.name.trim();
        if (!trimmedName) {
          return reply.status(400).send({ error: 'Tag group name cannot be empty' });
        }
        // Check uniqueness if changing name
        if (trimmedName.toLowerCase() !== existing.name.toLowerCase()) {
          const duplicate = await prisma.tagGroup.findFirst({
            where: {
              orgId: user.orgId,
              name: { equals: trimmedName, mode: 'insensitive' },
              id: { not: id },
            },
          });
          if (duplicate) {
            return reply.status(409).send({ error: 'Tag group with this name already exists' });
          }
        }
        dataToUpdate.name = trimmedName;
      }

      if (body.tags !== undefined && Array.isArray(body.tags)) {
        const cleanTags = body.tags.map((t) => String(t).trim()).filter(Boolean);
        dataToUpdate.tags = cleanTags;
        if (cleanTags.length > 0) {
          await ensureTagsExist(user.orgId, cleanTags);
        }
      }

      if (body.color !== undefined) {
        dataToUpdate.color = body.color;
      }

      const updated = await prisma.tagGroup.update({
        where: { id },
        data: dataToUpdate,
      });

      return reply.status(200).send(updated);
    } catch (err: any) {
      logger.error('[tags] PUT /tag-groups/:id error:', err);
      return reply.status(500).send({ error: 'Failed to update tag group' });
    }
  });

  // ── DELETE /api/v1/tag-groups/:id — delete a tag group ────────────────────
  app.delete('/api/v1/tag-groups/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const existing = await prisma.tagGroup.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Tag group not found' });
      }

      await prisma.tagGroup.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      logger.error('[tags] DELETE /tag-groups/:id error:', err);
      return reply.status(500).send({ error: 'Failed to delete tag group' });
    }
  });
}
