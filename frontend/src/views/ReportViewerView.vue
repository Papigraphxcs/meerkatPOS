<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
	AlertTriangle,
	ArrowLeft,
	ArrowUpDown,
	BarChart3,
	CalendarDays,
	ChevronRight,
	Copy,
	Download,
	Filter,
	Layers3,
	Link2,
	Lock,
	RefreshCw,
	Search,
	Sparkles,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectTriggerStyled,
	SelectContentStyled,
	SelectItemStyled,
	SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import LinkField from "@/components/ui/link/LinkField.vue";
import Pagination from "@/components/orders/Pagination.vue";
import MultiLinkInput from "@/components/reports/MultiLinkInput.vue";
import ReportDataTable, { type ReportSortState } from "@/components/reports/ReportDataTable.vue";
import __ from "@/lib/translate";
import { showError, showSuccess } from "@/services/api";
import { usePosStore } from "@/stores/posStore";
import { extractErrorMessage, isOnline } from "@/utils";
import {
	buildInitialReportFilters,
	fetchReportData,
	formatReportCell,
	getReportDefinition,
	getVisibleReportColumns,
	hydrateReportFiltersFromQuery,
	isReportAccessible,
	normalizeReportFilters,
	serializeReportFiltersToQuery,
	type ReportColumn,
	type ReportDefinition,
	type ReportSummaryItem,
	type ReportTone,
} from "@/services/reports";

const route = useRoute();
const router = useRouter();
const posStore = usePosStore();

const activeReport = computed<ReportDefinition | undefined>(() =>
	getReportDefinition(route.params.reportSlug),
);
const isReportVisible = computed(() => Boolean(activeReport.value));
const isReportAllowed = computed(() => (activeReport.value ? isReportAccessible(activeReport.value) : false));

const reportColumns = ref<ReportColumn[]>([]);
const reportRows = ref<Record<string, unknown>[]>([]);
const reportSummary = ref<ReportSummaryItem[]>([]);
const isLoading = ref(false);
const errorMessage = ref("");
const lastRefreshedAt = ref<string | null>(null);
const searchTerm = ref("");
const sortState = ref<ReportSortState | null>(null);
const currentPage = ref(1);
const pageSize = ref(20);
const filterState = reactive<Record<string, unknown>>({});

const toneClasses: Record<ReportTone, { accent: string; chip: string; icon: string; panel: string }> = {
	emerald: {
		accent: "from-emerald-500/20 via-emerald-500/10 to-transparent",
		chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
		icon: "text-emerald-500",
		panel: "border-emerald-500/20 bg-emerald-500/5",
	},
	blue: {
		accent: "from-sky-500/20 via-sky-500/10 to-transparent",
		chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
		icon: "text-sky-500",
		panel: "border-sky-500/20 bg-sky-500/5",
	},
	amber: {
		accent: "from-amber-500/20 via-amber-500/10 to-transparent",
		chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
		icon: "text-amber-500",
		panel: "border-amber-500/20 bg-amber-500/5",
	},
	violet: {
		accent: "from-violet-500/20 via-violet-500/10 to-transparent",
		chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
		icon: "text-violet-500",
		panel: "border-violet-500/20 bg-violet-500/5",
	},
	cyan: {
		accent: "from-cyan-500/20 via-cyan-500/10 to-transparent",
		chip: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
		icon: "text-cyan-500",
		panel: "border-cyan-500/20 bg-cyan-500/5",
	},
};

const contextDefaults = computed(() => ({
	company: posStore.companyName || "",
	warehouse: posStore.warehouse || "",
}));

