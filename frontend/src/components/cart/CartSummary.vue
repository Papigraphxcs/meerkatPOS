<template>
	<div
		class="shrink-0 mx-4 mb-3 border-x border-b border-border rounded-b-2xl bg-muted/40 dark:bg-muted/10 px-4 pt-3 pb-4 space-y-3"
	>
		<div
			v-if="cartStore.pricingSource === 'offline'"
			class="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400"
		>
			<WifiOff class="w-3 h-3 shrink-0" />
			{{ __("Prices calculated offline, will be confirmed when the invoice syncs") }}
		</div>

		<div class="space-y-1.5 font-mono">
			<div class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground">{{ __("Subtotal") }}</span>
				<span class="font-medium text-foreground tabular-nums">
					{{ money(cartStore.subtotal) }}
				</span>
			</div>

			<div v-if="itemDiscountTotal > 0" class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground flex items-center gap-1">
					<Percent class="w-3 h-3" /> {{ __("Item Discounts") }}
				</span>
				<span class="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
					-{{ money(itemDiscountTotal) }}
				</span>
			</div>

			<div
				v-if="cartStore.calculatedTaxes.length > 0"
				class="rounded-md border border-dashed border-border/70 px-2 py-1.5 space-y-1"
			>
				<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
					{{ __("VAT") }}
				</p>
				<div
					v-for="(tax, idx) in cartStore.calculatedTaxes"
					:key="idx"
					class="flex items-center justify-between text-sm"
				>
					<span class="text-muted-foreground flex items-center gap-1">
						{{ tax.description }}
						<span v-if="tax.rate" class="text-xs text-muted-foreground/70"
							>({{ percent(tax.rate) }})</span
						>
						<span v-if="tax.included_in_print_rate" class="text-[10px] text-muted-foreground">{{
							__("incl.")
						}}</span>
					</span>
					<span
						class="font-medium tabular-nums"
						:class="
							tax.included_in_print_rate
								? 'text-muted-foreground'
								: 'text-foreground'
						"
					>
						{{ tax.included_in_print_rate ? "" : "+" }}{{ money(tax.amount) }}
					</span>
				</div>
				<div
					v-if="cartStore.calculatedTaxes.length > 1"
					class="flex items-center justify-between text-xs pt-1 border-t border-dashed border-border/70"
				>
					<span class="text-muted-foreground">{{ __("Total VAT") }}</span>
					<span class="font-semibold text-foreground tabular-nums">
						{{ money(cartStore.totalTaxAmount) }}
					</span>
				</div>
			</div>

			<div
				v-if="cartStore.offerItemDiscountTotal > 0"
				class="flex items-center justify-between text-sm"
			>
				<span class="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
					<Ticket class="w-3 h-3" /> {{ __("Offer Discount") }}
				</span>
				<span class="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
					-{{ money(cartStore.offerItemDiscountTotal) }}
				</span>
			</div>

			<div
				v-if="cartStore.offerGrandTotalDiscountPct > 0"
				class="flex items-center justify-between text-sm"
			>
				<span class="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
					<Ticket class="w-3 h-3" /> {{ __("Offer") }}
					<span class="text-xs">({{ percent(cartStore.offerGrandTotalDiscountPct) }})</span>
				</span>
				<span class="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
					-{{ money(grandTotalOfferDiscount) }}
				</span>
			</div>

			<div
				v-if="cartStore.discountPercentage > 0 || cartStore.discountAmount > 0"
				class="flex items-center justify-between text-sm"
			>
				<span class="text-muted-foreground flex items-center gap-1">
					<Tag class="w-3 h-3" />
					{{ __("Additional Discount") }}
					<span
						v-if="cartStore.discountPercentage > 0"
						class="text-xs text-emerald-600 dark:text-emerald-400"
					>
						({{ percent(cartStore.discountPercentage) }})
					</span>
				</span>
				<span class="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
					-{{ money(discountValue) }}
				</span>
			</div>

			<div
				v-if="cartStore.redeemLoyaltyPoints && cartStore.loyaltyAmount > 0"
				class="flex items-center justify-between text-sm"
			>
				<span class="text-violet-600 dark:text-violet-400 flex items-center gap-1">
					<Gift class="w-3.5 h-3.5" /> {{ __("Loyalty") }}
				</span>
				<span class="font-medium text-violet-600 dark:text-violet-400 tabular-nums">
					-{{ money(cartStore.loyaltyAmount) }}
				</span>
			</div>

			<div v-if="cartStore.writeOffAmount > 0" class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground">{{ __("Write Off") }}</span>
				<span class="font-medium text-amber-600 dark:text-amber-400 tabular-nums">
					-{{ money(cartStore.writeOffAmount) }}
				</span>
			</div>

			<div v-if="cartStore.selectedDeliveryCharge" class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground flex items-center gap-1">
					<Truck class="w-3 h-3" /> {{ cartStore.selectedDeliveryCharge.label }}
				</span>
				<span class="font-medium text-foreground tabular-nums">
					+{{ money(cartStore.selectedDeliveryCharge.rate) }}
				</span>
			</div>

			<Separator class="my-2!" />

			<div class="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
				<span class="text-base font-bold font-sans text-foreground">{{ __("Total") }}</span>
				<span class="text-2xl font-extrabold tabular-nums text-foreground">
					{{ cartStore.isReturnMode ? "-" : "" }}{{ money(Math.abs(cartStore.grandTotal)) }}
				</span>
			</div>
		</div>

		<div v-if="!cartStore.isEmpty" class="pt-2 border-t border-dashed border-border text-center">
			<p class="text-xs font-mono font-medium text-foreground">
				{{ posStore.companyName || __("meerkatPOS") }}
			</p>
			<p class="text-[10px] font-mono text-muted-foreground mt-0.5">
				{{ __("Thank you for your purchase") }}
			</p>
		</div>
	</div>

	<div class="shrink-0 mx-4 mt-3 mb-4 space-y-3">
		<div class="flex items-center gap-2">
			<div class="flex-[3] min-w-0 flex items-center gap-2">
				<button
					@click="handleCustomerClick"
					class="flex-1 min-w-0 flex items-center gap-2 p-2 rounded-xl bg-muted text-left transition-colors duration-200 group"
					:class="cartStore.isReturnMode ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted/70'"
					:disabled="cartStore.isReturnMode"
				>
					<span
						class="w-7 h-7 shrink-0 rounded-full bg-foreground text-background flex items-center justify-center overflow-hidden"
					>
						<img
							v-if="cartStore.customer && cartStore.customer.image"
							:src="cartStore.customer.image as string"
							:alt="cartStore.customer.customer_name"
							class="w-full h-full object-cover"
							loading="lazy"
						/>
						<User v-else class="w-3.5 h-3.5" />
					</span>
					<p class="flex-1 min-w-0 text-xs font-semibold text-foreground truncate">
						{{ cartStore.customerName }}
					</p>
					<Lock v-if="cartStore.isReturnMode" class="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
					<ChevronDown v-else class="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
				</button>
				<button
					v-if="cartStore.customer && !cartStore.isReturnMode"
					class="shrink-0 w-9 h-9 rounded-full bg-background border border-border flex items-center justify-center hover:border-foreground transition-colors"
					@click.stop="handleEditCustomer"
					title="Edit Customer"
				>
					<Pencil class="w-3.5 h-3.5" />
				</button>
			</div>

			<Button
				v-if="cartStore.customer && !cartStore.isReturnMode"
				variant="outline"
				class="flex-1 h-9 px-2 justify-center gap-1.5 rounded-xl border-border text-xs"
				@click="customerStore.showLoyaltyDialog = true"
			>
				<Gift class="w-3.5 h-3.5" />
				{{ __("Loyalty") }}
			</Button>
		</div>

		<div class="flex items-center gap-2 flex-wrap">
			<Button
				v-if="hasPermission('apply_additional_discount')"
				variant="outline"
				size="sm"
				class="gap-1.5 rounded-full border-border"
				:class="{ 'bg-foreground text-background border-foreground': hasDiscount }"
				:disabled="cartStore.isEmpty"
				@click="showDiscount = !showDiscount"
			>
				<Tag class="w-4 h-4" />
				{{ __("Discount") }}
			</Button>

			<Button
				v-if="posStore.fetchCoupon"
				variant="outline"
				size="sm"
				class="gap-1.5 rounded-full border-border"
				:class="{ 'bg-foreground text-background border-foreground': !!cartStore.appliedCoupon }"
				:disabled="cartStore.isEmpty"
				@click="showCoupon = !showCoupon"
			>
				<Ticket class="w-4 h-4" />
				{{ __("Coupon") }}
			</Button>

			<Button
				variant="outline"
				size="sm"
				class="gap-1.5 rounded-full border-border text-destructive hover:text-destructive"
				:disabled="cartStore.isEmpty"
				@click="cartStore.clearCart()"
			>
				<Trash2 class="w-4 h-4" />
				{{ __("Clear") }}
			</Button>

			<div class="flex-1"></div>

			<Popover>
				<PopoverTrigger as-child>
					<Button variant="outline" size="sm" class="gap-1.5 rounded-full border-border relative">
						<MoreHorizontal class="w-4 h-4" />
						{{ __("More") }}
						<Badge
							v-if="cartStore.draftOrderCount > 0"
							variant="secondary"
							class="absolute -top-1.5 -end-1.5 h-4 min-w-4 px-1 text-[10px] leading-none"
						>
							{{ cartStore.draftOrderCount }}
						</Badge>
					</Button>
				</PopoverTrigger>
				<PopoverContentStyled class="w-52 p-1.5" align="end" side="top">
					<Button
						variant="ghost"
						size="sm"
						class="w-full justify-start gap-2"
						:disabled="cartStore.isEmpty"
						data-testid="hold-order"
						@click="holdOrder"
					>
						<Clock class="w-4 h-4" />
						{{ __("Save as Draft") }}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="w-full justify-start gap-2 relative"
						@click="cartStore.openDraftDialog()"
					>
						<FileText class="w-4 h-4" />
						{{ __("Restore Draft") }}
						<Badge
							v-if="cartStore.draftOrderCount > 0"
							variant="secondary"
							class="ms-auto h-4 min-w-4 px-1 text-[10px] leading-none"
						>
							{{ cartStore.draftOrderCount }}
						</Badge>
					</Button>
					<Button
						v-if="!cartStore.isReturnMode"
						variant="ghost"
						size="sm"
						class="w-full justify-start gap-2"
						:disabled="cartStore.isEmpty"
						:class="{ 'text-primary': !!cartStore.selectedDeliveryCharge }"
						@click="toggleDelivery"
					>
						<Truck class="w-4 h-4" />
						{{ __("Delivery Charge") }}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="w-full justify-start gap-2"
						:disabled="!hasAnyDiscount"
						@click="clearAllDiscounts"
					>
						<X class="w-4 h-4" />
						{{ __("Clear All Discounts") }}
					</Button>
				</PopoverContentStyled>
			</Popover>
		</div>

		<transition name="slide-up">
			<div v-if="showDelivery" class="bg-muted rounded-lg p-3 space-y-2">
				<div class="flex items-center justify-between mb-1">
					<span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{{
						__("Delivery Charges")
					}}</span>
					<button
						v-if="cartStore.selectedDeliveryCharge"
						class="text-xs text-destructive hover:underline"
						@click="cartStore.setDeliveryCharge(null)"
					>
						{{ __("Remove") }}
					</button>
				</div>
				<div v-if="isLoadingDelivery" class="text-xs text-muted-foreground">
					{{ __("Loading...") }}
				</div>
				<div v-else-if="!availableDeliveryCharges.length" class="text-xs text-muted-foreground">
					{{ __("No delivery charges available for this profile") }}
				</div>
				<div v-else class="flex flex-wrap gap-2">
					<button
						v-for="charge in availableDeliveryCharges"
						:key="charge.name"
						@click="selectDeliveryCharge(charge)"
						class="px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all"
						:class="
							cartStore.selectedDeliveryCharge?.name === charge.name
								? 'bg-primary text-primary-foreground border-primary'
								: 'bg-background border-border hover:border-primary/50 hover:text-primary'
						"
					>
						{{ charge.label }} &mdash; {{ money(charge.rate) }}
					</button>
				</div>
			</div>
		</transition>
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
					<NumberInput
						v-model="discountInput"
						:min="0"
						:max="discountType === 'percentage' ? 100 : undefined"
						:precision="moneyPrecision"
						class="flex-1"
						:placeholder="
							discountType === 'percentage' ? __('Discount %') : __('Discount amount')
						"
						@change="applyDiscount"
					/>
				</div>
			</div>
		</transition>

		<transition name="slide-up">
			<div v-if="showCoupon" class="bg-muted rounded-lg p-3 space-y-2">
				<div class="flex items-center gap-2">
					<Input
						v-model="couponInput"
						type="text"
						:placeholder="__('Enter coupon code...')"
						class="flex-1 rounded-full"
						@keydown.enter="applyCouponCode"
					/>
					<Button
						size="sm"
						class="rounded-full bg-foreground text-background hover:bg-foreground/90"
						:disabled="!couponInput || isApplyingCoupon"
						@click="applyCouponCode"
					>
						<template v-if="isApplyingCoupon">
							<Loader2 class="w-4 h-4 animate-spin" />
						</template>
						<template v-else>{{ __("Apply") }}</template>
					</Button>
				</div>
				<p v-if="couponError" class="text-xs text-destructive">{{ couponError }}</p>
			</div>
		</transition>

		<div
			v-if="cartStore.appliedCoupon"
			class="flex items-center justify-between rounded-2xl bg-muted px-4 py-2.5"
		>
			<span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
				{{ __("Promotion Code") }}
			</span>
			<span class="px-2.5 py-1 rounded-full bg-foreground text-background text-xs font-bold">
				{{ cartStore.appliedCoupon.coupon_code || cartStore.appliedCoupon.name }}
			</span>
		</div>

		<Button
			size="xl"
			class="w-full font-bold tracking-wide rounded-2xl shadow-none"
			:class="
				isPayDisabled
					? 'bg-muted text-muted-foreground disabled:opacity-100'
					: 'bg-foreground text-background hover:bg-foreground/90'
			"
			:disabled="isPayDisabled"
			@click="handleCheckout()"
		>
			<Wallet class="w-5 h-5" />
			{{ payButtonLabel }}
		</Button>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { usePosStore } from "@/stores/posStore";
