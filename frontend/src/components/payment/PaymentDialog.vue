<template>
	<transition name="fade">
		<div class="xpos-overlay" @click.self="close">
			<div class="xpos-dialog xpos-dialog-lg flex flex-col max-h-[90vh]">
				<!-- Header -->
				<div class="shrink-0 flex items-center justify-between p-5 pb-4 border-b border-surface-100">
					<div>
						<h2 class="text-lg font-bold text-surface-800">Payment</h2>
						<p class="text-sm text-surface-400 mt-0.5">
							{{ cartStore.customerName }}
						</p>
					</div>
					<button @click="close" class="xpos-btn-icon">
						<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<div class="flex-1 overflow-y-auto p-5 space-y-5">
					<!-- Grand Total Display -->
					<div class="text-center py-4 bg-gradient-to-br from-primary-50 to-primary-100/50 rounded-2xl">
						<p class="text-sm font-medium text-primary-600 mb-1">Amount Due</p>
						<p class="text-4xl font-extrabold text-primary-700">
							{{ posStore.currencySymbol }}{{ formatPrice(cartStore.grandTotal) }}
						</p>
					</div>

					<!-- Payment Methods -->
					<div>
						<h3 class="text-sm font-semibold text-surface-600 mb-3">Payment Method</h3>
						<div class="grid grid-cols-3 gap-2">
							<button
								v-for="method in availableMethods"
								:key="method.mode_of_payment"
								@click="selectMethod(method.mode_of_payment)"
								class="p-3 rounded-xl border-2 text-center transition-all duration-200"
								:class="selectedMethod === method.mode_of_payment
									? 'border-primary-500 bg-primary-50 text-primary-700 shadow-glow'
									: 'border-surface-200 bg-white text-surface-600 hover:border-surface-300'"
							>
								<div class="text-xl mb-1">{{ getMethodIcon(method.mode_of_payment) }}</div>
								<p class="text-xs font-medium truncate">{{ method.mode_of_payment }}</p>
							</button>
						</div>
					</div>

					<!-- Amount Input -->
					<div>
						<label class="text-sm font-semibold text-surface-600 mb-2 block">Amount Tendered</label>
						<input
							ref="amountInput"
							v-model.number="tenderedAmount"
							type="number"
							step="0.01"
							min="0"
							class="xpos-input-lg text-center text-2xl font-bold tracking-wider"
					@focus="($event.target as HTMLInputElement)?.select()"
						/>
					</div>

					<!-- Quick Amount Buttons -->
					<div class="grid grid-cols-4 gap-2">
						<button
							v-for="amount in quickAmounts"
							:key="amount"
							@click="tenderedAmount = amount"
							class="py-2.5 rounded-xl text-sm font-semibold
										 bg-surface-50 text-surface-700 hover:bg-surface-100
										 transition-all duration-150 active:scale-95"
						>
							{{ posStore.currencySymbol }}{{ amount }}
						</button>
					</div>

					<!-- Numpad -->
					<div class="grid grid-cols-3 gap-2">
						<button
							v-for="key in numpadKeys"
							:key="key"
							@click="handleNumpad(key)"
							class="xpos-numpad-key"
							:class="{ '!bg-red-50 !text-red-500 hover:!bg-red-100': key === '⌫', '!bg-primary-50 !text-primary-600 hover:!bg-primary-100': key === 'C' }"
						>
							{{ key }}
						</button>
					</div>

					<!-- Change Display -->
					<div v-if="changeAmount > 0" class="bg-emerald-50 rounded-xl p-4 text-center animate-scale-in">
						<p class="text-sm font-medium text-emerald-600 mb-1">Change</p>
						<p class="text-2xl font-extrabold text-emerald-700">
							{{ posStore.currencySymbol }}{{ formatPrice(changeAmount) }}
						</p>
					</div>

					<!-- Remaining -->
					<div v-if="remainingAmount > 0" class="bg-amber-50 rounded-xl p-4 text-center">
						<p class="text-sm font-medium text-amber-600 mb-1">Remaining</p>
						<p class="text-2xl font-extrabold text-amber-700">
							{{ posStore.currencySymbol }}{{ formatPrice(remainingAmount) }}
						</p>
					</div>
				</div>

				<!-- Footer -->
				<div class="shrink-0 p-5 pt-4 border-t border-surface-100 space-y-2">
					<button
						@click="submitPayment"
						:disabled="isSubmitting || !canSubmit"
						class="w-full xpos-btn-primary xpos-btn-lg text-base font-bold
									 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700
									 focus:ring-emerald-400 shadow-lg shadow-emerald-500/25
									 disabled:from-surface-300 disabled:to-surface-300 disabled:shadow-none"
					>
						<span v-if="isSubmitting" class="flex items-center gap-2">
							<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Processing...
						</span>
						<span v-else class="flex items-center gap-2">
							<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
							</svg>
							Complete Payment
						</span>
					</button>
				</div>
			</div>
		</div>
	</transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { call, showSuccess, showError } from "@/services/api";

