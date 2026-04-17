<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { usePurchaseStore } from "@/stores/purchaseStore";
import { usePosStore } from "@/stores/posStore";
import { useListView, type QueryFilter } from "@/composables/useListView";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, ChevronRight, Calendar, Package, RefreshCw, Edit, Trash2, X } from "lucide-vue-next";
import __ from "@/lib/translate";
import type { PurchaseOrder } from "@/types/pos.types";
import ListFilterBar from "@/components/core/ListFilterBar.vue";
import QueryFilterPanel from "@/components/core/QueryFilterPanel.vue";
import SortBy from "@/components/core/SortBy.vue";
import Pagination from "@/components/orders/Pagination.vue";
import PurchaseOrderDetailDialog from "@/components/dialogs/PurchaseOrderDetailDialog.vue";

const router = useRouter();
const purchaseStore = usePurchaseStore();
const posStore = usePosStore();

const selectedOrder = ref<PurchaseOrder | null>(null);
const isLoadingDetail = ref(false);

const draftOrders = ref<
	Array<{
		name: string;
		supplier: string;
		supplier_name: string;
		transaction_date: string;
		creation: string;
		modified: string;
		items_count: number;
	}>
>([]);

const listView = useListView({
	doctype: "Purchase Order",
	fields: [
		"name",
		"supplier",
		"supplier_name",
		"company",
		"transaction_date",
		"grand_total",
		"status",
		"docstatus",
		"per_received",
		"per_billed",
	],
	baseFilters: { docstatus: 1 },
	defaultOrderBy: "modified desc",
	defaultPageSize: 20,
});

const orders = computed(() => listView.data.value as unknown as PurchaseOrder[]);

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
		filters.map((f) => ({
			field: f.field,
			operator: f.operator as QueryFilter["operator"],
			value: f.value,
		})),
	);
}

const hasActiveFilters = computed(
	() => Object.keys(listView.filters).length > 0 || listView.queryFilters.value.length > 0,
);

function clearAllFilters() {
	listView.clearFilters();
}

async function viewOrder(order: PurchaseOrder): Promise<void> {
	isLoadingDetail.value = true;
	selectedOrder.value = { ...order, items: [] };
	try {
		const detail = await purchaseStore.fetchReceiptDetail(order.name);
		selectedOrder.value = { ...order, items: detail?.items || [] };
	} catch {
		selectedOrder.value = order;
	} finally {
		isLoadingDetail.value = false;
	}
}

function createNewOrder(): void {
	purchaseStore.clearCart();
	purchaseStore.clearSupplier();
	purchaseStore.currentDraftName = null;
	router.push("/purchase-order");
}

async function editDraftOrder(draft: { name: string }): Promise<void> {
	await purchaseStore.loadDraft(draft.name);
	router.push("/purchase-order");
}

async function deleteDraftOrder(name: string): Promise<void> {
	await purchaseStore.deleteDraft(name);
	await loadDrafts();
}

async function loadDrafts(): Promise<void> {
	draftOrders.value = await purchaseStore.getAllDrafts();
}

function editSubmittedOrder(order: PurchaseOrder): void {
	purchaseStore.loadFromOrder(order);
	selectedOrder.value = null;
	router.push("/purchase-order");
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
		case "Completed":
			return "success";
		case "Draft":
			return "secondary";
		case "To Receive and Bill":
		case "To Receive":
		case "To Bill":
			return "warning";
		case "Cancelled":
			return "destructive";
		default:
			return "outline";
	}
}

onMounted(() => {
	purchaseStore.init();
	loadDrafts();
});
</script>

