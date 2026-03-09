<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { usePurchaseStore } from "@/stores/purchaseStore";
import { usePosStore } from "@/stores/posStore";
import {
    PackageCheck, PackageX, ArrowLeft, RefreshCw,
    Truck, CheckCircle2, XCircle, Package,
    ChevronRight, AlertTriangle, Loader2,
    ArrowRightLeft, CornerDownLeft, Warehouse,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
    PendingReceiptOrder, ReceiveStockItem, PendingReceiptItem,
    InTransitEntry, InTransitItem, ReceiveTransitItem, ReturnShortageItem,
} from "@/types/pos.types";
import __ from "@/lib/translate";

const purchaseStore = usePurchaseStore();
const posStore = usePosStore();

type ReceiveTab = "purchases" | "transfers";
const activeReceiveTab = ref<ReceiveTab>("purchases");

interface ReceiveFormItem {
    po_detail: string;
    item_code: string;
    item_name: string;
    ordered_qty: number;
    pending_qty: number;
    accept_qty: number;
    reject_qty: number;
    rate: number;
    uom: string;
    warehouse: string;
}

const receiveFormItems = ref<ReceiveFormItem[]>([]);
const remarks = ref("");
const isSubmitting = ref(false);

const hasFormData = computed(() =>
    receiveFormItems.value.some(i => i.accept_qty > 0 || i.reject_qty > 0)
);

interface TransitFormItem {
    ste_detail: string;
    item_code: string;
    item_name: string;
    original_qty: number;
    pending_qty: number;
    receive_qty: number;
    return_qty: number;
    uom: string;
    basic_rate: number;
    s_warehouse: string;
    t_warehouse: string;
}

const transitFormItems = ref<TransitFormItem[]>([]);
const transitRemarks = ref("");
const isSubmittingTransit = ref(false);

const hasTransitFormData = computed(() =>
    transitFormItems.value.some(i => i.receive_qty > 0)
);

const hasShortageData = computed(() =>
    transitFormItems.value.some(i => i.return_qty > 0)
);

function formatCurrency(value: number): string {
    return `${posStore.currencySymbol}${value.toFixed(2)}`;
}

