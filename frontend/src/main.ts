import "./style.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import { showError } from "@/services/api";
import { isElectron, getApiBaseUrl, warmApiCredentials } from "@/services/electronBridge";
import { usePosStore } from "./stores/posStore";
import { initializeNamespaces } from "./utils";
import { dayjs } from "@/utils/datetime";
import translate from "./lib/translate";

if (!isElectron() && import.meta.env.PROD) {
	import("virtual:pwa-register").then(({ registerSW }) => {
		const updateSW = registerSW({
			onNeedRefresh() {
				if (confirm("A new version of X POS is available. Reload to update?")) {
					updateSW(true);
				}
			},
			onOfflineReady() {
				console.log("[XPOS PWA] App is ready for offline use");
			},
			onRegisteredSW(_swUrl, r) {
				if (r) {
					setInterval(
						() => {
							r.update();
						},
						60 * 60 * 1000,
					);
				}
			},
		});
	});
} else {
	getApiBaseUrl().then((url) => {
		console.log("[XPOS Electron] Server URL:", url);
	});
	warmApiCredentials().then(() => {
		console.log("[XPOS Electron] API credentials cache warmed");
	});
}

async function initializeBrowserStorage(): Promise<void> {
	if (isElectron()) return;
	if (!usePosStore().useOfflineMode) return;

	try {
		const { ensureDatabaseReady } = await import("@/services/idbService");
		await ensureDatabaseReady();
	} catch (error) {
		console.warn("[XPOS] Browser storage initialization failed", error);
	}
}

(async () => {
	const app = createApp(App);
	const pinia = createPinia();
	window.__ = translate;
	app.use(pinia);
	app.use(router);
	initializeNamespaces();
	await initializeBrowserStorage();
	app.config.globalProperties.$dayjs = dayjs;
	app.config.errorHandler = (err: unknown, _instance: unknown, info: string) => {
		console.error("X POS Error:", err, info);
		showError(`Error: ${err instanceof Error ? err.message : String(err)}`);
	};

	app.mount("#app");
})();
