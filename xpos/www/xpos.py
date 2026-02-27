import frappe
from frappe.sessions import get


def get_context(context):
	context.boot = get()
	context.csrf_token = frappe.session.data.get("csrf_token") or frappe.generate_hash()
	context.app_name = "X POS"
	context.lang = frappe.local.lang
	context.layout_direction = "rtl" if frappe.local.lang == "ar" else "ltr"
