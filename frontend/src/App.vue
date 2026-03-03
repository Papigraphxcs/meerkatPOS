<template>
	<div id="xpos-app" :class="['h-screen w-screen overflow-hidden font-sans', isDark ? 'dark' : '']">
		<template v-if="isAuthPage">
			<router-view v-slot="{ Component }">
				<transition name="fade" mode="out-in">
					<component :is="Component" />
				</transition>
			</router-view>
		</template>

		<template v-else>
			<div v-if="posStore.isLoading" class="flex items-center justify-center h-full bg-background">
				<div class="text-center">
					<div class="relative w-16 h-16 mx-auto mb-4">
						<div class="absolute inset-0 rounded-full border-4 border-muted"></div>
						<div
							class="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin">
						</div>
					</div>
					<h2 class="text-xl font-semibold text-foreground">Loading X POS</h2>
					<p class="text-muted-foreground mt-1">Preparing your workspace...</p>
				</div>
			</div>

			<OpeningDialog v-else-if="posStore.showOpeningDialog" />

			<DefaultLayout v-else-if="posStore.isReady">
				<router-view v-slot="{ Component }">
					<transition name="fade" mode="out-in">
						<component :is="Component" />
					</transition>
				</router-view>
			</DefaultLayout>

			<ClosingDialog v-if="posStore.showClosingDialog" />

			<PaymentDialog v-if="cartStore.showPaymentDialog" />

			<CustomerSelect v-if="customerStore.showCustomerDialog" />

			<LoyaltyDialog v-if="customerStore.showLoyaltyDialog" />

			<ItemDetailDialog v-if="itemStore.showItemDetail" />

			<CashMovementDialog v-if="paymentStore.showCashMovementDialog" />
		</template>
		
		<Toaster
			:theme="isDark ? 'dark' : 'light'"
			position="bottom-right"
			:duration="4000"
			:expand="true"
			rich-colors
			close-button
		/>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Toaster } from "vue-sonner";
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { useCustomerStore } from "@/stores/customerStore";
import { useItemStore } from "@/stores/itemStore";
import { usePaymentStore } from "@/stores/paymentStore";
import { useAuthStore } from "@/stores/authStore";
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import OpeningDialog from "@/components/shift/OpeningDialog.vue";
import ClosingDialog from "@/components/shift/ClosingDialog.vue";
import PaymentDialog from "@/components/payment/PaymentDialog.vue";
import CustomerSelect from "@/components/customer/CustomerSelect.vue";
import LoyaltyDialog from "@/components/customer/LoyaltyDialog.vue";
import ItemDetailDialog from "@/components/items/ItemDetailDialog.vue";
import CashMovementDialog from "@/components/shift/CashMovementDialog.vue";
import { useOfflineStore } from "@/stores/offlineStore";

const route = useRoute();
const posStore = usePosStore();
const cartStore = useCartStore();
const customerStore = useCustomerStore();
const itemStore = useItemStore();
const paymentStore = usePaymentStore();
const authStore = useAuthStore();
const offlineStore = useOfflineStore();

const isAuthPage = computed(() => route.meta.isAuthPage === true);

const theme = ref<"light" | "dark" | "system">("system");
const systemPrefersDark = ref(window.matchMedia("(prefers-color-scheme: dark)").matches);

const isDark = computed(() => {
	if (theme.value === "system") {
		return systemPrefersDark.value;
	}
	return theme.value === "dark";
});

function applyThemeToDocument(dark: boolean) {
	const html = document.documentElement;
	if (dark) {
		html.classList.add("dark");
		html.classList.remove("light");
	} else {
		html.classList.add("light");
		html.classList.remove("dark");
	}
}

watch(isDark, (dark) => {
	applyThemeToDocument(dark);
}, { immediate: true });

function toggleDarkMode() {
	if (theme.value === "light") {
		theme.value = "dark";
	} else if (theme.value === "dark") {
		theme.value = "system";
	} else {
		theme.value = "light";
	}
	localStorage.setItem("xpos-theme", theme.value);
}

provide("isDark", isDark);
provide("theme", theme);
provide("toggleDarkMode", toggleDarkMode);

let mediaQuery: MediaQueryList | null = null;
function handleSystemThemeChange(e: MediaQueryListEvent) {
	systemPrefersDark.value = e.matches;
}

onMounted(() => {
	const saved = localStorage.getItem("xpos-theme") as "light" | "dark" | "system" | null;
	if (saved && ["light", "dark", "system"].includes(saved)) {
		theme.value = saved;
	} else {
		const oldSaved = localStorage.getItem("xpos-dark-mode");
		if (oldSaved === "1") {
			theme.value = "dark";
		} else if (oldSaved === "0") {
			theme.value = "light";
		}
		localStorage.setItem("xpos-theme", theme.value);
	}

	applyThemeToDocument(isDark.value);

	mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	mediaQuery.addEventListener("change", handleSystemThemeChange);

	if (!isAuthPage.value) {
		posStore.checkExistingShift();
	}

	offlineStore.init();
});

watch(isAuthPage, (isAuth, wasAuth) => {
	if (wasAuth && !isAuth && authStore.isAuthenticated) {
		posStore.checkExistingShift();
	}
});

onUnmounted(() => {
	if (mediaQuery) {
		mediaQuery.removeEventListener("change", handleSystemThemeChange);
	}
	offlineStore.destroy();
});
</script>