import { hasPermission } from "@/services/userRights";
import { useCartStore } from "@/stores/cartStore";
import { useCustomerStore } from "@/stores/customerStore";
import { useAuthStore } from "@/stores/authStore";
import { useOfferStore } from "@/stores/offerStore";
import { call, showSuccess, showError } from "@/services/api";
import { __ } from "@/lib/translate";
import { isElectron } from "@/services/electronBridge";
import { isTabConflictError } from "@/utils";
import { useOfflineStore } from "@/stores/offlineStore";
import { usePrintInvoice } from "@/composables/usePrintInvoice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContentStyled, PopoverTrigger } from "@/components/ui/popover";
import {
	Tag,
	Ticket,
	Clock,
	Trash2,
	Wallet,
	Gift,
	Loader2,
	Percent,
	FileText,
	Truck,
	WifiOff,
	X,
	MoreHorizontal,
	User,
	ChevronDown,
	Lock,
	Pencil,
} from "lucide-vue-next";
import type { DeliveryCharge } from "@/types/pos.types";
import { useMoney } from "@/composables/useMoney";

const posStore = usePosStore();
const { money, moneyPrecision, percent } = useMoney();
const cartStore = useCartStore();
const customerStore = useCustomerStore();
const authStore = useAuthStore();
const offerStore = useOfferStore();
const offlineStore = useOfflineStore();
const { printInvoice, printInvoiceLocal } = usePrintInvoice();

