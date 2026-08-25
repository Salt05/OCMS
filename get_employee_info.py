import sys
sys.stdout.reconfigure(encoding='utf-8')
import xmlrpc.client
import json

url = 'https://odooo.fonti.vn'
db = 'odoo'
username = 'sale.order01@gmai.com'
password = 'b09c7fa1deb1103abb6820be7d1d99c16129a243'

common = xmlrpc.client.ServerProxy('{}/xmlrpc/2/common'.format(url))
uid = common.authenticate(db, username, password, {})

models = xmlrpc.client.ServerProxy('{}/xmlrpc/2/object'.format(url))

try:
    # Fetch all fields for employee ID 2
    employee = models.execute_kw(db, uid, password, 'hr.employee', 'read', [[2]])
    if employee:
        print(json.dumps(employee[0], indent=2, ensure_ascii=False))
    else:
        print("Employee not found.")
except Exception as e:
    print("Error:", e)
