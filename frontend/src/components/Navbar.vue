<template>
	<header class="h-14 bg-background border-b border-border flex items-center px-4 gap-3 shrink-0 z-30">
		<TooltipWrapper :content="__('Go to Desk')">
			<Button
				variant="outline"
				size="icon-sm"
				class="text-muted-foreground hover:text-foreground"
				@click="goToDesk"
			>
				<LayoutDashboard class="w-4 h-4" />
			</Button>
		</TooltipWrapper>

		<div class="flex-1 flex items-center justify-center gap-1">
			<TooltipWrapper :content="__('Search Items (Ctrl+K)')">
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-foreground gap-1"
					@click="openSearch"
				>
					<Search class="w-4 h-4" />
					<span class="hidden lg:inline text-xs">{{ __("Search") }}</span>
				</Button>
			</TooltipWrapper>

			<TooltipWrapper :content="__('Repeat Invoice (Ctrl+G)')">
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-primary gap-1"
					@click="showRepeatDialog = true"
				>
					<Repeat class="w-4 h-4" />
					<span class="hidden lg:inline text-xs">{{ __("Repeat") }}</span>
				</Button>
			</TooltipWrapper>

			<TooltipWrapper
				v-if="posStore.allowReturn && hasPermission('sale_return')"
				:content="__('Process Return')"
			>
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-amber-500 gap-1"
					@click="showReturnDialog = true"
				>
					<RotateCcw class="w-4 h-4" />
					<span class="hidden lg:inline text-xs">{{ __("Return") }}</span>
				</Button>
			</TooltipWrapper>

			<TooltipWrapper
				v-if="posStore.lastInvoiceName && hasPermission('allow_reprint_invoice')"
				:content="__('Print Last Invoice')"
			>
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-foreground gap-1"
					@click="printLastInvoice"
				>
					<Printer class="w-4 h-4" />
				</Button>
			</TooltipWrapper>
		</div>

		<div class="flex items-center gap-2 shrink-0">
			<div v-if="posStore.useOfflineMode" class="flex items-center gap-1">
				<TooltipWrapper :content="offlineStore.statusLabel">
					<Button
						variant="ghost"
						size="sm"
						:class="['gap-1.5', offlineStore.statusColor]"
						@click="handleOfflineAction"
					>
						<Loader2 v-if="offlineStore.isSyncing" class="w-4 h-4 animate-spin" />
						<WifiOff v-else-if="!offlineStore.isOnline" class="w-4 h-4" />
						<CloudUpload v-else-if="offlineStore.hasPending" class="w-4 h-4" />
						<Wifi v-else class="w-4 h-4" />
						<Badge
							v-if="offlineStore.pendingCount > 0"
							variant="destructive"
							class="h-4 min-w-4 px-1 text-[10px] leading-none"
						>
							{{ offlineStore.pendingCount }}
						</Badge>
						<span class="hidden lg:inline text-xs">{{ offlineStore.statusLabel }}</span>
					</Button>
				</TooltipWrapper>
			</div>

			<OfflinePendingPanel :open="showOfflinePanel" @close="showOfflinePanel = false" />

			<div class="hidden md:flex items-center">
				<Badge variant="secondary" class="gap-1.5">
					<Building2 class="w-3.5 h-3.5" />
					{{ posStore.warehouse }}
				</Badge>
			</div>

			<Popover>
				<PopoverTrigger as-child>
					<Button variant="ghost" size="icon-sm" class="rounded-full">
						<Avatar size="sm">
							<img v-if="authStore.user?.image" :src="authStore.user.image" alt="User Avatar" />
							<AvatarFallback v-else>
								<User class="w-3.5 h-3.5" />
							</AvatarFallback>
						</Avatar>
					</Button>
				</PopoverTrigger>
				<PopoverContentStyled class="w-56 p-2" align="end">
					<div class="px-2 py-1.5 border-b border-border mb-1">
						<p class="text-sm font-medium">{{ authStore.userFullName || __("User") }}</p>
						<p class="text-xs text-muted-foreground">{{ authStore.userEmail }}</p>
					</div>
					<Button
						variant="ghost"
						size="sm"
						class="w-full justify-start gap-2"
						@click="toggleDarkMode"
					>
						<component
							:is="themeIcon"
							class="w-4 h-4"
							:class="{
								'text-foreground': theme === 'dark',
								'text-primary': theme === 'system',
							}"
						/>
						{{ themeTooltip.split(" (")[0] }}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="w-full justify-start gap-2"
						@click="showShortcutsDialog = true"
					>
						<Keyboard class="w-4 h-4" />
						{{ __("Keyboard Shortcuts") }}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="w-full justify-start gap-2"
						@click="showAboutDialog = true"
					>
						<Info class="w-4 h-4" />
						{{ __("About meerkatPOS") }}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
						@click="handleSignOut"
					>
						<Power class="w-4 h-4" />
						{{ __("Sign Out") }}
					</Button>
				</PopoverContentStyled>
			</Popover>

			<TooltipWrapper v-if="!posStore.hideClosingShift" :content="__('End the day and close the shift')">
				<Button
					variant="outline"
					size="sm"
					class="gap-1.5 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30"
					@click="
						posStore.showClosingDialog = true;
						posStore.fetchClosingData();
					"
				>
					<LogOut class="w-4 h-4" />
					<span>{{ __("Close Shift") }}</span>
				</Button>
			</TooltipWrapper>
		</div>

		<ReturnDialog :open="showReturnDialog" @close="showReturnDialog = false" />

		<RepeatInvoiceDialog :open="showRepeatDialog" @close="showRepeatDialog = false" />

		<AboutDialog :open="showAboutDialog" @close="showAboutDialog = false" />
		<KeyboardShortcutsDialog :open="showShortcutsDialog" @close="showShortcutsDialog = false" />
		<ExchangeRateDialog :open="showExchangeRateDialog" @close="showExchangeRateDialog = false" />
	</header>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, nextTick, type Ref } from "vue";
