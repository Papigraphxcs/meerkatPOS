# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.utils import flt, cint


@frappe.whitelist()
def get_customers(search_term="", limit=20, pos_profile=None):
	"""Search customers by name, mobile, email, or tax ID.

	If a POS Profile is provided, respects customer group restrictions.
	"""
	conditions = "c.disabled = 0"
	values = {"limit": int(limit)}

	# Respect POS Profile customer group restrictions
	if pos_profile:
		try:
			pos = frappe.get_cached_doc("POS Profile", pos_profile)
			if pos.get("customer_groups"):
				allowed_groups = []
				for cg in pos.customer_groups:
					group_name = cg.get("customer_group")
					if group_name:
						allowed_groups.extend(_get_child_groups("Customer Group", group_name))
				if allowed_groups:
					allowed_groups = list(set(allowed_groups))
					conditions += " AND c.customer_group IN ({})".format(
						", ".join([frappe.db.escape(g) for g in allowed_groups])
					)
		except Exception:
			pass

	if search_term:
		search_term = search_term.strip()
		conditions += """ AND (
			c.name LIKE %(search)s
			OR c.customer_name LIKE %(search)s
			OR c.mobile_no LIKE %(search)s
			OR c.email_id LIKE %(search)s
			OR c.tax_id LIKE %(search)s
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
			c.image,
			c.tax_id,
			c.customer_type,
			c.gender
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
	"""Get detailed customer information including loyalty, addresses, balance, credit, and discount.

	Same as POS Awesome's get_customer_info.
	"""
	if not customer:
		return None

	cust = frappe.get_cached_doc("Customer", customer)
	balance = get_customer_balance(customer)
	loyalty = get_loyalty_points(customer)

	# Addresses
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
			"is_shipping_address": getattr(a, "is_shipping_address", 0),
		})

	# Customer discount (POS Awesome feature)
	posa_discount = flt(getattr(cust, "posa_discount", 0))

	# Customer price list
	default_price_list = cust.default_price_list

	# Loyalty program details
	loyalty_program = None
	loyalty_program_name = cust.loyalty_program
	if loyalty_program_name:
		try:
			from erpnext.accounts.doctype.loyalty_program.loyalty_program import (
				get_loyalty_program_details_with_points,
			)
			lp_details = get_loyalty_program_details_with_points(
				customer, loyalty_program_name
			)
			loyalty_program = {
				"name": loyalty_program_name,
				"loyalty_points": lp_details.get("loyalty_points", 0) if lp_details else 0,
				"conversion_factor": lp_details.get("conversion_factor", 0) if lp_details else 0,
			}
		except Exception:
			loyalty_program = {
				"name": loyalty_program_name,
				"loyalty_points": loyalty,
				"conversion_factor": 0,
			}

	# Referral code
	referral_code = getattr(cust, "posa_referral_code", None)
	birthday = getattr(cust, "posa_birthday", None)

	return {
		"name": cust.name,
		"customer_name": cust.customer_name,
		"mobile_no": cust.mobile_no,
		"email_id": cust.email_id,
		"customer_group": cust.customer_group,
		"territory": cust.territory,
		"default_currency": cust.default_currency,
		"default_price_list": default_price_list,
		"image": cust.image,
		"tax_id": cust.tax_id,
		"customer_type": cust.customer_type,
		"gender": getattr(cust, "gender", None),
		"balance": balance,
		"loyalty_points": loyalty,
		"loyalty_program": loyalty_program,
		"posa_discount": posa_discount,
		"posa_referral_code": referral_code,
		"posa_birthday": birthday,
		"addresses": address_list,
	}


@frappe.whitelist()
def create_customer(
	customer_name,
	mobile_no="",
	email_id="",
	customer_group=None,
	territory=None,
	customer_type="Individual",
	gender=None,
	tax_id=None,
	referral_code=None,
	birthday=None,
	company=None,
	pos_profile=None,
	address_line1=None,
	city=None,
	country=None,
):
	"""Create a new customer with optional address.

	Matches POS Awesome's create_customer which also creates an address.
	"""
	if not customer_name:
		frappe.throw(_("Customer name is required"))

	if not customer_group:
		customer_group = frappe.db.get_single_value("Selling Settings", "customer_group") or "All Customer Groups"

	if not territory:
		territory = frappe.db.get_single_value("Selling Settings", "territory") or "All Territories"

	customer = frappe.get_doc({
		"doctype": "Customer",
		"customer_name": customer_name,
		"customer_type": customer_type or "Individual",
		"customer_group": customer_group,
		"territory": territory,
		"mobile_no": mobile_no,
		"email_id": email_id,
	})

	if tax_id:
		customer.tax_id = tax_id
	if gender:
		customer.gender = gender
	if referral_code:
		try:
			customer.posa_referral_code = referral_code
		except Exception:
			pass
	if birthday:
		try:
			customer.posa_birthday = birthday
		except Exception:
			pass
	if company:
		customer.company = company

	customer.insert(ignore_permissions=True)

	# Create address if provided
	if address_line1 and city:
		make_address({
			"customer": customer.name,
			"address_line1": address_line1,
			"city": city,
			"country": country or frappe.db.get_single_value("Global Defaults", "country"),
			"is_primary_address": 1,
		})

	return {
		"name": customer.name,
		"customer_name": customer.customer_name,
		"mobile_no": customer.mobile_no,
		"email_id": customer.email_id,
		"customer_group": customer.customer_group,
		"territory": customer.territory,
	}


@frappe.whitelist()
def update_customer(customer, data):
	"""Update an existing customer.

	Same as POS Awesome's set_customer_info / create_customer(method='update').
	"""
	if isinstance(data, str):
		data = json.loads(data)

	doc = frappe.get_doc("Customer", customer)

	updatable_fields = [
		"customer_name", "mobile_no", "email_id", "customer_group",
		"territory", "customer_type", "gender", "tax_id",
	]

	for field in updatable_fields:
		if field in data:
			doc.set(field, data[field])

	# POS Awesome custom fields
	posa_fields = ["posa_referral_code", "posa_birthday", "posa_discount"]
	for field in posa_fields:
		if field in data:
			try:
				doc.set(field, data[field])
			except Exception:
				pass

	doc.save(ignore_permissions=True)

	return {
		"name": doc.name,
		"customer_name": doc.customer_name,
		"mobile_no": doc.mobile_no,
		"email_id": doc.email_id,
	}


@frappe.whitelist()
def get_customer_addresses(customer):
	"""List all addresses for a customer.

	Same as POS Awesome's get_customer_addresses.
	"""
	if not customer:
		return []

	links = frappe.get_all(
		"Dynamic Link",
		filters={"link_doctype": "Customer", "link_name": customer, "parenttype": "Address"},
		fields=["parent"],
	)

	addresses = []
	for link in links:
		a = frappe.get_doc("Address", link.parent)
		addresses.append({
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
			"is_shipping_address": getattr(a, "is_shipping_address", 0),
		})

	return addresses


@frappe.whitelist()
def make_address(args):
	"""Create a new address linked to a customer.

	Same as POS Awesome's make_address.
	"""
	if isinstance(args, str):
		args = json.loads(args)

	customer = args.get("customer")
	if not customer:
		frappe.throw(_("Customer is required to create an address"))

	address = frappe.get_doc({
		"doctype": "Address",
		"address_title": args.get("address_title") or customer,
		"address_line1": args.get("address_line1"),
		"address_line2": args.get("address_line2"),
		"city": args.get("city"),
		"state": args.get("state"),
		"country": args.get("country") or frappe.db.get_single_value("Global Defaults", "country"),
		"pincode": args.get("pincode"),
		"phone": args.get("phone"),
		"is_primary_address": cint(args.get("is_primary_address", 0)),
		"is_shipping_address": cint(args.get("is_shipping_address", 0)),
	})

	address.append("links", {
		"link_doctype": "Customer",
		"link_name": customer,
	})

	address.insert(ignore_permissions=True)

	return {
		"name": address.name,
		"address_title": address.address_title,
		"address_line1": address.address_line1,
		"city": address.city,
	}


@frappe.whitelist()
def get_customer_credit(customer, company):
	"""Return all available credit (outstanding returns + unallocated advances) for a customer.

	Same as POS Awesome's get_available_credit.
	"""
	if not customer or not company:
		return []

	credits = []

	# 1. Unallocated payments (advances)
	unallocated = frappe.db.sql(
		"""
		SELECT
			pe.name AS credit_origin,
			(pe.paid_amount - pe.total_allocated_amount) AS total_credit,
			'Payment Entry' AS type,
			pe.posting_date
		FROM `tabPayment Entry` pe
		WHERE pe.party_type = 'Customer'
			AND pe.party = %(customer)s
			AND pe.company = %(company)s
			AND pe.docstatus = 1
			AND pe.payment_type = 'Receive'
			AND (pe.paid_amount - pe.total_allocated_amount) > 0
		ORDER BY pe.posting_date ASC
		""",
		{"customer": customer, "company": company},
		as_dict=True,
	)
	credits.extend(unallocated)

	# 2. Outstanding return invoices (credit notes)
	credit_notes = frappe.db.sql(
		"""
		SELECT
			si.name AS credit_origin,
			ABS(si.outstanding_amount) AS total_credit,
			'Sales Invoice' AS type,
			si.posting_date
		FROM `tabSales Invoice` si
		WHERE si.customer = %(customer)s
			AND si.company = %(company)s
			AND si.docstatus = 1
			AND si.is_return = 1
			AND si.outstanding_amount < 0
		ORDER BY si.posting_date ASC
		""",
		{"customer": customer, "company": company},
		as_dict=True,
	)
	credits.extend(credit_notes)

	return credits


@frappe.whitelist()
def get_sales_person_names():
	"""Returns the list of enabled sales persons.

	Same as POS Awesome's get_sales_person_names.
	"""
	return frappe.get_all(
		"Sales Person",
		filters={"enabled": 1},
		fields=["name", "sales_person_name"],
		order_by="name asc",
	)


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


def _get_child_groups(group_type, root):
	"""Get all child groups including self."""
	if not root:
		return []
	result = frappe.db.get_value(group_type, root, ["lft", "rgt"])
	if not result:
		return [root]
	lft, rgt = result
	return frappe.get_all(
		group_type,
		filters={"lft": [">=", lft], "rgt": ["<=", rgt]},
		pluck="name",
	)
