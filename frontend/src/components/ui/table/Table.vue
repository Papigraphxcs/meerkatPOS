<script setup lang="ts">
import { ref, computed, nextTick, watch } from "vue";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip";
import {
    Trash2,
    Plus,
    Package,
    Settings,
    Copy,
    ChevronUp,
    ChevronDown,
    X,
    Check,
} from "lucide-vue-next";
import __ from "@/lib/translate";
import type {
    TableColumn as ChildTableColumn,
    TableRow as ChildTableRow,
    SelectOption,
} from "./types";
import Checkbox from "../checkbox/Checkbox.vue";

const props = withDefaults(
    defineProps<{
        rows: ChildTableRow[];
        columns: ChildTableColumn[];
        label?: string;
        minWidth?: string;
        showRowNumbers?: boolean;
        showCheckboxes?: boolean;
        showDeleteButton?: boolean;
        showAddRow?: boolean;
        keyboardNavigation?: boolean;
        allowReorder?: boolean;
        allowDuplicate?: boolean;
        emptyMessage?: string;
        emptyDescription?: string;
        showColumnSettings?: boolean;
        highlightNewRows?: boolean;
    }>(),
    {
        label: "Items",
        minWidth: "1200px",
        showRowNumbers: true,
        showCheckboxes: true,
        showDeleteButton: true,
        showAddRow: true,
        keyboardNavigation: true,
        allowReorder: true,
        allowDuplicate: true,
        emptyMessage: "No rows added",
        emptyDescription: "Add items to get started",
        showColumnSettings: true,
        highlightNewRows: true,
    },
);

const emit = defineEmits<{
    (e: "update:rows", rows: ChildTableRow[]): void;
    (e: "add-row"): void;
    (e: "delete-row", index: number): void;
    (e: "delete-rows", indices: number[]): void;
    (e: "duplicate-row", index: number): void;
    (e: "move-row", fromIndex: number, direction: -1 | 1): void;
    (e: "cell-change", payload: { rowIndex: number; fieldname: string; value: any }): void;
    (e: "row-click", index: number): void;
}>();

const tableContainerRef = ref<HTMLElement | null>(null);
const inputRefs = ref<Map<string, HTMLInputElement>>(new Map());
const selectedIndices = ref<Set<number>>(new Set());
const showColumnSettingsModal = ref(false);
const hiddenColumns = ref<Set<string>>(new Set());

const visibleColumns = computed(() => {
    return props.columns.filter(
        (col) => col.visible !== false && !hiddenColumns.value.has(col.fieldname),
    );
});

const editableColumnNames = computed(() => {
    return visibleColumns.value
        .filter((col) => col.editable !== false && col.type !== "readonly" && col.type !== "component")
        .map((col) => col.fieldname);
});

const isAllRowsSelected = computed((): boolean | "indeterminate" => {
    if (isPartialSelect.value) return "indeterminate";
    return props.rows.length > 0 && selectedIndices.value.size === props.rows.length;
});

const isPartialSelect = computed(() => {
    return selectedIndices.value.size > 0 && selectedIndices.value.size < props.rows.length;
});

const totalColSpan = computed(() => {
    let count = visibleColumns.value.length;
    if (props.showRowNumbers) count++;
    if (props.showCheckboxes) count++;
    if (props.showDeleteButton || props.allowReorder || props.allowDuplicate) count++;
    return count;
});

function registerInput(
    rowIndex: number,
    fieldname: string,
    el: HTMLInputElement | null,
): void {
    const key = `${rowIndex}-${fieldname}`;
    if (el) {
        inputRefs.value.set(key, el);
    } else {
        inputRefs.value.delete(key);
    }
}

function focusCell(rowIndex: number, fieldname: string): void {
    const key = `${rowIndex}-${fieldname}`;
    nextTick(() => {
        const input = inputRefs.value.get(key);
        if (input) {
            input.focus();
            input.select();
        }
    });
}

