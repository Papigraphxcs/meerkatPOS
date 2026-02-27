<template>
	<Dialog :open="cartStore.showPaymentDialog" @update:open="(val: boolean) => { if (!val) close() }">
		<DialogContent class="max-w-4xl h-[calc(100vh-2rem)] flex flex-col p-0 gap-0" :hide-close="true">
			<!-- Compact Header -->
			<DialogHeader
				class="shrink-0 flex-row items-center justify-between space-y-0 px-5 py-3 border-b border-border">
				<div class="flex items-center gap-3">
					<div
						class="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm">
						<Wallet class="w-4 h-4 text-white" />
					</div>
					<div>
						<DialogTitle class="text-base">
							{{ cartStore.isReturnMode ? 'Return Payment' : 'Payment' }}
						</DialogTitle>
						<DialogDescription class="text-xs">{{ cartStore.customerName }}</DialogDescription>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<Badge v-if="cartStore.isReturnMode" variant="warning" class="text-[10px]">
						<RotateCcw class="w-3 h-3" /> Return
					</Badge>
					<kbd
						class="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted rounded border border-border">Esc</kbd>
					<Button variant="ghost" size="icon-sm" @click="close" tabindex="-1">
						<X class="w-5 h-5" />
					</Button>
				</div>
			</DialogHeader>

			<!-- Main Content: Side-by-side -->
			<div class="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
				<!-- Left: Amount & Methods -->
				<div class="flex-1 flex flex-col p-4 gap-3 min-w-0 overflow-y-auto xpos-scrollbar">
					<!-- Grand Total -->
					<div class="text-center py-3 rounded-xl border" :class="cartStore.isReturnMode
						? 'bg-amber-500/5 border-amber-500/10'
						: 'bg-primary/5 border-primary/10'">
						<p class="text-xs font-medium mb-0.5"
							:class="cartStore.isReturnMode ? 'text-amber-600' : 'text-primary/70'">
							{{ cartStore.isReturnMode ? 'Refund Amount' : 'Amount Due' }}
						</p>
						<p class="text-3xl font-extrabold tabular-nums"
							:class="cartStore.isReturnMode ? 'text-amber-600' : 'text-primary'">
							{{ posStore.currencySymbol }}{{ formatPrice(Math.abs(cartStore.grandTotal)) }}
						</p>
					</div>

					<!-- Payment Methods -->
					<div>
						<div class="flex items-center justify-between mb-2">
							<h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Method</h3>
							<div class="flex items-center gap-1">
								<kbd
									class="px-1 py-0.5 text-[9px] font-mono text-muted-foreground bg-muted rounded border border-border">&larr;</kbd>
								<kbd
									class="px-1 py-0.5 text-[9px] font-mono text-muted-foreground bg-muted rounded border border-border">&rarr;</kbd>
							</div>
						</div>
						<div class="flex gap-2 flex-wrap">
							<button v-for="(method, idx) in availableMethods" :key="method.mode_of_payment"
								:ref="el => { if (el) methodRefs[idx] = el as HTMLButtonElement }"
								@click="selectMethod(method.mode_of_payment)"
								@keydown.left.prevent="focusMethod(idx - 1)"
								@keydown.right.prevent="focusMethod(idx + 1)" @keydown.down.prevent="focusAmountInput"
								class="flex-1 min-w-[80px] p-2.5 rounded-xl border-2 text-center transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-ring"
								:class="selectedMethod === method.mode_of_payment
									? 'border-primary bg-primary/5 text-primary shadow-sm'
									: 'border-border bg-card text-muted-foreground hover:border-muted-foreground/30'">
								<div class="text-lg mb-0.5">{{ getMethodIcon(method.mode_of_payment) }}</div>
								<p class="text-[11px] font-medium truncate">{{ method.mode_of_payment }}</p>
							</button>
						</div>
					</div>

					<!-- Amount Input -->
					<div>
						<div class="flex items-center justify-between mb-1.5">
							<label
								class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tendered</label>
							<Button v-if="!isSplitPayment" variant="link" size="sm" class="text-xs h-auto p-0"
								@click="enableSplitPayment">
								Split Payment
							</Button>
						</div>
						<Input ref="amountInput" v-model.number="tenderedAmount" type="number" step="0.01" min="0"
							class="text-center text-xl font-bold tracking-wider py-3"
							@focus="($event.target as HTMLInputElement)?.select()"
							@keydown.enter.prevent="isSplitPayment ? addSplitPayment() : submitPayment()"
							@keydown.up.prevent="focusMethodByIndex" @keydown.down.prevent="focusFirstQuickAmount" />
					</div>

					<!-- Split Payment: Add button and list -->
					<div v-if="isSplitPayment" class="space-y-2">
						<Button variant="outline" size="sm" class="w-full" @click="addSplitPayment"
							:disabled="!selectedMethod || tenderedAmount <= 0">
							<Plus class="w-4 h-4" />
							Add {{ selectedMethod }} &mdash; {{ posStore.currencySymbol }}{{ formatPrice(tenderedAmount)
							}}
						</Button>

						<div v-if="splitPayments.length > 0" class="space-y-1">
							<div v-for="(sp, idx) in splitPayments" :key="idx"
								class="flex items-center justify-between bg-muted rounded-lg px-3 py-2 text-sm">
								<div class="flex items-center gap-2">
									<span>{{ getMethodIcon(sp.mode_of_payment) }}</span>
									<span class="font-medium text-foreground">{{ sp.mode_of_payment }}</span>
								</div>
								<div class="flex items-center gap-2">
									<span class="font-bold text-foreground">{{ posStore.currencySymbol }}{{
										formatPrice(sp.amount) }}</span>
									<button @click="removeSplitPayment(idx)"
										class="text-muted-foreground hover:text-destructive">
										<X class="w-3.5 h-3.5" />
									</button>
								</div>
							</div>
							<div class="flex justify-between text-sm font-semibold px-3 pt-1">
								<span class="text-muted-foreground">Total Paid</span>
								<span class="text-primary">{{ posStore.currencySymbol }}{{ formatPrice(splitTotal)
									}}</span>
							</div>
						</div>
					</div>

					<!-- Quick Amount Buttons -->
					<div v-if="!isSplitPayment" class="grid grid-cols-4 gap-1.5">
						<Button v-for="(amount, idx) in quickAmounts" :key="amount"
							:ref="el => { if (el) quickAmountRefs[idx] = (el as any).$el || el }" variant="outline"
							size="sm" class="active:scale-95" @click="setQuickAmount(amount)"
							@keydown.enter.prevent="setQuickAmount(amount)" @keydown.up.prevent="focusAmountInput"
							@keydown.down.prevent="focusSubmitBtn" @keydown.left.prevent="focusQuickAmount(idx - 1)"
							@keydown.right.prevent="focusQuickAmount(idx + 1)">
							{{ posStore.currencySymbol }}{{ amount }}
						</Button>
					</div>

					<!-- Loyalty Points Redemption -->
					<div v-if="cartStore.customer && !cartStore.isReturnMode && customerLoyaltyPoints > 0"
						class="bg-violet-500/5 border border-violet-500/20 rounded-xl p-3">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<Gift class="w-4 h-4 text-violet-500" />
								<span class="text-sm font-medium text-foreground">Loyalty Points</span>
							</div>
							<Badge variant="secondary" class="text-[10px]">{{ customerLoyaltyPoints }} pts</Badge>
						</div>
						<p class="text-xs text-muted-foreground mt-1">
							Worth {{ posStore.currencySymbol }}{{ formatPrice(customerLoyaltyAmount) }}
						</p>
						<div class="flex items-center gap-2 mt-2">
							<Button v-if="!cartStore.redeemLoyaltyPoints" variant="outline" size="sm"
								class="text-violet-600 border-violet-300 hover:bg-violet-50" @click="redeemLoyalty">
								Redeem Points
							</Button>
							<Button v-else variant="outline" size="sm" class="text-destructive"
								@click="cartStore.clearLoyalty()">
								Remove Loyalty
							</Button>
						</div>
					</div>

					<!-- Write-off -->
					<div v-if="posStore.allowWriteOffChange && !cartStore.isReturnMode" class="space-y-1">
						<div class="flex items-center justify-between">
							<label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Write
								Off</label>
							<span class="text-xs text-muted-foreground">Small remaining amounts</span>
						</div>
						<Input v-model.number="writeOffInput" type="number" min="0" step="0.01" placeholder="0.00"
							class="text-sm" @input="cartStore.writeOffAmount = writeOffInput || 0" />
					</div>

					<!-- Change / Remaining display -->
					<div class="flex gap-2 mt-auto">
						<div v-if="changeAmount > 0"
							class="flex-1 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 text-center">
							<p class="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 mb-0.5">Change</p>
							<p class="text-lg font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
								{{ posStore.currencySymbol }}{{ formatPrice(changeAmount) }}
							</p>
						</div>
						<div v-if="remainingAmount > 0"
							class="flex-1 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-center">
							<p class="text-[10px] font-medium text-amber-600 dark:text-amber-400 mb-0.5">Remaining</p>
							<p class="text-lg font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">
								{{ posStore.currencySymbol }}{{ formatPrice(remainingAmount) }}
							</p>
						</div>
					</div>
				</div>

				<!-- Right: Numpad -->
				<div class="hidden lg:flex flex-col w-64 border-l border-border p-4 gap-3">
					<h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Numpad</h3>
					<div class="grid grid-cols-3 gap-1.5 flex-1">
						<Button v-for="(key, idx) in numpadKeys" :key="key"
							:ref="el => { if (el) numpadRefs[idx] = (el as any).$el || el }"
							:variant="key === '⌫' ? 'destructive' : key === 'C' ? 'secondary' : 'outline'"
							class="text-base h-12" @click="handleNumpad(key)"
							@keydown.enter.prevent="handleNumpad(key)">
							<Delete v-if="key === '⌫'" class="w-5 h-5" />
							<template v-else>{{ key }}</template>
						</Button>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<DialogFooter
				class="shrink-0 border-t border-border px-5 py-3 bg-muted/30 justify-between sm:justify-between">
				<div class="hidden sm:flex items-center gap-2 text-[10px] text-muted-foreground">
					<kbd class="px-1.5 py-0.5 font-mono bg-muted rounded border border-border">Enter</kbd>
					<span>Submit</span>
					<span class="mx-1">|</span>
					<kbd class="px-1.5 py-0.5 font-mono bg-muted rounded border border-border">Esc</kbd>
					<span>Cancel</span>
				</div>
				<div class="flex items-center gap-3">
					<Button variant="outline" @click="close" tabindex="-1">Cancel</Button>
					<Button ref="submitBtn" :variant="cartStore.isReturnMode ? 'destructive' : 'success'"
						class="font-bold px-6 shadow-md" :disabled="isSubmitting || !canSubmit" @click="submitPayment">
						<template v-if="isSubmitting">
							<Loader2 class="w-4 h-4 animate-spin" />
							Processing...
						</template>
						<template v-else>
							<Check class="w-4 h-4" />
							{{ cartStore.isReturnMode ? 'Process Return' : 'Complete' }} {{ posStore.currencySymbol }}{{
								formatPrice(Math.abs(cartStore.grandTotal)) }}
						</template>
					</Button>
				</div>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { usePaymentStore } from "@/stores/paymentStore";
