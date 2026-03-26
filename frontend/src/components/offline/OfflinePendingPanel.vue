<template>
	<Dialog
		:open="open"
		@update:open="
			(val: boolean) => {
				if (!val) emit('close');
			}
		"
	>
		<DialogContent class="max-w-lg max-h-[80vh] flex flex-col p-0 gap-0">
			<DialogHeader
				class="shrink-0 flex-row items-center justify-between space-y-0 px-5 py-3 border-b border-border"
			>
				<div class="flex items-center gap-3">
					<div
						class="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm"
						:class="
							isOnline()
								? 'bg-gradient-to-br from-emerald-500 to-emerald-600'
								: 'bg-gradient-to-br from-red-500 to-red-600'
						"
					>
						<WifiOff v-if="!isOnline()" class="w-4 h-4 text-white" />
						<Wifi v-else class="w-4 h-4 text-white" />
					</div>
					<div>
						<DialogTitle class="text-base">{{ __("Offline Invoices") }}</DialogTitle>
						<DialogDescription class="text-xs">
							{{ isOnline() ? __("Online") : __("Offline") }} &mdash;
							{{ offlineStore.pendingCount }} {{ __("") }}
						</DialogDescription>
					</div>
				</div>
				<Button variant="ghost" size="icon-sm" @click="emit('close')">
					<X class="w-5 h-5" />
				</Button>
			</DialogHeader>

			<div class="flex-1 overflow-y-auto p-4 space-y-3">
				<div v-if="offlineStore.pendingCount > 0" class="flex gap-2">
					<Button
						variant="default"
						size="sm"
						class="flex-1 gap-1.5"
						:disabled="!isOnline() || offlineStore.isSyncing"
						@click="offlineStore.syncPendingInvoices()"
					>
						<Loader2 v-if="offlineStore.isSyncing" class="w-4 h-4 animate-spin" />
						<CloudUpload v-else class="w-4 h-4" />
						{{ __("Sync All") }} ({{ offlineStore.pendingCount }})
					</Button>
					<Button variant="destructive" size="sm" class="gap-1.5" @click="confirmClearAll">
						<Trash2 class="w-4 h-4" />
						{{ __("Clear All") }}
					</Button>
				</div>
				<div
					v-if="offlineStore.pendingCount === 0"
					class="flex flex-col items-center justify-center py-10 text-muted-foreground"
				>
					<CheckCircle2 class="w-12 h-12 mb-3 text-emerald-400" />
					<p class="text-sm font-medium">{{ __("All caught up") }}!</p>
					<p class="text-xs mt-1">{{ __("No pending offline invoices.") }}</p>
				</div>

				<div
					v-for="inv in offlineStore.pendingInvoices"
					:key="inv.id"
					class="rounded-xl border border-border bg-card p-3 space-y-2"
				>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium">
								{{ inv.customer_name || __("Unknown Customer") }}
							</p>
							<p class="text-xs text-muted-foreground">
								{{ formatTime(inv.created_at) }}
							</p>
						</div>
						<div class="text-end">
							<p class="text-sm font-bold">
								{{ formatAmount(inv.grand_total) }}
							</p>
							<Badge :variant="statusVariant(inv.status)" class="text-[10px]">
								{{ inv.status }}
							</Badge>
						</div>
					</div>

					<p class="text-xs text-muted-foreground">
						{{ getItemCount(inv.data) }} item(s) &bull;
						{{ getPaymentMethods(inv.data) }}
					</p>

					<p v-if="inv.error" class="text-xs text-destructive">Error: {{ inv.error }}</p>

					<div class="flex gap-2 pt-1">
						<Button
							variant="outline"
							size="sm"
							class="flex-1 gap-1 text-xs"
							:disabled="!isOnline() || offlineStore.isSyncing"
							@click="inv.id && offlineStore.retrySingle(inv.id)"
						>
							<RefreshCw class="w-3.5 h-3.5" />
							{{ __("Retry") }}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							class="text-destructive gap-1 text-xs"
							@click="inv.id && offlineStore.deletePending(inv.id)"
						>
							<Trash2 class="w-3.5 h-3.5" />
							{{ __("Delete") }}
						</Button>
					</div>
				</div>

				<p v-if="offlineStore.lastSyncTime" class="text-xs text-center text-muted-foreground pt-2">
					{{ __("Last sync") }}: {{ formatTime(offlineStore.lastSyncTime) }}
				</p>
			</div>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useOfflineStore } from "@/stores/offlineStore";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Wifi, WifiOff, CloudUpload, Loader2, Trash2, CheckCircle2, RefreshCw } from "lucide-vue-next";
import { isOnline } from "@/utils";
import __ from "@/lib/translate";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const offlineStore = useOfflineStore();

onMounted(() => {
	offlineStore.loadPendingInvoices();
});

function statusVariant(status: string) {
	if (status === "pending") return "secondary" as const;
	if (status === "syncing") return "default" as const;
	if (status === "failed") return "destructive" as const;
	return "secondary" as const;
}

function formatTime(isoString: string) {
	try {
		const d = new Date(isoString);
		return d.toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return isoString;
	}
}

function formatAmount(val?: number) {
	if (val == null) return "—";
	return val.toFixed(2);
}

function getItemCount(data: unknown): number {
	if (data && typeof data === "object" && "items" in data) {
		const items = (data as { items?: unknown[] }).items;
		return Array.isArray(items) ? items.length : 0;
	}
	return 0;
}

function getPaymentMethods(data: unknown): string {
	if (data && typeof data === "object" && "payments" in data) {
		const payments = (data as { payments?: { mode_of_payment?: string }[] }).payments;
		if (Array.isArray(payments)) {
			return (
				payments
					.map((p) => p.mode_of_payment)
					.filter(Boolean)
					.join(", ") || "N/A"
			);
		}
	}
	return "N/A";
}

function confirmClearAll() {
	if (confirm(__("Delete all pending offline invoices? This cannot be undone."))) {
		offlineStore.clearAll();
	}
}
</script>
