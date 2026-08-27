<template>
	<Dialog
		:open="cartStore.showPaymentDialog"
		@update:open="
			(val: boolean) => {
				if (!val) close();
			}
		"
	>
		<DialogContent
			class="max-w-5xl h-[50rem] max-h-[calc(100vh-2rem)] flex flex-col p-0 gap-0 overflow-hidden bg-background"
			:hide-close="true"
		>
			<DialogHeader
				class="shrink-0 flex-row items-center justify-between space-y-0 px-6 py-4 border-b border-border"
			>
				<div class="flex items-center gap-3">
					<div
						class="w-10 h-10 rounded-xl flex items-center justify-center border border-border"
						:class="cartStore.isReturnMode ? 'bg-foreground text-background' : 'bg-foreground text-background'"
					>
						<component :is="cartStore.isReturnMode ? RotateCcw : Wallet" class="w-5 h-5" />
					</div>
					<div>
						<DialogTitle class="text-lg font-bold tracking-tight">
							{{ cartStore.isReturnMode ? __("Return Payment") : __("Payment") }}
						</DialogTitle>
						<DialogDescription class="text-xs font-medium">{{
							cartStore.customerName
						}}</DialogDescription>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<div
						v-if="customerBalance !== null && !cartStore.isReturnMode"
						class="hidden sm:flex items-center gap-2 text-[11px]"
					>
						<span
							v-if="customerBalance > 0"
							class="px-2 py-1 rounded-full border border-border text-foreground font-semibold"
						>
							{{ __("Outstanding") }}: {{ money(customerBalance) }}
						</span>
						<span
							v-if="customerCreditLimit > 0"
							class="px-2 py-1 rounded-full border border-border text-foreground font-semibold"
						>
							{{ __("Credit Limit") }}: {{ money(customerCreditLimit) }}
						</span>
					</div>
					<Badge v-if="cartStore.isReturnMode" variant="outline" class="text-[10px]">
						<RotateCcw class="w-3 h-3" /> {{ __("Return") }}
					</Badge>
					<kbd
						class="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted rounded border border-border"
						>Esc</kbd
					>
					<Button
						variant="ghost"
						size="icon-sm"
						class="rounded-full hover:bg-muted"
						@click="close"
						tabindex="-1"
					>
						<X class="w-5 h-5" />
					</Button>
				</div>
			</DialogHeader>

			<div class="flex-1 flex flex-col min-h-0 overflow-y-auto meerkatpos-scrollbar p-5 gap-3">
				<!-- Row 1: action cards (left) + amount due (right) -->
				<div class="grid grid-cols-1 lg:grid-cols-[15rem_1fr] gap-3 lg:items-stretch lg:min-h-[17rem]">
					<div class="grid grid-cols-2 grid-rows-2 gap-2 justify-around items-center">
						<Button
							variant="outline"
							class="h-[50%] flex flex-row gap-1.5 rounded-2xl p-3 justify-center items-center hover:bg-red-100 hover:text-black hover:border hover:border-red-400"
							@click="close"
							tabindex="-1"
						>
							<X class="w-4 h-4 hover:text-black" />
							<span class="text-xs font-semibold">{{ __("Cancel") }}</span>
						</Button>
						<Button
							variant="outline"
							class="h-[50%] flex flex-row gap-1.5 rounded-2xl p-3 justify-center items-center"
							@click="!isSplitPayment ? enableSplitPayment() : (isSplitPayment = false)"
						>
							<Plus class="w-4 h-4" />
							<span class="text-xs font-semibold">{{ __("Split Payment") }}</span>
						</Button>
						<Button
							variant="outline"
							class="h-[50%] flex flex-row items-start gap-1.5 rounded-2xl p-3 justify-center items-center"
							data-testid="save-payment"
							:disabled="isSubmitting || !canSubmit"
							@click="submitPayment(false)"
						>
							<Loader2 v-if="isSubmitting && !printAfterSave" class="w-4 h-4 animate-spin " />
							<Save v-else class="w-4 h-4" />
							<span class="text-xs font-semibold">{{ __("Save Only") }}</span>
						</Button>
						<Button
							ref="submitBtn"
							class="h-[50%] flex flex-row  gap-1.5 rounded-2xl bg-foreground text-background p-3 hover:bg-foreground/90 justify-center items-center"
							:disabled="isSubmitting || !canSubmit"
							@click="submitPayment(true)"
						>
							<Loader2 v-if="isSubmitting && printAfterSave" class="w-4 h-4 animate-spin" />
							<Printer v-else class="w-4 h-4" />
							<span class="text-xs font-semibold">{{
								cartStore.isReturnMode ? __("Return & Print") : __("Save & Print")
							}}</span>
						</Button>
					</div>

					<div class="rounded-2xl border border-foreground bg-foreground text-background p-6 flex flex-col">
						<div class="flex items-start justify-between">
							<p class="text-xs font-semibold uppercase tracking-wider opacity-70">
								{{ cartStore.isReturnMode ? __("Refund Amount") : __("Amount Due") }}
							</p>
							<Badge v-if="remainingAmount > 0" variant="outline" class="text-[10px] border-background/40 text-background">
								{{ remainingLabel }}: {{ money(remainingAmount) }}
							</Badge>
							<Badge v-else-if="changeAmount > 0" variant="outline" class="text-[10px] border-background/40 text-background">
								{{ __("Change") }}: {{ formatWithSymbol(invoiceCurrency, changeAmount) }}
							</Badge>
						</div>
						<p class="text-5xl font-extrabold tabular-nums tracking-tight mt-2 mb-2">
							{{ money(Math.abs(cartStore.grandTotal)) }}
						</p>

						<div
							v-if="
								cartStore.calculatedTaxes.length > 0 ||
								cartStore.offerItemDiscountTotal > 0 ||
								cartStore.offerGrandTotalDiscountPct > 0 ||
								cartStore.appliedCoupon
							"
							class="mt-3 pt-3 border-t border-background/20 space-y-1"
						>
							<div class="flex items-center justify-between text-xs opacity-70">
								<span>{{ __("Subtotal") }}</span>
								<span>{{ money(cartStore.subtotal) }}</span>
							</div>
							<div
								v-for="(tax, idx) in cartStore.calculatedTaxes"
								:key="idx"
								class="flex items-center justify-between text-xs opacity-70"
							>
								<span class="flex items-center gap-1">
									{{ tax.description }}
									<span class="text-[10px]">({{ percent(tax.rate) }})</span>
									<span v-if="tax.included_in_print_rate" class="text-[9px]">{{ __("incl.") }}</span>
								</span>
								<span>{{ tax.included_in_print_rate ? "" : "+" }}{{ money(tax.amount) }}</span>
							</div>
							<div v-if="cartStore.offerItemDiscountTotal > 0" class="flex items-center justify-between text-xs">
								<span>{{ __("Offer Discount") }}</span>
								<span>-{{ money(cartStore.offerItemDiscountTotal) }}</span>
							</div>
							<div v-if="cartStore.offerGrandTotalDiscountPct > 0" class="flex items-center justify-between text-xs">
								<span>{{ __("Offer") }} ({{ percent(cartStore.offerGrandTotalDiscountPct) }})</span>
								<span>-{{ money(paymentOfferGrandDiscount) }}</span>
							</div>
							<div v-if="cartStore.appliedCoupon" class="flex items-center justify-between text-xs">
								<span>{{ __("Coupon") }}: {{ cartStore.appliedCoupon.coupon_code || cartStore.appliedCoupon.name }}</span>
								<span class="text-[10px]">{{ __("Applied") }}</span>
							</div>
						</div>

						<p v-if="outstandingSubmissionHint" class="mt-auto pt-3 text-[11px] opacity-70">
							{{ outstandingSubmissionHint }}
						</p>
					</div>
				</div>

				<!-- Row 2: tendered + suggestions strip (watchlist-style) -->
				<div class="rounded-2xl border border-border">
					<div class="flex items-stretch divide-x divide-border">
						<div class="flex items-center gap-2 px-3 py-2 shrink-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
							<DollarSign class="w-3.5 h-3.5" />
							{{ __("Tendered") }}
						</div>

						<div class="flex items-center px-2 py-1.5 shrink-0">
							<NumberInput
								ref="amountInput"
								v-model="tenderedAmount"
								:min="0"
								:precision="selectedPrecision"
								class="w-36 text-center font-bold rounded-xl border border-border"
								:select-on-focus="true"
								@keydown.enter.stop.prevent="handleAmountInputSubmit"
								@keydown.up.prevent="focusMethodByIndex"
								@keydown.down.prevent="focusFirstQuickAmount"
							/>
						</div>

						<div class="flex-1 flex items-stretch divide-x divide-border min-w-0">
							<template v-if="!isSplitPayment">
								<button
									v-for="(amount, idx) in quickAmounts"
									:key="amount"
									:ref="
										(el) => {
											if (el) quickAmountRefs[idx] = el as HTMLElement;
										}
									"
									class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold hover:bg-muted transition-colors"
									@click="setQuickAmount(amount)"
									@keydown.enter.prevent="setQuickAmount(amount)"
									@keydown.up.prevent="focusAmountInput"
									@keydown.down.prevent="focusSubmitBtn"
									@keydown.left.prevent="focusQuickAmount(idx - 1)"
									@keydown.right.prevent="focusQuickAmount(idx + 1)"
								>
									{{ formatWithSymbol(selectedCurrency, amount) }}
								</button>
							</template>

							<template v-else>
								<button
									class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-40"
									:disabled="!selectedMethod || tenderedAmount <= 0"
									@click="addSplitPayment"
								>
									<Plus class="w-3.5 h-3.5" />
									{{ __("Add") }} {{ selectedMethod }} &mdash; {{ formatWithSymbol(selectedCurrency, tenderedAmount) }}
								</button>
							</template>
						</div>

						<button
							v-if="cartStore.customer && !cartStore.isReturnMode && customerLoyaltyPoints > 0"
							class="flex items-center gap-1.5 px-3 py-2 shrink-0 text-xs font-semibold hover:bg-muted transition-colors"
							@click="
								cartStore.redeemLoyaltyPoints
									? null
									: showLoyaltyInput
										? cancelLoyaltyInput()
										: openLoyaltyInput()
							"
						>
							<Gift class="w-3.5 h-3.5" />
							{{ customerLoyaltyPoints }} {{ __("pts") }}
						</button>
					</div>

					<div
						v-if="hasForeignTenderMethods"
						class="px-3 py-1.5 border-t border-border h-11 overflow-hidden leading-tight"
					>
						<template v-if="selectedIsForeign">
							<p v-if="selectedRateMissing" class="text-xs font-medium text-destructive">
								{{ __("No exchange rate for {0}. Set today's rate before accepting it.", [selectedCurrency]) }}
							</p>
							<template v-else>
								<p class="text-xs text-muted-foreground">
									{{ formatWithSymbol(selectedCurrency, tenderedAmount) }} {{ __("at") }}
									{{ formatFor(invoiceCurrency, selectedRate) }} =
									<span class="font-semibold text-foreground">
										{{ formatWithSymbol(invoiceCurrency, convertToBase(selectedCurrency, invoiceCurrency, tenderedAmount, selectedRate)) }}
									</span>
								</p>
								<p class="text-xs text-muted-foreground">
									{{
										selectedRateIsStale
											? __("Rate is from {0} and has not been updated today.", [selectedRateDate])
											: __("Rate as of {0}", [selectedRateDate])
									}}
								</p>
							</template>
						</template>
					</div>

					<div v-if="isSplitPayment && splitPayments.length > 0" class="border-t border-border p-2 space-y-1.5">
						<div
							v-for="(sp, idx) in splitPayments"
							:key="sp.id"
							class="flex items-center justify-between border border-border rounded-xl px-3 py-2 text-sm"
						>
							<div class="flex items-center gap-2">
								<component :is="getMethodIcon(sp.mode_of_payment)" class="w-3.5 h-3.5" />
								<span class="font-semibold text-foreground">{{ sp.mode_of_payment }}</span>
							</div>
							<div class="flex items-center gap-2">
								<div class="text-right">
									<span class="font-bold text-foreground">{{ formatWithSymbol(sp.currency, sp.native_amount) }}</span>
									<span v-if="sp.currency !== invoiceCurrency" class="block text-xs text-muted-foreground">
										@ {{ formatFor(invoiceCurrency, sp.exchange_rate) }} = {{ formatWithSymbol(invoiceCurrency, sp.base_amount) }}
									</span>
								</div>
								<button @click="removeSplitPayment(idx)" class="text-muted-foreground hover:text-destructive">
									<X class="w-3.5 h-3.5" />
								</button>
							</div>
						</div>
						<div v-if="hasForeignTender" class="pt-1 space-y-0.5 px-3">
							<div v-for="group in tenderByCurrency" :key="group.currency" class="flex justify-between text-xs text-muted-foreground">
								<span>{{ formatWithSymbol(group.currency, group.native) }}</span>
								<span>{{ formatWithSymbol(invoiceCurrency, group.base) }}</span>
							</div>
						</div>
						<div class="flex justify-between text-sm font-semibold px-3 pt-1">
							<span class="text-muted-foreground">{{ __("Total Paid") }}</span>
							<span>{{ formatWithSymbol(invoiceCurrency, splitTotal) }}</span>
						</div>
					</div>

					<div v-if="showLoyaltyInput || cartStore.redeemLoyaltyPoints" class="border-t border-border p-3">
						<template v-if="cartStore.redeemLoyaltyPoints">
							<div class="flex items-center justify-between text-xs">
								<span class="text-foreground font-medium">
									{{ __("Redeeming") }}: {{ cartStore.loyaltyPoints }} {{ __("pts") }} = {{ money(cartStore.loyaltyAmount) }}
								</span>
								<Button
									variant="ghost"
									size="sm"
									class="h-6 px-2 text-[10px] text-destructive"
									@click="
										cartStore.clearLoyalty();
										showLoyaltyInput = false;
									"
								>
									{{ __("Remove") }}
								</Button>
							</div>
						</template>
						<template v-else>
							<div class="space-y-1.5">
								<div class="flex items-center gap-1.5">
									<NumberInput v-model="redeemPointsInput" :min="1" :max="maxRedeemablePoints" :precision="0" class="flex-1 text-sm" />
									<span class="text-xs text-muted-foreground shrink-0">/ {{ maxRedeemablePoints }} {{ __("pts") }}</span>
								</div>
								<p class="text-[11px] text-foreground">{{ __("Discount") }}: {{ money(redeemInputAmount) }}</p>
								<div class="flex gap-1.5">
									<Button
										variant="default"
										size="sm"
										class="flex-1 bg-foreground hover:bg-foreground/90 text-background text-xs"
										:disabled="redeemPointsInput < 1"
										@click="applyLoyalty"
									>
										{{ __("Apply") }}
									</Button>
									<Button variant="outline" size="sm" class="flex-1 text-xs" @click="cancelLoyaltyInput">
										{{ __("Cancel") }}
									</Button>
								</div>
							</div>
						</template>
					</div>
				</div>

				<!-- Row 3: numpad / change / method (allocation-style grid) -->
				<div class="grid grid-cols-1 lg:grid-cols-4 gap-3 lg:max-h-40">
					<div class="lg:col-span-2 rounded-2xl border border-border p-2.5 flex flex-col">
						<h3 class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
							{{ __("Numpad") }}
						</h3>
						<div class="grid grid-cols-3 gap-1.5 flex-1">
							<Button
								v-for="(key, idx) in numpadKeys"
								:key="key"
								:ref="
									(el) => {
										if (el) numpadRefs[idx] = (el as any).$el || el;
									}
								"
								variant="outline"
								class="text-sm font-semibold h-auto rounded-lg border-border active:scale-95 transition-transform"
								@click="handleNumpad(key)"
								@keydown.enter.prevent="handleNumpad(key)"
							>
								<Delete v-if="key === '⌫'" class="w-3.5 h-3.5" />
								<template v-else>{{ key }}</template>
							</Button>
						</div>
					</div>

					<div class="rounded-2xl border border-border p-2.5 flex flex-col gap-1.5 overflow-y-auto meerkatpos-scrollbar">
						<h3 class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
							{{ __("Change") }}
						</h3>
						<div>
							<p class="text-lg font-extrabold tabular-nums">
								{{ formatWithSymbol(invoiceCurrency, changeAmount) }}
							</p>
							<div class="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
								<div
									class="h-full bg-foreground"
									:style="{
										width:
											Math.min(
												100,
												(effectiveTendered / Math.max(Math.abs(cartStore.grandTotal), 0.01)) * 100,
											) + '%',
									}"
								/>
							</div>
						</div>

						<div v-if="remainingAmount > 0" class="text-xs">
							<p class="font-semibold text-foreground uppercase tracking-wider text-[10px] mb-0.5">
								{{ remainingLabel }}
							</p>
							<p class="text-lg font-bold tabular-nums">{{ money(remainingAmount) }}</p>
						</div>

						<div v-if="showChangeAllocator" class="space-y-2 pt-1 border-t border-border">
							<div
								v-for="(leg, idx) in changeLegs"
								:key="`${leg.mode_of_payment}-${idx}`"
								data-testid="change-leg"
								:data-mode="leg.mode_of_payment"
								:data-currency="leg.currency"
								class="border border-border rounded-xl px-2.5 py-2"
							>
								<div class="flex items-center gap-2">
									<component :is="getMethodIcon(leg.mode_of_payment)" class="w-3.5 h-3.5 shrink-0" />
									<span class="text-xs font-semibold text-foreground truncate flex-1">{{ leg.mode_of_payment }}</span>
									<NumberInput
										:model-value="leg.amount"
										:min="0"
										:precision="precisionFor(leg.currency)"
										class="w-24 text-right text-sm py-1 rounded-lg"
										data-testid="change-leg-input"
										@update:model-value="updateChangeLeg(idx, Number($event) || 0)"
									/>
									<button v-if="changeLegs.length > 1" @click="removeChangeLeg(idx)" class="text-muted-foreground hover:text-destructive">
										<X class="w-3.5 h-3.5" />
									</button>
								</div>
								<p v-if="leg.currency !== invoiceCurrency" class="pl-5 text-[10px] text-muted-foreground">
									@ {{ formatFor(invoiceCurrency, leg.exchange_rate) }} = {{ formatWithSymbol(invoiceCurrency, leg.base_amount) }}
								</p>
							</div>

							<div class="flex flex-wrap gap-1.5">
								<Button
									v-for="mode in posStore.cashTenderModes"
									:key="mode.mode_of_payment"
									variant="outline"
									size="sm"
									class="text-xs h-7 rounded-full border-border"
									data-testid="add-change-leg"
									:data-mode="mode.mode_of_payment"
									:disabled="changeRemaining <= 0"
									@click="addChangeLeg(mode.mode_of_payment)"
								>
									<Plus class="w-3 h-3" />
									{{ mode.mode_of_payment }}
									<span v-if="changeRemaining > 0" class="text-muted-foreground">
										{{ formatWithSymbol(mode.pos_tender_currency, changeRemainingIn(mode.pos_tender_currency)) }}
									</span>
								</Button>
							</div>

							<p v-if="!changeAllocationValid" class="text-xs font-medium text-destructive tabular-nums">
								{{ __("{0} of change is still unallocated", [formatWithSymbol(invoiceCurrency, changeRemaining)]) }}
							</p>
						</div>
					</div>

					<div class="rounded-2xl border border-border p-2.5 flex flex-col gap-1.5 overflow-y-auto meerkatpos-scrollbar">
						<div class="flex items-center justify-between">
							<h3 class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
								{{ __("Method") }}
							</h3>
							<div class="flex items-center gap-1">
								<kbd class="px-1 py-0.5 text-[9px] font-mono text-muted-foreground bg-muted rounded border border-border">&larr;</kbd>
								<kbd class="px-1 py-0.5 text-[9px] font-mono text-muted-foreground bg-muted rounded border border-border">&rarr;</kbd>
							</div>
						</div>
						<div class="space-y-1 flex justify-around items-center h-1/2 flex-col">
							<button
								v-for="(method, idx) in availableMethods"
								:key="method.mode_of_payment"
								:ref="
									(el) => {
										if (el) methodRefs[idx] = el as HTMLButtonElement;
									}
								"
								data-testid="payment-method"
								:data-mode="method.mode_of_payment"
								@click="selectMethod(method.mode_of_payment)"
								@keydown.left.prevent="focusMethod(idx - 1)"
								@keydown.right.prevent="focusMethod(idx + 1)"
								@keydown.down.prevent="focusAmountInput"
								class="w-3/4 h-1/2 flex items-center gap-2 p-1.5 rounded-lg border text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
								:class="
									selectedMethod === method.mode_of_payment
										? 'border-foreground bg-foreground text-background'
										: 'border-border text-foreground hover:bg-muted'
								"
							>
								<component :is="getMethodIcon(method.mode_of_payment)" class="w-3.5 h-3.5 shrink-0" />
								<span class="text-xs font-semibold truncate flex-1">{{ method.mode_of_payment }}</span>
								<Check v-if="selectedMethod === method.mode_of_payment" class="w-3.5 h-3.5 shrink-0" />
							</button>
						</div>

						<div v-if="posStore.allowWriteOffChange && !cartStore.isReturnMode" class="space-y-1 pt-1 border-t border-border">
							<label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
								{{ __("Write Off") }}
							</label>
							<NumberInput
								v-model="writeOffInput"
								:min="0"
								:precision="moneyPrecision"
								placeholder="0.00"
								class="text-sm"
								@change="cartStore.writeOffAmount = writeOffInput || 0"
							/>
						</div>

						<div class="space-y-1 pt-1 border-t border-border mt-auto">
							<div class="flex items-center justify-between">
								<label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
									{{ __("Posting Date") }}
								</label>
								<span v-if="!posStore.allowChangePostingDate" class="text-[10px] text-muted-foreground">
									{{ __("Locked") }}
								</span>
							</div>
							<DateTimePicker
								v-model="cartStore.postingDate"
								mode="date"
								:disabled="!posStore.allowChangePostingDate"
								:clearable="false"
								placeholder="Posting date"
								class="text-sm"
							/>
						</div>
					</div>
				</div>
			</div>

			<div class="shrink-0 border-t border-border px-6 py-2.5 flex justify-center">
				<div class="hidden sm:flex items-center gap-2 text-[10px] text-muted-foreground">
					<kbd class="px-1.5 py-0.5 font-mono bg-muted rounded border border-border">Enter</kbd>
					<span>{{ __("Save & Print") }}</span>
					<span class="mx-1">|</span>
					<kbd class="px-1.5 py-0.5 font-mono bg-muted rounded border border-border">Ctrl+Enter</kbd>
					<span>{{ __("Save Only") }}</span>
					<span class="mx-1">|</span>
					<kbd class="px-1.5 py-0.5 font-mono bg-muted rounded border border-border">Esc</kbd>
					<span>{{ __("Cancel") }}</span>
				</div>
			</div>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useMoney } from "@/composables/useMoney";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import { usePaymentStore } from "@/stores/paymentStore";
