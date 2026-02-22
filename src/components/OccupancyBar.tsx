import { getOccupancyBgColor, getOccupancyColor, type OccupancyInfo } from "@/hooks/useOccupancy";

interface OccupancyBarProps {
  info: OccupancyInfo;
  compact?: boolean;
}

export default function OccupancyBar({ info, compact }: OccupancyBarProps) {
  const bgColor = getOccupancyBgColor(info.level);
  const textColor = getOccupancyColor(info.level);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[40px]">
          <div className={`h-full rounded-full transition-all duration-500 ${bgColor}`} style={{ width: `${info.percentage}%` }} />
        </div>
        <span className={`text-xs font-medium ${textColor}`}>{info.percentage}%</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden mr-2">
          <div className={`h-full rounded-full transition-all duration-500 ${bgColor}`} style={{ width: `${info.percentage}%` }} />
        </div>
        <span className={`text-xs font-semibold ${textColor} whitespace-nowrap`}>
          {info.percentage}% · {info.label}
        </span>
      </div>
      {info.capacity && (
        <p className="text-xs text-muted-foreground">{info.count}/{info.capacity} passengers</p>
      )}
    </div>
  );
}
