/**
 * Renderer-side database bridge.
 *
 * In Electron mode → calls go through IPC to the main process → local MariaDB.
 * In browser/PWA mode → calls go through Dexie (IndexedDB).
 *
 * Import this module in stores/composables instead of importing idbService
 * or electronBridge.db directly. It hides the environment difference.
 */

import { isElectron } from "./electronBridge";

function getDb() {
  return window.electronAPI!.db;
}

// ── Items ─────────────────────────────────────────────────────────

export async function getItems(opts?: {
  search?: string;
  group?: string;
  limit?: number;
  offset?: number;
}) {
  if (isElectron()) {
    return getDb().getItems(opts);
  }
  // Fallback: load from IndexedDB (lazy import to avoid bundling Dexie in Electron)
  const { db } = await import("./idbService");
  let col = db.items.orderBy("item_name");
  if (opts?.group && opts.group !== "All Item Groups") {
    col = db.items.where("item_group").equals(opts.group);
  }
  let results = await col.toArray();
  if (opts?.search) {
    const s = opts.search.toLowerCase();
    results = results.filter(
      (r: Record<string, unknown>) =>
        String(r.item_code || "").toLowerCase().includes(s) ||
        String(r.item_name || "").toLowerCase().includes(s) ||
        String(r.barcode || "").toLowerCase().includes(s)
    );
  }
  if (opts?.offset) results = results.slice(opts.offset);
  if (opts?.limit) results = results.slice(0, opts.limit);
  return results;
}

export async function getItem(itemCode: string) {
  if (isElectron()) {
    return getDb().getItem(itemCode);
  }
  const { db } = await import("./idbService");
  return db.items.get(itemCode) ?? null;
}

export async function upsertItems(rows: Record<string, unknown>[]) {
  if (isElectron()) {
    return getDb().upsertItems(rows);
  }
  const { db } = await import("./idbService");
  await db.items.bulkPut(rows as never[]);
}

export async function countItems() {
  if (isElectron()) {
    return getDb().countItems();
  }
  const { db } = await import("./idbService");
  return db.items.count();
}

export async function clearItems() {
  if (isElectron()) {
    return getDb().clearItems();
  }
  const { db } = await import("./idbService");
  await db.items.clear();
}

// ── Item Groups ───────────────────────────────────────────────────

export async function getItemGroups() {
  if (isElectron()) {
    return getDb().getItemGroups();
  }
  const { db } = await import("./idbService");
  return db.itemGroups.toArray();
}

export async function upsertItemGroups(rows: Record<string, unknown>[]) {
  if (isElectron()) {
    return getDb().upsertItemGroups(rows);
  }
  const { db } = await import("./idbService");
  await db.itemGroups.bulkPut(rows as never[]);
}

// ── Customers ─────────────────────────────────────────────────────

export async function getCustomers(opts?: { search?: string; limit?: number }) {
  if (isElectron()) {
    return getDb().getCustomers(opts);
  }
  const { db } = await import("./idbService");
  let results = await db.customers.toArray();
  if (opts?.search) {
    const s = opts.search.toLowerCase();
    results = results.filter(
      (r: Record<string, unknown>) =>
        String(r.customer_name || "").toLowerCase().includes(s) ||
        String(r.name || "").toLowerCase().includes(s) ||
        String(r.mobile_no || "").toLowerCase().includes(s)
    );
  }
  if (opts?.limit) results = results.slice(0, opts.limit);
  return results;
}

export async function getCustomer(name: string) {
  if (isElectron()) {
    return getDb().getCustomer(name);
  }
  const { db } = await import("./idbService");
  return db.customers.get(name) ?? null;
}

export async function upsertCustomers(rows: Record<string, unknown>[]) {
  if (isElectron()) {
    return getDb().upsertCustomers(rows);
  }
  const { db } = await import("./idbService");
  await db.customers.bulkPut(rows as never[]);
}

export async function addLocalCustomer(customer: Record<string, unknown>) {
  if (isElectron()) {
    return getDb().addLocalCustomer(customer);
  }
  const { db } = await import("./idbService");
  const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await db.customers.add({ ...customer, name: localId, is_local: 1, local_id: localId } as never);
  return { name: localId, local_id: localId };
}

// ── Suppliers ─────────────────────────────────────────────────────

