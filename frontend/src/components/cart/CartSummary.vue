<template>
	<div class="shrink-0 border-t border-surface-100 bg-white px-4 py-4 space-y-3">
		<!-- Totals -->
		<div class="space-y-1.5">
			<div class="flex items-center justify-between text-sm">
				<span class="text-surface-500">Subtotal</span>
				<span class="font-medium text-surface-700">
					{{ posStore.currencySymbol }}{{ formatPrice(cartStore.subtotal) }}
				</span>
			</div>
			<div v-if="cartStore.taxAmount > 0" class="flex items-center justify-between text-sm">
				<span class="text-surface-500">Tax</span>
				<span class="font-medium text-surface-700">
					{{ posStore.currencySymbol }}{{ formatPrice(cartStore.taxAmount) }}
				</span>
			</div>
			<div
				v-if="cartStore.discountPercentage > 0 || cartStore.discountAmount > 0"
				class="flex items-center justify-between text-sm"
			>
				<span class="text-surface-500">Discount</span>
				<span class="font-medium text-emerald-600">
					-{{ posStore.currencySymbol }}{{ formatPrice(discountValue) }}
				</span>
			</div>
			<div class="xpos-divider !my-2"></div>
			<div class="flex items-center justify-between">
				<span class="text-base font-bold text-surface-800">Total</span>
				<span class="text-xl font-extrabold text-primary-600">
					{{ posStore.currencySymbol }}{{ formatPrice(cartStore.grandTotal) }}
				</span>
			</div>
		</div>

		<!-- Actions -->
		<div class="flex gap-2">
			<!-- Discount Button -->
			<button
				@click="showDiscount = !showDiscount"
				class="xpos-btn-secondary text-xs flex-1"
				:class="{ '!bg-emerald-50 !text-emerald-700 !border-emerald-200': hasDiscount }"
				:disabled="cartStore.isEmpty"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
				</svg>
				Discount
			</button>

			<!-- Hold Button -->
			<button
				@click="holdOrder"
				class="xpos-btn-secondary text-xs"
				:disabled="cartStore.isEmpty"
				title="Save as draft"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
			</button>

			<!-- Clear Cart Button -->
			<button
				@click="cartStore.clearCart()"
				class="xpos-btn-ghost text-xs text-red-500 hover:!bg-red-50"
				:disabled="cartStore.isEmpty"
				title="Clear cart"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
				</svg>
			</button>
		</div>

		<!-- Discount Panel -->
		<transition name="slide-up">
			<div v-if="showDiscount" class="bg-surface-50 rounded-xl p-3 space-y-2">
				<div class="flex items-center gap-2">
					<button
						:class="[discountType === 'percentage' ? 'bg-primary-600 text-white' : 'bg-white text-surface-600']"
						class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
						@click="discountType = 'percentage'"
					>
						%
					</button>
					<button
						:class="[discountType === 'amount' ? 'bg-primary-600 text-white' : 'bg-white text-surface-600']"
						class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
						@click="discountType = 'amount'"
					>
						{{ posStore.currencySymbol }}
					</button>
					<input
						v-model.number="discountInput"
						type="number"
						min="0"
						:max="discountType === 'percentage' ? 100 : undefined"
						class="xpos-input text-sm flex-1"
						:placeholder="discountType === 'percentage' ? 'Discount %' : 'Discount amount'"
						@input="applyDiscount"
					/>
				</div>
			</div>
		</transition>

		<!-- Pay Button -->
		<button
			@click="cartStore.openPaymentDialog()"
			:disabled="cartStore.isEmpty || !cartStore.customer"
			class="w-full xpos-btn-primary xpos-btn-lg text-base font-bold tracking-wide
						 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600
						 shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40
						 disabled:from-surface-300 disabled:to-surface-300 disabled:shadow-none"
		>
			<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
			</svg>
			{{ cartStore.isEmpty ? 'Add items to pay' : !cartStore.customer ? 'Select customer first' : `Pay ${posStore.currencySymbol}${formatPrice(cartStore.grandTotal)}` }}
		</button>
	</div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { call, showSuccess, showError } from "@/services/api";

const posStore = usePosStore();
const cartStore = useCartStore();

const showDiscount = ref(false);
const discountType = ref("percentage");
const discountInput = ref(0);

const hasDiscount = computed(() =>
	cartStore.discountPercentage > 0 || cartStore.discountAmount > 0
);

const discountValue = computed(() => {
	if (cartStore.discountPercentage > 0) {
		return (cartStore.subtotal * cartStore.discountPercentage) / 100;
	}
	return cartStore.discountAmount;
});

function applyDiscount() {
	cartStore.setDiscount(discountType.value as "percentage" | "amount", discountInput.value || 0);
}

async function holdOrder() {
	if (cartStore.isEmpty) return;

	try {
		const data = cartStore.getInvoiceData(
			posStore.profileName,
			posStore.posOpeningShift?.name || ""
		);
		if (!data.customer) {
			data.customer = frappe.boot?.sysdefaults?.customer || "";
		}
		await call("xpos.api.invoices.save_draft_invoice", {
			data: JSON.stringify(data),
		});
		cartStore.clearAll();
		showSuccess("Order saved as draft");
	} catch (error: unknown) {
		showError("Failed to save draft: " + ((error as Error)?.message || error));
	}
}

function formatPrice(price: number | string) {
	return parseFloat(String(price) || "0").toFixed(2);
}
</script>
