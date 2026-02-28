<template>
	<div class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-4">
		<!-- Logo/Brand -->
		<div class="mb-8 text-center">
			<div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary flex items-center justify-center">
				<Store class="w-8 h-8 text-primary-foreground" />
			</div>
			<h1 class="text-2xl font-bold text-foreground">X POS</h1>
			<p class="text-muted-foreground text-sm mt-1">Point of Sale System</p>
		</div>

		<!-- Login Card -->
		<Card class="w-full max-w-md">
			<CardHeader class="text-center">
				<CardTitle class="text-xl">Welcome back</CardTitle>
				<CardDescription>Sign in to your account to continue</CardDescription>
			</CardHeader>
			<CardContent>
				<form @submit.prevent="handleLogin" class="space-y-4">
					<!-- Error Alert -->
					<div
						v-if="authStore.error"
						class="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2"
					>
						<AlertCircle class="w-4 h-4 mt-0.5 shrink-0" />
						<span>{{ authStore.error }}</span>
					</div>

					<!-- Username/Email Field -->
					<div class="space-y-2">
						<label for="username" class="text-sm font-medium text-foreground">
							Email or Username
						</label>
						<div class="relative">
							<User class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
							<Input
								id="username"
								v-model="username"
								type="text"
								placeholder="Enter your email or username"
								class="pl-10"
								:disabled="authStore.isLoading"
								required
								autocomplete="username"
							/>
						</div>
					</div>

					<!-- Password Field -->
					<div class="space-y-2">
						<label for="password" class="text-sm font-medium text-foreground">
							Password
						</label>
						<div class="relative">
							<Lock class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
							<Input
								id="password"
								v-model="password"
								:type="showPassword ? 'text' : 'password'"
								placeholder="Enter your password"
								class="pl-10 pr-10"
								:disabled="authStore.isLoading"
								required
								autocomplete="current-password"
							/>
							<button
								type="button"
								class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
								@click="showPassword = !showPassword"
							>
								<EyeOff v-if="showPassword" class="w-4 h-4" />
								<Eye v-else class="w-4 h-4" />
							</button>
						</div>
					</div>

					<!-- Forgot Password Link -->
					<div class="flex justify-end">
						<RouterLink
							to="/reset-password"
							class="text-sm text-primary hover:underline"
						>
							Forgot password?
						</RouterLink>
					</div>

					<!-- Submit Button -->
					<Button
						type="submit"
						class="w-full"
						size="lg"
						:disabled="authStore.isLoading || !username || !password"
					>
						<Loader2 v-if="authStore.isLoading" class="w-4 h-4 animate-spin" />
						<LogIn v-else class="w-4 h-4" />
						{{ authStore.isLoading ? "Signing in..." : "Sign In" }}
					</Button>
				</form>
			</CardContent>
		</Card>

		<!-- Footer -->
		<p class="mt-8 text-center text-sm text-muted-foreground">
			Secure login powered by Frappe Framework
		</p>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Store,
	User,
	Lock,
	Eye,
	EyeOff,
	LogIn,
	Loader2,
	AlertCircle,
} from "lucide-vue-next";

const router = useRouter();
const authStore = useAuthStore();

const username = ref("");
const password = ref("");
const showPassword = ref(false);

async function handleLogin() {
	if (!username.value || !password.value) return;

	const success = await authStore.login(username.value, password.value);
	if (success) {
		// Redirect to POS or originally requested page
		const redirectTo = router.currentRoute.value.query.redirect as string || "/pos";
		router.push(redirectTo);
	}
}

// Clear error when user starts typing
function clearError() {
	if (authStore.error) {
		authStore.clearError();
	}
}

onMounted(() => {
	// Clear any previous errors
	authStore.clearError();
});

onUnmounted(() => {
	authStore.clearError();
});
</script>
