import { call } from "@/services/api";
import { isElectron } from "@/services/electronBridge";
import { loadPermissions, resetPermissions } from "@/services/userRights";
import { UserSession } from "@/types/pos.types";
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useAuthStore = defineStore("auth", () => {
  const isLoading = ref(false);
  const isAuthenticated = ref(false);
  const user = ref<UserSession | null>(null);
  const error = ref("");
  const resetEmailSent = ref(false);
  const isOfflineAuth = ref(false);

  const userName = computed(() => user.value?.user || "Guest");
  const userEmail = computed(() => user.value?.user_email || "");
  const userFullName = computed(() => user.value?.user_fullname || "");
  const isGuest = computed(() => !user.value || user.value.user === "Guest");

  async function checkAuth(): Promise<boolean> {
    try {
      isLoading.value = true;
      error.value = "";

      // Electron: restore session from local DB — never hit ERPNext
      if (isElectron()) {
        return await checkOfflineAuth();
      }

      const response = await call("frappe.auth.get_logged_user");

      if (!response) {
        isAuthenticated.value = false;
        user.value = null;
        return false;
      }
      const loggedUser = response as string;

      if (loggedUser && loggedUser !== "Guest") {
        isAuthenticated.value = true;
        isOfflineAuth.value = false;
        const bootUserInfo = window.xpos?.boot?.user_info as { user_email?: string; user_fullname?: string } | undefined;
        user.value = {
          user: loggedUser,
          user_email: bootUserInfo?.user_email || loggedUser,
          user_fullname: bootUserInfo?.user_fullname || loggedUser,
        };
        await loadPermissions(loggedUser);
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

  async function checkOfflineAuth(): Promise<boolean> {
    // Always require fresh credentials — never restore session from cache
    return false;
  }

  async function login(username: string, password: string): Promise<boolean> {
    try {
      isLoading.value = true;
      error.value = "";

      // Electron always authenticates against the local MariaDB
      if (isElectron()) {
        return await loginOffline(username, password);
      }

      // Web/PWA: authenticate via ERPNext
      const response = await call("login", {
        usr: username,
        pwd: password,
      });

      isAuthenticated.value = true;
      isOfflineAuth.value = false;
      user.value = {
        user: username,
        user_email: username,
      };

      await loadPermissions(username);
      return true;
    } catch (err) {
      console.error("Login failed:", err);
      error.value = err instanceof Error ? err.message : "Login failed";
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function loginOffline(username: string, password: string): Promise<boolean> {
    try {
      const posUser = await window.electronAPI!.db.getPosUser(username);
      if (!posUser) {
        error.value = "User not found. Check your username.";
        return false;
      }

      const userData = posUser as Record<string, unknown>;
      const storedHash = userData.password_hash as string | undefined;
      if (!storedHash) {
        error.value = "No password configured for this user.";
        return false;
      }

      const inputHash = await hashPassword(password);
      if (inputHash !== storedHash) {
        error.value = "Invalid password";
        return false;
      }

      isAuthenticated.value = true;
      isOfflineAuth.value = true;
      user.value = {
        user: username,
        user_email: (userData.email as string) || username,
        user_fullname: (userData.full_name as string) || username,
      };

      // Remember last user and start sync
      await window.electronAPI!.db.setSetting("last_logged_user", username, "auth");
      window.electronAPI!.startSyncEngine().then((result) => {
        if (!result.success) {
          console.warn("[XPOS] Sync engine start failed:", result.error);
        }
      }).catch((err) => {
        console.warn("[XPOS] startSyncEngine error:", err);
      });

      await loadPermissions(username);
      return true;
    } catch (err) {
      console.error("Login failed:", err);
      error.value = "Login failed";
      return false;
    }
  }

  async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
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

      if (!isOfflineAuth.value) {
        await call("logout");
      }

      isAuthenticated.value = false;
      isOfflineAuth.value = false;
      user.value = null;
      resetPermissions();

      // Clear cached credentials so next startup forces fresh login
      if (isElectron()) {
        try {
          await window.electronAPI!.db.setSetting("last_logged_user", "", "auth");
        } catch { /* ignore */ }
        window.location.hash = "#/login";
        window.location.reload();
      } else {
        window.location.href = "/xpos/login";
      }
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
    isOfflineAuth.value = false;
    user.value = null;
    error.value = "";
    resetEmailSent.value = false;
    resetPermissions();
  }

  return {
    // State
    isLoading,
    isAuthenticated,
    isOfflineAuth,
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
