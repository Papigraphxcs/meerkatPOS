<template>
	<div>
		<!-- Loading Skeleton -->
		<div v-if="isLoading && items.length === 0" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
			<div v-for="i in 12" :key="i" class="xpos-skeleton h-40 rounded-xl"></div>
		</div>

		<!-- Empty State -->
		<div v-else-if="items.length === 0" class="flex flex-col items-center justify-center h-64 text-muted-foreground">
			<Package class="w-20 h-20 mb-4 text-muted-foreground/30" />
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
				@show-detail="$emit('showDetail', item)"
			/>
		</div>

		<!-- Loading More Indicator -->
		<div v-if="isLoading && items.length > 0" class="flex justify-center py-6">
			<Loader2 class="w-6 h-6 text-primary animate-spin" />
		</div>

		<!-- Scroll sentinel for infinite loading -->
		<div ref="sentinel" class="h-1"></div>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import ItemCard from "./ItemCard.vue";
import { Package, Loader2 } from "lucide-vue-next";
import type { POSItem } from "@/types/pos.types";

const props = defineProps({
	items: { type: Array as () => POSItem[], default: () => [] },
	isLoading: { type: Boolean, default: false },
	currencySymbol: { type: String, default: "$" },
});

const emit = defineEmits(["selectItem", "showDetail", "loadMore"]);

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
