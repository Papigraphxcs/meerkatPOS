<template>
	<div class="flex flex-col h-full">
		<div
			v-if="cartStore.isReturnMode"
			class="shrink-0 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between"
		>
			<div class="flex items-center gap-2">
				<RotateCcw class="w-4 h-4 text-amber-600" />
				<span class="text-sm font-semibold text-amber-700 dark:text-amber-400">{{
					__("Return Mode")
				}}</span>
				<span
					v-if="cartStore.returnAgainst"
					class="text-xs text-amber-600/70 dark:text-amber-400/70 font-mono"
				>
					{{ cartStore.returnAgainst }}
				</span>
			</div>
			<Button
				variant="ghost"
				size="icon-sm"
				class="text-amber-600 hover:text-amber-700"
				@click="cartStore.exitReturnMode()"
			>
				<X class="w-4 h-4" />
			</Button>
		</div>

		<div class="shrink-0 px-4 pt-4 pb-3 border-b space-y-3">
			<div class="grid grid-cols-3 items-center gap-2">
				<div></div>
				<h2 class="justify-self-center text-base font-bold text-foreground flex items-center gap-2">
					<span class="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center">
						<ShoppingCart class="w-4 h-4" />
					</span>
					{{ __("Cart") }}
				</h2>
				<div class="justify-self-end text-end shrink-0">
					<p v-if="cartStore.orderNumber > 0" class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						{{ __("Order ID") }}
					</p>
					<p v-if="cartStore.orderNumber > 0" class="text-sm font-bold text-foreground font-mono">
						#{{ cartStore.orderNumber }}
					</p>
					<Badge v-else-if="cartStore.itemCount > 0" variant="secondary" class="text-[10px]">
						{{ cartStore.itemCount }} {{ __("items") }}
					</Badge>
				</div>
			</div>

			<div v-if="posStore.salesPersonEnabled && !cartStore.isReturnMode" class="flex items-center gap-2">
				<Autocomplete
					v-model="cartStore.salesPerson"
					doctype="Sales Person"
					query="xpos.api.customers.sales_person_query"
					:filters="{ pos_profile: posStore.profileName }"
					:placeholder="__('Sales Person')"
					:open-on-focus="true"
					:clearable="true"
					:compact="true"
					:min-chars="0"
					class="min-w-0 flex-1 max-w-44"
				/>
			</div>
		</div>

		<div
			v-if="!cartStore.isEmpty && cartStore.items.length > 5"
			class="shrink-0 px-4 pt-3"
		>
			<div class="relative">
				<Search class="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
				<input
					v-model="cartSearchTerm"
					type="text"
					:placeholder="__('Search in order...')"
					class="w-full ps-8 pe-2.5 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
				/>
			</div>
		</div>

		<div
			v-if="cartStore.isEmpty"
			class="flex-1 flex flex-col items-center justify-center text-center py-8"
		>
			<div class="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
				<ShoppingCart class="w-10 h-10 text-muted-foreground/40" />
			</div>
			<p class="text-sm font-medium text-muted-foreground">{{ __("Cart is empty") }}</p>
			<p class="text-xs text-muted-foreground/70 mt-1">
				{{ __("Click on items to add them here") }}
			</p>
		</div>

		<div
			v-else
			class="flex-1 min-h-0 flex flex-col mx-4 mt-3 border-x border-t border-border rounded-t-2xl bg-muted/40 dark:bg-muted/10"
		>
			<div class="shrink-0 flex items-center justify-between gap-2 px-4 pt-3 pb-2">
				<span class="text-xs font-semibold font-mono text-foreground truncate">
					{{ posStore.companyName || __("Receipt") }}
				</span>
				<span
					v-if="cartStore.orderNumber > 0"
					class="text-[11px] font-mono text-muted-foreground shrink-0"
				>
					№{{ cartStore.orderNumber }}<template v-if="orderStartedAtLabel"> · {{ orderStartedAtLabel }}</template>
				</span>
			</div>

			<div class="relative shrink-0">
				<div class="border-t border-dashed border-border"></div>
				<div
					class="absolute top-1/2 start-0 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-background dark:bg-card"
				></div>
				<div
					class="absolute top-1/2 end-0 translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-background dark:bg-card"
				></div>
			</div>

			<div ref="cartScrollContainer" class="flex-1 overflow-y-auto px-4 meerkatpos-scrollbar">
				<div class="py-0.5">
					<CartItem
						v-for="{ item, index } in filteredCartItems"
						:key="
							item.item_code +
							'-' +
							(item.serial_no || '') +
							'-' +
							(item.batch_no || '') +
							'-' +
							index
						"
						:item="item"
						:index="index"
						:currency-symbol="posStore.currencySymbol"
						@update-qty="handleUpdateQty"
						@update-rate="cartStore.updateItemRate"
						@update-discount="cartStore.updateItemDiscount"
						@update-uom="cartStore.updateItemUOM"
						@remove="cartStore.removeItem"
					/>
				</div>
			</div>

			<div
				v-if="posStore.displayAdditionalNotes"
				class="shrink-0 px-4 py-2 border-t border-dashed border-border"
			>
				<textarea
					v-model="cartStore.orderNotes"
					rows="2"
					placeholder="Add order notes..."
					class="w-full text-xs rounded-md border border-input bg-background px-3 py-1.5 ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
				/>
			</div>

			<div v-if="cartStore.hasOffers" class="shrink-0 px-4 pb-3 pt-1 space-y-1">
				<div
					v-for="offer in cartStore.appliedOffers"
					:key="offer.name"
					class="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-1.5 text-xs"
				>
					<span class="text-emerald-700 dark:text-emerald-400 font-medium">
						{{ offer.offer_name || offer.name }}
					</span>
					<button
						@click="cartStore.removeOffer(offer.name)"
						class="text-muted-foreground hover:text-destructive"
					>
						<X class="w-3.5 h-3.5" />
					</button>
				</div>
				<div
					v-if="cartStore.appliedCoupon"
					class="flex items-center justify-between bg-violet-500/5 border border-violet-500/20 rounded-lg px-3 py-1.5 text-xs"
				>
					<span class="text-violet-700 dark:text-violet-400 font-medium">
						{{ __("Coupon") }}:
						{{ cartStore.appliedCoupon.coupon_code || cartStore.appliedCoupon.name }}
					</span>
					<button
						@click="cartStore.removeCoupon()"
						class="text-muted-foreground hover:text-destructive"
					>
						<X class="w-3.5 h-3.5" />
					</button>
				</div>
			</div>
		</div>

		<CartSummary />
		<CustomerEditDialog />
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { showError } from "@/services/api";
import CartItem from "./CartItem.vue";
import CartSummary from "./CartSummary.vue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Autocomplete } from "@/components/ui/autocomplete";
import { ShoppingCart, RotateCcw, X, Search } from "lucide-vue-next";
import __ from "@/lib/translate";
import CustomerEditDialog from "@/components/dialogs/CustomerEditDialog.vue";

