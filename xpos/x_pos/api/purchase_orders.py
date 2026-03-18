# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate, getdate
from erpnext.accounts.party import get_party_account


from .utils import get_active_pos_profile, get_default_warehouse



def _resolve_pos_profile(pos_profile):
    if isinstance(pos_profile, dict):
        return pos_profile

    if isinstance(pos_profile, str):
        raw_value = pos_profile.strip()
        if raw_value:
            try:
                decoded = json.loads(raw_value)
            except Exception:
                decoded = raw_value

            if isinstance(decoded, dict):
                return decoded
            if isinstance(decoded, str) and decoded:
                return frappe.get_doc("POS Profile", decoded).as_dict()

    profile = get_active_pos_profile()
    if not profile:
        frappe.throw(_("POS Profile is required to create purchase documents."))
    return profile


def _ensure_allowed(profile, flag, label):
    if not cint(profile.get(flag)):
        frappe.throw(_("{0} is disabled for this POS Profile.").format(label))


def _resolve_supplier(supplier_value):
    if isinstance(supplier_value, dict):
        supplier_value = (
            supplier_value.get("name")
            or supplier_value.get("supplier_name")
            or supplier_value.get("supplier")
        )

    supplier = str(supplier_value or "").strip()
    if not supplier:
        return None

    if frappe.db.exists("Supplier", supplier):
        return supplier

    supplier_by_label = frappe.db.get_value(
        "Supplier", {"supplier_name": supplier}, "name"
    )
    if supplier_by_label:
        return supplier_by_label

    # Fallback: case-insensitive lookup by name/supplier_name
    ci_match = frappe.db.sql(
        """
        select name
        from `tabSupplier`
        where lower(name) = lower(%s)
           or lower(supplier_name) = lower(%s)
        limit 1
        """,
        (supplier, supplier),
    )
    if ci_match and ci_match[0]:
        return ci_match[0][0]

    return None


def _resolve_buying_price_list():
    buying_price_list = frappe.db.get_single_value("Buying Settings", "buying_price_list")
    if not buying_price_list:
        buying_price_list = frappe.db.get_value("Price List", {"buying": 1}, "name")
    
    if not buying_price_list:
        # Fallback to standard default if exists
        if frappe.db.exists("Price List", "Standard Buying"):
            buying_price_list = "Standard Buying"

    if not buying_price_list:
        frappe.throw(
            _("No buying price list found. Please configure one in Buying Settings or create a Price List with 'Buying' enabled.")
        )

    return buying_price_list


def _upsert_item_price(item_code, price_list, rate, uom=None, buying=False, selling=False):
    if not price_list or rate is None:
        return None

    rate = flt(rate)
    filters = {"item_code": item_code, "price_list": price_list}
    if uom:
        filters["uom"] = uom

    existing = frappe.db.get_value("Item Price", filters, "name")
    if existing:
        doc = frappe.get_doc("Item Price", existing)
        doc.price_list_rate = rate
        doc.flags.ignore_permissions = True
        doc.save()
        return doc.name

    doc = frappe.get_doc(
        {
            "doctype": "Item Price",
            "price_list": price_list,
            "item_code": item_code,
            "price_list_rate": rate,
            "buying": 1 if buying else 0,
            "selling": 1 if selling else 0,
            "uom": uom,
        }
    )
    doc.flags.ignore_permissions = True
    doc.insert()
    return doc.name


def _build_items_map(items):
    items_by_code = {}
    for row in items or []:
        item_code = row.get("item_code")
        if not item_code:
            continue
        items_by_code.setdefault(item_code, []).append(row)
    return items_by_code


def _resolve_input_row(items_by_code, item_code):
    rows = items_by_code.get(item_code)
    if not rows:
        return {}
    return rows.pop(0)


def _create_purchase_receipt(po_doc, payload, default_warehouse, transaction_date):
    receipt_date = payload.get("receipt_date") or payload.get("posting_date") or transaction_date
    receipt = frappe.get_doc(
        {
            "doctype": "Purchase Receipt",
            "supplier": po_doc.supplier,
            "company": po_doc.company,
            "posting_date": receipt_date,
            "currency": po_doc.currency,
        }
    )
    if default_warehouse:
        receipt.set_warehouse = default_warehouse

    items_by_code = _build_items_map(payload.get("items"))

    for po_item in po_doc.items:
        payload_row = _resolve_input_row(items_by_code, po_item.item_code)
        if payload.get("receive") and not payload_row.get("received_qty") and not payload_row.get("receive_qty"):
            payload_row["receive_qty"] = po_item.qty
            payload_row["received_qty"] = po_item.qty
        received_qty = flt(
            payload_row.get("received_qty")
            or payload_row.get("receive_qty")
            or payload_row.get("qty")
            or po_item.qty
        )
        if received_qty <= 0:
            continue

        receipt.append(
            "items",
            {
                "item_code": po_item.item_code,
                "item_name": po_item.item_name,
                "qty": received_qty,
                "uom": po_item.uom,
                "stock_uom": po_item.stock_uom,
                "conversion_factor": po_item.conversion_factor or 1,
                "rate": po_item.rate,
                "warehouse": po_item.warehouse or default_warehouse,
                "purchase_order": po_doc.name,
                "purchase_order_item": po_item.name,
                "schedule_date": po_item.schedule_date,
            },
        )
 
    if not receipt.items:
        frappe.throw(_("No items to receive. Please enter received quantities."))

    receipt.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    receipt.insert()
    receipt.submit()
    return receipt.name


@frappe.whitelist()
def create_supplier(data):
    payload = json.loads(data) if isinstance(data, str) else data
    profile = _resolve_pos_profile(payload.get("pos_profile"))
    _ensure_allowed(profile, "allow_create_purchase_suppliers", _("Create suppliers"))

    supplier_name = payload.get("supplier_name") or payload.get("supplier")
    if not supplier_name:
        frappe.throw(_("Supplier name is required."))

    existing = frappe.db.get_value("Supplier", {"supplier_name": supplier_name}, "name")
    if existing:
        return frappe.get_doc("Supplier", existing).as_dict()

    supplier_group = payload.get("supplier_group") or frappe.db.get_value(
        "Supplier Group", {"is_group": 0}, "name"
    )
    supplier_group = supplier_group or "All Supplier Groups"

    supplier = frappe.get_doc(
        {
            "doctype": "Supplier",
            "supplier_name": supplier_name,
            "supplier_group": supplier_group,
            "supplier_type": payload.get("supplier_type") or "Company",
            "tax_id": payload.get("tax_id"),
            "mobile_no": payload.get("mobile_no"),
            "email_id": payload.get("email_id"),
        }
    )
    supplier.flags.ignore_permissions = True
    supplier.insert()
    return supplier.as_dict()


