/**
 * zalo-message-recovery.ts — Recovers missed messages & marks unread conversations after WebSocket reconnect.
 *
 * Architecture:
 * 1. Instant Phase (< 200ms): `markUnreadConversations` calls `api.getUnreadMark()` to instantly
 *    highlight conversations with new/unread messages (red badges on sidebar).
 * 2. On-Demand Phase (< 500ms): `syncConversationMessages` pulls messages for a specific conversation
 *    when staff opens it.
 * 3. Graceful Background Phase: Crawls recent User & Group messages in parallel to persist all missing records.
 */
import type { Server } from 'socket.io';
import { logger } from '../../shared/utils/logger.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { handleIncomingMessage } from '../chat/message-handler.js';
import { detectContentType, extractAttachments, updateContactAvatar } from './zalo-message-helpers.js';
import {
  resolveZaloName,
  resolveGroupName,
  resolveGroupInfo,
  type UserInfoCacheEntry,
} from './zalo-listener-factory.js';

export interface RecoveryContext {
  accountId: string;
  api: any;
  io: Server | null;
  userInfoCache: Map<string, UserInfoCacheEntry>;
}

// ThreadType mapping in zca-js: 0 = User, 1 = Group
export const ThreadType = {
  User: 0,
  Group: 1,
};

// Lock to prevent duplicate concurrent full scans per account
const activeRecoveryAccounts = new Set<string>();

/**
 * PHASE 1: Instantly detect unread conversations on reconnect (< 200ms)
 * Calls `api.getUnreadMark()` and highlights conversations in DB and Frontend.
 */
export async function markUnreadConversations(ctx: RecoveryContext): Promise<string[]> {
  const { accountId, api, io } = ctx;
  if (!api?.getUnreadMark) return [];

  try {
    const unreadData = await api.getUnreadMark();
    const convsUser = unreadData?.data?.convsUser || [];
    const convsGroup = unreadData?.data?.convsGroup || [];

    const unreadThreadIds: { threadId: string; type: 'user' | 'group'; count: number }[] = [];

    for (const item of convsUser) {
      const threadId = String(item.odId || item.id || '');
      if (threadId) {
        unreadThreadIds.push({
          threadId,
          type: 'user',
          count: item.totalUnread || item.unreadCount || 1,
        });
      }
    }

    for (const item of convsGroup) {
      const threadId = String(item.odId || item.id || '');
      if (threadId) {
        unreadThreadIds.push({
          threadId,
          type: 'group',
          count: item.totalUnread || item.unreadCount || 1,
        });
      }
    }

    if (unreadThreadIds.length === 0) {
      return [];
    }

    logger.info(
      `[zalo-unread:${accountId}] Found ${unreadThreadIds.length} conversation(s) with unread messages from downtime.`,
    );

    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { orgId: true },
    });

    // Update conversation records in database to show unread badge & update lastMessageAt
    for (const item of unreadThreadIds) {
      try {
        const existing = await prisma.conversation.findFirst({
          where: {
            zaloAccountId: accountId,
            externalThreadId: item.threadId,
          },
        });

        if (existing) {
          await prisma.conversation.update({
            where: { id: existing.id },
            data: {
              unreadCount: Math.max(existing.unreadCount, item.count),
              isReplied: false,
              lastMessageAt: new Date(),
            },
          });
        } else if (account?.orgId) {
          let contact = await prisma.contact.findFirst({
            where: { zaloUid: item.threadId, orgId: account.orgId },
            select: { id: true },
          });
          if (!contact) {
            contact = await prisma.contact.create({
              data: {
                orgId: account.orgId,
                zaloUid: item.threadId,
                fullName: item.type === 'group' ? 'Nhóm Zalo' : 'Khách hàng Zalo',
              },
              select: { id: true },
            });
          }
          await prisma.conversation.create({
            data: {
              orgId: account.orgId,
              zaloAccountId: accountId,
              contactId: contact.id,
              externalThreadId: item.threadId,
              threadType: item.type,
              unreadCount: item.count,
              isReplied: false,
              lastMessageAt: new Date(),
            },
          });
        }
      } catch (upsertErr) {
        logger.warn(`[zalo-unread:${accountId}] Error updating thread ${item.threadId}:`, upsertErr);
      }
    }

    // Emit instant socket event to frontend
    io?.emit('chat:unread-marked', {
      accountId,
      unreadThreadIds: unreadThreadIds.map((t) => t.threadId),
    });

    return unreadThreadIds.map((t) => t.threadId);
  } catch (err) {
    logger.warn(`[zalo-unread:${accountId}] getUnreadMark failed:`, err);
    return [];
  }
}

