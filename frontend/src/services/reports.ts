import { call } from "@/services/api";
import { __ } from "@/lib/utils";
import { hasPermission, type PosPermissions } from "@/services/userRights";

export type ReportCategory = "Inventory" | "Sales" | "Purchasing" | "Operations";
export type ReportTone = "emerald" | "blue" | "amber" | "violet" | "cyan";
export type ReportFilterType = "link" | "multi-link" | "date" | "integer" | "float" | "select" | "text";

export interface ReportFilterOption {
	label: string;
	value: string;
}

export interface ReportFilterDefinition {
	fieldname: string;
	label: string;
	type: ReportFilterType;
	required?: boolean;
	doctype?: string;
	placeholder?: string;
	helpText?: string;
	defaultValue?: string | number | string[];
	options?: ReportFilterOption[];
	linkFilters?: (values: Record<string, unknown>) => Record<string, unknown>;
	dependsOn?: string[];
}

export interface ReportDefinition {
	slug: string;
	title: string;
	reportName: string;
	description: string;
	category: ReportCategory;
	tone: ReportTone;
	permissionKey?: keyof PosPermissions;
	filters: ReportFilterDefinition[];
}

export interface ReportColumn {
	fieldname: string;
	label: string;
	fieldtype?: string;
	options?: string;
	width?: number;
	precision?: number;
	hidden?: number;
	default?: unknown;
	[key: string]: unknown;
}

export interface ReportSummaryItem {
	label?: string;
	value?: unknown;
	indicator?: string;
	color?: string;
	key?: string;
	[key: string]: unknown;
}

export interface ReportQueryResult {
	columns: ReportColumn[];
	result: Record<string, unknown>[];
	message?: string;
	chart?: unknown;
	report_summary?: ReportSummaryItem[];
	skip_total_row?: number | boolean;
	add_total_row?: number | boolean;
	status?: string | null;
	prepared_report?: boolean;
	[key: string]: unknown;
}

export interface ReportContextDefaults {
	company?: string;
	warehouse?: string;
}

const reportUtilityFields = new Set([
	"indent",
	"parent",
	"lft",
	"rgt",
	"is_total_row",
	"is_subtotal",
	"row_style",
	"__checked",
	"__index",
]);

