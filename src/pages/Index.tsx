import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScanLine, Trash2, Store, Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Cart, type CartItem } from "@/components/Cart";
import { PaymentQR } from "@/components/PaymentQR";
import { PrintBill } from "@/components/PrintBill";
import { CustomQRGenerator } from "@/components/CustomQRGenerator";
import { findProductByBarcode, getProducts, type Product } from "@/data/products";

const UPI_ID = "Q320109659@ybl";
const SHOP_NAME = "Furat Dhaba";

const Index = () => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [products, setProducts] = useState<Product[]>(() => getProducts());

  useEffect(() => {
    const h = () => setProducts(getProducts());
    window.addEventListener("products:updated", h);
    return () => window.removeEventListener("products:updated", h);
  }, []);

  const beep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
    if (navigator.vibrate) navigator.vibrate(60);
  };

  const handleScan = (code: string) => {
    const product = findProductByBarcode(code);
    if (!product) {
      toast.error("Product Not Found", { description: `Barcode: ${code}` });
      return;
    }
    beep();
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        toast.success(`+1 ${product.name}`);
        return prev.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      toast.success(`Added ${product.name}`);
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const inc = (id: string) =>
    setItems((p) => p.map((i) => (i.id === id ? { ...i, quantity: i.quantity + 1 } : i)));
  const dec = (id: string) =>
    setItems((p) =>
      p.flatMap((i) =>
        i.id === id ? (i.quantity > 1 ? [{ ...i, quantity: i.quantity - 1 }] : []) : [i]
      )
    );
  const remove = (id: string) => setItems((p) => p.filter((i) => i.id !== id));
  const clear = () => {
    setItems([]);
    toast("Cart cleared");
  };

  const { totalItems, totalPrice } = useMemo(
    () => ({
      totalItems: items.reduce((s, i) => s + i.quantity, 0),
      totalPrice: items.reduce((s, i) => s + i.price * i.quantity, 0),
    }),
    [items]
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">{SHOP_NAME}</h1>
              <p className="text-xs text-muted-foreground">Smart Billing POS</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button asChild variant="outline" size="icon" aria-label="Manage products">
              <Link to="/products"><Package className="h-4 w-4" /></Link>
            </Button>
            <Button onClick={() => setScanning(true)} className="gap-2">
              <ScanLine className="h-4 w-4" />
              Scan
            </Button>
          </div>
        </div>
      </header>

      <main className="container grid gap-6 py-6 lg:grid-cols-[1fr_360px]">
        <section className="flex flex-col gap-4">
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">QUICK ADD</p>
              <span className="text-xs text-muted-foreground">{products.length} items</span>
            </div>
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No products yet.{" "}
                <Link to="/products" className="text-primary underline">
                  Add some
                </Link>
                .
              </p>
            ) : (
              <div className={products.length > 6 ? "max-h-64 overflow-y-auto pr-1 -mr-1" : ""}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                  {products.map((p) => (
                    <Button
                      key={p.id}
                      variant="outline"
                      size="sm"
                      className="h-auto min-h-9 w-full justify-start gap-1.5 whitespace-normal break-words py-2 text-left"
                      onClick={() => handleScan(p.barcode)}
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1">{p.name} ₹{p.price}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <CustomQRGenerator upiId={UPI_ID} payeeName={SHOP_NAME} />

          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Cart</h2>
            {items.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clear} className="gap-1.5 text-destructive">
                <Trash2 className="h-4 w-4" /> Clear
              </Button>
            )}
          </div>
          <Cart items={items} onInc={inc} onDec={dec} onRemove={remove} />
        </section>

        <aside className="flex flex-col gap-4">
          <Card
            className="p-5 text-primary-foreground"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-soft)" }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm opacity-90">Total Items</span>
              <span className="text-xl font-bold">{totalItems}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-sm opacity-90">Total Amount</span>
              <span className="text-3xl font-extrabold">₹{totalPrice.toFixed(2)}</span>
            </div>
          </Card>

          {totalPrice > 0 ? (
            <>
              <PaymentQR amount={totalPrice} upiId={UPI_ID} payeeName={SHOP_NAME} />
              <PrintBill
                items={items}
                total={totalPrice}
                totalItems={totalItems}
                shopName={SHOP_NAME}
                upiId={UPI_ID}
              />
            </>
          ) : (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              QR code will appear here once items are added
            </Card>
          )}
        </aside>
      </main>

      {scanning && (
        <BarcodeScanner
          onScan={(code) => {
            handleScan(code);
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  );
};

export default Index;
