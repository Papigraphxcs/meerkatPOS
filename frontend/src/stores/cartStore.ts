import { defineStore } from "pinia";
import { ref, computed, type Ref, type ComputedRef } from "vue";
import { usePosStore } from "./posStore";
import type { CartItem, POSItem, InvoiceData, InvoiceItem } from "@/types/pos.types";

export const useCartStore = defineStore("cart", () => {
  // ─── State ─────────────────────────────────────
  const items: Ref<CartItem[]> = ref([]);
  const customer: Ref<{ name: string; customer_name?: string } | null> = ref(null);
  const discountPercentage: Ref<number> = ref(0);
  const discountAmount: Ref<number> = ref(0);
  const showPaymentDialog: Ref<boolean> = ref(false);

  // ─── Computed ──────────────────────────────────
  const itemCount: ComputedRef<number> = computed(() =>
    items.value.reduce((sum: number, item: CartItem) => sum + item.qty, 0)
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
    // For now return 0 - tax is calculated server-side
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
    return Math.max(0, total);
  });

  const isEmpty: ComputedRef<boolean> = computed(() => items.value.length === 0);

  const customerName: ComputedRef<string> = computed(() => {
    if (!customer.value) return "Walk-in Customer";
    return customer.value.customer_name || customer.value.name;
  });

  // ─── Actions ───────────────────────────────────
  function addItem(item: POSItem): void {
    const existing = items.value.find(
      (i: CartItem) =>
        i.item_code === item.item_code && !i.serial_no && !i.batch_no
    );

    if (existing) {
      existing.qty += 1;
    } else {
      items.value.push({
        item_code: item.item_code,
        item_name: item.item_name,
        rate: item.rate || 0,
        qty: 1,
        uom: item.uom || item.stock_uom,
        stock_uom: item.stock_uom,
        image: item.image,
        discount_percentage: 0,
        discount_amount: 0,
        serial_no: item.serial_no || "",
        batch_no: item.batch_no || "",
        actual_qty: item.actual_qty || 0,
      });
    }
  }

  function removeItem(index: number): void {
    items.value.splice(index, 1);
  }

  function updateItemQty(index: number, qty: number): void {
    if (qty <= 0) {
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

  function clearCart(): void {
    items.value = [];
    discountPercentage.value = 0;
    discountAmount.value = 0;
  }

  function clearAll(): void {
    clearCart();
    customer.value = null;
    showPaymentDialog.value = false;
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
    return {
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
        })
      ),
      pos_opening_shift: posOpeningShift,
      additional_discount_percentage: discountPercentage.value,
      discount_amount: discountAmount.value,
    };
  }

  return {
    // State
    items,
    customer,
    discountPercentage,
    discountAmount,
    showPaymentDialog,
    // Computed
    itemCount,
    subtotal,
    taxRate,
    taxAmount,
    grandTotal,
    isEmpty,
    customerName,
    // Actions
    addItem,
    removeItem,
    updateItemQty,
    updateItemRate,
    updateItemDiscount,
    setCustomer,
    setDiscount,
    clearCart,
    clearAll,
    openPaymentDialog,
    closePaymentDialog,
    getInvoiceData,
  };
});
