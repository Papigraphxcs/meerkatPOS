<script setup lang="ts">
/**
 * Purchase Cart Component
 * Displays and manages items in the purchase cart
 */
import { usePurchaseStore, type PurchaseCartItem } from "@/stores/purchaseStore";
import { usePosStore } from "@/stores/posStore";
import { Minus, Plus, Trash2, ShoppingCart, Package } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

const purchaseStore = usePurchaseStore();
const posStore = usePosStore();

function formatCurrency(value: number): string {
    return `${posStore.currencySymbol}${value.toFixed(2)}`;
}

function incrementQty(index: number): void {
    const item = purchaseStore.cartItems[index];
    purchaseStore.updateCartItemQty(index, item.qty + 1);
}

function decrementQty(index: number): void {
    const item = purchaseStore.cartItems[index];
    if (item.qty > 1) {
        purchaseStore.updateCartItemQty(index, item.qty - 1);
    }
}

function updateQty(index: number, value: number): void {
    if (value > 0) {
        purchaseStore.updateCartItemQty(index, value);
    }
}

function updateRate(index: number, value: number): void {
    if (value >= 0) {
        purchaseStore.updateCartItemRate(index, value);
    }
}

function getItemTotal(item: PurchaseCartItem): number {
    return item.qty * item.rate;
}
</script>

<template>
    <div class="h-full flex flex-col bg-card overflow-hidden">
        <!-- Header -->
        <div class="p-4 border-b border-border bg-muted">
            <div class="flex items-center justify-between">
                <h2 class="font-semibold flex items-center gap-2 text-foreground">
                    <ShoppingCart class="w-5 h-5" />
                    Purchase Cart
                </h2>
                <span class="text-sm text-muted-foreground">
                    {{ purchaseStore.cartItemCount }} item{{ purchaseStore.cartItemCount !== 1 ? 's' : '' }}
                </span>
            </div>
        </div>

        <!-- Cart Items -->
        <ScrollArea class="flex-1 min-h-0">
            <div v-if="purchaseStore.isEmpty" class="p-8 text-center text-muted-foreground">
                <Package class="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                <p class="font-medium">Cart is empty</p>
                <p class="text-sm mt-1">Add items from the list to start</p>
            </div>

            <div v-else class="divide-y divide-border">
                <div v-for="(item, index) in purchaseStore.cartItems" :key="`${item.item_code}-${index}`" class="p-4">
                    <div class="flex items-start justify-between gap-3 mb-3">
                        <div class="flex-1 min-w-0">
                            <p class="font-medium truncate">{{ item.item_name }}</p>
                            <p class="text-sm text-muted-foreground truncate">{{ item.item_code }}</p>
                        </div>
                        <Button @click="purchaseStore.removeFromCart(index)" variant="ghost" size="icon"
                            class="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0">
                            <Trash2 class="w-4 h-4" />
                        </Button>
                    </div>

                    <div class="grid grid-cols-4 gap-3">
                        <!-- Quantity -->
                        <div>
                            <label class="text-xs text-muted-foreground mb-1 block">Qty</label>
                            <div class="flex items-center gap-1">
                                <Button @click="decrementQty(index)" variant="outline" size="icon" class="h-8 w-8"
                                    :disabled="item.qty <= 1">
                                    <Minus class="w-3 h-3" />
                                </Button>
                                <NumberInput
                                    :model-value="item.qty"
                                    @update:model-value="updateQty(index, $event)"
                                    :min="1"
                                    :precision="2"
                                    class="h-8 w-16 text-center"
                                />
                                <Button @click="incrementQty(index)" variant="outline" size="icon" class="h-8 w-8">
                                    <Plus class="w-3 h-3" />
                                </Button>
                            </div>
                        </div>

                        <!-- Rate -->
                        <div>
                            <label class="text-xs text-muted-foreground mb-1 block">Rate</label>
                            <NumberInput
                                :model-value="item.rate"
                                @update:model-value="updateRate(index, $event)"
                                :min="0"
                                :precision="2"
                                class="h-8"
                            />
                        </div>

                        <!-- Amount -->
                        <div>
                            <label class="text-xs text-muted-foreground mb-1 block">Amount</label>
                            <div class="h-8 flex items-center font-medium text-green-600">
                                {{ formatCurrency(getItemTotal(item)) }}
                            </div>
                        </div>
                    </div>

                    <div class="mt-2 text-xs text-muted-foreground">
                        {{ item.uom }} | Warehouse: {{ item.warehouse || 'Default' }}
                    </div>
                </div>
            </div>
        </ScrollArea>

        <!-- Cart Summary -->
        <div v-if="!purchaseStore.isEmpty" class="border-t border-border bg-muted p-4">
            <div class="space-y-2">
                <div class="flex justify-between text-sm">
                    <span class="text-muted-foreground">Subtotal</span>
                    <span>{{ formatCurrency(purchaseStore.cartTotal) }}</span>
                </div>
                <div class="flex justify-between font-semibold text-lg pt-2 border-t">
                    <span>Total</span>
                    <span class="text-green-600">{{ formatCurrency(purchaseStore.cartTotal) }}</span>
                </div>
            </div>

            <!-- Options -->
            <div class="mt-4 space-y-3">
                <label class="flex items-center gap-3 cursor-pointer select-none">
                    <Checkbox
                        :checked="purchaseStore.receiveImmediately"
                        @update:checked="purchaseStore.receiveImmediately = Boolean($event)"
                    />
                    <span class="text-sm text-foreground leading-none">Receive stock immediately</span>
                </label>
                <label class="flex items-center gap-3 cursor-pointer select-none">
                    <Checkbox
                        :checked="purchaseStore.createInvoice"
                        @update:checked="purchaseStore.createInvoice = Boolean($event)"
                    />
                    <span class="text-sm text-foreground leading-none">Create purchase invoice</span>
                </label>
            </div>

            <!-- Action Buttons -->
            <div class="mt-4 flex gap-2 shrink-0">
                <Button @click="purchaseStore.clearCart()" variant="outline" class="flex-1">
                    Clear
                </Button>
                <Button @click="purchaseStore.createPurchaseOrder()" class="flex-1"
                    :disabled="!purchaseStore.canCreateOrder || purchaseStore.isProcessing">
                    {{ purchaseStore.isProcessing ? "Processing..." : "Create Order" }}
                </Button>
            </div>
        </div>
    </div>
</template>
