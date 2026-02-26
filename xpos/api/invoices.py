# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.utils import flt, nowdate, now_datetime, getdate, cint


@frappe.whitelist()
def create_invoice(data):
	"""Create a POS Sales Invoice from cart data."""
	data = json.loads(data) if isinstance(data, str) else data

	pos_profile = data.get("pos_profile")
	customer = data.get("customer")
	items = data.get("items", [])
	payments = data.get("payments", [])
	pos_opening_shift = data.get("pos_opening_shift")
	is_return = data.get("is_return", 0)
	return_against = data.get("return_against")
	additional_discount_percentage = flt(data.get("additional_discount_percentage", 0))
	discount_amount = flt(data.get("discount_amount", 0))

	if not pos_profile:
		frappe.throw(_("POS Profile is required"))
	if not customer:
		frappe.throw(_("Customer is required"))
	if not items:
		frappe.throw(_("At least one item is required"))

	pos = frappe.get_cached_doc("POS Profile", pos_profile)

	invoice_doc = frappe.new_doc("Sales Invoice")
	invoice_doc.is_pos = 1
	invoice_doc.pos_profile = pos_profile
	invoice_doc.customer = customer
	invoice_doc.company = pos.company
	invoice_doc.debit_to = pos.debit_to or frappe.db.get_value(
		"Company", pos.company, "default_receivable_account"
	)
	invoice_doc.posting_date = nowdate()
	invoice_doc.posting_time = now_datetime().strftime("%H:%M:%S")
	invoice_doc.set_warehouse = pos.warehouse
	invoice_doc.update_stock = cint(pos.update_stock) or 1
	invoice_doc.currency = pos.currency or frappe.db.get_value("Company", pos.company, "default_currency")
	invoice_doc.selling_price_list = pos.selling_price_list

	if is_return:
		invoice_doc.is_return = 1
		if return_against:
			invoice_doc.return_against = return_against

	if additional_discount_percentage:
		invoice_doc.additional_discount_percentage = additional_discount_percentage
		invoice_doc.apply_discount_on = "Grand Total"
	elif discount_amount:
		invoice_doc.discount_amount = discount_amount
		invoice_doc.apply_discount_on = "Grand Total"

	# Add items
	for item_data in items:
		item = invoice_doc.append("items", {})
		item.item_code = item_data.get("item_code")
		item.item_name = item_data.get("item_name")
		item.qty = flt(item_data.get("qty", 1))
		item.rate = flt(item_data.get("rate", 0))
		item.uom = item_data.get("uom") or item_data.get("stock_uom")
		item.warehouse = pos.warehouse
		if item_data.get("discount_percentage"):
			item.discount_percentage = flt(item_data.get("discount_percentage"))
		if item_data.get("discount_amount"):
			item.discount_amount = flt(item_data.get("discount_amount"))
		if item_data.get("serial_no"):
			item.serial_no = item_data.get("serial_no")
		if item_data.get("batch_no"):
			item.batch_no = item_data.get("batch_no")

	# Apply taxes from POS profile
	if pos.taxes_and_charges:
		invoice_doc.taxes_and_charges = pos.taxes_and_charges
		tax_template = frappe.get_doc("Sales Taxes and Charges Template", pos.taxes_and_charges)
		for tax in tax_template.taxes:
			invoice_doc.append("taxes", {
				"charge_type": tax.charge_type,
				"account_head": tax.account_head,
				"description": tax.description,
				"rate": tax.rate,
				"cost_center": tax.cost_center,
				"included_in_print_rate": tax.included_in_print_rate,
			})

	# Add payments
	for payment in payments:
		if flt(payment.get("amount", 0)) > 0:
			invoice_doc.append("payments", {
				"mode_of_payment": payment.get("mode_of_payment"),
				"amount": flt(payment.get("amount")),
			})

	# Add POS Opening Shift reference if field exists
	if pos_opening_shift:
		try:
			invoice_doc.posa_pos_opening_shift = pos_opening_shift
		except Exception:
			pass

	invoice_doc.insert(ignore_permissions=True)
	invoice_doc.submit()

	return {
		"name": invoice_doc.name,
		"grand_total": invoice_doc.grand_total,
		"net_total": invoice_doc.net_total,
		"total_taxes_and_charges": invoice_doc.total_taxes_and_charges,
		"paid_amount": invoice_doc.paid_amount,
		"change_amount": invoice_doc.change_amount,
		"customer": invoice_doc.customer,
		"customer_name": invoice_doc.customer_name,
		"posting_date": str(invoice_doc.posting_date),
		"items": [
			{
				"item_code": i.item_code,
				"item_name": i.item_name,
				"qty": i.qty,
				"rate": i.rate,
				"amount": i.amount,
			}
			for i in invoice_doc.items
		],
	}


