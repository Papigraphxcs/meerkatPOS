<script setup lang="ts">
import { ref, onMounted, computed, reactive } from "vue";
import { usePurchaseStore } from "@/stores/purchaseStore";
import { usePosStore } from "@/stores/posStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Table } from "@/components/ui/table";
import type { TableColumn } from "@/components/ui/table/types";
import {
    Search,
    Plus,
    Package,
    Save,
    X,
    Receipt,
    ScanBarcode,
    Loader2,
    Calculator,
} from "lucide-vue-next";
import type { SearchItem, Supplier } from "@/types/pos.types";
import { showError, showSuccess, call } from "@/services/api";
import __ from "@/lib/translate";
import { CreateItemDialog, CreateSupplierDialog } from "@/components/purchase";

const purchaseStore = usePurchaseStore();
const posStore = usePosStore();

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

const invoiceSettings = reactive({
    stock_discount_percent: 0,
    flat_discount: 0,
    misc_charges: 0,
    invoice_gst_percent: 0,
});

const invoiceItems = ref<InvoiceItem[]>([]);

const itemSearchTerm = ref("");
const supplierSearchTerm = ref("");
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null);

const barcodeValue = ref("");
const isBarcodeScan = ref(false);
const barcodeFlash = ref<"" | "success" | "error">("");
let barcodeFlashTimer: ReturnType<typeof setTimeout> | null = null;

// New item / supplier dialog visibility
const showNewItemDialog = ref(false);
const showNewSupplierDialog = ref(false);
const isProcessing = ref(false);

// Computed

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

function onItemSearch(): void {
    if (debounceTimer.value) clearTimeout(debounceTimer.value);
    debounceTimer.value = setTimeout(() => {
        purchaseStore.searchItems(itemSearchTerm.value);
    }, 300);
}

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

function onSupplierSearch(): void {
    if (debounceTimer.value) clearTimeout(debounceTimer.value);
    debounceTimer.value = setTimeout(() => {
        purchaseStore.searchSuppliers(supplierSearchTerm.value);
    }, 300);
}

function selectSupplier(supplier: Supplier): void {
    purchaseStore.selectSupplier(supplier);
}

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

function removeItems(indices: number[]): void {
    // indices come sorted descending from ChildTable
    for (const i of indices) {
        invoiceItems.value.splice(i, 1);
    }
}

function duplicateItem(index: number): void {
    const src = invoiceItems.value[index];
    invoiceItems.value.splice(index + 1, 0, { ...src });
}

function moveItem(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= invoiceItems.value.length) return;
    const temp = invoiceItems.value[index];
    invoiceItems.value[index] = invoiceItems.value[target];
    invoiceItems.value[target] = temp;
}

function onCellChange(payload: { rowIndex: number; fieldname: string; value: any }): void {
    const item = invoiceItems.value[payload.rowIndex];
    if (item) {
        (item as any)[payload.fieldname] = payload.value;
    }
}

