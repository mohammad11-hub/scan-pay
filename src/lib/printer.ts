// Direct thermal printing layer (restaurant-grade POS behaviour).
//
// Priority order:
//   1. Native bridge  -> Electron preload (`window.electronPrinter.printRaw`) or an
//      Android WebView JS interface (`window.AndroidPrinter.printBase64`).
//   2. Capacitor       -> AppLauncher / Browser plugin opens the RawBT intent URL.
//   3. RawBT (Android) -> Android Intent URI with a Play Store fallback URL, then the
//      `rawbt:` URL scheme. Launch success is verified by watching for the page
//      losing visibility (RawBT coming to the foreground).
//   4. Browser         -> exact receipt-width `@page ... auto` print (desktop web only;
//      browsers forbid silent printing).

import { buildEscposReceipt, toBase64, type EscposReceipt } from "./escpos";

export type PaperSize = "58mm" | "80mm";
export type PrintMode = "auto" | "rawbt" | "native" | "usb" | "browser";

const SETTINGS_KEY = "printer_settings_v1";
const RAWBT_PACKAGE = "ru.a402d.rawbtprinter";
const RAWBT_PLAY_URL = `https://play.google.com/store/apps/details?id=${RAWBT_PACKAGE}`;

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

/* ------------------------------------------------------------------ logging */

export interface PrintLogEntry {
  t: number;
  step: string;
  detail?: string;
  level: "info" | "ok" | "error";
}

const logBuffer: PrintLogEntry[] = [];
const logListeners = new Set<(l: PrintLogEntry[]) => void>();

export const printLog = (step: string, detail?: string, level: PrintLogEntry["level"] = "info") => {
  const entry: PrintLogEntry = { t: Date.now(), step, detail, level };
  logBuffer.push(entry);
  if (logBuffer.length > 200) logBuffer.shift();
  const line = `[PRINT] ${step}${detail ? ` — ${detail}` : ""}`;
  if (level === "error") console.error(line);
  else console.log(line);
  logListeners.forEach((fn) => fn([...logBuffer]));
};

export const getPrintLogs = () => [...logBuffer];
export const clearPrintLogs = () => {
  logBuffer.length = 0;
  logListeners.forEach((fn) => fn([]));
};
export const subscribePrintLogs = (fn: (l: PrintLogEntry[]) => void) => {
  logListeners.add(fn);
  return () => logListeners.delete(fn);
};

/* --------------------------------------------------------- environment info */

const w = () => window as any;

export const hasNativeBridge = () =>
  !!(w().electronPrinter?.printRaw || w().AndroidPrinter?.printBase64 || w().AndroidPrinter?.print);

export const isAndroid = () => /Android/i.test(navigator.userAgent);

export const hasCapacitor = () => !!w().Capacitor?.isNativePlatform?.();

/** Android APK / WebView (Capacitor, Cordova, AppsGeyser, WebView wrappers, RawBT hooks). */
export const isAndroidApp = () =>
  isAndroid() &&
  (hasCapacitor() ||
    !!w().cordova ||
    !!w().AndroidPrinter ||
    !!w().RawBT ||
    /\bwv\b|Version\/[\d.]+\s+Chrome/i.test(navigator.userAgent));

/** RawBT can be attempted on any Android device (app or Chrome). */
export const canUseRawBt = () => isAndroid();

export type PrintVia = "native" | "capacitor" | "rawbt" | "browser";
export type PrintResult = {
  silent: boolean;
  via: PrintVia;
  ok: boolean;
  error?: string;
  errorCode?: "no-rawbt" | "not-android" | "native-failed" | "unknown";
};

/* --------------------------------------------------------------- native ES */

const printNative = async (bytes: Uint8Array): Promise<boolean> => {
  const b64 = toBase64(bytes);
  try {
    if (w().electronPrinter?.printRaw) {
      printLog("Native bridge: Electron printRaw");
      await w().electronPrinter.printRaw(b64);
      return true;
    }
    if (w().AndroidPrinter?.printBase64) {
      printLog("Native bridge: AndroidPrinter.printBase64");
      w().AndroidPrinter.printBase64(b64);
      return true;
    }
    if (w().AndroidPrinter?.print) {
      printLog("Native bridge: AndroidPrinter.print");
      w().AndroidPrinter.print(b64);
      return true;
    }
  } catch (e: any) {
    printLog("Native bridge threw", String(e?.message || e), "error");
  }
  return false;
};

/* ----------------------------------------------------------------- RawBT ES */

/** Watches whether the app goes to the background — proof that RawBT was launched. */
const watchAppLeft = (ms: number) =>
  new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onBlur);
      resolve(v);
    };
    const onVis = () => document.hidden && finish(true);
    const onBlur = () => finish(true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onBlur);
    setTimeout(() => finish(false), ms);
  });

const navigateTo = (url: string) => {
  // An anchor click is the most reliable way to hand a custom scheme to Android
  // from inside a WebView; iframe + location are used as extra fallbacks.
  try {
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
    return;
  } catch {}
  try {
    const f = document.createElement("iframe");
    f.style.display = "none";
    f.src = url;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1500);
    return;
  } catch {}
  window.location.href = url;
};

/** Android Intent URI understood by RawBT, with a Play Store fallback. */
const rawbtIntentUrl = (b64: string) =>
  `intent:base64,${b64}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};` +
  `S.browser_fallback_url=${encodeURIComponent(RAWBT_PLAY_URL)};end`;

