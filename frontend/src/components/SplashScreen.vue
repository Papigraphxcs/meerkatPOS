<template>
	<Transition name="meerkatpos-splash-fade">
		<div v-if="show" class="meerkatpos-splash" :style="{ backgroundColor: background }">
			<img :src="isDark ? logoDark : logoLight" alt="meerkatPOS" class="meerkatpos-splash__logo" />
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { computed, inject, type Ref } from "vue";

import { useBranding } from "@/composables/useBranding";

defineProps<{ show: boolean }>();

const isDark = inject<Ref<boolean>>("isDark")!;
const { logoLight, logoDark, splashBackground } = useBranding();

const background = computed(() => splashBackground.value || "hsl(var(--background))");
</script>

<style scoped>
.meerkatpos-splash {
	position: fixed;
	inset: 0;
	z-index: 9999;
	display: flex;
	align-items: center;
	justify-content: center;
}

.meerkatpos-splash__logo {
	width: 96px;
	height: 96px;
	border-radius: 22%;
	animation: meerkatpos-splash-pulse 1.6s ease-in-out infinite;
}

@keyframes meerkatpos-splash-pulse {
	0%,
	100% {
		transform: scale(1);
		opacity: 0.92;
	}
	50% {
		transform: scale(1.06);
		opacity: 1;
	}
}

.meerkatpos-splash-fade-leave-active {
	transition: opacity 0.35s ease;
}
.meerkatpos-splash-fade-leave-to {
	opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
	.meerkatpos-splash__logo {
		animation: none;
	}
}
</style>
