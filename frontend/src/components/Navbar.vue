<template>
	<header class="h-14 bg-background border-b border-border flex items-center px-4 gap-3 shrink-0 z-30">
		<div class="flex items-center gap-2.5">
			<img :src="isDark ? LogoDark : LogoLight" alt="X POS Logo" class="w-8 h-8" />
			<span>{{ __('X POS') }}</span>
		</div>
		<nav class="flex items-center gap-1 ml-4">
			<router-link to="/pos" :class="cn(
				buttonVariants({ variant: $route.name === 'pos' ? 'secondary' : 'ghost', size: 'sm' }),
				'gap-1.5 no-underline',
				$route.name === 'pos' && 'bg-primary/10 text-primary hover:bg-primary/15'
			)">
				<LayoutGrid class="w-4 h-4" />
				<span>{{ __('POS') }}</span>
			</router-link>
			<router-link to="/orders" :class="cn(
				buttonVariants({ variant: $route.name === 'orders' ? 'secondary' : 'ghost', size: 'sm' }),
				'gap-1.5 no-underline',
				$route.name === 'orders' && 'bg-primary/10 text-primary hover:bg-primary/15'
			)">
				<FileText class="w-4 h-4" />
				<span>{{ __('Orders') }}</span>
			</router-link>
		</nav>

		<!-- Spacer to push actions to the right -->
		<div class="flex-1"></div>

		<div v-if="posStore.enableCashMovement" class="hidden md:flex items-center gap-1">
			<Button v-if="posStore.allowPosExpense" variant="ghost" size="sm"
				class="text-muted-foreground hover:text-red-500 gap-1" @click="paymentStore.openCashMovement('expense')"
				:title="__('POS Expense')">
				<ArrowDownCircle class="w-4 h-4" />
				<span class="hidden lg:inline text-xs">{{ __('Expense') }}</span>
			</Button>
			<Button v-if="posStore.allowCashDeposit" variant="ghost" size="sm"
				class="text-muted-foreground hover:text-emerald-500 gap-1"
				@click="paymentStore.openCashMovement('deposit')" :title="__('Cash Deposit')">
				<ArrowUpCircle class="w-4 h-4" />
				<span class="hidden lg:inline text-xs">{{ __('Deposit') }}</span>
			</Button>
		</div>

		<Button variant="ghost" size="sm" class="text-muted-foreground hover:text-blue-500 gap-1"
			@click="showRepeatDialog = true" :title="__('Repeat Invoice (Ctrl+G)')">
			<Repeat class="w-4 h-4" />
			<span class="hidden lg:inline text-xs">{{ __('Repeat') }}</span>
		</Button>

		<Button variant="ghost" size="sm" class="text-muted-foreground hover:text-amber-500 gap-1"
			@click="showReturnDialog = true" :title="__('Process Return')">
			<RotateCcw class="w-4 h-4" />
			<span class="hidden lg:inline text-xs">{{ __('Return') }}</span>
		</Button>

		<Button v-if="posStore.allowPrintLastInvoice && posStore.lastInvoiceName" variant="ghost" size="sm"
			class="text-muted-foreground hover:text-foreground gap-1" @click="printLastInvoice"
			:title="__('Print Last Invoice')">
			<Printer class="w-4 h-4" />
		</Button>

		<div class="flex items-center gap-1">
			<Button variant="ghost" size="sm" :class="['gap-1.5', offlineStore.statusColor]"
				@click="handleOfflineAction" :title="offlineStore.statusLabel">
				<Loader2 v-if="offlineStore.isSyncing" class="w-4 h-4 animate-spin" />
				<WifiOff v-else-if="!isOnline()" class="w-4 h-4" />
				<CloudUpload v-else-if="offlineStore.hasPending" class="w-4 h-4" />
				<Wifi v-else class="w-4 h-4" />
				<Badge v-if="offlineStore.pendingCount > 0" variant="destructive"
					class="h-4 min-w-4 px-1 text-[10px] leading-none">
					{{ offlineStore.pendingCount }}
				</Badge>
				<span class="hidden lg:inline text-xs">{{ offlineStore.statusLabel }}</span>
			</Button>
		</div>

		<OfflinePendingPanel :open="showOfflinePanel" @close="showOfflinePanel = false" />

		<div class="hidden md:flex items-center">
			<Badge variant="secondary" class="gap-1.5">
				<Building2 class="w-3.5 h-3.5" />
				{{ posStore.warehouse }}
			</Badge>
		</div>

		<Button variant="ghost" size="icon-sm" @click="toggleDarkMode" :title="themeTooltip"
			:class="{ 'text-amber-400': theme === 'dark', 'text-blue-400': theme === 'system' }">
			<component :is="themeIcon" class="w-4 h-4" />
		</Button>
		
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
			<PopoverContentStyled class="w-56 p-2" align="end">
				<div class="px-2 py-1.5 border-b border-border mb-1">
					<p class="text-sm font-medium">{{ authStore.userFullName || __('User') }}</p>
					<p class="text-xs text-muted-foreground">{{ authStore.userEmail }}</p>
				</div>
				<Button variant="ghost" size="sm"
					class="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
					@click="handleSignOut">
					<Power class="w-4 h-4" />
					{{ __('Sign Out') }}
				</Button>
			</PopoverContentStyled>
		</Popover>

		<Button v-if="!posStore.hideClosingShift" variant="ghost" size="sm"
			class="text-muted-foreground hover:text-destructive gap-1.5"
			@click="posStore.showClosingDialog = true; posStore.fetchClosingData()" :title="__('Close Shift')">
			<LogOut class="w-4 h-4" />
			<span class="hidden sm:inline">{{ __('Close Shift') }}</span>
		</Button>

		<ReturnDialog :open="showReturnDialog" @close="showReturnDialog = false" />

		<RepeatInvoiceDialog :open="showRepeatDialog" @close="showRepeatDialog = false" />
	</header>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, type Ref } from "vue";
