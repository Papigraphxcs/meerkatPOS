/**
 * Electron environment detection and bridge.
 *
 * In browser/PWA mode: API calls go to same origin (relative URLs).
 * In Electron mode: API calls go to the configured server URL (absolute URLs).
 *
 * This module abstracts the difference so the rest of the app doesn't care.
 */

export interface ElectronAPI {
  isFirstRun: () => Promise<boolean>;
  testErpNext: (config: { url: string; apiKey?: string; apiSecret?: string }) => Promise<{ success: boolean; error?: string }>;
  getServerUrl: () => Promise<string>;
  setServerUrl: (url: string) => Promise<boolean>;
  getPlatformInfo: () => Promise<{
    platform: string;
    arch: string;
    version: string;
    isElectron: boolean;
    logDir: string;
  }>;
  checkMariaDb: () => Promise<{
    installed: boolean;
    version: string | null;
    binary: string | null;
  }>;
  setAuthCookie: (
    cookies: { name: string; value: string; domain: string }[]
  ) => Promise<boolean>;
  clearAuth: () => Promise<boolean>;
  onSyncStatus: (
    callback: (status: { phase: string; table?: string; progress?: number }) => void
  ) => () => void;
  onSyncError: (
    callback: (error: { message: string; table?: string }) => void
  ) => () => void;
  onSyncComplete: (
    callback: (summary: { pulled: number; pushed: number }) => void
  ) => () => void;
  onStockUpdated: (
    callback: (data: { warehouse: string; item_code: string; actual_qty: number }) => void
  ) => () => void;
  triggerSync: () => Promise<boolean>;
  startSyncEngine: (opts?: { csrfToken?: string; sessionCookies?: string }) => Promise<{ success: boolean; error?: string }>;
  getSyncState: () => Promise<{
    isSyncing: boolean;
    lastSyncTime: string | null;
    pendingPushCount: number;
  }>;
  db: ElectronDbAPI;
  update: ElectronUpdateAPI;
  node: ElectronNodeAPI;
  print: ElectronPrintAPI;
}

export interface ElectronPrintAPI {
  printInvoice: (data: {
    localId: number;
    data: unknown;
    customerName: string;
    grandTotal: number;
    isReturn: boolean;
    printFormat: string;
    letterHead: string;
    companyName: string;
  }) => Promise<{ success: boolean; error?: string }>;
  printReport: (html: string, options?: {
    landscape?: boolean;
    margins?: Record<string, number>;
  }) => Promise<{ success: boolean; error?: string }>;
}

export interface ElectronUpdateAPI {
  check: () => Promise<{ success: boolean; version?: string; error?: string }>;
  download: () => Promise<{ success: boolean; error?: string }>;
  install: () => Promise<void>;
  onStatus: (callback: (status: Record<string, unknown>) => void) => () => void;
}