import { call, showSuccess, showError, showInfo, isNetworkError } from "@/services/api";
import { useOfflineStore } from "@/stores/offlineStore";
import { __ } from "@/lib/translate";
import { usePrintInvoice } from "@/composables/usePrintInvoice";
import { isElectron } from "@/services/electronBridge";
import { fiscalizeViaLocalService } from "@/services/fbrLocalService";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { NumberInput } from "@/components/ui/number-input";
import { Badge } from "@/components/ui/badge";
import {
	Wallet,
	X,
	Check,
	Loader2,
	Delete,
	Gift,
	RotateCcw,
	Plus,
	Save,
	Printer,
	Banknote,
	CreditCard,
	Landmark,
	Smartphone,
	FileText,
	DollarSign,
} from "lucide-vue-next";

import {
	convertToBase,
	formatFor,
	formatWithSymbol,
	precisionFor,
	roundFor,
} from "@/composables/useCurrency";
import {
	buildChangeLeg,
	buildTenderLeg,
	changeBaseTotal,
	changeRemaining as remainingChange,
	groupTenderByCurrency,
	isChangeAllocationValid,
	mergeTenderLeg,
	negateForReturn,
	remainingIn,
	tenderBaseTotal,
	toInvoicePayments,
	type TenderContext,
} from "@/services/tenderLegs";
import type { InvoiceChangeLeg, InvoiceData, InvoicePayment, TenderLeg } from "@/types/pos.types";
import { isOnline, extractErrorMessage, isTabConflictError } from "@/utils";
import { nowDate } from "@/utils/datetime";
import {
	isPaymentDialogSaveAndPrintShortcut,
	isPaymentDialogSaveOnlyShortcut,
} from "@/components/dialogs/paymentDialogShortcuts";