@frappe.whitelist()
def search_suppliers(search_text=None, limit=20):
    filters = {"disabled": 0}
    or_filters = None
    if search_text:
        like_value = f"%{search_text}%"
        or_filters = {
            "name": ["like", like_value],
            "supplier_name": ["like", like_value],
        }

    suppliers = frappe.get_all(
        "Supplier",
        filters=filters,
        or_filters=or_filters,
        fields=["name", "supplier_name", "supplier_group", "supplier_type", "default_currency"],
        order_by="supplier_name asc",
        limit_page_length=limit,
    )
    return suppliers


@frappe.whitelist()
def get_buying_price_list():
    return _resolve_buying_price_list()


@frappe.whitelist()
def create_purchase_item(data):
    payload = json.loads(data) if isinstance(data, str) else data
    profile = _resolve_pos_profile(payload.get("pos_profile"))
    _ensure_allowed(profile, "allow_create_purchase_items", _("Create items"))

    item_code = payload.get("item_code") or payload.get("item_name")
    item_name = payload.get("item_name") or item_code
    stock_uom = payload.get("stock_uom")

    if not item_code:
        frappe.throw(_("Item code is required."))
    if not stock_uom:
        frappe.throw(_("Stock UOM is required."))

    existing = frappe.db.exists("Item", item_code)
    if existing:
        return frappe.get_doc("Item", item_code).as_dict()

    item_group = payload.get("item_group") or frappe.db.get_value(
        "Item Group", {"is_group": 0}, "name"
    )
    item_group = item_group or "All Item Groups"

    barcode = payload.get("barcode")
    if barcode and frappe.db.exists("Item Barcode", {"barcode": barcode}):
        frappe.throw(_("Barcode {0} already exists.").format(barcode))

    item_doc = frappe.get_doc(
        {
            "doctype": "Item",
            "item_code": item_code,
            "item_name": item_name,
            "item_group": item_group,
            "stock_uom": stock_uom,
            "is_stock_item": 1,
            "disabled": 0,
            "default_warehouse": profile.get("warehouse"),
            "standard_rate": flt(payload.get("buying_price") or 0),
        }
    )

    if barcode:
        item_doc.append("barcodes", {"barcode": barcode})

    item_doc.flags.ignore_permissions = True
    item_doc.flags.ignore_mandatory = True
    item_doc.insert()

    selling_price_list = payload.get("selling_price_list") or profile.get("selling_price_list")
    buying_price_list = payload.get("buying_price_list") or _resolve_buying_price_list()

    selling_price = payload.get("selling_price")
    buying_price = payload.get("buying_price")

    _upsert_item_price(
        item_code,
        selling_price_list,
        selling_price,
        uom=stock_uom,
        selling=True,
    )
    _upsert_item_price(
        item_code,
        buying_price_list,
        buying_price,
        uom=stock_uom,
        buying=True,
    )

    if buying_price is not None:
        item_doc.db_set("standard_rate", flt(buying_price), update_modified=False)

    return {
        "item": item_doc.as_dict(),
        "selling_price_list": selling_price_list,
        "buying_price_list": buying_price_list,
    }


def _get_mode_of_payment_account(mode, company):
    account = frappe.db.get_value(
        "Mode of Payment Account", {"parent": mode, "company": company}, "default_account"
    )
    if not account:
        frappe.throw(
            _("Please set default account for Mode of Payment {0} in company {1}").format(
                mode, company
            )
        )
    return account


def _create_payment_entry(reference_doc, payments, company, transaction_date):
    if not payments:
        return []

    created_payments = []

    # Check if reference is PO or PI
    ref_doctype = reference_doc.doctype
    ref_name = reference_doc.name

    # Determine outstanding amount
    outstanding_amount = 0
    if ref_doctype == "Purchase Invoice":
        outstanding_amount = reference_doc.outstanding_amount
    else:
        # For Purchase Order, use grand_total (assuming advance payment for new PO)
        # Or calculate if some advance was already made, but here it's new.
        outstanding_amount = reference_doc.grand_total

    for pay in payments:
        amount = flt(pay.get("amount"))
        mode = pay.get("mode_of_payment")

        if amount <= 0:
            continue

        paid_from_account = _get_mode_of_payment_account(mode, company)

        pe = frappe.new_doc("Payment Entry")
        pe.payment_type = "Pay"
        pe.company = company
        pe.posting_date = transaction_date
        pe.mode_of_payment = mode
        pe.party_type = "Supplier"
        pe.party = reference_doc.supplier

        pe.paid_from = paid_from_account

        # Fetch party account
        pe.paid_to = get_party_account("Supplier", reference_doc.supplier, company)
        if not pe.paid_to:
            frappe.throw(_("Please set Default Payable Account in Company {0}").format(company))

        pe.paid_amount = amount
        pe.received_amount = amount 
        # Note: If currencies differ, conversion handling is needed. 
        # Assuming base currency for simplified POS flow or that user enters converted amount.
        
        # References
        # Allocate only up to outstanding amount
        allocated_amount = 0
        if outstanding_amount > 0:
            allocated_amount = min(amount, outstanding_amount)
            outstanding_amount -= allocated_amount
        
        if allocated_amount > 0:
            pe.append("references", {
                "reference_doctype": ref_doctype,
                "reference_name": ref_name,
                "allocated_amount": allocated_amount
            })

        pe.flags.ignore_permissions = True
        pe.insert()
        pe.submit()
        created_payments.append(pe.name)

    return created_payments


