frappe.provide("xpos.desktop");

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
