/**
 * zalo-sync-routes.ts — Endpoints to sync Zalo friends/contacts to CRM contacts.
 * Requires owner or admin role.
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { zaloPool } from './zalo-pool.js';
import { logger } from '../../shared/utils/logger.js';
import { randomUUID } from 'node:crypto';
import { findMatchingContact, linkZaloUidToContact } from '../contacts/contact-merge-service.js';

export async function zaloSyncRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // Sync all friends from a Zalo account to contacts
  app.post('/api/v1/zalo-accounts/:id/sync-contacts', { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const instance = zaloPool.getInstance(id);
      if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

      try {
        const result = await instance.api.getAllFriends();
        // getAllFriends returns object with profiles
        const friends = Object.values(result || {}) as any[];
        let created = 0, updated = 0;

        for (const friend of friends) {
          const uid = friend.userId || friend.uid || '';
          if (!uid) continue;

          const zaloName = friend.zaloName || friend.zalo_name || friend.displayName || friend.display_name || '';
          const avatar = friend.avatar || '';
          const phone = friend.phoneNumber || '';

          const existing = await findMatchingContact(user.orgId, {
            zaloUid: uid,
            phone: phone || null,
            fullName: zaloName || null,
            avatarUrl: avatar || null,
          });

          if (existing) {
            await prisma.contact.update({
              where: { id: existing.id },
              data: {
                fullName: (!existing.fullName || existing.fullName === 'Unknown' || existing.fullName === 'Khách hàng') ? (zaloName || existing.fullName) : existing.fullName,
                zaloName: zaloName || existing.zaloName,
                avatarUrl: avatar || existing.avatarUrl,
                phone: phone || existing.phone,
              },
            });
            await linkZaloUidToContact(existing.id, uid);
            updated++;
          } else {
            await prisma.contact.create({
              data: {
                id: randomUUID(),
                orgId: user.orgId,
                zaloUid: uid,
                fullName: zaloName || 'Unknown',
                zaloName: zaloName || null,
                avatarUrl: avatar || null,
                phone: phone || null,
                metadata: { linkedZaloUids: [uid] },
              },
            });
            created++;
          }
        }

        logger.info(`[sync] Zalo contacts: ${created} created, ${updated} updated`);
        return { success: true, created, updated, total: friends.length };
      } catch (err) {
        logger.error('[sync] Zalo contacts error:', err);
        return reply.status(500).send({ error: 'Sync failed: ' + String(err) });
      }
    }
  );

  // Sync all groups and their avatars from a Zalo account
  app.post('/api/v1/zalo-accounts/:id/sync-groups', { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const instance = zaloPool.getInstance(id);
      if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

      try {
        const result = await instance.api.getAllGroups();
        const groupIds = Object.keys(result?.gridVerMap || {});
        if (groupIds.length === 0) {
          return { success: true, created: 0, updated: 0, total: 0 };
        }

        let created = 0, updated = 0;

        // Fetch in batches of 20
        const batchSize = 20;
        for (let i = 0; i < groupIds.length; i += batchSize) {
          const chunk = groupIds.slice(i, i + batchSize);
          try {
            const infoRes = await instance.api.getGroupInfo(chunk);
            const gridInfoMap = infoRes?.gridInfoMap || {};

            for (const groupId of chunk) {
              const info = gridInfoMap[groupId];
              const groupName = info?.name || 'Nhóm Zalo';
              const avatarUrl = info?.avt || info?.fullAvt || null;

              const existingContact = await prisma.contact.findFirst({
                where: { zaloUid: groupId, orgId: user.orgId },
              });

              let contactId: string;
              if (existingContact) {
                contactId = existingContact.id;
                await prisma.contact.update({
                  where: { id: existingContact.id },
                  data: {
                    fullName: groupName,
                    ...(avatarUrl ? { avatarUrl } : {}),
                  },
                });
                updated++;
              } else {
                const newContact = await prisma.contact.create({
                  data: {
                    id: randomUUID(),
                    orgId: user.orgId,
                    zaloUid: groupId,
                    fullName: groupName,
                    avatarUrl: avatarUrl,
                    metadata: { isGroup: true },
                  },
                });
                contactId = newContact.id;
                created++;
              }

              // Ensure conversation row exists
              let existingConv = await prisma.conversation.findFirst({
                where: { zaloAccountId: id, externalThreadId: groupId },
              });

              if (!existingConv) {
                existingConv = await prisma.conversation.findFirst({
                  where: { orgId: user.orgId, externalThreadId: groupId },
                  orderBy: { lastMessageAt: 'desc' },
                });
                if (existingConv) {
                  await prisma.conversation.update({
                    where: { id: existingConv.id },
                    data: {
                      zaloAccountId: id,
                      ...(contactId && !existingConv.contactId ? { contactId } : {}),
                    },
                  }).catch(() => {});
                }
              }

              if (!existingConv) {
                await prisma.conversation.create({
                  data: {
                    id: randomUUID(),
                    orgId: user.orgId,
                    zaloAccountId: id,
                    contactId,
                    threadType: 'group',
                    externalThreadId: groupId,
                    isReplied: true,
                    unreadCount: 0,
                  },
                });
              }
            }
          } catch (batchErr) {
            logger.warn(`[sync] Failed to fetch group batch info:`, batchErr);
          }
        }

        logger.info(`[sync] Zalo groups: ${created} created, ${updated} updated`);
        return { success: true, created, updated, total: groupIds.length };
      } catch (err) {
        logger.error('[sync] Zalo groups error:', err);
        return reply.status(500).send({ error: 'Sync groups failed: ' + String(err) });
      }
    }
  );
}
