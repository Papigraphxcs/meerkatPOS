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

export function createXPosRouter(): Router {
  const router = createRouter({
    history: createWebHistory("/app/xpos"),
    routes,
  });

  return router;
}
