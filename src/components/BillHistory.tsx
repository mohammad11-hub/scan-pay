import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { History, Download, Trash2, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  type BillRecord,
  billsByDate,
  clearBills,
  getDateKey,
  readBills,
  removeBill,
} from "@/lib/billHistory";

const todayKey = () => getDateKey(Date.now());

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const formatFileDate = (iso: string) => {
  // iso = YYYY-MM-DD
  const [y, m, d] = iso.split("-");
  return `${d}_${MONTHS[Number(m) - 1]}_${y}`;
};

// Trigger download via Blob — works inside AppsGeyser WebView and modern browsers
const triggerBlobDownload = (data: ArrayBuffer, filename: string) => {
  const blob = new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  // WebView fallback: if URL.createObjectURL is unavailable, use data URI
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    const reader = new FileReader();
    reader.onload = () => {
      const a = document.createElement("a");
      a.href = reader.result as string;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    reader.readAsDataURL(blob);
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

export const BillHistory = () => {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string>(todayKey());
  const [bills, setBills] = useState<BillRecord[]>(() => readBills());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const h = () => setBills(readBills());
    window.addEventListener("bills:updated", h);
    return () => window.removeEventListener("bills:updated", h);
  }, []);

  const filtered = useMemo(
    () => (date ? billsByDate(date) : bills),
    [date, bills]
  );

  const dayTotal = useMemo(
    () => filtered.reduce((s, b) => s + b.total, 0),
    [filtered]
  );
  const dayItems = useMemo(
    () => filtered.reduce((s, b) => s + b.totalItems, 0),
    [filtered]
  );

  const downloadExcel = async () => {
    if (filtered.length === 0) {
      toast.error("No bills to export for this date");
      return;
    }

    setLoading(true);
    try {
      // Small delay so the loader is visible (and lets the UI paint in WebView)
      await new Promise((r) => setTimeout(r, 250));

      // Build flat row-per-item report
      const rows = filtered.flatMap((b) => {
        const dt = new Date(b.createdAt);
        const dateTime = `${dt.toLocaleDateString("en-IN")} ${dt.toLocaleTimeString("en-IN")}`;
        return b.items.map((i) => ({
          "Invoice Number": b.billNo,
          "Item Name": i.name,
          "Quantity": i.quantity,
          "Price (₹)": Number(i.price.toFixed(2)),
          "Total Amount (₹)": Number((i.price * i.quantity).toFixed(2)),
          "Payment Method": (b as any).paymentMethod || "UPI",
          "Customer Name": (b as any).customerName || "Walk-in",
          "Date & Time": dateTime,
        }));
      });

      // Grand total row
      rows.push({
        "Invoice Number": "",
        "Item Name": "",
        "Quantity": dayItems as any,
        "Price (₹)": "" as any,
        "Total Amount (₹)": Number(dayTotal.toFixed(2)),
        "Payment Method": "",
        "Customer Name": "GRAND TOTAL",
        "Date & Time": "",
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 16 }, { wch: 24 }, { wch: 10 }, { wch: 12 },
        { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 22 },
      ];

      // Summary sheet
      const summary = filtered.map((b, idx) => ({
        "S.No": idx + 1,
        "Invoice Number": b.billNo,
        "Date & Time": new Date(b.createdAt).toLocaleString("en-IN"),
        "Total Items": b.totalItems,
        "Amount (₹)": Number(b.total.toFixed(2)),
      }));
      summary.push({
        "S.No": "" as any,
        "Invoice Number": "",
        "Date & Time": "TOTAL",
        "Total Items": dayItems,
        "Amount (₹)": Number(dayTotal.toFixed(2)),
      });
      const wsSummary = XLSX.utils.json_to_sheet(summary);
      wsSummary["!cols"] = [{ wch: 6 }, { wch: 16 }, { wch: 24 }, { wch: 12 }, { wch: 14 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
      XLSX.utils.book_append_sheet(wb, ws, "Sales Details");

      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
      const filename = `Sales_Report_${formatFileDate(date)}.xlsx`;
      triggerBlobDownload(out, filename);

      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      console.error("Excel export failed", err);
      toast.error("Excel download failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full gap-2">
          <History className="h-4 w-4" />
          Bill History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Bill History
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 animate-in fade-in-0 duration-300">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="bh-date">Select date</Label>
              <Input
                id="bh-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <Button
              onClick={downloadExcel}
              disabled={loading}
              className="gap-2 rounded-2xl text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
              style={{
                background: "linear-gradient(135deg, #CCFBFF, #EF96C5)",
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download Excel Report
                </>
              )}
            </Button>
          </div>

          <Card
            className="grid grid-cols-3 gap-2 rounded-2xl p-4 text-center shadow-sm"
            style={{
              background:
                "linear-gradient(135deg, rgba(204,251,255,0.35), rgba(239,150,197,0.25))",
            }}
          >
            <div>
              <p className="text-xs text-muted-foreground">Bills</p>
              <p className="text-lg font-bold">{filtered.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Items</p>
              <p className="text-lg font-bold">{dayItems}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold">₹{dayTotal.toFixed(2)}</p>
            </div>
          </Card>

          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No bills on this date
              </p>
            ) : (
              filtered.map((b) => (
                <Card
                  key={b.id}
                  className="flex items-center gap-3 rounded-2xl p-3 transition-all hover:shadow-md"
                >
                  <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.billNo}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(b.createdAt).toLocaleString("en-IN")} •{" "}
                      {b.totalItems} items
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">₹{b.total.toFixed(2)}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      removeBill(b.id);
                      toast("Bill removed");
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Card>
              ))
            )}
          </div>

          {bills.length > 0 && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearBills();
                  toast("All history cleared");
                }}
                className="gap-1.5 text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear all history
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
