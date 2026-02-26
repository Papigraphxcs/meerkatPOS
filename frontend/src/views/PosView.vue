<template>
	<div class="flex h-full overflow-hidden">
		<!-- ===== LEFT: Items Section ===== -->
		<div class="flex-1 flex flex-col min-w-0 border-r border-surface-100">
			<!-- Search & Filters -->
			<div class="shrink-0 p-4 pb-2 space-y-3">
				<SearchBar
					@search="onSearch"
					@barcode="onBarcodeScan"
				/>
				<!-- Category Pills -->
				<div class="flex items-center gap-2 overflow-x-auto pb-1 xpos-scrollbar">
					<button
						@click="selectGroup('All Item Groups')"
						class="category-pill"
						:class="{ 'category-pill-active': itemStore.selectedGroup === 'All Item Groups' }"
					>
						All
					</button>
					<button
						v-for="group in topGroups"
						:key="group.name"
						@click="selectGroup(group.name)"
						class="category-pill"
						:class="{ 'category-pill-active': itemStore.selectedGroup === group.name }"
					>
						{{ group.name }}
					</button>
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
		<div class="w-[380px] xl:w-[420px] flex flex-col bg-white shrink-0">
			<Cart />
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useItemStore } from "@/stores/itemStore";
import { useCartStore } from "@/stores/cartStore";
import SearchBar from "@/components/items/SearchBar.vue";
import ItemGrid from "@/components/items/ItemGrid.vue";
import Cart from "@/components/cart/Cart.vue";

const posStore = usePosStore();
const itemStore = useItemStore();
const cartStore = useCartStore();

const topGroups = computed(() => {
	const groups = itemStore.parentGroups.filter(
		(g) => g.name !== "All Item Groups"
	);
	return groups.slice(0, 12);
});

// Load items when POS is ready
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
		cartStore.addItem({
			item_code: result.item_code,
			item_name: result.item_name,
			rate: 0,
			stock_uom: result.uom,
			uom: result.uom,
		});
		// Fetch price for the item
		const items = await itemStore.fetchItems(posStore.profileName);
	}
}

function selectGroup(group: string) {
	itemStore.setSelectedGroup(group);
	itemStore.fetchItems(posStore.profileName);
}

function handleAddItem(item: { item_code: string; item_name: string; rate: number; uom: string; stock_uom: string; [key: string]: unknown }) {
	cartStore.addItem(item);
}

function handleLoadMore() {
	itemStore.loadMore(posStore.profileName);
}
</script>

<style scoped>
.category-pill {
	@apply px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap
				 bg-surface-100 text-surface-600 hover:bg-surface-200
				 transition-all duration-200 border border-transparent;
}
.category-pill-active {
	@apply bg-primary-50 text-primary-700 border-primary-200 shadow-sm;
}
</style>
