import { call } from "./api";
import { getMeta as idbGetMeta, setMeta as idbSetMeta } from "./idbService";

export interface DocField {
	fieldname: string;
	fieldtype: string;
	label?: string;
	options?: string;
	reqd?: 0 | 1;
	bold?: 0 | 1;
	in_list_view?: 0 | 1;
	in_standard_filter?: 0 | 1;
	in_global_search?: 0 | 1;
	hidden?: 0 | 1;
	read_only?: 0 | 1;
	default?: string;
	depends_on?: string;
	length?: number;
	precision?: string;
}

export interface DoctypeMeta {
	name: string;
	fields: DocField[];
	title_field?: string;
	search_fields?: string;
	sort_field?: string;
	sort_order?: string;
	is_submittable?: 0 | 1;
}

const NON_VALUE_FIELDTYPES = new Set([
	"Section Break",
	"Column Break",
	"Tab Break",
	"HTML",
	"Table",
	"Table MultiSelect",
	"Button",
	"Fold",
	"Heading",
	"Image",
	"Signature",
	"Connection",
]);

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const IDB_KEY_PREFIX = "doctype_meta::";

const memoryCache = new Map<string, { meta: DoctypeMeta; ts: number }>();

async function fetchDoctypeMetaFromServer(doctype: string): Promise<DoctypeMeta> {
	const response = await call<any>("frappe.desk.form.load.getdoctype", { doctype });

	const raw = (response as any)?.docs?.[0] ?? (response as any);
	if (!raw || !raw.fields) {
		throw new Error(`Failed to fetch meta for ${doctype}`);
	}

	return {
		name: raw.name,
		fields: raw.fields,
		title_field: raw.title_field,
		search_fields: raw.search_fields,
		sort_field: raw.sort_field,
		sort_order: raw.sort_order,
		is_submittable: raw.is_submittable,
	};
}

export async function getDoctypeMeta(doctype: string): Promise<DoctypeMeta> {
	const mem = memoryCache.get(doctype);
	if (mem && Date.now() - mem.ts < CACHE_TTL_MS) {
		return mem.meta;
	}

	const idbKey = `${IDB_KEY_PREFIX}${doctype}`;
	try {
		const cached = (await idbGetMeta(idbKey)) as { meta: DoctypeMeta; ts: number } | null;
		if (cached && cached.meta && Date.now() - cached.ts < CACHE_TTL_MS) {
			memoryCache.set(doctype, cached);
			return cached.meta;
		}
	} catch {
		// IndexedDB unavailable — fall through to server
	}

	const meta = await fetchDoctypeMetaFromServer(doctype);
	const entry = { meta, ts: Date.now() };
	memoryCache.set(doctype, entry);
	try {
		await idbSetMeta(idbKey, entry);
	} catch {
		// Silent — caching is best-effort
	}
	return meta;
}

export function invalidateMetaCache(doctype: string): void {
	memoryCache.delete(doctype);
}

export function isValueType(fieldtype: string): boolean {
	return !NON_VALUE_FIELDTYPES.has(fieldtype);
}

export function getStandardFilterFields(meta: DoctypeMeta): DocField[] {
	const fields = meta.fields.filter(
		(f) => f.in_standard_filter === 1 && isValueType(f.fieldtype) && !f.hidden,
	);

	if (meta.title_field) {
		const hasTitle = fields.some((f) => f.fieldname === meta.title_field);
		if (!hasTitle) {
			const titleField = meta.fields.find((f) => f.fieldname === meta.title_field);
			if (titleField && isValueType(titleField.fieldtype)) {
				fields.unshift(titleField);
			}
		}
	}

	if (fields.length > 0 && fields.filter((f) => f.fieldname === "name").length === 0) {
		const nameField = meta.fields.find((f) => f.fieldname === "name");
		if (nameField && isValueType(nameField.fieldtype)) {
			fields.unshift(nameField);
		}
	}

	return fields;
}

export function getAllFilterableFields(meta: DoctypeMeta): DocField[] {
	return meta.fields.filter((f) => isValueType(f.fieldtype) && !f.hidden);
}

export function getFieldOperators(fieldtype: string): { label: string; value: string }[] {
	const common = [
		{ label: "is", value: "is" },
		{ label: "is not", value: "is not" },
	];

	if (["Int", "Float", "Currency", "Percent"].includes(fieldtype)) {
		return [
			{ label: "=", value: "=" },
			{ label: "!=", value: "!=" },
			{ label: ">", value: ">" },
			{ label: "<", value: "<" },
			{ label: ">=", value: ">=" },
			{ label: "<=", value: "<=" },
			...common,
		];
	}

	if (["Date", "Datetime"].includes(fieldtype)) {
		return [
			{ label: "=", value: "=" },
			{ label: "!=", value: "!=" },
			{ label: ">", value: ">" },
			{ label: "<", value: "<" },
			{ label: ">=", value: ">=" },
			{ label: "<=", value: "<=" },
			{ label: "between", value: "between" },
			...common,
		];
	}

	if (fieldtype === "Check") {
		return [{ label: "=", value: "=" }];
	}

	if (fieldtype === "Select") {
		return [{ label: "=", value: "=" }, { label: "!=", value: "!=" }, ...common];
	}

	return [
		{ label: "=", value: "=" },
		{ label: "!=", value: "!=" },
		{ label: "like", value: "like" },
		{ label: "not like", value: "not like" },
		...common,
	];
}

export function parseSelectOptions(options?: string): string[] {
	if (!options) return [];
	return options
		.split("\n")
		.map((o) => o.trim())
		.filter(Boolean);
}
