import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

const SCANNER_ID = "barcode-scanner-region";

export const BarcodeScanner = ({ onScan, onClose }: Props) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ code: string; ts: number }>({ code: "", ts: 0 });

  useEffect(() => {
    const scanner = new Html5Qrcode(SCANNER_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 160 } },
        (decoded) => {
          const now = Date.now();
          if (decoded === lastScanRef.current.code && now - lastScanRef.current.ts < 1500) return;
          lastScanRef.current = { code: decoded, ts: now };
          onScan(decoded);
        },
        () => {}
      )
      .catch(() => {});

    return () => {
      scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-lg font-semibold">Scan Barcode</h2>
        <Button size="icon" variant="ghost" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="relative flex-1 overflow-hidden bg-black">
        <div id={SCANNER_ID} className="h-full w-full" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-72 rounded-lg border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
        </div>
      </div>
      <p className="p-4 text-center text-sm text-muted-foreground">
        Point your camera at a product barcode
      </p>
    </div>
  );
};
