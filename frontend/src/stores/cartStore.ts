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
  TaxDetail,
} from "@/types/pos.types";

// Tax breakdown for display
export interface CalculatedTax {
  description: string;
  rate: number;
  amount: number;
  included_in_print_rate: boolean;
}

export const useCartStore = defineStore("cart", () => {
  // ─── State ─────────────────────────────────────
  const items: Ref<CartItem[]> = ref([]);
  const customer: Ref<{ name: string; customer_name?: string; image?: string; mobile_no?: string; email_id?: string } | null> = ref(null);
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
      let discount = 0;
      if (item.discount_percentage) {
        // Percentage discount works correctly for both positive and negative totals
        discount = (itemTotal * item.discount_percentage) / 100;
      } else if (item.discount_amount) {
        // For amount discount on return items (negative qty), we need to negate the discount
        // so that subtracting it reduces the refund amount
        discount = item.qty < 0 ? -item.discount_amount : item.discount_amount;
      }
      return sum + (itemTotal - discount);
    }, 0)
  );

  // Calculate individual tax amounts based on tax template
  // Supports item-level tax templates: when an item has an item_tax_map,
  // its tax rate overrides the global POS profile rate for matching account heads.
  const calculatedTaxes: ComputedRef<CalculatedTax[]> = computed(() => {
    const posStore = usePosStore();
    const taxDetails = posStore.taxes || [];
    const taxInclusive = posStore.taxInclusiveMode;

    // Compute per-item net amount (after item discounts)
    const itemNets: { net: number; taxMap: Record<string, number> | undefined }[] = [];
    for (const item of items.value) {
      const itemTotal = item.qty * item.rate;
      let discount = 0;
      if (item.discount_percentage) {
        discount = (itemTotal * item.discount_percentage) / 100;
      } else if (item.discount_amount) {
        discount = item.qty < 0 ? -item.discount_amount : item.discount_amount;
      }
      itemNets.push({
        net: itemTotal - discount,
        taxMap: item.item_tax_map,
      });
    }

    if (itemNets.length === 0) return [];

    const result: CalculatedTax[] = [];

    for (const tax of taxDetails) {
      const isIncluded = tax.included_in_print_rate === 1;
      let totalTaxAmount = 0;

      // Calculate tax per-item to respect item-level overrides
      for (const { net, taxMap } of itemNets) {
        // Determine effective rate for this item & tax account
        let effectiveRate = tax.rate;
        if (taxMap && tax.account_head in taxMap) {
          effectiveRate = taxMap[tax.account_head];
        }

        if (tax.charge_type === "On Net Total") {
          if (taxInclusive && isIncluded) {
            totalTaxAmount += (net * effectiveRate) / (100 + effectiveRate);
          } else if (!isIncluded) {
            totalTaxAmount += (net * effectiveRate) / 100;
          }
        }
      }

      // Actual (fixed) taxes are not per-item
      if (tax.charge_type === "Actual") {
        totalTaxAmount = tax.rate;
      }

      if (totalTaxAmount !== 0) {
        result.push({
          description: tax.description || "Tax",
          rate: tax.rate,
          amount: Math.round(totalTaxAmount * 100) / 100,
          included_in_print_rate: isIncluded,
        });
      }
    }

    // Also collect taxes from item_tax_maps that don't exist in the POS profile taxes.
    // These are item-specific tax accounts not in the global template.
    const profileAccountHeads = new Set(taxDetails.map((t) => t.account_head));
    const extraTaxAccounts: Map<string, number> = new Map();

    for (const { net, taxMap } of itemNets) {
      if (!taxMap) continue;
      for (const [accountHead, rate] of Object.entries(taxMap)) {
        if (profileAccountHeads.has(accountHead)) continue;
        const taxAmount = (net * rate) / 100;
        extraTaxAccounts.set(
          accountHead,
          (extraTaxAccounts.get(accountHead) || 0) + taxAmount
        );
      }
    }

    for (const [accountHead, amount] of extraTaxAccounts) {
      if (amount !== 0) {
        const desc = accountHead.split(" - ")[0] || "Tax";
        result.push({
          description: desc,
          rate: 0,
          amount: Math.round(amount * 100) / 100,
          included_in_print_rate: false,
        });
      }
    }

    return result;
  });

  // Total tax that is NOT included in prices (to be added)
  const taxAmount: ComputedRef<number> = computed(() => {
    return calculatedTaxes.value
      .filter((t) => !t.included_in_print_rate)
      .reduce((sum, t) => sum + t.amount, 0);
  });

  // Total tax that IS included in prices (for display only)
  const includedTaxAmount: ComputedRef<number> = computed(() => {
    return calculatedTaxes.value
      .filter((t) => t.included_in_print_rate)
      .reduce((sum, t) => sum + t.amount, 0);
  });

  // Total of all taxes (for display)
  const totalTaxAmount: ComputedRef<number> = computed(() => {
    return calculatedTaxes.value.reduce((sum, t) => sum + t.amount, 0);
  });

  const grandTotal: ComputedRef<number> = computed(() => {
    const posStore = usePosStore();
    let total = subtotal.value + taxAmount.value;
    if (discountPercentage.value > 0) {
      total -= (total * discountPercentage.value) / 100;
    } else if (discountAmount.value > 0) {
      total -= discountAmount.value;
    }
    // Subtract loyalty amount (not applicable for returns)
    if (!isReturnMode.value && redeemLoyaltyPoints.value && loyaltyAmount.value > 0) {
      total -= loyaltyAmount.value;
    }
    // Subtract write-off (not applicable for returns)
    if (!isReturnMode.value && writeOffAmount.value > 0) {
      total -= writeOffAmount.value;
    }
    // For returns, allow negative total; for regular sales, ensure non-negative
    total = isReturnMode.value ? total : Math.max(0, total);
    // Apply rounding unless disabled in Global Defaults
    if (!posStore.disableRoundedTotal && total !== 0) {
      total = Math.round(total);
    }
    return total;
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

  /**
   * Check if item can be added to cart based on stock availability
   * Returns true if item can be added, false otherwise
   */
  function canAddItem(item: POSItem): { allowed: boolean; message?: string } {
    const posStore = usePosStore();
    const allowNegativeStock = posStore.stockSettings?.allow_negative_stock;

    // If negative stock is allowed, always permit adding
    if (allowNegativeStock) {
      return { allowed: true };
    }

    // Check available quantity
    const actualQty = item.actual_qty ?? 0;
    if (actualQty <= 0) {
      return {
        allowed: false,
        message: `${item.item_name} is out of stock`
      };
    }

    // Check if adding would exceed available stock
    const existingItem = items.value.find(
      (i: CartItem) =>
        i.item_code === item.item_code && !i.serial_no && !i.batch_no
    );
    const currentQtyInCart = existingItem?.qty || 0;

    if (currentQtyInCart + 1 > actualQty) {
      return {
        allowed: false,
        message: `Only ${actualQty} ${item.uom || item.stock_uom} of ${item.item_name} available`
      };
    }

    return { allowed: true };
  }

  function addItem(item: POSItem): { success: boolean; message?: string } {
    // Check stock availability before adding
    const stockCheck = canAddItem(item);
    if (!stockCheck.allowed && !isReturnMode.value) {
      return { success: false, message: stockCheck.message };
    }

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

    return { success: true };
  }

  /**
   * Check if item with specific details can be added
   */
  function canAddItemWithDetails(
    item: POSItem,
    qty: number,
    batchNo?: string
  ): { allowed: boolean; message?: string } {
    const posStore = usePosStore();
    const allowNegativeStock = posStore.stockSettings?.allow_negative_stock;

    if (allowNegativeStock) {
      return { allowed: true };
    }

    const actualQty = item.actual_qty ?? 0;
    if (actualQty <= 0) {
      return {
        allowed: false,
        message: `${item.item_name} is out of stock`
      };
    }

    // For batch items, the qty check should be against actual_qty
    // For regular items, sum up existing qty in cart
    const existingItems = items.value.filter(
      (i: CartItem) =>
        i.item_code === item.item_code &&
        (!batchNo || i.batch_no === batchNo)
    );
    const currentQtyInCart = existingItems.reduce((sum, i) => sum + i.qty, 0);

    if (currentQtyInCart + qty > actualQty) {
      return {
        allowed: false,
        message: `Only ${actualQty - currentQtyInCart} ${item.uom || item.stock_uom} of ${item.item_name} available`
      };
    }

    return { allowed: true };
  }

  function addItemWithDetails(
    item: POSItem,
    qty: number,
    rate: number,
    uom?: string,
    serialNo?: string,
    batchNo?: string,
    conversionFactor?: number
  ): { success: boolean; message?: string } {
    // Check stock availability before adding (skip for return mode and serial items)
    if (!isReturnMode.value && !serialNo) {
      const stockCheck = canAddItemWithDetails(item, qty, batchNo);
      if (!stockCheck.allowed) {
        return { success: false, message: stockCheck.message };
      }
    }

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
        return { success: true };
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

    return { success: true };
  }

  function removeItem(index: number): void {
    items.value.splice(index, 1);
  }

  function updateItemQty(index: number, qty: number): { success: boolean; message?: string } {
    if (qty === 0) {
      removeItem(index);
      return { success: true };
    }

    const item = items.value[index];
    if (!item) return { success: false, message: "Item not found" };

    // Validate stock when increasing quantity (not in return mode)
    if (!isReturnMode.value && qty > item.qty) {
      const posStore = usePosStore();
      const allowNegativeStock = posStore.stockSettings?.allow_negative_stock;

      if (!allowNegativeStock) {
        const actualQty = item.actual_qty ?? 0;
        if (qty > actualQty) {
          return {
            success: false,
            message: `Only ${actualQty} ${item.uom || item.stock_uom} of ${item.item_name} available`
          };
        }
      }
    }

    items.value[index].qty = qty;
    return { success: true };
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
    items.value[index].pos_notes = notes;
  }

  function updateItemDeliveryDate(index: number, date: string): void {
    items.value[index].pos_delivery_date = date;
  }

  function setCustomer(cust: { name: string; customer_name?: string; image?: string; mobile_no?: string; email_id?: string } | null): void {
    customer.value = cust;
  }

  /**
   * Set item-level tax template and tax map for a cart item.
   * Called after the backend resolves the applicable tax template.
   */
  function setItemTax(
    itemCode: string,
    taxTemplate: string,
    taxMap: Record<string, number>
  ): void {
    const item = items.value.find((i: CartItem) => i.item_code === itemCode);
    if (item) {
      item.item_tax_template = taxTemplate;
      item.item_tax_map = taxMap;
    }
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

  /**
   * Load items from an existing invoice into the cart (repeat invoice).
   * Clears the current cart first, then adds all items from the invoice.
   */
  function loadFromInvoice(invoiceData: {
    customer: string;
    customer_name: string;
    items: Array<{
      item_code: string;
      item_name: string;
      qty: number;
      rate: number;
      uom: string;
      stock_uom?: string;
      discount_percentage?: number;
      discount_amount?: number;
      serial_no?: string;
      batch_no?: string;
    }>;
  }): void {
    clearCart();
    customer.value = {
      name: invoiceData.customer,
      customer_name: invoiceData.customer_name,
    };
    for (const item of invoiceData.items) {
      items.value.push({
        item_code: item.item_code,
        item_name: item.item_name,
        rate: item.rate || 0,
        qty: item.qty || 1,
        uom: item.uom || item.stock_uom || "",
        stock_uom: item.stock_uom || item.uom || "",
        image: "",
        discount_percentage: item.discount_percentage || 0,
        discount_amount: item.discount_amount || 0,
        serial_no: item.serial_no || "",
        batch_no: item.batch_no || "",
        actual_qty: 0,
        has_serial_no: false,
        has_batch_no: false,
        conversion_factor: 1,
      } as CartItem);
    }
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
          item_tax_template: item.item_tax_template,
          custom_additional_notes: item.pos_notes,
          custom_delivery_date: item.pos_delivery_date,
          custom_offers: item.pos_offers,
          custom_is_offer: item.pos_is_offer,
          custom_is_replace: item.pos_is_replace,
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
    if (orderNotes.value) data.custom_pos_notes = orderNotes.value;
    if (deliveryDate.value) data.custom_pos_delivery_date = deliveryDate.value;
    if (authorizationCode.value) data.custom_authorization_code = authorizationCode.value;

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

    // Coupons — send both legacy JSON and structured detail rows
    if (appliedCoupon.value) {
      data.custom_coupons = JSON.stringify([appliedCoupon.value.name]);
      data.custom_coupons_detail = [{
        coupon: appliedCoupon.value.name,
        coupon_code: appliedCoupon.value.coupon_code || couponCode.value,
        type: (appliedCoupon.value as Record<string, unknown>).coupon_type || "Promotional",
        pos_offer: (appliedCoupon.value as Record<string, unknown>).pos_offer || "",
        applied: 1,
        customer: customer.value?.name || "",
      }];
    }

    // Offers — send both legacy JSON and structured detail rows
    if (appliedOffers.value.length > 0) {
      data.custom_offers = JSON.stringify(appliedOffers.value.map((o) => o.name));
      data.custom_offers_detail = appliedOffers.value.map((o) => ({
        offer_name: o.name,
        offer: (o as Record<string, unknown>).offer || (o as Record<string, unknown>).offer_type || "",
        apply_on: o.apply_on || "",
        offer_applied: 1,
        coupon_based: (o as Record<string, unknown>).coupon_based ? 1 : 0,
      }));
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
    calculatedTaxes,
    taxAmount,
    includedTaxAmount,
    totalTaxAmount,
    grandTotal,
    isEmpty,
    customerName,
    totalPayments,
    remainingPayment,
    hasOffers,
    // Actions
    canAddItem,
    canAddItemWithDetails,
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
    setItemTax,
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
    loadFromInvoice,
  };
});
