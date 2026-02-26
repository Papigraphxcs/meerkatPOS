/**
 * X POS API Service
 * Wraps frappe.call for clean async/await usage
 */

export function call<T = unknown>(
  method: string,
  args: Record<string, unknown> = {},
  callback?: (r: { message: T }) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    frappe.call({
      method,
      args,
      async: true,
      callback: (r: { message: unknown }) => {
        if (callback) callback(r as { message: T });
        resolve(r.message as T);
      },
      error: (err: unknown) => {
        reject(err);
      },
    });
  });
}

export function getList<T = unknown>(
  doctype: string,
  args: Record<string, unknown> = {}
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    frappe.call({
      method: "frappe.client.get_list",
      args: {
        doctype,
        ...args,
      },
      async: true,
      callback: (r: { message: unknown }) => resolve(r.message as T[]),
      error: (err: unknown) => reject(err),
    });
  });
}

export function getValue<T = unknown>(
  doctype: string,
  name: string | Record<string, unknown>,
  fieldname: string | string[]
): Promise<T> {
  return new Promise((resolve, reject) => {
    frappe.call({
      method: "frappe.client.get_value",
      args: { doctype, filters: name, fieldname },
      async: true,
      callback: (r: { message: unknown }) => resolve(r.message as T),
      error: (err: unknown) => reject(err),
    });
  });
}

/**
 * Format currency using Frappe's format_currency if available
 */
export function formatCurrency(value: number, currency?: string): string {
  if (typeof frappe !== "undefined" && frappe.format_currency) {
    return frappe.format_currency(value, currency);
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

/**
 * Show a success message
 */
export function showSuccess(message: string): void {
  if (typeof frappe !== "undefined" && frappe.show_alert) {
    frappe.show_alert({ message, indicator: "green" }, 3);
  }
}

/**
 * Show an error message
 */
export function showError(message: string): void {
  if (typeof frappe !== "undefined" && frappe.show_alert) {
    frappe.show_alert({ message, indicator: "red" }, 5);
  }
}

/**
 * Show an info message
 */
export function showInfo(message: string): void {
  if (typeof frappe !== "undefined" && frappe.show_alert) {
    frappe.show_alert({ message, indicator: "blue" }, 3);
  }
}
