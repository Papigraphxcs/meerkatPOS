<template>
	<Dialog :open="open" @update:open="(val: boolean) => { if (!val) emit('close') }">
		<DialogContent class="max-w-lg max-h-[80vh] flex flex-col p-0 gap-0">
			<!-- Header -->
			<DialogHeader
				class="shrink-0 flex-row items-center justify-between space-y-0 px-5 py-3 border-b border-border">
				<div class="flex items-center gap-3">
					<div class="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm"
						:class="offlineStore.isOnline
							? 'bg-gradient-to-br from-emerald-500 to-emerald-600'
							: 'bg-gradient-to-br from-red-500 to-red-600'">
						<WifiOff v-if="!offlineStore.isOnline" class="w-4 h-4 text-white" />
						<Wifi v-else class="w-4 h-4 text-white" />
					</div>
					<div>
						<DialogTitle class="text-base">Offline Invoices</DialogTitle>
						<DialogDescription class="text-xs">
							{{ offlineStore.isOnline ? 'Online' : 'Offline' }} &mdash;
							{{ offlineStore.pendingCount }} pending
						</DialogDescription>
					</div>
				</div>
				<Button variant="ghost" size="icon-sm" @click="emit('close')">
					<X class="w-5 h-5" />
				</Button>
			</DialogHeader>

			<!-- Body -->
			<div class="flex-1 overflow-y-auto p-4 space-y-3">
				<!-- Sync All button -->
				<div v-if="offlineStore.pendingCount > 0" class="flex gap-2">
					<Button
						variant="default"
						size="sm"
						class="flex-1 gap-1.5"
						:disabled="!offlineStore.isOnline || offlineStore.isSyncing"
						@click="offlineStore.syncPendingInvoices()">
						<Loader2 v-if="offlineStore.isSyncing" class="w-4 h-4 animate-spin" />
						<CloudUpload v-else class="w-4 h-4" />
						Sync All ({{ offlineStore.pendingCount }})
					</Button>
					<Button variant="destructive" size="sm" class="gap-1.5" @click="confirmClearAll">
						<Trash2 class="w-4 h-4" />
						Clear All
					</Button>
				</div>

				<!-- Empty state -->
				<div v-if="offlineStore.pendingCount === 0"
					class="flex flex-col items-center justify-center py-10 text-muted-foreground">
					<CheckCircle2 class="w-12 h-12 mb-3 text-emerald-400" />
					<p class="text-sm font-medium">All caught up!</p>
					<p class="text-xs mt-1">No pending offline invoices.</p>
				</div>

				<!-- Invoice cards -->
				<div v-for="inv in offlineStore.pendingInvoices" :key="inv.id"
					class="rounded-xl border border-border bg-card p-3 space-y-2">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium">{{ inv.customer_name || 'Unknown Customer' }}</p>
							<p class="text-xs text-muted-foreground">
								{{ formatTime(inv.created_at) }}
							</p>
						</div>
						<div class="text-right">
							<p class="text-sm font-bold">
								{{ formatAmount(inv.grand_total) }}
							</p>
							<Badge :variant="statusVariant(inv.status)" class="text-[10px]">
								{{ inv.status }}
							</Badge>
						</div>
					</div>

					<!-- Item count -->
					<p class="text-xs text-muted-foreground">
						{{ inv.data.items?.length || 0 }} item(s) &bull;
						{{ inv.data.payments?.map(p => p.mode_of_payment).join(', ') || 'N/A' }}
					</p>

					<!-- Error -->
					<p v-if="inv.error" class="text-xs text-destructive">
						Error: {{ inv.error }}
					</p>

					<!-- Actions -->
					<div class="flex gap-2 pt-1">
						<Button variant="outline" size="sm" class="flex-1 gap-1 text-xs"
							:disabled="!offlineStore.isOnline || offlineStore.isSyncing"
							@click="inv.id && offlineStore.retrySingle(inv.id)">
							<RefreshCw class="w-3.5 h-3.5" />
							Retry
						</Button>
						<Button variant="ghost" size="sm" class="text-destructive gap-1 text-xs"
							@click="inv.id && offlineStore.deletePending(inv.id)">
							<Trash2 class="w-3.5 h-3.5" />
							Delete
						</Button>
					</div>
				</div>

				<!-- Last sync time -->
				<p v-if="offlineStore.lastSyncTime" class="text-xs text-center text-muted-foreground pt-2">
					Last sync: {{ formatTime(offlineStore.lastSyncTime) }}
				</p>
			</div>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useOfflineStore } from "@/stores/offlineStore";
import {
	Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	X, Wifi, WifiOff, CloudUpload, Loader2, Trash2,
	CheckCircle2, RefreshCw,
} from "lucide-vue-next";

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
			month: "short", day: "numeric",
			hour: "2-digit", minute: "2-digit",
		});
	} catch {
		return isoString;
	}
}

function formatAmount(val?: number) {
	if (val == null) return "—";
	return val.toFixed(2);
}

function confirmClearAll() {
	if (confirm("Delete all pending offline invoices? This cannot be undone.")) {
		offlineStore.clearAll();
	}
}
</script>
