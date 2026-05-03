import { QRCodeSVG } from "qrcode.react";
import { Card } from "@/components/ui/card";

interface Props {
  amount: number;
  upiId: string;
  payeeName: string;
}

export const PaymentQR = ({ amount, upiId, payeeName }: Props) => {
  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${amount.toFixed(
    2
  )}&cu=INR&tn=${encodeURIComponent(payeeName + " Bill")}`;

  return (
    <Card className="flex flex-col items-center gap-3 p-6">
      <h3 className="text-sm font-medium text-muted-foreground">Scan to Pay via UPI</h3>
      <div className="rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
        <QRCodeSVG value={upiUrl} size={200} level="M" />
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold">₹{amount.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground">{payeeName} • {upiId}</p>
      </div>
      <a
        href={upiUrl}
        className="text-xs font-medium text-accent underline-offset-2 hover:underline"
      >
        Open in UPI app
      </a>
    </Card>
  );
};
