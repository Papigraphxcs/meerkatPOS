<script setup lang="ts">
/**
 * Purchase Invoice View
 * For creating purchase invoices with batch, expiry, GST, bonus tracking
 */
import { ref, onMounted, computed, reactive } from "vue";
import { usePurchaseStore } from "@/stores/purchaseStore";
import { usePosStore } from "@/stores/posStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Search,
    Plus,
    Trash2,
    RefreshCw,
    Package,
    Save,
    X,
    Receipt,
    ScanBarcode,
    Loader2,
    Calculator,
} from "lucide-vue-next";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import type { SearchItem, Supplier } from "@/types/pos.types";
import { showError, showSuccess, call } from "@/services/api";
import __ from "@/lib/translate";

const purchaseStore = usePurchaseStore();
const posStore = usePosStore();

// Invoice item type with batch/expiry/GST fields
interface InvoiceItem {
    item_code: string;
    item_name: string;
    batch_no: string;
    expiry_date: string;
    qty: number;
    bonus_qty: number;
    rate: number;
    discount_percent: number;
    discount_amount: number;
    gst_percent: number;
    sale_price: number;
    warehouse: string;
}

// Invoice header state
const invoiceHeader = reactive({
    invoice_no: "",
    alias_name: "",
    supplier_invoice_no: "",
    remarks: "",
    print_bal: "Yes",
    inv_size: "Full",
    order_code: "",
    order_date: "",
    sale_order_no: "",
});

// Invoice settings
const invoiceSettings = reactive({
    stock_discount_percent: 0,
    flat_discount: 0,
    misc_charges: 0,
    invoice_gst_percent: 0,
});

// Invoice items
const invoiceItems = ref<InvoiceItem[]>([]);

// Search states
const itemSearchTerm = ref("");
const supplierSearchTerm = ref("");
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null);

// Barcode scanner
const barcodeValue = ref("");
const isBarcodeScan = ref(false);
const barcodeFlash = ref<"" | "success" | "error">("");
let barcodeFlashTimer: ReturnType<typeof setTimeout> | null = null;

// Dialogs
const showNewItemDialog = ref(false);
const showNewSupplierDialog = ref(false);
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
const newSupplier = ref({
    supplier_name: "",
    supplier_type: "Company",
    mobile_no: "",
    email_id: "",
    tax_id: "",
});
const isCreatingSupplier = ref(false);
const isProcessing = ref(false);

const standardUOMs = ["Nos", "Unit", "Kg", "Gram", "Litre", "mL", "Box", "Pack", "Dozen", "Pair", "Set", "Meter", "Feet"];

// Computed values
function getValueExTax(item: InvoiceItem): number {
    const gross = (item.qty + item.bonus_qty) * item.rate;
    const discAmt = item.discount_amount || (gross * (item.discount_percent || 0) / 100);
    return gross - discAmt;
}

function getTotalExcTax(item: InvoiceItem): number {
    return getValueExTax(item);
}

function getGstValue(item: InvoiceItem): number {
    return getTotalExcTax(item) * (item.gst_percent || 0) / 100;
}

function getTotalIncTax(item: InvoiceItem): number {
    return getTotalExcTax(item) + getGstValue(item);
}

function getMarginPercent(item: InvoiceItem): number {
    if (!item.rate || item.rate === 0) return 0;
    const costPerUnit = item.rate * (1 - (item.discount_percent || 0) / 100);
    if (costPerUnit === 0) return 0;
    return ((item.sale_price - costPerUnit) / costPerUnit) * 100;
}

const subtotal = computed(() => {
    return invoiceItems.value.reduce((sum, item) => sum + getTotalExcTax(item), 0);
});

const totalGst = computed(() => {
    return invoiceItems.value.reduce((sum, item) => sum + getGstValue(item), 0);
});

const grandTotal = computed(() => {
    let total = subtotal.value + totalGst.value;
    total -= invoiceSettings.flat_discount;
    total += invoiceSettings.misc_charges;
    total += total * (invoiceSettings.invoice_gst_percent / 100);
    return total;
});

const totalQty = computed(() => {
    return invoiceItems.value.reduce((sum, item) => sum + item.qty + item.bonus_qty, 0);
});

const avgPrice = computed(() => {
    if (invoiceItems.value.length === 0) return 0;
    const totalCost = invoiceItems.value.reduce((sum, item) => sum + (item.qty * item.rate), 0);
    const totalQtyVal = invoiceItems.value.reduce((sum, item) => sum + item.qty, 0);
    return totalQtyVal > 0 ? totalCost / totalQtyVal : 0;
});

