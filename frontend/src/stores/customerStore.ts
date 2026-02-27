import { defineStore } from "pinia";
import { ref, computed, type Ref, type ComputedRef } from "vue";
import { call } from "@/services/api";
import type {
  Customer,
  CustomerAddress,
  CustomerCredit,
  SalesPerson,
} from "@/types/pos.types";

export const useCustomerStore = defineStore("customers", () => {
  // ─── State ─────────────────────────────────────
  const customers: Ref<Customer[]> = ref([]);
  const isLoading: Ref<boolean> = ref(false);
  const searchTerm: Ref<string> = ref("");
  const showCustomerDialog: Ref<boolean> = ref(false);
  const showNewCustomerForm: Ref<boolean> = ref(false);

  // Customer detail state
  const selectedCustomerInfo: Ref<Customer | null> = ref(null);
  const customerAddresses: Ref<CustomerAddress[]> = ref([]);
  const customerCredit: Ref<CustomerCredit | null> = ref(null);
  const isLoadingDetail: Ref<boolean> = ref(false);

  // Sales persons
  const salesPersons: Ref<SalesPerson[]> = ref([]);

  // ─── Computed ──────────────────────────────────
  const filteredCustomers: ComputedRef<Customer[]> = computed(
    () => customers.value
  );

  const hasCredit: ComputedRef<boolean> = computed(
    () => (customerCredit.value?.total_credit || 0) > 0
  );

  // ─── Actions ───────────────────────────────────
  async function searchCustomers(term = "", posProfile?: string): Promise<void> {
    isLoading.value = true;
    try {
      const result = await call<Customer[]>(
        "xpos.api.customers.get_customers",
        {
          search_term: term || searchTerm.value,
          pos_profile: posProfile || "",
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

  async function updateCustomer(
    customerName: string,
    data: Record<string, unknown>
  ): Promise<Customer> {
    try {
      const result = await call<Customer>(
        "xpos.api.customers.update_customer",
        { customer: customerName, ...data }
      );
      return result;
    } catch (error) {
      console.error("Error updating customer:", error);
      throw error;
    }
  }

  async function getCustomerInfo(
    customerName: string
  ): Promise<Customer | null> {
    isLoadingDetail.value = true;
    try {
      const result = await call<Customer>(
        "xpos.api.customers.get_customer_info",
        {
          customer: customerName,
        }
      );
      selectedCustomerInfo.value = result;
      return result;
    } catch (error) {
      console.error("Error fetching customer info:", error);
      return null;
    } finally {
      isLoadingDetail.value = false;
    }
  }

  async function fetchAddresses(customerName: string): Promise<CustomerAddress[]> {
    try {
      const result = await call<CustomerAddress[]>(
        "xpos.api.customers.get_customer_addresses",
        { customer: customerName }
      );
      customerAddresses.value = result || [];
      return customerAddresses.value;
    } catch (error) {
      console.error("Error fetching addresses:", error);
      return [];
    }
  }

  async function createAddress(data: Record<string, unknown>): Promise<CustomerAddress> {
    try {
      const result = await call<CustomerAddress>(
        "xpos.api.customers.make_address",
        data
      );
      return result;
    } catch (error) {
      console.error("Error creating address:", error);
      throw error;
    }
  }

  async function fetchCredit(customerName: string, company?: string): Promise<CustomerCredit | null> {
    try {
      const result = await call<CustomerCredit>(
        "xpos.api.customers.get_customer_credit",
        {
          customer: customerName,
          company: company || "",
        }
      );
      customerCredit.value = result;
      return result;
    } catch (error) {
      console.error("Error fetching credit:", error);
      return null;
    }
  }

  async function fetchSalesPersons(): Promise<SalesPerson[]> {
    try {
      const result = await call<SalesPerson[]>(
        "xpos.api.customers.get_sales_person_names"
      );
      salesPersons.value = result || [];
      return salesPersons.value;
    } catch (error) {
      console.error("Error fetching sales persons:", error);
      return [];
    }
  }

  function clearDetail(): void {
    selectedCustomerInfo.value = null;
    customerAddresses.value = [];
    customerCredit.value = null;
  }

  return {
    // State
    customers,
    isLoading,
    searchTerm,
    showCustomerDialog,
    showNewCustomerForm,
    selectedCustomerInfo,
    customerAddresses,
    customerCredit,
    isLoadingDetail,
    salesPersons,
    // Computed
    filteredCustomers,
    hasCredit,
    // Actions
    searchCustomers,
    createCustomer,
    updateCustomer,
    getCustomerInfo,
    fetchAddresses,
    createAddress,
    fetchCredit,
    fetchSalesPersons,
    clearDetail,
  };
});
