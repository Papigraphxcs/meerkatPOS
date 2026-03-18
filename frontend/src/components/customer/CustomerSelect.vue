<template>
    <Dialog :open="customerStore.showCustomerDialog" @update:open="(val: boolean) => { if (!val) close() }">
        <DialogContent class="max-w-md max-h-[80vh] flex flex-col p-0 gap-0">
            <DialogHeader class="shrink-0 px-5 pt-5 pb-3 space-y-3 border-b border-border">
                <div class="flex items-center justify-between">
                    <DialogTitle>{{ __("Select Customer") }}</DialogTitle>
                </div>
                <DialogDescription class="sr-only">{{ __("Search for or create a customer") }}</DialogDescription>

                <div class="relative">
                    <Search class="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input ref="searchInput" v-model="search" type="text" :placeholder="__('Search by name, phone, email...')"
                        class="ps-9" @input="debouncedSearch"
                        @keydown.down.prevent="moveHighlight(1)"
                        @keydown.up.prevent="moveHighlight(-1)"
                        @keydown.enter.prevent="selectHighlighted" />
                </div>
            </DialogHeader>

            <div ref="listContainer" class="flex-1 overflow-y-auto xpos-scrollbar">
                <div v-if="customerStore.isLoading" class="p-4 space-y-3">
                    <div v-for="i in 5" :key="i" class="skeleton h-14 w-full rounded-xl"></div>
                </div>

                <div v-else-if="customerStore.customers.length > 0" class="p-2">
                    <button v-for="(cust, idx) in customerStore.customers" :key="cust.name"
                        :ref="el => { if (el) customerRefs[idx] = el as HTMLButtonElement }"
                        @click="selectCustomer(cust)"
                        @mouseenter="highlightedIndex = idx"
                        class="w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-start group"
                        :class="idx === highlightedIndex
                            ? 'bg-primary/10 dark:bg-primary/20 ring-1 ring-primary/30 border border-primary/40'
                            : 'hover:bg-accent border border-transparent'">
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

                <div v-else class="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <Users class="w-12 h-12 mb-3 text-muted-foreground/30" />
                    <p class="text-sm font-medium">{{ __("No customers found") }}</p>
                </div>
            </div>
            <div class="shrink-0 border-t border-border px-5 py-4">
                <div v-if="!showNewForm">
                    <Button variant="default" class="w-full justify-center gap-2" @click="showNewForm = true">
                        <UserPlus class="w-4 h-4" />
                        {{ __("Create New Customer") }}
                    </Button>
                </div>
                <div v-else class="space-y-3 animate-slide-up max-h-[50vh] overflow-y-auto xpos-scrollbar pe-1">
                    <h3 class="text-sm font-semibold text-foreground">{{ __("New Customer") }}</h3>
                    <Input v-model="newCustomer.customer_name" type="text" :placeholder="__('Customer Name *')" />

                    <div class="grid grid-cols-2 gap-2">
                        <Input v-model="newCustomer.tax_id" type="text" :placeholder="__('Tax ID')" />
                        <Input v-model="newCustomer.mobile_no" type="tel" :placeholder="__('Mobile No')" />
                    </div>

                    <Input v-model="newCustomer.address_line1" type="text" :placeholder="__('Address Line 1')" />

                    <div class="grid grid-cols-2 gap-2">
                        <Input v-model="newCustomer.city" type="text" placeholder="City" />
                        <select v-model="newCustomer.country"
                            class="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                            <option value="" disabled>Country</option>
                            <option v-for="c in countries" :key="c" :value="c">{{ c }}</option>
                        </select>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <Input v-model="newCustomer.email_id" type="email" :placeholder="__('Email Id')" />
                        <select v-model="newCustomer.gender"
                            class="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                            <option value="" disabled>Gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                            <option value="Prefer not to say">Prefer not to say</option>
                        </select>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <Input v-model="newCustomer.referral_code" type="text" :placeholder="__('Referral Code')" />
                        <Input v-model="newCustomer.birthday" type="text" :placeholder="__('Birthday (DD-MM-YYYY)')"
                            @focus="(e: FocusEvent) => { (e.target as HTMLInputElement).type = 'date' }"
                            @blur="(e: FocusEvent) => { if (!(e.target as HTMLInputElement).value) (e.target as HTMLInputElement).type = 'text' }" />
                    </div>
                    
                    <div class="grid grid-cols-2 gap-2">
                        <select v-model="newCustomer.customer_group"
                            class="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                            <option value="" disabled>{{ __("Customer Group *") }}</option>
                            <option v-for="g in customerGroups" :key="g" :value="g">{{ g }}</option>
                        </select>
                        <select v-model="newCustomer.territory"
                            class="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                            <option value="" disabled>{{ __("Territory *") }}</option>
                            <option v-for="t in territories" :key="t" :value="t">{{ t }}</option>
                        </select>
                    </div>

                    <div class="flex gap-2 pt-1">
                        <Button variant="outline" class="flex-1" size="sm" @click="showNewForm = false">{{ __("Cancel") }}</Button>
                        <Button class="flex-1" size="sm" :disabled="!newCustomer.customer_name || isCreating"
                            @click="createAndSelect">
                            <Loader2 v-if="isCreating" class="w-4 h-4 animate-spin me-1" />
                            {{ isCreating ? __('Creating...') : __('Create & Select') }}
                        </Button>
                    </div>
                </div>
            </div>
        </DialogContent>
    </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from "vue";