const posStore = usePosStore();
const { moneyPrecision, percent } = useMoney();
const { printInvoice, printInvoiceLocal } = usePrintInvoice();
const cartStore = useCartStore();
const authStore = useAuthStore();
const paymentStore = usePaymentStore();
const offlineStore = useOfflineStore();

const amountInput = ref<InstanceType<typeof NumberInput> | null>(null);
const submitBtn = ref<InstanceType<typeof Button> | null>(null);
const methodRefs: Record<number, HTMLButtonElement> = {};
const quickAmountRefs: Record<number, HTMLElement> = {};
const numpadRefs: Record<number, HTMLElement> = {};

const selectedMethod = ref("");
const tenderedAmount = ref(0);
const isSubmitting = ref(false);
const writeOffInput = ref(0);
const printAfterSave = ref(false);

const isSplitPayment = ref(false);
const splitPayments = ref<TenderLeg[]>([]);

const changeLegs = ref<InvoiceChangeLeg[]>([]);
const changeTouched = ref(false);

const customerLoyaltyPoints = ref(0);
const customerLoyaltyAmount = ref(0);
const customerConversionFactor = ref(1);
const customerBalance = ref<number | null>(null);
const customerCreditLimit = ref(0);

const showLoyaltyInput = ref(false);
const redeemPointsInput = ref(0);