@frappe.whitelist()
def create_purchase_order(data):

    payload = json.loads(data) if isinstance(data, str) else data
    profile = _resolve_pos_profile(payload.get("pos_profile"))
    _ensure_allowed(profile, "allow_purchase_order", _("Purchase orders"))

    receive_now = cint(payload.get("receive"))
    if receive_now:
        _ensure_allowed(profile, "allow_purchase_receipt", _("Receive stock"))

    supplier_input = payload.get("supplier")
    if not supplier_input:
        frappe.throw(_("Supplier is required."))

    supplier = _resolve_supplier(supplier_input)
    if not supplier:
        frappe.throw(_("Supplier {0} was not found.").format(supplier_input))

    company = payload.get("company") or profile.get("company") or frappe.defaults.get_default("company")
    if not company:
        frappe.throw(_("Company is required."))

    warehouse = payload.get("warehouse") or profile.get("warehouse") or get_default_warehouse(company)
    transaction_date = payload.get("transaction_date") or nowdate()
    schedule_date = payload.get("schedule_date") or transaction_date

    items = payload.get("items") or []
    if not items:
        frappe.throw(_("Purchase order requires at least one item."))

    # Get supplier currency (NEW CODE)
    supplier_doc = frappe.get_doc("Supplier", supplier)
    supplier_currency = supplier_doc.default_currency
    if not supplier_currency:
        # Fallback to company currency if supplier has no default
        supplier_currency = frappe.get_value("Company", company, "default_currency")

    # Validate price list currency matches (RECOMMENDED)
    buying_price_list = _resolve_buying_price_list()
    price_list_currency = frappe.get_value("Price List", buying_price_list, "currency")

    # If currencies don't match, try to find a matching one
    if price_list_currency and price_list_currency != supplier_currency:
        alternative_price_list = frappe.db.get_value(
            "Price List",
            {"currency": supplier_currency, "buying": 1, "enabled": 1},
            "name"
        )
        if alternative_price_list:
            buying_price_list = alternative_price_list

    po_doc = frappe.get_doc({
        "doctype": "Purchase Order",
        "supplier": supplier,
        "company": company,
        "transaction_date": transaction_date,
        "schedule_date": schedule_date,
        "currency": supplier_currency,
        "buying_price_list": buying_price_list,
    })

    # Set XPOS custom header fields
    for cf in ("custom_alias_name", "custom_po_category", "custom_po_type",
               "custom_po_department", "custom_po_remarks", "custom_zero_qty"):
        val = payload.get(cf)
        if val:
            po_doc.set(cf, val)
    
    if warehouse:
        po_doc.set_warehouse = warehouse

    item_codes = [row.get("item_code") for row in items if row.get("item_code")]
    if item_codes:
        item_meta = frappe.get_all(
            "Item",
            filters={"name": ["in", item_codes]},
            fields=["name", "item_name", "stock_uom"],
        )
        item_map = {row.name: row for row in item_meta}
    else:
        item_map = {}

    for row in items:
        item_code = row.get("item_code")
        if not item_code:
            continue

        qty = flt(row.get("qty"))
        if qty <= 0:
            continue

        meta = item_map.get(item_code)
        stock_uom = row.get("stock_uom") or (meta.stock_uom if meta else None)
        item_name = row.get("item_name") or (meta.item_name if meta else item_code)
        uom = row.get("uom") or stock_uom
        conversion_factor = flt(row.get("conversion_factor") or 1)
        if not conversion_factor:
            conversion_factor = 1

        po_doc.append(
            "items",
            {
                "item_code": item_code,
                "item_name": item_name,
                "qty": qty,
                "uom": uom,
                "stock_uom": stock_uom,
                "conversion_factor": conversion_factor,
                "rate": flt(row.get("rate")),
                "warehouse": row.get("warehouse") or warehouse,
                "schedule_date": schedule_date,
                "custom_alias": row.get("custom_alias") or item_name,
                "custom_stock_in_hand": flt(row.get("custom_stock_in_hand")),
                "custom_transit_stock": flt(row.get("custom_transit_stock")),
                "custom_required_loose": flt(row.get("custom_required_loose")),
                "custom_required_packs": flt(row.get("custom_required_packs")),
                "custom_generic_item": row.get("custom_generic_item") or "",
                "custom_category": row.get("custom_category") or "",
                "custom_class": row.get("custom_class") or "",
                "custom_item_packing": row.get("custom_item_packing") or "",
                "custom_pack_units": flt(row.get("custom_pack_units")),
            },
        )

    if not po_doc.items:
        frappe.throw(_("Purchase order requires at least one item with quantity."))

    po_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    po_doc.save()

    try:
        if cint(payload.get("submit", 1)):
            po_doc.submit()

        receipt_name = None
        receipt_doc = None
        if receive_now:
            receipt_name = _create_purchase_receipt(po_doc, payload, warehouse, transaction_date)
            if receipt_name:
                receipt_doc = frappe.get_doc("Purchase Receipt", receipt_name)
        invoice_name = None
        if cint(payload.get("create_invoice", 0)):
            invoice_name = _create_purchase_invoice(
                po_doc, payload, warehouse, transaction_date, receipt_doc=receipt_doc
            )

        payments = payload.get("payments")
        if payments:
            # Use PI if created, otherwise PO
            ref_doc = frappe.get_doc("Purchase Invoice", invoice_name) if invoice_name else po_doc
            _create_payment_entry(ref_doc, payments, company, transaction_date)

        return {
            "purchase_order": po_doc.name,
            "purchase_receipt": receipt_name,
            "purchase_invoice": invoice_name,
        }
    except Exception as err:
        frappe.log_error(frappe.get_traceback(), _("X POS Purchase Order Flow Failed"))
        frappe.throw(
            _("Purchase Order {0} processing failed: {1}").format(
                po_doc.name, str(err)
            )
        )


