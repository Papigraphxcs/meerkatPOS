<template>
    <div class="relative">
        <!-- Toggle Button -->
        <button @click="isOpen = !isOpen"
            class="fixed left-0 top-1/2 -translate-y-1/2 z-50 bg-primary text-primary-foreground p-1.5 rounded-r-md shadow-lg hover:bg-primary/90 transition-all"
            :class="{ 'left-64': isOpen }">
            <ChevronRight v-if="!isOpen" class="w-4 h-4" />
            <ChevronLeft v-else class="w-4 h-4" />
        </button>

        <!-- Sidebar Overlay -->
        <Transition name="fade">
            <div v-if="isOpen" class="fixed inset-0 bg-black/50 z-40 lg:hidden" @click="isOpen = false" />
        </Transition>

        <!-- Sidebar Panel -->
        <Transition name="slide">
            <aside v-show="isOpen"
                class="fixed left-0 top-0 h-full w-64 bg-card border-r border-border z-50 flex flex-col shadow-xl">
                <!-- Header -->
                <div class="p-4 border-b border-border flex items-center gap-3">
                    <img :src="isDark ? LogoDark : LogoLight" alt="X POS Logo" class="w-8 h-8" />
                    <div>
                        <h1 class="font-semibold text-foreground">X POS</h1>
                        <p class="text-xs text-muted-foreground">{{ posStore.companyName }}</p>
                    </div>
                </div>

                <!-- Navigation -->
                <ScrollArea class="flex-1">
                    <nav class="p-2 space-y-1">
                        <p class="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {{ __("Main") }}
                        </p>
                        <router-link v-for="item in mainNavItems" :key="item.route" :to="item.route"
                            @click="isOpen = false"
                            :class="cn('flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors no-underline',
                                isActive(item.route)
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground')">
                            <component :is="item.icon" class="w-4 h-4 shrink-0" />
                            <span>{{ item.label }}</span>
                        </router-link>

                        <p class="px-3 py-2 pt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {{ __("Purchasing") }}
                        </p>
                        <router-link v-for="item in purchaseNavItems" :key="item.route" :to="item.route"
                            @click="isOpen = false"
                            :class="cn('flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors no-underline',
                                isActive(item.route)
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground')">
                            <component :is="item.icon" class="w-4 h-4 shrink-0" />
                            <span>{{ item.label }}</span>
                        </router-link>

                        <p class="px-3 py-2 pt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {{ __("Tools") }}
                        </p>
                        <router-link v-for="item in toolsNavItems" :key="item.route" :to="item.route"
                            @click="isOpen = false"
                            :class="cn('flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors no-underline',
                                isActive(item.route)
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground')">
                            <component :is="item.icon" class="w-4 h-4 shrink-0" />
                            <span>{{ item.label }}</span>
                        </router-link>
                    </nav>
                </ScrollArea>

                <!-- Footer -->
                <div class="p-3 border-t border-border">
                    <div class="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                        <Building2 class="w-3.5 h-3.5" />
                        <span class="truncate">{{ posStore.warehouse }}</span>
                    </div>
                </div>
            </aside>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { ref, inject, type Ref, computed } from "vue";
import { useRoute } from "vue-router";
import { usePosStore } from "@/stores/posStore";
import { cn } from "@/lib/utils";
import { __ } from "@/lib/translate";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    LayoutGrid,
    FileText,
    ShoppingBag,
    ClipboardList,
    PackageCheck,
    Printer,
    ChevronLeft,
    ChevronRight,
    Building2,
    Receipt,
} from "lucide-vue-next";

import LogoDark from "@/assets/images/xpos-logo-dark.svg";
import LogoLight from "@/assets/images/xpos-logo-light.svg";

const route = useRoute();
const posStore = usePosStore();
const isDark = inject<Ref<boolean>>("isDark")!;

const isOpen = ref(false);

const mainNavItems = [
    { route: "/pos", label: __("POS"), icon: LayoutGrid },
    { route: "/orders", label: __("Orders"), icon: FileText },
];

const purchaseNavItems = [
    { route: "/purchase-order", label: __("Purchase Order"), icon: ClipboardList },
    { route: "/purchase-invoice", label: __("Purchase Invoice"), icon: Receipt },
    { route: "/stock-receiving", label: __("Stock Receiving"), icon: PackageCheck },
];

const toolsNavItems = [
    { route: "/barcode-print", label: __("Barcode Printer"), icon: Printer },
];

function isActive(path: string): boolean {
    return route.path === path;
}
</script>

<style scoped>
.slide-enter-active,
.slide-leave-active {
    transition: transform 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
    transform: translateX(-100%);
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
