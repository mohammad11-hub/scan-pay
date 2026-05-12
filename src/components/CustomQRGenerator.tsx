import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, History, Trash2, Sparkles } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const HISTORY_KEY = "pos.qr.history.v1";

export interface QRHistoryEntry {
  id: string;
  itemName: string;
  price: number;
  payload: string;
  createdAt: number;
}

const schema = z.object({
  itemName: z
    .string()
    .trim()
    .nonempty({ message: "Item name is required" })
    .max(80, { message: "Item name must be under 80 characters" }),
  price: z
    .number({ invalid_type_error: "Price must be a number" })
    .positive({ message: "Price must be greater than 0" })
    .max(1000000, { message: "Price too large" }),
});

function readHistory(): QRHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(list: QRHistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("qr-history:updated"));
}

interface Props {
  upiId: string;
  payeeName: string;
}

export const CustomQRGenerator = ({ upiId, payeeName }: Props) => {
  const [open, setOpen] = useState(false);
  const [itemName, setItemName] = useState("");
  const [price, setPrice] = useState("");
  const [errors, setErrors] = useState<{ itemName?: string; price?: string }>({});
  const [generated, setGenerated] = useState<QRHistoryEntry | null>(null);
  const [history, setHistory] = useState<QRHistoryEntry[]>(() => readHistory());
  const [tab, setTab] = useState("create");

  useEffect(() => {
    const h = () => setHistory(readHistory());
    window.addEventListener("qr-history:updated", h);
    return () => window.removeEventListener("qr-history:updated", h);
  }, []);

  const reset = () => {
    setItemName("");
    setPrice("");
    setErrors({});
    setGenerated(null);
  };

  const handleGenerate = () => {
    const parsed = schema.safeParse({
      itemName,
      price: Number(price),
    });
    if (!parsed.success) {
      const fe: typeof errors = {};
      parsed.error.issues.forEach((i) => {
        const key = i.path[0] as keyof typeof errors;
        if (!fe[key]) fe[key] = i.message;
      });
      setErrors(fe);
      return;
    }
    setErrors({});
    const { itemName: name, price: amount } = parsed.data;
    const payload = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
      payeeName
    )}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(name)}`;
    const entry: QRHistoryEntry = {
      id: crypto.randomUUID(),
      itemName: name,
      price: amount,
      payload,
      createdAt: Date.now(),
    };
    const next = [entry, ...readHistory()].slice(0, 50);
    writeHistory(next);
    setGenerated(entry);
    toast.success("QR code created");
  };

  const removeEntry = (id: string) => {
    writeHistory(readHistory().filter((e) => e.id !== id));
    toast("Removed from history");
  };

  const clearHistory = () => {
    writeHistory([]);
    toast("History cleared");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" className="w-full gap-2">
          <Sparkles className="h-4 w-4" />
          Create Custom QR
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            Custom QR Code
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Create</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-3.5 w-3.5" /> History
              {history.length > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 text-xs text-primary">
                  {history.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="mt-4 space-y-4">
            {!generated ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="qr-item">Item Name</Label>
                  <Input
                    id="qr-item"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g. Masala Dosa"
                    maxLength={80}
                    aria-invalid={!!errors.itemName}
                  />
                  {errors.itemName && (
                    <p className="text-xs text-destructive">{errors.itemName}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qr-price">Price (₹)</Label>
                  <Input
                    id="qr-price"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="e.g. 120"
                    aria-invalid={!!errors.price}
                  />
                  {errors.price && (
                    <p className="text-xs text-destructive">{errors.price}</p>
                  )}
                </div>
                <Button onClick={handleGenerate} className="w-full gap-2">
                  <QrCode className="h-4 w-4" /> Create QR
                </Button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div
                  className="bg-white text-black p-4 shadow-md rounded-md font-mono w-[280px]"
                >
                  <div className="text-center font-bold text-base">{payeeName}</div>
                  <div className="text-center text-[10px] mt-1">
                    {new Date(generated.createdAt).toLocaleString("en-IN")}
                  </div>
                  <div className="border-t border-dashed border-black my-2" />
                  <div className="flex justify-between text-[11px]">
                    <span className="truncate pr-2">{generated.itemName}</span>
                    <span>Rs.{generated.price.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-dashed border-black my-2" />
                  <div className="flex justify-between font-bold text-sm">
                    <span>TOTAL</span>
                    <span>Rs.{generated.price.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-dashed border-black my-2" />
                  <div className="flex flex-col items-center">
                    <div className="text-[10px] mb-1">Scan to Pay (UPI)</div>
                    <QRCodeSVG value={generated.payload} size={150} level="M" />
                    <div className="text-[9px] mt-1">{upiId}</div>
                  </div>
                  <div className="text-center text-[10px] mt-2">
                    Thank you! Visit again.
                  </div>
                </div>
                <div className="flex w-full gap-2">
                  <Button variant="outline" className="flex-1 rounded-xl" onClick={reset}>
                    New
                  </Button>
                  <Button className="flex-1 rounded-xl" onClick={() => setOpen(false)}>
                    Done
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {history.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No QR codes yet
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearHistory}
                    className="gap-1.5 text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear all
                  </Button>
                </div>
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {history.map((h) => (
                    <Card key={h.id} className="flex items-center gap-3 p-3">
                      <div className="rounded-md bg-white p-1.5 shadow-sm">
                        <QRCodeSVG value={h.payload} size={48} level="L" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {h.itemName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ₹{h.price.toFixed(2)} •{" "}
                          {new Date(h.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setGenerated(h);
                          setTab("create");
                        }}
                      >
                        View
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeEntry(h.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
