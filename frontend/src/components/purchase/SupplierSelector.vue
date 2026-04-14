<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { usePurchaseStore } from "@/stores/purchaseStore";
import { Plus, User, X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/autocomplete";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import __ from "@/lib/translate";

const purchaseStore = usePurchaseStore();

const supplierLinkValue = ref("");
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null);

const newSupplier = ref({
	supplier_name: "",
	supplier_group: "",
	supplier_type: "Company",
	mobile_no: "",
	email_id: "",
	tax_id: "",
});

const isCreating = ref(false);

function handleSupplierSearch(text: string): void {
	if (debounceTimer.value) clearTimeout(debounceTimer.value);
	debounceTimer.value = setTimeout(() => {
		purchaseStore.searchSuppliers(text);
	}, 300);
}

function handleSupplierSelect(option: AutocompleteOption): void {
	purchaseStore.selectSupplier({
		name: option.value,
		supplier_name: option.description || option.value,
	});
	supplierLinkValue.value = "";
}

function selectSupplier(supplier: (typeof purchaseStore.suppliers)[0]): void {
	purchaseStore.selectSupplier(supplier);
}

function openNewSupplierForm(): void {
	newSupplier.value = {
		supplier_name: "",
		supplier_group: "",
		supplier_type: "Company",
		mobile_no: "",
		email_id: "",
		tax_id: "",
	};
	purchaseStore.showNewSupplierForm = true;
}

async function handleCreateSupplier(): Promise<void> {
	if (!newSupplier.value.supplier_name.trim()) return;

	isCreating.value = true;
	try {
		await purchaseStore.createSupplier(newSupplier.value);
	} finally {
		isCreating.value = false;
	}
}

onMounted(() => {
	purchaseStore.searchSuppliers();
});

onUnmounted(() => {
	if (debounceTimer.value) {
		clearTimeout(debounceTimer.value);
	}
});
</script>

<template>
	<div class="h-full flex flex-col min-h-0 overflow-hidden">
		<div class="p-4 border-b border-border bg-muted">
			<div class="flex gap-2">
				<div class="flex-1">
					<Autocomplete
						:model-value="supplierLinkValue"
						@update:model-value="supplierLinkValue = $event"
						@search="handleSupplierSearch"
						@select="handleSupplierSelect"
						doctype="Supplier"
						label-field="supplier_name"
						:empty-text="__('No suppliers found')"
					/>
				</div>
				<Button @click="openNewSupplierForm" variant="outline" size="icon">
					<Plus class="w-4 h-4" />
				</Button>
			</div>
		</div>

		<div class="flex-1 min-h-0 overflow-y-auto purchase-scroll">
			<div v-if="purchaseStore.isLoadingSuppliers" class="p-4 text-center text-muted-foreground">
				{{ __("Loading suppliers...") }}
			</div>
			<div
				v-else-if="purchaseStore.suppliers.length === 0"
				class="p-4 text-center text-muted-foreground"
			>
				<p>{{ __("No suppliers found") }}</p>
				<Button @click="openNewSupplierForm" variant="link" class="mt-2">
					<Plus class="w-4 h-4 me-1" />
					{{ __("Add New Supplier") }}
				</Button>
			</div>
			<div v-else class="divide-y divide-border">
				<button
					v-for="supplier in purchaseStore.suppliers"
					:key="supplier.name"
					@click="selectSupplier(supplier)"
					class="w-full p-4 text-start hover:bg-muted transition-colors flex items-center gap-3"
					:class="{
						'bg-primary/10 border-s-2 border-s-primary':
							purchaseStore.selectedSupplier?.name === supplier.name,
					}"
				>
					<div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
						<User class="w-5 h-5 text-muted-foreground" />
					</div>
					<div class="flex-1 min-w-0">
						<p class="font-medium truncate">{{ supplier.supplier_name }}</p>
						<p class="text-sm text-muted-foreground truncate">
							{{ supplier.supplier_group || supplier.name }}
						</p>
					</div>
				</button>
			</div>
		</div>

		<div v-if="purchaseStore.selectedSupplier" class="p-4 border-t border-border bg-primary/10">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
						<User class="w-5 h-5 text-primary" />
					</div>
					<div>
						<p class="font-medium">
							{{ purchaseStore.selectedSupplier.supplier_name }}
						</p>
						<p class="text-sm text-muted-foreground">
							{{ purchaseStore.selectedSupplier.name }}
						</p>
					</div>
				</div>
				<Button @click="purchaseStore.clearSupplier()" variant="ghost" size="icon">
					<X class="w-4 h-4" />
				</Button>
			</div>
		</div>

		<Dialog v-model:open="purchaseStore.showNewSupplierForm">
			<DialogContent class="max-w-md">
				<DialogHeader>
					<DialogTitle>{{ __("Create New Supplier") }}</DialogTitle>
					<DialogDescription>
						{{ __("Add a new supplier to the system") }}
					</DialogDescription>
				</DialogHeader>

				<form @submit.prevent="handleCreateSupplier" class="space-y-4 mt-4">
					<div>
						<label class="text-sm font-medium mb-1 block text-foreground"
							>{{ __("Supplier Name") }} *</label
						>
						<Input
							v-model="newSupplier.supplier_name"
							:placeholder="__('Enter supplier name')"
							required
						/>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="text-sm font-medium mb-1 block text-foreground">{{
								__("Type")
							}}</label>
							<select
								v-model="newSupplier.supplier_type"
								class="w-full px-3 py-2 border border-border rounded-md text-sm bg-background text-foreground"
							>
								<option value="Company">{{ __("Company") }}</option>
								<option value="Individual">{{ __("Individual") }}</option>
							</select>
						</div>
						<div>
							<label class="text-sm font-medium mb-1 block text-foreground">{{
								__("Tax ID")
							}}</label>
							<Input v-model="newSupplier.tax_id" :placeholder="__('Tax ID')" />
						</div>
					</div>

					<div>
						<label class="text-sm font-medium mb-1 block text-foreground">{{
							__("Mobile")
						}}</label>
						<Input v-model="newSupplier.mobile_no" :placeholder="__('Phone number')" />
					</div>

					<div>
						<label class="text-sm font-medium mb-1 block text-foreground">{{
							__("Email")
						}}</label>
						<Input
							v-model="newSupplier.email_id"
							type="email"
							:placeholder="__('Email address')"
						/>
					</div>

					<div class="flex justify-end gap-2 pt-4">
						<Button
							type="button"
							variant="outline"
							@click="purchaseStore.showNewSupplierForm = false"
						>
							{{ __("Cancel") }}
						</Button>
						<Button type="submit" :disabled="isCreating || !newSupplier.supplier_name.trim()">
							{{ isCreating ? __("Creating...") : __("Create Supplier") }}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	</div>
</template>
