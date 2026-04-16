"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useProducts } from "@/hooks/use-products";
import { useCustomers } from "@/hooks/use-customers";
import { orderService, type CartItem } from "@/lib/orderService";

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
  const [customerId, setCustomerId] = useState("");
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

  const discountValue = Number(discountInput || 0);
  const totals = useMemo(() => orderService.calculateTotals(cart, discountValue), [cart, discountValue]);

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
        customerId || null,
        {
          name: walkInName || null,
          phone: walkInPhone || null,
        },
      );

      setCreateBillMessage(`Bill ${result.billId} created successfully.`);
      setCart([]);
      setDiscountInput("0");
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
          <label className="block text-xs text-muted-foreground">
            Customer (optional)
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-text"
            >
              <option value="">Walk-in</option>
              {customerState.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-muted-foreground">
              Walk-in name
              <input
                value={walkInName}
                onChange={(event) => setWalkInName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-text"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              Walk-in phone
              <input
                value={walkInPhone}
                onChange={(event) => setWalkInPhone(event.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-text"
              />
            </label>
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
    </section>
  );
}
