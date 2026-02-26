<template>
	<div class="flex flex-col h-full overflow-hidden bg-surface-50">
		<!-- Header -->
		<div class="shrink-0 p-4 pb-3">
			<div class="flex items-center justify-between mb-4">
				<h1 class="text-xl font-bold text-surface-800">Order History</h1>
				<div class="flex items-center gap-2">
					<input
						v-model="searchTerm"
						type="text"
						placeholder="Search orders..."
						class="xpos-input w-64"
						@input="debouncedSearch"
					/>
				</div>
			</div>

			<div class="flex items-center gap-3">
				<input
					v-model="fromDate"
					type="date"
					class="xpos-input w-40"
					@change="fetchOrders"
				/>
				<span class="text-surface-400 text-sm">to</span>
				<input
					v-model="toDate"
					type="date"
					class="xpos-input w-40"
					@change="fetchOrders"
				/>
				<button @click="fetchOrders" class="xpos-btn-secondary text-sm">
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
					Refresh
				</button>
			</div>
		</div>

		<!-- Orders Table -->
		<div class="flex-1 overflow-y-auto px-4 pb-4 xpos-scrollbar">
			<!-- Loading -->
			<div v-if="isLoading" class="grid gap-3">
				<div v-for="i in 5" :key="i" class="xpos-skeleton h-16 w-full"></div>
			</div>

			<!-- Empty -->
			<div v-else-if="orders.length === 0" class="flex flex-col items-center justify-center h-64 text-surface-400">
				<svg class="w-16 h-16 mb-4 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
				<p class="text-lg font-medium">No orders found</p>
				<p class="text-sm">Try adjusting your search or date range</p>
			</div>

			<!-- Orders List -->
			<div v-else class="space-y-2">
				<div
					v-for="order in orders"
					:key="order.name"
					class="xpos-card p-4 flex items-center gap-4 animate-fade-in cursor-pointer hover:border-primary-200"
					@click="viewOrder(order)"
				>
					<!-- Invoice Number -->
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<span class="font-semibold text-surface-800 text-sm">{{ order.name }}</span>
							<span v-if="order.is_return" class="xpos-badge-warning text-[10px]">Return</span>
						</div>
						<div class="text-xs text-surface-400 mt-0.5">
							{{ order.customer_name }} • {{ formatDate(order.posting_date) }}
						</div>
					</div>

					<!-- Status -->
					<div>
						<span
							class="xpos-badge text-[10px]"
							:class="statusClass(order.status)"
						>
							{{ order.status }}
						</span>
					</div>

					<!-- Total -->
					<div class="text-right">
						<div class="font-bold text-surface-800">
							{{ posStore.currencySymbol }}{{ formatNumber(order.grand_total) }}
						</div>
						<div class="text-xs text-surface-400">
							Paid: {{ posStore.currencySymbol }}{{ formatNumber(order.paid_amount) }}
						</div>
					</div>

					<!-- Arrow -->
					<svg class="w-4 h-4 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
					</svg>
				</div>
			</div>

			<!-- Load More -->
			<div v-if="orders.length > 0 && hasMore" class="text-center py-4">
				<button @click="loadMore" class="xpos-btn-secondary text-sm" :disabled="isLoading">
					Load More
				</button>
			</div>
		</div>

		<!-- Order Detail Modal -->
		<transition name="fade">
			<div v-if="selectedOrder" class="xpos-overlay" @click.self="selectedOrder = null">
				<div class="xpos-dialog-lg p-6 overflow-y-auto max-h-[80vh]">
					<div class="flex items-center justify-between mb-4">
						<h2 class="text-lg font-bold text-surface-800">{{ selectedOrder.name }}</h2>
						<button @click="selectedOrder = null" class="xpos-btn-icon">
							<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>

					<div class="grid grid-cols-2 gap-4 mb-4 text-sm">
						<div>
							<span class="text-surface-400">Customer</span>
							<p class="font-medium text-surface-700">{{ selectedOrder.customer_name }}</p>
						</div>
						<div>
							<span class="text-surface-400">Date</span>
							<p class="font-medium text-surface-700">{{ formatDate(selectedOrder.posting_date) }}</p>
						</div>
						<div>
							<span class="text-surface-400">Status</span>
							<p><span class="xpos-badge" :class="statusClass(selectedOrder.status)">{{ selectedOrder.status }}</span></p>
						</div>
						<div>
							<span class="text-surface-400">Grand Total</span>
							<p class="font-bold text-surface-800 text-lg">
								{{ posStore.currencySymbol }}{{ formatNumber(selectedOrder.grand_total) }}
							</p>
						</div>
					</div>

					<!-- Items -->
					<div v-if="selectedOrder.items" class="mb-4">
						<h3 class="text-sm font-semibold text-surface-600 mb-2">Items</h3>
						<div class="border border-surface-200 rounded-xl overflow-hidden">
							<table class="w-full text-sm">
								<thead class="bg-surface-50">
									<tr>
										<th class="text-left px-3 py-2 text-surface-500 font-medium">Item</th>
										<th class="text-right px-3 py-2 text-surface-500 font-medium">Qty</th>
										<th class="text-right px-3 py-2 text-surface-500 font-medium">Rate</th>
										<th class="text-right px-3 py-2 text-surface-500 font-medium">Amount</th>
									</tr>
								</thead>
								<tbody>
									<tr v-for="item in selectedOrder.items" :key="item.item_code" class="border-t border-surface-100">
										<td class="px-3 py-2 text-surface-700">{{ item.item_name }}</td>
										<td class="px-3 py-2 text-right text-surface-600">{{ item.qty }}</td>
										<td class="px-3 py-2 text-right text-surface-600">{{ formatNumber(item.rate) }}</td>
										<td class="px-3 py-2 text-right font-medium text-surface-800">{{ formatNumber(item.amount ?? 0) }}</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>

					<!-- Payments -->
					<div v-if="selectedOrder.payments" class="mb-4">
						<h3 class="text-sm font-semibold text-surface-600 mb-2">Payments</h3>
						<div class="space-y-1">
							<div v-for="p in selectedOrder.payments" :key="p.mode_of_payment" class="flex justify-between text-sm bg-surface-50 rounded-lg px-3 py-2">
								<span class="text-surface-600">{{ p.mode_of_payment }}</span>
								<span class="font-medium text-surface-800">{{ posStore.currencySymbol }}{{ formatNumber(p.amount) }}</span>
							</div>
						</div>
					</div>

					<div class="flex justify-end gap-2 mt-4">
						<button @click="printInvoice(selectedOrder.name)" class="xpos-btn-secondary text-sm">
							<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
							</svg>
							Print
						</button>
						<button @click="selectedOrder = null" class="xpos-btn-primary text-sm">Close</button>
					</div>
				</div>
			</div>
		</transition>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { usePosStore } from "@/stores/posStore";
import { call } from "@/services/api";
import type { Invoice } from "@/types/pos.types";

const posStore = usePosStore();

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
	// Default date range: today
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
			`/printview?doctype=Sales+Invoice&name=${encodeURIComponent(name)}&format=POS+Invoice&no_letterhead=0`
		);
		window.open(url, "_blank");
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

function statusClass(status: string) {
	const map: Record<string, string> = {
		Paid: "bg-emerald-100 text-emerald-700",
		Unpaid: "bg-amber-100 text-amber-700",
		Overdue: "bg-red-100 text-red-700",
		"Credit Note Issued": "bg-blue-100 text-blue-700",
		Cancelled: "bg-surface-100 text-surface-500",
		"Return": "bg-amber-100 text-amber-700",
	};
	return map[status] || "bg-surface-100 text-surface-600";
}
</script>
