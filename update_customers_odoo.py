import xmlrpc.client
import pandas as pd
import sys

# Đảm bảo in ra màn hình console không bị lỗi font tiếng Việt trên Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

# Thông tin cấu hình Odoo
url = 'https://odooo.fonti.vn'
db = 'odoo'
username = 'sale.order01@gmai.com'
password = 'b09c7fa1deb1103abb6820be7d1d99c16129a243'

# Dictionary ánh xạ Tag nhân viên -> ID Nhân viên (Partner ID) trên Odoo
STAFF_MAPPING = {
    'Sale01': 17705,
    'Sale04': 17746,
    'Sale 04': 17746, # Thêm các trường hợp có thể gõ sai khoảng trắng
    # Thêm các nhân viên khác ở đây...
}

def connect_odoo():
    try:
        common = xmlrpc.client.ServerProxy('{}/xmlrpc/2/common'.format(url))
        uid = common.authenticate(db, username, password, {})
        models = xmlrpc.client.ServerProxy('{}/xmlrpc/2/object'.format(url))
        print(f"[OK] Dang nhap thanh cong voi uid: {uid}")
        return uid, models
    except Exception as e:
        print(f"[X] Loi ket noi Odoo: {e}")
        return None, None

def update_customers_from_excel(file_path):
    uid, models = connect_odoo()
    if not uid:
        return

    try:
        # Đọc file Excel
        print(f"Dang doc du lieu tu file {file_path}...")
        df = pd.read_excel(file_path)
    except Exception as e:
        print(f"[X] Loi khi doc file Excel: {e}")
        return

    # TODO: Sửa lại tên cột cho khớp với file Excel thực tế của bạn
    COL_CUSTOMER_ID = 'CustomerID'          # Tên cột chứa ID Khách hàng trên Odoo
    COL_STAFF_TAG = 'Nhân viên CSKH'     # Tên cột chứa Tag (VD: Sale01)

    success_count = 0
    error_count = 0

    for index, row in df.iterrows():
        try:
            # Bỏ qua nếu dòng này không có ID
            if pd.isna(row[COL_CUSTOMER_ID]):
                continue
                
            # Bỏ qua nếu dòng này không có tag Sale
            if pd.isna(row[COL_STAFF_TAG]):
                continue
                
            customer_id = int(row[COL_CUSTOMER_ID])
            staff_tag = str(row[COL_STAFF_TAG]).strip()
            
            if not staff_tag or staff_tag.lower() == 'nan':
                continue

            # Tìm ID nhân viên (Partner ID) từ mapping
            if staff_tag in STAFF_MAPPING:
                staff_partner_id = STAFF_MAPPING[staff_tag]
                
                # Tìm User ID thực tế trong bảng res.users dựa trên Partner ID
                user_ids = models.execute_kw(db, uid, password, 'res.users', 'search', [[['partner_id', '=', staff_partner_id]]])
                
                if not user_ids:
                    print(f"[!] Khong tim thay User lien ket voi Partner ID {staff_partner_id} cua tag '{staff_tag}'")
                    error_count += 1
                    continue
                    
                staff_user_id = user_ids[0]
                
                # Gọi API Odoo để cập nhật trường user_id (Nhân viên kinh doanh/CSKH)
                result = models.execute_kw(db, uid, password, 'res.partner', 'write', 
                                           [[customer_id], {'user_id': staff_user_id}])
                
                if result:
                    print(f"[OK] Cap nhat Khach hang {customer_id} thanh cong -> Phu trach: {staff_tag} (User ID: {staff_user_id})")
                    success_count += 1
                else:
                    print(f"[!] Cap nhat Khach hang {customer_id} that bai (API tra ve False).")
                    error_count += 1
            else:
                print(f"[>>] Bo qua Khach hang {customer_id}: Khong tim thay ID cho tag '{staff_tag}'")
                error_count += 1

        except Exception as e:
            print(f"[X] Loi o dong {index + 2}: {e}")
            error_count += 1

    print("\n--- HOAN THANH ---")
    print(f"[OK] Thanh cong: {success_count} khach hang")
    print(f"[X] Co loi hoac bo qua: {error_count} khach hang")


if __name__ == "__main__":
    # Thay đổi đường dẫn đến file Excel của bạn ở đây
    EXCEL_FILE_PATH = 'LA PET CRM (test) (2).xlsx'
    
    update_customers_from_excel(EXCEL_FILE_PATH)
