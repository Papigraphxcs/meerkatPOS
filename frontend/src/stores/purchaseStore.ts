/**
 * X POS Purchase Store
 * Handles purchasing functionality including:
 * - Supplier management
 * - Purchase orders
 * - Purchase receipts
 * - Purchase invoices
 * - Item creation
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { call, showSuccess, showError } from "@/services/api";
import { usePosStore } from "@/stores/posStore";
import {
    cacheSuppliers,
    searchCachedSuppliers,
    addCachedSupplier,
    addPendingPurchase,
    getAllPendingPurchases,
    updatePendingPurchase,
    deletePendingPurchase,
    countPendingPurchases,
    type CachedSupplier,
    type PendingPurchase,
} from "@/services/idbService";
import type {
    Supplier,
    PurchaseOrder,
    PurchaseOrderData,
    PurchaseOrderResult,
    SearchItem,
    NewItemData,
    PendingReceiptOrder,
    ReceiveStockItem,
    ReceiveStockResult,
    InTransitEntry,
    ReceiveTransitItem,
    ReceiveTransitResult,
    ReturnShortageItem,
    ReturnShortageResult,
} from "@/types/pos.types";
import { isOnline } from "@/utils";
import __ from "@/lib/translate";

export interface PurchaseCartItem {
    item_code: string;
    item_name: string;
    qty: number;
    rate: number;
    uom: string;
    stock_uom: string;
    conversion_factor: number;
    warehouse?: string;
    received_qty?: number;
}

export const usePurchaseStore = defineStore("purchase", () => {
    const suppliers = ref<Supplier[]>([]);
    const isLoadingSuppliers = ref(false);
    const selectedSupplier = ref<Supplier | null>(null);
    const showSupplierDialog = ref(false);
    const showNewSupplierForm = ref(false);
    const supplierSearchTerm = ref("");
    const purchaseItems = ref<SearchItem[]>([]);
    const isLoadingItems = ref(false);
    const itemSearchTerm = ref("");
    const showItemDialog = ref(false);
    const showNewItemForm = ref(false);
    const cartItems = ref<PurchaseCartItem[]>([]);
    const receiveImmediately = ref(true);
    const createInvoice = ref(true);
    const selectedWarehouse = ref("");
    const showPurchaseDialog = ref(false);
    const isProcessing = ref(false);
    const purchaseOrders = ref<PurchaseOrder[]>([]);
    const isLoadingOrders = ref(false);
    const pendingPurchases = ref<PendingPurchase[]>([]);
    const pendingCount = ref(0);
    const isSyncing = ref(false);
    const pendingReceipts = ref<PendingReceiptOrder[]>([]);
    const isLoadingReceipts = ref(false);
    const selectedReceipt = ref<PendingReceiptOrder | null>(null);
    const isReceiving = ref(false);
    const inTransitEntries = ref<InTransitEntry[]>([]);
    const isLoadingTransits = ref(false);
    const selectedTransit = ref<InTransitEntry | null>(null);
    const isReceivingTransit = ref(false);
    const isReturningShortage = ref(false);

    const cartTotal = computed(() =>
        cartItems.value.reduce((sum, item) => sum + item.qty * item.rate, 0)
    );

    const cartItemCount = computed(() =>
        cartItems.value.reduce((sum, item) => sum + item.qty, 0)
    );

    const isEmpty = computed(() => cartItems.value.length === 0);

    const canCreateOrder = computed(() =>
        !!selectedSupplier.value && cartItems.value.length > 0
    );

    const hasPendingPurchases = computed(() => pendingCount.value > 0);

    let supplierSearchAbort: AbortController | null = null;

    async function searchSuppliers(term = ""): Promise<void> {
        if (supplierSearchAbort) {
            supplierSearchAbort.abort();
        }
        supplierSearchAbort = new AbortController();

        isLoadingSuppliers.value = true;
        const searchText = term !== undefined ? term : supplierSearchTerm.value;

        try {
            if (!isOnline()) {
                const cached = await searchCachedSuppliers(searchText);
                suppliers.value = cached.map((s) => ({
                    name: s.name,
                    supplier_name: s.supplier_name,
                    supplier_group: s.supplier_group,
                    supplier_type: s.supplier_type,
                    default_currency: s.default_currency,
                    mobile_no: s.mobile_no,
                    email_id: s.email_id,
                }));
                return;
            }
            const result = await call<Supplier[]>(
                "xpos.x_pos.api.purchase_orders.search_suppliers",
                {
                    search_text: searchText,
                    limit: 50,
                }
            );
            suppliers.value = result || [];

            if (suppliers.value.length > 0) {
                try {
                    const toCache: CachedSupplier[] = suppliers.value.map((s) => ({
                        name: s.name,
                        supplier_name: s.supplier_name,
                        supplier_group: s.supplier_group,
                        supplier_type: s.supplier_type,
                        default_currency: s.default_currency,
                        mobile_no: s.mobile_no,
                        email_id: s.email_id,
                    }));
                    await cacheSuppliers(toCache);
                } catch (err) {
                    console.warn("[XPOS Purchase] Failed to cache suppliers:", err);
                }
            }
        } catch (error) {
            console.error("Error searching suppliers:", error);
            try {
                const cached = await searchCachedSuppliers(term || supplierSearchTerm.value);
                if (cached.length > 0) {
                    suppliers.value = cached.map((s) => ({
                        name: s.name,
                        supplier_name: s.supplier_name,
                        supplier_group: s.supplier_group,
                        supplier_type: s.supplier_type,
                        default_currency: s.default_currency,
                    }));
                }
            } catch {
                suppliers.value = [];
            }
        } finally {
            isLoadingSuppliers.value = false;
        }
    }

    async function createSupplier(data: {
        supplier_name: string;
        supplier_group?: string;
        supplier_type?: string;
        mobile_no?: string;
        email_id?: string;
        tax_id?: string;
    }): Promise<Supplier | null> {
        try {
            const posStore = usePosStore();
            const result = await call<Supplier>(
                "xpos.x_pos.api.purchase_orders.create_supplier",
                {
                    data: JSON.stringify({
                        ...data,
                        pos_profile: posStore.profileName,
                    }),
                }
            );

            showNewSupplierForm.value = false;
            showSuccess(`Supplier "${result.supplier_name}" created`);

            await addCachedSupplier({
                name: result.name,
                supplier_name: result.supplier_name,
                supplier_group: result.supplier_group,
                supplier_type: result.supplier_type,
                default_currency: result.default_currency,
            });

            await searchSuppliers();
            selectedSupplier.value = result;

            return result;
        } catch (error) {
            console.error("Error creating supplier:", error);
            showError(error instanceof Error ? error.message : "Failed to create supplier");
            return null;
        }
    }

    function selectSupplier(supplier: Supplier): void {
        selectedSupplier.value = supplier;
        showSupplierDialog.value = false;
    }

    function clearSupplier(): void {
        selectedSupplier.value = null;
    }

    let itemSearchAbort: AbortController | null = null;

    async function searchItems(term = ""): Promise<void> {
        if (itemSearchAbort) {
            itemSearchAbort.abort();
        }
        itemSearchAbort = new AbortController();

        isLoadingItems.value = true;
        const searchText = term !== undefined ? term : itemSearchTerm.value;

        try {
            const result = await call<SearchItem[]>(
                "xpos.x_pos.api.purchase_orders.search_items",
                {
                    search_text: searchText,
                    limit: 50,
                }
            );
            purchaseItems.value = result || [];
        } catch (error: unknown) {
            if (
                error instanceof Error &&
                (error.name === "AbortError" || error.message === "AbortError")
            ) {
                return;
            }
            console.error("Error searching items:", error);
            purchaseItems.value = [];
        } finally {
            isLoadingItems.value = false;
        }
    }

    async function createItem(data: NewItemData): Promise<SearchItem | null> {
        try {
            const posStore = usePosStore();
            const result = await call<{ item: SearchItem; selling_price_list?: string; buying_price_list?: string }>(
                "xpos.x_pos.api.purchase_orders.create_purchase_item",
                {
                    data: JSON.stringify({
                        ...data,
                        pos_profile: posStore.profileName,
                    }),
                }
            );

            showNewItemForm.value = false;
            showSuccess(`Item "${result.item.item_name}" created`);

            await searchItems();

            return result.item;
        } catch (error) {
            console.error("Error creating item:", error);
            showError(error instanceof Error ? error.message : "Failed to create item");
            return null;
        }
    }

    function addToCart(item: SearchItem, qty = 1): void {
        const existing = cartItems.value.find((i) => i.item_code === item.item_code);

        if (existing) {
            existing.qty += qty;
        } else {
            const posStore = usePosStore();
            cartItems.value.push({
                item_code: item.item_code,
                item_name: item.item_name,
                qty,
                rate: item.standard_rate || 0,
                uom: item.stock_uom,
                stock_uom: item.stock_uom,
                conversion_factor: 1,
                warehouse: posStore.warehouse,
            });
        }
    }

    function updateCartItemQty(index: number, qty: number): void {
        if (qty <= 0) {
            removeFromCart(index);
            return;
        }
        cartItems.value[index].qty = qty;
    }

    function updateCartItemRate(index: number, rate: number): void {
        cartItems.value[index].rate = rate;
    }

    function updateCartItemUOM(index: number, uom: string, conversionFactor: number): void {
        cartItems.value[index].uom = uom;
        cartItems.value[index].conversion_factor = conversionFactor;
    }

    function removeFromCart(index: number): void {
        cartItems.value.splice(index, 1);
    }

    function clearCart(): void {
        cartItems.value = [];
    }

    async function createPurchaseOrder(): Promise<PurchaseOrderResult | null> {
        if (!canCreateOrder.value) {
            showError(__("Please select a supplier and add items"));
            return null;
        }

        isProcessing.value = true;

        try {
            const posStore = usePosStore();

            const orderData: PurchaseOrderData = {
                pos_profile: posStore.profileName,
                supplier: selectedSupplier.value!.name,
                company: posStore.companyName,
                warehouse: selectedWarehouse.value || posStore.warehouse,
                items: cartItems.value.map((item) => ({
                    item_code: item.item_code,
                    item_name: item.item_name,
                    qty: item.qty,
                    rate: item.rate,
                    uom: item.uom,
                    stock_uom: item.stock_uom,
                    conversion_factor: item.conversion_factor,
                    warehouse: item.warehouse,
                })),
                receive: receiveImmediately.value,
                create_invoice: createInvoice.value,
                submit: true,
            };

            if (!isOnline()) {
                await saveOfflinePurchase(orderData);
                showSuccess(__("Purchase order saved offline. Will sync when online."));
                clearAfterOrder();
                return null;
            }

            const result = await call<PurchaseOrderResult>(
                "xpos.x_pos.api.purchase_orders.create_purchase_order",
                { data: JSON.stringify(orderData) }
            );

            let message = __("Purchase Order {0} created", [result.purchase_order ?? ""]);
            if (result.purchase_receipt) {
                message += __(", Receipt: {0}", [result.purchase_receipt ?? ""]);
            }
            if (result.purchase_invoice) {
                message += __(", Invoice: {0}", [result.purchase_invoice ?? ""]);
            }
            showSuccess(message);

            clearAfterOrder();
            return result;
        } catch (error) {
            console.error("Error creating purchase order:", error);
            showError(error instanceof Error ? error.message : "Failed to create purchase order");
            return null;
        } finally {
            isProcessing.value = false;
        }
    }

    function clearAfterOrder(): void {
        clearCart();
        clearSupplier();
        showPurchaseDialog.value = false;
    }

    async function fetchPurchaseOrders(filters?: {
        status?: string;
        supplier?: string;
        from_date?: string;
        to_date?: string;
    }): Promise<void> {
        isLoadingOrders.value = true;

        try {
            const result = await call<PurchaseOrder[]>(
                "frappe.client.get_list",
                {
                    doctype: "Purchase Order",
                    fields: [
                        "name",
                        "supplier",
                        "supplier_name",
                        "company",
                        "transaction_date",
                        "grand_total",
                        "status",
                        "docstatus",
                        "per_received",
                        "per_billed",
                    ],
                    filters: {
                        docstatus: ["!=", 2],
                        ...(filters?.status && { status: filters.status }),
                        ...(filters?.supplier && { supplier: filters.supplier }),
                        ...(filters?.from_date && { transaction_date: [">=", filters.from_date] }),
                        ...(filters?.to_date && { transaction_date: ["<=", filters.to_date] }),
                    },
                    order_by: "transaction_date desc",
                    limit_page_length: 50,
                }
            );
            purchaseOrders.value = result || [];
        } catch (error) {
            console.error("Error fetching purchase orders:", error);
            purchaseOrders.value = [];
        } finally {
            isLoadingOrders.value = false;
        }
    }

    async function saveOfflinePurchase(data: PurchaseOrderData): Promise<number> {
        const record = {
            type: "purchase_order" as const,
            data,
            status: "pending" as const,
            created_at: new Date().toISOString(),
            retry_count: 0,
            supplier_name: selectedSupplier.value?.supplier_name,
            grand_total: cartTotal.value,
        };

        const id = await addPendingPurchase(record);
        await refreshPendingCount();
        return id;
    }

    async function refreshPendingCount(): Promise<void> {
        try {
            pendingCount.value = await countPendingPurchases();
        } catch {
            pendingCount.value = 0;
        }
    }

    async function loadPendingPurchases(): Promise<void> {
        try {
            pendingPurchases.value = await getAllPendingPurchases();
            pendingCount.value = pendingPurchases.value.length;
        } catch {
            pendingPurchases.value = [];
            pendingCount.value = 0;
        }
    }

    async function syncPendingPurchases(): Promise<void> {
        if (isSyncing.value || !isOnline()) return;

        isSyncing.value = true;

        try {
            const pending = await getAllPendingPurchases();
            if (pending.length === 0) {
                isSyncing.value = false;
                return;
            }

            let synced = 0;
            let failed = 0;

            for (const purchase of pending) {
                if (!isOnline()) break;

                try {
                    purchase.status = "syncing";
                    if (purchase.id) await updatePendingPurchase(purchase);

                    await call<PurchaseOrderResult>(
                        "xpos.x_pos.api.purchase_orders.create_purchase_order",
                        { data: JSON.stringify(purchase.data) }
                    );

                    if (purchase.id) await deletePendingPurchase(purchase.id);
                    synced++;
                } catch (error) {
                    failed++;
                    purchase.status = "failed";
                    purchase.retry_count = (purchase.retry_count || 0) + 1;
                    purchase.error = error instanceof Error ? error.message : String(error);
                    if (purchase.id) await updatePendingPurchase(purchase);
                }
            }

            await refreshPendingCount();
            await loadPendingPurchases();

            if (synced > 0) {
                showSuccess(`Synced ${synced} purchase order${synced > 1 ? "s" : ""}`);
            }
            if (failed > 0) {
                showError(`Failed to sync ${failed} purchase order${failed > 1 ? "s" : ""}`);
            }
        } catch (error) {
            console.error("Sync error:", error);
        } finally {
            isSyncing.value = false;
        }
    }

    async function retryPendingPurchase(id: number): Promise<boolean> {
        if (!isOnline()) {
            showError(__("Cannot sync while offline"));
            return false;
        }

        const pending = await getAllPendingPurchases();
        const purchase = pending.find((p) => p.id === id);
        if (!purchase) return false;

        try {
            purchase.status = "syncing";
            await updatePendingPurchase(purchase);

            await call<PurchaseOrderResult>(
                "xpos.x_pos.api.purchase_orders.create_purchase_order",
                { data: JSON.stringify(purchase.data) }
            );

            await deletePendingPurchase(id);
            await refreshPendingCount();
            await loadPendingPurchases();
            showSuccess(__("Purchase order synced successfully"));
            return true;
        } catch (error) {
            purchase.status = "failed";
            purchase.retry_count = (purchase.retry_count || 0) + 1;
            purchase.error = error instanceof Error ? error.message : String(error);
            await updatePendingPurchase(purchase);
            await loadPendingPurchases();
            showError("Sync failed: " + purchase.error);
            return false;
        }
    }

    async function deletePending(id: number): Promise<void> {
        await deletePendingPurchase(id);
        await refreshPendingCount();
        await loadPendingPurchases();
    }

    function init(): void {
        refreshPendingCount();
    }

    async function searchByBarcode(barcode: string): Promise<SearchItem | null> {
        if (!barcode) return null;

        try {
            const result = await call<SearchItem | null>(
                "xpos.x_pos.api.purchase_orders.search_item_by_barcode",
                { barcode }
            );
            return result || null;
        } catch (error) {
            console.error("Error searching barcode:", error);
            return null;
        }
    }

    async function fetchPendingReceipts(): Promise<void> {
        isLoadingReceipts.value = true;
        try {
            const posStore = usePosStore();
            const result = await call<PendingReceiptOrder[]>(
                "xpos.x_pos.api.purchase_orders.get_pending_receipts",
                { warehouse: posStore.warehouse, limit: 50 }
            );
            pendingReceipts.value = result || [];
        } catch (error) {
            console.error("Error fetching pending receipts:", error);
            pendingReceipts.value = [];
        } finally {
            isLoadingReceipts.value = false;
        }
    }

    async function fetchReceiptDetail(poName: string): Promise<PendingReceiptOrder | null> {
        try {
            const result = await call<PendingReceiptOrder>(
                "xpos.x_pos.api.purchase_orders.get_purchase_order_detail",
                { purchase_order: poName }
            );
            selectedReceipt.value = result || null;
            return result || null;
        } catch (error) {
            console.error("Error fetching PO detail:", error);
            return null;
        }
    }

    async function receiveStock(
        poName: string,
        items: ReceiveStockItem[],
        remarks = ""
    ): Promise<ReceiveStockResult | null> {
        isReceiving.value = true;
        try {
            const posStore = usePosStore();
            const result = await call<ReceiveStockResult>(
                "xpos.x_pos.api.purchase_orders.receive_stock",
                {
                    data: JSON.stringify({
                        purchase_order: poName,
                        warehouse: posStore.warehouse,
                        items,
                        remarks,
                    }),
                }
            );

            let message = `Receipt ${result.purchase_receipt} created`;
            if (result.has_rejections) {
                message += " (with rejections)";
            }
            showSuccess(message);

            await fetchPendingReceipts();
            selectedReceipt.value = null;

            return result;
        } catch (error) {
            console.error("Error receiving stock:", error);
            showError(error instanceof Error ? error.message : "Failed to receive stock");
            return null;
        } finally {
            isReceiving.value = false;
        }
    }

    function clearSelectedReceipt(): void {
        selectedReceipt.value = null;
    }

    async function fetchInTransitTransfers(): Promise<void> {
        isLoadingTransits.value = true;
        try {
            const posStore = usePosStore();
            const result = await call<InTransitEntry[]>(
                "xpos.x_pos.api.stock_transfer.get_in_transit_transfers",
                { warehouse: posStore.warehouse, limit: 50 }
            );
            inTransitEntries.value = result || [];
        } catch (error) {
            console.error("Error fetching in-transit transfers:", error);
            inTransitEntries.value = [];
        } finally {
            isLoadingTransits.value = false;
        }
    }

    async function fetchTransitDetail(stockEntry: string): Promise<InTransitEntry | null> {
        try {
            const result = await call<InTransitEntry>(
                "xpos.x_pos.api.stock_transfer.get_transfer_detail",
                { stock_entry: stockEntry }
            );
            selectedTransit.value = result || null;
            return result || null;
        } catch (error) {
            console.error("Error fetching transit detail:", error);
            return null;
        }
    }

    async function receiveTransitStock(
        outgoingEntry: string,
        items: ReceiveTransitItem[],
        remarks = ""
    ): Promise<ReceiveTransitResult | null> {
        isReceivingTransit.value = true;
        try {
            const posStore = usePosStore();
            const result = await call<ReceiveTransitResult>(
                "xpos.x_pos.api.stock_transfer.receive_transit_stock",
                {
                    data: JSON.stringify({
                        outgoing_stock_entry: outgoingEntry,
                        target_warehouse: posStore.warehouse,
                        items,
                        remarks,
                    }),
                }
            );

            let message = `Stock Entry ${result.stock_entry} created`;
            if (result.has_shortage) {
                message += ` (shortage: ${result.total_shortage_qty})`;
            }
            showSuccess(message);

            await fetchInTransitTransfers();

            return result;
        } catch (error) {
            console.error("Error receiving transit stock:", error);
            showError(error instanceof Error ? error.message : "Failed to receive transit stock");
            return null;
        } finally {
            isReceivingTransit.value = false;
        }
    }

    async function returnShortageToSource(
        outgoingEntry: string,
        items: ReturnShortageItem[],
        remarks = ""
    ): Promise<ReturnShortageResult | null> {
        isReturningShortage.value = true;
        try {
            const result = await call<ReturnShortageResult>(
                "xpos.x_pos.api.stock_transfer.return_shortage_to_source",
                {
                    data: JSON.stringify({
                        outgoing_stock_entry: outgoingEntry,
                        items,
                        remarks,
                    }),
                }
            );

            showSuccess(`Return ${result.stock_entry} created - ${result.total_returned_qty} items returned to source`);

            await fetchInTransitTransfers();

            return result;
        } catch (error) {
            console.error("Error returning shortage:", error);
            showError(error instanceof Error ? error.message : "Failed to return shortage");
            return null;
        } finally {
            isReturningShortage.value = false;
        }
    }

    function clearSelectedTransit(): void {
        selectedTransit.value = null;
    }

    return {
        suppliers,
        isLoadingSuppliers,
        selectedSupplier,
        showSupplierDialog,
        showNewSupplierForm,
        supplierSearchTerm,
        purchaseItems,
        isLoadingItems,
        itemSearchTerm,
        showItemDialog,
        showNewItemForm,
        cartItems,
        receiveImmediately,
        createInvoice,
        selectedWarehouse,
        showPurchaseDialog,
        isProcessing,
        purchaseOrders,
        isLoadingOrders,
        pendingPurchases,
        pendingCount,
        isSyncing,
        pendingReceipts,
        isLoadingReceipts,
        selectedReceipt,
        isReceiving,
        inTransitEntries,
        isLoadingTransits,
        selectedTransit,
        isReceivingTransit,
        isReturningShortage,
        cartTotal,
        cartItemCount,
        isEmpty,
        canCreateOrder,
        hasPendingPurchases,

        searchSuppliers,
        createSupplier,
        selectSupplier,
        clearSupplier,
        searchItems,
        createItem,
        searchByBarcode,
        addToCart,
        updateCartItemQty,
        updateCartItemRate,
        updateCartItemUOM,
        removeFromCart,
        clearCart,
        createPurchaseOrder,
        fetchPurchaseOrders,
        fetchPendingReceipts,
        fetchReceiptDetail,
        receiveStock,
        clearSelectedReceipt,
        fetchInTransitTransfers,
        fetchTransitDetail,
        receiveTransitStock,
        returnShortageToSource,
        clearSelectedTransit,
        refreshPendingCount,
        loadPendingPurchases,
        syncPendingPurchases,
        retryPendingPurchase,
        deletePending,
        init,
    };
});
