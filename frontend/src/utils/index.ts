/**
 * Check if the browser has an active network connection.
 * Uses the Navigator.onLine API which provides a reliable way
 * to detect network connectivity status.
 */
export const isOnline = (): boolean => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
};

/**
 * Execute a function with offline fallback.
 * Attempts the online operation first, falls back to offline handler on failure.
 */
export async function withOfflineFallback<T>(
    onlineOperation: () => Promise<T>,
    offlineFallback: () => Promise<T> | T,
    options?: { logError?: boolean }
): Promise<T> {
    // If offline, go straight to fallback
    if (!isOnline()) {
        return await offlineFallback();
    }

    try {
        return await onlineOperation();
    } catch (error) {
        // Check if it's a network error
        const isNetworkFailure = isNetworkError(error);
        if (isNetworkFailure) {
            return await offlineFallback();
        }
        // Re-throw non-network errors
        throw error;
    }
}

/**
 * Determine whether an error was caused by a network failure (offline, DNS,
 * server unreachable, etc.) as opposed to a server-side error.
 */
export function isNetworkError(error: unknown): boolean {
    if (!error) return false;
    const msg = error instanceof Error ? error.message : String(error);
    return (
        msg === "__offline__" ||
        msg === "Failed to fetch" ||
        msg === "NetworkError when attempting to fetch resource." ||
        msg === "Network request failed" ||
        msg === "Load failed" ||
        msg.includes("ERR_INTERNET_DISCONNECTED") ||
        msg.includes("ERR_NAME_NOT_RESOLVED") ||
        msg.includes("ERR_CONNECTION_REFUSED")
    );
}

/**
 * Debounce function to limit the rate at which a function can fire.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/**
 * Format a date string to a localized format
 */
export function formatDate(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString();
}

/**
 * Format a number as currency
 */
export function formatNumber(value: number, decimals = 2): string {
    return value.toFixed(decimals);
}

/**
 * Generate a unique local ID for offline records
 */
export function generateLocalId(): string {
    return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}