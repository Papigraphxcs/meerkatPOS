<template>
	<Dialog
		:open="open"
		@update:open="
			(val: boolean) => {
				if (!val) $emit('close');
			}
		"
	>
		<DialogContent class="max-w-sm">
			<DialogHeader>
				<DialogTitle class="flex items-center gap-2">
					<Coins class="w-5 h-5 text-primary" />
					<span>{{ __("Exchange Rate") }}</span>
				</DialogTitle>
			</DialogHeader>

			<div class="space-y-4">
				<div v-if="isLoadingStatus" class="flex justify-center py-6">
					<Loader2 class="w-5 h-5 animate-spin text-muted-foreground" />
				</div>

				<template v-else>
					<div class="rounded-md border border-border p-3 text-center">
						<p class="text-xs text-muted-foreground">{{ __("1 USD equals") }}</p>
						<p class="text-2xl font-semibold text-foreground">
							{{ status.zig_per_usd != null ? `${status.zig_per_usd} ZiG` : __("Not set") }}
						</p>
						<p class="text-xs text-muted-foreground mt-1">
							{{
								status.updated_at
									? __("Last updated {0}", [formatDatetime(status.updated_at)])
									: __("No rate recorded yet")
							}}
						</p>
					</div>

					<Button variant="outline" class="w-full" :disabled="isSyncing" @click="retrySync">
						<Loader2 v-if="isSyncing" class="w-4 h-4 me-2 animate-spin" />
						<RefreshCw v-else class="w-4 h-4 me-2" />
						{{ __("Retry Automatic Sync") }}
					</Button>

					<Separator />

					<div class="space-y-2">
						<label class="text-sm font-medium text-foreground">
							{{ __("Set Manually") }}
						</label>
						<p class="text-xs text-muted-foreground">
							{{ __("Use this if the automatic sync is unavailable or the rate looks wrong.") }}
						</p>
						<div class="flex gap-2">
							<Input
								v-model.number="manualZigPerUsd"
								type="number"
								min="0"
								step="0.01"
								:placeholder="__('e.g. 38000')"
							/>
							<Button :disabled="!manualZigPerUsd || manualZigPerUsd <= 0 || isSaving" @click="saveManualRate">
								<Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
								<span v-else>{{ __("Save") }}</span>
							</Button>
						</div>
					</div>
				</template>
			</div>

			<DialogFooter>
				<Button variant="outline" @click="$emit('close')">
					{{ __("Close") }}
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Coins, Loader2, RefreshCw } from "lucide-vue-next";
import { call, showSuccess, showError } from "@/services/api";
import { formatDatetime } from "@/utils/datetime";
import { __ } from "@/lib/translate";

interface RateStatus {
	exchange_rate: number | null;
	zig_per_usd: number | null;
	date: string | null;
	updated_at: string | null;
	can_manage: boolean;
}

interface RateSyncResult {
	changed: boolean;
	zig_per_usd: number;
	message: string;
}

const props = defineProps<{
	open: boolean;
}>();

defineEmits<{
	close: [];
}>();

const status = reactive<RateStatus>({
	exchange_rate: null,
	zig_per_usd: null,
	date: null,
	updated_at: null,
	can_manage: false,
});

const isLoadingStatus = ref(false);
const isSyncing = ref(false);
const isSaving = ref(false);
const manualZigPerUsd = ref<number | undefined>(undefined);

async function loadStatus() {
	isLoadingStatus.value = true;
	try {
		const result = await call<RateStatus>("xpos.api.rbz_rate_sync.get_rate_status");
		Object.assign(status, result);
	} catch (err) {
		showError((err as Error)?.message || __("Could not load the current exchange rate."));
	} finally {
		isLoadingStatus.value = false;
	}
}

async function retrySync() {
	isSyncing.value = true;
	try {
		const result = await call<RateSyncResult>("xpos.api.rbz_rate_sync.manual_sync");
		showSuccess(result.message);
		await loadStatus();
	} catch (err) {
		showError((err as Error)?.message || __("Could not sync the exchange rate."));
	} finally {
		isSyncing.value = false;
	}
}

async function saveManualRate() {
	if (!manualZigPerUsd.value || manualZigPerUsd.value <= 0) return;
	isSaving.value = true;
	try {
		const result = await call<RateSyncResult>("xpos.api.rbz_rate_sync.set_manual_rate", {
			zig_per_usd: manualZigPerUsd.value,
		});
		showSuccess(result.message);
		manualZigPerUsd.value = undefined;
		await loadStatus();
	} catch (err) {
		showError((err as Error)?.message || __("Could not save the exchange rate."));
	} finally {
		isSaving.value = false;
	}
}

watch(
	() => props.open,
	(isOpen) => {
		if (isOpen) loadStatus();
	},
);
</script>
