# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

import importlib
import unittest

import frappe


def is_whitelisted(module_path: str, function_name: str) -> bool:
	"""Whether `module_path.function_name` is exposed over HTTP."""
	module = importlib.import_module(module_path)
	function = getattr(module, function_name, None)
	return function is not None and function in frappe.whitelisted


def function_exists(module_path: str, function_name: str) -> bool:
	return hasattr(importlib.import_module(module_path), function_name)


class TestPrivilegedHelpersAreNotExposed(unittest.TestCase):
	"""Helpers that write with ignore_permissions must not be whitelisted."""

	def test_create_payment_entry_exists_but_is_not_an_endpoint(self):
		"""It inserts and submits a Payment Entry with no permission or amount check.

		`settle_outstanding_invoice` is the gated entry point: it verifies the
		POS right and caps the amount at the invoice outstanding. Exposing the
		helper would let a caller skip both.
		"""
		self.assertTrue(function_exists("xpos.api.payments", "create_payment_entry"))
		self.assertFalse(is_whitelisted("xpos.api.payments", "create_payment_entry"))

	def test_settle_outstanding_invoice_remains_the_public_entry_point(self):
		"""The gated wrapper stays reachable so the feature keeps working."""
		self.assertTrue(is_whitelisted("xpos.api.payments", "settle_outstanding_invoice"))


class TestForceDeleteEndpointsAreGone(unittest.TestCase):
	"""Endpoints that force-deleted submitted invoices have been removed."""

	def test_delete_invoice_facade_is_removed(self):
		"""`frappe.delete_doc(..., force=1)` skips the docstatus and link checks."""
		self.assertFalse(function_exists("xpos.x_pos.api.invoices", "delete_invoice"))

	def test_delete_sales_invoice_facade_is_removed(self):
		"""This one had no guard at all, not even the printed-invoice check."""
		self.assertFalse(function_exists("xpos.x_pos.api.invoices", "delete_sales_invoice"))


class TestRepricingEndpointIsGone(unittest.TestCase):
	"""Arbitrary Item Price rewriting has been removed."""

	def test_update_price_list_rate_is_removed(self):
		"""It let any user rewrite the Item Price that `allow_change_price` reads.

		`create_invoice` enforces the price lock by re-reading Item Price, so an
		ungated repricing endpoint defeated that control entirely.
		"""
		self.assertFalse(function_exists("xpos.api.items", "update_price_list_rate"))
