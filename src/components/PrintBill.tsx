import { QRCodeSVG } from "qrcode.react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import type { CartItem } from "./Cart";
import { addBill } from "@/lib/billHistory";

interface Props {
  items: CartItem[];
  total: number;
  totalItems: number;
  shopName: string;
  upiId: string;
  disabled?: boolean;
}

export const PrintBill = ({ items, total, totalItems, shopName, upiId, disabled }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(shopName)}&am=${total.toFixed(
    2
  )}&cu=INR&tn=${encodeURIComponent(shopName + " Bill")}`;

  const handlePrint = () => {
    const node = ref.current;
    if (!node) return;
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    const now = Date.now();
    const billNo = `INV-${now.toString().slice(-8)}`;
    const date = new Date(now).toLocaleString("en-IN");
    addBill({
      id: crypto.randomUUID(),
      billNo,
      createdAt: now,
      items: items.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
      totalItems,
      total,
    });
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
  };

  const billNo = `INV-${Date.now().toString().slice(-8)}`;
  const date = new Date().toLocaleString("en-IN");

  return (
    <>
      <Button onClick={handlePrint} disabled={disabled} className="w-full gap-2" variant="secondary">
        <Printer className="h-4 w-4" /> Print Bill with QR
      </Button>

      {/* Hidden printable template */}
      <div className="hidden">
        <div ref={ref}>
          <h1>{shopName}</h1>
          <div className="meta">
            Bill: {billNo}<br />
            {date}
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
