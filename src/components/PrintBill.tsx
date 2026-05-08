import { QRCodeSVG } from "qrcode.react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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

export const PrintBill = ({ items, total, totalItems, shopName, upiId, customerPhone, disabled }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(shopName)}&am=${total.toFixed(
    2
  )}&cu=INR&tn=${encodeURIComponent(shopName + " Bill")}`;

  const recordBill = () => {
    const now = Date.now();
    const billNo = `INV-${now.toString().slice(-8)}`;
    addBill({
      id: crypto.randomUUID(),
      billNo,
      createdAt: now,
      items: items.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
      totalItems,
      total,
    });
    return { billNo, date: new Date(now).toLocaleString("en-IN") };
  };

  const handlePrint = async () => {
    const node = ref.current;
    if (!node) return;
    const { billNo, date } = recordBill();

    // Open print window
    const win = window.open("", "_blank", "width=400,height=600");
    if (win) {
      win.document.write(`<!doctype html><html><head><title>${billNo}</title>
        <style>
          @page { size: 80mm auto; margin: 4mm; }
          * { box-sizing: border-box; }
          body { font-family: 'Courier New', monospace; color:#000; font-size:12px; margin:0; padding:8px; width:80mm; }
          h1 { font-size:16px; margin:0 0 4px; text-align:center; }
          .meta { text-align:center; font-size:11px; margin-bottom:6px; }
          hr { border:none; border-top:1px dashed #000; margin:6px 0; }
          table { width:100%; border-collapse:collapse; font-size:11px; }
          th, td { padding:2px 0; text-align:left; }
          .num { text-align:right; }
          .total { font-size:14px; font-weight:bold; }
          .qr { display:flex; flex-direction:column; align-items:center; margin-top:8px; }
          .foot { text-align:center; font-size:10px; margin-top:6px; }
        </style></head><body>${node.innerHTML}
        <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300);}<\/script>
        </body></html>`);
      win.document.close();
    }

    // Auto-share PDF via WhatsApp if phone number is provided
    if (customerPhone && customerPhone.trim()) {
      await sharePdfToWhatsApp(billNo, date);
    }
  };

  const sharePdfToWhatsApp = async (billNo: string, date: string) => {
    setSharing(true);
    try {
      const doc = buildPdf(billNo, date);
      const blob = doc.output("blob");
      const fileName = `${billNo}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });
      const phone = sanitizePhone(customerPhone!);

      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: billNo });
          toast.success("Bill PDF shared");
          return;
        } catch (e: any) {
          if (e?.name === "AbortError") return;
        }
      }

      // Fallback: download PDF and open WhatsApp chat
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      const waUrl = `https://wa.me/${phone}`;
      window.open(waUrl, "_blank");
      toast.success("PDF downloaded. Attach it in WhatsApp chat.");
    } catch (err) {
      console.error(err);
      toast.error("Could not share PDF");
    } finally {
      setSharing(false);
    }
  };

  const sanitizePhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    // If 10-digit Indian number, prepend country code
    if (digits.length === 10) return `91${digits}`;
    return digits;
  };

  const buildPdf = (billNo: string, date: string) => {
    const doc = new jsPDF({ unit: "mm", format: [80, 200] });
    let y = 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(shopName, 40, y, { align: "center" });
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Bill: ${billNo}`, 40, y, { align: "center" });
    y += 4;
    doc.text(date, 40, y, { align: "center" });
    if (customerPhone) {
      y += 4;
      doc.text(`Customer: ${customerPhone}`, 40, y, { align: "center" });
    }
    y += 3;

    autoTable(doc, {
      startY: y,
      head: [["Item", "Qty", "Rate", "Amt"]],
      body: items.map((i) => [i.name, String(i.quantity), i.price.toFixed(2), (i.price * i.quantity).toFixed(2)]),
      theme: "plain",
      styles: { fontSize: 8, cellPadding: 1 },
      headStyles: { fontStyle: "bold", lineWidth: { top: 0.2, bottom: 0.2 } },
      margin: { left: 4, right: 4 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
    });

    // @ts-ignore
    let finalY = (doc as any).lastAutoTable.finalY + 4;
    doc.setFontSize(9);
    doc.text(`Total Items: ${totalItems}`, 6, finalY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`TOTAL: Rs.${total.toFixed(2)}`, 74, finalY, { align: "right" });
    finalY += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`UPI: ${upiId}`, 40, finalY, { align: "center" });
    finalY += 5;
    doc.text("Thank you! Visit again.", 40, finalY, { align: "center" });

    return doc;
  };

  const handleShareWhatsApp = async () => {
    if (!customerPhone || !customerPhone.trim()) {
      toast.error("Add customer phone number first");
      return;
    }
    if (items.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setSharing(true);
    try {
      const { billNo, date } = recordBill();
      const doc = buildPdf(billNo, date);
      const blob = doc.output("blob");
      const fileName = `${billNo}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });

      const phone = sanitizePhone(customerPhone);
      const message =
        `*${shopName}*\n` +
        `Bill: ${billNo}\n` +
        `Date: ${date}\n` +
        `Items: ${totalItems}\n` +
        `Total: Rs.${total.toFixed(2)}\n\n` +
        `Thank you for your purchase!`;

      // Try native share with file (works on mobile, will offer WhatsApp)
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: billNo, text: message });
          toast.success("Shared bill via WhatsApp");
          setSharing(false);
          return;
        } catch (e: any) {
          if (e?.name === "AbortError") {
            setSharing(false);
            return;
          }
        }
      }

      // Fallback: download PDF + open WhatsApp chat with text message
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, "_blank");
      toast.success("PDF downloaded. Attach it in WhatsApp chat.");
    } catch (err) {
      console.error(err);
      toast.error("Could not share bill");
    } finally {
      setSharing(false);
    }
  };

  const billNo = `INV-${Date.now().toString().slice(-8)}`;
  const date = new Date().toLocaleString("en-IN");

  return (
    <>
      <Button onClick={handlePrint} disabled={disabled || sharing} className="w-full gap-2" variant="secondary">
        {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        {sharing ? "Sharing PDF..." : "Print Bill with QR"}
      </Button>

      {/* Hidden printable template */}
      <div className="hidden">
        <div ref={ref}>
          <h1>{shopName}</h1>
          <div className="meta">
            Bill: {billNo}<br />
            {date}
            {customerPhone ? <><br />Customer: {customerPhone}</> : null}
          </div>
          <hr />
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Qty</th>
                <th className="num">Rate</th>
                <th className="num">Amt</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td className="num">{i.quantity}</td>
                  <td className="num">{i.price}</td>
                  <td className="num">{(i.price * i.quantity).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <hr />
          <table>
            <tbody>
              <tr>
                <td>Total Items</td>
                <td className="num">{totalItems}</td>
              </tr>
              <tr className="total">
                <td>TOTAL</td>
                <td className="num">₹{total.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <hr />
          <div className="qr">
            <div>Scan to Pay (UPI)</div>
            <QRCodeSVG value={upiUrl} size={140} level="M" />
            <div style={{ fontSize: 10, marginTop: 4 }}>{upiId}</div>
          </div>
          <div className="foot">Thank you! Visit again.</div>
        </div>
      </div>
    </>
  );
};
