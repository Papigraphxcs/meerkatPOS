<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick, type HTMLAttributes } from "vue";
import { Search, X, ChevronDown, Loader2, Check } from "lucide-vue-next";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface AutocompleteOption {
  label: string;
  value: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
  group?: string;
}

const props = withDefaults(defineProps<{
  /** Currently selected value */
  modelValue?: string;
  /** Static options list */
  options?: AutocompleteOption[];
  /** Placeholder text when nothing is selected */
  placeholder?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Show a loading spinner (useful for async/remote search) */
  loading?: boolean;
  /** Allow clearing the current selection */
  clearable?: boolean;
  /** Minimum characters before filter/search triggers */
  minChars?: number;
  /** Maximum visible options in the dropdown */
  maxVisible?: number;
  /** Label displayed above the input */
  label?: string;
  /** Disable local filtering (for server-side search) */
  remoteSearch?: boolean;
  /** Show search icon in input */
  showSearchIcon?: boolean;
  /** Empty state message */
  emptyText?: string;
  /** CSS class for root element */
  class?: HTMLAttributes["class"];
}>(), {
  placeholder: "Search or select...",
  disabled: false,
  loading: false,
  clearable: true,
  minChars: 0,
  maxVisible: 8,
  remoteSearch: false,
  showSearchIcon: true,
  emptyText: "No results found",
  options: () => [],
});

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "search", query: string): void;
  (e: "select", option: AutocompleteOption): void;
  (e: "clear"): void;
  (e: "focus"): void;
  (e: "blur"): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const query = ref("");
const highlightedIndex = ref(-1);

// Resolve display text from value
const selectedOption = computed(() =>
  props.options.find((o) => o.value === props.modelValue),
);

const displayText = computed(() => selectedOption.value?.label ?? "");

// Sync query when closed
watch(isOpen, (open) => {
  if (!open) {
    query.value = displayText.value;
    highlightedIndex.value = -1;
  }
});

// Initialize query to match selected value
watch(
  () => props.modelValue,
  () => {
    if (!isOpen.value) {
      query.value = displayText.value;
    }
  },
  { immediate: true },
);

// Filtered options (local filtering)
const filteredOptions = computed(() => {
  if (props.remoteSearch) return props.options;

  const q = query.value.trim().toLowerCase();
  if (!q || q.length < props.minChars) return props.options;

  return props.options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(q) ||
      opt.value.toLowerCase().includes(q) ||
      (opt.description && opt.description.toLowerCase().includes(q)),
  );
});

// Grouped options
const groupedOptions = computed(() => {
  const groups: Record<string, AutocompleteOption[]> = {};
  const ungrouped: AutocompleteOption[] = [];

  for (const opt of filteredOptions.value.slice(0, props.maxVisible)) {
    if (opt.group) {
      if (!groups[opt.group]) groups[opt.group] = [];
      groups[opt.group].push(opt);
    } else {
      ungrouped.push(opt);
    }
  }

  return { groups, ungrouped };
});

const flatVisibleOptions = computed(() =>
  filteredOptions.value.slice(0, props.maxVisible),
);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function onInput() {
  isOpen.value = true;
  highlightedIndex.value = -1;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    emit("search", query.value);
  }, 250);
}

function selectOption(option: AutocompleteOption) {
  if (option.disabled) return;
  emit("update:modelValue", option.value);
  emit("select", option);
  query.value = option.label;
  isOpen.value = false;
}

function clearSelection() {
  emit("update:modelValue", "");
  emit("clear");
  query.value = "";
  isOpen.value = false;
  getInputEl()?.focus();
}

function onFocus() {
  isOpen.value = true;
  query.value = "";
  emit("focus");
}

function onBlurDelayed() {
  // Delay to allow click on option
  setTimeout(() => {
    if (!rootRef.value?.contains(document.activeElement)) {
      isOpen.value = false;
      emit("blur");
    }
  }, 200);
}

function onKeydown(e: KeyboardEvent) {
  const opts = flatVisibleOptions.value;

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      if (!isOpen.value) {
        isOpen.value = true;
      }
      highlightedIndex.value = Math.min(highlightedIndex.value + 1, opts.length - 1);
      scrollToHighlighted();
      break;
    case "ArrowUp":
      e.preventDefault();
      highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
      scrollToHighlighted();
      break;
    case "Enter":
      e.preventDefault();
      if (highlightedIndex.value >= 0 && highlightedIndex.value < opts.length) {
        selectOption(opts[highlightedIndex.value]);
      }
      break;
    case "Escape":
      e.preventDefault();
      isOpen.value = false;
      break;
    case "Tab":
      isOpen.value = false;
      break;
  }
}

function scrollToHighlighted() {
  nextTick(() => {
    const list = listRef.value;
    if (!list) return;
    const item = list.querySelector(`[data-index="${highlightedIndex.value}"]`) as HTMLElement | null;
    item?.scrollIntoView({ block: "nearest" });
  });
}

