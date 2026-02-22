import { BarChart3, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  stats: {
    total: number;
    onTime: number;
    delayed: number;
    cancelled: number;
    onTimePct: string;
    delayedPct: string;
    cancelledPct: string;
  };
}

const cards = [
  { key: "total", label: "Total Trips", icon: <BarChart3 className="h-5 w-5 text-secondary" />, pctKey: null },
  { key: "onTime", label: "On Time Trips", icon: <CheckCircle2 className="h-5 w-5 text-success" />, pctKey: "onTimePct" },
  { key: "delayed", label: "Delayed Trips", icon: <AlertTriangle className="h-5 w-5 text-warning" />, pctKey: "delayedPct" },
  { key: "cancelled", label: "Cancelled Trips", icon: <XCircle className="h-5 w-5 text-destructive" />, pctKey: "cancelledPct" },
] as const;

export default function ReportsSummary({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.key}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              {c.icon}
              <span className="text-sm font-medium text-muted-foreground">{c.label}</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{stats[c.key]}</p>
            {c.pctKey && (
              <p className="text-sm text-muted-foreground">{stats[c.pctKey]}%</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
