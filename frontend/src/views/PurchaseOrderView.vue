<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from "vue";
import { useRouter } from "vue-router";
import { usePurchaseStore, type PurchaseCartItem } from "@/stores/purchaseStore";
import { Select, SelectTriggerStyled, SelectContentStyled, SelectItemStyled, SelectValue } from "@/components/ui/select";
import { usePosStore } from "@/stores/posStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Table } from "@/components/ui/table";
import type { TableColumn, TableRow } from "@/components/ui/table/types";
import {
    Search,
    Plus,
    RefreshCw,
    Package,
    Save,
    X,
    ShoppingCart,
    ScanBarcode,
    Loader2,
    FileText,
    Download,
    List,
    Send,
} from "lucide-vue-next";
import type { SearchItem, Supplier } from "@/types/pos.types";
import { showError, showSuccess } from "@/services/api";
import __ from "@/lib/translate";
import LinkField from "@/components/ui/link/LinkField.vue";
import { CreateItemDialog, CreateSupplierDialog } from "@/components/purchase";
import { TooltipWrapper } from "@/components/ui/tooltip";

const router = useRouter();
const purchaseStore = usePurchaseStore();
const posStore = usePosStore();

// Search states
const itemSearchTerm = ref("");
const supplierSearchTerm = ref("");
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const highlightedItemIndex = ref(-1);
const itemSearchInputRef = ref<HTMLInputElement | null>(null);

// Barcode scanner
const barcodeValue = ref("");
const isBarcodeScan = ref(false);
const barcodeFlash = ref<"" | "success" | "error">("");
let barcodeFlashTimer: ReturnType<typeof setTimeout> | null = null;

// New item / supplier dialog visibility
const showNewItemDialog = ref(false);
const showNewSupplierDialog = ref(false);

// PO Categories
const poCategories = [
    "Against Purchase Quotation",
    "Against Sale Order",
    "Projection Period",
    "Reorder Level",
];

// Computed
const grandTotal = computed(() => {
    return purchaseStore.cartItems.reduce((sum, item) => {
        const gross = item.qty * item.rate;
        const disc = item.discount_percent || 0;
        return sum + gross * (1 - disc / 100);
    }, 0);
});

const showCategoryButton = computed(() => {
    return purchaseStore.poCategory && purchaseStore.selectedSupplier;
});

function formatCurrency(value: number): string {
    return `${posStore.currencySymbol}${value.toFixed(2)}`;
}

function getItemAmount(item: PurchaseCartItem): number {
    const gross = item.qty * item.rate;
    const disc = item.discount_percent || 0;
    return gross * (1 - disc / 100);
}

// Item search
function onItemSearch(): void {
    if (debounceTimer.value) clearTimeout(debounceTimer.value);
    highlightedItemIndex.value = -1;
    debounceTimer.value = setTimeout(() => {
        purchaseStore.searchItems(itemSearchTerm.value);
    }, 300);
}

// Handle key navigation in item search list
function handleItemSearchKeyDown(event: KeyboardEvent): void {
    const items = purchaseStore.purchaseItems;
    if (items.length === 0) return;

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        highlightedItemIndex.value = Math.min(highlightedItemIndex.value + 1, items.length - 1);
        scrollHighlightedItemIntoView();
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        highlightedItemIndex.value = Math.max(highlightedItemIndex.value - 1, -1);
        if (highlightedItemIndex.value >= 0) {
            scrollHighlightedItemIntoView();
        }
    } else if (event.key === 'Enter') {
        event.preventDefault();
        if (highlightedItemIndex.value >= 0 && highlightedItemIndex.value < items.length) {
            addItem(items[highlightedItemIndex.value]);
            highlightedItemIndex.value = -1;
        }
    }
}

