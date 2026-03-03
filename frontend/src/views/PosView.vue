<template>
	<div class="flex h-full overflow-hidden">
		<div class="flex-1 flex flex-col min-w-0 border-r border-border bg-background max-w-[calc(100%-560px)] xl:max-w-[calc(100%-520px)]">
			<div class="shrink-0 p-4 pb-2 space-y-3">
				<div class="flex items-center gap-2">
					<div class="flex-1">
					<SearchBar ref="searchBarRef" @search="onSearch" @enter="onSearchEnter" @navigate="onNavigate" />
					</div>
					<div class="w-52 shrink-0">
						<BarcodeScanner ref="barcodeScannerRef" @scanned="onBarcodeScan" />
					</div>
					<div class="flex items-center gap-1 border rounded-lg p-1">
						<Button :variant="viewMode === 'grid' ? 'default' : 'ghost'" size="icon"
							class="h-8 w-8" @click="viewMode = 'grid'">
							<LayoutGrid class="h-4 w-4" />
						</Button>
						<Button :variant="viewMode === 'list' ? 'default' : 'ghost'" size="icon"
							class="h-8 w-8" @click="viewMode = 'list'">
							<List class="h-4 w-4" />
						</Button>
					</div>
				</div>
				<div class="flex items-center gap-2 overflow-x-auto pb-1 xpos-scrollbar">
					<Button :variant="itemStore.selectedGroup === 'All Item Groups' ? 'default' : 'outline'" size="sm"
						class="rounded-full shrink-0" @click="selectGroup('All Item Groups')">
						{{ "All Groups" }}
					</Button>
					<Button v-for="group in topGroups" :key="group.name"
						:variant="itemStore.selectedGroup === group.name ? 'default' : 'outline'" size="sm"
						class="rounded-full shrink-0" @click="selectGroup(group.name)">
						{{ group.name }}
					</Button>
				</div>
			</div>

				<div class="flex-1 overflow-y-auto p-4 pt-2 xpos-scrollbar">
				<ItemGrid :items="itemStore.filteredItems" :is-loading="itemStore.isLoading"
					:currency-symbol="posStore.currencySymbol" :view-mode="viewMode"
					:highlighted-index="highlightedIndex"
					@select-item="handleAddItem" @show-detail="handleShowDetail" @load-more="handleLoadMore" />
			</div>
		</div>

		<div class="w-[560px] xl:w-[520px] flex flex-col bg-background dark:bg-card shrink-0">
			<Cart />
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useItemStore } from "@/stores/itemStore";
import { useCartStore } from "@/stores/cartStore";
import { useOfferStore } from "@/stores/offerStore";
import { call, showError } from "@/services/api";
import SearchBar from "@/components/items/SearchBar.vue";
import BarcodeScanner from "@/components/items/BarcodeScanner.vue";
import ItemGrid from "@/components/items/ItemGrid.vue";
import Cart from "@/components/cart/Cart.vue";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List } from "lucide-vue-next";

import type { POSItem } from "@/types/pos.types";

const posStore = usePosStore();
const itemStore = useItemStore();
const cartStore = useCartStore();
const offerStore = useOfferStore();

const viewMode = ref<'grid' | 'list'>('grid');

watch(() => posStore.defaultView, (defaultView) => {
  if (defaultView) {
    viewMode.value = defaultView.toLowerCase() === 'list' ? 'list' : 'grid';
  }
}, { immediate: true });

const searchBarRef = ref<InstanceType<typeof SearchBar> | null>(null);
const barcodeScannerRef = ref<InstanceType<typeof BarcodeScanner> | null>(null);
const highlightedIndex = ref(-1);

const topGroups = computed(() => {
	const groups = itemStore.parentGroups.filter(
		(g) => g.name !== "All Item Groups"
	);
	return groups.slice(0, 12);
});

onMounted(() => {
	if (posStore.isReady) {
		loadInitialData();
	}
	document.addEventListener("keydown", handleGlobalKeydown);
	// Auto-focus barcode scanner
	nextTick(() => barcodeScannerRef.value?.focus());
});

onUnmounted(() => {
	document.removeEventListener("keydown", handleGlobalKeydown);
});

watch(() => posStore.isReady, (ready) => {
	if (ready) loadInitialData();
});

watch(() => itemStore.filteredItems, () => {
	highlightedIndex.value = -1;
});

async function loadInitialData() {
	await Promise.all([
		itemStore.fetchItems(posStore.profileName),
		itemStore.fetchItemGroups(),
	]);
	// Focus barcode scanner after data loads
	nextTick(() => barcodeScannerRef.value?.focus());
}

function onSearch(term: string) {
	itemStore.setSearchTerm(term);
	itemStore.fetchItems(posStore.profileName);
}

/**
 * Handle Enter key from search bar.
 * If an item is highlighted, add it to cart.
 * Otherwise try barcode lookup first, then fall back to text search.
 */
async function onSearchEnter(val: string) {
	// If an item is highlighted by arrow keys, select it
	if (highlightedIndex.value >= 0 && highlightedIndex.value < itemStore.filteredItems.length) {
		handleAddItem(itemStore.filteredItems[highlightedIndex.value]);
		highlightedIndex.value = -1;
		return;
	}

	if (!val) return;

	// Fall back to text search (barcode scanning is handled by the dedicated input)
	onSearch(val);
}

