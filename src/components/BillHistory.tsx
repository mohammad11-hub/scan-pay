import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { History, Download, Trash2, FileSpreadsheet } from "lucide-react";
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

export const BillHistory = () => {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string>(todayKey());
  const [bills, setBills] = useState<BillRecord[]>(() => readBills());

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

  const downloadExcel = () => {
    if (filtered.length === 0) {
      toast.error("No bills to export");
      return;
    }

    // Sheet 1: Summary of bills
    const summary = filtered.map((b, idx) => ({
      "S.No": idx + 1,
      "Bill No": b.billNo,
      "Date": new Date(b.createdAt).toLocaleDateString("en-IN"),
      "Time": new Date(b.createdAt).toLocaleTimeString("en-IN"),
      "Total Items": b.totalItems,
      "Amount (₹)": Number(b.total.toFixed(2)),
    }));
    summary.push({
      "S.No": "" as any,
      "Bill No": "",
      "Date": "",
      "Time": "TOTAL",
      "Total Items": dayItems,
      "Amount (₹)": Number(dayTotal.toFixed(2)),
    });

    // Sheet 2: Item-level details
    const details = filtered.flatMap((b) =>
      b.items.map((i) => ({
        "Bill No": b.billNo,
        "Date": new Date(b.createdAt).toLocaleDateString("en-IN"),
        "Time": new Date(b.createdAt).toLocaleTimeString("en-IN"),
        "Item": i.name,
        "Qty": i.quantity,
        "Rate (₹)": i.price,
        "Amount (₹)": Number((i.price * i.quantity).toFixed(2)),
      }))
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(summary),
      "Summary"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(details),
      "Items"
    );

    const filename = `bills-${date || "all"}.xlsx`;
    try {
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Exported ${filtered.length} bill(s)`);
    } catch (err) {
      console.error("Excel export failed", err);
      toast.error("Excel download failed");
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

        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="bh-date">Filter by date</Label>
              <Input
                id="bh-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <Button onClick={downloadExcel} className="gap-2">
              <Download className="h-4 w-4" />
              Download Excel
            </Button>
          </div>

          <Card className="grid grid-cols-3 gap-2 p-4 text-center">
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
                <Card key={b.id} className="flex items-center gap-3 p-3">
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
