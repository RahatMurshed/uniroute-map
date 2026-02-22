import { Bus, Radio, AlertTriangle, Users } from "lucide-react";
import type { AdminStats } from "@/hooks/useAdminData";

const statCards = [
  { key: "totalBuses", label: "Total Buses", icon: <Bus className="h-5 w-5 text-secondary" />, borderColor: "border-l-secondary" },
  { key: "activeTrips", label: "Active Trips", icon: <Radio className="h-5 w-5 text-success" />, borderColor: "border-l-success" },
  { key: "delayedToday", label: "Delayed Today", icon: <AlertTriangle className="h-5 w-5 text-warning" />, borderColor: "border-l-warning" },
  { key: "studentsOnBus", label: "Students On Bus", icon: <Users className="h-5 w-5 text-primary" />, borderColor: "border-l-primary" },
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
            {sc.icon}
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{sc.label}</span>
          </div>
          <p className="text-3xl font-extrabold tracking-tight text-foreground">{stats[sc.key]}</p>
        </div>
      ))}
    </div>
  );
}
