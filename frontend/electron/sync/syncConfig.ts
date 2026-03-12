/**
 * Sync configuration – defines which ERPNext doctypes are synced,
 * their pull order, batch size, and the custom field used for
 * local-ID ↔ server-ID mapping.
 *
 * Mirrors the .NET WinForms pattern:
 *   1. Pull master data tables first (in dependency order)
 *   2. Then push locally-created records to the server
 *   3. Validate local IDs via custom `xpos_local_id` field
 */

export interface SyncTableConfig {
  /** ERPNext doctype name */
  doctype: string;
  /** Human-readable label for UI */
  label: string;
  /** Frappe API method that returns paginated data for pull.
   *  Falls back to `frappe.client.get_list` if not specified. */
  pullMethod?: string;
  /** Frappe API method used to push local records.
   *  Only required for tables where the POS creates records. */
  pushMethod?: string;
  /** Fields to fetch during pull. `["*"]` = all fields. */
  fields: string[];
  /** Extra filters applied during pull (e.g. `{ disabled: 0 }`). */
  filters?: Record<string, unknown>;
  /** Order field for incremental pull (usually "modified"). */
  orderBy: string;
  /** Direction of pull */
  direction: "pull" | "push" | "both";
  /** IndexedDB store name (from idbService) for caching pulled data. */
  idbStore: string;
  /** Custom field on the ERPNext doctype that holds the local UUID.
   *  Used to prevent duplicate pushes and map local ↔ server IDs. */
  localIdField: string;
  /** If true, pull only records modified since last sync.
   *  If false, always pull full set (used for small lookup tables). */
  incremental: boolean;
  /** Number of records per batch (default 500). */
  batchSize: number;
  /** Pull priority – lower number = pulled first (dependency order). */
  pullOrder: number;
  /** Dependencies – other idbStore names that must be synced before this one. */
  dependsOn?: string[];
}

/**
 * Default sync configuration.
 * Pull order ensures master data is ready before transactional data.
 */
export const SYNC_TABLES: SyncTableConfig[] = [
  // ── Master Data (pull-only) ────────────────────────────────────
  {
    doctype: "Item",
    label: "Items",
    fields: [
      "name", "item_code", "item_name", "item_group", "description",
      "stock_uom", "image", "has_serial_no", "has_batch_no",
      "has_variants", "variant_of", "is_stock_item", "disabled",
      "standard_rate", "item_tax_template", "barcode",
    ],
    filters: { disabled: 0 },
    orderBy: "modified",
    direction: "pull",
    idbStore: "items",
    localIdField: "xpos_local_id",
    incremental: true,
    batchSize: 500,
    pullOrder: 10,
  },
  {
    doctype: "Item Group",
    label: "Item Groups",
    fields: ["name", "parent_item_group", "is_group", "image"],
    orderBy: "modified",
    direction: "pull",
    idbStore: "item_groups",
    localIdField: "xpos_local_id",
    incremental: false, // small table, always full pull
    batchSize: 500,
    pullOrder: 5,
  },
  {
    doctype: "Customer",
    label: "Customers",
    fields: [
      "name", "customer_name", "customer_group", "territory",
      "mobile_no", "email_id", "default_currency",
      "loyalty_program", "loyalty_points", "disabled",
    ],
    filters: { disabled: 0 },
    orderBy: "modified",
    direction: "both", // POS can create customers
    idbStore: "customers",
    localIdField: "xpos_local_id",
    incremental: true,
    batchSize: 500,
    pullOrder: 20,
  },
  {
    doctype: "Supplier",
    label: "Suppliers",
    fields: [
      "name", "supplier_name", "supplier_group", "supplier_type",
      "default_currency", "mobile_no", "email_id",
    ],
    orderBy: "modified",
    direction: "pull",
    idbStore: "suppliers",
    localIdField: "xpos_local_id",
    incremental: true,
    batchSize: 500,
    pullOrder: 25,
  },

  // ── Transactional (push-only from POS) ─────────────────────────
  {
    doctype: "POS Invoice",
    label: "POS Invoices",
    pushMethod: "xpos.api.invoices.create_invoice",
    fields: ["*"],
    orderBy: "creation",
    direction: "push",
    idbStore: "pending_invoices",
    localIdField: "xpos_local_id",
    incremental: false,
    batchSize: 50,
    pullOrder: 100,
  },
  {
    doctype: "Purchase Order",
    label: "Purchase Orders",
    pushMethod: "xpos.api.purchase.create_purchase_order",
    fields: ["*"],
    orderBy: "creation",
    direction: "push",
    idbStore: "pending_purchases",
    localIdField: "xpos_local_id",
    incremental: false,
    batchSize: 50,
    pullOrder: 110,
    dependsOn: ["suppliers", "items"],
    /** Note: idbStore uses snake_case to match MariaDB table names */
  },
];

/**
 * Default sync settings
 */
export const SYNC_DEFAULTS = {
  /** Interval between automatic sync cycles (ms). Default 5 minutes. */
  intervalMs: 5 * 60 * 1000,
  /** Max retries before marking a record as permanently failed. */
  maxRetries: 3,
  /** Grace period after going online before starting sync (ms). */
  onlineGracePeriodMs: 3_000,
};
