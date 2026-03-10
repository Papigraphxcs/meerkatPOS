<script setup lang="ts">
import { ref, onMounted, computed, nextTick, watch } from "vue";
import { useRouter } from "vue-router";
import { usePurchaseStore, type PurchaseCartItem } from "@/stores/purchaseStore";
import { usePosStore } from "@/stores/posStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
    Search,
    Plus,
    Trash2,
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import type { SearchItem, Supplier } from "@/types/pos.types";
import { showError, showSuccess } from "@/services/api";
import __ from "@/lib/translate";
import LinkField from "@/components/ui/link/LinkField.vue";

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

// New item dialog
const showNewItemDialog = ref(false);
const newItem = ref({
    item_name: "",
    item_code: "",
    item_group: "",
    stock_uom: "Nos",
    barcode: "",
    buying_price: 0,
    selling_price: 0,
});
const isCreatingItem = ref(false);

// New supplier dialog
const showNewSupplierDialog = ref(false);
const newSupplier = ref({
    supplier_name: "",
    supplier_type: "Company",
    mobile_no: "",
    email_id: "",
    tax_id: "",
});
const isCreatingSupplier = ref(false);

// Table refs for keyboard navigation
const tableRef = ref<HTMLElement | null>(null);
const inputRefs = ref<Map<string, HTMLInputElement>>(new Map());

// PO Categories
const poCategories = [
    "",
    "Against Purchase Quotation",
    "Against Sale Order",
    "Projection Period",
    "Reorder Level",
];

const standardUOMs = ["Nos", "Unit", "Kg", "Gram", "Litre", "mL", "Box", "Pack", "Dozen", "Pair", "Set", "Meter", "Feet"];

// Editable column config for keyboard navigation
const editableColumns = ["packs", "uom", "price", "discount"] as const;
type EditableColumn = typeof editableColumns[number];

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

// Register input ref for keyboard navigation
function registerInput(rowIndex: number, column: EditableColumn, el: HTMLInputElement | null): void {
    const key = `${rowIndex}-${column}`;
    if (el) {
        inputRefs.value.set(key, el);
    } else {
        inputRefs.value.delete(key);
    }
}

// Keyboard navigation handler
function handleKeyDown(event: KeyboardEvent, rowIndex: number, column: EditableColumn): void {
    const totalRows = purchaseStore.cartItems.length;
    const colIndex = editableColumns.indexOf(column);

    let newRowIndex = rowIndex;
    let newColIndex = colIndex;

    switch (event.key) {
        case "ArrowUp":
            event.preventDefault();
            newRowIndex = Math.max(0, rowIndex - 1);
            break;
        case "ArrowDown":
            event.preventDefault();
            newRowIndex = Math.min(totalRows - 1, rowIndex + 1);
            break;
        case "ArrowLeft":
            if ((event.target as HTMLInputElement)?.selectionStart === 0) {
                event.preventDefault();
                newColIndex = Math.max(0, colIndex - 1);
            }
            break;
        case "ArrowRight":
            const input = event.target as HTMLInputElement;
            if (input?.selectionStart === input?.value?.length) {
                event.preventDefault();
                newColIndex = Math.min(editableColumns.length - 1, colIndex + 1);
            }
            break;
        case "Enter":
            event.preventDefault();
            newRowIndex = Math.min(totalRows - 1, rowIndex + 1);
            break;
        case "Tab":
            // Let default behavior handle tab
            return;
        default:
            return;
    }

    // Focus the new cell
    if (newRowIndex !== rowIndex || newColIndex !== colIndex) {
        const newColumn = editableColumns[newColIndex];
        const key = `${newRowIndex}-${newColumn}`;
        nextTick(() => {
            const input = inputRefs.value.get(key);
            if (input) {
                input.focus();
                input.select();
            }
        });
    }
}

// Focus and scroll to last added item
watch(() => purchaseStore.cartItems.length, (newLength, oldLength) => {
    if (newLength > oldLength) {
        // New item added, focus its packs input and scroll into view
        nextTick(() => {
            const lastIndex = newLength - 1;
            const key = `${lastIndex}-packs`;
            const input = inputRefs.value.get(key);
            if (input) {
                input.focus();
                input.select();
            }

            // Scroll to the new row and highlight it
            const rows = tableRef.value?.querySelectorAll('.po-row');
            const lastRow = rows?.[lastIndex] as HTMLElement | null;
            if (lastRow) {
                lastRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                lastRow.classList.add('ring-2', 'ring-primary/50');
                setTimeout(() => {
                    lastRow.classList.remove('ring-2', 'ring-primary/50');
                }, 800);
            }
        });
    }
});

