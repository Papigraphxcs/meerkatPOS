<script setup lang="ts">
import { computed } from "vue";
import { usePurchaseStore, type PurchaseCartItem } from "@/stores/purchaseStore";
import { usePosStore } from "@/stores/posStore";
import { Trash2, ShoppingCart, Package, RefreshCw } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip";
import { NumberInput } from "@/components/ui/number-input";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import __ from "@/lib/translate";

const purchaseStore = usePurchaseStore();
const posStore = usePosStore();

const purchaseTaxes = computed(() => posStore.purchaseTaxes);

function formatCurrency(value: number): string {
	return `${posStore.currencySymbol}${value.toFixed(2)}`;
}

function getItemNetAmount(item: PurchaseCartItem): number {
	const gross = item.qty * item.rate;
	const disc = item.discount_percent || 0;
	return gross * (1 - disc / 100);
}

function getItemAmount(item: PurchaseCartItem): number {
	return getItemNetAmount(item);
}

function getItemTaxAmountByType(item: PurchaseCartItem, taxType: string): number {
	const percent = (item.taxes || {})[taxType] || 0;
	return (getItemNetAmount(item) * percent) / 100;
}

function getItemTotalTax(item: PurchaseCartItem): number {
	if (!purchaseTaxes.value.length) return 0;
	return purchaseTaxes.value.reduce((sum, t) => sum + getItemTaxAmountByType(item, t.tax_type), 0);
}

function getItemGrandTotal(item: PurchaseCartItem): number {
	return getItemNetAmount(item) + getItemTotalTax(item);
}

const cartNetTotal = computed(() => purchaseStore.cartItems.reduce((s, i) => s + getItemNetAmount(i), 0));

const cartTaxByType = (taxType: string) =>
	purchaseStore.cartItems.reduce((s, i) => s + getItemTaxAmountByType(i, taxType), 0);

const cartTotalTax = computed(() => purchaseStore.cartItems.reduce((s, i) => s + getItemTotalTax(i), 0));

const cartGrandTotal = computed(() => cartNetTotal.value + cartTotalTax.value);
</script>