function getRecentMessageCursor(message: any): string {
  if (!message) return '';
  const msgId = String(message.data?.msgId ?? '').trim();
  if (msgId) return msgId;
  const actionId = String(message.data?.actionId ?? '').trim();
  if (actionId) return actionId;
  return String(message.data?.cliMsgId ?? '').trim();
}

function getNewestRecentMessage(messages: any[]): any {
  let newest: any = null;
  for (const message of messages) {
    if (!newest) {
      newest = message;
      continue;
    }
    const ts = parseInt(message.data?.ts || '0', 10);
    const newestTs = parseInt(newest.data?.ts || '0', 10);
    if (ts > newestTs) {
      newest = message;
    }
  }
  return newest;
}

function getRecentPageCursors(messages: any[]): string[] {
  const cursors: string[] = [];
  const seen = new Set<string>();
  const addCursor = (value: any) => {
    const cursor = String(value || '').trim();
    if (!cursor || seen.has(cursor)) return;
    seen.add(cursor);
    cursors.push(cursor);
  };
  addCursor(getRecentMessageCursor(getNewestRecentMessage(messages)));
  addCursor(getRecentMessageCursor(messages[messages.length - 1] ?? null));
  addCursor(getRecentMessageCursor(messages[0] ?? null));
  return cursors;
}

/**
 * Fetch recent messages for a thread type using listener.requestOldMessages with forward pagination
 */
async function fetchRecentMessagesViaWs(
  api: any,
  threadType: number,
  maxMessages = 250,
  timeoutMs = 12000,
): Promise<any[]> {
  return new Promise((resolve) => {
    let settled = false;
    const collected: any[] = [];
    const seenMessageKeys = new Set<string>();
    const requestedCursors = new Set<string>();
    let pagesRequested = 0;
    const maxPages = 8;

    const toKey = (message: any) => {
      const msgId = String(message.data?.msgId ?? '');
      const cliMsgId = String(message.data?.cliMsgId ?? '');
      return `${message.threadId}:${msgId}:${cliMsgId}`;
    };

    const requestPage = (lastId: string | null) => {
      const cursor = String(lastId ?? '').trim();
      if (cursor) {
        if (requestedCursors.has(cursor)) return false;
        requestedCursors.add(cursor);
      }
      pagesRequested += 1;
      try {
        api.listener.requestOldMessages(threadType, cursor || null);
        return true;
      } catch (err) {
        logger.warn(`[zalo-recovery] requestOldMessages failed for type ${threadType}:`, err);
        return false;
      }
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      api.listener.off('old_messages', onOldMessages);
      api.listener.off('error', onError);
    };

    const finish = (error?: any) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        logger.warn(`[zalo-recovery] Fetch messages error:`, error);
      }
      // Sort newest first
      collected.sort((a, b) => parseInt(b.data?.ts || '0', 10) - parseInt(a.data?.ts || '0', 10));
      resolve(collected.slice(0, maxMessages));
    };

    const onOldMessages = (messages: any[], type: number) => {
      if (type !== threadType) return;

      const typedMessages = Array.isArray(messages) ? messages : [];
      for (const message of typedMessages) {
        const key = toKey(message);
        if (seenMessageKeys.has(key)) continue;
        seenMessageKeys.add(key);
        collected.push(message);
      }

      if (collected.length >= maxMessages || typedMessages.length === 0 || pagesRequested >= maxPages) {
        finish();
        return;
      }

      try {
        const cursorCandidates = getRecentPageCursors(typedMessages);
        let requested = false;
        for (const cursor of cursorCandidates) {
          if (requestPage(cursor)) {
            requested = true;
            break;
          }
        }
        if (!requested) finish();
      } catch (err) {
        finish(err);
      }
    };

    const onError = (err: any) => {
      finish(err);
    };

    const timeoutId = setTimeout(() => {
      finish();
    }, timeoutMs);

    api.listener.on('old_messages', onOldMessages);
    api.listener.on('error', onError);

    requestPage(null);
  });
}

