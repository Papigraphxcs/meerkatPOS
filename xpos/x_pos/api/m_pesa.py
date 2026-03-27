# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt


import json
import re

import frappe
import requests
from frappe import _
from requests.auth import HTTPBasicAuth


def _sanitize_mpesa_field(value: str | None, max_length=100) -> str | None:
	"""Sanitize M-Pesa webhook field to prevent injection."""
	if value is None:
		return None
	value = str(value).strip()[:max_length]
	# Remove any control characters
	value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", value)
	return value or None


def _validate_mpesa_webhook_token():
	"""Validate M-Pesa webhook request using a configured token.

	If no token is configured, allows the request (backward-compatible).
	If a token is configured, checks X-Mpesa-Token header.
	"""
	token = (
		frappe.db.get_single_value("Mpesa Settings", "webhook_token", cache=True)
		if frappe.db.exists("DocType", "Mpesa Settings")
		else None
	)
	if not token:
		return

	request_token = frappe.request.headers.get("X-Mpesa-Token", "") if frappe.request else ""
	if not request_token or request_token != token:
		frappe.log_error("M-Pesa webhook token mismatch", "M-Pesa Security")
		raise frappe.AuthenticationError(_("Invalid webhook token"))


def get_token(app_key: str, app_secret: str, base_url: str) -> str:
	authenticate_uri = "/oauth/v1/generate?grant_type=client_credentials"
	authenticate_url = f"{base_url}{authenticate_uri}"

	r = requests.get(authenticate_url, auth=HTTPBasicAuth(app_key, app_secret))

	return r.json()["access_token"]


@frappe.whitelist()
def confirmation(**kwargs):
	try:
		_validate_mpesa_webhook_token()

		args = frappe._dict(kwargs)

		trans_id = _sanitize_mpesa_field(args.get("TransID"), max_length=50)
		trans_amount = _sanitize_mpesa_field(args.get("TransAmount"), max_length=20)
		if not trans_id or not trans_amount:
			frappe.log_error("M-Pesa confirmation missing TransID or TransAmount", "M-Pesa Webhook")
			return {"ResultCode": 1, "ResultDesc": "Missing required fields"}

		doc = frappe.new_doc("Mpesa Payment Register")
		doc.transactiontype = _sanitize_mpesa_field(args.get("TransactionType"), max_length=50)
		doc.transid = trans_id
		doc.transtime = _sanitize_mpesa_field(args.get("TransTime"), max_length=20)
		doc.transamount = trans_amount
		doc.businessshortcode = _sanitize_mpesa_field(args.get("BusinessShortCode"), max_length=20)
		doc.billrefnumber = _sanitize_mpesa_field(args.get("BillRefNumber"), max_length=50)
		doc.invoicenumber = _sanitize_mpesa_field(args.get("InvoiceNumber"), max_length=50)
		doc.orgaccountbalance = _sanitize_mpesa_field(args.get("OrgAccountBalance"), max_length=20)
		doc.thirdpartytransid = _sanitize_mpesa_field(args.get("ThirdPartyTransID"), max_length=50)
		doc.msisdn = _sanitize_mpesa_field(args.get("MSISDN"), max_length=20)
		doc.firstname = _sanitize_mpesa_field(args.get("FirstName"), max_length=100)
		doc.middlename = _sanitize_mpesa_field(args.get("MiddleName"), max_length=100)
		doc.lastname = _sanitize_mpesa_field(args.get("LastName"), max_length=100)
		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		context = {"ResultCode": 0, "ResultDesc": "Accepted"}
		return dict(context)
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), str(e)[:140])
		context = {"ResultCode": 1, "ResultDesc": "Rejected"}
		return dict(context)


@frappe.whitelist()
def validation(**kwargs):
	try:
		_validate_mpesa_webhook_token()
	except frappe.AuthenticationError:
		return {"ResultCode": 1, "ResultDesc": "Rejected"}

	args = frappe._dict(kwargs)
	trans_id = args.get("TransID", "")
	bill_ref = args.get("BillRefNumber", "")

	if not trans_id:
		frappe.log_error("M-Pesa validation: missing TransID", "M-Pesa Webhook")
		return {"ResultCode": 1, "ResultDesc": "Rejected - Missing TransID"}

	return {"ResultCode": 0, "ResultDesc": "Accepted"}


@frappe.whitelist()
def get_mpesa_mode_of_payment(company: str) -> list[str]:
	modes = frappe.get_all(
		"Mpesa C2B Register URL",
		filters={"company": company, "register_status": "Success"},
		fields=["mode_of_payment"],
	)
	modes_of_payment = []
	for mode in modes:
		if mode.mode_of_payment not in modes_of_payment:
			modes_of_payment.append(mode.mode_of_payment)
	return modes_of_payment


@frappe.whitelist()
def get_mpesa_draft_payments(
	company: str,
	mode_of_payment: str | None = None,
	mobile_no: str | None = None,
	full_name: str | None = None,
	payment_methods_list: str | None = None,
):
	filters = {"company": company, "docstatus": 0}
	if mode_of_payment:
		filters["mode_of_payment"] = mode_of_payment
	if mobile_no:
		filters["msisdn"] = ["like", f"%{mobile_no}%"]
	if full_name:
		filters["full_name"] = ["like", f"%{full_name}%"]
	if payment_methods_list:
		filters["mode_of_payment"] = ["in", json.loads(payment_methods_list)]

	payments = frappe.get_all(
		"Mpesa Payment Register",
		filters=filters,
		fields=[
			"name",
			"transid",
			"msisdn as mobile_no",
			"full_name",
			"posting_date",
			"transamount as amount",
			"currency",
			"mode_of_payment",
			"company",
		],
		order_by="posting_date desc",
	)
	return payments


@frappe.whitelist()
def submit_mpesa_payment(mpesa_payment: str, customer: str):
	doc = frappe.get_doc("Mpesa Payment Register", mpesa_payment)
	doc.customer = customer
	doc.submit_payment = 1
	doc.submit()
	doc.reload()
	return frappe.get_doc("Payment Entry", doc.payment_entry)
