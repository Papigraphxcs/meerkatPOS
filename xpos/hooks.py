from xpos.utils import get_build_version

app_name = "xpos"
app_title = "X POS"
app_publisher = "Ali Raza"
app_description = "A complete and advanced Point of Sale solution"
app_email = "ar.frappe.dev@gmail.com"
app_license = "mit"

required_apps = ["frappe", "erpnext"]

add_to_apps_screen = [
    {
        "name": "xpos",
        "logo": "/assets/xpos/images/xpos-logo.svg",
        "title": "X POS",
        "route": "/xpos",
    }
]

# Website Route Rules
# -------------------
# Serve the X POS SPA for deep links under /xpos
website_route_rules = [
    {"from_route": "/xpos", "to_route": "xpos"},
    {"from_route": "/xpos/<path:app_path>", "to_route": "xpos"},
]

# Includes in <head>
# ------------------
# Note: Removed app_include_js and app_include_css as X POS is now a standalone SPA

_asset_version = get_build_version()

# include js in doctype views
doctype_js = {
    "POS Profile": "x_pos/api/pos_profile.js",
    "Sales Invoice": "x_pos/api/invoice.js",
    "Company": "x_pos/api/company.js",
}

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Installation
# ------------

# before_install = "xpos.install.before_install"
# after_install = "xpos.install.after_install"
# before_uninstall = "xpos.uninstall.before_uninstall"
after_uninstall = "xpos.uninstall.after_uninstall"

# Permissions
# -----------

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------

doc_events = {
    "Sales Invoice": {
        "validate": "xpos.x_pos.api.invoice.validate",
        "before_submit": "xpos.x_pos.api.invoice.before_submit",
        "before_cancel": "xpos.x_pos.api.invoice.before_cancel",
    },
    "POS Invoice": {
        "validate": "xpos.x_pos.api.invoice.validate",
        "before_submit": "xpos.x_pos.api.invoice.before_submit",
        "before_cancel": "xpos.x_pos.api.invoice.before_cancel",
    },
    "Customer": {
        "validate": "xpos.x_pos.api.customer.validate",
        "after_insert": "xpos.x_pos.api.customer.after_insert",
    },
}

# Override standard DocTypes with custom classes
override_doctype_class = {
    "POS Invoice": "xpos.x_pos.overrides.pos_invoice.CustomPOSInvoice",
    "POS Invoice Merge Log": "xpos.x_pos.overrides.pos_invoice_merge_log.CustomPOSInvoiceMergeLog",
}

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Automatically update python controller files with type annotations for this app.
export_python_type_annotations = True
