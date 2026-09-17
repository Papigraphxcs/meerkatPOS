// Copyright (c) 2026, Ali Raza and contributors
// For license information, please see license.txt

function pull_zig_usd_rate(after) {
	frappe.call({
		method: "xpos.api.rbz_rate_sync.manual_sync",
		freeze: true,
		freeze_message: __("Pulling latest ZiG/USD rate..."),
		callback: function (r) {
			if (!r.message) return;
			frappe.show_alert({
				message: r.message.message,
				indicator: r.message.changed ? "green" : "blue",
			});
			if (after) after();
		},
	});
}

frappe.ui.form.on("Currency Exchange", {
	refresh: function (frm) {
		if (!frappe.boot.xpos_can_manage_exchange_rate) return;
		frm.add_custom_button(__("Pull Latest ZiG/USD Rate"), function () {
			pull_zig_usd_rate(() => frm.reload_doc());
		});
	},
});

frappe.listview_settings["Currency Exchange"] = {
	onload: function (listview) {
		if (!frappe.boot.xpos_can_manage_exchange_rate) return;
		listview.page.add_inner_button(__("Pull Latest ZiG/USD Rate"), function () {
			pull_zig_usd_rate(() => listview.refresh());
		});
	},
};
