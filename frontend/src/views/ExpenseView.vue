<template>
  <div class="flex flex-col h-full overflow-hidden bg-background">
    <div class="shrink-0 p-4 pb-3">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold text-foreground">{{ __("Expenses") }}</h1>
        <Button size="sm" @click="showForm = true" :disabled="!canAddExpense">
          <Plus class="w-4 h-4 me-1" />
          {{ __("New Expense") }}
        </Button>
      </div>

      <div class="flex items-center gap-3">
        <input
          type="date"
          v-model="fromDate"
          class="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        />
        <span class="text-muted-foreground text-sm">to</span>
        <input
          type="date"
          v-model="toDate"
          class="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
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
      <div v-else-if="expenses.length === 0"
        class="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Receipt class="w-16 h-16 mb-4 text-muted-foreground/30" />
        <p class="text-lg font-medium">{{ __("No expenses found") }}</p>
        <p class="text-sm">{{ __("Add a new expense to get started") }}</p>
      </div>

      <div v-else class="space-y-2">
        <Card v-for="exp in expenses" :key="exp.id" class="p-4">
          <div class="flex items-center gap-4">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-semibold text-foreground">{{ exp.expense_type }}</span>
                <Badge :variant="exp.sync_status === 'synced' ? 'default' : 'secondary'" class="text-[10px]">
                  {{ exp.sync_status }}
                </Badge>
              </div>
              <div class="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{{ exp.posting_date }}</span>
                <span v-if="exp.mode_of_payment">{{ exp.mode_of_payment }}</span>
                <span v-if="exp.description" class="truncate max-w-[200px]">{{ exp.description }}</span>
              </div>
            </div>
            <div class="text-end">
              <span class="font-bold text-foreground">{{ formatCurrency(exp.amount) }}</span>
            </div>
            <Button
              v-if="exp.sync_status === 'pending'"
              variant="ghost"
              size="icon"
              class="text-destructive h-8 w-8"
              @click="handleDelete(exp.id as number)"
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
          <DialogTitle>{{ __("New Expense") }}</DialogTitle>
        </DialogHeader>
        <div class="space-y-4">
          <div>
            <label class="text-sm font-semibold text-foreground mb-1.5 block">{{ __("Expense Type") }}</label>
            <input
              v-model="form.expense_type"
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Office Supplies, Tea/Coffee"
            />
          </div>
          <div>
            <label class="text-sm font-semibold text-foreground mb-1.5 block">{{ __("Amount") }}</label>
            <NumberInput v-model="form.amount" :min="0" :precision="2" class="w-full" />
          </div>
          <div>
            <label class="text-sm font-semibold text-foreground mb-1.5 block">{{ __("Mode of Payment") }}</label>
            <select
              v-model="form.mode_of_payment"
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">{{ __("Select") }}</option>
              <option v-for="m in paymentModes" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div>
            <label class="text-sm font-semibold text-foreground mb-1.5 block">{{ __("Description") }}</label>
            <textarea
              v-model="form.description"
              rows="2"
              class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              :placeholder="__('Optional notes')"
            />
          </div>
          <Button class="w-full" :disabled="!form.expense_type || !form.amount || isSaving" @click="handleSave">
            <template v-if="isSaving">
              <Loader2 class="w-4 h-4 animate-spin me-2" /> {{ __("Saving...") }}
            </template>
            <template v-else>{{ __("Save Expense") }}</template>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useAuthStore } from "@/stores/authStore";
import { hasPermission } from "@/services/userRights";
import { createExpense, getExpenses, deleteExpense, getModesOfPayment } from "@/services/dbBridge";
import { isElectron } from "@/services/electronBridge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/ui/number-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, RefreshCw, Trash2, Receipt, Loader2 } from "lucide-vue-next";

const __ = (s: string) => s;

const posStore = usePosStore();
const authStore = useAuthStore();

interface Expense {
  id: number;
  expense_type?: string;
  amount: number;
  mode_of_payment?: string;
  description?: string;
  posting_date?: string;
  sync_status?: string;
}

const isLoading = ref(false);
const isSaving = ref(false);
const showForm = ref(false);
const expenses = ref<Expense[]>([]);
const paymentModes = ref<string[]>([]);

const today = new Date().toISOString().slice(0, 10);
const fromDate = ref(today);
const toDate = ref(today);

const canAddExpense = computed(() => hasPermission("expense"));

const form = ref({
  expense_type: "",
  amount: 0,
  mode_of_payment: "Cash",
  description: "",
});

function formatCurrency(amount: unknown): string {
  const num = Number(amount) || 0;
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function loadExpenses() {
  isLoading.value = true;
  try {
    expenses.value = await getExpenses({
      user: authStore.userEmail,
      fromDate: fromDate.value,
      toDate: toDate.value,
    }) as Expense[];
  } catch (err) {
    console.error("Failed to load expenses:", err);
  } finally {
    isLoading.value = false;
  }
}

async function handleSave() {
  if (!form.value.expense_type || !form.value.amount) return;
  isSaving.value = true;
  try {
    await createExpense({
      expense_type: form.value.expense_type,
      amount: form.value.amount,
      mode_of_payment: form.value.mode_of_payment,
      description: form.value.description,
      posting_date: today,
      company: posStore.company,
      user: authStore.userEmail,
      pos_opening_entry_id: posStore.posOpeningShift?.name ? Number(posStore.posOpeningShift.name) : null,
    });
    showForm.value = false;
    form.value = { expense_type: "", amount: 0, mode_of_payment: "Cash", description: "" };
    await loadExpenses();
  } catch (err) {
    console.error("Failed to save expense:", err);
  } finally {
    isSaving.value = false;
  }
}

async function handleDelete(id: number) {
  try {
    await deleteExpense(id);
    await loadExpenses();
  } catch (err) {
    console.error("Failed to delete expense:", err);
  }
}

onMounted(async () => {
  await loadExpenses();
  if (isElectron()) {
    try {
      const modes = await getModesOfPayment();
      paymentModes.value = (modes as Record<string, unknown>[]).map((m) => String(m.name));
    } catch {
      paymentModes.value = ["Cash"];
    }
  } else {
    paymentModes.value = ["Cash", "Card", "Bank Transfer"];
  }
});
</script>
