<template>
	<div class="flex h-full overflow-hidden">
		<!-- ===== LEFT: Items Section ===== -->
		<div class="flex-1 flex flex-col min-w-0 border-r border-border bg-background">
			<!-- Search & Filters -->
			<div class="shrink-0 p-4 pb-2 space-y-3">
				<SearchBar
					@search="onSearch"
					@barcode="onBarcodeScan"
				/>
				<!-- Category Pills -->
				<div class="flex items-center gap-2 overflow-x-auto pb-1 xpos-scrollbar">
					<Button
						:variant="itemStore.selectedGroup === 'All Item Groups' ? 'default' : 'outline'"
						size="sm"
						class="rounded-full shrink-0"
						@click="selectGroup('All Item Groups')"
					>
						All
					</Button>
					<Button
						v-for="group in topGroups"
						:key="group.name"
						:variant="itemStore.selectedGroup === group.name ? 'default' : 'outline'"
						size="sm"
						class="rounded-full shrink-0"
						@click="selectGroup(group.name)"
					>
						{{ group.name }}
					</Button>
				</div>
			</div>

			<!-- Item Grid -->
			<div class="flex-1 overflow-y-auto p-4 pt-2 xpos-scrollbar">
				<ItemGrid
					:items="itemStore.items"
					:is-loading="itemStore.isLoading"
					:currency-symbol="posStore.currencySymbol"
					@select-item="handleAddItem"
					@load-more="handleLoadMore"
				/>
			</div>
		</div>

		<!-- ===== RIGHT: Cart Section ===== -->
		<div class="w-[380px] xl:w-[420px] flex flex-col bg-background dark:bg-card shrink-0">
			<Cart />
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useItemStore } from "@/stores/itemStore";
import { useCartStore } from "@/stores/cartStore";
import { useOfferStore } from "@/stores/offerStore";
import SearchBar from "@/components/items/SearchBar.vue";
import ItemGrid from "@/components/items/ItemGrid.vue";
import Cart from "@/components/cart/Cart.vue";
import { Button } from "@/components/ui/button";

import type { POSItem } from "@/types/pos.types";

const posStore = usePosStore();
const itemStore = useItemStore();
const cartStore = useCartStore();
const offerStore = useOfferStore();

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
	// Check if item is a template (has variants) — open variant picker
	if (item.has_variants && !posStore.hideVariantsItems) {
		itemStore.openVariantPicker(item, posStore.profileName);
		return;
	}

	cartStore.addItem(item);

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

function handleShowDetail(item: POSItem) {
	itemStore.openItemDetail(item, posStore.profileName);
}

function handleLoadMore() {
	itemStore.loadMore(posStore.profileName);
}
</script>