@frappe.whitelist()
def search_items(search_text=None, limit=20):
    limit = cint(limit) or 20
    search_text = (search_text or "").strip()

    if search_text:
        like_value = f"%{search_text}%"
        # Search by item_code, item_name and barcode using SQL for reliable OR logic
        items = frappe.db.sql(
            """
            SELECT DISTINCT i.name, i.item_name, i.stock_uom, i.standard_rate,
                   i.item_group
            FROM `tabItem` i
            LEFT JOIN `tabItem Barcode` ib ON ib.parent = i.name
            WHERE i.disabled = 0
              AND (
                i.name LIKE %(like)s
                OR i.item_name LIKE %(like)s
                OR ib.barcode LIKE %(like)s
              )
            ORDER BY i.item_name ASC
            LIMIT %(limit)s
            """,
            {"like": like_value, "limit": limit},
            as_dict=True,
        )
    else:
        items = frappe.get_all(
            "Item",
            filters={"disabled": 0},
            fields=["name", "item_name", "stock_uom", "standard_rate", "item_group"],
            limit_page_length=limit,
            order_by="item_name asc",
        )

    item_codes = [it.get("name") for it in items if it.get("name")]
    uom_rows = []
    if item_codes:
        uom_rows = frappe.get_all(
            "UOM Conversion Detail",
            filters={"parent": ["in", item_codes]},
            fields=["parent", "uom", "conversion_factor"],
        )
    uom_map = {}
    for row in uom_rows:
        uom_map.setdefault(row.parent, []).append(
            {"uom": row.uom, "conversion_factor": row.conversion_factor}
        )

    # Also fetch barcodes for each item
    barcode_map = {}
    if item_codes:
        barcode_rows = frappe.get_all(
            "Item Barcode",
            filters={"parent": ["in", item_codes]},
            fields=["parent", "barcode"],
        )
        for row in barcode_rows:
            barcode_map.setdefault(row.parent, []).append(row.barcode)

    results = []
    for it in items:
        item_code = it.get("name")
        stock_uom = it.get("stock_uom")
        uoms = uom_map.get(item_code, [])
        if stock_uom and not any(u.get("uom") == stock_uom for u in uoms):
            uoms.append({"uom": stock_uom, "conversion_factor": 1})
        barcodes = barcode_map.get(item_code, [])
        results.append(
            {
                "item_code": item_code,
                "item_name": it.get("item_name"),
                "stock_uom": stock_uom,
                "item_uoms": uoms,
                "standard_rate": it.get("standard_rate"),
                "barcode": barcodes[0] if barcodes else None,
                "barcodes": barcodes,
                "item_group": it.get("item_group"),
            }
        )
    return results


@frappe.whitelist()
def search_item_by_barcode(barcode, pos_profile=None):
    """Search item specifically by barcode for purchasing."""
    if not barcode:
        return None

    price_list = _resolve_buying_price_list()

    def _get_buying_rate(item_code):
        rate = 0
        if price_list:
            rate = frappe.db.get_value(
                "Item Price",
                {"item_code": item_code, "price_list": price_list, "buying": 1},
                "price_list_rate",
            )
        if not rate:
            rate = frappe.db.get_value("Item", item_code, "standard_rate")
        return flt(rate)

    # Check Item Barcode table
    barcode_data = frappe.db.get_value(
        "Item Barcode",
        {"barcode": barcode},
        ["parent as item_code", "barcode", "uom"],
        as_dict=True,
    )

    if barcode_data:
        item = frappe.get_cached_doc("Item", barcode_data.item_code)
        return {
            "item_code": item.name,
            "item_name": item.item_name,
            "barcode": barcode_data.barcode,
            "uom": barcode_data.uom or item.stock_uom,
            "stock_uom": item.stock_uom,
            "standard_rate": _get_buying_rate(item.name),
        }

    # Check if barcode matches item_code directly
    if frappe.db.exists("Item", barcode):
        item = frappe.get_cached_doc("Item", barcode)
        return {
            "item_code": item.name,
            "item_name": item.item_name,
            "barcode": barcode,
            "uom": item.stock_uom,
            "stock_uom": item.stock_uom,
            "standard_rate": _get_buying_rate(item.name),
        }

    return None


def _create_purchase_invoice(po_doc, payload, default_warehouse, transaction_date, receipt_doc=None):
    invoice_date = payload.get("invoice_date") or payload.get("invoice_posting_date") or transaction_date
    invoice = frappe.get_doc(
        {
            "doctype": "Purchase Invoice",
            "supplier": po_doc.supplier,
            "company": po_doc.company,
            "posting_date": invoice_date,
            "purchase_order": po_doc.name,
            "currency": payload.get("currency") or po_doc.currency,
        }
    )
    if default_warehouse:
        invoice.set_warehouse = default_warehouse

    items_by_code = _build_items_map(payload.get("items"))
    receipt_items = {
        item.purchase_order_item: item for item in (receipt_doc.items or [])
    } if receipt_doc else {}
    for po_item in po_doc.items:
        payload_row = _resolve_input_row(items_by_code, po_item.item_code)
        qty = flt(payload_row.get("qty") or po_item.qty)
        if qty <= 0:
            continue
        invoice_item = {
            "item_code": po_item.item_code,
            "item_name": po_item.item_name,
            "qty": qty,
            "uom": po_item.uom,
            "stock_uom": po_item.stock_uom,
            "conversion_factor": po_item.conversion_factor or 1,
            "rate": po_item.rate,
            "warehouse": po_item.warehouse or default_warehouse,
            "purchase_order": po_doc.name,
            "po_detail": po_item.name,
            "schedule_date": po_item.schedule_date,
        }
        receipt_item = receipt_items.get(po_item.name)
        if receipt_item and receipt_doc:
            invoice_item["purchase_receipt"] = receipt_doc.name
            invoice_item["pr_detail"] = receipt_item.name
        invoice.append("items", invoice_item)

    if not invoice.items:
        frappe.throw(_("No items to invoice. Please ensure there are items on the Purchase Order."))

    invoice.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    invoice.insert()
    invoice.submit()
    return invoice.name

@frappe.whitelist()
def get_pending_receipts(warehouse=None, limit=50):
    """Get Purchase Orders that are pending stock receipt."""
    filters = {
        "docstatus": 1,
        "status": ["in", ["To Receive and Bill", "To Receive"]],
        "per_received": ["<", 100],
    }
    if warehouse:
        # Filter POs that have items for this warehouse
        po_names = frappe.db.sql_list(
            """
            SELECT DISTINCT parent FROM `tabPurchase Order Item`
            WHERE warehouse = %s AND docstatus = 1
            """,
            warehouse,
        )
        if po_names:
            filters["name"] = ["in", po_names]
        else:
            return []

    orders = frappe.get_all(
        "Purchase Order",
        filters=filters,
        fields=[
            "name", "supplier", "supplier_name", "company",
            "transaction_date", "grand_total", "status",
            "per_received", "per_billed",
        ],
        order_by="transaction_date desc",
        limit_page_length=cint(limit) or 50,
    )
    
    for order in orders:
        order["items"] = frappe.get_all(
            "Purchase Order Item",
            filters={"parent": order["name"], "docstatus": 1},
            fields=[
                "name as po_detail", "item_code", "item_name",
                "qty", "received_qty", "rate", "uom", "stock_uom",
                "conversion_factor", "warehouse",
            ],
        )
        for item in order["items"]:
            item["pending_qty"] = flt(item["qty"]) - flt(item["received_qty"])

    return orders


