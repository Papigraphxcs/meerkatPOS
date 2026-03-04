import { createRouter, createWebHistory, type Router, type RouteRecordRaw } from "vue-router";
import { useAuthStore } from "@/stores/authStore";

// Lazy load views
const PosView = () => import("@/views/PosView.vue");
const OrdersView = () => import("@/views/OrdersView.vue");
const PurchaseView = () => import("@/views/PurchaseView.vue");
const LoginView = () => import("@/views/LoginView.vue");
const ResetPasswordView = () => import("@/views/ResetPasswordView.vue");
const BarcodePrintView = () => import("@/views/BarcodePrintView.vue");

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
  {
    path: "/purchase",
    name: "purchase",
    component: PurchaseView,
    meta: { title: "Purchasing", requiresAuth: true },
  },
  {
    path: "/barcode-print",
    name: "barcode-print",
    component: BarcodePrintView,
    meta: { title: "Barcode Printer", requiresAuth: true },
  },
];

export const router: Router = createRouter({
  history: createWebHistory("/xpos"),
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

export function createXPosRouter(): Router {
  return createRouter({
    history: createWebHistory("/app/xpos"),
    routes,
  });
}
