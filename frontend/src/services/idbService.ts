/**
 * X POS IndexedDB Service using idb library
 * Centralised database layer for offline support.
 */
import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { POSItem, ItemGroup, Customer } from "@/types/pos.types";

// ─── Schema ──────────────────────────────────────
export interface XPosDB extends DBSchema {
  items: {
    key: string; // item_code
    value: POSItem;
    indexes: {
      item_name: string;
      item_group: string;
      barcode: string;
    };
  };
  item_groups: {
    key: string;
    value: { name: string; data: ItemGroup[] };
  };
  customers: {
    key: string; // customer name
    value: Customer;
    indexes: {
      customer_name: string;
      mobile_no: string;
      email_id: string;
    };
  };
  pending_invoices: {
    key: number;
    value: {
      id?: number;
      data: unknown;
      status: "pending" | "syncing" | "failed";
      created_at: string;
      error?: string;
      retry_count: number;
      customer_name?: string;
      grand_total?: number;
    };
    indexes: {
      created_at: string;
    };
  };
  stock_cache: {
    key: string; // "warehouse::item_code"
    value: {
      cache_key: string;
      warehouse: string;
      item_code: string;
      actual_qty: number;
      updated_at: string;
    };
    indexes: {
      warehouse: string;
    };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown; updated_at: string };
  };
}

const DB_NAME = "xpos_offline_v2";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<XPosDB>> | null = null;

