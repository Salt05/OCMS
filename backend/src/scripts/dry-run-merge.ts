import { prisma } from '../shared/database/prisma-client.js';
import { mergeContacts } from '../modules/contacts/contact-merge-service.js';

async function dryRunMerge() {
  const groupContacts = await prisma.contact.findMany({
    where: {
      OR: [
        { metadata: { path: ['isGroup'], equals: true } },
        { conversations: { some: { threadType: 'group' } } }
      ]
    },
    include: {
      conversations: {
        select: { id: true, zaloAccountId: true, externalThreadId: true, zaloAccount: { select: { displayName: true } } }
      }
    }
  });

  console.log(`Found ${groupContacts.length} group contacts.`);

  // Group by group name
  const nameMap = new Map<string, typeof groupContacts>();
  for (const c of groupContacts) {
    const name = c.fullName?.trim() || 'Nhóm';
    if (!nameMap.has(name)) nameMap.set(name, []);
    nameMap.get(name)!.push(c);
  }

  for (const [name, contacts] of nameMap.entries()) {
    if (contacts.length > 1) {
      console.log(`\nDuplicate group contacts found for "${name}" (${contacts.length} contacts):`);
      for (const c of contacts) {
        console.log(`  - Contact ID: ${c.id}, zaloUid: ${c.zaloUid}, customerId: ${c.customerId}, convs: ${c.conversations.map(cv => cv.id + ' (' + cv.zaloAccount?.displayName + ')').join(', ')}`);
      }

      // Pick primary (prefer one with customerId, or first)
      const primary = contacts.find(c => c.customerId) || contacts[0];
      const siblings = contacts.filter(c => c.id !== primary.id);
      console.log(`  -> Primary to keep: ${primary.id} (customerId: ${primary.customerId})`);
      console.log(`  -> Siblings to merge: ${siblings.map(s => s.id).join(', ')}`);
    }
  }
}

dryRunMerge().catch(console.error).finally(() => prisma.$disconnect());