<template>
	<div class="h-full flex flex-col bg-card overflow-hidden">
		<div class="px-4 py-3 border-b border-border bg-muted flex items-center justify-between shrink-0">
			<h2 class="font-semibold flex items-center gap-2 text-foreground">
				<ShoppingCart class="w-5 h-5" />
				{{ __("Purchase Cart") }}
				<span class="text-sm font-normal text-muted-foreground">
					({{ purchaseStore.cartItems.length }} {{ __("items") }})
				</span>
			</h2>
			<TooltipWrapper v-if="!purchaseStore.isEmpty" :content="__('Refresh stock data')">
				<Button @click="purchaseStore.refreshAllStock()" variant="outline" size="sm">
					<RefreshCw class="w-3.5 h-3.5 me-1" />
					{{ __("Stock") }}
				</Button>
			</TooltipWrapper>
		</div>

		<div v-if="purchaseStore.isEmpty" class="flex-1 flex items-center justify-center p-8">
			<div class="text-center text-muted-foreground">
				<Package class="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
				<p class="font-medium">{{ __("Cart is empty") }}</p>
				<p class="text-sm mt-1">{{ __("Add items from the list to start") }}</p>
			</div>
		</div>

		<ScrollArea v-else class="flex-1 min-h-0">
			<div class="overflow-x-auto">
				<table class="w-full text-sm border-collapse min-w-[1100px]">
					<thead class="sticky top-0 z-10 bg-muted border-b border-border">
						<tr class="text-xs text-muted-foreground uppercase tracking-wider">
							<th class="px-2 py-2 text-start w-8">#</th>
							<th class="px-2 py-2 text-start min-w-[100px]">{{ __("Alias") }}</th>
							<th class="px-2 py-2 text-start min-w-[120px]">
								{{ __("Item Name") }}
							</th>
							<th class="px-2 py-2 text-end w-[80px]">{{ __("Stock") }}</th>
							<th class="px-2 py-2 text-end w-[80px]">{{ __("Transit") }}</th>
							<th class="px-2 py-2 text-end w-[70px]">{{ __("Loose") }}</th>
							<th class="px-2 py-2 text-end w-[70px]">{{ __("Packs") }}</th>
							<th class="px-2 py-2 text-end w-[80px]">{{ __("Rate") }}</th>
							<th class="px-2 py-2 text-end w-[60px]">{{ __("Disc%") }}</th>
							<th class="px-2 py-2 text-end w-[80px]">{{ __("Amount") }}</th>
							<th
								v-for="tax in purchaseTaxes"
								:key="'th-' + tax.tax_type"
								class="px-2 py-2 text-end w-[70px]"
							>
								{{ tax.tax_type }}%
							</th>
							<th v-if="purchaseTaxes.length" class="px-2 py-2 text-end w-[80px]">
								{{ __("Tax Amt") }}
							</th>
							<th v-if="purchaseTaxes.length" class="px-2 py-2 text-end w-[90px]">
								{{ __("Total") }}
							</th>
							<th class="px-2 py-2 text-start min-w-[90px]">{{ __("Generic") }}</th>
							<th class="px-2 py-2 text-start w-[80px]">{{ __("Category") }}</th>
							<th class="px-2 py-2 text-start w-[70px]">{{ __("Class") }}</th>
							<th class="px-2 py-2 text-start w-[80px]">{{ __("Packing") }}</th>
							<th class="px-2 py-2 text-end w-[60px]">{{ __("P.Units") }}</th>
							<th class="px-2 py-2 w-8"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						<tr
							v-for="(item, index) in purchaseStore.cartItems"
							:key="`${item.item_code}-${index}`"
							class="hover:bg-muted/50 transition-colors"
						>
							<td class="px-2 py-1.5 text-muted-foreground text-center">
								{{ index + 1 }}
							</td>

							<td class="px-2 py-1.5">
								<Input v-model="item.custom_alias" class="h-7 text-xs" />
							</td>

							<td class="px-2 py-1.5">
								<TooltipWrapper :content="item.item_name">
									<div class="truncate text-foreground font-medium text-xs">
										{{ item.item_name }}
									</div>
								</TooltipWrapper>
								<div class="text-[10px] text-muted-foreground truncate">
									{{ item.item_code }}
								</div>
							</td>

							<td class="px-2 py-1.5 text-end text-xs font-mono">
								{{ (item.custom_stock_in_hand || 0).toFixed(0) }}
							</td>

							<td class="px-2 py-1.5 text-end text-xs font-mono">
								{{ (item.custom_transit_stock || 0).toFixed(0) }}
							</td>

							<td class="px-2 py-1.5">
								<NumberInput
									:model-value="item.custom_required_loose || 0"
									@update:model-value="purchaseStore.updateCartItemLoose(index, $event)"
									:min="0"
									:precision="0"
									class="h-7 text-xs w-full"
								/>
							</td>

							<td class="px-2 py-1.5">
								<NumberInput
									:model-value="item.custom_required_packs || 0"
									@update:model-value="purchaseStore.updateCartItemPacks(index, $event)"
									:min="0"
									:precision="0"
									class="h-7 text-xs w-full"
								/>
							</td>

							<td class="px-2 py-1.5">
								<NumberInput
									:model-value="item.rate"
									@update:model-value="purchaseStore.updateCartItemRate(index, $event)"
									:min="0"
									:precision="2"
									class="h-7 text-xs w-full"
								/>
							</td>

							<td class="px-2 py-1.5">
								<NumberInput
									:model-value="item.discount_percent || 0"
									@update:model-value="purchaseStore.updateCartItemDiscount(index, $event)"
									:min="0"
									:max="100"
									:precision="1"
									class="h-7 text-xs w-full"
								/>
							</td>

							<td class="px-2 py-1.5 text-end text-xs font-medium text-green-600 font-mono">
								{{ formatCurrency(getItemAmount(item)) }}
							</td>
							<td
								v-for="tax in purchaseTaxes"
								:key="'tax-' + tax.tax_type + '-' + index"
								class="px-2 py-1.5"
							>
								<NumberInput
									:model-value="(item.taxes || {})[tax.tax_type] || 0"
									@update:model-value="
										purchaseStore.updateCartItemTax(index, tax.tax_type, $event)
									"
									:min="0"
									:max="100"
									:precision="1"
									class="h-7 text-xs w-full"
								/>
							</td>

							<td
								v-if="purchaseTaxes.length"
								class="px-2 py-1.5 text-end text-xs text-amber-600 font-mono"
							>
								{{ formatCurrency(getItemTotalTax(item)) }}
							</td>

							<td
								v-if="purchaseTaxes.length"
								class="px-2 py-1.5 text-end text-xs font-semibold text-primary font-mono"
							>
								{{ formatCurrency(getItemGrandTotal(item)) }}
							</td>

							<td class="px-2 py-1.5">
								<Input v-model="item.custom_generic_item" class="h-7 text-xs" />
							</td>

							<td class="px-2 py-1.5 text-xs text-muted-foreground truncate">
								{{ item.custom_category || "-" }}
							</td>

							<td class="px-2 py-1.5">
								<Input v-model="item.custom_class" class="h-7 text-xs" />
							</td>

							<td class="px-2 py-1.5 text-xs text-muted-foreground truncate">
								{{ item.custom_item_packing || "-" }}
							</td>

							<td class="px-2 py-1.5 text-end text-xs font-mono">
								{{ (item.custom_pack_units || 0).toFixed(0) }}
							</td>

							<td class="px-1 py-1.5">
								<Button
									@click="purchaseStore.removeFromCart(index)"
									variant="ghost"
									size="icon"
									class="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
								>
									<Trash2 class="w-3 h-3" />
								</Button>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</ScrollArea>

		<div v-if="!purchaseStore.isEmpty" class="border-t border-border bg-muted p-4 shrink-0">
			<div class="space-y-1.5">
				<div class="flex justify-between text-sm">
					<span class="text-muted-foreground">{{ __("Total Qty") }}</span>
					<span class="font-mono">{{ purchaseStore.cartItemCount }}</span>
				</div>
				<template v-if="purchaseTaxes.length">
					<div
						v-for="tax in purchaseTaxes"
						:key="'footer-' + tax.tax_type"
						class="flex justify-between text-sm"
					>
						<span class="text-muted-foreground">{{ tax.tax_type }}</span>
						<span class="font-mono text-amber-600">{{
							formatCurrency(cartTaxByType(tax.tax_type))
						}}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-muted-foreground">{{ __("Total Tax") }}</span>
						<span class="font-mono text-amber-600">{{ formatCurrency(cartTotalTax) }}</span>
					</div>
				</template>
				<div class="flex justify-between font-semibold text-lg pt-2 border-t">
					<span>{{ __("Total") }}</span>
					<span class="text-green-600">{{ formatCurrency(cartGrandTotal) }}</span>
				</div>
			</div>

			<div class="mt-4 space-y-3">
				<label class="flex items-center gap-3 cursor-pointer select-none">
					<Checkbox
						:checked="purchaseStore.receiveImmediately"
						@update:checked="purchaseStore.receiveImmediately = Boolean($event)"
					/>
					<span class="text-sm text-foreground leading-none">{{
						__("Receive stock immediately")
					}}</span>
				</label>
				<label class="flex items-center gap-3 cursor-pointer select-none">
					<Checkbox
						:checked="purchaseStore.createInvoice"
						@update:checked="purchaseStore.createInvoice = Boolean($event)"
					/>
					<span class="text-sm text-foreground leading-none">{{
						__("Create purchase invoice")
					}}</span>
				</label>
			</div>

			<div class="mt-4 flex gap-2 shrink-0">
				<Button @click="purchaseStore.clearCart()" variant="outline" class="flex-1">
					{{ __("Clear") }}
				</Button>
				<Button
					@click="purchaseStore.createPurchaseOrder()"
					class="flex-1"
					:disabled="!purchaseStore.canCreateOrder || purchaseStore.isProcessing"
				>
					{{ purchaseStore.isProcessing ? __("Processing...") : __("Create Order") }}
				</Button>
			</div>
		</div>
	</div>
</template>
