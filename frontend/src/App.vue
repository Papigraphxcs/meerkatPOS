<template>
	<div id="xpos-app" class="h-screen w-screen overflow-hidden bg-surface-50 font-sans">
		<!-- Loading State -->
		<div v-if="posStore.isLoading" class="flex items-center justify-center h-full">
			<div class="text-center">
				<div class="relative w-16 h-16 mx-auto mb-4">
					<div class="absolute inset-0 rounded-full border-4 border-primary-200"></div>
					<div class="absolute inset-0 rounded-full border-4 border-primary-600 border-t-transparent animate-spin"></div>
				</div>
				<h2 class="text-xl font-semibold text-surface-700">Loading X POS</h2>
				<p class="text-surface-400 mt-1">Preparing your workspace...</p>
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
	</div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { useCustomerStore } from "@/stores/customerStore";
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import OpeningDialog from "@/components/shift/OpeningDialog.vue";
import ClosingDialog from "@/components/shift/ClosingDialog.vue";
import PaymentDialog from "@/components/payment/PaymentDialog.vue";
import CustomerSelect from "@/components/customer/CustomerSelect.vue";

const posStore = usePosStore();
const cartStore = useCartStore();
const customerStore = useCustomerStore();

onMounted(() => {
	posStore.checkExistingShift();
});
</script>
