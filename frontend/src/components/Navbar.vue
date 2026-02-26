<template>
	<header class="h-14 bg-white border-b border-surface-200 flex items-center px-4 gap-3 shrink-0 z-30">
		<!-- Logo / Brand -->
		<div class="flex items-center gap-2.5">
			<div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm">
				<svg class="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
				</svg>
			</div>
			<span class="text-lg font-bold text-gradient hidden sm:inline">X POS</span>
		</div>

		<!-- Navigation Tabs -->
		<nav class="flex items-center gap-1 ml-4">
			<router-link
				to="/pos"
				class="nav-tab"
				:class="{ 'nav-tab-active': route.name === 'pos' }"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
				</svg>
				<span>POS</span>
			</router-link>
			<router-link
				to="/orders"
				class="nav-tab"
				:class="{ 'nav-tab-active': route.name === 'orders' }"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
				<span>Orders</span>
			</router-link>
		</nav>

		<div class="flex-1"></div>

		<!-- Profile Info -->
		<div class="hidden md:flex items-center gap-2 text-xs text-surface-500">
			<div class="flex items-center gap-1.5 bg-primary-50 text-primary-700 px-2.5 py-1 rounded-lg font-medium">
				<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
				</svg>
				{{ posStore.profileName }}
			</div>
		</div>

		<!-- User -->
		<div class="flex items-center gap-2">
			<div class="w-8 h-8 rounded-full bg-surface-100 flex items-center justify-center text-surface-600">
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
				</svg>
			</div>
		</div>

		<!-- Close Shift Button -->
		<button
			@click="posStore.showClosingDialog = true; posStore.fetchClosingData()"
			class="xpos-btn-ghost text-xs gap-1.5 text-surface-500 hover:text-red-600"
			title="Close Shift"
		>
			<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
			</svg>
			<span class="hidden sm:inline">Close Shift</span>
		</button>
	</header>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { usePosStore } from "@/stores/posStore";

const route = useRoute();
const posStore = usePosStore();
</script>

<style scoped>
.nav-tab {
	@apply flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
				 text-surface-500 hover:text-surface-700 hover:bg-surface-50
				 transition-all duration-200 no-underline;
}

.nav-tab-active {
	@apply bg-primary-50 text-primary-700;
}
</style>
