<template>
	<transition name="fade">
		<div class="xpos-overlay" @click.self="close">
			<div class="xpos-dialog xpos-dialog-lg flex flex-col max-h-[85vh]">
				<!-- Header -->
				<div class="shrink-0 flex items-center justify-between p-5 pb-4 border-b border-surface-100">
					<div>
						<h2 class="text-lg font-bold text-surface-800">Close Shift</h2>
						<p class="text-sm text-surface-400 mt-0.5">Review and reconcile your shift</p>
					</div>
					<button @click="close" class="xpos-btn-icon">
						<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<div class="flex-1 overflow-y-auto p-5 space-y-5 xpos-scrollbar">
					<!-- Loading -->
					<div v-if="isLoading" class="flex items-center justify-center py-12">
						<div class="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
					</div>

					<template v-else-if="summary">
						<!-- Shift Summary Cards -->
						<div class="grid grid-cols-3 gap-3">
							<div class="bg-primary-50 rounded-xl p-4 text-center">
								<p class="text-xs font-medium text-primary-500 mb-1">Total Invoices</p>
								<p class="text-2xl font-extrabold text-primary-700">{{ summary.total_invoices }}</p>
							</div>
							<div class="bg-emerald-50 rounded-xl p-4 text-center">
								<p class="text-xs font-medium text-emerald-500 mb-1">Grand Total</p>
								<p class="text-2xl font-extrabold text-emerald-700">
								{{ posStore.currencySymbol }}{{ formatPrice(summary.grand_total ?? 0) }}
								</p>
							</div>
							<div class="bg-blue-50 rounded-xl p-4 text-center">
								<p class="text-xs font-medium text-blue-500 mb-1">Net Total</p>
								<p class="text-2xl font-extrabold text-blue-700">
								{{ posStore.currencySymbol }}{{ formatPrice(summary.net_total ?? 0) }}
								</p>
							</div>
						</div>

						<!-- Payment Reconciliation -->
						<div>
							<h3 class="text-sm font-semibold text-surface-700 mb-3">Payment Reconciliation</h3>
							<div class="border border-surface-200 rounded-xl overflow-hidden">
								<table class="w-full text-sm">
									<thead class="bg-surface-50">
										<tr>
											<th class="text-left px-4 py-2.5 text-surface-500 font-medium">Method</th>
											<th class="text-right px-4 py-2.5 text-surface-500 font-medium">Opening</th>
											<th class="text-right px-4 py-2.5 text-surface-500 font-medium">Expected</th>
											<th class="text-right px-4 py-2.5 text-surface-500 font-medium">Closing</th>
											<th class="text-right px-4 py-2.5 text-surface-500 font-medium">Diff</th>
										</tr>
									</thead>
									<tbody>
										<tr
											v-for="(detail, index) in closingDetails"
											:key="detail.mode_of_payment"
											class="border-t border-surface-100"
										>
											<td class="px-4 py-2.5 font-medium text-surface-700">{{ detail.mode_of_payment }}</td>
											<td class="px-4 py-2.5 text-right text-surface-600">
												{{ formatPrice(detail.opening_amount) }}
											</td>
											<td class="px-4 py-2.5 text-right text-surface-600">
												{{ formatPrice(detail.expected_amount) }}
											</td>
											<td class="px-4 py-2.5 text-right">
												<input
													v-model.number="closingDetails[index].closing_amount"
													type="number"
													min="0"
													step="0.01"
													class="w-28 text-right xpos-input py-1 text-sm"
													@input="calculateDifference(index)"
												/>
											</td>
											<td
												class="px-4 py-2.5 text-right font-bold"
												:class="detail.difference >= 0 ? 'text-emerald-600' : 'text-red-600'"
											>
												{{ detail.difference >= 0 ? '+' : '' }}{{ formatPrice(detail.difference) }}
											</td>
										</tr>
									</tbody>
								</table>
							</div>
						</div>
					</template>
				</div>

				<!-- Footer -->
				<div class="shrink-0 p-5 pt-4 border-t border-surface-100 flex gap-3">
					<button @click="close" class="xpos-btn-secondary flex-1">Cancel</button>
					<button
						@click="handleCloseShift"
						:disabled="isClosing"
						class="xpos-btn-danger flex-1 font-bold"
					>
						<span v-if="isClosing" class="flex items-center justify-center gap-2">
							<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Closing...
						</span>
						<span v-else>Close Shift</span>
					</button>
				</div>
			</div>
		</div>
	</transition>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { usePosStore } from "@/stores/posStore";
import { showSuccess, showError } from "@/services/api";

interface ClosingSummary {
	total_invoices?: number;
	grand_total?: number;
	net_total?: number;
	payment_summary?: Record<string, number>;
	opening_balances?: Record<string, number>;
	[key: string]: unknown;
}

interface ClosingDetail {
	mode_of_payment: string;
	opening_amount: number;
	expected_amount: number;
	closing_amount: number;
	difference: number;
}

const posStore = usePosStore();

const isLoading = ref(true);
const isClosing = ref(false);
const summary = ref<ClosingSummary | null>(null);
const closingDetails = ref<ClosingDetail[]>([]);

onMounted(async () => {
	try {
		const data = await posStore.fetchClosingData() as ClosingSummary | undefined;
		summary.value = data || null;

		// Build closing details from payment summary
		if (data) {
			const methods = Object.keys(data.payment_summary || {});
			const openingBalances = (data.opening_balances || {}) as Record<string, number>;

			if (methods.length === 0) {
				// If no sales, show opening balance methods
				const openMethods = Object.keys(openingBalances);
				if (openMethods.length > 0) {
					closingDetails.value = openMethods.map((m) => ({
						mode_of_payment: m,
						opening_amount: openingBalances[m] || 0,
						expected_amount: openingBalances[m] || 0,
						closing_amount: openingBalances[m] || 0,
						difference: 0,
					}));
				} else {
					closingDetails.value = [{
						mode_of_payment: "Cash",
						opening_amount: 0,
						expected_amount: 0,
						closing_amount: 0,
						difference: 0,
					}];
				}
			} else {
				const paymentSummary = (data.payment_summary || {}) as Record<string, number>;
				closingDetails.value = methods.map((m) => {
					const opening = openingBalances[m] || 0;
					const sales = paymentSummary[m] || 0;
					const expected = opening + sales;
					return {
						mode_of_payment: m,
						opening_amount: opening,
						expected_amount: expected,
						closing_amount: expected,
						difference: 0,
					};
				});
			}
		}
	} catch (error) {
		showError("Failed to load shift data");
	} finally {
		isLoading.value = false;
	}
});

function calculateDifference(index: number) {
	const detail = closingDetails.value[index];
	detail.difference = (detail.closing_amount || 0) - detail.expected_amount;
}

async function handleCloseShift() {
	if (isClosing.value) return;
	isClosing.value = true;

	try {
		await posStore.closeShift(closingDetails.value);
		showSuccess("Shift closed successfully!");
	} catch (error: unknown) {
		showError("Failed to close shift: " + ((error as Error)?.message || error));
	} finally {
		isClosing.value = false;
	}
}

function close() {
	posStore.showClosingDialog = false;
}

function formatPrice(price: number | string) {
	return parseFloat(String(price) || "0").toFixed(2);
}
</script>
