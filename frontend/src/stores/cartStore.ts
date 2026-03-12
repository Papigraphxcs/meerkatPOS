import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { call } from "@/services/api";
import { usePosStore } from "./posStore";
import { getCachedItemByCode, getCachedStockForItem } from "@/services/dbBridge";
import type {
  CartItem,
  POSItem,
  InvoiceData,
  InvoiceItem,
  InvoicePayment,
  POSOffer,
  POSCoupon,
  CalculatedTax,
  DeliveryCharge,
} from "@/types/pos.types";
import __ from "@/lib/translate";

export const useCartStore = defineStore("cart", () => {
  const items = ref<CartItem[]>([]);
  const customer = ref<{ name: string; customer_name?: string; image?: string; mobile_no?: string; email_id?: string } | null>(null);
  const discountPercentage = ref(0);
  const discountAmount = ref(0);
  const showPaymentDialog = ref(false);
  const posStore = usePosStore();
  const isReturnMode = ref(false);
  const returnAgainst = ref("");
  const orderNotes = ref("");
  const deliveryDate = ref("");
  const authorizationCode = ref("");
  const writeOffAmount = ref(0);
  const salesPerson = ref("");
  const redeemLoyaltyPoints = ref(false);
  const loyaltyPoints = ref(0);
  const loyaltyAmount = ref(0);
  const appliedOffers = ref<POSOffer[]>([]);
  const appliedCoupon = ref<POSCoupon | null>(null);
  const couponCode = ref("");
  const payments = ref<InvoicePayment[]>([]);
  const currentDraftName = ref("");
  const isSavingDraft = ref(false);
  const showDraftDialog = ref(false);
  const isLoadingDrafts = ref(false);
  const currency = ref("");
  const conversionRate = ref(1);
  const selectedDeliveryCharge = ref<DeliveryCharge | null>(null);

  const itemCount = computed(() =>
    items.value.reduce((sum: number, item: CartItem) => sum + Math.abs(item.qty), 0)
  );

  const subtotal = computed(() =>
    items.value.reduce((sum: number, item: CartItem) => {
      const itemTotal = item.qty * item.rate;
      let discount = 0;
      if (item.discount_percentage) {
        discount = (itemTotal * item.discount_percentage) / 100;
      } else if (item.discount_amount) {
        discount = item.qty < 0 ? -item.discount_amount : item.discount_amount;
      }
      return sum + (itemTotal - discount);
    }, 0)
  );

  const calculatedTaxes = computed(() => {
    const posStore = usePosStore();
    const taxDetails = posStore.taxes || [];
    const taxInclusive = posStore.taxInclusiveMode;

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

      for (const { net, taxMap } of itemNets) {
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

  const taxAmount = computed(() => {
    return calculatedTaxes.value
      .filter((t) => !t.included_in_print_rate)
      .reduce((sum, t) => sum + t.amount, 0);
  });

  const includedTaxAmount = computed(() => {
    return calculatedTaxes.value
      .filter((t) => t.included_in_print_rate)
      .reduce((sum, t) => sum + t.amount, 0);
  });

  const totalTaxAmount = computed(() => {
    return calculatedTaxes.value.reduce((sum, t) => sum + t.amount, 0);
  });

  const grandTotal = computed(() => {
    const posStore = usePosStore();
    let total = subtotal.value + taxAmount.value;
    if (discountPercentage.value > 0) {
      total -= (total * discountPercentage.value) / 100;
    } else if (discountAmount.value > 0) {
      total -= discountAmount.value;
    }
    if (!isReturnMode.value && redeemLoyaltyPoints.value && loyaltyAmount.value > 0) {
      total -= loyaltyAmount.value;
    }
    if (!isReturnMode.value && writeOffAmount.value > 0) {
      total -= writeOffAmount.value;
    }
    if (!isReturnMode.value && selectedDeliveryCharge.value) {
      total += selectedDeliveryCharge.value.rate || 0;
    }
    total = isReturnMode.value ? total : Math.max(0, total);
    if (!posStore.disableRoundedTotal && total !== 0) {
      total = Math.round(total);
    }
    return total;
  });

  const isEmpty = computed(() => items.value.length === 0);

  const customerName = computed(() => {
    if (!customer.value) return "Walk-in Customer";
    return customer.value.customer_name || customer.value.name;
  });

  const totalPayments = computed(() =>
    payments.value.reduce((sum, p) => sum + (p.amount || 0), 0)
  );

  const remainingPayment = computed(() =>
    Math.max(0, grandTotal.value - totalPayments.value)
  );

  const hasOffers = computed(
    () => appliedOffers.value.length > 0 || !!appliedCoupon.value
  );
  
  function canAddItem(item: POSItem): { allowed: boolean; message?: string } {
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
    if (!isReturnMode.value && !serialNo) {
      const stockCheck = canAddItemWithDetails(item, qty, batchNo);
      if (!stockCheck.allowed) {
        return { success: false, message: stockCheck.message };
      }
    }

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
    if (!item) return { success: false, message: __("Item not found") };

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

  function enterReturnMode(invoiceName: string): void {
    isReturnMode.value = true;
    returnAgainst.value = invoiceName;
  }

  function exitReturnMode(): void {
    isReturnMode.value = false;
    returnAgainst.value = "";
    clearCart();
  }

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

  function setCurrency(curr: string, rate: number): void {
    currency.value = curr;
    conversionRate.value = rate;
  }
  
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
    selectedDeliveryCharge.value = null;
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
   * Fetch available draft invoices from the backend
   */
  async function fetchDraftInvoices(): Promise<any[]> {
    try {
      isLoadingDrafts.value = true;
      const result = await call<any[]>(
        "xpos.api.invoices.get_draft_invoices",
        {
          pos_opening_shift: posStore.posOpeningShift?.name || ""
        }
      );
      return result || [];
    } catch (error) {
      console.error("Error fetching draft invoices:", error);
      return [];
    } finally {
      isLoadingDrafts.value = false;
    }
  }

  /**
   * Load a draft invoice into the cart
   */
  async function loadDraftInvoice(draftName: string): Promise<boolean> {
    try {
      const result = await call<any>(
        "xpos.api.invoices.get_invoice_details",
        {
          invoice_name: draftName
        }
      );
      
      if (!result) {
        return false;
      }

      // Clear current cart
      clearCart();
      
      // Set customer if available
      if (result.customer) {
        customer.value = {
          name: result.customer,
          customer_name: result.customer_name || result.customer,
        };
      }

      if (result.items && Array.isArray(result.items)) {
        const posStore = usePosStore();
        const warehouse = posStore.warehouse || "";

        const { useItemStore } = await import("@/stores/itemStore");
        const itemStore = useItemStore();
        const inMemoryMap = new Map<string, number>(
          itemStore.items.map((i: POSItem) => [i.item_code, i.actual_qty ?? 0])
        );

        for (const item of result.items) {
          let actualQty: number = inMemoryMap.get(item.item_code) ?? -1;

          if (actualQty < 0) {
            if (warehouse) {
              const stockEntry = await getCachedStockForItem(warehouse, item.item_code);
              if (stockEntry) {
                actualQty = stockEntry.actual_qty;
              }
            }

            if (actualQty < 0) {
              const cachedItem = await getCachedItemByCode(item.item_code);
              actualQty = cachedItem?.actual_qty ?? 0;
            }
          }

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
            actual_qty: actualQty,
            has_serial_no: item.has_serial_no || false,
            has_batch_no: item.has_batch_no || false,
            conversion_factor: 1,
            pos_notes: item.additional_notes || "",
            pos_delivery_date: item.delivery_date || "",
          } as CartItem);
        }
      }

      if (result.additional_discount_percentage) {
        discountPercentage.value = result.additional_discount_percentage;
      }
      if (result.discount_amount) {
        discountAmount.value = result.discount_amount;
      }
      if (result.pos_notes) {
        orderNotes.value = result.pos_notes;
      }
      if (result.pos_delivery_date) {
        deliveryDate.value = result.pos_delivery_date;
      }
      if (result.authorization_code) {
        authorizationCode.value = result.authorization_code;
      }
      currentDraftName.value = draftName;
      
      return true;
    } catch (error) {
      console.error("Error loading draft invoice:", error);
      return false;
    }
  }

  function openDraftDialog(): void {
    showDraftDialog.value = true;
  }

  function closeDraftDialog(): void {
    showDraftDialog.value = false;
  }

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
          additional_notes: item.pos_notes,
          delivery_date: item.pos_delivery_date,
          offers: item.pos_offers,
          is_offer: item.pos_is_offer,
          is_replace: item.pos_is_replace,
        })
      ),
      pos_opening_shift: posOpeningShift,
      additional_discount_percentage: discountPercentage.value,
      discount_amount: discountAmount.value,
    };

    if (currentDraftName.value) {
      data.name = currentDraftName.value;
    }

    // Payments
    if (payments.value.length > 0) {
      data.payments = payments.value;
    }

    // Notes, delivery date, auth code
    if (orderNotes.value) data.pos_notes = orderNotes.value;
    if (deliveryDate.value) data.pos_delivery_date = deliveryDate.value;
    if (authorizationCode.value) data.authorization_code = authorizationCode.value;

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

    if (appliedCoupon.value) {
      data.coupons = JSON.stringify([appliedCoupon.value.name]);
      data.coupons_detail = [{
        coupon: appliedCoupon.value.name,
        coupon_code: appliedCoupon.value.coupon_code || couponCode.value,
        type: (appliedCoupon.value as Record<string, unknown>).coupon_type || "Promotional",
        pos_offer: (appliedCoupon.value as Record<string, unknown>).pos_offer || "",
        applied: 1,
        customer: customer.value?.name || "",
      }];
    }

    if (appliedOffers.value.length > 0) {
      data.offers = JSON.stringify(appliedOffers.value.map((o) => o.name));
      data.offers_detail = appliedOffers.value.map((o) => ({
        offer_name: o.name,
        offer: (o as Record<string, unknown>).offer || (o as Record<string, unknown>).offer_type || "",
        apply_on: o.apply_on || "",
        offer_applied: 1,
        coupon_based: (o as Record<string, unknown>).coupon_based ? 1 : 0,
      }));
    }

    if (selectedDeliveryCharge.value) {
      data.pos_delivery_charges = selectedDeliveryCharge.value.name;
      data.pos_delivery_charges_rate = selectedDeliveryCharge.value.rate;
    }

    return data;
  }

  function setDeliveryCharge(charge: DeliveryCharge | null): void {
    selectedDeliveryCharge.value = charge;
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
    showDraftDialog,
    isLoadingDrafts,
    currency,
    conversionRate,
    selectedDeliveryCharge,
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
    fetchDraftInvoices,
    loadDraftInvoice,
    openDraftDialog,
    closeDraftDialog,
    setDeliveryCharge,
  };
});