const reportDefinitions: ReportDefinition[] = [
	{
		slug: "current-stock-report",
		title: "Current Stock Report",
		reportName: "Current Stock Report",
		description: "Live stock valuation by item, warehouse, supplier, brand, and group.",
		category: "Inventory",
		tone: "emerald",
		permissionKey: "current_stock_report",
		filters: [
			{
				fieldname: "company",
				label: "Company",
				type: "link",
				doctype: "Company",
				required: true,
			},
			{
				fieldname: "warehouse",
				label: "Warehouse",
				type: "link",
				doctype: "Warehouse",
				required: true,
				linkFilters: (values) => ({ company: values.company, is_group: 0 }),
				dependsOn: ["company"],
			},
			{
				fieldname: "supplier",
				label: "Supplier",
				type: "link",
				doctype: "Supplier",
			},
			{
				fieldname: "brand",
				label: "Brand",
				type: "link",
				doctype: "Brand",
			},
			{
				fieldname: "item_group",
				label: "Item Group",
				type: "link",
				doctype: "Item Group",
			},
		],
	},
	{
		slug: "current-stock-by-brand",
		title: "Current Stock By Brand",
		reportName: "Current Stock By Brand",
		description: "Brand-wise stock snapshot with quantities and valuation.",
		category: "Inventory",
		tone: "emerald",
		permissionKey: "current_stock_by_brand",
		filters: [
			{
				fieldname: "brand",
				label: "Brand",
				type: "multi-link",
				doctype: "Brand",
				required: true,
			},
		],
	},
	{
		slug: "current-stock-summary",
		title: "Current Stock Summary",
		reportName: "Current Stock Summary",
		description: "Compact warehouse stock overview with totals and stock movement levels.",
		category: "Inventory",
		tone: "emerald",
		filters: [
			{
				fieldname: "company",
				label: "Company",
				type: "link",
				doctype: "Company",
				required: true,
			},
			{
				fieldname: "warehouse",
				label: "Warehouse",
				type: "link",
				doctype: "Warehouse",
				required: true,
				linkFilters: (values) => ({ company: values.company, is_group: 0 }),
				dependsOn: ["company"],
			},
		],
	},
	{
		slug: "current-stock-with-levels",
		title: "Current Stock With Levels",
		reportName: "Current Stock With Levels",
		description: "Stock snapshot grouped with reorder and alert levels.",
		category: "Inventory",
		tone: "emerald",
		filters: [
			{
				fieldname: "company",
				label: "Company",
				type: "link",
				doctype: "Company",
				required: true,
			},
			{
				fieldname: "warehouse",
				label: "Warehouse",
				type: "link",
				doctype: "Warehouse",
				required: true,
				linkFilters: (values) => ({ company: values.company, is_group: 0 }),
				dependsOn: ["company"],
			},
		],
	},
	{
		slug: "dead-stock-report",
		title: "Dead Stock Report",
		reportName: "Dead Stock Report",
		description: "Stock that has been sitting too long with low value movement.",
		category: "Inventory",
		tone: "emerald",
		filters: [
			{
				fieldname: "company",
				label: "Company",
				type: "link",
				doctype: "Company",
				required: true,
			},
			{
				fieldname: "warehouse",
				label: "Warehouse",
				type: "link",
				doctype: "Warehouse",
				linkFilters: (values) => ({ company: values.company, is_group: 0 }),
				dependsOn: ["company"],
			},
			{
				fieldname: "days",
				label: "Days",
				type: "integer",
				defaultValue: 30,
				required: true,
			},
			{
				fieldname: "min_value",
				label: "Minimum Value",
				type: "float",
				defaultValue: 1000,
				required: true,
			},
			{
				fieldname: "supplier",
				label: "Supplier",
				type: "multi-link",
				doctype: "Supplier",
			},
		],
	},
	{
		slug: "stock-value-by-warehouse",
		title: "Stock Value By Warehouse",
		reportName: "Stock Value By Warehouse",
		description: "Warehouse value and quantity summary for quick inventory valuation.",
		category: "Inventory",
		tone: "emerald",
		filters: [
			{
				fieldname: "company",
				label: "Company",
				type: "link",
				doctype: "Company",
				required: true,
			},
		],
	},
	{
		slug: "stock-value-summary-by-date",
		title: "Stock Value Summary By Date",
		reportName: "Stock Value Summary By Date",
		description: "Snapshot stock balance by posting date for trend review.",
		category: "Inventory",
		tone: "emerald",
		filters: [
			{
				fieldname: "company",
				label: "Company",
				type: "link",
				doctype: "Company",
				required: true,
			},
			{
				fieldname: "from_posting_date",
				label: "From Posting Date",
				type: "date",
				defaultValue: today(),
				required: true,
			},
		],
	},
	{
		slug: "warehouse-stock-movement",
		title: "Warehouse Stock Movement",
		reportName: "Warehouse Stock Movement",
		description: "Movement summary by warehouse and voucher type over time.",
		category: "Operations",
		tone: "violet",
		filters: [
			{
				fieldname: "company",
				label: "Company",
				type: "link",
				doctype: "Company",
				required: true,
			},
			{
				fieldname: "from_date",
				label: "From Date",
				type: "date",
				defaultValue: daysAgo(30),
				required: true,
			},
			{
				fieldname: "to_date",
				label: "To Date",
				type: "date",
				defaultValue: today(),
				required: true,
			},
		],
	},
	{
		slug: "branch-item-summary",
		title: "Branch Item Summary",
		reportName: "Branch Item Summary",
		description: "Item movement and sales summary for a branch and warehouse window.",
		category: "Operations",
		tone: "violet",
		filters: [
			{
				fieldname: "company",
				label: "Company",
				type: "link",
				doctype: "Company",
				required: true,
			},
			{
				fieldname: "warehouse",
				label: "Warehouse",
				type: "link",
				doctype: "Warehouse",
				required: true,
				linkFilters: (values) => ({ company: values.company, is_group: 0 }),
				dependsOn: ["company"],
			},
			{
				fieldname: "from_date",
				label: "From Date",
				type: "date",
				defaultValue: today(),
				required: true,
			},
			{
				fieldname: "to_date",
				label: "To Date",
				type: "date",
				defaultValue: today(),
				required: true,
			},
		],
	},
	{
		slug: "branch-set-summary",
		title: "Branch Set Summary",
		reportName: "Branch Set Summary",
		description: "Set-level summary for branch stock and movement tracking.",
		category: "Operations",
		tone: "violet",
		filters: [
			{
				fieldname: "company",
				label: "Company",
				type: "link",
				doctype: "Company",
				required: true,
			},
			{
				fieldname: "warehouse",
				label: "Warehouse",
				type: "link",
				doctype: "Warehouse",
				required: true,
				linkFilters: (values) => ({ company: values.company, is_group: 0 }),
				dependsOn: ["company"],
			},
			{
				fieldname: "date",
				label: "Date",
				type: "date",
				defaultValue: today(),
				required: true,
			},
		],
	},
	{
		slug: "low-qty-sales-report",
		title: "Low Qty Sales Report",
		reportName: "Low Qty Sales Report",
		description: "Items sold in low quantities over a selected period.",
		category: "Sales",
		tone: "blue",
		filters: [
			{
				fieldname: "company",
				label: "Company",
				type: "link",
				doctype: "Company",
				required: true,
			},
			{
				fieldname: "from_date",
				label: "From Date",
				type: "date",
				defaultValue: daysAgo(30),
				required: true,
			},
			{
				fieldname: "to_date",
				label: "To Date",
				type: "date",
				defaultValue: today(),
				required: true,
			},
			{
				fieldname: "min_qty",
				label: "Min Qty",
				type: "integer",
				defaultValue: 10,
				required: true,
			},
		],
	},
	{
		slug: "zero-qty-sales-report",
		title: "Zero Qty Sales Report",
		reportName: "Zero Qty Sales Report",
		description: "Sales lines where no quantity was fulfilled during the period.",
		category: "Sales",
		tone: "blue",
		filters: [
			{
				fieldname: "company",
				label: "Company",
				type: "link",
				doctype: "Company",
				required: true,
			},
			{
				fieldname: "from_date",
				label: "From Date",
				type: "date",
				defaultValue: daysAgo(30),
				required: true,
			},
			{
				fieldname: "to_date",
				label: "To Date",
				type: "date",
				defaultValue: today(),
				required: true,
			},
		],
	},
	{
		slug: "slow-fast-moving-items",
		title: "Slow Fast Moving Items",
		reportName: "Slow Fast Moving Items",
		description: "Movement velocity overview to identify fast and slow sellers.",
		category: "Sales",
		tone: "blue",
		filters: [
			{
				fieldname: "company",
				label: "Company",
				type: "link",
				doctype: "Company",
				required: true,
			},
			{
				fieldname: "from_date",
				label: "From Date",
				type: "date",
				defaultValue: daysAgo(30),
				required: true,
			},
			{
				fieldname: "to_date",
				label: "To Date",
				type: "date",
				defaultValue: today(),
				required: true,
			},
			{
				fieldname: "supplier",
				label: "Supplier",
				type: "multi-link",
				doctype: "Supplier",
			},
		],
	},
	{
		slug: "purchase-order-report",
		title: "Purchase Order Report",
		reportName: "Purchase Order Report",
		description: "Purchase order summary with supplier, date range, and type filters.",
		category: "Purchasing",
		tone: "amber",
		filters: [
			{
				fieldname: "company",
				label: "Company",
				type: "link",
				doctype: "Company",
				required: true,
			},
			{
				fieldname: "supplier",
				label: "Supplier",
				type: "link",
				doctype: "Supplier",
				required: true,
			},
			{
				fieldname: "from_date",
				label: "From Date",
				type: "date",
				required: true,
			},
			{
				fieldname: "to_date",
				label: "To Date",
				type: "date",
				required: true,
			},
			{
				fieldname: "type",
				label: "Type",
				type: "select",
				defaultValue: "All",
				options: [
					{ label: "All", value: "All" },
					{ label: "Based on ReOrder Level", value: "Based on ReOrder Level" },
					{ label: "Based on Sales", value: "Based on Sales" },
				],
				required: true,
			},
		],
	},
];

