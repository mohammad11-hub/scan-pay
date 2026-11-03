// Udhar Khata (ઉધાર ખાતું) — credit ledger management.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookUser, Plus, Printer, IndianRupee, Search, Store, Trash2,
  Wallet, Receipt, NotebookPen, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  addUdharPayment, createUdharEntry, customerKey, entryPaid, entryRemaining,
  entryStatus, entryTotal, getUdharEntries, printCustomerLedger, printUdharSlip,
  STATUS_LABEL, type UdharEntry, type UdharStatus,
} from "@/lib/udhar";

const SHOP_NAME = "Furat Dhaba";
const UPI_ID = "Q320109659@ybl";

const dateKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const statusBadge = (s: UdharStatus) =>
  s === "paid"
    ? "bg-primary/15 text-primary"
    : s === "partial"
      ? "bg-secondary/40 text-secondary-foreground"
      : "bg-muted text-muted-foreground";

interface Row {
  name: string;
  qty: string;
  price: string;
}

const emptyRow = (): Row => ({ name: "", qty: "1", price: "" });

const UdharKhata = () => {
  const [entries, setEntries] = useState<UdharEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setEntries(await getUdharEntries());
    } catch (e: any) {
      toast.error("Could not load udhar records", { description: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* filters */
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | UdharStatus>("all");
  const [dateFilter, setDateFilter] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (q && !e.customer_name.toLowerCase().includes(q) && !(e.mobile ?? "").includes(q)) return false;
      if (statusFilter !== "all" && entryStatus(e) !== statusFilter) return false;
      if (dateFilter && dateKey(e.entry_date) !== dateFilter) return false;
      return true;
    });
  }, [entries, search, statusFilter, dateFilter]);

  const totalOutstanding = useMemo(
    () => entries.reduce((s, e) => s + entryRemaining(e), 0),
    [entries]
  );

  /* ------------------------- new entry form ------------------------- */
  const [formOpen, setFormOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);

  const rowTotal = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);

  const resetForm = () => {
    setCustomerName("");
    setMobile("");
    setNotes("");
    setRows([emptyRow()]);
  };

  const saveEntry = async () => {
    const name = customerName.trim();
    if (!name) {
      toast.error("Customer name is required");
      return;
    }
    const items = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        item_name: r.name.trim(),
        quantity: Number(r.qty) || 0,
        price: Number(r.price) || 0,
      }))
      .filter((i) => i.quantity > 0 && i.price >= 0);
    if (items.length === 0) {
      toast.error("Add at least one item with name, quantity and price");
      return;
    }
    const digits = mobile.replace(/\D/g, "");
    if (mobile.trim() && digits.length !== 10) {
      toast.error("Mobile number must be 10 digits (or leave it empty)");
      return;
    }
    setSaving(true);
    try {
      await createUdharEntry({
        customer_name: name,
        mobile: digits || null,
        notes,
        items,
      });
      toast.success("Udhar entry saved", { description: `${name} • Rs.${rowTotal.toFixed(2)} credit` });
      resetForm();
      setFormOpen(false);
      await load();
    } catch (e: any) {
      toast.error("Could not save the entry", { description: String(e?.message || e) });
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------- collect payment ------------------------- */
  const [payEntry, setPayEntry] = useState<UdharEntry | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);

  const openPay = (e: UdharEntry) => {
    setPayEntry(e);
    setPayAmount(entryRemaining(e).toFixed(2));
  };

  const savePayment = async () => {
    if (!payEntry) return;
    const amt = Number(payAmount);
    const remaining = entryRemaining(payEntry);
    if (!amt || amt <= 0) {
      toast.error("Enter a payment amount greater than 0");
      return;
    }
    if (amt > remaining) {
      toast.error("Payment cannot be more than the remaining udhar", {
        description: `Remaining is Rs.${remaining.toFixed(2)}`,
      });
      return;
    }
    setPaying(true);
    try {
      await addUdharPayment(payEntry.id, amt);
      toast.success("Payment recorded", {
        description: `Rs.${amt.toFixed(2)} received — remaining Rs.${Math.max(0, remaining - amt).toFixed(2)}`,
      });
      setPayEntry(null);
      await load();
    } catch (e: any) {
      toast.error("Could not record the payment", { description: String(e?.message || e) });
    } finally {
      setPaying(false);
    }
  };

  /* --------------------------- ledger view --------------------------- */
  const [ledger, setLedger] = useState<{ name: string; mobile: string | null; entries: UdharEntry[] } | null>(null);
  const [printing, setPrinting] = useState<null | "slip" | "ledger">(null);

  const openLedger = (e: UdharEntry) => {
    const key = customerKey(e.customer_name, e.mobile);
    const own = entries.filter((x) => customerKey(x.customer_name, x.mobile) === key);
    setLedger({ name: e.customer_name, mobile: e.mobile, entries: own });
  };

  const ledgerTotals = ledger
    ? {
        credit: ledger.entries.reduce((s, e) => s + entryTotal(e), 0),
        paid: ledger.entries.reduce((s, e) => s + entryPaid(e), 0),
      }
    : { credit: 0, paid: 0 };
  const ledgerRemaining = Math.max(0, ledgerTotals.credit - ledgerTotals.paid);

  const doPrintSlip = async (e: UdharEntry) => {
    setPrinting("slip");
    try {
      const res = await printUdharSlip(e, SHOP_NAME, UPI_ID);
      if (res.ok && res.silent) toast.success("Slip printed");
      else if (!res.ok) toast.error("Printing failed", { description: res.error });
      else toast.info("Print dialog opened", { description: res.error });
    } catch (err: any) {
      toast.error("Printing failed", { description: String(err?.message || err) });
    } finally {
      setPrinting(null);
    }
  };

  const doPrintLedger = async () => {
    if (!ledger) return;
    setPrinting("ledger");
    try {
      const res = await printCustomerLedger(ledger.name, ledger.mobile, ledger.entries, SHOP_NAME, UPI_ID);
      if (res.ok && res.silent) toast.success("Ledger printed");
      else if (!res.ok) toast.error("Printing failed", { description: res.error });
      else toast.info("Print dialog opened", { description: res.error });
    } catch (err: any) {
      toast.error("Printing failed", { description: String(err?.message || err) });
    } finally {
      setPrinting(null);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/40 glass">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-foreground shadow-[var(--shadow-soft)]"
              style={{ background: "var(--gradient-primary)" }}
            >
              <BookUser className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight gradient-text">Udhar Khata</h1>
              <p className="text-xs text-muted-foreground">ઉધાર ખાતું • Credit Ledger</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="icon" aria-label="Billing home">
              <Link to="/"><Store className="h-4 w-4" /></Link>
            </Button>
            <Button onClick={() => setFormOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New Udhar
            </Button>
          </div>
        </div>
      </header>

      <main className="container grid gap-6 pb-6 animate-fade-in" style={{ paddingTop: "100px" }}>
        <Card
          className="flex flex-wrap items-center justify-between gap-3 border-white/60 p-5 text-foreground"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-soft)" }}
        >
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80">Total Outstanding Udhar</p>
            <p className="mt-1 flex items-center text-3xl font-extrabold">
              <IndianRupee className="h-6 w-6" />
              {totalOutstanding.toFixed(2)}
            </p>
          </div>
          <p className="text-xs opacity-80">{entries.length} entries saved</p>
        </Card>

        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor="udhar-search">Search customer</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="udhar-search"
                className="pl-9"
                placeholder="Name or mobile number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="udhar-date">Date</Label>
            <Input id="udhar-date" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="udhar-status">Status</Label>
            <select
              id="udhar-status"
              className="border-input bg-background/60 h-10 rounded-xl border px-3 text-sm backdrop-blur"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | UdharStatus)}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="partial">Partially Paid</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          {(search || dateFilter || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setDateFilter("");
                setStatusFilter("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </Card>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading udhar records…
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            {entries.length === 0
              ? "No udhar entries yet. Tap “New Udhar” to record the first credit."
              : "No entries match the current filters."}
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((e) => {
              const total = entryTotal(e);
              const paid = entryPaid(e);
              const remaining = entryRemaining(e);
              const status = entryStatus(e);
              return (
                <Card key={e.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">{e.customer_name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge(status)}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(e.entry_date).toLocaleString("en-IN")}
                        {e.mobile ? ` • +91 ${e.mobile}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {e.udhar_items.map((i) => `${i.item_name} ×${i.quantity}`).join(", ")}
                      </p>
                      {e.notes && <p className="mt-1 text-xs italic text-muted-foreground">Note: {e.notes}</p>}
                    </div>
                    <div className="text-right text-xs">
                      <p>Total <span className="font-semibold text-sm">Rs.{total.toFixed(2)}</span></p>
                      <p className="mt-0.5">Paid <span className="font-semibold">Rs.{paid.toFixed(2)}</span></p>
                      <p className="mt-0.5 font-semibold text-destructive">Udhar Rs.{remaining.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" className="gap-1.5" onClick={() => openPay(e)} disabled={remaining <= 0}>
                      <Wallet className="h-3.5 w-3.5" /> Collect Payment
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => doPrintSlip(e)} disabled={printing !== null}>
                      {printing === "slip" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                      Print Udhar Slip
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openLedger(e)}>
                      <NotebookPen className="h-3.5 w-3.5" /> Ledger
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* ---------------- new udhar entry ---------------- */}
      <Dialog open={formOpen} onOpenChange={(o) => !saving && setFormOpen(o)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> New Udhar Entry
            </DialogTitle>
            <DialogDescription>
              {new Date().toLocaleString("en-IN")} — credit is saved as outstanding until you collect payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ud-name">Customer Name *</Label>
                <Input id="ud-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Ramesh bhai" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ud-mobile">Mobile (optional)</Label>
                <Input id="ud-mobile" type="tel" inputMode="numeric" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10-digit number" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Items</Label>
              {rows.map((r, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Input
                      value={r.name}
                      onChange={(ev) => setRows((p) => p.map((x, i) => (i === idx ? { ...x, name: ev.target.value } : x)))}
                      placeholder={`Item ${idx + 1} name`}
                    />
                  </div>
                  <Input
                    className="w-16 shrink-0"
                    type="number"
                    min="1"
                    value={r.qty}
                    onChange={(ev) => setRows((p) => p.map((x, i) => (i === idx ? { ...x, qty: ev.target.value } : x)))}
                    aria-label={`Item ${idx + 1} quantity`}
                  />
                  <Input
                    className="w-24 shrink-0"
                    type="number"
                    min="0"
                    step="0.01"
                    value={r.price}
                    onChange={(ev) => setRows((p) => p.map((x, i) => (i === idx ? { ...x, price: ev.target.value } : x)))}
                    placeholder="Price"
                    aria-label={`Item ${idx + 1} price`}
                  />
                  {rows.length > 1 && (
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-destructive" aria-label="Remove item"
                      onClick={() => setRows((p) => p.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRows((p) => [...p, emptyRow()])}>
                  <Plus className="h-3.5 w-3.5" /> Add item
                </Button>
                <p className="text-sm font-semibold">Total: Rs.{rowTotal.toFixed(2)}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ud-notes">Notes (optional)</Label>
              <Input id="ud-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any remark" />
            </div>

            <Button onClick={saveEntry} disabled={saving} className="w-full gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Udhar Entry (Rs.{rowTotal.toFixed(2)})
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------------- collect payment ---------------- */}
      <Dialog open={!!payEntry} onOpenChange={(o) => !paying && !o && setPayEntry(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" /> Collect Payment
            </DialogTitle>
            <DialogDescription>
              {payEntry?.customer_name} • Total Rs.{payEntry ? entryTotal(payEntry).toFixed(2) : "0"} • Already paid
              Rs.{payEntry ? entryPaid(payEntry).toFixed(2) : "0"} • Remaining Rs.{payEntry ? entryRemaining(payEntry).toFixed(2) : "0"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount received (₹)</Label>
              <Input
                id="pay-amount"
                type="number"
                min="0"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">Partial payments are allowed; the balance can never go below zero.</p>
            <Button onClick={savePayment} disabled={paying} className="w-full gap-2">
              {paying && <Loader2 className="h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------------- customer ledger ---------------- */}
      <Dialog open={!!ledger} onOpenChange={(o) => !o && setLedger(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ledger — {ledger?.name}</DialogTitle>
            <DialogDescription>
              {ledger?.mobile ? `+91 ${ledger.mobile} • ` : ""}
              Credit Rs.{ledgerTotals.credit.toFixed(2)} • Paid Rs.{ledgerTotals.paid.toFixed(2)} • Outstanding Rs.{ledgerRemaining.toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {ledger?.entries.map((e) => (
              <div key={e.id} className="border-border/60 rounded-xl border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">{new Date(e.entry_date).toLocaleDateString("en-IN")}</p>
                  <p className="text-xs font-semibold">Rs.{entryTotal(e).toFixed(2)}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {e.udhar_items.map((i) => `${i.item_name} ×${i.quantity}`).join(", ")}
                </p>
                <p className="mt-1 text-xs">
                  Paid: Rs.{entryPaid(e).toFixed(2)} • Udhar: <span className="font-semibold text-destructive">Rs.{entryRemaining(e).toFixed(2)}</span>{" "}
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(entryStatus(e))}`}>
                    {STATUS_LABEL[entryStatus(e)]}
                  </span>
                </p>
                {e.udhar_payments.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {e.udhar_payments.map((p) => `Rs.${p.amount.toFixed(2)} on ${new Date(p.paid_at).toLocaleDateString("en-IN")}`).join(" • ")}
                  </p>
                )}
              </div>
            ))}
            <Button onClick={doPrintLedger} disabled={printing !== null} className="w-full gap-2">
              {printing === "ledger" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              Print Full Ledger
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UdharKhata;