function getDB(): Promise<IDBPDatabase<XPosDB>> {
  if (!dbPromise) {
    dbPromise = openDB<XPosDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Items store
        if (!db.objectStoreNames.contains("items")) {
          const itemStore = db.createObjectStore("items", { keyPath: "item_code" });
          itemStore.createIndex("item_name", "item_name", { unique: false });
          itemStore.createIndex("item_group", "item_group", { unique: false });
          itemStore.createIndex("barcode", "barcode", { unique: false });
        }

        // Item groups store
        if (!db.objectStoreNames.contains("item_groups")) {
          db.createObjectStore("item_groups", { keyPath: "name" });
        }

        // Customers store
        if (!db.objectStoreNames.contains("customers")) {
          const custStore = db.createObjectStore("customers", { keyPath: "name" });
          custStore.createIndex("customer_name", "customer_name", { unique: false });
          custStore.createIndex("mobile_no", "mobile_no", { unique: false });
          custStore.createIndex("email_id", "email_id", { unique: false });
        }

        // Pending invoices store
        if (!db.objectStoreNames.contains("pending_invoices")) {
          const invoiceStore = db.createObjectStore("pending_invoices", {
            keyPath: "id",
            autoIncrement: true,
          });
          invoiceStore.createIndex("created_at", "created_at", { unique: false });
        }

        // Stock cache store
        if (!db.objectStoreNames.contains("stock_cache")) {
          const stockStore = db.createObjectStore("stock_cache", { keyPath: "cache_key" });
          stockStore.createIndex("warehouse", "warehouse", { unique: false });
        }

        // Meta store (for timestamps, config, etc.)
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

// ─── Items ───────────────────────────────────────

export async function cacheItems(allItems: POSItem[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("items", "readwrite");
  await tx.store.clear();
  for (const item of allItems) {
    await tx.store.put(item);
  }
  await tx.done;

  // Save timestamp
  await setMeta("items_cached_at", new Date().toISOString());
}

export async function getCachedItems(): Promise<POSItem[]> {
  const db = await getDB();
  return db.getAll("items");
}

export async function getCachedItemByCode(itemCode: string): Promise<POSItem | undefined> {
  const db = await getDB();
  return db.get("items", itemCode);
}

export async function searchCachedItems(
  term: string,
  group: string
): Promise<POSItem[]> {
  const all = await getCachedItems();
  let result = all;

  if (group && group !== "All Item Groups") {
    result = result.filter((i) => i.item_group === group);
  }

  if (term) {
    const lower = term.toLowerCase();
    result = result.filter(
      (i) =>
        i.item_code.toLowerCase().includes(lower) ||
        i.item_name.toLowerCase().includes(lower) ||
        (i.barcode && i.barcode.toLowerCase().includes(lower)) ||
        (i.description && i.description.toLowerCase().includes(lower))
    );
  }

  return result;
}

// ─── Item Groups ─────────────────────────────────

export async function cacheItemGroups(
  groups: ItemGroup[],
  parentGroups: ItemGroup[]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("item_groups", "readwrite");
  await tx.store.clear();
  await tx.store.put({ name: "__groups__", data: groups });
  await tx.store.put({ name: "__parent_groups__", data: parentGroups });
  await tx.done;
}

export async function getCachedItemGroups(): Promise<{
  groups: ItemGroup[];
  parentGroups: ItemGroup[];
}> {
  const db = await getDB();
  const g = await db.get("item_groups", "__groups__");
  const pg = await db.get("item_groups", "__parent_groups__");
  return {
    groups: g?.data || [],
    parentGroups: pg?.data || [],
  };
}

// ─── Customers ───────────────────────────────────

export async function cacheCustomers(customers: Customer[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("customers", "readwrite");
  await tx.store.clear();
  for (const cust of customers) {
    await tx.store.put(cust);
  }
  await tx.done;
  await setMeta("customers_cached_at", new Date().toISOString());
}

export async function getCachedCustomers(): Promise<Customer[]> {
  const db = await getDB();
  return db.getAll("customers");
}

export async function searchCachedCustomers(term: string): Promise<Customer[]> {
  const all = await getCachedCustomers();
  if (!term) return all.slice(0, 20);

  const lower = term.toLowerCase();
  return all
    .filter(
      (c) =>
        c.customer_name.toLowerCase().includes(lower) ||
        (c.mobile_no && c.mobile_no.toLowerCase().includes(lower)) ||
        (c.email_id && c.email_id.toLowerCase().includes(lower)) ||
        c.name.toLowerCase().includes(lower)
    )
    .slice(0, 20);
}

// ─── Stock Cache ─────────────────────────────────

export interface StockEntry {
  warehouse: string;
  item_code: string;
  actual_qty: number;
  updated_at: string;
}

export async function cacheStockForWarehouse(
  warehouse: string,
  stockEntries: { item_code: string; actual_qty: number }[]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("stock_cache", "readwrite");

  // Clear old entries for this warehouse
  const idx = tx.store.index("warehouse");
  let cursor = await idx.openCursor(warehouse);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  const now = new Date().toISOString();
  for (const entry of stockEntries) {
    await tx.store.put({
      cache_key: `${warehouse}::${entry.item_code}`,
      warehouse,
      item_code: entry.item_code,
      actual_qty: entry.actual_qty,
      updated_at: now,
    });
  }
  await tx.done;
  await setMeta(`stock_cached_at_${warehouse}`, now);
}

export async function getCachedStock(
  warehouse: string
): Promise<StockEntry[]> {
  const db = await getDB();
  const idx = db.transaction("stock_cache", "readonly").store.index("warehouse");
  const results = await idx.getAll(warehouse);
  return results.map((r) => ({
    warehouse: r.warehouse,
    item_code: r.item_code,
    actual_qty: r.actual_qty,
    updated_at: r.updated_at,
  }));
}

export async function getCachedStockForItem(
  warehouse: string,
  itemCode: string
): Promise<StockEntry | undefined> {
  const db = await getDB();
  const result = await db.get("stock_cache", `${warehouse}::${itemCode}`);
  return result ? { warehouse: result.warehouse, item_code: result.item_code, actual_qty: result.actual_qty, updated_at: result.updated_at } : undefined;
}

// ─── Pending Invoices ────────────────────────────

export type PendingInvoice = XPosDB["pending_invoices"]["value"];

export async function addPendingInvoice(
  record: Omit<PendingInvoice, "id">
): Promise<number> {
  const db = await getDB();
  return db.add("pending_invoices", record as PendingInvoice);
}

export async function getAllPendingInvoices(): Promise<PendingInvoice[]> {
  const db = await getDB();
  return db.getAll("pending_invoices");
}

export async function updatePendingInvoice(record: PendingInvoice): Promise<void> {
  const db = await getDB();
  await db.put("pending_invoices", record);
}

export async function deletePendingInvoice(id: number): Promise<void> {
  const db = await getDB();
  await db.delete("pending_invoices", id);
}

export async function countPendingInvoices(): Promise<number> {
  const db = await getDB();
  return db.count("pending_invoices");
}

// ─── Meta helpers ────────────────────────────────

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put("meta", { key, value, updated_at: new Date().toISOString() });
}

export async function getMeta(key: string): Promise<unknown> {
  const db = await getDB();
  const entry = await db.get("meta", key);
  return entry?.value;
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const storeNames = [
    "items",
    "item_groups",
    "customers",
    "stock_cache",
    "meta",
  ] as const;
  for (const store of storeNames) {
    const tx = db.transaction(store, "readwrite");
    await tx.store.clear();
    await tx.done;
  }
}
