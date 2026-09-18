import { prisma } from '../src/shared/database/prisma-client.js';

async function main() {
  const org = await prisma.organization.findFirst();
  const orgId = org?.id!;

  // Let's search order_line_histories for "đơn" or "giá"
  const linesGia = await prisma.orderLineHistory.findMany({
    where: {
      orderHistory: { orgId },
      OR: [
        { productName: { contains: 'giá', mode: 'insensitive' } },
        { productName: { contains: 'đơn', mode: 'insensitive' } },
        { uomName: { contains: 'đơn', mode: 'insensitive' } },
        { uomName: { contains: 'giá', mode: 'insensitive' } },
      ],
    },
    select: {
      productName: true,
      productSku: true,
      odooProductId: true,
      orderHistory: {
        select: { id: true, orderCode: true, state: true }
      }
    }
  });

  console.log('Lines matching "giá" or "đơn":', linesGia.length);
  const prodNames = new Set(linesGia.map(l => l.productName));
  console.log('Product names:', Array.from(prodNames));

  process.exit(0);
}

main().catch(console.error);