@frappe.whitelist()
def get_purchase_order_detail(purchase_order):
    """Get a single Purchase Order with its items for receiving."""
    
    if not purchase_order or not frappe.db.exists("Purchase Order", purchase_order):
        frappe.throw(_("Purchase Order {0} does not exist.").format(purchase_order))

    po = frappe.get_doc("Purchase Order", purchase_order)
    items = []
    for item in po.items:
        items.append({
            "po_detail": item.name,
            "item_code": item.item_code,
            "item_name": item.item_name,
            "qty": flt(item.qty),
            "received_qty": flt(item.received_qty),
            "pending_qty": flt(item.qty) - flt(item.received_qty),
            "rate": flt(item.rate),
            "uom": item.uom,
            "stock_uom": item.stock_uom,
            "conversion_factor": flt(item.conversion_factor) or 1,
            "warehouse": item.warehouse,
        })

    return {
        "name": po.name,
        "supplier": po.supplier,
        "supplier_name": po.supplier_name,
        "company": po.company,
        "transaction_date": str(po.transaction_date),
        "grand_total": flt(po.grand_total),
        "status": po.status,
        "per_received": flt(po.per_received),
        "per_billed": flt(po.per_billed),
        "items": items,
    }


@frappe.whitelist()
def receive_stock(data):
    """
    Create a Purchase Receipt from a Purchase Order.
    Supports partial receipt and rejection.

    data = {
        "purchase_order": "PO-00001",
        "warehouse": "Stores - R",
        "items": [
            {
                "po_detail": "row-id",
                "item_code": "ITEM-001",
                "accept_qty": 10,
                "reject_qty": 2,
                "rejected_warehouse": "Rejected - R"  // optional
            }
        ],
        "remarks": "Some items damaged"
    }
    """
    payload = json.loads(data) if isinstance(data, str) else data

    po_name = payload.get("purchase_order")
    if not po_name:
        frappe.throw(_("Purchase Order is required."))

    po = frappe.get_doc("Purchase Order", po_name)
    if po.docstatus != 1:
        frappe.throw(_("Purchase Order {0} is not submitted.").format(po_name))

    warehouse = payload.get("warehouse") or get_default_warehouse()
    items_data = payload.get("items", [])
    remarks = payload.get("remarks", "")

    if not items_data:
        frappe.throw(_("No items to receive."))

    receipt = frappe.get_doc({
        "doctype": "Purchase Receipt",
        "supplier": po.supplier,
        "company": po.company,
        "posting_date": nowdate(),
        "purchase_order": po_name,
    })

    if remarks:
        receipt.remarks = remarks

    po_items_map = {item.name: item for item in po.items}

    has_rejections = False
    for row in items_data:
        po_detail = row.get("po_detail")
        po_item = po_items_map.get(po_detail)
        if not po_item:
            continue

        accept_qty = flt(row.get("accept_qty", 0))
        reject_qty = flt(row.get("reject_qty", 0))

        if accept_qty <= 0 and reject_qty <= 0:
            continue

        total_qty = accept_qty + reject_qty
        item_warehouse = row.get("warehouse") or po_item.warehouse or warehouse

        receipt_item = {
            "item_code": po_item.item_code,
            "item_name": po_item.item_name,
            "qty": total_qty,
            "uom": po_item.uom,
            "stock_uom": po_item.stock_uom,
            "conversion_factor": po_item.conversion_factor or 1,
            "rate": po_item.rate,
            "warehouse": item_warehouse,
            "purchase_order": po_name,
            "purchase_order_item": po_detail,
            "schedule_date": str(po_item.schedule_date) if po_item.schedule_date else nowdate(),
        }

        if reject_qty > 0:
            has_rejections = True
            receipt_item["rejected_qty"] = reject_qty
            receipt_item["qty"] = accept_qty
            rejected_wh = row.get("rejected_warehouse")
            if rejected_wh:
                receipt_item["rejected_warehouse"] = rejected_wh

        receipt.append("items", receipt_item)

    if not receipt.items:
        frappe.throw(_("No valid items to receive."))

    receipt.flags.ignore_permissions = True
    receipt.insert()
    receipt.submit()

    result = {
        "purchase_receipt": receipt.name,
        "purchase_order": po_name,
        "status": "completed",
        "has_rejections": has_rejections,
        "items_received": len(receipt.items),
    }

    return result


@frappe.whitelist()
def get_stock_and_transit(item_codes, warehouse=None):
    """
    Get stock in hand and transit stock for given item codes.

    Args:
        item_codes: list of item codes
        warehouse: optional warehouse filter

    Returns:
        dict keyed by item_code with stock_in_hand and transit_stock
    """
    if isinstance(item_codes, str):
        item_codes = json.loads(item_codes)

    if not item_codes:
        return {}

    result = {}

    # Get actual qty (stock in hand) from Bin
    bin_filters = {"item_code": ["in", item_codes]}
    if warehouse:
        bin_filters["warehouse"] = warehouse

    bins = frappe.get_all(
        "Bin",
        filters=bin_filters,
        fields=["item_code", "actual_qty", "ordered_qty"],
        group_by="item_code" if not warehouse else None,
    )

    # If no warehouse filter, aggregate across all warehouses
    stock_map = {}
    ordered_map = {}
    for b in bins:
        stock_map[b.item_code] = flt(stock_map.get(b.item_code, 0)) + flt(b.actual_qty)
        ordered_map[b.item_code] = flt(ordered_map.get(b.item_code, 0)) + flt(b.ordered_qty)

    # Get transit stock: qty from submitted POs not yet received
    transit_data = frappe.db.sql(
        """
        SELECT poi.item_code,
               SUM(poi.qty - poi.received_qty) as transit_qty
        FROM `tabPurchase Order Item` poi
        INNER JOIN `tabPurchase Order` po ON po.name = poi.parent
        WHERE poi.item_code IN %(item_codes)s
          AND po.docstatus = 1
          AND po.status NOT IN ('Completed', 'Cancelled', 'Closed')
          AND poi.qty > poi.received_qty
        GROUP BY poi.item_code
        """,
        {"item_codes": item_codes},
        as_dict=True,
    )

    transit_map = {}
    for row in transit_data:
        transit_map[row.item_code] = flt(row.transit_qty)

    for code in item_codes:
        result[code] = {
            "stock_in_hand": flt(stock_map.get(code, 0)),
            "transit_stock": flt(transit_map.get(code, 0)),
        }

    return result


