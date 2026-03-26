<script setup lang="ts">
import { computed, ref, watch, nextTick, type HTMLAttributes } from "vue";
import { Search, X, ChevronDown, Loader2, Check } from "lucide-vue-next";
import { PopoverRoot, PopoverPortal, PopoverContent, PopoverAnchor } from "radix-vue";
import { cn } from "@/lib/utils";

export interface AutocompleteOption {
	label: string;
	value: string;
	description?: string;
	icon?: string;
	disabled?: boolean;
	group?: string;
}

const props = withDefaults(
	defineProps<{
		modelValue?: string;
		options?: AutocompleteOption[];
		placeholder?: string;
		disabled?: boolean;
		loading?: boolean;
		clearable?: boolean;
		minChars?: number;
		maxVisible?: number;
		label?: string;
		remoteSearch?: boolean;
		showSearchIcon?: boolean;
		emptyText?: string;
		class?: HTMLAttributes["class"];
	}>(),
	{
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
	},
);

const emit = defineEmits<{
	(e: "update:modelValue", value: string): void;
	(e: "search", query: string): void;
	(e: "select", option: AutocompleteOption): void;
	(e: "clear"): void;
	(e: "focus"): void;
	(e: "blur"): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const open = ref(false);
const query = ref("");
const highlightedIndex = ref(-1);

const selectedOption = computed(() => props.options.find((o) => o.value === props.modelValue));

const displayText = computed(() => selectedOption.value?.label ?? "");

watch(open, (isOpen) => {
	if (!isOpen) {
		query.value = displayText.value;
		highlightedIndex.value = -1;
	}
});

watch(
	() => props.modelValue,
	() => {
		if (!open.value) {
			query.value = displayText.value;
		}
	},
	{ immediate: true },
);

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

const matchCount = computed(() => filteredOptions.value.length);

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

const flatVisibleOptions = computed(() => filteredOptions.value.slice(0, props.maxVisible));

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function onInput() {
	if (!open.value) open.value = true;
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
	open.value = false;
}

function clearSelection() {
	emit("update:modelValue", "");
	emit("clear");
	query.value = "";
	open.value = false;
	nextTick(() => {
		getInputEl()?.focus();
	});
}

function onFocus() {
	open.value = true;
	query.value = "";
	emit("focus");
}

function onKeydown(e: KeyboardEvent) {
	const opts = flatVisibleOptions.value;

	switch (e.key) {
		case "ArrowDown":
			e.preventDefault();
			if (!open.value) open.value = true;
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
			open.value = false;
			break;
		case "Tab":
			open.value = false;
			break;
	}
}

function scrollToHighlighted() {
	nextTick(() => {
		const item = rootRef.value
			?.closest("body")
			?.querySelector(`[data-autocomplete-index="${highlightedIndex.value}"]`) as HTMLElement | null;
		item?.scrollIntoView({ block: "nearest" });
	});
}

function getInputEl(): HTMLInputElement | null {
	return rootRef.value?.querySelector("input") ?? null;
}
</script>

<template>
	<div ref="rootRef" :class="cn('w-full', props.class)">
		<label v-if="label" class="block text-sm font-medium text-foreground mb-1.5">
			{{ label }}
		</label>

		<PopoverRoot v-model:open="open">
			<PopoverAnchor as-child>
				<div class="relative">
					<Search
						v-if="showSearchIcon"
						class="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
					/>
					<input
						v-model="query"
						type="text"
						autocomplete="new-password"
						:placeholder="modelValue ? displayText : placeholder"
						:disabled="disabled"
						:class="
							cn(
								'flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50',
								showSearchIcon && 'ps-9',
								clearable && modelValue ? 'pe-16' : 'pe-8',
							)
						"
						@input="onInput"
						@focus="onFocus"
						@keydown="onKeydown"
					/>

					<div class="absolute end-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
						<button
							v-if="clearable && modelValue"
							type="button"
							tabindex="-1"
							class="p-0.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
							@mousedown.prevent="clearSelection"
						>
							<X class="h-3.5 w-3.5" />
						</button>
						<Loader2 v-if="loading" class="h-4 w-4 text-muted-foreground animate-spin" />
						<button
							v-else
							type="button"
							tabindex="-1"
							class="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
							@mousedown.prevent="open = !open"
						>
							<ChevronDown
								class="h-4 w-4 transition-transform duration-200"
								:class="{ 'rotate-180': open }"
							/>
						</button>
					</div>
				</div>
			</PopoverAnchor>

			<PopoverPortal>
				<PopoverContent
					align="start"
					side="bottom"
					:side-offset="4"
					class="z-[99999] w-[var(--radix-popover-trigger-width)] max-h-[280px] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
					@open-auto-focus.prevent
					@focus-outside.prevent
				>
					<div
						v-if="loading && filteredOptions.length === 0"
						class="flex items-center justify-center py-6 text-sm text-muted-foreground"
					>
						<Loader2 class="h-5 w-5 text-primary animate-spin" />
						<span class="ms-2">Searching...</span>
					</div>

					<div v-else-if="filteredOptions.length === 0" class="py-6 text-center">
						<Search class="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
						<p class="text-sm text-muted-foreground">{{ emptyText }}</p>
					</div>

					<template v-else>
						<template v-for="(groupOptions, groupName) in groupedOptions.groups" :key="groupName">
							<div
								class="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40 border-b border-border/50 sticky top-0"
							>
								{{ groupName }}
							</div>
							<button
								v-for="option in groupOptions"
								:key="option.value"
								:data-autocomplete-index="flatVisibleOptions.indexOf(option)"
								type="button"
								:disabled="option.disabled"
								class="flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-start text-sm transition-colors outline-none cursor-pointer"
								:class="[
									flatVisibleOptions.indexOf(option) === highlightedIndex
										? 'bg-accent text-accent-foreground'
										: 'hover:bg-accent/50',
									option.disabled && '!opacity-50 !cursor-not-allowed',
									option.value === modelValue && 'font-medium text-primary',
								]"
								role="option"
								:aria-selected="option.value === modelValue"
								@click="selectOption(option)"
								@mouseenter="highlightedIndex = flatVisibleOptions.indexOf(option)"
							>
								<div class="flex-1 min-w-0">
									<div class="truncate">{{ option.label }}</div>
									<div
										v-if="option.description"
										class="text-xs text-muted-foreground truncate mt-0.5"
									>
										{{ option.description }}
									</div>
								</div>
								<Check
									v-if="option.value === modelValue"
									class="h-4 w-4 text-primary shrink-0"
								/>
							</button>
						</template>

						<button
							v-for="option in groupedOptions.ungrouped"
							:key="option.value"
							:data-autocomplete-index="flatVisibleOptions.indexOf(option)"
							type="button"
							:disabled="option.disabled"
							class="flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-start text-sm transition-colors outline-none cursor-pointer"
							:class="[
								flatVisibleOptions.indexOf(option) === highlightedIndex
									? 'bg-accent text-accent-foreground'
									: 'hover:bg-accent/50',
								option.disabled && '!opacity-50 !cursor-not-allowed',
								option.value === modelValue && 'font-medium text-primary',
							]"
							role="option"
							:aria-selected="option.value === modelValue"
							@click="selectOption(option)"
							@mouseenter="highlightedIndex = flatVisibleOptions.indexOf(option)"
						>
							<div class="flex-1 min-w-0">
								<div class="truncate">{{ option.label }}</div>
								<div
									v-if="option.description"
									class="text-xs text-muted-foreground truncate mt-0.5"
								>
									{{ option.description }}
								</div>
							</div>
							<Check v-if="option.value === modelValue" class="h-4 w-4 text-primary shrink-0" />
						</button>
					</template>

					<div
						v-if="filteredOptions.length > maxVisible"
						class="px-3 py-2 text-xs text-center text-muted-foreground border-t border-border bg-muted/30 rounded-b-lg"
					>
						{{ filteredOptions.length - maxVisible }} more — type to refine
					</div>

					<div
						v-else-if="query && matchCount > 0 && matchCount <= maxVisible"
						class="px-3 py-1.5 text-[11px] text-center text-muted-foreground border-t border-border/50 bg-muted/20 rounded-b-lg"
					>
						{{ matchCount }} {{ matchCount === 1 ? "match" : "matches" }}
					</div>
				</PopoverContent>
			</PopoverPortal>
		</PopoverRoot>
	</div>
</template>
