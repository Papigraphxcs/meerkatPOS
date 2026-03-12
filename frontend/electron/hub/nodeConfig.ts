/**
 * Hub-Spoke Architecture — Node Role Configuration
 *
 * Each X POS instance runs in one of two roles:
 *
 *   HUB  — Single machine per shop/warehouse. Syncs bidirectionally with
 *           ERPNext and exposes a local HTTP API on the LAN for till clients.
 *           Owns the local MariaDB database.
 *
 *   TILL — Multiple per shop. Connects to the hub's local API instead of
 *           ERPNext. Does NOT talk to ERPNext directly. Pushes invoices/POs
 *           to the hub, which syncs them upstream.
 *
 * Role is determined at first launch (or from app_settings) and persists.
 */

export type NodeRole = "hub" | "till";

export interface HubConfig {
  role: "hub";
  /** ERPNext server URL for upstream sync */
  erpnextUrl: string;
  /** Port on which the hub exposes its local API (default 6789) */
  hubApiPort: number;
}

export interface TillConfig {
  role: "till";
  /** LAN address of the hub (e.g. http://192.168.1.100:6789) */
  hubUrl: string;
  /** Unique till identifier (e.g. "TILL-01") */
  tillId: string;
}

export type NodeConfig = HubConfig | TillConfig;

export const DEFAULT_HUB_PORT = 6789;

/**
 * Default config used before the user configures the role.
 * Starts as hub pointing to localhost ERPNext.
 */
export function getDefaultConfig(): HubConfig {
  return {
    role: "hub",
    erpnextUrl: process.env.XPOS_SERVER_URL || "http://localhost:8000",
    hubApiPort: DEFAULT_HUB_PORT,
  };
}
