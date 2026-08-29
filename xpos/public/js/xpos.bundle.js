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

// Restyles the Desk home page's icon grid (the "Framework / meerkatPOS /
// Accounting / Stock / ..." tiles you land on at /desk with no route) into
// a single scrollable, alphabetically-grouped list -- similar to the
// Windows Start Menu "All apps" view -- instead of the default centered
// multi-column grid of square tiles.
//
// This targets frappe/desk/page/desktop/desktop.js's DesktopIconGrid, which
// renders into `.desktop-wrapper .desktop-container .icons-container > .icons`.
// Those classes/instances aren't exposed for prototype patching, so this
// works by re-arranging the rendered DOM after the grid appears rather than
// hooking the render pipeline itself.
xpos.desktop.listify = function ($icons_grid) {
	if ($icons_grid.hasClass("xpos-az-list")) return;

	const $tiles = $icons_grid.children(".desktop-icon");
	if ($tiles.length < 6) return;

	const rows = $tiles.get().map((el) => {
		const $el = $(el);
		const label = ($el.attr("data-id") || $el.find(".icon-title").first().text() || "").trim();
		return { el, label };
	});

	rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

	$icons_grid.addClass("xpos-az-list");

	const fragment = document.createDocumentFragment();
	let last_letter = null;
	rows.forEach((row) => {
		const letter = (row.label[0] || "#").toUpperCase();
		if (letter !== last_letter) {
			const header = document.createElement("div");
			header.className = "xpos-az-group-header";
			header.textContent = letter;
			fragment.appendChild(header);
			last_letter = letter;
		}
		// Re-appending an existing node moves it rather than cloning it, so
		// any state already applied to the tile (tooltips, handlers) survives.
		fragment.appendChild(row.el);
	});

	$icons_grid.append(fragment);
};

// The desktop page's own script loads and renders after this bundle, and
// can re-render (route revisits, edit-mode toggles), so poll briefly for
// the grid rather than trying to hook a specific lifecycle callback. Bounded
// so it never runs indefinitely on pages that aren't the desktop home page.
xpos.desktop.try_listify = function (attempts_left) {
	if (attempts_left === undefined) attempts_left = 20;

	const $icons_grid = $(".desktop-wrapper .desktop-container .icons-container > .icons").first();
	if ($icons_grid.length && $icons_grid.children(".desktop-icon").length) {
		try {
			xpos.desktop.listify($icons_grid);
		} catch (e) {
			console.error("xpos: desktop icon grid A-Z listify failed", e);
		}
		return;
	}

	if (attempts_left <= 0) return;
	setTimeout(() => xpos.desktop.try_listify(attempts_left - 1), 150);
};

frappe.router.on("change", () => xpos.desktop.try_listify());
xpos.desktop.try_listify();