const showDiscount = ref(false);
const showCoupon = ref(false);
const showDelivery = ref(false);
const isLoadingDelivery = ref(false);
const availableDeliveryCharges = ref<DeliveryCharge[]>([]);
const discountType = ref("percentage");
const discountInput = ref(0);
const couponInput = ref("");
const couponError = ref("");
const isApplyingCoupon = ref(false);

const hasDiscount = computed(() => cartStore.discountPercentage > 0 || cartStore.discountAmount > 0);

const grandTotalOfferDiscount = computed(() => {
	if (cartStore.offerGrandTotalDiscountPct <= 0) return 0;
	const baseTotal =
		cartStore.subtotal +
		cartStore.calculatedTaxes.filter((t) => !t.included_in_print_rate).reduce((s, t) => s + t.amount, 0) -
		cartStore.offerItemDiscountTotal;
	return (baseTotal * cartStore.offerGrandTotalDiscountPct) / 100;
});

const hasAnyDiscount = computed(
	() =>
		hasDiscount.value ||
		itemDiscountTotal.value > 0 ||
		cartStore.hasOffers ||
		cartStore.offerItemDiscountTotal > 0 ||
		cartStore.offerGrandTotalDiscountPct > 0,
);

function clearAllDiscounts() {
	cartStore.clearAllDiscounts();
	discountInput.value = 0;
	showDiscount.value = false;
	showCoupon.value = false;
}

