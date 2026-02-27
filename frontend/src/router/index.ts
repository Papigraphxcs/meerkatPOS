import { createRouter, createWebHistory, type Router, type RouteRecordRaw } from "vue-router";

const PosView = () => import("@/views/PosView.vue");
const OrdersView = () => import("@/views/OrdersView.vue");

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/pos",
  },
  {
    path: "/pos",
    name: "pos",
    component: PosView,
    meta: { title: "Point of Sale" },
  },
  {
    path: "/orders",
    name: "orders",
    component: OrdersView,
    meta: { title: "Orders" },
  },
];

// Standalone SPA router instance
export const router: Router = createRouter({
  history: createWebHistory("/xpos"),
  routes,
});

// Factory function for embedded mode (legacy)
export function createXPosRouter(): Router {
  return createRouter({
    history: createWebHistory("/app/xpos"),
    routes,
  });
}