const visibleColumns = computed(() => getVisibleReportColumns(reportColumns.value));
const summaryItems = computed(() => reportSummary.value || []);
const activeTone = computed<ReportTone>(() => activeReport.value?.tone ?? "emerald");
const isInitialLoading = computed(() => isLoading.value && reportRows.value.length === 0);
const totalRows = computed(() => filteredRows.value.length);
const pagedRows = computed(() => {
	const start = (currentPage.value - 1) * pageSize.value;
	return filteredRows.value.slice(start, start + pageSize.value);
});
const missingRequiredFilters = computed(() => {
	if (!activeReport.value) return [] as string[];
	return activeReport.value.filters
		.filter((filter) => filter.required)
		.filter((filter) => !isValidFilterValue(filterState[filter.fieldname]))
		.map((filter) => filter.label);
});
const sortFieldOptions = computed(() =>
	visibleColumns.value.map((column) => ({ label: column.label, value: column.fieldname })),
);

const dependentFieldMap = computed(() => {
	const map = new Map<string, string[]>();
	if (!activeReport.value) return map;

	for (const field of activeReport.value.filters) {
		for (const dependency of field.dependsOn || []) {
			const existing = map.get(dependency) || [];
			map.set(dependency, [...existing, field.fieldname]);
		}
	}

	return map;
});

const filteredRows = computed(() => {
	const query = searchTerm.value.trim().toLowerCase();
	const rows = reportRows.value.filter((row) => {
		if (!query) return true;
		return visibleColumns.value.some((column) => {
			const value = formatReportCell(column, row[column.fieldname], posStore.currencySymbol);
			return value.toLowerCase().includes(query);
		});
	});

	if (!sortState.value) return rows;
	const column = visibleColumns.value.find((item) => item.fieldname === sortState.value?.fieldname);
	if (!column) return rows;

	return [...rows]
		.map((row, index) => ({ row, index }))
		.sort((left, right) => {
			const comparison = compareRows(left.row, right.row, column);
			if (comparison !== 0) {
				return sortState.value?.direction === "desc" ? -comparison : comparison;
			}
			return left.index - right.index;
		})
		.map((entry) => entry.row);
});

watch(
	() => route.params.reportSlug,
	async () => {
		await loadReport();
	},
	{ immediate: true },
);

watch(searchTerm, () => {
	currentPage.value = 1;
});

watch(sortState, () => {
	currentPage.value = 1;
});

function resetReportState() {
	for (const key of Object.keys(filterState)) {
		delete filterState[key];
	}
	reportColumns.value = [];
	reportRows.value = [];
	reportSummary.value = [];
	errorMessage.value = "";
	searchTerm.value = "";
	sortState.value = null;
	currentPage.value = 1;
	lastRefreshedAt.value = null;
}

async function loadReport() {
	const report = activeReport.value;
	resetReportState();

	if (!report) {
		errorMessage.value = __("Report not found.");
		document.title = `${__("Reports")} | X POS`;
		return;
	}

	if (!isReportAccessible(report)) {
		errorMessage.value = __("You do not have access to this report.");
		document.title = `${report.title} | X POS`;
		return;
	}

	Object.assign(filterState, buildInitialReportFilters(report, contextDefaults.value));
	Object.assign(
		filterState,
		hydrateReportFiltersFromQuery(
			report,
			route.query as Record<string, string | string[] | null | undefined>,
		),
	);
	document.title = `${report.title} | X POS`;
	await runReport();
}

function setFilterValue(fieldname: string, value: unknown) {
	filterState[fieldname] = value;

	const dependents = dependentFieldMap.value.get(fieldname) || [];
	for (const dependentField of dependents) {
		const dependentDefinition = activeReport.value?.filters.find(
			(item) => item.fieldname === dependentField,
		);
		if (!dependentDefinition) continue;
		filterState[dependentField] = dependentDefinition.type === "multi-link" ? [] : "";
	}
}

function getStringFilterValue(fieldname: string): string {
	const value = filterState[fieldname];
	if (value === null || value === undefined) return "";
	if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
	return String(value);
}

function getMultiFilterValue(fieldname: string): string[] {
	const value = filterState[fieldname];
	if (!Array.isArray(value)) return [];
	return value.map((item) => String(item));
}

function getSelectFilterValue(fieldname: string): string {
	return getStringFilterValue(fieldname);
}

