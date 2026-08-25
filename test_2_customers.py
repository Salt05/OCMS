import xmlrpc.client
import sys

# Thông tin cấu hình Odoo
url = 'https://odooo.fonti.vn'
db = 'odoo'
username = 'sale.order01@gmai.com'
password = 'b09c7fa1deb1103abb6820be7d1d99c16129a243'

STAFF_MAPPING = {
    'Sale01': 12,    # Partner 17705
    'Sale 04': 27,   # Partner 17746
}

test_data = [
    {'customer_id': 17784, 'staff_tag': 'Sale 04'},
    {'customer_id': 17843, 'staff_tag': 'Sale01'}
]

def run_test():
    try:
        common = xmlrpc.client.ServerProxy('{}/xmlrpc/2/common'.format(url))
        uid = common.authenticate(db, username, password, {})
        if not uid:
            print("[X] Dang nhap that bai.")
            return

        print(f"[OK] Dang nhap thanh cong voi uid: {uid}")
        models = xmlrpc.client.ServerProxy('{}/xmlrpc/2/object'.format(url))

        for item in test_data:
            customer_id = item['customer_id']
            staff_tag = item['staff_tag']
            staff_odoo_id = STAFF_MAPPING.get(staff_tag)

            if staff_odoo_id:
                print(f"Dang cap nhat khach hang {customer_id} voi NV {staff_tag} (ID NV: {staff_odoo_id})...")
                result = models.execute_kw(db, uid, password, 'res.partner', 'write', 
                                           [[customer_id], {'user_id': staff_odoo_id}])
                if result:
                    print(f"-> [OK] Thanh cong!")
                    
                    # Xác minh lại bằng cách đọc data
                    partner = models.execute_kw(db, uid, password, 'res.partner', 'read', [[customer_id], ['name', 'user_id']])
                    print(f"-> Du lieu sau cap nhat: {partner}")
                else:
                    print(f"-> [!] That bai (API tra ve False).")
            else:
                print(f"Khong tim thay anh xa cho {staff_tag}")

    except Exception as e:
        print(f"[X] Loi: {e}")

if __name__ == "__main__":
    run_test()