@frappe.whitelist()
def get_category_items(supplier, po_category, warehouse=None):
    """
    Get items based on PO category and supplier.
    
    Categories:
    - Against Purchase Quotation: Items from supplier's purchase quotations
    - Against Sale Order: Items from pending sales orders
    - Projection Period: Items based on sales projection
    - Reorder Level: Items below reorder level
    
    Args:
        supplier: Supplier name
        po_category: PO Category string
        warehouse: Optional warehouse filter
        
    Returns:
        List of items with qty suggestions
    """
    if not supplier or not po_category:
        frappe.throw(_("Supplier and PO Category are required."))
    
    items = []
    
    if po_category == "Against Purchase Quotation":
        # Get items from supplier's pending purchase quotations
        items = _get_items_from_purchase_quotations(supplier)
        
    elif po_category == "Against Sale Order":
        # Get items from pending sales orders that need to be purchased
        items = _get_items_from_sales_orders(supplier, warehouse)
        
    elif po_category == "Projection Period":
        # Get items based on sales projection (last 30 days average * projection factor)
        items = _get_items_from_projection(supplier, warehouse)
        
    elif po_category == "Reorder Level":
        # Get items below reorder level for this supplier
        items = _get_items_below_reorder(supplier, warehouse)
    
    # Enrich items with UOM data
    if items:
        item_codes = [i.get("item_code") for i in items]
        uom_data = _get_item_uoms(item_codes)
        for item in items:
            item["item_uoms"] = uom_data.get(item.get("item_code"), [])
    
    return items


def _get_items_from_purchase_quotations(supplier):
    """Get items from supplier's pending purchase quotations."""
    quotations = frappe.get_all(
        "Supplier Quotation",
        filters={
            "supplier": supplier,
            "docstatus": 1,
            "status": ["not in", ["Cancelled", "Expired", "Ordered"]],
        },
        fields=["name"],
        limit=10,
    )
    
    items_map = {}
    for sq in quotations:
        sq_items = frappe.get_all(
            "Supplier Quotation Item",
            filters={"parent": sq.name},
            fields=["item_code", "item_name", "qty", "rate", "stock_uom", "uom"],
        )
        for item in sq_items:
            if item.item_code not in items_map:
                items_map[item.item_code] = {
                    "item_code": item.item_code,
                    "item_name": item.item_name,
                    "stock_uom": item.stock_uom or item.uom,
                    "standard_rate": flt(item.rate),
                    "qty": flt(item.qty),
                    "item_group": frappe.get_value("Item", item.item_code, "item_group"),
                }
            else:
                items_map[item.item_code]["qty"] += flt(item.qty)
    
    return list(items_map.values())


def _get_items_from_sales_orders(supplier, warehouse=None):
    """Get items from pending sales orders that this supplier can supply."""
    # Get items that this supplier provides (from Item Supplier or Item Default)
    supplier_items = set()
    
    # From Item Supplier child table
    supplier_item_rows = frappe.get_all(
        "Item Supplier",
        filters={"supplier": supplier},
        fields=["parent"],
    )
    for row in supplier_item_rows:
        supplier_items.add(row.parent)
    
    # From Item Default child table
    default_supplier_rows = frappe.get_all(
        "Item Default",
        filters={"default_supplier": supplier},
        fields=["parent"],
    )
    for row in default_supplier_rows:
        supplier_items.add(row.parent)
    
    if not supplier_items:
        return []
    
    # Get pending sales order items for these items
    filters = {
        "docstatus": 1,
        "status": ["not in", ["Completed", "Cancelled", "Closed"]],
    }
    
    so_items = frappe.db.sql(
        """
        SELECT 
            soi.item_code,
            soi.item_name,
            soi.stock_uom,
            SUM(soi.qty - soi.delivered_qty) as pending_qty,
            MAX(soi.rate) as rate
        FROM `tabSales Order Item` soi
        INNER JOIN `tabSales Order` so ON so.name = soi.parent
        WHERE soi.item_code IN %(items)s
          AND so.docstatus = 1
          AND so.status NOT IN ('Completed', 'Cancelled', 'Closed')
          AND soi.qty > soi.delivered_qty
        GROUP BY soi.item_code
        """,
        {"items": list(supplier_items)},
        as_dict=True,
    )
    
    items = []
    for row in so_items:
        item = frappe.get_cached_doc("Item", row.item_code)
        items.append({
            "item_code": row.item_code,
            "item_name": row.item_name,
            "stock_uom": row.stock_uom,
            "standard_rate": _get_buying_rate(row.item_code),
            "qty": flt(row.pending_qty),
            "item_group": item.item_group,
        })
    
    return items


def _get_items_from_projection(supplier, warehouse=None):
    """Get items based on sales projection (last 30 days average)."""
    # Get supplier's items
    supplier_items = _get_supplier_item_codes(supplier)
    if not supplier_items:
        return []
    
    # Calculate average daily sales for last 30 days
    from_date = frappe.utils.add_days(nowdate(), -30)
    
    sales_data = frappe.db.sql(
        """
        SELECT 
            sii.item_code,
            sii.item_name,
            sii.stock_uom,
            SUM(sii.qty) as total_qty
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        WHERE sii.item_code IN %(items)s
          AND si.docstatus = 1
          AND si.posting_date >= %(from_date)s
        GROUP BY sii.item_code
        """,
        {"items": supplier_items, "from_date": from_date},
        as_dict=True,
    )
    
    items = []
    for row in sales_data:
        avg_daily = flt(row.total_qty) / 30
        suggested_qty = max(1, int(avg_daily * 7))  # Suggest 1 week's worth
        
        item = frappe.get_cached_doc("Item", row.item_code)
        items.append({
            "item_code": row.item_code,
            "item_name": row.item_name,
            "stock_uom": row.stock_uom,
            "standard_rate": _get_buying_rate(row.item_code),
            "qty": suggested_qty,
            "item_group": item.item_group,
        })
    
    return items


