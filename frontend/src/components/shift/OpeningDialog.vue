<template>
	<div class="fixed inset-0 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-950 z-50 flex items-center justify-center p-4">
		<div class="w-full max-w-md animate-scale-in">
			<!-- Logo & Title -->
			<div class="text-center mb-8">
				<div class="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 shadow-lg">
					<svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
					</svg>
				</div>
				<h1 class="text-2xl font-bold text-white mb-1">X POS</h1>
				<p class="text-primary-200 text-sm">Open your shift to get started</p>
			</div>

			<!-- Form Card -->
			<div class="bg-white rounded-2xl shadow-elevated p-6 space-y-5">
				<!-- Loading -->
				<div v-if="isLoadingData" class="flex items-center justify-center py-8">
					<div class="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
				</div>

				<template v-else>
					<!-- POS Profile Select -->
					<div>
						<label class="text-sm font-semibold text-surface-700 mb-1.5 block">POS Profile</label>
						<select
							v-model="selectedProfile"
							class="xpos-input"
							@change="onProfileChange"
						>
							<option value="" disabled>Select POS Profile</option>
							<option
								v-for="profile in profiles"
								:key="profile.name"
								:value="profile.name"
							>
								{{ profile.name }} ({{ profile.company }})
							</option>
						</select>
					</div>

					<!-- Company (auto-filled) -->
					<div v-if="selectedCompany">
						<label class="text-sm font-semibold text-surface-700 mb-1.5 block">Company</label>
						<div class="xpos-input bg-surface-50 text-surface-600">{{ selectedCompany }}</div>
					</div>

					<!-- Opening Balance -->
					<div v-if="paymentMethodsList.length > 0">
						<label class="text-sm font-semibold text-surface-700 mb-2 block">Opening Cash Balance</label>
						<div class="space-y-2">
							<div
								v-for="method in paymentMethodsList"
								:key="method.mode_of_payment"
								class="flex items-center gap-3"
							>
								<span class="text-sm text-surface-600 w-28 truncate">{{ method.mode_of_payment }}</span>
								<input
									v-model.number="method.opening_amount"
									type="number"
									min="0"
									step="0.01"
									class="xpos-input flex-1"
									placeholder="0.00"
								/>
							</div>
						</div>
					</div>

					<!-- Open Shift Button -->
					<button
						@click="handleOpenShift"
						:disabled="!selectedProfile || isOpening"
						class="w-full xpos-btn-primary xpos-btn-lg text-base font-bold
									 bg-gradient-to-r from-primary-600 to-primary-500
									 disabled:from-surface-300 disabled:to-surface-300"
					>
						<span v-if="isOpening" class="flex items-center gap-2">
							<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Opening Shift...
						</span>
						<span v-else class="flex items-center gap-2">
							<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
							</svg>
							Open Shift
						</span>
					</button>
				</template>
			</div>

			<!-- Back to desk link -->
			<div class="text-center mt-4">
				<a href="/app" class="text-primary-200 hover:text-white text-sm transition-colors no-underline">
					← Back to Desk
				</a>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { usePosStore } from "@/stores/posStore";
import { showError } from "@/services/api";

interface ProfileOption {
	name: string;
	company: string;
	[key: string]: unknown;
}

interface PaymentMethodEntry {
	mode_of_payment: string;
	opening_amount: number;
	parent?: string;
	[key: string]: unknown;
}

const posStore = usePosStore();

const isLoadingData = ref(true);
const isOpening = ref(false);
const profiles = ref<ProfileOption[]>([]);
const selectedProfile = ref("");
const selectedCompany = ref("");
const paymentMethodsList = ref<PaymentMethodEntry[]>([]);

onMounted(async () => {
	try {
		const data = await posStore.fetchOpeningData();
		profiles.value = (data?.pos_profiles || []) as ProfileOption[];

		// Auto-select if only one profile
		if (profiles.value.length === 1) {
			selectedProfile.value = profiles.value[0].name;
			onProfileChange();
		}
	} catch (error) {
		showError("Failed to load POS data. Please refresh.");
	} finally {
		isLoadingData.value = false;
	}
});

function onProfileChange() {
	const profile = profiles.value.find((p) => p.name === selectedProfile.value);
	if (profile) {
		selectedCompany.value = profile.company;

		// Get payment methods for this profile
		const openingData = posStore.openingData as Record<string, unknown> | null;
		const methods = ((openingData?.payment_methods || []) as PaymentMethodEntry[]).filter(
			(m) => m.parent === selectedProfile.value
		);
		paymentMethodsList.value = methods.map((m) => ({
			mode_of_payment: m.mode_of_payment,
			opening_amount: 0,
		}));

		// If no methods found, add Cash as default
		if (paymentMethodsList.value.length === 0) {
			paymentMethodsList.value = [{ mode_of_payment: "Cash", opening_amount: 0 }];
		}
	}
}

async function handleOpenShift() {
	if (!selectedProfile.value || isOpening.value) return;
	isOpening.value = true;

	try {
		await posStore.openShift(
			selectedProfile.value,
			selectedCompany.value,
			paymentMethodsList.value.map((m) => ({
				mode_of_payment: m.mode_of_payment,
				opening_amount: m.opening_amount || 0,
			}))
		);
	} catch (error: unknown) {
		showError("Failed to open shift: " + ((error as Error)?.message || error));
	} finally {
		isOpening.value = false;
	}
}
</script>
