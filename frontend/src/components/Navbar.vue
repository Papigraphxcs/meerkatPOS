<template>
	<header class="h-14 bg-background border-b border-border flex items-center px-4 gap-3 shrink-0 z-30">
		<!-- Logo / Brand -->
		<div class="flex items-center gap-2.5">
			<img :src="isDark ? LogoDark : LogoLight" alt="X POS Logo" class="w-6 h-6" />
			<span
				class="text-lg font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent hidden sm:inline">
				X POS
			</span>
		</div>

		<!-- Navigation Tabs -->
		<nav class="flex items-center gap-1 ml-4">
			<router-link to="/pos" :class="cn(
				buttonVariants({ variant: route.name === 'pos' ? 'secondary' : 'ghost', size: 'sm' }),
				'gap-1.5 no-underline',
				route.name === 'pos' && 'bg-primary/10 text-primary hover:bg-primary/15'
			)">
				<LayoutGrid class="w-4 h-4" />
				<span>POS</span>
			</router-link>
			<router-link to="/orders" :class="cn(
				buttonVariants({ variant: route.name === 'orders' ? 'secondary' : 'ghost', size: 'sm' }),
				'gap-1.5 no-underline',
				route.name === 'orders' && 'bg-primary/10 text-primary hover:bg-primary/15'
			)">
				<FileText class="w-4 h-4" />
				<span>Orders</span>
			</router-link>
		</nav>

		<div class="flex-1"></div>

		<!-- Cash Movement Buttons -->
		<div v-if="posStore.enableCashMovement" class="hidden md:flex items-center gap-1">
			<Button v-if="posStore.allowPosExpense" variant="ghost" size="sm"
				class="text-muted-foreground hover:text-red-500 gap-1" @click="paymentStore.openCashMovement('expense')"
				title="POS Expense">
				<ArrowDownCircle class="w-4 h-4" />
				<span class="hidden lg:inline text-xs">Expense</span>
			</Button>
			<Button v-if="posStore.allowCashDeposit" variant="ghost" size="sm"
				class="text-muted-foreground hover:text-emerald-500 gap-1"
				@click="paymentStore.openCashMovement('deposit')" title="Cash Deposit">
				<ArrowUpCircle class="w-4 h-4" />
				<span class="hidden lg:inline text-xs">Deposit</span>
			</Button>
		</div>

		<!-- Return Button -->
		<Button variant="ghost" size="sm" class="text-muted-foreground hover:text-amber-500 gap-1"
			@click="showReturnDialog = true" title="Process Return">
			<RotateCcw class="w-4 h-4" />
			<span class="hidden lg:inline text-xs">Return</span>
		</Button>

		<!-- Print Last Invoice -->
		<Button v-if="posStore.allowPrintLastInvoice && posStore.lastInvoiceName" variant="ghost" size="sm"
			class="text-muted-foreground hover:text-foreground gap-1" @click="printLastInvoice"
			title="Print Last Invoice">
			<Printer class="w-4 h-4" />
		</Button>

		<!-- Profile Info -->
		<div class="hidden md:flex items-center">
			<Badge variant="secondary" class="gap-1.5">
				<Building2 class="w-3.5 h-3.5" />
				{{ posStore.profileName }}
			</Badge>
		</div>

		<!-- Dark Mode Toggle -->
		<Button variant="ghost" size="icon-sm" @click="toggleDarkMode"
			:title="isDark ? 'Switch to light mode' : 'Switch to dark mode'">
			<Sun v-if="isDark" class="w-4 h-4 text-amber-400" />
			<Moon v-else class="w-4 h-4" />
		</Button>

		<!-- User Avatar -->
		<Avatar size="sm">
			<AvatarFallback>
				<User class="w-3.5 h-3.5" />
			</AvatarFallback>
		</Avatar>

		<!-- Close Shift Button -->
		<Button v-if="!posStore.hideClosingShift" variant="ghost" size="sm"
			class="text-muted-foreground hover:text-destructive gap-1.5"
			@click="posStore.showClosingDialog = true; posStore.fetchClosingData()" title="Close Shift">
			<LogOut class="w-4 h-4" />
			<span class="hidden sm:inline">Close Shift</span>
		</Button>

		<!-- Return Dialog -->
		<ReturnDialog :open="showReturnDialog" @close="showReturnDialog = false" />
	</header>
</template>

<script setup lang="ts">
import { inject, ref, type Ref } from "vue";
import { useRoute } from "vue-router";
import { usePosStore } from "@/stores/posStore";
import { usePaymentStore } from "@/stores/paymentStore";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import ReturnDialog from "@/components/cart/ReturnDialog.vue";
import {
	LayoutGrid, FileText, Building2, Sun, Moon, User, LogOut,
	ArrowDownCircle, ArrowUpCircle, RotateCcw, Printer,
} from "lucide-vue-next";

import LogoDark from "@/assets/images/xpos-logo-dark.svg";
import LogoLight from "@/assets/images/xpos-logo-light.svg";

const route = useRoute();
const posStore = usePosStore();
const paymentStore = usePaymentStore();

const isDark = inject<Ref<boolean>>("isDark")!;
const toggleDarkMode = inject<() => void>("toggleDarkMode")!;

const showReturnDialog = ref(false);

function printLastInvoice() {
	const name = posStore.lastInvoiceName;
	if (!name) return;
	if (typeof frappe !== "undefined" && frappe.urllib) {
		const url = frappe.urllib.get_full_url(
			`/printview?doctype=Sales+Invoice&name=${encodeURIComponent(name)}&format=POS+Invoice&no_letterhead=0`
		);
		window.open(url, "_blank");
	}
}
</script>
