// Canvas-based thermal receipt image generator.
// Fixed thermal width (58mm / 80mm), fully dynamic height — no trailing whitespace.

export interface ReceiptItem {
  name: string;
  price: number;
  quantity: number;
}

export interface ReceiptData {
  shopName: string;
  billNo: string;
  date: string;
  customerPhone?: string;
  items: ReceiptItem[];
  totalItems: number;
  total: number;
  upiId: string;
  qrDataUrl?: string;
  paper: "58mm" | "80mm";
}

const SCALE = 3; // high resolution, sharp text

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Wrap a string to a max pixel width, returning the lines. */
const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const pushChunked = (word: string) => {
    // Word longer than the column: hard-break it character by character.
    let chunk = "";
    for (const ch of word) {
      if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    line = chunk;
  };
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      if (ctx.measureText(word).width > maxWidth) {
        pushChunked(word);
      } else {
        line = word;
      }
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
};

/**
 * Renders the receipt onto a canvas.
 * Two-pass: measure to compute the exact height, then draw.
 */
export const generateReceiptImage = async (data: ReceiptData): Promise<Blob> => {
  const widthPx = data.paper === "58mm" ? 384 : 576; // 203 dpi thermal widths
  const pad = data.paper === "58mm" ? 12 : 18;
  const inner = widthPx - pad * 2;

  const qrImg = data.qrDataUrl ? await loadImage(data.qrDataUrl).catch(() => null) : null;
  const qrSize = Math.min(inner, data.paper === "58mm" ? 200 : 260);

  // Column geometry
  const colQty = Math.round(inner * 0.12);
  const colRate = Math.round(inner * 0.2);
  const colAmt = Math.round(inner * 0.22);
  const colName = inner - colQty - colRate - colAmt - 8;

  const F = data.paper === "58mm" ? 0.86 : 1;
  const fzShop = Math.round(30 * F);
  const fzMeta = Math.round(17 * F);
  const fzBody = Math.round(18 * F);
  const fzTotal = Math.round(25 * F);
  const lh = Math.round(fzBody * 1.35);

  const mono = (size: number, bold = false) =>
    `${bold ? "bold " : ""}${size}px "Noto Sans", "Segoe UI", Arial, sans-serif`;

  // ---- Pass 1: measure ----
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = mono(fzBody);
  const itemLines = data.items.map((i) => wrapText(measure, i.name, colName));

  let h = pad;
  h += fzShop + 10; // shop name
  h += (fzMeta + 5) * (2 + (data.customerPhone ? 1 : 0)); // bill, date, customer
  h += 12; // divider
  h += lh + 8; // table head + rule
  itemLines.forEach((lines) => {
    h += lh * lines.length + 4;
  });
  h += 12; // divider
  h += lh; // total items
  h += fzTotal + 14; // grand total
  h += 12; // divider
  if (qrImg) h += fzMeta + 8 + qrSize + 8;
  h += fzMeta + 6; // upi id
  h += fzMeta + 12; // amount
  h += 12; // divider
  h += (fzBody + 4) * 2 + fzMeta + 4; // footer
  h += pad;

  const heightPx = Math.ceil(h);

  // ---- Pass 2: draw ----
  const canvas = document.createElement("canvas");
  canvas.width = widthPx * SCALE;
  canvas.height = heightPx * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  const cx = widthPx / 2;
  let y = pad;

  const center = (text: string, size: number, bold = false) => {
    ctx.font = mono(size, bold);
    ctx.textAlign = "center";
    ctx.fillText(text, cx, y);
    y += size + 5;
  };

  const dashed = () => {
    y += 4;
    ctx.save();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad, y + 0.5);
    ctx.lineTo(widthPx - pad, y + 0.5);
    ctx.stroke();
    ctx.restore();
    y += 8;
  };

  center(data.shopName, fzShop, true);
  y += 5;
  center(`Bill: ${data.billNo}`, fzMeta);
  center(data.date, fzMeta);
  if (data.customerPhone) center(`Customer: +91 ${data.customerPhone}`, fzMeta);

  dashed();

  // Table header
  const xName = pad;
  const xQty = pad + colName + 8 + colQty;
  const xRate = xQty + colRate;
  const xAmt = xRate + colAmt;
  ctx.font = mono(fzBody, true);
  ctx.textAlign = "left";
  ctx.fillText("Item", xName, y);
  ctx.textAlign = "right";
  ctx.fillText("Qty", xQty, y);
  ctx.fillText("Rate", xRate, y);
  ctx.fillText("Amt", xAmt, y);
  y += lh;
  ctx.save();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, y - 2.5);
  ctx.lineTo(widthPx - pad, y - 2.5);
  ctx.stroke();
  ctx.restore();
  y += 4;

  data.items.forEach((item, idx) => {
    const lines = itemLines[idx];
    ctx.font = mono(fzBody);
    const rowTop = y;
    ctx.textAlign = "left";
    lines.forEach((line, li) => ctx.fillText(line, xName, rowTop + li * lh));
    ctx.textAlign = "right";
    ctx.fillText(String(item.quantity), xQty, rowTop);
    ctx.fillText(item.price.toFixed(2), xRate, rowTop);
    ctx.fillText((item.price * item.quantity).toFixed(2), xAmt, rowTop);
    y = rowTop + lines.length * lh + 4;
  });

  dashed();

  ctx.font = mono(fzBody);
  ctx.textAlign = "left";
  ctx.fillText("Total Items", pad, y);
  ctx.textAlign = "right";
  ctx.fillText(String(data.totalItems), widthPx - pad, y);
  y += lh;

  ctx.font = mono(fzTotal, true);
  ctx.textAlign = "left";
  ctx.fillText("GRAND TOTAL", pad, y);
  ctx.textAlign = "right";
  ctx.fillText(`Rs.${data.total.toFixed(2)}`, widthPx - pad, y);
  y += fzTotal + 14;

  dashed();

  if (qrImg) {
    center("Scan to Pay (UPI)", fzMeta);
    y += 3;
    ctx.drawImage(qrImg, cx - qrSize / 2, y, qrSize, qrSize);
    y += qrSize + 8;
  }
  center(data.upiId, fzMeta);
  center(`Rs.${data.total.toFixed(2)}`, fzMeta, true);
  y += 7;

  dashed();

  center("Thank You!", fzBody, true);
  center("Visit Again", fzBody);
  center(data.shopName, fzMeta);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
  );
};
