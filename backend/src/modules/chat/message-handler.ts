/**
 * message-handler.ts — persists incoming Zalo messages to the database.
 * Called from zalo-pool's startListener on every 'message' / 'undo' event.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { randomUUID } from 'node:crypto';
import { emitWebhook } from '../api/webhook-service.js';
import { pendingReplies } from './chat-routes.js';

export interface IncomingMessage {
  accountId: string;
  senderUid: string;
  senderName: string;       // zaloName (from cache or dName fallback)
  content: string;
  contentType: string;      // text, image, sticker, video, voice, gif, link, file
  msgId: string;
  cliMsgId?: string;
  timestamp: number;        // epoch ms
  isSelf: boolean;
  threadId: string;         // For user: contact UID. For group: group ID
  threadType: 'user' | 'group'; // user or group conversation
  groupName?: string;       // group name if group message
  groupAvatarUrl?: string;  // group avatar url if group message
  attachments?: any[];
}

export interface HandleMessageResult {
  message: {
    id: string;
    conversationId: string;
    zaloMsgId: string | null;
    senderType: string;
    senderUid: string | null;
    senderName: string | null;
    content: string | null;
    contentType: string;
    attachments: any;
    isDeleted: boolean;
    deletedAt: Date | null;
    sentAt: Date;
    repliedByUserId: string | null;
    createdAt: Date;
  };
  conversationId: string;
  orgId: string;
  contactId: string | null;
}

export function getMessageCliMsgId(message: any): string {
  if (Array.isArray(message.attachments)) {
    for (const att of (message.attachments as any[])) {
      if (att && typeof att === 'object' && att.cliMsgId) {
        return String(att.cliMsgId);
      }
    }
  }
  return String(new Date(message.sentAt).getTime());
}

export function getRTypeFromIcon(icon: string): number {
  if (!icon) return -1;
  const trimmed = icon.trim();
  switch (trimmed) {
    case ':>':
      return 0;
    case '/-strong':
      return 3;
    case '/-heart':
      return 5;
    case ':o':
    case ':-o':
      return 32;
    case ':-(( ':
    case ':-(':
    case ':-((':
    case ':(( ':
    case ':-((':
      return 2;
    case ':-h':
    case '>-|':
      return 20;
    case ':-*':
      return 8;
    case ":')":
      return 7;
    case '/-loveu':
      return 133;
    case '/-rose':
      return 120;
    case '/-break':
      return 65;
    case '/-weak':
      return 4;
    case ';xx':
      return 29;
    case ';-)':
      return 45;
    case '/-bd':
      return 126;
    case '/-bome':
      return 127;
    case '/-ok':
      return 68;
    case '/-thanks':
    case '_()_':
      return 70;
    case ':))':
      return 62;
    case '/-shit':
      return 66;
    case '/-beer':
      return 99;
    default:
      return 0;
  }
}

export async function handleIncomingMessage(
  msg: IncomingMessage,
): Promise<HandleMessageResult | null> {
  try {
    const account = await prisma.zaloAccount.findUnique({
      where: { id: msg.accountId },
      select: { orgId: true, ownerUserId: true },
    });
    if (!account) return null;

    // Check if message is a batch delete / undo sync event from Zalo
    if (typeof msg.content === 'string' && (msg.content.includes('clientDelMsgId') || msg.content.includes('globalDelMsgId'))) {
      try {
        const parsed = JSON.parse(msg.content);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        const idsToDelete: string[] = [];
        for (const item of items) {
          if (item.clientDelMsgId && String(item.clientDelMsgId) !== '0') {
            idsToDelete.push(String(item.clientDelMsgId));
          }
          if (item.globalDelMsgId && String(item.globalDelMsgId) !== '0') {
            idsToDelete.push(String(item.globalDelMsgId));
          }
        }
        if (idsToDelete.length > 0) {
          await prisma.message.updateMany({
            where: {
              zaloMsgId: { in: idsToDelete },
            },
            data: { isDeleted: true, deletedAt: new Date() },
          });
          logger.info(`[message-handler] Processed batch delete for ${idsToDelete.length} messages`);
        }
      } catch (e) {
        logger.warn('[message-handler] Failed to parse delete sync event:', e);
      }
      return null;
    }

    const contactData = await upsertContact(msg, account.orgId);
    if (!contactData) return null;
    
    if (contactData.contactType === 'other') {
      logger.info(`[message-handler] Ignored message for 'other' contact ${contactData.id}`);
      return null;
    }

    const contactId = contactData.id;

    const conversation = await findOrCreateConversation(msg, account.orgId, contactId);

    const sentAt = new Date(msg.timestamp);
    if (msg.msgId) {
      const existingMessage = await prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          zaloMsgId: msg.msgId,
        },
      });

      if (existingMessage) {
        logger.warn(
          `[message-handler] Duplicate Zalo message ignored: ${msg.msgId}`,
        );
        return null;
      }
    }

    const attachments = Array.isArray(msg.attachments) ? [...msg.attachments] : [];
    if (msg.cliMsgId) {
      attachments.push({ cliMsgId: msg.cliMsgId });
    }

    const replyToId = pendingReplies.get(conversation.id) || null;
    if (replyToId) {
      pendingReplies.delete(conversation.id);
    }

    const message = await prisma.message.create({
      data: {
        id: randomUUID(),
        conversationId: conversation.id,
        zaloMsgId: msg.msgId || null,
        senderType: msg.isSelf ? 'self' : 'contact',
        senderUid: msg.senderUid,
        senderName: msg.senderName || null,
        content: msg.content || '',
        contentType: msg.contentType || 'text',
        attachments,
        replyToId,
        sentAt,
      },
      include: {
        replyTo: {
          select: {
            id: true,
            senderName: true,
            content: true,
            contentType: true,
            isNote: true,
          },
        },
      },
    });

    await updateConversationAfterMessage(conversation.id, sentAt, msg.isSelf);

    // Track first outbound contact date — set once when agent sends first message
    if (msg.isSelf && contactId) {
      prisma.contact.updateMany({
        where: { id: contactId, firstContactDate: null },
        data: { firstContactDate: new Date(msg.timestamp) },
      }).catch(() => {});
    }

    // Emit webhook for message event (fire-and-forget)
    emitWebhook(account.orgId, msg.isSelf ? 'message.sent' : 'message.received', {
      messageId: message.id,
      conversationId: conversation.id,
      senderUid: msg.senderUid,
      content: msg.content,
      contentType: msg.contentType,
      sentAt: message.sentAt,
    });

    return {
      message,
      conversationId: conversation.id,
      orgId: account.orgId,
      contactId,
    };
  } catch (err) {
    logger.error('[message-handler] handleIncomingMessage error:', err);
    return null;
  }
}

// Upsert contact — handles both user and group conversations
async function upsertContact(msg: IncomingMessage, orgId: string): Promise<{ id: string; contactType: string } | null> {
  // Group messages: create/update a "contact" record representing the group
  if (msg.threadType === 'group') {
    const groupUid = msg.threadId;
    if (!groupUid) return null;

    try {
      const groupContact = await prisma.contact.upsert({
        where: { orgId_zaloUid: { orgId, zaloUid: groupUid } },
        update: {
          ...(msg.groupName ? { fullName: msg.groupName } : {}),
          ...(msg.groupAvatarUrl ? { avatarUrl: msg.groupAvatarUrl } : {}),
        },
        create: {
          id: randomUUID(),
          orgId,
          zaloUid: groupUid,
          fullName: msg.groupName || 'Nhóm',
          avatarUrl: msg.groupAvatarUrl || null,
          metadata: { isGroup: true },
        },
        select: { id: true, fullName: true, contactType: true },
      });
      return { id: groupContact.id, contactType: groupContact.contactType };
    } catch {
      const existing = await prisma.contact.findFirst({
        where: { zaloUid: groupUid, orgId },
        select: { id: true, contactType: true },
      });
      return existing ? { id: existing.id, contactType: existing.contactType } : null;
    }
  }

  // For 1-1 user messages:
  // If isSelf = true, the target contact is threadId (the person being messaged).
  // If isSelf = false, the target contact is senderUid (the person who sent the message).
  const targetUid = msg.isSelf ? msg.threadId : msg.senderUid;
  if (!targetUid) return null;

  try {
    const contact = await prisma.contact.upsert({
      where: { orgId_zaloUid: { orgId, zaloUid: targetUid } },
      update: {
        ...(!msg.isSelf && msg.senderName ? { zaloName: msg.senderName } : {}),
      },
      create: {
        id: randomUUID(),
        orgId,
        zaloUid: targetUid,
        zaloName: msg.isSelf ? null : (msg.senderName || null),
        fullName: msg.isSelf ? 'Khách hàng' : (msg.senderName || 'Unknown'),
      },
      select: { id: true, fullName: true, zaloName: true, contactType: true },
    });
    return { id: contact.id, contactType: contact.contactType };
  } catch {
    const existing = await prisma.contact.findFirst({
      where: { zaloUid: targetUid, orgId },
      select: { id: true, contactType: true },
    });
    return existing ? { id: existing.id, contactType: existing.contactType } : null;
  }
}

// Find or create conversation — externalThreadId = threadId for both user and group
async function findOrCreateConversation(
  msg: IncomingMessage,
  orgId: string,
  contactId: string | null,
) {
  const externalThreadId = msg.threadId;

  const existing = await prisma.conversation.findFirst({
    where: { zaloAccountId: msg.accountId, externalThreadId },
    select: { id: true, contactId: true },
  });

  if (existing) {
    if (!existing.contactId && contactId) {
      await prisma.conversation.update({
        where: { id: existing.id },
        data: { contactId },
      }).catch(() => {});
    }
    return existing;
  }

  return prisma.conversation.create({
    data: {
      id: randomUUID(),
      orgId,
      zaloAccountId: msg.accountId,
      contactId,
      threadType: msg.threadType,
      externalThreadId,
      lastMessageAt: new Date(msg.timestamp),
      unreadCount: msg.isSelf ? 0 : 1,
      isReplied: msg.isSelf,
    },
    select: { id: true },
  });
}

// Update conversation metadata after a new message
async function updateConversationAfterMessage(
  conversationId: string,
  sentAt: Date,
  isSelf: boolean,
): Promise<void> {
  const updateData: any = { lastMessageAt: sentAt };
  if (isSelf) {
    updateData.isReplied = true;
    updateData.unreadCount = 0;
  } else {
    updateData.unreadCount = { increment: 1 };
    updateData.isReplied = false;
  }
  await prisma.conversation.update({ where: { id: conversationId }, data: updateData });
}

// Soft-delete a message by its Zalo message ID
export async function handleMessageUndo(accountId: string, zaloMsgId: string): Promise<void> {
  try {
    await prisma.message.updateMany({
      where: { zaloMsgId: String(zaloMsgId) },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    logger.info(`[message-handler] Undo message ${zaloMsgId} for account ${accountId}`);
  } catch (err) {
    logger.error('[message-handler] handleMessageUndo error:', err);
  }
}

export interface IncomingReaction {
  accountId: string;
  msgId: string;
  cliMsgId?: string;
  threadId: string;
  isGroup: boolean;
  icon: string;
  rType: number;
  senderUid: string;
  senderName?: string;
  avatarUrl?: string;
  isSelf: boolean;
}

export interface MessageReactionItem {
  icon: string;
  emoji: string;
  rType: number;
  uid: string;
  userName: string;
  avatarUrl?: string;
  isSelf: boolean;
  count: number;
  updatedAt: string;
}

export function getEmojiFromReactionIcon(icon: string): string {
  if (!icon) return '';
  const trimmed = icon.trim();
  switch (trimmed) {
    case '/-heart':
      return '❤️';
    case '/-strong':
      return '👍';
    case ':>':
      return '😆';
    case ':o':
    case ':-o':
      return '😲';
    case ':-h':
    case '>-|':
      return '😡';
    case ':-(( ':
    case ':-(':
    case ':-((':
    case ':(( ':
    case ':(( ':
    case ':-((':
      return '😭';
    case ':-*':
      return '😘';
    case ":')":
      return '😂';
    case '/-rose':
      return '🌹';
    case '/-break':
      return '💔';
    case '/-weak':
      return '👎';
    case ';xx':
      return '😍';
    case ';-)':
      return '😉';
    case '/-bd':
      return '🎂';
    case '/-bome':
      return '💣';
    case '/-ok':
      return '👌';
    case '/-thanks':
    case '_()_':
      return '🙏';
    case ':))':
      return '😁';
    case '/-loveu':
      return '🤟';
    case '/-shit':
      return '💩';
    case '/-beer':
      return '🍺';
    default:
      if (trimmed.includes('heart')) return '❤️';
      if (trimmed.includes('strong') || trimmed.includes('like')) return '👍';
      if (trimmed.includes('cry') || trimmed.includes('sad')) return '😭';
      return trimmed;
  }
}

// Handle reaction event on a message
export async function handleMessageReaction(
  reaction: IncomingReaction,
): Promise<{ messageId: string; conversationId: string; zaloMsgId: string; reactions: MessageReactionItem[] } | null> {
  try {
    if (!reaction.msgId) return null;

    // Find message by zaloMsgId in conversations linked to this Zalo account
    const message = await prisma.message.findFirst({
      where: {
        zaloMsgId: String(reaction.msgId),
        conversation: {
          zaloAccountId: reaction.accountId,
        },
      },
      select: {
        id: true,
        conversationId: true,
        zaloMsgId: true,
        reactions: true,
      },
    });

    if (!message) {
      logger.warn(`[message-handler] Reaction target message not found for msgId ${reaction.msgId}`);
      return null;
    }

    let existingReactions: MessageReactionItem[] = [];
    if (Array.isArray(message.reactions)) {
      existingReactions = (message.reactions as unknown as any[]).map((item) => ({
        ...item,
        count: typeof item.count === 'number' ? item.count : 1,
      }));
    }

    const isRemove = !reaction.icon || reaction.icon === '' || reaction.rType === -1;

    if (isRemove) {
      // Remove all reactions of this sender UID / self
      existingReactions = existingReactions.filter(
        (r) => r.uid !== reaction.senderUid && (!reaction.isSelf || !r.isSelf),
      );
    } else {
      const emoji = getEmojiFromReactionIcon(reaction.icon);
      
      // Find if this user already reacted with this SPECIFIC icon or emoji
      const reactionIndex = existingReactions.findIndex(
        (r) =>
          (r.uid === reaction.senderUid || (reaction.isSelf && r.isSelf)) &&
          (r.icon === reaction.icon || r.emoji === emoji),
      );

      if (reactionIndex >= 0) {
        existingReactions[reactionIndex].count = (existingReactions[reactionIndex].count || 1) + 1;
        existingReactions[reactionIndex].updatedAt = new Date().toISOString();
        if (reaction.senderName) existingReactions[reactionIndex].userName = reaction.senderName;
        if (reaction.avatarUrl) existingReactions[reactionIndex].avatarUrl = reaction.avatarUrl;
      } else {
        existingReactions.push({
          icon: reaction.icon,
          emoji,
          rType: reaction.rType,
          uid: reaction.senderUid,
          userName: reaction.senderName || (reaction.isSelf ? 'Bạn' : 'Người dùng'),
          avatarUrl: reaction.avatarUrl,
          isSelf: reaction.isSelf,
          count: 1,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    await prisma.message.update({
      where: { id: message.id },
      data: {
        reactions: existingReactions as any,
      },
    });

    return {
      messageId: message.id,
      conversationId: message.conversationId,
      zaloMsgId: message.zaloMsgId || String(reaction.msgId),
      reactions: existingReactions,
    };
  } catch (err) {
    logger.error('[message-handler] handleMessageReaction error:', err);
    return null;
  }
}

