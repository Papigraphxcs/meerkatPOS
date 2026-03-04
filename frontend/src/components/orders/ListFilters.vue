<template>
  <div class="flex flex-wrap items-center gap-2">
    <div class="flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1">
      <DateTimePicker v-model="localFilters.fromDate" mode="date" placeholder="From date" :show-today="true"
        :clearable="true" class="w-36" @change="emitFilters" />
      <span class="text-muted-foreground text-xs">to</span>
      <DateTimePicker v-model="localFilters.toDate" mode="date" placeholder="To date" :show-today="true"
        :clearable="true" class="w-36" @change="emitFilters" />
    </div>
    <Select v-model="localFilters.status" @update:model-value="emitFilters">
      <SelectTriggerStyled class="h-8 w-[140px]">
        <SelectValue placeholder="Status" />
      </SelectTriggerStyled>
      <SelectContentStyled>
        <SelectItemStyled value="__all__">All Status</SelectItemStyled>
        <SelectItemStyled value="Paid">Paid</SelectItemStyled>
        <SelectItemStyled value="Unpaid">Unpaid</SelectItemStyled>
        <SelectItemStyled value="Overdue">Overdue</SelectItemStyled>
        <SelectItemStyled value="Return">Return</SelectItemStyled>
        <SelectItemStyled value="Credit Note Issued">Credit Note Issued</SelectItemStyled>
        <SelectItemStyled value="Cancelled">Cancelled</SelectItemStyled>
      </SelectContentStyled>
    </Select>

    <Select v-model="localFilters.isReturn" @update:model-value="emitFilters">
      <SelectTriggerStyled class="h-8 w-[130px]">
        <SelectValue placeholder="Type" />
      </SelectTriggerStyled>
      <SelectContentStyled>
        <SelectItemStyled value="__all__">All Types</SelectItemStyled>
        <SelectItemStyled value="0">Sales</SelectItemStyled>
        <SelectItemStyled value="1">Returns</SelectItemStyled>
      </SelectContentStyled>
    </Select>

    <!-- Sort By -->
    <Select v-model="localFilters.orderBy" @update:model-value="emitFilters">
      <SelectTriggerStyled class="h-8 w-[160px]">
        <SelectValue placeholder="Sort By" />
      </SelectTriggerStyled>
      <SelectContentStyled>
        <SelectItemStyled value="posting_date desc, posting_time desc">Date (Newest)</SelectItemStyled>
        <SelectItemStyled value="posting_date asc, posting_time asc">Date (Oldest)</SelectItemStyled>
        <SelectItemStyled value="grand_total desc">Amount (High)</SelectItemStyled>
        <SelectItemStyled value="grand_total asc">Amount (Low)</SelectItemStyled>
        <SelectItemStyled value="name desc">Invoice # (Newest)</SelectItemStyled>
        <SelectItemStyled value="name asc">Invoice # (Oldest)</SelectItemStyled>
      </SelectContentStyled>
    </Select>

    <!-- Spacer -->
    <div class="flex-1"></div>

    <!-- Query Filters Popover -->
    <Popover v-model:open="showQueryPopover">
      <PopoverTrigger as-child>
        <Button variant="outline" size="sm" class="h-8 gap-1"
          :class="{ 'bg-primary text-primary-foreground hover:bg-primary/90': queryFilters.length > 0 }">
          <Filter class="h-3.5 w-3.5" />
          Filters
          <Badge v-if="queryFilters.length > 0" :variant="queryFilters.length > 0 ? 'secondary' : 'outline'"
            class="ml-1 h-5 min-w-5 px-1.5 bg-background text-foreground">
            {{ queryFilters.length }}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContentStyled class="w-[500px] p-0 overflow-visible" align="end">
        <div class="p-3 border-b border-border">
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-foreground">Query Filters</span>
            <Button variant="outline" size="sm" class="h-7 text-xs" @click="addQueryFilter">
              <Plus class="h-3 w-3" />
              {{ __('Add Filter') }}
            </Button>
          </div>
        </div>

        <div class="p-3 space-y-2 max-h-[300px] overflow-y-auto">
          <!-- Filter Rows -->
          <div v-for="(filter, index) in queryFilters" :key="index" class="flex items-center gap-2">
            <!-- Field Autocomplete -->
            <Autocomplete v-model="filter.field" :options="filterFieldOptions" placeholder="Search fields..."
              :show-search-icon="false" :clearable="false" :max-visible="10" empty-text="No fields found"
              class="w-[150px]" @update:model-value="emitFilters" />

            <!-- Operator Select -->
            <Select v-model="filter.operator" @update:model-value="emitFilters">
              <SelectTriggerStyled class="h-8 w-[100px]">
                <SelectValue placeholder="Op" />
              </SelectTriggerStyled>
              <SelectContentStyled>
                <SelectItemStyled v-for="op in getOperators(filter.field)" :key="op.value" :value="op.value">
                  {{ op.label }}
                </SelectItemStyled>
              </SelectContentStyled>
            </Select>

            <!-- Value Input -->
            <Input v-if="!['is', 'is not'].includes(filter.operator)" v-model="filter.value" type="text"
              placeholder="Value" class="h-8 flex-1" @change="emitFilters" />
            <Select v-else v-model="filter.value" @update:model-value="emitFilters">
              <SelectTriggerStyled class="h-8 flex-1">
                <SelectValue placeholder="Value" />
              </SelectTriggerStyled>
              <SelectContentStyled>
                <SelectItemStyled value="set">Set (has value)</SelectItemStyled>
                <SelectItemStyled value="not set">Not Set (empty)</SelectItemStyled>
              </SelectContentStyled>
            </Select>

            <!-- Remove Button -->
            <Button variant="ghost" size="icon-sm" class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              @click="removeQueryFilter(index)">
              <X class="h-3.5 w-3.5" />
            </Button>
          </div>

          <div v-if="queryFilters.length === 0" class="text-sm text-muted-foreground py-4 text-center">
            {{ __('No query filters. Click "Add Filter" to add one.') }}
          </div>
        </div>

        <div v-if="queryFilters.length > 0" class="p-3 border-t border-border flex justify-end gap-2">
          <Button variant="ghost" size="sm" class="h-7" @click="clearQueryFilters">
            {{ __('Clear All') }}
          </Button>
          <Button size="sm" class="h-7" @click="showQueryPopover = false">
            {{ __('Apply') }}
          </Button>
        </div>
      </PopoverContentStyled>
    </Popover>

    <!-- Refresh Button -->
    <Button variant="outline" size="sm" class="h-8" @click="$emit('refresh')">
      <RefreshCw class="h-3.5 w-3.5" />
    </Button>

    <!-- Clear Filters -->
    <Button v-if="hasActiveFilters" variant="ghost" size="sm" class="h-8 text-muted-foreground hover:text-foreground"
      @click="clearFilters">
      <X class="h-3.5 w-3.5" />
      Clear
    </Button>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Autocomplete } from "@/components/ui/autocomplete";