function scrollHighlightedItemIntoView(): void {
    nextTick(() => {
        const el = document.querySelector(`[data-purchase-item-index="${highlightedItemIndex.value}"]`);
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
}

// Barcode scan
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

// Supplier search
function onSupplierSearch(): void {
    if (debounceTimer.value) clearTimeout(debounceTimer.value);
    debounceTimer.value = setTimeout(() => {
        purchaseStore.searchSuppliers(supplierSearchTerm.value);
    }, 300);
}

function selectSupplier(supplier: Supplier): void {
    purchaseStore.selectSupplier(supplier);
}

// Add item to cart
function addItem(item: SearchItem): void {
    purchaseStore.addToCart(item, 1);
}

// Delete row
function deleteRow(index: number): void {
    purchaseStore.removeFromCart(index);
}

function deleteRows(indices: number[]): void {
    // indices come sorted descending from ChildTable
    for (const i of indices) {
        purchaseStore.removeFromCart(i);
    }
}

function duplicateRow(index: number): void {
    const src = purchaseStore.cartItems[index];
    if (src) {
        purchaseStore.cartItems.splice(index + 1, 0, { ...src });
    }
}

function moveRow(index: number, direction: -1 | 1): void {
    const target = index + direction;
    const items = purchaseStore.cartItems;
    if (target < 0 || target >= items.length) return;
    const temp = items[index];
    items[index] = items[target];
    items[target] = temp;
}

// Cell change handler for ChildTable — routes to store methods
function onPOCellChange(payload: { rowIndex: number; fieldname: string; value: any }): void {
    const { rowIndex, fieldname, value } = payload;
    switch (fieldname) {
        case "required_packs":
            purchaseStore.updateCartItemPacks(rowIndex, value);
            break;
        case "rate":
            purchaseStore.updateCartItemRate(rowIndex, value);
            break;
        case "discount_percent":
            purchaseStore.updateCartItemDiscount(rowIndex, value);
            break;
        case "uom": {
            const item = purchaseStore.cartItems[rowIndex];
            const uomData = item?.item_uoms?.find(u => u.uom === value);
            const cf = uomData?.conversion_factor || 1;
            purchaseStore.updateCartItemUOM(rowIndex, value, cf);
            break;
        }
        default: {
            const item = purchaseStore.cartItems[rowIndex];
            if (item) {
                (item as any)[fieldname] = value;
            }
        }
    }
}

// Get UOM options for item
function getUOMOptions(item: PurchaseCartItem): Array<{ uom: string; conversion_factor: number }> {
    if (item.item_uoms && item.item_uoms.length > 0) {
        return item.item_uoms;
    }
    return [{ uom: item.stock_uom, conversion_factor: 1 }];
}

const poColumns = computed<TableColumn[]>(() => [
    {
        fieldname: "item_name",
        label: "Item Name",
        type: "readonly" as const,
        width: "min-w-[140px]",
        align: "left" as const,
        editable: false,
        alwaysVisible: true,
        format: (val: any) => val || "-",
    },
    {
        fieldname: "stock_in_hand",
        label: "Stock",
        type: "readonly" as const,
        width: "w-[70px]",
        align: "right" as const,
        editable: false,
        format: (val: any) => (val || 0).toFixed(0),
    },
    {
        fieldname: "transit_stock",
        label: "Transit",
        type: "readonly" as const,
        width: "w-[70px]",
        align: "right" as const,
        editable: false,
        format: (val: any) => (val || 0).toFixed(0),
    },
    {
        fieldname: "required_packs",
        label: "Pack(s)",
        type: "number" as const,
        width: "w-[80px]",
        align: "center" as const,
        min: 0,
        precision: 0,
    },
    {
        fieldname: "uom",
        label: "UOM",
        type: "select" as const,
        width: "w-[100px]",
        align: "left" as const,
        options: (row: TableRow) => {
            const item = row as unknown as PurchaseCartItem;
            return getUOMOptions(item).map(u => ({
                label: `${u.uom} (${u.conversion_factor})`,
                value: u.uom,
            }));
        },
    },
    {
        fieldname: "pack_units",
        label: "Units",
        type: "readonly" as const,
        width: "w-[55px]",
        align: "right" as const,
        editable: false,
        format: (val: any) => (val || 0).toFixed(0),
    },
    {
        fieldname: "rate",
        label: "Price",
        type: "number" as const,
        width: "w-[90px]",
        align: "center" as const,
        min: 0,
        precision: 2,
    },
    {
        fieldname: "discount_percent",
        label: "Disc%",
        type: "number" as const,
        width: "w-[70px]",
        align: "center" as const,
        min: 0,
        max: 100,
        precision: 1,
    },
    {
        fieldname: "item_group",
        label: "Item Group",
        type: "readonly" as const,
        width: "w-[100px]",
        align: "left" as const,
        editable: false,
        format: (val: any) => val || "-",
    },
    {
        fieldname: "amount",
        label: "Amount",
        type: "readonly" as const,
        width: "w-[100px]",
        align: "right" as const,
        editable: false,
        cellClass: "text-green-600 font-medium",
        format: (_: any, row: any) => formatCurrency(getItemAmount(row as PurchaseCartItem)),
    },
]);

function onItemCreated(item: SearchItem, buyingPrice: number): void {
    purchaseStore.addToCart({ ...item, standard_rate: buyingPrice }, 1);
}

async function fetchCategoryItems(): Promise<void> {
    await purchaseStore.fetchCategoryItems();
}

async function saveDraft(): Promise<void> {
    await purchaseStore.saveDraft();
}

async function createOrder(): Promise<void> {
    await purchaseStore.createPurchaseOrder();
}

function clearForm(): void {
    purchaseStore.clearCart();
    purchaseStore.clearSupplier();
    purchaseStore.poCategory = "";
    purchaseStore.poType = "";
    purchaseStore.poDepartment = "";
    purchaseStore.poRemarks = "";
    purchaseStore.poZeroQty = "No";
    purchaseStore.currentDraftName = null;
}

function goToList(): void {
    router.push("/purchase-orders");
}

onMounted(() => {
    purchaseStore.init();
    purchaseStore.searchSuppliers();
    purchaseStore.searchItems();
});
</script>

<template>
    <div class="h-full flex flex-col bg-background overflow-hidden">
        <header class="bg-card border-b border-border px-4 py-3 shrink-0">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <ShoppingCart class="w-6 h-6 text-primary" />
                    <h1 class="text-xl font-semibold text-foreground">{{ __("Purchase Order") }}</h1>
                    <Badge v-if="purchaseStore.currentDraftName" variant="secondary" class="text-xs">
                        {{ __("Draft") }}
                    </Badge>
                </div>
                <div class="flex items-center gap-2">
                    <Button @click="goToList" variant="outline" size="sm">
                        <List class="w-4 h-4 mr-1" />
                        {{ __("View Orders") }}
                    </Button>
                    <Badge variant="secondary" class="gap-1.5">
                        {{ posStore.warehouse }}
                    </Badge>
                    <Badge variant="outline">
                        {{ posStore.companyName }}
                    </Badge>
                </div>
            </div>
        </header>

        <div class="bg-card border-b border-border px-4 py-3 shrink-0">
            <div class="grid grid-cols-8 gap-3">
                <div class="col-span-2">
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("Supplier") }} *</label>
                    <div class="flex gap-1">
                        <div class="flex-1">
                            <LinkField v-model="purchaseStore.selectedSupplier" doctype="Supplier"
                                class="h-8 text-sm" />
                        </div>
                        <Button @click="showNewSupplierDialog = true" variant="outline" size="icon" class="h-8 w-8 shrink-0">
                            <Plus class="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
                <div>
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("P/O Category") }}</label>
                    <Select v-model="purchaseStore.poCategory">
                        <SelectTriggerStyled class="h-8 w-[140px]">
                            <SelectValue placeholder="P/O Category" />
                        </SelectTriggerStyled>
                        <SelectContentStyled>
                            <SelectItemStyled v-for="cat in poCategories" :key="cat" :value="cat" >{{ cat }}</SelectItemStyled>
                        </SelectContentStyled>
                    </Select>
                </div>
                <div v-if="showCategoryButton">
                    <label class="text-xs text-muted-foreground mb-1 block">&nbsp;</label>
                    <Button @click="fetchCategoryItems" variant="secondary" size="sm" class="w-full h-8"
                        :disabled="purchaseStore.isFetchingCategoryItems">
                        <Download v-if="!purchaseStore.isFetchingCategoryItems" class="w-3.5 h-3.5 mr-1" />
                        <Loader2 v-else class="w-3.5 h-3.5 mr-1 animate-spin" />
                        {{ __("Get Items") }}
                    </Button>
                </div>
                <div v-else>
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("Zero Qty") }}</label>
                    <Select v-model="purchaseStore.poZeroQty">
                        <SelectTriggerStyled class="h-8 w-[140px]">
                            <SelectValue :placeholder="__('Zero Qty')" />
                        </SelectTriggerStyled>
                        <SelectContentStyled>
                            <SelectItemStyled value="No">{{ __("No") }}</SelectItemStyled>
                            <SelectItemStyled value="Yes">{{ __("Yes") }}</SelectItemStyled>
                        </SelectContentStyled>
                    </Select>
                </div>
                <div class="col-span-3">
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("Remarks") }}</label>
                    <Input v-model="purchaseStore.poRemarks" class="h-8 text-sm" />
                </div>
            </div>
        </div>

        <div class="flex-1 flex min-h-0 overflow-hidden">
            <div class="w-72 border-r border-border bg-card flex flex-col shrink-0 overflow-hidden">
                <div class="px-3 pt-3 pb-2 border-b border-border">
                    <div class="relative">
                        <ScanBarcode class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input v-model="barcodeValue" class="pl-8 h-8 text-sm" :class="{
                            'ring-2 ring-green-500/50 border-green-500': barcodeFlash === 'success',
                            'ring-2 ring-red-500/50 border-red-500': barcodeFlash === 'error'
                        }" :placeholder="__('Scan barcode...')" @keydown.enter.prevent="onBarcodeScan"
                            @paste="onBarcodePaste" />
                        <Loader2 v-if="isBarcodeScan"
                            class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin" />
                    </div>
                </div>

                <div class="p-3 border-b border-border">
                    <div class="flex gap-1">
                        <div class="relative flex-1">
                            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input v-model="itemSearchTerm" @input="onItemSearch"
                                @keydown="handleItemSearchKeyDown" :placeholder="__('Search items...')"
                                class="pl-8 h-8 text-sm" ref="itemSearchInputRef" />
                        </div>
                        <Button @click="showNewItemDialog = true" variant="outline" size="icon" class="h-8 w-8 shrink-0">
                            <Plus class="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                <ScrollArea class="flex-1 min-h-0">
                    <div v-if="purchaseStore.isLoadingItems" class="p-4 text-center text-muted-foreground text-sm">
                        {{ __("Loading...") }}
                    </div>
                    <div v-else-if="purchaseStore.purchaseItems.length === 0"
                        class="p-4 text-center text-muted-foreground">
                        <Package class="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
                        <p class="text-sm">{{ __("No items found") }}</p>
                    </div>
                    <div v-else class="divide-y divide-border">
                        <button v-for="(item, index) in purchaseStore.purchaseItems" :key="item.item_code" @click="addItem(item)"
                            :data-purchase-item-index="index"
                            class="w-full p-3 text-left hover:bg-muted transition-colors"
                            :class="{ 'bg-primary/10 ring-1 ring-primary/30': index === highlightedItemIndex }">
                            <p class="font-medium text-sm truncate text-foreground">{{ item.item_name }}</p>
                            <p class="text-xs text-muted-foreground truncate">{{ item.item_code }}</p>
                            <div class="flex gap-2 mt-1 text-xs text-muted-foreground/70">
                                <span>{{ item.stock_uom }}</span>
                                <span v-if="item.standard_rate">{{ formatCurrency(item.standard_rate) }}</span>
                            </div>
                        </button>
                    </div>
                </ScrollArea>
            </div>

            <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
                <Table
                    :rows="purchaseStore.cartItems"
                    :columns="poColumns"
                    label="Items"
                    min-width="1200px"
                    :show-add-row="false"
                    :show-checkboxes="true"
                    :show-row-numbers="true"
                    :show-delete-button="true"
                    :keyboard-navigation="true"
                    :allow-reorder="true"
                    :allow-duplicate="true"
                    :show-column-settings="true"
                    :highlight-new-rows="true"
                    empty-message="No items added"
                    empty-description="Search and add items from the left panel"
                    @delete-row="deleteRow"
                    @delete-rows="deleteRows"
                    @duplicate-row="duplicateRow"
                    @move-row="moveRow"
                    @cell-change="onPOCellChange"
                    class="flex-1 min-h-0 flex flex-col"
                >
                    <template #toolbar>
                        <Button v-if="purchaseStore.cartItems.length > 0" @click="purchaseStore.refreshAllStock()"
                            variant="outline" size="sm" class="h-7 text-xs">
                            <RefreshCw class="w-3.5 h-3.5 mr-1" />
                            {{ __("Refresh Stock") }}
                        </Button>
                    </template>

                    <template #cell-item_name="{ row }">
                        <TooltipWrapper :content="row.item_name">
                        <div class="truncate font-medium text-xs">
                            {{ row.item_name }}
                        </div>
                        </TooltipWrapper>
                        <div class="text-[10px] text-muted-foreground truncate">{{ row.item_code }}</div>
                    </template>
                </Table>

                <div class="px-4 py-3 border-t border-border bg-muted shrink-0">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-6 text-sm">
                            <span class="text-muted-foreground">{{ __("Items") }}: <strong>{{
                                purchaseStore.cartItems.length }}</strong></span>
                            <span class="text-muted-foreground">{{ __("Total Qty") }}: <strong>{{
                                purchaseStore.cartItemCount }}</strong></span>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="text-right">
                                <span class="text-sm text-muted-foreground">{{ __("Grand Total") }}</span>
                                <div class="text-xl font-bold text-green-600">{{ formatCurrency(grandTotal) }}</div>
                            </div>
                            <div class="flex gap-2">
                                <Button @click="clearForm" variant="outline">
                                    <X class="w-4 h-4 mr-1" />
                                    {{ __("Clear") }}
                                </Button>
                                <Button @click="saveDraft" variant="secondary"
                                    :disabled="purchaseStore.cartItems.length === 0 || purchaseStore.isDraftSaving">
                                    <FileText class="w-4 h-4 mr-1" />
                                    {{ purchaseStore.isDraftSaving ? __("Saving...") : __("Save Draft") }}
                                </Button>
                                <Button @click="createOrder()"
                                    :disabled="!purchaseStore.canCreateOrder || purchaseStore.isProcessing">
                                    <Send class="w-4 h-4 mr-1" />
                                    {{ purchaseStore.isProcessing ? __("Creating...") : __("Submit") }}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <CreateItemDialog
            v-model:open="showNewItemDialog"
            :initial-name="itemSearchTerm"
            @created="onItemCreated"
        />

        <CreateSupplierDialog
            v-model:open="showNewSupplierDialog"
            :initial-name="supplierSearchTerm"
        />
    </div>
</template>