const numpadKeys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "C", "0", "⌫"];

const availableMethods = computed(() => {
	const methods = posStore.paymentMethods;
	if (methods.length > 0) return methods;
	return [{ mode_of_payment: "Cash" }, { mode_of_payment: "Card" }];
});

const quickAmounts = computed(() => {
	const totalBase = Math.abs(cartStore.grandTotal);
	const rate = selectedRate.value || 1;
	const total = selectedIsForeign.value && rate ? totalBase / rate : totalBase;
	const amounts: number[] = [];
	const rounded = Math.ceil(total);
	amounts.push(rounded);
	amounts.push(Math.ceil(total / 10) * 10);
	amounts.push(Math.ceil(total / 50) * 50);
	amounts.push(Math.ceil(total / 100) * 100);
	return [...new Set(amounts)].sort((a, b) => a - b).slice(0, 4);
});

const invoiceCurrency = computed(() => posStore.invoiceCurrency || posStore.currency || "");

const hasForeignTenderMethods = computed(() =>
	availableMethods.value.some(
		(m) => (posStore.tenderCurrencyFor(m.mode_of_payment) || invoiceCurrency.value) !== invoiceCurrency.value,
	),
);

const selectedCurrency = computed(
	() => posStore.tenderCurrencyFor(selectedMethod.value) || invoiceCurrency.value,
);
const selectedRate = computed(() => posStore.tenderRateFor(selectedMethod.value));
const selectedPrecision = computed(() => precisionFor(selectedCurrency.value));
const selectedIsForeign = computed(() => selectedCurrency.value !== invoiceCurrency.value);
const selectedRateDate = computed(() => posStore.tenderModeFor(selectedMethod.value)?.rate_date || "");

