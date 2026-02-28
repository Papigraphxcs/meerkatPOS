// ─── Core POS Types ────────────────────────────────

export interface POSProfile {
  name: string;
  warehouse: string;
  currency: string;
  company: string;
  payments: POSPaymentMethod[];
  taxes_and_charges?: string;
  write_off_account?: string;
  write_off_cost_center?: string;
  selling_price_list?: string;
  customer?: string;
  // POS Awesome custom fields
  posa_allow_user_to_edit_rate?: boolean;
  posa_allow_user_to_edit_additional_discount?: boolean;
  posa_allow_user_to_edit_item_discount?: boolean;
  posa_display_items_in_stock?: boolean;
  posa_allow_partial_payment?: boolean;
  posa_allow_credit_sale?: boolean;
  posa_allow_return?: boolean;
  posa_allow_return_without_invoice?: boolean;
  posa_allow_sales_order?: boolean;
  posa_allow_delete?: boolean;
  posa_allow_print_last_invoice?: boolean;
  posa_display_additional_notes?: boolean;
  posa_display_authorization_code?: boolean;
  posa_allow_write_off_change?: boolean;
  posa_input_qty?: boolean;
  posa_display_item_code?: boolean;
  posa_allow_zero_rated_items?: boolean;
  posa_allow_print_draft_invoices?: boolean;
  posa_auto_set_batch?: boolean;
  posa_search_serial_no?: boolean;
  posa_tax_inclusive?: boolean;
  posa_use_percentage_discount?: boolean;
  posa_default_card_view?: boolean;
  posa_default_sales_order?: boolean;
  posa_enable_camera_scanning?: boolean;
  posa_camera_scan_type?: string;
  posa_language?: string;
  posa_enable_return_validity?: boolean;
  posa_return_validity_days?: number;
  posa_enable_cash_movement?: boolean;
  posa_allow_pos_expense?: boolean;
  posa_allow_cash_deposit?: boolean;
  posa_max_discount_allowed?: number;
  posa_fetch_coupon?: boolean;
  posa_hide_closing_shift?: boolean;
  posa_local_storage?: boolean;
  posa_force_server_items?: boolean;
  posa_cash_mode_of_payment?: string;
  use_customer_credit?: boolean;
  use_cashback?: boolean;
  posa_apply_customer_discount?: boolean;
  posa_show_template_items?: boolean;
  posa_hide_variants_items?: boolean;
  create_pos_invoice_instead_of_sales_invoice?: boolean;
  [key: string]: unknown;
}

export interface POSPaymentMethod {
  mode_of_payment: string;
  default?: boolean;
  amount?: number;
}

export interface Company {
  name: string;
  default_currency: string;
  company_name: string;
  [key: string]: unknown;
}

export interface StockSettings {
  allow_negative_stock?: boolean;
  [key: string]: unknown;
}

// ─── Shift Types ───────────────────────────────────

export interface POSOpeningShift {
  name: string;
  status: "Draft" | "Open" | "Closed" | "Cancelled";
  pos_profile: string;
  company: string;
  user: string;
  period_start_date: string;
  period_end_date?: string;
  posting_date: string;
  balance_details: POSOpeningShiftDetail[];
  pos_closing_shift?: string;
}

export interface POSOpeningShiftDetail {
  mode_of_payment: string;
  opening_amount: number;
}

export interface POSClosingShift {
  name: string;
  pos_opening_shift: string;
  pos_profile: string;
  company: string;
  user: string;
  period_start_date: string;
  period_end_date: string;
  posting_date: string;
  net_total: number;
  grand_total: number;
  total_quantity: number;
  payment_reconciliation: POSClosingShiftDetail[];
  taxes: POSClosingShiftTax[];
}

export interface POSClosingShiftDetail {
  mode_of_payment: string;
  expected_amount: number;
  closing_amount: number;
  difference: number;
  opening_amount?: number;
}

export interface POSClosingShiftTax {
  account_head: string;
  rate: number;
  amount: number;
}

