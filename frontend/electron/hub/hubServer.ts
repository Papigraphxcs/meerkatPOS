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
import { query, execute, upsertBatch, getMeta, setMeta } from "../database/dbService";
import { DEFAULT_HUB_PORT } from "./nodeConfig";
import crypto from "crypto";
import { createLogger } from "../logger";

const log = createLogger("HubAPI");

let server: http.Server | null = null;
let hubSecret: string | null = null;

// ── Auth helpers ──────────────────────────────────────────────────

async function getOrCreateHubSecret(): Promise<string> {
  if (hubSecret) return hubSecret;
  const existing = await getMeta("hub_api_secret");
  if (existing) {
    hubSecret = existing;
    return existing;
  }
  const secret = crypto.randomBytes(32).toString("hex");
  await setMeta("hub_api_secret", secret);
  hubSecret = secret;
  return secret;
}

function isAuthorized(req: http.IncomingMessage): boolean {
  if (!hubSecret) return true; // Not yet initialized — allow health check
  const auth = req.headers["authorization"] || "";
  if (auth.startsWith("Bearer ")) {
    return crypto.timingSafeEqual(
      Buffer.from(auth.slice(7)),
      Buffer.from(hubSecret)
    );
  }
  return false;
}

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
  // Lookup tables
  companies: { primaryKey: "name", modifiedCol: "modified" },
  countries: { primaryKey: "name", modifiedCol: "modified" },
  currencies: { primaryKey: "name", modifiedCol: "modified" },
  uom: { primaryKey: "name", modifiedCol: "modified" },
  brands: { primaryKey: "name", modifiedCol: "modified" },
  industries: { primaryKey: "name", modifiedCol: "modified" },
  modes_of_payment: { primaryKey: "name", modifiedCol: "modified" },
  // Company-based master data
  cost_centers: { primaryKey: "name", modifiedCol: "modified" },
  warehouses: { primaryKey: "name", modifiedCol: "modified" },
  accounts: { primaryKey: "name", modifiedCol: "modified" },
  price_lists: { primaryKey: "name", modifiedCol: "modified" },
  mode_of_payment_accounts: { primaryKey: "name", modifiedCol: "modified" },
  pos_profiles: { primaryKey: "name", modifiedCol: "modified" },
  pos_payment_methods: { primaryKey: "name", modifiedCol: "modified" },
  // Items & related
  items: { primaryKey: "item_code", modifiedCol: "modified" },
  item_groups: { primaryKey: "name", modifiedCol: "modified" },
  item_barcodes: { primaryKey: "name", modifiedCol: "modified" },
  uom_conversion_details: { primaryKey: "name", modifiedCol: "modified" },
  item_prices: { primaryKey: "name", modifiedCol: "modified" },
  item_taxes: { primaryKey: "name", modifiedCol: "modified" },
  item_vendors: { primaryKey: "name", modifiedCol: "modified" },
  item_reorder_levels: { primaryKey: "name", modifiedCol: "modified" },
  // Tax templates
  item_tax_templates: { primaryKey: "name", modifiedCol: "modified" },
  item_tax_template_details: { primaryKey: "name", modifiedCol: "modified" },
  sales_taxes_templates: { primaryKey: "name", modifiedCol: "modified" },
  sales_taxes_charges: { primaryKey: "name", modifiedCol: "modified" },
  // Pricing rules
  pricing_rules: { primaryKey: "name", modifiedCol: "modified" },
  pricing_rule_item_codes: { primaryKey: "name", modifiedCol: "modified" },
  pricing_rule_item_groups: { primaryKey: "name", modifiedCol: "modified" },
  pricing_rule_brands: { primaryKey: "name", modifiedCol: "modified" },
  // Parties
  customers: { primaryKey: "name", modifiedCol: "modified" },
  suppliers: { primaryKey: "name", modifiedCol: "modified" },
  // Stock
  bins: { primaryKey: "name", modifiedCol: "modified" },
  // POS users (offline auth)
  pos_users: { primaryKey: "name", modifiedCol: "modified" },
  // Cache tables
  pos_profile_cache: { primaryKey: "name" },
  item_tax_cache: { primaryKey: "cache_key" },
  stock_cache: { primaryKey: "cache_key" },
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
    // GET /api/health (public — used for discovery)
    if (method === "GET" && path === "/api/health") {
      json(res, { status: "ok", role: "hub", timestamp: new Date().toISOString() });
      return;
    }

    // All other routes require authorization
    if (!isAuthorized(req)) {
      error(res, "Unauthorized", 401);
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

    // POST /api/push/expense
    if (method === "POST" && path === "/api/push/expense") {
      const body = JSON.parse(await readBody(req));
      const localId = body.local_id || crypto.randomUUID();

      await execute(
        `INSERT INTO \`expenses\`
         (\`local_id\`, \`expense_type\`, \`amount\`, \`description\`, \`posting_date\`,
          \`company\`, \`cost_center\`, \`mode_of_payment\`, \`user\`,
          \`pos_opening_shift_local_id\`, \`sync_status\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
         ON DUPLICATE KEY UPDATE \`amount\` = VALUES(\`amount\`), \`sync_status\` = 'pending'`,
        [
          localId, body.expense_type, body.amount || 0,
          body.description || null, body.posting_date || null,
          body.company || null, body.cost_center || null,
          body.mode_of_payment || null, body.user || null,
          body.pos_opening_shift_local_id || null,
        ]
      );

      json(res, { success: true, local_id: localId }, 201);
      return;
    }

    // POST /api/push/bank-drop
    if (method === "POST" && path === "/api/push/bank-drop") {
      const body = JSON.parse(await readBody(req));
      const localId = body.local_id || crypto.randomUUID();

      await execute(
        `INSERT INTO \`bank_drops\`
         (\`local_id\`, \`amount\`, \`description\`, \`posting_date\`,
          \`company\`, \`mode_of_payment\`, \`user\`,
          \`pos_opening_shift_local_id\`, \`sync_status\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
         ON DUPLICATE KEY UPDATE \`amount\` = VALUES(\`amount\`), \`sync_status\` = 'pending'`,
        [
          localId, body.amount || 0, body.description || null,
          body.posting_date || null, body.company || null,
          body.mode_of_payment || null, body.user || null,
          body.pos_opening_shift_local_id || null,
        ]
      );

      json(res, { success: true, local_id: localId }, 201);
      return;
    }

    // POST /api/push/stock-adjustment
    if (method === "POST" && path === "/api/push/stock-adjustment") {
      const body = JSON.parse(await readBody(req));
      const localId = body.local_id || crypto.randomUUID();

      await execute(
        `INSERT INTO \`stock_adjustments\`
         (\`local_id\`, \`item_code\`, \`warehouse\`, \`qty\`, \`adjustment_type\`,
          \`reason\`, \`posting_date\`, \`user\`, \`sync_status\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
         ON DUPLICATE KEY UPDATE \`qty\` = VALUES(\`qty\`), \`sync_status\` = 'pending'`,
        [
          localId, body.item_code, body.warehouse, body.qty || 0,
          body.adjustment_type || "increase", body.reason || null,
          body.posting_date || null, body.user || null,
        ]
      );

      json(res, { success: true, local_id: localId }, 201);
      return;
    }

    // Not found
    error(res, "Not found", 404);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    log.error("Request error", msg);
    error(res, msg, 500);
  }
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Start the hub API server on the given port.
 * Call this only when the node role is "hub".
 */
export function startHubServer(port = DEFAULT_HUB_PORT): Promise<void> {
  return new Promise(async (resolve, reject) => {
    if (server) {
      resolve();
      return;
    }

    // Initialize the shared secret for till auth
    await getOrCreateHubSecret();

    server = http.createServer(handleRequest);

    server.on("error", (err) => {
      log.error("Server error", err.message);
      reject(err);
    });

    server.listen(port, "0.0.0.0", () => {
      log.info(`Listening on 0.0.0.0:${port}`);
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
      log.info("Server stopped");
      resolve();
    });
  });
}

export function isHubRunning(): boolean {
  return server !== null && server.listening;
}

/**
 * Get the hub API secret for sharing with till clients during setup.
 */
export async function getHubApiSecret(): Promise<string> {
  return getOrCreateHubSecret();
}