/**
 * Helper to persist a single recovered message safely
 */
async function processAndPersistMessage(
  msg: any,
  ctx: RecoveryContext,
  existingSet: Set<string>,
): Promise<boolean> {
  const { accountId, api, io, userInfoCache } = ctx;
  const msgId = String(msg.data?.msgId || '');

  if (msgId && existingSet.has(msgId)) {
    return false;
  }

  try {
    const isGroup = msg.type === ThreadType.Group || msg.type === 1;
    const uidFrom = String(msg.data?.uidFrom || '');
    const idTo = String(msg.data?.idTo || '');

    let ownUid = '';
    try {
      if (api.getOwnId) ownUid = await api.getOwnId();
    } catch {}

    const isSelf = msg.isSelf || uidFrom === '0' || (Boolean(ownUid) && uidFrom === ownUid);
    const senderUid = isSelf ? (ownUid || uidFrom) : uidFrom;

    let threadId = String(msg.threadId || '');
    if (!isGroup) {
      if (isSelf) {
        threadId = idTo && idTo !== '0' && idTo !== ownUid ? idTo : (threadId || idTo);
      } else {
        threadId = uidFrom && uidFrom !== '0' && uidFrom !== ownUid ? uidFrom : (threadId || uidFrom);
      }
    }

    let senderName: string = msg.data?.dName || '';
    if (!isSelf && senderUid && api.getUserInfo) {
      const userInfo = await resolveZaloName(api, senderUid, userInfoCache);
      if (userInfo.zaloName) senderName = userInfo.zaloName;
      if (userInfo.avatar) updateContactAvatar(senderUid, userInfo.avatar);
    }

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

    let rawContent = msg.data?.content;
    const contentType = detectContentType(msg.data?.msgType, rawContent);

    if (
      contentType === 'sticker' &&
      rawContent &&
      typeof rawContent === 'object' &&
      (rawContent.id || rawContent.stickerId || rawContent.sticker_id)
    ) {
      try {
        const stickerId = rawContent.id || rawContent.stickerId || rawContent.sticker_id;
        const details = await api.getStickersDetail([stickerId]);
        if (details && details.length > 0) {
          rawContent = { ...rawContent, ...details[0] };
        }
      } catch {}
    }

    const content =
      typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || '');

    const attachments = extractAttachments(msg.data?.msgType, rawContent);

    const result = await handleIncomingMessage({
      accountId,
      senderUid,
      senderName,
      content,
      contentType,
      msgId,
      cliMsgId: String(msg.data?.cliMsgId || msg.data?.cMsgID || msg.data?.ts || ''),
      timestamp: parseInt(msg.data?.ts || String(Date.now()), 10),
      isSelf,
      threadId,
      threadType: isGroup ? 'group' : 'user',
      groupName,
      groupAvatarUrl,
      attachments,
    });

    if (result) {
      existingSet.add(msgId);
      io?.emit('chat:message', {
        accountId,
        message: result.message,
        conversationId: result.conversationId,
      });
      return true;
    }
  } catch (err) {
    logger.warn(`[zalo-recovery] Error persisting message ${msgId}:`, err);
  }

  return false;
}

