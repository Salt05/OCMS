/**
 * zalo-listener-factory.ts — sets up zca-js listener events for one Zalo account.
 * Handles message routing, user-info caching, group detection, and undo events.
 * Extracted from ZaloAccountPool to keep zalo-pool.ts under 200 lines.
 */
import type { Server } from 'socket.io';
import { logger } from '../../shared/utils/logger.js';
import { handleIncomingMessage, handleMessageUndo, handleMessageReaction } from '../chat/message-handler.js';
import { detectContentType, extractAttachments, updateContactAvatar } from './zalo-message-helpers.js';

import { prisma } from '../../shared/database/prisma-client.js';
import { recoverMissedMessages } from './zalo-message-recovery.js';

// Cached user info entry with 5-minute TTL
export interface UserInfoCacheEntry {
  zaloName: string;
  avatar: string;
  phone?: string;
  cachedAt: number;
}

const USER_INFO_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Fetch zaloName + avatar from API with a per-pool in-memory cache
export async function resolveZaloName(
  api: any,
  uid: string,
  cache: Map<string, UserInfoCacheEntry>,
): Promise<{ zaloName: string; avatar: string }> {
  const cached = cache.get(uid);
  if (cached && Date.now() - cached.cachedAt < USER_INFO_CACHE_TTL_MS) {
    return { zaloName: cached.zaloName, avatar: cached.avatar };
  }

  try {
    const result = await api.getUserInfo(uid);
    const profiles = result?.changed_profiles || {};
    const profile = profiles[uid] || profiles[`${uid}_0`];
    if (profile) {
      const entry: UserInfoCacheEntry = {
        zaloName:
          profile.zaloName ||
          profile.zalo_name ||
          profile.displayName ||
          profile.display_name ||
          '',
        avatar: profile.avatar || '',
        phone: profile.phoneNumber || '',
        cachedAt: Date.now(),
      };
      cache.set(uid, entry);
      return { zaloName: entry.zaloName, avatar: entry.avatar };
    }
  } catch (err) {
    logger.warn(`[zalo] getUserInfo failed for ${uid}:`, err);
  }
  return { zaloName: '', avatar: '' };
}

// Fetch group display name and avatar from the zca-js API
export interface GroupInfoResult {
  name: string;
  avatarUrl: string | null;
}

export async function resolveGroupInfo(api: any, groupId: string): Promise<GroupInfoResult> {
  try {
    const result = await api.getGroupInfo(groupId);
    const info = result?.gridInfoMap?.[groupId];
    return {
      name: info?.name || '',
      avatarUrl: info?.avt || info?.fullAvt || null,
    };
  } catch (err) {
    logger.warn(`[zalo] getGroupInfo failed for ${groupId}:`, err);
    return { name: '', avatarUrl: null };
  }
}

export async function resolveGroupName(api: any, groupId: string): Promise<string> {
  const info = await resolveGroupInfo(api, groupId);
  return info.name;
}

export interface ListenerContext {
  accountId: string;
  api: any;
  io: Server | null;
  userInfoCache: Map<string, UserInfoCacheEntry>;
  onDisconnected: (accountId: string) => void;
}

/**
 * Attach all zca-js listener events for the given account.
 * Calls listener.start() with retryOnClose at the end.
 */
