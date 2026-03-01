# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""
POS Cash Movement API.

- POS Expense (cash out for expenses during shift)
- Cash Deposit (deposit cash to bank/safe during shift)
- Cash movement listing and cancellation
"""

import json
import frappe
from frappe import _
from frappe.utils import flt, nowdate, now_datetime, cint


@frappe.whitelist()
def get_cash_movement_context(pos_profile, pos_opening_shift):
    """Returns configuration context for cash movement dialogs.

    Same as POS Awesome's get_cash_movement_context.
    """
    pos = frappe.get_cached_doc("POS Profile", pos_profile)

    enable_cash_movement = cint(pos.get("posa_enable_cash_movement"))
    allow_pos_expense = cint(pos.get("posa_allow_pos_expense"))
    allow_cash_deposit = cint(pos.get("posa_allow_cash_deposit"))

    expense_accounts = []
    try:
        expense_accounts = frappe.get_all(
            "POS Allowed Expense Account",
            filters={"parent": pos_profile},
            fields=["expense_account"],
            order_by="idx",
        )
    except Exception:
        pass

    source_accounts = []
    try:
        source_accounts = frappe.get_all(
            "POS Allowed Source Account",
            filters={"parent": pos_profile},
            fields=["account"],
            order_by="idx",
        )
    except Exception:
        pass

    cash_account = None
    cash_mop = pos.get("posa_cash_mode_of_payment") or "Cash"
    try:
        from erpnext.accounts.doctype.sales_invoice.sales_invoice import (
            get_bank_cash_account,
        )

        account_info = get_bank_cash_account(cash_mop, pos.company)
        cash_account = account_info.get("account")
    except Exception:
        pass

    return {
        "enable_cash_movement": enable_cash_movement,
        "allow_pos_expense": allow_pos_expense,
        "allow_cash_deposit": allow_cash_deposit,
        "expense_accounts": [e.expense_account for e in expense_accounts],
        "source_accounts": [s.account for s in source_accounts],
        "cash_account": cash_account,
        "company": pos.company,
        "cost_center": pos.get("cost_center")
        or frappe.db.get_value("Company", pos.company, "cost_center"),
    }


@frappe.whitelist()
def create_pos_expense(payload):
    """Creates a POS Expense cash movement with journal entry.

    Same as POS Awesome's create_pos_expense.
    """
    if isinstance(payload, str):
        payload = json.loads(payload)

    pos_opening_shift = payload.get("pos_opening_shift")
    amount = flt(payload.get("amount"))
    expense_account = payload.get("expense_account")
    remarks = payload.get("remarks", "")
    cash_account = payload.get("cash_account")
    company = payload.get("company")
    cost_center = payload.get("cost_center")

    if not pos_opening_shift:
        frappe.throw(_("POS Opening Shift is required"))
    if amount <= 0:
        frappe.throw(_("Amount must be greater than zero"))
    if not expense_account:
        frappe.throw(_("Expense account is required"))

    opening = frappe.get_doc("POS Opening Shift", pos_opening_shift)
    company = company or opening.company
    cost_center = cost_center or frappe.db.get_value("Company", company, "cost_center")

    if not cash_account:
        cash_mop = "Cash"
        try:
            pos = frappe.get_cached_doc("POS Profile", opening.pos_profile)
            cash_mop = pos.get("posa_cash_mode_of_payment") or "Cash"
        except Exception:
            pass
        from erpnext.accounts.doctype.sales_invoice.sales_invoice import (
            get_bank_cash_account,
        )

        account_info = get_bank_cash_account(cash_mop, company)
        cash_account = account_info.get("account")

    # Create Journal Entry
    je = frappe.get_doc(
        {
            "doctype": "Journal Entry",
            "posting_date": nowdate(),
            "company": company,
            "user_remark": f"POS Expense: {remarks}" if remarks else "POS Expense",
            "accounts": [
                {
                    "account": expense_account,
                    "debit_in_account_currency": amount,
                    "cost_center": cost_center,
                },
                {
                    "account": cash_account,
                    "credit_in_account_currency": amount,
                    "cost_center": cost_center,
                },
            ],
        }
    )
    je.insert(ignore_permissions=True)
    je.submit()

    # Create POS Cash Movement record
    movement = _create_cash_movement_record(
        pos_opening_shift=pos_opening_shift,
        movement_type="Expense",
        amount=amount,
        remarks=remarks,
        journal_entry=je.name,
        account=expense_account,
        company=company,
    )

    return movement


@frappe.whitelist()
def create_cash_deposit(payload):
    """Creates a Cash Deposit movement with journal entry.

    Same as POS Awesome's create_cash_deposit.
    """
    if isinstance(payload, str):
        payload = json.loads(payload)

    pos_opening_shift = payload.get("pos_opening_shift")
    amount = flt(payload.get("amount"))
    target_account = payload.get("target_account")
    remarks = payload.get("remarks", "")
    cash_account = payload.get("cash_account")
    company = payload.get("company")
    cost_center = payload.get("cost_center")

    if not pos_opening_shift:
        frappe.throw(_("POS Opening Shift is required"))
    if amount <= 0:
        frappe.throw(_("Amount must be greater than zero"))
    if not target_account:
        frappe.throw(_("Target account is required"))

    opening = frappe.get_doc("POS Opening Shift", pos_opening_shift)
    company = company or opening.company
    cost_center = cost_center or frappe.db.get_value("Company", company, "cost_center")

    if not cash_account:
        cash_mop = "Cash"
        try:
            pos = frappe.get_cached_doc("POS Profile", opening.pos_profile)
            cash_mop = pos.get("posa_cash_mode_of_payment") or "Cash"
        except Exception:
            pass
        from erpnext.accounts.doctype.sales_invoice.sales_invoice import (
            get_bank_cash_account,
        )

        account_info = get_bank_cash_account(cash_mop, company)
        cash_account = account_info.get("account")

    # Create Journal Entry
    je = frappe.get_doc(
        {
            "doctype": "Journal Entry",
            "posting_date": nowdate(),
            "company": company,
            "user_remark": (
                f"POS Cash Deposit: {remarks}" if remarks else "POS Cash Deposit"
            ),
            "accounts": [
                {
                    "account": target_account,
                    "debit_in_account_currency": amount,
                    "cost_center": cost_center,
                },
                {
                    "account": cash_account,
                    "credit_in_account_currency": amount,
                    "cost_center": cost_center,
                },
            ],
        }
    )
    je.insert(ignore_permissions=True)
    je.submit()

    movement = _create_cash_movement_record(
        pos_opening_shift=pos_opening_shift,
        movement_type="Cash Deposit",
        amount=amount,
        remarks=remarks,
        journal_entry=je.name,
        account=target_account,
        company=company,
    )

    return movement


@frappe.whitelist()
def get_shift_cash_movements(
    pos_opening_shift,
    movement_type=None,
    status=None,
    search_text=None,
    limit_start=0,
    limit_page_length=20,
):
    """
    Lists cash movements for a shift with search and pagination.
    """
    filters = {"pos_opening_shift": pos_opening_shift}

    if movement_type:
        filters["movement_type"] = movement_type
    if status:
        filters["status"] = status

    try:
        movements = frappe.get_list(
            "POS Cash Movement",
            filters=filters,
            fields=[
                "name",
                "movement_type",
                "amount",
                "remarks",
                "posting_date",
                "posting_time",
                "status",
                "journal_entry",
                "account",
            ],
            limit_start=cint(limit_start),
            limit_page_length=cint(limit_page_length),
            order_by="creation desc",
        )
        return movements
    except Exception:
        # DocType may not exist
        return []


@frappe.whitelist()
def cancel_cash_movement(name):
    """Cancels a submitted cash movement and its linked journal entry.

    Same as POS Awesome's cancel_cash_movement.
    """
    try:
        movement = frappe.get_doc("POS Cash Movement", name)
    except Exception:
        frappe.throw(_("Cash movement {0} not found").format(name))

    if movement.status == "Cancelled":
        frappe.throw(_("Cash movement is already cancelled"))

    # Cancel linked journal entry
    if movement.journal_entry:
        try:
            je = frappe.get_doc("Journal Entry", movement.journal_entry)
            if je.docstatus == 1:
                je.cancel()
        except Exception:
            frappe.log_error(
                f"Failed to cancel Journal Entry {movement.journal_entry}",
                "X POS Cash Movement",
            )

    movement.status = "Cancelled"
    movement.save(ignore_permissions=True)

    return movement.as_dict()


def _create_cash_movement_record(
    pos_opening_shift,
    movement_type,
    amount,
    remarks,
    journal_entry,
    account,
    company,
):
    """Create a POS Cash Movement record if the doctype exists."""
    try:
        movement = frappe.get_doc(
            {
                "doctype": "POS Cash Movement",
                "pos_opening_shift": pos_opening_shift,
                "movement_type": movement_type,
                "amount": amount,
                "remarks": remarks,
                "journal_entry": journal_entry,
                "account": account,
                "company": company,
                "posting_date": nowdate(),
                "posting_time": now_datetime().strftime("%H:%M:%S"),
                "user": frappe.session.user,
                "status": "Submitted",
            }
        )
        movement.insert(ignore_permissions=True)
        return movement.as_dict()
    except Exception:
        # If POS Cash Movement doctype doesn't exist, return basic info
        return {
            "movement_type": movement_type,
            "amount": amount,
            "journal_entry": journal_entry,
            "status": "Submitted",
        }
