import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ArrowLeft, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  deleteProduct,
  getProducts,
  resetProducts,
  upsertProduct,
  type Product,
} from "@/data/products";

const schema = z.object({
  barcode: z.string().trim().min(3, "Barcode too short").max(32, "Barcode too long"),
  name: z.string().trim().min(1, "Name required").max(80, "Name too long"),
  price: z.coerce.number().positive("Price must be > 0").max(1_000_000, "Price too high"),
});

const empty = { id: "", barcode: "", name: "", price: "" as unknown as number };

const ProductStore = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ id: string; barcode: string; name: string; price: number | string }>(empty);

  const refresh = () => setProducts(getProducts());

  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener("products:updated", h);
    return () => window.removeEventListener("products:updated", h);
  }, []);

  const startAdd = () => {
    setForm(empty);
    setOpen(true);
  };

  const startEdit = (p: Product) => {
    setForm({ ...p });
    setOpen(true);
  };

  const save = () => {
    const result = schema.safeParse({
      barcode: form.barcode,
      name: form.name,
      price: form.price,
    });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    const dup = getProducts().find(
      (p) => p.barcode === result.data.barcode && p.id !== form.id
    );
    if (dup) {
      toast.error("Barcode already exists");
      return;
    }
    upsertProduct({
      id: form.id || crypto.randomUUID(),
      barcode: result.data.barcode,
      name: result.data.name,
      price: result.data.price,
    });
    toast.success(form.id ? "Product updated" : "Product added");
    setOpen(false);
    refresh();
  };

  const remove = (p: Product) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    deleteProduct(p.id);
    toast("Product deleted");
    refresh();
  };

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.barcode.includes(query)
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <Button asChild size="icon" variant="ghost">
              <Link to="/" aria-label="Back">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-bold leading-tight">Product Store</h1>
              <p className="text-xs text-muted-foreground">{products.length} items</p>
            </div>
          </div>
          <Button onClick={startAdd} className="gap-2">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </header>

      <main className="container flex flex-col gap-4 py-6">
        <div className="flex gap-2">
          <Input
            placeholder="Search by name or barcode"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button
            variant="outline"
            size="icon"
            title="Reset to defaults"
            onClick={() => {
              if (confirm("Reset product list to defaults?")) {
                resetProducts();
                refresh();
              }
            }}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {filtered.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">No products</Card>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((p) => (
              <Card key={p.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{p.barcode}</p>
                </div>
                <div className="w-20 text-right font-semibold">₹{p.price.toFixed(2)}</div>
                <Button size="icon" variant="ghost" onClick={() => startEdit(p)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => remove(p)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="barcode">Barcode</Label>
              <Input
                id="barcode"
                inputMode="numeric"
                maxLength={32}
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="price">Price (₹)</Label>
              <Input
                id="price"
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductStore;
