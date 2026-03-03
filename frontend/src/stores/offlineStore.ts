import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { call, showSuccess, showError, showInfo } from "@/services/api";
import { usePosStore } from "@/stores/posStore";
import {
  addPendingInvoice,
  getAllPendingInvoices,
  updatePendingInvoice,
  deletePendingInvoice as idbDeletePending,
  countPendingInvoices,
  type PendingInvoice,
} from "@/services/idbService";
import type { InvoiceData } from "@/types/pos.types";

export type OfflineInvoice = PendingInvoice;

// ─── Store ───────────────────────────────────────
export const useOfflineStore = defineStore("offline", () => {
    // State
    const isOnline = ref(navigator.onLine);
    const isSyncing = ref(false);
    const pendingCount = ref(0);
    const pendingInvoices = ref<OfflineInvoice[]>([]);
    const lastSyncTime = ref("");
    const syncErrors = ref<string[]>([]);

    // Max retries before marking failed
    const MAX_RETRIES = 3;

    // ─── Computed ──────────────────────────────────
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
    }

    function destroy() {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
    }

    function handleOnline() {
        isOnline.value = true;
        showInfo("Internet connection restored");
        
        if (offlineModeEnabled.value && pendingCount.value > 0) {
            syncPendingInvoices();
        }
    }

    function handleOffline() {
        isOnline.value = false;
        if (offlineModeEnabled.value) {
            showInfo("You are offline. Invoices will be saved locally.");
        }
    }

    async function refreshPendingCount() {
        try {
            pendingCount.value = await countPendingInvoices();
        } catch {
            pendingCount.value = 0;
        }
    }

    // ─── Save invoice offline ─────────────────────
    async function saveOffline(
        invoiceData: InvoiceData,
        customerName?: string,
        grandTotal?: number
    ): Promise<{ success: boolean; localId?: number }> {
        try {
            const record = {
                data: invoiceData as unknown,
                status: "pending" as const,
                created_at: new Date().toISOString(),
                retry_count: 0,
                customer_name: customerName || invoiceData.customer,
                grand_total: grandTotal,
            };

            const id = await addPendingInvoice(record);
            await refreshPendingCount();
            await loadPendingInvoices();

            return { success: true, localId: id };
        } catch (error) {
            console.error("Failed to save offline invoice:", error);
            return { success: false };
        }
    }

    // ─── Load all pending invoices ─────────────────
    async function loadPendingInvoices() {
        try {
            pendingInvoices.value = await getAllPendingInvoices() as OfflineInvoice[];
            pendingCount.value = pendingInvoices.value.length;
        } catch {
            pendingInvoices.value = [];
            pendingCount.value = 0;
        }
    }

    // ─── Sync all pending invoices ─────────────────
    async function syncPendingInvoices(): Promise<void> {
        if (isSyncing.value || !isOnline.value) return;

        isSyncing.value = true;
        syncErrors.value = [];

        try {
            const invoices = await getAllPendingInvoices() as OfflineInvoice[];
            if (invoices.length === 0) {
                isSyncing.value = false;
                return;
            }

            let synced = 0;
            let failed = 0;

            for (const invoice of invoices) {
                if (!isOnline.value) {
                    // Lost connection mid-sync
                    break;
                }

                try {
                    // Mark as syncing
                    invoice.status = "syncing";
                    if (invoice.id) await updatePendingInvoice(invoice as PendingInvoice);

                    const result = await call<{ name: string }>(
                        "xpos.api.invoices.create_invoice",
                        { data: JSON.stringify(invoice.data) }
                    );

                    // Success — remove from IndexedDB
                    if (invoice.id) await idbDeletePending(invoice.id);
                    synced++;
                } catch (error: unknown) {
                    failed++;
                    invoice.status = "failed";
                    invoice.retry_count = (invoice.retry_count || 0) + 1;
                    invoice.error = error instanceof Error ? error.message : String(error);

                    if (invoice.retry_count >= MAX_RETRIES) {
                        // Keep in DB but mark as permanently failed
                        syncErrors.value.push(
                            `Invoice for ${invoice.customer_name || "Unknown"}: ${invoice.error}`
                        );
                    }

                    if (invoice.id) await updatePendingInvoice(invoice as PendingInvoice);
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

    // ─── Retry a single failed invoice ─────────────
    async function retrySingle(id: number): Promise<boolean> {
        if (!isOnline.value) {
            showError("Cannot sync while offline");
            return false;
        }

        const invoices = await getAllPendingInvoices() as OfflineInvoice[];
        const invoice = invoices.find((i) => i.id === id);
        if (!invoice) return false;

        try {
            invoice.status = "syncing";
            await updatePendingInvoice(invoice as PendingInvoice);

            await call<{ name: string }>(
                "xpos.api.invoices.create_invoice",
                { data: JSON.stringify(invoice.data) }
            );

            await idbDeletePending(id);
            await refreshPendingCount();
            await loadPendingInvoices();
            showSuccess("Invoice synced successfully");
            return true;
        } catch (error: unknown) {
            invoice.status = "failed";
            invoice.retry_count = (invoice.retry_count || 0) + 1;
            invoice.error = error instanceof Error ? error.message : String(error);
            await updatePendingInvoice(invoice as PendingInvoice);
            await loadPendingInvoices();
            showError("Sync failed: " + invoice.error);
            return false;
        }
    }

    // ─── Delete a pending invoice ──────────────────
    async function deletePending(id: number): Promise<void> {
        await idbDeletePending(id);
        await refreshPendingCount();
        await loadPendingInvoices();
    }

    // ─── Clear all pending invoices ────────────────
    async function clearAll(): Promise<void> {
        const invoices = await getAllPendingInvoices();
        for (const inv of invoices) {
            if (inv.id) await idbDeletePending(inv.id);
        }
        await refreshPendingCount();
        pendingInvoices.value = [];
    }

    return {
        // State
        isOnline,
        isSyncing,
        pendingCount,
        pendingInvoices,
        lastSyncTime,
        syncErrors,
        // Computed
        hasPending,
        offlineModeEnabled,
        statusLabel,
        statusColor,
        // Actions
        init,
        destroy,
        refreshPendingCount,
        saveOffline,
        loadPendingInvoices,
        syncPendingInvoices,
        retrySingle,
        deletePending,
        clearAll,
    };
});