@frappe.whitelist()
def save_draft_invoice(data):
	"""Save invoice as draft without submitting."""
	data = json.loads(data) if isinstance(data, str) else data

	pos_profile = data.get("pos_profile")
	customer = data.get("customer")
	items = data.get("items", [])
	pos_opening_shift = data.get("pos_opening_shift")

	if not pos_profile or not customer or not items:
		frappe.throw(_("POS Profile, Customer, and Items are required"))

	pos = frappe.get_cached_doc("POS Profile", pos_profile)

	invoice_doc = frappe.new_doc("Sales Invoice")
	invoice_doc.is_pos = 1
	invoice_doc.pos_profile = pos_profile
	invoice_doc.customer = customer
	invoice_doc.company = pos.company
	invoice_doc.debit_to = pos.debit_to or frappe.db.get_value(
		"Company", pos.company, "default_receivable_account"
	)
	invoice_doc.posting_date = nowdate()
	invoice_doc.set_warehouse = pos.warehouse
	invoice_doc.update_stock = cint(pos.update_stock) or 1
	invoice_doc.currency = pos.currency or frappe.db.get_value("Company", pos.company, "default_currency")
	invoice_doc.selling_price_list = pos.selling_price_list

	for item_data in items:
		item = invoice_doc.append("items", {})
		item.item_code = item_data.get("item_code")
		item.item_name = item_data.get("item_name")
		item.qty = flt(item_data.get("qty", 1))
		item.rate = flt(item_data.get("rate", 0))
		item.uom = item_data.get("uom") or item_data.get("stock_uom")
		item.warehouse = pos.warehouse

	if pos.taxes_and_charges:
		invoice_doc.taxes_and_charges = pos.taxes_and_charges

	if pos_opening_shift:
		try:
			invoice_doc.posa_pos_opening_shift = pos_opening_shift
		except Exception:
			pass

	invoice_doc.insert(ignore_permissions=True)

	return {
		"name": invoice_doc.name,
		"grand_total": invoice_doc.grand_total,
		"customer": invoice_doc.customer,
		"customer_name": invoice_doc.customer_name,
	}


@frappe.whitelist()
def get_draft_invoices(pos_opening_shift):
	"""Get draft invoices for the current shift."""
	filters = {"docstatus": 0, "is_pos": 1}

	if pos_opening_shift:
		# Try filtering by opening shift if the field exists
		try:
			filters["posa_pos_opening_shift"] = pos_opening_shift
		except Exception:
			filters["owner"] = frappe.session.user

	invoices = frappe.get_list(
		"Sales Invoice",
		filters=filters,
		fields=[
			"name", "customer", "customer_name", "posting_date",
			"grand_total", "currency", "modified",
		],
		limit_page_length=50,
		order_by="modified desc",
	)

	return invoices


@frappe.whitelist()
def get_past_orders(pos_profile="", from_date="", to_date="", search_term="", page=0, limit=20):
	"""Get past submitted invoices."""
	conditions = "si.docstatus = 1 AND si.is_pos = 1"
	values = {"page": cint(page) * cint(limit), "limit": cint(limit)}

	if pos_profile:
		conditions += " AND si.pos_profile = %(pos_profile)s"
		values["pos_profile"] = pos_profile

	if from_date:
		conditions += " AND si.posting_date >= %(from_date)s"
		values["from_date"] = getdate(from_date)

	if to_date:
		conditions += " AND si.posting_date <= %(to_date)s"
		values["to_date"] = getdate(to_date)

	if search_term:
		search_term = search_term.strip()
		conditions += """ AND (
			si.name LIKE %(search)s
			OR si.customer_name LIKE %(search)s
			OR si.customer LIKE %(search)s
		)"""
		values["search"] = f"%{search_term}%"

	orders = frappe.db.sql(
		"""
		SELECT
			si.name,
			si.customer,
			si.customer_name,
			si.posting_date,
			si.posting_time,
			si.grand_total,
			si.net_total,
			si.total_taxes_and_charges,
			si.paid_amount,
			si.currency,
			si.status,
			si.is_return
		FROM `tabSales Invoice` si
		WHERE {conditions}
		ORDER BY si.posting_date DESC, si.posting_time DESC
		LIMIT %(page)s, %(limit)s
		""".format(conditions=conditions),
		values,
		as_dict=True,
	)

	return orders


@frappe.whitelist()
def get_invoice_details(invoice_name):
	"""Get full invoice details including items and payments."""
	doc = frappe.get_doc("Sales Invoice", invoice_name)

	return {
		"name": doc.name,
		"customer": doc.customer,
		"customer_name": doc.customer_name,
		"posting_date": str(doc.posting_date),
		"posting_time": str(doc.posting_time),
		"grand_total": doc.grand_total,
		"net_total": doc.net_total,
		"total_taxes_and_charges": doc.total_taxes_and_charges,
		"paid_amount": doc.paid_amount,
		"change_amount": doc.change_amount,
		"currency": doc.currency,
		"status": doc.status,
		"is_return": doc.is_return,
		"items": [
			{
				"item_code": i.item_code,
				"item_name": i.item_name,
				"qty": i.qty,
				"rate": i.rate,
				"amount": i.amount,
				"uom": i.uom,
				"discount_percentage": i.discount_percentage,
				"discount_amount": i.discount_amount,
			}
			for i in doc.items
		],
		"payments": [
			{
				"mode_of_payment": p.mode_of_payment,
				"amount": p.amount,
			}
			for p in doc.payments
		],
		"taxes": [
			{
				"description": t.description,
				"rate": t.rate,
				"tax_amount": t.tax_amount,
			}
			for t in doc.taxes
		],
	}


@frappe.whitelist()
def delete_draft_invoice(invoice_name):
	"""Delete a draft invoice."""
	doc = frappe.get_doc("Sales Invoice", invoice_name)
	if doc.docstatus != 0:
		frappe.throw(_("Only draft invoices can be deleted"))
	doc.delete(ignore_permissions=True)
	return {"success": True}
