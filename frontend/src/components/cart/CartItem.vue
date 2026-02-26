<template>
	<div
		class="group flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-surface-50 transition-colors duration-150 animate-fade-in"
	>
		<!-- Item Image / Icon -->
		<div class="w-10 h-10 rounded-lg bg-surface-100 overflow-hidden shrink-0 flex items-center justify-center">
			<img
				v-if="item.image"
				:src="item.image"
				:alt="item.item_name"
				class="w-full h-full object-cover"
			/>
			<svg v-else class="w-5 h-5 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
			</svg>
		</div>

		<!-- Item Info -->
		<div class="flex-1 min-w-0">
			<p class="text-xs font-medium text-surface-700 leading-tight truncate">
				{{ item.item_name }}
			</p>
			<p class="text-[11px] text-surface-400 mt-0.5">
				{{ currencySymbol }}{{ formatPrice(item.rate) }} each
			</p>

			<!-- Qty Controls -->
			<div class="flex items-center gap-1.5 mt-1.5">
				<button
					@click="decrementQty"
					class="w-6 h-6 rounded-md bg-surface-100 hover:bg-surface-200 flex items-center justify-center
								 text-surface-600 transition-colors active:scale-90"
				>
					<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
						<path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4" />
					</svg>
				</button>
				<input
					:value="item.qty"
					type="number"
					min="0"
					class="w-10 h-6 text-center text-xs font-semibold text-surface-800 bg-surface-50 rounded-md
								 border border-surface-200 focus:outline-none focus:ring-1 focus:ring-primary-400
								 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
					@change="onQtyChange"
				/>
				<button
					@click="incrementQty"
					class="w-6 h-6 rounded-md bg-primary-50 hover:bg-primary-100 flex items-center justify-center
								 text-primary-600 transition-colors active:scale-90"
				>
					<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Amount & Delete -->
		<div class="flex flex-col items-end gap-1 shrink-0">
			<span class="text-sm font-bold text-surface-800">
				{{ currencySymbol }}{{ formatPrice(lineTotal) }}
			</span>
			<button
				@click="$emit('remove', index)"
				class="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-md hover:bg-red-50
							 flex items-center justify-center transition-all"
			>
				<svg class="w-3.5 h-3.5 text-red-400 hover:text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
				</svg>
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps({
	item: { type: Object, required: true },
	index: { type: Number, required: true },
	currencySymbol: { type: String, default: "$" },
});

const emit = defineEmits(["update-qty", "remove"]);

const lineTotal = computed(() => {
	const total = props.item.qty * props.item.rate;
	const discount = props.item.discount_percentage
		? (total * props.item.discount_percentage) / 100
		: props.item.discount_amount || 0;
	return total - discount;
});

function incrementQty() {
	emit("update-qty", props.index, props.item.qty + 1);
}

function decrementQty() {
	emit("update-qty", props.index, props.item.qty - 1);
}

function onQtyChange(e: Event) {
	const val = parseFloat((e.target as HTMLInputElement).value) || 0;
	emit("update-qty", props.index, val);
}

function formatPrice(price: number | string) {
	return parseFloat(String(price) || "0").toFixed(2);
}
</script>
