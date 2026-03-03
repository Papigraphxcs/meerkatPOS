import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { call } from "@/services/api";
import { usePosStore } from "@/stores/posStore";
import {
  cacheItems as idbCacheItems,
  getCachedItems as idbGetCachedItems,
  searchCachedItems as idbSearchCachedItems,
  cacheItemGroups as idbCacheGroups,
  getCachedItemGroups as idbGetCachedGroups,
  cacheStockForWarehouse,
  getCachedStock,
} from "@/services/idbService";
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

export const useItemStore = defineStore("items", () => {
  const items = ref<POSItem[]>([]);
  const isLoading = ref(false);
  const searchTerm = ref("");
  const selectedGroup = ref("All Item Groups");
  const currentPage = ref(0);
  const pageLength = ref(40);
  const hasMore = ref(true);
  const totalCount = ref(0);
  const itemGroups = ref<ItemGroup[]>([]);
  const parentGroups = ref<ItemGroup[]>([]);

  const showItemDetail = ref(false);
  const selectedItemDetail = ref<ItemDetail | null>(null);
  const selectedItemForDetail = ref<POSItem | null>(null);
  const isLoadingDetail = ref(false);

  const showVariantPicker = ref(false);
  const variants = ref<ItemVariant[]>([]);
  const variantAttributes = ref<ItemAttribute[]>([]);
  const isLoadingVariants = ref(false);

  const filteredItems = computed(() => {
    const posStore = usePosStore();
    let filtered = items.value;

    if (posStore.posProfile?.hide_unavailable_items && posStore.posProfile?.block_sale_beyond_available_qty) {
      filtered = filtered.filter(item => {
        const qty = item.actual_qty ?? 0;
        return qty > 0;
      });
    }
    
    return filtered;
  });

  function isOfflineEnabled(): boolean {
    const posStore = usePosStore();
    return !!posStore.useOfflineMode;
  }

  /**
   * Pre-load ALL items from server into IndexedDB cache.
   * Called once after POS profile is ready when use_offline_mode is enabled.
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

      await idbCacheItems(allItems);
      console.log(`[XPOS Offline] Cached ${allItems.length} items in IndexedDB (idb)`);

      // Also cache stock data for the warehouse
      const posStoreRef = usePosStore();
      const warehouse = posStoreRef.warehouse;
      if (warehouse && allItems.length > 0) {
        await cacheAllStock(posProfile, warehouse, allItems);
      }
    } catch (error) {
      console.warn("[XPOS Offline] Failed to cache items:", error);
    }
  }

  /**
   * Cache stock availability for all items in the warehouse
   */
  async function cacheAllStock(posProfile: string, warehouse: string, allItems?: POSItem[]): Promise<void> {
    try {
      const itemsToCache = allItems || await idbGetCachedItems();
      if (itemsToCache.length === 0) return;

      // Fetch stock in batches of 50
      const batchSize = 50;
      const stockEntries: { item_code: string; actual_qty: number }[] = [];

      for (let i = 0; i < itemsToCache.length; i += batchSize) {
        const batch = itemsToCache.slice(i, i + batchSize);
        const itemCodes = batch.map((item) => item.item_code);

        try {
          const stockResult = await call<StockAvailability[]>(
            "xpos.api.items.get_stock_availability",
            {
              items: JSON.stringify(itemCodes),
              warehouse,
            }
          );

          if (stockResult) {
            for (const s of stockResult) {
              stockEntries.push({
                item_code: s.item_code,
                actual_qty: s.actual_qty || 0,
              });
            }
          }
        } catch {
          // If a batch fails, use 0 qty for those items
          for (const code of itemCodes) {
            stockEntries.push({ item_code: code, actual_qty: 0 });
          }
        }
      }

      await cacheStockForWarehouse(warehouse, stockEntries);
      console.log(`[XPOS Offline] Cached stock for ${stockEntries.length} items in warehouse ${warehouse}`);
    } catch (error) {
      console.warn("[XPOS Offline] Failed to cache stock:", error);
    }
  }

  async function fetchItems(posProfile: string, append = false): Promise<void> {
    if (isLoading.value) return;
    isLoading.value = true;

    try {
      if (!navigator.onLine && isOfflineEnabled()) {
        const filtered = await idbSearchCachedItems(searchTerm.value, selectedGroup.value);

        if (append) {
          const sliced = filtered.slice(items.value.length, items.value.length + pageLength.value);
          items.value = [...items.value, ...sliced];
          hasMore.value = items.value.length < filtered.length;
        } else {
          items.value = filtered.slice(0, pageLength.value);
          currentPage.value = 0;
          hasMore.value = filtered.length > pageLength.value;
        }

        // Enrich items with cached stock data
        const posStoreRef = usePosStore();
        if (posStoreRef.warehouse) {
          const stockData = await getCachedStock(posStoreRef.warehouse);
          const stockMap = new Map(stockData.map((s) => [s.item_code, s.actual_qty]));
          items.value = items.value.map((item) => ({
            ...item,
            actual_qty: stockMap.get(item.item_code) ?? item.actual_qty,
          }));
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
          const cached = await idbGetCachedItems();
          if (cached.length > 0) {
            const filtered = await idbSearchCachedItems(searchTerm.value, selectedGroup.value);
            items.value = filtered.slice(0, pageLength.value);
            hasMore.value = filtered.length > pageLength.value;
            console.log("[XPOS Offline] Serving items from idb cache");
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
      // Offline: load from idb cache
      if (!navigator.onLine && isOfflineEnabled()) {
        const cached = await idbGetCachedGroups();
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
        idbCacheGroups(itemGroups.value, parentGroups.value).catch(() => { });
      }
    } catch (error) {
      // Fall back to idb cache
      if (isOfflineEnabled()) {
        try {
          const cached = await idbGetCachedGroups();
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
      // Offline: search barcode from idb cache
      if (!navigator.onLine && isOfflineEnabled()) {
        const cached = await idbGetCachedItems();
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
      // Fall back to idb cache on error
      if (isOfflineEnabled()) {
        try {
          const cached = await idbGetCachedItems();
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
    cacheAllStock,
    setSearchTerm,
    setSelectedGroup,
    loadMore,
    resetItems,
  };
});
