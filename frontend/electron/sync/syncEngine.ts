/**
 * X POS Sync Engine
 *
 * Runs in the Electron main process as a background job.
 * Follows the .NET WinForms pattern:
 *   1. PULL master data first (batched, 500 per request)
 *   2. PUSH locally-created records to server
 *   3. Validate local ID via custom field to prevent duplicates
 *
 * All local data access goes through dbService (MariaDB) — no renderer IPC
 * needed for database operations.
 *
 * Communication with the renderer is via IPC events (status only):
 *   main → renderer:  sync-status, sync-error, sync-complete
 *   renderer → main:  trigger-sync, get-sync-state
 */

import { BrowserWindow, ipcMain, net } from "electron";
import { SYNC_TABLES, SYNC_DEFAULTS, type SyncTableConfig } from "./syncConfig";
import {
  query, queryOne, execute, upsertBatch, getMeta, setMeta,
} from "../database/dbService";
import { createLogger } from "../logger";

const log = createLogger("SyncEngine");

// ── Types ─────────────────────────────────────────────────────────

interface SyncState {
  isSyncing: boolean;
  lastSyncTime: string | null;
  pendingPushCount: number;
}

interface SyncContext {
  serverUrl: string;
  csrfToken: string;
  sessionCookies: string;
  apiKey?: string;
  apiSecret?: string;
}

// ── State ─────────────────────────────────────────────────────────

let syncState: SyncState = {
  isSyncing: false,
  lastSyncTime: null,
  pendingPushCount: 0,
};

let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let pushIntervalId: ReturnType<typeof setInterval> | null = null;
let syncContext: SyncContext | null = null;
let syncCycleCount = 0;

/** How often to run deletion detection (every Nth sync cycle) */
const DELETION_CHECK_EVERY = 5;

// ── Helpers ───────────────────────────────────────────────────────

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows[0] || null;
}

function emitToRenderer(channel: string, data: unknown): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

function isOnline(): boolean {
  return net.isOnline();
}

/**
 * Make an authenticated API call to the ERPNext server.
 * Uses Electron's net module (not fetch) so it works from main process.
 */
