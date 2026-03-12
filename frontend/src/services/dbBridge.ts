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

// ══════════════════════════════════════════════════════════════════
// NEW MASTER DATA & TRANSACTIONAL BRIDGES (Electron-first)
// In browser/PWA mode these return empty data since these tables
// only exist in local MariaDB.
// ══════════════════════════════════════════════════════════════════

// ── Companies ─────────────────────────────────────────────────────

export async function getCompanies() {
  if (isElectron()) return getDb().getCompanies();
  return [];
}

// ── Warehouses ────────────────────────────────────────────────────

export async function getWarehouses(opts?: { company?: string; isGroup?: boolean }) {
  if (isElectron()) return getDb().getWarehouses(opts);
  return [];
}

// ── Accounts ──────────────────────────────────────────────────────

export async function getAccounts(opts?: { company?: string; accountType?: string; rootType?: string }) {
  if (isElectron()) return getDb().getAccounts(opts);
  return [];
}

// ── Cost Centers ──────────────────────────────────────────────────

export async function getCostCenters(company?: string) {
  if (isElectron()) return getDb().getCostCenters(company);
  return [];
}

// ── Price Lists ───────────────────────────────────────────────────

export async function getPriceLists(selling?: boolean) {
  if (isElectron()) return getDb().getPriceLists(selling);
  return [];
}

// ── Modes of Payment ──────────────────────────────────────────────

export async function getModesOfPayment() {
  if (isElectron()) return getDb().getModesOfPayment();
  return [];
}

export async function getModeOfPaymentAccounts(company: string) {
  if (isElectron()) return getDb().getModeOfPaymentAccounts(company);
  return [];
}

// ── POS Profiles ──────────────────────────────────────────────────

export async function getPosProfiles(company?: string) {
  if (isElectron()) return getDb().getPosProfiles(company);
  return [];
}

export async function getPosProfile(name: string) {
  if (isElectron()) return getDb().getPosProfile(name);
  return null;
}

export async function getPosPaymentMethods(posProfile: string) {
  if (isElectron()) return getDb().getPosPaymentMethods(posProfile);
  return [];
}

// ── POS Users ─────────────────────────────────────────────────────

export async function getPosUsers() {
  if (isElectron()) return getDb().getPosUsers();
  return [];
}

export async function getPosUser(email: string) {
  if (isElectron()) return getDb().getPosUser(email);
  return null;
}

// ── Item Prices ───────────────────────────────────────────────────

export async function getItemPrice(itemCode: string, priceList: string) {
  if (isElectron()) return getDb().getItemPrice(itemCode, priceList);
  return null;
}

export async function getItemPrices(opts?: { priceList?: string; selling?: boolean }) {
  if (isElectron()) return getDb().getItemPrices(opts);
  return [];
}

// ── Item Barcodes ─────────────────────────────────────────────────

export async function getItemByBarcode(barcode: string) {
  if (isElectron()) return getDb().getItemByBarcode(barcode);
  return null;
}

// ── Item Tax Templates ────────────────────────────────────────────

export async function getItemTaxTemplates(company?: string) {
  if (isElectron()) return getDb().getItemTaxTemplates(company);
  return [];
}

export async function getItemTaxTemplateDetails(templateName: string) {
  if (isElectron()) return getDb().getItemTaxTemplateDetails(templateName);
  return [];
}

// ── Sales Tax Templates ───────────────────────────────────────────

export async function getSalesTaxTemplates(company?: string) {
  if (isElectron()) return getDb().getSalesTaxTemplates(company);
  return [];
}

export async function getSalesTaxCharges(templateName: string) {
  if (isElectron()) return getDb().getSalesTaxCharges(templateName);
  return [];
}

// ── Pricing Rules ─────────────────────────────────────────────────

export async function getPricingRules(opts?: { company?: string; itemCode?: string }) {
  if (isElectron()) return getDb().getPricingRules(opts);
  return [];
}

