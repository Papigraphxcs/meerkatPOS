"""Seed a small, fictional retail demo. Safe to rerun only on our marked demo site."""
from datetime import date
import json
import os
from pathlib import Path

import frappe

SITE = 'demo.meerkatpos.me'
COMPANY = 'Meerkatpos Demo'
USER = 'demo@meerkatpos.me'
if not (Path('sites') / SITE / '.fresh-google-demo').exists():
    raise SystemExit('Fresh demo marker missing; refusing to seed this site.')
os.chdir('sites')
frappe.init(site=SITE, sites_path='.')
frappe.connect()
frappe.set_user('Administrator')
frappe.flags.mute_emails = True
frappe.conf.mute_emails = True
try:
    if frappe.db.count('Company') and not frappe.db.exists('Company', COMPANY):
        raise RuntimeError('Unexpected company found; refusing to change this database.')
    if not frappe.db.exists('Company', COMPANY):
        from erpnext.setup.setup_wizard.setup_wizard import setup_complete
        year = date.today().year
        setup_complete(frappe._dict(company_name=COMPANY, company_abbr='MKD', currency='USD',
            country='Zimbabwe', chart_of_accounts='Standard', domain='Retail',
            fy_start_date=f'{year}-01-01', fy_end_date=f'{year}-12-31'))
    assert frappe.db.exists('Company', COMPANY), 'Demo company was not created'
    settings = frappe.get_single('System Settings')
    settings.update({'country': 'Zimbabwe', 'language': 'en', 'time_zone': 'Africa/Harare',
        'currency': 'USD', 'enable_scheduler': 0, 'enable_telemetry': 0, 'setup_complete': 1,
        'enable_onboarding': 0})
    settings.save(ignore_permissions=True)
    from frappe.desk.page.setup_wizard.setup_wizard import enable_setup_wizard_complete
    for app in ('frappe', 'erpnext', 'xpos'):
        enable_setup_wizard_complete(app)
    website = frappe.get_single('Website Settings')
    website.disable_signup = 1
    website.home_page = 'meerkatpos'
    website.save(ignore_permissions=True)

    from frappe.utils.password import update_password
    if not frappe.db.exists('User', USER):
        user = frappe.get_doc({'doctype': 'User', 'email': USER, 'first_name': 'Demo',
            'last_name': 'Cashier', 'enabled': 1, 'send_welcome_email': 0, 'user_type': 'System User'})
        for role in ('Sales User', 'Accounts User', 'Stock User'):
            if frappe.db.exists('Role', role):
                user.append('roles', {'role': role})
        user.flags.no_welcome_mail = True
        user.insert(ignore_permissions=True)
    update_password(USER, os.environ['MEERKATPOS_DEMO_PASSWORD'])
    company = frappe.get_doc('Company', COMPANY)
    warehouse = frappe.db.get_value('Warehouse', {'company': COMPANY, 'warehouse_name': 'Stores', 'is_group': 0})
    if not warehouse:
        raise RuntimeError('Default demo warehouse missing')
    cash = frappe.db.get_value('Account', {'company': COMPANY, 'account_type': 'Cash', 'is_group': 0})
    cost_center = company.cost_center or frappe.db.get_value('Cost Center', {'company': COMPANY, 'is_group': 0})
    if not frappe.db.exists('Customer', 'Demo Walk-in Customer'):
        customer_group = frappe.db.get_value('Customer Group', {'is_group': 0}, 'name')
        territory = frappe.db.get_value('Territory', {'is_group': 0}, 'name')
        frappe.get_doc({'doctype': 'Customer', 'customer_name': 'Demo Walk-in Customer',
            'customer_type': 'Individual', 'customer_group': customer_group,
            'territory': territory}).insert(ignore_permissions=True)
    cash_mode = frappe.get_doc('Mode of Payment', 'Cash')
    if not any(row.company == COMPANY for row in cash_mode.accounts):
        cash_mode.append('accounts', {'company': COMPANY, 'default_account': cash})
        cash_mode.save(ignore_permissions=True)

    products = [('DEMO-WATER', 'Demo Bottled Water', 1.00),
                ('DEMO-COFFEE', 'Demo Coffee', 3.00), ('DEMO-SUGAR', 'Demo Sugar', 2.50)]
    for code, label, rate in products:
        if not frappe.db.exists('Item', code):
            item = frappe.get_doc({'doctype': 'Item', 'item_code': code, 'item_name': label,
                'item_group': 'Products', 'stock_uom': 'Nos', 'is_stock_item': 1,
                'description': 'Fictional sample item for demonstration only.',
                'item_defaults': [{'company': COMPANY, 'default_warehouse': warehouse}]})
            item.insert(ignore_permissions=True)
        if not frappe.db.exists('Item Price', {'item_code': code, 'price_list': 'Standard Selling'}):
            frappe.get_doc({'doctype': 'Item Price', 'item_code': code, 'price_list': 'Standard Selling',
                'currency': 'USD', 'price_list_rate': rate}).insert(ignore_permissions=True)
    profile_name = 'Meerkatpos Demo POS'
    if not frappe.db.exists('POS Profile', profile_name):
        profile = frappe.get_doc({'doctype': 'POS Profile', 'name': profile_name, 'company': COMPANY,
            'currency': 'USD', 'warehouse': warehouse, 'selling_price_list': 'Standard Selling',
            'customer': 'Demo Walk-in Customer', 'write_off_account': company.write_off_account,
            'write_off_cost_center': cost_center, 'cost_center': cost_center,
            'income_account': company.default_income_account, 'expense_account': company.default_expense_account,
            'payments': [{'mode_of_payment': 'Cash', 'default': 1}],
            'applicable_for_users': [{'user': USER, 'default': 1, 'pos_role': 'Cashier', 'is_cashier': 1},
                                     {'user': 'Administrator', 'pos_role': 'Manager'}]})
        profile.insert(ignore_permissions=True)
    if not frappe.db.exists('Stock Entry', {'remarks': 'Initial fictional Meerkatpos demo stock'}):
        receipt = frappe.get_doc({'doctype': 'Stock Entry', 'stock_entry_type': 'Material Receipt',
            'company': COMPANY, 'remarks': 'Initial fictional Meerkatpos demo stock',
            'items': [{'item_code': code, 'qty': 25, 't_warehouse': warehouse,
                       'basic_rate': rate / 2, 'cost_center': cost_center} for code, _, rate in products]})
        receipt.insert(ignore_permissions=True)
        receipt.submit()
    frappe.db.commit()
    print(json.dumps({'site': SITE, 'company': COMPANY, 'profile': profile_name,
        'demo_user': USER, 'sample_items': len(products), 'outbound_email': 'muted'}))
finally:
    frappe.destroy()
