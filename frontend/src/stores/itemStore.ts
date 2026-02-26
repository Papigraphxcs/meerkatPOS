import { defineStore } from "pinia";
import { ref, computed, type Ref, type ComputedRef } from "vue";
import { call } from "@/services/api";
import type { POSItem, ItemGroup } from "@/types/pos.types";

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
    // Computed
    filteredItems,
    // Actions
    fetchItems,
    fetchItemGroups,
    searchByBarcode,
    setSearchTerm,
    setSelectedGroup,
    loadMore,
    resetItems,
  };
});
