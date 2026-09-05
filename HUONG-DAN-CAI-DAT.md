# Hướng dẫn Cài đặt & Triển khai Hệ thống OCMS

Tài liệu này hướng dẫn chi tiết từng bước từ cài đặt môi trường, cấu hình dịch vụ, khởi chạy hệ thống bằng Docker cho đến cấu hình tên miền và SSL HTTPS.

---

## Mục lục
1. [Yêu cầu hệ thống & Môi trường](#1-yêu-cầu-hệ-thống--môi-trường)
2. [Cài đặt Docker & Docker Compose](#2-cài-đặt-docker--docker-compose)
3. [Tải mã nguồn & Cấu hình biến môi trường](#3-tải-mã-nguồn--cấu-hình-biến-môi-trường)
4. [Khởi chạy hệ thống bằng Docker](#4-khởi-chạy-hệ-thống-bằng-docker)
5. [Khởi tạo tài khoản quản trị đầu tiên](#5-khởi-tạo-tài-khoản-quản-trị-đầu-tiên)
6. [Cấu hình Tên miền & SSL HTTPS (Nginx + Certbot)](#6-cấu-hình-tên-miền--ssl-https-nginx--certbot)
7. [Hướng dẫn chạy môi trường Dev cục bộ (Local Development)](#7-hướng-dẫn-chạy-môi-trường-dev-cục-bộ-local-development)
8. [Khắc phục sự cố thường gặp (Troubleshooting)](#8-khắc-phục-sự-cố-thường-gặp-troubleshooting)

---

## 1. Yêu cầu hệ thống & Môi trường

| Thành phần | Cấu hình tối thiểu | Khuyến nghị cho Production |
|---|---|---|
| **Hệ điều hành** | Ubuntu 20.04 / Debian 11 / Windows Docker | Ubuntu 22.04 LTS hoặc 24.04 LTS |
| **CPU** | 2 vCPU | 4 vCPU |
| **RAM** | 2 GB | 4 GB - 8 GB |
| **Ổ cứng** | 20 GB SSD | 40 GB NVMe SSD |
| **Mở cổng Firewall** | 80, 443, 3080 | 80, 443 (chỉ mở web qua Nginx Reverse Proxy) |

---

## 2. Cài đặt Docker & Docker Compose

Nếu bạn đang sử dụng máy chủ VPS Linux (Ubuntu/Debian) mới tinh:

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài đặt Docker tự động qua script chính thức
curl -fsSL https://get.docker.com | sudo sh

# Thêm user hiện tại vào group docker (để chạy docker không cần sudo)
sudo usermod -aG docker $USER

# Cài đặt docker-compose plugin (nếu chưa có)
sudo apt install -y docker-compose-plugin

# Đăng xuất và đăng nhập lại để cập nhật quyền
exit
```

Sau khi đăng nhập lại, kiểm tra:
```bash
docker --version
docker compose version
```

---

## 3. Tải mã nguồn & Cấu hình biến môi trường

### 3.1. Clone repository
```bash
git clone https://github.com/Salt05/OCMS.git
cd OCMS
```

### 3.2. Tạo và chỉnh sửa file cấu hình `.env`
```bash
cp .env.example .env
nano .env
```

### 3.3. Hướng dẫn điền các thông số quan trọng trong `.env`:

#### A. Cấu hình bảo mật (Bắt buộc)
Chạy 2 lệnh sau trên terminal để tạo chuỗi ngẫu nhiên bảo mật cao:
```bash
# Tạo JWT_SECRET (32 ký tự hex)
openssl rand -hex 32

# Tạo ENCRYPTION_KEY (16 ký tự hex)
openssl rand -hex 16
```
Copy kết quả dán vào `JWT_SECRET` và `ENCRYPTION_KEY` trong `.env`.

#### B. Cấu hình Cơ sở dữ liệu
```env
DB_USER=crmuser
DB_PASSWORD=nhap_mat_khau_database_rat_kho_doan_o_day
DB_NAME=zalocrm
```

#### C. Cấu hình Kết nối Odoo ERP (Nếu sử dụng)
- `ODOO_URL`: Đường dẫn máy chủ Odoo (ví dụ: `https://odooo.your-domain.vn`).
- `ODOO_DB`: Tên database Odoo (mặc định thường là `odoo`).
- `ODOO_USER`: Email tài khoản đăng nhập Odoo có quyền xem đơn hàng và đối tác.
- `ODOO_API_KEY`: API Key được tạo trong Odoo (*Vào Odoo → Người dùng → Tùy chọn tài khoản → Khóa API*).

#### D. Cấu hình Kết nối Directus CMS (Nếu sử dụng)
- `DIRECTUS_URL`: URL trang Directus (ví dụ: `https://directus.your-domain.vn`).
- `DIRECTUS_EMAIL`: Email tài khoản quản trị Directus.
- `DIRECTUS_PASSWORD`: Mật khẩu tài khoản Directus.

#### E. Cấu hình Trí tuệ nhân tạo (AI ChatBot & Trích xuất đơn)
Hệ thống hỗ trợ Google Gemini (khuyến nghị: miễn phí & nhanh), Groq hoặc OpenAI:
```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIzaSy...dán_key_lấy_từ_Google_AI_Studio
GEMINI_MODEL=gemini-flash-lite-latest
```
*(Cách lấy Gemini API Key miễn phí: Truy cập https://aistudio.google.com/ → Nhấn **Get API key** → **Create API key**).*

#### F. Cấu hình tự động dọn dẹp file tạm ChatBot (CSV Cleanup)
```env
VANNA_DATA_TTL_SECONDS=259200   # File kết quả truy vấn SQL tạm tự động xóa sau 3 ngày (259200s)
CLEANUP_INTERVAL_SECONDS=3600   # Quét dọn tự động ngầm mỗi 1 giờ
```

---

## 4. Khởi chạy hệ thống bằng Docker

Tại thư mục gốc `ZaloCRM`, chạy lệnh:

```bash
docker compose up -d --build
```

Quá trình build diễn ra trong khoảng 2-5 phút cho lần đầu tiên.

### Kiểm tra trạng thái các container:
```bash
docker compose ps
```
Kết quả mong muốn:
- `app` (Node.js backend + Vue 3 frontend): **Up (healthy/running)** trên cổng `3080`.
- `chatbot` (FastAPI + Vanna AI): **Up** trên cổng `8000`.
- `database` (PostgreSQL 16): **Up (healthy)** trên cổng `5433`.
- `backup` (Dịch vụ backup tự động hàng ngày): **Up**.

### Xem logs khi cần:
```bash
# Xem log toàn bộ hệ thống
docker compose logs -f

# Xem riêng log app chính
docker compose logs -f app

# Xem riêng log chatbot AI
docker compose logs -f chatbot
```

---

## 5. Khởi tạo tài khoản quản trị đầu tiên

1. Mở trình duyệt truy cập: `http://IP-server:3080/setup` (hoặc domain của bạn).
2. Điền thông tin:
   - **Tên tổ chức (Organization)**
   - **Họ tên Quản trị viên (Owner)**
   - **Email đăng nhập**
   - **Mật khẩu**
3. Nhấn **Hoàn tất thiết lập** → Hệ thống tự động chuyển đến trang Đăng nhập.

---

## 6. Cấu hình Tên miền & SSL HTTPS (Nginx + Certbot)

Để hệ thống hoạt động ổn định và bảo mật trên môi trường Production, bạn nên gắn tên miền và kích hoạt HTTPS:

### 6.1. Cài đặt Nginx và Certbot trên máy chủ host:
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 6.2. Tạo file cấu hình Nginx:
```bash
sudo nano /etc/nginx/sites-available/ocms.conf
```
Dán nội dung sau (thay `crm.your-domain.vn` bằng tên miền thật của bạn):

```nginx
server {
    listen 80;
    server_name crm.your-domain.vn;

    client_max_body_size 50M;

    # Chuyển hướng toàn bộ traffic tới container App (port 3080)
    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Route cho ChatBot AI Web độc lập (tùy chọn)
    location /ai-bot/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Kích hoạt site và khởi động lại Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/ocms.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6.3. Cấp chứng chỉ SSL HTTPS miễn phí:
```bash
sudo certbot --nginx -d crm.your-domain.vn
```
Certbot sẽ tự động cấu hình HTTPS và gia hạn chứng chỉ tự động.

---

## 7. Hướng dẫn chạy môi trường Dev cục bộ (Local Development)

Nếu bạn là lập trình viên muốn phát triển hoặc tùy chỉnh mã nguồn trực tiếp trên máy tính:

### 7.1. Chạy cơ sở dữ liệu & ChatBot bằng Docker:
```bash
docker compose up -d db chatbot
```

### 7.2. Chạy Backend (Node.js + Fastify):
```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run dev
```
Backend lắng nghe tại: `http://localhost:3000`.

### 7.3. Chạy Frontend (Vue 3 + Vite):
Mở một terminal mới:
```bash
cd frontend
npm install
npm run dev
```
Frontend lắng nghe tại: `http://localhost:5173` (tự động proxy API sang port 3000).

---

## 8. Khắc phục sự cố thường gặp (Troubleshooting)

### Q1: Lỗi "Port 3080 / 8000 / 5433 already in use"?
Kiểm tra xem tiến trình nào đang chiếm cổng:
```bash
sudo lsof -i :3080
# Hoặc trên Windows:
netstat -ano | findstr :3080
```
Tắt tiến trình đó hoặc đổi cổng ánh xạ ở bên trái trong [docker-compose.yml](docker-compose.yml) (ví dụ: `"3081:3000"`).

### Q2: Khách hàng nhắn tin nhưng Zalo CRM không nhận được tin?
- Kiểm tra trạng thái tài khoản Zalo trong tab **Tài khoản Zalo** xem có bị ngắt kết nối không.
- **Lưu ý tối quan trọng**: Không đăng nhập tài khoản Zalo đó trên trình duyệt web khác cùng lúc, vì Zalo chỉ cho phép 1 phiên web hoạt động tại một thời điểm.

### Q3: AI ChatBot báo lỗi không truy vấn được dữ liệu?
- Kiểm tra xem biến `GEMINI_API_KEY` trong file `.env` đã được điền chính xác chưa.
- Kiểm tra container ChatBot có kết nối được database PostgreSQL không:
  ```bash
  docker compose logs chatbot
  ```
