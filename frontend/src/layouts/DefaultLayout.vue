<template>
	<div class="flex flex-col h-screen overflow-hidden">
		<Navbar />
		<div class="flex-1 relative overflow-hidden">
			<Sidebar />
			<main class="h-full overflow-hidden">
				<slot />
			</main>
		</div>
	</div>
</template>

<script setup lang="ts">
import Navbar from "@/components/Navbar.vue";
import Sidebar from "@/components/Sidebar.vue";
</script>
