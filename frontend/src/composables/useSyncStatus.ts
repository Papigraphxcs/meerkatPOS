import { ref, onMounted, onUnmounted } from "vue";
import { isElectron } from "@/services/electronBridge";

export interface SyncErrorEntry {
	message: string;
	table?: string;
	at: string;
}

export interface DeadLetterEntry {
	table: string;
	localId: string;
	retryCount: number;
	error: string;
	at: string;
}

const MAX_ERROR_LOG = 20;

export function useSyncStatus() {
	const isSyncing = ref(false);
	const syncPhase = ref<string>("idle");
	const syncTable = ref<string | null>(null);
	const lastSyncTime = ref<string | null>(null);
	const lastError = ref<string | null>(null);
	const syncCompleteCount = ref(0);

	// Rolling log so transient errors are not lost when a cycle completes.
	const errorLog = ref<SyncErrorEntry[]>([]);
	// Records that exhausted all retries and need manual attention.
	const deadLetters = ref<DeadLetterEntry[]>([]);
	// True while the current cycle has reported at least one error.
	const cycleHadError = ref(false);

	const cleanups: Array<() => void> = [];

	onMounted(async () => {
		if (!isElectron() || !window.electronAPI) return;

		try {
			const state = await window.electronAPI.getSyncState();
			if (state?.lastSyncTime) {
				lastSyncTime.value = new Date(state.lastSyncTime).toLocaleTimeString();
			}
		} catch {}

		const offStatus = window.electronAPI.onSyncStatus((status) => {
			syncPhase.value = status.phase;
			syncTable.value = status.table ?? null;
			isSyncing.value = status.phase !== "idle";
			// A fresh cycle is starting; reset the per-cycle error flag.
			if (status.phase === "starting") cycleHadError.value = false;
		});

		const offError = window.electronAPI.onSyncError((error) => {
			lastError.value = error.message;
			cycleHadError.value = true;
			errorLog.value.unshift({
				message: error.message,
				table: error.table,
				at: new Date().toISOString(),
			});
			if (errorLog.value.length > MAX_ERROR_LOG) errorLog.value.length = MAX_ERROR_LOG;
			console.warn("[Sync]", error.table ? `${error.table}: ` : "", error.message);
		});

		const offComplete = window.electronAPI.onSyncComplete(() => {
			isSyncing.value = false;
			syncPhase.value = "idle";
			syncTable.value = null;
			// Only clear the surfaced error if this cycle was clean. Otherwise
			// keep it visible so the user can actually read what failed.
			if (!cycleHadError.value) lastError.value = null;
			lastSyncTime.value = new Date().toLocaleTimeString();
			syncCompleteCount.value++;
		});

		const offDeadLetter = window.electronAPI.onSyncDeadLetter((info) => {
			deadLetters.value.unshift({
				table: info.table,
				localId: info.localId,
				retryCount: info.retryCount,
				error: info.error,
				at: new Date().toISOString(),
			});
			// Dead-letters are a hard failure; surface them like an error too.
			lastError.value = `${info.table} #${info.localId} failed permanently: ${info.error}`;
			cycleHadError.value = true;
		});

		cleanups.push(offStatus, offError, offComplete, offDeadLetter);
	});

	onUnmounted(() => {
		cleanups.forEach((fn) => fn());
		cleanups.length = 0;
	});

	function clearErrorLog() {
		errorLog.value = [];
		lastError.value = null;
	}

	function clearDeadLetters() {
		deadLetters.value = [];
	}

	return {
		isSyncing,
		syncPhase,
		syncTable,
		lastSyncTime,
		lastError,
		syncCompleteCount,
		errorLog,
		deadLetters,
		clearErrorLog,
		clearDeadLetters,
	};
}
