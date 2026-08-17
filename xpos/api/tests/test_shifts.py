# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from xpos.api import shifts


class TestGetOpeningData(unittest.TestCase):
	"""Tests for get_opening_data function."""

	@patch("xpos.api.shifts.frappe")
	def test_get_opening_data_returns_pos_profiles_for_user(self, mock_frappe):
		"""Test that get_opening_data returns POS profiles assigned to user."""
		mock_frappe.session.user = "cashier@test.com"
		mock_frappe.db.sql.return_value = [
			{
				"name": "POS-PROFILE-1",
				"company": "Test Company",
				"currency": "USD",
				"warehouse": "Store - TC",
			}
		]
		mock_frappe.get_list.return_value = [
			{"parent": "POS-PROFILE-1", "mode_of_payment": "Cash", "default": 1}
		]

		result = shifts.get_opening_data()

		self.assertIn("pos_profiles", result)
		self.assertIn("companies", result)
		self.assertIn("payment_methods", result)
		self.assertEqual(len(result["pos_profiles"]), 1)
		self.assertEqual(result["pos_profiles"][0]["name"], "POS-PROFILE-1")

	@patch("xpos.api.shifts.frappe")
	def test_get_opening_data_returns_empty_when_no_profiles(self, mock_frappe):
		"""Test that get_opening_data returns empty lists when user has no profiles."""
		mock_frappe.session.user = "newuser@test.com"
		mock_frappe.db.sql.return_value = []

		result = shifts.get_opening_data()

		self.assertEqual(result["pos_profiles"], [])
		self.assertEqual(result["companies"], [])
		self.assertEqual(result["payment_methods"], [])

	@patch("xpos.api.shifts.frappe")
	def test_get_opening_data_extracts_unique_companies(self, mock_frappe):
		"""Test that companies are deduplicated from multiple profiles."""
		mock_frappe.session.user = "cashier@test.com"
		mock_frappe.db.sql.return_value = [
			{"name": "POS-PROFILE-1", "company": "Test Company 1", "currency": "USD", "warehouse": "W1"},
			{"name": "POS-PROFILE-2", "company": "Test Company 1", "currency": "USD", "warehouse": "W2"},
			{"name": "POS-PROFILE-3", "company": "Test Company 2", "currency": "EUR", "warehouse": "W3"},
		]
		mock_frappe.get_list.return_value = []

		result = shifts.get_opening_data()

		company_names = [c["name"] for c in result["companies"]]
		self.assertEqual(len(company_names), 2)
		self.assertIn("Test Company 1", company_names)
		self.assertIn("Test Company 2", company_names)


class TestOpenShift(unittest.TestCase):
	"""Tests for open_shift function."""

	@patch("xpos.api.shifts._enrich_shift_data")
	@patch("xpos.api.shifts.frappe")
	def test_open_shift_creates_new_shift(self, mock_frappe, mock_enrich):
		"""Test that open_shift creates a new POS Opening Shift."""
		mock_shift_doc = MagicMock()
		mock_shift_doc.as_dict.return_value = {"name": "POS-OPEN-001"}
		mock_frappe.get_doc.return_value = mock_shift_doc
		mock_frappe.session.user = "cashier@test.com"

		result = shifts.open_shift(
			pos_profile="POS-PROFILE-1",
			company="Test Company",
			balance_details='[{"mode_of_payment": "Cash", "opening_amount": 100}]',
		)

		mock_frappe.get_doc.assert_called_once()
		mock_shift_doc.insert.assert_called_once_with(ignore_permissions=True)
		self.assertIn("pos_opening_shift", result)

	@patch("xpos.api.shifts._enrich_shift_data")
	@patch("xpos.api.shifts.frappe")
	def test_open_shift_handles_empty_balance(self, mock_frappe, mock_enrich):
		"""Test that open_shift works with no balance details."""
		mock_shift_doc = MagicMock()
		mock_shift_doc.as_dict.return_value = {"name": "POS-OPEN-002"}
		mock_frappe.get_doc.return_value = mock_shift_doc
		mock_frappe.session.user = "cashier@test.com"

		result = shifts.open_shift(
			pos_profile="POS-PROFILE-1",
			company="Test Company",
			balance_details="[]",
		)

		self.assertIn("pos_opening_shift", result)


