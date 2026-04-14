<template>
	<div class="flex flex-col h-full overflow-hidden bg-background">
		<div class="shrink-0 p-3 sm:p-4 pb-2 sm:pb-3">
			<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
				<h1 class="text-xl font-bold text-foreground">{{ __("Order History") }}</h1>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<ListFilterBar
					:fields="listView.standardFilterFields.value"
					:model-filters="standardFilterModel"
					@update:model-filters="onStandardFilterUpdate"
				/>
				<SortBy
					:model-value="listView.orderBy.value"
					:fields="listView.allFilterableFields.value"
					@update:model-value="listView.setOrderBy"
				/>
				<div class="flex-1"></div>
				<QueryFilterPanel
					:fields="listView.allFilterableFields.value"
					:model-query-filters="queryFilterModel"
					@update:model-query-filters="onQueryFilterUpdate"
				/>
				<Button variant="outline" size="sm" class="h-8" @click="listView.refresh()">
					<RefreshCw class="h-3.5 w-3.5" />
				</Button>
				<Button
					v-if="hasActiveFilters"
					variant="ghost"
					size="sm"
					class="h-8 text-muted-foreground hover:text-foreground"
					@click="clearAllFilters"
				>
					<X class="h-3.5 w-3.5" />
					{{ __("Clear") }}
				</Button>
			</div>
		</div>

		<div class="flex-1 overflow-y-auto px-3 sm:px-4 xpos-scrollbar">
			<div v-if="listView.isLoading.value && orders.length === 0" class="grid gap-3">
				<div v-for="i in 5" :key="i" class="skeleton h-20 w-full rounded-xl"></div>
			</div>
			<div
				v-else-if="orders.length === 0"
				class="flex flex-col items-center justify-center h-64 text-muted-foreground"
			>
				<FileText class="w-16 h-16 mb-4 text-muted-foreground/30" />
				<p class="text-lg font-medium">{{ __("No orders found") }}</p>
				<p class="text-sm">{{ __("Try adjusting your filters") }}</p>
			</div>

			<div v-else class="space-y-2" :class="{ 'opacity-50': listView.isLoading.value }">
				<Card
					v-for="order in orders"
					:key="order.name"
					class="p-3 sm:p-4 cursor-pointer transition-all duration-200 border-transparent hover:border-primary/40 hover:shadow-md dark:hover:bg-accent/50 dark:hover:shadow-primary/5"
					@click="viewOrder(order)"
				>
					<div class="flex items-center gap-2 sm:gap-4">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2 mb-1 flex-wrap">
								<span class="font-semibold text-foreground text-sm leading-tight">{{
									order.name
								}}</span>
								<Badge :variant="statusVariant(order.status)" class="text-[10px]"
									>{{ __(order.status) }}
								</Badge>
							</div>
							<div
								class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground"
							>
								<span
									class="flex items-center gap-1 min-w-0 truncate max-w-[120px] sm:max-w-none"
								>
									<User class="h-3 w-3 shrink-0" />
									{{ order.customer_name }}
								</span>
								<span class="flex items-center gap-1 whitespace-nowrap">
									<CalendarIcon class="h-3 w-3 shrink-0" />
									{{ formatDate(order.posting_date) }}
								</span>
								<span
									v-if="order.posting_time"
									class="flex items-center gap-1 whitespace-nowrap"
								>
									<Clock class="h-3 w-3 shrink-0" />
									{{ formatTime(String(order.posting_time)) }}
								</span>
							</div>
						</div>

						<div class="text-end shrink-0">
							<div class="font-bold text-foreground text-base sm:text-lg leading-tight">
								{{ posStore.currencySymbol }}{{ formatNumber(order.grand_total) }}
							</div>
							<div class="flex flex-col items-end gap-0 text-xs">
								<span class="text-muted-foreground whitespace-nowrap">
									Paid: {{ posStore.currencySymbol }}{{ formatNumber(order.paid_amount) }}
								</span>
								<span
									v-if="order.total_taxes_and_charges"
									class="text-muted-foreground hidden sm:inline whitespace-nowrap"
								>
									Tax: {{ posStore.currencySymbol
									}}{{ formatNumber(Number(order.total_taxes_and_charges) || 0) }}
								</span>
							</div>
						</div>
						<ChevronRight class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground/40 shrink-0" />
					</div>
				</Card>
			</div>
		</div>

		<Pagination
			v-if="listView.total.value > 0"
			:total="listView.total.value"
			:page-size="listView.pageSize.value"
			:current-page="listView.currentPage.value"
			@update:current-page="listView.setPage"
			@update:page-size="listView.setPageSize"
		/>

		<ReceiptPreviewDialog
			v-model:open="showDetails"
			:invoice="selectedOrder"
			@close="showDetails = false"
		/>
	</div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useListView, type QueryFilter } from "@/composables/useListView";