const selectedRateIsStale = computed(
	() => selectedIsForeign.value && !!selectedRateDate.value && selectedRateDate.value < nowDate(),
);
const selectedRateMissing = computed(() => selectedIsForeign.value && !selectedRate.value);

const tenderContext = computed<TenderContext>(() => ({
	invoiceCurrency: invoiceCurrency.value,
	modeInfo: (mode: string) => posStore.tenderModeFor(mode),
}));

function buildLeg(mode: string, nativeAmount: number, id?: string): TenderLeg {
	return buildTenderLeg(mode, nativeAmount, tenderContext.value, id);
}

const activeLegs = computed<TenderLeg[]>(() => {
	if (isSplitPayment.value) return splitPayments.value;
	if (!selectedMethod.value || tenderedAmount.value <= 0) return [];
	return [buildLeg(selectedMethod.value, tenderedAmount.value, "single")];
});

const splitTotal = computed(() => tenderBaseTotal(splitPayments.value, invoiceCurrency.value));
const legsBaseTotal = computed(() => tenderBaseTotal(activeLegs.value, invoiceCurrency.value));

const tenderByCurrency = computed(() => groupTenderByCurrency(activeLegs.value, invoiceCurrency.value));

const hasForeignTender = computed(() =>
	activeLegs.value.some((leg) => leg.currency !== invoiceCurrency.value),
);

const maxRedeemablePoints = computed(() => {
	const total = Math.abs(cartStore.grandTotal);
	const conversionFactor = customerConversionFactor.value || 1;
	const maxByTotal = Math.floor(total / conversionFactor);
	return Math.min(customerLoyaltyPoints.value, maxByTotal);
});

const redeemInputAmount = computed(() => {
	return redeemPointsInput.value * (customerConversionFactor.value || 1);
});

const paymentOfferGrandDiscount = computed(() => {
	if (cartStore.offerGrandTotalDiscountPct <= 0) return 0;
	const taxAmt = cartStore.calculatedTaxes
		.filter((t) => !t.included_in_print_rate)
		.reduce((s, t) => s + t.amount, 0);
	const base = cartStore.subtotal + taxAmt - cartStore.offerItemDiscountTotal;
	return (base * cartStore.offerGrandTotalDiscountPct) / 100;
});

const effectiveTendered = computed(() => legsBaseTotal.value);

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

const hasRecordedPayment = computed(() => roundCurrency(effectiveTendered.value) > 0);