class TestCheckOpenShift(unittest.TestCase):
	"""Tests for check_open_shift function."""

	@patch("xpos.api.shifts._enrich_shift_data")
	@patch("xpos.api.shifts.frappe")
	def test_check_open_shift_returns_existing_shift(self, mock_frappe, mock_enrich):
		"""Test that check_open_shift returns active shift for user."""
		mock_frappe.session.user = "cashier@test.com"
		mock_frappe.db.get_all.return_value = [
			{"name": "POS-OPEN-001", "pos_profile": "POS-PROFILE-1", "company": "Test Company"}
		]
		mock_shift_doc = MagicMock()
		mock_shift_doc.as_dict.return_value = {"name": "POS-OPEN-001"}
		mock_frappe.get_doc.return_value = mock_shift_doc

		result = shifts.check_open_shift()

		self.assertIsNotNone(result)
		self.assertIn("pos_opening_shift", result)

	@patch("xpos.api.shifts.frappe")
	def test_check_open_shift_returns_none_when_no_active_shift(self, mock_frappe):
		"""Test that check_open_shift returns None when no active shift."""
		mock_frappe.session.user = "cashier@test.com"
		mock_frappe.db.get_all.return_value = []

		result = shifts.check_open_shift()

		self.assertIsNone(result)

	@patch("xpos.api.shifts._enrich_shift_data")
	@patch("xpos.api.shifts.frappe")
	def test_check_open_shift_uses_provided_user(self, mock_frappe, mock_enrich):
		"""Test that check_open_shift can check for specific user."""
		mock_frappe.db.get_all.return_value = [
			{"name": "POS-OPEN-003", "pos_profile": "POS-PROFILE-2", "company": "Test Company"}
		]
		mock_shift_doc = MagicMock()
		mock_shift_doc.as_dict.return_value = {"name": "POS-OPEN-003"}
		mock_frappe.get_doc.return_value = mock_shift_doc

		shifts.check_open_shift(user="manager@test.com")

		mock_frappe.db.get_all.assert_called_once()
		call_args = mock_frappe.db.get_all.call_args
		self.assertEqual(call_args.kwargs["filters"]["user"], "manager@test.com")
		self.assertEqual(
			call_args.kwargs["or_filters"],
			[
				{"pos_closing_shift": ["is", "not set"]},
				{"pos_closing_shift": ""},
			],
		)


