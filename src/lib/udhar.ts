// Udhar Khata (credit ledger) data layer — backed by the cloud database.
import { supabase } from "@/integrations/supabase/client";
import type { EscposReceipt } from "./escpos";
import { printReceipt } from "./printer";
import { buildReceiptHtml } from "./receiptHtml";

export interface UdharItem {
  id?: string;
  item_name: string;
  quantity: number;
  price: number;
}

export interface UdharPayment {
  id: string;
  amount: number;
  note?: string | null;
  paid_at: string;
}

export interface UdharEntry {
  id: string;
  customer_name: string;
  mobile: string | null;
  notes: string | null;
  entry_date: string;
  created_at: string;
  udhar_items: UdharItem[];
  udhar_payments: UdharPayment[];
}

export type UdharStatus = "pending" | "partial" | "paid";

export const entryTotal = (e: UdharEntry) =>
  e.udhar_items.reduce((s, i) => s + i.quantity * i.price, 0);

export const entryPaid = (e: UdharEntry) =>
  e.udhar_payments.reduce((s, p) => s + p.amount, 0);

export const entryRemaining = (e: UdharEntry) =>
  Math.max(0, entryTotal(e) - entryPaid(e));

export const entryStatus = (e: UdharEntry): UdharStatus => {
  const paid = entryPaid(e);
  if (paid <= 0) return "pending";
  return entryRemaining(e) <= 0 ? "paid" : "partial";
};

export const STATUS_LABEL: Record<UdharStatus, string> = {
  pending: "Pending",
  partial: "Partially Paid",
  paid: "Paid",
};

export const getUdharEntries = async (): Promise<UdharEntry[]> => {
  const { data, error } = await supabase
    .from("udhar_entries")
    .select("*, udhar_items(*), udhar_payments(*)")
    .order("entry_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as UdharEntry[];
};

export const createUdharEntry = async (input: {
  customer_name: string;
  mobile?: string | null;
  notes?: string | null;
  items: UdharItem[];
}): Promise<UdharEntry> => {
  const { data: entry, error } = await supabase
    .from("udhar_entries")
    .insert({
      customer_name: input.customer_name,
      mobile: input.mobile?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const { error: itemsErr } = await supabase
    .from("udhar_items")
    .insert(input.items.map((i) => ({ ...i, entry_id: entry.id })));
  if (itemsErr) {
    await supabase.from("udhar_entries").delete().eq("id", entry.id);
    throw new Error(itemsErr.message);
  }
  const { data, error: e2 } = await supabase
    .from("udhar_entries")
    .select("*, udhar_items(*), udhar_payments(*)")
    .eq("id", entry.id)
    .single();
  if (e2) throw new Error(e2.message);
  return data as UdharEntry;
};

export const addUdharPayment = async (entryId: string, amount: number, note?: string) => {
  const { data, error } = await supabase
    .from("udhar_payments")
    .insert({ entry_id: entryId, amount, note: note?.trim() || null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as UdharPayment;
};

/* ------------------------------- printing ------------------------------- */

const UPI_URL = (upiId: string, name: string, amount: number) =>
  `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&am=${amount.toFixed(
    2
  )}&cu=INR&tn=${encodeURIComponent("Udhar")}`;

/** One-click thermal slip for a single udhar entry (same engine as the bill). */
export const printUdharSlip = async (
  entry: UdharEntry,
  shopName: string,
  upiId: string
) => {
  const total = entryTotal(entry);
  const paid = entryPaid(entry);
  const remaining = entryRemaining(entry);
  const billNo = `UDH-${entry.entry_date.slice(2, 10).replace(/-/g, "")}-${entry.id
    .slice(0, 4)
    .toUpperCase()}`;
  const date = new Date(entry.entry_date).toLocaleString("en-IN");
  const items = entry.udhar_items.map((i) => ({
    name: i.item_name,
    price: i.price,
    quantity: i.quantity,
  }));
  const receipt: EscposReceipt = {
    shopName,
    billNo,
    date,
    customerPhone: entry.mobile ?? undefined,
    items,
    totalItems: items.reduce((s, i) => s + i.quantity, 0),
    total,
    upiId,
    upiUrl: UPI_URL(upiId, entry.customer_name, remaining),
    paper: getPaper(),
    udhar: { paid, remaining },
  };
  const html = buildReceiptHtml({
    shopName,
    billNo,
    date,
    customerPhone: entry.mobile ?? undefined,
    items: entry.udhar_items.map((i) => ({
      id: i.id ?? billNo,
      name: i.item_name,
      price: i.price,
      quantity: i.quantity,
    })),
    totalItems: items.reduce((s, i) => s + i.quantity, 0),
    total,
    upiId,
    qrDataUrl: "",
    udhar: { paid, remaining },
  });
  return printReceipt(receipt, html, "auto");
};

/** One-click thermal ledger print for one customer's full history. */
export const printCustomerLedger = async (
  customerName: string,
  mobile: string | null,
  entries: UdharEntry[],
  shopName: string,
  upiId: string
) => {
  const total = entries.reduce((s, e) => s + entryTotal(e), 0);
  const paid = entries.reduce((s, e) => s + entryPaid(e), 0);
  const remaining = Math.max(0, total - paid);
  const items = entries.map((e) => ({
    name: `${new Date(e.entry_date).toLocaleDateString("en-IN")} • ${e.udhar_items
      .map((i) => `${i.item_name} x${i.quantity}`)
      .join(", ")}`,
    price: entryTotal(e),
    quantity: 1,
  }));
  const billNo = `LEDGER-${Date.now().toString().slice(-8)}`;
  const date = new Date().toLocaleString("en-IN");
  const receipt: EscposReceipt = {
    shopName,
    billNo,
    date,
    customerPhone: mobile ?? undefined,
    items,
    totalItems: entries.length,
    total,
    upiId,
    upiUrl: UPI_URL(upiId, customerName, remaining),
    paper: getPaper(),
    udhar: { paid, remaining },
  };
  const html = buildReceiptHtml({
    shopName,
    billNo,
    date,
    customerPhone: mobile ?? undefined,
    items: items.map((i, idx) => ({ id: `${billNo}-${idx}`, name: i.name, price: i.price, quantity: i.quantity })),
    totalItems: entries.length,
    total,
    upiId,
    qrDataUrl: "",
    udhar: { paid, remaining },
  });
  return printReceipt(receipt, html, "auto");
};

const getPaper = () => {
  try {
    const raw = localStorage.getItem("printer_settings_v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.paper === "58mm") return "58mm" as const;
    }
  } catch {}
  return "80mm" as const;
};

/** Customer key for grouping the ledger. */
export const customerKey = (name: string, mobile: string | null | undefined) =>
  `${name.trim().toLowerCase()}|${(mobile ?? "").replace(/\D/g, "")}`;