// When existing item qty is updated (same length, different lastAddedIndex), scroll & highlight
watch(() => purchaseStore.lastAddedIndex, (index) => {
    if (index < 0 || index >= purchaseStore.cartItems.length) return;
    // Only highlight if length didn't change (handled above)
    nextTick(() => {
        const rows = tableRef.value?.querySelectorAll('.po-row');
        const row = rows?.[index] as HTMLElement | null;
        if (row) {
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            row.classList.add('ring-2', 'ring-primary/50');
            setTimeout(() => {
                row.classList.remove('ring-2', 'ring-primary/50');
            }, 800);
        }
    });
});

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

// UOM change handler
function handleUOMChange(index: number, uomValue: string): void {
    const item = purchaseStore.cartItems[index];
    if (!item) return;

    // Find conversion factor from item_uoms
    const uomData = item.item_uoms?.find(u => u.uom === uomValue);
    const conversionFactor = uomData?.conversion_factor || 1;

    purchaseStore.updateCartItemUOM(index, uomValue, conversionFactor);
}

// Get UOM options for item
function getUOMOptions(item: PurchaseCartItem): Array<{ uom: string; conversion_factor: number }> {
    if (item.item_uoms && item.item_uoms.length > 0) {
        return item.item_uoms;
    }
    return [{ uom: item.stock_uom, conversion_factor: 1 }];
}

// Create new item
function openNewItemDialog(): void {
    newItem.value = {
        item_name: itemSearchTerm.value,
        item_code: "",
        item_group: "",
        stock_uom: "Nos",
        barcode: "",
        buying_price: 0,
        selling_price: 0,
    };
    showNewItemDialog.value = true;
}

async function handleCreateItem(): Promise<void> {
    if (!newItem.value.item_name.trim()) return;
    isCreatingItem.value = true;
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
            purchaseStore.addToCart({ ...created, standard_rate: newItem.value.buying_price }, 1);
            showNewItemDialog.value = false;
        }
    } finally {
        isCreatingItem.value = false;
    }
}

// Create new supplier
function openNewSupplierDialog(): void {
    newSupplier.value = {
        supplier_name: supplierSearchTerm.value,
        supplier_type: "Company",
        mobile_no: "",
        email_id: "",
        tax_id: "",
    };
    showNewSupplierDialog.value = true;
}

async function handleCreateSupplier(): Promise<void> {
    if (!newSupplier.value.supplier_name.trim()) return;
    isCreatingSupplier.value = true;
    try {
        await purchaseStore.createSupplier(newSupplier.value);
        showNewSupplierDialog.value = false;
    } finally {
        isCreatingSupplier.value = false;
    }
}

// Fetch items by PO Category
async function fetchCategoryItems(): Promise<void> {
    await purchaseStore.fetchCategoryItems();
}

// Draft operations
function saveDraft(): void {
    purchaseStore.saveDraft();
}

// Create PO
async function createOrder(submit = true): Promise<void> {
    // Clear draft after successful creation
    const draftId = purchaseStore.currentDraftId;
    const result = await purchaseStore.createPurchaseOrder();
    if (result && draftId) {
        purchaseStore.deleteDraft(draftId);
    }
}

