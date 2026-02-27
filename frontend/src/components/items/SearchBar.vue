<template>
	<div class="relative">
		<div class="relative flex items-center">
			<Search class="absolute left-3.5 w-5 h-5 text-muted-foreground pointer-events-none" />
			<input
				ref="searchInput"
				v-model="localSearch"
				type="text"
				:placeholder="'Search items, scan barcode...'"
			class="w-full rounded-lg border border-input bg-background pl-10 pr-20 py-3
						 text-sm text-foreground placeholder:text-muted-foreground
						 focus:outline-none focus:ring-2 focus:ring-ring/30
						 focus:border-primary
						 transition-all duration-200
						 dark:bg-card dark:border-border"
				@input="onInput"
				@keydown.enter="onEnter"
			/>
			<Button
				v-if="localSearch"
				variant="ghost"
				size="icon-sm"
				class="absolute right-3"
				@click="clearSearch"
			>
				<X class="w-4 h-4 text-muted-foreground" />
			</Button>
		</div>
		<div class="absolute right-14 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1">
			<kbd class="px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted rounded border border-border">/</kbd>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-vue-next";

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
