// X POS Main Entry Point - Standalone SPA mode
import "./style.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";

// Setup frappe-like API wrapper for standalone mode
function initializeFrappeAPI(): void {
  const bootData = window.xpos?.boot || {};
  const csrfToken = window.xpos?.csrf_token || "";

  // Setup frappe global if not exists
  if (typeof window.frappe === "undefined") {
    const frappeObj = {
      boot: bootData,
      session: bootData.user_info as { user: string; user_email?: string; user_fullname?: string } || { user: "Guest" },
      user: { name: (bootData.user_info as { user?: string })?.user || "Guest" },

      call: (options: {
        method: string;
        args?: Record<string, unknown>;
        async?: boolean;
        callback?: (r: { message: unknown }) => void;
        error?: (err: unknown) => void;
      }) => {
        const { method, args = {}, callback, error } = options;

        fetch(`/api/method/${method}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Frappe-CSRF-Token": csrfToken,
          },
          body: JSON.stringify(args),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            if (callback) callback(data);
          })
          .catch((err) => {
            console.error("API Error:", err);
            if (error) error(err);
          });
      },

      xcall: async (method: string, args: Record<string, unknown> = {}): Promise<unknown> => {
        const response = await fetch(`/api/method/${method}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Frappe-CSRF-Token": csrfToken,
          },
          body: JSON.stringify(args),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.message;
      },

      format_currency: (value: number, currency?: string): string => {
        const cur = currency || (bootData.sysdefaults as { currency?: string })?.currency || "USD";
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: cur,
          minimumFractionDigits: 2,
        }).format(value || 0);
      },

      show_alert: (options: { message: string; indicator: string }, duration?: number): void => {
        console.log(`[${options.indicator}] ${options.message}`);
        // Sonner toast will be handled by components
      },

      msgprint: (message: string | { title?: string; message: string; indicator?: string }): void => {
        const msg = typeof message === "string" ? message : message.message;
        console.log("Message:", msg);
        alert(msg);
      },

      confirm: (message: string, onyes: () => void): void => {
        if (confirm(message)) {
          onyes();
        }
      },

      throw: (message: string): never => {
        throw new Error(message);
      },

      datetime: {
        now_datetime: (): string => new Date().toISOString().slice(0, 19).replace("T", " "),
        get_today: (): string => new Date().toISOString().slice(0, 10),
        str_to_obj: (date: string): Date => new Date(date),
      },

      provide: (key: string): void => {
        // Stub for frappe.provide
        console.log("frappe.provide:", key);
      },

      XPos: {
        app: null as unknown,
      },
    };

    // Assign to window.frappe
    (window as unknown as { frappe: typeof frappeObj }).frappe = frappeObj;
  }
}

// Initialize
initializeFrappeAPI();

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

app.config.errorHandler = (err: unknown, _instance: unknown, info: string) => {
  console.error("X POS Error:", err, info);
  if (typeof frappe !== "undefined" && frappe.show_alert) {
    frappe.show_alert(
      {
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
        indicator: "red",
      },
      5
    );
  }
};

app.mount("#app");
