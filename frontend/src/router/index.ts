import { createRouter, createWebHistory, type Router, type RouteRecordRaw } from "vue-router";
import { useAuthStore } from "@/stores/authStore";

// Lazy load views
const PosView = () => import("@/views/PosView.vue");
const OrdersView = () => import("@/views/OrdersView.vue");
const LoginView = () => import("@/views/LoginView.vue");
const ResetPasswordView = () => import("@/views/ResetPasswordView.vue");

const routes: RouteRecordRaw[] = [
  // Auth routes (public)
  {
    path: "/login",
    name: "login",
    component: LoginView,
    meta: { title: "Sign In", requiresAuth: false, isAuthPage: true },
  },
  {
    path: "/reset-password",
    name: "reset-password",
    component: ResetPasswordView,
    meta: { title: "Reset Password", requiresAuth: false, isAuthPage: true },
  },
  // Protected routes
  {
    path: "/",
    redirect: "/pos",
  },
  {
    path: "/pos",
    name: "pos",
    component: PosView,
    meta: { title: "Point of Sale", requiresAuth: true },
  },
  {
    path: "/orders",
    name: "orders",
    component: OrdersView,
    meta: { title: "Orders", requiresAuth: true },
  },
];

// Standalone SPA router instance
export const router: Router = createRouter({
  history: createWebHistory("/xpos"),
  routes,
});

// Navigation guard for authentication
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // Check authentication status if not already done
  if (!authStore.isAuthenticated && !authStore.isLoading) {
    await authStore.checkAuth();
  }

  const requiresAuth = to.meta.requiresAuth !== false;
  const isAuthPage = to.meta.isAuthPage === true;

  // If route requires auth and user is not authenticated
  if (requiresAuth && !authStore.isAuthenticated) {
    // Redirect to login with return URL
    next({
      name: "login",
      query: { redirect: to.fullPath },
    });
    return;
  }

  // If user is authenticated and trying to access auth pages (login/reset)
  if (isAuthPage && authStore.isAuthenticated) {
    // Redirect to POS
    next({ name: "pos" });
    return;
  }

  // Update document title
  if (to.meta.title) {
    document.title = `${to.meta.title} | X POS`;
  }

  next();
});

// Factory function for embedded mode (legacy)
export function createXPosRouter(): Router {
  return createRouter({
    history: createWebHistory("/app/xpos"),
    routes,
  });
}
