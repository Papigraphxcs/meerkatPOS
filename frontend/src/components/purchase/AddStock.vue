<script setup lang="ts">
import { ref, computed } from "vue";
import { usePurchaseStore } from "@/stores/purchaseStore";
import { usePosStore } from "@/stores/posStore";
import { useMoney } from "@/composables/useMoney";
import { hasPermission } from "@/services/userRights";
import { PackagePlus, Trash2, Loader2, Warehouse } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Autocomplete } from "@/components/ui/autocomplete";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { MaterialReceiptItem } from "@/types/pos.types";
import __ from "@/lib/translate";

const purchaseStore = usePurchaseStore();
const posStore = usePosStore();
const { money, ratePrecision } = useMoney();

interface ReceiptFormItem {
	item_code: string;
	item_name: string;
	qty: number;
	uom: string;
	stock_uom: string;
	conversion_factor: number;
	valuation_rate: number;
}

const lines = ref<ReceiptFormItem[]>([]);
const remarks = ref("");
const pickedItemCode = ref("");
const isAddingItem = ref(false);

const hasValidLines = computed(() => lines.value.some((line) => line.qty > 0));

async function onItemPicked(itemCode: string | undefined): Promise<void> {
	pickedItemCode.value = "";
	if (!itemCode) return;

	if (lines.value.some((line) => line.item_code === itemCode)) return;

	isAddingItem.value = true;
	try {
		const item = await purchaseStore.fetchItemByCode(itemCode);
		if (!item) return;

		lines.value.push({
			item_code: item.item_code,
			item_name: item.item_name,
			qty: 1,
			uom: item.stock_uom,
			stock_uom: item.stock_uom,
			conversion_factor: 1,
			valuation_rate: item.buying_price || item.standard_rate || 0,
		});
	} finally {
		isAddingItem.value = false;
	}
}

function removeLine(index: number): void {
	lines.value.splice(index, 1);
}

async function submitReceipt(): Promise<void> {
	if (!hasValidLines.value) return;

	const items: MaterialReceiptItem[] = lines.value
		.filter((line) => line.qty > 0)
		.map((line) => ({
			item_code: line.item_code,
			item_name: line.item_name,
			qty: line.qty,
			uom: line.uom,
			stock_uom: line.stock_uom,
			conversion_factor: line.conversion_factor,
			valuation_rate: line.valuation_rate,
		}));

	const result = await purchaseStore.createMaterialReceipt(items, remarks.value);
	if (result) {
		lines.value = [];
		remarks.value = "";
	}
}
</script>

<template>
	<div class="h-full flex flex-col overflow-hidden bg-card">
		<div class="p-4 border-b border-border bg-muted shrink-0">
			<h3 class="font-semibold text-foreground flex items-center gap-2">
				<PackagePlus class="w-5 h-5" />
				{{ __("Add New Stock") }}
			</h3>
			<p class="text-xs text-muted-foreground mt-1">
				{{ __("For stock with no supplier or bill — opening stock, found stock, samples, corrections.") }}
			</p>
		</div>

		<div class="px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border-b border-border shrink-0">
			<p class="text-xs text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
				<Warehouse class="w-3.5 h-3.5" />
				{{ __("Adding to") }}: <strong>{{ posStore.warehouse }}</strong>
			</p>
		</div>

		<div class="p-4 border-b border-border shrink-0">
			<Autocomplete
				:model-value="pickedItemCode"
				doctype="Item"
				label-field="item_name"
				:placeholder="__('Search for an item to add...')"
				:clearable="false"
				@update:model-value="onItemPicked"
			/>
			<p v-if="isAddingItem" class="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
				<Loader2 class="w-3 h-3 animate-spin" />
				{{ __("Loading item...") }}
			</p>
		</div>

		<ScrollArea class="flex-1 min-h-0">
			<div v-if="lines.length === 0" class="p-8 text-center text-muted-foreground">
				<PackagePlus class="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
				<p class="font-medium">{{ __("No items yet") }}</p>
				<p class="text-sm mt-1">{{ __("Search above to add items to this stock entry") }}</p>
			</div>

			<div v-else class="divide-y divide-border">
				<div v-for="(line, index) in lines" :key="line.item_code" class="p-4 space-y-3">
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<p class="font-medium text-foreground truncate">{{ line.item_name }}</p>
							<p class="text-xs text-muted-foreground">{{ line.item_code }} &middot; {{ line.uom }}</p>
						</div>
						<Button
							variant="ghost"
							size="icon-sm"
							class="text-muted-foreground hover:text-destructive shrink-0"
							@click="removeLine(index)"
						>
							<Trash2 class="w-4 h-4" />
						</Button>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="text-xs text-muted-foreground mb-1 block">{{ __("Qty") }}</label>
							<NumberInput v-model="line.qty" :min="0" :precision="ratePrecision" class="h-8" />
						</div>
						<div>
							<label class="text-xs text-muted-foreground mb-1 block">
								{{ __("Valuation Rate") }}
							</label>
							<NumberInput
								v-model="line.valuation_rate"
								:min="0"
								:precision="ratePrecision"
								class="h-8"
							/>
						</div>
					</div>

					<p class="text-xs text-muted-foreground">
						{{ __("Line value") }}: {{ money(line.qty * line.valuation_rate) }}
					</p>
				</div>
			</div>
		</ScrollArea>

		<div class="p-4 border-t border-border bg-muted shrink-0 space-y-3">
			<Input
				v-model="remarks"
				:placeholder="__('Reason (optional, e.g. opening stock, stock count correction)')"
				class="text-sm"
			/>
			<Button
				v-if="hasPermission('material_receipt')"
				class="w-full"
				:disabled="!hasValidLines || purchaseStore.isCreatingReceipt"
				@click="submitReceipt"
			>
				<Loader2 v-if="purchaseStore.isCreatingReceipt" class="w-4 h-4 me-1 animate-spin" />
				<PackagePlus v-else class="w-4 h-4 me-1" />
				{{ purchaseStore.isCreatingReceipt ? __("Adding...") : __("Add Stock") }}
			</Button>
		</div>
	</div>
</template>
