import { prisma } from '../src/shared/database/prisma-client.js';

async function main() {
  const org = await prisma.organization.findFirst();
  const orgId = org?.id!;

  // Let's test all words in partnerName, note, etc. to see what returns 51:
  const orders = await prisma.orderHistory.findMany({
    where: { orgId },
    select: { partnerName: true, note: true, orderCode: true, salesperson: true }
  });

  const words = new Set<string>();
  for (const o of orders) {
    if (o.partnerName) o.partnerName.split(/\s+/).forEach(w => words.add(w));
    if (o.note) o.note.split(/\s+/).forEach(w => words.add(w));
  }

  console.log('Total words to test:', words.size);
  for (const w of words) {
    if (w.length < 3) continue;
    const cnt = await prisma.orderHistory.count({
      where: {
        orgId,
        NOT: [
          { orderCode: { startsWith: 'SO-AI-' } },
          { orderCode: { startsWith: 'AI-' } },
          { orderCode: { startsWith: 'ORD-' } },
        ],
        OR: [
          { orderCode: { contains: w, mode: 'insensitive' } },
          { partnerName: { contains: w, mode: 'insensitive' } },
          { note: { contains: w, mode: 'insensitive' } },
          { salesperson: { contains: w, mode: 'insensitive' } },
          { customerProfile: { salesperson: { contains: w, mode: 'insensitive' } } },
        ],
      }
    });
    if (cnt === 51) {
      console.log('Search keyword returning 51:', w);
    }
  }

  process.exit(0);
}

main().catch(console.error);
