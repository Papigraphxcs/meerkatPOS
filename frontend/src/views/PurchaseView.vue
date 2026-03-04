<script setup lang="ts">
/**
 * Purchase View
 * Main view for purchasing functionality with stock receiving
 */
import { onMounted, onUnmounted, ref } from "vue";
import { usePurchaseStore } from "@/stores/purchaseStore";
import { usePosStore } from "@/stores/posStore";
import { useOfflineStore } from "@/stores/offlineStore";
import SupplierSelector from "@/components/purchase/SupplierSelector.vue";
import PurchaseItemList from "@/components/purchase/PurchaseItemList.vue";
import PurchaseCart from "@/components/purchase/PurchaseCart.vue";
import StockReceiving from "@/components/purchase/StockReceiving.vue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    ShoppingBag,
    ArrowLeft,
    CloudOff,
    RefreshCw,
    FileText,
    Package,
    Users,
    Truck,
} from "lucide-vue-next";
import { isOnline } from "@/utils";
import __ from "@/lib/translate";

const purchaseStore = usePurchaseStore();
const posStore = usePosStore();
const offlineStore = useOfflineStore();

// Active tab
type TabType = "suppliers" | "items" | "receive";
const activeTab = ref<TabType>("suppliers");

// Online status listener
function handleOnlineStatus(): void {
    if (isOnline() && purchaseStore.hasPendingPurchases) {
        purchaseStore.syncPendingPurchases();
    }
}

onMounted(() => {
    purchaseStore.init();
    window.addEventListener("online", handleOnlineStatus);
});

onUnmounted(() => {
    window.removeEventListener("online", handleOnlineStatus);
});

function goBack(): void {
    posStore.currentView = "pos";
}
</script>

<template>
    <div class="h-full min-h-0 flex flex-col bg-background overflow-hidden">
        <header class="bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
            <div class="flex items-center gap-4">
                <Button @click="goBack" variant="ghost" size="icon">
                    <ArrowLeft class="w-5 h-5" />
                </Button>
                <div class="flex items-center gap-2">
                    <ShoppingBag class="w-6 h-6 text-primary" />
                    <h1 class="text-xl font-semibold text-foreground">Purchasing</h1>
                </div>
            </div>

            <div class="flex items-center gap-4">
                <div v-if="!isOnline()" class="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <CloudOff class="w-4 h-4" />
                    <span class="text-sm">{{ __("Offline") }}</span>
                </div>

                <div v-if="purchaseStore.hasPendingPurchases" class="flex items-center gap-2">
                    <Badge variant="secondary"
                        class="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                        {{ purchaseStore.pendingCount }} {{ __("Pending") }}
                    </Badge>
                    <Button v-if="isOnline()" @click="purchaseStore.syncPendingPurchases()" variant="outline" size="sm"
                        :disabled="purchaseStore.isSyncing">
                        <RefreshCw class="w-4 h-4 mr-1" :class="{ 'animate-spin': purchaseStore.isSyncing }" />
                        {{ __("Sync") }}
                    </Button>
                </div>

                <div v-if="purchaseStore.selectedSupplier"
                    class="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-lg">
                    <Users class="w-4 h-4 text-primary" />
                    <span class="text-sm font-medium text-primary">
                        {{ purchaseStore.selectedSupplier.supplier_name }}
                    </span>
                </div>
            </div>
        </header>

        <div class="flex-1 flex min-h-0 overflow-hidden">
            <template v-if="activeTab !== 'receive'">
                <div class="w-96 border-r border-border bg-card flex flex-col min-h-0 overflow-hidden">
                    <div class="flex border-b border-border shrink-0">
                        <button @click="activeTab = 'suppliers'"
                            class="flex-1 px-3 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                            :class="activeTab === 'suppliers'
                                ? 'text-primary border-b-2 border-primary bg-primary/10'
                                : 'text-muted-foreground hover:bg-muted'">
                            <Users class="w-4 h-4" />
                            {{ __("Suppliers") }}
                        </button>
                        <button @click="activeTab = 'items'"
                            class="flex-1 px-3 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                            :class="activeTab === 'items'
                                ? 'text-primary border-b-2 border-primary bg-primary/10'
                                : 'text-muted-foreground hover:bg-muted'">
                            <Package class="w-4 h-4" />
                            {{ __("Items") }}
                        </button>
                        <button @click="activeTab = 'receive'"
                            class="flex-1 px-3 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 text-muted-foreground hover:bg-muted">
                            <Truck class="w-4 h-4" />
                            {{ __("Receive") }}
                        </button>
                    </div>

                    <!-- Tab Content -->
                    <div class="flex-1 min-h-0 overflow-hidden">
                        <SupplierSelector v-show="activeTab === 'suppliers'" class="h-full" />
                        <PurchaseItemList v-show="activeTab === 'items'" class="h-full" />
                    </div>
                </div>

                <!-- Right Panel - Cart -->
                <div class="flex-1 flex flex-col min-h-0">
                    <PurchaseCart class="h-full" />
                </div>
            </template>

            <!-- Full-width Stock Receiving layout -->
            <template v-else>
                <div class="w-full flex flex-col min-h-0 overflow-hidden">
                    <!-- Tab bar for navigation back -->
                    <div class="flex border-b border-border shrink-0 bg-card">
                        <button @click="activeTab = 'suppliers'"
                            class="px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 text-muted-foreground hover:bg-muted">
                            <Users class="w-4 h-4" />
                            {{ __("Suppliers") }}
                        </button>
                        <button @click="activeTab = 'items'"
                            class="px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 text-muted-foreground hover:bg-muted">
                            <Package class="w-4 h-4" />
                            {{ __("Items") }}   
                        </button>
                        <button
                            class="px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 text-primary border-b-2 border-primary bg-primary/10">
                            <Truck class="w-4 h-4" />
                            {{ __("Receive") }}
                        </button>
                    </div>

                    <!-- Stock Receiving Content (full width) -->
                    <div class="flex-1 min-h-0 overflow-hidden">
                        <StockReceiving class="h-full" />
                    </div>
                </div>
            </template>
        </div>

        <footer class="bg-card border-t border-border px-4 py-2 flex items-center justify-between shrink-0">
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText class="w-4 h-4" />
                <span>
                    {{ purchaseStore.receiveImmediately ? __("Auto-receive") : __("Order only") }}
                    {{ purchaseStore.createInvoice ? "+ " + __("Invoice") : "" }}
                </span>
            </div>

            <div class="flex items-center gap-4">
                <span class="text-sm text-muted-foreground">
                    {{ __("Warehouse") }}: {{ posStore.warehouse }}
                </span>
                <span class="text-sm text-muted-foreground">
                    {{ __("Company") }}: {{ posStore.companyName }}
                </span>
            </div>
        </footer>
    </div>
</template>
