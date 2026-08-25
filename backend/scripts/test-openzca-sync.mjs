/**
 * test-openzca-sync.mjs
 * Script kiểm chứng độc lập cơ chế fetch lịch sử tin nhắn qua WebSocket (openzca protocol)
 * Tự động đối soát dựa trên timestamp ngắt kết nối (cho phép gửi BẤT KỲ nội dung nào).
 */
import { createRequire } from 'module';
import readline from 'readline';
import fs from 'fs';
import { prisma } from '../dist/shared/database/prisma-client.js';

const require = createRequire(import.meta.url);
const { Zalo, ThreadType } = require('zca-js');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

// ── Openzca crawler logic ──────────────────────────────────────────────────

function getRecentMessageCursor(message) {
  if (!message) return '';
  const msgId = String(message.data?.msgId ?? '').trim();
  if (msgId) return msgId;
  const actionId = String(message.data?.actionId ?? '').trim();
  if (actionId) return actionId;
  return String(message.data?.cliMsgId ?? '').trim();
}

function getOldestRecentMessage(messages) {
  let oldest = null;
  for (const message of messages) {
    if (!oldest) {
      oldest = message;
      continue;
    }
    const ts = parseInt(message.data?.ts || '0', 10);
    const oldestTs = parseInt(oldest.data?.ts || '0', 10);
    if (ts < oldestTs) {
      oldest = message;
    }
  }
  return oldest;
}

function getRecentPageCursors(messages) {
  const cursors = [];
  const seen = new Set();
  const addCursor = (value) => {
    const cursor = String(value || '').trim();
    if (!cursor || seen.has(cursor)) return;
    seen.add(cursor);
    cursors.push(cursor);
  };
  addCursor(getRecentMessageCursor(getOldestRecentMessage(messages)));
  addCursor(getRecentMessageCursor(messages[messages.length - 1] ?? null));
  addCursor(getRecentMessageCursor(messages[0] ?? null));
  return cursors;
}

async function fetchRecentUserMessagesViaOpenzca(api, count = 30) {
  console.log(`\n[OPENZCA CRAWLER] Gửi requestOldMessages(ThreadType.User)...`);
  return new Promise((resolve, reject) => {
    let settled = false;
    const collected = [];
    const seenMessageKeys = new Set();
    const requestedCursors = new Set();
    let pagesRequested = 0;
    const maxPages = 10;

    const toKey = (message) => {
      const msgId = String(message.data?.msgId ?? '');
      const cliMsgId = String(message.data?.cliMsgId ?? '');
      return `${message.threadId}:${msgId}:${cliMsgId}`;
    };

    const requestPage = (lastId) => {
      const cursor = String(lastId ?? '').trim();
      if (cursor) {
        if (requestedCursors.has(cursor)) return false;
        requestedCursors.add(cursor);
      }
      pagesRequested += 1;
      api.listener.requestOldMessages(ThreadType.User, cursor || null);
      return true;
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      api.listener.off('old_messages', onOldMessages);
      api.listener.off('error', onError);
    };

    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        reject(error);
        return;
      }
      // Sắp xếp mới nhất trước
      collected.sort((a, b) => parseInt(b.data?.ts || '0', 10) - parseInt(a.data?.ts || '0', 10));
      resolve(collected.slice(0, count));
    };

    const onOldMessages = (messages, type) => {
      if (type !== ThreadType.User && type !== 0) return;

      const typedMessages = messages || [];
      for (const message of typedMessages) {
        const key = toKey(message);
        if (seenMessageKeys.has(key)) continue;
        seenMessageKeys.add(key);
        collected.push(message);
      }

      if (collected.length >= count || typedMessages.length === 0 || pagesRequested >= maxPages) {
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

    const onError = (err) => {
      finish(err);
    };

    const timeoutId = setTimeout(() => {
      finish();
    }, 12_000);

    api.listener.on('old_messages', onOldMessages);
    api.listener.on('error', onError);

    requestPage(null);
  });
}

// ── Main Runner ────────────────────────────────────────────────────────────

