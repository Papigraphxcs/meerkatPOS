# -*- coding: utf-8 -*-
# Copyright (c) 2024, yosys solutions and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
# import frappe
from frappe.model.document import Document

class POSPrintFormatRule(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		customer_group: DF.Link
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		print_format: DF.Link
	# end: auto-generated types
	pass
