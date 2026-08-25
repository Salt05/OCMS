import { zaloPool } from '../zalo/zalo-pool.js';
import { prisma } from '../../shared/database/prisma-client.js';

async function test() {
  console.log("Starting test...");
  const account = await prisma.zaloAccount.findFirst({
    where: { status: 'connected' },
    select: { id: true }
  });
  if (!account) {
    console.log("No connected zalo account found");
    return;
  }
  const instance = zaloPool.getInstance(account.id);
  if (!instance?.api) {
    console.log("Instance not connected");
    return;
  }
  try {
    const stickers = await instance.api.searchSticker('like');
    console.log("Search Result:", stickers.slice(0, 2));
    if (stickers.length > 0) {
      const details = await instance.api.getStickersDetail([stickers[0].sticker_id || stickers[0].stickerId]);
      console.log("Details:", details);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
