# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.utils import flt, nowdate, now_datetime, cint


@frappe.whitelist()
def get_opening_data():
    """Get data needed for the shift opening dialog.

    Returns POS profiles, companies, and payment methods for the current user.
    """
    data = {}

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

    companies = []
    seen = set()
    for profile in pos_profiles:
        if profile.company and profile.company not in seen:
            companies.append({"name": profile.company})
            seen.add(profile.company)
    data["companies"] = companies

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
    
    balance_details = (
        json.loads(balance_details)
        if isinstance(balance_details, str)
        else balance_details
    )

    new_shift = frappe.get_doc(
        {
            "doctype": "POS Opening Shift",
            "period_start_date": now_datetime(),
            "posting_date": nowdate(),
            "user": frappe.session.user,
            "pos_profile": pos_profile,
            "company": company,
            "docstatus": 1,
        }
    )

    if balance_details:
        new_shift.set("balance_details", balance_details)

    new_shift.insert(ignore_permissions=True)

    data = {
        "pos_opening_shift": new_shift.as_dict(),
    }
    _enrich_shift_data(data, pos_profile)

    return data


@frappe.whitelist()
def check_open_shift(user=None):
    """Check if the current user has an open POS shift."""
    
    user = user or frappe.session.user

    open_shifts = frappe.db.get_all(
        "POS Opening Shift",
        filters={
            "user": user,
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
    """Create a POS Closing Shift and close the opening shift.

    - Aggregates invoices by POS opening shift reference
    - Tax summary per shift
    - Payment reconciliation with expected vs actual amounts
    """
    closing_details = (
        json.loads(closing_details)
        if isinstance(closing_details, str)
        else closing_details
    )

    opening = frappe.get_doc("POS Opening Shift", opening_shift)

    invoices = frappe.get_all(
        "Sales Invoice",
        filters={
            "pos_opening_shift": opening.name,
            "docstatus": 1,
            "is_pos": 1,
        },
        fields=[
            "name",
            "grand_total",
            "net_total",
            "total_taxes_and_charges",
            "customer",
            "is_return",
        ],
    )

    if not invoices:
        invoices = frappe.get_all(
            "Sales Invoice",
            filters={
                "pos_profile": opening.pos_profile,
                "posting_date": [">=", opening.posting_date],
                "docstatus": 1,
                "is_pos": 1,
                "owner": opening.user,
            },
            fields=[
                "name",
                "grand_total",
                "net_total",
                "total_taxes_and_charges",
                "customer",
                "is_return",
            ],
        )

    grand_total = sum(flt(inv.grand_total) for inv in invoices)
    net_total = sum(flt(inv.net_total) for inv in invoices)
    total_qty = len(invoices)

    returns_count = sum(1 for inv in invoices if inv.get("is_return"))

    closing_shift = frappe.get_doc(
        {
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
        }
    )

    if closing_details:
        for detail in closing_details:
            closing_shift.append(
                "payment_reconciliation",
                {
                    "mode_of_payment": detail.get("mode_of_payment"),
                    "opening_amount": flt(detail.get("opening_amount", 0)),
                    "expected_amount": flt(detail.get("expected_amount", 0)),
                    "closing_amount": flt(detail.get("closing_amount", 0)),
                    "difference": flt(detail.get("difference", 0)),
                },
            )

    tax_summary = _get_shift_tax_summary(invoices)
    for tax in tax_summary:
        try:
            closing_shift.append(
                "taxes",
                {
                    "account_head": tax.get("account_head"),
                    "rate": flt(tax.get("rate")),
                    "amount": flt(tax.get("amount")),
                },
            )
        except Exception:
            pass

    for inv in invoices:
        closing_shift.append(
            "pos_transactions",
            {
                "pos_invoice": inv.name,
                "posting_date": nowdate(),
                "grand_total": inv.grand_total,
                "customer": inv.customer,
            },
        )

    closing_shift.insert(ignore_permissions=True)
    closing_shift.submit()

    return {
        "name": closing_shift.name,
        "grand_total": grand_total,
        "net_total": net_total,
        "total_invoices": total_qty,
        "returns_count": returns_count,
    }


@frappe.whitelist()
def get_shift_summary(opening_shift):
    """Get summary of the current shift for closing.

    Enhanced version with tax breakdown and return info.
    """
    opening = frappe.get_doc("POS Opening Shift", opening_shift)

    invoices = frappe.get_all(
        "Sales Invoice",
        filters={
            "pos_opening_shift": opening.name,
            "docstatus": 1,
            "is_pos": 1,
        },
        fields=[
            "name",
            "grand_total",
            "net_total",
            "paid_amount",
            "change_amount",
            "is_return",
            "customer",
            "customer_name",
        ],
    )

    if not invoices:
        invoices = frappe.get_all(
            "Sales Invoice",
            filters={
                "pos_profile": opening.pos_profile,
                "posting_date": [">=", opening.posting_date],
                "docstatus": 1,
                "is_pos": 1,
                "owner": opening.user,
            },
            fields=[
                "name",
                "grand_total",
                "net_total",
                "paid_amount",
                "change_amount",
                "is_return",
                "customer",
                "customer_name",
            ],
        )

    grand_total = sum(flt(inv.grand_total) for inv in invoices)
    net_total = sum(flt(inv.net_total) for inv in invoices)
    returns_count = sum(1 for inv in invoices if inv.get("is_return"))

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

    opening_balances = {}
    for detail in opening.balance_details:
        mode = detail.mode_of_payment
        opening_balances[mode] = flt(detail.amount)

    tax_summary = _get_shift_tax_summary(invoices)

    return {
        "total_invoices": len(invoices),
        "grand_total": grand_total,
        "net_total": net_total,
        "returns_count": returns_count,
        "payment_summary": payment_summary,
        "opening_balances": opening_balances,
        "tax_summary": tax_summary,
        "pos_profile": opening.pos_profile,
        "company": opening.company,
        "invoices": [
            {
                "name": inv.name,
                "customer": inv.customer,
                "customer_name": inv.customer_name,
                "grand_total": inv.grand_total,
                "is_return": inv.is_return,
            }
            for inv in invoices
        ],
    }


def _enrich_shift_data(data, pos_profile):
    """Add profile, company, settings, and tax template data to shift response."""
    try:
        profile = frappe.get_cached_doc("POS Profile", pos_profile)
    except (AttributeError, Exception):
        frappe.clear_cache(doctype="POS Profile")
        profile = frappe.get_doc("POS Profile", pos_profile)
    data["pos_profile"] = profile.as_dict()
    data["company"] = frappe.get_cached_doc("Company", profile.company).as_dict()

    allow_negative_stock = cint(
        frappe.db.get_single_value("Stock Settings", "allow_negative_stock") or 0
    )
    data["stock_settings"] = {"allow_negative_stock": bool(allow_negative_stock)}

    data["disable_rounded_total"] = cint(
        frappe.db.get_single_value("Global Defaults", "disable_rounded_total") or 0
    )

    if profile.taxes_and_charges:
        try:
            tax_template = frappe.get_cached_doc(
                "Sales Taxes and Charges Template", profile.taxes_and_charges
            )
            data["taxes"] = [
                {
                    "description": tax.description
                    or (
                        str(tax.account_head).split(" - ")[0]
                        if tax.account_head
                        else "Tax"
                    ),
                    "charge_type": tax.charge_type,
                    "rate": flt(tax.rate),
                    "account_head": tax.account_head,
                    "included_in_print_rate": cint(tax.included_in_print_rate) or 0,
                }
                for tax in tax_template.taxes
            ]
            data["tax_inclusive"] = cint(profile.get("tax_inclusive")) or 0
        except Exception:
            data["taxes"] = []
            data["tax_inclusive"] = 0
    else:
        data["taxes"] = []
        data["tax_inclusive"] = 0

    data["print_settings"] = {
        "print_format": profile.get("print_format") or "POS Invoice",
        "print_format_for_online": profile.get("print_format_for_online"),
        "allow_print_before_pay": cint(profile.get("allow_print_draft_invoices"))
        or 0,
        "auto_print_receipt": cint(profile.get("auto_print_receipt")) or 0,
        "letter_head": profile.get("letter_head") or "",
    }


def _get_shift_tax_summary(invoices):
    """Aggregate tax info across all shift invoices."""
    if not invoices:
        return []

    inv_names = [inv.name for inv in invoices]
    if not inv_names:
        return []

    taxes = frappe.db.sql(
        """
		SELECT
			account_head,
			rate,
			SUM(tax_amount) AS amount
		FROM `tabSales Taxes and Charges`
		WHERE parent IN ({placeholders})
			AND parenttype = 'Sales Invoice'
		GROUP BY account_head, rate
		ORDER BY account_head
		""".format(
            placeholders=", ".join(["%s"] * len(inv_names))
        ),
        inv_names,
        as_dict=True,
    )

    return taxes
