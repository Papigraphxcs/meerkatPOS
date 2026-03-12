/**
 * IPC handlers for database operations.
 * Registered in Electron main process, called from renderer via preload bridge.
 *
 * Each handler maps to a "db:*" IPC channel.
 * The renderer never touches MariaDB directly — all access goes through here.
 */

import { ipcMain } from "electron";
import {
  query, queryOne, execute, upsertBatch, getMeta, setMeta,
  testConnection, initDatabase, getConfig,
  type DbConfig,
} from "./dbService";

export function registerDbHandlers(): void {

  // ── Settings ──────────────────────────────────────────────────

  ipcMain.handle("db:get-setting", async (_e, key: string) => {
    const row = await queryOne<{ value: string }>(
      "SELECT `value` FROM `app_settings` WHERE `key` = ?", [key]
    );
    return row?.value ?? null;
  });

  ipcMain.handle("db:set-setting", async (_e, key: string, value: string, category?: string) => {
    await execute(
      `INSERT INTO \`app_settings\` (\`key\`, \`value\`, \`category\`)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), \`category\` = VALUES(\`category\`)`,
      [key, value, category || "general"]
    );
    return true;
  });

  ipcMain.handle("db:get-settings-by-category", async (_e, category: string) => {
    return query("SELECT `key`, `value` FROM `app_settings` WHERE `category` = ?", [category]);
  });

  ipcMain.handle("db:get-all-settings", async () => {
    return query("SELECT `key`, `value`, `category` FROM `app_settings` ORDER BY `category`, `key`");
  });

  // ── Database Config ───────────────────────────────────────────

  ipcMain.handle("db:test-connection", async (_e, config: Partial<DbConfig>) => {
    return testConnection(config);
  });

  ipcMain.handle("db:get-config", () => {
    const cfg = getConfig();
    // Don't expose password to renderer
    return { ...cfg, password: cfg.password ? "****" : "" };
  });

  ipcMain.handle("db:reinit", async (_e, config: Partial<DbConfig>) => {
    try {
      await initDatabase(config);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Items ─────────────────────────────────────────────────────

  ipcMain.handle("db:get-items", async (_e, opts?: {
    search?: string; group?: string; limit?: number; offset?: number;
  }) => {
    let sql = "SELECT * FROM `items` WHERE `disabled` = 0";
    const params: unknown[] = [];

    if (opts?.group && opts.group !== "All Item Groups") {
      sql += " AND `item_group` = ?";
      params.push(opts.group);
    }
    if (opts?.search) {
      sql += " AND (`item_code` LIKE ? OR `item_name` LIKE ? OR `barcode` LIKE ? OR `description` LIKE ?)";
      const like = `%${opts.search}%`;
      params.push(like, like, like, like);
    }
    sql += " ORDER BY `item_name` ASC";
    if (opts?.limit) {
      sql += " LIMIT ?";
      params.push(opts.limit);
      if (opts?.offset) {
        sql += " OFFSET ?";
        params.push(opts.offset);
      }
    }
    return query(sql, params);
  });

  ipcMain.handle("db:get-item", async (_e, itemCode: string) => {
    return queryOne("SELECT * FROM `items` WHERE `item_code` = ?", [itemCode]);
  });

  ipcMain.handle("db:upsert-items", async (_e, rows: Record<string, unknown>[]) => {
    return upsertBatch("items", rows, "item_code");
  });

  ipcMain.handle("db:count-items", async () => {
    const row = await queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM `items` WHERE `disabled` = 0");
    return row?.cnt ?? 0;
  });

  ipcMain.handle("db:clear-items", async () => {
    await execute("DELETE FROM `items`");
    return true;
  });

  // ── Item Groups ───────────────────────────────────────────────

  ipcMain.handle("db:get-item-groups", async () => {
    return query("SELECT * FROM `item_groups` ORDER BY `name`");
  });

  ipcMain.handle("db:upsert-item-groups", async (_e, rows: Record<string, unknown>[]) => {
    return upsertBatch("item_groups", rows, "name");
  });

  // ── Customers ─────────────────────────────────────────────────

  ipcMain.handle("db:get-customers", async (_e, opts?: { search?: string; limit?: number }) => {
    let sql = "SELECT * FROM `customers` WHERE `disabled` = 0";
    const params: unknown[] = [];

    if (opts?.search) {
      sql += " AND (`name` LIKE ? OR `customer_name` LIKE ? OR `mobile_no` LIKE ? OR `email_id` LIKE ?)";
      const like = `%${opts.search}%`;
      params.push(like, like, like, like);
    }
    sql += " ORDER BY `customer_name` ASC";
    if (opts?.limit) {
      sql += " LIMIT ?";
      params.push(opts.limit);
    }
    return query(sql, params);
  });

  ipcMain.handle("db:get-customer", async (_e, name: string) => {
    return queryOne("SELECT * FROM `customers` WHERE `name` = ?", [name]);
  });

  ipcMain.handle("db:upsert-customers", async (_e, rows: Record<string, unknown>[]) => {
    return upsertBatch("customers", rows, "name");
  });

  ipcMain.handle("db:add-local-customer", async (_e, customer: Record<string, unknown>) => {
    const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await execute(
      `INSERT INTO \`customers\` (\`name\`, \`customer_name\`, \`customer_group\`, \`territory\`,
        \`mobile_no\`, \`email_id\`, \`default_currency\`, \`is_local\`, \`local_id\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        localId, customer.customer_name, customer.customer_group || null,
        customer.territory || null, customer.mobile_no || null,
        customer.email_id || null, customer.default_currency || null, localId,
      ]
    );
    return { name: localId, local_id: localId };
  });

  // ── Suppliers ─────────────────────────────────────────────────

  ipcMain.handle("db:get-suppliers", async (_e, opts?: { search?: string; limit?: number }) => {
    let sql = "SELECT * FROM `suppliers`";
    const params: unknown[] = [];

    if (opts?.search) {
      sql += " WHERE (`name` LIKE ? OR `supplier_name` LIKE ? OR `mobile_no` LIKE ?)";
      const like = `%${opts.search}%`;
      params.push(like, like, like);
    }
    sql += " ORDER BY `supplier_name` ASC";
    if (opts?.limit) {
      sql += " LIMIT ?";
      params.push(opts.limit);
    }
    return query(sql, params);
  });

  ipcMain.handle("db:upsert-suppliers", async (_e, rows: Record<string, unknown>[]) => {
    return upsertBatch("suppliers", rows, "name");
  });

  // ── Stock Cache ───────────────────────────────────────────────

  ipcMain.handle("db:get-stock", async (_e, warehouse: string, itemCode?: string) => {
    if (itemCode) {
      return queryOne(
        "SELECT * FROM `stock_cache` WHERE `warehouse` = ? AND `item_code` = ?",
        [warehouse, itemCode]
      );
    }
    return query("SELECT * FROM `stock_cache` WHERE `warehouse` = ?", [warehouse]);
  });

  ipcMain.handle("db:upsert-stock", async (_e, warehouse: string, entries: { item_code: string; actual_qty: number }[]) => {
    const rows = entries.map((e) => ({
      cache_key: `${warehouse}::${e.item_code}`,
      warehouse,
      item_code: e.item_code,
      actual_qty: e.actual_qty,
    }));
    return upsertBatch("stock_cache", rows, "cache_key");
  });

  ipcMain.handle("db:update-stock-qty", async (_e, warehouse: string, itemCode: string, qty: number) => {
    await execute(
      `INSERT INTO \`stock_cache\` (\`cache_key\`, \`warehouse\`, \`item_code\`, \`actual_qty\`)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE \`actual_qty\` = ?`,
      [`${warehouse}::${itemCode}`, warehouse, itemCode, qty, qty]
    );
    return true;
  });

  // ── Pending Invoices ──────────────────────────────────────────

  ipcMain.handle("db:add-pending-invoice", async (_e, record: {
    data: unknown; customer_name?: string; grand_total?: number;
  }) => {
    const localId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const result = await execute(
      `INSERT INTO \`pending_invoices\` (\`local_id\`, \`data\`, \`status\`, \`customer_name\`, \`grand_total\`)
       VALUES (?, ?, 'pending', ?, ?)`,
      [localId, JSON.stringify(record.data), record.customer_name || null, record.grand_total || 0]
    );
    return { id: result.insertId, local_id: localId };
  });

  ipcMain.handle("db:get-pending-invoices", async (_e, status?: string) => {
    if (status) {
      return query("SELECT * FROM `pending_invoices` WHERE `status` = ? ORDER BY `created_at`", [status]);
    }
    return query("SELECT * FROM `pending_invoices` ORDER BY `created_at`");
  });

  ipcMain.handle("db:update-pending-invoice", async (_e, id: number, updates: Record<string, unknown>) => {
    const setClauses = Object.keys(updates).map((k) => `\`${k}\` = ?`).join(", ");
    const params = [...Object.values(updates), id];
    await execute(`UPDATE \`pending_invoices\` SET ${setClauses} WHERE \`id\` = ?`, params);
    return true;
  });

  ipcMain.handle("db:delete-pending-invoice", async (_e, id: number) => {
    await execute("DELETE FROM `pending_invoices` WHERE `id` = ?", [id]);
    return true;
  });

  ipcMain.handle("db:count-pending-invoices", async () => {
    const row = await queryOne<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM `pending_invoices` WHERE `status` IN ('pending','failed')"
    );
    return row?.cnt ?? 0;
  });

  // ── Pending Purchases ─────────────────────────────────────────

  ipcMain.handle("db:add-pending-purchase", async (_e, record: {
    type: string; data: unknown; supplier_name?: string; grand_total?: number;
  }) => {
    const localId = `pur_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const result = await execute(
      `INSERT INTO \`pending_purchases\` (\`local_id\`, \`type\`, \`data\`, \`status\`, \`supplier_name\`, \`grand_total\`)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
      [localId, record.type, JSON.stringify(record.data), record.supplier_name || null, record.grand_total || 0]
    );
    return { id: result.insertId, local_id: localId };
  });

  ipcMain.handle("db:get-pending-purchases", async (_e, opts?: { type?: string; status?: string }) => {
    let sql = "SELECT * FROM `pending_purchases`";
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts?.type) { conditions.push("`type` = ?"); params.push(opts.type); }
    if (opts?.status) { conditions.push("`status` = ?"); params.push(opts.status); }
    if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
    sql += " ORDER BY `created_at`";
    return query(sql, params);
  });

  ipcMain.handle("db:update-pending-purchase", async (_e, id: number, updates: Record<string, unknown>) => {
    const setClauses = Object.keys(updates).map((k) => `\`${k}\` = ?`).join(", ");
    const params = [...Object.values(updates), id];
    await execute(`UPDATE \`pending_purchases\` SET ${setClauses} WHERE \`id\` = ?`, params);
    return true;
  });

  ipcMain.handle("db:delete-pending-purchase", async (_e, id: number) => {
    await execute("DELETE FROM `pending_purchases` WHERE `id` = ?", [id]);
    return true;
  });

  // ── Sync ID Map ───────────────────────────────────────────────

  ipcMain.handle("db:add-sync-id", async (_e, localId: string, serverName: string, doctype: string) => {
    await execute(
      `INSERT INTO \`sync_id_map\` (\`local_id\`, \`server_name\`, \`doctype\`)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE \`server_name\` = VALUES(\`server_name\`)`,
      [localId, serverName, doctype]
    );
    return true;
  });

  ipcMain.handle("db:get-server-name", async (_e, localId: string) => {
    const row = await queryOne<{ server_name: string }>(
      "SELECT `server_name` FROM `sync_id_map` WHERE `local_id` = ?", [localId]
    );
    return row?.server_name ?? null;
  });

  // ── Sync Metadata ─────────────────────────────────────────────

  ipcMain.handle("db:get-meta", async (_e, key: string) => getMeta(key));
  ipcMain.handle("db:set-meta", async (_e, key: string, value: string) => {
    await setMeta(key, value);
    return true;
  });

  // ── POS Profile Cache ─────────────────────────────────────────

  ipcMain.handle("db:cache-pos-data", async (_e, name: string, data: unknown) => {
    await execute(
      `INSERT INTO \`pos_profile_cache\` (\`name\`, \`data\`)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE \`data\` = VALUES(\`data\`)`,
      [name, JSON.stringify(data)]
    );
    return true;
  });

  ipcMain.handle("db:get-cached-pos-data", async (_e, name: string) => {
    const row = await queryOne<{ data: string }>(
      "SELECT `data` FROM `pos_profile_cache` WHERE `name` = ?", [name]
    );
    return row ? JSON.parse(row.data) : null;
  });

  // ── Item Tax Cache ────────────────────────────────────────────

  ipcMain.handle("db:cache-item-tax", async (_e, itemCode: string, company: string, data: {
    item_tax_template: string | null; item_tax_map: Record<string, number>;
  }) => {
    await execute(
      `INSERT INTO \`item_tax_cache\` (\`cache_key\`, \`item_code\`, \`company\`, \`item_tax_template\`, \`item_tax_map\`)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE \`item_tax_template\` = VALUES(\`item_tax_template\`), \`item_tax_map\` = VALUES(\`item_tax_map\`)`,
      [`${company}::${itemCode}`, itemCode, company, data.item_tax_template, JSON.stringify(data.item_tax_map)]
    );
    return true;
  });

  ipcMain.handle("db:get-cached-item-tax", async (_e, itemCode: string, company: string) => {
    const row = await queryOne<{ item_tax_template: string; item_tax_map: string }>(
      "SELECT `item_tax_template`, `item_tax_map` FROM `item_tax_cache` WHERE `cache_key` = ?",
      [`${company}::${itemCode}`]
    );
    if (!row) return null;
    return {
      item_tax_template: row.item_tax_template,
      item_tax_map: row.item_tax_map ? JSON.parse(row.item_tax_map) : {},
    };
  });

  // ── Bulk Clear ────────────────────────────────────────────────

  ipcMain.handle("db:clear-all-data", async () => {
    const tables = ["items", "item_groups", "customers", "suppliers", "stock_cache",
      "sync_meta", "pos_profile_cache", "item_tax_cache", "sync_id_map"];
    for (const t of tables) {
      await execute(`DELETE FROM \`${t}\``);
    }
    return true;
  });

  ipcMain.handle("db:clear-pending-data", async () => {
    await execute("DELETE FROM `pending_invoices`");
    await execute("DELETE FROM `pending_purchases`");
    return true;
  });

  console.log("[DB IPC] All handlers registered");
}