const posStore = usePosStore();
const cartStore = useCartStore();

const cartScrollContainer = ref<HTMLElement | null>(null);
const cartSearchTerm = ref("");

const filteredCartItems = computed(() => {
	const indexed = cartStore.items.map((item, index) => ({ item, index }));
	const term = cartSearchTerm.value.trim().toLowerCase();
	if (!term) return indexed;
	return indexed.filter(({ item }) => item.item_name.toLowerCase().includes(term));
});

const orderStartedAtLabel = computed(() => {
	const startedAt = cartStore.orderStartedAt;
	if (!startedAt) return "";
	return startedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
});

onMounted(() => {
	window.addEventListener("meerkatpos:focus-cart-item", handleFocusCartItem);
});

onUnmounted(() => {
	window.removeEventListener("meerkatpos:focus-cart-item", handleFocusCartItem);
});

function handleFocusCartItem() {
	if (cartStore.isEmpty) return;
	const firstItemEl = document.querySelector('[data-cart-index="0"]');
	const allInputs = firstItemEl?.querySelectorAll('input[type="number"]');
	if (!allInputs || allInputs.length === 0) return;
	const qtyEl = (allInputs.length > 1 ? allInputs[1] : allInputs[0]) as HTMLInputElement;
	qtyEl.focus();
	qtyEl.select();
}

watch(
	() => cartStore.items.length,
	(newLen, oldLen) => {
		if (newLen > oldLen) {
			nextTick(() => {
				const container = cartScrollContainer.value;
				if (!container) return;

				container.scrollTo({
					top: container.scrollHeight,
					behavior: "smooth",
				});

				const lastChild = container.querySelector("[data-cart-index]:last-of-type") as HTMLElement | null;
				if (lastChild) {
					lastChild.classList.add("bg-primary/10");
					setTimeout(() => {
						lastChild.classList.remove("bg-primary/10");
					}, 800);
				}
			});
		}
	},
);

function handleUpdateQty(index: number, qty: number) {
	const result = cartStore.updateItemQty(index, qty);
	if (!result.success && result.message) {
		showError(result.message);
	}
}
</script>
