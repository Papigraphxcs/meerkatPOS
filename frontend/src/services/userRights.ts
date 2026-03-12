/**
 * User Rights / Permissions Service
 *
 * Mirrors deskpos UserRights.cs — checks role-based POS permissions
 * stored in the local `pos_users` table (synced from ERPNext).
 *
 * Permissions are fetched once at login and cached in-memory.
 * The POS profile and user role determine what actions are allowed.
 */

import { ref, computed } from "vue";
import { isElectron } from "./electronBridge";

export interface PosPermissions {
  // Billing
  close_bill: boolean;
  allow_reprint_invoice: boolean;
  allow_cancel_invoice: boolean;
  unsettled_invoices: boolean;
  // Pricing / Discounts
  apply_additional_discount: boolean;
  apply_standard_discount: boolean;
  show_edit_discount_field: boolean;
  edit_tax_template: boolean;
  allow_change_price: boolean;
  // Sales
  quotation: boolean;
  sale_return: boolean;
  // Purchasing
  local_purchase: boolean;
  purchase_order: boolean;
  purchase_invoice: boolean;
  // Inventory
  stock_adjustment: boolean;
  stock_entry: boolean;
  near_expiry_items: boolean;
  // Finance
  expense: boolean;
  bank_drop: boolean;
  // List Views
  list_of_invoices: boolean;
  list_of_cancelled_invoices: boolean;
  list_of_errors: boolean;
  list_of_purchase_invoices: boolean;
  list_of_quotations: boolean;
  list_of_stock_entries: boolean;
  list_of_local_purchases: boolean;
  list_of_stock_adjustments: boolean;
  list_of_expense: boolean;
  list_of_bank_drops: boolean;
  // Reports
  invoice_settlement_report: boolean;
  sales_report_by_time: boolean;
  sales_summary_by_hour: boolean;
  current_stock_by_brand: boolean;
  stock_register: boolean;
  current_stock_report: boolean;
}

const DEFAULT_PERMISSIONS: PosPermissions = {
  close_bill: true,
  allow_reprint_invoice: false,
  allow_cancel_invoice: false,
  unsettled_invoices: false,
  apply_additional_discount: false,
  apply_standard_discount: false,
  show_edit_discount_field: false,
  edit_tax_template: false,
  allow_change_price: false,
  quotation: false,
  sale_return: false,
  local_purchase: false,
  purchase_order: false,
  purchase_invoice: false,
  stock_adjustment: false,
  stock_entry: false,
  near_expiry_items: false,
  expense: false,
  bank_drop: false,
  list_of_invoices: true,
  list_of_cancelled_invoices: false,
  list_of_errors: false,
  list_of_purchase_invoices: false,
  list_of_quotations: false,
  list_of_stock_entries: false,
  list_of_local_purchases: false,
  list_of_stock_adjustments: false,
  list_of_expense: false,
  list_of_bank_drops: false,
  invoice_settlement_report: false,
  sales_report_by_time: false,
  sales_summary_by_hour: false,
  current_stock_by_brand: false,
  stock_register: false,
  current_stock_report: false,
};

const currentRole = ref<string>("");
const permissions = ref<PosPermissions>({ ...DEFAULT_PERMISSIONS });
const isLoaded = ref(false);

/**
 * Load permissions for the given user role.
 * In Electron mode, reads from the `pos_users` table which contains
 * the user's role and permission flags synced from ERPNext.
 * In browser mode, grants all permissions (online validation via Frappe).
 */
export async function loadPermissions(userEmail: string): Promise<void> {
  if (!isElectron()) {
    // Browser mode: all permissions ON (server validates per-request)
    permissions.value = Object.keys(DEFAULT_PERMISSIONS).reduce((acc, key) => {
      (acc as Record<string, boolean>)[key] = true;
      return acc;
    }, {} as PosPermissions);
    isLoaded.value = true;
    return;
  }

  try {
    const posUser = await window.electronAPI!.db.getPosUser(userEmail);
    if (posUser) {
      currentRole.value = (posUser as Record<string, unknown>).role as string || "";
      const userPerms = (posUser as Record<string, unknown>).permissions;

      if (userPerms && typeof userPerms === "object") {
        // Merge with defaults — only override keys that exist
        const merged = { ...DEFAULT_PERMISSIONS };
        for (const [key, val] of Object.entries(userPerms as Record<string, unknown>)) {
          if (key in merged) {
            (merged as Record<string, boolean>)[key] = Boolean(val);
          }
        }
        permissions.value = merged;
      } else {
        // User exists but no permissions data → use defaults
        permissions.value = { ...DEFAULT_PERMISSIONS };
      }
    } else {
      // User not found in local DB → use defaults
      permissions.value = { ...DEFAULT_PERMISSIONS };
    }
  } catch (err) {
    console.error("[UserRights] Failed to load permissions:", err);
    permissions.value = { ...DEFAULT_PERMISSIONS };
  }

  isLoaded.value = true;
}

export function hasPermission(key: keyof PosPermissions): boolean {
  return permissions.value[key] ?? false;
}

export function getPermissions(): PosPermissions {
  return { ...permissions.value };
}

export function getCurrentRole(): string {
  return currentRole.value;
}

export function resetPermissions(): void {
  permissions.value = { ...DEFAULT_PERMISSIONS };
  currentRole.value = "";
  isLoaded.value = false;
}

export const usePermissions = () => ({
  permissions: computed(() => permissions.value),
  currentRole: computed(() => currentRole.value),
  isLoaded: computed(() => isLoaded.value),
  hasPermission,
  loadPermissions,
  resetPermissions,
});