/**
 * Handle barcode scan from the dedicated barcode input.
 * Looks up the barcode and auto-adds the item to cart.
 */
async function onBarcodeScan(barcode: string) {
	if (!barcode) return;

	barcodeScannerRef.value?.setScanning(true);
	try {
		const result = await itemStore.searchByBarcode(barcode, posStore.profileName);
		if (result) {
			handleAddItem({
				item_code: result.item_code,
				item_name: result.item_name,
				rate: result.rate || 0,
				stock_uom: result.stock_uom || result.uom,
				uom: result.uom,
				image: result.image,
				has_batch_no: result.has_batch_no,
				has_serial_no: result.has_serial_no,
				actual_qty: result.actual_qty ?? 9999,
			} as POSItem);
			barcodeScannerRef.value?.showSuccess();
		} else {
			showError(`Item not found for barcode: ${barcode}`);
			barcodeScannerRef.value?.showError();
		}
	} catch (err) {
		showError("Barcode lookup failed");
		barcodeScannerRef.value?.showError();
	} finally {
		barcodeScannerRef.value?.setScanning(false);
	}
}

/**
 * Handle ArrowUp/Down navigation from search bar.
 * Moves the highlight through the item list.
 */
function onNavigate(direction: 'up' | 'down') {
	const items = itemStore.filteredItems;
	if (items.length === 0) return;

	if (direction === 'down') {
		highlightedIndex.value = Math.min(highlightedIndex.value + 1, items.length - 1);
	} else {
		highlightedIndex.value = Math.max(highlightedIndex.value - 1, -1);
		if (highlightedIndex.value === -1) {
			searchBarRef.value?.focus();
		}
	}

	// Scroll highlighted item into view
	nextTick(() => {
		const el = document.querySelector(`[data-item-index="${highlightedIndex.value}"]`);
		el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	});
}

/**
 * Global keydown handler for when focus is NOT in an input.
 * - Alpha/digit key → focus search bar with that key
 * - ArrowDown/Up → navigate items
 * - Enter → add highlighted item
 */
function handleGlobalKeydown(e: KeyboardEvent) {
	// Don't intercept when in an input, textarea, select, or dialog
	const tag = (document.activeElement?.tagName || "").toLowerCase();
	if (tag === "input" || tag === "textarea" || tag === "select") return;
	if (document.activeElement?.closest("[role='dialog']")) return;

	// Single printable character → focus search and type
	if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
		e.preventDefault();
		searchBarRef.value?.setValue(e.key);
		searchBarRef.value?.focus();
		itemStore.setSearchTerm(e.key);
		itemStore.fetchItems(posStore.profileName);
		return;
	}

	// ArrowDown/Up when not in input
	if (e.key === "ArrowDown") {
		e.preventDefault();
		onNavigate('down');
	}
	if (e.key === "ArrowUp") {
		e.preventDefault();
		onNavigate('up');
	}

	// Enter when not in input → add highlighted item
	if (e.key === "Enter" && highlightedIndex.value >= 0) {
		e.preventDefault();
		handleAddItem(itemStore.items[highlightedIndex.value]);
		highlightedIndex.value = -1;
	}
}

function selectGroup(group: string) {
	itemStore.setSelectedGroup(group);
	itemStore.fetchItems(posStore.profileName);
}

function handleAddItem(item: POSItem) {
	// Customer must be selected before adding items
	if (!cartStore.customer) {
		showError("Please select a customer before adding items to the cart");
		return;
	}

	// Check if item is a template (has variants) — open variant picker
	if (item.has_variants && !posStore.hideVariantsItems) {
		itemStore.openVariantPicker(item, posStore.profileName);
		return;
	}

	// Add item to cart with stock validation
	const result = cartStore.addItem(item);
	if (!result.success) {
		showError(result.message || "Cannot add item to cart");
		return;
	}

	// Fetch item tax template in background and apply to cart item
	fetchAndApplyItemTax(item);

	// Fetch applicable offers in background
	if (posStore.fetchCoupon) {
		offerStore.fetchOffers(
			posStore.profileName,
			cartStore.items.map((i) => i.item_code),
			cartStore.customer?.name || ""
		).then((offers) => {
			// Auto-apply offers
			if (offers && offers.length > 0) {
				for (const offer of offers) {
					cartStore.applyOffer(offer);
				}
			}
		}).catch(() => { /* ignore */ });
	}
}

async function fetchAndApplyItemTax(item: POSItem) {
	try {
		const taxData = await call<{
			item_tax_template: string | null;
			item_tax_map: Record<string, number>;
		}>("xpos.api.taxes.get_item_tax_template", {
			item_code: item.item_code,
			company: posStore.companyName,
			tax_category: "",
		});
		if (taxData && taxData.item_tax_template) {
			cartStore.setItemTax(
				item.item_code,
				taxData.item_tax_template,
				taxData.item_tax_map || {}
			);
		}
	} catch (e) {
		// Tax template fetch failed — continue without item-level tax
		console.warn("Failed to fetch item tax template for", item.item_code, e);
	}
}

function handleShowDetail(item: POSItem) {
	itemStore.openItemDetail(item, posStore.profileName);
}

function handleLoadMore() {
	itemStore.loadMore(posStore.profileName);
}
</script>