export async function getSuppliers(opts?: { search?: string; limit?: number }) {
  if (isElectron()) {
    return getDb().getSuppliers(opts);
  }
  const { db } = await import("./idbService");
  let results = await db.suppliers.toArray();
  if (opts?.search) {
    const s = opts.search.toLowerCase();
    results = results.filter(
      (r) =>
        String((r as any).supplier_name || "").toLowerCase().includes(s) ||
        String((r as any).name || "").toLowerCase().includes(s)
    );
  }
  if (opts?.limit) results = results.slice(0, opts.limit);
  return results;
}

export async function upsertSuppliers(rows: Record<string, unknown>[]) {
  if (isElectron()) {
    return getDb().upsertSuppliers(rows);
  }
  const { db } = await import("./idbService");
  await db.suppliers.bulkPut(rows as never[]);
}

// ── Stock Cache ───────────────────────────────────────────────────

export async function getStock(warehouse: string, itemCode?: string) {
  if (isElectron()) {
    return getDb().getStock(warehouse, itemCode);
  }
  const { db } = await import("./idbService");
  if (itemCode) {
    return db.table("stockCache").get(`${warehouse}::${itemCode}`) ?? null;
  }
  return db.table("stockCache").where("warehouse").equals(warehouse).toArray();
}

export async function upsertStock(
  warehouse: string,
  entries: { item_code: string; actual_qty: number }[]
) {
  if (isElectron()) {
    return getDb().upsertStock(warehouse, entries);
  }
  const { db } = await import("./idbService");
  const rows = entries.map((e) => ({
    cache_key: `${warehouse}::${e.item_code}`,
    warehouse,
    item_code: e.item_code,
    actual_qty: e.actual_qty,
  }));
  await db.table("stockCache").bulkPut(rows);
}

export async function updateStockQty(warehouse: string, itemCode: string, qty: number) {
  if (isElectron()) {
    return getDb().updateStockQty(warehouse, itemCode, qty);
  }
  const { db } = await import("./idbService");
  await db.table("stockCache").put({
    cache_key: `${warehouse}::${itemCode}`,
    warehouse,
    item_code: itemCode,
    actual_qty: qty,
  });
  return true;
}

// ── Pending Invoices ──────────────────────────────────────────────

export async function addPendingInvoice(record: {
  data: unknown;
  customer_name?: string;
  grand_total?: number;
}) {
  if (isElectron()) {
    return getDb().addPendingInvoice(record);
  }
  const { db } = await import("./idbService");
  const localId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const id = await db.table("pendingInvoices").add({
    local_id: localId,
    data: record.data,
    status: "pending",
    customer_name: record.customer_name,
    grand_total: record.grand_total,
    created_at: new Date().toISOString(),
  });
  return { id: id as number, local_id: localId };
}

export async function getPendingInvoices(status?: string) {
  if (isElectron()) {
    return getDb().getPendingInvoices(status);
  }
  const { db } = await import("./idbService");
  if (status) {
    return db.table("pendingInvoices").where("status").equals(status).toArray();
  }
  return db.table("pendingInvoices").toArray();
}

export async function updatePendingInvoice(id: number, updates: Record<string, unknown>) {
  if (isElectron()) {
    return getDb().updatePendingInvoice(id, updates);
  }
  const { db } = await import("./idbService");
  await db.table("pendingInvoices").update(id, updates);
  return true;
}

export async function deletePendingInvoice(id: number) {
  if (isElectron()) {
    return getDb().deletePendingInvoice(id);
  }
  const { db } = await import("./idbService");
  await db.table("pendingInvoices").delete(id);
  return true;
}

export async function countPendingInvoices() {
  if (isElectron()) {
    return getDb().countPendingInvoices();
  }
  const { db } = await import("./idbService");
  return db.table("pendingInvoices").where("status").anyOf(["pending", "failed"]).count();
}

// ── Pending Purchases ─────────────────────────────────────────────