export interface ElectronNodeAPI {
  getRole: () => Promise<string>;
  setRole: (config: {
    role: string;
    hubUrl?: string;
    tillId?: string;
    hubApiPort?: number;
    hubSecret?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  pingHub: () => Promise<boolean>;
  getHubSecret: () => Promise<string | null>;
  triggerTillSync: () => Promise<Record<string, unknown>>;
}

export interface ElectronDbAPI {
  // Settings
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string, category?: string) => Promise<boolean>;
  getSettingsByCategory: (category: string) => Promise<{ key: string; value: string }[]>;
  getAllSettings: () => Promise<{ key: string; value: string; category: string }[]>;

  // Database config
  testConnection: (config: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  getConfig: () => Promise<Record<string, unknown>>;
  reinit: (config: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;

  // Items
  getItems: (opts?: { search?: string; group?: string; limit?: number; offset?: number; priceList?: string; warehouse?: string }) => Promise<Record<string, unknown>[]>;
  getItem: (itemCode: string) => Promise<Record<string, unknown> | null>;
  upsertItems: (rows: Record<string, unknown>[]) => Promise<void>;
  countItems: () => Promise<number>;
  clearItems: () => Promise<void>;

  // Item Groups
  getItemGroups: () => Promise<Record<string, unknown>[]>;
  upsertItemGroups: (rows: Record<string, unknown>[]) => Promise<void>;

  // Customers
  getCustomers: (opts?: { search?: string; limit?: number }) => Promise<Record<string, unknown>[]>;
  getCustomer: (name: string) => Promise<Record<string, unknown> | null>;
  upsertCustomers: (rows: Record<string, unknown>[]) => Promise<void>;
  addLocalCustomer: (customer: Record<string, unknown>) => Promise<{ name: string; local_id: string }>;

  // Suppliers
  getSuppliers: (opts?: { search?: string; limit?: number }) => Promise<Record<string, unknown>[]>;
  upsertSuppliers: (rows: Record<string, unknown>[]) => Promise<void>;

  // Stock
  getStock: (warehouse: string, itemCode?: string) => Promise<Record<string, unknown> | Record<string, unknown>[]>;
  upsertStock: (warehouse: string, entries: { item_code: string; actual_qty: number }[]) => Promise<void>;
  updateStockQty: (warehouse: string, itemCode: string, qty: number) => Promise<boolean>;

  // Pending Invoices
  addPendingInvoice: (record: { data: unknown; customer_name?: string; grand_total?: number }) => Promise<{ id: number; local_id: string }>;
  getPendingInvoice: (id: number) => Promise<{
    id: number;
    local_id: string;
    data: Record<string, unknown>;
    status: string;
    customer_name: string | null;
    grand_total: number;
    is_return: boolean;
    is_draft: boolean;
  } | null>;
  getPendingInvoices: (status?: string) => Promise<Record<string, unknown>[]>;
  updatePendingInvoice: (id: number, updates: Record<string, unknown>) => Promise<boolean>;
  deletePendingInvoice: (id: number) => Promise<boolean>;
  countPendingInvoices: () => Promise<number>;

  // Pending Purchases
  addPendingPurchase: (record: { type: string; data: unknown; supplier_name?: string; grand_total?: number }) => Promise<{ id: number; local_id: string }>;
  getPendingPurchases: (opts?: { type?: string; status?: string }) => Promise<Record<string, unknown>[]>;
  updatePendingPurchase: (id: number, updates: Record<string, unknown>) => Promise<boolean>;
  deletePendingPurchase: (id: number) => Promise<boolean>;
  countPendingPurchases: () => Promise<number>;

  // Sync ID Map
  addSyncId: (localId: string, serverName: string, doctype: string) => Promise<boolean>;
  getServerName: (localId: string) => Promise<string | null>;

  // Sync Metadata
  getMeta: (key: string) => Promise<string | null>;
  setMeta: (key: string, value: string) => Promise<boolean>;

  // POS Profile Cache
  cachePosData: (name: string, data: unknown) => Promise<boolean>;
  getCachedPosData: (name: string) => Promise<unknown>;

  // Item Tax Cache
  cacheItemTax: (itemCode: string, company: string, data: { item_tax_template: string | null; item_tax_map: Record<string, number> }) => Promise<boolean>;
  getCachedItemTax: (itemCode: string, company: string) => Promise<{ item_tax_template: string; item_tax_map: Record<string, number> } | null>;

  // POS Users
  getPosUser: (username: string) => Promise<Record<string, unknown> | null>;
  createLocalUser: (user: { username: string; full_name: string; password: string; role?: string }) => Promise<{ success: boolean; error?: string }>;

  // POS Opening Shifts
  createPosOpeningShift: (shift: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getOpenShift: (user: string) => Promise<Record<string, unknown> | null>;
  checkOpenShift: (user: string) => Promise<Record<string, unknown> | null>;

  // Opening Data (profiles + companies)
  getOpeningData: () => Promise<Record<string, unknown>>;

  // Bulk Operations
  clearAllData: () => Promise<boolean>;
  clearPendingData: () => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

/** True when running inside Electron (preload script exposed electronAPI). */
export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI;
}

/** Cached server URL to avoid async lookups on every API call. */
let _serverUrl: string | null = null;

/** Cached API credentials to avoid async lookups on every API call. */
let _apiKey: string | null = null;
let _apiSecret: string | null = null;

/**
 * Get the base URL for API calls.
 * - Browser/PWA: returns "" (same origin, relative URLs)
 * - Electron: returns the configured server URL (e.g. "https://erp.example.com")
 */
export async function getApiBaseUrl(): Promise<string> {
  if (!isElectron()) return "";

  if (_serverUrl) return _serverUrl;

  _serverUrl = await window.electronAPI!.getServerUrl();
  return _serverUrl;
}

/**
 * Synchronous version — returns cached value or empty string.
 * Call `getApiBaseUrl()` at least once during init to warm the cache.
 */
export function getApiBaseUrlSync(): string {
  if (!isElectron()) return "";
  return _serverUrl || "";
}

/**
 * Update the server URL (e.g. from a settings screen).
 */
export async function setServerUrl(url: string): Promise<void> {
  if (isElectron()) {
    await window.electronAPI!.setServerUrl(url);
  }
  _serverUrl = url;
}

/**
 * Clear the cached server URL (on logout).
 */
export function clearServerUrlCache(): void {
  _serverUrl = null;
}

/**
 * Warm the API credential cache from the local DB.
 * Call once at startup so getApiCredentialsSync() works synchronously.
 */
export async function warmApiCredentials(): Promise<void> {
  if (!isElectron()) return;
  _apiKey = await window.electronAPI!.db.getMeta("api_key");
  _apiSecret = await window.electronAPI!.db.getMeta("api_secret");
}

/**
 * Synchronous — returns cached API key and secret.
 * Returns null values if not yet warmed or not configured.
 */
export function getApiCredentialsSync(): { apiKey: string | null; apiSecret: string | null } {
  return { apiKey: _apiKey, apiSecret: _apiSecret };
}

/**
 * Clear the cached API credentials (on logout).
 */
export function clearApiCredentialsCache(): void {
  _apiKey = null;
  _apiSecret = null;
}
