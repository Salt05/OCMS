import { prisma } from '../shared/database/prisma-client.js';

async function check() {
  const groupConvs = await prisma.conversation.findMany({
    where: { threadType: 'group' },
    select: {
      id: true,
      externalThreadId: true,
      contact: { select: { id: true, fullName: true, zaloUid: true } },
      zaloAccount: { select: { displayName: true } },
      messages: {
        where: { zaloMsgId: { not: null } },
        select: { zaloMsgId: true },
        take: 20
      }
    }
  });

  console.log('FINDING SHARED ZALO MSG IDS BETWEEN GROUP CONVERSATIONS:');
  for (let i = 0; i < groupConvs.length; i++) {
    for (let j = i + 1; j < groupConvs.length; j++) {
      const c1 = groupConvs[i];
      const c2 = groupConvs[j];
      const msgIds1 = new Set(c1.messages.map(m => m.zaloMsgId).filter(Boolean));
      const shared = c2.messages.filter(m => m.zaloMsgId && msgIds1.has(m.zaloMsgId));
      if (shared.length > 0) {
        console.log(`MATCH FOUND:`);
        console.log(`  Conv 1: ${c1.id} (${c1.contact?.fullName} - Acc: ${c1.zaloAccount?.displayName} - ExtId: ${c1.externalThreadId})`);
        console.log(`  Conv 2: ${c2.id} (${c2.contact?.fullName} - Acc: ${c2.zaloAccount?.displayName} - ExtId: ${c2.externalThreadId})`);
        console.log(`  Shared messages count: ${shared.length}, Sample msgId: ${shared[0].zaloMsgId}`);
      }
    }
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());
