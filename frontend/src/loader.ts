// X POS Loader - Included on every desk page via app_include_js
// Only loads the full POS bundle when user navigates to /app/xpos

const XPOS_BASE_PATH = "/app/xpos";
const bundlePath = "/assets/xpos/dist/js/xpos.js";

if (typeof window !== "undefined") {
  const pathname = window.location.pathname;
  if (
    pathname === XPOS_BASE_PATH ||
    pathname.startsWith(XPOS_BASE_PATH + "/")
  ) {
    window.__xposBundlePromise = import(/* @vite-ignore */ bundlePath).catch(
      (error: unknown) => {
        console.error("X POS bundle failed to load:", error);
        throw error;
      }
    );
  }
}
