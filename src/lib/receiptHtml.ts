// Shared receipt markup for the browser print fallback.
// One continuous thermal receipt: header → items → totals → UPI QR → thank-you,
// all in one flow. The totals/QR/footer block is wrapped in `.endblock` so it
// can never be pushed to a separate printed page (see browserReceiptCss).

import type { CartItem } from "@/components/Cart";

export interface ReceiptData {
  shopName: string;
  billNo: string;
  date: string;
  customerPhone?: string;
  items: Pick<CartItem, "id" | "name" | "price" | "quantity">[];
  totalItems: number;
  total: number;
  upiId: string;
  qrDataUrl: string;
}

export const buildReceiptHtml = (d: ReceiptData): string =>
  `<h1>${d.shopName}</h1>
<div class="meta">Bill: ${d.billNo}<br/>${d.date}${
    d.customerPhone ? `<br/>Customer: +91 ${d.customerPhone}` : ""
  }</div>
<hr/>
<table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amt</th></tr></thead>
<tbody>${d.items
    .map(
      (i) =>
        `<tr><td>${i.name}</td><td class="num">${i.quantity}</td><td class="num">${i.price.toFixed(
          2
        )}</td><td class="num">${(i.price * i.quantity).toFixed(2)}</td></tr>`
    )
    .join("")}</tbody></table>
<hr/>
<div class="endblock"><table><tbody>
<tr><td>Total Items</td><td class="num">${d.totalItems}</td></tr>
<tr class="total"><td>TOTAL</td><td class="num">Rs.${d.total.toFixed(2)}</td></tr>
</tbody></table>
<hr/>
<div class="qr"><div>Scan to Pay (UPI)</div>${
    d.qrDataUrl ? `<img src="${d.qrDataUrl}" alt="UPI QR"/>` : ""
  }<div style="font-size:9px;margin-top:3px;">${d.upiId}</div></div>
<div class="foot">Thank you! Visit again.</div></div>`;
