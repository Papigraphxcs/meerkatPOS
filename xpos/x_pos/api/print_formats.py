# Copyright (c) 2026, Ali Raxa and contributors
# For license information, please see license.txt

import frappe

@frappe.whitelist()
def get_print_formats(doctype):
    print_formats = frappe.get_all("Print Format", filters={"doc_type": doctype}, fields=["name"])
    return [p.name for p in print_formats]