import { useCartStore } from "@/stores/cartStore";
import { useCustomerStore } from "@/stores/customerStore";
import { usePosStore } from "@/stores/posStore";
import { showSuccess, showError, call } from "@/services/api";
import {
    cacheCustomerGroups, getCachedCustomerGroups,
    cacheTerritories, getCachedTerritories,
    cacheCountries, getCachedCountries,
} from "@/services/dbBridge";
import { isOnline } from "@/utils";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, ChevronRight, Users, UserPlus, Loader2 } from "lucide-vue-next";
import __ from "@/lib/translate";

const cartStore = useCartStore();
const customerStore = useCustomerStore();
const posStore = usePosStore();

const searchInput = ref<InstanceType<typeof Input> | null>(null);
const listContainer = ref<HTMLElement | null>(null);
const customerRefs: Record<number, HTMLButtonElement> = {};
const search = ref("");
const showNewForm = ref(false);
const isCreating = ref(false);
const highlightedIndex = ref(-1);
const customerGroups = ref<string[]>([]);
const territories = ref<string[]>([]);
const countries = ref<string[]>([]);

const newCustomer = ref({
    customer_name: "",
    tax_id: "",
    mobile_no: "",
    address_line1: "",
    city: "",
    country: "",
    email_id: "",
    gender: "Male",
    referral_code: "",
    birthday: "",
    customer_group: "Individual",
    territory: "Rest Of The World",
});

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

watch(() => customerStore.customers.length, () => {
    highlightedIndex.value = customerStore.customers.length > 0 ? 0 : -1;
});

onMounted(() => {
    nextTick(() => {
        const el = searchInput.value?.$el as HTMLElement | undefined;
        const input = el?.querySelector?.("input") || el;
        (input as HTMLInputElement)?.focus();
    });

    fetchDropdownOptions();
});

async function fetchDropdownOptions() {
    const [cachedGroups, cachedTerritories, cachedCountries] = await Promise.all([
        getCachedCustomerGroups(),
        getCachedTerritories(),
        getCachedCountries(),
    ]);

    if (cachedGroups.length) customerGroups.value = cachedGroups;
    if (cachedTerritories.length) territories.value = cachedTerritories;
    if (cachedCountries.length) countries.value = cachedCountries;

    if (!isOnline()) {
        if (!customerGroups.value.length) customerGroups.value = ["All Customer Groups"];
        if (!territories.value.length) territories.value = ["All Territories"];
        if (!countries.value.length) countries.value = ["Pakistan"];
        return;
    }
    try {
        const [groupsResult, territoriesResult, countriesResult] = await Promise.all([
            call<string[]>("xpos.api.customers.get_customer_groups").catch(() => [] as string[]),
            call<string[]>("xpos.api.customers.get_territories").catch(() => [] as string[]),
            call<string[]>("xpos.api.customers.get_countries").catch(() => [] as string[]),
        ]);

        if (groupsResult?.length) {
            customerGroups.value = groupsResult;
            await cacheCustomerGroups(groupsResult);
        } else if (!customerGroups.value.length) {
            customerGroups.value = ["All Customer Groups"];
        }

        if (territoriesResult?.length) {
            territories.value = territoriesResult;
            await cacheTerritories(territoriesResult);
        } else if (!territories.value.length) {
            territories.value = ["All Territories"];
        }

        if (countriesResult?.length) {
            countries.value = countriesResult;
            await cacheCountries(countriesResult);
        } else if (!countries.value.length) {
            countries.value = ["Pakistan"];
        }
    } catch {
        if (!customerGroups.value.length) customerGroups.value = ["All Customer Groups"];
        if (!territories.value.length) territories.value = ["All Territories"];
        if (!countries.value.length) countries.value = ["Pakistan"];
    }
}

function debouncedSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    highlightedIndex.value = -1;
    searchTimeout = setTimeout(() => {
        customerStore.searchCustomers(search.value);
    }, 300);
}

function moveHighlight(direction: number) {
    const len = customerStore.customers.length;
    if (len === 0) return;

    let newIdx = highlightedIndex.value + direction;
    if (newIdx < 0) newIdx = len - 1;
    if (newIdx >= len) newIdx = 0;
    highlightedIndex.value = newIdx;

    nextTick(() => {
        const btn = customerRefs[newIdx];
        if (btn) {
            btn.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    });
}

function selectHighlighted() {
    const idx = highlightedIndex.value;
    if (idx >= 0 && idx < customerStore.customers.length) {
        selectCustomer(customerStore.customers[idx]);
    }
}

function selectCustomer(cust: { name: string; customer_name?: string; image?: string; mobile_no?: string; email_id?: string }) {
    cartStore.setCustomer(cust);
    close();
}

async function createAndSelect() {
    if (!newCustomer.value.customer_name) return;
    isCreating.value = true;

    try {
        const payload: Record<string, unknown> = {
            customer_name: newCustomer.value.customer_name,
            mobile_no: newCustomer.value.mobile_no || undefined,
            email_id: newCustomer.value.email_id || undefined,
            tax_id: newCustomer.value.tax_id || undefined,
            gender: newCustomer.value.gender || undefined,
            referral_code: newCustomer.value.referral_code || undefined,
            birthday: newCustomer.value.birthday || undefined,
            customer_group: newCustomer.value.customer_group || undefined,
            territory: newCustomer.value.territory || undefined,
            address_line1: newCustomer.value.address_line1 || undefined,
            city: newCustomer.value.city || undefined,
            country: newCustomer.value.country || undefined,
        };

        Object.keys(payload).forEach((key) => {
            if (payload[key] === undefined) delete payload[key];
        });

        const result = await customerStore.createCustomer(payload);
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
    newCustomer.value = {
        customer_name: "",
        tax_id: "",
        mobile_no: "",
        address_line1: "",
        city: "",
        country: "",
        email_id: "",
        gender: "",
        referral_code: "",
        birthday: "",
        customer_group: "",
        territory: "",
    };
}
</script>
