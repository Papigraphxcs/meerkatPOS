<template>
	<div class="flex flex-col h-full">
		<!-- Cart Header -->
		<div class="shrink-0 px-4 pt-4 pb-3">
			<div class="flex items-center justify-between mb-3">
				<h2 class="text-base font-bold text-surface-800 flex items-center gap-2">
					<svg class="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
					</svg>
					Cart
					<span v-if="cartStore.itemCount > 0" class="xpos-badge-primary text-[10px]">
						{{ cartStore.itemCount }}
					</span>
				</h2>
			</div>

			<!-- Customer Selection -->
			<button
				@click="customerStore.showCustomerDialog = true; customerStore.searchCustomers()"
				class="w-full flex items-center gap-3 p-2.5 rounded-xl border border-dashed border-surface-300
							 hover:border-primary-400 hover:bg-primary-50/50 transition-all duration-200 group"
			>
				<div class="w-9 h-9 rounded-xl bg-surface-100 group-hover:bg-primary-100 flex items-center justify-center transition-colors">
					<svg class="w-4.5 h-4.5 text-surface-500 group-hover:text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
					</svg>
				</div>
				<div class="text-left flex-1 min-w-0">
					<p class="text-sm font-medium text-surface-700 truncate">{{ cartStore.customerName }}</p>
					<p class="text-[11px] text-surface-400">
						{{ cartStore.customer ? 'Click to change' : 'Click to select customer' }}
					</p>
				</div>
				<svg class="w-4 h-4 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
				</svg>
			</button>
		</div>

		<div class="xpos-divider mx-4"></div>

		<!-- Cart Items -->
		<div class="flex-1 overflow-y-auto px-4 xpos-scrollbar">
			<!-- Empty Cart -->
			<div v-if="cartStore.isEmpty" class="flex flex-col items-center justify-center h-full text-center py-8">
				<div class="w-20 h-20 rounded-full bg-surface-50 flex items-center justify-center mb-4">
					<svg class="w-10 h-10 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
					</svg>
				</div>
				<p class="text-sm font-medium text-surface-500">Cart is empty</p>
				<p class="text-xs text-surface-400 mt-1">Click on items to add them here</p>
			</div>

			<!-- Cart Item List -->
			<TransitionGroup v-else name="list" tag="div" class="space-y-1 py-1">
				<CartItem
					v-for="(item, index) in cartStore.items"
					:key="item.item_code + '-' + index"
					:item="item"
					:index="index"
					:currency-symbol="posStore.currencySymbol"
					@update-qty="cartStore.updateItemQty"
					@remove="cartStore.removeItem"
				/>
			</TransitionGroup>
		</div>

		<!-- Cart Summary & Actions -->
		<CartSummary />
	</div>
</template>

<script setup lang="ts">
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { useCustomerStore } from "@/stores/customerStore";
import CartItem from "./CartItem.vue";
import CartSummary from "./CartSummary.vue";

const posStore = usePosStore();
const cartStore = useCartStore();
const customerStore = useCustomerStore();
</script>
