<template>
<div class="flex flex-col h-full overflow-hidden bg-background">
<!-- Header -->
<div class="shrink-0 p-4 pb-3">
<div class="flex items-center justify-between mb-4">
<h1 class="text-xl font-bold text-foreground">Order History</h1>
<div class="flex items-center gap-2">
<div class="relative">
<SearchIcon class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
<Input
v-model="searchTerm"
type="text"
placeholder="Search orders..."
class="w-64 pl-9"
@input="debouncedSearch"
/>
</div>
</div>
</div>

<div class="flex items-center gap-3">
<Input v-model="fromDate" type="date" class="w-40" @change="fetchOrders" />
<span class="text-muted-foreground text-sm">to</span>
<Input v-model="toDate" type="date" class="w-40" @change="fetchOrders" />
<Button variant="outline" size="sm" @click="fetchOrders">
<RefreshCw class="w-4 h-4" />
Refresh
</Button>
</div>
</div>

<!-- Orders Table -->
<div class="flex-1 overflow-y-auto px-4 pb-4 xpos-scrollbar">
<!-- Loading -->
<div v-if="isLoading" class="grid gap-3">
<div v-for="i in 5" :key="i" class="skeleton h-16 w-full"></div>
</div>

<!-- Empty -->
<div v-else-if="orders.length === 0" class="flex flex-col items-center justify-center h-64 text-muted-foreground">
<FileText class="w-16 h-16 mb-4 text-muted-foreground/30" />
<p class="text-lg font-medium">No orders found</p>
<p class="text-sm">Try adjusting your search or date range</p>
</div>

<!-- Orders List -->
<div v-else class="space-y-2">
<Card
v-for="order in orders"
:key="order.name"
class="p-4 flex items-center gap-4 cursor-pointer hover:border-primary/30 transition-colors"
@click="viewOrder(order)"
>
<!-- Invoice Number -->
<div class="min-w-0 flex-1">
<div class="flex items-center gap-2">
<span class="font-semibold text-foreground text-sm">{{ order.name }}</span>
<Badge v-if="order.is_return" variant="warning" class="text-[10px]">Return</Badge>
</div>
<div class="text-xs text-muted-foreground mt-0.5">
{{ order.customer_name }} &bull; {{ formatDate(order.posting_date) }}
</div>
</div>

<!-- Status -->
<div>
<Badge :variant="statusVariant(order.status)" class="text-[10px]">{{ order.status }}</Badge>
</div>

<!-- Total -->
<div class="text-right">
<div class="font-bold text-foreground">
{{ posStore.currencySymbol }}{{ formatNumber(order.grand_total) }}
</div>
<div class="text-xs text-muted-foreground">
Paid: {{ posStore.currencySymbol }}{{ formatNumber(order.paid_amount) }}
</div>
</div>

<!-- Arrow -->
<ChevronRight class="w-4 h-4 text-muted-foreground/40" />
</Card>
</div>

<!-- Load More -->
<div v-if="orders.length > 0 && hasMore" class="text-center py-4">
<Button variant="outline" size="sm" :disabled="isLoading" @click="loadMore">
Load More
</Button>
</div>
</div>

<!-- Order Detail Dialog -->
<Dialog :open="!!selectedOrder" @update:open="(val: boolean) => { if (!val) selectedOrder = null }">
<DialogScrollContent class="max-w-2xl">
<DialogHeader class="border-b border-border pb-4">
<DialogTitle>{{ selectedOrder?.name }}</DialogTitle>
<DialogDescription>Invoice details</DialogDescription>
</DialogHeader>

<div v-if="selectedOrder" class="py-4 space-y-4">
<div class="grid grid-cols-2 gap-4 text-sm">
<div>
<span class="text-muted-foreground">Customer</span>
<p class="font-medium text-foreground">{{ selectedOrder.customer_name }}</p>
</div>
<div>
<span class="text-muted-foreground">Date</span>
<p class="font-medium text-foreground">{{ formatDate(selectedOrder.posting_date) }}</p>
</div>
<div>
<span class="text-muted-foreground">Status</span>
<p><Badge :variant="statusVariant(selectedOrder.status)">{{ selectedOrder.status }}</Badge></p>
</div>
<div>
<span class="text-muted-foreground">Grand Total</span>
<p class="font-bold text-foreground text-lg">
{{ posStore.currencySymbol }}{{ formatNumber(selectedOrder.grand_total) }}
</p>
</div>
</div>

<!-- Items -->
<div v-if="selectedOrder.items">
<h3 class="text-sm font-semibold text-muted-foreground mb-2">Items</h3>
<div class="border border-border rounded-lg overflow-hidden">
<table class="w-full text-sm">
<thead class="bg-muted">
<tr>
<th class="text-left px-3 py-2 text-muted-foreground font-medium">Item</th>
<th class="text-right px-3 py-2 text-muted-foreground font-medium">Qty</th>
<th class="text-right px-3 py-2 text-muted-foreground font-medium">Rate</th>
<th class="text-right px-3 py-2 text-muted-foreground font-medium">Amount</th>
</tr>
</thead>
<tbody>
<tr v-for="item in selectedOrder.items" :key="item.item_code" class="border-t border-border">
<td class="px-3 py-2 text-foreground">{{ item.item_name }}</td>
<td class="px-3 py-2 text-right text-muted-foreground">{{ item.qty }}</td>
<td class="px-3 py-2 text-right text-muted-foreground">{{ formatNumber(item.rate) }}</td>
<td class="px-3 py-2 text-right font-medium text-foreground">{{ formatNumber(item.amount ?? 0) }}</td>
</tr>
</tbody>
</table>
</div>
</div>