export function attachZaloListener(ctx: ListenerContext): void {
  const { accountId, api, io, userInfoCache, onDisconnected } = ctx;
  const listener = api.listener;

  listener.on('connected', () => {
    logger.info(`[zalo:${accountId}] Listener connected`);
    // Full 2-way offline recovery: marks unread (<200ms) and syncs outbound self messages in background
    recoverMissedMessages({ accountId, api, io, userInfoCache }).catch((err) => {
      logger.warn(`[zalo:${accountId}] Offline recovery error:`, err);
    });
  });

  listener.on('message', async (message: any) => {
    try {
      // ThreadType in zca-js: 0 = User, 1 = Group
      const isGroup = message.type === 1;
      const uidFrom = String(message.data?.uidFrom || '');
      const idTo = String(message.data?.idTo || '');

      let ownUid = '';
      try {
        if (api.getOwnId) ownUid = await api.getOwnId();
      } catch {}

      const isSelf = message.isSelf || uidFrom === '0' || (Boolean(ownUid) && uidFrom === ownUid);
      const senderUid = isSelf ? (ownUid || uidFrom) : uidFrom;

      let threadId = String(message.threadId || '');
      if (!isGroup) {
        if (isSelf) {
          threadId = idTo && idTo !== '0' && idTo !== ownUid ? idTo : (threadId || idTo);
        } else {
          threadId = uidFrom && uidFrom !== '0' && uidFrom !== ownUid ? uidFrom : (threadId || uidFrom);
        }
      }

      // Resolve display name — prefer zaloName from API over dName
      let senderName: string = message.data?.dName || '';
      if (!isSelf && senderUid && api.getUserInfo) {
        const userInfo = await resolveZaloName(api, senderUid, userInfoCache);
        if (userInfo.zaloName) senderName = userInfo.zaloName;
        if (userInfo.avatar) updateContactAvatar(senderUid, userInfo.avatar);
      }

      // Resolve group name and avatar for group threads
      let groupName: string | undefined;
      let groupAvatarUrl: string | undefined;
      if (isGroup && threadId) {
        const groupInfo = await resolveGroupInfo(api, threadId);
        groupName = groupInfo.name;
        groupAvatarUrl = groupInfo.avatarUrl || undefined;
        if (groupAvatarUrl) {
          updateContactAvatar(threadId, groupAvatarUrl);
        }
      }

      let rawContent = message.data?.content;
      const contentType = detectContentType(message.data?.msgType, rawContent);

      // Enrich sticker content with image URLs from Zalo API
      if (contentType === 'sticker' && rawContent && typeof rawContent === 'object' && (rawContent.id || rawContent.stickerId || rawContent.sticker_id)) {
        try {
          const stickerId = rawContent.id || rawContent.stickerId || rawContent.sticker_id;
          const details = await api.getStickersDetail([stickerId]);
          if (details && details.length > 0) {
            rawContent = { ...rawContent, ...details[0] };
          }
        } catch (err) {
          logger.warn(`[zalo:${accountId}] Failed to fetch sticker details for ${rawContent.id}:`, err);
        }
      }

      const content =
        typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || '');

      const result = await handleIncomingMessage({
        accountId,
        senderUid,
        senderName,
        content,
        contentType,
        msgId: String(message.data?.msgId || ''),
        cliMsgId: String(message.data?.cliMsgId || message.data?.cMsgID || message.data?.ts || ''),
        timestamp: parseInt(message.data?.ts || String(Date.now())),
        isSelf,
        threadId,
        threadType: isGroup ? 'group' : 'user',
        groupName,
        groupAvatarUrl,
        attachments: extractAttachments(message.data?.msgType, rawContent),
      });

      if (result) {
        io?.emit('chat:message', {
          accountId,
          message: result.message,
          conversationId: result.conversationId,
          contactId: result.contactId,
          assignedUserId: result.assignedUserId,
        });
      }
    } catch (err) {
      logger.error(`[zalo:${accountId}] Message handler error:`, err);
    }
  });

  listener.on('undo', async (data: any) => {
    const msgId = data.data?.msgId || data.msgId;
    if (msgId) {
      await handleMessageUndo(accountId, String(msgId));
      io?.emit('chat:deleted', { accountId, msgId: String(msgId) });
    }
  });

  listener.on('reaction', async (reactionData: any) => {
    try {
      logger.info(`[zalo:${accountId}] Reaction event received: ${JSON.stringify(reactionData.data || reactionData)}`);
      const rMsg = reactionData.data?.content?.rMsg?.[0];
      const targetMsgId = rMsg?.gMsgID ? String(rMsg.gMsgID) : String(reactionData.data?.msgId || '');
      const targetCliMsgId = rMsg?.cMsgID ? String(rMsg.cMsgID) : String(reactionData.data?.cliMsgId || '');
      const rIcon = reactionData.data?.content?.rIcon ?? '';
      const rType = Number(reactionData.data?.content?.rType ?? -1);

      let senderUid = String(reactionData.data?.uidFrom || '');
      let ownUid = '';
      try {
        if (api.getOwnId) ownUid = await api.getOwnId();
      } catch {}

      const isSelf = reactionData.isSelf || senderUid === '0' || (Boolean(ownUid) && senderUid === ownUid);
      if (isSelf && ownUid) senderUid = ownUid;

      let senderName = reactionData.data?.dName || '';
      let avatarUrl = '';
      if (isSelf) {
        const acc = await prisma.zaloAccount.findUnique({
          where: { id: accountId },
          select: { displayName: true, avatarUrl: true },
        });
        if (acc?.displayName) senderName = acc.displayName;
        if (acc?.avatarUrl) avatarUrl = acc.avatarUrl;
      } else if (senderUid && api.getUserInfo) {
        const userInfo = await resolveZaloName(api, senderUid, userInfoCache);
        if (userInfo.zaloName) senderName = userInfo.zaloName;
        if (userInfo.avatar) avatarUrl = userInfo.avatar;
      }

      const result = await handleMessageReaction({
        accountId,
        msgId: targetMsgId,
        cliMsgId: targetCliMsgId,
        threadId: String(reactionData.threadId || ''),
        isGroup: Boolean(reactionData.isGroup || reactionData.type === 1),
        icon: rIcon,
        rType,
        senderUid,
        senderName,
        avatarUrl,
        isSelf,
      });

      if (result) {
        io?.emit('chat:reaction', {
          accountId,
          conversationId: result.conversationId,
          messageId: result.messageId,
          zaloMsgId: result.zaloMsgId,
          reactions: result.reactions,
        });
      }
    } catch (err) {
      logger.error(`[zalo:${accountId}] Reaction handler error:`, err);
    }
  });

  listener.on('closed', (code: number, reason: string) => {
    logger.warn(`[zalo:${accountId}] Listener closed: ${code} ${reason}`);
    onDisconnected(accountId);
    io?.emit('zalo:disconnected', { accountId, code, reason });
  });

  listener.on('error', (err: any) => {
    logger.error(`[zalo:${accountId}] Listener error:`, err);
  });

  listener.start({ retryOnClose: true });
}
