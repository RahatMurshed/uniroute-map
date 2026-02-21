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
  { key: "total", label: "Total Trips", emoji: "📊", pctKey: null },
  { key: "onTime", label: "On Time Trips", emoji: "✅", pctKey: "onTimePct" },
  { key: "delayed", label: "Delayed Trips", emoji: "⚠️", pctKey: "delayedPct" },
  { key: "cancelled", label: "Cancelled Trips", emoji: "❌", pctKey: "cancelledPct" },
] as const;

export default function ReportsSummary({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.key}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{c.emoji}</span>
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