import { usePosStore } from "@/stores/posStore";
import { usePaymentStore } from "@/stores/paymentStore";
import { useAuthStore } from "@/stores/authStore";
import { __ } from "@/lib/translate";
import { hasPermission } from "@/services/userRights";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContentStyled, PopoverTrigger } from "@/components/ui/popover";
import ReturnDialog from "@/components/dialogs/ReturnDialog.vue";
import RepeatInvoiceDialog from "@/components/dialogs/RepeatInvoiceDialog.vue";
import {
	Building2,
	Sun,
	Moon,
	Monitor,
	User,
	LogOut,
	ArrowDownCircle,
	ArrowUpCircle,
	RotateCcw,
	Repeat,
	Printer,
	Power,
	Wifi,
	WifiOff,
	CloudUpload,
	Loader2,
	Search,
	Info,
	Keyboard,
	LayoutDashboard,
} from "lucide-vue-next";
import OfflinePendingPanel from "@/components/offline/OfflinePendingPanel.vue";
import AboutDialog from "@/components/dialogs/AboutDialog.vue";
import KeyboardShortcutsDialog from "@/components/dialogs/KeyboardShortcutsDialog.vue";
import ExchangeRateDialog from "@/components/dialogs/ExchangeRateDialog.vue";
import { useOfflineStore } from "@/stores/offlineStore";

import { get_full_url } from "@/utils";
import { useRouter } from "vue-router";

const router = useRouter();
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
	if (theme.value === "light") return __("Theme: Light (click to switch to Dark)");
	if (theme.value === "dark") return __("Theme: Dark (click to switch to System)");
	return __("Theme: System ({0}) (click to switch to Light)", [isDark.value ? __("Dark") : __("Light")]);
});
const offlineStore = useOfflineStore();

const showReturnDialog = ref(false);
const showRepeatDialog = ref(false);
const showOfflinePanel = ref(false);
const showAboutDialog = ref(false);
const showShortcutsDialog = ref(false);
const showExchangeRateDialog = ref(false);

function handleOfflineAction() {
	if (offlineStore.hasPending || offlineStore.hasDeadLetters || !offlineStore.isOnline) {
		showOfflinePanel.value = true;
	}
}

function handleOpenOfflinePanel() {
	showOfflinePanel.value = true;
}

function openSearch() {
	router.push("/pos");
	nextTick(() => window.dispatchEvent(new CustomEvent("meerkatpos:open-command-search")));
}

function handleShowRepeatDialog() {
	showRepeatDialog.value = true;
}

function handleShowReturnDialog() {
	if (!posStore.allowReturn || !hasPermission("sale_return")) return;
	showReturnDialog.value = true;
}

function handleShowExchangeRateDialog() {
	if (!authStore.canManageExchangeRate) return;
	showExchangeRateDialog.value = true;
}

function handleKeyboard(e: KeyboardEvent) {
	if (e.ctrlKey && e.key.toLowerCase() === "g") {
		e.preventDefault();
		showRepeatDialog.value = true;
	}
	if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "r") {
		e.preventDefault();
		if (posStore.allowReturn && hasPermission("sale_return")) showReturnDialog.value = true;
	}
}

onMounted(() => {
	window.addEventListener("keydown", handleKeyboard);
	window.addEventListener("meerkatpos:show-repeat-dialog", handleShowRepeatDialog as EventListener);
	window.addEventListener("meerkatpos:show-return-dialog", handleShowReturnDialog as EventListener);
	window.addEventListener("meerkatpos:open-offline-panel", handleOpenOfflinePanel as EventListener);
	window.addEventListener(
		"meerkatpos:show-exchange-rate-dialog",
		handleShowExchangeRateDialog as EventListener,
	);
});

onUnmounted(() => {
	window.removeEventListener("keydown", handleKeyboard);
	window.removeEventListener("meerkatpos:show-repeat-dialog", handleShowRepeatDialog as EventListener);
	window.removeEventListener("meerkatpos:show-return-dialog", handleShowReturnDialog as EventListener);
	window.removeEventListener("meerkatpos:open-offline-panel", handleOpenOfflinePanel as EventListener);
	window.removeEventListener(
		"meerkatpos:show-exchange-rate-dialog",
		handleShowExchangeRateDialog as EventListener,
	);
});

function printLastInvoice() {
	const name = posStore.lastInvoiceName;
	if (!name) return;
	window.open(
		get_full_url(
			`/printview?doctype=${posStore.invoiceType}&name=${name}&format=${posStore.defaultPrintFormat}&no_letterhead=0&trigger_print=1`,
		),
		"_blank",
	);
}

function handleSignOut() {
	authStore.logout();
}

function goToDesk() {
	window.location.href = "/app";
}
</script>
