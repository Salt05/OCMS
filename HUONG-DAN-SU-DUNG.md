# Sổ tay Hướng dẫn Sử dụng Hệ thống OCMS

Hệ thống **OCMS (Omnichannel Customer Management System)** là giải pháp quản lý tập trung nhiều tài khoản Zalo cá nhân, kết hợp **Trợ lý AI ChatBot thông minh** và liên kết chặt chẽ với **ERP Odoo** & **Directus CMS**.

---

## Mục lục

1. [Đăng nhập & Giao diện tổng quan](#1-đăng-nhập--giao-diện-tổng-quan)
2. [Quản lý Tài khoản Zalo & Quy tắc an toàn](#2-quản-lý-tài-khoản-zalo--quy-tắc-an-toàn)
3. [Khung Chat CSKH Real-time & Quản lý Khách hàng](#3-khung-chat-cskh-real-time--quản-lý-khách-hàng)
4. [Trợ lý AI ChatBot & Tự động Lên đơn hàng](#4-trợ-lý-ai-chatbot--tự-động-lên-đơn-hàng)
5. [Quản lý Đơn hàng & Sản phẩm & Khuyến mãi](#5-quản-lý-đơn-hàng--sản-phẩm--khuyến-mãi)
6. [Đồng bộ Dữ liệu với ERP Odoo](#6-đồng-bộ-dữ-liệu-với-erp-odoo)
7. [Quản lý Pipeline & Lịch hẹn chăm sóc](#7-quản-lý-pipeline--lịch-hẹn-chăm-sóc)
8. [Dashboard Thống kê & Xuất Báo cáo Excel](#8-dashboard-thống-kê--xuất-báo-cáo-excel)
9. [Quản lý Đội ngũ & Phân quyền Nhân viên](#9-quản-lý-đội-ngũ--phân-quyền-nhân-viên)
10. [Những nguyên tắc quan trọng cần nhớ](#10-những-nguyên-tắc-quan-trọng-cần-nhớ)

---

## 1. Đăng nhập & Giao diện tổng quan

1. **Đăng nhập**: Mở trình duyệt truy cập địa chỉ hệ thống CRM → Nhập **Email** và **Mật khẩu** của bạn.
2. **Giao diện Tối / Sáng (Dark / Light Theme)**: Bấm vào biểu tượng ☀️/🌙 trên góc phải thanh tiêu đề để chuyển đổi chế độ hiển thị phù hợp với mắt làm việc.
3. **Thanh điều hướng chính bên trái**:
   - 💬 **Tin nhắn (Chat)**: Khung chat real-time với khách hàng từ tất cả tài khoản Zalo.
   - 🤖 **ChatBot AI**: Trợ lý phân tích dữ liệu chuyên sâu và tra cứu dữ liệu hệ thống.
   - 👥 **Khách hàng (Contacts)**: Danh sách khách hàng, bộ lọc nguồn, nhãn phân loại.
   - 🛒 **Đơn hàng (Orders)**: Lịch sử đơn hàng đồng bộ từ Odoo và bảng doanh số nhân viên.
   - 📦 **Sản phẩm (Products)**: Danh mục sản phẩm, bảng giá sỉ/lẻ, tính năng xuất Excel.
   - 🎁 **Khuyến mãi (Promotions)**: Quản lý chương trình ưu đãi, combo sản phẩm La Pet.
   - 📅 **Lịch hẹn (Appointments)**: Lịch hẹn gọi lại, demo, chăm sóc khách hàng.
   - 📊 **Báo cáo & Dashboard**: Thống kê tin nhắn, doanh thu, KPI.
   - ⚙️ **Cài đặt & Tài khoản Zalo**: Kết nối Zalo, phân quyền nhân sự, mẫu tin nhắn nhanh.

---

## 2. Quản lý Tài khoản Zalo & Quy tắc an toàn

### 2.1. Thêm mới và kết nối Zalo
1. Vào menu **Cài đặt** → chọn tab **Tài khoản Zalo** (hoặc menu **Tài khoản Zalo**).
2. Nhấn nút **+ Thêm tài khoản Zalo** → Đặt tên gợi nhớ (ví dụ: *"Sale Lan Anh - 0912xxx"*).
3. Bấm vào biểu tượng **Mã QR** bên cạnh tài khoản vừa tạo.
4. Mở ứng dụng **Zalo trên điện thoại** → Quét mã QR hiện trên màn hình máy tính.
5. Bấm **Xác nhận đăng nhập** trên điện thoại.
6. Trạng thái trên web sẽ tự động chuyển sang màu xanh lá: **Đã kết nối**.

### 2.2. Đồng bộ danh bạ Zalo
- Bấm vào biểu tượng **Đồng bộ danh bạ (👥↻)** bên cạnh tài khoản. Hệ thống sẽ tự động quét danh sách bạn bè trên Zalo đó và đưa vào danh sách **Khách hàng** trên CRM.

### 2.3. Phân quyền tài khoản Zalo cho nhân viên
- Nhấn vào biểu tượng **Phân quyền (🛡️)** bên cạnh tài khoản Zalo:
  - **Xem (View)**: Nhân viên chỉ được đọc tin nhắn, không thể gửi tin.
  - **Chat**: Nhân viên được phép chat và phản hồi khách hàng.
  - **Quản lý (Manage)**: Toàn quyền kết nối lại, đổi tên, phân quyền cho người khác.

### 2.4. ⚠️ NGUYÊN TẮC VÀNG TRÁNH BỊ ZALO KHÓA TÀI KHOẢN (CHECKPOINT):
> [!CAUTION]
> 1. **TUYỆT ĐỐI KHÔNG mở Zalo Web (chat.zalo.me) trên trình duyệt cùng lúc** với tài khoản đang chạy trên OCMS. Zalo chỉ cho phép 1 phiên web hoạt động, nếu mở đè sẽ làm ngắt kết nối hệ thống CRM.
> 2. **Không spam tin nhắn hàng loạt**: Hệ thống đã cài đặt giới hạn an toàn 200 tin nhắn/ngày/tài khoản và có độ trễ ngẫu nhiên giữa các tin. Không cố tình tắt tính năng này.
> 3. Nếu tài khoản Zalo bị ngắt kết nối, hệ thống sẽ gửi thông báo chuông 🔔. Chỉ cần vào bấm **Kết nối lại** và quét QR lại nếu phiên đăng nhập hết hạn.

---

## 3. Khung Chat CSKH Real-time & Quản lý Khách hàng

Giao diện chat được thiết kế theo chuẩn 3 cột thông minh (có thể kéo thanh ngăn để co giãn kích thước):

```
+---------------------+-------------------------------+-------------------------+
|     CỘT TRÁI        |          CỘT GIỮA             |        CỘT PHẢI         |
| Danh sách hội thoại |   Nội dung tin nhắn chat      |   Thông tin khách hàng  |
| - Bộ lọc theo Zalo  | - Gửi/nhận text, ảnh, file    | - SĐT, địa chỉ, Odoo ID |
| - Tìm kiếm hội thoại| - Xem ảnh phóng to            | - Đường ống Pipeline    |
| - Tin chưa đọc      | - Thẻ [ORDER_DRAFT] của AI    | - Lịch sử đơn hàng Odoo |
| - Phân nhóm tin nhắn| - Soạn thảo & phím tắt        | - Tags & Lịch hẹn       |
+---------------------+-------------------------------+-------------------------+
```

### 3.1. Các thao tác chat thông minh
- **Gửi tin nhắn**: Gõ nội dung → nhấn **Enter** (Dùng **Shift + Enter** để xuống dòng).
- **Gửi hình ảnh & Tài liệu**: Nhấn vào biểu tượng kẹp ghim hoặc kéo thả trực tiếp file ảnh/PDF vào khung chat.
- **Xem ảnh phóng to**: Nhấn vào bất kỳ hình ảnh nào trong khung chat để mở trình xem ảnh độ phân giải cao có hỗ trợ phóng to/thu nhỏ và tải về.
- **Tin nhắn mẫu (Quick Messages)**: Gõ dấu gạch chéo `/` để hiện danh sách câu trả lời nhanh đã cài sẵn.

### 3.2. Cập nhật hồ sơ khách hàng tại chỗ
Ở cột bên phải của khung chat:
- Cập nhật **Họ và tên**, **Số điện thoại**, **Địa chỉ nhận hàng**, **Ghi chú sở thích của khách**.
- **Gắn nhãn (Tags)**: Nhấn chọn nhãn (ví dụ: *Khách VIP, Khách sỉ, Mua lần đầu, Khiếu nại*).
- **Chuyển giai đoạn bán hàng**: Nhấp chọn trạng thái tương ứng (*Mới → Đã liên hệ → Quan tâm → Chuyển đổi → Mất*). Dữ liệu này tự động cập nhật sang bảng Kanban quản lý.

---

## 4. Trợ lý AI ChatBot & Tự động Lên đơn hàng

Hệ thống tích hợp công nghệ AI Text-to-SQL hàng đầu giúp bạn tra cứu dữ liệu chỉ bằng cách đặt câu hỏi tiếng Việt.

### 4.1. Cách mở Trợ lý AI
- **Trong khung Chat Zalo**: Nhấn vào nút biểu tượng **Trợ lý AI (🤖)** ở góc trên thanh công cụ chat. Khung trượt (Sidebar) của AI sẽ mở ra ngay bên cạnh.
- **Trang ChatBot độc lập**: Vào menu **ChatBot AI** ở thanh điều hướng bên trái để truy cập toàn màn hình.

### 4.2. Khả năng hiểu ngữ cảnh khách hàng đang chat
Khi bạn mở AI ChatBot ngay trong lúc đang chọn 1 khách hàng cụ thể trên Zalo, AI **đã tự động biết trước**:
- Khách hàng đó tên gì, số điện thoại nào, mã Odoo Partner ID bao nhiêu.
- Lịch sử các tin nhắn trao đổi gần nhất giữa bạn và khách.

👉 **Bạn chỉ cần hỏi tự nhiên**:
- *"Khách này đã từng mua những đơn nào rồi?"*
- *"Tổng chi tiêu của khách này trên Odoo là bao nhiêu?"*
- *"Sản phẩm nào phù hợp cho khách nuôi cún nhỏ bị ngứa răng?"*
- *"Gợi ý mã SKU que gặm vị sữa"*

### 4.3. Tính năng tự động tạo đơn hàng `[ORDER_DRAFT]`
Khi khách hàng nhắn tin chốt mua (ví dụ: *"Gửi cho chị 5 bao B03 và 10 gói E01 về địa chỉ cũ"*):
1. AI sẽ tự động phân tích và hiển thị một **Thẻ Đơn Hàng Tương Tác**:
   - Tên khách hàng & Số điện thoại & Địa chỉ.
   - Tên sản phẩm, mã SKU Odoo, đơn giá niêm yết/giá sỉ.
   - Nút tăng giảm số lượng (+ / -).
   - Tự động tính tổng tiền thanh toán theo thời gian thực.
2. Bạn chỉ cần kiểm tra nhanh và bấm nút **"Xác nhận tạo đơn Odoo"** ngay trên thẻ. Đơn hàng sẽ được tạo thẳng lên ERP Odoo ở trạng thái Bản nháp (Quotation).

### 4.4. Yêu cầu vẽ biểu đồ kinh doanh
Nếu bạn muốn xem dữ liệu dạng hình ảnh, hãy thêm từ khóa *"vẽ biểu đồ"*:
- *"Vẽ biểu đồ top 5 khách hàng có doanh thu cao nhất"*
- *"Vẽ biểu đồ doanh số theo từng tháng trong năm nay"*
AI sẽ tự động sinh biểu đồ đồ họa sắc nét bằng Plotly để bạn theo dõi.

### 4.5. Cơ chế tự động dọn dẹp file tạm của AI
Mỗi khi AI truy vấn dữ liệu lớn để vẽ biểu đồ, hệ thống sẽ tạo một file tạm. Các file này được **cài đặt tự động xóa sạch sau 3 ngày (72 giờ)** bởi tiến trình ngầm, giúp máy chủ luôn nhẹ và sạch sẽ.

---

## 5. Quản lý Đơn hàng & Sản phẩm & Khuyến mãi

### 5.1. Quản lý Đơn hàng (Orders View)
- Vào menu **Đơn hàng**: Xem toàn bộ đơn hàng đồng bộ từ Odoo ERP.
- Có đầy đủ các trường: Mã đơn (ví dụ: *S02295*), Tên khách hàng, Ngày đặt, Tổng tiền, Trạng thái đơn (*Bản nháp, Đã xác nhận, Đã hủy, Hoàn tất*), Trạng thái giao hàng và **Margin lợi nhuận**.
- **Bảng doanh số nhân viên (Staff Sales Table)**: Bảng xếp hạng doanh số chi tiết giúp quản lý theo dõi hiệu suất bán hàng của từng nhân viên sale.

### 5.2. Danh mục Sản phẩm (Products View)
- Tra cứu danh sách sản phẩm gồm: Tên sản phẩm, Mã SKU, Giá bán lẻ, Giá bán sỉ, Quy cách đóng gói.
- **Nút "Xuất Excel"**: Xuất file Excel định dạng chuẩn quốc tế toàn bộ danh sách sản phẩm Odoo kèm mapping Directus CMS.

### 5.3. Bảng chọn sản phẩm nhanh (ProductPicker) & Tạo đơn thủ công
- Khi bấm **Tạo đơn hàng** từ thông tin khách hàng:
  - Một hộp thoại chọn sản phẩm thông minh sẽ mở ra.
  - Hỗ trợ gõ tìm kiếm theo tên hoặc mã SKU (B03, E01...).
  - Chọn nhanh số lượng và tự động áp dụng giá sỉ/lẻ.

### 5.4. Cấu hình Khuyến mãi Combo (La Pet Promotions)
- Menu **Khuyến mãi** cho phép quản lý cấu hình các gói combo:
  - Mua X tặng Y, combo giảm giá theo giỏ hàng.
  - Động cơ khuyến mãi tự động tính toán số tiền giảm trừ vào đơn hàng trước khi đẩy lên Odoo.

---

## 6. Đồng bộ Dữ liệu với ERP Odoo

Hệ thống liên kết trực tiếp với Odoo qua XML-RPC và REST API bảo mật:

1. **Đồng bộ tự động**: Hệ thống định kỳ chạy ngầm đồng bộ các đơn hàng mới phát sinh từ Odoo về PostgreSQL của CRM.
2. **Đồng bộ thủ công (Force Sync)**:
   - Trên màn hình **Dashboard**, tìm khung widget **Đồng bộ Odoo**.
   - Bấm nút **"Đồng bộ ngay"**: Hệ thống sẽ quét toàn bộ đối tác mới và đơn hàng mới từ Odoo về trong vài giây.
3. **Đối soát số liệu**: Nếu có khách hàng mua hàng tại cửa hàng trực tiếp trên Odoo mà chưa có trong Zalo, khi khách nhắn tin qua Zalo có số điện thoại trùng khớp, CRM sẽ **tự động liên kết hồ sơ khách hàng** ngay lập tức.

---

## 7. Quản lý Pipeline & Lịch hẹn chăm sóc

### 7.1. Đường ống bán hàng (Pipeline)
- Vào menu **Khách hàng** → chuyển sang dạng xem **Kanban (Pipeline)**.
- Kéo thả thẻ khách hàng qua các cột trạng thái:
  - 🟡 **Mới (Lead)**: Khách mới nhắn tin lần đầu qua Zalo.
  - 🔵 **Đã liên hệ (Contacted)**: Nhân viên đã phản hồi và tư vấn ban đầu.
  - 🟣 **Quan tâm (Interested)**: Khách hỏi giá, sản phẩm cụ thể.
  - 🟢 **Chuyển đổi (Won)**: Khách đã chốt đơn mua hàng.
  - 🔴 **Mất (Lost)**: Khách từ chối hoặc không có nhu cầu.

### 7.2. Lịch hẹn & Nhắc việc (Appointments)
- Tạo lịch hẹn trực tiếp từ khung chat (ví dụ: *Hẹn gọi lại báo giá lúc 14:00 ngày mai*).
- Quản lý tập trung toàn bộ lịch hẹn trong menu **Lịch hẹn**.
- Hệ thống tự động gửi thông báo chuông và popup nhắc nhở trước giờ hẹn 15 phút.

---

## 8. Dashboard Thống kê & Xuất Báo cáo Excel

Màn hình **Dashboard** cung cấp bức tranh toàn cảnh về hoạt động kinh doanh:
- **Thẻ chỉ số KPI**: Tổng số hội thoại, số tin nhắn đến/đi hôm nay, tỷ lệ phản hồi nhanh, tổng số đơn hàng phát sinh.
- **Biểu đồ khối lượng tin nhắn**: Theo dõi khung giờ cao điểm khách nhắn tin để bố trí ca trực của nhân viên.
- **Biểu đồ phễu chuyển đổi (Pipeline Conversion)**: Đo lường tỷ lệ khách hàng từ lúc nhắn tin tới lúc phát sinh đơn.
- **Biểu đồ nguồn khách hàng**: Đo lường hiệu quả các kênh tiếp thị.
- **Nút "Xuất báo cáo Excel"**: Tải về file báo cáo tổng hợp chi tiết theo khoảng thời gian tùy chọn.

---

## 9. Quản lý Đội ngũ & Phân quyền Nhân viên

Chỉ tài khoản có quyền **Owner** hoặc **Admin** mới có quyền truy cập menu **Cài đặt → Đội ngũ**:

| Vai trò (Role) | Quyền hạn trong hệ thống |
|---|---|
| **Owner (Chủ sở hữu)** | Toàn quyền cao nhất: Quản lý thanh toán, xóa tổ chức, chỉ định Admin, xem mọi tài khoản Zalo và đơn hàng. |
| **Admin (Quản trị viên)** | Quản lý thêm/bớt nhân viên, kết nối tài khoản Zalo, cấu hình Odoo, xuất mọi báo cáo. |
| **Member (Nhân viên kinh doanh)** | Chỉ xem và chat trên các tài khoản Zalo được phân quyền; quản lý các khách hàng được giao phụ trách. |

---

## 10. Những nguyên tắc quan trọng cần nhớ

1. **Bảo mật thông tin khách hàng**: Tuyệt đối không chia sẻ tài khoản đăng nhập CRM cho người ngoài.
2. **Không mở Zalo Web đồng thời**: Nhắc nhở toàn bộ nhân viên không mở `chat.zalo.me` trên trình duyệt máy tính của tài khoản Zalo đã được gán vào hệ thống.
3. **Kiểm tra thông báo chuông 🔔**: Khi có tin nhắn quá 30 phút chưa được nhân viên trả lời, hệ thống sẽ báo đỏ để quản lý kịp thời đôn đốc chăm sóc khách hàng.
4. **Tận dụng tối đa AI ChatBot**: Hãy thường xuyên dùng AI để tra cứu nhanh lịch sử khách cũ, giúp việc tư vấn cá nhân hóa và chốt đơn nhanh gấp 3 lần.
