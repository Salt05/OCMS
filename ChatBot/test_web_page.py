from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_web_app():
    # 1. Test GET /
    res = client.get("/")
    assert res.status_code == 200, f"GET / failed with {res.status_code}"
    assert "Vanna AI - Trợ Lý Phân Tích Dữ Liệu" in res.text
    print("✓ 1. Trang chủ trả về index.html chuẩn 200 OK")

    # 2. Test GET /static/style.css
    res_css = client.get("/static/style.css")
    assert res_css.status_code == 200
    assert "--vanna-navy" in res_css.text
    print("✓ 2. CSS tĩnh tải thành công 200 OK")

    # 3. Test GET /static/app.js
    res_js = client.get("/static/app.js")
    assert res_js.status_code == 200
    assert "loadConversations" in res_js.text
    print("✓ 3. JS tĩnh tải thành công 200 OK")

    print("\n✓ GIAO DIỆN WEB STANDALONE ĐÃ SẴN SÀNG HOẠT ĐỘNG!")

if __name__ == "__main__":
    test_web_app()
