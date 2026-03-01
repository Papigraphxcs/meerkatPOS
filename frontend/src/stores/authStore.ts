import { defineStore } from "pinia";
import { ref, computed, type Ref, type ComputedRef } from "vue";

interface UserSession {
  user: string;
  user_email?: string;
  user_fullname?: string;
}

export const useAuthStore = defineStore("auth", () => {
  // ─── State ─────────────────────────────────────
  const isLoading: Ref<boolean> = ref(false);
  const isAuthenticated: Ref<boolean> = ref(false);
  const user: Ref<UserSession | null> = ref(null);
  const error: Ref<string> = ref("");
  const resetEmailSent: Ref<boolean> = ref(false);

  // ─── Computed ──────────────────────────────────
  const userName: ComputedRef<string> = computed(() => user.value?.user || "Guest");
  const userEmail: ComputedRef<string> = computed(() => user.value?.user_email || "");
  const userFullName: ComputedRef<string> = computed(() => user.value?.user_fullname || "");
  const isGuest: ComputedRef<boolean> = computed(() => !user.value || user.value.user === "Guest");

  // ─── Actions ───────────────────────────────────

  /**
   * Check if user is currently authenticated
   */
  async function checkAuth(): Promise<boolean> {
    try {
      isLoading.value = true;
      error.value = "";

      const response = await fetch("/api/method/frappe.auth.get_logged_user", {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
        credentials: "same-origin",
      });

      if (!response.ok) {
        isAuthenticated.value = false;
        user.value = null;
        return false;
      }

      const data = await response.json();
      const loggedUser = data.message;

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

  /**
   * Login with username and password
   */
  async function login(username: string, password: string): Promise<boolean> {
    try {
      isLoading.value = true;
      error.value = "";

      const response = await fetch("/api/method/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: new URLSearchParams({
          usr: username,
          pwd: password,
        }),
        credentials: "same-origin",
      });

      const data = await response.json();

      if (!response.ok) {
        let errorMsg = "Login failed";

        if (data._server_messages) {
          try {
            const serverMessages = JSON.parse(data._server_messages);
            const firstMessage = serverMessages[0];
            const parsed = typeof firstMessage === "string" ? JSON.parse(firstMessage) : firstMessage;
            errorMsg = parsed.message || parsed.title || String(parsed);
          } catch {
            errorMsg = data._server_messages;
          }
        } else if (data.message) {
          errorMsg = data.message;
        }

        error.value = errorMsg;
        return false;
      }

      // Login successful
      isAuthenticated.value = true;
      user.value = {
        user: data.full_name || username,
        user_email: username,
        user_fullname: data.full_name || username,
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

  /**
   * Send password reset email
   */
  async function sendResetPasswordEmail(email: string): Promise<boolean> {
    try {
      isLoading.value = true;
      error.value = "";
      resetEmailSent.value = false;

      const csrfToken =
        window.xpos?.csrf_token ||
        (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content ||
        "";

      const response = await fetch("/api/method/frappe.core.doctype.user.user.reset_password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Frappe-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ user: email }),
        credentials: "same-origin",
      });

      const data = await response.json();

      if (!response.ok || data.exc) {
        let errorMsg = "Failed to send reset email";

        if (data._server_messages) {
          try {
            const serverMessages = JSON.parse(data._server_messages);
            const firstMessage = serverMessages[0];
            const parsed = typeof firstMessage === "string" ? JSON.parse(firstMessage) : firstMessage;
            errorMsg = parsed.message || parsed.title || String(parsed);
          } catch {
            errorMsg = data._server_messages;
          }
        } else if (data.message) {
          errorMsg = typeof data.message === "string" ? data.message : "Failed to send reset email";
        }

        error.value = errorMsg;
        return false;
      }

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

  /**
   * Logout current user
   */
  async function logout(): Promise<void> {
    try {
      isLoading.value = true;

      await fetch("/api/method/logout", {
        method: "GET",
        credentials: "same-origin",
      });

      isAuthenticated.value = false;
      user.value = null;

      // Redirect to login
      window.location.href = "/xpos/login";
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Clear error state
   */
  function clearError(): void {
    error.value = "";
  }

  /**
   * Reset the store state
   */
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
