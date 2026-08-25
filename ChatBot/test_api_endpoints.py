"""
Test script to verify all FastAPI endpoints (Auth, Conversation CRUD, User Scoping).
"""

import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

from fastapi.testclient import TestClient
from main import app, conversation_store
import uuid

client = TestClient(app)

def test_full_api_flow():
    print("=" * 60)
    print("KIỂM THỬ TỔNG HỢP CÁC ENDPOINT FASTAPI")
    print("=" * 60)

    # 1. Đăng ký user A
    email_a = f"usera_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "MyPassword123"
    res = client.post("/api/auth/register", json={"email": email_a, "password": pwd, "username": "User A"})
    assert res.status_code == 200, f"Register failed: {res.text}"
    token_a = res.json()["access_token"]
    user_a_id = res.json()["user"]["id"]
    print(f"✓ 1. Đăng ký User A: {email_a} (Token={token_a[:20]}...)")

    # 2. Đăng ký user B
    email_b = f"userb_{uuid.uuid4().hex[:6]}@example.com"
    res = client.post("/api/auth/register", json={"email": email_b, "password": pwd, "username": "User B"})
    assert res.status_code == 200
    token_b = res.json()["access_token"]
    print(f"✓ 2. Đăng ký User B: {email_b}")

    # 3. Đăng nhập User A
    login_res = client.post("/api/auth/login", json={"email": email_a, "password": pwd})
    assert login_res.status_code == 200
    assert login_res.json()["user"]["email"] == email_a
    print("✓ 3. Đăng nhập thành công qua API /api/auth/login")

    # 4. Lấy thông tin user hiện tại
    headers_a = {"Authorization": f"Bearer {token_a}"}
    me_res = client.get("/api/auth/me", headers=headers_a)
    assert me_res.status_code == 200
    assert me_res.json()["user"]["id"] == user_a_id
    print(f"✓ 4. Endpoint /api/auth/me xác thực đúng User A")

    # 5. Tạo cuộc hội thoại cho User A
    import asyncio
    from vanna.core.user.models import User
    from vanna.core.storage.models import Message
    
    user_obj_a = User(id=user_a_id, email=email_a, username="User A")
    conv_id = str(uuid.uuid4())
    asyncio.run(conversation_store.create_conversation(
        conversation_id=conv_id,
        user=user_obj_a,
        initial_message="Bảng dữ liệu này có bao nhiêu dòng?"
    ))
    print(f"✓ 5. Tạo cuộc trò chuyện ID: {conv_id}")

    # 6. User A lấy danh sách chat
    list_res_a = client.get("/api/conversations", headers=headers_a)
    assert list_res_a.status_code == 200
    convs_a = list_res_a.json()["conversations"]
    assert len(convs_a) >= 1
    print(f"✓ 6. User A xem danh sách chat: Tìm thấy {len(convs_a)} đoạn chat")

    # 7. User B KHÔNG THỂ xem chat của User A (Bảo mật Scoping)
    headers_b = {"Authorization": f"Bearer {token_b}"}
    list_res_b = client.get("/api/conversations", headers=headers_b)
    assert list_res_b.status_code == 200
    assert len(list_res_b.json()["conversations"]) == 0
    print("✓ 7. Bảo mật Scoping: User B không thể nhìn thấy đoạn chat của User A!")

    detail_res_b = client.get(f"/api/conversations/{conv_id}", headers=headers_b)
    assert detail_res_b.status_code == 404
    print("✓ 8. Bảo mật: User B gọi API lấy chi tiết chat của User A bị từ chối 404 Not Found")

    # 8. User A lấy chi tiết chat
    detail_res_a = client.get(f"/api/conversations/{conv_id}", headers=headers_a)
    assert detail_res_a.status_code == 200
    assert len(detail_res_a.json()["conversation"]["messages"]) == 1
    print(f"✓ 9. User A tải chi tiết lịch sử tin nhắn thành công qua /api/conversations/{conv_id}")

    # 9. User A xóa cuộc trò chuyện
    del_res = client.delete(f"/api/conversations/{conv_id}", headers=headers_a)
    assert del_res.status_code == 200
    print("✓ 10. User A xóa đoạn chat thành công qua DELETE /api/conversations/{id}")

    print("\n" + "=" * 60)
    print("TẤT CẢ CÁC API AUTH & CONVERSATIONS ĐÃ HOẠT ĐỘNG HOÀN HẢO!")
    print("=" * 60)

if __name__ == "__main__":
    test_full_api_flow()