import { call, showSuccess, showError } from "@/services/api";
import {
	Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Wallet, X, Check, Loader2, Delete, Gift, RotateCcw, Plus } from "lucide-vue-next";

import type { InvoicePayment } from "@/types/pos.types";

const posStore = usePosStore();
const cartStore = useCartStore();
const paymentStore = usePaymentStore();

const amountInput = ref<InstanceType<typeof Input> | null>(null);
const submitBtn = ref<InstanceType<typeof Button> | null>(null);
const methodRefs: Record<number, HTMLButtonElement> = {};
const quickAmountRefs: Record<number, HTMLElement> = {};
const numpadRefs: Record<number, HTMLElement> = {};

const selectedMethod = ref("");
const tenderedAmount = ref(0);
const isSubmitting = ref(false);
const writeOffInput = ref(0);

// Split payment state
const isSplitPayment = ref(false);
const splitPayments = ref<InvoicePayment[]>([]);

// Customer loyalty
const customerLoyaltyPoints = ref(0);
const customerLoyaltyAmount = ref(0);

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
	const total = Math.abs(cartStore.grandTotal);
	const amounts: number[] = [];
	const rounded = Math.ceil(total);
	amounts.push(rounded);
	amounts.push(Math.ceil(total / 10) * 10);
	amounts.push(Math.ceil(total / 50) * 50);
	amounts.push(Math.ceil(total / 100) * 100);
	return [...new Set(amounts)].sort((a, b) => a - b).slice(0, 4);
});