import type { Invoice } from "@/types/pos.types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ChevronRight, User, Calendar as CalendarIcon, Clock, RefreshCw, X } from "lucide-vue-next";
import ListFilterBar from "@/components/core/ListFilterBar.vue";
import QueryFilterPanel from "@/components/core/QueryFilterPanel.vue";
import SortBy from "@/components/core/SortBy.vue";
import Pagination from "@/components/orders/Pagination.vue";
import __ from "@/lib/translate";
import ReceiptPreviewDialog from "@/components/dialogs/ReceiptPreviewDialog.vue";
import { call, showError } from "@/services/api";

const posStore = usePosStore();
const selectedOrder = ref<Invoice | null>(null);
const showDetails = ref(false);

const listView = useListView({
	doctype: computed(() => posStore.invoiceType),
	fields: [
		"name",
		"customer",
		"customer_name",
		"posting_date",
		"posting_time",
		"grand_total",
		"net_total",
		"paid_amount",
		"outstanding_amount",
		"total_taxes_and_charges",
		"status",
		"is_return",
		"return_against",
		"pos_profile",
		"owner",
	],
	baseFilters: {
		docstatus: 1,
		is_pos: 1,
		pos_profile: posStore.profileName,
	},
	defaultOrderBy: "posting_date desc, posting_time desc",
	defaultPageSize: 20,
});

const orders = computed(() => listView.data.value as unknown as Invoice[]);

const standardFilterModel = computed(() => {
	const model: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(listView.filters)) {
		if (value !== undefined && value !== null && value !== "") {
			model[key] = value;
		}
	}
	return model;
});

function onStandardFilterUpdate(updated: Record<string, unknown>) {
	for (const key of Object.keys(listView.filters)) {
		if (!(key in updated)) {
			listView.removeFilter(key);
		}
	}
	for (const [key, value] of Object.entries(updated)) {
		listView.setFilter(key, value);
	}
}

const queryFilterModel = computed(() =>
	listView.queryFilters.value.map((qf) => ({
		field: qf.field,
		operator: qf.operator,
		value: qf.value,
	})),
);

function onQueryFilterUpdate(filters: { field: string; operator: string; value: string }[]) {
	listView.setQueryFilters(
		filters.map((f) => ({
			field: f.field,
			operator: f.operator as QueryFilter["operator"],
			value: f.value,
		})),
	);
}

const invoiceSearch = ref("");

const hasActiveFilters = computed(() => {
	return Object.keys(listView.filters).length > 0 || listView.queryFilters.value.length > 0;
});

function clearAllFilters() {
	invoiceSearch.value = "";
	listView.clearFilters();
}

async function viewOrder(order: Invoice) {
	try {
		const details = await call<Invoice>("xpos.api.invoices.get_invoice_details", {
			invoice_name: order.name,
		});
		selectedOrder.value = details;
		showDetails.value = true;
	} catch (error) {
		console.error("Error fetching order details:", error);
		showError(__("Failed to fetch order details"));
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

function formatTime(time: string) {
	if (!time) return "";
	const [hours, minutes] = time.split(":");
	const h = parseInt(hours);
	const ampm = h >= 12 ? "PM" : "AM";
	const hour12 = h % 12 || 12;
	return `${hour12}:${minutes} ${ampm}`;
}

function formatNumber(num: number | string) {
	return parseFloat(String(num) || "0").toFixed(2);
}

function statusVariant(
	status: string,
): "default" | "success" | "warning" | "destructive" | "secondary" | "outline" {
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