function handleCustomerClick() {
	if (cartStore.isReturnMode) {
		showError(__("Customer cannot be changed in return mode"));
		return;
	}
	customerStore.showCustomerDialog = true;
	customerStore.searchCustomers();
}

function handleEditCustomer() {
	customerStore.showCustomerEditDialog = true;
}

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

const isPayDisabled = computed(() => cartStore.isEmpty || !cartStore.customer);

const payButtonLabel = computed(() => {
	if (cartStore.isEmpty) return __("Add items to pay");
	if (!cartStore.customer) return __("Select customer first");
	if (posStore.enableCashierSettlement && !cartStore.isReturnMode) return __("Send to Cashier");
	const amt = `${money(Math.abs(cartStore.grandTotal))}`;
	return cartStore.isReturnMode ? __("Process Return {0}", [amt]) : __("Pay {0}", [amt]);
});

function handleCheckout() {
	if (posStore.enableCashierSettlement && !cartStore.isReturnMode) {
		sendToCashier();
		return;
	}
	cartStore.openPaymentDialog();
}

function applyDiscount() {
	cartStore.setDiscount(discountType.value as "percentage" | "amount", discountInput.value || 0);
}

async function loadDeliveryCharges(): Promise<DeliveryCharge[]> {
	if (!posStore.profileName || !posStore.companyName) {
		availableDeliveryCharges.value = [];
		return [];
	}

	isLoadingDelivery.value = true;
	try {
		const charges = await offerStore.fetchDeliveryCharges(
			posStore.profileName,
			posStore.companyName,
			cartStore.customer?.name || "",
		);
		availableDeliveryCharges.value = charges;
		return charges;
	} finally {
		isLoadingDelivery.value = false;
	}
}

