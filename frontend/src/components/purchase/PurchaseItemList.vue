<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { usePurchaseStore } from "@/stores/purchaseStore";
import { usePosStore } from "@/stores/posStore";
import { Search, Plus, Package, ShoppingCart, ScanBarcode, Loader2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import type { SearchItem } from "@/types/pos.types";
import { showError } from "@/services/api";
import __ from "@/lib/translate";

const purchaseStore = usePurchaseStore();
const posStore = usePosStore();

const searchTerm = ref("");
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null);

const barcodeValue = ref("");
const isBarcodeScan = ref(false);
const barcodeFlash = ref<"" | "success" | "error">("");
let barcodeFlashTimer: ReturnType<typeof setTimeout> | null = null;

const newItem = ref({
    item_name: "",
    item_code: "",
    item_group: "",
    stock_uom: "Nos",
    barcode: "",
    buying_price: 0,
    selling_price: 0,
});

const isCreating = ref(false);

const standardUOMs = [
    "Nos",
    "Unit",
    "Kg",
    "Gram",
    "Litre",
    "mL",
    "Box",
    "Pack",
    "Dozen",
    "Pair",
    "Set",
    "Meter",
    "Feet",
];

function onSearchInput(): void {
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value);
    }

    debounceTimer.value = setTimeout(() => {
        purchaseStore.searchItems(searchTerm.value);
    }, 300);
}

async function onBarcodeScan(): Promise<void> {
    const code = barcodeValue.value.trim();
    if (!code) return;

    isBarcodeScan.value = true;
    try {
        const result = await purchaseStore.searchByBarcode(code);
        if (result) {
            purchaseStore.addToCart(result, 1);
            barcodeFlash.value = "success";
            barcodeValue.value = "";
        } else {
            showError(`${__("Item not found for barcode")}: ${code}`);
            barcodeFlash.value = "error";
        }
    } catch {
        barcodeFlash.value = "error";
    } finally {
        isBarcodeScan.value = false;
        if (barcodeFlashTimer) clearTimeout(barcodeFlashTimer);
        barcodeFlashTimer = setTimeout(() => { barcodeFlash.value = ""; }, 600);
    }
}

function onBarcodePaste(): void {
    setTimeout(() => {
        const code = barcodeValue.value.trim();
        if (code) onBarcodeScan();
    }, 50);
}

function addItem(item: SearchItem): void {
    purchaseStore.addToCart(item, 1);
}

function openNewItemForm(): void {
    newItem.value = {
        item_name: searchTerm.value,
        item_code: "",
        item_group: "",
        stock_uom: "Nos",
        barcode: "",
        buying_price: 0,
        selling_price: 0,
    };
    purchaseStore.showNewItemForm = true;
}

async function handleCreateItem(): Promise<void> {
    if (!newItem.value.item_name.trim()) return;

    isCreating.value = true;
    try {
        const created = await purchaseStore.createItem({
            item_name: newItem.value.item_name,
            item_code: newItem.value.item_code || undefined,
            item_group: newItem.value.item_group || undefined,
            stock_uom: newItem.value.stock_uom,
            barcode: newItem.value.barcode || undefined,
            buying_price: newItem.value.buying_price || undefined,
            selling_price: newItem.value.selling_price || undefined,
        });

        if (created) {
            purchaseStore.addToCart({
                ...created,
                standard_rate: newItem.value.buying_price,
            }, 1);
        }
    } finally {
        isCreating.value = false;
    }
}

function formatCurrency(value: number): string {
    return `${posStore.currencySymbol}${value.toFixed(2)}`;
}

onMounted(() => {
    purchaseStore.searchItems();
});

onUnmounted(() => {
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value);
    }
    if (barcodeFlashTimer) {
        clearTimeout(barcodeFlashTimer);
    }
});
</script>