// ─── Item Types ────────────────────────────────────

export interface POSItem {
  item_code: string;
  item_name: string;
  item_group?: string;
  description?: string;
  rate: number;
  uom: string;
  stock_uom: string;
  image?: string;
  actual_qty?: number;
  serial_no?: string;
  batch_no?: string;
  has_serial_no?: boolean;
  has_batch_no?: boolean;
  barcode?: string;
  item_tax_template?: string;
  is_stock_item?: boolean;
  has_variants?: boolean;
  variant_of?: string;
  is_template?: boolean;
  [key: string]: unknown;
}

export interface CartItem extends POSItem {
  qty: number;
  discount_percentage: number;
  discount_amount: number;
  posa_notes?: string;
  posa_delivery_date?: string;
  posa_offers?: string;
  posa_is_offer?: boolean;
  posa_is_replace?: boolean;
  conversion_factor?: number;
  // Item-level tax
  item_tax_template?: string;
  item_tax_map?: Record<string, number>;
  // loyalty
  posa_offer_applied?: boolean;
}

export interface ItemGroup {
  name: string;
  parent_item_group?: string;
  is_group?: boolean;
}

// ─── Item Detail Types (from get_item_detail API) ──

export interface ItemDetail {
  item_code: string;
  item_name: string;
  uom: string;
  stock_uom: string;
  has_serial_no: boolean;
  has_batch_no: boolean;
  uoms: ItemUOM[];
  batches: BatchInfo[];
  serial_numbers: string[];
  barcode_uom?: string;
  conversion_factor?: number;
  price_list_rate?: number;
  [key: string]: unknown;
}

export interface ItemUOM {
  uom: string;
  conversion_factor: number;
}

export interface BatchInfo {
  batch_no: string;
  qty: number;
  expiry_date?: string;
}

export interface ItemVariant {
  item_code: string;
  item_name: string;
  attributes: Record<string, string>;
  [key: string]: unknown;
}

export interface ItemAttribute {
  attribute: string;
  values: string[];
}

export interface StockAvailability {
  item_code: string;
  actual_qty: number;
  warehouse: string;
}

// ─── Customer Types ────────────────────────────────

export interface Customer {
  name: string;
  customer_name: string;
  customer_group?: string;
  territory?: string;
  mobile_no?: string;
  email_id?: string;
  customer_type?: string;
  loyalty_program?: string;
  loyalty_points?: number;
  loyalty_amount?: number;
  posa_discount?: number;
  posa_referral_code?: string;
  posa_birthday?: string;
  default_price_list?: string;
  gender?: string;
  tax_id?: string;
  [key: string]: unknown;
}

export interface CustomerAddress {
  name: string;
  address_title?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state?: string;
  country: string;
  pincode?: string;
  phone?: string;
  is_primary_address?: boolean;
  is_shipping_address?: boolean;
}

export interface CustomerCredit {
  total_credit: number;
  credit_notes: CreditNote[];
  unallocated_payments: UnallocatedPayment[];
  loyalty_points?: number;
  loyalty_amount?: number;
}

export interface CreditNote {
  name: string;
  grand_total: number;
  outstanding_amount: number;
  posting_date: string;
  customer: string;
}

export interface UnallocatedPayment {
  name: string;
  unallocated_amount: number;
  posting_date: string;
  mode_of_payment?: string;
}

export interface SalesPerson {
  name: string;
  sales_person_name?: string;
}

// ─── Loyalty Program Types ─────────────────────────

export interface LoyaltyProgramTier {
  tier_name: string;
  min_spent: number;
  collection_factor: number;
}

export interface LoyaltyProgram {
  name: string;
  loyalty_program_name?: string;
  company?: string;
  conversion_factor: number;
  expiry_duration?: number;
  tiers?: LoyaltyProgramTier[];
}

