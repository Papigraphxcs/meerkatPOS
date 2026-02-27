<template>
	<div id="xpos-app" :class="['h-screen w-screen overflow-hidden font-sans', isDark ? 'dark' : '']">
		<!-- Loading State -->
		<div v-if="posStore.isLoading" class="flex items-center justify-center h-full bg-background">
			<div class="text-center">
				<div class="relative w-16 h-16 mx-auto mb-4">
					<div class="absolute inset-0 rounded-full border-4 border-muted"></div>
					<div class="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
				</div>
				<h2 class="text-xl font-semibold text-foreground">Loading X POS</h2>
				<p class="text-muted-foreground mt-1">Preparing your workspace...</p>
			</div>
		</div>

		<!-- Opening Shift Dialog -->
		<OpeningDialog
			v-else-if="posStore.showOpeningDialog"
		/>

		<!-- Main POS App -->
		<DefaultLayout v-else-if="posStore.isReady">
			<router-view v-slot="{ Component }">
				<transition name="fade" mode="out-in">
					<component :is="Component" />
				</transition>
			</router-view>
		</DefaultLayout>

		<!-- Closing Shift Dialog -->
		<ClosingDialog v-if="posStore.showClosingDialog" />

		<!-- Payment Dialog -->
		<PaymentDialog v-if="cartStore.showPaymentDialog" />

		<!-- Customer Select Dialog -->
		<CustomerSelect v-if="customerStore.showCustomerDialog" />

		<!-- Item Detail Dialog (batch/serial/UOM picker) -->
		<ItemDetailDialog v-if="itemStore.showItemDetail" />

		<!-- Cash Movement Dialog -->
		<CashMovementDialog v-if="paymentStore.showCashMovementDialog" />
	</div>
</template>

<script setup lang="ts">
import { onMounted, provide, ref } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { useCustomerStore } from "@/stores/customerStore";
import { useItemStore } from "@/stores/itemStore";
import { usePaymentStore } from "@/stores/paymentStore";
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import OpeningDialog from "@/components/shift/OpeningDialog.vue";
import ClosingDialog from "@/components/shift/ClosingDialog.vue";
import PaymentDialog from "@/components/payment/PaymentDialog.vue";
import CustomerSelect from "@/components/customer/CustomerSelect.vue";
import ItemDetailDialog from "@/components/items/ItemDetailDialog.vue";
import CashMovementDialog from "@/components/shift/CashMovementDialog.vue";

const posStore = usePosStore();
const cartStore = useCartStore();
const customerStore = useCustomerStore();
const itemStore = useItemStore();
const paymentStore = usePaymentStore();

// Dark mode state
const isDark = ref(false);

function toggleDarkMode() {
	isDark.value = !isDark.value;
	localStorage.setItem("xpos-dark-mode", isDark.value ? "1" : "0");
}

// Provide dark mode to child components
provide("isDark", isDark);
provide("toggleDarkMode", toggleDarkMode);

onMounted(() => {
	// Restore dark mode preference
	const saved = localStorage.getItem("xpos-dark-mode");
	if (saved === "1") {
		isDark.value = true;
	} else if (saved === null) {
		// Detect system preference
		isDark.value = window.matchMedia("(prefers-color-scheme: dark)").matches;
	}

	posStore.checkExistingShift();
});
</script>
