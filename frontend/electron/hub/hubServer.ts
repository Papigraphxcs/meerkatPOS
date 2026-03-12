/**
 * Hub Local API Server
 *
 * Lightweight HTTP server exposed on the LAN so till clients can:
 *   - Pull master data (items, customers, suppliers, item groups, stock)
 *   - Push pending invoices / purchase orders
 *   - Query sync state
 *
 * Runs inside the Electron main process on the hub machine.
 * Uses Node's built-in http module — no Express dependency.
 *
 * Routes:
 *   GET  /api/pull/:table?since=<ISO>&limit=<N>&offset=<N>
 *   GET  /api/stock/:warehouse
 *   POST /api/push/invoice     { data, local_id, till_id }
 *   POST /api/push/purchase    { data, local_id, till_id, type }
 *   GET  /api/sync-state
 *   GET  /api/health
 */

import http from "http";
import { query, execute, upsertBatch } from "../database/dbService";
import { DEFAULT_HUB_PORT } from "./nodeConfig";
import crypto from "crypto";

let server: http.Server | null = null;

// ── Route helpers ─────────────────────────────────────────────────

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function error(res: http.ServerResponse, msg: string, status = 400): void {
  json(res, { error: msg }, status);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_BODY = 10 * 1024 * 1024; // 10 MB limit
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// Allowed pull tables (whitelist to prevent arbitrary table reads)
const PULL_TABLES: Record<string, { primaryKey: string; modifiedCol?: string }> = {
  items: { primaryKey: "item_code", modifiedCol: "modified" },
  item_groups: { primaryKey: "name", modifiedCol: "modified" },
  customers: { primaryKey: "name", modifiedCol: "modified" },
  suppliers: { primaryKey: "name", modifiedCol: "modified" },
  pos_profile_cache: { primaryKey: "name" },
  item_tax_cache: { primaryKey: "cache_key" },
};

// ── Request Router ────────────────────────────────────────────────

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method?.toUpperCase();

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Till-Id",
    });
    res.end();
    return;
  }

  try {
    // GET /api/health
    if (method === "GET" && path === "/api/health") {
      json(res, { status: "ok", role: "hub", timestamp: new Date().toISOString() });
      return;
    }

    // GET /api/sync-state
    if (method === "GET" && path === "/api/sync-state") {
      const rows = await query<{ key: string; value: string }>(
        "SELECT `key`, `value` FROM `sync_meta`"
      );
      const meta: Record<string, string> = {};
      for (const r of rows) meta[r.key] = r.value;
      json(res, meta);
      return;
    }

    // GET /api/pull/:table
    const pullMatch = path.match(/^\/api\/pull\/([a-z_]+)$/);
    if (method === "GET" && pullMatch) {
      const table = pullMatch[1];
      const config = PULL_TABLES[table];
      if (!config) {
        error(res, `Unknown table: ${table}`, 404);
        return;
      }

      const since = url.searchParams.get("since");
      const limit = Math.min(Number(url.searchParams.get("limit")) || 500, 2000);
      const offset = Number(url.searchParams.get("offset")) || 0;

      let sql = `SELECT * FROM \`${table}\``;
      const params: unknown[] = [];

      if (since && config.modifiedCol) {
        sql += ` WHERE \`${config.modifiedCol}\` > ?`;
        params.push(since);
      }

      if (config.modifiedCol) {
        sql += ` ORDER BY \`${config.modifiedCol}\` ASC`;
      }

      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const rows = await query(sql, params);
      json(res, { data: rows, count: rows.length });
      return;
    }

    // GET /api/stock/:warehouse
    const stockMatch = path.match(/^\/api\/stock\/(.+)$/);
    if (method === "GET" && stockMatch) {
      const warehouse = decodeURIComponent(stockMatch[1]);
      const rows = await query(
        "SELECT `item_code`, `actual_qty`, `updated_at` FROM `stock_cache` WHERE `warehouse` = ?",
        [warehouse]
      );
      json(res, { data: rows });
      return;
    }

    // GET /api/deletions?since=<ISO>
    if (method === "GET" && path === "/api/deletions") {
      const since = url.searchParams.get("since");
      let sql = "SELECT * FROM `deletion_log`";
      const params: unknown[] = [];
      if (since) {
        sql += " WHERE `deleted_at` > ?";
        params.push(since);
      }
      sql += " ORDER BY `deleted_at` ASC LIMIT 2000";
      const rows = await query(sql, params);
      json(res, { data: rows });
      return;
    }

    // POST /api/push/invoice
    if (method === "POST" && path === "/api/push/invoice") {
      const body = JSON.parse(await readBody(req));
      const localId = body.local_id || crypto.randomUUID();
      const tillId = body.till_id || req.headers["x-till-id"] || "unknown";

      await execute(
        `INSERT INTO \`pending_invoices\` (\`local_id\`, \`data\`, \`status\`, \`customer_name\`, \`grand_total\`)
         VALUES (?, ?, 'pending', ?, ?)
         ON DUPLICATE KEY UPDATE \`data\` = VALUES(\`data\`), \`status\` = 'pending'`,
        [
          localId,
          typeof body.data === "string" ? body.data : JSON.stringify(body.data),
          body.customer_name || null,
          body.grand_total || 0,
        ]
      );

      json(res, { success: true, local_id: localId, till_id: tillId }, 201);
      return;
    }

    // POST /api/push/purchase
    if (method === "POST" && path === "/api/push/purchase") {
      const body = JSON.parse(await readBody(req));
      const localId = body.local_id || crypto.randomUUID();
      const type = body.type || "purchase_order";

      await execute(
        `INSERT INTO \`pending_purchases\` (\`local_id\`, \`type\`, \`data\`, \`status\`, \`supplier_name\`, \`grand_total\`)
         VALUES (?, ?, ?, 'pending', ?, ?)
         ON DUPLICATE KEY UPDATE \`data\` = VALUES(\`data\`), \`status\` = 'pending'`,
        [
          localId,
          type,
          typeof body.data === "string" ? body.data : JSON.stringify(body.data),
          body.supplier_name || null,
          body.grand_total || 0,
        ]
      );

      json(res, { success: true, local_id: localId }, 201);
      return;
    }

    // Not found
    error(res, "Not found", 404);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[HubAPI] Error:", msg);
    error(res, msg, 500);
  }
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Start the hub API server on the given port.
 * Call this only when the node role is "hub".
 */
export function startHubServer(port = DEFAULT_HUB_PORT): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve();
      return;
    }

    server = http.createServer(handleRequest);

    server.on("error", (err) => {
      console.error("[HubAPI] Server error:", err.message);
      reject(err);
    });

    server.listen(port, "0.0.0.0", () => {
      console.log(`[HubAPI] Listening on 0.0.0.0:${port}`);
      resolve();
    });
  });
}

export function stopHubServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => {
      server = null;
      console.log("[HubAPI] Server stopped");
      resolve();
    });
  });
}

export function isHubRunning(): boolean {
  return server !== null && server.listening;
}
