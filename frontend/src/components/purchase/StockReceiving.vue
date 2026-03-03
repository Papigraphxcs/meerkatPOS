<script setup lang="ts">
/**
 * Stock Receiving Component
 * Warehouse keeper can accept/reject stock from Purchase Orders
 */
import { ref, computed, onMounted } from "vue";
import { usePurchaseStore } from "@/stores/purchaseStore";
import { usePosStore } from "@/stores/posStore";
import {
    PackageCheck, PackageX, ArrowLeft, RefreshCw,
    Truck, CheckCircle2, XCircle, Package,
    ChevronRight, AlertTriangle, Loader2,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PendingReceiptOrder, ReceiveStockItem, PendingReceiptItem } from "@/types/pos.types";

const purchaseStore = usePurchaseStore();
const posStore = usePosStore();

// Local state for the receiving form
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

function formatCurrency(value: number): string {
    return `${posStore.currencySymbol}${value.toFixed(2)}`;
}

function formatDate(d: string): string {
    if (!d) return "";
    const dt = new Date(d);
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Select a PO to receive
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

// Accept all for an item
function acceptAll(index: number): void {
    const item = receiveFormItems.value[index];
    item.accept_qty = item.pending_qty;
    item.reject_qty = 0;
}

// Reject all for an item
function rejectAll(index: number): void {
    const item = receiveFormItems.value[index];
    item.accept_qty = 0;
    item.reject_qty = item.pending_qty;
}

// Ensure accept + reject <= pending
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

onMounted(() => {
    purchaseStore.fetchPendingReceipts();
});
</script>

<template>
    <div class="h-full flex flex-col overflow-hidden bg-card">
        <!-- Detail View -->
        <template v-if="purchaseStore.selectedReceipt">
            <!-- Detail Header -->
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
                        {{ Math.round(purchaseStore.selectedReceipt.per_received) }}% received
                    </Badge>
                </div>
            </div>

            <!-- Items to Receive -->
            <ScrollArea class="flex-1 min-h-0">
                <div class="divide-y divide-border">
                    <div
                        v-for="(item, index) in receiveFormItems"
                        :key="item.po_detail"
                        class="p-4 space-y-3"
                    >
                        <!-- Item header -->
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                                <p class="font-medium text-foreground truncate">{{ item.item_name }}</p>
                                <p class="text-xs text-muted-foreground">{{ item.item_code }} &middot; {{ item.uom }}</p>
                            </div>
                            <div class="text-right shrink-0">
                                <p class="text-sm font-medium text-foreground">{{ formatCurrency(item.rate) }}</p>
                                <p class="text-xs text-muted-foreground">
                                    Pending: <span class="font-semibold">{{ item.pending_qty }}</span>
                                </p>
                            </div>
                        </div>

                        <!-- Accept / Reject controls -->
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                    <CheckCircle2 class="w-3 h-3 text-green-500" />
                                    Accept Qty
                                </label>
                                <div class="flex items-center gap-1">
                                    <Input
                                        type="number"
                                        v-model.number="item.accept_qty"
                                        @change="onAcceptChange(index)"
                                        :min="0"
                                        :max="item.pending_qty"
                                        class="h-8"
                                    />
                                    <Button @click="acceptAll(index)" variant="outline" size="sm" class="h-8 text-xs px-2 shrink-0">
                                        All
                                    </Button>
                                </div>
                            </div>
                            <div>
                                <label class="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                    <XCircle class="w-3 h-3 text-destructive" />
                                    Reject Qty
                                </label>
                                <div class="flex items-center gap-1">
                                    <Input
                                        type="number"
                                        v-model.number="item.reject_qty"
                                        @change="onRejectChange(index)"
                                        :min="0"
                                        :max="item.pending_qty"
                                        class="h-8"
                                    />
                                    <Button @click="rejectAll(index)" variant="outline" size="sm" class="h-8 text-xs px-2 text-destructive shrink-0">
                                        All
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <!-- Visual indicator -->
                        <div v-if="item.reject_qty > 0" class="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle class="w-3 h-3" />
                            <span>{{ item.reject_qty }} {{ item.uom }} will be rejected</span>
                        </div>
                    </div>
                </div>
            </ScrollArea>

            <!-- Submit footer -->
            <div class="p-4 border-t border-border bg-muted shrink-0 space-y-3">
                <Input
                    v-model="remarks"
                    placeholder="Remarks (optional, e.g. items damaged)"
                    class="text-sm"
                />
                <div class="flex gap-2">
                    <Button @click="goBackToList" variant="outline" class="flex-1">
                        Cancel
                    </Button>
                    <Button
                        @click="submitReceive"
                        class="flex-1"
                        :disabled="!hasFormData || isSubmitting"
                    >
                        <PackageCheck class="w-4 h-4 mr-1" />
                        {{ isSubmitting ? "Receiving..." : "Receive Stock" }}
                    </Button>
                </div>
            </div>
        </template>

        <!-- List View -->
        <template v-else>
            <!-- List Header -->
            <div class="p-4 border-b border-border bg-muted shrink-0">
                <div class="flex items-center justify-between">
                    <h3 class="font-semibold text-foreground flex items-center gap-2">
                        <Truck class="w-5 h-5" />
                        Stock Receiving
                    </h3>
                    <Button @click="purchaseStore.fetchPendingReceipts()" variant="outline" size="sm"
                        :disabled="purchaseStore.isLoadingReceipts">
                        <RefreshCw class="w-4 h-4 mr-1" :class="{ 'animate-spin': purchaseStore.isLoadingReceipts }" />
                        Refresh
                    </Button>
                </div>
                <p class="text-xs text-muted-foreground mt-1">
                    Purchase Orders pending receipt at {{ posStore.warehouse }}
                </p>
            </div>

            <!-- Pending orders list -->
            <ScrollArea class="flex-1 min-h-0">
                <div v-if="purchaseStore.isLoadingReceipts" class="p-8 text-center text-muted-foreground">
                    <Loader2 class="w-8 h-8 mx-auto mb-3 animate-spin text-muted-foreground/40" />
                    <p>Loading pending orders...</p>
                </div>

                <div v-else-if="purchaseStore.pendingReceipts.length === 0" class="p-8 text-center text-muted-foreground">
                    <PackageCheck class="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                    <p class="font-medium">No pending stock</p>
                    <p class="text-sm mt-1">All orders have been received</p>
                </div>

                <div v-else class="divide-y divide-border">
                    <button
                        v-for="order in purchaseStore.pendingReceipts"
                        :key="order.name"
                        @click="selectOrder(order)"
                        class="w-full p-4 text-left hover:bg-muted transition-colors flex items-center gap-3"
                    >
                        <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Package class="w-5 h-5 text-primary" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between">
                                <p class="font-medium text-foreground truncate">{{ order.name }}</p>
                                <Badge variant="secondary" class="shrink-0 ml-2">
                                    {{ order.items?.length || 0 }} items
                                </Badge>
                            </div>
                            <p class="text-sm text-muted-foreground truncate">
                                {{ order.supplier_name }}
                            </p>
                            <div class="flex items-center gap-3 mt-1 text-xs text-muted-foreground/70">
                                <span>{{ formatDate(order.transaction_date) }}</span>
                                <span>{{ formatCurrency(order.grand_total) }}</span>
                                <span>{{ Math.round(order.per_received) }}% received</span>
                            </div>
                        </div>
                        <ChevronRight class="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                </div>
            </ScrollArea>
        </template>
    </div>
</template>

