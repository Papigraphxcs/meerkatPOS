# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.utils import flt, nowdate, now_datetime, getdate, cint
from frappe.utils.background_jobs import enqueue


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
	submit_in_background = cint(data.get("submit_in_background", 0))

	if not pos_profile:
		frappe.throw(_("POS Profile is required"))
	if not customer:
		frappe.throw(_("Customer is required"))
	if not items:
		frappe.throw(_("At least one item is required"))

	pos = frappe.get_cached_doc("POS Profile", pos_profile)

	# Determine doctype: POS Invoice or Sales Invoice
	use_pos_invoice = cint(pos.get("create_pos_invoice_instead_of_sales_invoice"))
	doctype = "POS Invoice" if use_pos_invoice else "Sales Invoice"

	# Get debit_to account: try POS Profile field first, then Company default
	debit_to = None
	if hasattr(pos, "debit_to") and pos.get("debit_to"):
		debit_to = pos.debit_to
	if not debit_to:
		debit_to = frappe.db.get_value("Company", pos.company, "default_receivable_account")

	invoice_doc = frappe.new_doc(doctype)
	invoice_doc.is_pos = 1
	invoice_doc.pos_profile = pos_profile
	invoice_doc.customer = customer
	invoice_doc.company = pos.company
	invoice_doc.debit_to = debit_to
	invoice_doc.posting_date = nowdate()
	invoice_doc.posting_time = now_datetime().strftime("%H:%M:%S")
	invoice_doc.set_warehouse = pos.warehouse
	invoice_doc.update_stock = cint(pos.get("update_stock")) or 1
	invoice_doc.currency = data.get("currency") or pos.currency or frappe.db.get_value(
		"Company", pos.company, "default_currency"
	)
	invoice_doc.selling_price_list = data.get("selling_price_list") or pos.get("selling_price_list")

	# Multi-currency support
	if data.get("conversion_rate"):
		invoice_doc.conversion_rate = flt(data["conversion_rate"])
	if data.get("price_list_currency"):
		invoice_doc.price_list_currency = data["price_list_currency"]
	if data.get("plc_conversion_rate"):
		invoice_doc.plc_conversion_rate = flt(data["plc_conversion_rate"])

	if is_return:
		invoice_doc.is_return = 1
		if return_against:
			invoice_doc.return_against = return_against

	if additional_discount_percentage:
		invoice_doc.additional_discount_percentage = additional_discount_percentage
		invoice_doc.apply_discount_on = data.get("apply_discount_on") or "Grand Total"
	elif discount_amount:
		invoice_doc.discount_amount = discount_amount
		invoice_doc.apply_discount_on = data.get("apply_discount_on") or "Grand Total"

	# Additional notes & authorization code (POS Awesome features)
	if data.get("posa_notes"):
		try:
			invoice_doc.posa_notes = data["posa_notes"]
		except Exception:
			pass
	if data.get("posa_authorization_code"):
		try:
			invoice_doc.posa_authorization_code = data["posa_authorization_code"]
		except Exception:
			pass

	# Delivery date
	if data.get("posa_delivery_date"):
		try:
			invoice_doc.posa_delivery_date = data["posa_delivery_date"]
		except Exception:
			pass

	# Sales person
	if data.get("sales_person"):
		try:
			invoice_doc.append("sales_team", {
				"sales_person": data["sales_person"],
				"allocated_percentage": 100,
			})
		except Exception:
			pass

	# Loyalty points redemption
	if data.get("redeem_loyalty_points") and data.get("loyalty_points"):
		invoice_doc.redeem_loyalty_points = 1
		invoice_doc.loyalty_points = cint(data["loyalty_points"])
		if data.get("loyalty_amount"):
			invoice_doc.loyalty_amount = flt(data["loyalty_amount"])

	# Write-off settings
	if data.get("write_off_amount"):
		invoice_doc.write_off_amount = flt(data["write_off_amount"])
		invoice_doc.write_off_account = data.get("write_off_account") or pos.get("write_off_account")
		invoice_doc.write_off_cost_center = data.get("write_off_cost_center") or pos.get("write_off_cost_center")

	# Validate and add items
	for item_data in items:
		item_rate = flt(item_data.get("rate", 0), 2)
		item_qty = flt(item_data.get("qty", 1), 3)

		if not is_return and item_qty <= 0:
			frappe.throw(_("Item {0}: Quantity must be greater than zero").format(
				item_data.get("item_code") or item_data.get("item_name")
			))

		if not is_return and item_rate < 0:
			frappe.throw(_("Item {0}: Rate cannot be negative").format(
				item_data.get("item_code") or item_data.get("item_name")
			))

		# Validate rate against price list if not allowed to edit
		if not cint(pos.get("posa_allow_user_to_edit_rate")):
			price_list = pos.get("selling_price_list")
			if price_list:
				price_list_rate = frappe.db.get_value(
					"Item Price",
					{"item_code": item_data.get("item_code"), "price_list": price_list, "selling": 1},
					"price_list_rate"
				)
				if price_list_rate is not None and flt(price_list_rate, 2) != item_rate:
					# Use the price list rate instead of overriding
					item_rate = flt(price_list_rate, 2)

		item = invoice_doc.append("items", {})
		item.item_code = item_data.get("item_code")
		item.item_name = item_data.get("item_name")
		item.qty = item_qty
		item.rate = item_rate
		item.uom = item_data.get("uom") or item_data.get("stock_uom")
		item.warehouse = item_data.get("warehouse") or pos.warehouse

		disc_pct = flt(item_data.get("discount_percentage", 0), 2)
		disc_amt = flt(item_data.get("discount_amount", 0), 2)

		# Validate max discount allowed
		max_discount = flt(pos.get("posa_max_discount_allowed", 0))
		if max_discount > 0 and disc_pct > max_discount:
			frappe.throw(_("Item {0}: Discount {1}% exceeds maximum allowed {2}%").format(
				item_data.get("item_code"), disc_pct, max_discount
			))

		if disc_pct:
			item.discount_percentage = disc_pct
		if disc_amt:
			item.discount_amount = disc_amt
		if item_data.get("serial_no"):
			item.serial_no = item_data.get("serial_no")
		if item_data.get("batch_no"):
			item.batch_no = item_data.get("batch_no")

		# POS Awesome item-level fields
		if item_data.get("posa_notes"):
			try:
				item.posa_notes = item_data["posa_notes"]
			except Exception:
				pass
		if item_data.get("posa_delivery_date"):
			try:
				item.posa_delivery_date = item_data["posa_delivery_date"]
			except Exception:
				pass

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

	# Validate and add payments
	total_payment = 0
	for payment in payments:
		pay_amount = flt(payment.get("amount", 0), 2)
		if pay_amount != 0:  # Allow negative for returns
			invoice_doc.append("payments", {
				"mode_of_payment": payment.get("mode_of_payment"),
				"amount": pay_amount,
				"account": payment.get("account"),
				"type": payment.get("type"),
			})
			total_payment += pay_amount

	if not is_return and total_payment <= 0 and not cint(pos.get("posa_allow_credit_sale")):
		frappe.throw(_("Payment amount must be greater than zero"))

	# Add POS Opening Shift reference if field exists
	if pos_opening_shift:
		try:
			invoice_doc.posa_pos_opening_shift = pos_opening_shift
		except Exception:
			pass

	# Return validity date
	try:
		enforce_return_validity = cint(pos.get("posa_enable_return_validity"))
		if enforce_return_validity and not is_return:
			return_days = cint(pos.get("posa_return_validity_days")) or 0
			if return_days > 0:
				from datetime import timedelta
				invoice_doc.posa_return_valid_upto = getdate(nowdate()) + timedelta(days=return_days)
	except Exception:
		pass

	invoice_doc.insert(ignore_permissions=True)

	# Background or immediate submission
	if submit_in_background:
		enqueue(
			_submit_invoice_job,
			queue="short",
			timeout=300,
			invoice_name=invoice_doc.name,
			doctype=doctype,
		)
		return {
			"name": invoice_doc.name,
			"status": "Queued",
			"grand_total": invoice_doc.grand_total,
			"customer": invoice_doc.customer,
			"customer_name": invoice_doc.customer_name,
		}

	invoice_doc.submit()

	return _build_invoice_response(invoice_doc)


