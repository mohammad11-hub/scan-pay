import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, History, Trash2, Sparkles, Printer, Download, Loader2 } from "lucide-react";
import { z } from "zod";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
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
import { printReceipt, getPrinterSettings, savePrinterSettings, type PaperSize } from "@/lib/printer";
import { buildReceiptHtml } from "@/lib/receiptHtml";

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
  const [paper, setPaper] = useState<PaperSize>(() => getPrinterSettings().paper);
  const [busy, setBusy] = useState<null | "print" | "pdf">(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    const h = () => setHistory(readHistory());
    window.addEventListener("qr-history:updated", h);
    return () => window.removeEventListener("qr-history:updated", h);
  }, []);

  const updatePaper = (p: PaperSize) => {
    setPaper(p);
    savePrinterSettings({ mode: getPrinterSettings().mode, paper: p });
    toast.success(`Paper size set to ${p}`);
  };

  const reset = () => {
    setItemName("");
    setPrice("");
    setErrors({});
    setGenerated(null);
    setQrDataUrl("");
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
    QRCode.toDataURL(payload, { width: 240, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => {});
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

  /* -------- shared receipt data (same shape as the main bill) -------- */

  const receiptItems = () =>
    generated
      ? [{ id: generated.id, name: generated.itemName, price: generated.price, quantity: 1 }]
      : [];

  const billNoOf = (e: QRHistoryEntry) => `CQR-${e.createdAt.toString().slice(-8)}`;
  const dateOf = (e: QRHistoryEntry) => new Date(e.createdAt).toLocaleString("en-IN");

  /** Prints through the same thermal controller as the main bill: RawBT / native / browser. */
  const handlePrint = async () => {
    if (!generated) return;
    setBusy("print");
    try {
      const res = await printReceipt(
        {
          shopName: payeeName,
          billNo: billNoOf(generated),
          date: dateOf(generated),
          items: receiptItems().map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
          totalItems: 1,
          total: generated.price,
          upiId,
          upiUrl: generated.payload,
          paper,
        },
        buildReceiptHtml({
          shopName: payeeName,
          billNo: billNoOf(generated),
          date: dateOf(generated),
          items: receiptItems(),
          totalItems: 1,
          total: generated.price,
          upiId,
          qrDataUrl,
        }),
        "auto"
      );
      if (res.ok && res.silent) {
        toast.success("Print Successful", {
          description: `Receipt sent straight to the thermal printer (${paper}).`,
        });
      } else if (!res.ok) {
        toast.error("Printing failed", { description: res.error });
      } else {
        toast.info("Print dialog opened", { description: res.error });
      }
    } catch (e: any) {
      toast.error("Printing failed", { description: String(e?.message || e) });
    } finally {
      setBusy(null);
    }
  };

  /* Renders the receipt into `doc` and returns the content height in mm. */
  const renderPdf = (doc: jsPDF, width: number) => {
    if (!generated) return 0;
    const cx = width / 2;
    let y = 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(payeeName, cx, y, { align: "center" });
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Bill: ${billNoOf(generated)}`, cx, y, { align: "center" });
    y += 4;
    doc.text(dateOf(generated), cx, y, { align: "center" });
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["Item", "Qty", "Rate", "Amt"]],
      body: receiptItems().map((i) => [
        i.name,
        String(i.quantity),
        i.price.toFixed(2),
        (i.price * i.quantity).toFixed(2),
      ]),
      theme: "plain",
      styles: { fontSize: 7, cellPadding: 0.8 },
      headStyles: { fontStyle: "bold", lineWidth: { top: 0.2, bottom: 0.2 } },
      margin: { left: 3, right: 3, top: 0, bottom: 0 },
      pageBreak: "avoid",
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
    });

    let fy = (doc as any).lastAutoTable.finalY + 3;
    doc.setFontSize(8);
    doc.text(`Items: 1`, 4, fy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`TOTAL Rs.${generated.price.toFixed(2)}`, width - 4, fy, { align: "right" });
    fy += 5;

    if (qrDataUrl) {
      const qrSize = width - 24;
      doc.addImage(qrDataUrl, "PNG", cx - qrSize / 2, fy, qrSize, qrSize);
      fy += qrSize + 3;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`UPI: ${upiId}`, cx, fy, { align: "center" });
    fy += 4;
    doc.text("Thank you! Visit again.", cx, fy, { align: "center" });
    return fy + 4;
  };

  /** Two-pass build: measure the content, then emit a page of exactly that height. */
  const buildPdf = () => {
    if (!generated) return null;
    const width = paper === "58mm" ? 58 : 80;
    const probe = new jsPDF({ unit: "mm", format: [width, 2000] });
    const height = Math.max(40, Math.ceil(renderPdf(probe, width)));
    const doc = new jsPDF({ unit: "mm", format: [width, height] });
    renderPdf(doc, width);
    return doc;
  };

  const handleDownloadPdf = () => {
    if (!generated) return;
    setBusy("pdf");
    try {
      const doc = buildPdf();
      if (!doc) return;
      doc.save(`${billNoOf(generated)}.pdf`);
      toast.success("PDF downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Download failed");
    } finally {
      setBusy(null);
    }
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
                <div className="flex w-full items-center gap-3">
                  <span className="text-xs font-semibold text-foreground/80">Paper Size</span>
                  <div className="inline-flex rounded-full bg-muted p-1">
                    {(["58mm", "80mm"] as PaperSize[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => updatePaper(p)}
                        className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
                          paper === p ? "bg-background shadow text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  id="custom-qr-receipt"
                  className="bg-white text-black p-4 shadow-md rounded-md font-mono"
                  style={{ width: paper === "58mm" ? 220 : 300 }}
                >
                  <div className="text-center font-bold text-base">{payeeName}</div>
                  <div className="text-center text-[10px] mt-1">
                    Bill: {billNoOf(generated)}
                    <br />
                    {dateOf(generated)}
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
                    <QRCodeSVG value={generated.payload} size={paper === "58mm" ? 110 : 140} level="M" />
                    <div className="text-[9px] mt-1">{upiId}</div>
                  </div>
                  <div className="text-center text-[10px] mt-2">
                    Thank you! Visit again.
                  </div>
                </div>
                <div className="flex w-full gap-2">
                  <Button variant="outline" className="flex-1 rounded-xl gap-1.5" onClick={handlePrint} disabled={!!busy}>
                    {busy === "print" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Printer className="h-4 w-4" />
                    )}
                    Print
                  </Button>
                  <Button variant="outline" className="flex-1 rounded-xl gap-1.5" onClick={handleDownloadPdf} disabled={!!busy}>
                    {busy === "pdf" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    PDF
                  </Button>
                </div>
                <div className="flex w-full gap-2">
                  <Button variant="secondary" className="flex-1 rounded-xl" onClick={reset}>
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
                          QRCode.toDataURL(h.payload, { width: 240, margin: 1 })
                            .then(setQrDataUrl)
                            .catch(() => {});
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
