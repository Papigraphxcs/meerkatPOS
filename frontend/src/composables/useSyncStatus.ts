import { ref, onMounted, onUnmounted } from "vue";
import { isElectron } from "@/services/electronBridge";

export function useSyncStatus() {
	const isSyncing = ref(false);
	const syncPhase = ref<string>("idle");
	const syncTable = ref<string | null>(null);
	const lastSyncTime = ref<string | null>(null);
	const lastError = ref<string | null>(null);
	const syncCompleteCount = ref(0);

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
		});

		const offError = window.electronAPI.onSyncError((error) => {
			lastError.value = error.message;
			console.warn("[Sync]", error.message);
		});

		const offComplete = window.electronAPI.onSyncComplete(() => {
			isSyncing.value = false;
			syncPhase.value = "idle";
			syncTable.value = null;
			lastError.value = null;
			lastSyncTime.value = new Date().toLocaleTimeString();
			syncCompleteCount.value++;
		});

		cleanups.push(offStatus, offError, offComplete);
	});

	onUnmounted(() => {
		cleanups.forEach((fn) => fn());
		cleanups.length = 0;
	});

	return {
		isSyncing,
		syncPhase,
		syncTable,
		lastSyncTime,
		lastError,
		syncCompleteCount,
	};
}