async function apiCall<T = unknown>(
  method: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  if (!syncContext) throw new Error("Sync context not initialized");

  // Frappe REST API: pass args as query string for GET to avoid
  // Electron net.request auto-adding 'Expect: 100-continue' on POST,
  // which causes HTTP 417 from some Frappe versions.
  const baseUrl = `${syncContext.serverUrl}/api/method/${method}`;
  const queryString = Object.entries(args)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === "object" ? JSON.stringify(v) : String(v))}`)
    .join("&");
  const url = queryString ? `${baseUrl}?${queryString}` : baseUrl;

  return new Promise<T>((resolve, reject) => {
    const request = net.request({
      method: "GET",
      url,
    });

    request.setHeader("Accept", "application/json");
    // Prefer API key/secret (used after local login)
    if (syncContext!.apiKey && syncContext!.apiSecret) {
      request.setHeader(
        "Authorization",
        `token ${syncContext!.apiKey}:${syncContext!.apiSecret}`
      );
    } else {
      // Fall back to session cookie auth (web PWA flow)
      if (syncContext!.csrfToken) {
        request.setHeader("X-Frappe-CSRF-Token", syncContext!.csrfToken);
      }
      if (syncContext!.sessionCookies) {
        request.setHeader("Cookie", syncContext!.sessionCookies);
      }
    }

    let responseBody = "";

    request.on("response", (response: Electron.IncomingMessage) => {
      response.on("data", (chunk: Uint8Array) => {
        responseBody += chunk.toString();
      });

      response.on("end", () => {
        try {
          const data = JSON.parse(responseBody);
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(data.message || `HTTP ${response.statusCode}`));
          } else {
            resolve(data.message as T);
          }
        } catch {
          reject(new Error(`Invalid JSON response from ${method}`));
        }
      });
    });

    request.on("error", (err: Error) => {
      reject(err);
    });

    request.end();
  });
}

// ── Pull Phase ────────────────────────────────────────────────────

/**
 * Pull a single table's data in batches of `batchSize`.
 * For incremental tables, only fetch records modified since last sync.
 * Stores pulled data directly into local MariaDB via upsertBatch.
 * Returns total records pulled.
 */
async function pullTable(config: SyncTableConfig): Promise<number> {
  emitToRenderer("sync-status", {
    phase: "pull",
    table: config.label,
    progress: 0,
  });

  // Determine the "modified since" cutoff for incremental sync
  let lastModified: string | null = null;
  if (config.incremental) {
    lastModified = await getMeta(`last_sync_${config.idbStore}`);
  }

  let totalPulled = 0;
  let start = 0;
  let hasMore = true;
  // Track the most recent modified timestamp returned by the server.
  // Using the server's own timestamps (rather than new Date() on the client)
  // ensures timezone-independent incremental sync — if the server clock differs
  // from the client clock, the next sync filter is still correct.
  let maxServerModified: string | null = null;

  while (hasMore) {
    const filters: Record<string, unknown> = { ...(config.filters || {}) };
    if (lastModified) {
      filters["modified"] = [">", lastModified];
    }

    const batch = await apiCall<Record<string, unknown>[]>(
      config.pullMethod || "frappe.client.get_list",
      {
        doctype: config.doctype,
        fields: config.fields,
        filters,
        order_by: `${config.orderBy} asc`,
        limit_start: start,
        limit_page_length: config.batchSize,
      }
    );

    if (!batch || batch.length === 0) {
      hasMore = false;
      break;
    }

    // Track max modified from server records for incremental timestamp
    for (const row of batch) {
      const m = row["modified"] as string | undefined;
      if (m && (!maxServerModified || m > maxServerModified)) {
        maxServerModified = m;
      }
    }

    // Write batch directly to local MariaDB.
    // Normalize rows first: Frappe always returns 'name' but some local tables
    // (e.g. items) use a different primary key and have no 'name' column.
    // Strip 'name' for those tables; seed the real PK from it if missing.
    const primaryKey = getPrimaryKeyForTable(config.idbStore);
    const processedBatch = primaryKey === "name"
      ? batch
      : batch.map((row) => {
          const r: Record<string, unknown> = { ...row };
          if ("name" in r) {
            if (r[primaryKey] === undefined || r[primaryKey] === null) {
              r[primaryKey] = r["name"];
            }
            delete r["name"];
          }
          return r;
        });
    await upsertBatch(config.idbStore, processedBatch, primaryKey);

    totalPulled += batch.length;
    start += config.batchSize;

    emitToRenderer("sync-status", {
      phase: "pull",
      table: config.label,
      progress: totalPulled,
    });

    // If we received fewer records than batch size, we're done
    if (batch.length < config.batchSize) {
      hasMore = false;
    }
  }

  // Update last sync timestamp.
  // Prefer the server's max modified timestamp so the next incremental filter
  // is expressed in the server's own timezone — avoids clock-skew gaps.
  if (totalPulled > 0 || !config.incremental) {
    const newTimestamp = maxServerModified ?? new Date().toISOString();
    await setMeta(`last_sync_${config.idbStore}`, newTimestamp);
  }

  return totalPulled;
}

// ── Deletion Detection ────────────────────────────────────────────

/**
 * Detect records deleted from ERPNext by comparing the full set of
 * server record names against local record names.
 *
 * Only runs for pull-direction tables. Runs periodically (not every sync)
 * to avoid excessive API calls — controlled by `deletion_check_interval`.
 */
async function detectDeletions(config: SyncTableConfig): Promise<number> {
  if (config.direction === "push") return 0;

  const primaryKey = getPrimaryKeyForTable(config.idbStore);

  // Get all names from server
  const serverNames = await apiCall<{ name: string }[]>(
    "frappe.client.get_list",
    {
      doctype: config.doctype,
      fields: ["name"],
      filters: config.filters || {},
      limit_page_length: 0, // all records
    }
  );

  if (!serverNames || !Array.isArray(serverNames)) return 0;

  const serverNameSet = new Set(serverNames.map((r) => r.name));

  // Get all local names
  const localRows = await query<Record<string, string>>(
    `SELECT \`${primaryKey}\` FROM \`${config.idbStore}\``
  );

  let deleted = 0;

  for (const row of localRows) {
    const localKey = row[primaryKey];
    if (!serverNameSet.has(localKey)) {
      // Record exists locally but not on server — it was deleted
      await execute(
        `DELETE FROM \`${config.idbStore}\` WHERE \`${primaryKey}\` = ?`,
        [localKey]
      );

      // Log the deletion so tills can pick it up
      await execute(
        `INSERT INTO \`deletion_log\` (\`table_name\`, \`record_key\`, \`doctype\`, \`deleted_at\`)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE \`deleted_at\` = NOW()`,
        [config.idbStore, localKey, config.doctype]
      );

      deleted++;
    }
  }

  if (deleted > 0) {
    emitToRenderer("sync-status", {
      phase: "deletion",
      table: config.label,
      progress: deleted,
    });
    log.info(`Detected ${deleted} deletions in ${config.label}`);
  }

  return deleted;
}

