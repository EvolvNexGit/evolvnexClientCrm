"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { useProducts } from "@/hooks/use-products";
import { useCustomers } from "@/hooks/use-customers";
import { orderService, type CartItem } from "@/lib/orderService";
import type { CustomerPayload } from "@/lib/billing-types";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export default function BillingTab({ clientId }: { clientId: string }) {
  const productState = useProducts(clientId);
  const customerState = useCustomers(clientId);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantityInput, setQuantityInput] = useState("1");
  const [discountInput, setDiscountInput] = useState("0");
  const [billingMode, setBillingMode] = useState<"customer" | "walk-in">("walk-in");
  const [customerId, setCustomerId] = useState("");
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [isCustomerListOpen, setIsCustomerListOpen] = useState(false);
  const [customerActiveIndex, setCustomerActiveIndex] = useState(0);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerPayload>({
    name: "",
    phone: "",
    email: "",
    dob: "",
  });
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartActionError, setCartActionError] = useState<string | null>(null);
  const [inventoryWarnings, setInventoryWarnings] = useState<string[]>([]);
  const [isLowStock, setIsLowStock] = useState(false);
  const [isOutOfStock, setIsOutOfStock] = useState(false);
  const [isCreatingBill, setIsCreatingBill] = useState(false);
  const [createBillMessage, setCreateBillMessage] = useState<string | null>(null);

  const loading = productState.loading || customerState.loading;
  const loadError = productState.error || customerState.error;

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return productState.products;
    }

    return productState.products.filter((product) => {
      const haystack = [product.name, product.type ?? ""].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [productState.products, searchTerm]);

  const filteredCustomers = useMemo(() => {
    const query = customerSearchTerm.trim().toLowerCase();

    if (!query) {
      return customerState.customers;
    }

    return customerState.customers.filter((customer) => {
      const haystack = [customer.name, customer.phone ?? "", customer.email ?? ""].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [customerSearchTerm, customerState.customers]);

  const selectedCustomer = useMemo(
    () => customerState.customers.find((customer) => customer.id === customerId) ?? null,
    [customerId, customerState.customers],
  );

  const discountValue = Number(discountInput || 0);
  const totals = useMemo(() => orderService.calculateTotals(cart, discountValue), [cart, discountValue]);

  const customerInputRef = useRef<HTMLInputElement | null>(null);
  const customerListboxId = "billing-customer-listbox";
  const customerTypeaheadBufferRef = useRef("");
  const customerTypeaheadTimerRef = useRef<number | null>(null);

  function handleBillingModeChange(nextMode: "customer" | "walk-in") {
    setBillingMode(nextMode);
    setCartActionError(null);
    setCreateBillMessage(null);

    if (nextMode === "customer") {
      setWalkInName("");
      setWalkInPhone("");
      return;
    }

    setCustomerId("");
  }

  function openCustomerCombobox() {
    if (billingMode !== "customer") {
      handleBillingModeChange("customer");
    }

    setIsCustomerListOpen(true);
  }

  function selectCustomer(customer: (typeof customerState.customers)[number]) {
    setBillingMode("customer");
    setCustomerId(customer.id);
    setCustomerSearchTerm(customer.name);
    setCustomerActiveIndex(0);
    setIsCustomerListOpen(false);
    setCartActionError(null);
    setCreateBillMessage(null);
  }

  function openCustomerModal() {
    setCartActionError(null);
    setCreateBillMessage(null);
    resetCustomerForm();
    setIsCustomerModalOpen(true);
  }

  function openPrefilledCustomerModal(prefillName = "") {
    openCustomerModal();
    setCustomerForm((current) => ({ ...current, name: prefillName }));
  }

  function handleCustomerInputChange(value: string) {
    if (billingMode !== "customer") {
      handleBillingModeChange("customer");
    }

    setCustomerSearchTerm(value);
    setCustomerId("");
    setCustomerActiveIndex(0);
    setIsCustomerListOpen(true);
  }

  function focusCustomerByPrefix(prefix: string) {
    const normalizedPrefix = prefix.trim().toLowerCase();

    if (!normalizedPrefix) {
      return;
    }

    const matchIndex = filteredCustomers.findIndex((customer) => customer.name.toLowerCase().startsWith(normalizedPrefix));
    if (matchIndex === -1) {
      return;
    }

    setCustomerActiveIndex(matchIndex);
    setIsCustomerListOpen(true);
  }

  function handleCustomerKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (billingMode !== "customer") {
      handleBillingModeChange("customer");
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsCustomerListOpen(true);
      setCustomerActiveIndex((current) => Math.min(current + 1, Math.max(filteredCustomers.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsCustomerListOpen(true);
      setCustomerActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      if (isCustomerListOpen && filteredCustomers[customerActiveIndex]) {
        event.preventDefault();
        selectCustomer(filteredCustomers[customerActiveIndex]);
        return;
      }

      if (isCustomerListOpen && canCreateCustomerFromDropdown) {
        event.preventDefault();
        openCustomerModal(customerCreateSuggestion);
        setIsCustomerListOpen(false);
      }
      return;
    }

    if (event.key === "Escape") {
      setIsCustomerListOpen(false);
      customerTypeaheadBufferRef.current = "";
      if (customerTypeaheadTimerRef.current) {
        window.clearTimeout(customerTypeaheadTimerRef.current);
        customerTypeaheadTimerRef.current = null;
      }
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const nextPrefix = `${customerTypeaheadBufferRef.current}${event.key}`.toLowerCase();
      customerTypeaheadBufferRef.current = nextPrefix;

      if (customerTypeaheadTimerRef.current) {
        window.clearTimeout(customerTypeaheadTimerRef.current);
      }

      customerTypeaheadTimerRef.current = window.setTimeout(() => {
        customerTypeaheadBufferRef.current = "";
        customerTypeaheadTimerRef.current = null;
      }, 650);

      focusCustomerByPrefix(nextPrefix);
    }
  }

  useEffect(() => {
    setCustomerActiveIndex((current) => {
      if (filteredCustomers.length === 0) {
        return 0;
      }

      return Math.min(current, filteredCustomers.length - 1);
    });
  }, [filteredCustomers.length]);

  useEffect(() => {
    return () => {
      if (customerTypeaheadTimerRef.current) {
        window.clearTimeout(customerTypeaheadTimerRef.current);
      }
    };
  }, []);

  function resetCustomerForm() {
    setCustomerForm({
      name: "",
      phone: "",
      email: "",
      dob: "",
    });
  }

  async function submitCustomerForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCartActionError(null);

    try {
      const createdCustomer = await customerState.addCustomer({
        name: customerForm.name.trim(),
        phone: customerForm.phone?.trim() || null,
        email: customerForm.email?.trim() || null,
        dob: customerForm.dob || null,
      });

      setBillingMode("customer");
      setCustomerId(createdCustomer.id);
      setCustomerSearchTerm(createdCustomer.name);
      setIsCustomerModalOpen(false);
      resetCustomerForm();
    } catch (error) {
      setCartActionError(error instanceof Error ? error.message : "Unable to add customer.");
    }
  }

  const customerCreateSuggestion = customerSearchTerm.trim();
  const canCreateCustomerFromDropdown = billingMode === "customer" && customerCreateSuggestion.length > 0 && filteredCustomers.length === 0;

  useEffect(() => {
    let active = true;

    async function runValidation() {
      try {
        const result = await orderService.validateInventory(cart);

        if (!active) {
          return;
        }

        setIsLowStock(result.isLowStock);
        setIsOutOfStock(result.isOutOfStock);
        setInventoryWarnings(result.warnings);
      } catch (error) {
        if (!active) {
          return;
        }

        setInventoryWarnings([
          error instanceof Error ? error.message : "Unable to validate inventory for current cart.",
        ]);
        setIsLowStock(false);
        setIsOutOfStock(false);
      }
    }

    void runValidation();

    return () => {
      active = false;
    };
  }, [cart]);

  function handleAddToCart() {
    setCartActionError(null);
    setCreateBillMessage(null);

    const selectedProduct = productState.products.find((product) => product.id === selectedProductId);
    if (!selectedProduct) {
      setCartActionError("Select a product to add.");
      return;
    }

    const quantity = Math.max(1, Number(quantityInput || 1));

    let nextCart = orderService.addItem(cart, selectedProduct);
    if (quantity > 1) {
      nextCart = orderService.updateQuantity(nextCart, selectedProduct.id, quantity);
    }

    setCart(nextCart);
    setQuantityInput("1");
  }

  function increaseQuantity(productId: string) {
    const row = cart.find((item) => item.productId === productId);
    if (!row) {
      return;
    }

    setCart(orderService.updateQuantity(cart, productId, row.quantity + 1));
  }

  function decreaseQuantity(productId: string) {
    const row = cart.find((item) => item.productId === productId);
    if (!row) {
      return;
    }

    setCart(orderService.updateQuantity(cart, productId, row.quantity - 1));
  }

  function removeItem(productId: string) {
    setCart(orderService.removeItem(cart, productId));
  }

  async function handleCreateBill() {
    setCartActionError(null);
    setCreateBillMessage(null);

    try {
      setIsCreatingBill(true);
      const result = await orderService.createOrder(
        cart,
        Number(discountInput || 0),
        billingMode === "customer" ? customerId || null : null,
        {
          name: billingMode === "walk-in" ? walkInName || null : null,
          phone: billingMode === "walk-in" ? walkInPhone || null : null,
        },
      );

      setCreateBillMessage(`Bill ${result.billId} created successfully.`);
      setCart([]);
      setDiscountInput("0");
      setBillingMode("walk-in");
      setCustomerId("");
      setWalkInName("");
      setWalkInPhone("");
    } catch (error) {
      setCartActionError(error instanceof Error ? error.message : "Unable to create bill.");
    } finally {
      setIsCreatingBill(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-text">Billing</h2>
        <p className="mt-1 text-sm text-muted-foreground">POS-style billing with live totals and inventory warnings.</p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-xs text-primary">{loadError}</div>
      )}

      {cartActionError && (
        <div className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-xs text-primary">{cartActionError}</div>
      )}

      {createBillMessage && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-400">{createBillMessage}</div>
      )}

      <div className="grid gap-3 rounded-xl border border-border bg-background p-3 lg:grid-cols-[2fr_1.5fr_120px_auto]">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Search product</label>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Filter by name or type"
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-text"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Product</label>
          <select
            value={selectedProductId}
            onChange={(event) => setSelectedProductId(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-text"
          >
            <option value="">Select product</option>
            {filteredProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} {product.type ? `(${product.type})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Quantity</label>
          <input
            value={quantityInput}
            onChange={(event) => setQuantityInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAddToCart();
              }
            }}
            min="1"
            type="number"
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-text"
          />
        </div>

        <div className="flex items-end">
          <Button type="button" onClick={handleAddToCart} className="w-full" disabled={loading}>
            Add
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Quantity</th>
                <th className="px-3 py-3">Price</th>
                <th className="px-3 py-3">Total</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cart.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Cart is empty.
                  </td>
                </tr>
              )}
              {cart.map((item) => (
                <tr key={item.productId} className="hover:bg-muted/40">
                  <td className="px-3 py-3 text-text">{item.name}</td>
                  <td className="px-3 py-3">
                    <input
                      value={item.quantity}
                      onChange={(event) =>
                        setCart(orderService.updateQuantity(cart, item.productId, Number(event.target.value || 0)))
                      }
                      min="0"
                      type="number"
                      className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-text"
                    />
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{formatCurrency(item.unitPrice * item.quantity)}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => increaseQuantity(item.productId)}
                        className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-text"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => decreaseQuantity(item.productId)}
                        className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-text"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.productId)}
                        className="rounded-md border border-primary/50 px-2 py-1 text-xs text-primary"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-background p-4">
          <div className="space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bill for</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleBillingModeChange("customer")}
                className={
                  billingMode === "customer"
                    ? "rounded-xl border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
                    : "rounded-xl border border-border bg-background px-3 py-2 text-sm text-text hover:bg-muted"
                }
              >
                Customer
              </button>
              <button
                type="button"
                onClick={() => handleBillingModeChange("walk-in")}
                className={
                  billingMode === "walk-in"
                    ? "rounded-xl border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
                    : "rounded-xl border border-border bg-background px-3 py-2 text-sm text-text hover:bg-muted"
                }
              >
                Walk-in
              </button>
            </div>

            {billingMode === "customer" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="block flex-1 text-xs text-muted-foreground">
                    Customer
                    <div className="relative mt-1">
                      <input
                        ref={customerInputRef}
                        value={customerSearchTerm}
                        onChange={(event) => handleCustomerInputChange(event.target.value)}
                        onFocus={openCustomerCombobox}
                        onKeyDown={handleCustomerKeyDown}
                        onBlur={() => {
                          window.setTimeout(() => setIsCustomerListOpen(false), 120);
                        }}
                        placeholder="Search by name, phone, or email"
                        role="combobox"
                        aria-expanded={isCustomerListOpen}
                        aria-controls={customerListboxId}
                        aria-autocomplete="list"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 pr-20 text-sm text-text"
                      />
                      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                        {selectedCustomer ? "Selected" : "Search"}
                      </div>
                    </div>
                  </label>
                  <Button type="button" variant="secondary" onClick={openCustomerModal}>
                    Add Customer
                  </Button>
                </div>

                {isCustomerListOpen && (
                  <div className="max-h-56 overflow-auto rounded-xl border border-border bg-card shadow-soft">
                    <ul id={customerListboxId} role="listbox" className="py-1">
                      {filteredCustomers.length === 0 ? (
                        <li className="px-2 py-2">
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              openPrefilledCustomerModal(customerCreateSuggestion);
                              setIsCustomerListOpen(false);
                            }}
                            className="flex w-full flex-col items-start rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-left hover:bg-primary/10"
                          >
                            <span className="text-sm font-medium text-primary">Create new customer</span>
                            <span className="text-xs text-muted-foreground">
                              {customerCreateSuggestion ? `Add "${customerCreateSuggestion}" as a new customer.` : "Add a new customer from this search."}
                            </span>
                          </button>
                        </li>
                      ) : (
                        filteredCustomers.map((customer, index) => {
                          const isActive = index === customerActiveIndex;
                          const isSelected = customer.id === customerId;

                          return (
                            <li
                              key={customer.id}
                              role="option"
                              aria-selected={isSelected}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                selectCustomer(customer);
                              }}
                              onMouseEnter={() => setCustomerActiveIndex(index)}
                              className={
                                isActive
                                  ? "cursor-pointer px-3 py-2 text-sm bg-primary/10 text-primary"
                                  : "cursor-pointer px-3 py-2 text-sm text-text hover:bg-muted"
                              }
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-medium">{customer.name}</span>
                                {isSelected && <span className="text-xs text-muted-foreground">Selected</span>}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {[customer.phone, customer.email].filter(Boolean).join(" • ") || "No contact details"}
                              </div>
                            </li>
                          );
                        })
                      )}
                      {canCreateCustomerFromDropdown && (
                        <li className="px-2 py-2">
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              openPrefilledCustomerModal(customerCreateSuggestion);
                              setIsCustomerListOpen(false);
                            }}
                            className="flex w-full flex-col items-start rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-left hover:bg-primary/10"
                          >
                            <span className="text-sm font-medium text-primary">Create new customer</span>
                            <span className="text-xs text-muted-foreground">Add "{customerCreateSuggestion}" as a new customer.</span>
                          </button>
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {selectedCustomer && customerId && (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                    <span>
                      Selected customer: <span className="font-medium text-text">{selectedCustomer.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerId("");
                        setCustomerSearchTerm("");
                        setIsCustomerListOpen(true);
                        customerInputRef.current?.focus();
                      }}
                      className="font-medium text-primary hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs text-muted-foreground">
                  Walk-in name
                  <input
                    value={walkInName}
                    onChange={(event) => setWalkInName(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
                  />
                </label>
                <label className="block text-xs text-muted-foreground">
                  Walk-in phone
                  <input
                    value={walkInPhone}
                    onChange={(event) => setWalkInPhone(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <label className="flex items-center justify-between text-muted-foreground">
              <span>Discount</span>
              <input
                value={discountInput}
                onChange={(event) => setDiscountInput(event.target.value)}
                min="0"
                step="0.01"
                type="number"
                className="w-28 rounded-md border border-border bg-background px-2 py-1 text-right text-sm text-text"
              />
            </label>
            <div className="flex items-center justify-between border-t border-border pt-2 text-text">
              <span>Final total</span>
              <span className="text-base font-semibold">{formatCurrency(totals.finalTotal)}</span>
            </div>
          </div>

          {inventoryWarnings.length > 0 && (
            <div className="space-y-2">
              {inventoryWarnings.map((warning, index) => (
                <div
                  key={`${warning}-${index}`}
                  className={
                    isOutOfStock
                      ? "rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-400"
                      : isLowStock
                        ? "rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300"
                        : "rounded-lg border border-border bg-card p-2 text-xs text-muted-foreground"
                  }
                >
                  {warning}
                </div>
              ))}
            </div>
          )}

          <Button type="button" onClick={() => void handleCreateBill()} className="w-full">
            {isCreatingBill ? "Creating Bill..." : "Create Bill"}
          </Button>
        </div>
      </div>

      <EntityModal open={isCustomerModalOpen} title="Add Customer" onClose={() => setIsCustomerModalOpen(false)}>
        <form className="space-y-3" onSubmit={(event) => void submitCustomerForm(event)}>
          <label className="block text-sm text-muted-foreground">
            <span className="mb-1 block">Name</span>
            <input
              required
              value={customerForm.name}
              onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
            />
          </label>

          <label className="block text-sm text-muted-foreground">
            <span className="mb-1 block">Phone</span>
            <input
              value={customerForm.phone ?? ""}
              onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
            />
          </label>

          <label className="block text-sm text-muted-foreground">
            <span className="mb-1 block">Email</span>
            <input
              type="email"
              value={customerForm.email ?? ""}
              onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
            />
          </label>

          <label className="block text-sm text-muted-foreground">
            <span className="mb-1 block">Date of birth</span>
            <input
              type="date"
              value={customerForm.dob ?? ""}
              onChange={(event) => setCustomerForm((current) => ({ ...current, dob: event.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
            />
          </label>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setIsCustomerModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Customer</Button>
          </div>
        </form>
      </EntityModal>
    </section>
  );
}
