import frappe


@frappe.whitelist()
def get_last_invoice_rates(customer: str, item_codes: list, company: str | None = None):
	"""
	Get the last invoice rate for a list of items for a specific customer.
	"""
	if not company:
		company = frappe.db.get_default("company")

	if not customer or not item_codes:
		return []

	if isinstance(item_codes, str):
		import json

		item_codes = json.loads(item_codes)

	if not item_codes:
		return []

	data = frappe.get_all(
		"Sales Invoice Item",
		fields=[
			"item_code",
			"rate",
			"parent",
			"uom",
		],
		filters=[
			["Sales Invoice", "customer", "=", customer],
			["Sales Invoice", "company", "=", company],
			["Sales Invoice", "docstatus", "=", 1],
			["item_code", "in", item_codes],
		],
		order_by="`tabSales Invoice`.posting_date desc, `tabSales Invoice`.creation desc",
	)

	latest_rates = {}
	for row in data:
		if row.item_code not in latest_rates:
			invoice = frappe.db.get_value(
				"Sales Invoice",
				row.parent,
				["posting_date", "currency"],
				as_dict=True,
			)
			row.update(
				{
					"invoice": row.parent,
					"currency": invoice.currency,
					"posting_date": invoice.posting_date,
				}
			)
			latest_rates[row.item_code] = row

	return list(latest_rates.values())
