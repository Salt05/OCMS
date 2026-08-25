import sys
sys.stdout.reconfigure(encoding='utf-8')
import xmlrpc.client

url = 'https://odooo.fonti.vn'
db = 'odoo'
username = 'sale.order01@gmai.com'
password = 'b09c7fa1deb1103abb6820be7d1d99c16129a243'

common = xmlrpc.client.ServerProxy('{}/xmlrpc/2/common'.format(url))
uid = common.authenticate(db, username, password, {})

models = xmlrpc.client.ServerProxy('{}/xmlrpc/2/object'.format(url))

print("--- Danh sách nhân viên (hr.employee) ---")
try:
    employee_ids = models.execute_kw(db, uid, password, 'hr.employee', 'search', [[]])
    employees = models.execute_kw(db, uid, password, 'hr.employee', 'read', [employee_ids, ['name', 'job_title', 'work_email']])
    for emp in employees:
        print(f"ID: {emp.get('id')}, Name: {emp.get('name')}, Job: {emp.get('job_title')}, Email: {emp.get('work_email')}")
except Exception as e:
    print("Không thể lấy từ hr.employee:", e)

print("\n--- Danh sách người dùng (res.users) ---")
try:
    user_ids = models.execute_kw(db, uid, password, 'res.users', 'search', [[]])
    users = models.execute_kw(db, uid, password, 'res.users', 'read', [user_ids, ['name', 'login']])
    for user in users:
        print(f"ID: {user.get('id')}, Name: {user.get('name')}, Login: {user.get('login')}")
except Exception as e:
    print("Không thể lấy từ res.users:", e)
