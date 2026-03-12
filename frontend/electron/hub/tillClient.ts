/**
 * Till Client — Sync adapter for spoke/till mode.
 *
 * Instead of calling ERPNext directly, tills pull master data from
 * the hub's local API and push pending records to it.
 *
 * The hub then handles upstream sync to ERPNext.
 */

import { net } from "electron";
import { upsertBatch, query, execute, getMeta, setMeta } from "../database/dbService";

interface TillSyncContext {
  hubUrl: string;   // e.g. http://192.168.1.100:6789
  tillId: string;   // e.g. "TILL-01"
}

let context: TillSyncContext | null = null;

// ── HTTP helper ───────────────────────────────────────────────────

function hubFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: string } = {}
): Promise<T> {
  if (!context) throw new Error("Till context not initialized");

  const url = `${context.hubUrl}${path}`;
  const method = opts.method || "GET";

  return new Promise((resolve, reject) => {
    const request = net.request({ method, url });
    request.setHeader("Content-Type", "application/json");
    request.setHeader("X-Till-Id", context!.tillId);

    let body = "";
    request.on("response", (response) => {
      response.on("data", (chunk: Uint8Array) => {
        body += chunk.toString();
      });
      response.on("end", () => {
        try {
          const data = JSON.parse(body);
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(data.error || `HTTP ${response.statusCode}`));
          } else {
            resolve(data as T);
          }
        } catch {
          reject(new Error(`Invalid JSON from hub: ${path}`));
        }
      });
    });

    request.on("error", reject);

    if (opts.body) request.write(opts.body);
    request.end();
  });
}

// ── Pull master data from hub ─────────────────────────────────────

const PULL_TABLES = [
  { table: "items", primaryKey: "item_code" },
  { table: "item_groups", primaryKey: "name" },
  { table: "customers", primaryKey: "name" },
  { table: "suppliers", primaryKey: "name" },
] as const;

async function pullFromHub(): Promise<number> {
  let totalPulled = 0;

  for (const { table, primaryKey } of PULL_TABLES) {
    const since = await getMeta(`till_last_sync_${table}`);
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({ limit: "500", offset: String(offset) });
      if (since) params.set("since", since);

      const result = await hubFetch<{ data: Record<string, unknown>[]; count: number }>(
        `/api/pull/${table}?${params}`
      );

      if (result.data.length > 0) {
        await upsertBatch(table, result.data, primaryKey);
        totalPulled += result.data.length;
      }

      if (result.count < 500) {
        hasMore = false;
      } else {
        offset += 500;
      }
    }

    await setMeta(`till_last_sync_${table}`, new Date().toISOString());
  }

  return totalPulled;
}

// ── Pull deletions from hub ───────────────────────────────────────

async function pullDeletionsFromHub(): Promise<number> {
  const since = await getMeta("till_last_deletion_sync");

  const result = await hubFetch<{
    data: { table_name: string; record_key: string; deleted_at: string }[];
  }>(`/api/deletions${since ? `?since=${encodeURIComponent(since)}` : ""}`);

  let deleted = 0;
  const keyColMap: Record<string, string> = {
    items: "item_code",
    item_groups: "name",
    customers: "name",
    suppliers: "name",
  };

  for (const row of result.data) {
    const keyCol = keyColMap[row.table_name];
    if (keyCol) {
      await execute(`DELETE FROM \`${row.table_name}\` WHERE \`${keyCol}\` = ?`, [row.record_key]);
      deleted++;
    }
  }

  if (result.data.length > 0) {
    const lastDate = result.data[result.data.length - 1].deleted_at;
    await setMeta("till_last_deletion_sync", lastDate);
  }

  return deleted;
}

// ── Push pending records to hub ───────────────────────────────────

async function pushToHub(): Promise<{ invoices: number; purchases: number }> {
  let invoices = 0;
  let purchases = 0;

  // Push pending invoices
  const pendingInvoices = await query<{
    id: number; local_id: string; data: string; status: string;
  }>(
    "SELECT * FROM `pending_invoices` WHERE `status` IN ('pending', 'failed') ORDER BY `created_at` ASC"
  );

  for (const inv of pendingInvoices) {
    try {
      await execute("UPDATE `pending_invoices` SET `status` = 'syncing' WHERE `id` = ?", [inv.id]);

      await hubFetch("/api/push/invoice", {
        method: "POST",
        body: JSON.stringify({
          data: inv.data,
          local_id: inv.local_id,
          till_id: context!.tillId,
          customer_name: (inv as Record<string, unknown>).customer_name,
          grand_total: (inv as Record<string, unknown>).grand_total,
        }),
      });

      await execute("UPDATE `pending_invoices` SET `status` = 'synced', `synced_at` = NOW() WHERE `id` = ?", [inv.id]);
      invoices++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await execute(
        "UPDATE `pending_invoices` SET `status` = 'failed', `error` = ?, `retry_count` = `retry_count` + 1 WHERE `id` = ?",
        [msg, inv.id]
      );
    }
  }

  // Push pending purchases
  const pendingPurchases = await query<{
    id: number; local_id: string; data: string; type: string; status: string;
  }>(
    "SELECT * FROM `pending_purchases` WHERE `status` IN ('pending', 'failed') ORDER BY `created_at` ASC"
  );

  for (const po of pendingPurchases) {
    try {
      await execute("UPDATE `pending_purchases` SET `status` = 'syncing' WHERE `id` = ?", [po.id]);

      await hubFetch("/api/push/purchase", {
        method: "POST",
        body: JSON.stringify({
          data: po.data,
          local_id: po.local_id,
          till_id: context!.tillId,
          type: po.type,
          supplier_name: (po as Record<string, unknown>).supplier_name,
          grand_total: (po as Record<string, unknown>).grand_total,
        }),
      });

      await execute("UPDATE `pending_purchases` SET `status` = 'synced', `synced_at` = NOW() WHERE `id` = ?", [po.id]);
      purchases++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await execute(
        "UPDATE `pending_purchases` SET `status` = 'failed', `error` = ?, `retry_count` = `retry_count` + 1 WHERE `id` = ?",
        [msg, po.id]
      );
    }
  }

  return { invoices, purchases };
}

// ── Public API ────────────────────────────────────────────────────

export function initTillClient(hubUrl: string, tillId: string): void {
  context = { hubUrl: hubUrl.replace(/\/$/, ""), tillId };
  console.log(`[TillClient] Initialized — hub: ${context.hubUrl}, till: ${tillId}`);
}

/**
 * Run a full till sync cycle: pull from hub, apply deletions, push to hub.
 */
export async function runTillSync(): Promise<{
  pulled: number;
  deleted: number;
  pushed: { invoices: number; purchases: number };
}> {
  if (!context) throw new Error("Till client not initialized");

  const pulled = await pullFromHub();
  const deleted = await pullDeletionsFromHub();
  const pushed = await pushToHub();

  return { pulled, deleted, pushed };
}

/**
 * Check if the hub is reachable.
 */
export async function pingHub(): Promise<boolean> {
  try {
    const result = await hubFetch<{ status: string }>("/api/health");
    return result.status === "ok";
  } catch {
    return false;
  }
}
