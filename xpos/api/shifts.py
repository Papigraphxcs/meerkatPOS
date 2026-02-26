# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.utils import flt, nowdate, now_datetime, cint


@frappe.whitelist()
def get_opening_data():
	"""Get data needed for the shift opening dialog."""
	data = {}

	# Get POS Profiles accessible to the current user
	pos_profiles = frappe.db.sql(
		"""
		SELECT DISTINCT p.name, p.company, p.currency, p.warehouse
		FROM `tabPOS Profile` p
		INNER JOIN `tabPOS Profile User` u ON u.parent = p.name
		WHERE p.disabled = 0 AND u.user = %s
		ORDER BY p.name
		""",
		frappe.session.user,
		as_dict=True,
	)

	data["pos_profiles"] = pos_profiles

	# Derive companies
	companies = []
	seen = set()
	for profile in pos_profiles:
		if profile.company and profile.company not in seen:
			companies.append({"name": profile.company})
			seen.add(profile.company)
	data["companies"] = companies

	# Get payment methods for these profiles
	profile_names = [p.name for p in pos_profiles]
	if profile_names:
		payment_methods = frappe.get_list(
			"POS Payment Method",
			filters={"parent": ["in", profile_names]},
			fields=["parent", "mode_of_payment", "default"],
			limit_page_length=0,
			order_by="parent",
			ignore_permissions=True,
		)
		data["payment_methods"] = payment_methods
	else:
		data["payment_methods"] = []

	return data


@frappe.whitelist()
def open_shift(pos_profile, company, balance_details):
	"""Create and submit a POS Opening Shift."""
	balance_details = json.loads(balance_details) if isinstance(balance_details, str) else balance_details

	new_shift = frappe.get_doc({
		"doctype": "POS Opening Shift",
		"period_start_date": now_datetime(),
		"posting_date": nowdate(),
		"user": frappe.session.user,
		"pos_profile": pos_profile,
		"company": company,
		"docstatus": 1,
	})

	if balance_details:
		new_shift.set("balance_details", balance_details)

	new_shift.insert(ignore_permissions=True)

	data = {
		"pos_opening_shift": new_shift.as_dict(),
	}
	_enrich_shift_data(data, pos_profile)

	return data


@frappe.whitelist()
def check_open_shift():
	"""Check if the current user has an open POS shift."""
	open_shifts = frappe.db.get_all(
		"POS Opening Shift",
		filters={
			"user": frappe.session.user,
			"pos_closing_shift": ["is", "not set"],
			"docstatus": 1,
			"status": "Open",
		},
		fields=["name", "pos_profile", "company"],
		order_by="period_start_date desc",
		limit=1,
	)

	if not open_shifts:
		return None

	shift = open_shifts[0]
	data = {
		"pos_opening_shift": frappe.get_doc("POS Opening Shift", shift.name).as_dict(),
	}
	_enrich_shift_data(data, shift.pos_profile)

	return data


@frappe.whitelist()
def close_shift(opening_shift, closing_details):
	"""Create a POS Closing Shift and close the opening shift."""
	closing_details = json.loads(closing_details) if isinstance(closing_details, str) else closing_details

	opening = frappe.get_doc("POS Opening Shift", opening_shift)

	# Get all submitted invoices for this shift
	invoices = frappe.get_all(
		"Sales Invoice",
		filters={
			"pos_profile": opening.pos_profile,
			"posting_date": [">=", opening.posting_date],
			"docstatus": 1,
			"is_pos": 1,
			"owner": opening.user,
		},
		fields=["name", "grand_total", "net_total", "total_taxes_and_charges"],
	)

	# Calculate totals
	grand_total = sum(flt(inv.grand_total) for inv in invoices)
	net_total = sum(flt(inv.net_total) for inv in invoices)
	total_qty = len(invoices)

	closing_shift = frappe.get_doc({
		"doctype": "POS Closing Shift",
		"period_start_date": opening.period_start_date,
		"period_end_date": now_datetime(),
		"posting_date": nowdate(),
		"posting_time": now_datetime().strftime("%H:%M:%S"),
		"pos_profile": opening.pos_profile,
		"user": frappe.session.user,
		"company": opening.company,
		"pos_opening_shift": opening.name,
		"grand_total": grand_total,
		"net_total": net_total,
		"total_quantity": total_qty,
	})

	# Add payment reconciliation
	if closing_details:
		for detail in closing_details:
			closing_shift.append("payment_reconciliation", {
				"mode_of_payment": detail.get("mode_of_payment"),
				"opening_amount": flt(detail.get("opening_amount", 0)),
				"expected_amount": flt(detail.get("expected_amount", 0)),
				"closing_amount": flt(detail.get("closing_amount", 0)),
				"difference": flt(detail.get("difference", 0)),
			})

	# Add invoices to POS Transactions
	for inv in invoices:
		closing_shift.append("pos_transactions", {
			"pos_invoice": inv.name,
			"posting_date": nowdate(),
			"grand_total": inv.grand_total,
			"customer": frappe.db.get_value("Sales Invoice", inv.name, "customer"),
		})

	closing_shift.insert(ignore_permissions=True)
	closing_shift.submit()

	return {
		"name": closing_shift.name,
		"grand_total": grand_total,
		"net_total": net_total,
		"total_invoices": total_qty,
	}


@frappe.whitelist()
def get_shift_summary(opening_shift):
	"""Get summary of the current shift for closing."""
	opening = frappe.get_doc("POS Opening Shift", opening_shift)

	# Get all submitted invoices for this shift
	invoices = frappe.get_all(
		"Sales Invoice",
		filters={
			"pos_profile": opening.pos_profile,
			"posting_date": [">=", opening.posting_date],
			"docstatus": 1,
			"is_pos": 1,
			"owner": opening.user,
		},
		fields=["name", "grand_total", "net_total", "paid_amount", "change_amount"],
	)

	grand_total = sum(flt(inv.grand_total) for inv in invoices)
	net_total = sum(flt(inv.net_total) for inv in invoices)

	# Get payment breakdown
	payment_summary = {}
	for inv in invoices:
		payments = frappe.get_all(
			"Sales Invoice Payment",
			filters={"parent": inv.name},
			fields=["mode_of_payment", "amount"],
		)
		for p in payments:
			mode = p.mode_of_payment
			if mode not in payment_summary:
				payment_summary[mode] = 0
			payment_summary[mode] += flt(p.amount)

	# Get opening balances
	opening_balances = {}
	for detail in opening.balance_details:
		mode = detail.mode_of_payment
		opening_balances[mode] = flt(detail.opening_amount)

	return {
		"total_invoices": len(invoices),
		"grand_total": grand_total,
		"net_total": net_total,
		"payment_summary": payment_summary,
		"opening_balances": opening_balances,
		"pos_profile": opening.pos_profile,
		"company": opening.company,
	}


def _enrich_shift_data(data, pos_profile):
	"""Add profile, company, and settings data to shift response."""
	data["pos_profile"] = frappe.get_cached_doc("POS Profile", pos_profile).as_dict()
	data["company"] = frappe.get_cached_doc("Company", data["pos_profile"]["company"]).as_dict()

	allow_negative_stock = cint(
		frappe.db.get_single_value("Stock Settings", "allow_negative_stock") or 0
	)
	data["stock_settings"] = {"allow_negative_stock": bool(allow_negative_stock)}
