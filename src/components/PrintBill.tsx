import { QRCodeSVG } from "qrcode.react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Printer, Share2, Download, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import type { CartItem } from "./Cart";
import { addBill } from "@/lib/billHistory";
import { generateReceiptImage } from "@/lib/receiptImage";
import {
  printReceipt,
  getPrinterSettings,
  savePrinterSettings,
  hasNativeBridge,
  isAndroidApp,
  isAndroid,
  openRawBtPlayStore,
  printLog,
  subscribePrintLogs,
  clearPrintLogs,
  getPrintLogs,
  type PrintLogEntry,
  type PrintMode,
} from "@/lib/printer";


interface Props {
  items: CartItem[];
  total: number;
  totalItems: number;
  shopName: string;
  upiId: string;
  customerPhone?: string;
  disabled?: boolean;
}

type PaperSize = "58mm" | "80mm";

export const PrintBill = ({
  items,
  total,
  totalItems,
  shopName,
  upiId,
  customerPhone,
  disabled,
}: Props) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "print" | "pdf" | "share">(null);
  const [paper, setPaper] = useState<PaperSize>(() => getPrinterSettings().paper);
  const [printMode, setPrintMode] = useState<PrintMode>(() => getPrinterSettings().mode);
  const [bill, setBill] = useState<{ billNo: string; date: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<PrintLogEntry[]>(() => getPrintLogs());
  const canPrintSilently = hasNativeBridge() || isAndroidApp() || isAndroid();

  useEffect(() => subscribePrintLogs(setLogs), []);


  const updatePaper = (p: PaperSize) => {
    setPaper(p);
    savePrinterSettings({ mode: printMode, paper: p });
  };
  const updateMode = (m: PrintMode) => {
    setPrintMode(m);
    savePrinterSettings({ mode: m, paper });
  };

  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(shopName)}&am=${total.toFixed(
    2
  )}&cu=INR&tn=${encodeURIComponent(shopName + " Bill")}`;

  const sanitizePhone = (raw?: string) => {
    if (!raw) return "";
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10) return `91${digits}`;
    return digits;
  };

  const openPreview = async () => {
    if (items.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    const now = Date.now();
    const billNo = `INV-${now.toString().slice(-8)}`;
    const date = new Date(now).toLocaleString("en-IN");
    addBill({
      id: crypto.randomUUID(),
      billNo,
      createdAt: now,
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
      })),
      totalItems,
      total,
    });
    setBill({ billNo, date });
    try {
      const dataUrl = await QRCode.toDataURL(upiUrl, { width: 240, margin: 1 });
      setQrDataUrl(dataUrl);
    } catch {}
    setOpen(true);
  };

  // Renders the receipt into `doc` and returns the content height in mm.
  const renderPdf = (doc: jsPDF, width: number) => {
    if (!bill) return 0;
    const cx = width / 2;
    let y = 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(shopName, cx, y, { align: "center" });
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Bill: ${bill.billNo}`, cx, y, { align: "center" });
    y += 4;
    doc.text(bill.date, cx, y, { align: "center" });
    if (customerPhone) {
      y += 4;
      doc.text(`Customer: +91 ${customerPhone}`, cx, y, { align: "center" });
    }
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["Item", "Qty", "Rate", "Amt"]],
      body: items.map((i) => [
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
    doc.text(`Items: ${totalItems}`, 4, fy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`TOTAL Rs.${total.toFixed(2)}`, width - 4, fy, { align: "right" });
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
    if (!bill) return null;
    const width = paper === "58mm" ? 58 : 80;
    const probe = new jsPDF({ unit: "mm", format: [width, 2000] });
    const height = Math.max(40, Math.ceil(renderPdf(probe, width)));
    const doc = new jsPDF({ unit: "mm", format: [width, height] });
    renderPdf(doc, width);
    return doc;
  };


  const receiptHtml = () => {
    if (!bill) return "";
    return `<h1>${shopName}</h1>
<div class="meta">Bill: ${bill.billNo}<br/>${bill.date}${
      customerPhone ? `<br/>Customer: +91 ${customerPhone}` : ""
    }</div>
<hr/>
<table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amt</th></tr></thead>
<tbody>${items
      .map(
        (i) =>
          `<tr><td>${i.name}</td><td class="num">${i.quantity}</td><td class="num">${i.price.toFixed(
            2
          )}</td><td class="num">${(i.price * i.quantity).toFixed(2)}</td></tr>`
      )
      .join("")}</tbody></table>
<hr/>
<table><tbody>
<tr><td>Total Items</td><td class="num">${totalItems}</td></tr>
<tr class="total"><td>TOTAL</td><td class="num">Rs.${total.toFixed(2)}</td></tr>
</tbody></table>
<hr/>
<div class="qr"><div>Scan to Pay (UPI)</div>${
      qrDataUrl ? `<img src="${qrDataUrl}" alt="UPI QR"/>` : ""
    }<div style="font-size:9px;margin-top:3px;">${upiId}</div></div>
<div class="foot">Thank you! Visit again.</div>`;
  };

  const handlePrint = async () => {
    if (!bill) return;
    setBusy("print");
    try {
      const res = await printReceipt(
        {
          shopName,
          billNo: bill.billNo,
          date: bill.date,
          customerPhone,
          items: items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
          totalItems,
          total,
          upiId,
          upiUrl,
          paper,
        },
        receiptHtml(),
        printMode
      );
      if (res.ok && res.silent) {
        toast.success("Print Successful", {
          description: `Receipt sent to your ${paper} thermal printer via ${res.via === "rawbt" || res.via === "capacitor" ? "RawBT" : "printer bridge"}.`,
        });
        setOpen(false);
      } else if (res.errorCode === "no-rawbt") {
        toast.error("RawBT is not installed", {
          description: res.error,
          duration: 12000,
          action: { label: "Install", onClick: () => openRawBtPlayStore() },
        });
        setShowLogs(true);
      } else if (!res.ok) {
        toast.error("Printing failed", { description: res.error, duration: 10000 });
        setShowLogs(true);
      } else {
        toast.info("Browser print", { description: res.error });
      }
    } catch (e: any) {
      printLog("Unhandled print exception", String(e?.message || e), "error");
      toast.error("Printing failed", { description: String(e?.message || e) });
      setShowLogs(true);
    } finally {
      setBusy(null);
    }
  };



  const handleDownloadPdf = () => {
    if (!bill) return;
    setBusy("pdf");
    try {
      const doc = buildPdf();
      if (!doc) return;
      doc.save(`${bill.billNo}.pdf`);
      toast.success("PDF downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Download failed");
    } finally {
      setBusy(null);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!bill) return;
    const phone = sanitizePhone(customerPhone);
    setBusy("share");
    try {
      // Generate a professional thermal receipt PNG (dynamic height, fixed width)
      const blob = await generateReceiptImage({
        shopName,
        billNo: bill.billNo,
        date: bill.date,
        customerPhone,
        items: items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
        totalItems,
        total,
        upiId,
        qrDataUrl,
        paper,
      });
      const fileName = `${bill.billNo}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      const nav: any = navigator;
      const canShareFile = nav.canShare && nav.canShare({ files: [file] });

      // If we have a customer phone, ALWAYS go directly to that WhatsApp chat
      // (the native share sheet cannot target a specific contact).
      if (!phone && canShareFile) {
        try {
          await nav.share({
            files: [file],
            title: `${shopName} Receipt`,
            text:
              `*${shopName}*\nBill: ${bill.billNo}\nDate: ${bill.date}\n` +
              (customerPhone ? `Customer: +91 ${customerPhone}\n` : "") +
              `\n*Items (${totalItems}):*\n` +
              items
                .map(
                  (i, idx) =>
                    `${idx + 1}. ${i.name} x${i.quantity} = Rs.${(
                      i.price * i.quantity
                    ).toFixed(2)}`
                )
                .join("\n") +
              `\n\n*Total: Rs.${total.toFixed(2)}*\nThank you!`,
          });
          toast.success("Receipt shared");
          return;
        } catch (e: any) {
          if (e?.name === "AbortError") return;
        }
      }

      // Fallback: download image + open WhatsApp chat directly with phone
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      const itemLines = items
        .map(
          (i, idx) =>
            `${idx + 1}. ${i.name} x${i.quantity} @ Rs.${i.price.toFixed(2)} = Rs.${(
              i.price * i.quantity
            ).toFixed(2)}`
        )
        .join("\n");

      const message =
        `*${shopName}*\nBill: ${bill.billNo}\nDate: ${bill.date}\n` +
        (customerPhone ? `Customer: +91 ${customerPhone}\n` : "") +
        `\n*Items (${totalItems}):*\n${itemLines}\n` +
        `\n*Total: Rs.${total.toFixed(2)}*\n` +
        `\nPay UPI: ${upiId}\n` +
        `\nReceipt image downloaded — please attach it here.\nThank you!`;

      const waUrl = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;
      const win = window.open(waUrl, "_blank");
      if (!win) {
        // Last resort if popup blocked
        window.location.href = waUrl;
      }
      toast.success("Receipt downloaded — WhatsApp opened");
    } catch (e) {
      console.error(e);
      toast.error("Could not share receipt");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button
        onClick={openPreview}
        disabled={disabled}
        className="w-full gap-2 rounded-xl"
        variant="secondary"
      >
        <Receipt className="h-4 w-4" />
        Print Bill with QR
      </Button>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-white/40 backdrop-blur-xl bg-white/80 rounded-2xl">
          <div
            className="px-6 pt-6 pb-4"
            style={{ background: "var(--gradient-primary)" }}
          >
            <DialogHeader>
              <DialogTitle className="text-foreground">Receipt Preview</DialogTitle>
              <DialogDescription className="text-foreground/70">
                Choose paper size, printer method and action
              </DialogDescription>
            </DialogHeader>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full bg-white/60 p-1 backdrop-blur">
                {(["58mm", "80mm"] as PaperSize[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => updatePaper(p)}
                    className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
                      paper === p
                        ? "bg-white shadow text-foreground"
                        : "text-foreground/60"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-full bg-white/60 p-1 backdrop-blur">
                {(
                  [
                    ["auto", "Auto"],
                    ["rawbt", "RawBT"],
                    ["native", "Native"],
                    ["browser", "Browser"],
                  ] as [PrintMode, string][]
                ).map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => updateMode(m)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
                      printMode === m
                        ? "bg-white shadow text-foreground"
                        : "text-foreground/60"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[11px] text-foreground/60">
              {canPrintSilently
                ? "Direct thermal printing ready — one click, no print dialog."
                : "Web browsers block silent printing. In the Android app (RawBT) or desktop app, printing starts instantly with no dialog."}
            </p>

          </div>

          <div className="px-4 pb-4 max-h-[55vh] overflow-y-auto">
            {bill && (
              <div className="flex justify-center py-3">
                <div
                  ref={receiptRef}
                  className="bg-white text-black p-4 shadow-md rounded-md font-mono"
                  style={{ width: paper === "58mm" ? 220 : 300 }}
                >
                  <div className="text-center font-bold text-base">{shopName}</div>
                  <div className="text-center text-[10px] mt-1">
                    Bill: {bill.billNo}
                    <br />
                    {bill.date}
                    {customerPhone && (
                      <>
                        <br />
                        Customer: +91 {customerPhone}
                      </>
                    )}
                  </div>
                  <div className="border-t border-dashed border-black my-2" />
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-dashed border-black">
                        <th className="text-left py-0.5">Item</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Rate</th>
                        <th className="text-right">Amt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i) => (
                        <tr key={i.id}>
                          <td className="py-0.5">{i.name}</td>
                          <td className="text-right">{i.quantity}</td>
                          <td className="text-right">{i.price.toFixed(2)}</td>
                          <td className="text-right">
                            {(i.price * i.quantity).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="border-t border-dashed border-black my-2" />
                  <div className="flex justify-between text-[11px]">
                    <span>Total Items</span>
                    <span>{totalItems}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm mt-1">
                    <span>TOTAL</span>
                    <span>Rs.{total.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-dashed border-black my-2" />
                  <div className="flex flex-col items-center">
                    <div className="text-[10px] mb-1">Scan to Pay (UPI)</div>
                    <QRCodeSVG value={upiUrl} size={paper === "58mm" ? 110 : 140} level="M" />
                    <div className="text-[9px] mt-1">{upiId}</div>
                  </div>
                  <div className="text-center text-[10px] mt-2">
                    Thank you! Visit again.
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 p-4 border-t border-white/40 bg-white/40 backdrop-blur">
            <Button
              variant="outline"
              onClick={handlePrint}
              disabled={!!busy}
              className="rounded-xl gap-1.5"
            >
              {busy === "print" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              Print
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadPdf}
              disabled={!!busy}
              className="rounded-xl gap-1.5"
            >
              {busy === "pdf" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              PDF
            </Button>
            <Button
              onClick={handleShareWhatsApp}
              disabled={!!busy}
              className="rounded-xl gap-1.5"
              style={{ background: "var(--gradient-primary)", color: "hsl(var(--foreground))" }}
            >
              {busy === "share" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              Share
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
