import { defineStore } from "pinia";
import { ref, computed, type Ref, type ComputedRef } from "vue";
import { call } from "@/services/api";
import { usePosStore } from "@/stores/posStore";
import type {
  POSItem,
  ItemGroup,
  ItemDetail,
  ItemVariant,
  ItemAttribute,
  StockAvailability,
  BundleComponent,
} from "@/types/pos.types";

interface ItemGroupsResult {
  groups: ItemGroup[];
  parent_groups: ItemGroup[];
}

// ─── IndexedDB cache for offline items (with in-memory fallback) ───
const ITEM_DB_NAME = "xpos_items_cache";
const ITEM_DB_VERSION = 1;
const ITEMS_STORE = "items";
const GROUPS_STORE = "item_groups";

/** Whether IndexedDB is available on this browser/session */
let itemIdbAvailable: boolean | null = null;
let memItemCache: POSItem[] = [];
let memGroupCache: { groups: ItemGroup[]; parentGroups: ItemGroup[] } = { groups: [], parentGroups: [] };

async function checkItemIDB(): Promise<boolean> {
  if (itemIdbAvailable !== null) return itemIdbAvailable;
  try {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("__xpos_item_idb_test__", 1);
      req.onsuccess = () => { req.result.close(); resolve(); };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("blocked"));
    });
    indexedDB.deleteDatabase("__xpos_item_idb_test__");
    itemIdbAvailable = true;
  } catch {
    console.warn("[XPOS Offline] IndexedDB unavailable for item cache – using in-memory fallback");
    itemIdbAvailable = false;
  }
  return itemIdbAvailable;
}

function openItemDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ITEM_DB_NAME, ITEM_DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        const store = db.createObjectStore(ITEMS_STORE, { keyPath: "item_code" });
        store.createIndex("item_name", "item_name", { unique: false });
        store.createIndex("item_group", "item_group", { unique: false });
        store.createIndex("barcode", "barcode", { unique: false });
      }
      if (!db.objectStoreNames.contains(GROUPS_STORE)) {
        db.createObjectStore(GROUPS_STORE, { keyPath: "name" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}

async function cacheItems(allItems: POSItem[]): Promise<void> {
  if (!(await checkItemIDB())) {
    memItemCache = [...allItems];
    return;
  }
  const db = await openItemDB();
  try {
    const tx = db.transaction(ITEMS_STORE, "readwrite");
    const store = tx.objectStore(ITEMS_STORE);
    store.clear();
    for (const item of allItems) {
      store.put(item);
    }
    return await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function cacheGroups(groups: ItemGroup[], parentGroups: ItemGroup[]): Promise<void> {
  if (!(await checkItemIDB())) {
    memGroupCache = { groups: [...groups], parentGroups: [...parentGroups] };
    return;
  }
  const db = await openItemDB();
  try {
    const tx = db.transaction(GROUPS_STORE, "readwrite");
    const store = tx.objectStore(GROUPS_STORE);
    store.clear();
    store.put({ name: "__parent_groups__", data: parentGroups });
    store.put({ name: "__groups__", data: groups });
    return await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function getCachedItems(): Promise<POSItem[]> {
  if (!(await checkItemIDB())) {
    return memItemCache;
  }
  const db = await openItemDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ITEMS_STORE, "readonly");
      const store = tx.objectStore(ITEMS_STORE);
      const req = store.getAll();
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function getCachedGroups(): Promise<{ groups: ItemGroup[]; parentGroups: ItemGroup[] }> {
  if (!(await checkItemIDB())) {
    return memGroupCache;
  }
  const db = await openItemDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(GROUPS_STORE, "readonly");
      const store = tx.objectStore(GROUPS_STORE);
      const g = store.get("__groups__");
      const pg = store.get("__parent_groups__");
      tx.oncomplete = () => {
        resolve({
          groups: g.result?.data || [],
          parentGroups: pg.result?.data || [],
        });
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const useItemStore = defineStore("items", () => {
  // ─── State ─────────────────────────────────────
  const items: Ref<POSItem[]> = ref([]);
  const isLoading: Ref<boolean> = ref(false);
  const searchTerm: Ref<string> = ref("");
  const selectedGroup: Ref<string> = ref("All Item Groups");
  const currentPage: Ref<number> = ref(0);
  const pageLength: Ref<number> = ref(40);
  const hasMore: Ref<boolean> = ref(true);
  const totalCount: Ref<number> = ref(0);
  const itemGroups: Ref<ItemGroup[]> = ref([]);
  const parentGroups: Ref<ItemGroup[]> = ref([]);

  // Item detail dialog state
  const showItemDetail: Ref<boolean> = ref(false);
  const selectedItemDetail: Ref<ItemDetail | null> = ref(null);
  const selectedItemForDetail: Ref<POSItem | null> = ref(null);
  const isLoadingDetail: Ref<boolean> = ref(false);

  // Variant state
  const showVariantPicker: Ref<boolean> = ref(false);
  const variants: Ref<ItemVariant[]> = ref([]);
  const variantAttributes: Ref<ItemAttribute[]> = ref([]);
  const isLoadingVariants: Ref<boolean> = ref(false);

  // ─── Computed ──────────────────────────────────
  const filteredItems: ComputedRef<POSItem[]> = computed(() => items.value);

  // ─── Offline helpers ───────────────────────────
  function isOfflineEnabled(): boolean {
    const posStore = usePosStore();
    return !!posStore.posProfile?.posa_local_storage;
  }

  /** Search cached items locally (client-side filter) */
  function localSearch(allItems: POSItem[], term: string, group: string): POSItem[] {
    let result = allItems;

    // Filter by group
    if (group && group !== "All Item Groups") {
      result = result.filter((i) => i.item_group === group);
    }

    // Filter by search term (match item_code, item_name, barcode)
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

  /**
   * Pre-load ALL items from server into IndexedDB cache.
   * Called once after POS profile is ready when posa_local_storage is enabled.
   */
  async function cacheAllItems(posProfile: string): Promise<void> {
    try {
      const batchSize = 200;
      let start = 0;
      let allItems: POSItem[] = [];
      let batch: POSItem[];

      do {
        batch = await call<POSItem[]>(
          "xpos.api.items.get_pos_items",
          {
            pos_profile: posProfile,
            search_term: "",
            item_group: "",
            start,
            page_length: batchSize,
          }
        );
        allItems = [...allItems, ...batch];
        start += batchSize;
      } while (batch.length === batchSize);

      await cacheItems(allItems);
      console.log(`[XPOS Offline] Cached ${allItems.length} items`);
    } catch (error) {
      console.warn("[XPOS Offline] Failed to cache items:", error);
    }
  }

  // ─── Actions ───────────────────────────────────
  async function fetchItems(posProfile: string, append = false): Promise<void> {
    if (isLoading.value) return;
    isLoading.value = true;

    try {
      // Offline mode: search from IndexedDB cache
      if (!navigator.onLine && isOfflineEnabled()) {
        const cached = await getCachedItems();
        const filtered = localSearch(cached, searchTerm.value, selectedGroup.value);

        if (append) {
          const sliced = filtered.slice(items.value.length, items.value.length + pageLength.value);
          items.value = [...items.value, ...sliced];
          hasMore.value = items.value.length < filtered.length;
        } else {
          items.value = filtered.slice(0, pageLength.value);
          currentPage.value = 0;
          hasMore.value = filtered.length > pageLength.value;
        }
        return;
      }

      const result = await call<POSItem[]>(
        "xpos.api.items.get_pos_items",
        {
          pos_profile: posProfile,
          search_term: searchTerm.value,
          item_group:
            selectedGroup.value === "All Item Groups"
              ? ""
              : selectedGroup.value,
          start: append ? items.value.length : 0,
          page_length: pageLength.value,
        }
      );

      if (append) {
        items.value = [...items.value, ...result];
      } else {
        items.value = result;
        currentPage.value = 0;
      }

      hasMore.value = result.length === pageLength.value;

      // Cache items when online + offline mode enabled (first page, no search = full load trigger)
      if (isOfflineEnabled() && !searchTerm.value && !append && selectedGroup.value === "All Item Groups") {
        cacheAllItems(posProfile).catch(() => { });
      }
    } catch (error) {
      // If fetch fails and we have a cache, fall back to it
      if (isOfflineEnabled()) {
        try {
          const cached = await getCachedItems();
          if (cached.length > 0) {
            const filtered = localSearch(cached, searchTerm.value, selectedGroup.value);
            items.value = filtered.slice(0, pageLength.value);
            hasMore.value = filtered.length > pageLength.value;
            console.log("[XPOS Offline] Serving items from cache");
            return;
          }
        } catch { /* ignore */ }
      }
      console.error("Error fetching items:", error);
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchItemGroups(): Promise<void> {
    try {
      // Offline: load from cache
      if (!navigator.onLine && isOfflineEnabled()) {
        const cached = await getCachedGroups();
        itemGroups.value = cached.groups;
        parentGroups.value = cached.parentGroups;
        return;
      }

      const result = await call<ItemGroupsResult>(
        "xpos.api.items.get_item_groups"
      );
      itemGroups.value = result.groups || [];
      parentGroups.value = result.parent_groups || [];

      // Cache groups when online
      if (isOfflineEnabled()) {
        cacheGroups(itemGroups.value, parentGroups.value).catch(() => { });
      }
    } catch (error) {
      // Fall back to cache
      if (isOfflineEnabled()) {
        try {
          const cached = await getCachedGroups();
          if (cached.groups.length > 0) {
            itemGroups.value = cached.groups;
            parentGroups.value = cached.parentGroups;
            return;
          }
        } catch { /* ignore */ }
      }
      console.error("Error fetching item groups:", error);
    }
  }

  async function searchByBarcode(
    barcode: string,
    _posProfile?: string
  ): Promise<POSItem | null> {
    try {
      // Offline: search barcode from cache
      if (!navigator.onLine && isOfflineEnabled()) {
        const cached = await getCachedItems();
        const lower = barcode.toLowerCase();
        return cached.find(
          (i) =>
            (i.barcode && i.barcode.toLowerCase() === lower) ||
            i.item_code.toLowerCase() === lower
        ) || null;
      }

      const result = await call<POSItem | null>(
        "xpos.api.items.search_barcode",
        {
          barcode: barcode,
          pos_profile: _posProfile || "",
        }
      );
      return result;
    } catch (error) {
      // Fall back to cache on error
      if (isOfflineEnabled()) {
        try {
          const cached = await getCachedItems();
          const lower = barcode.toLowerCase();
          return cached.find(
            (i) =>
              (i.barcode && i.barcode.toLowerCase() === lower) ||
              i.item_code.toLowerCase() === lower
          ) || null;
        } catch { /* ignore */ }
      }
      console.error("Error searching barcode:", error);
      return null;
    }
  }

  // ── Item Detail (batch/serial/UOM) ─────────────
  async function fetchItemDetail(
    itemCode: string,
    posProfile: string,
    warehouse?: string
  ): Promise<ItemDetail | null> {
    isLoadingDetail.value = true;
    try {
      const result = await call<ItemDetail>(
        "xpos.api.items.get_item_detail",
        {
          item_code: itemCode,
          pos_profile: posProfile,
          warehouse: warehouse || "",
        }
      );
      selectedItemDetail.value = result;
      return result;
    } catch (error) {
      console.error("Error fetching item detail:", error);
      return null;
    } finally {
      isLoadingDetail.value = false;
    }
  }

  async function openItemDetail(item: POSItem, posProfile: string, warehouse?: string): Promise<void> {
    selectedItemForDetail.value = item;
    showItemDetail.value = true;
    await fetchItemDetail(item.item_code, posProfile, warehouse);
  }

  function closeItemDetail(): void {
    showItemDetail.value = false;
    selectedItemDetail.value = null;
    selectedItemForDetail.value = null;
  }

  // ── Item Variants ──────────────────────────────
  async function fetchItemVariants(
    itemCode: string,
    posProfile?: string
  ): Promise<ItemVariant[]> {
    isLoadingVariants.value = true;
    try {
      const result = await call<ItemVariant[]>(
        "xpos.api.items.get_item_variants",
        {
          item_code: itemCode,
          pos_profile: posProfile || "",
        }
      );
      variants.value = result || [];
      return variants.value;
    } catch (error) {
      console.error("Error fetching variants:", error);
      return [];
    } finally {
      isLoadingVariants.value = false;
    }
  }

  async function fetchItemAttributes(itemCode: string): Promise<ItemAttribute[]> {
    try {
      const result = await call<ItemAttribute[]>(
        "xpos.api.items.get_item_attributes",
        { item_code: itemCode }
      );
      variantAttributes.value = result || [];
      return variantAttributes.value;
    } catch (error) {
      console.error("Error fetching attributes:", error);
      return [];
    }
  }

  async function openVariantPicker(item: POSItem, posProfile?: string): Promise<void> {
    selectedItemForDetail.value = item;
    showVariantPicker.value = true;
    await Promise.all([
      fetchItemVariants(item.item_code, posProfile),
      fetchItemAttributes(item.item_code),
    ]);
  }

  function closeVariantPicker(): void {
    showVariantPicker.value = false;
    variants.value = [];
    variantAttributes.value = [];
  }

  // ── Stock Availability ─────────────────────────
  async function fetchStockAvailability(
    itemCodes: string[],
    warehouse: string
  ): Promise<StockAvailability[]> {
    try {
      const result = await call<StockAvailability[]>(
        "xpos.api.items.get_stock_availability",
        {
          items: JSON.stringify(itemCodes),
          warehouse,
        }
      );
      return result || [];
    } catch (error) {
      console.error("Error fetching stock:", error);
      return [];
    }
  }

  // ── Price for UOM ──────────────────────────────
  async function fetchPriceForUOM(
    itemCode: string,
    uom: string,
    posProfile: string
  ): Promise<number> {
    try {
      const result = await call<{ rate: number }>(
        "xpos.api.items.get_price_for_uom",
        {
          item_code: itemCode,
          uom,
          pos_profile: posProfile,
        }
      );
      return result?.rate || 0;
    } catch (error) {
      console.error("Error fetching UOM price:", error);
      return 0;
    }
  }

  // ── Product Bundles ────────────────────────────
  async function fetchBundleComponents(
    itemCode: string
  ): Promise<BundleComponent[]> {
    try {
      const result = await call<BundleComponent[]>(
        "xpos.api.bundles.get_bundle_components",
        { item_code: itemCode }
      );
      return result || [];
    } catch (error) {
      console.error("Error fetching bundle components:", error);
      return [];
    }
  }

  // ── Utilities ──────────────────────────────────
  function setSearchTerm(term: string): void {
    searchTerm.value = term;
  }

  function setSelectedGroup(group: string): void {
    selectedGroup.value = group;
  }

  function loadMore(posProfile: string): void {
    if (hasMore.value && !isLoading.value) {
      fetchItems(posProfile, true);
    }
  }

  function resetItems(): void {
    items.value = [];
    searchTerm.value = "";
    selectedGroup.value = "All Item Groups";
    currentPage.value = 0;
    hasMore.value = true;
  }

  return {
    // State
    items,
    isLoading,
    searchTerm,
    selectedGroup,
    currentPage,
    hasMore,
    totalCount,
    itemGroups,
    parentGroups,
    showItemDetail,
    selectedItemDetail,
    selectedItemForDetail,
    isLoadingDetail,
    showVariantPicker,
    variants,
    variantAttributes,
    isLoadingVariants,
    // Computed
    filteredItems,
    // Actions
    fetchItems,
    fetchItemGroups,
    searchByBarcode,
    fetchItemDetail,
    openItemDetail,
    closeItemDetail,
    fetchItemVariants,
    fetchItemAttributes,
    openVariantPicker,
    closeVariantPicker,
    fetchStockAvailability,
    fetchPriceForUOM,
    fetchBundleComponents,
    cacheAllItems,
    setSearchTerm,
    setSelectedGroup,
    loadMore,
    resetItems,
  };
});