function handleKeyDown(
    event: KeyboardEvent,
    rowIndex: number,
    fieldname: string,
): void {
    if (!props.keyboardNavigation) return;

    const cols = editableColumnNames.value;
    const colIndex = cols.indexOf(fieldname);
    const totalRows = props.rows.length;

    let newRowIndex = rowIndex;
    let newColIndex = colIndex;

    switch (event.key) {
        case "ArrowUp":
            event.preventDefault();
            newRowIndex = Math.max(0, rowIndex - 1);
            break;
        case "ArrowDown":
            event.preventDefault();
            newRowIndex = Math.min(totalRows - 1, rowIndex + 1);
            break;
        case "ArrowLeft":
            if ((event.target as HTMLInputElement)?.selectionStart === 0) {
                event.preventDefault();
                newColIndex = Math.max(0, colIndex - 1);
            } else {
                return;
            }
            break;
        case "ArrowRight": {
            const input = event.target as HTMLInputElement;
            if (input?.selectionStart === input?.value?.length) {
                event.preventDefault();
                newColIndex = Math.min(cols.length - 1, colIndex + 1);
            } else {
                return;
            }
            break;
        }
        case "Enter":
            event.preventDefault();
            if (rowIndex < totalRows - 1) {
                newRowIndex = rowIndex + 1;
            }
            break;
        case "Tab":
            return;
        default:
            return;
    }

    if (newRowIndex !== rowIndex || newColIndex !== colIndex) {
        const newField = cols[newColIndex];
        focusCell(newRowIndex, newField);
    }
}

watch(
    () => props.rows.length,
    (newLen, oldLen) => {
        if (!props.highlightNewRows || newLen <= oldLen) return;
        nextTick(() => {
            const lastIndex = newLen - 1;
            if (editableColumnNames.value.length > 0) {
                focusCell(lastIndex, editableColumnNames.value[0]);
            }
            const rows = tableContainerRef.value?.querySelectorAll(".ct-row");
            const lastRow = rows?.[lastIndex] as HTMLElement | null;
            if (lastRow) {
                lastRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
                lastRow.classList.add("ring-2", "ring-primary/50");
                setTimeout(() => {
                    lastRow.classList.remove("ring-2", "ring-primary/50");
                }, 800);
            }
        });
    },
);

function toggleSelectAll(): void {
    if (isAllRowsSelected.value === true) {
        selectedIndices.value.clear();
    } else {
        selectedIndices.value = new Set(props.rows.map((_, i) => i));
    }
}

function toggleRowSelect(index: number): void {
    if (selectedIndices.value.has(index)) {
        selectedIndices.value.delete(index);
    } else {
        selectedIndices.value.add(index);
    }
}

function addRow(): void {
    emit("add-row");
}

function deleteRow(index: number): void {
    selectedIndices.value.delete(index);
    emit("delete-row", index);
}

function deleteSelected(): void {
    const indices = Array.from(selectedIndices.value).sort((a, b) => b - a);
    emit("delete-rows", indices);
    selectedIndices.value.clear();
}

function duplicateRow(index: number): void {
    emit("duplicate-row", index);
}

function moveRow(index: number, direction: -1 | 1): void {
    emit("move-row", index, direction);
}

function onCellChange(rowIndex: number, fieldname: string, value: any): void {
    emit("cell-change", { rowIndex, fieldname, value });
}

function toggleColumnVisibility(fieldname: string): void {
    if (hiddenColumns.value.has(fieldname)) {
        hiddenColumns.value.delete(fieldname);
    } else {
        hiddenColumns.value.add(fieldname);
    }
}

function resetColumns(): void {
    hiddenColumns.value.clear();
}

function getAlignClass(align?: string): string {
    switch (align) {
        case "right":
            return "text-end";
        case "center":
            return "text-center";
        default:
            return "text-start";
    }
}

function getCellClass(col: ChildTableColumn, value: any, row: ChildTableRow, index: number): string {
    if (!col.cellClass) return "";
    if (typeof col.cellClass === "function") return col.cellClass(value, row, index);
    return col.cellClass;
}

function getSelectOptions(col: ChildTableColumn, row: ChildTableRow, index: number): SelectOption[] {
    if (!col.options) return [];
    if (typeof col.options === "function") return col.options(row, index);
    return col.options;
}