const rawbtSchemeUrl = (b64: string) => `rawbt:base64,${b64}`;

/**
 * Sends raw ESC/POS to RawBT. Resolves ok=false with `no-rawbt` when the app never
 * came to the foreground (RawBT missing / intent rejected).
 */
const printRawBt = async (bytes: Uint8Array): Promise<PrintResult> => {
  const b64 = toBase64(bytes);
  printLog("ESC/POS payload ready", `${bytes.length} bytes • base64 ${b64.length} chars`);

  if (!isAndroid()) {
    printLog("RawBT unavailable — not an Android device", undefined, "error");
    return {
      silent: false,
      via: "rawbt",
      ok: false,
      errorCode: "not-android",
      error: "RawBT printing only works on Android. Open the app on your Android device.",
    };
  }

  // 1) Capacitor AppLauncher (native intent, no WebView URL restrictions).
  const cap = w().Capacitor;
  if (cap?.isNativePlatform?.()) {
    const launcher = cap.Plugins?.AppLauncher;
    if (launcher?.openUrl) {
      try {
        printLog("Launching RawBT via Capacitor AppLauncher");
        const res = await launcher.openUrl({ url: rawbtSchemeUrl(b64) });
        if (res?.completed !== false) {
          printLog("RawBT launched (Capacitor)", undefined, "ok");
          return { silent: true, via: "capacitor", ok: true };
        }
        printLog("Capacitor AppLauncher reported not completed", undefined, "error");
      } catch (e: any) {
        printLog("Capacitor AppLauncher failed", String(e?.message || e), "error");
      }
    }
  }

  // 2) Android Intent URI (preferred in WebViews and Chrome).
  const watcher = watchAppLeft(2600);
  printLog("Creating RawBT Intent", `intent:…;package=${RAWBT_PACKAGE}`);
  navigateTo(rawbtIntentUrl(b64));
  printLog("Intent sent — waiting for RawBT to open");
  let left = await watcher;

  // 3) Plain rawbt: scheme retry.
  if (!left) {
    printLog("RawBT did not open from Intent — retrying rawbt: scheme", undefined, "error");
    const watcher2 = watchAppLeft(2200);
    navigateTo(rawbtSchemeUrl(b64));
    left = await watcher2;
  }

  if (left) {
    printLog("RawBT opened — receipt handed to printer", undefined, "ok");
    return { silent: true, via: "rawbt", ok: true };
  }

  printLog("RawBT never opened", "app not installed or intent blocked", "error");
  return {
    silent: false,
    via: "rawbt",
    ok: false,
    errorCode: "no-rawbt",
    error:
      "RawBT is not installed. Please install RawBT Print Service from the Google Play Store, pair your Bluetooth thermal printer in RawBT, then print again.",
  };
};

export const openRawBtPlayStore = () => {
  printLog("Opening Play Store for RawBT");
  navigateTo(RAWBT_PLAY_URL);
};

/* -------------------------------------------------------- browser fallback */

const printBrowser = (html: string, paper: PaperSize) => {
  printLog("Browser fallback print (dialog will appear)");
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

/* --------------------------------------------------------------- entrypoint */

/**
 * One-click print. Never fails silently — always resolves with ok/error so the UI can
 * show a success or a precise error message.
 */
export const printReceipt = async (
  receipt: EscposReceipt,
  fallbackHtml: string,
  mode: PrintMode = "auto"
): Promise<PrintResult> => {
  printLog(
    "Print requested",
    `mode=${mode} • paper=${receipt.paper} • items=${receipt.items.length} • total=Rs.${receipt.total.toFixed(2)}`
  );
  printLog(
    "Environment",
    `android=${isAndroid()} • apk/webview=${isAndroidApp()} • capacitor=${hasCapacitor()} • nativeBridge=${hasNativeBridge()}`
  );

  let bytes: Uint8Array;
  try {
    bytes = buildEscposReceipt(receipt);
    printLog("Receipt generated (ESC/POS, dynamic height)", `${bytes.length} bytes`, "ok");
  } catch (e: any) {
    printLog("Receipt generation failed", String(e?.message || e), "error");
    return {
      silent: false,
      via: "browser",
      ok: false,
      errorCode: "unknown",
      error: "Could not build the receipt.",
    };
  }

  if (mode === "native" || (mode === "auto" && hasNativeBridge())) {
    if (await printNative(bytes)) {
      printLog("Print success (native bridge)", undefined, "ok");
      return { silent: true, via: "native", ok: true };
    }
    if (mode === "native") {
      return {
        silent: false,
        via: "native",
        ok: false,
        errorCode: "native-failed",
        error: "No native printer bridge found. Switch the printer method to RawBT.",
      };
    }
    printLog("Native bridge unavailable — falling through", undefined, "error");
  }

  if (mode === "rawbt" || (mode === "auto" && canUseRawBt())) {
    const res = await printRawBt(bytes);
    if (res.ok) return res;
    if (mode === "rawbt") return res; // explicit RawBT: surface the real error
    printLog("RawBT path failed in auto mode — using browser fallback", undefined, "error");
    printBrowser(fallbackHtml, receipt.paper);
    return { ...res, via: "browser", silent: false, ok: false };
  }

  printBrowser(fallbackHtml, receipt.paper);
  return {
    silent: false,
    via: "browser",
    ok: true,
    error:
      "Browsers cannot print silently. Use the Android app with RawBT for one-click thermal printing.",
  };
};