function syncSelectedDeliveryCharge(charges: DeliveryCharge[]) {
	const currentCharge = cartStore.selectedDeliveryCharge;
	const matchingCharge = currentCharge
		? charges.find((charge) => charge.name === currentCharge.name)
		: undefined;

	if (matchingCharge) {
		cartStore.setDeliveryCharge(matchingCharge);
		return;
	}

	if (currentCharge) {
		cartStore.setDeliveryCharge(null);
	}

	if (posStore.posProfile?.auto_set_delivery_charges && charges.length > 0) {
		cartStore.setDeliveryCharge(charges[0]);
	}
}

async function syncAutoDeliveryCharge() {
	if (cartStore.isReturnMode || cartStore.isEmpty) {
		availableDeliveryCharges.value = [];
		cartStore.setDeliveryCharge(null);
		return;
	}

	if (!posStore.posProfile?.auto_set_delivery_charges) {
		return;
	}

	const charges = await loadDeliveryCharges();
	syncSelectedDeliveryCharge(charges);
}

watch(
	[
		() => posStore.posProfile?.auto_set_delivery_charges,
		() => posStore.profileName,
		() => posStore.companyName,
		() => cartStore.customer?.name || "",
		() => cartStore.isReturnMode,
		() => cartStore.isEmpty,
	],
	() => {
		void syncAutoDeliveryCharge();
	},
	{ immediate: true },
);