import type { AutocompleteOption } from "@/components/ui/autocomplete";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTriggerStyled, SelectContentStyled, SelectItemStyled, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContentStyled } from "@/components/ui/popover";
import { Calendar, Filter, Plus, X, RefreshCw } from "lucide-vue-next";
import __ from "@/lib/translate";

interface QueryFilter {
  field: string;
  operator: string;
  value: string;
}

interface FilterField {
  label: string;
  value: string;
  type: "text" | "number" | "date" | "select";
  options?: { label: string; value: string }[];
}

const props = withDefaults(defineProps<{
  fromDate: string;
  toDate: string;
}>(), {
  fromDate: "",
  toDate: "",
});

const emit = defineEmits<{
  (e: "update", filters: {
    fromDate: string;
    toDate: string;
    status: string;
    isReturn: string;
    orderBy: string;
    queryFilters: [string, string, string][];
  }): void;
  (e: "refresh"): void;
}>();

const showQueryPopover = ref(false);

const localFilters = reactive({
  fromDate: props.fromDate,
  toDate: props.toDate,
  status: "__all__",
  isReturn: "__all__",
  orderBy: "posting_date desc, posting_time desc",
});

const queryFilters = ref<QueryFilter[]>([]);

const filterFields: FilterField[] = [
  { label: "Customer", value: "customer", type: "text" },
  { label: "Customer Name", value: "customer_name", type: "text" },
  { label: "Grand Total", value: "grand_total", type: "number" },
  { label: "Net Total", value: "net_total", type: "number" },
  { label: "Paid Amount", value: "paid_amount", type: "number" },
  { label: "Outstanding", value: "outstanding_amount", type: "number" },
  { label: "Return Against", value: "return_against", type: "text" },
  { label: "Owner", value: "owner", type: "text" },
];

const filterFieldOptions = computed<AutocompleteOption[]>(() =>
  filterFields.map((f) => ({ label: f.label, value: f.value, description: f.type }))
);

const textOperators = [
  { label: "equals", value: "=" },
  { label: "not equals", value: "!=" },
  { label: "like", value: "like" },
  { label: "not like", value: "not like" },
  { label: "is", value: "is" },
  { label: "is not", value: "is not" },
];

const numberOperators = [
  { label: "=", value: "=" },
  { label: "!=", value: "!=" },
  { label: ">", value: ">" },
  { label: "<", value: "<" },
  { label: ">=", value: ">=" },
  { label: "<=", value: "<=" },
  { label: "is", value: "is" },
  { label: "is not", value: "is not" },
];

function getOperators(fieldValue: string) {
  const field = filterFields.find(f => f.value === fieldValue);
  if (!field) return textOperators;
  return field.type === "number" ? numberOperators : textOperators;
}

const hasActiveFilters = computed(() => {
  return (
    localFilters.status !== "__all__" ||
    localFilters.isReturn !== "__all__" ||
    queryFilters.value.length > 0
  );
});

function addQueryFilter() {
  queryFilters.value.push({
    field: "customer_name",
    operator: "like",
    value: "",
  });
}

function removeQueryFilter(index: number) {
  queryFilters.value.splice(index, 1);
  emitFilters();
}

function clearQueryFilters() {
  queryFilters.value = [];
  emitFilters();
}

function clearFilters() {
  localFilters.status = "__all__";
  localFilters.isReturn = "__all__";
  queryFilters.value = [];
  emitFilters();
}

function emitFilters() {
  // Build query filters array
  const builtFilters: [string, string, string][] = [];

  // Add status filter
  if (localFilters.status !== "__all__") {
    builtFilters.push(["status", "=", localFilters.status]);
  }

  // Add is_return filter
  if (localFilters.isReturn !== "__all__") {
    builtFilters.push(["is_return", "=", localFilters.isReturn]);
  }

  // Add query filters
  for (const f of queryFilters.value) {
    if (f.field && f.operator && (f.value || ["is", "is not"].includes(f.operator))) {
      builtFilters.push([f.field, f.operator, f.value]);
    }
  }

  emit("update", {
    fromDate: localFilters.fromDate,
    toDate: localFilters.toDate,
    status: localFilters.status,
    isReturn: localFilters.isReturn,
    orderBy: localFilters.orderBy,
    queryFilters: builtFilters,
  });
}

// Watch for prop changes
watch(() => props.fromDate, (val) => {
  localFilters.fromDate = val;
});

watch(() => props.toDate, (val) => {
  localFilters.toDate = val;
});
</script>
