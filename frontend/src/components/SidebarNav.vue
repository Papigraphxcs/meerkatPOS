<template>
	<div class="p-4 border-b border-border flex items-center gap-3">
		<img :src="isDark ? logoDark : logoLight" alt="meerkatPOS Logo" class="w-8 h-8" />
		<div>
			<h1 class="font-semibold text-foreground">meerkatPOS</h1>
			<p class="text-xs text-muted-foreground">{{ posStore.companyName }}</p>
		</div>
	</div>

	<ScrollArea class="flex-1">
		<nav class="p-2 space-y-1">
			<p class="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
				{{ __("Main") }}
			</p>
			<router-link
				v-for="item in mainNavItems.filter((it) => it.show)"
				:key="item.route"
				:to="item.route"
				@click="$emit('navigate')"
				:class="
					cn(
						'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors no-underline',
						isActive(item.route)
							? 'bg-primary/10 text-primary'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground',
					)
				"
			>
				<component :is="item.icon" class="w-4 h-4 shrink-0" />
				<span>{{ item.label }}</span>
			</router-link>

			<p
				v-if="purchaseNavItems.some((it) => it.show)"
				class="px-3 py-2 pt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
			>
				{{ __("Purchasing") }}
			</p>
			<router-link
				v-for="item in purchaseNavItems.filter((it) => it.show)"
				:key="item.route"
				:to="item.route"
				@click="$emit('navigate')"
				:class="
					cn(
						'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors no-underline',
						isActive(item.route)
							? 'bg-primary/10 text-primary'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground',
					)
				"
			>
				<component :is="item.icon" class="w-4 h-4 shrink-0" />
				<span>{{ item.label }}</span>
			</router-link>

			<template v-if="financeNavItems.some((it) => it.show)">
				<p class="px-3 py-2 pt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
					{{ __("Finance") }}
				</p>
				<router-link
					v-for="item in financeNavItems.filter((it) => it.show)"
					:key="item.route"
					:to="item.route"
					@click="$emit('navigate')"
					:class="
						cn(
							'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors no-underline',
							isActive(item.route)
								? 'bg-primary/10 text-primary'
								: 'text-muted-foreground hover:bg-muted hover:text-foreground',
						)
					"
				>
					<component :is="item.icon" class="w-4 h-4 shrink-0" />
					<span>{{ item.label }}</span>
				</router-link>
			</template>

			<p class="px-3 py-2 pt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
				{{ __("Tools") }}
			</p>
			<router-link
				v-for="item in toolsNavItems.filter((it) => it.show)"
				:key="item.route"
				:to="item.route"
				@click="$emit('navigate')"
				:class="
					cn(
						'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors no-underline',
						isActive(item.route)
							? 'bg-primary/10 text-primary'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground',
					)
				"
			>
				<component :is="item.icon" class="w-4 h-4 shrink-0" />
				<span>{{ item.label }}</span>
			</router-link>
		</nav>
	</ScrollArea>

	<div class="p-3 border-t border-border">
		<div class="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
			<Building2 class="w-3.5 h-3.5" />
			<span class="truncate">{{ posStore.warehouse }}</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { inject, type Ref, computed } from "vue";
import { useRoute } from "vue-router";
import { usePosStore } from "@/stores/posStore";
import { cn } from "@/lib/utils";
import { __ } from "@/lib/translate";
import { hasPermission } from "@/services/userRights";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	LayoutGrid,
	FileText,
	ClipboardList,
	PackageCheck,
	PackagePlus,
	Printer,
	Building2,
	Receipt,
	Settings,
	Wallet,
	Landmark,
	BarChart3,
	Banknote,
	ScanBarcode,
} from "lucide-vue-next";

import { useBranding } from "@/composables/useBranding";
import { isElectron } from "@/services/electronBridge";

defineEmits<{ navigate: [] }>();

const route = useRoute();
const posStore = usePosStore();
const isDark = inject<Ref<boolean>>("isDark")!;
const { logoLight, logoDark } = useBranding();

const mainNavItems = computed(() => [
	{ route: "/pos", label: __("POS"), icon: LayoutGrid, show: true },
	{ route: "/orders", label: __("Orders"), icon: FileText, show: true },
	{
		route: "/cashier",
		label: __("Cashier"),
		icon: Banknote,
		show: posStore.enableCashierSettlement && posStore.isCashier,
	},
	{ route: "/reports", label: __("Reports"), icon: BarChart3, show: true },
]);

const purchaseNavItems = computed(() => [
	{
		route: "/purchase-order",
		label: __("Purchase Order"),
		icon: ClipboardList,
		show: hasPermission("purchase_order"),
	},
	{
		route: "/purchase-invoices",
		label: __("Purchase Invoice"),
		icon: Receipt,
		show: hasPermission("purchase_order"),
	},
	{
		route: "/stock-receiving",
		label: __("Stock Receiving"),
		icon: PackageCheck,
		show: hasPermission("stock_entry"),
	},
	{
		route: "/add-stock",
		label: __("Add Stock"),
		icon: PackagePlus,
		show: hasPermission("material_receipt"),
	},
]);

const toolsNavItems = [
	{ route: "/price-checker", label: __("Price Checker"), icon: ScanBarcode, show: true },
	{ route: "/barcode-print", label: __("Barcode Printer"), icon: Printer, show: true },
	{ route: "/settings", label: __("Settings"), icon: Settings, show: isElectron() },
];

const financeNavItems = computed(() => [
	{
		route: "/expenses",
		label: __("Expenses"),
		icon: Wallet,
		show: hasPermission("expense") && posStore.allowPosExpense,
	},
	{
		route: "/bank-drops",
		label: __("Bank Drops"),
		icon: Landmark,
		show: hasPermission("bank_drop") && posStore.allowCashDeposit,
	},
]);

function isActive(path: string): boolean {
	if (path === "/reports") {
		return route.path === path || route.path.startsWith("/reports/");
	}
	if (path === "/purchase-invoices") {
		return route.path === "/purchase-invoices" || route.path === "/purchase-invoice";
	}
	return route.path === path;
}
</script>