const defaultChangeMode = computed(() => {
	const modes = posStore.cashTenderModes;
	const configured = modes.find((mode) => mode.mode_of_payment === posStore.cashModeOfPayment);
	if (configured) return configured.mode_of_payment;
	const inInvoiceCurrency = modes.find((mode) => mode.pos_tender_currency === invoiceCurrency.value);
	return (inInvoiceCurrency || modes[0])?.mode_of_payment || posStore.cashModeOfPayment;
});

function buildChangeLegFor(mode: string, nativeAmount: number): InvoiceChangeLeg {
	return buildChangeLeg(mode, nativeAmount, tenderContext.value);
}

const changeAllocatedBase = computed(() => changeBaseTotal(changeLegs.value, invoiceCurrency.value));

const changeRemaining = computed(() =>
	remainingChange(changeAmount.value, changeLegs.value, invoiceCurrency.value),
);

const changeAllocationValid = computed(() =>
	isChangeAllocationValid(changeAmount.value, changeLegs.value, invoiceCurrency.value),
);

const showChangeAllocator = computed(
	() => changeAmount.value > 0 && posStore.allowMixedCurrencyTender && !cartStore.isReturnMode,
);

watch(
	changeAmount,
	(amount) => {
		if (amount <= 0 || cartStore.isReturnMode) {
			changeLegs.value = [];
			changeTouched.value = false;
			return;
		}
		if (!changeTouched.value) {
			changeLegs.value = [buildChangeLegFor(defaultChangeMode.value, amount)];
		}
	},
	{ immediate: true },
);

function addChangeLeg(mode: string) {
	const native = changeRemainingIn(posStore.tenderCurrencyFor(mode));
	changeTouched.value = true;
	changeLegs.value.push(buildChangeLegFor(mode, native));
}

function updateChangeLeg(index: number, nativeAmount: number) {
	const leg = changeLegs.value[index];
	if (!leg) return;
	changeTouched.value = true;
	changeLegs.value[index] = buildChangeLegFor(leg.mode_of_payment, nativeAmount);
}

function removeChangeLeg(index: number) {
	changeTouched.value = true;
	changeLegs.value.splice(index, 1);
}

function changeRemainingIn(currency: string): number {
	const mode = posStore.cashTenderModes.find((m) => m.pos_tender_currency === currency);
	return remainingIn(changeRemaining.value, currency, invoiceCurrency.value, mode?.exchange_rate || 0);
}

const canSubmitOutstanding = computed(() => {
	if (cartStore.isReturnMode || remainingAmount.value <= 0) return false;
	if (posStore.allowCreditSale) return true;
	return hasRecordedPayment.value && posStore.allowPartialPayment;
});

const remainingLabel = computed(() => {
	return canSubmitOutstanding.value ? __("Outstanding After Save") : __("Remaining");
});

const outstandingSubmissionHint = computed(() => {
	if (!canSubmitOutstanding.value) return "";
	if (posStore.allowCreditSale) {
		return __("Invoice will be submitted with an outstanding credit balance.");
	}
	return __("Invoice will be submitted with a partial payment.");
});

const canSubmit = computed(() => {
	if (cartStore.isEmpty) return false;
	if (selectedRateMissing.value) return false;
	const total = roundCurrency(Math.abs(cartStore.grandTotal));
	if (total <= 0) return true;
	if (remainingAmount.value > 0) {
		return canSubmitOutstanding.value;
	}
	if (!changeAllocationValid.value) return false;
	if (!isSplitPayment.value && !selectedMethod.value) return false;
	return roundCurrency(effectiveTendered.value) >= total;
});

onMounted(async () => {
	if (!posStore.allowChangePostingDate || !cartStore.postingDate) {
		cartStore.postingDate = nowDate();
	}

	tenderedAmount.value = roundCurrency(Math.abs(cartStore.grandTotal));
	if (availableMethods.value.length > 0) {
		selectedMethod.value = availableMethods.value[0].mode_of_payment;
	}
	nextTick(() => {
		amountInput.value?.focus();
	});

	if (cartStore.customer) {
		try {
			const credit = await paymentStore.fetchAvailableCredit(
				cartStore.customer.name,
				posStore.companyName,
			);
			if (credit) {
				customerLoyaltyPoints.value = credit.loyalty_points || 0;
				customerLoyaltyAmount.value = credit.loyalty_amount || 0;
			}
		} catch {
			/* ignore */
		}

		try {
			const info = await call<{
				balance?: number;
				credit_limit?: number;
				loyalty_points?: number;
				loyalty_program?: { conversion_factor?: number };
			}>("xpos.api.customers.get_customer_info", { customer: cartStore.customer.name });
			if (info) {
				customerBalance.value = info.balance ?? null;
				customerCreditLimit.value = info.credit_limit ?? 0;
				if ((info.loyalty_points ?? 0) > 0) {
					const conversionFactor = info.loyalty_program?.conversion_factor || 1;
					customerLoyaltyPoints.value = info.loyalty_points!;
					customerConversionFactor.value = conversionFactor;
					customerLoyaltyAmount.value = info.loyalty_points! * conversionFactor;
				}
			}
		} catch {
			/* non-critical */
		}
	}

	document.addEventListener("keydown", handleGlobalKeydown);
});

watch(
	() => cartStore.loyaltyAmount,
	() => {
		if (!isSplitPayment.value) {
			const newTotal = roundCurrency(Math.abs(cartStore.grandTotal));
			tenderedAmount.value = newTotal;
			nextTick(() => {
				amountInput.value?.setValue(newTotal);
			});
		}
	},
);

onUnmounted(() => {
	document.removeEventListener("keydown", handleGlobalKeydown);
});

function handleAmountInputSubmit(event: KeyboardEvent) {
	if (isSubmitting.value) return;

	if (isPaymentDialogSaveOnlyShortcut(event)) {
		if (canSubmit.value) {
			submitPayment(false);
		}
		return;
	}

	if (isSplitPayment.value) {
		addSplitPayment();
		return;
	}

	if (isPaymentDialogSaveAndPrintShortcut(event) && canSubmit.value) {
		submitPayment(true);
	}
}