class TestShiftExpectedAmounts(unittest.TestCase):
	"""Tests that shift reconciliation figures are derived server-side."""

	@staticmethod
	def _opening(balance_details):
		opening = MagicMock()
		opening.name = "POS-OPEN-001"
		opening.pos_profile = "POS-PROFILE-1"
		opening.balance_details = [
			SimpleNamespace(mode_of_payment=mode, amount=amount) for mode, amount in balance_details
		]
		return opening

	@patch("xpos.api.shifts.frappe")
	def test_payment_totals_are_net_of_change(self, mock_frappe):
		"""Change handed back out of the drawer is not counted as collected."""
		mock_frappe.get_all.return_value = [
			{"parent": "INV-001", "mode_of_payment": "Cash", "amount": 500},
		]

		totals = shifts.get_shift_payment_totals("Sales Invoice", [{"name": "INV-001", "change_amount": 100}])

		self.assertEqual(totals["Cash"], 400)

	@patch("xpos.api.shifts.frappe")
	def test_payment_totals_use_one_query_for_many_invoices(self, mock_frappe):
		"""Payment rows are fetched in a single query, not one per invoice."""
		mock_frappe.get_all.return_value = [
			{"parent": "INV-001", "mode_of_payment": "Cash", "amount": 100},
			{"parent": "INV-002", "mode_of_payment": "Cash", "amount": 200},
			{"parent": "INV-003", "mode_of_payment": "Card", "amount": 300},
		]

		totals = shifts.get_shift_payment_totals(
			"Sales Invoice",
			[
				{"name": "INV-001", "change_amount": 0},
				{"name": "INV-002", "change_amount": 0},
				{"name": "INV-003", "change_amount": 0},
			],
		)

		self.assertEqual(mock_frappe.get_all.call_count, 1)
		self.assertEqual(totals, {"Cash": 300, "Card": 300})

	@patch("xpos.api.shifts.frappe")
	def test_expected_amount_deducts_cash_movements(self, mock_frappe):
		"""Cash taken out of the drawer lowers the expected cash on hand."""
		mock_frappe.get_all.side_effect = [
			[{"parent": "INV-001", "mode_of_payment": "Cash", "amount": 1000}],  # payments
			[{"amount": 250}, {"amount": 150}],  # POS Cash Movement
		]
		mock_frappe.db.get_value.return_value = "Cash"

		expected = shifts.get_shift_expected_amounts(
			self._opening([("Cash", 500)]),
			"Sales Invoice",
			[{"name": "INV-001", "change_amount": 0}],
		)

		# 500 opening float + 1000 collected - 400 moved out
		self.assertEqual(expected["Cash"], 1100)

	@patch("xpos.api.shifts.frappe")
	def test_expected_amount_includes_opening_float_for_unused_modes(self, mock_frappe):
		"""A mode with an opening float but no sales still reports that float."""
		mock_frappe.get_all.side_effect = [[], []]

		expected = shifts.get_shift_expected_amounts(
			self._opening([("Cash", 500), ("Card", 0)]), "Sales Invoice", []
		)

		self.assertEqual(expected, {"Cash": 500, "Card": 0})