function getLinkFilters(filter: NonNullable<ReportDefinition["filters"]>[number]): Record<string, unknown> {
	return filter.linkFilters ? filter.linkFilters(filterState) : {};
}

function getFilterPlaceholder(filter: NonNullable<ReportDefinition["filters"]>[number]): string {
	if (filter.placeholder) return filter.placeholder;
	if (filter.type === "multi-link") return `Search and add ${filter.label.toLowerCase()}...`;
	if (filter.type === "link") return `Search ${filter.label.toLowerCase()}...`;
	return filter.label;
}

function formatSummaryValue(value: unknown): string {
	if (value === null || value === undefined || value === "") return "—";
	if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
	if (typeof value === "number") {
		return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
	}
	return String(value);
}

function isValidFilterValue(value: unknown): boolean {
	if (Array.isArray(value)) return value.length > 0;
	if (value === null || value === undefined) return false;
	if (typeof value === "string") return value.trim().length > 0;
	return true;
}

async function runReport() {
	const report = activeReport.value;
	if (!report) return;

	if (!isReportAccessible(report)) {
		errorMessage.value = __("You do not have access to this report.");
		showError(errorMessage.value);
		return;
	}

	if (!isOnline()) {
		errorMessage.value = __("You are offline. Connect to the server and try again.");
		showError(errorMessage.value);
		return;
	}

	const missingFilters = report.filters
		.filter((filter) => filter.required)
		.filter((filter) => !isValidFilterValue(filterState[filter.fieldname]))
		.map((filter) => filter.label);

	if (missingFilters.length > 0) {
		errorMessage.value = __("Please fill the required filters: {0}", [missingFilters.join(", ")]);
		showError(errorMessage.value);
		return;
	}

	isLoading.value = true;
	errorMessage.value = "";

	try {
		const payload = normalizeReportFilters(report, filterState);
		const response = await fetchReportData(report.reportName, payload);
		reportColumns.value = response.columns || [];
		reportRows.value = Array.isArray(response.result) ? response.result : [];
		reportSummary.value = Array.isArray(response.report_summary) ? response.report_summary : [];
		lastRefreshedAt.value = new Date().toLocaleString();
		currentPage.value = 1;
		await router.replace({ path: route.path, query: serializeReportFiltersToQuery(report, filterState) });
		if (response.message) {
			showSuccess(response.message);
		}
	} catch (error) {
		errorMessage.value = extractErrorMessage(error);
		showError(errorMessage.value);
	} finally {
		isLoading.value = false;
	}
}

function compareRows(
	left: Record<string, unknown>,
	right: Record<string, unknown>,
	column: ReportColumn,
): number {
	const leftValue = left[column.fieldname];
	const rightValue = right[column.fieldname];
	const fieldtype = String(column.fieldtype || "");

	if (["Currency", "Float", "Int", "Percent", "Check"].includes(fieldtype)) {
		const leftNumber = Number(leftValue ?? 0);
		const rightNumber = Number(rightValue ?? 0);
		if (Number.isNaN(leftNumber) && Number.isNaN(rightNumber)) return 0;
		if (Number.isNaN(leftNumber)) return 1;
		if (Number.isNaN(rightNumber)) return -1;
		return leftNumber - rightNumber;
	}

	if (["Date", "Datetime"].includes(fieldtype)) {
		const leftTime = new Date(String(leftValue || "")).getTime();
		const rightTime = new Date(String(rightValue || "")).getTime();
		if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
		if (Number.isNaN(leftTime)) return 1;
		if (Number.isNaN(rightTime)) return -1;
		return leftTime - rightTime;
	}

	return String(leftValue ?? "").localeCompare(String(rightValue ?? ""), undefined, {
		numeric: true,
		sensitivity: "base",
	});
}

function toggleSort(fieldname: string) {
	if (!sortState.value || sortState.value.fieldname !== fieldname) {
		sortState.value = { fieldname, direction: "asc" };
		return;
	}

	if (sortState.value.direction === "asc") {
		sortState.value = { fieldname, direction: "desc" };
		return;
	}

	sortState.value = null;
}

