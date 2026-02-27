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
  PrintFormat,
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

  // Print formats
  const printFormats: Ref<PrintFormat[]> = ref([]);

  // Last invoice (for print last)
  const lastInvoiceName: Ref<string> = ref("");

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

  const companyName: ComputedRef<string> = computed(
    () => company.value?.name || ""
  );

  const sellingPriceList: ComputedRef<string> = computed(
    () => posProfile.value?.selling_price_list || ""
  );

  const defaultCustomer: ComputedRef<string> = computed(
    () => posProfile.value?.customer || ""
  );

  // ─── POS Profile Settings ─────────────────────
  const allowEditRate: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_user_to_edit_rate
  );

  const allowEditItemDiscount: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_user_to_edit_item_discount
  );

  const allowEditAdditionalDiscount: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_user_to_edit_additional_discount
  );

  const displayItemsInStock: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_display_items_in_stock
  );

  const allowPartialPayment: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_partial_payment
  );

  const allowCreditSale: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_credit_sale
  );

  const allowReturn: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_return
  );

  const allowReturnWithoutInvoice: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_return_without_invoice
  );

  const allowSalesOrder: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_sales_order
  );

  const allowDelete: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_delete
  );

  const allowPrintLastInvoice: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_print_last_invoice
  );

  const displayAdditionalNotes: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_display_additional_notes
  );

  const displayAuthorizationCode: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_display_authorization_code
  );

  const allowWriteOffChange: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_write_off_change
  );

  const displayItemCode: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_display_item_code
  );

  const allowZeroRatedItems: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_zero_rated_items
  );

  const maxDiscountAllowed: ComputedRef<number> = computed(
    () => posProfile.value?.posa_max_discount_allowed || 0
  );

  const inputQty: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_input_qty
  );

  const taxInclusive: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_tax_inclusive
  );

  const hideClosingShift: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_hide_closing_shift
  );

  const usePercentageDiscount: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_use_percentage_discount
  );

  const enableCashMovement: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_enable_cash_movement
  );

  const allowPosExpense: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_pos_expense
  );

  const allowCashDeposit: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_cash_deposit
  );

  const fetchCoupon: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_fetch_coupon
  );

  const showTemplateItems: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_show_template_items
  );

  const hideVariantsItems: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_hide_variants_items
  );

  const autoSetBatch: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_auto_set_batch
  );

  const searchSerialNo: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_search_serial_no
  );

  const enableReturnValidity: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_enable_return_validity
  );

  const returnValidityDays: ComputedRef<number> = computed(
    () => posProfile.value?.posa_return_validity_days || 0
  );

  const useCustomerCredit: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.use_customer_credit
  );

  const applyCustomerDiscount: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_apply_customer_discount
  );

  const allowPrintDraftInvoices: ComputedRef<boolean> = computed(
    () => !!posProfile.value?.posa_allow_print_draft_invoices
  );

  const cashModeOfPayment: ComputedRef<string> = computed(
    () => posProfile.value?.posa_cash_mode_of_payment || "Cash"
  );

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
        // Fetch print formats in background
        fetchPrintFormats();
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
      // Fetch print formats in background
      fetchPrintFormats();
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
      printFormats.value = [];
      lastInvoiceName.value = "";
      return result;
    } catch (error) {
      console.error("Error closing shift:", error);
      throw error;
    }
  }

  async function fetchPrintFormats(): Promise<void> {
    try {
      const result = await call<PrintFormat[]>(
        "xpos.api.print_formats.get_print_formats"
      );
      printFormats.value = result || [];
    } catch (error) {
      console.error("Error fetching print formats:", error);
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
    printFormats,
    lastInvoiceName,
    // Computed
    isShiftOpen,
    profileName,
    warehouse,
    currency,
    currencySymbol,
    paymentMethods,
    companyName,
    sellingPriceList,
    defaultCustomer,
    // POS Profile Settings
    allowEditRate,
    allowEditItemDiscount,
    allowEditAdditionalDiscount,
    displayItemsInStock,
    allowPartialPayment,
    allowCreditSale,
    allowReturn,
    allowReturnWithoutInvoice,
    allowSalesOrder,
    allowDelete,
    allowPrintLastInvoice,
    displayAdditionalNotes,
    displayAuthorizationCode,
    allowWriteOffChange,
    displayItemCode,
    allowZeroRatedItems,
    maxDiscountAllowed,
    inputQty,
    taxInclusive,
    hideClosingShift,
    usePercentageDiscount,
    enableCashMovement,
    allowPosExpense,
    allowCashDeposit,
    fetchCoupon,
    showTemplateItems,
    hideVariantsItems,
    autoSetBatch,
    searchSerialNo,
    enableReturnValidity,
    returnValidityDays,
    useCustomerCredit,
    applyCustomerDiscount,
    allowPrintDraftInvoices,
    cashModeOfPayment,
    // Actions
    checkExistingShift,
    fetchOpeningData,
    openShift,
    fetchClosingData,
    closeShift,
    fetchPrintFormats,
  };
});