function formatCurrency(value: number): string {
    return `${posStore.currencySymbol}${value.toFixed(2)}`;
}

// Item search
function onItemSearch(): void {
    if (debounceTimer.value) clearTimeout(debounceTimer.value);
    debounceTimer.value = setTimeout(() => {
        purchaseStore.searchItems(itemSearchTerm.value);
    }, 300);
}

// Barcode scan
async function onBarcodeScan(): Promise<void> {
    const code = barcodeValue.value.trim();
    if (!code) return;
    isBarcodeScan.value = true;
    try {
        const result = await purchaseStore.searchByBarcode(code);
        if (result) {
            addItemToInvoice(result);
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

// Add item to invoice
function addItemToInvoice(item: SearchItem): void {
    invoiceItems.value.push({
        item_code: item.item_code,
        item_name: item.item_name,
        batch_no: "",
        expiry_date: "",
        qty: 1,
        bonus_qty: 0,
        rate: item.standard_rate || 0,
        discount_percent: 0,
        discount_amount: 0,
        gst_percent: 0,
        sale_price: item.selling_price || 0,
        warehouse: posStore.warehouse,
    });
}

function removeItem(index: number): void {
    invoiceItems.value.splice(index, 1);
}

// Create dialogs
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
            addItemToInvoice({ ...created, standard_rate: newItem.value.buying_price });
            showNewItemDialog.value = false;
        }
    } finally {
        isCreatingItem.value = false;
    }
}

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

// Re-calculate all values
function recalculate(): void {
    invoiceItems.value.forEach(item => {
        // Recalculate discount amount from percent if needed
        if (item.discount_percent > 0 && item.discount_amount === 0) {
            const gross = item.qty * item.rate;
            item.discount_amount = gross * item.discount_percent / 100;
        }
    });
}

// Create Invoice
async function createInvoice(): Promise<void> {
    if (!purchaseStore.selectedSupplier) {
        showError(__("Please select a supplier"));
        return;
    }
    if (invoiceItems.value.length === 0) {
        showError(__("Please add at least one item"));
        return;
    }

    isProcessing.value = true;
    try {
        const payload = {
            pos_profile: posStore.profileName,
            supplier: purchaseStore.selectedSupplier.name,
            company: posStore.companyName,
            warehouse: posStore.warehouse,
            bill_no: invoiceHeader.supplier_invoice_no || undefined,
            remarks: invoiceHeader.remarks || undefined,
            items: invoiceItems.value.map(item => ({
                item_code: item.item_code,
                item_name: item.item_name,
                qty: item.qty,
                rate: item.rate,
                batch_no: item.batch_no || undefined,
                warehouse: item.warehouse,
            })),
            receive: true,
        };

        const result = await call<{ purchase_invoice?: string; purchase_receipt?: string }>(
            "xpos.x_pos.api.purchase_orders.create_purchase_invoice_direct",
            { data: JSON.stringify(payload) }
        );

        if (result?.purchase_invoice) {
            showSuccess(__("Purchase Invoice {0} created", [result.purchase_invoice]));
            clearForm();
        }
    } catch (error) {
        showError(error instanceof Error ? error.message : __("Failed to create invoice"));
    } finally {
        isProcessing.value = false;
    }
}

function clearForm(): void {
    invoiceItems.value = [];
    purchaseStore.clearSupplier();
    invoiceHeader.invoice_no = "";
    invoiceHeader.alias_name = "";
    invoiceHeader.supplier_invoice_no = "";
    invoiceHeader.remarks = "";
    invoiceHeader.order_code = "";
    invoiceHeader.order_date = "";
    invoiceHeader.sale_order_no = "";
    invoiceSettings.stock_discount_percent = 0;
    invoiceSettings.flat_discount = 0;
    invoiceSettings.misc_charges = 0;
    invoiceSettings.invoice_gst_percent = 0;
}

onMounted(() => {
    purchaseStore.init();
    purchaseStore.searchSuppliers();
    purchaseStore.searchItems();
});
</script>