def _submit_invoice_job(invoice_name, doctype="Sales Invoice"):
	"""Background job to submit an invoice."""
	try:
		doc = frappe.get_doc(doctype, invoice_name)
		doc.submit()
		frappe.db.commit()
	except Exception:
		frappe.log_error(f"Failed to submit {doctype} {invoice_name}", "X POS Invoice Submission")
		frappe.db.rollback()


@frappe.whitelist()
def update_draft_invoice(data):
	"""Update an existing draft invoice. Like POS Awesome's update_invoice."""
	data = json.loads(data) if isinstance(data, str) else data

	invoice_name = data.get("name")
	if not invoice_name:
		frappe.throw(_("Invoice name is required for update"))

	doctype = data.get("doctype", "Sales Invoice")
	doc = frappe.get_doc(doctype, invoice_name)

	if doc.docstatus != 0:
		frappe.throw(_("Only draft invoices can be updated"))

	# Update customer
	if data.get("customer"):
		doc.customer = data["customer"]

	# Update currency
	if data.get("currency"):
		doc.currency = data["currency"]
	if data.get("conversion_rate"):
		doc.conversion_rate = flt(data["conversion_rate"])

	# Update discounts
	if "additional_discount_percentage" in data:
		doc.additional_discount_percentage = flt(data["additional_discount_percentage"])
		doc.apply_discount_on = data.get("apply_discount_on") or "Grand Total"
	if "discount_amount" in data:
		doc.discount_amount = flt(data["discount_amount"])
		doc.apply_discount_on = data.get("apply_discount_on") or "Grand Total"

	# Replace items
	if data.get("items"):
		doc.set("items", [])
		pos = frappe.get_cached_doc("POS Profile", doc.pos_profile)
		for item_data in data["items"]:
			item = doc.append("items", {})
			item.item_code = item_data.get("item_code")
			item.item_name = item_data.get("item_name")
			item.qty = flt(item_data.get("qty", 1))
			item.rate = flt(item_data.get("rate", 0))
			item.uom = item_data.get("uom") or item_data.get("stock_uom")
			item.warehouse = item_data.get("warehouse") or pos.warehouse
			if item_data.get("discount_percentage"):
				item.discount_percentage = flt(item_data["discount_percentage"])
			if item_data.get("discount_amount"):
				item.discount_amount = flt(item_data["discount_amount"])
			if item_data.get("serial_no"):
				item.serial_no = item_data["serial_no"]
			if item_data.get("batch_no"):
				item.batch_no = item_data["batch_no"]

	# Replace payments
	if data.get("payments"):
		doc.set("payments", [])
		for payment in data["payments"]:
			pay_amount = flt(payment.get("amount", 0))
			if pay_amount != 0:
				doc.append("payments", {
					"mode_of_payment": payment.get("mode_of_payment"),
					"amount": pay_amount,
				})

	doc.save(ignore_permissions=True)

	return {
		"name": doc.name,
		"grand_total": doc.grand_total,
		"net_total": doc.net_total,
		"customer": doc.customer,
		"customer_name": doc.customer_name,
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

	# Determine doctype
	use_pos_invoice = cint(pos.get("create_pos_invoice_instead_of_sales_invoice"))
	doctype = "POS Invoice" if use_pos_invoice else "Sales Invoice"

	# Get debit_to account safely
	debit_to = None
	if hasattr(pos, "debit_to") and pos.get("debit_to"):
		debit_to = pos.debit_to
	if not debit_to:
		debit_to = frappe.db.get_value("Company", pos.company, "default_receivable_account")

	invoice_doc = frappe.new_doc(doctype)
	invoice_doc.is_pos = 1
	invoice_doc.pos_profile = pos_profile
	invoice_doc.customer = customer
	invoice_doc.company = pos.company
	invoice_doc.debit_to = debit_to
	invoice_doc.posting_date = nowdate()
	invoice_doc.set_warehouse = pos.warehouse
	invoice_doc.update_stock = cint(pos.get("update_stock")) or 1
	invoice_doc.currency = pos.currency or frappe.db.get_value("Company", pos.company, "default_currency")
	invoice_doc.selling_price_list = pos.get("selling_price_list")

	for item_data in items:
		item = invoice_doc.append("items", {})
		item.item_code = item_data.get("item_code")
		item.item_name = item_data.get("item_name")
		item.qty = flt(item_data.get("qty", 1))
		item.rate = flt(item_data.get("rate", 0))
		item.uom = item_data.get("uom") or item_data.get("stock_uom")
		item.warehouse = item_data.get("warehouse") or pos.warehouse
		if item_data.get("serial_no"):
			item.serial_no = item_data["serial_no"]
		if item_data.get("batch_no"):
			item.batch_no = item_data["batch_no"]

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
def get_draft_invoices(pos_opening_shift, doctype="Sales Invoice"):
	"""Get draft invoices for the current shift."""
	filters = {"docstatus": 0, "is_pos": 1}

	if pos_opening_shift:
		# Try filtering by opening shift if the field exists
		try:
			filters["posa_pos_opening_shift"] = pos_opening_shift
		except Exception:
			filters["owner"] = frappe.session.user

	invoices = frappe.get_list(
		doctype,
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
			si.is_return,
			si.return_against
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
def get_invoice_details(invoice_name, doctype="Sales Invoice"):
	"""Get full invoice details including items and payments."""
	doc = frappe.get_doc(doctype, invoice_name)

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
		"outstanding_amount": getattr(doc, "outstanding_amount", 0),
		"currency": doc.currency,
		"status": doc.status,
		"is_return": doc.is_return,
		"return_against": getattr(doc, "return_against", None),
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
				"serial_no": getattr(i, "serial_no", None),
				"batch_no": getattr(i, "batch_no", None),
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
def delete_draft_invoice(invoice_name, doctype="Sales Invoice"):
	"""Delete a draft invoice."""
	doc = frappe.get_doc(doctype, invoice_name)
	if doc.docstatus != 0:
		frappe.throw(_("Only draft invoices can be deleted"))
	doc.delete(ignore_permissions=True)
	return {"success": True}


# ─── Return Invoice Features (POS Awesome parity) ──────────────


@frappe.whitelist()
def search_invoices_for_return(
	company,
	invoice_name="",
	customer_name="",
	customer_id="",
	mobile_no="",
	from_date="",
	to_date="",
	min_amount=None,
	max_amount=None,
	page=1,
	pos_profile="",
	doctype="Sales Invoice",
):
	"""Search for invoices that can be returned.

	Supports multi-field customer search, date/amount filtering, and pagination.
	Same as POS Awesome's search_invoices_for_return.
	"""
	page = max(cint(page), 1)
	page_length = 50
	start = (page - 1) * page_length

	filters = {
		"company": company,
		"docstatus": 1,
		"is_return": 0,
	}

	if invoice_name:
		filters["name"] = ["like", f"%{invoice_name}%"]

	# Date filters
	if from_date and to_date:
		filters["posting_date"] = ["between", [from_date, to_date]]
	elif from_date:
		filters["posting_date"] = [">=", from_date]
	elif to_date:
		filters["posting_date"] = ["<=", to_date]

	# Amount filters
	if min_amount and max_amount:
		filters["grand_total"] = ["between", [flt(min_amount), flt(max_amount)]]
	elif min_amount:
		filters["grand_total"] = [">=", flt(min_amount)]
	elif max_amount:
		filters["grand_total"] = ["<=", flt(max_amount)]

	# Customer search
	if any([customer_name, customer_id, mobile_no]):
		customer_conditions = []
		customer_params = {}
		if customer_name:
			customer_conditions.append("customer_name LIKE %(cname)s")
			customer_params["cname"] = f"%{customer_name}%"
		if customer_id:
			customer_conditions.append("name LIKE %(cid)s")
			customer_params["cid"] = f"%{customer_id}%"
		if mobile_no:
			customer_conditions.append("mobile_no LIKE %(mob)s")
			customer_params["mob"] = f"%{mobile_no}%"

		where = " OR ".join(customer_conditions)
		customers = frappe.db.sql(
			f"SELECT name FROM `tabCustomer` WHERE {where} LIMIT 100",
			customer_params,
			as_dict=True,
		)
		customer_ids = [c.name for c in customers]
		if customer_ids:
			filters["customer"] = ["in", customer_ids]
		else:
			return {"invoices": [], "has_more": False, "total_count": 0}

	invoices = frappe.get_list(
		doctype,
		filters=filters,
		fields=[
			"name", "company", "customer", "customer_name",
			"posting_date", "posting_time", "grand_total", "currency",
			"discount_amount", "additional_discount_percentage",
			"is_return",
		],
		limit_start=start,
		limit_page_length=page_length + 1,
		order_by="posting_date desc, name desc",
	)

	has_more = len(invoices) > page_length
	if has_more:
		invoices = invoices[:page_length]

	# Check return validity
	if pos_profile:
		pos = frappe.get_cached_doc("POS Profile", pos_profile)
		enforce_return_validity = cint(pos.get("posa_enable_return_validity"))
		if enforce_return_validity:
			for inv in invoices:
				validity_date = inv.get("posa_return_valid_upto")
				inv["posa_return_expired"] = 1 if (
					validity_date and getdate(nowdate()) > getdate(validity_date)
				) else 0

	total_count = start + len(invoices) + (1 if has_more else 0)

	return {"invoices": invoices, "has_more": has_more, "total_count": total_count}


@frappe.whitelist()
def get_invoice_for_return(invoice_name, pos_profile="", doctype="Sales Invoice"):
	"""Fetch a single invoice with remaining returnable item quantities.

	Accounts for past returns to show only what can still be returned.
	Same as POS Awesome's get_invoice_for_return.
	"""
	doc = frappe.get_doc(doctype, invoice_name)

	# Find existing returns against this invoice
	return_invoices = frappe.get_all(
		doctype,
		filters={
			"return_against": invoice_name,
			"docstatus": 1,
			"is_return": 1,
		},
		pluck="name",
	)

	# Build map of already returned quantities per item
	returned_qty_map = {}
	for ret_name in return_invoices:
		ret_doc = frappe.get_doc(doctype, ret_name)
		for item in ret_doc.items:
			key = (item.item_code, getattr(item, "batch_no", None) or "")
			returned_qty_map[key] = returned_qty_map.get(key, 0) + abs(item.qty)

	items = []
	is_fully_returned = True
	for item in doc.items:
		key = (item.item_code, getattr(item, "batch_no", None) or "")
		already_returned = returned_qty_map.get(key, 0)
		remaining_qty = flt(item.qty) - already_returned

		if remaining_qty > 0:
			is_fully_returned = False

		items.append({
			"item_code": item.item_code,
			"item_name": item.item_name,
			"qty": item.qty,
			"rate": item.rate,
			"amount": item.amount,
			"uom": item.uom,
			"serial_no": getattr(item, "serial_no", None),
			"batch_no": getattr(item, "batch_no", None),
			"already_returned_qty": already_returned,
			"remaining_returnable_qty": max(remaining_qty, 0),
		})

	# Check return validity
	return_expired = False
	if pos_profile:
		pos = frappe.get_cached_doc("POS Profile", pos_profile)
		if cint(pos.get("posa_enable_return_validity")):
			validity_date = getattr(doc, "posa_return_valid_upto", None)
			if validity_date and getdate(nowdate()) > getdate(validity_date):
				return_expired = True

	return {
		"name": doc.name,
		"customer": doc.customer,
		"customer_name": doc.customer_name,
		"posting_date": str(doc.posting_date),
		"grand_total": doc.grand_total,
		"currency": doc.currency,
		"items": items,
		"is_fully_returned": is_fully_returned,
		"posa_return_expired": return_expired,
		"payments": [
			{"mode_of_payment": p.mode_of_payment, "amount": p.amount}
			for p in doc.payments
		],
	}


@frappe.whitelist()
def validate_return_items(original_invoice_name, return_items, doctype="Sales Invoice"):
	"""Validate return items don't exceed original sold quantities.

	Same as POS Awesome's validate_return_items.
	"""
	if isinstance(return_items, str):
		return_items = json.loads(return_items)

	doc = frappe.get_doc(doctype, original_invoice_name)

	# Get already returned quantities
	return_invoices = frappe.get_all(
		doctype,
		filters={"return_against": original_invoice_name, "docstatus": 1, "is_return": 1},
		pluck="name",
	)

	returned_qty_map = {}
	for ret_name in return_invoices:
		ret_doc = frappe.get_doc(doctype, ret_name)
		for item in ret_doc.items:
			key = item.item_code
			returned_qty_map[key] = returned_qty_map.get(key, 0) + abs(item.qty)

	errors = []
	for ret_item in return_items:
		item_code = ret_item.get("item_code")
		return_qty = abs(flt(ret_item.get("qty", 0)))

		# Find original item qty
		original_qty = 0
		for item in doc.items:
			if item.item_code == item_code:
				original_qty += item.qty

		already_returned = returned_qty_map.get(item_code, 0)
		max_returnable = original_qty - already_returned

		if return_qty > max_returnable:
			errors.append(
				_("Item {0}: Cannot return {1}, maximum returnable is {2}").format(
					item_code, return_qty, max_returnable
				)
			)

	return {
		"valid": len(errors) == 0,
		"errors": errors,
	}


@frappe.whitelist()
def validate_cart_items(items, pos_profile):
	"""Pre-submission stock validation for cart items.

	Same as POS Awesome's validate_cart_items.
	"""
	if isinstance(items, str):
		items = json.loads(items)

	pos = frappe.get_cached_doc("POS Profile", pos_profile)
	warehouse = pos.warehouse

	errors = []
	for item_data in items:
		item_code = item_data.get("item_code")
		qty = flt(item_data.get("qty", 0))

		if not item_code:
			continue

		is_stock = frappe.db.get_value("Item", item_code, "is_stock_item")
		if not is_stock:
			continue

		actual_qty = 0
		item_warehouse = item_data.get("warehouse") or warehouse
		batch_no = item_data.get("batch_no")

		if batch_no:
			from erpnext.stock.doctype.batch.batch import get_batch_qty
			actual_qty = flt(get_batch_qty(batch_no, item_warehouse))
		else:
			from xpos.api.items import get_stock_qty
			actual_qty = get_stock_qty(item_code, item_warehouse)

		if qty > actual_qty:
			errors.append({
				"item_code": item_code,
				"item_name": item_data.get("item_name", item_code),
				"required_qty": qty,
				"available_qty": actual_qty,
				"warehouse": item_warehouse,
				"batch_no": batch_no,
			})

	return errors


@frappe.whitelist()
def fetch_exchange_rate(from_currency, to_currency):
	"""Returns exchange rate between two currencies.

	Same as POS Awesome's fetch_exchange_rate_pair.
	"""
	from erpnext.setup.utils import get_exchange_rate

	rate = get_exchange_rate(from_currency, to_currency, nowdate())
	return {
		"exchange_rate": flt(rate),
		"date": nowdate(),
	}


@frappe.whitelist()
def get_last_invoice_rates(customer, item_codes, company):
	"""Get the most recent invoice rates for items by customer.

	Same as POS Awesome's get_last_invoice_rates.
	"""
	if isinstance(item_codes, str):
		item_codes = json.loads(item_codes)

	if not item_codes:
		return []

	placeholders = ", ".join(["%s"] * len(item_codes))
	results = frappe.db.sql(
		f"""
		SELECT
			sii.item_code,
			sii.rate,
			si.currency,
			sii.uom,
			si.posting_date
		FROM `tabSales Invoice Item` sii
		INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
		WHERE si.customer = %s
			AND si.company = %s
			AND si.docstatus = 1
			AND si.is_return = 0
			AND sii.item_code IN ({placeholders})
		ORDER BY si.posting_date DESC, si.creation DESC
		""",
		[customer, company] + item_codes,
		as_dict=True,
	)

	# Keep only the most recent rate per item
	seen = set()
	latest = []
	for r in results:
		if r.item_code not in seen:
			seen.add(r.item_code)
			latest.append(r)

	return latest


# ─── Helpers ────────────────────────────────────────


def _build_invoice_response(invoice_doc):
	"""Build a standard invoice response dict."""
	return {
		"name": invoice_doc.name,
		"grand_total": invoice_doc.grand_total,
		"net_total": invoice_doc.net_total,
		"total_taxes_and_charges": invoice_doc.total_taxes_and_charges,
		"paid_amount": invoice_doc.paid_amount,
		"change_amount": invoice_doc.change_amount,
		"outstanding_amount": getattr(invoice_doc, "outstanding_amount", 0),
		"customer": invoice_doc.customer,
		"customer_name": invoice_doc.customer_name,
		"posting_date": str(invoice_doc.posting_date),
		"status": invoice_doc.status if invoice_doc.docstatus == 1 else "Draft",
		"is_return": invoice_doc.is_return,
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