export interface CustomerLoyaltyInfo {
  enrolled: boolean;
  customer: string;
  customer_name: string;
  loyalty_program?: string | null;
  loyalty_program_name?: string;
  conversion_factor?: number;
  loyalty_points?: number;
  points_value?: number;
  current_tier?: string | null;
  tiers?: LoyaltyProgramTier[];
  expiry_duration?: number;
}

// ─── Invoice Types ─────────────────────────────────

export interface InvoiceItem {
  item_code: string;
  item_name: string;
  qty: number;
  rate: number;
  amount?: number;
  uom?: string;
  discount_percentage?: number;
  discount_amount?: number;
  serial_no?: string;
  batch_no?: string;
  item_tax_template?: string;
  posa_notes?: string;
  posa_delivery_date?: string;
  posa_offers?: string;
  posa_row_id?: string;
  posa_offer_applied?: boolean;
  posa_is_offer?: boolean;
  posa_is_replace?: boolean;
}

export interface InvoicePayment {
  mode_of_payment: string;
  amount: number;
  base_amount?: number;
  account?: string;
  type?: string;
}

export interface InvoiceData {
  pos_profile: string;
  customer: string;
  items: InvoiceItem[];
  pos_opening_shift: string;
  additional_discount_percentage?: number;
  discount_amount?: number;
  payments?: InvoicePayment[];
  posa_notes?: string;
  posa_delivery_date?: string;
  posa_offers?: string;
  posa_coupons?: string;
  loyalty_points?: number;
  loyalty_amount?: number;
  redeem_loyalty_points?: boolean;
  sales_person?: string;
  is_return?: boolean;
  return_against?: string;
  write_off_amount?: number;
  write_off_account?: string;
  posa_authorization_code?: string;
  currency?: string;
  conversion_rate?: number;
}

export interface InvoiceTax {
  description: string;
  rate: number;
  tax_amount: number;
}

export interface Invoice {
  name: string;
  customer: string;
  customer_name: string;
  posting_date: string;
  posting_time?: string;
  grand_total: number;
  net_total: number;
  paid_amount: number;
  outstanding_amount: number;
  status: string;
  docstatus: number;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  taxes?: InvoiceTax[];
  is_return?: boolean;
  return_against?: string;
  loyalty_points?: number;
  loyalty_amount?: number;
  // Additional fields
  total_taxes_and_charges?: number;
  change_amount?: number;
  discount_amount?: number;
  additional_discount_percentage?: number;
  base_discount_amount?: number;
  total_qty?: number;
  total?: number;
  sales_partner?: string;
  commission_rate?: number;
  total_commission?: number;
  loyalty_program?: string;
  redeem_loyalty_points?: number;
  loyalty_redemption_account?: string;
  owner?: string;
  pos_profile?: string;
  coupon_code?: string;
  remarks?: string;
  currency?: string;
  [key: string]: unknown;
}

// ─── Return Types ──────────────────────────────────

export interface ReturnInvoice {
  name: string;
  customer: string;
  customer_name: string;
  posting_date: string;
  grand_total: number;
  items: InvoiceItem[];
  [key: string]: unknown;
}

// ─── Offer & Coupon Types ──────────────────────────

export interface POSOffer {
  name: string;
  title: string;
  offer_type: string;
  apply_on: string;
  disable: boolean;
  items?: POSOfferDetail[];
  [key: string]: unknown;
}

export interface POSOfferDetail {
  item_code: string;
  qty: number;
  rate?: number;
  [key: string]: unknown;
}

export interface POSCoupon {
  name: string;
  coupon_name: string;
  coupon_type: string;
  coupon_code?: string;
  pricing_rule?: string;
  valid_from?: string;
  valid_upto?: string;
  [key: string]: unknown;
}

export interface GiftCoupon {
  name: string;
  coupon_code: string;
  amount: number;
  balance_amount: number;
  [key: string]: unknown;
}

// ─── Cash Movement Types ───────────────────────────

export interface POSCashMovement {
  name: string;
  pos_profile: string;
  company: string;
  user: string;
  movement_type: string;
  amount: number;
  posting_date: string;
  status: string;
  remarks?: string;
  expense_account?: string;
  source_account?: string;
  [key: string]: unknown;
}

