<template>
	<div class="flex flex-col h-full">
		<!-- Return Mode Banner -->
		<div v-if="cartStore.isReturnMode"
			class="shrink-0 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between"
		>
			<div class="flex items-center gap-2">
				<RotateCcw class="w-4 h-4 text-amber-600" />
				<span class="text-sm font-semibold text-amber-700 dark:text-amber-400">Return Mode</span>
				<span v-if="cartStore.returnAgainst" class="text-xs text-amber-600/70 dark:text-amber-400/70 font-mono">
					{{ cartStore.returnAgainst }}
				</span>
			</div>
			<Button variant="ghost" size="icon-sm" class="text-amber-600 hover:text-amber-700" @click="cartStore.exitReturnMode()">
				<X class="w-4 h-4" />
			</Button>
		</div>

		<!-- Cart Header -->
		<div class="shrink-0 px-4 pt-4 pb-3">
			<div class="flex items-center justify-between mb-3 space-x-2">
				<h2 class="text-base font-bold text-foreground flex items-center gap-2">
					<ShoppingCart class="w-5 h-5 text-primary dark:text-primary" />
					Cart
					<Badge v-if="cartStore.itemCount > 0" variant="secondary" class="text-[10px]">
						{{ cartStore.itemCount }}
					</Badge>
				</h2>
				<Button
					v-if="cartStore.customer && !cartStore.isReturnMode"
					variant="outline"
					size="sm"
					class="w-fit justify-start gap-2 border-violet-300 text-violet-600 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-900/20"
					@click="customerStore.showLoyaltyDialog = true"
				>
				<Gift class="w-4 h-4" />
				Loyalty Program
			</Button>
			</div>

			<!-- Customer Selection -->
			<button
				@click="handleCustomerClick"
				class="w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all duration-200 group"
				:class="cartStore.isReturnMode
					? 'border-border bg-muted/50 cursor-not-allowed dark:border-muted-foreground/30'
					: 'border-dashed border-border hover:border-primary hover:bg-primary/5 dark:border-muted-foreground/30 dark:hover:border-primary'"
				:disabled="cartStore.isReturnMode"
			>
				<Avatar size="sm" class="group-hover:ring-2 group-hover:ring-primary/20 transition-all">
					<img
						v-if="cartStore.customer && cartStore.customer.image"
						:src="cartStore.customer.image as string"
						:alt="cartStore.customer.customer_name"
						class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
						loading="lazy"
					/>
					<AvatarFallback>
						<User class="w-3.5 h-3.5" />
					</AvatarFallback>
				</Avatar>
				<div class="text-left flex-1 min-w-0">
					<p class="text-sm font-medium text-foreground truncate">{{ cartStore.customerName }}</p>
					<p class="text-[11px] text-muted-foreground">
						<template v-if="cartStore.isReturnMode">
							Customer locked for return
						</template>
						<template v-else>
							{{ cartStore.customer ? 'Click to change' : 'Click to select customer' }}
						</template>
					</p>
				</div>
				<Lock v-if="cartStore.isReturnMode" class="w-4 h-4 text-muted-foreground/50" />
				<ChevronDown v-else class="w-4 h-4 text-muted-foreground/50" />
			</button>
		</div>

		<Separator class="mx-4" />

		<!-- Cart Items -->
		<div class="flex-1 overflow-y-auto px-4 xpos-scrollbar">
			<!-- Empty Cart -->
			<div v-if="cartStore.isEmpty" class="flex flex-col items-center justify-center h-full text-center py-8">
				<div class="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
					<ShoppingCart class="w-10 h-10 text-muted-foreground/40" />
				</div>
				<p class="text-sm font-medium text-muted-foreground">Cart is empty</p>
				<p class="text-xs text-muted-foreground/70 mt-1">Click on items to add them here</p>
			</div>

			<!-- Cart Item List -->
			<TransitionGroup v-else name="list" tag="div" class="space-y-1 py-1">
				<CartItem
					v-for="(item, index) in cartStore.items"
					:key="item.item_code + '-' + index"
					:item="item"
					:index="index"
					:currency-symbol="posStore.currencySymbol"
					@update-qty="handleUpdateQty"
					@update-rate="cartStore.updateItemRate"
					@update-discount="cartStore.updateItemDiscount"
					@update-uom="cartStore.updateItemUOM"
					@remove="cartStore.removeItem"
				/>
			</TransitionGroup>
		</div>

		<!-- Order Notes -->
		<div v-if="posStore.displayAdditionalNotes && !cartStore.isEmpty" class="shrink-0 px-4 py-2 border-t border-border">
			<textarea
				v-model="cartStore.orderNotes"
				rows="2"
				placeholder="Add order notes..."
				class="w-full text-xs rounded-md border border-input bg-background px-3 py-1.5 ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
			/>
		</div>

		<!-- Authorization Code -->
		<div v-if="posStore.displayAuthorizationCode && !cartStore.isEmpty" class="shrink-0 px-4 pb-2">
			<Input
				v-model="cartStore.authorizationCode"
				type="text"
				placeholder="Authorization code..."
				class="text-xs"
			/>
		</div>

		<!-- Applied Offers -->
		<div v-if="cartStore.hasOffers && !cartStore.isEmpty" class="shrink-0 px-4 pb-2 space-y-1">
			<div v-for="offer in cartStore.appliedOffers" :key="offer.name"
				class="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-1.5 text-xs"
			>
				<span class="text-emerald-700 dark:text-emerald-400 font-medium">{{ offer.offer_name || offer.name }}</span>
				<button @click="cartStore.removeOffer(offer.name)" class="text-muted-foreground hover:text-destructive">
					<X class="w-3.5 h-3.5" />
				</button>
			</div>
			<div v-if="cartStore.appliedCoupon"
				class="flex items-center justify-between bg-violet-500/5 border border-violet-500/20 rounded-lg px-3 py-1.5 text-xs"
			>
				<span class="text-violet-700 dark:text-violet-400 font-medium">
					Coupon: {{ cartStore.appliedCoupon.coupon_code || cartStore.appliedCoupon.name }}
				</span>
				<button @click="cartStore.removeCoupon()" class="text-muted-foreground hover:text-destructive">
					<X class="w-3.5 h-3.5" />
				</button>
			</div>
		</div>

		<!-- Cart Summary & Actions -->
		<CartSummary />
	</div>
</template>

<script setup lang="ts">
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { useCustomerStore } from "@/stores/customerStore";
import { showError } from "@/services/api";
import CartItem from "./CartItem.vue";
import CartSummary from "./CartSummary.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart, User, ChevronDown, RotateCcw, X, Lock, Gift } from "lucide-vue-next";

const posStore = usePosStore();
const cartStore = useCartStore();
const customerStore = useCustomerStore();

// Handle customer selection click - disabled in return mode
function handleCustomerClick() {
	if (cartStore.isReturnMode) {
		showError("Customer cannot be changed in return mode");
		return;
	}
	customerStore.showCustomerDialog = true;
	customerStore.searchCustomers();
}

// Wrapper function to handle qty update with error messages
function handleUpdateQty(index: number, qty: number) {
	const result = cartStore.updateItemQty(index, qty);
	if (!result.success && result.message) {
		showError(result.message);
	}
}
</script>