function formatValue(col: ChildTableColumn, value: any, row: ChildTableRow, index: number): string {
    if (col.format) return col.format(value, row, index);
    if (value === null || value === undefined) return "-";
    return String(value);
}

function handleTableKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === "d") {
        if (selectedIndices.value.size === 1) {
            event.preventDefault();
            const index = Array.from(selectedIndices.value)[0];
            duplicateRow(index);
        }
    }
    if (event.key === "Delete" && selectedIndices.value.size > 0) {
        const target = event.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;
        event.preventDefault();
        deleteSelected();
    }
}
</script>

<template>
    <div class="child-table border border-border rounded-lg overflow-hidden bg-background"
        @keydown="handleTableKeyDown">
        <div class="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
            <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-foreground">
                    {{ __(label) }}
                </span>
                <span class="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    {{ rows.length }}
                </span>
            </div>
            <div class="flex items-center gap-1.5">
                <template v-if="selectedIndices.size > 0">
                    <span class="text-[11px] font-medium text-blue-600 dark:text-blue-400 me-1">
                        {{ selectedIndices.size }} {{ __("selected") }}
                    </span>
                    <TooltipWrapper :content="__('Delete selected')">
                    <Button variant="ghost" size="icon" class="h-7 w-7 text-destructive hover:bg-destructive/10"
                        @click="deleteSelected">
                        <Trash2 class="w-3.5 h-3.5" />
                    </Button>
                    </TooltipWrapper>
                    <TooltipWrapper :content="__('Deselect all')">
                    <Button variant="ghost" size="icon" class="h-7 w-7"
                        @click="selectedIndices.clear()">
                        <X class="w-3.5 h-3.5" />
                    </Button>
                    </TooltipWrapper>
                    <div class="w-px h-4 bg-border mx-0.5" />
                </template>

                <slot name="toolbar" />

                <TooltipWrapper v-if="showColumnSettings" :content="__('Column settings')">
                <Button variant="ghost" size="icon" class="h-7 w-7"
                    @click="showColumnSettingsModal = true">
                    <Settings class="w-3.5 h-3.5" />
                </Button>
                </TooltipWrapper>

                <Button v-if="showAddRow" variant="outline" size="sm" class="h-7 text-xs" @click="addRow">
                    <Plus class="w-3.5 h-3.5 me-1" />
                    {{ __("Add Row") }}
                </Button>
            </div>
        </div>

        <div ref="tableContainerRef" class="overflow-auto ct-table-container">
            <div v-if="rows.length === 0" class="flex items-center justify-center py-12 px-8">
                <div class="text-center text-muted-foreground">
                    <Package class="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                    <p class="font-medium text-sm">{{ __(emptyMessage) }}</p>
                    <p class="text-xs mt-1">{{ __(emptyDescription) }}</p>
                    <Button v-if="showAddRow" variant="outline" size="sm" class="mt-3" @click="addRow">
                        <Plus class="w-3.5 h-3.5 me-1" />
                        {{ __("Add First Row") }}
                    </Button>
                </div>
            </div>

            <table v-else class="w-full text-sm border-collapse ct-table" :style="{ minWidth: minWidth }">
                <thead class="sticky top-0 z-20 bg-muted border-b border-border">
                    <tr class="text-xs text-muted-foreground uppercase tracking-wider">
                        <th v-if="showCheckboxes" class="w-8 px-2 py-2">
                            <Checkbox :checked="isAllRowsSelected" :indeterminate="isPartialSelect"
                                @update:checked="toggleSelectAll" />
                        </th>
                        <th v-if="showRowNumbers" class="px-2 py-2 text-center w-10">
                            #
                        </th>
                        <th v-for="col in visibleColumns" :key="col.fieldname" class="px-2 py-2 whitespace-nowrap"
                            :class="[getAlignClass(col.align), col.width]">
                            {{ __(col.label) }}
                            <span v-if="col.required" class="text-destructive">*</span>
                        </th>
                        <th v-if="showDeleteButton || allowReorder || allowDuplicate"
                            class="px-2 py-2 w-[80px] text-center">
                            {{ __("") }}
                        </th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border">
                    <tr v-for="(row, rowIndex) in rows" :key="`row-${rowIndex}`"
                        class="hover:bg-muted/50 transition-colors ct-row group" :class="{
                            'bg-blue-50/40 dark:bg-blue-900/10': selectedIndices.has(rowIndex),
                        }" @click="emit('row-click', rowIndex)">
                        <td v-if="showCheckboxes" class="px-2 py-1">
                            <Checkbox :checked="selectedIndices.has(rowIndex)" @update:checked="toggleRowSelect(rowIndex)" />
                        </td>

                        <td v-if="showRowNumbers"
                            class="px-2 py-1 text-center text-xs text-muted-foreground tabular-nums">
                            {{ rowIndex + 1 }}
                        </td>

                        <td v-for="col in visibleColumns" :key="`${rowIndex}-${col.fieldname}`" class="px-2 py-1"
                            :class="[getAlignClass(col.align)]">
                            <slot :name="`cell-${col.fieldname}`" :row="row" :index="rowIndex" :column="col"
                                :value="row[col.fieldname]"
                                :onChange="(val: any) => onCellChange(rowIndex, col.fieldname, val)"
                                :registerInput="(el: HTMLInputElement | null) => registerInput(rowIndex, col.fieldname, el)"
                                :onKeyDown="(e: KeyboardEvent) => handleKeyDown(e, rowIndex, col.fieldname)">

                                <Input v-if="col.type === 'text'" :model-value="row[col.fieldname] || ''"
                                    @update:model-value="onCellChange(rowIndex, col.fieldname, $event)"
                                    class="h-7 text-xs" :placeholder="col.placeholder ? __(col.placeholder) : ''"
                                    @keydown="handleKeyDown($event, rowIndex, col.fieldname)"
                                    :ref="(el: any) => registerInput(rowIndex, col.fieldname, el?.$el || el)" />

                                <NumberInput v-else-if="col.type === 'number'" :model-value="row[col.fieldname] ?? 0"
                                    @update:model-value="onCellChange(rowIndex, col.fieldname, $event)"
                                    :min="col.min ?? 0"
                                    :disable-spinner="true"
                                    :max="col.max" :precision="col.precision ?? 2"
                                    class="h-7 text-xs w-full"
                                    :placeholder="col.placeholder"
                                    @keydown="handleKeyDown($event, rowIndex, col.fieldname)"
                                    :ref="(el: any) => registerInput(rowIndex, col.fieldname, el?.$el?.querySelector('input') || el?.inputRef)" />

                                <Input v-else-if="col.type === 'date'" type="date"
                                    :model-value="row[col.fieldname] || ''"
                                    @update:model-value="onCellChange(rowIndex, col.fieldname, $event)"
                                    class="h-7 text-xs" @keydown="handleKeyDown($event, rowIndex, col.fieldname)"
                                    :ref="(el: any) => registerInput(rowIndex, col.fieldname, el?.$el || el)" />

                                <select v-else-if="col.type === 'select'" :value="row[col.fieldname]"
                                    @change="onCellChange(rowIndex, col.fieldname, ($event.target as HTMLSelectElement).value)"
                                    class="h-7 w-full px-1 border border-border rounded text-xs bg-background focus:ring-2 focus:ring-ring focus:outline-none"
                                    @keydown="handleKeyDown($event, rowIndex, col.fieldname)"
                                    :ref="(el: any) => registerInput(rowIndex, col.fieldname, el)">
                                    <option v-for="opt in getSelectOptions(col, row, rowIndex)" :key="opt.value"
                                        :value="opt.value">
                                        {{ opt.label }}
                                    </option>
                                </select>

                                <span v-else-if="col.type === 'readonly'" class="text-xs font-mono"
                                    :class="getCellClass(col, row[col.fieldname], row, rowIndex)">
                                    {{ formatValue(col, row[col.fieldname], row, rowIndex) }}
                                </span>

                                <span v-else-if="col.type === 'component'" />
                            </slot>
                        </td>

                        <td v-if="showDeleteButton || allowReorder || allowDuplicate" class="px-1 py-1">
                            <div
                                class="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <TooltipWrapper v-if="allowDuplicate" :content="__('Duplicate')">
                                <Button variant="ghost" size="icon" class="h-6 w-6"
                                    @click.stop="duplicateRow(rowIndex)">
                                    <Copy class="w-3 h-3" />
                                </Button>
                                </TooltipWrapper>
                                <TooltipWrapper v-if="allowReorder && rowIndex > 0" :content="__('Move up')">
                                <Button variant="ghost" size="icon" class="h-6 w-6"
                                    @click.stop="moveRow(rowIndex, -1)">
                                    <ChevronUp class="w-3 h-3" />
                                </Button>
                                </TooltipWrapper>
                                <TooltipWrapper v-if="allowReorder && rowIndex < rows.length - 1" :content="__('Move down')">
                                <Button variant="ghost" size="icon"
                                    class="h-6 w-6" @click.stop="moveRow(rowIndex, 1)">
                                    <ChevronDown class="w-3 h-3" />
                                </Button>
                                </TooltipWrapper>
                                <TooltipWrapper v-if="showDeleteButton" :content="__('Delete')">
                                <Button variant="ghost" size="icon"
                                    class="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    @click.stop="$emit('delete-row', rowIndex)">
                                    <Trash2 class="w-3 h-3" />
                                </Button>
                                </TooltipWrapper>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-if="rows.length > 0 && keyboardNavigation"
            class="flex items-center justify-between px-3 py-1.5 border-t border-border bg-muted/30">
            <span class="text-[10px] text-muted-foreground">
                {{ __("Arrow keys to navigate") }} &middot;
                {{ __("Enter for next row") }} &middot;
                {{ __("Ctrl+D to duplicate") }} &middot;
                {{ __("Del to delete selected") }}
            </span>
            <button v-if="showAddRow" type="button" class="text-[11px] text-primary hover:underline" @click="addRow">
                + {{ __("Add Row") }}
            </button>
        </div>

        <Teleport to="body">
            <Transition name="ct-modal">
                <div v-if="showColumnSettingsModal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
                    @click.self="showColumnSettingsModal = false">
                    <div class="absolute inset-0 bg-black/50" @click="showColumnSettingsModal = false" />
                    <div
                        class="relative bg-background border border-border rounded-lg shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col">
                        <div class="flex items-center justify-between px-4 py-3 border-b border-border">
                            <h3 class="text-sm font-semibold text-foreground">
                                {{ __("Column Settings") }}
                            </h3>
                            <Button variant="ghost" size="icon" class="h-7 w-7"
                                @click="showColumnSettingsModal = false">
                                <X class="w-4 h-4" />
                            </Button>
                        </div>

                        <div class="flex-1 overflow-auto px-4 py-3 space-y-1">
                            <label v-for="col in columns" :key="col.fieldname"
                                class="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                                :class="{ 'opacity-50 cursor-not-allowed': col.alwaysVisible }">
                                <input type="checkbox" :checked="!hiddenColumns.has(col.fieldname)"
                                    :disabled="col.alwaysVisible" @change="toggleColumnVisibility(col.fieldname)"
                                    class="w-3.5 h-3.5 rounded border-border text-primary focus:ring-ring" />
                                <span>{{ __(col.label) }}</span>
                                <span v-if="col.required" class="text-destructive text-xs">*</span>
                            </label>
                        </div>

                        <div class="flex items-center justify-between px-4 py-3 border-t border-border">
                            <Button variant="ghost" size="sm" @click="resetColumns">
                                {{ __("Reset") }}
                            </Button>
                            <Button size="sm" @click="showColumnSettingsModal = false">
                                <Check class="w-3.5 h-3.5 me-1" />
                                {{ __("Done") }}
                            </Button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
.ct-table-container {
    position: relative;
}

.ct-table {
    border-collapse: separate;
    border-spacing: 0;
}

.ct-row {
    transition: background-color 0.15s ease, box-shadow 0.3s ease;
}

.ct-modal-enter-active,
.ct-modal-leave-active {
    transition: opacity 0.2s ease;
}

.ct-modal-enter-from,
.ct-modal-leave-to {
    opacity: 0;
}
</style>