export async function addPendingPurchase(record: {
  type: string;
  data: unknown;
  supplier_name?: string;
  grand_total?: number;
}) {
  if (isElectron()) {
    return getDb().addPendingPurchase(record);
  }
  const { db } = await import("./idbService");
  const localId = `pur_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const id = await db.table("pendingPurchases").add({
    local_id: localId,
    type: record.type,
    data: record.data,
    status: "pending",
    supplier_name: record.supplier_name,
    grand_total: record.grand_total,
    created_at: new Date().toISOString(),
  });
  return { id: id as number, local_id: localId };
}

export async function getPendingPurchases(opts?: { type?: string; status?: string }) {
  if (isElectron()) {
    return getDb().getPendingPurchases(opts);
  }
  const { db } = await import("./idbService");
  let col = db.table("pendingPurchases").toCollection();
  if (opts?.type) col = db.table("pendingPurchases").where("type").equals(opts.type);
  let results = await col.toArray();
  if (opts?.status) results = results.filter((r: Record<string, unknown>) => r.status === opts.status);
  return results;
}

export async function updatePendingPurchase(id: number, updates: Record<string, unknown>) {
  if (isElectron()) {
    return getDb().updatePendingPurchase(id, updates);
  }
  const { db } = await import("./idbService");
  await db.table("pendingPurchases").update(id, updates);
  return true;
}

export async function deletePendingPurchase(id: number) {
  if (isElectron()) {
    return getDb().deletePendingPurchase(id);
  }
  const { db } = await import("./idbService");
  await db.table("pendingPurchases").delete(id);
  return true;
}

// ── Sync ID Map ───────────────────────────────────────────────────

export async function addSyncId(localId: string, serverName: string, doctype: string) {
  if (isElectron()) {
    return getDb().addSyncId(localId, serverName, doctype);
  }
  const { addSyncIdMapping } = await import("./idbService");
  await addSyncIdMapping({ local_id: localId, server_name: serverName, doctype, synced_at: new Date().toISOString() });
  return true;
}

export async function getServerName(localId: string) {
  if (isElectron()) {
    return getDb().getServerName(localId);
  }
  const mod = await import("./idbService");
  return mod.getServerName(localId);
}

// ── Sync Metadata ─────────────────────────────────────────────────

export async function getSyncMeta(key: string) {
  if (isElectron()) {
    return getDb().getMeta(key);
  }
  const { db } = await import("./idbService");
  const row = await db.table("syncMeta").get(key);
  return row?.value ?? null;
}

export async function setSyncMeta(key: string, value: string) {
  if (isElectron()) {
    return getDb().setMeta(key, value);
  }
  const { db } = await import("./idbService");
  await db.table("syncMeta").put({ key, value });
  return true;
}

// ── Settings (Electron only, browser uses localStorage) ───────────

export async function getSetting(key: string): Promise<string | null> {
  if (isElectron()) {
    return getDb().getSetting(key);
  }
  return localStorage.getItem(`xpos_setting_${key}`);
}

export async function setSetting(key: string, value: string, category?: string): Promise<boolean> {
  if (isElectron()) {
    return getDb().setSetting(key, value, category);
  }
  localStorage.setItem(`xpos_setting_${key}`, value);
  return true;
}

export async function getAllSettings() {
  if (isElectron()) {
    return getDb().getAllSettings();
  }
  // Browser fallback: scan localStorage
  const settings: { key: string; value: string; category: string }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("xpos_setting_")) {
      settings.push({
        key: k.replace("xpos_setting_", ""),
        value: localStorage.getItem(k) || "",
        category: "general",
      });
    }
  }
  return settings;
}

// ── POS Profile Cache ─────────────────────────────────────────────

export async function cachePosData(name: string, data: unknown) {
  if (isElectron()) {
    return getDb().cachePosData(name, data);
  }
  const { db } = await import("./idbService");
  await db.table("posProfileCache").put({ name, data: JSON.stringify(data) });
  return true;
}

export async function getCachedPosData(name: string) {
  if (isElectron()) {
    return getDb().getCachedPosData(name);
  }
  const { db } = await import("./idbService");
  const row = await db.table("posProfileCache").get(name);
  return row ? JSON.parse(row.data) : null;
}

// ── Bulk Operations ───────────────────────────────────────────────

export async function clearAllData() {
  if (isElectron()) {
    return getDb().clearAllData();
  }
  const { db } = await import("./idbService");
  await Promise.all(db.tables.map((t) => t.clear()));
  return true;
}

export async function clearPendingData() {
  if (isElectron()) {
    return getDb().clearPendingData();
  }
  const { db } = await import("./idbService");
  await db.table("pendingInvoices").clear();
  await db.table("pendingPurchases").clear();
  return true;
}
