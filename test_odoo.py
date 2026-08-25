import xmlrpc.client

url = 'https://odooo.fonti.vn'
db = 'odoo'
username = 'sale.order01@gmai.com'
password = 'b09c7fa1deb1103abb6820be7d1d99c16129a243'

common = xmlrpc.client.ServerProxy('{}/xmlrpc/2/common'.format(url))
uid = common.authenticate(db, username, password, {})

models = xmlrpc.client.ServerProxy('{}/xmlrpc/2/object'.format(url))

# Check Partner 17705
partner_ids = models.execute_kw(db, uid, password, 'res.partner', 'search', [[['id', '=', 17705]]])
if partner_ids:
    partner = models.execute_kw(db, uid, password, 'res.partner', 'read', [partner_ids, ['name', 'user_id', 'ref']])
    print('Partner 17705:', partner)
else:
    print('Partner 17705 not found')

# Search for any users to see what their IDs look like
user_ids = models.execute_kw(db, uid, password, 'res.users', 'search', [[]], {'limit': 5})
users = models.execute_kw(db, uid, password, 'res.users', 'read', [user_ids, ['name', 'login']])
print('Sample users:', users)
