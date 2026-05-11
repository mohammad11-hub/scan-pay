// Product database with localStorage persistence.
// Falls back to seed list on first load.
export interface Product {
  id: string;
  barcode: string;
  name: string;
  price: number;
}

const STORAGE_KEY = "pos.products.v2";

const SEED: Product[] = [
  { id: "100", barcode: "100", name: "ચિકન ચિલ્લી", price: 110 },
  { id: "101", barcode: "101", name: "બટર ચિકન", price: 100 },
  { id: "102", barcode: "102", name: "ચિકન મસાલા", price: 80 },
  { id: "103", barcode: "103", name: "ચિકન કૉરમાં", price: 70 },
  { id: "104", barcode: "104", name: "ચિકન ચટપટા", price: 110 },
  { id: "105", barcode: "105", name: "મટન ખીમા", price: 80 },
  { id: "106", barcode: "106", name: "ચિકન ફ્રાય રાઈસ", price: 90 },
  { id: "107", barcode: "107", name: "ચિકન નુડલ્સ", price: 100 },
  { id: "108", barcode: "108", name: "ચિકન દાણા 100g", price: 50 },
  { id: "109", barcode: "109", name: "ચિકન બોટી પાવ 1-નંગ", price: 15 },
  { id: "110", barcode: "110", name: "ચિકન મંચાવ સૂપ", price: 70 },

  { id: "201", barcode: "201", name: "ચણા મસાલા ફ્રાય", price: 60 },
  { id: "202", barcode: "202", name: "સેવ ટમેટા ફ્રાય", price: 60 },
  { id: "203", barcode: "203", name: "ચણા મસાલા", price: 40 },
  { id: "204", barcode: "204", name: "સેવ ટમેટા", price: 40 },
  { id: "205", barcode: "205", name: "દાલ ફ્રાય", price: 40 },
  { id: "206", barcode: "206", name: "દાલ તડકા", price: 60 },
  { id: "207", barcode: "207", name: "દડી", price: 20 },
  { id: "208", barcode: "208", name: "વેજ ફ્રાય રાઈસ", price: 80 },
  { id: "209", barcode: "209", name: "મસાલા રાઈસ", price: 60 },
  { id: "210", barcode: "210", name: "જીરા રાઈસ", price: 50 },
  { id: "211", barcode: "211", name: "સાદા રાઈસ", price: 40 },
  { id: "212", barcode: "212", name: "મંચુરિયન", price: 80 },
  { id: "213", barcode: "213", name: "નુડલ્સ", price: 80 },
  { id: "214", barcode: "214", name: "અંડા ફ્રાય રાઈસ", price: 90 },
  { id: "215", barcode: "215", name: "વડા પાવ", price: 15 },
  { id: "216", barcode: "216", name: "મંચુરિયન રાઈસ", price: 90 },
  { id: "217", barcode: "217", name: "મંચુરિયન નુડલ્સ", price: 90 },
  { id: "218", barcode: "218", name: "અંડા ભુરજી", price: 50 },
  { id: "219", barcode: "219", name: "અંડા ખીમા", price: 70 },
  { id: "220", barcode: "220", name: "આમલેટ", price: 40 },
  { id: "221", barcode: "221", name: "વડા પાવ", price: 15 },
];

function read(): Product[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED;
  } catch {
    return SEED;
  }
}

function write(products: Product[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  window.dispatchEvent(new CustomEvent("products:updated"));
}

export const PRODUCTS: Product[] = read();

export function getProducts(): Product[] {
  return read();
}

export function findProductByBarcode(code: string): Product | undefined {
  return read().find((p) => p.barcode === code);
}

export function upsertProduct(p: Product) {
  const list = read();
  const idx = list.findIndex((x) => x.id === p.id);
  if (idx >= 0) list[idx] = p;
  else list.push(p);
  write(list);
}

export function deleteProduct(id: string) {
  write(read().filter((p) => p.id !== id));
}

export function resetProducts() {
  write(SEED);
}