def _get_items_below_reorder(supplier, warehouse=None):
    """Get items below reorder level for this supplier."""
    supplier_items = _get_supplier_item_codes(supplier)
    if not supplier_items:
        return []
    
    # Get items with reorder level set
    reorder_data = frappe.db.sql(
        """
        SELECT 
            ir.parent as item_code,
            ir.warehouse_reorder_level,
            ir.warehouse_reorder_qty
        FROM `tabItem Reorder` ir
        WHERE ir.parent IN %(items)s
          AND ir.warehouse_reorder_level > 0
          %(warehouse_filter)s
        """,
        {
            "items": supplier_items,
            "warehouse_filter": f"AND ir.warehouse = '{warehouse}'" if warehouse else "",
        },
        as_dict=True,
    )
    
    if not reorder_data:
        return []
    
    # Get current stock for these items
    reorder_items = {r.item_code: r for r in reorder_data}
    stock_data = get_stock_and_transit(list(reorder_items.keys()), warehouse)
    
    items = []
    for item_code, reorder_info in reorder_items.items():
        current_stock = stock_data.get(item_code, {}).get("stock_in_hand", 0)
        transit_stock = stock_data.get(item_code, {}).get("transit_stock", 0)
        available = current_stock + transit_stock
        
        if available < reorder_info.warehouse_reorder_level:
            item = frappe.get_cached_doc("Item", item_code)
            shortage = reorder_info.warehouse_reorder_level - available
            reorder_qty = max(shortage, reorder_info.warehouse_reorder_qty or shortage)
            
            items.append({
                "item_code": item_code,
                "item_name": item.item_name,
                "stock_uom": item.stock_uom,
                "standard_rate": _get_buying_rate(item_code),
                "qty": int(reorder_qty),
                "item_group": item.item_group,
                "custom_stock_in_hand": current_stock,
                "custom_transit_stock": transit_stock,
            })
    
    return items


def _get_supplier_item_codes(supplier):
    """Get all item codes for a supplier."""
    supplier_items = set()
    
    # From Item Supplier child table
    supplier_item_rows = frappe.get_all(
        "Item Supplier",
        filters={"supplier": supplier},
        fields=["parent"],
    )
    for row in supplier_item_rows:
        supplier_items.add(row.parent)
    
    # From Item Default child table
    default_supplier_rows = frappe.get_all(
        "Item Default",
        filters={"default_supplier": supplier},
        fields=["parent"],
    )
    for row in default_supplier_rows:
        supplier_items.add(row.parent)
    
    return list(supplier_items)


def _get_buying_rate(item_code):
    """Get buying rate for an item."""
    price_list = _resolve_buying_price_list()
    rate = 0
    if price_list:
        rate = frappe.db.get_value(
            "Item Price",
            {"item_code": item_code, "price_list": price_list, "buying": 1},
            "price_list_rate",
        )
    if not rate:
        rate = frappe.db.get_value("Item", item_code, "standard_rate")
    return flt(rate)


def _get_item_uoms(item_codes):
    """Get UOM conversion details for items."""
    if not item_codes:
        return {}
    
    uom_rows = frappe.get_all(
        "UOM Conversion Detail",
        filters={"parent": ["in", item_codes]},
        fields=["parent", "uom", "conversion_factor"],
    )
    
    uom_map = {}
    for row in uom_rows:
        if row.parent not in uom_map:
            uom_map[row.parent] = []
        uom_map[row.parent].append({
            "uom": row.uom,
            "conversion_factor": row.conversion_factor
        })
    
    # Add stock_uom with conversion_factor 1 if not present
    for item_code in item_codes:
        if item_code not in uom_map:
            stock_uom = frappe.get_value("Item", item_code, "stock_uom")
            uom_map[item_code] = [{"uom": stock_uom, "conversion_factor": 1}]
        else:
            stock_uom = frappe.get_value("Item", item_code, "stock_uom")
            has_stock_uom = any(u["uom"] == stock_uom for u in uom_map[item_code])
            if not has_stock_uom:
                uom_map[item_code].append({"uom": stock_uom, "conversion_factor": 1})
    
    return uom_map


# ---------------------------------------------------------------------------
# Draft Purchase Order management (XPOS — save in Frappe doctype, docstatus=0)
# ---------------------------------------------------------------------------