function setSortField(fieldname: string | undefined) {
	if (!fieldname) {
		sortState.value = null;
		return;
	}

	if (!sortState.value || sortState.value.fieldname !== fieldname) {
		sortState.value = { fieldname, direction: "asc" };
	}
}

function toggleSortDirection() {
	if (!sortState.value) return;
	sortState.value = {
		fieldname: sortState.value.fieldname,
		direction: sortState.value.direction === "asc" ? "desc" : "asc",
	};
}

function clearSort() {
	sortState.value = null;
}

async function copyText(text: string) {
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}

	const textarea = document.createElement("textarea");
	textarea.value = text;
	document.body.appendChild(textarea);
	textarea.select();
	document.execCommand("copy");
	document.body.removeChild(textarea);
}

function escapeDelimited(value: string, delimiter: string): string {
	const needsQuotes = value.includes(delimiter) || value.includes("\n") || value.includes('"');
	const escaped = value.replace(/"/g, '""');
	return needsQuotes ? `"${escaped}"` : escaped;
}

function buildDelimitedRows(rows: Record<string, unknown>[], delimiter: "," | "\t"): string {
	const header = visibleColumns.value
		.map((column) => escapeDelimited(column.label, delimiter))
		.join(delimiter);
	const body = rows.map((row) =>
		visibleColumns.value
			.map((column) =>
				escapeDelimited(
					formatReportCell(column, row[column.fieldname], posStore.currencySymbol),
					delimiter,
				),
			)
			.join(delimiter),
	);
	return [header, ...body].join("\n");
}

async function copyReportRows() {
	if (filteredRows.value.length === 0) {
		showError(__("No rows to copy."));
		return;
	}

	await copyText(buildDelimitedRows(filteredRows.value, "\t"));
	showSuccess(__("Copied {0} rows to clipboard.", [String(filteredRows.value.length)]));
}

async function copyVisibleRows() {
	if (pagedRows.value.length === 0) {
		showError(__("No rows to copy."));
		return;
	}

	await copyText(buildDelimitedRows(pagedRows.value, "\t"));
	showSuccess(__("Copied current page to clipboard."));
}

async function copyRow(row: Record<string, unknown>) {
	const text = visibleColumns.value
		.map(
			(column) =>
				`${column.label}: ${formatReportCell(column, row[column.fieldname], posStore.currencySymbol)}`,
		)
		.join("\n");
	await copyText(text);
	showSuccess(__("Row copied to clipboard."));
}

async function copyReportLink() {
	await copyText(window.location.href);
	showSuccess(__("Report link copied to clipboard."));
}

async function exportCsv() {
	if (filteredRows.value.length === 0) {
		showError(__("No rows available to export."));
		return;
	}

	const csv = buildDelimitedRows(filteredRows.value, ",");
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const downloadUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = downloadUrl;
	anchor.download = `${slugify(activeReport.value?.title || "report")}-${new Date().toISOString().slice(0, 10)}.csv`;
	anchor.style.display = "none";
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(downloadUrl);
	showSuccess(__("Report exported as CSV."));
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function resetFilters() {
	if (!activeReport.value) return;
	Object.assign(filterState, buildInitialReportFilters(activeReport.value, contextDefaults.value));
	searchTerm.value = "";
	sortState.value = null;
	currentPage.value = 1;
	void runReport();
}

function goBack() {
	router.push("/reports");
}

function getSortLabel(): string {
	if (!sortState.value) return __("Default order");
	const column = visibleColumns.value.find((item) => item.fieldname === sortState.value?.fieldname);
	const direction = sortState.value.direction === "asc" ? __("Ascending") : __("Descending");
	return `${column?.label || sortState.value.fieldname} • ${direction}`;
}
</script>

<template>
	<div class="flex h-full flex-col overflow-hidden bg-background">
		<div
			v-if="!isReportVisible || !activeReport"
			class="flex h-full items-center justify-center p-6 text-center"
		>
			<Card class="w-full max-w-xl border-border/70 bg-card p-8">
				<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
					<BarChart3 class="h-7 w-7 text-muted-foreground" />
				</div>
				<h1 class="text-xl font-semibold text-foreground">{{ __("Report not found") }}</h1>
				<p class="mt-2 text-sm text-muted-foreground">
					{{ __("The report route does not match any configured report.") }}
				</p>
				<div class="mt-6 flex justify-center">
					<Button @click="goBack">
						<ArrowLeft class="h-4 w-4" />
						{{ __("Back to Reports") }}
					</Button>
				</div>
			</Card>
		</div>

		<div v-else-if="!isReportAllowed" class="flex h-full items-center justify-center p-6 text-center">
			<Card class="w-full max-w-xl border-border/70 bg-card p-8">
				<div
					class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"
				>
					<Lock class="h-7 w-7" />
				</div>
				<h1 class="text-xl font-semibold text-foreground">{{ __("Access restricted") }}</h1>
				<p class="mt-2 text-sm text-muted-foreground">
					{{ __("You do not have permission to open this report from the app.") }}
				</p>
				<div class="mt-6 flex justify-center gap-2">
					<Button variant="outline" @click="goBack">
						<ArrowLeft class="h-4 w-4" />
						{{ __("Back to Reports") }}
					</Button>
				</div>
			</Card>
		</div>

		<ScrollArea v-else class="flex-1">
			<div class="space-y-4 p-3 pb-4 sm:p-4">
				<Card class="relative overflow-hidden border-border/70 bg-card/95">
					<div
						:class="[
							'pointer-events-none absolute inset-0 bg-gradient-to-br',
							toneClasses[activeTone].accent,
						]"
					/>
					<div class="relative space-y-4 p-5 sm:p-6">
						<div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
							<div class="max-w-4xl space-y-3">
								<div class="flex flex-wrap items-center gap-2">
									<Badge variant="outline" class="gap-1.5 bg-background/80">
										<Layers3 class="h-3.5 w-3.5" />
										{{ activeReport.category }}
									</Badge>
									<Badge variant="secondary" class="gap-1.5">
										<BarChart3 class="h-3.5 w-3.5" />
										{{ reportRows.length }} {{ __("rows") }}
									</Badge>
									<Badge variant="secondary" class="gap-1.5">
										<Sparkles class="h-3.5 w-3.5" />
										{{ visibleColumns.length }} {{ __("columns") }}
									</Badge>
									<Badge v-if="lastRefreshedAt" variant="outline" class="gap-1.5">
										<CalendarDays class="h-3.5 w-3.5" />
										{{ lastRefreshedAt }}
									</Badge>
								</div>

								<h1 class="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
									{{ activeReport.title }}
								</h1>
								<p class="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
									{{ activeReport.description }}
								</p>
							</div>

							<div class="flex flex-wrap items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									class="h-10"
									:disabled="isLoading"
									@click="runReport"
								>
									<RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isLoading }" />
									{{ isLoading ? __("Refreshing") : __("Refresh") }}
								</Button>
								<Button variant="outline" size="sm" class="h-10" @click="copyVisibleRows">
									<Copy class="h-4 w-4" />
									{{ __("Copy Page") }}
								</Button>
								<Button variant="outline" size="sm" class="h-10" @click="copyReportRows">
									<Copy class="h-4 w-4" />
									{{ __("Copy Data") }}
								</Button>
								<Button variant="outline" size="sm" class="h-10" @click="exportCsv">
									<Download class="h-4 w-4" />
									{{ __("Export CSV") }}
								</Button>
								<Button variant="ghost" size="sm" class="h-10" @click="copyReportLink">
									<Link2 class="h-4 w-4" />
									{{ __("Copy Link") }}
								</Button>
							</div>
						</div>
					</div>
				</Card>

				<div v-if="summaryItems.length > 0" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<Card
						v-for="item in summaryItems"
						:key="item.key || item.label || String(item.value)"
						class="border-border/70 bg-card/95 p-4"
					>
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 space-y-1">
								<p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">
									{{ item.label || __("Summary") }}
								</p>
								<p class="break-words text-lg font-semibold text-foreground">
									{{ formatSummaryValue(item.value) }}
								</p>
							</div>
							<Badge v-if="item.indicator || item.color" variant="secondary" class="shrink-0">
								{{ item.indicator || item.color }}
							</Badge>
						</div>
					</Card>
				</div>

				<Card class="border-border/70 bg-card/95 p-4 sm:p-5">
					<div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div>
							<div class="flex items-center gap-2">
								<Filter class="h-4 w-4 text-muted-foreground" />
								<h2 class="text-base font-semibold text-foreground">{{ __("Filters") }}</h2>
							</div>
							<p class="mt-1 text-sm text-muted-foreground">
								{{ __("Adjust filters and refresh the report to load live data.") }}
							</p>
						</div>
						<div class="flex flex-wrap items-center gap-2">
							<Badge v-if="missingRequiredFilters.length > 0" variant="warning" class="gap-1.5">
								<AlertTriangle class="h-3.5 w-3.5" />
								{{ missingRequiredFilters.length }} {{ __("required") }}
							</Badge>
							<Button variant="outline" size="sm" class="h-9" @click="resetFilters">
								{{ __("Reset") }}
							</Button>
							<Button size="sm" class="h-9" :disabled="isLoading" @click="runReport">
								<RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isLoading }" />
								{{ __("Apply Filters") }}
							</Button>
						</div>
					</div>

					<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						<div
							v-for="filter in activeReport.filters"
							:key="filter.fieldname"
							class="space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-3"
						>
							<div class="flex items-center justify-between gap-2">
								<div class="flex min-w-0 items-center gap-2">
									<p class="truncate text-sm font-medium text-foreground">
										{{ filter.label }}
									</p>
									<Badge
										v-if="filter.required"
										variant="outline"
										class="text-[10px] uppercase tracking-wide"
									>
										{{ __("Required") }}
									</Badge>
								</div>
								<Badge variant="secondary" class="text-[10px] uppercase tracking-wide">
									{{ filter.type }}
								</Badge>
							</div>
							<p v-if="filter.helpText" class="text-xs text-muted-foreground">
								{{ filter.helpText }}
							</p>

							<LinkField
								v-if="filter.type === 'link'"
								:model-value="getStringFilterValue(filter.fieldname)"
								:doctype="filter.doctype || 'DocType'"
								:filters="getLinkFilters(filter)"
								:placeholder="getFilterPlaceholder(filter)"
								:open-on-focus="true"
								:clearable="true"
								class="w-full"
								@update:model-value="(value) => setFilterValue(filter.fieldname, value)"
							/>

							<MultiLinkInput
								v-else-if="filter.type === 'multi-link'"
								:model-value="getMultiFilterValue(filter.fieldname)"
								:doctype="filter.doctype || 'DocType'"
								:placeholder="getFilterPlaceholder(filter)"
								class="w-full"
								@update:model-value="(value) => setFilterValue(filter.fieldname, value)"
							/>

							<DateTimePicker
								v-else-if="filter.type === 'date'"
								:model-value="getStringFilterValue(filter.fieldname)"
								mode="date"
								:show-today="true"
								:clearable="true"
								:placeholder="getFilterPlaceholder(filter)"
								class="w-full"
								@change="(value) => setFilterValue(filter.fieldname, value)"
							/>

							<Input
								v-else-if="
									filter.type === 'integer' ||
									filter.type === 'float' ||
									filter.type === 'text'
								"
								:model-value="getStringFilterValue(filter.fieldname)"
								:type="filter.type === 'text' ? 'text' : 'number'"
								:step="filter.type === 'float' ? '0.01' : '1'"
								:placeholder="getFilterPlaceholder(filter)"
								class="w-full"
								@update:model-value="(value) => setFilterValue(filter.fieldname, value)"
							/>

							<Select
								v-else-if="filter.type === 'select'"
								:model-value="getSelectFilterValue(filter.fieldname)"
								@update:model-value="(value) => setFilterValue(filter.fieldname, value)"
							>
								<SelectTriggerStyled class="h-10 w-full">
									<SelectValue :placeholder="getFilterPlaceholder(filter)" />
								</SelectTriggerStyled>
								<SelectContentStyled>
									<SelectItemStyled
										v-for="option in filter.options || []"
										:key="option.value"
										:value="option.value"
									>
										{{ option.label }}
									</SelectItemStyled>
								</SelectContentStyled>
							</Select>
						</div>
					</div>
				</Card>

				<Card class="border-border/70 bg-card/95 p-4 sm:p-5">
					<div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div class="flex w-full items-center gap-2 lg:max-w-xl">
							<div class="relative flex-1">
								<Search
									class="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
								/>
								<Input
									v-model="searchTerm"
									:placeholder="__('Search rows...')"
									class="h-10 ps-9"
								/>
							</div>
							<Select
								:model-value="sortState?.fieldname || ''"
								@update:model-value="setSortField"
							>
								<SelectTriggerStyled class="h-10 w-52">
									<SelectValue :placeholder="__('Sort by')" />
								</SelectTriggerStyled>
								<SelectContentStyled>
									<SelectItemStyled
										v-for="option in sortFieldOptions"
										:key="option.value"
										:value="option.value"
									>
										{{ option.label }}
									</SelectItemStyled>
								</SelectContentStyled>
							</Select>
							<Button
								variant="outline"
								size="icon-sm"
								:disabled="!sortState"
								@click="toggleSortDirection"
							>
								<ArrowUpDown class="h-4 w-4" />
							</Button>
						</div>

						<div class="flex flex-wrap items-center gap-2">
							<Badge variant="secondary" class="gap-1.5">
								<ChevronRight class="h-3.5 w-3.5 rotate-90" />
								{{ getSortLabel() }}
							</Badge>
							<Button
								variant="ghost"
								size="sm"
								class="h-9"
								:disabled="!sortState"
								@click="clearSort"
							>
								{{ __("Clear Sort") }}
							</Button>
						</div>
					</div>

					<div
						v-if="errorMessage"
						class="mb-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-4"
					>
						<div class="flex items-start gap-3">
							<AlertTriangle class="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
							<div class="min-w-0 flex-1 space-y-3">
								<p class="text-sm font-medium text-foreground">{{ errorMessage }}</p>
								<div class="flex items-center gap-2">
									<Button size="sm" @click="runReport">
										<RefreshCw class="h-4 w-4" />
										{{ __("Try Again") }}
									</Button>
									<Button variant="outline" size="sm" @click="copyReportLink">
										<Copy class="h-4 w-4" />
										{{ __("Copy Link") }}
									</Button>
								</div>
							</div>
						</div>
					</div>

					<div v-if="isInitialLoading" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						<div v-for="i in 6" :key="i" class="skeleton h-28 w-full rounded-2xl"></div>
					</div>

					<div v-else>
						<ReportDataTable
							:columns="visibleColumns"
							:rows="pagedRows"
							:currency-symbol="posStore.currencySymbol"
							:sort-state="sortState"
							:empty-title="__('No rows found')"
							:empty-description="__('Try adjusting the filters, search term, or sort order.')"
							@sort-change="toggleSort"
							@copy-row="copyRow"
						/>

						<div class="mt-4 flex flex-col gap-3">
							<Pagination
								v-if="totalRows > 0"
								:total="totalRows"
								:page-size="pageSize"
								:current-page="currentPage"
								@update:current-page="currentPage = $event"
								@update:page-size="pageSize = $event"
							/>
							<div
								v-else
								class="rounded-xl border border-dashed border-border/70 bg-muted/20 p-4 text-center text-sm text-muted-foreground"
							>
								{{ __("No rows available after filtering.") }}
							</div>
						</div>
					</div>
				</Card>
			</div>
		</ScrollArea>
	</div>
</template>
