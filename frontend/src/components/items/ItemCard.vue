<template>
	<Card
		class="group relative overflow-hidden select-none cursor-pointer hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200 dark:border-border dark:hover:border-primary/40"
		@click="$emit('click', item)"
	>
		<!-- Image / Placeholder -->
		<div class="relative aspect-[4/3] bg-muted overflow-hidden rounded-t-xl">
			<img
				v-if="item.image"
				:src="item.image"
				:alt="item.item_name"
				class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
				loading="lazy"
			/>
			<div v-else class="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
				<Package class="w-10 h-10 text-muted-foreground/40" />
			</div>

			<!-- Stock Badge -->
			<Badge
				v-if="showStock && item.actual_qty !== undefined"
				:variant="stockVariant"
				class="absolute top-2 right-2 text-[10px]"
			>
				{{ stockLabel }}
			</Badge>

			<!-- Quick Add Overlay -->
			<div class="absolute inset-0 bg-primary/0 group-hover:bg-primary/10 transition-all duration-300 flex items-center justify-center gap-2">
				<div
					class="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center
							opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100
							transition-all duration-300 shadow-lg"
				>
					<Plus class="w-5 h-5" />
				</div>
				<div
					class="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center
							opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100
							transition-all duration-300 shadow-lg delay-75"
					@click.stop="$emit('showDetail', item)"
				>
					<Info class="w-5 h-5" />
				</div>
			</div>
		</div>

		<!-- Info -->
		<CardContent class="p-2.5">
			<p class="text-xs font-medium text-foreground leading-tight line-clamp-2 mb-1">
				{{ item.item_name }}
			</p>
			<p v-if="showItemCode" class="text-[10px] text-muted-foreground mb-1 truncate font-mono">
				{{ item.item_code }}
			</p>
			<div class="flex items-center justify-between">
				<span class="text-sm font-bold text-primary dark:text-primary-foreground tabular-nums">
					{{ currencySymbol }}{{ formatPrice(item.rate) }}
				</span>
				<span class="text-[10px] text-muted-foreground dark:text-muted-foreground/90 truncate ml-1">
					{{ item.item_group }}
				</span>
			</div>
		</CardContent>
	</Card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { usePosStore } from "@/stores/posStore";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, Info } from "lucide-vue-next";

const props = defineProps({
	item: { type: Object, required: true },
	currencySymbol: { type: String, default: "$" },
});

defineEmits(["click", "showDetail"]);

const posStore = usePosStore();

const showStock = computed(() => posStore.displayItemsInStock);
const showItemCode = computed(() => posStore.displayItemCode);

const stockVariant = computed(() => {
	const qty = props.item.actual_qty || 0;
	if (qty <= 0) return "destructive" as const;
	if (qty <= 5) return "warning" as const;
	return "success" as const;
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