@frappe.whitelist()
def save_po_draft(data):
    """
    Save or update a Purchase Order in Draft state (docstatus=0).

    Accepts the same cart payload as create_purchase_order plus an optional
    ``draft_name`` field.  When ``draft_name`` is provided and points to an
    existing docstatus=0 PO, that document is updated in-place; otherwise a
    new Draft PO is inserted.

    Returns:
        dict: draft_name, supplier, supplier_name, transaction_date,
              items_count, modified
    """
    payload = json.loads(data) if isinstance(data, str) else data

    supplier_input = payload.get("supplier")
    if not supplier_input:
        frappe.throw(_("Please select a supplier before saving a draft."))

    supplier = _resolve_supplier(supplier_input)
    if not supplier:
        frappe.throw(_("Supplier '{0}' not found.").format(supplier_input))

    company = payload.get("company") or frappe.defaults.get_default("company")
    if not company:
        frappe.throw(_("Company is required."))

    warehouse = payload.get("warehouse") or get_default_warehouse(company)
    transaction_date = payload.get("transaction_date") or nowdate()
    schedule_date = payload.get("schedule_date") or transaction_date
    draft_name = payload.get("draft_name")

    if draft_name and frappe.db.exists("Purchase Order", draft_name):
        po_doc = frappe.get_doc("Purchase Order", draft_name)
        if po_doc.docstatus != 0:
            frappe.throw(_("Cannot update a submitted Purchase Order as draft."))
        po_doc.supplier = supplier
        po_doc.company = company
        po_doc.transaction_date = transaction_date
        po_doc.schedule_date = schedule_date
        po_doc.items = []
    else:
        supplier_doc = frappe.get_doc("Supplier", supplier)
        supplier_currency = supplier_doc.default_currency or frappe.get_value(
            "Company", company, "default_currency"
        )
        buying_price_list = _resolve_buying_price_list()
        po_doc = frappe.get_doc({
            "doctype": "Purchase Order",
            "supplier": supplier,
            "company": company,
            "transaction_date": transaction_date,
            "schedule_date": schedule_date,
            "currency": supplier_currency,
            "buying_price_list": buying_price_list,
        })

    if warehouse:
        po_doc.set_warehouse = warehouse

    for cf in ("custom_alias_name", "custom_po_category", "custom_po_type",
               "custom_po_department", "custom_po_remarks", "custom_zero_qty"):
        val = payload.get(cf)
        if val is not None:
            po_doc.set(cf, val)

    for row in payload.get("items") or []:
        item_code = row.get("item_code")
        if not item_code:
            continue
        qty = flt(row.get("qty", 0))
        if qty <= 0:
            continue
        uom = row.get("uom") or row.get("stock_uom") or "Nos"
        stock_uom = row.get("stock_uom") or uom
        po_doc.append("items", {
            "item_code": item_code,
            "item_name": row.get("item_name") or item_code,
            "qty": qty,
            "uom": uom,
            "stock_uom": stock_uom,
            "conversion_factor": flt(row.get("conversion_factor") or 1),
            "rate": flt(row.get("rate") or 0),
            "warehouse": row.get("warehouse") or warehouse,
            "schedule_date": schedule_date,
            "custom_alias": row.get("item_name") or item_code,
            "custom_stock_in_hand": flt(row.get("stock_in_hand") or 0),
            "custom_transit_stock": flt(row.get("transit_stock") or 0),
            "custom_required_packs": flt(row.get("required_packs") or 0),
            "custom_pack_units": flt(row.get("pack_units") or 0),
            "custom_class": row.get("class") or "",
            "custom_item_packing": row.get("item_packing") or "",
        })

    po_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True

    if draft_name and po_doc.get("name"):
        po_doc.save()
    else:
        po_doc.insert()

    return {
        "draft_name": po_doc.name,
        "supplier": po_doc.supplier,
        "supplier_name": po_doc.supplier_name or po_doc.supplier,
        "transaction_date": str(po_doc.transaction_date),
        "items_count": len(po_doc.items),
        "modified": str(po_doc.modified),
    }


@frappe.whitelist()
def load_po_draft(name):
    """
    Load a draft Purchase Order and return its data in the frontend cart format.

    Args:
        name: Purchase Order docname

    Returns:
        dict compatible with the purchaseStore draft loader.
    """
    if not frappe.db.exists("Purchase Order", name):
        frappe.throw(_("Purchase Order '{0}' not found.").format(name))

    po = frappe.get_doc("Purchase Order", name)
    if po.docstatus != 0:
        frappe.throw(_("Purchase Order '{0}' is not a draft.").format(name))

    item_codes = [item.item_code for item in po.items]
    uom_data_map = _get_item_uoms(item_codes) if item_codes else {}

    items = []
    for item in po.items:
        uom_list = uom_data_map.get(item.item_code, [])
        if not any(u["uom"] == item.stock_uom for u in uom_list):
            uom_list.append({"uom": item.stock_uom, "conversion_factor": 1})
        items.append({
            "item_code": item.item_code,
            "item_name": item.item_name,
            "qty": flt(item.qty),
            "rate": flt(item.rate),
            "uom": item.uom,
            "stock_uom": item.stock_uom,
            "conversion_factor": flt(item.conversion_factor) or 1,
            "warehouse": item.warehouse,
            "stock_in_hand": flt(item.get("custom_stock_in_hand")),
            "transit_stock": flt(item.get("custom_transit_stock")),
            "required_packs": flt(item.get("custom_required_packs")),
            "pack_units": flt(item.get("custom_pack_units")),
            "class": item.get("custom_class") or "",
            "item_packing": item.get("custom_item_packing") or "",
            "item_group": item.item_group or "",
            "item_uoms": uom_list,
            "discount_percent": 0,
        })

    return {
        "draft_name": po.name,
        "supplier": po.supplier,
        "supplier_name": po.supplier_name or po.supplier,
        "items": items,
        "po_category": po.get("custom_po_category") or "",
        "po_type": po.get("custom_po_type") or "",
        "po_department": po.get("custom_po_department") or "",
        "po_remarks": po.get("custom_po_remarks") or "",
        "po_zero_qty": po.get("custom_zero_qty") or "No",
        "created_at": str(po.creation),
        "updated_at": str(po.modified),
    }


@frappe.whitelist()
def delete_po_draft(name):
    """
    Delete a draft Purchase Order (docstatus=0 only).

    Args:
        name: Purchase Order docname

    Returns:
        dict with success status.
    """
    if not frappe.db.exists("Purchase Order", name):
        return {"success": True}

    po = frappe.get_doc("Purchase Order", name)
    if po.docstatus != 0:
        frappe.throw(_("Cannot delete a submitted Purchase Order."))

    frappe.delete_doc("Purchase Order", name, ignore_permissions=True)
    return {"success": True}


@frappe.whitelist()
def list_po_drafts(limit=20):
    """
    List draft Purchase Orders owned by the current user (docstatus=0).

    Returns:
        List of dicts: name, supplier, supplier_name, transaction_date,
                       grand_total, creation, modified, items_count.
    """
    drafts = frappe.get_all(
        "Purchase Order",
        filters={
            "docstatus": 0,
            "owner": frappe.session.user,
        },
        fields=[
            "name", "supplier", "supplier_name", "transaction_date",
            "grand_total", "creation", "modified",
        ],
        order_by="modified desc",
        limit_page_length=cint(limit) or 20,
    )

    for draft in drafts:
        draft["items_count"] = frappe.db.count(
            "Purchase Order Item", filters={"parent": draft["name"]}
        )

    return drafts
