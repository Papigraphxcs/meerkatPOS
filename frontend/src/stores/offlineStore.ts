import { defineStore } from "pinia";
import { ref, computed, watch, type Ref, type ComputedRef } from "vue";
import { call, showSuccess, showError, showInfo } from "@/services/api";
import { usePosStore } from "@/stores/posStore";
import type { InvoiceData } from "@/types/pos.types";

// ─── IndexedDB helpers (with in-memory fallback) ─
const DB_NAME = "xpos_offline";
const DB_VERSION = 1;
const STORE_NAME = "pending_invoices";

/** Whether IndexedDB is available on this browser/session */
let idbAvailable: boolean | null = null;
let nextMemId = 1;
const memoryStore: Map<number, OfflineInvoice> = new Map();

async function checkIDB(): Promise<boolean> {
    if (idbAvailable !== null) return idbAvailable;
    try {
        await new Promise<void>((resolve, reject) => {
            const req = indexedDB.open("__xpos_idb_test__", 1);
            req.onsuccess = () => { req.result.close(); resolve(); };
            req.onerror = () => reject(req.error);
            req.onblocked = () => reject(new Error("blocked"));
        });
        // Clean up test DB
        indexedDB.deleteDatabase("__xpos_idb_test__");
        idbAvailable = true;
    } catch {
        console.warn("[XPOS Offline] IndexedDB unavailable – using in-memory fallback");
        idbAvailable = false;
    }
    return idbAvailable;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
                store.createIndex("created_at", "created_at", { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("IndexedDB blocked"));
    });
}

async function dbAdd(record: OfflineInvoice): Promise<number> {
    if (!(await checkIDB())) {
        const id = nextMemId++;
        memoryStore.set(id, { ...record, id });
        return id;
    }
    const db = await openDB();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.add(record);
            tx.oncomplete = () => resolve(req.result as number);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

async function dbGetAll(): Promise<OfflineInvoice[]> {
    if (!(await checkIDB())) {
        return Array.from(memoryStore.values());
    }
    const db = await openDB();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            tx.oncomplete = () => resolve(req.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

async function dbDelete(id: number): Promise<void> {
    if (!(await checkIDB())) {
        memoryStore.delete(id);
        return;
    }
    const db = await openDB();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            store.delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

async function dbUpdate(record: OfflineInvoice): Promise<void> {
    if (!(await checkIDB())) {
        if (record.id) memoryStore.set(record.id, { ...record });
        return;
    }
    const db = await openDB();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            store.put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

async function dbCount(): Promise<number> {
    if (!(await checkIDB())) {
        return memoryStore.size;
    }
    const db = await openDB();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.count();
            tx.oncomplete = () => resolve(req.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

// ─── Types ───────────────────────────────────────
export interface OfflineInvoice {
    id?: number;
    data: InvoiceData;
    status: "pending" | "syncing" | "failed";
    created_at: string;
    error?: string;
    retry_count: number;
    customer_name?: string;
    grand_total?: number;
}

// ─── Store ───────────────────────────────────────
export const useOfflineStore = defineStore("offline", () => {
    // State
    const isOnline: Ref<boolean> = ref(navigator.onLine);
    const isSyncing: Ref<boolean> = ref(false);
    const pendingCount: Ref<number> = ref(0);
    const pendingInvoices: Ref<OfflineInvoice[]> = ref([]);
    const lastSyncTime: Ref<string> = ref("");
    const syncErrors: Ref<string[]> = ref([]);

    // Max retries before marking failed
    const MAX_RETRIES = 3;

    // ─── Computed ──────────────────────────────────
    const hasPending: ComputedRef<boolean> = computed(() => pendingCount.value > 0);

    const offlineModeEnabled: ComputedRef<boolean> = computed(() => {
        const posStore = usePosStore();
        return !!posStore.posProfile?.posa_local_storage;
    });

    const statusLabel: ComputedRef<string> = computed(() => {
        if (isSyncing.value) return "Syncing...";
        if (!isOnline.value) return "Offline";
        if (pendingCount.value > 0) return `${pendingCount.value} pending`;
        return "Online";
    });

    const statusColor: ComputedRef<string> = computed(() => {
        if (isSyncing.value) return "text-blue-500";
        if (!isOnline.value) return "text-red-500";
        if (pendingCount.value > 0) return "text-amber-500";
        return "text-emerald-500";
    });

    // ─── Lifecycle ─────────────────────────────────
    function init() {
        // Listen to browser online/offline events
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        // Load pending count from IndexedDB
        refreshPendingCount();
    }

    function destroy() {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
    }

    function handleOnline() {
        isOnline.value = true;
        showInfo("Internet connection restored");
        // Auto-sync when back online
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
            pendingCount.value = await dbCount();
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
            const record: OfflineInvoice = {
                data: invoiceData,
                status: "pending",
                created_at: new Date().toISOString(),
                retry_count: 0,
                customer_name: customerName || invoiceData.customer,
                grand_total: grandTotal,
            };

            const id = await dbAdd(record);
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
            pendingInvoices.value = await dbGetAll();
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
            const invoices = await dbGetAll();
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
                    if (invoice.id) await dbUpdate(invoice);

                    const result = await call<{ name: string }>(
                        "xpos.api.invoices.create_invoice",
                        { data: JSON.stringify(invoice.data) }
                    );

                    // Success — remove from IndexedDB
                    if (invoice.id) await dbDelete(invoice.id);
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

                    if (invoice.id) await dbUpdate(invoice);
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

        const invoices = await dbGetAll();
        const invoice = invoices.find((i) => i.id === id);
        if (!invoice) return false;

        try {
            invoice.status = "syncing";
            await dbUpdate(invoice);

            await call<{ name: string }>(
                "xpos.api.invoices.create_invoice",
                { data: JSON.stringify(invoice.data) }
            );

            await dbDelete(id);
            await refreshPendingCount();
            await loadPendingInvoices();
            showSuccess("Invoice synced successfully");
            return true;
        } catch (error: unknown) {
            invoice.status = "failed";
            invoice.retry_count = (invoice.retry_count || 0) + 1;
            invoice.error = error instanceof Error ? error.message : String(error);
            await dbUpdate(invoice);
            await loadPendingInvoices();
            showError("Sync failed: " + invoice.error);
            return false;
        }
    }

    // ─── Delete a pending invoice ──────────────────
    async function deletePending(id: number): Promise<void> {
        await dbDelete(id);
        await refreshPendingCount();
        await loadPendingInvoices();
    }

    // ─── Clear all pending invoices ────────────────
    async function clearAll(): Promise<void> {
        const invoices = await dbGetAll();
        for (const inv of invoices) {
            if (inv.id) await dbDelete(inv.id);
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
