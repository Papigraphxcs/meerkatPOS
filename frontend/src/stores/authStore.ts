import { call } from "@/services/api";
import { UserSession } from "@/types/pos.types";
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useAuthStore = defineStore("auth", () => {
  const isLoading = ref(false);
  const isAuthenticated = ref(false);
  const user = ref<UserSession | null>(null);
  const error = ref("");
  const resetEmailSent = ref(false);

  const userName = computed(() => user.value?.user || "Guest");
  const userEmail = computed(() => user.value?.user_email || "");
  const userFullName = computed(() => user.value?.user_fullname || "");
  const isGuest = computed(() => !user.value || user.value.user === "Guest");

  async function checkAuth(): Promise<boolean> {
    try {
      isLoading.value = true;
      error.value = "";
      const response = await call("frappe.auth.get_logged_user");

      if (!response) {
        isAuthenticated.value = false;
        user.value = null;
        return false;
      }
      const loggedUser = response as string;

      if (loggedUser && loggedUser !== "Guest") {
        isAuthenticated.value = true;
        const bootUserInfo = window.xpos?.boot?.user_info as { user_email?: string; user_fullname?: string } | undefined;
        user.value = {
          user: loggedUser,
          user_email: bootUserInfo?.user_email || loggedUser,
          user_fullname: bootUserInfo?.user_fullname || loggedUser,
        };
        return true;
      }

      isAuthenticated.value = false;
      user.value = null;
      return false;
    } catch (err) {
      console.error("Auth check failed:", err);
      isAuthenticated.value = false;
      user.value = null;
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function login(username: string, password: string): Promise<boolean> {
    try {
      isLoading.value = true;
      error.value = "";
      const response = await call("login", {
        usr: username,
        pwd: password,
      });

      isAuthenticated.value = true;
      user.value = {
        user: username,
        user_email: username,
      };

      return true;
    } catch (err) {
      console.error("Login failed:", err);
      error.value = err instanceof Error ? err.message : "Login failed";
      return false;
    } finally {
      isLoading.value = false;
    }
  }
  
  async function sendResetPasswordEmail(email: string): Promise<boolean> {
    try {
      isLoading.value = true;
      error.value = "";
      resetEmailSent.value = false;

      await call("frappe.core.doctype.user.user.reset_password", { user: email });

      resetEmailSent.value = true;
      return true;
    } catch (err) {
      console.error("Reset password failed:", err);
      error.value = err instanceof Error ? err.message : "Failed to send reset email";
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function logout(): Promise<void> {
    try {
      isLoading.value = true;

      await call("logout");

      isAuthenticated.value = false;
      user.value = null;
      
      window.location.href = "/xpos/login";
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      isLoading.value = false;
    }
  }
  
  function clearError(): void {
    error.value = "";
  }
  
  function $reset(): void {
    isLoading.value = false;
    isAuthenticated.value = false;
    user.value = null;
    error.value = "";
    resetEmailSent.value = false;
  }

  return {
    // State
    isLoading,
    isAuthenticated,
    user,
    error,
    resetEmailSent,
    // Computed
    userName,
    userEmail,
    userFullName,
    isGuest,
    // Actions
    checkAuth,
    login,
    sendResetPasswordEmail,
    logout,
    clearError,
    $reset,
  };
});
