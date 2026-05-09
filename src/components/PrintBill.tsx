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
import { toPng } from "html-to-image";
import QRCode from "qrcode";
import type { CartItem } from "./Cart";
import { addBill } from "@/lib/billHistory";

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
  const [paper, setPaper] = useState<PaperSize>("80mm");
  const [bill, setBill] = useState<{ billNo: string; date: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

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

  const buildPdf = () => {
    if (!bill) return null;
    const width = paper === "58mm" ? 58 : 80;
    const doc = new jsPDF({ unit: "mm", format: [width, 220] });
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
      margin: { left: 3, right: 3 },
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
    return doc;
  };

  const handlePrint = () => {
    if (!receiptRef.current || !bill) return;
    setBusy("print");
    try {
      const w = window.open("", "_blank", "width=420,height=640");
      if (!w) {
        toast.error("Pop-up blocked");
        return;
      }
      const widthMm = paper === "58mm" ? "58mm" : "80mm";
      w.document.write(`<!doctype html><html><head><title>${bill.billNo}</title>
<style>
  @page { size: ${widthMm} auto; margin: 3mm; }
  body { font-family: 'Courier New', monospace; color:#000; font-size:11px; margin:0; padding:6px; width:${widthMm}; }
  h1 { font-size:15px; margin:0 0 4px; text-align:center; }
  .meta { text-align:center; font-size:10px; margin-bottom:4px; }
  hr { border:none; border-top:1px dashed #000; margin:4px 0; }
  table { width:100%; border-collapse:collapse; font-size:10px; }
  th, td { padding:2px 0; text-align:left; }
  .num { text-align:right; }
  .total { font-size:13px; font-weight:bold; }
  .qr { display:flex; flex-direction:column; align-items:center; margin-top:6px; }
  .qr img { width: ${paper === "58mm" ? "120px" : "150px"}; height: auto; }
  .foot { text-align:center; font-size:9px; margin-top:4px; }
</style></head><body>
<h1>${shopName}</h1>
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
<div class="foot">Thank you! Visit again.</div>
<script>window.onload=()=>{setTimeout(()=>{window.print();},250);};<\/script>
</body></html>`);
      w.document.close();
      toast.success("Print preview opened");
    } catch (e) {
      console.error(e);
      toast.error("Print failed");
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
    if (!bill || !receiptRef.current) return;
    const phone = sanitizePhone(customerPhone);
    setBusy("share");
    try {
      // Render receipt card to image
      const dataUrl = await toPng(receiptRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `${bill.billNo}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      const nav: any = navigator;
      const canShareFile = nav.canShare && nav.canShare({ files: [file] });

      if (canShareFile) {
        try {
          await nav.share({
            files: [file],
            title: `${shopName} Receipt`,
            text: `${shopName} - Bill ${bill.billNo}\nTotal: Rs.${total.toFixed(2)}\nThank you!`,
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
                Choose paper size and action
              </DialogDescription>
            </DialogHeader>
            <div className="mt-3 inline-flex rounded-full bg-white/60 p-1 backdrop-blur">
              {(["58mm", "80mm"] as PaperSize[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPaper(p)}
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
