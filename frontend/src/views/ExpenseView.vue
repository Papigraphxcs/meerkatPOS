<template>
	<div class="flex flex-col h-full overflow-hidden bg-background">
		<div class="shrink-0 p-4 pb-3">
			<div class="flex items-center justify-between mb-4">
				<h1 class="text-xl font-bold text-foreground">{{ __("Expenses") }}</h1>
				<Button size="sm" @click="openForm" :disabled="!canAddExpense">
					<Plus class="w-4 h-4 me-1" />
					{{ __("New Expense") }}
				</Button>
			</div>

			<div class="flex items-center gap-3">
				<DateTimePicker
					v-model="fromDate"
					mode="date"
					placeholder="From date"
					:show-today="true"
					:clearable="true"
					class="w-52"
				/>
				<span class="text-muted-foreground text-sm">to</span>
				<DateTimePicker
					v-model="toDate"
					mode="date"
					placeholder="To date"
					:show-today="true"
					:clearable="true"
					class="w-52"
				/>
				<Button variant="outline" size="sm" @click="loadExpenses">
					<RefreshCw class="w-4 h-4" />
				</Button>
			</div>
		</div>

		<div class="flex-1 overflow-y-auto px-4 xpos-scrollbar">
			<div v-if="isLoading" class="grid gap-3">
				<div v-for="i in 4" :key="i" class="skeleton h-16 w-full rounded-xl"></div>
			</div>
			<div
				v-else-if="expenses.length === 0"
				class="flex flex-col items-center justify-center h-64 text-muted-foreground"
			>
				<Receipt class="w-16 h-16 mb-4 text-muted-foreground/30" />
				<p class="text-lg font-medium">{{ __("No expenses found") }}</p>
				<p class="text-sm">{{ __("Add a new expense to get started") }}</p>
			</div>

			<div v-else class="space-y-2">
				<Card v-for="exp in expenses" :key="exp.id" class="p-4">
					<div class="flex items-center gap-4">
						<div
							class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-red-500/10 text-red-500"
						>
							<ArrowDownCircle class="w-4 h-4" />
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2 mb-1">
								<span class="font-semibold text-foreground">{{
									exp.expense_account || exp.to_account
								}}</span>
								<Badge
									:variant="exp.sync_status === 'synced' ? 'default' : 'secondary'"
									class="text-[10px]"
								>
									{{ exp.sync_status }}
								</Badge>
							</div>
							<div class="flex items-center gap-3 text-xs text-muted-foreground">
								<span>{{ exp.posting_date }}</span>
								<span v-if="exp.remarks" class="truncate max-w-[200px]">{{
									exp.remarks
								}}</span>
							</div>
						</div>
						<div class="text-end">
							<span class="font-bold text-red-500">-{{ formatPrice(exp.amount) }}</span>
						</div>
						<Button
							v-if="exp.sync_status === 'pending' || exp.can_delete"
							variant="ghost"
							size="icon"
							class="text-destructive h-8 w-8"
							@click="handleDelete(exp.id)"
						>
							<Trash2 class="w-4 h-4" />
						</Button>
					</div>
				</Card>
			</div>
		</div>

		<Dialog :open="showForm" @update:open="showForm = $event">
			<DialogContent class="sm:max-w-md">
				<DialogHeader>
					<div class="flex items-center gap-2">
						<div
							class="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500/10 text-red-500"
						>
							<ArrowDownCircle class="w-4 h-4" />
						</div>
						<div>
							<DialogTitle class="text-base">{{ __("POS Expense") }}</DialogTitle>
							<DialogDescription class="text-xs">{{
								__("Record a cash withdrawal")
							}}</DialogDescription>
						</div>
					</div>
				</DialogHeader>
				<div class="space-y-4">
					<div>
						<label class="text-sm font-semibold text-foreground mb-1.5 block">
							{{ __("Expense Account") }}
						</label>
						<Select v-model="form.expense_account">
							<SelectTriggerStyled class="h-8 w-full">
								<SelectValue :placeholder="__('Select expense account')" />
							</SelectTriggerStyled>
							<SelectContentStyled>
								<SelectItemStyled
									class="cursor-pointer"
									v-for="op in expenseAccountOptions"
									:key="op.value"
									:value="op.value"
								>
									{{ op.label }}
								</SelectItemStyled>
							</SelectContentStyled>
						</Select>
					</div>
					<div>
						<label class="text-sm font-semibold text-foreground mb-1.5 block">{{
							__("Amount")
						}}</label>
						<NumberInput
							v-model="form.amount"
							:min="0"
							:precision="2"
							class="text-lg font-bold"
							placeholder="0.00"
						/>
					</div>
					<div>
						<label class="text-sm font-semibold text-foreground mb-1.5 block">{{
							__("Reason / Notes")
						}}</label>
						<textarea
							v-model="form.reason"
							rows="3"
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
							:placeholder="__('Enter reason for this transaction...')"
						/>
					</div>
				</div>
				<DialogFooter class="mt-4">
					<Button variant="outline" class="flex-1" @click="showForm = false">{{
						__("Cancel")
					}}</Button>
					<Button
						class="flex-1 font-bold bg-red-500 hover:bg-red-600 text-white"
						:disabled="!canSubmit || isSaving"
						@click="handleSave"
					>
						<template v-if="isSaving">
							<Loader2 class="w-4 h-4 animate-spin" />
						</template>
						<template v-else>{{ __("Record Expense") }}</template>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useAuthStore } from "@/stores/authStore";
