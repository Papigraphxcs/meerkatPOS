<template>
	<div
		class="xpos-card-hover group relative overflow-hidden select-none"
		@click="$emit('click', item)"
	>
		<!-- Image / Placeholder -->
		<div class="relative aspect-[4/3] bg-surface-50 overflow-hidden rounded-t-2xl">
			<img
				v-if="item.image"
				:src="item.image"
				:alt="item.item_name"
				class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
				loading="lazy"
			/>
			<div v-else class="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-50 to-surface-100">
				<svg class="w-10 h-10 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
				</svg>
			</div>

			<!-- Stock Badge -->
			<div
				v-if="item.actual_qty !== undefined"
				class="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
				:class="stockClass"
			>
				{{ stockLabel }}
			</div>

			<!-- Quick Add Overlay -->
			<div class="absolute inset-0 bg-primary-600/0 group-hover:bg-primary-600/10 transition-all duration-300 flex items-center justify-center">
				<div class="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center
							opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100
							transition-all duration-300 shadow-lg">
					<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
					</svg>
				</div>
			</div>
		</div>

		<!-- Info -->
		<div class="p-2.5">
			<p class="text-xs font-medium text-surface-700 leading-tight line-clamp-2 mb-1">
				{{ item.item_name }}
			</p>
			<div class="flex items-center justify-between">
				<span class="text-sm font-bold text-primary-600">
					{{ currencySymbol }}{{ formatPrice(item.rate) }}
				</span>
				<span class="text-[10px] text-surface-400 truncate ml-1">
					{{ item.item_group }}
				</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps({
	item: { type: Object, required: true },
	currencySymbol: { type: String, default: "$" },
});

defineEmits(["click"]);

const stockClass = computed(() => {
	const qty = props.item.actual_qty || 0;
	if (qty <= 0) return "bg-red-100 text-red-600";
	if (qty <= 5) return "bg-amber-100 text-amber-600";
	return "bg-emerald-100 text-emerald-600";
});

const stockLabel = computed(() => {
	const qty = props.item.actual_qty || 0;
	if (qty <= 0) return "Out";
	return qty > 999 ? "999+" : qty;
});

function formatPrice(price: number | string) {
	return parseFloat(String(price) || "0").toFixed(2);
}
</script>
