import { toast } from "vue-sonner";
import { h, defineComponent } from "vue";

function htmlComponent(html: string) {
  return defineComponent({ render: () => h("div", { innerHTML: html }) });
}

function toastContent(message: string): string | ReturnType<typeof defineComponent> {
  return /<[a-z][\s\S]*>/i.test(message) ? htmlComponent(message) : message;
}

/**
 * Toast composable using vue-sonner
 * Provides a unified API for all toast/notification functionality
 */
export function useToast() {
  /**
   * Show a success toast
   */
  const success = (message: string, options?: { duration?: number; description?: string }) => {
    return (toast.success as Function)(toastContent(message), {
      duration: options?.duration || 3000,
      description: options?.description,
    });
  };

  /**
   * Show an error toast
   */
  const error = (message: string, options?: { duration?: number; description?: string }) => {
    return (toast.error as Function)(toastContent(message), {
      duration: options?.duration || 5000,
      description: options?.description,
    });
  };

  /**
   * Show an info toast
   */
  const info = (message: string, options?: { duration?: number; description?: string }) => {
    return (toast.info as Function)(toastContent(message), {
      duration: options?.duration || 3000,
      description: options?.description,
    });
  };

  /**
   * Show a warning toast
   */
  const warning = (message: string, options?: { duration?: number; description?: string }) => {
    return (toast.warning as Function)(toastContent(message), {
      duration: options?.duration || 4000,
      description: options?.description,
    });
  };

  /**
   * Show a basic toast
   */
  const message = (content: string, options?: { duration?: number; description?: string }) => {
    return (toast as Function)(toastContent(content), {
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
    toast,
  };
}

/**
 * Legacy API compatibility functions
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