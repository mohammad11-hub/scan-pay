import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Keyboard } from "lucide-react";

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

const SCANNER_ID = "barcode-scanner-region";

// Common 1D + QR formats used in Indian retail
const FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
];

export const BarcodeScanner = ({ onScan, onClose }: Props) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ code: string; ts: number }>({ code: "", ts: 0 });
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(SCANNER_ID, { formatsToSupport: FORMATS, verbose: false });
    scannerRef.current = scanner;

    const config = {
      fps: 15,
      qrbox: (vw: number, vh: number) => {
        // Wide rectangle works much better for 1D barcodes than a square
        const w = Math.min(Math.floor(vw * 0.85), 480);
        const h = Math.max(120, Math.floor(w * 0.4));
        return { width: w, height: h };
      },
      aspectRatio: 1.7778,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    } as any;

    scanner
      .start(
        { facingMode: "environment" },
        config,
        (decoded) => {
          const now = Date.now();
          if (decoded === lastScanRef.current.code && now - lastScanRef.current.ts < 1500) return;
          lastScanRef.current = { code: decoded, ts: now };
          onScan(decoded);
        },
        () => {}
      )
      .catch((e) => {
        setError(typeof e === "string" ? e : e?.message ?? "Unable to start camera");
      });

    return () => {
      scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {});
    };
  }, [onScan]);

  const submitManual = () => {
    const code = manual.trim();
    if (!code) return;
    onScan(code);
    setManual("");
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-lg font-semibold">Scan Barcode</h2>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setShowManual((v) => !v)} title="Enter manually">
            <Keyboard className="h-5 w-5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden bg-black">
        <div id={SCANNER_ID} className="h-full w-full" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-32 w-[85%] max-w-[480px] rounded-lg border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
            <div className="relative h-full w-full overflow-hidden">
              <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-primary" />
            </div>
          </div>
        </div>
        {error && (
          <div className="absolute inset-x-4 bottom-4 rounded-md bg-destructive/90 p-3 text-sm text-destructive-foreground">
            {error}
          </div>
        )}
      </div>
      {showManual ? (
        <div className="flex gap-2 border-t p-3">
          <Input
            autoFocus
            inputMode="numeric"
            placeholder="Enter barcode number"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitManual()}
          />
          <Button onClick={submitManual}>Add</Button>
        </div>
      ) : (
        <p className="p-4 text-center text-sm text-muted-foreground">
          Hold the barcode flat & fill the box. Tap ⌨️ to type it manually.
        </p>
      )}
    </div>
  );
};
