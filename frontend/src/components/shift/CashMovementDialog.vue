<template>
    <Dialog :open="paymentStore.showCashMovementDialog" @update:open="(val: boolean) => { if (!val) close() }">
        <DialogContent class="max-w-md max-h-[75vh] flex flex-col p-0 gap-0">
            <!-- Header -->
            <DialogHeader class="shrink-0 px-5 pt-5 pb-3 border-b border-border">
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="paymentStore.cashMovementType === 'expense'
                        ? 'bg-red-500/10 text-red-500'
                        : 'bg-emerald-500/10 text-emerald-500'">
                        <ArrowDownCircle v-if="paymentStore.cashMovementType === 'expense'" class="w-4 h-4" />
                        <ArrowUpCircle v-else class="w-4 h-4" />
                    </div>
                    <div>
                        <DialogTitle class="text-base">
                            {{ paymentStore.cashMovementType === 'expense' ? 'POS Expense' : 'Cash Deposit' }}
                        </DialogTitle>
                        <DialogDescription class="text-xs">
                            {{ paymentStore.cashMovementType === 'expense' ? 'Record a cash withdrawal' : 'Record a cash deposit' }}
                        </DialogDescription>
                    </div>
                </div>
            </DialogHeader>

            <div class="flex-1 overflow-y-auto p-5 space-y-4 xpos-scrollbar">
                <!-- Loading context -->
                <div v-if="paymentStore.isLoadingCashMovement" class="flex items-center justify-center py-8">
                    <Loader2 class="w-6 h-6 text-primary animate-spin" />
                </div>

                <template v-else>
                    <!-- Expense Account -->
                    <div v-if="paymentStore.cashMovementType === 'expense'">
                        <label class="text-sm font-semibold text-foreground mb-1.5 block">Expense Account</label>
                        <select v-model="expenseAccount"
                            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring">
                            <option value="">Select account...</option>
                            <option v-for="acc in expenseAccounts" :key="acc" :value="acc">{{ acc }}</option>
                        </select>
                    </div>

                    <!-- Deposit Account -->
                    <div v-else>
                        <label class="text-sm font-semibold text-foreground mb-1.5 block">Deposit To</label>
                        <select v-model="depositAccount"
                            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring">
                            <option value="">Select account...</option>
                            <option v-for="acc in depositAccounts" :key="acc" :value="acc">{{ acc }}</option>
                        </select>
                    </div>

                    <!-- Amount -->
                    <div>
                        <label class="text-sm font-semibold text-foreground mb-1.5 block">Amount</label>
                        <NumberInput v-model="amount" :min="0" :precision="2" class="text-lg font-bold"
                            placeholder="0.00" />
                    </div>

                    <!-- Reason -->
                    <div>
                        <label class="text-sm font-semibold text-foreground mb-1.5 block">Reason / Notes</label>
                        <textarea v-model="reason" rows="3"
                            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                            placeholder="Enter reason for this transaction..."></textarea>
                    </div>

                    <!-- Recent Cash Movements -->
                    <div v-if="paymentStore.shiftCashMovements.length > 0">
                        <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Recent Movements
                        </h3>
                        <div class="space-y-1.5 max-h-32 overflow-y-auto xpos-scrollbar">
                            <div v-for="mov in paymentStore.shiftCashMovements" :key="mov.name"
                                class="flex items-center justify-between text-sm bg-muted rounded-lg px-3 py-2">
                                <div>
                                    <span class="text-foreground font-medium">{{ mov.type }}</span>
                                    <span v-if="mov.reason" class="text-muted-foreground ml-2 text-xs">{{ mov.reason
                                        }}</span>
                                </div>
                                <span class="font-bold"
                                    :class="mov.type === 'Expense' ? 'text-red-500' : 'text-emerald-500'">
                                    {{ mov.type === 'Expense' ? '-' : '+' }}{{ formatPrice(mov.amount) }}
                                </span>
                            </div>
                        </div>
                    </div>
                </template>
            </div>

            <!-- Footer -->
            <DialogFooter class="shrink-0 border-t border-border px-5 py-4">
                <Button variant="outline" class="flex-1" @click="close">Cancel</Button>
                <Button class="flex-1 font-bold" :class="paymentStore.cashMovementType === 'expense'
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white'" :disabled="!canSubmit || isSubmitting" @click="submit">
                    <template v-if="isSubmitting">
                        <Loader2 class="w-4 h-4 animate-spin" />
                    </template>
                    <template v-else>
                        {{ paymentStore.cashMovementType === 'expense' ? 'Record Expense' : 'Record Deposit' }}
                    </template>
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { usePosStore } from "@/stores/posStore";
import { usePaymentStore } from "@/stores/paymentStore";
import { showSuccess, showError } from "@/services/api";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Loader2, ArrowDownCircle, ArrowUpCircle } from "lucide-vue-next";

