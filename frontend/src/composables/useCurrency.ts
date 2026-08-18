import { computed } from "vue";

import { getCachedCurrencyMeta } from "@/services/dbBridge";

export interface CurrencyMeta {
	name: string;
	symbol: string;
	precision: number;
	symbol_on_right: boolean;
}

export const DEFAULT_CURRENCY_PRECISION = 2;

export function precisionFromNumberFormat(format?: string | null): number {
	if (!format) return DEFAULT_CURRENCY_PRECISION;

	const groups = format.trim().split(/[^#]+/).filter(Boolean);
	const separatorCount = groups.length - 1;
	if (separatorCount < 1) return 0;

	const trailing = groups[groups.length - 1].length;
	return trailing === 3 && separatorCount === 1 ? 0 : trailing;
}

let cachedCurrencies: Record<string, CurrencyMeta> | null = null;

function readBootCurrencies(): Record<string, CurrencyMeta> {
	const rows = (window.xpos as any)?.boot?.currencies;
	if (!Array.isArray(rows)) return {};

	const map: Record<string, CurrencyMeta> = {};
	for (const row of rows) {
		if (!row?.name) continue;
		map[row.name] = {
			name: row.name,
			symbol: row.symbol || row.name,
			precision: precisionFromNumberFormat(row.number_format),
			symbol_on_right: !!row.symbol_on_right,
		};
	}
	return map;
}

export async function primeCurrencyCache(): Promise<void> {
	const boot = readBootCurrencies();
	if (Object.keys(boot).length) {
		cachedCurrencies = boot;
		return;
	}

	try {
		const rows = await getCachedCurrencyMeta();
		const map: Record<string, CurrencyMeta> = {};
		for (const row of rows || []) {
			if (!row?.name) continue;
			map[row.name] = {
				name: row.name,
				symbol: row.symbol || row.name,
				precision: precisionFromNumberFormat(row.number_format),
				symbol_on_right: !!row.symbol_on_right,
			};
		}
		cachedCurrencies = map;
	} catch {
		cachedCurrencies = {};
	}
}

export function resetCurrencyCache(): void {
	cachedCurrencies = null;
}

export function currencyMeta(currency?: string | null): CurrencyMeta {
	const name = currency || "";
	if (cachedCurrencies === null) cachedCurrencies = readBootCurrencies();

	return (
		cachedCurrencies[name] || {
			name,
			symbol: name,
			precision: DEFAULT_CURRENCY_PRECISION,
			symbol_on_right: false,
		}
	);
}

export function precisionFor(currency?: string | null): number {
	return currencyMeta(currency).precision;
}

export function symbolFor(currency?: string | null): string {
	return currencyMeta(currency).symbol;
}

export function minorUnitFor(currency?: string | null): number {
	return 10 ** -precisionFor(currency);
}

export function roundFor(currency: string | null | undefined, value: number): number {
	if (!Number.isFinite(value)) return 0;

	const factor = 10 ** precisionFor(currency);
	const scaled = Number((Math.abs(value) * factor).toPrecision(15));
	const rounded = Math.round(scaled) / factor;

	return value < 0 ? -rounded : rounded;
}

export function formatFor(currency: string | null | undefined, value: number): string {
	const digits = precisionFor(currency);
	return (Number.isFinite(value) ? value : 0).toLocaleString(undefined, {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	});
}

export function formatWithSymbol(currency: string | null | undefined, value: number): string {
	const meta = currencyMeta(currency);
	const amount = formatFor(currency, value);
	return meta.symbol_on_right ? `${amount} ${meta.symbol}` : `${meta.symbol}${amount}`;
}

export function convertToBase(
	currency: string | null | undefined,
	baseCurrency: string | null | undefined,
	nativeAmount: number,
	rate: number,
): number {
	if (!currency || currency === baseCurrency) return roundFor(baseCurrency, nativeAmount);
	const sign = nativeAmount < 0 ? -1 : 1;
	return roundFor(baseCurrency, Math.abs(nativeAmount) * (rate || 0)) * sign;
}

export function useCurrency() {
	return {
		currencyMeta,
		precisionFor,
		symbolFor,
		minorUnitFor,
		roundFor,
		formatFor,
		formatWithSymbol,
		convertToBase,
		primeCurrencyCache,
		defaultPrecision: computed(() => DEFAULT_CURRENCY_PRECISION),
	};
}
