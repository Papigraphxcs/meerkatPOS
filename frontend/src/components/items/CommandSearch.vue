<template>
	<Dialog :open="isOpen" @update:open="handleOpenChange">
		<DialogContent class="max-w-lg p-0 gap-0 overflow-hidden" :hide-close="true"
			@pointerDownOutside="isOpen = false" @escapeKeyDown="isOpen = false">
			<!-- Search Input -->
			<div class="flex items-center border-b border-border px-4">
				<Search class="w-5 h-5 text-muted-foreground shrink-0" />
				<input ref="searchInputRef" v-model="searchTerm" @input="onSearch"
					@keydown.down.prevent="navigateDown" @keydown.up.prevent="navigateUp"
					@keydown.enter.prevent="selectHighlighted" @keydown.escape.prevent="close"
					:placeholder="__('Search items by name, code or barcode...')"
					class="flex-1 h-12 px-3 text-sm bg-transparent border-0 outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground" />
				<kbd
					class="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted rounded border border-border">
					ESC
				</kbd>
			</div>

			<!-- Results -->
			<div ref="resultsContainer" class="max-h-[320px] overflow-y-auto">
				<div v-if="isSearching" class="flex items-center justify-center py-8">
					<Loader2 class="w-5 h-5 animate-spin text-muted-foreground" />
				</div>

				<div v-else-if="searchTerm && items.length === 0" class="py-8 text-center text-muted-foreground">
					<Package class="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
					<p class="text-sm">{{ __("No items found") }}</p>
				</div>

				<div v-else-if="items.length > 0" class="py-1">
					<button v-for="(item, index) in items" :key="item.item_code"
						:data-command-index="index" @click="selectItem(item)"
						@mouseenter="highlightedIndex = index"
						class="w-full flex items-center gap-3 px-4 py-2.5 text-start transition-colors"
						:class="index === highlightedIndex
							? 'bg-primary/10 text-foreground'
							: 'text-foreground hover:bg-muted'">
						<div
							class="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
							<img v-if="item.image" :src="item.image" :alt="item.item_name"
								class="w-full h-full object-cover" loading="lazy" />
							<Package v-else class="w-4 h-4 text-muted-foreground/60" />
						</div>
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium truncate">{{ item.item_name }}</p>
							<p class="text-xs text-muted-foreground truncate">{{ item.item_code }}</p>
						</div>
						<div class="text-end shrink-0">
							<p class="text-sm font-medium text-green-600">
								{{ currencySymbol }}{{ (item.rate || 0).toFixed(2) }}
							</p>
							<p class="text-xs text-muted-foreground">{{ item.stock_uom }}</p>
						</div>
					</button>
				</div>

				<div v-else class="py-6 text-center text-muted-foreground">
					<p class="text-sm">{{ __("Type to search items...") }}</p>
				</div>
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/50 text-xs text-muted-foreground">
				<div class="flex items-center gap-3">
					<span class="flex items-center gap-1">
						<kbd class="px-1 py-0.5 font-mono bg-background rounded border border-border">&uarr;</kbd>
						<kbd class="px-1 py-0.5 font-mono bg-background rounded border border-border">&darr;</kbd>
						{{ __("navigate") }}
					</span>
					<span class="flex items-center gap-1">
						<kbd class="px-1 py-0.5 font-mono bg-background rounded border border-border">&crarr;</kbd>
						{{ __("select") }}
					</span>
				</div>
				<span class="flex items-center gap-1">
					<kbd class="px-1 py-0.5 font-mono bg-background rounded border border-border">esc</kbd>
					{{ __("close") }}
				</span>
			</div>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Search, Package, Loader2 } from "lucide-vue-next";
import { call } from "@/services/api";
import type { POSItem } from "@/types/pos.types";
import __ from "@/lib/translate";

const props = defineProps<{
	posProfile: string;
	currencySymbol: string;
}>();

const emit = defineEmits<{
	selectItem: [item: POSItem];
}>();

const isOpen = ref(false);
const searchTerm = ref("");
const items = ref<POSItem[]>([]);
const isSearching = ref(false);
const highlightedIndex = ref(-1);
const searchInputRef = ref<HTMLInputElement | null>(null);
const resultsContainer = ref<HTMLElement | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let searchAbort: AbortController | null = null;

function open() {
	isOpen.value = true;
	searchTerm.value = "";
	items.value = [];
	highlightedIndex.value = -1;
	nextTick(() => searchInputRef.value?.focus());
}

function close() {
	isOpen.value = false;
	searchTerm.value = "";
	items.value = [];
}

function handleOpenChange(open: boolean) {
	if (!open) close();
}

function onSearch() {
	highlightedIndex.value = -1;
	if (debounceTimer) clearTimeout(debounceTimer);
	if (!searchTerm.value.trim()) {
		items.value = [];
		return;
	}
	debounceTimer = setTimeout(() => fetchItems(), 250);
}

async function fetchItems() {
	if (searchAbort) searchAbort.abort();
	searchAbort = new AbortController();

	isSearching.value = true;
	try {
		const result = await call<POSItem[]>("xpos.x_pos.api.items.get_items", {
			pos_profile: props.posProfile,
			search_term: searchTerm.value.trim(),
			start: 0,
			page_length: 20,
		});
		items.value = result || [];
	} catch (e: unknown) {
		if (e instanceof Error && e.name === "AbortError") return;
		items.value = [];
	} finally {
		isSearching.value = false;
	}
}

function navigateDown() {
	if (items.value.length === 0) return;
	highlightedIndex.value = Math.min(highlightedIndex.value + 1, items.value.length - 1);
	scrollHighlightedIntoView();
}

function navigateUp() {
	if (items.value.length === 0) return;
	highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
	scrollHighlightedIntoView();
}

function scrollHighlightedIntoView() {
	nextTick(() => {
		const el = resultsContainer.value?.querySelector(`[data-command-index="${highlightedIndex.value}"]`);
		el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	});
}

function selectHighlighted() {
	if (highlightedIndex.value >= 0 && highlightedIndex.value < items.value.length) {
		selectItem(items.value[highlightedIndex.value]);
	}
}

function selectItem(item: POSItem) {
	emit("selectItem", item);
	close();
}

function handleGlobalKeydown(e: KeyboardEvent) {
	if ((e.metaKey || e.ctrlKey) && e.key === "k") {
		e.preventDefault();
		if (isOpen.value) {
			close();
		} else {
			open();
		}
	}
}

onMounted(() => {
	document.addEventListener("keydown", handleGlobalKeydown);
});

onUnmounted(() => {
	document.removeEventListener("keydown", handleGlobalKeydown);
});

defineExpose({ open, close });
</script>