function getInputEl(): HTMLInputElement | null {
  return rootRef.value?.querySelector("input") ?? null;
}

// Click outside
function onClickOutside(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener("mousedown", onClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("mousedown", onClickOutside);
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>

<template>
  <div ref="rootRef" :class="cn('relative w-full', props.class)">
    <!-- Label -->
    <label v-if="label" class="block text-sm font-medium text-foreground mb-1.5">
      {{ label }}
    </label>

    <!-- Input Trigger -->
    <div class="relative">
      <Search v-if="showSearchIcon"
        class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input ref="inputRef" v-model="query" type="text" autocomplete="off"
        :placeholder="modelValue ? displayText : placeholder" :disabled="disabled" :class="cn(
          'flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          showSearchIcon && 'pl-9',
          (clearable && modelValue) && 'pr-16',
          !(clearable && modelValue) && 'pr-8',
        )" @input="onInput" @focus="onFocus" @blur="onBlurDelayed" @keydown="onKeydown" />
      <!-- Loading / Chevron -->
      <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        <button v-if="clearable && modelValue" type="button" tabindex="-1"
          class="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          @mousedown.prevent="clearSelection">
          <X class="h-3.5 w-3.5" />
        </button>
        <Loader2 v-if="loading" class="h-4 w-4 text-muted-foreground animate-spin" />
        <ChevronDown v-else class="h-4 w-4 text-muted-foreground transition-transform"
          :class="{ 'rotate-180': isOpen }" />
      </div>
    </div>
    
    <Transition enter-active-class="transition ease-out duration-100" enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0" leave-active-class="transition ease-in duration-75"
      leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 -translate-y-1">
      <div v-if="isOpen" ref="listRef"
        class="absolute z-99000 mt-1 w-full max-h-[280px] overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
        role="listbox">
        <!-- Loading state -->
        <div v-if="loading && filteredOptions.length === 0" class="flex items-center justify-center py-6">
          <Loader2 class="h-5 w-5 text-primary animate-spin" />
          <span class="ml-2 text-sm text-muted-foreground">Searching...</span>
        </div>

        <!-- Empty state -->
        <div v-else-if="filteredOptions.length === 0" class="py-6 text-center text-sm text-muted-foreground">
          {{ emptyText }}
        </div>

        <!-- Options (ungrouped) -->
        <template v-else>
          <!-- Grouped options -->
          <template v-for="(groupOptions, groupName) in groupedOptions.groups" :key="groupName">
            <div class="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
              {{ groupName }}
            </div>
            <button v-for="(option, idx) in groupOptions" :key="option.value"
              :data-index="flatVisibleOptions.indexOf(option)" type="button" :disabled="option.disabled"
              class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors outline-none" :class="[
                flatVisibleOptions.indexOf(option) === highlightedIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50',
                option.disabled && 'opacity-50 cursor-not-allowed',
                option.value === modelValue && 'font-medium',
              ]" role="option" :aria-selected="option.value === modelValue" @mousedown.prevent="selectOption(option)"
              @mouseenter="highlightedIndex = flatVisibleOptions.indexOf(option)">
              <div class="flex-1 min-w-0">
                <div class="truncate">{{ option.label }}</div>
                <div v-if="option.description" class="text-xs text-muted-foreground truncate">
                  {{ option.description }}
                </div>
              </div>
              <Check v-if="option.value === modelValue" class="h-4 w-4 text-primary shrink-0" />
            </button>
          </template>

          <!-- Ungrouped options -->
          <button v-for="option in groupedOptions.ungrouped" :key="option.value"
            :data-index="flatVisibleOptions.indexOf(option)" type="button" :disabled="option.disabled"
            class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors outline-none" :class="[
              flatVisibleOptions.indexOf(option) === highlightedIndex
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/50',
              option.disabled && 'opacity-50 cursor-not-allowed',
              option.value === modelValue && 'font-medium',
            ]" role="option" :aria-selected="option.value === modelValue" @mousedown.prevent="selectOption(option)"
            @mouseenter="highlightedIndex = flatVisibleOptions.indexOf(option)">
            <div class="flex-1 min-w-0">
              <div class="truncate">{{ option.label }}</div>
              <div v-if="option.description" class="text-xs text-muted-foreground truncate">
                {{ option.description }}
              </div>
            </div>
            <Check v-if="option.value === modelValue" class="h-4 w-4 text-primary shrink-0" />
          </button>
        </template>

        <!-- Max reached hint -->
        <div v-if="filteredOptions.length > maxVisible"
          class="px-3 py-2 text-xs text-center text-muted-foreground border-t border-border bg-muted/30">
          {{ filteredOptions.length - maxVisible }} more results — refine your search
        </div>
      </div>
    </Transition>
  </div>
</template>
