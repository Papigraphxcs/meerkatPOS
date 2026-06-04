# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""
Install-time seeding for the xPOS role-based permission system.
"""

import frappe

POS_PERMISSIONS = (
	# Billing & Invoicing
	("close_bill", "Close Bill", "Billing & Invoicing"),
	("close_shift", "Close Shift", "Billing & Invoicing"),
	("allow_reprint_invoice", "Reprint Invoice", "Billing & Invoicing"),
	("shift_report", "Shift Report", "Billing & Invoicing"),
	("allow_cancel_invoice", "Cancel Invoice", "Billing & Invoicing"),
	("unsettled_invoices", "Unsettled Invoices", "Billing & Invoicing"),
	# Discounts & Pricing
	("apply_additional_discount", "Apply Additional Discount", "Discounts & Pricing"),
	("apply_standard_discount", "Apply Standard Discount", "Discounts & Pricing"),
	("show_edit_discount_field", "Edit Discount Field", "Discounts & Pricing"),
	("edit_tax_template", "Edit Tax Template", "Discounts & Pricing"),
	("allow_change_price", "Change Price", "Discounts & Pricing"),
	# Sales Operations
	("quotation", "Quotation", "Sales Operations"),
	("sale_return", "Sale Return", "Sales Operations"),
	# Purchasing & Stock
	("local_purchase", "Local Purchase", "Purchasing & Stock"),
	("purchase_order", "Purchase Order", "Purchasing & Stock"),
	("purchase_invoice", "Purchase Invoice", "Purchasing & Stock"),
	("stock_adjustment", "Stock Adjustment", "Purchasing & Stock"),
	("stock_entry", "Stock Entry", "Purchasing & Stock"),
	("near_expiry_items", "Near Expiry Items", "Purchasing & Stock"),
	# Cash Management
	("expense", "Expense", "Cash Management"),
	("bank_drop", "Bank Drop", "Cash Management"),
	# Lists
	("list_of_invoices", "List of Invoices", "Lists"),
	("list_of_cancelled_invoices", "List of Cancelled Invoices", "Lists"),
	("list_of_errors", "List of Errors", "Lists"),
	("list_of_purchase_invoices", "List of Purchase Invoices", "Lists"),
	("list_of_quotations", "List of Quotations", "Lists"),
	("list_of_stock_entries", "List of Stock Entries", "Lists"),
	("list_of_local_purchases", "List of Local Purchases", "Lists"),
	("list_of_stock_adjustments", "List of Stock Adjustments", "Lists"),
	("list_of_expense", "List of Expenses", "Lists"),
	("list_of_bank_drops", "List of Bank Drops", "Lists"),
	# Reports
	("invoice_settlement_report", "Invoice Settlement Report", "Reports"),
	("sales_report_by_time", "Sales Report by Time", "Reports"),
	("sales_summary_by_hour", "Sales Summary by Hour", "Reports"),
	("current_stock_by_brand", "Current Stock by Brand", "Reports"),
	("stock_register", "Stock Register", "Reports"),
	("current_stock_report", "Current Stock Report", "Reports"),
	# Administration
	("manage_role_permissions", "Manage Role Permissions", "Administration"),
)

ALL_PERMISSION_NAMES = tuple(name for name, _label, _group in POS_PERMISSIONS)

_CASHIER_ENABLED = {"close_bill", "list_of_invoices"}
_MANAGER_DISABLED = {"list_of_errors", "manage_role_permissions"}

DEFAULT_ROLES = (
	("Cashier", _CASHIER_ENABLED),
	("Manager", set(ALL_PERMISSION_NAMES) - _MANAGER_DISABLED),
	("Administrator", set(ALL_PERMISSION_NAMES)),
)


def after_install():
	seed_pos_permissions()
	seed_default_roles()


def seed_pos_permissions():
	"""Upsert the static POS Permission catalog. Idempotent."""
	for permission_name, permission_label, _group in POS_PERMISSIONS:
		if frappe.db.exists("POS Permission", permission_name):
			continue
		frappe.get_doc(
			{
				"doctype": "POS Permission",
				"permission_name": permission_name,
				"permission_label": permission_label,
			}
		).insert(ignore_permissions=True)


def seed_default_roles():
	"""Create the default POS Role records with their child permission rows.

	Skips roles that already exist so existing customisations are preserved.
	"""
	for role_name, enabled_set in DEFAULT_ROLES:
		if frappe.db.exists("POS Role", role_name):
			continue
		role = frappe.get_doc({"doctype": "POS Role", "role_name": role_name})
		for permission_name in ALL_PERMISSION_NAMES:
			role.append(
				"permissions",
				{
					"permission": permission_name,
					"enabled": 1 if permission_name in enabled_set else 0,
				},
			)
		role.insert(ignore_permissions=True)