function handleGlobalKeydown(e: KeyboardEvent) {
	if (!cartStore.showPaymentDialog || isSubmitting.value) return;

	if (isPaymentDialogSaveOnlyShortcut(e) && canSubmit.value) {
		e.preventDefault();
		e.stopPropagation();
		submitPayment(false);
		return;
	}

	if (isPaymentDialogSaveAndPrintShortcut(e) && canSubmit.value) {
		const target = e.target as HTMLElement;
		if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
		e.preventDefault();
		e.stopPropagation();
		submitPayment(true);
	}
}

function focusMethod(idx: number) {
	const methods = availableMethods.value;
	const clamped = Math.max(0, Math.min(idx, methods.length - 1));
	methodRefs[clamped]?.focus();
	selectMethod(methods[clamped].mode_of_payment);
}

function focusMethodByIndex() {
	const currentIdx = availableMethods.value.findIndex((m) => m.mode_of_payment === selectedMethod.value);
	focusMethod(currentIdx >= 0 ? currentIdx : 0);
}

function focusAmountInput() {
	amountInput.value?.focus();
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

function selectMethod(method: string) {
	selectedMethod.value = method;
}

function setQuickAmount(amount: number) {
	const rounded = roundFor(selectedCurrency.value, amount);
	tenderedAmount.value = rounded;
	setTimeout(() => {
		amountInput.value?.setValue(rounded);
	});
	focusAmountInput();
}

function enableSplitPayment() {
	isSplitPayment.value = true;
	splitPayments.value = [];
	tenderedAmount.value = 0;
}

function refillTenderRemainder() {
	const owed = Math.max(0, roundCurrency(Math.abs(cartStore.grandTotal) - splitTotal.value));
	const rate = posStore.tenderRateFor(selectedMethod.value) || 1;
	tenderedAmount.value = roundFor(selectedCurrency.value, owed / rate);
}

function addSplitPayment() {
	if (!selectedMethod.value || tenderedAmount.value <= 0) return;
	const leg = buildLeg(selectedMethod.value, tenderedAmount.value);
	mergeTenderLeg(splitPayments.value, leg, tenderContext.value);
	refillTenderRemainder();
}

function removeSplitPayment(idx: number) {
	splitPayments.value.splice(idx, 1);
	refillTenderRemainder();
}

watch(selectedCurrency, (next, prev) => {
	if (!prev || next === prev) return;
	refillTenderRemainder();
});

function openLoyaltyInput() {
	if (maxRedeemablePoints.value <= 0) {
		showInfo(__("No redeemable loyalty points for this invoice total"));
		return;
	}
	redeemPointsInput.value = maxRedeemablePoints.value;
	showLoyaltyInput.value = true;
}

function applyLoyalty() {
	const maxPoints = maxRedeemablePoints.value;
	if (maxPoints <= 0) return;

	const points = Math.min(Math.max(Number(redeemPointsInput.value) || 0, 1), maxPoints);
	const amount = roundCurrency(points * (customerConversionFactor.value || 1));
	if (amount <= 0) return;

	cartStore.setLoyalty(points, amount);
	if (!isSplitPayment.value) {
		const newTotal = roundCurrency(Math.abs(cartStore.grandTotal));
		tenderedAmount.value = newTotal;
		nextTick(() => {
			amountInput.value?.setValue(newTotal);
		});
	}
	showLoyaltyInput.value = false;
}

function cancelLoyaltyInput() {
	showLoyaltyInput.value = false;
}

function getMethodIcon(method: string) {
	const lower = method.toLowerCase();
	if (lower.includes("cash")) return Banknote;
	if (lower.includes("card") || lower.includes("credit") || lower.includes("debit")) return CreditCard;
	if (lower.includes("bank") || lower.includes("transfer")) return Landmark;
	if (lower.includes("mobile") || lower.includes("wallet")) return Smartphone;
	if (lower.includes("check") || lower.includes("cheque")) return FileText;
	return DollarSign;
}

function handleNumpad(key: string) {
	const current = String(tenderedAmount.value || "");
	if (key === "C") {
		tenderedAmount.value = 0;
		return;
	}
	const next = key === "⌫" ? parseFloat(current.slice(0, -1)) : parseFloat(current + key);
	tenderedAmount.value = roundFor(selectedCurrency.value, next || 0);
}

function validateForSubmission(): { valid: boolean; message?: string } {
	if (cartStore.isEmpty) {
		return { valid: false, message: __("Cart is empty") };
	}

	if (!cartStore.customer?.name) {
		return { valid: false, message: __("Customer is required") };
	}

	if (cartStore.isReturnMode) {
		if (!cartStore.returnAgainst) {
			return { valid: false, message: __("Return against invoice is required for returns") };
		}

		const invalidItems = cartStore.items.filter((item) => item.qty >= 0);
		if (invalidItems.length > 0) {
			return { valid: false, message: __("Return items must have negative quantities") };
		}

		if (cartStore.grandTotal >= 0) {
			return { valid: false, message: __("Return total must be negative (refund amount)") };
		}
	} else {
		const invalidItems = cartStore.items.filter((item) => item.qty <= 0);
		if (invalidItems.length > 0) {
			return { valid: false, message: __("All items must have positive quantities") };
		}
	}

	if (selectedRateMissing.value) {
		return {
			valid: false,
			message: __("No exchange rate is available for {0}. Set today's rate before accepting it.", [
				selectedCurrency.value,
			]),
		};
	}

	if (!cartStore.isReturnMode && remainingAmount.value > 0 && !canSubmitOutstanding.value) {
		return {
			valid: false,
			message: __("Tendered {0} covers {1}. {2} is still due.", [
				formatWithSymbol(invoiceCurrency.value, effectiveTendered.value),
				formatWithSymbol(invoiceCurrency.value, Math.abs(cartStore.grandTotal)),
				formatWithSymbol(invoiceCurrency.value, remainingAmount.value),
			]),
		};
	}

	if (!changeAllocationValid.value) {
		return {
			valid: false,
			message: __("Change of {0} is not fully allocated. {1} is unaccounted for.", [
				formatWithSymbol(invoiceCurrency.value, changeAmount.value),
				formatWithSymbol(invoiceCurrency.value, changeRemaining.value),
			]),
		};
	}

	return { valid: true };
}

function buildSubmissionPayments(): InvoicePayment[] {
	return toInvoicePayments(activeLegs.value, invoiceCurrency.value);
}

function buildInvoicePayload(): InvoiceData {
	const shiftName = posStore.posOpeningShift?.name || "";
	const payments = cartStore.isReturnMode
		? negateForReturn(buildSubmissionPayments())
		: buildSubmissionPayments();

	cartStore.setPayments(payments);
	cartStore.setChangeAmount(cartStore.isReturnMode ? 0 : changeAmount.value);
	cartStore.setChangeLegs(cartStore.isReturnMode ? [] : changeLegs.value.filter((leg) => leg.amount > 0));

	const invoiceData = cartStore.getInvoiceData(posStore.profileName, shiftName);

	if (!cartStore.isReturnMode && remainingAmount.value > 0 && posStore.allowCreditSale) {
		invoiceData.is_credit_sale = true;
	}

	return invoiceData;
}

async function submitPayment(withPrint: boolean = true) {
	if (isSubmitting.value) return;

	if (showLoyaltyInput.value && !cartStore.redeemLoyaltyPoints && (redeemPointsInput.value || 0) > 0) {
		applyLoyalty();
	}

	if (!canSubmit.value) return;

	const validation = validateForSubmission();
	if (!validation.valid) {
		showError(validation.message || "Validation failed");
		return;
	}

	const stockCheck = await cartStore.revalidateStock();
	if (!stockCheck.valid) {
		showError(stockCheck.messages.join("\n"));
		return;
	}

	isSubmitting.value = true;
	printAfterSave.value = withPrint;

	try {
		const shiftName = posStore.posOpeningShift?.name || "";
		const invoiceData = buildInvoicePayload();

		if (isElectron() && window.electronAPI?.db) {
			const result = await window.electronAPI.db.addPendingInvoice({
				data: {
					...invoiceData,
					pos_opening_shift_local_id: shiftName,
					is_draft: false,
					is_return: cartStore.isReturnMode,
					receipt: cartStore.getReceiptSnapshot("", authStore.userFullName),
				},
				customer_name: cartStore.customerName,
				grand_total: cartStore.grandTotal,
			});

			const localId = result.id;
			posStore.lastInvoiceName = `LOCAL-${localId}`;

			if (cartStore.isReturnMode) {
				showSuccess(
					__("Return saved locally (#{0}). It will sync to server automatically.", [localId]),
				);
			} else {
				showSuccess(
					__("Invoice saved locally (#{0}). It will sync to server automatically.", [localId]),
				);
			}

			if (withPrint && localId && window.electronAPI?.print) {
				await printInvoiceLocal(localId);
			}

			cartStore.clearAll();
			return;
		}

		if (!isOnline()) {
			const result = await offlineStore.saveOffline(
				invoiceData,
				cartStore.customerName,
				cartStore.grandTotal,
				cartStore.getStockReservations(),
			);
			if (result.success) {
				showInfo(
					__(`Invoice saved offline (#${result.localId}). It will sync when you're back online.`),
				);
				cartStore.clearAll();
			} else {
				showError(__("Failed to save invoice offline"));
			}
			return;
		}
		let result = await call<CreateInvoiceResult>("xpos.api.invoices.create_invoice", {
			data: JSON.stringify(invoiceData),
		});
		if (result.status === "fbr_local_required") {
			result = await finalizeWithLocalFbr(result);
		}

		posStore.lastInvoiceName = result.name;

		if (cartStore.isReturnMode) {
			showSuccess(__("Return {0} saved successfully!", [result.name]));
		} else {
			showSuccess(__("Invoice {0} saved successfully!", [result.name]));
		}

		if (withPrint && result.name) {
			await printInvoice(result.name);
		}

		cartStore.clearAll();
	} catch (error: unknown) {
		if (isTabConflictError(error)) {
			showError(__("This tab was changed on another terminal. Reload it and try again."));
			close();
			cartStore.openDraftDialog();
		} else if (isNetworkError(error)) {
			const invoiceData = buildInvoicePayload();
			const result = await offlineStore.saveOffline(
				invoiceData,
				cartStore.customerName,
				cartStore.grandTotal,
				cartStore.getStockReservations(),
			);
			if (result.success) {
				showInfo(
					__(`Invoice saved offline (#${result.localId}). It will sync when you're back online.`),
				);
				cartStore.clearAll();
				return;
			}
			showError(__("You are offline. Invoice could not be saved locally."));
		} else {
			showError(__("Payment failed: {0}", [extractErrorMessage(error)]));
		}
		console.error("Payment error:", error);
	} finally {
		isSubmitting.value = false;
		printAfterSave.value = false;
	}
}

interface CreateInvoiceResult {
	name: string;
	status?: string;
	doctype?: string;
	fbr_payload?: Record<string, unknown>;
	fbr_local_service_url?: string;
}

async function finalizeWithLocalFbr(pending: CreateInvoiceResult): Promise<CreateInvoiceResult> {
	try {
		const { invoiceNumber } = await fiscalizeViaLocalService(
			pending.fbr_payload || {},
			pending.fbr_local_service_url || "",
		);
		return await call<CreateInvoiceResult>("xpos.api.invoices.finalize_fiscal_invoice", {
			name: pending.name,
			fbr_invoice_number: invoiceNumber,
			doctype: pending.doctype,
		});
	} catch (err) {
		await call("xpos.api.invoices.discard_draft_invoice", {
			name: pending.name,
			doctype: pending.doctype,
		}).catch(() => {
			/* best-effort cleanup */
		});
		throw new Error(
			__("FBR fiscalization failed — both the FBR cloud and the local service are unavailable.") +
				" " +
				extractErrorMessage(err),
		);
	}
}

function close() {
	cartStore.closePaymentDialog();
}

function roundCurrency(value: number): number {
	return roundFor(invoiceCurrency.value, value);
}

function formatPrice(price: number | string) {
	return formatFor(invoiceCurrency.value, parseFloat(String(price) || "0"));
}

/** The same amount with the currency symbol, on the side the Currency doctype asks for. */
function money(price: number | string) {
	return formatWithSymbol(invoiceCurrency.value, parseFloat(String(price) || "0"));
}
</script>