const reportMap = new Map(reportDefinitions.map((report) => [report.slug, report]));

function today(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function daysAgo(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() - days);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function cloneValue<T>(value: T): T {
	if (Array.isArray(value)) return [...value] as T;
	if (value && typeof value === "object") return { ...(value as Record<string, unknown>) } as T;
	return value;
}

export function getReportDefinition(slug: string | string[] | undefined): ReportDefinition | undefined {
	if (!slug || Array.isArray(slug)) return undefined;
	return reportMap.get(slug);
}

export function getReportDefinitions(): ReportDefinition[] {
	return [...reportDefinitions];
}

export function getAccessibleReports(): ReportDefinition[] {
	return reportDefinitions.filter((report) => !report.permissionKey || hasPermission(report.permissionKey));
}

export function isReportAccessible(report: ReportDefinition): boolean {
	return !report.permissionKey || hasPermission(report.permissionKey);
}

export function buildInitialReportFilters(
	report: ReportDefinition,
	context: ReportContextDefaults = {},
): Record<string, unknown> {
	const filters: Record<string, unknown> = {};

	for (const filter of report.filters) {
		filters[filter.fieldname] = cloneValue(
			filter.defaultValue ?? (filter.type === "multi-link" ? [] : ""),
		);
	}

	if (context.company && Object.prototype.hasOwnProperty.call(filters, "company")) {
		filters.company = context.company;
	}

	if (context.warehouse && Object.prototype.hasOwnProperty.call(filters, "warehouse")) {
		filters.warehouse = context.warehouse;
	}

	return filters;
}

export function normalizeReportFilters(
	report: ReportDefinition,
	values: Record<string, unknown>,
): Record<string, unknown> {
	const payload: Record<string, unknown> = {};

	for (const filter of report.filters) {
		const rawValue = values[filter.fieldname];

		if (rawValue === undefined || rawValue === null || rawValue === "") {
			continue;
		}

		if (Array.isArray(rawValue)) {
			const cleaned = rawValue.map((item) => String(item).trim()).filter(Boolean);
			if (cleaned.length > 0) {
				payload[filter.fieldname] = cleaned;
			}
			continue;
		}

		if (filter.type === "integer") {
			const parsed = Number.parseInt(String(rawValue), 10);
			if (!Number.isNaN(parsed)) payload[filter.fieldname] = parsed;
			continue;
		}

		if (filter.type === "float") {
			const parsed = Number.parseFloat(String(rawValue));
			if (!Number.isNaN(parsed)) payload[filter.fieldname] = parsed;
			continue;
		}

		payload[filter.fieldname] = String(rawValue).trim();
	}

	return payload;
}

export function hydrateReportFiltersFromQuery(
	report: ReportDefinition,
	query: Record<string, string | string[] | null | undefined>,
): Record<string, unknown> {
	const hydrated = buildInitialReportFilters(report);

	for (const filter of report.filters) {
		const queryValue = query[filter.fieldname];
		if (queryValue === undefined || queryValue === null || queryValue === "") {
			continue;
		}

		if (filter.type === "multi-link") {
			if (Array.isArray(queryValue)) {
				hydrated[filter.fieldname] = queryValue.map((item) => String(item)).filter(Boolean);
			} else {
				hydrated[filter.fieldname] = String(queryValue)
					.split(",")
					.map((item) => item.trim())
					.filter(Boolean);
			}
			continue;
		}

		if (filter.type === "integer") {
			const parsed = Number.parseInt(Array.isArray(queryValue) ? queryValue[0] : queryValue, 10);
			if (!Number.isNaN(parsed)) hydrated[filter.fieldname] = parsed;
			continue;
		}

		if (filter.type === "float") {
			const parsed = Number.parseFloat(Array.isArray(queryValue) ? queryValue[0] : queryValue);
			if (!Number.isNaN(parsed)) hydrated[filter.fieldname] = parsed;
			continue;
		}

		hydrated[filter.fieldname] = Array.isArray(queryValue) ? queryValue[0] : String(queryValue);
	}

	return hydrated;
}

export function serializeReportFiltersToQuery(
	report: ReportDefinition,
	values: Record<string, unknown>,
): Record<string, string | string[]> {
	const query: Record<string, string | string[]> = {};
	const normalized = normalizeReportFilters(report, values);

	for (const [fieldname, value] of Object.entries(normalized)) {
		if (Array.isArray(value)) {
			if (value.length > 0) {
				query[fieldname] = value.map((item) => String(item));
			}
			continue;
		}

		if (value === null || value === undefined || value === "") {
			continue;
		}

		query[fieldname] = String(value);
	}

	return query;
}

export function getVisibleReportColumns(columns: ReportColumn[]): ReportColumn[] {
	return columns.filter(
		(column) => !reportUtilityFields.has(column.fieldname) && !String(column.fieldname).startsWith("_"),
	);
}

export function isReportNumericColumn(column: ReportColumn): boolean {
	return ["Currency", "Float", "Int", "Percent", "Check"].includes(String(column.fieldtype || ""));
}

export function isReportTotalRow(row: Record<string, unknown>): boolean {
	return Boolean(row.is_total_row || row.is_subtotal || row._is_total_row);
}

function formatReportDateTime(value: unknown): string {
	if (!value) return "—";
	const date = new Date(String(value));
	if (Number.isNaN(date.getTime())) return String(value);
	return new Intl.DateTimeFormat(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

export function formatReportCell(column: ReportColumn, value: unknown, currencySymbol = "$"): string {
	if (value === null || value === undefined || value === "") return "—";

	if (Array.isArray(value)) {
		return value.map((item) => String(item)).join(", ");
	}

	switch (column.fieldtype) {
		case "Currency": {
			const precision = Number(column.precision ?? 2);
			const parsed = Number(value ?? 0);
			if (Number.isNaN(parsed)) return String(value);
			return `${currencySymbol}${parsed.toLocaleString(undefined, {
				minimumFractionDigits: precision,
				maximumFractionDigits: precision,
			})}`;
		}
		case "Float":
		case "Percent": {
			const precision = Number(column.precision ?? 2);
			const parsed = Number(value ?? 0);
			if (Number.isNaN(parsed)) return String(value);
			return parsed.toLocaleString(undefined, {
				minimumFractionDigits: precision,
				maximumFractionDigits: precision,
			});
		}
		case "Int": {
			const parsed = Number(value ?? 0);
			if (Number.isNaN(parsed)) return String(value);
			return Math.trunc(parsed).toLocaleString();
		}
		case "Check":
			return value ? __("Yes") : __("No");
		case "Date": {
			const date = new Date(String(value));
			if (Number.isNaN(date.getTime())) return String(value);
			return new Intl.DateTimeFormat(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
			}).format(date);
		}
		case "Datetime":
			return formatReportDateTime(value);
		default:
			return String(value);
	}
}

export async function fetchReportData(
	reportName: string,
	filters: Record<string, unknown>,
): Promise<ReportQueryResult> {
	return call<ReportQueryResult>("frappe.desk.query_report.run", {
		report_name: reportName,
		filters: JSON.stringify(filters),
	});
}