watch(
	() => cartStore.isEmpty,
	(empty) => {
		if (!empty) return;
		discountInput.value = 0;
		discountType.value = "percentage";
		couponInput.value = "";
		couponError.value = "";
		showDiscount.value = false;
		showCoupon.value = false;
		showDelivery.value = false;
	},
);

async function toggleDelivery() {
	showDelivery.value = !showDelivery.value;
	if (showDelivery.value) {
		const charges = await loadDeliveryCharges();
		syncSelectedDeliveryCharge(charges);
	}
}

function selectDeliveryCharge(charge: DeliveryCharge) {
	if (cartStore.selectedDeliveryCharge?.name === charge.name) {
		cartStore.setDeliveryCharge(null);
	} else {
		cartStore.setDeliveryCharge(charge);
	}
}

async function applyCouponCode() {
	if (!couponInput.value) return;
	isApplyingCoupon.value = true;
	couponError.value = "";

	try {
		if (offerStore.offers.length === 0) {
			await offerStore.fetchOffers(
				posStore.profileName,
				cartStore.items.map((i) => i.item_code),
				cartStore.customer?.name || "",
			);
		}

		const result = await offerStore.fetchCoupon(
			couponInput.value,
			cartStore.customer?.name || "",
			posStore.companyName,
		);
		if (result.coupon) {
			const posOfferName = (result.coupon as Record<string, unknown>).pos_offer as string | undefined;
			const storeOffer = posOfferName
				? offerStore.offers.find((o) => o.name === posOfferName)
				: undefined;
			const linkedOffer = storeOffer || result.offer;
			if (linkedOffer) {
				(result.coupon as Record<string, unknown>)._offer = linkedOffer;
			}
			cartStore.applyCoupon(result.coupon);
			showCoupon.value = false;
			couponInput.value = "";
		} else {
			couponError.value = result.msg || __("Invalid or expired coupon code");
		}
	} catch (error) {
		couponError.value = __("Failed to validate coupon");
	} finally {
		isApplyingCoupon.value = false;
	}
}

