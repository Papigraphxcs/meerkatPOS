<template>
	<transition name="fade">
		<div class="xpos-overlay" @click.self="close">
			<div class="xpos-dialog flex flex-col max-h-[80vh]">
				<!-- Header -->
				<div class="shrink-0 p-5 pb-4 border-b border-surface-100">
					<div class="flex items-center justify-between mb-3">
						<h2 class="text-lg font-bold text-surface-800">Select Customer</h2>
						<button @click="close" class="xpos-btn-icon">
							<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>

					<!-- Search -->
					<div class="relative">
						<svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
						</svg>
						<input
							ref="searchInput"
							v-model="search"
							type="text"
							placeholder="Search by name, phone, email..."
							class="xpos-input pl-9"
							@input="debouncedSearch"
						/>
					</div>
				</div>

				<!-- Customer List -->
				<div class="flex-1 overflow-y-auto xpos-scrollbar">
					<!-- Loading -->
					<div v-if="customerStore.isLoading" class="p-4 space-y-3">
						<div v-for="i in 5" :key="i" class="xpos-skeleton h-14 w-full rounded-xl"></div>
					</div>

					<!-- List -->
					<div v-else-if="customerStore.customers.length > 0" class="p-2">
						<button
							v-for="cust in customerStore.customers"
							:key="cust.name"
							@click="selectCustomer(cust)"
							class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-50 transition-colors text-left group"
						>
							<div class="w-10 h-10 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center shrink-0">
								<span class="text-sm font-bold text-primary-700">{{ getInitials(cust.customer_name) }}</span>
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium text-surface-800 truncate">{{ cust.customer_name }}</p>
								<div class="flex items-center gap-2 text-[11px] text-surface-400">
									<span v-if="cust.mobile_no">{{ cust.mobile_no }}</span>
									<span v-if="cust.email_id && cust.mobile_no">•</span>
									<span v-if="cust.email_id" class="truncate">{{ cust.email_id }}</span>
								</div>
							</div>
							<svg class="w-4 h-4 text-surface-300 group-hover:text-primary-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
							</svg>
						</button>
					</div>

					<!-- Empty -->
					<div v-else class="flex flex-col items-center justify-center h-48 text-surface-400">
						<svg class="w-12 h-12 mb-3 text-surface-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
						</svg>
						<p class="text-sm font-medium">No customers found</p>
					</div>
				</div>

				<!-- Footer -->
				<div class="shrink-0 p-4 border-t border-surface-100">
					<div v-if="!showNewForm">
						<button
							@click="showNewForm = true"
							class="w-full xpos-btn-secondary justify-center gap-2"
						>
							<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
							</svg>
							Create New Customer
						</button>
					</div>

					<!-- New Customer Form -->
					<div v-else class="space-y-3 animate-slide-up">
						<h3 class="text-sm font-semibold text-surface-700">New Customer</h3>
						<input
							v-model="newCustomer.customer_name"
							type="text"
							placeholder="Customer Name *"
							class="xpos-input"
						/>
						<input
							v-model="newCustomer.mobile_no"
							type="tel"
							placeholder="Mobile Number"
							class="xpos-input"
						/>
						<input
							v-model="newCustomer.email_id"
							type="email"
							placeholder="Email Address"
							class="xpos-input"
						/>
						<div class="flex gap-2">
							<button @click="showNewForm = false" class="xpos-btn-secondary flex-1 text-sm">Cancel</button>
							<button
								@click="createAndSelect"
								:disabled="!newCustomer.customer_name || isCreating"
								class="xpos-btn-primary flex-1 text-sm"
							>
								{{ isCreating ? 'Creating...' : 'Create & Select' }}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</transition>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";
import { useCartStore } from "@/stores/cartStore";
import { useCustomerStore } from "@/stores/customerStore";
import { showSuccess, showError } from "@/services/api";

const cartStore = useCartStore();
const customerStore = useCustomerStore();

const searchInput = ref<HTMLInputElement | null>(null);
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
	nextTick(() => searchInput.value?.focus());
});

function debouncedSearch() {
	if (searchTimeout) clearTimeout(searchTimeout);
	searchTimeout = setTimeout(() => {
		customerStore.searchCustomers(search.value);
	}, 300);
}

function selectCustomer(cust: { name: string; customer_name?: string }) {
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
