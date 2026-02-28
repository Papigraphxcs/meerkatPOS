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
			:title="themeTooltip"
			:class="{ 'text-amber-400': theme === 'dark', 'text-blue-400': theme === 'system' }">
			<component :is="themeIcon" class="w-4 h-4" />
		</Button>

		<!-- User Menu -->
		<Popover>
			<PopoverTrigger as-child>
				<Button variant="ghost" size="icon-sm" class="rounded-full">
					<Avatar size="sm">
						<AvatarFallback>
							<User class="w-3.5 h-3.5" />
						</AvatarFallback>
					</Avatar>
				</Button>
			</PopoverTrigger>
			<PopoverContent class="w-56 p-2" align="end">
				<div class="px-2 py-1.5 border-b border-border mb-1">
					<p class="text-sm font-medium">{{ authStore.userFullName || 'User' }}</p>
					<p class="text-xs text-muted-foreground">{{ authStore.userEmail }}</p>
				</div>
				<Button
					variant="ghost"
					size="sm"
					class="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
					@click="handleSignOut"
				>
					<Power class="w-4 h-4" />
					Sign Out
				</Button>
			</PopoverContent>
		</Popover>

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
import { computed, inject, ref, type Ref } from "vue";
import { useRoute } from "vue-router";
import { usePosStore } from "@/stores/posStore";
import { usePaymentStore } from "@/stores/paymentStore";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ReturnDialog from "@/components/cart/ReturnDialog.vue";
import {
	LayoutGrid, FileText, Building2, Sun, Moon, Monitor, User, LogOut,
	ArrowDownCircle, ArrowUpCircle, RotateCcw, Printer, Power,
} from "lucide-vue-next";

import LogoDark from "@/assets/images/xpos-logo-dark.svg";
import LogoLight from "@/assets/images/xpos-logo-light.svg";

const route = useRoute();
const posStore = usePosStore();
const paymentStore = usePaymentStore();
const authStore = useAuthStore();

const isDark = inject<Ref<boolean>>("isDark")!;
const theme = inject<Ref<"light" | "dark" | "system">>("theme")!;
const toggleDarkMode = inject<() => void>("toggleDarkMode")!;

// Compute which icon and tooltip to show
const themeIcon = computed(() => {
	if (theme.value === "system") return Monitor;
	if (theme.value === "dark") return Moon;
	return Sun;
});
const themeTooltip = computed(() => {
	if (theme.value === "light") return "Theme: Light (click to switch to Dark)";
	if (theme.value === "dark") return "Theme: Dark (click to switch to System)";
	return `Theme: System (${isDark.value ? 'Dark' : 'Light'}) (click to switch to Light)`;
});

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

function handleSignOut() {
	authStore.logout();
}
</script>