import { usePaymentStore } from "@/stores/paymentStore";
import { hasPermission } from "@/services/userRights";
import { createExpense, getExpenses, deleteExpense } from "@/services/dbBridge";
import { isElectron } from "@/services/electronBridge";
import { showSuccess, showError } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/ui/number-input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import Select from "@/components/ui/select/Select.vue";
import { SelectTriggerStyled, SelectValue } from "@/components/ui/select";
import SelectContentStyled from "@/components/ui/select/SelectContentStyled.vue";
import SelectItemStyled from "@/components/ui/select/SelectItemStyled.vue";
import { Plus, RefreshCw, Trash2, Receipt, Loader2, ArrowDownCircle } from "lucide-vue-next";
import DateTimePicker from "@/components/ui/datetime-picker/DateTimePicker.vue";
import __ from "@/lib/translate";

const posStore = usePosStore();
const authStore = useAuthStore();
const paymentStore = usePaymentStore();

interface Expense {
	id: number | string;
	expense_account?: string;
	to_account?: string;
	amount: number;
	remarks?: string;
	posting_date?: string;
	sync_status?: string;
	can_delete?: boolean;
}

const isLoading = ref(false);
const isSaving = ref(false);
const showForm = ref(false);
const expenses = ref<Expense[]>([]);
const isElectronMode = isElectron();

const today = new Date().toISOString().slice(0, 10);
const fromDate = ref(today);
const toDate = ref(today);

const canAddExpense = computed(() => hasPermission("expense") && posStore.allowPosExpense);

const form = ref({
	expense_account: "",
	amount: 0,
	reason: "",
});

const expenseAccountOptions = computed(() => {
	const ctx = paymentStore.cashMovementContext;
	if (ctx?.expense_accounts) {
		return ctx.expense_accounts.map((ac) => ({
			label: ac.account,
			value: ac.account,
		}));
	}
	return [];
});

const canSubmit = computed(() => {
	return form.value.amount > 0 && !!form.value.expense_account;
});

function formatPrice(price: number | string) {
	return parseFloat(String(price) || "0").toFixed(2);
}

function openForm() {
	form.value = { expense_account: "", amount: 0, reason: "" };
	if (posStore.defaultPosExpenseAccount) {
		const hasDefault = expenseAccountOptions.value.some(
			(ac) => ac.value === posStore.defaultPosExpenseAccount,
		);
		if (hasDefault) {
			form.value.expense_account = posStore.defaultPosExpenseAccount;
		}
	}
	showForm.value = true;
}

watch([fromDate, toDate], () => loadExpenses());

async function loadExpenses() {
	isLoading.value = true;
	try {
		if (isElectronMode) {
			expenses.value = (await getExpenses({
				user: authStore.userEmail,
				fromDate: fromDate.value,
				toDate: toDate.value,
			})) as Expense[];
		} else {
			const shift = posStore.posOpeningShift?.name;
			if (shift) {
				const movements = await paymentStore.fetchShiftCashMovements(
					shift,
					"Expense",
					fromDate.value,
					toDate.value,
				);
				expenses.value = movements.map((m) => {
					const r = m as Record<string, unknown>;
					return {
						id: String(r.name || ""),
						expense_account: String(r.expense_account || r.account || ""),
						amount: Number(r.amount || 0),
						remarks: String(r.remarks || ""),
						posting_date: String(r.posting_date || ""),
						docstatus: Number(r.docstatus || 0),
						can_delete: r.docstatus === 0 || r.docstatus === 1,
					};
				});
			}
		}
	} catch (err) {
		console.error("Failed to load expenses:", err);
	} finally {
		isLoading.value = false;
	}
}

async function handleSave() {
	if (!canSubmit.value) return;
	isSaving.value = true;
	try {
		if (isElectronMode) {
			await createExpense({
				to_account: form.value.expense_account,
				amount: form.value.amount,
				remarks: form.value.reason,
				posting_date: today,
				company: posStore.companyName,
				user: authStore.userEmail,
				pos_opening_entry_id: posStore.posOpeningShift?.name
					? Number(posStore.posOpeningShift.name)
					: null,
			});
		} else {
			await paymentStore.createPosExpense({
				pos_profile: posStore.profileName,
				company: posStore.companyName,
				expense_account: form.value.expense_account,
				amount: form.value.amount,
				reason: form.value.reason,
				pos_opening_shift: posStore.posOpeningShift?.name || "",
			});
		}
		showSuccess(__("POS expense recorded"));
		showForm.value = false;
		form.value = { expense_account: "", amount: 0, reason: "" };
		await loadExpenses();
	} catch (err) {
		showError(__("Failed to record expense"));
		console.error("Failed to save expense:", err);
	} finally {
		isSaving.value = false;
	}
}

async function handleDelete(id: number | string) {
	try {
		if (isElectronMode) {
			await deleteExpense(id);
		} else {
			const { call } = await import("@/services/api");
			await call("frappe.client.cancel", { doctype: "POS Cash Movement", name: String(id) });
		}
		showSuccess(__("Expense cancelled"));
		await loadExpenses();
	} catch (err) {
		showError(__("Failed to cancel expense"));
		console.error("Failed to delete expense:", err);
	}
}

async function loadContext() {
	const shift = posStore.posOpeningShift?.name;
	if (shift && posStore.profileName) {
		await paymentStore.fetchCashMovementContext(posStore.profileName, shift);
	}
}

onMounted(async () => {
	await loadContext();
	await loadExpenses();
});
</script>