/**
 * Map table names to their primary key column used for upsert.
 */
function getPrimaryKeyForTable(table: string): string {
  const map: Record<string, string> = {
    items: "item_code",
    item_groups: "name",
    customers: "name",
    suppliers: "name",
  };
  return map[table] || "name";
}

// ── Push Phase ────────────────────────────────────────────────────

/**
 * Push locally-created records for a single table.
 * Reads pending records directly from local MariaDB.
 * The server validates via `xpos_local_id` custom field to prevent duplicates.
 *
 * Returns { synced, failed } counts.
 */
async function pushTable(
  config: SyncTableConfig
): Promise<{ synced: number; failed: number }> {
  if (!config.pushMethod) return { synced: 0, failed: 0 };

  emitToRenderer("sync-status", {
    phase: "push",
    table: config.label,
    progress: 0,
  });

  // Determine which local table to query based on idbStore
  let pendingTable: string;
  let typeFilter = "";
  let selectFields = "*";
  let statusField = "status";
  let statusPending = "'pending'";
  let statusFailed = "'failed'";
  let statusSyncing = "syncing";
  let statusSynced = "synced";
  let retryField = "retry_count";
  let idField = "id";
  let localIdField = "id";
  const params: unknown[] = [];

  if (config.idbStore === "pending_invoices") {
    pendingTable = "pending_invoices";
    localIdField = "local_id";
  } else if (config.idbStore === "pending_purchases") {
    pendingTable = "pending_purchases";
    localIdField = "local_id";
    const docKey = config.doctype.toLowerCase().replace(/ /g, "_");
    typeFilter = " AND `type` = ?";
    params.push(docKey);
  } else if (config.idbStore === "pos_opening_shifts") {
    pendingTable = "pos_opening_shifts";
    statusField = "sync_status";
    retryField = "COALESCE(retry_count, 0)";
    localIdField = "id";
    // Only push shifts that are Open or Closed and not yet synced
    statusPending = "'pending'";
    statusFailed = "'failed'";
    statusSyncing = "syncing";
    statusSynced = "synced";
  } else if (config.idbStore === "pos_closing_entries") {
    pendingTable = "pos_closing_entries";
    statusField = "sync_status";
    retryField = "COALESCE(retry_count, 0)";
    localIdField = "id";
    statusPending = "'pending'";
    statusFailed = "'failed'";
    statusSyncing = "syncing";
    statusSynced = "synced";
  } else {
    return { synced: 0, failed: 0 };
  }

  // Build the query dynamically based on the table structure
  let querySQL: string;
  if (pendingTable === "pending_invoices" || pendingTable === "pending_purchases") {
    querySQL = `SELECT * FROM \`${pendingTable}\`
     WHERE (\`${statusField}\` = ${statusPending} OR \`${statusField}\` = ${statusFailed})
       AND COALESCE(\`retry_count\`, 0) < ?${typeFilter}
     ORDER BY \`created_at\` ASC`;
  } else {
    // For pos_opening_shifts and pos_closing_entries
    querySQL = `SELECT * FROM \`${pendingTable}\`
     WHERE (\`${statusField}\` = ${statusPending} OR \`${statusField}\` = ${statusFailed})
     ORDER BY \`created_at\` ASC`;
    params.length = 0; // Clear params, we don't need retry check for shifts
  }

  const pendingRecords = await query<Record<string, unknown>>(
    querySQL,
    pendingTable.includes("pending") ? [SYNC_DEFAULTS.maxRetries, ...params] : params
  );

  if (pendingRecords.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const record of pendingRecords) {
    if (!isOnline()) break;

    const recordId = record[idField] as number;
    const recordLocalId = String(record[localIdField] || recordId);

    try {
      // Mark as syncing
      await execute(
        `UPDATE \`${pendingTable}\` SET \`${statusField}\` = '${statusSyncing}' WHERE \`${idField}\` = ?`,
        [recordId]
      );

      // Prepare the data to send to the server
      let data: Record<string, unknown>;

      if (pendingTable === "pending_invoices" || pendingTable === "pending_purchases") {
        // These tables store data as JSON string in `data` column
        const rawData = record.data;
        data = typeof rawData === "string" ? JSON.parse(rawData) : (rawData as Record<string, unknown>) || {};

        // For invoices, resolve local shift ID to server docname
        if (pendingTable === "pending_invoices") {
          const localShiftId = data.pos_opening_shift || data.pos_opening_shift_local_id;
          if (localShiftId) {
            // Try to get server name from sync_id_map first
            const serverShiftName = await getServerShiftName(String(localShiftId));
            if (serverShiftName) {
              data.pos_opening_shift = serverShiftName;
              delete data.pos_opening_shift_local_id;
            } else {
              // Shift not yet synced - skip this invoice for now
              await execute(
                `UPDATE \`${pendingTable}\` SET \`${statusField}\` = 'pending' WHERE \`${idField}\` = ?`,
                [recordId]
              );
              continue;
            }
          }
        }
      } else if (pendingTable === "pos_opening_shifts") {
        // Build data from shift columns
        data = {
          period_start_date: record.period_start_date,
          posting_date: record.posting_date,
          user: record.user,
          pos_profile: record.pos_profile,
          company: record.company,
          balance_details: await getOpeningShiftDetails(recordId),
        };
      } else if (pendingTable === "pos_closing_entries") {
        // Build data from closing entry columns
        const openingShiftLocalId = record.pos_opening_entry_id as number;
        const serverOpeningShiftName = await getServerShiftName(String(openingShiftLocalId));

        if (!serverOpeningShiftName) {
          // Opening shift not yet synced - skip this closing entry for now
          await execute(
            `UPDATE \`${pendingTable}\` SET \`${statusField}\` = 'pending' WHERE \`${idField}\` = ?`,
            [recordId]
          );
          continue;
        }

        data = {
          pos_opening_shift: serverOpeningShiftName,
          period_end_date: record.period_end_date,
          posting_date: record.posting_date,
          posting_time: record.posting_time,
          pos_profile: record.pos_profile,
          user: record.user,
          company: record.company,
          payment_reconciliation: await getClosingEntryDetails(recordId),
        };
      } else {
        data = record as Record<string, unknown>;
      }

      // Push to server — the server checks xpos_local_id to prevent duplicates
      const serverResult = await apiCall<{ name?: string }>(config.pushMethod, {
        data: JSON.stringify(data),
        local_id: recordLocalId,
      });

      // Store the sync ID mapping (local_id → server_name)
      if (serverResult?.name) {
        await execute(
          `INSERT INTO \`sync_id_map\` (\`local_id\`, \`server_name\`, \`doctype\`)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE \`server_name\` = VALUES(\`server_name\`)`,
          [recordLocalId, serverResult.name, config.doctype]
        );

        // Update the record with server name and mark as synced
        if (pendingTable === "pending_invoices" || pendingTable === "pending_purchases") {
          await execute(
            `UPDATE \`${pendingTable}\` SET \`server_name\` = ?, \`${statusField}\` = '${statusSynced}' WHERE \`${idField}\` = ?`,
            [serverResult.name, recordId]
          );
        } else {
          // For shifts, update erp_id and sync_status
          await execute(
            `UPDATE \`${pendingTable}\` SET \`erp_id\` = ?, \`${statusField}\` = '${statusSynced}', \`synced_at\` = NOW() WHERE \`${idField}\` = ?`,
            [serverResult.name, recordId]
          );
        }
      } else {
        // Mark as synced even without server name (shouldn't happen normally)
        await execute(
          `UPDATE \`${pendingTable}\` SET \`${statusField}\` = '${statusSynced}' WHERE \`${idField}\` = ?`,
          [recordId]
        );
      }

      synced++;
    } catch (error) {
      failed++;
      const errMsg = error instanceof Error ? error.message : String(error);

      // Update status based on table type
      if (pendingTable === "pending_invoices" || pendingTable === "pending_purchases") {
        await execute(
          `UPDATE \`${pendingTable}\` SET \`status\` = 'failed', \`error\` = ?, \`retry_count\` = COALESCE(\`retry_count\`, 0) + 1 WHERE \`id\` = ?`,
          [errMsg, recordId]
        );
      } else {
        await execute(
          `UPDATE \`${pendingTable}\` SET \`${statusField}\` = 'failed' WHERE \`${idField}\` = ?`,
          [recordId]
        );
      }

      emitToRenderer("sync-error", {
        message: errMsg,
        table: config.label,
      });
    }

    emitToRenderer("sync-status", {
      phase: "push",
      table: config.label,
      progress: synced + failed,
    });
  }

  return { synced, failed };
}

