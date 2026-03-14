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
</template>

<script setup lang="ts">
import { ref, computed, inject, type Ref } from "vue";
import { useRouter } from "vue-router";
import { usePosStore } from "@/stores/posStore";
import { usePaymentStore } from "@/stores/paymentStore";
import { useAuthStore } from "@/stores/authStore";
import { isElectron } from "@/services/electronBridge";
import __ from "@/lib/translate";
import {
    ShoppingCart, Printer, LogOut, Monitor, Sun, Moon,
    Maximize2, Minimize2, LayoutGrid, ClipboardList,
    ArrowUpCircle, ArrowDownCircle, HelpCircle, Keyboard,
    Power
} from "lucide-vue-next";

const router = useRouter();
const posStore = usePosStore();
const paymentStore = usePaymentStore();
const authStore = useAuthStore();
const toggleDarkMode = inject<() => void>("toggleDarkMode")!;
const theme = inject<Ref<"light" | "dark" | "system">>("theme")!;

const activeMenu = ref<string | null>(null);
const isFullscreen = ref(false);

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

async function toggleFullscreen() {
    if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        isFullscreen.value = true;
    } else {
        await document.exitFullscreen();
        isFullscreen.value = false;
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
                shortcut: "Ctrl + N",
                action: () => router.push("/pos"),
            },
            {
                id: "print-last",
                label: "Print Last Receipt",
                icon: Printer,
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
                id: "signout",
                label: "Sign Out",
                icon: LogOut,
                action: () => authStore.logout(),
            },
            ...(isElectron() ? [
                { id: "sep-f2", separator: true },
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
        label: "View",
        items: [
            {
                id: "goto-pos",
                label: "Point of Sale",
                icon: LayoutGrid,
                action: () => router.push("/pos"),
            },
            {
                id: "goto-orders",
                label: "Orders",
                icon: ClipboardList,
                action: () => router.push("/orders"),
            },
            { id: "sep-v1", separator: true },
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
        ],
    },
    {
        label: "Shift",
        items: [
            {
                id: "close-shift",
                label: "Close Shift",
                icon: LogOut,
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
                disabled: () => !posStore.allowCashDeposit || !posStore.isShiftOpen,
                action: () => paymentStore.openCashMovement("deposit"),
            },
            {
                id: "expense",
                label: "Cash Expense",
                icon: ArrowDownCircle,
                disabled: () => !posStore.allowPosExpense || !posStore.isShiftOpen,
                action: () => paymentStore.openCashMovement("expense"),
            },
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
                action: () => { /* future: open shortcuts dialog */ },
            },
            { id: "sep-h1", separator: true },
            {
                id: "about",
                label: "About X POS",
                icon: HelpCircle,
                action: () => { /* future: open about dialog */ },
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
