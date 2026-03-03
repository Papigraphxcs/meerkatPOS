import { toast } from "vue-sonner";

/**
 * Toast composable using vue-sonner
 * Provides a unified API for all toast/notification functionality
 */
export function useToast() {
  /**
   * Show a success toast
   */
  const success = (message: string, options?: { duration?: number; description?: string }) => {
    return toast.success(message, {
      duration: options?.duration || 3000,
      description: options?.description,
    });
  };

  /**
   * Show an error toast
   */
  const error = (message: string, options?: { duration?: number; description?: string }) => {
    return toast.error(message, {
      duration: options?.duration || 5000,
      description: options?.description,
    });
  };

  /**
   * Show an info toast
   */
  const info = (message: string, options?: { duration?: number; description?: string }) => {
    return toast.info(message, {
      duration: options?.duration || 3000,
      description: options?.description,
    });
  };

  /**
   * Show a warning toast
   */
  const warning = (message: string, options?: { duration?: number; description?: string }) => {
    return toast.warning(message, {
      duration: options?.duration || 4000,
      description: options?.description,
    });
  };

  /**
   * Show a basic toast
   */
  const message = (content: string, options?: { duration?: number; description?: string }) => {
    return toast(content, {
      duration: options?.duration || 3000,
      description: options?.description,
    });
  };

  /**
   * Show a loading toast
   */
  const loading = (message: string) => {
    return toast.loading(message);
  };

  /**
   * Dismiss a specific toast by ID
   */
  const dismiss = (toastId?: string | number) => {
    return toast.dismiss(toastId);
  };

  /**
   * Dismiss all toasts
   */
  const dismissAll = () => {
    return toast.dismiss();
  };

  return {
    success,
    error,
    info,
    warning,
    message,
    loading,
    dismiss,
    dismissAll,
    // Export the raw toast function for advanced usage
    toast,
  };
}

/**
 * Legacy API compatibility functions
 * These maintain the same signature as the old frappe-based functions
 */
export function showSuccess(message: string): void {
  const { success } = useToast();
  success(message);
}

export function showError(message: string): void {
  const { error } = useToast();
  error(message);
}

export function showInfo(message: string): void {
  const { info } = useToast();
  info(message);
}