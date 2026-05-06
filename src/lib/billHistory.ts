export interface BillHistoryItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface BillRecord {
  id: string;
  billNo: string;
  createdAt: number;
  items: BillHistoryItem[];
  totalItems: number;
  total: number;
}

const KEY = "pos.bill.history.v1";

export function readBills(): BillRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeBills(list: BillRecord[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("bills:updated"));
}

export function addBill(bill: BillRecord) {
  const next = [bill, ...readBills()].slice(0, 1000);
  writeBills(next);
}

export function removeBill(id: string) {
  writeBills(readBills().filter((b) => b.id !== id));
}

export function clearBills() {
  writeBills([]);
}

export function getDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function billsByDate(date: string): BillRecord[] {
  return readBills().filter((b) => getDateKey(b.createdAt) === date);
}
