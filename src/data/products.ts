// Mock product database. Replace with real backend (Firebase/Supabase) when ready.
export interface Product {
  id: string;
  barcode: string;
  name: string;
  price: number;
}

export const PRODUCTS: Product[] = [
  { id: "1", barcode: "8901058851234", name: "Maggi Noodles 70g", price: 14 },
  { id: "2", barcode: "8901491101837", name: "Lays Classic Salted", price: 20 },
  { id: "3", barcode: "8901030865278", name: "Parle-G Biscuits", price: 10 },
  { id: "4", barcode: "8901764000016", name: "Amul Butter 100g", price: 56 },
  { id: "5", barcode: "8901207004032", name: "Tata Salt 1kg", price: 28 },
  { id: "6", barcode: "8901138511012", name: "Coca Cola 750ml", price: 40 },
  { id: "7", barcode: "8901725100018", name: "Britannia Bread", price: 45 },
  { id: "8", barcode: "8901063093157", name: "Kurkure Masala Munch", price: 20 },
];

export function findProductByBarcode(code: string): Product | undefined {
  return PRODUCTS.find((p) => p.barcode === code);
}
