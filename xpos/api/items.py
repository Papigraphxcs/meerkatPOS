# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, cint


@frappe.whitelist()
def get_pos_items(pos_profile, search_term="", item_group="", start=0, page_length=40):
	"""Get items for the POS with prices and stock info."""
	pos = frappe.get_cached_doc("POS Profile", pos_profile)
	warehouse = pos.warehouse
	price_list = pos.selling_price_list or frappe.db.get_single_value(
		"Selling Settings", "selling_price_list"
	)

	conditions = "i.disabled = 0 AND i.is_sales_item = 1 AND i.has_variants = 0"
	values = {"start": cint(start), "page_length": cint(page_length)}

	# Item group filter
	if item_group and item_group != "All Item Groups":
		ig = frappe.db.get_value("Item Group", item_group, ["lft", "rgt"], as_dict=True)
		if ig:
			conditions += " AND i.item_group IN (SELECT name FROM `tabItem Group` WHERE lft >= %(lft)s AND rgt <= %(rgt)s)"
			values["lft"] = ig.lft
			values["rgt"] = ig.rgt

	# Restrict to POS item groups if configured
	if pos.get("item_groups"):
		allowed_groups = [d.item_group for d in pos.item_groups]
		if allowed_groups:
			all_groups = []
			for grp in allowed_groups:
				ig = frappe.db.get_value("Item Group", grp, ["lft", "rgt"], as_dict=True)
				if ig:
					sub = frappe.get_all(
						"Item Group",
						filters={"lft": [">=", ig.lft], "rgt": ["<=", ig.rgt]},
						pluck="name",
					)
					all_groups.extend(sub)
			if all_groups:
				all_groups = list(set(all_groups))
				conditions += " AND i.item_group IN ({})".format(
					", ".join([frappe.db.escape(g) for g in all_groups])
				)

	# Search conditions
	if search_term:
		search_term = search_term.strip()
		conditions += """ AND (
			i.name LIKE %(search)s
			OR i.item_name LIKE %(search)s
			OR i.item_code LIKE %(search)s
			OR EXISTS (
				SELECT 1 FROM `tabItem Barcode` ib
				WHERE ib.parent = i.name AND ib.barcode LIKE %(barcode_search)s
			)
		)"""
		values["search"] = f"%{search_term}%"
		values["barcode_search"] = f"%{search_term}%"

	items = frappe.db.sql(
		"""
		SELECT
			i.name AS item_code,
			i.item_name,
			i.item_group,
			i.stock_uom,
			i.image,
			i.description,
			i.has_batch_no,
			i.has_serial_no,
			ip.price_list_rate AS rate
		FROM `tabItem` i
		LEFT JOIN `tabItem Price` ip ON ip.item_code = i.name
			AND ip.price_list = %(price_list)s
			AND ip.selling = 1
			AND (ip.valid_from IS NULL OR ip.valid_from <= CURDATE())
			AND (ip.valid_upto IS NULL OR ip.valid_upto >= CURDATE())
		WHERE {conditions}
		GROUP BY i.name
		ORDER BY i.item_name ASC
		LIMIT %(start)s, %(page_length)s
		""".format(conditions=conditions),
		{**values, "price_list": price_list},
		as_dict=True,
	)

	# Add stock qty
	for item in items:
		item["actual_qty"] = get_stock_qty(item.item_code, warehouse) if warehouse else 0
		if not item.get("rate"):
			item["rate"] = 0

	return items


@frappe.whitelist()
def get_items_count(pos_profile, search_term="", item_group=""):
	"""Get total count of items matching the filters."""
	pos = frappe.get_cached_doc("POS Profile", pos_profile)

	conditions = "i.disabled = 0 AND i.is_sales_item = 1 AND i.has_variants = 0"
	values = {}

	if item_group and item_group != "All Item Groups":
		ig = frappe.db.get_value("Item Group", item_group, ["lft", "rgt"], as_dict=True)
		if ig:
			conditions += " AND i.item_group IN (SELECT name FROM `tabItem Group` WHERE lft >= %(lft)s AND rgt <= %(rgt)s)"
			values["lft"] = ig.lft
			values["rgt"] = ig.rgt

	if search_term:
		search_term = search_term.strip()
		conditions += """ AND (
			i.name LIKE %(search)s
			OR i.item_name LIKE %(search)s
			OR i.item_code LIKE %(search)s
		)"""
		values["search"] = f"%{search_term}%"

	count = frappe.db.sql(
		"SELECT COUNT(DISTINCT i.name) FROM `tabItem` i WHERE {conditions}".format(conditions=conditions),
		values,
	)
	return count[0][0] if count else 0


@frappe.whitelist()
def get_item_groups():
	"""Get all item groups in a tree structure."""
	groups = frappe.get_all(
		"Item Group",
		filters={"is_group": 0},
		fields=["name", "parent_item_group", "image"],
		order_by="name asc",
		limit_page_length=0,
	)
	# Also get parent groups
	parent_groups = frappe.get_all(
		"Item Group",
		filters={"is_group": 1},
		fields=["name", "parent_item_group", "image"],
		order_by="lft asc",
		limit_page_length=0,
	)
	return {"groups": groups, "parent_groups": parent_groups}


@frappe.whitelist()
def search_barcode(barcode):
	"""Search item by barcode."""
	if not barcode:
		return None

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
		}

	# Try matching item code directly
	if frappe.db.exists("Item", barcode):
		item = frappe.get_cached_doc("Item", barcode)
		return {
			"item_code": item.name,
			"item_name": item.item_name,
			"barcode": barcode,
			"uom": item.stock_uom,
		}

	return None


def get_stock_qty(item_code, warehouse):
	"""Get actual qty from Bin."""
	qty = frappe.db.get_value(
		"Bin",
		{"item_code": item_code, "warehouse": warehouse},
		"actual_qty",
	)
	return flt(qty)
