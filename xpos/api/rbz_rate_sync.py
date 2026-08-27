# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""
Sync the ZiG->USD tender rate from ZimPriceCheck's official rate (via the ZimRate API),
so mixed-currency POS checkout has a current exchange rate without manual entry.
"""

import frappe
from frappe import _
from frappe.utils import flt, nowdate

ZIMRATE_URL = "https://zimrate.com/api/rates/latest-grouped"
REQUEST_TIMEOUT = 15
RATE_SOURCE_NAME = "ZimPriceCheck"
RATE_CURRENCY_PAIR = "USD/ZiG"

FROM_CURRENCY = "ZiG"
TO_CURRENCY = "USD"

MANAGER_ROLES = ("System Manager", "Item Manager", "Stock Manager")


def _fetch_zimpricecheck_rate() -> tuple[float, str]:
	"""Return ``(zig_per_usd, scraped_at)`` from ZimPriceCheck's official USD/ZiG rate."""
	import requests

	response = requests.get(
		ZIMRATE_URL,
		headers={"User-Agent": "meerkatPOS/1.0 (+https://meerkatpos.example)"},
		timeout=REQUEST_TIMEOUT,
	)
	response.raise_for_status()
	data = response.json()

	entries = data.get(RATE_CURRENCY_PAIR) or []
	entry = next(
		(e for e in entries if (e.get("source") or {}).get("name") == RATE_SOURCE_NAME), None
	)
	if not entry:
		frappe.throw(_("ZimRate did not return a {0} rate from {1}.").format(
			RATE_CURRENCY_PAIR, RATE_SOURCE_NAME
		))

	rate = flt(entry.get("buyRate"))
	if not rate:
		frappe.throw(_("ZimRate returned an empty rate for {0}.").format(RATE_CURRENCY_PAIR))

	return rate, entry.get("scrapedAt") or ""


def _latest_local_rate() -> float | None:
	"""The exchange_rate on the most recent ZiG->USD Currency Exchange row, if any."""
	rows = frappe.get_all(
		"Currency Exchange",
		filters={"from_currency": FROM_CURRENCY, "to_currency": TO_CURRENCY, "for_selling": 1},
		fields=["exchange_rate"],
		order_by="date desc, creation desc",
		limit=1,
	)
	return flt(rows[0].exchange_rate) if rows else None


def sync_zig_usd_rate(force: bool = False) -> dict:
	"""Pull the latest ZimPriceCheck rate and record it if it has changed (or ``force``).

	Returns a status dict describing what happened, for both the scheduler log and the
	Manager-facing manual pull button to report back to the user.
	"""
	zig_per_usd, scraped_at = _fetch_zimpricecheck_rate()
	new_rate = flt(1 / zig_per_usd, 9)

	previous_rate = _latest_local_rate()
	unchanged = previous_rate is not None and abs(previous_rate - new_rate) < 1e-9

	if unchanged and not force:
		return {
			"changed": False,
			"zig_per_usd": zig_per_usd,
			"exchange_rate": new_rate,
			"scraped_at": scraped_at,
			"message": _("Rate unchanged: 1 USD = {0} ZiG.").format(zig_per_usd),
		}

	doc = frappe.get_doc(
		{
			"doctype": "Currency Exchange",
			"date": nowdate(),
			"from_currency": FROM_CURRENCY,
			"to_currency": TO_CURRENCY,
			"exchange_rate": new_rate,
			"for_buying": 1,
			"for_selling": 1,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()

	return {
		"changed": True,
		"zig_per_usd": zig_per_usd,
		"exchange_rate": new_rate,
		"scraped_at": scraped_at,
		"currency_exchange": doc.name,
		"message": _("Updated: 1 USD = {0} ZiG (was {1}).").format(
			zig_per_usd, flt(1 / previous_rate, 4) if previous_rate else _("not set")
		),
	}


def scheduled_sync():
	"""Hourly scheduler entry point. Never raises — logs and moves on."""
	try:
		result = sync_zig_usd_rate()
		if result["changed"]:
			frappe.logger("xpos.rbz_rate_sync").info(result["message"])
	except Exception:
		frappe.log_error(
			frappe.get_traceback(), "XPOS ZimRate Scheduled Sync Failed"
		)


@frappe.whitelist()
def manual_sync() -> dict:
	"""Manager-triggered pull, called from the Currency Exchange list view button."""
	if not any(role in frappe.get_roles() for role in MANAGER_ROLES):
		frappe.throw(_("Only a Manager can pull exchange rates."), frappe.PermissionError)

	return sync_zig_usd_rate(force=True)
