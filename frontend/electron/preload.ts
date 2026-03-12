import { contextBridge, ipcRenderer } from "electron";

/**
 * Secure bridge between Electron main process and renderer (Vue app).
 * Only expose what the renderer actually needs — never expose ipcRenderer directly.
 */

// ── Forward sync data channels to renderer via window.postMessage ──
// These channels carry bulk data (pull batches, status updates) that the
// renderer's syncIpcHandler.ts listens for via window "message" events.
const SYNC_DATA_CHANNELS = [
  "sync-pull-batch",
  "sync-update-meta",
  "sync-update-record-status",
  "sync-delete-record",
];

for (const channel of SYNC_DATA_CHANNELS) {
  ipcRenderer.on(channel, (_event, payload) => {
    window.postMessage({ channel, payload }, "*");
  });
}

contextBridge.exposeInMainWorld("electronAPI", {
  // ── Server Configuration ─────────────────────────────────────
  getServerUrl: (): Promise<string> => ipcRenderer.invoke("get-server-url"),
  setServerUrl: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("set-server-url", url),

  // ── Platform Info ────────────────────────────────────────────
  getPlatformInfo: (): Promise<{
    platform: string;
    arch: string;
    version: string;
    isElectron: boolean;
  }> => ipcRenderer.invoke("get-platform-info"),

  // ── Auth ─────────────────────────────────────────────────────
  setAuthCookie: (
    cookies: { name: string; value: string; domain: string }[]
  ): Promise<boolean> => ipcRenderer.invoke("set-auth-cookie", cookies),
  clearAuth: (): Promise<boolean> => ipcRenderer.invoke("clear-auth"),

  // ── Sync Engine Events (main → renderer) ─────────────────────
  onSyncStatus: (
    callback: (status: { phase: string; table?: string; progress?: number }) => void
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: { phase: string; table?: string; progress?: number }
    ) => callback(status);
    ipcRenderer.on("sync-status", handler);
    return () => ipcRenderer.removeListener("sync-status", handler);
  },

  onSyncError: (callback: (error: { message: string; table?: string }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      error: { message: string; table?: string }
    ) => callback(error);
    ipcRenderer.on("sync-error", handler);
    return () => ipcRenderer.removeListener("sync-error", handler);
  },

  onSyncComplete: (callback: (summary: { pulled: number; pushed: number }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      summary: { pulled: number; pushed: number }
    ) => callback(summary);
    ipcRenderer.on("sync-complete", handler);
    return () => ipcRenderer.removeListener("sync-complete", handler);
  },

  // ── Real-time Stock Updates (main → renderer) ────────────────
  onStockUpdated: (callback: (data: { warehouse: string; item_code: string; actual_qty: number }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { warehouse: string; item_code: string; actual_qty: number }
    ) => callback(data);
    ipcRenderer.on("stock-updated", handler);
    return () => ipcRenderer.removeListener("stock-updated", handler);
  },

  // ── Sync Control (renderer → main) ──────────────────────────
  triggerSync: (): Promise<boolean> => ipcRenderer.invoke("trigger-sync"),
  getSyncState: (): Promise<{
    isSyncing: boolean;
    lastSyncTime: string | null;
    pendingPushCount: number;
  }> => ipcRenderer.invoke("get-sync-state"),

  // ── Database API (renderer → main → local MariaDB) ──────────
  db: {
    // Settings
    getSetting: (key: string): Promise<string | null> =>
      ipcRenderer.invoke("db:get-setting", key),
    setSetting: (key: string, value: string, category?: string): Promise<boolean> =>
      ipcRenderer.invoke("db:set-setting", key, value, category),
    getSettingsByCategory: (category: string) =>
      ipcRenderer.invoke("db:get-settings-by-category", category),
    getAllSettings: () => ipcRenderer.invoke("db:get-all-settings"),

    // Database config
    testConnection: (config: Record<string, unknown>) =>
      ipcRenderer.invoke("db:test-connection", config),
    getConfig: () => ipcRenderer.invoke("db:get-config"),
    reinit: (config: Record<string, unknown>) =>
      ipcRenderer.invoke("db:reinit", config),

    // Items
    getItems: (opts?: { search?: string; group?: string; limit?: number; offset?: number }) =>
      ipcRenderer.invoke("db:get-items", opts),
    getItem: (itemCode: string) => ipcRenderer.invoke("db:get-item", itemCode),
    upsertItems: (rows: Record<string, unknown>[]) =>
      ipcRenderer.invoke("db:upsert-items", rows),
    countItems: (): Promise<number> => ipcRenderer.invoke("db:count-items"),
    clearItems: () => ipcRenderer.invoke("db:clear-items"),

    // Item Groups
    getItemGroups: () => ipcRenderer.invoke("db:get-item-groups"),
    upsertItemGroups: (rows: Record<string, unknown>[]) =>
      ipcRenderer.invoke("db:upsert-item-groups", rows),

    // Customers
    getCustomers: (opts?: { search?: string; limit?: number }) =>
      ipcRenderer.invoke("db:get-customers", opts),
    getCustomer: (name: string) => ipcRenderer.invoke("db:get-customer", name),
    upsertCustomers: (rows: Record<string, unknown>[]) =>
      ipcRenderer.invoke("db:upsert-customers", rows),
    addLocalCustomer: (customer: Record<string, unknown>) =>
      ipcRenderer.invoke("db:add-local-customer", customer),

    // Suppliers
    getSuppliers: (opts?: { search?: string; limit?: number }) =>
      ipcRenderer.invoke("db:get-suppliers", opts),
    upsertSuppliers: (rows: Record<string, unknown>[]) =>
      ipcRenderer.invoke("db:upsert-suppliers", rows),

    // Stock
    getStock: (warehouse: string, itemCode?: string) =>
      ipcRenderer.invoke("db:get-stock", warehouse, itemCode),
    upsertStock: (warehouse: string, entries: { item_code: string; actual_qty: number }[]) =>
      ipcRenderer.invoke("db:upsert-stock", warehouse, entries),
    updateStockQty: (warehouse: string, itemCode: string, qty: number) =>
      ipcRenderer.invoke("db:update-stock-qty", warehouse, itemCode, qty),

    // Pending Invoices
    addPendingInvoice: (record: { data: unknown; customer_name?: string; grand_total?: number }) =>
      ipcRenderer.invoke("db:add-pending-invoice", record),
    getPendingInvoices: (status?: string) =>
      ipcRenderer.invoke("db:get-pending-invoices", status),
    updatePendingInvoice: (id: number, updates: Record<string, unknown>) =>
      ipcRenderer.invoke("db:update-pending-invoice", id, updates),
    deletePendingInvoice: (id: number) =>
      ipcRenderer.invoke("db:delete-pending-invoice", id),
    countPendingInvoices: (): Promise<number> =>
      ipcRenderer.invoke("db:count-pending-invoices"),

    // Pending Purchases
    addPendingPurchase: (record: { type: string; data: unknown; supplier_name?: string; grand_total?: number }) =>
      ipcRenderer.invoke("db:add-pending-purchase", record),
    getPendingPurchases: (opts?: { type?: string; status?: string }) =>
      ipcRenderer.invoke("db:get-pending-purchases", opts),
    updatePendingPurchase: (id: number, updates: Record<string, unknown>) =>
      ipcRenderer.invoke("db:update-pending-purchase", id, updates),
    deletePendingPurchase: (id: number) =>
      ipcRenderer.invoke("db:delete-pending-purchase", id),

    // Sync ID Map
    addSyncId: (localId: string, serverName: string, doctype: string) =>
      ipcRenderer.invoke("db:add-sync-id", localId, serverName, doctype),
    getServerName: (localId: string): Promise<string | null> =>
      ipcRenderer.invoke("db:get-server-name", localId),

    // Sync Metadata
    getMeta: (key: string): Promise<string | null> =>
      ipcRenderer.invoke("db:get-meta", key),
    setMeta: (key: string, value: string) =>
      ipcRenderer.invoke("db:set-meta", key, value),

    // POS Profile Cache
    cachePosData: (name: string, data: unknown) =>
      ipcRenderer.invoke("db:cache-pos-data", name, data),
    getCachedPosData: (name: string) =>
      ipcRenderer.invoke("db:get-cached-pos-data", name),

    // Item Tax Cache
    cacheItemTax: (itemCode: string, company: string, data: { item_tax_template: string | null; item_tax_map: Record<string, number> }) =>
      ipcRenderer.invoke("db:cache-item-tax", itemCode, company, data),
    getCachedItemTax: (itemCode: string, company: string) =>
      ipcRenderer.invoke("db:get-cached-item-tax", itemCode, company),

    // Bulk Operations
    clearAllData: () => ipcRenderer.invoke("db:clear-all-data"),
    clearPendingData: () => ipcRenderer.invoke("db:clear-pending-data"),
  },

  // ── Auto-Update API ──────────────────────────────────────────
  update: {
    check: (): Promise<{ success: boolean; version?: string; error?: string }> =>
      ipcRenderer.invoke("update:check"),
    download: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("update:download"),
    install: (): Promise<void> => ipcRenderer.invoke("update:install"),
    onStatus: (callback: (status: Record<string, unknown>) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: Record<string, unknown>) =>
        callback(status);
      ipcRenderer.on("update-status", handler);
      return () => ipcRenderer.removeListener("update-status", handler);
    },
  },

  // ── Hub / Till Role API ──────────────────────────────────────
  node: {
    getRole: (): Promise<string> => ipcRenderer.invoke("node:get-role"),
    setRole: (config: {
      role: string;
      hubUrl?: string;
      tillId?: string;
      hubApiPort?: number;
    }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("node:set-role", config),
    pingHub: (): Promise<boolean> => ipcRenderer.invoke("node:ping-hub"),
    triggerTillSync: (): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke("node:trigger-till-sync"),
  },
});