export interface CashMovementContext {
  expense_accounts: string[];
  deposit_accounts: string[];
  cash_account: string;
  mode_of_payment: string;
}

// ─── Delivery Charges Types ────────────────────────

export interface DeliveryCharge {
  name: string;
  label: string;
  charge_type: string;
  amount: number;
  [key: string]: unknown;
}

// ─── Referral Code Types ───────────────────────────

export interface ReferralCode {
  name: string;
  referral_name: string;
  customer: string;
  [key: string]: unknown;
}

// ─── Payment Types ─────────────────────────────────

export interface OutstandingInvoice {
  name: string;
  grand_total: number;
  outstanding_amount: number;
  posting_date: string;
  customer: string;
}

export interface PaymentRequest {
  name: string;
  status: string;
  [key: string]: unknown;
}

// ─── Pricing Rule Types ────────────────────────────

export interface PricingRule {
  name: string;
  title?: string;
  apply_on: string;
  applicable_for?: string;
  price_or_product_discount: string;
  rate_or_discount?: string;
  discount_percentage?: number;
  discount_amount?: number;
  rate?: number;
  items?: { item_code: string }[];
  [key: string]: unknown;
}

// ─── Sales Order / Quotation Types ─────────────────

export interface SalesOrder {
  name: string;
  customer: string;
  customer_name: string;
  transaction_date: string;
  grand_total: number;
  status: string;
  items: SalesOrderItem[];
  [key: string]: unknown;
}

export interface SalesOrderItem {
  item_code: string;
  item_name: string;
  qty: number;
  rate: number;
  amount: number;
  uom?: string;
  [key: string]: unknown;
}

export interface Quotation {
  name: string;
  party_name: string;
  transaction_date: string;
  grand_total: number;
  status: string;
  items: SalesOrderItem[];
  [key: string]: unknown;
}

// ─── Print Format Types ────────────────────────────

export interface PrintFormat {
  name: string;
  doc_type?: string;
  standard?: string;
  [key: string]: unknown;
}

// ─── Bundle Types ──────────────────────────────────

export interface BundleComponent {
  item_code: string;
  item_name?: string;
  qty: number;
  rate?: number;
  uom?: string;
  description?: string;
}

// ─── API Response Types ────────────────────────────

export interface TaxDetail {
  description: string;
  charge_type: string;
  rate: number;
  account_head: string;
  included_in_print_rate: number;
}

export interface PrintSettings {
  print_format: string;
  print_format_for_online?: string;
  allow_print_before_pay: number;
  auto_print_receipt: number;
  letter_head: string;
}

export interface ShiftCheckResult {
  pos_opening_shift: POSOpeningShift;
  pos_profile: POSProfile;
  company: Company;
  stock_settings?: StockSettings;
  taxes?: TaxDetail[];
  tax_inclusive?: number;
  print_settings?: PrintSettings;
}

export interface OpeningData {
  pos_profiles: POSProfile[];
  companies: Company[];
  payment_methods: POSPaymentMethod[];
}

export interface ShiftSummary {
  net_total: number;
  grand_total: number;
  total_invoices: number;
  returns_count: number;
  payment_summary: Record<string, number>;
  opening_balances: Record<string, number>;
  tax_summary: POSClosingShiftTax[];
  pos_profile: string;
  company: string;
  invoices: {
    name: string;
    customer: string;
    customer_name: string;
    grand_total: number;
    is_return: boolean;
  }[];
}

// ─── Utility Types ─────────────────────────────────

export type CurrencyCode =
  | "USD" | "EUR" | "GBP" | "JPY" | "INR"
  | "PKR" | "AED" | "SAR" | "CNY" | "KRW"
  | "BDT" | "LKR" | "NPR" | "CAD" | "AUD"
  | string;

export type CurrencySymbolMap = Record<CurrencyCode, string>;

export interface FrappeCallResponse<T = unknown> {
  message: T;
}
