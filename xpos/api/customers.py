# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt


@frappe.whitelist()
def get_customers(search_term="", limit=20):
	"""Search customers by name, mobile, or email."""
	conditions = "c.disabled = 0"
	values = {"limit": int(limit)}

	if search_term:
		search_term = search_term.strip()
		conditions += """ AND (
			c.name LIKE %(search)s
			OR c.customer_name LIKE %(search)s
			OR c.mobile_no LIKE %(search)s
			OR c.email_id LIKE %(search)s
		)"""
		values["search"] = f"%{search_term}%"

	customers = frappe.db.sql(
		"""
		SELECT
			c.name,
			c.customer_name,
			c.mobile_no,
			c.email_id,
			c.customer_group,
			c.territory,
			c.default_currency,
			c.image
		FROM `tabCustomer` c
		WHERE {conditions}
		ORDER BY c.customer_name ASC
		LIMIT %(limit)s
		""".format(conditions=conditions),
		values,
		as_dict=True,
	)

	return customers


@frappe.whitelist()
def get_customer_info(customer):
	"""Get detailed customer information."""
	if not customer:
		return None

	cust = frappe.get_cached_doc("Customer", customer)
	balance = get_customer_balance(customer)
	loyalty = get_loyalty_points(customer)

	addresses = frappe.get_all(
		"Dynamic Link",
		filters={"link_doctype": "Customer", "link_name": customer, "parenttype": "Address"},
		fields=["parent"],
	)
	address_list = []
	for addr in addresses:
		a = frappe.get_doc("Address", addr.parent)
		address_list.append({
			"name": a.name,
			"address_title": a.address_title,
			"address_line1": a.address_line1,
			"address_line2": a.address_line2,
			"city": a.city,
			"state": a.state,
			"country": a.country,
			"pincode": a.pincode,
			"phone": a.phone,
			"is_primary_address": a.is_primary_address,
		})

	return {
		"name": cust.name,
		"customer_name": cust.customer_name,
		"mobile_no": cust.mobile_no,
		"email_id": cust.email_id,
		"customer_group": cust.customer_group,
		"territory": cust.territory,
		"default_currency": cust.default_currency,
		"image": cust.image,
		"balance": balance,
		"loyalty_points": loyalty,
		"addresses": address_list,
	}


@frappe.whitelist()
def create_customer(customer_name, mobile_no="", email_id="", customer_group=None):
	"""Quick-create a new customer."""
	if not customer_name:
		frappe.throw(_("Customer name is required"))

	if not customer_group:
		customer_group = frappe.db.get_single_value("Selling Settings", "customer_group") or "All Customer Groups"

	territory = frappe.db.get_single_value("Selling Settings", "territory") or "All Territories"

	customer = frappe.get_doc({
		"doctype": "Customer",
		"customer_name": customer_name,
		"customer_type": "Individual",
		"customer_group": customer_group,
		"territory": territory,
		"mobile_no": mobile_no,
		"email_id": email_id,
	})
	customer.insert(ignore_permissions=True)

	return {
		"name": customer.name,
		"customer_name": customer.customer_name,
		"mobile_no": customer.mobile_no,
		"email_id": customer.email_id,
	}


def get_customer_balance(customer):
	"""Get outstanding balance for a customer."""
	balance = frappe.db.sql(
		"""
		SELECT SUM(debit - credit) AS balance
		FROM `tabGL Entry`
		WHERE party_type = 'Customer' AND party = %s AND docstatus = 1
		""",
		(customer,),
		as_dict=True,
	)
	return flt(balance[0].get("balance", 0)) if balance else 0


def get_loyalty_points(customer):
	"""Get loyalty points balance for a customer."""
	try:
		points = frappe.db.sql(
			"""
			SELECT SUM(loyalty_points) AS points
			FROM `tabLoyalty Point Entry`
			WHERE customer = %s AND expiry_date >= CURDATE()
			""",
			(customer,),
			as_dict=True,
		)
		return flt(points[0].get("points", 0)) if points else 0
	except Exception:
		return 0
