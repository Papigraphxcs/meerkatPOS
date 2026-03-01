import { defineStore } from "pinia";
import { ref, type Ref } from "vue";
import { call } from "@/services/api";
import type {
  OutstandingInvoice,
  UnallocatedPayment,
  CustomerCredit,
  CashMovementContext,
  POSCashMovement,
} from "@/types/pos.types";

export const usePaymentStore = defineStore("payment", () => {
  // ─── Credit State ──────────────────────────────
  const availableCredit: Ref<CustomerCredit | null> = ref(null);
  const isLoadingCredit: Ref<boolean> = ref(false);

  // ─── Cash Movement State ───────────────────────
  const showCashMovementDialog: Ref<boolean> = ref(false);
  const cashMovementType: Ref<"expense" | "deposit"> = ref("expense");
  const cashMovementContext: Ref<CashMovementContext | null> = ref(null);
  const shiftCashMovements: Ref<POSCashMovement[]> = ref([]);
  const isLoadingCashMovement: Ref<boolean> = ref(false);

  // ─── Credit Actions ────────────────────────────
  async function fetchAvailableCredit(
    customer: string,
    company?: string
  ): Promise<CustomerCredit | null> {
    isLoadingCredit.value = true;
    try {
      const result = await call<CustomerCredit>(
        "xpos.api.customers.get_customer_credit",
        {
          customer,
          company: company || "",
        }
      );
      availableCredit.value = result;
      return result;
    } catch (error) {
      console.error("Error fetching credit:", error);
      return null;
    } finally {
      isLoadingCredit.value = false;
    }
  }

  async function fetchOutstandingInvoices(
    customer: string,
    company?: string
  ): Promise<OutstandingInvoice[]> {
    try {
      const result = await call<OutstandingInvoice[]>(
        "xpos.api.payments.get_outstanding_invoices",
        {
          customer,
          company: company || "",
        }
      );
      return result || [];
    } catch (error) {
      console.error("Error fetching outstanding invoices:", error);
      return [];
    }
  }

  async function fetchUnallocatedPayments(
    customer: string,
    company?: string
  ): Promise<UnallocatedPayment[]> {
    try {
      const result = await call<UnallocatedPayment[]>(
        "xpos.api.payments.get_unallocated_payments",
        {
          customer,
          company: company || "",
        }
      );
      return result || [];
    } catch (error) {
      console.error("Error fetching unallocated payments:", error);
      return [];
    }
  }

  async function createPaymentEntry(data: Record<string, unknown>): Promise<unknown> {
    try {
      const result = await call(
        "xpos.api.payments.create_payment_entry",
        data
      );
      return result;
    } catch (error) {
      console.error("Error creating payment entry:", error);
      throw error;
    }
  }

  async function createPaymentRequest(data: Record<string, unknown>): Promise<unknown> {
    try {
      const result = await call(
        "xpos.api.payments.create_payment_request",
        data
      );
      return result;
    } catch (error) {
      console.error("Error creating payment request:", error);
      throw error;
    }
  }

  // ─── Cash Movement Actions ─────────────────────
  async function fetchCashMovementContext(
    posProfile: string,
    posOpeningShift: string
  ): Promise<CashMovementContext | null> {
    try {
      const result = await call<CashMovementContext>(
        "xpos.api.cash_movements.get_cash_movement_context",
        { pos_profile: posProfile, pos_opening_shift: posOpeningShift }
      );
      cashMovementContext.value = result;
      return result;
    } catch (error) {
      console.error("Error fetching cash movement context:", error);
      return null;
    }
  }

  async function createPosExpense(data: Record<string, unknown>): Promise<unknown> {
    isLoadingCashMovement.value = true;
    try {
      const result = await call(
        "xpos.api.cash_movements.create_pos_expense",
        data
      );
      return result;
    } catch (error) {
      console.error("Error creating POS expense:", error);
      throw error;
    } finally {
      isLoadingCashMovement.value = false;
    }
  }

  async function createCashDeposit(data: Record<string, unknown>): Promise<unknown> {
    isLoadingCashMovement.value = true;
    try {
      const result = await call(
        "xpos.api.cash_movements.create_cash_deposit",
        data
      );
      return result;
    } catch (error) {
      console.error("Error creating cash deposit:", error);
      throw error;
    } finally {
      isLoadingCashMovement.value = false;
    }
  }

  async function fetchShiftCashMovements(
    posProfile: string,
    openingShift: string
  ): Promise<POSCashMovement[]> {
    try {
      const result = await call<POSCashMovement[]>(
        "xpos.api.cash_movements.get_shift_cash_movements",
        {
          pos_opening_shift: openingShift,
        }
      );
      shiftCashMovements.value = result || [];
      return shiftCashMovements.value;
    } catch (error) {
      console.error("Error fetching shift cash movements:", error);
      return [];
    }
  }

  function openCashMovement(type: "expense" | "deposit"): void {
    cashMovementType.value = type;
    showCashMovementDialog.value = true;
  }

  function closeCashMovement(): void {
    showCashMovementDialog.value = false;
  }

  function clearCredit(): void {
    availableCredit.value = null;
  }

  return {
    // Credit
    availableCredit,
    isLoadingCredit,
    fetchAvailableCredit,
    fetchOutstandingInvoices,
    fetchUnallocatedPayments,
    createPaymentEntry,
    createPaymentRequest,
    clearCredit,
    // Cash Movements
    showCashMovementDialog,
    cashMovementType,
    cashMovementContext,
    shiftCashMovements,
    isLoadingCashMovement,
    fetchCashMovementContext,
    createPosExpense,
    createCashDeposit,
    fetchShiftCashMovements,
    openCashMovement,
    closeCashMovement,
  };
});