class TestCloseShift(unittest.TestCase):
	"""Tests for close_shift function."""

	@patch("xpos.api.shifts.get_shift_expected_amounts", return_value={"Cash": 400})
	@patch("xpos.api.shifts.frappe")
	def test_close_shift_ignores_client_supplied_expected_amount(self, mock_frappe, mock_expected):
		"""A client-sent expected_amount must not be able to mask a cash shortfall."""
		opening = MagicMock()
		opening.name = "POS-OPEN-001"
		opening.pos_profile = "POS-PROFILE-1"
		opening.company = "Test Company"
		opening.posting_date = "2026-01-15"
		opening.period_start_date = "2026-01-15 09:00:00"
		opening.user = "cashier@test.com"
		opening.balance_details = [SimpleNamespace(mode_of_payment="Cash", amount=100)]

		closing = MagicMock()
		closing.name = "POS-CLOSE-001"
		closing.as_dict.return_value = {"name": "POS-CLOSE-001"}
		appended = []
		closing.append.side_effect = lambda table, row: appended.append((table, row))

		mock_frappe.get_doc.side_effect = lambda *a, **kw: (
			opening if a and a[0] == "POS Opening Shift" else closing
		)
		mock_frappe.get_all.return_value = []
		mock_frappe.session.user = "cashier@test.com"

		shifts.close_shift(
			opening_shift="POS-OPEN-001",
			# Cashier claims 300 was expected and 300 counted, i.e. no variance.
			closing_details='[{"mode_of_payment": "Cash", "opening_amount": 999, '
			'"expected_amount": 300, "closing_amount": 300, "difference": 0}]',
		)

		rows = [row for table, row in appended if table == "payment_reconciliation"]
		self.assertEqual(len(rows), 1)
		# Server figure wins, exposing the 100 shortfall the client tried to hide.
		self.assertEqual(rows[0]["expected_amount"], 400)
		self.assertEqual(rows[0]["closing_amount"], 300)
		self.assertEqual(rows[0]["difference"], -100)
		self.assertEqual(rows[0]["opening_amount"], 100)

	@patch("xpos.api.shifts.frappe")
	def test_close_shift_creates_closing_shift(self, mock_frappe):
		"""Test that close_shift creates POS Closing Shift."""
		# Setup mocks
		mock_opening_doc = MagicMock()
		mock_opening_doc.name = "POS-OPEN-001"
		mock_opening_doc.pos_profile = "POS-PROFILE-1"
		mock_opening_doc.company = "Test Company"
		mock_opening_doc.posting_date = "2026-01-15"
		mock_opening_doc.period_start_date = "2026-01-15 09:00:00"
		mock_opening_doc.user = "cashier@test.com"

		mock_closing_doc = MagicMock()
		mock_closing_doc.name = "POS-CLOSE-001"
		mock_closing_doc.as_dict.return_value = {"name": "POS-CLOSE-001"}

		def get_doc_side_effect(*args, **kwargs):
			if args[0] == "POS Opening Shift":
				return mock_opening_doc
			return mock_closing_doc

		mock_frappe.get_doc.side_effect = get_doc_side_effect
		mock_frappe.get_all.return_value = [
			{
				"name": "INV-001",
				"grand_total": 500,
				"net_total": 450,
				"total_taxes_and_charges": 50,
				"customer": "C1",
				"is_return": 0,
			}
		]
		mock_frappe.session.user = "cashier@test.com"

		result = shifts.close_shift(
			opening_shift="POS-OPEN-001",
			closing_details='[{"mode_of_payment": "Cash", "expected_amount": 500, "closing_amount": 500}]',
		)

		self.assertIn("pos_closing_shift", result)

	@patch("xpos.api.shifts.frappe")
	def test_close_shift_handles_no_invoices(self, mock_frappe):
		"""Test that close_shift works when no invoices in shift."""
		mock_opening_doc = MagicMock()
		mock_opening_doc.name = "POS-OPEN-002"
		mock_opening_doc.pos_profile = "POS-PROFILE-1"
		mock_opening_doc.company = "Test Company"
		mock_opening_doc.posting_date = "2026-01-15"
		mock_opening_doc.period_start_date = "2026-01-15 09:00:00"
		mock_opening_doc.user = "cashier@test.com"

		mock_closing_doc = MagicMock()
		mock_closing_doc.name = "POS-CLOSE-002"
		mock_closing_doc.as_dict.return_value = {"name": "POS-CLOSE-002"}

		def get_doc_side_effect(*args, **kwargs):
			if args[0] == "POS Opening Shift":
				return mock_opening_doc
			return mock_closing_doc

		mock_frappe.get_doc.side_effect = get_doc_side_effect
		mock_frappe.get_all.return_value = []  # No invoices
		mock_frappe.session.user = "cashier@test.com"

		result = shifts.close_shift(
			opening_shift="POS-OPEN-002",
			closing_details="[]",
		)

		self.assertIn("pos_closing_shift", result)


class TestShiftAmountCalculations(unittest.TestCase):
	"""Tests for shift amount calculation helpers."""

	def test_total_calculation_with_returns(self):
		"""Test that return invoices are properly calculated."""
		invoices = [
			{"grand_total": 100, "is_return": 0},
			{"grand_total": 200, "is_return": 0},
			{"grand_total": -50, "is_return": 1},  # Return
		]

		from frappe.utils import flt

		grand_total = sum(flt(inv["grand_total"]) for inv in invoices)
		returns_count = sum(1 for inv in invoices if inv.get("is_return"))

		self.assertEqual(grand_total, 250)  # 100 + 200 - 50
		self.assertEqual(returns_count, 1)


if __name__ == "__main__":
	unittest.main()
