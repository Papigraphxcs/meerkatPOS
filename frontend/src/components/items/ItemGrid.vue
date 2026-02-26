<template>
	<div>
		<!-- Loading Skeleton -->
		<div v-if="isLoading && items.length === 0" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
			<div v-for="i in 12" :key="i" class="xpos-skeleton h-40 rounded-2xl"></div>
		</div>

		<!-- Empty State -->
		<div v-else-if="items.length === 0" class="flex flex-col items-center justify-center h-64 text-surface-400">
			<svg class="w-20 h-20 mb-4 text-surface-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
				<path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
			</svg>
			<p class="text-lg font-medium">No items found</p>
			<p class="text-sm mt-1">Try a different search or category</p>
		</div>

		<!-- Items Grid -->
		<div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
			<ItemCard
				v-for="item in items"
				:key="item.item_code"
				:item="item"
				:currency-symbol="currencySymbol"
				@click="$emit('selectItem', item)"
			/>
		</div>

		<!-- Loading More Indicator -->
		<div v-if="isLoading && items.length > 0" class="flex justify-center py-6">
			<div class="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
		</div>

		<!-- Scroll sentinel for infinite loading -->
		<div ref="sentinel" class="h-1"></div>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import ItemCard from "./ItemCard.vue";
import type { POSItem } from "@/types/pos.types";

const props = defineProps({
	items: { type: Array as () => POSItem[], default: () => [] },
	isLoading: { type: Boolean, default: false },
	currencySymbol: { type: String, default: "$" },
});

const emit = defineEmits(["selectItem", "loadMore"]);

const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

onMounted(() => {
	observer = new IntersectionObserver(
		(entries) => {
			if (entries[0].isIntersecting && !props.isLoading && props.items.length > 0) {
				emit("loadMore");
			}
		},
		{ threshold: 0.1 }
	);
	if (sentinel.value) {
		observer.observe(sentinel.value);
	}
});

onUnmounted(() => {
	if (observer) observer.disconnect();
});
</script>