// Column definitions for the invoice child table
const invoiceColumns = computed<TableColumn[]>(() => [
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
        fieldname: "batch_no",
        label: "Batch",
        type: "text" as const,
        width: "w-[90px]",
        align: "left" as const,
        placeholder: "Batch",
    },
    {
        fieldname: "expiry_date",
        label: "Expiry",
        type: "date" as const,
        width: "w-[100px]",
        align: "left" as const,
    },
    {
        fieldname: "qty",
        label: "Qty",
        type: "number" as const,
        width: "w-[60px]",
        align: "right" as const,
        min: 0,
        precision: 0,
    },
    {
        fieldname: "bonus_qty",
        label: "Bonus",
        type: "number" as const,
        width: "w-[55px]",
        align: "right" as const,
        min: 0,
        precision: 0,
    },
    {
        fieldname: "rate",
        label: "P.Price",
        type: "number" as const,
        width: "w-[75px]",
        align: "right" as const,
        min: 0,
        precision: 2,
    },
    {
        fieldname: "discount_percent",
        label: "Disc%",
        type: "number" as const,
        width: "w-[55px]",
        align: "right" as const,
        min: 0,
        max: 100,
        precision: 1,
    },
    {
        fieldname: "discount_amount",
        label: "Discount",
        type: "number" as const,
        width: "w-[70px]",
        align: "right" as const,
        min: 0,
        precision: 2,
    },
    {
        fieldname: "value_ex_tax",
        label: "Val Ex.Tax",
        type: "readonly" as const,
        width: "w-[80px]",
        align: "right" as const,
        editable: false,
        format: (_: any, row: any) => formatCurrency(getValueExTax(row)),
    },
    {
        fieldname: "total_exc_tax",
        label: "Total(Exc)",
        type: "readonly" as const,
        width: "w-[85px]",
        align: "right" as const,
        editable: false,
        format: (_: any, row: any) => formatCurrency(getTotalExcTax(row)),
    },
    {
        fieldname: "gst_percent",
        label: "GST%",
        type: "number" as const,
        width: "w-[55px]",
        align: "right" as const,
        min: 0,
        max: 100,
        precision: 1,
    },
    {
        fieldname: "gst_value",
        label: "GST Val",
        type: "readonly" as const,
        width: "w-[70px]",
        align: "right" as const,
        editable: false,
        format: (_: any, row: any) => formatCurrency(getGstValue(row)),
    },
    {
        fieldname: "total_inc_tax",
        label: "Total(Inc)",
        type: "readonly" as const,
        width: "w-[85px]",
        align: "right" as const,
        editable: false,
        cellClass: "text-green-600 font-medium",
        format: (_: any, row: any) => formatCurrency(getTotalIncTax(row)),
    },
    {
        fieldname: "sale_price",
        label: "SalePrice",
        type: "number" as const,
        width: "w-[75px]",
        align: "right" as const,
        min: 0,
        precision: 2,
    },
    {
        fieldname: "margin_percent",
        label: "Margin%",
        type: "readonly" as const,
        width: "w-[60px]",
        align: "right" as const,
        editable: false,
        format: (_: any, row: any) => `${getMarginPercent(row).toFixed(1)}%`,
        cellClass: (_: any, row: any) => getMarginPercent(row) >= 0 ? "text-green-600" : "text-red-500",
    },
]);

function onItemCreated(item: SearchItem, buyingPrice: number): void {
    addItemToInvoice({ ...item, standard_rate: buyingPrice });
}

function recalculate(): void {
    invoiceItems.value.forEach(item => {
        if (item.discount_percent > 0 && item.discount_amount === 0) {
            const gross = item.qty * item.rate;
            item.discount_amount = gross * item.discount_percent / 100;
        }
    });
}

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
            supplier: purchaseStore.selectedSupplier,
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
                                :placeholder="purchaseStore.selectedSupplier || __('Search supplier...')"
                                class="h-8 text-sm pl-7" />
                        </div>
                        <Button @click="showNewSupplierDialog = true" variant="outline" size="icon" class="h-8 w-8 shrink-0">
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

        <div class="flex-1 flex min-h-0 overflow-hidden">
            <div class="w-72 border-r border-border bg-card flex flex-col shrink-0 overflow-hidden">
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

                <div class="p-3 border-b border-border">
                    <div class="flex gap-1">
                        <div class="relative flex-1">
                            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input v-model="itemSearchTerm" @input="onItemSearch" :placeholder="__('Search items...')"
                                class="pl-8 h-8 text-sm" />
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

            <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
                <Table
                    :rows="invoiceItems"
                    :columns="invoiceColumns"
                    label="Items"
                    min-width="1400px"
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
                    @delete-row="removeItem"
                    @delete-rows="removeItems"
                    @duplicate-row="duplicateItem"
                    @move-row="moveItem"
                    @cell-change="onCellChange"
                    class="flex-1 min-h-0 flex flex-col"
                >
                    <template #toolbar>
                        <Button @click="recalculate" variant="outline" size="sm" class="h-7 text-xs">
                            <Calculator class="w-3.5 h-3.5 mr-1" />
                            {{ __("Re-Calculate") }}
                        </Button>
                    </template>

                    <template #cell-item_name="{ row }">
                        <div class="truncate font-medium text-xs" :title="row.item_name">{{ row.item_name }}</div>
                        <div class="text-[10px] text-muted-foreground truncate">{{ row.item_code }}</div>
                    </template>
                </Table>

                <div class="border-t border-border bg-muted shrink-0">
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
