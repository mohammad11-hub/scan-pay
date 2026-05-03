// Product database with localStorage persistence.
// Falls back to seed list on first load.
export interface Product {
  id: string;
  barcode: string;
  name: string;
  price: number;
}

const STORAGE_KEY = "pos.products.v1";

const SEED: Product[] = [
  { id: "1", barcode: "8901058851234", name: "Maggi Noodles 70g", price: 14 },
  { id: "2", barcode: "8901491101837", name: "Lays Classic Salted", price: 20 },
  { id: "3", barcode: "8901030865278", name: "Parle-G Biscuits", price: 10 },
  { id: "4", barcode: "8901764000016", name: "Amul Butter 100g", price: 56 },
  { id: "5", barcode: "8901207004032", name: "Tata Salt 1kg", price: 28 },
  { id: "6", barcode: "8901138511012", name: "Coca Cola 750ml", price: 40 },
  { id: "7", barcode: "8901725100018", name: "Britannia Bread", price: 45 },
  { id: "8", barcode: "8901063093157", name: "Kurkure Masala Munch", price: 20 },
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
