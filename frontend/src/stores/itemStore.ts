import { defineStore } from "pinia";
import { ref, computed, type Ref, type ComputedRef } from "vue";
import { call } from "@/services/api";
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

  // ─── Actions ───────────────────────────────────
  async function fetchItems(posProfile: string, append = false): Promise<void> {
    if (isLoading.value) return;
    isLoading.value = true;

    try {
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
    } catch (error) {
      console.error("Error fetching items:", error);
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchItemGroups(): Promise<void> {
    try {
      const result = await call<ItemGroupsResult>(
        "xpos.api.items.get_item_groups"
      );
      itemGroups.value = result.groups || [];
      parentGroups.value = result.parent_groups || [];
    } catch (error) {
      console.error("Error fetching item groups:", error);
    }
  }

  async function searchByBarcode(
    barcode: string,
    _posProfile?: string
  ): Promise<POSItem | null> {
    try {
      const result = await call<POSItem | null>(
        "xpos.api.items.search_barcode",
        {
          barcode: barcode,
        }
      );
      return result;
    } catch (error) {
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
    setSearchTerm,
    setSelectedGroup,
    loadMore,
    resetItems,
  };
});
