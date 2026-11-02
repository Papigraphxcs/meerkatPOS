"""Read-only demo smoke check; run as sudo from the deployment directory."""
import http.cookiejar
import json
from pathlib import Path
import urllib.parse
import urllib.request

password = (Path(__file__).resolve().parent / '.secrets/demo-user').read_text().strip()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(path, data=None):
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request('http://127.0.0.1:8081' + path, data=body,
                                 headers={'Host': 'demo.meerkatpos.me'})
    with opener.open(req, timeout=90) as response:
        return response.status, response.read()

status, body = request('/api/method/login', {'usr': 'demo@meerkatpos.me', 'pwd': password})
assert status == 200 and json.loads(body)['message'] == 'Logged In'
_, body = request('/api/method/xpos.api.auth.get_my_pos_profile')
profile = json.loads(body)['message']
assert profile['pos_profile'] == 'Meerkatpos Demo POS' and profile['role'] == 'Cashier'
_, body = request('/api/method/xpos.api.items.get_pos_items?' + urllib.parse.urlencode({'pos_profile': profile['pos_profile']}))
items = json.loads(body)['message']
if isinstance(items, dict):
    items = items.get('items', [])
assert len(items) == 3
assert {i['item_code'] for i in items} == {'DEMO-WATER', 'DEMO-COFFEE', 'DEMO-SUGAR'}
status, body = request('/meerkatpos')
assert status == 200 and b'<html' in body.lower()
print(json.dumps({'login': 'passed', 'role': profile['role'], 'pos_profile': profile['pos_profile'],
    'items': [{k: i.get(k) for k in ('item_code', 'rate', 'actual_qty')} for i in items], 'app_page': status}))
