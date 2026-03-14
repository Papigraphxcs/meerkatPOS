<template>
    <div class="h-7 flex items-center bg-[#3c3c3c] dark:bg-[#1e1e1e] shrink-0 z-50 px-1 select-none border-b border-[#252526] dark:border-[#252526]"
        @click.self="closeAll">
        <div v-for="menu in menus" :key="menu.label" class="relative">
            <button
                class="px-2.5 h-7 flex items-center text-[13px] rounded-sm transition-colors duration-75 outline-none"
                :class="activeMenu === menu.label
                    ? 'bg-[#094771] dark:bg-[#094771] text-white'
                    : 'text-[#cccccc] hover:bg-[#505050] dark:hover:bg-[#2a2d2e] hover:text-white'" @click="toggleMenu(menu.label)"
                @mouseenter="activeMenu !== null && activeMenu !== menu.label && (activeMenu = menu.label)">
                {{ __(menu.label) }}
            </button>

            <Transition name="menu-drop">
                <div v-if="activeMenu === menu.label"
                    class="absolute top-full left-0 min-w-[220px] bg-[#252526] dark:bg-[#252526] border border-[#454545] shadow-2xl py-1 z-[200]">
                    <template v-for="item in menu.items" :key="item.id">
                        <div v-if="item.separator" class="h-px bg-[#3c3c3c] mx-0 my-1" />
                        <button v-else
                            class="w-full flex items-center justify-between px-4 py-1 text-[13px] transition-colors duration-75 outline-none"
                            :class="item.disabled?.()
                                ? 'text-[#666666] cursor-default'
                                : 'text-[#cccccc] hover:bg-[#094771] hover:text-white cursor-pointer'" :disabled="item.disabled?.()"
                            @click="!item.disabled?.() && run(item)">
                            <div class="flex items-center gap-2.5">
                                <component :is="item.icon" v-if="item.icon" class="w-3.5 h-3.5 flex-shrink-0" />
                                <span>{{ __(item.label!) }}</span>
                            </div>
                            <span v-if="item.shortcut" class="ml-8 text-[11px] text-[#666666]">{{ item.shortcut
                                }}</span>
                        </button>
                    </template>
                </div>
            </Transition>
        </div>

        <div v-if="activeMenu" class="fixed inset-0 z-[199]" @click="closeAll" />
    </div>

    <AboutDialog :open="showAboutDialog" @close="showAboutDialog = false" />
    <KeyboardShortcutsDialog :open="showShortcutsDialog" @close="showShortcutsDialog = false" />
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted, onUnmounted, type Ref } from "vue";
import { useRouter } from "vue-router";
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { usePaymentStore } from "@/stores/paymentStore";
import { useCustomerStore } from "@/stores/customerStore";
import { useAuthStore } from "@/stores/authStore";
import { isElectron } from "@/services/electronBridge";
import __ from "@/lib/translate";
import AboutDialog from "@/components/AboutDialog.vue";
import KeyboardShortcutsDialog from "@/components/KeyboardShortcutsDialog.vue";
import {
    ShoppingCart, Printer, LogOut, Monitor, Sun, Moon,
    Maximize2, Minimize2, LayoutGrid, ClipboardList,
    ArrowUpCircle, ArrowDownCircle, HelpCircle, Keyboard,
    Power, FileText, Receipt, PackageCheck, Barcode,
    Settings, Wallet, Landmark, RotateCcw, Repeat, CreditCard,
    Users, Pause, RefreshCw, Info
} from "lucide-vue-next";

const router = useRouter();
const posStore = usePosStore();
const cartStore = useCartStore();
const paymentStore = usePaymentStore();
const customerStore = useCustomerStore();
const authStore = useAuthStore();
const toggleDarkMode = inject<() => void>("toggleDarkMode")!;
const theme = inject<Ref<"light" | "dark" | "system">>("theme")!;

const activeMenu = ref<string | null>(null);
const isFullscreen = ref(false);
const showAboutDialog = ref(false);
const showShortcutsDialog = ref(false);

function toggleMenu(label: string) {
    activeMenu.value = activeMenu.value === label ? null : label;
}

function closeAll() {
    activeMenu.value = null;
}

