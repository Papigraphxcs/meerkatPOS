frappe.provide("xpos.desktop");

// meerkatPOS is routinely self-hosted on a PC/LAN with no route to the
// public internet at all (client-premises appliance install). Chrome/Edge's
// navigator.onLine only reflects the OS network-interface state, not whether
// *this* server is reachable, so on those installs it permanently reports
// "offline" even though every request to this same-origin server succeeds
// fine. Frappe core wires that flag into two places:
//   - frappe.is_online() (frappe/public/js/frappe/dom.js) is checked at the
//     top of every frappe.call (frappe/public/js/frappe/request.js), so it
//     threw a "Connection Lost" alert on literally every desk action.
//   - frappe/public/js/frappe/dom.js also binds window "online"/"offline"
//     straight to show_alert, spamming an orange/green toast whenever the
//     OS flips that flag (e.g. Windows' "no internet access" LAN state).
// Real connectivity problems (timeouts, connection refused, 5xx) already
// surface through frappe.call's own statusCode/ajax error handling, so
// neither of these heuristics is needed here -- just quiet them.
frappe.is_online = function () {
	return true;
};
$(window).off("online offline");

// Adds a welcome header + quick-action shortcuts above the Desk home page's
// icon grid (the "Framework / meerkatPOS / Accounting / Stock / ..." tiles
// you land on at /desk with no route, and via the "Desktop" link), so the
// page opens with something immediately useful instead of just the bare
// centered grid of tiles.
//
// This targets frappe/desk/page/desktop/desktop.js's DesktopIconGrid, which
// renders into `.desktop-wrapper .desktop-container .icons-container`. That
// render pipeline isn't exposed for prototype patching, so this works by
// injecting a sibling block into the DOM after the grid appears, rather than
// hooking the render itself. A previous version of this file also collapsed
// the grid into a single-column alphabetized list; that made the page feel
// sparser, not fuller, so it's been dropped in favour of just adding content
// on top of Frappe's native multi-column grid.
xpos.desktop.quick_actions = [
	{
		label: __("Point of Sale"),
		icon: "retail",
		action: () => (window.location.href = "/meerkatpos/pos"),
	},
	{
		label: __("New Sales Invoice"),
		icon: "small-add",
		action: () => frappe.new_doc("Sales Invoice"),
	},
	{
		label: __("New Item"),
		icon: "small-add",
		action: () => frappe.new_doc("Item"),
	},
	{
		label: __("New Customer"),
		icon: "small-add",
		action: () => frappe.new_doc("Customer"),
	},
];

xpos.desktop.build_header = function () {
	const $header = $(`
		<div class="xpos-home-header">
			<div class="xpos-home-greeting">${__("Welcome to meerkatPOS")}</div>
			<div class="xpos-home-actions"></div>
		</div>
	`);

	const $actions = $header.find(".xpos-home-actions");
	xpos.desktop.quick_actions.forEach((action, idx) => {
		const $btn = $(`
			<button type="button" class="xpos-home-action">
				${frappe.utils.icon(action.icon, "sm")}
				<span>${action.label}</span>
			</button>
		`);
		$btn.on("click", action.action);
		$actions.append($btn);
	});

	return $header;
};

// Real, live numbers (not placeholders) via xpos.api.home_stats.get_home_stats,
// scoped to the user's default company. Rendered once the call resolves so
// the row never shows stale/zeroed figures.
xpos.desktop.stat_tiles = [
	{ key: "total_sales_today", label: __("Today's Sales"), format: "currency" },
	{ key: "open_sales_orders", label: __("Open Sales Orders"), format: "count" },
	{ key: "total_stock_value", label: __("Stock Value"), format: "currency" },
	{ key: "active_customers", label: __("Active Customers"), format: "count" },
];

xpos.desktop.build_stats = function (stats) {
	const $row = $('<div class="xpos-home-stats"></div>');

	xpos.desktop.stat_tiles.forEach((tile) => {
		const raw = stats[tile.key] || 0;
		const value = tile.format === "currency" ? frappe.format(raw, { fieldtype: "Currency" }) : raw;
		$row.append(`
			<div class="xpos-home-stat">
				<div class="xpos-home-stat-label">${tile.label}</div>
				<div class="xpos-home-stat-value">${value}</div>
			</div>
		`);
	});

	return $row;
};

xpos.desktop.inject_header = function ($desktop_container) {
	if ($desktop_container.siblings(".xpos-home-header").length) return;
	$desktop_container.before(xpos.desktop.build_header());

	frappe.call({ method: "xpos.api.home_stats.get_home_stats", quiet: true }).then((r) => {
		if (!r.message) return;
		$(".xpos-home-header").first().append(xpos.desktop.build_stats(r.message));
	});
};

