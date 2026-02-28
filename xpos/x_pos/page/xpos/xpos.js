frappe.pages["xpos"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "X POS",
		single_column: true,
	});

	wrapper.xpos_page = page;

	// Wait for the Vue bundle to load via loader.js  
	const bundlePromise = window.__xposBundlePromise || Promise.resolve();

	bundlePromise
		.then(() => {
			// Wait for the bundle to define frappe.XPos.app
			return new Promise((resolve, reject) => {
				const timeout = 15000;
				const start = Date.now();
				const check = () => {
					if (frappe.XPos && frappe.XPos.app) {
						resolve();
					} else if (Date.now() - start > timeout) {
						reject(new Error("X POS bundle failed to load"));
					} else {
						setTimeout(check, 100);
					}
				};
				check();
			});
		})
		.then(() => {
			wrapper.xpos_vue_app = new frappe.XPos.app(page);
		})
		.catch((err) => {
			console.error("X POS load error:", err);
			const mainSection = $(wrapper).find(".main-section");
			mainSection.html(`
				<div style="display:flex;align-items:center;justify-content:center;height:80vh;flex-direction:column;gap:16px;">
					<div style="font-size:48px;">⚠️</div>
					<h3 style="color:#6b7280;">Failed to load X POS</h3>
					<p style="color:#9ca3af;">Please refresh the page or check your console for errors.</p>
					<button class="btn btn-primary" onclick="location.reload()">Reload</button>
				</div>
			`);
		});
};

frappe.pages["xpos"].on_page_unload = function (wrapper) {
	if (wrapper.xpos_vue_app && wrapper.xpos_vue_app.unmount) {
		wrapper.xpos_vue_app.unmount();
	}
};
