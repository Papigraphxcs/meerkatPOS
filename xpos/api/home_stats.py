# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""Live summary numbers for the Desk home page's quick-stats row."""

import frappe
from frappe.utils import today


def _company_default() -> str:
	"""Resolve the user's default company, mirroring the desk report defaults."""
	return frappe.defaults.get_user_default("Company") or frappe.defaults.get_default("company") or ""


def _sum(doctype: str, fieldname: str, filters: dict) -> float:
	"""Aggregate via frappe.get_list's dict field syntax (plain 'sum(x)' strings
	are rejected as raw SQL by this version's SELECT validation)."""
	result = frappe.get_list(doctype, fields=[{"SUM": fieldname, "as": "total"}], filters=filters)
	return result[0]["total"] if result and result[0]["total"] else 0


@frappe.whitelist()
def get_home_stats():
	company = _company_default()

	sales_filters = {"docstatus": 1, "posting_date": today()}
	orders_filters = {"docstatus": 1, "status": ["not in", ["Completed", "Closed", "Cancelled"]]}
	if company:
		sales_filters["company"] = company
		orders_filters["company"] = company

	total_sales_today = _sum("Sales Invoice", "base_grand_total", sales_filters)
	open_sales_orders = frappe.db.count("Sales Order", orders_filters)
	total_stock_value = _sum("Bin", "stock_value", {})
	active_customers = frappe.db.count("Customer", {"disabled": 0})

	return {
		"total_sales_today": total_sales_today,
		"open_sales_orders": open_sales_orders,
		"total_stock_value": total_stock_value,
		"active_customers": active_customers,
	}
