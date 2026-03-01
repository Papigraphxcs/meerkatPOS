import os
import frappe

PRINT_FORMAT_NAME = "XPOS Thermal Receipt"
TEMPLATE_FILE = "xpos_thermal_receipt.html"


def execute():
    """Create or update the XPOS Thermal Receipt print format for POS invoices."""
    print(f"--- Installing print format: {PRINT_FORMAT_NAME} ---")

    template_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "templates",
        "print_formats",
        TEMPLATE_FILE,
    )

    if not os.path.exists(template_path):
        frappe.log_error(
            f"Template file not found: {template_path}",
            "XPOS Thermal Receipt Patch",
        )
        print(f"ERROR: Template file not found at {template_path}")
        return

    with open(template_path, "r") as f:
        html = f.read()

    # Create / update for Sales Invoice
    _upsert_print_format(
        name=PRINT_FORMAT_NAME,
        doc_type="Sales Invoice",
        html=html,
    )

    # Create / update for POS Invoice  (so both doctypes are covered)
    _upsert_print_format(
        name=f"{PRINT_FORMAT_NAME} (POS)",
        doc_type="POS Invoice",
        html=html,
    )

    frappe.db.commit()
    print(f"--- Finished installing print format: {PRINT_FORMAT_NAME} ---")


def _upsert_print_format(name: str, doc_type: str, html: str):
    if frappe.db.exists("Print Format", name):
        pf = frappe.get_doc("Print Format", name)
        pf.html = html
        pf.raw_printing = 0
        pf.print_format_type = "Jinja"
        pf.save(ignore_permissions=True)
        print(f"  Updated existing print format: {name}")
    else:
        pf = frappe.get_doc(
            {
                "doctype": "Print Format",
                "name": name,
                "doc_type": doc_type,
                "module": "X POS",
                "print_format_type": "Jinja",
                "standard": "No",
                "custom_format": 1,
                "html": html,
                "raw_printing": 0,
                "disabled": 0,
            }
        )
        pf.insert(ignore_permissions=True)
        print(f"  Created new print format: {name}")
