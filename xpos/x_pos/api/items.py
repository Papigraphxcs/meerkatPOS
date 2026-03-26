# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""Public item API facade.

Keep whitelisted paths in this module stable for clients and route heavy
implementation work to `xpos.x_pos.api.item_processing` modules.
"""

import json

import frappe
from frappe import _, as_json

from xpos.x_pos.api.item_processing.barcode import (
	build_scale_barcode,
	get_items_from_barcode,
	parse_scale_barcode,
	search_serial_or_batch_or_barcode_number,
)
from xpos.x_pos.api.item_processing.details import (
	get_item_attributes,
	get_item_detail,
	get_item_optional_attributes,
	get_item_variants,
	get_items_details,
)
from xpos.x_pos.api.item_processing.price import get_price_for_uom, update_price_list_rate
from xpos.x_pos.api.item_processing.search import (
	get_items,
	get_items_count,
	get_items_groups,
	normalize_brand,
)
from xpos.x_pos.api.item_processing.stock import (
	get_available_qty,
	get_bulk_stock_availability,
	get_stock_availability,
)
from xpos.x_pos.api.utils import _ensure_pos_profile, get_active_pos_profile


def build_item_cache(item_code):
	"""Build item cache for faster access."""
	# Implementation for building item cache
	pass


@frappe.whitelist()
def get_item_brand(item_code):
	"""Return normalized brand for an item, falling back to its template's brand."""
	if not item_code:
		return ""
	data = frappe.db.get_value("Item", item_code, ["brand", "variant_of"], as_dict=True)
	if not data:
		return ""
	brand = data.get("brand")
	if not brand and data.get("variant_of"):
		brand = frappe.db.get_value("Item", data.get("variant_of"), "brand")
	return normalize_brand(brand) if brand else ""
