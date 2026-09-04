/**
 * contact-merge-service.ts — Service to resolve, link, and merge contacts across multiple Zalo accounts.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export interface ContactMatchParams {
  zaloUid?: string | null;
  phone?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
}

/**
 * Extract 32-character avatar hash from Zalo avatar URL.
 * Example: https://s120-26-ava-talk.zadn.vn/53/4a18388e622e4f4417b1b1a77fd47631.jpg?key=...
 * Returns "4a18388e622e4f4417b1b1a77fd47631" or null.
 */
export function extractAvatarHash(url?: string | null): string | null {
  if (!url) return null;
  // Match standard 32-hex characters in avatar filename
  const match = url.match(/\/([a-f0-9]{32})\.(jpg|jpeg|png)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Normalize Vietnamese phone number (removes spaces, dots, dashes; ensures standard format).
 */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s.-]/g, '').trim();
  if (cleaned.length < 9) return null;
  // Convert +84 or 84 to 0
  if (cleaned.startsWith('+84')) return '0' + cleaned.slice(3);
  if (cleaned.startsWith('84') && cleaned.length === 11) return '0' + cleaned.slice(2);
  return cleaned;
}

/**
 * Find an existing contact in the organization that matches the given Zalo identity.
 * Matching priority:
 * 1. Direct zaloUid match
 * 2. zaloUid in metadata.linkedZaloUids
 * 3. Phone number match
 * 4. Avatar hash + normalized fullName match
 */
export async function findMatchingContact(
  orgId: string,
  params: ContactMatchParams
): Promise<any | null> {
  const { zaloUid, phone, fullName, avatarUrl } = params;

  // 1. Direct zaloUid match
  if (zaloUid) {
    const byUid = await prisma.contact.findFirst({
      where: { orgId, zaloUid },
    });
    if (byUid) return byUid;

    // 2. Check metadata.linkedZaloUids
    // Note: in Prisma Postgres/SQLite, we can query all contacts in org with non-empty metadata or search
    const allWithUids = await prisma.contact.findMany({
      where: {
        orgId,
        metadata: { not: PrismaJsonNullValue() },
      },
      take: 100,
    });
    for (const c of allWithUids) {
      const meta = (c.metadata as any) || {};
      const linked = Array.isArray(meta.linkedZaloUids) ? meta.linkedZaloUids : [];
      if (linked.includes(zaloUid)) {
        return c;
      }
    }
  }

  return null;
}

function PrismaJsonNullValue() {
  return undefined as any;
}

/**
 * Add a secondary Zalo UID to a contact's metadata.linkedZaloUids array
 */
export async function linkZaloUidToContact(contactId: string, newZaloUid: string): Promise<void> {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, zaloUid: true, metadata: true },
    });
    if (!contact) return;

    if (contact.zaloUid === newZaloUid) return;

    const meta = (contact.metadata as Record<string, any>) || {};
    const linked: string[] = Array.isArray(meta.linkedZaloUids) ? [...meta.linkedZaloUids] : [];

    if (!linked.includes(newZaloUid)) {
      linked.push(newZaloUid);
      meta.linkedZaloUids = linked;

      await prisma.contact.update({
        where: { id: contactId },
        data: { metadata: meta },
      });
      logger.info(`[contact-matcher] Linked Zalo UID ${newZaloUid} to contact ${contactId}`);
    }
  } catch (err) {
    logger.warn(`[contact-matcher] Failed to link Zalo UID ${newZaloUid} to contact ${contactId}:`, err);
  }
}

/**
 * Merge one or more source contacts into a single primary contact.
 */
