<script setup lang="ts">
import { usePurchaseStore, type PurchaseCartItem } from "@/stores/purchaseStore";
import { usePosStore } from "@/stores/posStore";
import { Trash2, ShoppingCart, Package, RefreshCw } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import __ from "@/lib/translate";

const purchaseStore = usePurchaseStore();
const posStore = usePosStore();

function formatCurrency(value: number): string {
    return `${posStore.currencySymbol}${value.toFixed(2)}`;
}

function getItemAmount(item: PurchaseCartItem): number {
    const gross = item.qty * item.rate;
    const disc = item.discount_percent || 0;
    return gross * (1 - disc / 100);
}
</script>

<template>
    <div class="h-full flex flex-col bg-card overflow-hidden">
        <!-- Header -->
        <div class="px-4 py-3 border-b border-border bg-muted flex items-center justify-between shrink-0">
            <h2 class="font-semibold flex items-center gap-2 text-foreground">
                <ShoppingCart class="w-5 h-5" />
                {{ __("Purchase Cart") }}
                <span class="text-sm font-normal text-muted-foreground">
                    ({{ purchaseStore.cartItems.length }} {{ __("items") }})
                </span>
            </h2>
            <Button v-if="!purchaseStore.isEmpty" @click="purchaseStore.refreshAllStock()" variant="outline" size="sm"
                :title="__('Refresh stock data')">
                <RefreshCw class="w-3.5 h-3.5 mr-1" />
                {{ __("Stock") }}
            </Button>
        </div>

        <!-- Empty State -->
        <div v-if="purchaseStore.isEmpty" class="flex-1 flex items-center justify-center p-8">
            <div class="text-center text-muted-foreground">
                <Package class="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                <p class="font-medium">{{ __("Cart is empty") }}</p>
                <p class="text-sm mt-1">{{ __("Add items from the list to start") }}</p>
            </div>
        </div>

        <!-- Cart Table -->
        <ScrollArea v-else class="flex-1 min-h-0">
            <div class="overflow-x-auto">
                <table class="w-full text-sm border-collapse min-w-[1100px]">
                    <thead class="sticky top-0 z-10 bg-muted border-b border-border">
                        <tr class="text-xs text-muted-foreground uppercase tracking-wider">
                            <th class="px-2 py-2 text-left w-8">#</th>
                            <th class="px-2 py-2 text-left min-w-[100px]">{{ __("Alias") }}</th>
                            <th class="px-2 py-2 text-left min-w-[120px]">{{ __("Item Name") }}</th>
                            <th class="px-2 py-2 text-right w-[80px]">{{ __("Stock") }}</th>
                            <th class="px-2 py-2 text-right w-[80px]">{{ __("Transit") }}</th>
                            <th class="px-2 py-2 text-right w-[70px]">{{ __("Loose") }}</th>
                            <th class="px-2 py-2 text-right w-[70px]">{{ __("Packs") }}</th>
                            <th class="px-2 py-2 text-right w-[80px]">{{ __("Rate") }}</th>
                            <th class="px-2 py-2 text-right w-[60px]">{{ __("Disc%") }}</th>
                            <th class="px-2 py-2 text-right w-[80px]">{{ __("Amount") }}</th>
                            <th class="px-2 py-2 text-left min-w-[90px]">{{ __("Generic") }}</th>
                            <th class="px-2 py-2 text-left w-[80px]">{{ __("Category") }}</th>
                            <th class="px-2 py-2 text-left w-[70px]">{{ __("Class") }}</th>
                            <th class="px-2 py-2 text-left w-[80px]">{{ __("Packing") }}</th>
                            <th class="px-2 py-2 text-right w-[60px]">{{ __("P.Units") }}</th>
                            <th class="px-2 py-2 w-8"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                        <tr v-for="(item, index) in purchaseStore.cartItems" :key="`${item.item_code}-${index}`"
                            class="hover:bg-muted/50 transition-colors">
                            <!-- Serial -->
                            <td class="px-2 py-1.5 text-muted-foreground text-center">{{ index + 1 }}</td>

                            <!-- Alias -->
                            <td class="px-2 py-1.5">
                                <Input v-model="item.custom_alias" class="h-7 text-xs" />
                            </td>

                            <!-- Item Name -->
                            <td class="px-2 py-1.5">
                                <div class="truncate text-foreground font-medium text-xs" :title="item.item_name">
                                    {{ item.item_name }}
                                </div>
                                <div class="text-[10px] text-muted-foreground truncate">{{ item.item_code }}</div>
                            </td>

                            <!-- Stock in Hand -->
                            <td class="px-2 py-1.5 text-right text-xs font-mono">
                                {{ (item.custom_stock_in_hand || 0).toFixed(0) }}
                            </td>

                            <!-- Transit Stock -->
                            <td class="px-2 py-1.5 text-right text-xs font-mono">
                                {{ (item.custom_transit_stock || 0).toFixed(0) }}
                            </td>

                            <!-- Required Loose -->
                            <td class="px-2 py-1.5">
                                <NumberInput :model-value="item.custom_required_loose || 0"
                                    @update:model-value="purchaseStore.updateCartItemLoose(index, $event)"
                                    :min="0" :precision="0" class="h-7 text-xs w-full" />
                            </td>

                            <!-- Required Packs -->
                            <td class="px-2 py-1.5">
                                <NumberInput :model-value="item.custom_required_packs || 0"
                                    @update:model-value="purchaseStore.updateCartItemPacks(index, $event)"
                                    :min="0" :precision="0" class="h-7 text-xs w-full" />
                            </td>

                            <!-- Rate -->
                            <td class="px-2 py-1.5">
                                <NumberInput :model-value="item.rate"
                                    @update:model-value="purchaseStore.updateCartItemRate(index, $event)"
                                    :min="0" :precision="2" class="h-7 text-xs w-full" />
                            </td>

                            <!-- Discount -->
                            <td class="px-2 py-1.5">
                                <NumberInput :model-value="item.discount_percent || 0"
                                    @update:model-value="purchaseStore.updateCartItemDiscount(index, $event)"
                                    :min="0" :max="100" :precision="1" class="h-7 text-xs w-full" />
                            </td>

                            <!-- Amount -->
                            <td class="px-2 py-1.5 text-right text-xs font-medium text-green-600 font-mono">
                                {{ formatCurrency(getItemAmount(item)) }}
                            </td>

                            <!-- Generic Item -->
                            <td class="px-2 py-1.5">
                                <Input v-model="item.custom_generic_item" class="h-7 text-xs" />
                            </td>

                            <!-- Category -->
                            <td class="px-2 py-1.5 text-xs text-muted-foreground truncate">
                                {{ item.custom_category || '-' }}
                            </td>

                            <!-- Class -->
                            <td class="px-2 py-1.5">
                                <Input v-model="item.custom_class" class="h-7 text-xs" />
                            </td>

                            <!-- Item Packing -->
                            <td class="px-2 py-1.5 text-xs text-muted-foreground truncate">
                                {{ item.custom_item_packing || '-' }}
                            </td>

                            <!-- Pack Units -->
                            <td class="px-2 py-1.5 text-right text-xs font-mono">
                                {{ (item.custom_pack_units || 0).toFixed(0) }}
                            </td>

                            <!-- Delete -->
                            <td class="px-1 py-1.5">
                                <Button @click="purchaseStore.removeFromCart(index)" variant="ghost" size="icon"
                                    class="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10">
                                    <Trash2 class="w-3 h-3" />
                                </Button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </ScrollArea>

        <!-- Footer -->
        <div v-if="!purchaseStore.isEmpty" class="border-t border-border bg-muted p-4 shrink-0">
            <div class="space-y-1.5">
                <div class="flex justify-between text-sm">
                    <span class="text-muted-foreground">{{ __("Total Qty") }}</span>
                    <span class="font-mono">{{ purchaseStore.cartItemCount }}</span>
                </div>
                <div class="flex justify-between font-semibold text-lg pt-2 border-t">
                    <span>{{ __("Total") }}</span>
                    <span class="text-green-600">{{ formatCurrency(purchaseStore.cartTotal) }}</span>
                </div>
            </div>

            <div class="mt-4 space-y-3">
                <label class="flex items-center gap-3 cursor-pointer select-none">
                    <Checkbox :checked="purchaseStore.receiveImmediately"
                        @update:checked="purchaseStore.receiveImmediately = Boolean($event)" />
                    <span class="text-sm text-foreground leading-none">{{ __("Receive stock immediately") }}</span>
                </label>
                <label class="flex items-center gap-3 cursor-pointer select-none">
                    <Checkbox :checked="purchaseStore.createInvoice"
                        @update:checked="purchaseStore.createInvoice = Boolean($event)" />
                    <span class="text-sm text-foreground leading-none">{{ __("Create purchase invoice") }}</span>
                </label>
            </div>

            <div class="mt-4 flex gap-2 shrink-0">
                <Button @click="purchaseStore.clearCart()" variant="outline" class="flex-1">
                    {{ __("Clear") }}
                </Button>
                <Button @click="purchaseStore.createPurchaseOrder()" class="flex-1"
                    :disabled="!purchaseStore.canCreateOrder || purchaseStore.isProcessing">
                    {{ purchaseStore.isProcessing ? __("Processing...") : __("Create Order") }}
                </Button>
            </div>
        </div>
    </div>
</template>
