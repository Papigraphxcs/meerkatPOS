/**
 * X POS Local MariaDB Database Service
 *
 * Runs in the Electron main process. Manages the connection pool
 * to a local MariaDB instance and provides typed query helpers.
 *
 * Replaces IndexedDB (Dexie) for the Electron desktop app while
 * the PWA/browser version continues to use IndexedDB.
 */

import mysql, { type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { app } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Types ─────────────────────────────────────────────────────────

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const DEFAULT_CONFIG: DbConfig = {
  host: "127.0.0.1",
  port: 3306,
  user: "xpos",
  password: "xpos",
  database: "xpos_local",
};

// ── State ─────────────────────────────────────────────────────────

let pool: Pool | null = null;
let currentConfig: DbConfig = { ...DEFAULT_CONFIG };

// ── Connection ────────────────────────────────────────────────────

export function getPool(): Pool {
  if (!pool) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return pool;
}

export async function initDatabase(config?: Partial<DbConfig>): Promise<void> {
  if (config) {
    currentConfig = { ...currentConfig, ...config };
  }

  // First connect without database to ensure it exists
  const rootPool = mysql.createPool({
    host: currentConfig.host,
    port: currentConfig.port,
    user: currentConfig.user,
    password: currentConfig.password,
    waitForConnections: true,
    connectionLimit: 2,
  });

  try {
    await rootPool.execute(
      `CREATE DATABASE IF NOT EXISTS \`${currentConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await rootPool.end();
  }

  // Now connect to the actual database
  pool = mysql.createPool({
    host: currentConfig.host,
    port: currentConfig.port,
    user: currentConfig.user,
    password: currentConfig.password,
    database: currentConfig.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "+00:00",
  });

  // Test connection
  const conn = await pool.getConnection();
  conn.release();

  // Run schema migrations
  await runSchema();

  console.log("[DB] Connected to MariaDB:", currentConfig.host, currentConfig.database);
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log("[DB] Connection pool closed");
  }
}

export function getConfig(): DbConfig {
  return { ...currentConfig };
}

// ── Schema ────────────────────────────────────────────────────────

async function runSchema(): Promise<void> {
  // In packaged app, schema.sql is in extraResources (process.resourcesPath)
  // In dev, it's relative to the compiled JS in dist-electron/
  const candidates = [
    path.join(process.resourcesPath || "", "schema.sql"),
    path.join(__dirname, "schema.sql"),
    path.join(process.cwd(), "electron", "database", "schema.sql"),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      await executeSchemaFile(candidate);
      return;
    }
  }

  console.warn("[DB] schema.sql not found, skipping migrations");
}

async function executeSchemaFile(filePath: string): Promise<void> {
  const sql = fs.readFileSync(filePath, "utf-8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  const db = getPool();
  for (const stmt of statements) {
    try {
      await db.execute(stmt);
    } catch (err) {
      // Ignore "table already exists" errors during migration
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("already exists")) {
        console.error("[DB] Schema error:", msg, "\nStatement:", stmt.substring(0, 100));
      }
    }
  }
  console.log("[DB] Schema applied");
}

// ── Query Helpers ─────────────────────────────────────────────────

/** Select multiple rows. */
export async function query<T = RowDataPacket>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const db = getPool();
  const [rows] = await db.execute<RowDataPacket[]>(sql, params as (string | number | null | Buffer)[]);
  return rows as T[];
}

/** Select a single row or null. */
export async function queryOne<T = RowDataPacket>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

/** Insert/Update/Delete — returns affected rows and insertId. */
export async function execute(
  sql: string,
  params: unknown[] = []
): Promise<{ affectedRows: number; insertId: number }> {
  const db = getPool();
  const [result] = await db.execute<ResultSetHeader>(sql, params as (string | number | null | Buffer)[]);
  return { affectedRows: result.affectedRows, insertId: result.insertId };
}

/** Run a callback inside a transaction. */
export async function transaction<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const db = getPool();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Bulk upsert rows into a table. Uses INSERT ... ON DUPLICATE KEY UPDATE. */
export async function upsertBatch(
  table: string,
  rows: Record<string, unknown>[],
  primaryKey: string
): Promise<number> {
  if (rows.length === 0) return 0;

  const columns = Object.keys(rows[0]);
  const placeholders = columns.map(() => "?").join(", ");
  const updateCols = columns
    .filter((c) => c !== primaryKey)
    .map((c) => `\`${c}\` = VALUES(\`${c}\`)`)
    .join(", ");

  const db = getPool();
  let affected = 0;

  // Process in chunks of 100 to avoid packet size limits
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const valuesSql = chunk.map(() => `(${placeholders})`).join(", ");
    const flatParams = chunk.flatMap((row) => columns.map((c) => row[c] ?? null));

    const sql = `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(", ")})
      VALUES ${valuesSql}
      ON DUPLICATE KEY UPDATE ${updateCols}`;

    const result = await db.execute<ResultSetHeader>(sql, flatParams as (string | number | null | Buffer)[]);
    affected += result[0].affectedRows;
  }

  return affected;
}

/** Get a meta value from the sync_meta table. */
export async function getMeta(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>(
    "SELECT `value` FROM `sync_meta` WHERE `key` = ?",
    [key]
  );
  return row?.value ?? null;
}

/** Set a meta value in the sync_meta table. */
export async function setMeta(key: string, value: string): Promise<void> {
  await execute(
    `INSERT INTO \`sync_meta\` (\`key\`, \`value\`, \`updated_at\`)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), \`updated_at\` = NOW()`,
    [key, value]
  );
}

/** Test connection — returns true if the database is reachable. */
export async function testConnection(config: Partial<DbConfig>): Promise<{ success: boolean; error?: string }> {
  const testConfig = { ...currentConfig, ...config };
  let testPool: Pool | null = null;
  try {
    testPool = mysql.createPool({
      host: testConfig.host,
      port: testConfig.port,
      user: testConfig.user,
      password: testConfig.password,
      connectionLimit: 1,
    });
    const conn = await testPool.getConnection();
    conn.release();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (testPool) await testPool.end();
  }
}
