"""
Test script to verify Backend Chat History persistence in SQLite and JWT Authentication.
"""

import asyncio
import os
import sys
import uuid

# Đảm bảo in tiếng Việt không bị lỗi
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

from vanna.integrations.local.sql_conversation_store import SqlConversationStore
from vanna.core.user.jwt_resolver import JwtUserResolver, create_access_token, decode_access_token
from vanna.core.user.models import User
from vanna.core.user.request_context import RequestContext

async def run_tests():
    print("=" * 60)
    print("BẮT ĐẦU KIỂM THỬ BACKEND LƯU TRỮ VÀ XÁC THỰC LỊCH SỬ CHAT")
    print("=" * 60)

    db_test_file = "test_chatbot.db"
    if os.path.exists(db_test_file):
        try:
            os.remove(db_test_file)
        except Exception:
            pass

    store = SqlConversationStore(db_path=db_test_file)
    print("✓ 1. Khởi tạo SQLite Database thành công:", db_test_file)

    # 1. Test Register
    test_user_id = str(uuid.uuid4())
    test_email = "tuananh@example.com"
    test_pwd = "SecretPassword123"
    
    created_user = await store.create_user(
        user_id=test_user_id,
        email=test_email,
        password=test_pwd,
        username="Tuấn Anh"
    )
    print(f"✓ 2. Đăng ký tài khoản thành công: ID={created_user.id}, Email={created_user.email}")

    # 2. Test Login & JWT Token
    auth_user = await store.authenticate_user(test_email, test_pwd)
    assert auth_user is not None, "Đăng nhập thất bại!"
    assert auth_user.id == test_user_id, "User ID không khớp!"

    token = create_access_token({"sub": auth_user.id, "email": auth_user.email, "username": auth_user.username})
    print(f"✓ 3. Đăng nhập thành công, sinh JWT Token: {token[:30]}...")

    # 3. Test JWT Resolver
    resolver = JwtUserResolver()
    ctx = RequestContext(
        headers={"authorization": f"Bearer {token}"},
        cookies={},
        query_params={}
    )
    resolved_user = await resolver.resolve_user(ctx)
    assert resolved_user.id == test_user_id, "JWT Resolver không trích xuất đúng User ID!"
    print(f"✓ 4. JWT Resolver giải mã thành công: {resolved_user.username} ({resolved_user.id})")

    # 4. Test Conversation Creation & Message Persistence
    conv_id = str(uuid.uuid4())
    conv = await store.create_conversation(
        conversation_id=conv_id,
        user=resolved_user,
        initial_message="Xin chào, tôi tên là Tuấn Anh!"
    )
    print(f"✓ 5. Tạo cuộc trò chuyện mới trong DB: ID={conv.id}")

    # Thêm câu trả lời của AI vào DB
    from vanna.core.storage.models import Message
    conv.add_message(Message(role="assistant", content="Chào bạn Tuấn Anh! Tôi có thể giúp gì cho bạn?"))
    await store.update_conversation(conv)
    print("✓ 6. Lưu tin nhắn của AI vào Database thành công.")

    # 5. Giả lập đăng nhập từ thiết bị khác (Device 2)
    print("\n--- Giả lập User đăng nhập trên máy tính thứ 2 (Device 2) ---")
    device2_token = create_access_token({"sub": auth_user.id, "email": auth_user.email, "username": auth_user.username})
    device2_ctx = RequestContext(headers={"authorization": f"Bearer {device2_token}"})
    device2_user = await resolver.resolve_user(device2_ctx)

    # Lấy danh sách đoạn chat của user
    user_conversations = await store.list_conversations(device2_user)
    assert len(user_conversations) == 1, "Không tìm thấy cuộc trò chuyện cũ!"
    print(f"✓ 7. Máy 2 lấy danh sách đoạn chat: Tìm thấy {len(user_conversations)} đoạn chat (Tiêu đề: '{user_conversations[0].metadata.get('title')}')")

    # Đọc chi tiết tin nhắn của đoạn chat
    loaded_conv = await store.get_conversation(conv_id, device2_user)
    assert loaded_conv is not None, "Không tải được nội dung chat cũ!"
    assert len(loaded_conv.messages) == 2, f"Số lượng tin nhắn không đúng: {len(loaded_conv.messages)}"
    print(f"✓ 8. Máy 2 tải toàn bộ lịch sử tin nhắn ({len(loaded_conv.messages)} messages):")
    for idx, msg in enumerate(loaded_conv.messages, 1):
        print(f"   [{idx}] {msg.role.upper()}: {msg.content}")

    # Gửi tiếp tin nhắn thứ 2 từ máy 2
    loaded_conv.add_message(Message(role="user", content="Tôi vừa nói tôi tên là gì?"))
    loaded_conv.add_message(Message(role="assistant", content="Bạn vừa giới thiệu tên bạn là Tuấn Anh."))
    await store.update_conversation(loaded_conv)
    print("✓ 9. Gửi và lưu tin nhắn tiếp theo từ máy 2 thành công.")

    # Kiểm tra lại DB sau cập nhật
    final_conv = await store.get_conversation(conv_id, device2_user)
    assert len(final_conv.messages) == 4, "Số lượng tin nhắn sau cập nhật không đúng!"
    print(f"✓ 10. Xác nhận Database đã lưu đầy đủ 4 tin nhắn an toàn vĩnh viễn!")

    print("\n" + "=" * 60)
    print("TẤT CẢ CÁC BÀI KIỂM THỬ BACKEND ĐÃ VƯỢT QUA 100% THÀNH CÔNG!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_tests())