// One-line "what is this" text under each tile's label, for the modules
// that land on this grid. Unmapped tiles (a newly installed app's module,
// say) are simply left as-is -- no blank/placeholder line.
xpos.desktop.icon_descriptions = {
	Framework: __("Frappe framework tools & customization"),
	meerkatPOS: __("Point of sale & retail operations"),
	Organization: __("Company structure, branches & departments"),
	Accounting: __("Ledgers, invoices & financial reports"),
	Assets: __("Track fixed assets & depreciation"),
	Buying: __("Purchase orders & supplier management"),
	Manufacturing: __("Bills of materials, work orders & production"),
	Projects: __("Project tracking & time management"),
	Quality: __("Quality inspections & procedures"),
	Selling: __("Sales orders, quotations & customers"),
	Stock: __("Inventory, warehouses & stock movement"),
	Subcontracting: __("Outsourced manufacturing orders"),
	"ERPNext Settings": __("Global system preferences"),
};

// desktop_icon.html already ships an (unused, commented-out) ".icon-subtitle"
// slot with matching CSS in desktop.css -- this fills that slot in rather
// than inventing a new element, so the description picks up Frappe's own
// small/muted styling for free.
xpos.desktop.add_descriptions = function ($icons) {
	$icons.children(".desktop-icon").each(function () {
		const $tile = $(this);
		if ($tile.find(".icon-subtitle").length) return;

		const label = ($tile.attr("data-id") || "").trim();
		const desc = xpos.desktop.icon_descriptions[label];
		if (!desc) return;

		$tile.find(".icon-caption").append(`<div class="icon-subtitle" title="${desc}">${desc}</div>`);
	});
};

// Which task-based section each tile belongs under. A tile with no entry
// here (a newly installed app's module, say) falls into a trailing "Other"
// group rather than being dropped or erroring.
xpos.desktop.icon_categories = {
	meerkatPOS: __("Sales & POS"),
	Selling: __("Sales & POS"),
	Buying: __("Purchasing & Inventory"),
	Stock: __("Purchasing & Inventory"),
	Assets: __("Purchasing & Inventory"),
	Manufacturing: __("Production"),
	Subcontracting: __("Production"),
	Quality: __("Production"),
	Projects: __("Production"),
	Accounting: __("Finance"),
	Organization: __("Administration"),
	"ERPNext Settings": __("Administration"),
	Framework: __("Administration"),
};

xpos.desktop.category_order = [
	__("Sales & POS"),
	__("Purchasing & Inventory"),
	__("Production"),
	__("Finance"),
	__("Administration"),
];

xpos.desktop.OTHER_CATEGORY = __("Other");

// Groups the tiles into labelled sections (in place, within Frappe's own
// native grid -- the header rows just span the full grid width via CSS;
// the grid itself stays a multi-column grid). Tiles are sorted A-Z within
// each section. Re-runs cleanly on route revisits: old headers are removed
// and rebuilt from scratch rather than accumulating duplicates.
xpos.desktop.group_icons = function ($icons) {
	$icons.find(".xpos-icon-group-header").remove();

	const groups = {};
	$icons.children(".desktop-icon").each(function () {
		const label = ($(this).attr("data-id") || "").trim();
		const category = xpos.desktop.icon_categories[label] || xpos.desktop.OTHER_CATEGORY;
		(groups[category] = groups[category] || []).push(this);
	});

	const extra_categories = Object.keys(groups).filter(
		(category) => !xpos.desktop.category_order.includes(category)
	);
	const order = xpos.desktop.category_order.concat(extra_categories);

	order.forEach((category) => {
		const tiles = groups[category];
		if (!tiles || !tiles.length) return;

		tiles.sort((a, b) => {
			const label_a = ($(a).attr("data-id") || "").trim();
			const label_b = ($(b).attr("data-id") || "").trim();
			return label_a.localeCompare(label_b, undefined, { sensitivity: "base" });
		});

		$icons.append(`<div class="xpos-icon-group-header">${category}</div>`);
		// Re-appending an existing node moves it rather than cloning it, so
		// any state already applied to the tile (tooltips, handlers) survives.
		tiles.forEach((el) => $icons.append(el));
	});
};

// The desktop page's own script loads and renders after this bundle, and
// can re-render (route revisits, edit-mode toggles), so poll briefly for
// the grid rather than trying to hook a specific lifecycle callback. Bounded
// so it never runs indefinitely on pages that aren't the desktop home page.
xpos.desktop.try_enhance = function (attempts_left) {
	if (attempts_left === undefined) attempts_left = 20;

	const $desktop_container = $(".desktop-wrapper .desktop-container").first();
	const $icons = $desktop_container.find(".icons-container > .icons").first();
	if ($desktop_container.length && $icons.children(".desktop-icon").length) {
		try {
			xpos.desktop.group_icons($icons);
			xpos.desktop.add_descriptions($icons);
			xpos.desktop.inject_header($desktop_container);
		} catch (e) {
			console.error("xpos: desktop home enhancement failed", e);
		}
		return;
	}

	if (attempts_left <= 0) return;
	setTimeout(() => xpos.desktop.try_enhance(attempts_left - 1), 150);
};

frappe.router.on("change", () => xpos.desktop.try_enhance());
xpos.desktop.try_enhance();
