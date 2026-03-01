<template>
	<div class="shrink-0 border-t border-border bg-background px-4 py-4 space-y-3 dark:border-border">
		<!-- Totals -->
		<div class="space-y-1.5">
			<div class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground">{{ __('Subtotal') }}</span>
				<span class="font-medium text-foreground">
					{{ posStore.currencySymbol }}{{ formatPrice(cartStore.subtotal) }}
				</span>
			</div>

			<!-- Item Discounts Total -->
			<div v-if="itemDiscountTotal > 0" class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground flex items-center gap-1">
					<Percent class="w-3 h-3" /> {{ __('Item Discounts') }}
				</span>
				<span class="font-medium text-emerald-600 dark:text-emerald-400">
					-{{ posStore.currencySymbol }}{{ formatPrice(itemDiscountTotal) }}
				</span>
			</div>

			<!-- Individual Tax Lines -->
			<template v-if="cartStore.calculatedTaxes.length > 0">
				<div
					v-for="(tax, idx) in cartStore.calculatedTaxes"
					:key="idx"
					class="flex items-center justify-between text-sm"
				>
					<span class="text-muted-foreground flex items-center gap-1">
						{{ tax.description }}
						<span v-if="tax.rate" class="text-xs text-muted-foreground/70">({{ tax.rate }}%)</span>
						<span v-if="tax.included_in_print_rate" class="text-[10px] text-blue-500">{{ __('incl.') }}</span>
					</span>
					<span class="font-medium" :class="tax.included_in_print_rate ? 'text-blue-600 dark:text-blue-400' : 'text-foreground'">
						{{ tax.included_in_print_rate ? '' : '+' }}{{ posStore.currencySymbol }}{{ formatPrice(tax.amount) }}
					</span>
				</div>
			</template>

			<!-- Additional Discount -->
			<div
				v-if="cartStore.discountPercentage > 0 || cartStore.discountAmount > 0"
				class="flex items-center justify-between text-sm"
			>
				<span class="text-muted-foreground flex items-center gap-1">
					<Tag class="w-3 h-3" />
					{{ __('Additional Discount') }}
					<span v-if="cartStore.discountPercentage > 0" class="text-xs text-emerald-600 dark:text-emerald-400">
						({{ cartStore.discountPercentage }}%)
					</span>
				</span>
				<span class="font-medium text-emerald-600 dark:text-emerald-400">
					-{{ posStore.currencySymbol }}{{ formatPrice(discountValue) }}
				</span>
			</div>

			<!-- Loyalty Redemption -->
			<div v-if="cartStore.redeemLoyaltyPoints && cartStore.loyaltyAmount > 0"
				class="flex items-center justify-between text-sm"
			>
				<span class="text-violet-600 dark:text-violet-400 flex items-center gap-1">
					<Gift class="w-3.5 h-3.5" /> {{ __('Loyalty') }}
				</span>
				<span class="font-medium text-violet-600 dark:text-violet-400">
					-{{ posStore.currencySymbol }}{{ formatPrice(cartStore.loyaltyAmount) }}
				</span>
			</div>

			<!-- Write-off -->
			<div v-if="cartStore.writeOffAmount > 0" class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground">{{ __('Write Off') }}</span>
				<span class="font-medium text-amber-600 dark:text-amber-400">
					-{{ posStore.currencySymbol }}{{ formatPrice(cartStore.writeOffAmount) }}
				</span>
			</div>

			<Separator class="!my-2" />

			<div class="flex items-center justify-between">
				<span class="text-base font-bold text-foreground">{{ __('Total') }}</span>
				<span class="text-xl font-extrabold"
					:class="cartStore.isReturnMode ? 'text-amber-600 dark:text-amber-400' : 'text-primary dark:text-primary'"
				>
					{{ cartStore.isReturnMode ? '-' : '' }}{{ posStore.currencySymbol }}{{ formatPrice(Math.abs(cartStore.grandTotal)) }}
				</span>
			</div>
		</div>

		<!-- Actions -->
		<div class="flex gap-2">
			<Button
				v-if="posStore.allowEditAdditionalDiscount"
				variant="outline"
				size="sm"
				class="flex-1"
				:class="{ 'border-emerald-300 text-emerald-600 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-900/20': hasDiscount }"
				:disabled="cartStore.isEmpty"
				@click="showDiscount = !showDiscount"
			>
				<Tag class="w-4 h-4" />
				{{ __('Discount') }}
			</Button>

			<!-- Coupon button -->
			<Button
				v-if="posStore.fetchCoupon"
				variant="outline"
				size="sm"
				class="flex-1"
				:class="{ 'border-violet-300 text-violet-600 bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:bg-violet-900/20': !!cartStore.appliedCoupon }"
				:disabled="cartStore.isEmpty"
				@click="showCoupon = !showCoupon"
			>
				<Ticket class="w-4 h-4" />
				{{ __('Coupon') }}
			</Button>

			<Button variant="outline" size="sm" class="dark:border-border dark:text-foreground" :disabled="cartStore.isEmpty" @click="holdOrder" :title="__('Save as draft')">
				<Clock class="w-4 h-4" />
			</Button>

			<Button variant="outline" size="sm" class="text-destructive hover:text-destructive dark:border-border" :disabled="cartStore.isEmpty" @click="cartStore.clearCart()" :title="__('Clear cart')">
				<Trash2 class="w-4 h-4" />
			</Button>
		</div>

		<!-- Discount Panel -->
		<transition name="slide-up">
			<div v-if="showDiscount" class="bg-muted rounded-lg p-3 space-y-2">
				<div class="flex items-center gap-2">
					<Button
						:variant="discountType === 'percentage' ? 'default' : 'outline'"
						size="sm"
						class="px-3"
						@click="discountType = 'percentage'"
					>
						%
					</Button>
					<Button
						:variant="discountType === 'amount' ? 'default' : 'outline'"
						size="sm"
						class="px-3"
						@click="discountType = 'amount'"
					>
						{{ posStore.currencySymbol }}
					</Button>
					<Input
						v-model.number="discountInput"
						type="number"
						min="0"
						:max="discountType === 'percentage' ? 100 : undefined"
						class="flex-1"
						:placeholder="discountType === 'percentage' ? __('Discount %') : __('Discount amount')"
						@input="applyDiscount"
					/>
				</div>
			</div>
		</transition>

		<!-- Coupon Panel -->
		<transition name="slide-up">
			<div v-if="showCoupon" class="bg-muted rounded-lg p-3 space-y-2">
				<div class="flex items-center gap-2">
					<Input
						v-model="couponInput"
						type="text"
					:placeholder="__('Enter coupon code...')"
					class="flex-1"
					@keydown.enter="applyCouponCode"
				/>
				<Button size="sm" :disabled="!couponInput || isApplyingCoupon" @click="applyCouponCode">
					<template v-if="isApplyingCoupon">
						<Loader2 class="w-4 h-4 animate-spin" />
					</template>
					<template v-else>{{ __('Apply') }}</template>
					</Button>
				</div>
				<p v-if="couponError" class="text-xs text-destructive">{{ couponError }}</p>
			</div>
		</transition>

		<!-- Pay Button -->
		<Button
			size="xl"
			class="w-full font-bold tracking-wide shadow-lg"
			:class="cartStore.isReturnMode
				? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-amber-500/25 text-white'
				: 'bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 shadow-primary/25'"
			:disabled="cartStore.isEmpty || !cartStore.customer"
			@click="cartStore.openPaymentDialog()"
		>
			<Wallet class="w-5 h-5" />
			{{ payButtonLabel }}
		</Button>
	</div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { useOfferStore } from "@/stores/offerStore";
