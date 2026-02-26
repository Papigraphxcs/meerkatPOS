import { defineStore } from "pinia";
import { ref, computed, type Ref, type ComputedRef } from "vue";
import { call } from "@/services/api";
import type {
  POSOpeningShift,
  POSProfile,
  Company,
  StockSettings,
  ShiftCheckResult,
  OpeningData,
  ShiftSummary,
  POSPaymentMethod,
  CurrencyCode,
  CurrencySymbolMap,
} from "@/types/pos.types";

export const usePosStore = defineStore("pos", () => {
  // ─── State ─────────────────────────────────────
  const isLoading: Ref<boolean> = ref(true);
  const isReady: Ref<boolean> = ref(false);
  const currentView: Ref<string> = ref("pos"); // pos | orders

  // Shift data
  const posOpeningShift: Ref<POSOpeningShift | null> = ref(null);
  const posProfile: Ref<POSProfile | null> = ref(null);
  const company: Ref<Company | null> = ref(null);
  const stockSettings: Ref<StockSettings> = ref({});

  // Opening dialog
  const showOpeningDialog: Ref<boolean> = ref(false);
  const openingData: Ref<OpeningData | null> = ref(null);

  // Closing dialog
  const showClosingDialog: Ref<boolean> = ref(false);
  const closingData: Ref<ShiftSummary | null> = ref(null);

  // ─── Computed ──────────────────────────────────
  const isShiftOpen: ComputedRef<boolean> = computed(() => !!posOpeningShift.value);

  const profileName: ComputedRef<string> = computed(
    () => posProfile.value?.name || ""
  );

  const warehouse: ComputedRef<string> = computed(
    () => posProfile.value?.warehouse || ""
  );

  const currency: ComputedRef<CurrencyCode> = computed(
    () => posProfile.value?.currency || company.value?.default_currency || "USD"
  );

  const currencySymbols: CurrencySymbolMap = {
    USD: "$", EUR: "€", GBP: "£", JPY: "¥", INR: "₹",
    PKR: "Rs", AED: "د.إ", SAR: "﷼", CNY: "¥", KRW: "₩",
    BDT: "৳", LKR: "Rs", NPR: "Rs", CAD: "C$", AUD: "A$",
  };

  const currencySymbol: ComputedRef<string> = computed(
    () => currencySymbols[currency.value] || currency.value + " "
  );

  const paymentMethods: ComputedRef<POSPaymentMethod[]> = computed(() => {
    if (!posProfile.value?.payments) return [];
    return posProfile.value.payments.map((p) => ({
      mode_of_payment: p.mode_of_payment,
      default: p.default,
    }));
  });

  // ─── Actions ───────────────────────────────────
  async function checkExistingShift(): Promise<void> {
    isLoading.value = true;
    try {
      const result = await call<ShiftCheckResult | null>(
        "xpos.api.shifts.check_open_shift"
      );
      if (result) {
        posOpeningShift.value = result.pos_opening_shift;
        posProfile.value = result.pos_profile;
        company.value = result.company;
        stockSettings.value = result.stock_settings || {};
        isReady.value = true;
      } else {
        showOpeningDialog.value = true;
      }
    } catch (error) {
      console.error("Error checking shift:", error);
      showOpeningDialog.value = true;
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchOpeningData(): Promise<OpeningData | undefined> {
    try {
      const data = await call<OpeningData>(
        "xpos.api.shifts.get_opening_data"
      );
      openingData.value = data;
      return data;
    } catch (error) {
      console.error("Error fetching opening data:", error);
      throw error;
    }
  }

  interface OpenShiftResult extends ShiftCheckResult {}

  async function openShift(
    profileName: string,
    companyName: string,
    balanceDetails: Record<string, unknown>[]
  ): Promise<OpenShiftResult> {
    try {
      const result = await call<OpenShiftResult>(
        "xpos.api.shifts.open_shift",
        {
          pos_profile: profileName,
          company: companyName,
          balance_details: JSON.stringify(balanceDetails),
        }
      );
      posOpeningShift.value = result.pos_opening_shift;
      posProfile.value = result.pos_profile;
      company.value = result.company;
      stockSettings.value = result.stock_settings || {};
      showOpeningDialog.value = false;
      isReady.value = true;
      return result;
    } catch (error) {
      console.error("Error opening shift:", error);
      throw error;
    }
  }

  async function fetchClosingData(): Promise<ShiftSummary | undefined> {
    if (!posOpeningShift.value?.name) return;
    try {
      const data = await call<ShiftSummary>(
        "xpos.api.shifts.get_shift_summary",
        {
          opening_shift: posOpeningShift.value.name,
        }
      );
      closingData.value = data;
      return data;
    } catch (error) {
      console.error("Error fetching closing data:", error);
      throw error;
    }
  }

  async function closeShift(
    closingDetails: Record<string, unknown>[]
  ): Promise<unknown> {
    if (!posOpeningShift.value?.name) return;
    try {
      const result = await call(
        "xpos.api.shifts.close_shift",
        {
          opening_shift: posOpeningShift.value.name,
          closing_details: JSON.stringify(closingDetails),
        }
      );
      // Reset state
      posOpeningShift.value = null;
      posProfile.value = null;
      company.value = null;
      stockSettings.value = {};
      isReady.value = false;
      showClosingDialog.value = false;
      showOpeningDialog.value = true;
      return result;
    } catch (error) {
      console.error("Error closing shift:", error);
      throw error;
    }
  }

  return {
    // State
    isLoading,
    isReady,
    currentView,
    posOpeningShift,
    posProfile,
    company,
    stockSettings,
    showOpeningDialog,
    openingData,
    showClosingDialog,
    closingData,
    // Computed
    isShiftOpen,
    profileName,
    warehouse,
    currency,
    currencySymbol,
    paymentMethods,
    // Actions
    checkExistingShift,
    fetchOpeningData,
    openShift,
    fetchClosingData,
    closeShift,
  };
});
