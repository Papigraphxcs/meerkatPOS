<template>
	<div class="flex flex-col h-screen overflow-hidden">
		<Navbar />
		<main class="flex-1 overflow-hidden">
			<slot />
		</main>
	</div>
</template>

<script setup lang="ts">
import Navbar from "@/components/Navbar.vue";
</script>