function run(item: MenuItem) {
    closeAll();
    item.action?.();
}

// Focus the first menu item when Alt key is pressed alone
function focusMenuBar() {
    activeMenu.value = activeMenu.value ? null : menus.value[0]?.label || null;
}

onMounted(() => {
    window.addEventListener("xpos:focus-menubar", focusMenuBar);
});

onUnmounted(() => {
    window.removeEventListener("xpos:focus-menubar", focusMenuBar);
});

async function toggleFullscreen() {
    if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        isFullscreen.value = true;
    } else {
        await document.exitFullscreen();
        isFullscreen.value = false;
    }
}

async function triggerSync() {
    if (isElectron() && window.electronAPI?.triggerSync) {
        await window.electronAPI.triggerSync();
    }
}

interface MenuItem {
    id: string;
    label?: string;
    icon?: object;
    shortcut?: string;
    separator?: boolean;
    disabled?: () => boolean;
    action?: () => void;
}

interface Menu {
    label: string;
    items: MenuItem[];
}

const menus = computed<Menu[]>(() => [
    {
        label: "File",
        items: [
            {
                id: "new-sale",
                label: "New Sale",
                icon: ShoppingCart,
                shortcut: "Ctrl+N",
                action: () => {
                    cartStore.clearCart();
                    router.push("/pos");
                },
            },
            {
                id: "repeat-invoice",
                label: "Repeat Invoice",
                icon: Repeat,
                shortcut: "Ctrl+G",
                action: () => {
                    window.dispatchEvent(new CustomEvent("xpos:show-repeat-dialog"));
                },
            },
            {
                id: "return-invoice",
                label: "Return Invoice",
                icon: RotateCcw,
                shortcut: "Ctrl+R",
                action: () => {
                    window.dispatchEvent(new CustomEvent("xpos:show-return-dialog"));
                },
            },
            { id: "sep-f0", separator: true },
            {
                id: "print-last",
                label: "Print Last Receipt",
                icon: Printer,
                shortcut: "Ctrl+P",
                disabled: () => !posStore.lastInvoiceName,
                action: () => {
                    const name = posStore.lastInvoiceName;
                    if (!name) return;
                    if (typeof frappe !== "undefined" && frappe.urllib) {
                        const url = frappe.urllib.get_full_url(
                            `/printview?doctype=Sales+Invoice&name=${encodeURIComponent(name)}&format=POS+Invoice&no_letterhead=0&trigger_print=1`
                        );
                        window.open(url, "_blank");
                    }
                },
            },
            { id: "sep-f1", separator: true },
            {
                id: "settings",
                label: "Settings",
                icon: Settings,
                shortcut: "Ctrl+,",
                action: () => router.push("/settings"),
            },
            { id: "sep-f2", separator: true },
            {
                id: "signout",
                label: "Sign Out",
                icon: LogOut,
                action: () => authStore.logout(),
            },
            ...(isElectron() ? [
                { id: "sep-f3", separator: true },
                {
                    id: "exit",
                    label: "Exit",
                    icon: Power,
                    shortcut: "Alt+F4",
                    action: () => window.close(),
                }
            ] : []),
        ],
    },
    {
        label: "Sales",
        items: [
            {
                id: "goto-pos",
                label: "Point of Sale",
                icon: LayoutGrid,
                shortcut: "Alt+1",
                action: () => router.push("/pos"),
            },
            {
                id: "goto-orders",
                label: "Orders",
                icon: FileText,
                shortcut: "Alt+2",
                action: () => router.push("/orders"),
            },
            { id: "sep-sales1", separator: true },
            {
                id: "process-payment",
                label: "Process Payment",
                icon: CreditCard,
                shortcut: "F4",
                disabled: () => cartStore.items.length === 0 || !posStore.isShiftOpen,
                action: () => {
                    if (cartStore.items.length > 0 && posStore.isShiftOpen) {
                        cartStore.showPaymentDialog = true;
                    }
                },
            },
            {
                id: "select-customer",
                label: "Select Customer",
                icon: Users,
                shortcut: "F6",
                action: () => { customerStore.showCustomerDialog = true; },
            },
            {
                id: "held-invoices",
                label: "Held Invoices",
                icon: Pause,
                shortcut: "F8",
                action: () => { cartStore.showDraftDialog = true; },
            },
        ],
    },
    {
        label: "Purchasing",
        items: [
            {
                id: "goto-purchase-order",
                label: "Purchase Order",
                icon: ClipboardList,
                shortcut: "Alt+3",
                action: () => router.push("/purchase-order"),
            },
            {
                id: "goto-purchase-invoice",
                label: "Purchase Invoice",
                icon: Receipt,
                shortcut: "Alt+4",
                action: () => router.push("/purchase-invoice"),
            },
            {
                id: "goto-stock-receiving",
                label: "Stock Receiving",
                icon: PackageCheck,
                shortcut: "Alt+5",
                action: () => router.push("/stock-receiving"),
            },
        ],
    },
    {
        label: "Finance",
        items: [
            {
                id: "goto-expenses",
                label: "Expenses",
                icon: Wallet,
                shortcut: "Alt+6",
                action: () => router.push("/expenses"),
            },
            {
                id: "goto-bank-drops",
                label: "Bank Drops",
                icon: Landmark,
                shortcut: "Alt+7",
                action: () => router.push("/bank-drops"),
            },
        ],
    },
    {
        label: "View",
        items: [
            {
                id: "fullscreen",
                label: isFullscreen.value ? "Exit Full Screen" : "Toggle Full Screen",
                icon: isFullscreen.value ? Minimize2 : Maximize2,
                shortcut: "F11",
                action: toggleFullscreen,
            },
            {
                id: "theme",
                label: theme.value === "dark" ? "Switch to Light" : theme.value === "light" ? "Switch to System" : "Switch to Dark",
                icon: theme.value === "dark" ? Sun : theme.value === "light" ? Monitor : Moon,
                action: () => toggleDarkMode(),
            },
            { id: "sep-v1", separator: true },
            {
                id: "goto-barcode-print",
                label: "Barcode Printer",
                icon: Barcode,
                shortcut: "Alt+8",
                action: () => router.push("/barcode-print"),
            },
        ],
    },
    {
        label: "Shift",
        items: [
            {
                id: "close-shift",
                label: "Close Shift",
                icon: LogOut,
                shortcut: "Ctrl+Shift+O",
                disabled: () => !posStore.isShiftOpen,
                action: () => {
                    posStore.showClosingDialog = true;
                    posStore.fetchClosingData();
                },
            },
            { id: "sep-s1", separator: true },
            {
                id: "cash-deposit",
                label: "Cash Deposit",
                icon: ArrowUpCircle,
                shortcut: "Ctrl+Shift+D",
                disabled: () => !posStore.allowCashDeposit || !posStore.isShiftOpen,
                action: () => paymentStore.openCashMovement("deposit"),
            },
            {
                id: "expense",
                label: "Cash Expense",
                icon: ArrowDownCircle,
                shortcut: "Ctrl+E",
                disabled: () => !posStore.allowPosExpense || !posStore.isShiftOpen,
                action: () => paymentStore.openCashMovement("expense"),
            },
            ...(isElectron() ? [
                { id: "sep-s2", separator: true },
                {
                    id: "sync-now",
                    label: "Sync Now",
                    icon: RefreshCw,
                    shortcut: "Ctrl+Shift+S",
                    action: () => triggerSync(),
                }
            ] : []),
        ],
    },
    {
        label: "Help",
        items: [
            {
                id: "shortcuts",
                label: "Keyboard Shortcuts",
                icon: Keyboard,
                shortcut: "Ctrl+/",
                action: () => { showShortcutsDialog.value = true; },
            },
            { id: "sep-h1", separator: true },
            {
                id: "about",
                label: "About X POS",
                icon: Info,
                action: () => { showAboutDialog.value = true; },
            },
        ],
    },
]);
</script>

<style scoped>
.menu-drop-enter-active,
.menu-drop-leave-active {
    transition: opacity 0.08s ease, transform 0.08s ease;
}

.menu-drop-enter-from,
.menu-drop-leave-to {
    opacity: 0;
    transform: translateY(-3px);
}
</style>
