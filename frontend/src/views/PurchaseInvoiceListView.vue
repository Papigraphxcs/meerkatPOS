<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { usePosStore } from "@/stores/posStore";
import { useListView, type QueryFilter } from "@/composables/useListView";
import { getDoc } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Plus, ChevronRight, Calendar, Receipt, RefreshCw, X, FileText } from "lucide-vue-next";
import __ from "@/lib/translate";
import type { PurchaseInvoice } from "@/types/pos.types";
import ListFilterBar from "@/components/core/ListFilterBar.vue";
import QueryFilterPanel from "@/components/core/QueryFilterPanel.vue";
import SortBy from "@/components/core/SortBy.vue";
import Pagination from "@/components/orders/Pagination.vue";
import PurchaseInvoiceDetailDialog from "@/components/dialogs/PurchaseInvoiceDetailDialog.vue";

const router = useRouter();
const posStore = usePosStore();

const selectedInvoice = ref<PurchaseInvoice | null>(null);
const isLoadingDetail = ref(false);

const listView = useListView({
	doctype: "Purchase Invoice",
	fields: [
		"name",
		"supplier",
		"supplier_name",
		"company",
		"posting_date",
		"bill_no",
		"grand_total",
		"outstanding_amount",
		"status",
		"docstatus",
	],
	baseFilters: { docstatus: 1 },
	defaultOrderBy: "posting_date desc",
	defaultPageSize: 20,
});

const invoices = computed(() => listView.data.value as unknown as PurchaseInvoice[]);

const standardFilterModel = computed(() => {
	const model: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(listView.filters)) {
		if (value !== undefined && value !== null && value !== "") model[key] = value;
	}
	return model;
});

function onStandardFilterUpdate(updated: Record<string, unknown>) {
	for (const key of Object.keys(listView.filters)) {
		if (!(key in updated)) listView.removeFilter(key);
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
		filters.map((filter) => ({
			field: filter.field,
			operator: filter.operator as QueryFilter["operator"],
			value: filter.value,
		})),
	);
}

const hasActiveFilters = computed(
	() => Object.keys(listView.filters).length > 0 || listView.queryFilters.value.length > 0,
);

function clearAllFilters() {
	listView.clearFilters();
}

async function viewInvoice(invoice: PurchaseInvoice): Promise<void> {
	isLoadingDetail.value = true;
	selectedInvoice.value = { ...invoice, items: [] };
	try {
		const detail = await getDoc<PurchaseInvoice>("Purchase Invoice", invoice.name);
		selectedInvoice.value = detail || invoice;
	} catch {
		selectedInvoice.value = invoice;
	} finally {
		isLoadingDetail.value = false;
	}
}

function createNewInvoice(): void {
	router.push("/purchase-invoice");
}

function formatCurrency(value: number): string {
	return `${posStore.currencySymbol}${(value || 0).toFixed(2)}`;
}

function formatDate(date: string): string {
	if (!date) return "-";
	return new Date(date).toLocaleDateString();
}

function statusVariant(
	status: string,
): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" {
	switch (status) {
		case "Paid":
			return "success";
		case "Unpaid":
		case "Partly Paid":
		case "Overdue":
			return "warning";
		case "Draft":
			return "secondary";
		case "Cancelled":
			return "destructive";
		default:
			return "outline";
	}
}
</script>

<template>
	<div class="flex flex-col h-full overflow-hidden bg-background">
		<div class="shrink-0 p-3 sm:p-4 pb-2 sm:pb-3">
			<div class="flex items-center justify-between gap-3 mb-4">
				<h1 class="text-xl font-bold text-foreground">{{ __("Purchase Invoices") }}</h1>
				<Button size="sm" @click="createNewInvoice">
					<Plus class="w-4 h-4" />
					{{ __("New Invoice") }}
				</Button>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<div class="hidden sm:contents">
					<ListFilterBar
						:fields="listView.standardFilterFields.value"
						:model-filters="standardFilterModel"
						@update:model-filters="onStandardFilterUpdate"
					/>
				</div>
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

		<div class="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3 xpos-scrollbar">
			<div v-if="listView.isLoading.value && invoices.length === 0" class="grid gap-3">
				<div v-for="i in 5" :key="i" class="skeleton h-20 w-full rounded-xl"></div>
			</div>
			<div
				v-else-if="invoices.length === 0"
				class="flex flex-col items-center justify-center h-64 text-muted-foreground"
			>
				<Receipt class="w-16 h-16 mb-4 text-muted-foreground/30" />
				<p class="text-lg font-medium">{{ __("No purchase invoices found") }}</p>
				<p class="text-sm">{{ __("Create a new invoice or adjust your filters") }}</p>
			</div>

			<div v-else class="space-y-2" :class="{ 'opacity-50': listView.isLoading.value }">
				<Card
					v-for="invoice in invoices"
					:key="invoice.name"
					class="p-3 sm:p-4 cursor-pointer transition-all duration-200 border-transparent hover:border-primary/40 hover:shadow-md dark:hover:bg-accent/50"
					@click="viewInvoice(invoice)"
				>
					<div class="flex items-center gap-2 sm:gap-4">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2 mb-1 flex-wrap">
								<span class="font-semibold text-foreground text-sm leading-tight">
									{{ invoice.name }}
								</span>
								<Badge :variant="statusVariant(invoice.status)" class="text-[10px]">
									{{ __(invoice.status) }}
								</Badge>
							</div>
							<div
								class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground"
							>
								<span class="flex items-center gap-1">
									<Receipt class="h-3 w-3 shrink-0" />
									{{ invoice.supplier_name || invoice.supplier }}
								</span>
								<span class="flex items-center gap-1 whitespace-nowrap">
									<Calendar class="h-3 w-3 shrink-0" />
									{{ formatDate(invoice.posting_date) }}
								</span>
								<span v-if="invoice.purchase_order" class="flex items-center gap-1 truncate">
									<FileText class="h-3 w-3 shrink-0" />
									{{ invoice.purchase_order }}
								</span>
							</div>
						</div>

						<div class="text-end shrink-0">
							<div class="font-bold text-foreground text-base sm:text-lg leading-tight">
								{{ formatCurrency(invoice.grand_total || 0) }}
							</div>
							<div class="text-xs text-muted-foreground">
								{{ __("Outstanding") }}:
								{{ formatCurrency(invoice.outstanding_amount || 0) }}
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

		<PurchaseInvoiceDetailDialog
			:invoice="selectedInvoice"
			:is-loading="isLoadingDetail"
			@close="selectedInvoice = null"
		/>
	</div>
</template>