<template>
	<div class="flex flex-col h-full overflow-hidden bg-background">
		<div class="shrink-0 p-3 sm:p-4 pb-2 sm:pb-3">
			<div class="flex items-center justify-between gap-3 mb-4">
				<h1 class="text-xl font-bold text-foreground">{{ __("Purchase Orders") }}</h1>
				<Button size="sm" @click="createNewOrder">
					<Plus class="w-4 h-4" />
					{{ __("New Order") }}
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

		<div class="flex flex-1 min-h-0 overflow-hidden">
			<div
				v-if="draftOrders.length > 0"
				class="w-64 border-e border-border bg-card flex flex-col shrink-0"
			>
				<div class="px-3 py-2 border-b border-border bg-muted">
					<span class="text-sm font-medium text-foreground">
						{{ __("Drafts") }} ({{ draftOrders.length }})
					</span>
				</div>
				<ScrollArea class="flex-1 min-h-0">
					<div class="divide-y divide-border">
						<div
							v-for="draft in draftOrders"
							:key="draft.name"
							class="p-3 hover:bg-muted/50 transition-colors"
						>
							<div class="flex items-center justify-between mb-1">
								<span class="text-sm font-medium text-foreground truncate">
									{{ draft.supplier_name || draft.supplier || __("No Supplier") }}
								</span>
								<Badge variant="secondary" class="text-[10px]">{{ __("Draft") }}</Badge>
							</div>
							<div class="text-xs text-muted-foreground mb-2">
								{{ formatDate(draft.modified) }} · {{ draft.items_count || 0 }}
								{{ __("items") }}
							</div>
							<div class="flex gap-1">
								<Button
									@click="editDraftOrder(draft)"
									variant="outline"
									size="sm"
									class="flex-1 h-7"
								>
									<Edit class="w-3 h-3" />
									{{ __("Edit") }}
								</Button>
								<Button
									@click="deleteDraftOrder(draft.name)"
									variant="ghost"
									size="icon"
									class="h-7 w-7 text-destructive hover:text-destructive"
								>
									<Trash2 class="w-3 h-3" />
								</Button>
							</div>
						</div>
					</div>
				</ScrollArea>
			</div>

			<div class="flex-1 flex flex-col min-h-0 overflow-hidden">
				<div class="flex-1 overflow-y-auto px-3 sm:px-4 py-3 xpos-scrollbar">
					<div v-if="listView.isLoading.value && orders.length === 0" class="grid gap-3">
						<div v-for="i in 5" :key="i" class="skeleton h-20 w-full rounded-xl"></div>
					</div>
					<div
						v-else-if="orders.length === 0"
						class="flex flex-col items-center justify-center h-64 text-muted-foreground"
					>
						<Package class="w-16 h-16 mb-4 text-muted-foreground/30" />
						<p class="text-lg font-medium">{{ __("No purchase orders found") }}</p>
						<p class="text-sm">{{ __("Create a new order or adjust your filters") }}</p>
					</div>

					<div v-else class="space-y-2" :class="{ 'opacity-50': listView.isLoading.value }">
						<Card
							v-for="order in orders"
							:key="order.name"
							class="p-3 sm:p-4 cursor-pointer transition-all duration-200 border-transparent hover:border-primary/40 hover:shadow-md dark:hover:bg-accent/50"
							@click="viewOrder(order)"
						>
							<div class="flex items-center gap-2 sm:gap-4">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2 mb-1 flex-wrap">
										<span class="font-semibold text-foreground text-sm leading-tight">{{
											order.name
										}}</span>
										<Badge :variant="statusVariant(order.status)" class="text-[10px]">{{
											__(order.status)
										}}</Badge>
									</div>
									<div
										class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground"
									>
										<span class="flex items-center gap-1">
											<Package class="h-3 w-3 shrink-0" />
											{{ order.supplier_name || order.supplier }}
										</span>
										<span class="flex items-center gap-1 whitespace-nowrap">
											<Calendar class="h-3 w-3 shrink-0" />
											{{ formatDate(order.transaction_date) }}
										</span>
									</div>
								</div>

								<div class="text-end shrink-0">
									<div class="font-bold text-foreground text-base sm:text-lg leading-tight">
										{{ formatCurrency(order.grand_total) }}
									</div>
									<div
										class="flex items-center gap-2 justify-end text-xs text-muted-foreground"
									>
										<span>{{ __("Recv") }}: {{ order.per_received || 0 }}%</span>
										<span>{{ __("Billed") }}: {{ order.per_billed || 0 }}%</span>
									</div>
								</div>
								<ChevronRight
									class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground/40 shrink-0"
								/>
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
			</div>
		</div>

		<PurchaseOrderDetailDialog
			:order="selectedOrder"
			:is-loading="isLoadingDetail"
			@close="selectedOrder = null"
			@edit="editSubmittedOrder"
		/>
	</div>
</template>
