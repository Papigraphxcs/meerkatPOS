"""Run as container root to read mounted secrets, then drop to the frappe user.

Only the explicitly authorized fresh demo can be created. No customer restore runs.
"""
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys

site = 'demo.meerkatpos.me'
os.chdir('/home/frappe/frappe-bench')
admin_password = Path('/run/secrets/demo_admin').read_text().strip()
db_password = Path('/run/secrets/db_root').read_text().strip()
demo_password = Path('/run/secrets/demo_user').read_text().strip()
account = pwd.getpwnam('frappe')
os.setgroups([])
os.setgid(account.pw_gid)
os.setuid(account.pw_uid)
os.environ['HOME'] = account.pw_dir

def run(*args):
    result = subprocess.run(args)
    if result.returncode:
        # Do not include command arguments: some bench arguments contain secrets.
        raise SystemExit('Demo setup command failed; no credentials have been printed by this wrapper.')

config_path = Path('sites') / site / 'site_config.json'
marker = Path('sites') / site / '.fresh-google-demo'
if config_path.exists() and not marker.exists():
    raise SystemExit('An unmanaged demo site already exists; refusing to modify it.')
if not config_path.exists():
    run('bench', 'new-site', site, '--db-root-username', 'root', '--db-root-password', db_password,
        '--admin-password', admin_password, '--mariadb-user-host-login-scope', '%')
    marker.write_text('Fresh demo authorized for Google. No Oracle data restored.\n')

config = json.loads(config_path.read_text())
config.update({'mute_emails': 1, 'pause_scheduler': 1, 'disable_telemetry': 1,
               'host_name': 'https://demo.meerkatpos.me'})
config_path.write_text(json.dumps(config, indent=2))

import frappe
os.chdir('sites')
frappe.init(site=site, sites_path='.')
frappe.connect()
installed = frappe.get_installed_apps()
frappe.destroy()
os.chdir('..')
for app in ('erpnext', 'xpos'):
    if app not in installed:
        run('bench', '--site', site, 'install-app', app)

os.environ['MEERKATPOS_DEMO_PASSWORD'] = demo_password
run('env/bin/python', '/opt/meerkatpos/demo_setup.py')
run('bench', '--site', site, 'disable-scheduler')
run('bench', '--site', site, 'clear-cache')
print('Fresh demo ready. Login: demo@meerkatpos.me. Password remains in the private demo-user secret.')