/**
 * Get server docname for a local shift ID.
 * First checks sync_id_map, then the erp_id column in pos_opening_shifts.
 */
async function getServerShiftName(localShiftId: string): Promise<string | null> {
  // First check the sync_id_map table
  const mapRow = await queryOne<{ server_name: string }>(
    "SELECT `server_name` FROM `sync_id_map` WHERE `local_id` = ? AND `doctype` = 'XPOS Opening Shift'",
    [localShiftId]
  );
  if (mapRow?.server_name) return mapRow.server_name;

  // Then check the erp_id column in pos_opening_shifts
  const shiftRow = await queryOne<{ erp_id: string }>(
    "SELECT `erp_id` FROM `pos_opening_shifts` WHERE `id` = ?",
    [localShiftId]
  );
  if (shiftRow?.erp_id) return shiftRow.erp_id;

  return null;
}

/**
 * Get opening shift balance details for pushing to server.
 */
async function getOpeningShiftDetails(shiftId: number): Promise<{ mode_of_payment: string; opening_amount: number }[]> {
  const rows = await query<{ mode_of_payment: string; opening_amount: number }>(
    "SELECT `mode_of_payment`, `opening_amount` FROM `pos_opening_entry_details` WHERE `parent_id` = ?",
    [shiftId]
  );
  return rows.map(r => ({
    mode_of_payment: r.mode_of_payment,
    opening_amount: r.opening_amount,
  }));
}