export async function getPricingRuleItems(parent: string) {
  if (isElectron()) return getDb().getPricingRuleItems(parent);
  return [];
}

export async function getPricingRuleGroups(parent: string) {
  if (isElectron()) return getDb().getPricingRuleGroups(parent);
  return [];
}

export async function getPricingRuleBrands(parent: string) {
  if (isElectron()) return getDb().getPricingRuleBrands(parent);
  return [];
}

// ── Bins (Stock) ──────────────────────────────────────────────────

export async function getBin(itemCode: string, warehouse: string) {
  if (isElectron()) return getDb().getBin(itemCode, warehouse);
  return null;
}

export async function getBins(warehouse?: string) {
  if (isElectron()) return getDb().getBins(warehouse);
  return [];
}

// ── POS Opening Shifts ──────────────────────────────────────────

export async function createPosOpeningShift(shift: Record<string, unknown>) {
  if (isElectron()) return getDb().createPosOpeningShift(shift);
  throw new Error("POS Opening Shifts require Electron mode");
}

export async function getOpenShift(user: string) {
  if (isElectron()) return getDb().getOpenShift(user);
  return null;
}

export async function closePosShift(localId: string) {
  if (isElectron()) return getDb().closePosShift(localId);
  return true;
}

export async function getPosOpeningShifts(opts?: { user?: string; status?: string }) {
  if (isElectron()) return getDb().getPosOpeningShifts(opts);
  return [];
}

// ── POS Closing Entries ─────────────────────────────────────────

export async function createPosClosingEntry(entry: Record<string, unknown>) {
  if (isElectron()) return getDb().createPosClosingEntry(entry);
  throw new Error("POS Closing Entries require Electron mode");
}

export async function getPosClosingEntries(opts?: { user?: string; status?: string }) {
  if (isElectron()) return getDb().getPosClosingEntries(opts);
  return [];
}

export async function getPosClosingEntryDetails(parentId: number) {
  if (isElectron()) return getDb().getPosClosingEntryDetails(parentId);
  return [];
}

// ── Sales Invoices ──────────────────────────────────────────────

export async function saveSalesInvoice(invoice: Record<string, unknown>) {
  if (isElectron()) return getDb().saveSalesInvoice(invoice);
  throw new Error("Sales Invoices require Electron mode");
}

export async function getSalesInvoices(opts?: {
  customer?: string; posProfile?: string; shiftLocalId?: string;
  fromDate?: string; toDate?: string; limit?: number;
}) {
  if (isElectron()) return getDb().getSalesInvoices(opts);
  return [];
}

export async function getSalesInvoice(localId: string) {
  if (isElectron()) return getDb().getSalesInvoice(localId);
  return null;
}

export async function getShiftSalesSummary(shiftLocalId: string) {
  if (isElectron()) return getDb().getShiftSalesSummary(shiftLocalId);
  return { total: 0, count: 0, qty: 0, payment_breakdown: [] };
}

// ── Expenses ────────────────────────────────────────────────────

export async function createExpense(expense: Record<string, unknown>) {
  if (isElectron()) return getDb().createExpense(expense);
  throw new Error("Expenses require Electron mode");
}

export async function getExpenses(opts?: {
  user?: string; fromDate?: string; toDate?: string;
  shiftLocalId?: string; syncStatus?: string;
}) {
  if (isElectron()) return getDb().getExpenses(opts);
  return [];
}

export async function deleteExpense(id: number) {
  if (isElectron()) return getDb().deleteExpense(id);
  return true;
}

// ── Bank Drops ──────────────────────────────────────────────────

export async function createBankDrop(drop: Record<string, unknown>) {
  if (isElectron()) return getDb().createBankDrop(drop);
  throw new Error("Bank Drops require Electron mode");
}

