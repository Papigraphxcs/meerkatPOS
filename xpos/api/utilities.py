# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""
POS Utilities API.

- Selling price lists
- App info & version
- Sales person names
- Tax inclusive settings
- Language options
"""

import frappe
from frappe import _
from frappe.utils import cint


@frappe.whitelist()
def get_selling_price_lists():
    """Lists all selling price lists."""

    return frappe.get_all(
        "Price List",
        filters={"selling": 1, "enabled": 1},
        fields=["name"],
        order_by="name asc",
    )


@frappe.whitelist()
def get_pos_profile_tax_inclusive(pos_profile):
    """Returns tax inclusive flag for a POS Profile."""
    
    try:
        return cint(
            frappe.db.get_value("POS Profile", pos_profile, "custom_tax_inclusive")
        )
    except Exception:
        return 0


@frappe.whitelist()
def get_active_pos_profile(user=None):
    """Returns the active POS Profile for a user."""
    
    user = user or frappe.session.user

    profiles = frappe.db.sql(
        """
		SELECT DISTINCT p.name, p.company, p.currency, p.warehouse
		FROM `tabPOS Profile` p
		INNER JOIN `tabPOS Profile User` u ON u.parent = p.name
		WHERE p.disabled = 0 AND u.user = %s
		ORDER BY u.default DESC, p.name ASC
		LIMIT 1
		""",
        user,
        as_dict=True,
    )

    if profiles:
        return frappe.get_cached_doc("POS Profile", profiles[0].name).as_dict()
    return None


@frappe.whitelist()
def get_default_warehouse(company=None):
    """Returns default warehouse for a company."""
    
    if not company:
        company = frappe.defaults.get_user_default("company")
    if not company:
        return None

    return frappe.db.get_value(
        "Stock Settings",
        None,
        "default_warehouse",
    ) or frappe.db.get_value(
        "Company",
        company,
        "default_warehouse_for_sales",
    )
