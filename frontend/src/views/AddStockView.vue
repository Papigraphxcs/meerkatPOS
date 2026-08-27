<script setup lang="ts">
/**
 * Add Stock View
 * Standalone page for bringing brand-new stock into the system with no
 * supplier/bill attached (opening stock, found stock, samples, corrections).
 */
import { usePosStore } from "@/stores/posStore";
import { Badge } from "@/components/ui/badge";
import AddStock from "@/components/purchase/AddStock.vue";
import { PackagePlus } from "lucide-vue-next";
import __ from "@/lib/translate";

const posStore = usePosStore();
</script>

<template>
	<div class="h-full flex flex-col bg-background overflow-hidden">
		<!-- Header -->
		<header class="bg-card border-b border-border px-4 py-3 shrink-0">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<PackagePlus class="w-6 h-6 text-primary" />
					<h1 class="text-xl font-semibold text-foreground">
						{{ __("Add Stock") }}
					</h1>
				</div>
				<div class="flex items-center gap-2">
					<Badge variant="secondary" class="gap-1.5">{{ posStore.warehouse }}</Badge>
					<Badge variant="outline">{{ posStore.companyName }}</Badge>
				</div>
			</div>
		</header>

		<!-- Main Content - Add Stock Component -->
		<div class="flex-1 min-h-0 overflow-hidden">
			<AddStock />
		</div>
	</div>
</template>
