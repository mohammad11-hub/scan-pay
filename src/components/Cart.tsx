import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Product } from "@/data/products";

export interface CartItem extends Product {
  quantity: number;
}

interface Props {
  items: CartItem[];
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onRemove: (id: string) => void;
}

export const Cart = ({ items, onInc, onDec, onRemove }: Props) => {
  if (items.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
        <p className="text-lg font-medium">Cart is empty</p>
        <p className="text-sm text-muted-foreground">Scan a product barcode to add items</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <Card key={item.id} className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              ₹{item.price} × {item.quantity}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => onDec(item.id)}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="w-6 text-center font-semibold">{item.quantity}</span>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => onInc(item.id)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="w-20 text-right font-semibold">
            ₹{(item.price * item.quantity).toFixed(2)}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive"
            onClick={() => onRemove(item.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </Card>
      ))}
    </div>
  );
};
