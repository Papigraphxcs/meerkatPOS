<script setup lang="ts">
import { computed } from "vue";
import { Copy, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import __ from "@/lib/translate";
import {
	formatReportCell,
	getVisibleReportColumns,
	isReportNumericColumn,
	isReportTotalRow,
	type ReportColumn,
} from "@/services/reports";

export interface ReportSortState {
	fieldname: string;
	direction: "asc" | "desc";
}

const props = withDefaults(
	defineProps<{
		columns: ReportColumn[];
		rows: Record<string, unknown>[];
		currencySymbol: string;
		sortState: ReportSortState | null;
		emptyTitle?: string;
		emptyDescription?: string;
	}>(),
	{
		emptyTitle: "No rows found",
		emptyDescription: "Adjust filters or refresh the report.",
	},
);

const emit = defineEmits<{
	(e: "sort-change", fieldname: string): void;
	(e: "copy-row", row: Record<string, unknown>): void;
}>();

const visibleColumns = computed(() => getVisibleReportColumns(props.columns));

const mobileColumns = computed(() => visibleColumns.value.slice(0, 4));

function headerSortIndicator(column: ReportColumn): string {
	if (!props.sortState || props.sortState.fieldname !== column.fieldname) {
		return "none";
	}
	return props.sortState.direction;
}

function rowKey(row: Record<string, unknown>, index: number): string {
	return String(row.name ?? row.item_code ?? row.code ?? row.id ?? index);
}

function rowIsTotal(row: Record<string, unknown>): boolean {
	return isReportTotalRow(row);
}

function mobilePrimaryValue(row: Record<string, unknown>): string {
	const primaryColumn = visibleColumns.value[0];
	if (!primaryColumn) return "—";
	return formatReportCell(primaryColumn, row[primaryColumn.fieldname], props.currencySymbol);
}

function mobileSecondaryValue(row: Record<string, unknown>): string {
	const secondaryColumn = visibleColumns.value[1];
	if (!secondaryColumn) return "";
	return formatReportCell(secondaryColumn, row[secondaryColumn.fieldname], props.currencySymbol);
}
</script>

<template>
	<div class="space-y-4">
		<div v-if="rows.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
			<div class="rounded-full bg-muted/60 p-4 mb-4">
				<Copy class="h-6 w-6 text-muted-foreground" />
			</div>
			<p class="text-base font-semibold text-foreground">{{ emptyTitle }}</p>
			<p class="text-sm text-muted-foreground mt-1 max-w-md">{{ emptyDescription }}</p>
		</div>

		<div v-else class="space-y-3 md:hidden">
			<Card
				v-for="(row, index) in rows"
				:key="rowKey(row, index)"
				class="overflow-hidden border-border/80 bg-card/95"
				:class="{ 'bg-amber-500/5 border-amber-500/20': rowIsTotal(row) }"
			>
				<div class="p-4 space-y-3">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<p class="font-semibold text-foreground truncate">
								{{ mobilePrimaryValue(row) }}
							</p>
							<p class="text-xs text-muted-foreground truncate">
								{{ mobileSecondaryValue(row) }}
							</p>
						</div>
						<Button
							variant="ghost"
							size="icon-sm"
							class="shrink-0"
							@click="emit('copy-row', row)"
						>
							<Copy class="h-4 w-4" />
						</Button>
					</div>

					<div class="grid grid-cols-2 gap-2">
						<div
							v-for="column in mobileColumns"
							:key="column.fieldname"
							class="rounded-xl bg-muted/40 px-3 py-2"
						>
							<p
								class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
							>
								{{ column.label }}
							</p>
							<p class="mt-1 text-xs font-medium text-foreground break-words">
								{{ formatReportCell(column, row[column.fieldname], props.currencySymbol) }}
							</p>
						</div>
					</div>
				</div>
			</Card>
		</div>

		<div
			v-if="rows.length > 0"
			class="hidden md:block rounded-2xl border border-border bg-card overflow-hidden"
		>
			<div class="overflow-x-auto">
				<table class="min-w-full text-sm">
					<thead class="sticky top-0 z-10 bg-muted/90 backdrop-blur border-b border-border">
						<tr>
							<th
								class="w-14 px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground"
							>
								#
							</th>
							<th
								v-for="column in visibleColumns"
								:key="column.fieldname"
								class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
								:class="isReportNumericColumn(column) ? 'text-end' : 'text-start'"
								:style="column.width ? { width: `${column.width}px` } : undefined"
							>
								<button
									type="button"
									class="inline-flex items-center gap-1.5 text-left transition-colors hover:text-foreground"
									@click="emit('sort-change', column.fieldname)"
								>
									<span>{{ column.label }}</span>
									<ArrowUp
										v-if="headerSortIndicator(column) === 'asc'"
										class="h-3.5 w-3.5 text-primary"
									/>
									<ArrowDown
										v-else-if="headerSortIndicator(column) === 'desc'"
										class="h-3.5 w-3.5 text-primary"
									/>
									<ChevronsUpDown v-else class="h-3.5 w-3.5 text-muted-foreground/60" />
								</button>
							</th>
							<th
								class="w-14 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
							>
								{{ __("Copy") }}
							</th>
						</tr>
					</thead>

					<tbody class="divide-y divide-border">
						<tr
							v-for="(row, index) in rows"
							:key="rowKey(row, index)"
							class="transition-colors hover:bg-muted/50"
							:class="{ 'bg-amber-500/5': rowIsTotal(row) }"
						>
							<td class="px-4 py-3 text-muted-foreground">{{ index + 1 }}</td>
							<td
								v-for="column in visibleColumns"
								:key="`${rowKey(row, index)}-${column.fieldname}`"
								class="px-4 py-3 align-top"
								:class="
									isReportNumericColumn(column) ? 'text-end tabular-nums' : 'text-start'
								"
							>
								<div
									class="max-w-[340px] break-words"
									:class="isReportNumericColumn(column) ? 'ms-auto' : ''"
								>
									{{
										formatReportCell(column, row[column.fieldname], props.currencySymbol)
									}}
								</div>
							</td>
							<td class="px-4 py-3 text-center">
								<Button variant="ghost" size="icon-sm" @click="emit('copy-row', row)">
									<Copy class="h-4 w-4" />
								</Button>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	</div>
</template>