<template>
    <div class="h-full flex flex-col bg-background overflow-hidden">
        <!-- Header -->
        <header class="bg-card border-b border-border px-4 py-3 shrink-0">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <Receipt class="w-6 h-6 text-primary" />
                    <h1 class="text-xl font-semibold text-foreground">{{ __("Purchase Invoice") }}</h1>
                </div>
                <div class="flex items-center gap-2">
                    <Badge variant="secondary" class="gap-1.5">{{ posStore.warehouse }}</Badge>
                    <Badge variant="outline">{{ posStore.companyName }}</Badge>
                </div>
            </div>
        </header>

        <!-- Invoice Header Fields -->
        <div class="bg-card border-b border-border px-4 py-3 shrink-0">
            <div class="grid grid-cols-6 gap-3">
                <div>
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("Invoice No") }}</label>
                    <Input v-model="invoiceHeader.invoice_no" class="h-8 text-sm bg-muted" disabled :placeholder="__('Auto')" />
                </div>
                <div>
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("Date") }}</label>
                    <Input type="date" :value="new Date().toISOString().split('T')[0]" class="h-8 text-sm" disabled />
                </div>
                <div>
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("Godown") }}</label>
                    <Input :value="posStore.warehouse" class="h-8 text-sm bg-muted" disabled />
                </div>
                <div>
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("Alias Name") }}</label>
                    <Input v-model="invoiceHeader.alias_name" class="h-8 text-sm" />
                </div>
                <div class="col-span-2">
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("Supplier") }} *</label>
                    <div class="flex gap-1">
                        <div class="relative flex-1">
                            <Search class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input v-model="supplierSearchTerm" @input="onSupplierSearch"
                                :placeholder="purchaseStore.selectedSupplier?.supplier_name || __('Search supplier...')"
                                class="h-8 text-sm pl-7" />
                        </div>
                        <Button @click="openNewSupplierDialog" variant="outline" size="icon" class="h-8 w-8 shrink-0">
                            <Plus class="w-3.5 h-3.5" />
                        </Button>
                    </div>
                    <div v-if="supplierSearchTerm && purchaseStore.suppliers.length > 0"
                        class="absolute z-50 mt-1 w-64 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-auto">
                        <button v-for="sup in purchaseStore.suppliers" :key="sup.name"
                            @click="selectSupplier(sup); supplierSearchTerm = ''"
                            class="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors">
                            {{ sup.supplier_name }}
                        </button>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-6 gap-3 mt-3">
                <div>
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("Supp. Inv #") }}</label>
                    <Input v-model="invoiceHeader.supplier_invoice_no" class="h-8 text-sm" />
                </div>
                <div class="col-span-2">
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("Remarks") }}</label>
                    <Input v-model="invoiceHeader.remarks" class="h-8 text-sm" />
                </div>
                <div>
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("Print Bal") }}</label>
                    <select v-model="invoiceHeader.print_bal" class="w-full h-8 px-2 border border-border rounded-md text-sm bg-background">
                        <option value="Yes">{{ __("Yes") }}</option>
                        <option value="No">{{ __("No") }}</option>
                    </select>
                </div>
                <div>
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("Inv. Size") }}</label>
                    <select v-model="invoiceHeader.inv_size" class="w-full h-8 px-2 border border-border rounded-md text-sm bg-background">
                        <option value="Full">{{ __("Full") }}</option>
                        <option value="Half">{{ __("Half") }}</option>
                    </select>
                </div>
                <div>
                    <label class="text-xs text-muted-foreground mb-1 block">{{ __("S/Ord. #") }}</label>
                    <Input v-model="invoiceHeader.sale_order_no" class="h-8 text-sm" />
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
                        <Input v-model="barcodeValue" class="pl-8 h-8 text-sm"
                            :class="{
                                'ring-2 ring-green-500/50 border-green-500': barcodeFlash === 'success',
                                'ring-2 ring-red-500/50 border-red-500': barcodeFlash === 'error'
                            }"
                            :placeholder="__('Scan barcode...')" @keydown.enter.prevent="onBarcodeScan" @paste="onBarcodePaste" />
                        <Loader2 v-if="isBarcodeScan" class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin" />
                    </div>
                </div>

                <!-- Item Search -->
                <div class="p-3 border-b border-border">
                    <div class="flex gap-1">
                        <div class="relative flex-1">
                            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input v-model="itemSearchTerm" @input="onItemSearch" :placeholder="__('Search items...')"
                                class="pl-8 h-8 text-sm" />
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
                    <div v-else-if="purchaseStore.purchaseItems.length === 0" class="p-4 text-center text-muted-foreground">
                        <Package class="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
                        <p class="text-sm">{{ __("No items found") }}</p>
                    </div>
                    <div v-else class="divide-y divide-border">
                        <button v-for="item in purchaseStore.purchaseItems" :key="item.item_code" @click="addItemToInvoice(item)"
                            class="w-full p-3 text-left hover:bg-muted transition-colors">
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

            <!-- Right: Invoice Grid -->
            <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
                <!-- Toolbar -->
                <div class="px-4 py-2 border-b border-border bg-muted flex items-center justify-between shrink-0">
                    <span class="text-sm font-medium text-foreground">{{ __("Items") }} ({{ invoiceItems.length }})</span>
                    <Button @click="recalculate" variant="outline" size="sm">
                        <Calculator class="w-3.5 h-3.5 mr-1" />
                        {{ __("Re-Calculate") }}
                    </Button>
                </div>

                <!-- Grid Table -->
                <ScrollArea class="flex-1 min-h-0">
                    <div v-if="invoiceItems.length === 0" class="flex items-center justify-center h-full p-8">
                        <div class="text-center text-muted-foreground">
                            <Package class="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                            <p class="font-medium">{{ __("No items added") }}</p>
                            <p class="text-sm mt-1">{{ __("Search and add items from the left panel") }}</p>
                        </div>
                    </div>
                    <div v-else class="overflow-x-auto">
                        <table class="w-full text-sm border-collapse min-w-[1400px]">
                            <thead class="sticky top-0 z-10 bg-muted border-b border-border">
                                <tr class="text-xs text-muted-foreground uppercase tracking-wider">
                                    <th class="px-2 py-2 text-center w-8">{{ __("No.") }}</th>
                                    <th class="px-2 py-2 text-left min-w-[140px]">{{ __("Item Name") }}</th>
                                    <th class="px-2 py-2 text-left w-[90px]">{{ __("Batch") }}</th>
                                    <th class="px-2 py-2 text-left w-[100px]">{{ __("Expiry") }}</th>
                                    <th class="px-2 py-2 text-right w-[60px]">{{ __("Qty") }}</th>
                                    <th class="px-2 py-2 text-right w-[55px]">{{ __("Bonus") }}</th>
                                    <th class="px-2 py-2 text-right w-[75px]">{{ __("P.Price") }}</th>
                                    <th class="px-2 py-2 text-right w-[55px]">{{ __("Disc%") }}</th>
                                    <th class="px-2 py-2 text-right w-[70px]">{{ __("Discount") }}</th>
                                    <th class="px-2 py-2 text-right w-[80px]">{{ __("Val Ex.Tax") }}</th>
                                    <th class="px-2 py-2 text-right w-[85px]">{{ __("Total(Exc)") }}</th>
                                    <th class="px-2 py-2 text-right w-[55px]">{{ __("GST%") }}</th>
                                    <th class="px-2 py-2 text-right w-[70px]">{{ __("GST Val") }}</th>
                                    <th class="px-2 py-2 text-right w-[85px]">{{ __("Total(Inc)") }}</th>
                                    <th class="px-2 py-2 text-right w-[75px]">{{ __("SalePrice") }}</th>
                                    <th class="px-2 py-2 text-right w-[60px]">{{ __("Margin%") }}</th>
                                    <th class="px-2 py-2 w-8"></th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-border">
                                <tr v-for="(item, index) in invoiceItems" :key="`${item.item_code}-${index}`"
                                    class="hover:bg-muted/50 transition-colors">
                                    <td class="px-2 py-1 text-center text-muted-foreground">{{ index + 1 }}</td>
                                    <td class="px-2 py-1">
                                        <div class="truncate font-medium text-xs" :title="item.item_name">{{ item.item_name }}</div>
                                        <div class="text-[10px] text-muted-foreground truncate">{{ item.item_code }}</div>
                                    </td>
                                    <td class="px-2 py-1">
                                        <Input v-model="item.batch_no" class="h-7 text-xs" :placeholder="__('Batch')" />
                                    </td>
                                    <td class="px-2 py-1">
                                        <Input type="date" v-model="item.expiry_date" class="h-7 text-xs" />
                                    </td>
                                    <td class="px-2 py-1">
                                        <NumberInput v-model="item.qty" :min="0" :precision="0" class="h-7 text-xs w-full" />
                                    </td>
                                    <td class="px-2 py-1">
                                        <NumberInput v-model="item.bonus_qty" :min="0" :precision="0" class="h-7 text-xs w-full" />
                                    </td>
                                    <td class="px-2 py-1">
                                        <NumberInput v-model="item.rate" :min="0" :precision="2" class="h-7 text-xs w-full" />
                                    </td>
                                    <td class="px-2 py-1">
                                        <NumberInput v-model="item.discount_percent" :min="0" :max="100" :precision="1" class="h-7 text-xs w-full" />
                                    </td>
                                    <td class="px-2 py-1">
                                        <NumberInput v-model="item.discount_amount" :min="0" :precision="2" class="h-7 text-xs w-full" />
                                    </td>
                                    <td class="px-2 py-1 text-right text-xs font-mono">{{ formatCurrency(getValueExTax(item)) }}</td>
                                    <td class="px-2 py-1 text-right text-xs font-mono">{{ formatCurrency(getTotalExcTax(item)) }}</td>
                                    <td class="px-2 py-1">
                                        <NumberInput v-model="item.gst_percent" :min="0" :max="100" :precision="1" class="h-7 text-xs w-full" />
                                    </td>
                                    <td class="px-2 py-1 text-right text-xs font-mono">{{ formatCurrency(getGstValue(item)) }}</td>
                                    <td class="px-2 py-1 text-right text-xs font-medium text-green-600 font-mono">{{ formatCurrency(getTotalIncTax(item)) }}</td>
                                    <td class="px-2 py-1">
                                        <NumberInput v-model="item.sale_price" :min="0" :precision="2" class="h-7 text-xs w-full" />
                                    </td>
                                    <td class="px-2 py-1 text-right text-xs font-mono" :class="getMarginPercent(item) >= 0 ? 'text-green-600' : 'text-red-500'">
                                        {{ getMarginPercent(item).toFixed(1) }}%
                                    </td>
                                    <td class="px-1 py-1">
                                        <Button @click="removeItem(index)" variant="ghost" size="icon"
                                            class="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10">
                                            <Trash2 class="w-3 h-3" />
                                        </Button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </ScrollArea>

                <!-- Footer Totals & Settings -->
                <div class="border-t border-border bg-muted shrink-0">
                    <!-- Invoice Settings Row -->
                    <div class="px-4 py-2 border-b border-border grid grid-cols-6 gap-4 text-sm">
                        <div class="flex items-center gap-2">
                            <span class="text-muted-foreground">{{ __("Stock") }}:</span>
                            <span class="font-medium">{{ totalQty }}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-muted-foreground text-xs">{{ __("Disc(%)") }}:</span>
                            <NumberInput v-model="invoiceSettings.stock_discount_percent" :min="0" :max="100" :precision="2" class="h-7 text-xs w-16" />
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-muted-foreground text-xs">{{ __("Flat Disc(-)") }}:</span>
                            <NumberInput v-model="invoiceSettings.flat_discount" :min="0" :precision="2" class="h-7 text-xs w-20" />
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-muted-foreground text-xs">{{ __("Misc(+)") }}:</span>
                            <NumberInput v-model="invoiceSettings.misc_charges" :min="0" :precision="2" class="h-7 text-xs w-20" />
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-muted-foreground text-xs">{{ __("Inv GST(%)") }}:</span>
                            <NumberInput v-model="invoiceSettings.invoice_gst_percent" :min="0" :max="100" :precision="2" class="h-7 text-xs w-16" />
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-muted-foreground text-xs">{{ __("Avg. Price") }}:</span>
                            <span class="font-mono text-xs">{{ formatCurrency(avgPrice) }}</span>
                        </div>
                    </div>

                    <!-- Grand Total Row -->
                    <div class="px-4 py-3 flex items-center justify-between">
                        <div class="flex items-center gap-6 text-sm">
                            <span class="text-muted-foreground">{{ __("Items") }}: <strong>{{ invoiceItems.length }}</strong></span>
                            <span class="text-muted-foreground">{{ __("Subtotal") }}: <strong>{{ formatCurrency(subtotal) }}</strong></span>
                            <span class="text-muted-foreground">{{ __("GST") }}: <strong>{{ formatCurrency(totalGst) }}</strong></span>
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
                                <Button @click="createInvoice" :disabled="!purchaseStore.selectedSupplier || invoiceItems.length === 0 || isProcessing">
                                    <Save class="w-4 h-4 mr-1" />
                                    {{ isProcessing ? __("Creating...") : __("Create Invoice") }}
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
                            <select v-model="newItem.stock_uom" class="w-full h-9 px-3 border border-border rounded-md text-sm">
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
                        <Button type="button" variant="outline" @click="showNewItemDialog = false">{{ __("Cancel") }}</Button>
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
                            <select v-model="newSupplier.supplier_type" class="w-full h-9 px-3 border border-border rounded-md text-sm">
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
                        <Button type="button" variant="outline" @click="showNewSupplierDialog = false">{{ __("Cancel") }}</Button>
                        <Button type="submit" :disabled="isCreatingSupplier || !newSupplier.supplier_name.trim()">
                            {{ isCreatingSupplier ? __("Creating...") : __("Create") }}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    </div>
</template>
