const PosView = () => import("@/views/PosView.vue");
const OrdersView = () => import("@/views/OrdersView.vue");
const PurchaseView = () => import("@/views/PurchaseView.vue");
const LoginView = () => import("@/views/LoginView.vue");
const ResetPasswordView = () => import("@/views/ResetPasswordView.vue");
const BarcodePrintView = () => import("@/views/BarcodePrintView.vue");
import { RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
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

export default routes;