-- X POS Local MariaDB Schema
-- This file runs on first launch and on every app start (idempotent).
-- All tables use CREATE TABLE IF NOT EXISTS.

-- ── Sync Metadata ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `sync_meta` (
  `key` VARCHAR(255) NOT NULL PRIMARY KEY,
  `value` TEXT,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── App Settings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `app_settings` (
  `key` VARCHAR(255) NOT NULL PRIMARY KEY,
  `value` TEXT,
  `category` VARCHAR(100) DEFAULT 'general',
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Items (pulled from server) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS `items` (
  `item_code` VARCHAR(255) NOT NULL PRIMARY KEY,
  `item_name` VARCHAR(255) NOT NULL,
  `item_group` VARCHAR(255) DEFAULT NULL,
  `description` TEXT,
  `stock_uom` VARCHAR(50) DEFAULT NULL,
  `image` TEXT,
  `has_serial_no` TINYINT(1) DEFAULT 0,
  `has_batch_no` TINYINT(1) DEFAULT 0,
  `has_variants` TINYINT(1) DEFAULT 0,
  `variant_of` VARCHAR(255) DEFAULT NULL,
  `is_stock_item` TINYINT(1) DEFAULT 1,
  `disabled` TINYINT(1) DEFAULT 0,
  `standard_rate` DECIMAL(18,6) DEFAULT 0,
  `item_tax_template` VARCHAR(255) DEFAULT NULL,
  `barcode` VARCHAR(255) DEFAULT NULL,
  `modified` DATETIME DEFAULT NULL,
  `synced_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_item_name` (`item_name`),
  INDEX `idx_item_group` (`item_group`),
  INDEX `idx_barcode` (`barcode`),
  INDEX `idx_modified` (`modified`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Item Groups (pulled from server) ──────────────────────────────
CREATE TABLE IF NOT EXISTS `item_groups` (
  `name` VARCHAR(255) NOT NULL PRIMARY KEY,
  `parent_item_group` VARCHAR(255) DEFAULT NULL,
  `is_group` TINYINT(1) DEFAULT 0,
  `image` TEXT,
  `modified` DATETIME DEFAULT NULL,
  `synced_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Customers (pulled + created locally) ──────────────────────────
CREATE TABLE IF NOT EXISTS `customers` (
  `name` VARCHAR(255) NOT NULL PRIMARY KEY,
  `customer_name` VARCHAR(255) NOT NULL,
  `customer_group` VARCHAR(255) DEFAULT NULL,
  `territory` VARCHAR(255) DEFAULT NULL,
  `mobile_no` VARCHAR(50) DEFAULT NULL,
  `email_id` VARCHAR(255) DEFAULT NULL,
  `default_currency` VARCHAR(10) DEFAULT NULL,
  `loyalty_program` VARCHAR(255) DEFAULT NULL,
  `loyalty_points` INT DEFAULT 0,
  `disabled` TINYINT(1) DEFAULT 0,
  `modified` DATETIME DEFAULT NULL,
  `synced_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `is_local` TINYINT(1) DEFAULT 0,
  `local_id` VARCHAR(100) DEFAULT NULL,
  INDEX `idx_customer_name` (`customer_name`),
  INDEX `idx_mobile_no` (`mobile_no`),
  INDEX `idx_email_id` (`email_id`),
  INDEX `idx_local_id` (`local_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Suppliers (pulled from server) ────────────────────────────────
CREATE TABLE IF NOT EXISTS `suppliers` (
  `name` VARCHAR(255) NOT NULL PRIMARY KEY,
  `supplier_name` VARCHAR(255) NOT NULL,
  `supplier_group` VARCHAR(255) DEFAULT NULL,
  `supplier_type` VARCHAR(255) DEFAULT NULL,
  `default_currency` VARCHAR(10) DEFAULT NULL,
  `mobile_no` VARCHAR(50) DEFAULT NULL,
  `email_id` VARCHAR(255) DEFAULT NULL,
  `modified` DATETIME DEFAULT NULL,
  `synced_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_supplier_name` (`supplier_name`),
  INDEX `idx_mobile_no` (`mobile_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Stock Cache (pulled per warehouse) ────────────────────────────
CREATE TABLE IF NOT EXISTS `stock_cache` (
  `cache_key` VARCHAR(510) NOT NULL PRIMARY KEY,
  `warehouse` VARCHAR(255) NOT NULL,
  `item_code` VARCHAR(255) NOT NULL,
  `actual_qty` DECIMAL(18,6) DEFAULT 0,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_warehouse` (`warehouse`),
  INDEX `idx_item_code` (`item_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Pending Invoices (created locally, pushed to server) ──────────
CREATE TABLE IF NOT EXISTS `pending_invoices` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `local_id` VARCHAR(100) NOT NULL,
  `data` LONGTEXT NOT NULL,
  `status` ENUM('pending','syncing','synced','failed') DEFAULT 'pending',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `synced_at` DATETIME DEFAULT NULL,
  `error` TEXT,
  `retry_count` INT DEFAULT 0,
  `customer_name` VARCHAR(255) DEFAULT NULL,
  `grand_total` DECIMAL(18,6) DEFAULT 0,
  `server_name` VARCHAR(255) DEFAULT NULL,
  UNIQUE INDEX `idx_local_id` (`local_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Pending Purchases (created locally, pushed to server) ─────────
CREATE TABLE IF NOT EXISTS `pending_purchases` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `local_id` VARCHAR(100) NOT NULL,
  `type` ENUM('purchase_order','purchase_receipt','purchase_invoice') NOT NULL,
  `data` LONGTEXT NOT NULL,
  `status` ENUM('pending','syncing','synced','failed') DEFAULT 'pending',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `synced_at` DATETIME DEFAULT NULL,
  `error` TEXT,
  `retry_count` INT DEFAULT 0,
  `supplier_name` VARCHAR(255) DEFAULT NULL,
  `grand_total` DECIMAL(18,6) DEFAULT 0,
  `server_name` VARCHAR(255) DEFAULT NULL,
  UNIQUE INDEX `idx_local_id` (`local_id`),
  INDEX `idx_type` (`type`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Sync ID Map (local_id ↔ server_name) ─────────────────────────
CREATE TABLE IF NOT EXISTS `sync_id_map` (
  `local_id` VARCHAR(100) NOT NULL PRIMARY KEY,
  `server_name` VARCHAR(255) NOT NULL,
  `doctype` VARCHAR(255) NOT NULL,
  `synced_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_server_name` (`server_name`),
  INDEX `idx_doctype` (`doctype`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── POS Profile Cache ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `pos_profile_cache` (
  `name` VARCHAR(255) NOT NULL PRIMARY KEY,
  `data` LONGTEXT NOT NULL,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Item Tax Cache ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `item_tax_cache` (
  `cache_key` VARCHAR(510) NOT NULL PRIMARY KEY,
  `item_code` VARCHAR(255) NOT NULL,
  `company` VARCHAR(255) NOT NULL,
  `item_tax_template` VARCHAR(255) DEFAULT NULL,
  `item_tax_map` TEXT DEFAULT NULL,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_item_code` (`item_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Deletion Log (tracks records removed from ERPNext) ────────────
CREATE TABLE IF NOT EXISTS `deletion_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `table_name` VARCHAR(100) NOT NULL,
  `record_key` VARCHAR(255) NOT NULL,
  `doctype` VARCHAR(255) DEFAULT NULL,
  `deleted_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_table_name` (`table_name`),
  INDEX `idx_deleted_at` (`deleted_at`),
  UNIQUE INDEX `idx_table_record` (`table_name`, `record_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
