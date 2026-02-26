<template>
	<div class="relative">
		<div class="relative flex items-center">
			<!-- Search Icon -->
			<svg
				class="absolute left-3.5 w-4.5 h-4.5 text-surface-400 pointer-events-none"
				fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
			</svg>

			<!-- Input -->
			<input
				ref="searchInput"
				v-model="localSearch"
				type="text"
				:placeholder="'Search items, scan barcode...'"
				class="w-full rounded-xl border border-surface-200 bg-surface-50 pl-10 pr-20 py-3
							 text-sm text-surface-800 placeholder:text-surface-400
							 focus:outline-none focus:ring-2 focus:ring-primary-500/20
							 focus:border-primary-400 focus:bg-white
							 transition-all duration-200"
				@input="onInput"
				@keydown.enter="onEnter"
			/>

			<!-- Clear Button -->
			<button
				v-if="localSearch"
				@click="clearSearch"
				class="absolute right-3 xpos-btn-icon p-1.5"
			>
				<svg class="w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Keyboard shortcut hint -->
		<div class="absolute right-14 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1">
			<kbd class="px-1.5 py-0.5 text-[10px] font-mono text-surface-400 bg-surface-100 rounded border border-surface-200">
				/
			</kbd>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

const emit = defineEmits(["search", "barcode"]);

const searchInput = ref<HTMLInputElement | null>(null);
const localSearch = ref("");
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function onInput() {
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		emit("search", localSearch.value);
	}, 300);
}

function onEnter() {
	if (debounceTimer) clearTimeout(debounceTimer);
	// Check if it looks like a barcode (numeric or specific pattern)
	const val = localSearch.value.trim();
	if (val && /^\d{6,}$/.test(val)) {
		emit("barcode", val);
		localSearch.value = "";
	} else {
		emit("search", val);
	}
}

function clearSearch() {
	localSearch.value = "";
	emit("search", "");
	searchInput.value?.focus();
}

// Global keyboard shortcut: "/" to focus search
function handleKeyboard(e: KeyboardEvent) {
	if (e.key === "/" && document.activeElement !== searchInput.value) {
		e.preventDefault();
		searchInput.value?.focus();
	}
	if (e.key === "Escape" && document.activeElement === searchInput.value) {
		clearSearch();
		searchInput.value?.blur();
	}
}

onMounted(() => {
	document.addEventListener("keydown", handleKeyboard);
});

onUnmounted(() => {
	document.removeEventListener("keydown", handleKeyboard);
});
</script>
