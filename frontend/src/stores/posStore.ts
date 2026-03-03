import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { call } from "@/services/api";
import {
  cachePOSData,
  getCachedPOSData,
} from "@/services/idbService";
import type {
  POSOpeningShift,
  POSProfile,
  Company,
  StockSettings,
  ShiftCheckResult,
  OpeningData,
  ShiftSummary,
  PrintFormat,
  CurrencySymbolMap,
  TaxDetail,
  PrintSettings,
} from "@/types/pos.types";
import { isOnline } from "@/utils";

export const usePosStore = defineStore("pos", () => {
  const isLoading = ref(true);
  const isReady = ref(false);
  const currentView = ref("pos");

  // Shift data
  const posOpeningShift = ref<POSOpeningShift | null>(null);
  const posProfile = ref<POSProfile | null>(null);
  const company = ref<Company | null>(null);
  const stockSettings = ref<StockSettings>({});

  // Tax data
  const taxes = ref<TaxDetail[]>([]);
  const taxInclusiveMode = ref(false);

  // Rounding
  const disableRoundedTotal = ref(false);

  // Print settings
  const printSettings = ref<PrintSettings | null>(null);

  // Opening dialog
  const showOpeningDialog = ref(false);
  const openingData = ref<OpeningData | null>(null);

  // Closing dialog
  const showClosingDialog = ref(false);
  const closingData = ref<ShiftSummary | null>(null);

  // Print formats
  const printFormats = ref<PrintFormat[]>([]);

  // Last invoice (for print last)
  const lastInvoiceName = ref("");

  const isShiftOpen = computed(() => !!posOpeningShift.value);

  const profileName = computed(
    () => posProfile.value?.name || ""
  );

  const warehouse = computed(
    () => posProfile.value?.warehouse || ""
  );

  const currency = computed(
    () => posProfile.value?.currency
  );

  const currencySymbols: CurrencySymbolMap = {
    USD: "$", EUR: "€", GBP: "£", JPY: "¥", INR: "₹",
    PKR: "Rs", AED: "د.إ", SAR: "﷼", CNY: "¥", KRW: "₩",
    BDT: "৳", LKR: "Rs", NPR: "Rs", CAD: "C$", AUD: "A$",
  };

  const currencySymbol = computed(
    () => currencySymbols[currency.value ?? ""] || currency.value + " "
  );

  const paymentMethods = computed(() => {
    if (!posProfile.value?.payments) return [];
    return posProfile.value.payments.map((p) => ({
      mode_of_payment: p.mode_of_payment,
      default: p.default,
    }));
  });

  const companyName = computed(
    () => company.value?.name || ""
  );

  const sellingPriceList = computed(
    () => posProfile.value?.selling_price_list || ""
  );

  const defaultCustomer = computed(
    () => posProfile.value?.default_customer || ""
  );

  const allowEditRate = computed(
    () => !!posProfile.value?.allow_rate_change
  );

  const hideImages = computed(
    () => !!posProfile.value?.hide_images
  );

  const hideUnavailableItems = computed(
    () => !!posProfile.value?.hide_unavailable_items
  );

  const blockSaleBeyondAvailableQty = computed(
    () => !!posProfile.value?.block_sale_beyond_available_qty
  );

  const defaultView = computed(
    () => posProfile.value?.default_view || "Card"
  );

  const defaultPosExpenseAccount = computed(
    () => posProfile.value?.default_pos_expense_account
  );

  const backOfficeCashAccount = computed(
    () => posProfile.value?.back_office_cash_account
  );

  const useOfflineMode = computed(
    () => !!posProfile.value?.use_offline_mode
  );

  const allowEditItemDiscount = computed(
    () => !!posProfile.value?.allow_discount_change
  );

  const allowEditAdditionalDiscount = computed(
    () => !!posProfile.value?.allow_user_to_edit_additional_discount
  );

  const displayItemsInStock = computed(
    () => !!posProfile.value?.display_items_in_stock
  );

  const allowPartialPayment = computed(
    () => !!posProfile.value?.allow_partial_payment
  );

  const allowCreditSale = computed(
    () => !!posProfile.value?.allow_credit_sale
  );

  const allowReturn = computed(
    () => !!posProfile.value?.allow_return
  );

  const allowReturnWithoutInvoice = computed(
    () => !!posProfile.value?.allow_return_without_invoice
  );

  const allowSalesOrder = computed(
    () => !!posProfile.value?.allow_sales_order
  );

  const allowDelete = computed(
    () => !!posProfile.value?.allow_delete
  );

  const allowPrintLastInvoice = computed(
    () => !!posProfile.value?.allow_print_last_invoice
  );

  const displayAdditionalNotes = computed(
    () => !!posProfile.value?.display_additional_notes
  );

  const displayAuthorizationCode = computed(
    () => !!posProfile.value?.display_authorization_code
  );

  const allowWriteOffChange = computed(
    () => !!posProfile.value?.allow_write_off_change
  );

  const displayItemCode = computed(
    () => !!posProfile.value?.display_item_code
  );

  const allowZeroRatedItems = computed(
    () => !!posProfile.value?.allow_zero_rated_items
  );

  const maxDiscountAllowed = computed(
    () => posProfile.value?.max_discount_percentage_allowed || 0
  );

  const inputQty = computed(
    () => !!posProfile.value?.input_qty
  );

  const taxInclusive = computed(
    () => !!posProfile.value?.tax_inclusive
  );

  const hideClosingShift = computed(
    () => !!posProfile.value?.hide_closing_shift
  );

  const usePercentageDiscount = computed(
    () => !!posProfile.value?.use_percentage_discount
  );

  const enableCashMovement = computed(
    () => !!posProfile.value?.enable_cash_movement
  );

  const allowPosExpense = computed(
    () => !!posProfile.value?.allow_pos_expense
  );

  const allowCashDeposit = computed(
    () => !!posProfile.value?.allow_cash_deposit
  );

  const fetchCoupon = computed(
    () => !!posProfile.value?.auto_fetch_coupons_gifts
  );

  const showTemplateItems = computed(
    () => !!posProfile.value?.show_template_items
  );

  const hideVariantsItems = computed(
    () => !!posProfile.value?.hide_variants_items
  );

  const autoSetBatch = computed(
    () => !!posProfile.value?.auto_set_batch
  );

  const searchSerialNo = computed(
    () => !!posProfile.value?.search_serial_no
  );

  const enableReturnValidity = computed(
    () => !!posProfile.value?.enable_return_validity
  );

  const returnValidityDays = computed(
    () => posProfile.value?.return_validity_days || 0
  );

  const useCustomerCredit = computed(
    () => !!posProfile.value?.use_customer_credit
  );

  const applyCustomerDiscount = computed(
    () => !!posProfile.value?.apply_customer_discount
  );

  const allowPrintDraftInvoices = computed(
    () => !!posProfile.value?.allow_print_draft_invoices
  );

  const cashModeOfPayment = computed(
    () => posProfile.value?.cash_mode_of_payment || "Cash"
  );
  
  async function checkExistingShift(): Promise<void> {
    isLoading.value = true;
    try {
      debugger
      if (!isOnline()) {
        console.log("[XPOS Offline] System is offline, loading from cache");
        const cachedData = await getCachedPOSData() as ShiftCheckResult | null;
        
        if (cachedData) {
          posOpeningShift.value = cachedData.pos_opening_shift;
          posProfile.value = cachedData.pos_profile;
          company.value = cachedData.company;
          stockSettings.value = cachedData.stock_settings || {};
          taxes.value = cachedData.taxes || [];
          taxInclusiveMode.value = !!(cachedData.tax_inclusive);
          disableRoundedTotal.value = !!(cachedData.disable_rounded_total);
          printSettings.value = cachedData.print_settings || null;
          isReady.value = true;
          console.log("[XPOS Offline] Loaded POS data from cache");
          return;
        } else {
          console.warn("[XPOS Offline] No cached POS data available");
          showOpeningDialog.value = true;
          return;
        }
      }
      
      const result = await call<ShiftCheckResult | null>(
        "xpos.api.shifts.check_open_shift"
      );
      
      if (result) {
        posOpeningShift.value = result.pos_opening_shift;
        posProfile.value = result.pos_profile;
        company.value = result.company;
        stockSettings.value = result.stock_settings || {};
        
        taxes.value = result.taxes || [];
        taxInclusiveMode.value = !!(result.tax_inclusive);
        
        disableRoundedTotal.value = !!(result.disable_rounded_total);
        
        printSettings.value = result.print_settings || null;
        isReady.value = true;
        
        fetchPrintFormats();
        
        // Cache POS data for offline use
        if (result.pos_profile?.use_offline_mode) {
          try {
            await cachePOSData(result);
            
            // Initialize offline caches
            import("@/stores/itemStore").then(async ({ useItemStore }) => {
              const itemStore = useItemStore();
              itemStore.cacheAllItems(result.pos_profile.name).catch(error => {
                console.warn("[XPOS] Failed to initialize offline item cache:", error);
              });
            });
            
            import("@/stores/customerStore").then(async ({ useCustomerStore }) => {
              const customerStore = useCustomerStore();
              customerStore.cacheAllCustomers(result.pos_profile.name).catch(error => {
                console.warn("[XPOS] Failed to initialize offline customer cache:", error);
              });
            });
          } catch (error) {
            console.warn("[XPOS] Failed to cache POS data:", error);
          }
        }
      } else {
        showOpeningDialog.value = true;
      }
    } catch (error) {
      console.error("Error checking shift:", error);
      
      // Fallback to cache if available
      try {
        const cachedData = await getCachedPOSData() as ShiftCheckResult | null;
        if (cachedData && cachedData.pos_profile?.use_offline_mode) {
          posOpeningShift.value = cachedData.pos_opening_shift;
          posProfile.value = cachedData.pos_profile;
          company.value = cachedData.company;
          stockSettings.value = cachedData.stock_settings || {};
          taxes.value = cachedData.taxes || [];
          taxInclusiveMode.value = !!(cachedData.tax_inclusive);
          disableRoundedTotal.value = !!(cachedData.disable_rounded_total);
          printSettings.value = cachedData.print_settings || null;
          isReady.value = true;
          console.log("[XPOS Offline] Fallback to cached POS data after API error");
          return;
        }
      } catch {
        console.warn("[XPOS Offline] Failed to load cached POS data");
      }
      
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
      
      taxes.value = result.taxes || [];
      taxInclusiveMode.value = !!(result.tax_inclusive);
      
      disableRoundedTotal.value = !!(result.disable_rounded_total);
      
      printSettings.value = result.print_settings || null;
      showOpeningDialog.value = false;
      isReady.value = true;
      
      fetchPrintFormats();
      
      if (result.pos_profile?.use_offline_mode) {
        // Cache POS data for offline use
        try {
          await cachePOSData(result);
          
          // Initialize offline caches
          import("@/stores/itemStore").then(({ useItemStore }) => {
            const itemStore = useItemStore();
            itemStore.cacheAllItems(profileName).catch(error => {
              console.warn("[XPOS] Failed to initialize offline item cache:", error);
            });
          });
          
          import("@/stores/customerStore").then(({ useCustomerStore }) => {
            const customerStore = useCustomerStore();
            customerStore.cacheAllCustomers(profileName).catch(error => {
              console.warn("[XPOS] Failed to initialize offline customer cache:", error);
            });
          });
        } catch (error) {
          console.warn("[XPOS] Failed to cache POS data:", error);
        }
      }
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
      
      posOpeningShift.value = null;
      posProfile.value = null;
      company.value = null;
      stockSettings.value = {};
      taxes.value = [];
      taxInclusiveMode.value = false;
      disableRoundedTotal.value = false;
      printSettings.value = null;
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
    taxes,
    taxInclusiveMode,
    disableRoundedTotal,
    printSettings,
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
    // New computed properties for requested features
    hideImages,
    hideUnavailableItems,
    blockSaleBeyondAvailableQty,
    defaultView,
    defaultPosExpenseAccount,
    backOfficeCashAccount,
    useOfflineMode,
    // Actions
    checkExistingShift,
    fetchOpeningData,
    openShift,
    fetchClosingData,
    closeShift,
    fetchPrintFormats,
  };
});
