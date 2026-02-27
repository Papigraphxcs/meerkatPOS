import { defineStore } from "pinia";
import { ref, computed, type Ref, type ComputedRef } from "vue";
import { usePosStore } from "./posStore";
import type {
  CartItem,
  POSItem,
  InvoiceData,
  InvoiceItem,
  InvoicePayment,
  POSOffer,
  POSCoupon,
} from "@/types/pos.types";

export const useCartStore = defineStore("cart", () => {
  // ─── State ─────────────────────────────────────
  const items: Ref<CartItem[]> = ref([]);
  const customer: Ref<{ name: string; customer_name?: string } | null> = ref(null);
  const discountPercentage: Ref<number> = ref(0);
  const discountAmount: Ref<number> = ref(0);
  const showPaymentDialog: Ref<boolean> = ref(false);

  // Return mode
  const isReturnMode: Ref<boolean> = ref(false);
  const returnAgainst: Ref<string> = ref("");

  // Notes & delivery date
  const orderNotes: Ref<string> = ref("");
  const deliveryDate: Ref<string> = ref("");

  // Authorization code
  const authorizationCode: Ref<string> = ref("");

  // Write-off
  const writeOffAmount: Ref<number> = ref(0);

  // Sales person
  const salesPerson: Ref<string> = ref("");

  // Loyalty
  const redeemLoyaltyPoints: Ref<boolean> = ref(false);
  const loyaltyPoints: Ref<number> = ref(0);
  const loyaltyAmount: Ref<number> = ref(0);

  // Offers & coupons
  const appliedOffers: Ref<POSOffer[]> = ref([]);
  const appliedCoupon: Ref<POSCoupon | null> = ref(null);
  const couponCode: Ref<string> = ref("");

  // Multi-payment
  const payments: Ref<InvoicePayment[]> = ref([]);

  // Draft tracking
  const currentDraftName: Ref<string> = ref("");
  const isSavingDraft: Ref<boolean> = ref(false);

  // Currency
  const currency: Ref<string> = ref("");
  const conversionRate: Ref<number> = ref(1);

  // ─── Computed ──────────────────────────────────
  const itemCount: ComputedRef<number> = computed(() =>
    items.value.reduce((sum: number, item: CartItem) => sum + Math.abs(item.qty), 0)
  );

  const subtotal: ComputedRef<number> = computed(() =>
    items.value.reduce((sum: number, item: CartItem) => {
      const itemTotal = item.qty * item.rate;
      const discount = item.discount_percentage
        ? (itemTotal * item.discount_percentage) / 100
        : item.discount_amount || 0;
      return sum + (itemTotal - discount);
    }, 0)
  );

  const taxRate: ComputedRef<number> = computed(() => {
    const posStore = usePosStore();
    const profile = posStore.posProfile;
    if (!profile?.taxes_and_charges) return 0;
    return 0;
  });

  const taxAmount: ComputedRef<number> = computed(
    () => (subtotal.value * taxRate.value) / 100
  );

  const grandTotal: ComputedRef<number> = computed(() => {
    let total = subtotal.value + taxAmount.value;
    if (discountPercentage.value > 0) {
      total -= (total * discountPercentage.value) / 100;
    } else if (discountAmount.value > 0) {
      total -= discountAmount.value;
    }
    // Subtract loyalty amount
    if (redeemLoyaltyPoints.value && loyaltyAmount.value > 0) {
      total -= loyaltyAmount.value;
    }
    // Subtract write-off
    if (writeOffAmount.value > 0) {
      total -= writeOffAmount.value;
    }
    return Math.max(0, total);
  });

  const isEmpty: ComputedRef<boolean> = computed(() => items.value.length === 0);

  const customerName: ComputedRef<string> = computed(() => {
    if (!customer.value) return "Walk-in Customer";
    return customer.value.customer_name || customer.value.name;
  });

  const totalPayments: ComputedRef<number> = computed(() =>
    payments.value.reduce((sum, p) => sum + (p.amount || 0), 0)
  );

  const remainingPayment: ComputedRef<number> = computed(() =>
    Math.max(0, grandTotal.value - totalPayments.value)
  );

  const hasOffers: ComputedRef<boolean> = computed(
    () => appliedOffers.value.length > 0 || !!appliedCoupon.value
  );

  // ─── Actions ───────────────────────────────────
  function addItem(item: POSItem): void {
    const existing = items.value.find(
      (i: CartItem) =>
        i.item_code === item.item_code && !i.serial_no && !i.batch_no
    );

    if (existing) {
      existing.qty += isReturnMode.value ? -1 : 1;
    } else {
      items.value.push({
        item_code: item.item_code,
        item_name: item.item_name,
        rate: item.rate || 0,
        qty: isReturnMode.value ? -1 : 1,
        uom: item.uom || item.stock_uom,
        stock_uom: item.stock_uom,
        image: item.image,
        discount_percentage: 0,
        discount_amount: 0,
        serial_no: item.serial_no || "",
        batch_no: item.batch_no || "",
        actual_qty: item.actual_qty || 0,
        has_serial_no: item.has_serial_no,
        has_batch_no: item.has_batch_no,
        conversion_factor: (item as CartItem).conversion_factor || 1,
      });
    }
  }

  function addItemWithDetails(
    item: POSItem,
    qty: number,
    rate: number,
    uom?: string,
    serialNo?: string,
    batchNo?: string,
    conversionFactor?: number
  ): void {
    // For items with serial numbers, always add as new line (unique serial)
    if (!serialNo) {
      const existing = items.value.find(
        (i: CartItem) =>
          i.item_code === item.item_code &&
          !i.serial_no &&
          i.uom === (uom || item.uom || item.stock_uom) &&
          i.batch_no === (batchNo || "")
      );
      if (existing) {
        const addQty = isReturnMode.value ? -Math.abs(qty) : qty;
        existing.qty += addQty;
        if (rate) existing.rate = rate;
        return;
      }
    }

    items.value.push({
      item_code: item.item_code,
      item_name: item.item_name,
      rate,
      qty: isReturnMode.value ? -Math.abs(qty) : qty,
      uom: uom || item.uom || item.stock_uom,
      stock_uom: item.stock_uom,
      image: item.image,
      discount_percentage: 0,
      discount_amount: 0,
      serial_no: serialNo || "",
      batch_no: batchNo || "",
      actual_qty: item.actual_qty || 0,
      has_serial_no: item.has_serial_no,
      has_batch_no: item.has_batch_no,
      conversion_factor: conversionFactor || 1,
    });
  }

  function removeItem(index: number): void {
    items.value.splice(index, 1);
  }

  function updateItemQty(index: number, qty: number): void {
    if (qty === 0) {
      removeItem(index);
      return;
    }
    items.value[index].qty = qty;
  }

  function updateItemRate(index: number, rate: number): void {
    items.value[index].rate = rate;
  }

  function updateItemDiscount(
    index: number,
    type: "percentage" | "amount",
    value: number
  ): void {
    if (type === "percentage") {
      items.value[index].discount_percentage = value;
      items.value[index].discount_amount = 0;
    } else {
      items.value[index].discount_amount = value;
      items.value[index].discount_percentage = 0;
    }
  }

  function updateItemUOM(index: number, uom: string, rate: number, conversionFactor: number): void {
    items.value[index].uom = uom;
    items.value[index].rate = rate;
    items.value[index].conversion_factor = conversionFactor;
  }

  function updateItemNotes(index: number, notes: string): void {
    items.value[index].posa_notes = notes;
  }

  function updateItemDeliveryDate(index: number, date: string): void {
    items.value[index].posa_delivery_date = date;
  }

  function setCustomer(cust: { name: string; customer_name?: string } | null): void {
    customer.value = cust;
  }

  function setDiscount(type: "percentage" | "amount", value: number): void {
    if (type === "percentage") {
      discountPercentage.value = value;
      discountAmount.value = 0;
    } else {
      discountAmount.value = value;
      discountPercentage.value = 0;
    }
  }

  // ── Return Mode ────────────────────────────────
  function enterReturnMode(invoiceName: string): void {
    isReturnMode.value = true;
    returnAgainst.value = invoiceName;
  }

  function exitReturnMode(): void {
    isReturnMode.value = false;
    returnAgainst.value = "";
    clearCart();
  }

  // ── Loyalty ────────────────────────────────────
  function setLoyalty(points: number, amount: number): void {
    redeemLoyaltyPoints.value = true;
    loyaltyPoints.value = points;
    loyaltyAmount.value = amount;
  }

  function clearLoyalty(): void {
    redeemLoyaltyPoints.value = false;
    loyaltyPoints.value = 0;
    loyaltyAmount.value = 0;
  }

  // ── Offers & Coupons ──────────────────────────
  function applyOffer(offer: POSOffer): void {
    if (!appliedOffers.value.find((o) => o.name === offer.name)) {
      appliedOffers.value.push(offer);
    }
  }

  function removeOffer(offerName: string): void {
    appliedOffers.value = appliedOffers.value.filter((o) => o.name !== offerName);
  }

  function applyCoupon(coupon: POSCoupon): void {
    appliedCoupon.value = coupon;
    couponCode.value = coupon.coupon_code || "";
  }

  function removeCoupon(): void {
    appliedCoupon.value = null;
    couponCode.value = "";
  }

  // ── Multi-Payment ─────────────────────────────
  function addPayment(modeOfPayment: string, amount: number): void {
    const existing = payments.value.find((p) => p.mode_of_payment === modeOfPayment);
    if (existing) {
      existing.amount += amount;
    } else {
      payments.value.push({ mode_of_payment: modeOfPayment, amount });
    }
  }

  function setPayments(paymentList: InvoicePayment[]): void {
    payments.value = paymentList;
  }

  function clearPayments(): void {
    payments.value = [];
  }

  // ── Currency ──────────────────────────────────
  function setCurrency(curr: string, rate: number): void {
    currency.value = curr;
    conversionRate.value = rate;
  }

  // ── Clear ──────────────────────────────────────
  function clearCart(): void {
    items.value = [];
    discountPercentage.value = 0;
    discountAmount.value = 0;
    clearLoyalty();
    appliedOffers.value = [];
    appliedCoupon.value = null;
    couponCode.value = "";
    writeOffAmount.value = 0;
    orderNotes.value = "";
    deliveryDate.value = "";
    authorizationCode.value = "";
    salesPerson.value = "";
    payments.value = [];
    currentDraftName.value = "";
    currency.value = "";
    conversionRate.value = 1;
  }

  function clearAll(): void {
    clearCart();
    customer.value = null;
    showPaymentDialog.value = false;
    isReturnMode.value = false;
    returnAgainst.value = "";
  }

  function openPaymentDialog(): void {
    showPaymentDialog.value = true;
  }

  function closePaymentDialog(): void {
    showPaymentDialog.value = false;
  }

  function getInvoiceData(
    posProfile: string,
    posOpeningShift: string
  ): InvoiceData {
    const data: InvoiceData = {
      pos_profile: posProfile,
      customer: customer.value?.name || "",
      items: items.value.map(
        (item: CartItem): InvoiceItem => ({
          item_code: item.item_code,
          item_name: item.item_name,
          qty: item.qty,
          rate: item.rate,
          uom: item.uom || item.stock_uom,
          discount_percentage: item.discount_percentage,
          discount_amount: item.discount_amount,
          serial_no: item.serial_no,
          batch_no: item.batch_no,
          posa_notes: item.posa_notes,
          posa_delivery_date: item.posa_delivery_date,
          posa_offers: item.posa_offers,
          posa_is_offer: item.posa_is_offer,
          posa_is_replace: item.posa_is_replace,
        })
      ),
      pos_opening_shift: posOpeningShift,
      additional_discount_percentage: discountPercentage.value,
      discount_amount: discountAmount.value,
    };

    // Payments
    if (payments.value.length > 0) {
      data.payments = payments.value;
    }

    // Notes, delivery date, auth code
    if (orderNotes.value) data.posa_notes = orderNotes.value;
    if (deliveryDate.value) data.posa_delivery_date = deliveryDate.value;
    if (authorizationCode.value) data.posa_authorization_code = authorizationCode.value;

    // Sales person
    if (salesPerson.value) data.sales_person = salesPerson.value;

    // Loyalty
    if (redeemLoyaltyPoints.value) {
      data.redeem_loyalty_points = true;
      data.loyalty_points = loyaltyPoints.value;
      data.loyalty_amount = loyaltyAmount.value;
    }

    // Return
    if (isReturnMode.value && returnAgainst.value) {
      data.is_return = true;
      data.return_against = returnAgainst.value;
    }

    // Write-off
    if (writeOffAmount.value > 0) {
      data.write_off_amount = writeOffAmount.value;
    }

    // Multi-currency
    if (currency.value && conversionRate.value !== 1) {
      data.currency = currency.value;
      data.conversion_rate = conversionRate.value;
    }

    // Coupons
    if (appliedCoupon.value) {
      data.posa_coupons = JSON.stringify([appliedCoupon.value.name]);
    }

    // Offers
    if (appliedOffers.value.length > 0) {
      data.posa_offers = JSON.stringify(appliedOffers.value.map((o) => o.name));
    }

    return data;
  }

  return {
    // State
    items,
    customer,
    discountPercentage,
    discountAmount,
    showPaymentDialog,
    isReturnMode,
    returnAgainst,
    orderNotes,
    deliveryDate,
    authorizationCode,
    writeOffAmount,
    salesPerson,
    redeemLoyaltyPoints,
    loyaltyPoints,
    loyaltyAmount,
    appliedOffers,
    appliedCoupon,
    couponCode,
    payments,
    currentDraftName,
    isSavingDraft,
    currency,
    conversionRate,
    // Computed
    itemCount,
    subtotal,
    taxRate,
    taxAmount,
    grandTotal,
    isEmpty,
    customerName,
    totalPayments,
    remainingPayment,
    hasOffers,
    // Actions
    addItem,
    addItemWithDetails,
    removeItem,
    updateItemQty,
    updateItemRate,
    updateItemDiscount,
    updateItemUOM,
    updateItemNotes,
    updateItemDeliveryDate,
    setCustomer,
    setDiscount,
    enterReturnMode,
    exitReturnMode,
    setLoyalty,
    clearLoyalty,
    applyOffer,
    removeOffer,
    applyCoupon,
    removeCoupon,
    addPayment,
    setPayments,
    clearPayments,
    setCurrency,
    clearCart,
    clearAll,
    openPaymentDialog,
    closePaymentDialog,
    getInvoiceData,
  };
});