/**
 * PHASE 2: On-Demand sync when user clicks / opens a specific conversation thread (< 500ms)
 */
export async function syncConversationMessages(
  ctx: RecoveryContext,
  threadId: string,
  threadType: 'user' | 'group',
): Promise<number> {
  const { api } = ctx;
  if (!api?.listener) return 0;

  const targetType = threadType === 'group' ? ThreadType.Group : ThreadType.User;
  const messages = await fetchRecentMessagesViaWs(api, targetType, 60, 5000);

  const threadMessages = messages.filter((m) => {
    const mThread = String(m.threadId || '');
    const mFrom = String(m.data?.uidFrom || '');
    const mTo = String(m.data?.idTo || '');
    return mThread === threadId || mFrom === threadId || mTo === threadId;
  });

  if (threadMessages.length === 0) return 0;

  const msgIds = threadMessages
    .map((m) => String(m.data?.msgId || ''))
    .filter((id) => id.length > 0);

  const existingRows = await prisma.message.findMany({
    where: { zaloMsgId: { in: msgIds } },
    select: { zaloMsgId: true, conversationId: true },
  });
  const existingSet = new Set(
    existingRows.map((r) => r.zaloMsgId).filter((id): id is string => id !== null),
  );

  let count = 0;
  for (const msg of threadMessages) {
    const saved = await processAndPersistMessage(msg, ctx, existingSet);
    if (saved) count++;
  }

  return count;
}

/**
 * PHASE 3: Graceful background full recovery scan (Parallel User + Group fetch)
 */
export async function recoverMissedMessages(ctx: RecoveryContext): Promise<void> {
  const { accountId, api, io } = ctx;

  if (!api?.listener) return;

  if (activeRecoveryAccounts.has(accountId)) {
    return;
  }

  activeRecoveryAccounts.add(accountId);

  try {
    // Wait 3.0s after connect for socket channels to fully settle (matching test-openzca-sync)
    await new Promise((r) => setTimeout(r, 3000));

    logger.info(`[zalo-recovery:${accountId}] Running background message recovery scan...`);

    // Step 1: Fetch User messages first (forward pagination from oldest snapshot to present)
    const userMessages = await fetchRecentMessagesViaWs(api, ThreadType.User, 250, 12000);
    const groupMessages = await fetchRecentMessagesViaWs(api, ThreadType.Group, 100, 6000);

    const allMessages = [...userMessages, ...groupMessages];

    if (allMessages.length > 0) {
      allMessages.sort((a, b) => {
        const tsA = parseInt(a.data?.ts || '0', 10);
        const tsB = parseInt(b.data?.ts || '0', 10);
        return tsA - tsB;
      });

      const msgIds = allMessages
        .map((m) => String(m.data?.msgId || ''))
        .filter((id) => id.length > 0);

      const existingRows = await prisma.message.findMany({
        where: { zaloMsgId: { in: msgIds } },
        select: { zaloMsgId: true },
      });
      const existingSet = new Set(
        existingRows.map((r) => r.zaloMsgId).filter((id): id is string => id !== null),
      );

      let recoveredCount = 0;

      for (const msg of allMessages) {
        const saved = await processAndPersistMessage(msg, ctx, existingSet);
        if (saved) recoveredCount++;
      }

      if (recoveredCount > 0) {
        logger.info(
          `[zalo-recovery:${accountId}] Recovered ${recoveredCount} missed message(s) in background.`,
        );
        io?.emit('chat:inbox-synced', { accountId, recoveredCount });
      }
    } else {
      logger.info(`[zalo-recovery:${accountId}] No recent messages returned.`);
    }

    // Step 2: Trigger unread badge update after messages are recovered
    await markUnreadConversations(ctx);
  } catch (err) {
    logger.error(`[zalo-recovery:${accountId}] Recovery scan failed:`, err);
  } finally {
    activeRecoveryAccounts.delete(accountId);
  }
}
