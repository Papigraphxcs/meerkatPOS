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

router.beforeEach(async (to, _from, next) => {
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
