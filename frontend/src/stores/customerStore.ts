import { defineStore } from "pinia";
import { ref, computed, type Ref, type ComputedRef } from "vue";
import { call } from "@/services/api";
import type { Customer } from "@/types/pos.types";

export const useCustomerStore = defineStore("customers", () => {
  // ─── State ─────────────────────────────────────
  const customers: Ref<Customer[]> = ref([]);
  const isLoading: Ref<boolean> = ref(false);
  const searchTerm: Ref<string> = ref("");
  const showCustomerDialog: Ref<boolean> = ref(false);
  const showNewCustomerForm: Ref<boolean> = ref(false);

  // ─── Computed ──────────────────────────────────
  const filteredCustomers: ComputedRef<Customer[]> = computed(
    () => customers.value
  );

  // ─── Actions ───────────────────────────────────
  async function searchCustomers(term = ""): Promise<void> {
    isLoading.value = true;
    try {
      const result = await call<Customer[]>(
        "xpos.api.customers.get_customers",
        {
          search_term: term || searchTerm.value,
          limit: 20,
        }
      );
      customers.value = result || [];
    } catch (error) {
      console.error("Error searching customers:", error);
      customers.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  async function createCustomer(
    data: Record<string, unknown>
  ): Promise<Customer> {
    try {
      const result = await call<Customer>(
        "xpos.api.customers.create_customer",
        data
      );
      showNewCustomerForm.value = false;
      return result;
    } catch (error) {
      console.error("Error creating customer:", error);
      throw error;
    }
  }

  async function getCustomerInfo(
    customerName: string
  ): Promise<Customer | null> {
    try {
      const result = await call<Customer>(
        "xpos.api.customers.get_customer_info",
        {
          customer: customerName,
        }
      );
      return result;
    } catch (error) {
      console.error("Error fetching customer info:", error);
      return null;
    }
  }

  return {
    customers,
    isLoading,
    searchTerm,
    showCustomerDialog,
    showNewCustomerForm,
    filteredCustomers,
    searchCustomers,
    createCustomer,
    getCustomerInfo,
  };
});