/**
 * Get closing entry payment reconciliation details for pushing to server.
 */
async function getClosingEntryDetails(closingId: number): Promise<{
  mode_of_payment: string;
  opening_amount: number;
  expected_amount: number;
  closing_amount: number;
  difference: number;
}[]> {
  const rows = await query<{
    mode_of_payment: string;
    opening_amount: number;
    expected_amount: number;
    closing_amount: number;
    difference: number;
  }>(
    `SELECT \`mode_of_payment\`, \`opening_amount\`, \`expected_amount\`, \`closing_amount\`, \`difference\`
     FROM \`pos_closing_entry_details\` WHERE \`parent_id\` = ?`,
    [closingId]
  );
  return rows;
}

// ── Main Sync Cycle ───────────────────────────────────────────────

/**
 * Execute one full sync cycle: PULL first, then PUSH.
 */
async function runSyncCycle(): Promise<void> {
  if (syncState.isSyncing || !isOnline()) return;

  syncState.isSyncing = true;
  syncCycleCount++;
  emitToRenderer("sync-status", { phase: "starting" });

  let totalPulled = 0;
  let totalPushed = 0;
  let totalDeleted = 0;

  try {
    // ── Phase 1: PULL master data ──────────────────────────────
    const pullTables = SYNC_TABLES
      .filter((t) => t.direction === "pull" || t.direction === "both")
      .sort((a, b) => a.pullOrder - b.pullOrder);

    for (const table of pullTables) {
      if (!isOnline()) break;
      try {
        const count = await pullTable(table);
        totalPulled += count;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        emitToRenderer("sync-error", {
          message: `Pull failed for ${table.label}: ${errMsg}`,
          table: table.label,
        });
      }
    }

    // ── Phase 2: DETECT DELETIONS (every Nth cycle) ────────────
    if (syncCycleCount % DELETION_CHECK_EVERY === 0) {
      for (const table of pullTables) {
        if (!isOnline()) break;
        try {
          const count = await detectDeletions(table);
          totalDeleted += count;
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          emitToRenderer("sync-error", {
            message: `Deletion check failed for ${table.label}: ${errMsg}`,
            table: table.label,
          });
        }
      }
    }

    // ── Phase 3: PUSH local records ────────────────────────────
    const pushTables = SYNC_TABLES
      .filter((t) => t.direction === "push" || t.direction === "both")
      .sort((a, b) => a.pullOrder - b.pullOrder); // push in dependency order too

    for (const table of pushTables) {
      if (!isOnline()) break;
      try {
        const { synced } = await pushTable(table);
        totalPushed += synced;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        emitToRenderer("sync-error", {
          message: `Push failed for ${table.label}: ${errMsg}`,
          table: table.label,
        });
      }
    }

    syncState.lastSyncTime = new Date().toISOString();
    emitToRenderer("sync-complete", {
      pulled: totalPulled,
      pushed: totalPushed,
      deleted: totalDeleted,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    emitToRenderer("sync-error", { message: `Sync cycle failed: ${errMsg}` });
  } finally {
    syncState.isSyncing = false;
    emitToRenderer("sync-status", { phase: "idle" });
  }
}

/**
 * Run a push-only sync cycle for quicker invoice/shift syncing.
 * Called more frequently than the full sync cycle.
 */
async function runPushCycle(): Promise<void> {
  if (syncState.isSyncing || !isOnline()) return;

  const pushTables = SYNC_TABLES
    .filter((t) => t.direction === "push" || t.direction === "both")
    .sort((a, b) => a.pullOrder - b.pullOrder);

  let totalPushed = 0;

  for (const table of pushTables) {
    if (!isOnline()) break;
    try {
      const { synced } = await pushTable(table);
      totalPushed += synced;
    } catch (error) {
      // Silent fail for push-only cycle - full sync will retry
      log.warn(`Push-only cycle failed for ${table.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (totalPushed > 0) {
    log.info(`Push-only cycle completed: ${totalPushed} records pushed`);
  }
}

// ── Public API (called from main.ts) ──────────────────────────────

/**
 * Trigger a manual sync cycle from outside the module (e.g. right after login).
 */
export async function runSyncCyclePublic(): Promise<void> {
  await runSyncCycle();
}

/**
 * Initialize the sync engine, register IPC handlers, start periodic sync.
 */
export function initSyncEngine(context: SyncContext): void {
  syncContext = context;

  // IPC: manual trigger
  ipcMain.handle("trigger-sync", async () => {
    if (syncState.isSyncing) return false;
    await runSyncCycle();
    return true;
  });

  // IPC: get state
  ipcMain.handle("get-sync-state", () => ({ ...syncState }));

  // Start periodic sync
  startPeriodicSync();

  // React to network changes
  const checkOnline = () => {
    if (isOnline() && !syncState.isSyncing) {
      // Wait a grace period then sync
      setTimeout(() => {
        if (isOnline()) runSyncCycle();
      }, SYNC_DEFAULTS.onlineGracePeriodMs);
    }
  };

  // Electron's net module emits online/offline at the app level
  // but we also poll periodically as a safety net
  setInterval(checkOnline, 30_000);

  log.info(`Initialized with interval: ${SYNC_DEFAULTS.intervalMs} ms`);
}

/**
 * Update the sync context (e.g., after re-login with new CSRF token).
 */
export function updateSyncContext(context: Partial<SyncContext>): void {
  if (syncContext) {
    syncContext = { ...syncContext, ...context };
  }
}

function startPeriodicSync(): void {
  // Full sync cycle (pull + push) at longer intervals
  if (syncIntervalId) clearInterval(syncIntervalId);
  syncIntervalId = setInterval(() => {
    if (isOnline() && !syncState.isSyncing) {
      runSyncCycle();
    }
  }, SYNC_DEFAULTS.intervalMs);

  // Push-only cycle at shorter intervals for quicker invoice syncing
  if (pushIntervalId) clearInterval(pushIntervalId);
  pushIntervalId = setInterval(() => {
    if (isOnline() && !syncState.isSyncing) {
      runPushCycle();
    }
  }, SYNC_DEFAULTS.pushIntervalMs);
}

export function stopSyncEngine(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
  if (pushIntervalId) {
    clearInterval(pushIntervalId);
    pushIntervalId = null;
  }
  syncContext = null;
  log.info("Stopped");
}
