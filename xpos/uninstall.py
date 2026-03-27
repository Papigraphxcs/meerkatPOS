import frappe


def after_uninstall():
	clear_custom_fields_and_properties()


def clear_custom_fields_and_properties():
	frappe.db.delete("Custom Field", {"module": "X POS"})
	frappe.db.delete("Property Setter", {"module": "X POS"})
	frappe.db.commit()  # nosemgrep: frappe-manual-commit — uninstall must commit deletions immediately