<template>
    <div class="h-full flex flex-col overflow-hidden">
        <div class="px-4 pt-4 pb-2 border-b border-border bg-card">
            <div class="relative flex items-center">
                <ScanBarcode class="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                    v-model="barcodeValue"
                    class="pl-9 pr-9 h-9 text-sm"
                    :class="{
                        'ring-2 ring-green-500/50 border-green-500': barcodeFlash === 'success',
                        'ring-2 ring-red-500/50 border-red-500': barcodeFlash === 'error'
                    }"
                    :placeholder="__('Scan barcode to add...')"
                    autocomplete="off"
                    @keydown.enter.prevent="onBarcodeScan"
                    @paste="onBarcodePaste"
                />
                <Loader2
                    v-if="isBarcodeScan"
                    class="absolute right-3 w-4 h-4 text-muted-foreground animate-spin"
                />
            </div>
        </div>

        <div class="p-4 border-b border-border bg-muted">
            <div class="flex gap-2">
                <div class="relative flex-1">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input v-model="searchTerm" type="text" :placeholder="__('Search items by name, code or barcode...')"
                        @input="onSearchInput" class="pl-10" />
                </div>
                <Button @click="openNewItemForm" variant="outline" size="icon" :title="__('Create new item')">
                    <Plus class="w-4 h-4" />
                </Button>
            </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto purchase-scroll">
            <div v-if="purchaseStore.isLoadingItems" class="p-4 text-center text-muted-foreground">
                {{ __("Loading items...") }}
            </div>
            <div v-else-if="purchaseStore.purchaseItems.length === 0" class="p-8 text-center text-muted-foreground">
                <Package class="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
                <p>{{ __("No items found") }}</p>
                <Button @click="openNewItemForm" variant="link" class="mt-2">
                    <Plus class="w-4 h-4 mr-1" />
                    {{ __("Create new item") }}
                </Button>
            </div>
            <div v-else class="divide-y divide-border">
                <div v-for="item in purchaseStore.purchaseItems" :key="item.item_code"
                    class="p-4 hover:bg-muted transition-colors flex items-center gap-4">
                    <div class="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <Package class="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-medium truncate">{{ item.item_name }}</p>
                        <p class="text-sm text-muted-foreground truncate">{{ item.item_code }}</p>
                        <div class="flex gap-4 mt-1 text-xs text-muted-foreground/70">
                            <span>{{ __("UOM") }}: {{ item.stock_uom }}</span>
                            <span v-if="item.standard_rate">{{ __("Rate") }}: {{ formatCurrency(item.standard_rate) }}</span>
                        </div>
                    </div>
                    <Button @click="addItem(item)" size="sm" variant="outline">
                        <ShoppingCart class="w-4 h-4 mr-1" />
                        {{ __("Add") }}
                    </Button>
                </div>
            </div>
        </div>

        <Dialog v-model:open="purchaseStore.showNewItemForm">
            <DialogContent class="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{{ __("Create New Item") }}</DialogTitle>
                    <DialogDescription>
                        {{ __("Add a new item to the inventory") }}
                    </DialogDescription>
                </DialogHeader>

                <form @submit.prevent="handleCreateItem" class="space-y-4 mt-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="col-span-2">
                            <label class="text-sm font-medium mb-1 block text-foreground">{{ __("Item Name") }} *</label>
                            <Input v-model="newItem.item_name" :placeholder="__('Enter item name')" required />
                        </div>

                        <div>
                            <label class="text-sm font-medium mb-1 block text-foreground">{{ __("Item Code") }}</label>
                            <Input v-model="newItem.item_code" :placeholder="__('Auto-generated if empty')" />
                        </div>

                        <div>
                            <label class="text-sm font-medium mb-1 block text-foreground">{{ __("Barcode") }}</label>
                            <Input v-model="newItem.barcode" :placeholder="__('Barcode (optional)')" />
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="text-sm font-medium mb-1 block text-foreground">{{ __("Stock UOM") }} *</label>
                            <select v-model="newItem.stock_uom"
                                class="w-full px-3 py-2 border border-border rounded-md text-sm bg-background text-foreground"
                                required>
                                <option v-for="uom in standardUOMs" :key="uom" :value="uom">
                                    {{ uom }}
                                </option>
                            </select>
                        </div>

                        <div>
                            <label class="text-sm font-medium mb-1 block text-foreground">{{ __("Item Group") }}</label>
                            <Input v-model="newItem.item_group" :placeholder="__('Item group')" />
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="text-sm font-medium mb-1 block text-foreground">{{ __("Buying Price") }}</label>
                            <NumberInput v-model="newItem.buying_price" :min="0" :precision="2"
                                placeholder="0.00" />
                        </div>

                        <div>
                            <label class="text-sm font-medium mb-1 block text-foreground">{{ __("Selling Price") }}</label>
                            <NumberInput v-model="newItem.selling_price" :min="0" :precision="2"
                                placeholder="0.00" />
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" @click="purchaseStore.showNewItemForm = false">
                            Cancel
                        </Button>
                        <Button type="submit" :disabled="isCreating || !newItem.item_name.trim()">
                            {{ isCreating ? __("Creating...") : __("Create Item") }}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    </div>
</template>
