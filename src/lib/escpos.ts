// ESC/POS receipt builder — produces raw printer bytes for direct (silent) thermal printing.
// No page size, no dialog: the printer feeds exactly as many lines as the content needs.

export interface EscposItem {
  name: string;
  price: number;
  quantity: number;
}

export interface EscposReceipt {
  shopName: string;
  billNo: string;
  date: string;
  customerPhone?: string;
  items: EscposItem[];
  totalItems: number;
  total: number;
  upiId: string;
  upiUrl: string;
  paper: "58mm" | "80mm";
}

const ESC = 0x1b;
const GS = 0x1d;

/** Characters per line for Font A at 203dpi. */
export const charsPerLine = (paper: "58mm" | "80mm") => (paper === "58mm" ? 32 : 48);

const enc = (s: string) => {
  // CP437-ish: strip anything non-ASCII so no printer garbles appear.
  const clean = s.replace(/[^\x20-\x7E\n]/g, "");
  const out = new Uint8Array(clean.length);
  for (let i = 0; i < clean.length; i++) out[i] = clean.charCodeAt(i) & 0xff;
  return out;
};

class Builder {
  private parts: Uint8Array[] = [];
  raw(...bytes: number[]) {
    this.parts.push(new Uint8Array(bytes));
    return this;
  }
  text(s: string) {
    this.parts.push(enc(s));
    return this;
  }
  line(s = "") {
    return this.text(s + "\n");
  }
  align(a: "left" | "center" | "right") {
    return this.raw(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2);
  }
  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  size(double: boolean) {
    return this.raw(GS, 0x21, double ? 0x11 : 0x00);
  }
  qr(data: string, moduleSize = 6) {
    const d = enc(data);
    const len = d.length + 3;
    this.raw(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model 2
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize); // module size
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31); // ecc level M
    this.raw(GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30);
    this.parts.push(d);
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // print
    return this;
  }
  build() {
    const total = this.parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

const pad = (s: string, w: number, right = false) => {
  const t = s.length > w ? s.slice(0, w) : s;
  const sp = " ".repeat(Math.max(0, w - t.length));
  return right ? sp + t : t + sp;
};

/** Wrap plain text to a character width. */
const wrap = (text: string, w: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    if (word.length > w) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      for (let i = 0; i < word.length; i += w) lines.push(word.slice(i, i + w));
      continue;
    }
    const c = cur ? `${cur} ${word}` : word;
    if (c.length <= w) cur = c;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
};

export const buildEscposReceipt = (r: EscposReceipt): Uint8Array => {
  const W = charsPerLine(r.paper);
  const wQty = 4;
  const wRate = r.paper === "58mm" ? 7 : 9;
  const wAmt = r.paper === "58mm" ? 8 : 10;
  const wName = W - wQty - wRate - wAmt;
  const rule = "-".repeat(W);

  const b = new Builder();
  b.raw(ESC, 0x40); // init
  b.align("center").bold(true).size(true).line(r.shopName).size(false).bold(false);
  b.line(`Bill: ${r.billNo}`);
  b.line(r.date);
  if (r.customerPhone) b.line(`Customer: +91 ${r.customerPhone}`);
  b.align("left").line(rule);
  b.bold(true)
    .line(pad("Item", wName) + pad("Qty", wQty, true) + pad("Rate", wRate, true) + pad("Amt", wAmt, true))
    .bold(false);
  b.line(rule);

  for (const it of r.items) {
    const nameLines = wrap(it.name, wName);
    b.line(
      pad(nameLines[0], wName) +
        pad(String(it.quantity), wQty, true) +
        pad(it.price.toFixed(2), wRate, true) +
        pad((it.price * it.quantity).toFixed(2), wAmt, true)
    );
    for (let i = 1; i < nameLines.length; i++) b.line(pad(nameLines[i], wName));
  }

  b.line(rule);
  b.line(pad("Total Items", W - 6) + pad(String(r.totalItems), 6, true));
  b.bold(true).size(true);
  const totalStr = `Rs.${r.total.toFixed(2)}`;
  const half = Math.floor(W / 2);
  b.line(pad("TOTAL", half - totalStr.length > 0 ? half - totalStr.length : 1) + totalStr);
  b.size(false).bold(false);
  b.line(rule);

  b.align("center").line("Scan to Pay (UPI)");
  b.qr(r.upiUrl, r.paper === "58mm" ? 5 : 7);
  b.line();
  b.line(r.upiId);
  b.bold(true).line(`Rs.${r.total.toFixed(2)}`).bold(false);
  b.line(rule);
  b.bold(true).line("Thank You!").bold(false);
  b.line("Visit Again");
  b.line(r.shopName);
  b.line();
  b.raw(GS, 0x56, 0x42, 0x00); // feed + partial cut (ignored by printers without cutter)
  return b.build();
};

export const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