const posStore = usePosStore();
const paymentStore = usePaymentStore();

const amount = ref(0);
const reason = ref("");
const expenseAccount = ref("");
const depositAccount = ref("");
const isSubmitting = ref(false);

const expenseAccounts = computed(() => {
    const ctx = paymentStore.cashMovementContext;
    return ctx?.expense_accounts || [];
});

const depositAccounts = computed(() => {
    const ctx = paymentStore.cashMovementContext;
    return ctx?.deposit_accounts || [];
});

const canSubmit = computed(() => {
    if (amount.value <= 0) return false;
    if (paymentStore.cashMovementType === "expense" && !expenseAccount.value) return false;
    if (paymentStore.cashMovementType === "deposit" && !depositAccount.value) return false;
    return true;
});

onMounted(async () => {
    const shift = posStore.posOpeningShift?.name;
    if (shift) {
        await paymentStore.fetchCashMovementContext(posStore.profileName, shift);
        await paymentStore.fetchShiftCashMovements(posStore.profileName, shift);

        if (paymentStore.cashMovementType === "expense" && posStore.defaultPosExpenseAccount) {
            const hasDefaultAccount = expenseAccounts.value.includes(posStore.defaultPosExpenseAccount);
            if (hasDefaultAccount) {
                expenseAccount.value = posStore.defaultPosExpenseAccount;
            }
        }
        
        if (paymentStore.cashMovementType === "deposit" && posStore.backOfficeCashAccount) {
            const hasDefaultAccount = depositAccounts.value.includes(posStore.backOfficeCashAccount);
            if (hasDefaultAccount) {
                depositAccount.value = posStore.backOfficeCashAccount;
            }
        }
    }
});

watch(() => paymentStore.cashMovementType, (newType) => {
    if (newType === "expense" && posStore.defaultPosExpenseAccount) {
        const hasDefaultAccount = expenseAccounts.value.includes(posStore.defaultPosExpenseAccount);
        if (hasDefaultAccount && !expenseAccount.value) {
            expenseAccount.value = posStore.defaultPosExpenseAccount;
        }
    }
    
    if (newType === "deposit" && posStore.backOfficeCashAccount) {
        const hasDefaultAccount = depositAccounts.value.includes(posStore.backOfficeCashAccount);
        if (hasDefaultAccount && !depositAccount.value) {
            depositAccount.value = posStore.backOfficeCashAccount;
        }
    }
});

async function submit() {
    if (!canSubmit.value || isSubmitting.value) return;
    isSubmitting.value = true;

    try {
        if (paymentStore.cashMovementType === "expense") {
            await paymentStore.createPosExpense({
                pos_profile: posStore.profileName,
                company: posStore.companyName,
                expense_account: expenseAccount.value,
                amount: amount.value,
                reason: reason.value,
                opening_shift: posStore.posOpeningShift?.name || "",
            });
            showSuccess("POS expense recorded");
        } else {
            await paymentStore.createCashDeposit({
                pos_profile: posStore.profileName,
                company: posStore.companyName,
                deposit_account: depositAccount.value,
                amount: amount.value,
                reason: reason.value,
                opening_shift: posStore.posOpeningShift?.name || "",
            });
            showSuccess("Cash deposit recorded");
        }

        const shift = posStore.posOpeningShift?.name;
        if (shift) {
            await paymentStore.fetchShiftCashMovements(posStore.profileName, shift);
        }

        amount.value = 0;
        reason.value = "";
        expenseAccount.value = "";
        depositAccount.value = "";
        close();
    } catch (error) {
        showError("Failed to record cash movement");
    } finally {
        isSubmitting.value = false;
    }
}

function close() {
    paymentStore.closeCashMovement();
}

function formatPrice(price: number | string) {
    return parseFloat(String(price) || "0").toFixed(2);
}
</script>