export async function getBankDrops(opts?: {
  user?: string; fromDate?: string; toDate?: string;
  shiftLocalId?: string; syncStatus?: string;
}) {
  if (isElectron()) return getDb().getBankDrops(opts);
  return [];
}

export async function deleteBankDrop(id: number) {
  if (isElectron()) return getDb().deleteBankDrop(id);
  return true;
}

// ── Stock Adjustments ───────────────────────────────────────────

export async function createStockAdjustment(adj: Record<string, unknown>) {
  if (isElectron()) return getDb().createStockAdjustment(adj);
  throw new Error("Stock Adjustments require Electron mode");
}

export async function getStockAdjustments(opts?: {
  warehouse?: string; syncStatus?: string; fromDate?: string; toDate?: string;
}) {
  if (isElectron()) return getDb().getStockAdjustments(opts);
  return [];
}

// ── Quotations ──────────────────────────────────────────────────

export async function saveQuotation(quotation: Record<string, unknown>) {
  if (isElectron()) return getDb().saveQuotation(quotation);
  throw new Error("Quotations require Electron mode");
}

export async function getQuotations(opts?: {
  customer?: string; fromDate?: string; toDate?: string;
  status?: string; limit?: number;
}) {
  if (isElectron()) return getDb().getQuotations(opts);
  return [];
}

// ── Brands ──────────────────────────────────────────────────────

export async function getBrands() {
  if (isElectron()) return getDb().getBrands();
  return [];
}

// ── UOM ─────────────────────────────────────────────────────────

export async function getUom() {
  if (isElectron()) return getDb().getUom();
  return [];
}

export async function getUomConversions(itemCode: string) {
  if (isElectron()) return getDb().getUomConversions(itemCode);
  return [];
}

// ── Generic Table Helpers ───────────────────────────────────────

export async function upsertTable(table: string, rows: Record<string, unknown>[], keyField: string) {
  if (isElectron()) return getDb().upsertTable(table, rows, keyField);
  return 0;
}

export async function clearTable(table: string) {
  if (isElectron()) return getDb().clearTable(table);
  return true;
}

// ── idbService-compatible wrappers ──────────────────────────────
// These match the idbService function signatures so stores can import
// from dbBridge without logic changes.

import type { POSItem, ItemGroup, Customer } from "@/types/pos.types";

export async function cacheItems(allItems: POSItem[]): Promise<void> {
  if (isElectron()) {
    await getDb().clearItems();
    if (allItems.length) await getDb().upsertItems(allItems as unknown as Record<string, unknown>[]);
    return;
  }
  const idb = await import("./idbService");
  await idb.cacheItems(allItems);
}

export async function getCachedItems(): Promise<POSItem[]> {
  if (isElectron()) {
    return (await getDb().getItems()) as unknown as POSItem[];
  }
  const idb = await import("./idbService");
  return idb.getCachedItems();
}

export async function getCachedItemByCode(itemCode: string): Promise<POSItem | undefined> {
  if (isElectron()) {
    const row = await getDb().getItem(itemCode);
    return (row ?? undefined) as POSItem | undefined;
  }
  const idb = await import("./idbService");
  return idb.getCachedItemByCode(itemCode);
}

export async function searchCachedItems(term: string, group: string): Promise<POSItem[]> {
  if (isElectron()) {
    return (await getDb().getItems({
      search: term || undefined,
      group: group && group !== "All Item Groups" ? group : undefined,
    })) as unknown as POSItem[];
  }
  const idb = await import("./idbService");
  return idb.searchCachedItems(term, group);
}

export async function cacheItemGroups(groups: ItemGroup[], parentGroups: ItemGroup[]): Promise<void> {
  if (isElectron()) {
    await getDb().setMeta("item_groups", JSON.stringify(groups));
    await getDb().setMeta("item_parent_groups", JSON.stringify(parentGroups));
    return;
  }
  const idb = await import("./idbService");
  await idb.cacheItemGroups(groups, parentGroups);
}

