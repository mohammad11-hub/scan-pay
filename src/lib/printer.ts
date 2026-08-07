// Direct thermal printing layer.
//
// Silent (no dialog) printing is only possible when a native bridge exists:
//   • Android APK / WebView  -> RawBT print service (rawbt: intent) or an injected
//     `AndroidPrinter` JS interface.
//   • Electron desktop       -> `window.electronPrinter.printRaw(base64)` exposed from
//     the preload script (uses webContents.print({ silent: true }) / raw ESC/POS).
// Plain browsers block silent printing for security, so there we fall back to a
// hidden-iframe print with an exact receipt-width @page (no A4, no fixed height).

import { buildEscposReceipt, toBase64, type EscposReceipt } from "./escpos";

export type PaperSize = "58mm" | "80mm";
export type PrintMode = "auto" | "rawbt" | "native" | "browser";

const SETTINGS_KEY = "printer_settings_v1";

export interface PrinterSettings {
  mode: PrintMode;
  paper: PaperSize;
}

export const getPrinterSettings = (): PrinterSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { mode: "auto", paper: "80mm", ...JSON.parse(raw) };
  } catch {}
  return { mode: "auto", paper: "80mm" };
};

export const savePrinterSettings = (s: PrinterSettings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
};

const w = () => window as any;

export const hasNativeBridge = () =>
  !!(w().electronPrinter?.printRaw || w().AndroidPrinter?.printBase64 || w().AndroidPrinter?.print);

export const isAndroidApp = () =>
  /Android/i.test(navigator.userAgent) &&
  (/wv|; wv\)/i.test(navigator.userAgent) || !!w().AndroidPrinter || !!w().RawBT);

export type PrintResult = { silent: boolean; via: "native" | "rawbt" | "browser" };

/** Silent print through a native bridge (Electron preload or Android JS interface). */
const printNative = async (bytes: Uint8Array): Promise<boolean> => {
  const b64 = toBase64(bytes);
  try {
    if (w().electronPrinter?.printRaw) {
      await w().electronPrinter.printRaw(b64);
      return true;
    }
    if (w().AndroidPrinter?.printBase64) {
      w().AndroidPrinter.printBase64(b64);
      return true;
    }
    if (w().AndroidPrinter?.print) {
      w().AndroidPrinter.print(b64);
      return true;
    }
  } catch (e) {
    console.error("native print failed", e);
  }
  return false;
};

/** RawBT print service on Android: hands raw ESC/POS to the paired thermal printer. */
const printRawBt = (bytes: Uint8Array): boolean => {
  try {
    const b64 = toBase64(bytes);
    // RawBT accepts base64 ESC/POS payloads on the `rawbt:base64,` scheme.
    window.location.href = `rawbt:base64,${b64}`;
    return true;
  } catch (e) {
    console.error("rawbt print failed", e);
    return false;
  }
};

/**
 * Browser fallback: hidden iframe, @page sized to the receipt width with `auto`
 * height so the paper is cut right after the content. The OS dialog still appears —
 * browsers do not permit silent printing.
 */
const printBrowser = (html: string, paper: PaperSize) => {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;width:0;height:0;border:0;left:-9999px;top:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: ${paper} auto; margin: 0; }
  html,body { margin:0; padding:0; background:#fff; }
  body { width:${paper}; font-family:'Courier New',monospace; color:#000; font-size:11px; padding:2mm 3mm; }
  h1 { font-size:15px; margin:0 0 4px; text-align:center; }
  .meta { text-align:center; font-size:10px; }
  hr { border:none; border-top:1px dashed #000; margin:4px 0; }
  table { width:100%; border-collapse:collapse; font-size:10px; }
  th,td { padding:1px 0; text-align:left; }
  .num { text-align:right; }
  .total { font-size:13px; font-weight:bold; }
  .qr { text-align:center; margin-top:4px; }
  .qr img { width:${paper === "58mm" ? "110px" : "140px"}; height:auto; }
  .foot { text-align:center; font-size:9px; margin-top:4px; }
  </style></head><body>${html}</body></html>`);
  doc.close();
  const fire = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => iframe.remove(), 2000);
    }
  };
  if (doc.readyState === "complete") setTimeout(fire, 150);
  else iframe.onload = () => setTimeout(fire, 150);
};

/**
 * One-click print. Uses the silent path when a native bridge / RawBT is available,
 * otherwise degrades to the browser dialog.
 */
export const printReceipt = async (
  receipt: EscposReceipt,
  fallbackHtml: string,
  mode: PrintMode = "auto"
): Promise<PrintResult> => {
  const bytes = buildEscposReceipt(receipt);

  if (mode === "native" || (mode === "auto" && hasNativeBridge())) {
    if (await printNative(bytes)) return { silent: true, via: "native" };
  }
  if (mode === "rawbt" || (mode === "auto" && isAndroidApp())) {
    if (printRawBt(bytes)) return { silent: true, via: "rawbt" };
  }
  printBrowser(fallbackHtml, receipt.paper);
  return { silent: false, via: "browser" };
};