function clearForm(): void {
    purchaseStore.clearCart();
    purchaseStore.clearSupplier();
    purchaseStore.poCategory = "";
    purchaseStore.poType = "";
    purchaseStore.poDepartment = "";
    purchaseStore.poRemarks = "";
    purchaseStore.poZeroQty = "No";
    purchaseStore.currentDraftId = null;
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
                    <Badge v-if="purchaseStore.currentDraftId" variant="secondary" class="text-xs">
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

        <!-- PO Header Fields -->
        <div class="bg-card border-b border-border px-4 py-3 shrink-0">
            <div class="grid grid-cols-8 gap-3">
                <div class="col-span-2">
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("Supplier") }} *</label>
                    <div class="flex gap-1">
                        <div class="flex-1">
                            <LinkField v-model="purchaseStore.selectedSupplier" doctype="Supplier"
                                class="h-8 text-sm" />
                        </div>
                        <Button @click="openNewSupplierDialog" variant="outline" size="icon" class="h-8 w-8 shrink-0">
                            <Plus class="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
                <div>
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("P/O Category") }}</label>
                    <select v-model="purchaseStore.poCategory"
                        class="w-full h-8 px-2 border border-border rounded-md text-sm bg-background text-foreground">
                        <option v-for="cat in poCategories" :key="cat" :value="cat">{{ cat || __("-- Select --") }}
                        </option>
                    </select>
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
                    <select v-model="purchaseStore.poZeroQty"
                        class="w-full h-8 px-2 border border-border rounded-md text-sm bg-background text-foreground">
                        <option value="No">{{ __("No") }}</option>
                        <option value="Yes">{{ __("Yes") }}</option>
                    </select>
                </div>
                <div class="col-span-3">
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("Remarks") }}</label>
                    <Input v-model="purchaseStore.poRemarks" class="h-8 text-sm" />
                </div>
            </div>
        </div>

        <!-- Main Content -->
        <div class="flex-1 flex min-h-0 overflow-hidden">
            <!-- Left: Item Search Panel -->
            <div class="w-72 border-r border-border bg-card flex flex-col shrink-0 overflow-hidden">
                <!-- Barcode Scanner -->
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

                <!-- Item Search -->
                <div class="p-3 border-b border-border">
                    <div class="flex gap-1">
                        <div class="relative flex-1">
                            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input v-model="itemSearchTerm" @input="onItemSearch"
                                @keydown="handleItemSearchKeyDown" :placeholder="__('Search items...')"
                                class="pl-8 h-8 text-sm" ref="itemSearchInputRef" />
                        </div>
                        <Button @click="openNewItemDialog" variant="outline" size="icon" class="h-8 w-8 shrink-0">
                            <Plus class="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                <!-- Item List -->
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

            <!-- Right: Cart Grid -->
            <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
                <!-- Toolbar -->
                <div class="px-4 py-2 border-b border-border bg-muted flex items-center justify-between shrink-0">
                    <span class="text-sm font-medium text-foreground">
                        {{ __("Items") }} ({{ purchaseStore.cartItems.length }})
                    </span>
                    <Button v-if="purchaseStore.cartItems.length > 0" @click="purchaseStore.refreshAllStock()"
                        variant="outline" size="sm">
                        <RefreshCw class="w-3.5 h-3.5 mr-1" />
                        {{ __("Refresh Stock") }}
                    </Button>
                </div>

                <!-- Grid Table with Sticky Headers and Frozen Amount Column -->
                <div class="flex-1 min-h-0 overflow-hidden" ref="tableRef">
                    <div v-if="purchaseStore.cartItems.length === 0"
                        class="flex items-center justify-center h-full p-8">
                        <div class="text-center text-muted-foreground">
                            <Package class="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                            <p class="font-medium">{{ __("No items added") }}</p>
                            <p class="text-sm mt-1">{{ __("Search and add items from the left panel") }}</p>
                        </div>
                    </div>
                    <div v-else class="h-full overflow-auto po-table-container">
                        <table class="w-full text-sm border-collapse min-w-[1200px] po-table">
                            <thead class="po-table-header">
                                <tr class="text-xs text-muted-foreground uppercase tracking-wider">
                                    <th class="po-cell px-2 py-2 text-center w-10 bg-muted">{{ __("S#") }}</th>
                                    <th class="po-cell px-2 py-2 text-left min-w-[140px] bg-muted">{{ __("Item Name") }}
                                    </th>
                                    <th class="po-cell px-2 py-2 text-right w-[70px] bg-muted">{{ __("Stock") }}</th>
                                    <th class="po-cell px-2 py-2 text-right w-[70px] bg-muted">{{ __("Transit") }}</th>
                                    <th class="po-cell px-2 py-2 text-center w-[80px] bg-muted">{{ __("Pack(s)") }}</th>
                                    <th class="po-cell px-2 py-2 text-left w-[100px] bg-muted">{{ __("UOM") }}</th>
                                    <th class="po-cell px-2 py-2 text-right w-[55px] bg-muted">{{ __("Units") }}</th>
                                    <th class="po-cell px-2 py-2 text-center w-[90px] bg-muted">{{ __("Price") }}</th>
                                    <th class="po-cell px-2 py-2 text-center w-[70px] bg-muted">{{ __("Disc%") }}</th>
                                    <th class="po-cell px-2 py-2 text-left w-[100px] bg-muted">{{ __("Item Group") }}
                                    </th>
                                    <th class="po-cell-frozen px-2 py-2 text-right w-[100px] bg-muted">{{ __("Amount")
                                        }}</th>
                                    <th class="po-cell-frozen-last px-2 py-2 w-10 bg-muted"></th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-border">
                                <tr v-for="(item, index) in purchaseStore.cartItems" :key="`${item.item_code}-${index}`"
                                    class="hover:bg-muted/50 transition-colors po-row">
                                    <td class="po-cell px-2 py-1 text-center text-muted-foreground">{{ index + 1 }}</td>
                                    <td class="po-cell px-2 py-1">
                                        <div class="truncate font-medium text-xs" :title="item.item_name">
                                            {{ item.item_name }}
                                        </div>
                                        <div class="text-[10px] text-muted-foreground truncate">{{ item.item_code }}
                                        </div>
                                    </td>
                                    <td class="po-cell px-2 py-1 text-right text-xs font-mono">
                                        {{ (item.stock_in_hand || 0).toFixed(0) }}
                                    </td>
                                    <td class="po-cell px-2 py-1 text-right text-xs font-mono">
                                        {{ (item.transit_stock || 0).toFixed(0) }}
                                    </td>
                                    <td class="po-cell px-2 py-1">
                                        <NumberInput :model-value="item.required_packs || 0"
                                            @update:model-value="purchaseStore.updateCartItemPacks(index, $event)"
                                            :min="0" :precision="0" class="h-7 text-xs w-full"
                                            @keydown="handleKeyDown($event, index, 'packs')"
                                            :ref="(el: any) => registerInput(index, 'packs', el?.$el?.querySelector('input'))" />
                                    </td>
                                    <td class="po-cell px-2 py-1">
                                        <select :value="item.uom"
                                            @change="handleUOMChange(index, ($event.target as HTMLSelectElement).value)"
                                            class="h-7 w-full px-1 border border-border rounded text-xs bg-background"
                                            @keydown="handleKeyDown($event, index, 'uom')"
                                            :ref="(el: any) => registerInput(index, 'uom', el)">
                                            <option v-for="uomOpt in getUOMOptions(item)" :key="uomOpt.uom"
                                                :value="uomOpt.uom">
                                                {{ uomOpt.uom }} ({{ uomOpt.conversion_factor }})
                                            </option>
                                        </select>
                                    </td>
                                    <td class="po-cell px-2 py-1 text-right text-xs font-mono">
                                        {{ (item.pack_units || 0).toFixed(0) }}
                                    </td>
                                    <td class="po-cell px-2 py-1">
                                        <NumberInput :model-value="item.rate"
                                            @update:model-value="purchaseStore.updateCartItemRate(index, $event)"
                                            :min="0" :precision="2" class="h-7 text-xs w-full"
                                            @keydown="handleKeyDown($event, index, 'price')"
                                            :ref="(el: any) => registerInput(index, 'price', el?.$el?.querySelector('input'))" />
                                    </td>
                                    <td class="po-cell px-2 py-1">
                                        <NumberInput :model-value="item.discount_percent || 0"
                                            @update:model-value="purchaseStore.updateCartItemDiscount(index, $event)"
                                            :min="0" :max="100" :precision="1" class="h-7 text-xs w-full"
                                            @keydown="handleKeyDown($event, index, 'discount')"
                                            :ref="(el: any) => registerInput(index, 'discount', el?.$el?.querySelector('input'))" />
                                    </td>
                                    <td class="po-cell px-2 py-1 text-xs text-muted-foreground truncate">
                                        {{ item.item_group || '-' }}
                                    </td>
                                    <td
                                        class="po-cell-frozen px-2 py-1 text-right text-xs font-medium text-green-600 font-mono bg-card">
                                        {{ formatCurrency(getItemAmount(item)) }}
                                    </td>
                                    <td class="po-cell-frozen-last px-1 py-1 bg-card">
                                        <Button @click="deleteRow(index)" variant="ghost" size="icon"
                                            class="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10">
                                            <Trash2 class="w-3 h-3" />
                                        </Button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Footer Totals -->
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
                                    :disabled="purchaseStore.cartItems.length === 0">
                                    <FileText class="w-4 h-4 mr-1" />
                                    {{ __("Save Draft") }}
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

        <!-- New Item Dialog -->
        <Dialog v-model:open="showNewItemDialog">
            <DialogContent class="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{{ __("Create New Item") }}</DialogTitle>
                    <DialogDescription>{{ __("Add a new item to inventory") }}</DialogDescription>
                </DialogHeader>
                <form @submit.prevent="handleCreateItem" class="space-y-4 mt-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="col-span-2">
                            <label class="text-sm font-medium mb-1 block">{{ __("Item Name") }} *</label>
                            <Input v-model="newItem.item_name" required />
                        </div>
                        <div>
                            <label class="text-sm font-medium mb-1 block">{{ __("Item Code") }}</label>
                            <Input v-model="newItem.item_code" :placeholder="__('Auto-generated')" />
                        </div>
                        <div>
                            <label class="text-sm font-medium mb-1 block">{{ __("Barcode") }}</label>
                            <Input v-model="newItem.barcode" />
                        </div>
                        <div>
                            <label class="text-sm font-medium mb-1 block">{{ __("UOM") }}</label>
                            <select v-model="newItem.stock_uom"
                                class="w-full h-9 px-3 border border-border rounded-md text-sm">
                                <option v-for="uom in standardUOMs" :key="uom" :value="uom">{{ uom }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-sm font-medium mb-1 block">{{ __("Item Group") }}</label>
                            <Input v-model="newItem.item_group" />
                        </div>
                        <div>
                            <label class="text-sm font-medium mb-1 block">{{ __("Buying Price") }}</label>
                            <NumberInput v-model="newItem.buying_price" :min="0" :precision="2" />
                        </div>
                        <div>
                            <label class="text-sm font-medium mb-1 block">{{ __("Selling Price") }}</label>
                            <NumberInput v-model="newItem.selling_price" :min="0" :precision="2" />
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" @click="showNewItemDialog = false">{{ __("Cancel")
                        }}</Button>
                        <Button type="submit" :disabled="isCreatingItem || !newItem.item_name.trim()">
                            {{ isCreatingItem ? __("Creating...") : __("Create") }}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>

        <!-- New Supplier Dialog -->
        <Dialog v-model:open="showNewSupplierDialog">
            <DialogContent class="max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ __("Create New Supplier") }}</DialogTitle>
                    <DialogDescription>{{ __("Add a new supplier") }}</DialogDescription>
                </DialogHeader>
                <form @submit.prevent="handleCreateSupplier" class="space-y-4 mt-4">
                    <div>
                        <label class="text-sm font-medium mb-1 block">{{ __("Supplier Name") }} *</label>
                        <Input v-model="newSupplier.supplier_name" required />
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="text-sm font-medium mb-1 block">{{ __("Type") }}</label>
                            <select v-model="newSupplier.supplier_type"
                                class="w-full h-9 px-3 border border-border rounded-md text-sm">
                                <option value="Company">{{ __("Company") }}</option>
                                <option value="Individual">{{ __("Individual") }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-sm font-medium mb-1 block">{{ __("Tax ID") }}</label>
                            <Input v-model="newSupplier.tax_id" />
                        </div>
                    </div>
                    <div>
                        <label class="text-sm font-medium mb-1 block">{{ __("Mobile") }}</label>
                        <Input v-model="newSupplier.mobile_no" />
                    </div>
                    <div>
                        <label class="text-sm font-medium mb-1 block">{{ __("Email") }}</label>
                        <Input v-model="newSupplier.email_id" type="email" />
                    </div>
                    <div class="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" @click="showNewSupplierDialog = false">{{ __("Cancel")
                        }}</Button>
                        <Button type="submit" :disabled="isCreatingSupplier || !newSupplier.supplier_name.trim()">
                            {{ isCreatingSupplier ? __("Creating...") : __("Create") }}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    </div>
</template>

<style scoped>
/* Sticky header and frozen columns for PO table */
.po-table-container {
    position: relative;
}

.po-table {
    border-collapse: separate;
    border-spacing: 0;
}

.po-table-header {
    position: sticky;
    top: 0;
    z-index: 20;
}

.po-table-header th {
    border-bottom: 1px solid hsl(var(--border));
}

/* Frozen columns (Amount and Delete) */
.po-cell-frozen,
.po-cell-frozen-last {
    position: sticky;
    z-index: 10;
}

.po-cell-frozen {
    right: 42px;
    /* Width of delete button column */
    border-left: 1px solid hsl(var(--border));
    box-shadow: -2px 0 4px -2px rgba(0, 0, 0, 0.1);
}

.po-cell-frozen-last {
    right: 0;
}

/* Header frozen cells need higher z-index */
.po-table-header .po-cell-frozen,
.po-table-header .po-cell-frozen-last {
    z-index: 30;
}

/* Row hover should not affect frozen cells background */
.po-row:hover .po-cell-frozen,
.po-row:hover .po-cell-frozen-last {
    background-color: hsl(var(--muted) / 0.5);
}
</style>
