from xpos.utils import get_build_version

app_name = "xpos"
app_title = "X POS"
app_publisher = "Ali Raza"
app_description = "A complete advanced Point of Sale solution"
app_email = "ar.frappe.dev@gmail.com"
app_license = "mit"

required_apps = ["frappe", "erpnext"]

add_to_apps_screen = [
    {
        "name": "xpos",
        "logo": "/assets/xpos/images/xpos-logo.png",
        "title": "X POS",
        "route": "/app/xpos",
    }
]

# Includes in <head>
# ------------------

_asset_version = get_build_version()

app_include_js = [
    f"/assets/xpos/dist/js/loader.js?v={_asset_version}",
]

app_include_css = [
    f"/assets/xpos/dist/js/xpos.css?v={_asset_version}",
]

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
after_migrate = [
    "xpos.patches.add_pos_cash_movement_settings.execute",
    "xpos.patches.add_cash_movement_to_workspace.execute",
    "xpos.patches.add_customer_display_settings.execute",
    "xpos.patches.reorganize_pos_profile_sections.execute",
]

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

fixtures = [
    {
        "doctype": "Custom Field",
        "filters": [
            [
                "name",
                "in",
                (
                    "Sales Invoice-posa_pos_opening_shift",
                    "POS Invoice-posa_pos_opening_shift",
                    "Item Barcode-posa_uom",
                    "POS Profile-posa_pos_awesome_settings",
                    "POS Profile-posa_section_pricing_controls",
                    "POS Profile-posa_section_sales_returns",
                    "POS Profile-posa_section_sales_purchase",
                    "POS Profile-posa_section_inventory_controls",
                    "POS Profile-posa_section_print_delivery",
                    "POS Profile-posa_section_cash_movement",
                    "POS Profile-posa_allow_delete",
                    "POS Profile-posa_allow_user_to_edit_rate",
                    "POS Profile-posa_allow_user_to_edit_additional_discount",
                    "POS Profile-posa_allow_user_to_edit_item_discount",
                    "POS Profile-posa_display_items_in_stock",
                    "POS Profile-posa_allow_submissions_in_background_job",
                    "POS Profile-posa_allow_partial_payment",
                    "POS Profile-posa_allow_credit_sale",
                    "POS Profile-posa_pos_awesome_advance_settings",
                    "Batch-posa_batch_price",
                    "POS Profile-posa_max_discount_allowed",
                    "POS Profile-posa_allow_return",
                    "POS Profile-posa_allow_return_without_invoice",
                    "POS Profile-posa_allow_free_batch_return",
                    "POS Profile-posa_col_1",
                    "POS Profile-create_pos_invoice_instead_of_sales_invoice",
                    "POS Invoice-posa_is_printed",
                    "Sales Invoice-posa_is_printed",
                    "Sales Invoice Reference-pos_invoice",
                    "POS Profile-posa_local_storage",
                    "POS Profile-posa_force_server_items",
                    "POS Profile-posa_cash_mode_of_payment",
                    "POS Profile-use_customer_credit",
                    "POS Profile-use_cashback",
                    "POS Profile-posa_hide_closing_shift",
                    "Customer-posa_discount",
                    "POS Profile-posa_apply_customer_discount",
                    "Sales Invoice-posa_offers",
                    "POS Invoice-posa_offers",
                    "Sales Invoice-posa_coupons",
                    "POS Invoice-posa_coupons",
                    "Sales Invoice Item-posa_offers",
                    "POS Invoice Item-posa_offers",
                    "Sales Invoice Item-posa_row_id",
                    "POS Invoice Item-posa_row_id",
                    "Sales Invoice Item-posa_offer_applied",
                    "POS Invoice Item-posa_offer_applied",
                    "Sales Invoice Item-posa_is_offer",
                    "POS Invoice Item-posa_is_offer",
                    "Sales Invoice Item-posa_is_replace",
                    "POS Invoice Item-posa_is_replace",
                    "POS Profile-posa_auto_set_batch",
                    "POS Profile-posa_search_serial_no",
                    "Sales Invoice-posa_additional_notes_section",
                    "POS Invoice-posa_additional_notes_section",
                    "Sales Invoice-posa_notes",
                    "Sales Invoice-posa_authorization_code",
                    "POS Invoice-posa_notes",
                    "POS Invoice-posa_authorization_code",
                    "Sales Invoice-posa_column_break_111",
                    "POS Invoice-posa_column_break_111",
                    "Sales Invoice-posa_delivery_date",
                    "POS Invoice-posa_delivery_date",
                    "Sales Invoice Item-posa_notes",
                    "POS Invoice Item-posa_notes",
                    "Sales Invoice Item-posa_delivery_date",
                    "POS Invoice Item-posa_delivery_date",
                    "Sales Order-posa_additional_notes_section",
                    "Sales Order-posa_notes",
                    "Sales Order Item-posa_notes",
                    "POS Profile-posa_allow_sales_order",
                    "POS Profile-custom_allow_select_sales_order",
                    "POS Profile-posa_create_only_sales_order",
                    "POS Profile-posa_column_break_112",
                    "POS Profile-posa_show_template_items",
                    "POS Profile-posa_hide_variants_items",
                    "Customer-posa_referral_code",
                    "POS Profile-posa_fetch_coupon",
                    "Company-posa_referral_section",
                    "Company-posa_auto_referral",
                    "Company-posa_column_break_22",
                    "Company-posa_customer_offer",
                    "Company-posa_primary_offer",
                    "Company-posa_referral_campaign",
                    "Customer-posa_referral_company",
                    "Customer-posa_referral_section",
                    "Customer-posa_birthday",
                    "Sales Order-posa_offers",
                    "Sales Order-posa_coupons",
                    "Sales Order Item-posa_row_id",
                    "POS Profile-posa_tax_inclusive",
                    "POS Profile-posa_use_percentage_discount",
                    "POS Profile-posa_allow_customer_purchase_order",
                    "POS Profile-posa_allow_purchase_order",
                    "POS Profile-posa_allow_purchase_receipt",
                    "POS Profile-posa_allow_create_purchase_items",
                    "POS Profile-posa_allow_create_purchase_suppliers",
                    "POS Profile-posa_allow_print_last_invoice",
                    "POS Profile-posa_display_additional_notes",
                    "POS Profile-posa_display_authorization_code",
                    "POS Profile-posa_allow_write_off_change",
                    "POS Profile-posa_new_line",
                    "POS Profile-posa_input_qty",
                    "POS Profile-posa_display_item_code",
                    "POS Profile-posa_allow_zero_rated_items",
                    "POS Profile-posa_allow_print_draft_invoices",
                    "Address-posa_delivery_charges",
                    "Sales Invoice-posa_delivery_charges",
                    "Sales Invoice-posa_delivery_charges_rate",
                    "POS Invoice-posa_delivery_charges",
                    "POS Invoice-posa_delivery_charges_rate",
                    "POS Profile-posa_auto_set_delivery_charges",
                    "POS Profile-posa_use_delivery_charges",
                    "POS Profile-hide_expected_amount",
                    "POS Profile-posa_display_discount_percentage",
                    "POS Profile-posa_display_discount_amount",
                    "POS Profile-posa_allow_change_posting_date",
                    "POS Profile-posa_default_card_view",
                    "POS Profile-posa_default_sales_order",
                    "POS Profile-column_break_dqsba",
                    "POS Profile-posa_use_server_cache",
                    "POS Profile-posa_server_cache_duration",
                    "POS Profile-posa_allow_duplicate_customer_names",
                    "POS Profile-column_break_anyol",
                    "POS Profile-pose_use_limit_search",
                    "POS Profile-posa_search_batch_no",
                    "POS Profile-pos_awesome_payments",
                    "POS Profile-posa_use_pos_awesome_payments",
                    "POS Profile-posa_allow_make_new_payments",
                    "POS Profile-posa_allow_reconcile_payments",
                    "POS Profile-column_break_uolvm",
                    "POS Profile-posa_allow_mpesa_reconcile_payments",
                    "POS Profile-posa_enable_camera_scanning",
                    "POS Profile-posa_camera_scan_type",
                    "POS Profile-posa_language",
                    "POS Profile-posa_enable_return_validity",
                    "POS Profile-posa_return_validity_days",
                    "POS Profile-posa_enable_cash_movement",
                    "POS Profile-posa_allow_pos_expense",
                    "POS Profile-posa_allow_cash_deposit",
                    "POS Profile-posa_default_expense_account",
                    "POS Profile-posa_allowed_expense_accounts",
                    "POS Profile-posa_default_source_account",
                    "POS Profile-posa_allow_source_account_override",
                    "POS Profile-posa_allowed_source_accounts",
                    "POS Profile-posa_back_office_cash_account",
                    "POS Profile-posa_allow_cancel_submitted_cash_movement",
                    "POS Profile-posa_allow_delete_cancelled_cash_movement",
                    "POS Profile-posa_require_cash_movement_remarks",
                    "POS Profile-posa_cash_movement_max_amount",
                    "POS Settings-posa_enable_return_validity",
                    "POS Settings-posa_return_validity_days",
                    "POS Invoice-posa_return_valid_upto",
                    "Sales Invoice-posa_return_valid_upto",
                ),
            ]
        ],
    },
    {
        "doctype": "Property Setter",
        "filters": [
            [
                "name",
                "in",
                (
                    "Sales Invoice-posa_pos_opening_shift-no_copy",
                    "POS Invoice-posa_pos_opening_shift-no_copy",
                    "Sales Invoice Reference-sales_invoice-reqd",
                    "Sales Invoice-update_outstanding_for_self-default",
                ),
            ]
        ],
    },
    {
        "doctype": "Custom Field",
        "filters": [
            [
                "name",
                "in",
                [
                    "POS Profile-posa_allow_multi_currency",
                    "POS Profile-posa_decimal_precision",
                ],
            ]
        ],
    },
]

# Patches to run after migrate
patches_txt = "xpos/patches.txt"

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True
