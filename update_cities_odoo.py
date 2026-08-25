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

def update_cities_from_excel(file_path):
    uid, models = connect_odoo()
    if not uid:
        return

    try:
        # Đọc file Excel
        print(f"Dang doc du lieu tu file {file_path} (Sheet: Customer)...")
        df = pd.read_excel(file_path, sheet_name='Customer')
    except Exception as e:
        print(f"[X] Loi khi doc file Excel: {e}")
        return

    # Tên cột trong file Excel
    COL_CUSTOMER_ID = 'CustomerID'  
    COL_CITY = 'Zone'               # Đổi thành tên cột chính xác nếu trong file ghi khác

    if COL_CITY not in df.columns:
        print(f"[X] Khong tim thay cot '{COL_CITY}' trong file Excel. Cac cot hien co: {df.columns.tolist()}")
        return

    success_count = 0
    error_count = 0

    for index, row in df.iterrows():
        try:
            # Bỏ qua nếu dòng này không có ID
            if pd.isna(row[COL_CUSTOMER_ID]):
                continue
                
            # Bỏ qua nếu dòng này không có Zone
            if pd.isna(row[COL_CITY]):
                continue
                
            customer_id = int(row[COL_CUSTOMER_ID])
            city = str(row[COL_CITY]).strip()
            
            if not city or city.lower() == 'nan':
                continue

            # Gọi API Odoo để cập nhật trường city
            result = models.execute_kw(db, uid, password, 'res.partner', 'write', 
                                       [[customer_id], {'city': city}])
            
            if result:
                print(f"[OK] Cap nhat Khach hang {customer_id} thanh cong -> Thanh pho: {city}")
                success_count += 1
            else:
                print(f"[!] Cap nhat Khach hang {customer_id} that bai (API tra ve False).")
                error_count += 1

        except Exception as e:
            print(f"[X] Loi o dong {index + 2}: {e}")
            error_count += 1

    print("\n--- HOAN THANH ---")
    print(f"[OK] Thanh cong: {success_count} khach hang")
    print(f"[X] Co loi hoac bo qua: {error_count} khach hang")


if __name__ == "__main__":
    EXCEL_FILE_PATH = 'LA PET CRM (test) (2).xlsx'
    
    update_cities_from_excel(EXCEL_FILE_PATH)