function formatDate(d: string): string {
    if (!d) return "";
    const dt = new Date(d);
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function selectOrder(order: PendingReceiptOrder): Promise<void> {
    const detail = await purchaseStore.fetchReceiptDetail(order.name);
    if (detail) {
        receiveFormItems.value = detail.items
            .filter(i => i.pending_qty > 0)
            .map(item => ({
                po_detail: item.po_detail,
                item_code: item.item_code,
                item_name: item.item_name,
                ordered_qty: item.qty,
                pending_qty: item.pending_qty,
                accept_qty: item.pending_qty,
                reject_qty: 0,
                rate: item.rate,
                uom: item.uom,
                warehouse: item.warehouse,
            }));
        remarks.value = "";
    }
}

function goBackToList(): void {
    purchaseStore.clearSelectedReceipt();
    receiveFormItems.value = [];
    remarks.value = "";
}

function acceptAll(index: number): void {
    const item = receiveFormItems.value[index];
    item.accept_qty = item.pending_qty;
    item.reject_qty = 0;
}

function rejectAll(index: number): void {
    const item = receiveFormItems.value[index];
    item.accept_qty = 0;
    item.reject_qty = item.pending_qty;
}

function onAcceptChange(index: number): void {
    const item = receiveFormItems.value[index];
    if (item.accept_qty < 0) item.accept_qty = 0;
    if (item.accept_qty > item.pending_qty) item.accept_qty = item.pending_qty;
    item.reject_qty = Math.min(item.reject_qty, item.pending_qty - item.accept_qty);
}

function onRejectChange(index: number): void {
    const item = receiveFormItems.value[index];
    if (item.reject_qty < 0) item.reject_qty = 0;
    if (item.reject_qty > item.pending_qty) item.reject_qty = item.pending_qty;
    item.accept_qty = Math.min(item.accept_qty, item.pending_qty - item.reject_qty);
}

async function submitReceive(): Promise<void> {
    if (!purchaseStore.selectedReceipt || !hasFormData.value) return;

    isSubmitting.value = true;
    try {
        const items: ReceiveStockItem[] = receiveFormItems.value
            .filter(i => i.accept_qty > 0 || i.reject_qty > 0)
            .map(i => ({
                po_detail: i.po_detail,
                item_code: i.item_code,
                accept_qty: i.accept_qty,
                reject_qty: i.reject_qty,
                warehouse: i.warehouse,
            }));

        await purchaseStore.receiveStock(
            purchaseStore.selectedReceipt.name,
            items,
            remarks.value
        );
        goBackToList();
    } finally {
        isSubmitting.value = false;
    }
}

async function selectTransit(entry: InTransitEntry): Promise<void> {
    const detail = await purchaseStore.fetchTransitDetail(entry.name);
    if (detail) {
        transitFormItems.value = detail.items
            .filter(i => i.pending_qty > 0)
            .map(item => ({
                ste_detail: item.ste_detail,
                item_code: item.item_code,
                item_name: item.item_name,
                original_qty: item.qty,
                pending_qty: item.pending_qty,
                receive_qty: item.pending_qty,
                return_qty: 0,
                uom: item.uom,
                basic_rate: item.basic_rate,
                s_warehouse: item.s_warehouse,
                t_warehouse: item.t_warehouse,
            }));
        transitRemarks.value = "";
    }
}

function goBackToTransitList(): void {
    purchaseStore.clearSelectedTransit();
    transitFormItems.value = [];
    transitRemarks.value = "";
}

function receiveAllTransit(index: number): void {
    const item = transitFormItems.value[index];
    item.receive_qty = item.pending_qty;
    item.return_qty = 0;
}

function returnAllTransit(index: number): void {
    const item = transitFormItems.value[index];
    item.receive_qty = 0;
    item.return_qty = item.pending_qty;
}

function onTransitReceiveChange(index: number): void {
    const item = transitFormItems.value[index];
    if (item.receive_qty < 0) item.receive_qty = 0;
    if (item.receive_qty > item.pending_qty) item.receive_qty = item.pending_qty;
    item.return_qty = Math.min(item.return_qty, item.pending_qty - item.receive_qty);
}

function onTransitReturnChange(index: number): void {
    const item = transitFormItems.value[index];
    if (item.return_qty < 0) item.return_qty = 0;
    if (item.return_qty > item.pending_qty) item.return_qty = item.pending_qty;
    item.receive_qty = Math.min(item.receive_qty, item.pending_qty - item.return_qty);
}

async function submitTransitReceive(): Promise<void> {
    if (!purchaseStore.selectedTransit || (!hasTransitFormData.value && !hasShortageData.value)) return;

    const entryName = purchaseStore.selectedTransit.name;

    isSubmittingTransit.value = true;
    try {
        const receiveItems: ReceiveTransitItem[] = transitFormItems.value
            .filter(i => i.receive_qty > 0)
            .map(i => ({
                ste_detail: i.ste_detail,
                item_code: i.item_code,
                receive_qty: i.receive_qty,
            }));

        if (receiveItems.length > 0) {
            await purchaseStore.receiveTransitStock(
                entryName,
                receiveItems,
                transitRemarks.value
            );
        }

        const returnItems: ReturnShortageItem[] = transitFormItems.value
            .filter(i => i.return_qty > 0)
            .map(i => ({
                ste_detail: i.ste_detail,
                item_code: i.item_code,
                return_qty: i.return_qty,
                reason: transitRemarks.value,
            }));

        if (returnItems.length > 0) {
            await purchaseStore.returnShortageToSource(
                entryName,
                returnItems,
                transitRemarks.value
            );
        }

        goBackToTransitList();
    } finally {
        isSubmittingTransit.value = false;
    }
}

onMounted(() => {
    purchaseStore.fetchPendingReceipts();
    purchaseStore.fetchInTransitTransfers();
});
</script>

<template>
    <div class="h-full flex flex-col overflow-hidden bg-card">
        <div v-if="!purchaseStore.selectedReceipt && !purchaseStore.selectedTransit"
            class="flex border-b border-border shrink-0">
            <button @click="activeReceiveTab = 'purchases'"
                class="flex-1 px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                :class="activeReceiveTab === 'purchases'
                    ? 'text-primary border-b-2 border-primary bg-primary/10'
                    : 'text-muted-foreground hover:bg-muted'">
                <Package class="w-4 h-4" />
                {{ __("Purchase Orders") }}
                <Badge v-if="purchaseStore.pendingReceipts.length > 0" variant="secondary"
                    class="ml-1 text-xs px-1.5 py-0">
                    {{ purchaseStore.pendingReceipts.length }}
                </Badge>
            </button>
            <button @click="activeReceiveTab = 'transfers'"
                class="flex-1 px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                :class="activeReceiveTab === 'transfers'
                    ? 'text-primary border-b-2 border-primary bg-primary/10'
                    : 'text-muted-foreground hover:bg-muted'">
                <ArrowRightLeft class="w-4 h-4" />
                {{ __("In-Transit") }}
                <Badge v-if="purchaseStore.inTransitEntries.length > 0" variant="secondary"
                    class="ml-1 text-xs px-1.5 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                    {{ purchaseStore.inTransitEntries.length }}
                </Badge>
            </button>
        </div>
        <template v-if="purchaseStore.selectedReceipt">
            <div class="p-4 border-b border-border bg-muted shrink-0">
                <div class="flex items-center gap-3">
                    <Button @click="goBackToList" variant="ghost" size="icon" class="shrink-0">
                        <ArrowLeft class="w-4 h-4" />
                    </Button>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-semibold text-foreground truncate">
                            {{ purchaseStore.selectedReceipt.name }}
                        </h3>
                        <p class="text-sm text-muted-foreground truncate">
                            {{ purchaseStore.selectedReceipt.supplier_name }}
                            &middot; {{ formatDate(purchaseStore.selectedReceipt.transaction_date) }}
                        </p>
                    </div>
                    <Badge variant="secondary">
                        {{ Math.round(purchaseStore.selectedReceipt.per_received) }}% {{ __("received") }}
                    </Badge>
                </div>
            </div>

            <ScrollArea class="flex-1 min-h-0">
                <div class="divide-y divide-border">
                    <div v-for="(item, index) in receiveFormItems" :key="item.po_detail" class="p-4 space-y-3">
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                                <p class="font-medium text-foreground truncate">{{ item.item_name }}</p>
                                <p class="text-xs text-muted-foreground">{{ item.item_code }} &middot; {{ item.uom }}
                                </p>
                            </div>
                            <div class="text-right shrink-0">
                                <p class="text-sm font-medium text-foreground">{{ formatCurrency(item.rate) }}</p>
                                <p class="text-xs text-muted-foreground">
                                    {{ __("Pending") }}: <span class="font-semibold">{{ item.pending_qty }}</span>
                                </p>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                    <CheckCircle2 class="w-3 h-3 text-green-500" />
                                    {{ __("Accept Qty") }}
                                </label>
                                <div class="flex items-center gap-1">
                                    <NumberInput v-model="item.accept_qty"
                                        @change="onAcceptChange(index)" :min="0" :max="item.pending_qty"
                                        :precision="2" class="h-8" />
                                    <Button @click="acceptAll(index)" variant="outline" size="sm"
                                        class="h-8 text-xs px-2 shrink-0">{{ __("All") }}</Button>
                                </div>
                            </div>
                            <div>
                                <label class="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                    <XCircle class="w-3 h-3 text-destructive" />
                                    {{ __("Reject Qty") }}
                                </label>
                                <div class="flex items-center gap-1">
                                    <NumberInput v-model="item.reject_qty"
                                        @change="onRejectChange(index)" :min="0" :max="item.pending_qty"
                                        :precision="2" class="h-8" />
                                    <Button @click="rejectAll(index)" variant="outline" size="sm"
                                        class="h-8 text-xs px-2 text-destructive shrink-0">{{ __("All") }}</Button>
                                </div>
                            </div>
                        </div>

                        <div v-if="item.reject_qty > 0"
                            class="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle class="w-3 h-3" />
                            <span>{{ item.reject_qty }} {{ item.uom }} {{ __("will be rejected") }}</span>
                        </div>
                    </div>
                </div>
            </ScrollArea>

            <div class="p-4 border-t border-border bg-muted shrink-0 space-y-3">
                <Input v-model="remarks" :placeholder="__('Remarks (optional, e.g. items damaged)')" class="text-sm" />
                <div class="flex gap-2">
                    <Button @click="goBackToList" variant="outline" class="flex-1">{{ __("Cancel") }}</Button>
                    <Button @click="submitReceive" class="flex-1" :disabled="!hasFormData || isSubmitting">
                        <PackageCheck class="w-4 h-4 mr-1" />
                        {{ isSubmitting ? __("Receiving...") : __("Receive Stock") }}
                    </Button>
                </div>
            </div>
        </template>
        <template v-else-if="purchaseStore.selectedTransit">
            <div class="p-4 border-b border-border bg-muted shrink-0">
                <div class="flex items-center gap-3">
                    <Button @click="goBackToTransitList" variant="ghost" size="icon" class="shrink-0">
                        <ArrowLeft class="w-4 h-4" />
                    </Button>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-semibold text-foreground truncate">
                            {{ purchaseStore.selectedTransit.name }}
                        </h3>
                        <p class="text-sm text-muted-foreground truncate">
                            {{ purchaseStore.selectedTransit.source_warehouse ||
                                purchaseStore.selectedTransit.from_warehouse }}
                            &rarr; {{ purchaseStore.selectedTransit.transit_warehouse ||
                                purchaseStore.selectedTransit.to_warehouse }}
                        </p>
                    </div>
                    <Badge variant="secondary" class="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                        {{ Math.round(purchaseStore.selectedTransit.per_transferred) }}% {{ __("transferred") }}
                    </Badge>
                </div>
            </div>

            <div class="px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border-b border-border shrink-0">
                <p class="text-xs text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                    <Warehouse class="w-3.5 h-3.5" />
                    {{ __("Receiving at") }}: <strong>{{ posStore.warehouse }}</strong>
                </p>
            </div>

            <ScrollArea class="flex-1 min-h-0">
                <div class="divide-y divide-border">
                    <div v-for="(item, index) in transitFormItems" :key="item.ste_detail" class="p-4 space-y-3">
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                                <p class="font-medium text-foreground truncate">{{ item.item_name }}</p>
                                <p class="text-xs text-muted-foreground">{{ item.item_code }} &middot; {{ item.uom }}
                                </p>
                            </div>
                            <div class="text-right shrink-0">
                                <p class="text-sm font-medium text-foreground">{{ formatCurrency(item.basic_rate) }}</p>
                                <p class="text-xs text-muted-foreground">
                                    {{ __("In Transit") }}: <span class="font-semibold">{{ item.pending_qty }}</span>
                                </p>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                    <CheckCircle2 class="w-3 h-3 text-green-500" />
                                    {{ __("Receive Qty") }}
                                </label>
                                <div class="flex items-center gap-1">
                                    <NumberInput v-model="item.receive_qty"
                                        @change="onTransitReceiveChange(index)" :min="0" :max="item.pending_qty"
                                        :precision="2" class="h-8" />
                                    <Button @click="receiveAllTransit(index)" variant="outline" size="sm"
                                        class="h-8 text-xs px-2 shrink-0">{{ __("All") }}</Button>
                                </div>
                            </div>
                            <div>
                                <label class="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                    <CornerDownLeft class="w-3 h-3 text-amber-500" />
                                    {{ __("Return Qty") }}
                                </label>
                                <div class="flex items-center gap-1">
                                    <NumberInput v-model="item.return_qty"
                                        @change="onTransitReturnChange(index)" :min="0" :max="item.pending_qty"
                                        :precision="2" class="h-8" />
                                    <Button @click="returnAllTransit(index)" variant="outline" size="sm"
                                        class="h-8 text-xs px-2 text-amber-600 shrink-0">{{ __("All") }}</Button>
                                </div>
                            </div>
                        </div>

                        <div v-if="item.return_qty > 0"
                            class="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                            <CornerDownLeft class="w-3 h-3" />
                            <span>{{ item.return_qty }} {{ item.uom }} {{ __("will be returned to") }} {{
                                item.s_warehouse }}</span>
                        </div>

                        <div v-if="item.pending_qty - item.receive_qty - item.return_qty > 0"
                            class="flex items-center gap-2 text-xs text-red-500">
                            <AlertTriangle class="w-3 h-3" />
                            <span>{{ item.pending_qty - item.receive_qty - item.return_qty }} {{ item.uom }} {{
                                __("unaccounted") }}</span>
                        </div>
                    </div>
                </div>
            </ScrollArea>

            <div class="p-4 border-t border-border bg-muted shrink-0 space-y-3">
                <Input v-model="transitRemarks" :placeholder="__('Remarks (optional, e.g. missing or damaged items)')"
                    class="text-sm" />
                <div class="flex gap-2">
                    <Button @click="goBackToTransitList" variant="outline" class="flex-1">{{ __("Cancel") }}</Button>
                    <Button @click="submitTransitReceive" class="flex-1"
                        :disabled="(!hasTransitFormData && !hasShortageData) || isSubmittingTransit">
                        <PackageCheck class="w-4 h-4 mr-1" />
                        {{ isSubmittingTransit ? __("Processing...") : __("Receive & Return") }}
                    </Button>
                </div>
            </div>
        </template>
        <template v-else>
            <template v-if="activeReceiveTab === 'purchases'">
                <div class="p-4 border-b border-border bg-muted shrink-0">
                    <div class="flex items-center justify-between">
                        <h3 class="font-semibold text-foreground flex items-center gap-2">
                            <Truck class="w-5 h-5" />
                            {{ __("Stock Receiving") }}
                        </h3>
                        <Button @click="purchaseStore.fetchPendingReceipts()" variant="outline" size="sm"
                            :disabled="purchaseStore.isLoadingReceipts">
                            <RefreshCw class="w-4 h-4 mr-1"
                                :class="{ 'animate-spin': purchaseStore.isLoadingReceipts }" />
                            {{ __("Refresh") }}
                        </Button>
                    </div>
                    <p class="text-xs text-muted-foreground mt-1">
                        {{ __("Purchase Orders pending receipt at") }} {{ posStore.warehouse }}
                    </p>
                </div>

                <ScrollArea class="flex-1 min-h-0">
                    <div v-if="purchaseStore.isLoadingReceipts" class="p-8 text-center text-muted-foreground">
                        <Loader2 class="w-8 h-8 mx-auto mb-3 animate-spin text-muted-foreground/40" />
                        <p>{{ __("Loading pending orders...") }}</p>
                    </div>

                    <div v-else-if="purchaseStore.pendingReceipts.length === 0"
                        class="p-8 text-center text-muted-foreground">
                        <PackageCheck class="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                        <p class="font-medium">{{ __("No pending stock") }}</p>
                        <p class="text-sm mt-1">{{ __("All orders have been received") }}</p>
                    </div>

                    <div v-else class="divide-y divide-border">
                        <button v-for="order in purchaseStore.pendingReceipts" :key="order.name"
                            @click="selectOrder(order)"
                            class="w-full p-4 text-left hover:bg-muted transition-colors flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <Package class="w-5 h-5 text-primary" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between">
                                    <p class="font-medium text-foreground truncate">{{ order.name }}</p>
                                    <Badge variant="secondary" class="shrink-0 ml-2">
                                        {{ order.items?.length || 0 }} {{ __("items") }}
                                    </Badge>
                                </div>
                                <p class="text-sm text-muted-foreground truncate">{{ order.supplier_name }}</p>
                                <div class="flex items-center gap-3 mt-1 text-xs text-muted-foreground/70">
                                    <span>{{ formatDate(order.transaction_date) }}</span>
                                    <span>{{ formatCurrency(order.grand_total) }}</span>
                                    <span>{{ Math.round(order.per_received) }}% {{ __("received") }}</span>
                                </div>
                            </div>
                            <ChevronRight class="w-4 h-4 text-muted-foreground shrink-0" />
                        </button>
                    </div>
                </ScrollArea>
            </template>
            <template v-else>
                <div class="p-4 border-b border-border bg-muted shrink-0">
                    <div class="flex items-center justify-between">
                        <h3 class="font-semibold text-foreground flex items-center gap-2">
                            <ArrowRightLeft class="w-5 h-5" />
                            {{ __("In-Transit Stock") }}
                        </h3>
                        <Button @click="purchaseStore.fetchInTransitTransfers()" variant="outline" size="sm"
                            :disabled="purchaseStore.isLoadingTransits">
                            <RefreshCw class="w-4 h-4 mr-1"
                                :class="{ 'animate-spin': purchaseStore.isLoadingTransits }" />
                            {{ __("Refresh") }}
                        </Button>
                    </div>
                    <p class="text-xs text-muted-foreground mt-1">
                        {{ __("Material transfers awaiting receipt at your warehouse") }}
                    </p>
                </div>

                <ScrollArea class="flex-1 min-h-0">
                    <div v-if="purchaseStore.isLoadingTransits" class="p-8 text-center text-muted-foreground">
                        <Loader2 class="w-8 h-8 mx-auto mb-3 animate-spin text-muted-foreground/40" />
                        <p>{{ __("Loading in-transit stock...") }}</p>
                    </div>

                    <div v-else-if="purchaseStore.inTransitEntries.length === 0"
                        class="p-8 text-center text-muted-foreground">
                        <ArrowRightLeft class="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                        <p class="font-medium">{{ __("No in-transit stock") }}</p>
                        <p class="text-sm mt-1">{{ __("No material transfers pending receipt") }}</p>
                    </div>

                    <div v-else class="divide-y divide-border">
                        <button v-for="entry in purchaseStore.inTransitEntries" :key="entry.name"
                            @click="selectTransit(entry)"
                            class="w-full p-4 text-left hover:bg-muted transition-colors flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                                <ArrowRightLeft class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between">
                                    <p class="font-medium text-foreground truncate">{{ entry.name }}</p>
                                    <Badge variant="secondary"
                                        class="shrink-0 ml-2 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                                        {{ entry.total_pending_items }} {{ __("items") }}
                                    </Badge>
                                </div>
                                <p class="text-sm text-muted-foreground truncate">
                                    {{ entry.source_warehouse || entry.from_warehouse }} &rarr; {{ __("In Transit") }}
                                </p>
                                <div class="flex items-center gap-3 mt-1 text-xs text-muted-foreground/70">
                                    <span>{{ formatDate(entry.posting_date) }}</span>
                                    <span>{{ formatCurrency(entry.total_amount) }}</span>
                                    <span>{{ Math.round(entry.per_transferred) }}% {{ __("received") }}</span>
                                </div>
                            </div>
                            <ChevronRight class="w-4 h-4 text-muted-foreground shrink-0" />
                        </button>
                    </div>
                </ScrollArea>
            </template>
        </template>
    </div>
</template>