export async function getCachedItemGroups(): Promise<{ groups: ItemGroup[]; parentGroups: ItemGroup[] }> {
  if (isElectron()) {
    const g = await getDb().getMeta("item_groups");
    const pg = await getDb().getMeta("item_parent_groups");
    return {
      groups: g ? JSON.parse(g) : [],
      parentGroups: pg ? JSON.parse(pg) : [],
    };
  }
  const idb = await import("./idbService");
  return idb.getCachedItemGroups();
}

export async function cacheStockForWarehouse(
  warehouse: string,
  stockEntries: { item_code: string; actual_qty: number }[]
): Promise<void> {
  if (isElectron()) {
    await getDb().upsertStock(warehouse, stockEntries);
    return;
  }
  const idb = await import("./idbService");
  await idb.cacheStockForWarehouse(warehouse, stockEntries);
}

export async function getCachedStock(warehouse: string) {
  if (isElectron()) {
    const rows = await getDb().getStock(warehouse);
    return Array.isArray(rows) ? rows as Array<{ cache_key?: string; warehouse: string; item_code: string; actual_qty: number; updated_at?: string }> : [];
  }
  const idb = await import("./idbService");
  return idb.getCachedStock(warehouse);
}

export async function getCachedStockForItem(warehouse: string, itemCode: string) {
  if (isElectron()) {
    const row = await getDb().getStock(warehouse, itemCode);
    if (!row || Array.isArray(row)) return undefined;
    return row as { cache_key?: string; warehouse: string; item_code: string; actual_qty: number; updated_at?: string };
  }
  const idb = await import("./idbService");
  return idb.getCachedStockForItem(warehouse, itemCode);
}

export async function cacheCustomers(customers: Customer[]): Promise<void> {
  if (isElectron()) {
    await getDb().upsertCustomers(customers as unknown as Record<string, unknown>[]);
    return;
  }
  const idb = await import("./idbService");
  await idb.cacheCustomers(customers);
}

export async function getCachedCustomers(): Promise<Customer[]> {
  if (isElectron()) {
    return (await getDb().getCustomers()) as unknown as Customer[];
  }
  const idb = await import("./idbService");
  return idb.getCachedCustomers();
}

export async function searchCachedCustomers(term: string): Promise<Customer[]> {
  if (isElectron()) {
    return (await getDb().getCustomers({ search: term, limit: 20 })) as unknown as Customer[];
  }
  const idb = await import("./idbService");
  return idb.searchCachedCustomers(term);
}

export async function addCachedCustomer(customer: Customer): Promise<void> {
  if (isElectron()) {
    await getDb().upsertCustomers([customer as unknown as Record<string, unknown>]);
    return;
  }
  const idb = await import("./idbService");
  await idb.addCachedCustomer(customer);
}

export async function cacheSuppliers(suppliers: Array<Record<string, unknown> & { name: string }>): Promise<void> {
  if (isElectron()) {
    await getDb().upsertSuppliers(suppliers);
    return;
  }
  const idb = await import("./idbService");
  await idb.cacheSuppliers(suppliers as any);
}

export async function searchCachedSuppliers(term: string) {
  if (isElectron()) {
    const rows = await getDb().getSuppliers({ search: term, limit: 20 });
    return rows as Array<{ name: string; supplier_name: string; supplier_group?: string; supplier_type?: string; default_currency?: string; mobile_no?: string; email_id?: string }>;
  }
  const idb = await import("./idbService");
  return idb.searchCachedSuppliers(term);
}

export async function addCachedSupplier(supplier: Record<string, unknown>): Promise<void> {
  if (isElectron()) {
    await getDb().upsertSuppliers([supplier]);
    return;
  }
  const idb = await import("./idbService");
  await idb.addCachedSupplier(supplier as any);
}

export async function cachePOSData(data: unknown): Promise<void> {
  if (isElectron()) {
    await getDb().setMeta("pos_complete_data", JSON.stringify(data));
    return;
  }
  const idb = await import("./idbService");
  await idb.cachePOSData(data as any);
}

