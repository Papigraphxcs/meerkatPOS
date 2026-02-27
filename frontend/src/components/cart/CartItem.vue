<template>
	<div
		class="group flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-muted/50 transition-colors duration-150 dark:hover:bg-accent/50"
	>
		<!-- Item Image / Icon -->
		<div class="w-10 h-10 rounded-lg bg-muted overflow-hidden shrink-0 flex items-center justify-center">
			<img
				v-if="item.image"
				:src="item.image"
				:alt="item.item_name"
				class="w-full h-full object-cover"
			/>
			<Package v-else class="w-5 h-5 text-muted-foreground/40" />
		</div>

		<!-- Item Info -->
		<div class="flex-1 min-w-0">
			<p class="text-xs font-medium text-foreground leading-tight truncate">
				{{ item.item_name }}
			</p>

			<!-- Editable Rate -->
			<div class="flex items-center gap-1 mt-0.5">
				<template v-if="posStore.allowEditRate">
					<span class="text-[11px] text-muted-foreground">{{ currencySymbol }}</span>
					<input
						:value="item.rate"
						type="number"
						min="0"
						step="0.01"
						class="w-16 h-5 text-[11px] font-medium text-foreground bg-transparent border-b border-dashed border-border
								 focus:outline-none focus:border-primary dark:border-muted-foreground/40
								 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
						@change="onRateChange"
					/>
					<span class="text-[11px] text-muted-foreground">each</span>
				</template>
				<p v-else class="text-[11px] text-muted-foreground">
					{{ currencySymbol }}{{ formatPrice(item.rate) }} each
				</p>
			</div>

			<!-- Qty Controls -->
			<div class="flex items-center gap-1.5 mt-1.5">
				<Button variant="secondary" size="icon-sm" class="w-6 h-6" @click="decrementQty">
					<Minus class="w-3 h-3" />
				</Button>
				<input
					:value="item.qty"
					type="number"
					min="0"
					class="w-10 h-6 text-center text-xs font-semibold text-foreground bg-muted/50 rounded-md
								 border border-border focus:outline-none focus:ring-1 focus:ring-ring
								 dark:bg-accent/50 dark:border-muted-foreground/30
								 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
					@change="onQtyChange"
				/>
				<Button variant="secondary" size="icon-sm" class="w-6 h-6 bg-primary/10 text-primary hover:bg-primary/20" @click="incrementQty">
					<Plus class="w-3 h-3" />
				</Button>

				<!-- Inline Discount (if allowed) -->
				<template v-if="posStore.allowEditItemDiscount">
					<span class="text-[10px] text-muted-foreground ml-1">disc:</span>
					<input
						:value="item.discount_percentage || 0"
						type="number"
						min="0"
						:max="maxDiscount || 100"
						step="0.5"
						class="w-10 h-6 text-center text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-md
								 border border-emerald-200 dark:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-400
								 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
						@change="onDiscountChange"
					/>
					<span class="text-[10px] text-muted-foreground">%</span>
				</template>
			</div>
		</div>

		<!-- Amount & Delete -->
		<div class="flex flex-col items-end gap-1 shrink-0">
			<span class="text-sm font-bold text-foreground tabular-nums">
				{{ currencySymbol }}{{ formatPrice(lineTotal) }}
			</span>
			<Button
				variant="ghost"
				size="icon-sm"
				class="opacity-0 group-hover:opacity-100 w-5 h-5 hover:text-destructive transition-all"
				@click="$emit('remove', index)"
			>
				<Trash2 class="w-3.5 h-3.5" />
			</Button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { usePosStore } from "@/stores/posStore";
import { Button } from "@/components/ui/button";
import { Package, Minus, Plus, Trash2 } from "lucide-vue-next";

const props = defineProps({
	item: { type: Object, required: true },
	index: { type: Number, required: true },
	currencySymbol: { type: String, default: "$" },
});

const emit = defineEmits(["update-qty", "update-rate", "update-discount", "remove"]);

const posStore = usePosStore();

const maxDiscount = computed(() => posStore.maxDiscountAllowed);

const lineTotal = computed(() => {
	const total = props.item.qty * props.item.rate;
	const discount = props.item.discount_percentage
		? (total * props.item.discount_percentage) / 100
		: props.item.discount_amount || 0;
	return Math.round((total - discount + Number.EPSILON) * 100) / 100;
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

function onRateChange(e: Event) {
	const val = parseFloat((e.target as HTMLInputElement).value) || 0;
	emit("update-rate", props.index, Math.round(val * 100) / 100);
}

function onDiscountChange(e: Event) {
	let val = parseFloat((e.target as HTMLInputElement).value) || 0;
	const max = maxDiscount.value || 100;
	val = Math.min(val, max);
	emit("update-discount", props.index, "percentage", val);
}

function formatPrice(price: number | string) {
	return (Math.round((parseFloat(String(price) || "0") + Number.EPSILON) * 100) / 100).toFixed(2);
}
</script>