const posStore = usePosStore();
const cartStore = useCartStore();

const amountInput = ref<HTMLInputElement | null>(null);
const selectedMethod = ref("");
const tenderedAmount = ref(0);
const isSubmitting = ref(false);
const useNumpad = ref(false);

const numpadKeys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "C", "0", "⌫"];

const availableMethods = computed(() => {
	const methods = posStore.paymentMethods;
	if (methods.length > 0) return methods;
	return [
		{ mode_of_payment: "Cash" },
		{ mode_of_payment: "Card" },
	];
});

const quickAmounts = computed(() => {
	const total = cartStore.grandTotal;
	const amounts = [];
	const rounded = Math.ceil(total);
	amounts.push(rounded);
	amounts.push(Math.ceil(total / 10) * 10);
	amounts.push(Math.ceil(total / 50) * 50);
	amounts.push(Math.ceil(total / 100) * 100);
	// Remove duplicates and sort
	return [...new Set(amounts)].sort((a, b) => a - b).slice(0, 4);
});

const changeAmount = computed(() => {
	const diff = tenderedAmount.value - cartStore.grandTotal;
	return diff > 0 ? diff : 0;
});

const remainingAmount = computed(() => {
	const diff = cartStore.grandTotal - tenderedAmount.value;
	return diff > 0 ? diff : 0;
});

const canSubmit = computed(() => {
	return (
		selectedMethod.value &&
		tenderedAmount.value >= cartStore.grandTotal &&
		!cartStore.isEmpty
	);
});

onMounted(() => {
	tenderedAmount.value = cartStore.grandTotal;
	// Auto-select first method
	if (availableMethods.value.length > 0) {
		selectedMethod.value = availableMethods.value[0].mode_of_payment;
	}
	nextTick(() => amountInput.value?.focus());
});

function selectMethod(method: string) {
	selectedMethod.value = method;
}

function getMethodIcon(method: string) {
	const lower = method.toLowerCase();
	if (lower.includes("cash")) return "💵";
	if (lower.includes("card") || lower.includes("credit") || lower.includes("debit")) return "💳";
	if (lower.includes("bank") || lower.includes("transfer")) return "🏦";
	if (lower.includes("mobile") || lower.includes("mpesa") || lower.includes("wallet")) return "📱";
	if (lower.includes("check") || lower.includes("cheque")) return "📝";
	return "💰";
}

function handleNumpad(key: string) {
	const current = String(tenderedAmount.value || "");
	if (key === "C") {
		tenderedAmount.value = 0;
	} else if (key === "⌫") {
		tenderedAmount.value = parseFloat(current.slice(0, -1)) || 0;
	} else {
		tenderedAmount.value = parseFloat(current + key) || 0;
	}
}

async function submitPayment() {
	if (isSubmitting.value || !canSubmit.value) return;
	isSubmitting.value = true;

	try {
		const invoiceData = cartStore.getInvoiceData(
			posStore.profileName,
			posStore.posOpeningShift?.name || ""
		);
		invoiceData.payments = [
			{
				mode_of_payment: selectedMethod.value,
				amount: cartStore.grandTotal,
			},
		];

		const result = await call<{ name: string }>("xpos.api.invoices.create_invoice", {
			data: JSON.stringify(invoiceData),
		});

		showSuccess(`Invoice ${result.name} created successfully!`);
		cartStore.clearAll();

		// Open print dialog
		if (result.name && typeof frappe !== "undefined") {
			frappe.ui?.form?.qz_connect?.()?.catch(() => {});
		}
	} catch (error: unknown) {
		const err = error as Record<string, unknown>;
		showError("Payment failed: " + (err?.message || err?.exc || "Unknown error"));
		console.error("Payment error:", error);
	} finally {
		isSubmitting.value = false;
	}
}

function close() {
	cartStore.closePaymentDialog();
}

function formatPrice(price: number | string) {
	return parseFloat(String(price) || "0").toFixed(2);
}
</script>
