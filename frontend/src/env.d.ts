/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// jQuery minimal types
interface JQuery<TElement = HTMLElement> {
  find(selector: string): JQuery<TElement>;
  length: number;
  [index: number]: TElement;
}

interface JQueryStatic {
  (selector: string | Document | HTMLElement): JQuery;
}

declare const $: JQueryStatic;

// Frappe global types
interface FrappeCallArgs {
  method: string;
  args?: Record<string, unknown>;
  async?: boolean;
  callback?: (r: { message: unknown }) => void;
  error?: (err: unknown) => void;
}

interface FrappeShowAlertOptions {
  message: string;
  indicator: "green" | "red" | "blue" | "yellow" | "orange";
}

interface Frappe {
  call(args: FrappeCallArgs): void;
  provide(namespace: string): void;
  show_alert(options: FrappeShowAlertOptions, duration?: number): void;
  format_currency(value: number, currency?: string): string;
  boot?: {
    sysdefaults?: Record<string, string>;
    [key: string]: unknown;
  };
  urllib?: {
    get_full_url(path: string): string;
    [key: string]: unknown;
  };
  ui?: {
    form?: {
      qz_connect?: () => Promise<unknown>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  XPos: {
    app: new (page: unknown) => XPosAppInstance;
  };
}

interface XPosAppInstance {
  unmount(): void;
}

declare const frappe: Frappe;

// Window augmentation
interface Window {
  __xposBundlePromise?: Promise<unknown>;
}