export async function getCachedPOSData(): Promise<unknown | null> {
  if (isElectron()) {
    const val = await getDb().getMeta("pos_complete_data");
    return val ? JSON.parse(val) : null;
  }
  const idb = await import("./idbService");
  return idb.getCachedPOSData();
}

export async function cacheOffers(posProfile: string, offers: unknown[]): Promise<void> {
  if (isElectron()) {
    await getDb().setMeta(`offers::${posProfile}`, JSON.stringify(offers));
    return;
  }
  const idb = await import("./idbService");
  await idb.cacheOffers(posProfile, offers);
}

export async function getCachedOffers(posProfile: string): Promise<unknown[] | null> {
  if (isElectron()) {
    const val = await getDb().getMeta(`offers::${posProfile}`);
    return val ? JSON.parse(val) : null;
  }
  const idb = await import("./idbService");
  return idb.getCachedOffers(posProfile);
}

export async function cacheItemTax(
  itemCode: string,
  company: string,
  data: { item_tax_template: string | null; item_tax_map: Record<string, number> }
): Promise<void> {
  if (isElectron()) {
    await getDb().setMeta(`item_tax::${company}::${itemCode}`, JSON.stringify(data));
    return;
  }
  const idb = await import("./idbService");
  await idb.cacheItemTax(itemCode, company, data);
}

export async function getCachedItemTax(
  itemCode: string,
  company: string
): Promise<{ item_tax_template: string | null; item_tax_map: Record<string, number> } | null> {
  if (isElectron()) {
    const val = await getDb().getMeta(`item_tax::${company}::${itemCode}`);
    return val ? JSON.parse(val) : null;
  }
  const idb = await import("./idbService");
  return idb.getCachedItemTax(itemCode, company);
}

export async function cacheCustomerGroups(groups: string[]): Promise<void> {
  if (isElectron()) {
    await getDb().setMeta("customer_groups", JSON.stringify(groups));
    return;
  }
  const idb = await import("./idbService");
  await idb.cacheCustomerGroups(groups);
}

export async function getCachedCustomerGroups(): Promise<string[]> {
  if (isElectron()) {
    const val = await getDb().getMeta("customer_groups");
    return val ? JSON.parse(val) : [];
  }
  const idb = await import("./idbService");
  return idb.getCachedCustomerGroups();
}

export async function cacheTerritories(territories: string[]): Promise<void> {
  if (isElectron()) {
    await getDb().setMeta("territories", JSON.stringify(territories));
    return;
  }
  const idb = await import("./idbService");
  await idb.cacheTerritories(territories);
}

export async function getCachedTerritories(): Promise<string[]> {
  if (isElectron()) {
    const val = await getDb().getMeta("territories");
    return val ? JSON.parse(val) : [];
  }
  const idb = await import("./idbService");
  return idb.getCachedTerritories();
}

export async function cacheCountries(countries: string[]): Promise<void> {
  if (isElectron()) {
    await getDb().setMeta("countries", JSON.stringify(countries));
    return;
  }
  const idb = await import("./idbService");
  await idb.cacheCountries(countries);
}

export async function getCachedCountries(): Promise<string[]> {
  if (isElectron()) {
    const val = await getDb().getMeta("countries");
    return val ? JSON.parse(val) : [];
  }
  const idb = await import("./idbService");
  return idb.getCachedCountries();
}

export async function getAllPendingInvoices() {
  return getPendingInvoices();
}

export async function getAllPendingPurchases() {
  return getPendingPurchases();
}

export async function countPendingPurchases(): Promise<number> {
  if (isElectron()) {
    return getDb().countPendingPurchases();
  }
  const { db } = await import("./idbService");
  return db.table("pendingPurchases").where("status").anyOf(["pending", "failed"]).count();
}
