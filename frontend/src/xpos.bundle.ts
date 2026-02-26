// X POS Bundle Entry Point
import { createApp, type App as VueApp } from "vue";
import { createPinia } from "pinia";
import { createXPosRouter } from "./router/index";
import App from "./App.vue";
import "./style.css";

if (typeof frappe === "undefined") {
  console.error("Frappe is not defined. X POS requires Frappe framework.");
} else {
  frappe.provide("frappe.XPos");
}

interface XPosPage {
  page?: HTMLElement;
}

class XPosApp {
  $parent: JQuery;
  page: HTMLElement | XPosPage | null;
  app: VueApp | null = null;
  router: ReturnType<typeof createXPosRouter> | null = null;

  constructor({ parent }: { parent: XPosPage }) {
    this.$parent = $(document);
    this.page = parent?.page || parent;
    this.init();
  }

  init(): void {
    const $el = this.$parent.find(".main-section");
    if (!$el.length) {
      console.error("X POS: .main-section not found");
      return;
    }

    const pinia = createPinia();
    const router = createXPosRouter();

    this.app = createApp(App);
    this.app.use(pinia);
    this.app.use(router);
    this.router = router;

    this.app.config.errorHandler = (
      err: unknown,
      _instance: unknown,
      info: string
    ) => {
      console.error("X POS Error:", err, info);
      if (frappe.show_alert) {
        frappe.show_alert(
          {
            message: `Error: ${err instanceof Error ? err.message : String(err)}`,
            indicator: "red",
          },
          5
        );
      }
    };

    this.app.mount($el[0]);
  }

  unmount(): void {
    if (this.app) {
      this.app.unmount();
      this.app = null;
      this.router = null;
    }
  }
}

frappe.XPos.app = XPosApp as unknown as new (page: unknown) => { unmount(): void };