<!-- Payments -->
<div v-if="selectedOrder.payments">
<h3 class="text-sm font-semibold text-muted-foreground mb-2">Payments</h3>
<div class="space-y-1">
<div v-for="p in selectedOrder.payments" :key="p.mode_of_payment" class="flex justify-between text-sm bg-muted rounded-lg px-3 py-2">
<span class="text-muted-foreground">{{ p.mode_of_payment }}</span>
<span class="font-medium text-foreground">{{ posStore.currencySymbol }}{{ formatNumber(p.amount) }}</span>
</div>
</div>
</div>
</div>

<DialogFooter class="border-t border-border pt-4 gap-2 sm:gap-2">
<Button variant="outline" size="sm" @click="printInvoice(selectedOrder!.name)">
<Printer class="w-4 h-4" />
Print
</Button>
<Button
v-if="selectedOrder && !selectedOrder.is_return && selectedOrder.status !== 'Cancelled'"
variant="outline"
size="sm"
class="text-amber-600 border-amber-300 hover:bg-amber-50"
@click="returnFromOrder(selectedOrder!)"
>
<RotateCcw class="w-4 h-4" />
Return
</Button>
<div class="flex-1"></div>
<Button size="sm" @click="selectedOrder = null">Close</Button>
</DialogFooter>
</DialogScrollContent>
</Dialog>
</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { call } from "@/services/api";
import type { Invoice } from "@/types/pos.types";
import {
Dialog, DialogScrollContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search as SearchIcon, RefreshCw, FileText, ChevronRight, Printer, RotateCcw } from "lucide-vue-next";

const posStore = usePosStore();
const cartStore = useCartStore();
const router = useRouter();

const orders = ref<Invoice[]>([]);
const isLoading = ref(false);
const searchTerm = ref("");
const fromDate = ref("");
const toDate = ref("");
const page = ref(0);
const hasMore = ref(true);
const selectedOrder = ref<Invoice | null>(null);

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
const today = new Date().toISOString().split("T")[0];
fromDate.value = today;
toDate.value = today;
fetchOrders();
});

function debouncedSearch() {
if (searchTimeout) clearTimeout(searchTimeout);
searchTimeout = setTimeout(() => {
page.value = 0;
fetchOrders();
}, 300);
}

async function fetchOrders() {
isLoading.value = true;
try {
const result = await call<Invoice[]>("xpos.api.invoices.get_past_orders", {
pos_profile: posStore.profileName,
from_date: fromDate.value,
to_date: toDate.value,
search_term: searchTerm.value,
page: 0,
limit: 20,
});
orders.value = result || [];
hasMore.value = (result || []).length === 20;
page.value = 0;
} catch (error) {
console.error("Error fetching orders:", error);
} finally {
isLoading.value = false;
}
}

async function loadMore() {
page.value++;
isLoading.value = true;
try {
const result = await call<Invoice[]>("xpos.api.invoices.get_past_orders", {
pos_profile: posStore.profileName,
from_date: fromDate.value,
to_date: toDate.value,
search_term: searchTerm.value,
page: page.value,
limit: 20,
});
orders.value = [...orders.value, ...(result || [])];
hasMore.value = (result || []).length === 20;
} catch (error) {
console.error("Error loading more:", error);
} finally {
isLoading.value = false;
}
}

async function viewOrder(order: Invoice) {
try {
const details = await call<Invoice>("xpos.api.invoices.get_invoice_details", {
invoice_name: order.name,
});
selectedOrder.value = details;
} catch (error) {
console.error("Error fetching order details:", error);
}
}

function printInvoice(name: string) {
if (typeof frappe !== "undefined" && frappe.urllib) {
const url = frappe.urllib.get_full_url(
"/printview?doctype=Sales+Invoice&name=" + encodeURIComponent(name) + "&format=POS+Invoice&no_letterhead=0"
);
window.open(url, "_blank");
}
}

async function returnFromOrder(order: Invoice) {
selectedOrder.value = null;

try {
const details = await call<{ items: Array<{ item_code: string; item_name: string; rate: number; qty: number; uom: string; stock_uom: string; serial_no?: string; batch_no?: string; remaining_returnable_qty?: number }> }>(
"xpos.api.invoices.get_invoice_for_return",
{ invoice_name: order.name }
);

cartStore.clearCart();
cartStore.enterReturnMode(order.name);
cartStore.setCustomer({
name: order.customer || order.customer_name || "",
customer_name: order.customer_name,
});

if (details?.items) {
for (const item of details.items) {
const returnQty = item.remaining_returnable_qty ?? item.qty;
if (returnQty > 0) {
cartStore.addItemWithDetails(
{
item_code: item.item_code,
item_name: item.item_name,
rate: item.rate,
uom: item.uom,
stock_uom: item.stock_uom || item.uom,
},
returnQty,
item.rate,
item.uom,
item.serial_no,
item.batch_no
);
}
}
}

router.push("/pos");
} catch (error) {
console.error("Error preparing return:", error);
}
}

function formatDate(date: string) {
if (!date) return "";
return new Date(date).toLocaleDateString(undefined, {
year: "numeric",
month: "short",
day: "numeric",
});
}

function formatNumber(num: number | string) {
return parseFloat(String(num) || "0").toFixed(2);
}

function statusVariant(status: string): "default" | "success" | "warning" | "destructive" | "secondary" | "outline" {
const map: Record<string, "success" | "warning" | "destructive" | "secondary" | "outline"> = {
Paid: "success",
Unpaid: "warning",
Overdue: "destructive",
"Credit Note Issued": "outline",
Cancelled: "secondary",
Return: "warning",
};
return map[status] || "secondary";
}
</script>