const splitTotal = computed(() =>
	splitPayments.value.reduce((sum, p) => sum + (p.amount || 0), 0)
);

const effectiveTendered = computed(() =>
	isSplitPayment.value ? splitTotal.value : tenderedAmount.value
);

const changeAmount = computed(() => {
	const total = Math.abs(cartStore.grandTotal);
	const diff = roundCurrency(effectiveTendered.value - total);
	return diff > 0 ? diff : 0;
});

const remainingAmount = computed(() => {
	const total = Math.abs(cartStore.grandTotal);
	const diff = roundCurrency(total - effectiveTendered.value);
	return diff > 0 ? diff : 0;
});

const canSubmit = computed(() => {
	if (cartStore.isEmpty) return false;
	const total = Math.abs(cartStore.grandTotal);
	if (isSplitPayment.value) {
		return roundCurrency(splitTotal.value) >= roundCurrency(total);
	}
	return (
		selectedMethod.value !== "" &&
		roundCurrency(tenderedAmount.value) >= roundCurrency(total)
	);
});

function extractErrorMessage(error: unknown): string {
	if (!error) return "Unknown error";
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

// ─── Lifecycle ───────────────────────────────────
onMounted(async () => {
	tenderedAmount.value = roundCurrency(Math.abs(cartStore.grandTotal));
	if (availableMethods.value.length > 0) {
		selectedMethod.value = availableMethods.value[0].mode_of_payment;
	}
	nextTick(() => {
		const el = amountInput.value?.$el as HTMLElement | undefined;
		const input = el?.querySelector?.("input") || el;
		(input as HTMLInputElement)?.focus();
	});

	// Fetch loyalty info if customer is set
	if (cartStore.customer) {
		try {
			const credit = await paymentStore.fetchAvailableCredit(
				cartStore.customer.name,
				posStore.companyName
			);
			if (credit) {
				customerLoyaltyPoints.value = credit.loyalty_points || 0;
				customerLoyaltyAmount.value = credit.loyalty_amount || 0;
			}
		} catch { /* ignore */ }
	}
});

// ─── Keyboard Navigation ─────────────────────────
function focusMethod(idx: number) {
	const methods = availableMethods.value;
	const clamped = Math.max(0, Math.min(idx, methods.length - 1));
	methodRefs[clamped]?.focus();
	selectMethod(methods[clamped].mode_of_payment);
}

function focusMethodByIndex() {
	const currentIdx = availableMethods.value.findIndex(m => m.mode_of_payment === selectedMethod.value);
	focusMethod(currentIdx >= 0 ? currentIdx : 0);
}

function focusAmountInput() {
	const el = amountInput.value?.$el as HTMLElement | undefined;
	const input = el?.querySelector?.("input") || el;
	(input as HTMLInputElement)?.focus();
}

function focusFirstQuickAmount() {
	(quickAmountRefs[0] as HTMLElement)?.focus();
}

function focusQuickAmount(idx: number) {
	const clamped = Math.max(0, Math.min(idx, quickAmounts.value.length - 1));
	(quickAmountRefs[clamped] as HTMLElement)?.focus();
}

function focusSubmitBtn() {
	const el = submitBtn.value?.$el as HTMLElement | undefined;
	(el as HTMLButtonElement)?.focus();
}

// ─── Actions ─────────────────────────────────────
function selectMethod(method: string) {
	selectedMethod.value = method;
}

function setQuickAmount(amount: number) {
	tenderedAmount.value = roundCurrency(amount);
	focusAmountInput();
}

function enableSplitPayment() {
	isSplitPayment.value = true;
	splitPayments.value = [];
	tenderedAmount.value = 0;
}

function addSplitPayment() {
	if (!selectedMethod.value || tenderedAmount.value <= 0) return;
	const existing = splitPayments.value.find(p => p.mode_of_payment === selectedMethod.value);
	if (existing) {
		existing.amount = roundCurrency(existing.amount + tenderedAmount.value);
	} else {
		splitPayments.value.push({
			mode_of_payment: selectedMethod.value,
			amount: roundCurrency(tenderedAmount.value),
		});
	}
	tenderedAmount.value = roundCurrency(Math.max(0, Math.abs(cartStore.grandTotal) - splitTotal.value));
}

function removeSplitPayment(idx: number) {
	splitPayments.value.splice(idx, 1);
	tenderedAmount.value = roundCurrency(Math.max(0, Math.abs(cartStore.grandTotal) - splitTotal.value));
}

function redeemLoyalty() {
	const total = Math.abs(cartStore.grandTotal);
	const redeemAmount = Math.min(customerLoyaltyAmount.value, total);
	const ratio = customerLoyaltyPoints.value / (customerLoyaltyAmount.value || 1);
	const redeemPoints = Math.floor(redeemAmount * ratio);
	cartStore.setLoyalty(redeemPoints, redeemAmount);
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

		if (isSplitPayment.value) {
			invoiceData.payments = splitPayments.value.map(p => ({ ...p }));
		} else {
			invoiceData.payments = [
				{
					mode_of_payment: selectedMethod.value,
					amount: roundCurrency(Math.abs(cartStore.grandTotal)),
				},
			];
		}

		const result = await call<{ name: string }>("xpos.api.invoices.create_invoice", {
			data: JSON.stringify(invoiceData),
		});

		posStore.lastInvoiceName = result.name;

		if (cartStore.isReturnMode) {
			showSuccess("Return " + result.name + " created successfully!");
		} else {
			showSuccess("Invoice " + result.name + " created successfully!");
		}
		cartStore.clearAll();
	} catch (error: unknown) {
		showError("Payment failed: " + extractErrorMessage(error));
		console.error("Payment error:", error);
	} finally {
		isSubmitting.value = false;
	}
}

function close() {
	cartStore.closePaymentDialog();
}

// ─── Helpers ─────────────────────────────────────
function roundCurrency(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatPrice(price: number | string) {
	return roundCurrency(parseFloat(String(price) || "0")).toFixed(2);
}
</script>
