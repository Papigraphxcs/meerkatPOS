<template>
	<div class="flex h-full overflow-hidden">
		<div class="flex-1 flex flex-col min-w-0 border-r border-border bg-background max-w-[calc(100%-560px)] xl:max-w-[calc(100%-520px)]">
			<div class="shrink-0 p-4 pb-2 space-y-3">
				<div class="flex items-center gap-2">
					<div class="flex-1">
						<SearchBar @search="onSearch" @barcode="onBarcodeScan" />
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
				<ItemGrid :items="itemStore.items" :is-loading="itemStore.isLoading"
					:currency-symbol="posStore.currencySymbol" :view-mode="viewMode"
					@select-item="handleAddItem" @show-detail="handleShowDetail" @load-more="handleLoadMore" />
			</div>
		</div>

		<div class="w-[560px] xl:w-[520px] flex flex-col bg-background dark:bg-card shrink-0">
			<Cart />
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useItemStore } from "@/stores/itemStore";
import { useCartStore } from "@/stores/cartStore";
import { useOfferStore } from "@/stores/offerStore";
import { call, showError } from "@/services/api";
import SearchBar from "@/components/items/SearchBar.vue";
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
});

watch(() => posStore.isReady, (ready) => {
	if (ready) loadInitialData();
});

async function loadInitialData() {
	await Promise.all([
		itemStore.fetchItems(posStore.profileName),
		itemStore.fetchItemGroups(),
	]);
}

function onSearch(term: string) {
	itemStore.setSearchTerm(term);
	itemStore.fetchItems(posStore.profileName);
}

async function onBarcodeScan(barcode: string) {
	const result = await itemStore.searchByBarcode(barcode, posStore.profileName);
	if (result) {
		handleAddItem({
			item_code: result.item_code,
			item_name: result.item_name,
			rate: 0,
			stock_uom: result.uom,
			uom: result.uom,
		} as POSItem);
		await itemStore.fetchItems(posStore.profileName);
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