import { call, showSuccess, showError } from "@/services/api";
import { __ } from "@/lib/translate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tag, Ticket, Clock, Trash2, Wallet, Gift, Loader2, Percent } from "lucide-vue-next";

const posStore = usePosStore();
const cartStore = useCartStore();
const offerStore = useOfferStore();

const showDiscount = ref(false);
const showCoupon = ref(false);
const discountType = ref("percentage");
const discountInput = ref(0);
const couponInput = ref("");
const couponError = ref("");
const isApplyingCoupon = ref(false);

const hasDiscount = computed(() =>
	cartStore.discountPercentage > 0 || cartStore.discountAmount > 0
);

// Calculate total item-level discounts
const itemDiscountTotal = computed(() => {
	return cartStore.items.reduce((sum, item) => {
		const itemTotal = item.qty * item.rate;
		if (item.discount_percentage > 0) {
			return sum + Math.abs((itemTotal * item.discount_percentage) / 100);
		}
		return sum + Math.abs(item.discount_amount || 0);
	}, 0);
});

const discountValue = computed(() => {
	if (cartStore.discountPercentage > 0) {
		return (cartStore.subtotal * cartStore.discountPercentage) / 100;
	}
	return cartStore.discountAmount;
});

const payButtonLabel = computed(() => {
	if (cartStore.isEmpty) return __('Add items to pay');
	if (!cartStore.customer) return __('Select customer first');
	const amt = `${posStore.currencySymbol}${formatPrice(Math.abs(cartStore.grandTotal))}`;
	return cartStore.isReturnMode ? __('Process Return {0}', [amt]) : __('Pay {0}', [amt]);
});

