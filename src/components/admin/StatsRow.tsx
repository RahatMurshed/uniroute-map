import type { AdminStats } from "@/hooks/useAdminData";
import { Card, CardContent } from "@/components/ui/card";

const statCards = [
  { key: "totalBuses", label: "Total Buses", emoji: "🚌" },
  { key: "activeTrips", label: "Active Trips", emoji: "🟢" },
  { key: "delayedToday", label: "Delayed Today", emoji: "⚠️" },
  { key: "studentsOnBus", label: "Students On Bus", emoji: "👥" },
] as const;

export default function StatsRow({ stats }: { stats: AdminStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {statCards.map((sc) => (
        <Card key={sc.key}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{sc.emoji}</span>
              <span className="text-sm font-medium text-muted-foreground">{sc.label}</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{stats[sc.key]}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