async function main() {
  console.log('================================================================');
  console.log('  KIỂM CHỨNG CƠ CHẾ FETCH LỊCH SỬ TIN NHẮN TỰ ĐỘNG (OPENZCA)  ');
  console.log('================================================================\n');

  const zalo = new Zalo({ logging: false, selfListen: true });
  let api = null;

  const account = await prisma.zaloAccount.findFirst({
    where: { sessionData: { not: null } },
    select: { id: true, displayName: true, sessionData: true },
  });

  if (account?.sessionData?.imei) {
    console.log(`Đang đăng nhập bằng session (${account.displayName || account.id})...`);
    try {
      api = await zalo.login({
        cookie: account.sessionData.cookie,
        imei: account.sessionData.imei,
        userAgent: account.sessionData.userAgent,
      });
      console.log(' Đăng nhập thành công!');
    } catch (err) {
      console.warn('⚠️ Session hết hạn, vui lòng đăng nhập QR...');
    }
  }

  if (!api) {
    console.log('\n Khởi tạo đăng nhập bằng mã QR...');
    api = await zalo.loginQR({}, (event) => {
      if (event.type === 0 && event.data?.image) {
        const base64Data = event.data.image.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync('/app/qr.png', base64Data, 'base64');
        console.log('\n Đã lưu mã QR vào: /app/qr.png');
      } else if (event.type === 4) {
        console.log(' Đăng nhập QR thành công!');
      }
    });
  }

  const ownId = await api.getOwnId();
  console.log(`\n🎯 Tài khoản Zalo ID: ${ownId}`);

  api.listener.start();
  await new Promise((r) => setTimeout(r, 2000));
  console.log(' WebSocket Listener đã ONLINE!\n');

  console.log('----------------------------------------------------------------');
  console.log('BƯỚC 1: MÔ PHỎNG MẤT MẠNG (DISCONNECT)');
  console.log('----------------------------------------------------------------');
  api.listener.stop();
  const disconnectedAtMs = Date.now();
  console.log('🔴 WEBSOCKET ĐÃ NGẮT (OFFLINE)!');
  console.log(`Thời điểm ngắt mạng: ${new Date(disconnectedAtMs).toLocaleTimeString('vi-VN')}`);
  console.log('\n👉 BÂY GIỜ, bạn có thể gửi BẤT KỲ tin nhắn nào từ tài khoản khác:');
  console.log('   - Tin nhắn văn bản (chữ bất kỳ)');
  console.log('   - Tin nhắn hình ảnh / Sticker / Voice');
  console.log('\n(Sau khi đã gửi xong các tin nhắn từ điện thoại, nhấn phím ENTER để tiếp tục)');

  await ask('\n[NHẤN ENTER KHI ĐÃ GỬI XONG TIN NHẮN TỪ ĐIỆN THOẠI]...');

  console.log('\n----------------------------------------------------------------');
  console.log('BƯỚC 2: KHÔI PHỤC KẾT NỐI (RECONNECT) & FETCH TIN OFFLINE');
  console.log('----------------------------------------------------------------');
  api.listener.start();
  await new Promise((r) => setTimeout(r, 3000));
  const reconnectedAtMs = Date.now();
  console.log(` WebSocket đã RECONNECT lúc: ${new Date(reconnectedAtMs).toLocaleTimeString('vi-VN')}`);

  console.log('\n Đang quét tin nhắn bằng requestOldMessages...');
  const recoveredMsgs = await fetchRecentUserMessagesViaOpenzca(api, 30);

  console.log('\n================================================================');
  console.log('  DANH SÁCH TẤT CẢ TIN NHẮN THU ĐƯỢC TỪ ZALO  ');
  console.log('================================================================');

  const offlineMessages = [];

  recoveredMsgs.forEach((m, i) => {
    const rawContent = typeof m.data?.content === 'string' ? m.data.content : JSON.stringify(m.data?.content || '');
    const tsMs = parseInt(m.data?.ts || '0', 10);
    const tsStr = new Date(tsMs).toLocaleTimeString('vi-VN');
    const isDuringOffline = tsMs >= (disconnectedAtMs - 5000); // Khoảng thời gian từ lúc ngắt mạng

    console.log(`[#${i + 1}] ID: ${m.data?.msgId} | Lúc: ${tsStr} | Người gửi: ${m.data?.dName || m.data?.uidFrom} | Loại: ${m.data?.msgType} | Nội dung: "${rawContent}"`);

    if (isDuringOffline) {
      offlineMessages.push({ msgId: m.data?.msgId, ts: tsStr, sender: m.data?.dName || m.data?.uidFrom, content: rawContent, type: m.data?.msgType });
    }
  });

  console.log('\n----------------------------------------------------------------');
  console.log(`🎯 CÁC TIN NHẮN PHÁT SINH TRONG THỜI GIAN MẤT MẠNG (ĐƯỢC KHÔI PHỤC): ${offlineMessages.length} tin`);
  console.log('----------------------------------------------------------------');
  offlineMessages.forEach((f, idx) => {
    console.log(`  ✅ [Tin #${idx + 1}] Lúc: ${f.ts} | Từ: ${f.sender} | Loại: ${f.type} | Nội dung: "${f.content}"`);
  });

  if (offlineMessages.length > 0) {
    console.log('\n🎉 KẾT LUẬN: ĐÃ KHÔI PHỤC THÀNH CÔNG CÁC TIN NHẮN OFFLINE CỦA BẠN!');
  } else {
    console.log('\n⚠️ Không phát hiện tin nhắn mới trong khoảng thời gian vừa rồi.');
  }

  rl.close();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Lỗi thực thi test:', err);
  rl.close();
  prisma.$disconnect();
  process.exit(1);
});
