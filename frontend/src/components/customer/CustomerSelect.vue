<template>
    <Dialog :open="customerStore.showCustomerDialog" @update:open="(val: boolean) => { if (!val) close() }">
        <DialogContent class="max-w-md max-h-[80vh] flex flex-col p-0 gap-0">
            <!-- Header -->
            <DialogHeader class="shrink-0 px-5 pt-5 pb-3 space-y-3 border-b border-border">
                <div class="flex items-center justify-between">
                    <DialogTitle>Select Customer</DialogTitle>
                </div>
                <DialogDescription class="sr-only">Search for or create a customer</DialogDescription>

                <!-- Search -->
                <div class="relative">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input ref="searchInput" v-model="search" type="text" placeholder="Search by name, phone, email..."
                        class="pl-9" @input="debouncedSearch" />
                </div>
            </DialogHeader>

            <!-- Customer List -->
            <div class="flex-1 overflow-y-auto xpos-scrollbar">
                <!-- Loading -->
                <div v-if="customerStore.isLoading" class="p-4 space-y-3">
                    <div v-for="i in 5" :key="i" class="skeleton h-14 w-full rounded-xl"></div>
                </div>

                <!-- List -->
                <div v-else-if="customerStore.customers.length > 0" class="p-2">
                    <button v-for="cust in customerStore.customers" :key="cust.name" @click="selectCustomer(cust)"
                        class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-left group">
                        <Avatar class="shrink-0">
                            <img
                                v-if="cust.image"
                                :src="cust.image as string"
                                :alt="cust.customer_name"
                                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                loading="lazy"
                            />
                            <AvatarFallback v-else class="bg-primary/10 text-primary text-sm font-bold">
                                {{ getInitials(cust.customer_name) }}
                            </AvatarFallback>
                        </Avatar>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-foreground truncate">{{ cust.customer_name }}</p>
                            <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span v-if="cust.mobile_no">{{ cust.mobile_no }}</span>
                                <span v-if="cust.email_id && cust.mobile_no">&bull;</span>
                                <span v-if="cust.email_id" class="truncate">{{ cust.email_id }}</span>
                            </div>
                        </div>
                        <ChevronRight
                            class="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                    </button>
                </div>

                <!-- Empty -->
                <div v-else class="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <Users class="w-12 h-12 mb-3 text-muted-foreground/30" />
                    <p class="text-sm font-medium">No customers found</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="shrink-0 border-t border-border px-5 py-4">
                <div v-if="!showNewForm">
                    <Button variant="default" class="w-full justify-center gap-2" @click="showNewForm = true">
                        <UserPlus class="w-4 h-4" />
                        Create New Customer
                    </Button>
                </div>

                <!-- New Customer Form -->
                <div v-else class="space-y-3 animate-slide-up">
                    <h3 class="text-sm font-semibold text-foreground">New Customer</h3>
                    <Input v-model="newCustomer.customer_name" type="text" placeholder="Customer Name *" />
                    <Input v-model="newCustomer.mobile_no" type="tel" placeholder="Mobile Number" />
                    <Input v-model="newCustomer.email_id" type="email" placeholder="Email Address" />
                    <div class="flex gap-2">
                        <Button variant="outline" class="flex-1" size="sm" @click="showNewForm = false">Cancel</Button>
                        <Button class="flex-1" size="sm" :disabled="!newCustomer.customer_name || isCreating"
                            @click="createAndSelect">
                            <Loader2 v-if="isCreating" class="w-4 h-4 animate-spin mr-1" />
                            {{ isCreating ? 'Creating...' : 'Create & Select' }}
                        </Button>
                    </div>
                </div>
            </div>
        </DialogContent>
    </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";
import { useCartStore } from "@/stores/cartStore";
import { useCustomerStore } from "@/stores/customerStore";
import { showSuccess, showError } from "@/services/api";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, ChevronRight, Users, UserPlus, Loader2 } from "lucide-vue-next";

const cartStore = useCartStore();
const customerStore = useCustomerStore();

const searchInput = ref<InstanceType<typeof Input> | null>(null);
const search = ref("");
const showNewForm = ref(false);
const isCreating = ref(false);
const newCustomer = ref({
    customer_name: "",
    mobile_no: "",
    email_id: "",
});

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
    nextTick(() => {
        const el = searchInput.value?.$el as HTMLElement | undefined;
        const input = el?.querySelector?.("input") || el;
        (input as HTMLInputElement)?.focus();
    });
});

function debouncedSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        customerStore.searchCustomers(search.value);
    }, 300);
}

function selectCustomer(cust: { name: string; customer_name?: string, image?: string }) {
    cartStore.setCustomer(cust);
    close();
}

async function createAndSelect() {
    if (!newCustomer.value.customer_name) return;
    isCreating.value = true;

    try {
        const result = await customerStore.createCustomer(newCustomer.value);
        cartStore.setCustomer(result);
        showSuccess("Customer created successfully!");
        close();
    } catch (error: unknown) {
        showError("Failed to create customer: " + ((error as Error)?.message || error));
    } finally {
        isCreating.value = false;
    }
}

function getInitials(name: string) {
    if (!name) return "?";
    return name
        .split(" ")
        .slice(0, 2)
        .map((w: string) => w[0])
        .join("")
        .toUpperCase();
}

function close() {
    customerStore.showCustomerDialog = false;
    showNewForm.value = false;
    search.value = "";
}
</script>
