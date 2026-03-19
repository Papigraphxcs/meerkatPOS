/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

export { };

declare module "virtual:pwa-register" {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }

  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare global {
  interface XPosGlobal {
    boot?: Record<string, any> & {
      currencies: Array<{ name?: string; currency_name?: string; symbol?: string; }>;
      countries: Array<{ name?: string; }>;
      accounts_settings?: Record<string, any>;
      buying_settings?: Record<string, any>;
      stock_settings?: Record<string, any>;
      selling_settings?: Record<string, any>;
      territories?: Array<{ name?: string; territory_name?: string; }>;
    };
    _messages?: Record<string, string>;
    csrf_token?: string;
  }

  var xpos: XPosGlobal;

  interface Window {
    __xposBundlePromise?: Promise<unknown>;
    xpos?: XPosGlobal;
    electronAPI?: import("@/services/electronBridge").ElectronAPI;
  }
}