function applyDiscount() {
	cartStore.setDiscount(discountType.value as "percentage" | "amount", discountInput.value || 0);
}

async function applyCouponCode() {
	if (!couponInput.value) return;
	isApplyingCoupon.value = true;
	couponError.value = "";

	try {
		const result = await offerStore.fetchCoupon(couponInput.value, cartStore.customer?.name || "");
		if (result) {
			cartStore.applyCoupon(result);
			showCoupon.value = false;
			couponInput.value = "";
		} else {
			couponError.value = __('Invalid or expired coupon code');
		}
	} catch (error) {
		couponError.value = __('Failed to validate coupon');
	} finally {
		isApplyingCoupon.value = false;
	}
}

function extractErrorMessage(error: unknown): string {
	if (!error) return __('Unknown error');
	if (typeof error === "string") return error;
	const err = error as Record<string, unknown>;
	if (err._server_messages) {
		try {
			const msgs = JSON.parse(err._server_messages as string);
			const parsed = typeof msgs === "string" ? [msgs] : msgs;
			return parsed.map((m: string) => {
				try { return JSON.parse(m).message || m; } catch { return m; }
			}).join(", ");
		} catch { /* fallthrough */ }
	}
	if (err.message && typeof err.message === "string") return err.message;
	if (err.exc_type && typeof err.exc_type === "string") return err.exc_type;
	try { return JSON.stringify(error); } catch { return String(error); }
}

async function holdOrder() {
	if (cartStore.isEmpty) return;

	// Validate required data is available
	const profileName = posStore.profileName;
	const shiftName = posStore.posOpeningShift?.name || "";
	
	if (!profileName) {
		showError(__('POS Profile is not set. Please close and reopen the shift.'));
		return;
	}
	
	if (!shiftName) {
		showError(__('No open shift found. Please open a shift first.'));
		return;
	}

	try {
		const data = cartStore.getInvoiceData(profileName, shiftName);
		
		// Ensure customer is set
		if (!data.customer) {
			// Try to get default customer from boot data
			const bootCustomer = (window.xpos?.boot as Record<string, unknown>)?.sysdefaults as Record<string, string> | undefined;
			data.customer = bootCustomer?.customer || "";
		}
		
		if (!data.customer) {
			showError(__('Please select a customer before holding the order.'));
			return;
		}
		
		if (!data.items || data.items.length === 0) {
			showError(__('No items in cart to save.'));
			return;
		}

		await call("xpos.api.invoices.save_draft_invoice", {
			data: JSON.stringify(data),
		});
		cartStore.clearAll();
		showSuccess(__('Order saved as draft'));
	} catch (error: unknown) {
		showError(__('Failed to save draft: {0}', [extractErrorMessage(error)]));
	}
}

function formatPrice(price: number | string) {
	return parseFloat(String(price) || "0").toFixed(2);
}
</script>
