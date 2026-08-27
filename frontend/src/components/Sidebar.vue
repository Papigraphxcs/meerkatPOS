<template>
	<!--
		Two independent renders, not one element with responsive overrides:
		the desktop rail is unconditional CSS (`hidden md:flex`) with no tie to
		`isOpen`, so it can never end up hidden behind stale toggle state. The
		mobile overlay is the only thing `isOpen` controls, and it's gone
		entirely (`md:hidden`) once the desktop rail takes over.
	-->
	<aside
		class="hidden md:flex h-full w-64 shrink-0 bg-card ltr:border-r rtl:border-l border-border flex-col"
	>
		<SidebarNav />
	</aside>

	<Transition name="fade">
		<div v-if="isOpen" class="fixed inset-0 bg-black/50 z-40 md:hidden" @click="isOpen = false" />
	</Transition>
	<aside
		v-show="isOpen"
		class="md:hidden fixed start-0 top-0 h-full w-64 bg-card ltr:border-r rtl:border-l border-border z-50 flex flex-col shadow-xl transition-transform duration-300 ease-in-out"
		:class="isOpen ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'"
	>
		<SidebarNav @navigate="isOpen = false" />
	</aside>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import SidebarNav from "@/components/SidebarNav.vue";

const isOpen = ref(false);

function handleToggleSidebar() {
	isOpen.value = !isOpen.value;
}

onMounted(() => {
	window.addEventListener("meerkatpos:toggle-sidebar", handleToggleSidebar);
});

onUnmounted(() => {
	window.removeEventListener("meerkatpos:toggle-sidebar", handleToggleSidebar);
});
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