import { usePosStore } from "@/stores/posStore";
import { usePaymentStore } from "@/stores/paymentStore";
import { useAuthStore } from "@/stores/authStore";
import { __ } from "@/lib/translate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContentStyled, PopoverTrigger } from "@/components/ui/popover";
import ReturnDialog from "@/components/cart/ReturnDialog.vue";
import RepeatInvoiceDialog from "@/components/cart/RepeatInvoiceDialog.vue";
import {
	Building2, Sun, Moon, Monitor, User, LogOut,
	ArrowDownCircle, ArrowUpCircle, RotateCcw, Repeat, Printer, Power,
	Wifi, WifiOff, CloudUpload, Loader2,
	LayoutGrid, FileText
} from "lucide-vue-next";
import OfflinePendingPanel from "@/components/offline/OfflinePendingPanel.vue";
import { useOfflineStore } from "@/stores/offlineStore";

import LogoDark from "@/assets/images/xpos-logo-dark.svg";
import LogoLight from "@/assets/images/xpos-logo-light.svg";
import { isOnline } from "@/utils";
import { cn } from "@/lib/utils";

const posStore = usePosStore();
const paymentStore = usePaymentStore();
const authStore = useAuthStore();

const isDark = inject<Ref<boolean>>("isDark")!;
const theme = inject<Ref<"light" | "dark" | "system">>("theme")!;
const toggleDarkMode = inject<() => void>("toggleDarkMode")!;

const themeIcon = computed(() => {
	if (theme.value === "system") return Monitor;
	if (theme.value === "dark") return Moon;
	return Sun;
});

const themeTooltip = computed(() => {
	if (theme.value === "light") return __('Theme: Light (click to switch to Dark)');
	if (theme.value === "dark") return __('Theme: Dark (click to switch to System)');
	return __('Theme: System ({0}) (click to switch to Light)', [isDark.value ? __('Dark') : __('Light')]);
});
const offlineStore = useOfflineStore();

const showReturnDialog = ref(false);
const showRepeatDialog = ref(false);
const showOfflinePanel = ref(false);

function handleOfflineAction() {
	if (offlineStore.hasPending) {
		showOfflinePanel.value = true;
	} else if (!isOnline()) {
		showOfflinePanel.value = true;
	}
}

function handleShowRepeatDialog() {
	showRepeatDialog.value = true;
}

function handleShowReturnDialog() {
	showReturnDialog.value = true;
}

function handleKeyboard(e: KeyboardEvent) {
	if (e.ctrlKey && e.key.toLowerCase() === "g") {
		e.preventDefault();
		showRepeatDialog.value = true;
	}
	if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "r") {
		e.preventDefault();
		showReturnDialog.value = true;
	}
}

onMounted(() => {
	window.addEventListener("keydown", handleKeyboard);
	window.addEventListener("xpos:show-repeat-dialog", handleShowRepeatDialog as EventListener);
	window.addEventListener("xpos:show-return-dialog", handleShowReturnDialog as EventListener);
});

onUnmounted(() => {
	window.removeEventListener("keydown", handleKeyboard);
	window.removeEventListener("xpos:show-repeat-dialog", handleShowRepeatDialog as EventListener);
	window.removeEventListener("xpos:show-return-dialog", handleShowReturnDialog as EventListener);
});

function printLastInvoice() {
	const name = posStore.lastInvoiceName;
	if (!name) return;
	if (typeof frappe !== "undefined" && frappe.urllib) {
		const url = frappe.urllib.get_full_url(
			`/printview?doctype=Sales+Invoice&name=${encodeURIComponent(name)}&format=POS+Invoice&no_letterhead=0&trigger_print=1`
		);
		window.open(url, "_blank");
	}
}

function handleSignOut() {
	authStore.logout();
}
</script>