function extractErrorMessage(error: unknown): string {
	if (!error) return __("Unknown error");
	if (typeof error === "string") return error;
	const err = error as Record<string, unknown>;
	if (err._server_messages) {
		try {
			const msgs = JSON.parse(err._server_messages as string);
			const parsed = typeof msgs === "string" ? [msgs] : msgs;
			return parsed
				.map((m: string) => {
					try {
						return JSON.parse(m).message || m;
					} catch {
						return m;
					}
				})
				.join(", ");
		} catch {
			/* fallthrough */
		}
	}
	if (err.message && typeof err.message === "string") return err.message;
	if (err.exc_type && typeof err.exc_type === "string") return err.exc_type;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

async function holdOrder() {
	if (cartStore.isEmpty) return;

	const profileName = posStore.profileName;
	const shiftName = posStore.posOpeningShift?.name || "";

	if (!profileName) {
		showError(__("POS Profile is not set. Please close and reopen the shift."));
		return;
	}

	if (!shiftName) {
		showError(__("No open shift found. Please open a shift first."));
		return;
	}

	try {
		const data = cartStore.getInvoiceData(profileName, shiftName);
		if (!data.customer) {
			const bootCustomer = (window.meerkatpos?.boot as Record<string, unknown>)?.sysdefaults as
				| Record<string, string>
				| undefined;
			data.customer = bootCustomer?.customer || "";
		}

		if (!data.customer) {
			showError(__("Please select a customer before holding the order."));
			return;
		}

		if (!data.items || data.items.length === 0) {
			showError(__("No items in cart to save."));
			return;
		}

		if (isElectron() && window.electronAPI?.db) {
			await window.electronAPI.db.addPendingInvoice({
				data: { ...data, is_draft: true, pos_opening_shift_local_id: shiftName },
				customer_name: cartStore.customerName || data.customer,
				grand_total: cartStore.grandTotal || 0,
			});
			cartStore.clearAll();
			showSuccess(__("Order saved as draft locally"));
		} else {
			const serverData = { ...data };
			if (serverData.pos_opening_shift && /^\d+$/.test(String(serverData.pos_opening_shift))) {
				delete serverData.pos_opening_shift;
			}
			if (offlineStore.isOnline) {
				await call("xpos.api.invoices.save_draft_invoice", {
					data: JSON.stringify(serverData),
				});
				cartStore.clearAll();
				cartStore.refreshDraftOrderCount();
				showSuccess(__("Order saved as draft"));
			} else {
				await offlineStore.saveOffline(
					{ ...serverData, is_draft: true } as Parameters<typeof offlineStore.saveOffline>[0],
					cartStore.customerName || data.customer,
					cartStore.grandTotal || 0,
				);
				cartStore.clearAll();
				showSuccess(__("No connection – draft saved offline"));
			}
		}
	} catch (error: unknown) {
		if (handleTabConflict(error)) return;
		showError(__("Failed to save draft: {0}", [extractErrorMessage(error)]));
	}
}

function handleTabConflict(error: unknown): boolean {
	if (!isTabConflictError(error)) return false;

	showError(__("This tab was changed on another terminal. Reload it and try again."));
	cartStore.openDraftDialog();
	return true;
}

async function sendToCashier() {
	if (cartStore.isEmpty) return;

	const profileName = posStore.profileName;
	const shiftName = posStore.posOpeningShift?.name || "";

	if (!profileName) {
		showError(__("POS Profile is not set. Please close and reopen the shift."));
		return;
	}

	if (!shiftName) {
		showError(__("No open shift found. Please open a shift first."));
		return;
	}

	try {
		const data = cartStore.getInvoiceData(profileName, shiftName);
		data.pos_awaiting_settlement = true;

		if (!data.customer) {
			const bootCustomer = (window.meerkatpos?.boot as Record<string, unknown>)?.sysdefaults as
				| Record<string, string>
				| undefined;
			data.customer = bootCustomer?.customer || "";
		}

		if (!data.customer) {
			showError(__("Please select a customer before sending to cashier."));
			return;
		}

		if (!data.items || data.items.length === 0) {
			showError(__("No items in cart to send."));
			return;
		}

		if (isElectron() && window.electronAPI?.db) {
			const result = await window.electronAPI.db.addPendingInvoice({
				data: {
					...data,
					is_draft: true,
					pos_opening_shift_local_id: shiftName,
					receipt: cartStore.getReceiptSnapshot("", authStore.userFullName),
				},
				customer_name: cartStore.customerName || data.customer,
				grand_total: cartStore.grandTotal || 0,
			});
			if (posStore.printBackupReceipt && result?.id) {
				await printInvoiceLocal(result.id);
			}
			cartStore.clearAll();
			showSuccess(__("Sent to cashier"));
		} else {
			const serverData = { ...data };
			if (serverData.pos_opening_shift && /^\d+$/.test(String(serverData.pos_opening_shift))) {
				delete serverData.pos_opening_shift;
			}
			if (offlineStore.isOnline) {
				const result = await call<{ name: string }>("xpos.api.invoices.save_draft_invoice", {
					data: JSON.stringify(serverData),
				});
				if (posStore.printBackupReceipt && result?.name) {
					await printInvoice(result.name);
				}
				cartStore.clearAll();
				cartStore.refreshDraftOrderCount();
				showSuccess(__("Sent to cashier"));
			} else {
				await offlineStore.saveOffline(
					{ ...serverData, is_draft: true } as Parameters<typeof offlineStore.saveOffline>[0],
					cartStore.customerName || data.customer,
					cartStore.grandTotal || 0,
				);
				cartStore.clearAll();
				showSuccess(__("No connection – will sync to cashier when back online"));
			}
		}
	} catch (error: unknown) {
		if (handleTabConflict(error)) return;
		showError(__("Failed to send to cashier: {0}", [extractErrorMessage(error)]));
	}
}
</script>
