// Copyright (c) 2026, Ali Raza and contributors
// For license information, please see license.txt
//
// Renders a grouped checkbox matrix into the `permissions_html` field, bound to
// the `permissions` child table, and hides the raw child grid.

const POS_PERMISSION_GROUPS = [
	{
		title: "Billing & Invoicing",
		items: [
			{ key: "close_shift", label: "Close Shift" },
			{ key: "allow_reprint_invoice", label: "Reprint Invoice" },
			{ key: "print_draft_invoice", label: "Print Draft Invoice" },
			{ key: "shift_report", label: "Shift Report" },
		],
	},
	{
		title: "Discounts & Pricing",
		items: [
			{ key: "apply_additional_discount", label: "Apply Additional Discount" },
			{ key: "show_edit_discount_field", label: "Edit Discount Field" },
			{ key: "allow_change_price", label: "Change Price" },
		],
	},
	{
		title: "Sales Operations",
		items: [
			{ key: "sale_return", label: "Sale Return" },
			{ key: "recall_other_shift_tabs", label: "Recall Other Shifts' Tabs" },
			{ key: "settle_outstanding_invoice", label: "Settle Outstanding Invoice" },
		],
	},
	{
		title: "Cash Management",
		items: [
			{ key: "expense", label: "Expense" },
			{ key: "bank_drop", label: "Bank Drop" },
		],
	},
	{
		title: "Purchasing & Stock",
		items: [
			{ key: "purchase_order", label: "Purchase Order" },
			{ key: "stock_entry", label: "Stock Entry" },
			{ key: "material_receipt", label: "Add New Stock (Material Receipt)" },
		],
	},
	{
		title: "Reports",
		items: [
			{ key: "current_stock_by_brand", label: "Current Stock by Brand" },
			{ key: "current_stock_report", label: "Current Stock Report" },
		],
	},
	{
		title: "Administration",
		items: [{ key: "manage_role_permissions", label: "Manage Role Permissions" }],
	},
];

frappe.ui.form.on("POS Role", {
	refresh(frm) {
		// The matrix is the editing surface — hide the raw child grid.
		frm.set_df_property("permissions", "hidden", 1);
		render_permission_matrix(frm);
	},
});

function get_perm_row(frm, key) {
	return (frm.doc.permissions || []).find((row) => row.permission === key);
}

function set_permission(frm, key, enabled) {
	let row = get_perm_row(frm, key);
	if (!row) {
		row = frm.add_child("permissions", { permission: key, enabled: enabled ? 1 : 0 });
	} else {
		row.enabled = enabled ? 1 : 0;
	}
	frm.dirty();
}

function render_permission_matrix(frm) {
	const wrapper = frm.get_field("permissions_html").$wrapper;
	wrapper.empty();

	const $container = $('<div class="pos-role-permissions"></div>');

	POS_PERMISSION_GROUPS.forEach((group) => {
		const $group = $(`
			<div class="mb-4">
				<div class="text-muted text-uppercase mb-2" style="font-size:11px;letter-spacing:.05em;">
					${frappe.utils.escape_html(__(group.title))}
				</div>
			</div>
		`);

		group.items.forEach((item) => {
			const row = get_perm_row(frm, item.key);
			const checked = row && cint(row.enabled) ? "checked" : "";
			const $item = $(`
				<label class="d-flex align-items-center mb-1" style="gap:8px;cursor:pointer;">
					<input type="checkbox" data-perm="${item.key}" ${checked}
						style="width:14px;height:14px;cursor:pointer;" />
					<span>${frappe.utils.escape_html(__(item.label))}</span>
				</label>
			`);
			$item.find("input").on("change", function () {
				set_permission(frm, item.key, this.checked);
			});
			$group.append($item);
		});

		$container.append($group);
	});

	wrapper.append($container);
}
