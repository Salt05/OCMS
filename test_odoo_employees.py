import xmlrpc.client
import json

url='https://odooo.fonti.vn'
db='odoo'
uid=xmlrpc.client.ServerProxy(url+'/xmlrpc/2/common').authenticate(db, 'sale.order01@gmai.com', 'b09c7fa1deb1103abb6820be7d1d99c16129a243', {})
models=xmlrpc.client.ServerProxy(url+'/xmlrpc/2/object')

res=models.execute_kw(db, uid, 'b09c7fa1deb1103abb6820be7d1d99c16129a243', 'hr.employee', 'search_read', [[]], {'fields': ['id', 'name', 'work_email', 'job_title'], 'limit': 2})

with open('test_out.txt', 'w', encoding='utf-8') as f:
    f.write(json.dumps(res, ensure_ascii=False))
