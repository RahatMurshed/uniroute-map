import type { AdminStats } from "@/hooks/useAdminData";

const statCards = [
  { key: "totalBuses", label: "Total Buses", emoji: "🚌", borderColor: "border-l-secondary" },
  { key: "activeTrips", label: "Active Trips", emoji: "🟢", borderColor: "border-l-success" },
  { key: "delayedToday", label: "Delayed Today", emoji: "⚠️", borderColor: "border-l-warning" },
  { key: "studentsOnBus", label: "Students On Bus", emoji: "👥", borderColor: "border-l-primary" },
] as const;

export default function StatsRow({ stats }: { stats: AdminStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {statCards.map((sc) => (
        <div
          key={sc.key}
          className={`bg-card rounded-xl border border-border border-l-4 ${sc.borderColor} shadow-sm p-4`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{sc.emoji}</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{sc.label}</span>
          </div>
          <p className="text-3xl font-extrabold tracking-tight text-foreground">{stats[sc.key]}</p>
        </div>
      ))}
    </div>
  );
}
