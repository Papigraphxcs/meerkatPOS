import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { call, showSuccess, showError, showInfo } from "@/services/api";
import { usePosStore } from "@/stores/posStore";
import {
	addPendingInvoice,
	getAllPendingInvoices,
	updatePendingInvoice,
	deletePendingInvoice,
	countPendingInvoices,
} from "@/services/dbBridge";
import type { PendingInvoice } from "@/services/idbService";
import type { InvoiceData } from "@/types/pos.types";
import { isOnline } from "@/utils";
import __ from "@/lib/translate";

export type OfflineInvoice = PendingInvoice;

export const useOfflineStore = defineStore("offline", () => {
	const isSyncing = ref(false);
	const pendingCount = ref(0);
	const pendingInvoices = ref<OfflineInvoice[]>([]);
	const lastSyncTime = ref("");
	const syncErrors = ref<string[]>([]);
	const isOnline = computed(() => (typeof navigator !== "undefined" ? navigator.onLine : true));

	const MAX_RETRIES = 3;
	const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
	let syncIntervalId: ReturnType<typeof setInterval> | null = null;

	const hasPending = computed(() => pendingCount.value > 0);

	const offlineModeEnabled = computed(() => {
		const posStore = usePosStore();
		return !!posStore.useOfflineMode;
	});

	const statusLabel = computed(() => {
		if (isSyncing.value) return "Syncing...";
		if (!isOnline.value) return "Offline";
		if (pendingCount.value > 0) return `${pendingCount.value} pending`;
		return "Online";
	});

	const statusColor = computed(() => {
		if (isSyncing.value) return "text-blue-500";
		if (!isOnline.value) return "text-red-500";
		if (pendingCount.value > 0) return "text-amber-500";
		return "text-emerald-500";
	});

	function init() {
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		refreshPendingCount();
		startPeriodicSync();
	}

	function destroy() {
		window.removeEventListener("online", handleOnline);
		window.removeEventListener("offline", handleOffline);
		stopPeriodicSync();
	}

	function handleOnline() {
		showSuccess(__("Internet connection restored"));

		if (offlineModeEnabled.value && pendingCount.value > 0) {
			syncPendingInvoices();
		}
	}

	function handleOffline() {
		showError(__("You are offline. Check your internet connection."));
	}

	async function refreshPendingCount() {
		try {
			pendingCount.value = await countPendingInvoices();
		} catch {
			pendingCount.value = 0;
		}
	}

	async function saveOffline(
		invoiceData: InvoiceData,
		customerName?: string,
		grandTotal?: number,
	): Promise<{ success: boolean; localId?: number }> {
		try {
			const record = {
				data: invoiceData as unknown,
				customer_name: customerName || invoiceData.customer,
				grand_total: grandTotal,
			};

			const result = await addPendingInvoice(record);
			await refreshPendingCount();
			await loadPendingInvoices();

			return { success: true, localId: (result as any).id ?? result };
		} catch (error) {
			console.error("Failed to save offline invoice:", error);
			return { success: false };
		}
	}

	async function loadPendingInvoices() {
		try {
			pendingInvoices.value = (await getAllPendingInvoices()) as OfflineInvoice[];
			pendingCount.value = pendingInvoices.value.length;
		} catch {
			pendingInvoices.value = [];
			pendingCount.value = 0;
		}
	}

	async function syncPendingInvoices(): Promise<void> {
		if (isSyncing.value || !isOnline.value) return;

		isSyncing.value = true;
		syncErrors.value = [];

		try {
			const invoices = (await getAllPendingInvoices()) as OfflineInvoice[];
			if (invoices.length === 0) {
				isSyncing.value = false;
				return;
			}

			let synced = 0;
			let failed = 0;

			for (const invoice of invoices) {
				if (!isOnline.value) {
					break;
				}

				try {
					invoice.status = "syncing";
					if (invoice.id) await updatePendingInvoice(invoice.id, { status: "syncing" });

					const result = await call<{ name: string }>("xpos.api.invoices.create_invoice", {
						data: JSON.stringify(invoice.data),
					});
					if (invoice.id) await deletePendingInvoice(invoice.id);
					synced++;
				} catch (error: unknown) {
					failed++;
					invoice.status = "failed";
					invoice.retry_count = (invoice.retry_count || 0) + 1;
					invoice.error = error instanceof Error ? error.message : String(error);

					if (invoice.retry_count >= MAX_RETRIES) {
						syncErrors.value.push(
							`Invoice for ${invoice.customer_name || "Unknown"}: ${invoice.error}`,
						);
					}

					if (invoice.id)
						await updatePendingInvoice(invoice.id, {
							status: "failed",
							retry_count: invoice.retry_count,
							error: invoice.error,
						});
				}
			}

			await refreshPendingCount();
			await loadPendingInvoices();
			lastSyncTime.value = new Date().toISOString();

			if (synced > 0) {
				showSuccess(`Synced ${synced} offline invoice${synced > 1 ? "s" : ""}`);
			}
			if (failed > 0) {
				showError(`Failed to sync ${failed} invoice${failed > 1 ? "s" : ""}. Will retry.`);
			}
		} catch (error) {
			console.error("Sync error:", error);
		} finally {
			isSyncing.value = false;
		}
	}

	async function retrySingle(id: number): Promise<boolean> {
		if (!isOnline.value) {
			showError(__("Cannot sync while offline"));
			return false;
		}

		const invoices = (await getAllPendingInvoices()) as OfflineInvoice[];
		const invoice = invoices.find((i) => i.id === id);
		if (!invoice) return false;

		try {
			invoice.status = "syncing";
			await updatePendingInvoice(invoice.id!, { status: "syncing" });

			await call<{ name: string }>("xpos.api.invoices.create_invoice", {
				data: JSON.stringify(invoice.data),
			});

			await deletePendingInvoice(id);
			await refreshPendingCount();
			await loadPendingInvoices();
			showSuccess(__("Invoice synced successfully"));
			return true;
		} catch (error: unknown) {
			invoice.status = "failed";
			invoice.retry_count = (invoice.retry_count || 0) + 1;
			invoice.error = error instanceof Error ? error.message : String(error);
			await updatePendingInvoice(invoice.id!, {
				status: "failed",
				retry_count: invoice.retry_count,
				error: invoice.error,
			});
			await loadPendingInvoices();
			showError(__("Sync failed:") + " " + invoice.error);
			return false;
		}
	}

	async function deletePending(id: number): Promise<void> {
		await deletePendingInvoice(id);
		await refreshPendingCount();
		await loadPendingInvoices();
	}

	async function clearAll(): Promise<void> {
		const invoices = await getAllPendingInvoices();
		for (const inv of invoices) {
			if ((inv as any).id) await deletePendingInvoice((inv as any).id);
		}
		await refreshPendingCount();
		pendingInvoices.value = [];
	}

	function startPeriodicSync(): void {
		if (syncIntervalId) return;
		syncIntervalId = setInterval(() => {
			syncOfflineData();
		}, SYNC_INTERVAL_MS);
		syncOfflineData();
	}

	function stopPeriodicSync(): void {
		if (syncIntervalId) {
			clearInterval(syncIntervalId);
			syncIntervalId = null;
		}
	}

	async function syncOfflineData(): Promise<void> {
		if (!isOnline.value) return;

		const posStore = usePosStore();
		if (!posStore.isReady || !posStore.profileName) return;

		try {
			const { useItemStore } = await import("@/stores/itemStore");
			const itemStore = useItemStore();
			itemStore.cacheAllItems(posStore.profileName).catch((err) => {
				console.warn("[XPOS Sync] Failed to sync items:", err);
			});

			const { useCustomerStore } = await import("@/stores/customerStore");
			const customerStore = useCustomerStore();
			customerStore.cacheAllCustomers(posStore.profileName).catch((err) => {
				console.warn("[XPOS Sync] Failed to sync customers:", err);
			});

			if (pendingCount.value > 0) {
				syncPendingInvoices();
			}
		} catch (error) {
			console.warn("[XPOS Sync] Background sync error:", error);
		}
	}

	return {
		isSyncing,
		pendingCount,
		pendingInvoices,
		lastSyncTime,
		syncErrors,
		hasPending,
		offlineModeEnabled,
		statusLabel,
		statusColor,
		isOnline,
		init,
		destroy,
		refreshPendingCount,
		saveOffline,
		loadPendingInvoices,
		syncPendingInvoices,
		retrySingle,
		deletePending,
		clearAll,
		startPeriodicSync,
		stopPeriodicSync,
		syncOfflineData,
	};
});