export async function mergeContacts(
  orgId: string,
  primaryContactId: string,
  sourceContactIds: string[]
): Promise<any> {
  // Filter out primaryContactId from source list
  const cleanSources = sourceContactIds.filter((id) => id && id !== primaryContactId);
  if (cleanSources.length === 0) {
    return prisma.contact.findFirst({ where: { id: primaryContactId, orgId } });
  }

  const [primary, sources] = await Promise.all([
    prisma.contact.findFirst({ where: { id: primaryContactId, orgId } }),
    prisma.contact.findMany({ where: { orgId, id: { in: cleanSources } } }),
  ]);

  if (!primary) {
    throw new Error('Primary contact not found in organization');
  }

  logger.info(
    `[contact-merge] Merging ${sources.length} contacts into primary contact ${primary.id} (${primary.fullName})`
  );

  // 1. Gather all secondary Zalo UIDs
  const primaryMeta = (primary.metadata as Record<string, any>) || {};
  const linkedZaloUids: string[] = Array.isArray(primaryMeta.linkedZaloUids)
    ? [...primaryMeta.linkedZaloUids]
    : [];

  if (primary.zaloUid && !linkedZaloUids.includes(primary.zaloUid)) {
    linkedZaloUids.push(primary.zaloUid);
  }

  for (const src of sources) {
    if (src.zaloUid && !linkedZaloUids.includes(src.zaloUid)) {
      linkedZaloUids.push(src.zaloUid);
    }
    const srcMeta = (src.metadata as Record<string, any>) || {};
    if (Array.isArray(srcMeta.linkedZaloUids)) {
      for (const u of srcMeta.linkedZaloUids) {
        if (u && !linkedZaloUids.includes(u)) {
          linkedZaloUids.push(u);
        }
      }
    }
  }
  primaryMeta.linkedZaloUids = linkedZaloUids;

  // 2. Merge tags (unique union)
  const primaryTags: string[] = Array.isArray(primary.tags) ? [...(primary.tags as string[])] : [];
  for (const src of sources) {
    if (Array.isArray(src.tags)) {
      for (const t of src.tags as string[]) {
        if (t && !primaryTags.includes(t)) {
          primaryTags.push(t);
        }
      }
    }
  }

  // 3. Re-assign conversations, orders, appointments in a transaction
  await prisma.$transaction(async (tx) => {
    // Re-link conversations
    await tx.conversation.updateMany({
      where: { orgId, contactId: { in: cleanSources } },
      data: { contactId: primaryContactId },
    });

    // Re-link orders
    await tx.order.updateMany({
      where: { orgId, contactId: { in: cleanSources } },
      data: { contactId: primaryContactId },
    });

    // Re-link appointments
    await tx.appointment.updateMany({
      where: { orgId, contactId: { in: cleanSources } },
      data: { contactId: primaryContactId },
    });

    // Backfill any missing fields on primary contact from sources
    const bestPhone = primary.phone || sources.find((s) => s.phone)?.phone || null;
    const bestEmail = primary.email || sources.find((s) => s.email)?.email || null;
    const bestCustomerId = primary.customerId || sources.find((s) => s.customerId)?.customerId || null;
    const bestAddress = primary.address || sources.find((s) => s.address)?.address || null;
    const bestZone = primary.zone || sources.find((s) => s.zone)?.zone || null;
    const bestSalesperson = primary.salesperson || sources.find((s) => s.salesperson)?.salesperson || null;
    const bestAvatar = primary.avatarUrl || sources.find((s) => s.avatarUrl)?.avatarUrl || null;
    const bestAssigned = primary.assignedUserId || sources.find((s) => s.assignedUserId)?.assignedUserId || null;

    await tx.contact.update({
      where: { id: primaryContactId },
      data: {
        phone: bestPhone,
        email: bestEmail,
        customerId: bestCustomerId,
        address: bestAddress,
        zone: bestZone,
        salesperson: bestSalesperson,
        avatarUrl: bestAvatar,
        assignedUserId: bestAssigned,
        tags: primaryTags,
        metadata: primaryMeta,
      },
    });

    // Delete the source contacts
    await tx.contact.deleteMany({
      where: { orgId, id: { in: cleanSources } },
    });
  });

  logger.info(`[contact-merge] Successfully merged into contact ${primaryContactId}`);

  return prisma.contact.findUnique({
    where: { id: primaryContactId },
    include: {
      conversations: true,
      _count: { select: { conversations: true, orders: true } },
    },
  });
}
