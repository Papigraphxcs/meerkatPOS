# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""
Print Formats API.

Returns available print format names.
"""

import frappe


@frappe.whitelist()
def get_print_formats(doctype: str = "Sales Invoice"):
	"""Returns available print format names for a doctype."""
	print_formats = frappe.get_all(
		"Print Format",
		filters={"doc_type": doctype, "disabled": 0},
		fields=["name"],
	)
	return [p.name for p in print_formats]
