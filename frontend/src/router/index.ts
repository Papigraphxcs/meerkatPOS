import { createRouter, createWebHistory, createWebHashHistory, type Router, type RouteRecordRaw } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import { isElectron } from "@/services/electronBridge";
import routes from "./routes";

// Electron uses hash-based routing (file:// protocol, no server for SPA fallback).
// Browser/PWA uses history-based routing with /xpos base path.
const history = isElectron()
  ? createWebHashHistory()
  : createWebHistory("/xpos");

export const router: Router = createRouter({
  history,
  routes,
});

// Track first-run status (only checked once)
let _firstRunChecked = false;
let _isFirstRun = false;

async function checkFirstRun(): Promise<boolean> {
  if (_firstRunChecked) return _isFirstRun;
  if (!isElectron()) {
    _firstRunChecked = true;
    _isFirstRun = false;
    return false;
  }
  try {
    _isFirstRun = await window.electronAPI!.isFirstRun();
  } catch {
    _isFirstRun = false;
  }
  _firstRunChecked = true;
  return _isFirstRun;
}

/** Call after setup wizard completes to skip future redirects. */
export function markSetupComplete(): void {
  _isFirstRun = false;
  _firstRunChecked = true;
}

router.beforeEach(async (to, _from, next) => {
  // First-run check: redirect to setup wizard if needed
  const firstRun = await checkFirstRun();
  if (firstRun && to.meta.isSetupPage !== true) {
    next({ name: "setup" });
    return;
  }
  if (!firstRun && to.meta.isSetupPage === true) {
    next({ name: "login" });
    return;
  }
  if (to.meta.isSetupPage === true) {
    next();
    return;
  }

  const authStore = useAuthStore();

  if (!authStore.isAuthenticated && !authStore.isLoading) {
    await authStore.checkAuth();
  }

  const requiresAuth = to.meta.requiresAuth !== false;
  const isAuthPage = to.meta.isAuthPage === true;

  if (requiresAuth && !authStore.isAuthenticated) {
    next({
      name: "login",
      query: { redirect: to.fullPath },
    });
    return;
  }

  if (isAuthPage && authStore.isAuthenticated) {
    next({ name: "pos" });
    return;
  }

  if (to.meta.title) {
    document.title = `${to.meta.title} | X POS`;
  }

  next();
});
