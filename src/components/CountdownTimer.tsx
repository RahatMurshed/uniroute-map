import { useEffect, useState, useRef } from "react";
import { Bus } from "lucide-react";

interface CountdownTimerProps {
  etaMinutes: number;
  busName: string;
  routeName: string;
  stopName: string;
  onExpired?: () => void;
}

export default function CountdownTimer({ etaMinutes, busName, routeName, stopName, onExpired }: CountdownTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(Math.max(0, Math.round(etaMinutes * 60)));
  const lastEtaRef = useRef(etaMinutes);
  const arrivedRef = useRef(false);
  const expiredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when external ETA changes
  useEffect(() => {
    if (Math.abs(etaMinutes - lastEtaRef.current) > 0.25) {
      setRemainingSeconds(Math.max(0, Math.round(etaMinutes * 60)));
      lastEtaRef.current = etaMinutes;
    }
  }, [etaMinutes]);

  // Countdown tick
  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle arrival
  useEffect(() => {
    if (remainingSeconds <= 0 && !arrivedRef.current) {
      arrivedRef.current = true;
      // Vibrate if supported
      try {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      } catch {}
      // Reset after 2 minutes
      expiredTimerRef.current = setTimeout(() => {
        onExpired?.();
      }, 120000);
    }
    return () => {
      if (expiredTimerRef.current) clearTimeout(expiredTimerRef.current);
    };
  }, [remainingSeconds, onExpired]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const arrived = remainingSeconds <= 0;

  // Color based on remaining time
  let colorClass = "text-warning"; // 5-3 min
  let ringColor = "stroke-warning";
  if (remainingSeconds <= 60) {
    colorClass = "text-success animate-pulse";
    ringColor = "stroke-success";
  } else if (remainingSeconds <= 180) {
    colorClass = "text-orange-500";
    ringColor = "stroke-orange-500";
  }

  // Progress arc (SVG)
  const totalSeconds = 300; // 5 min
  const progress = Math.min(1, 1 - remainingSeconds / totalSeconds);
  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference * (1 - progress);

  if (arrived) {
    return (
      <div className="text-center py-4 space-y-2">
        <div className="flex items-center justify-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
          </span>
          <span className="text-lg font-bold text-success">Bus is arriving now!</span>
        </div>
        <p className="text-sm text-muted-foreground">{busName} · {routeName}</p>
        <p className="text-xs text-muted-foreground">{stopName}</p>
      </div>
    );
  }

  return (
    <div className="text-center py-3 space-y-2">
      <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-foreground">
        <Bus className="h-4 w-4" />
        <span>Bus Arriving Soon!</span>
      </div>

      {/* Countdown with progress ring */}
      <div className="relative inline-flex items-center justify-center">
        <svg width="128" height="128" className="-rotate-90">
          <circle cx="64" cy="64" r="54" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/30" />
          <circle
            cx="64" cy="64" r="54" fill="none" strokeWidth="4"
            className={`${ringColor} transition-all duration-1000`}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold tabular-nums ${colorClass}`}>
            {minutes}:{seconds.toString().padStart(2, "0")}
          </span>
          <span className="text-xs text-muted-foreground">min : sec</span>
        </div>
      </div>

      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">{busName}</p>
        <p className="text-xs text-muted-foreground">{stopName}</p>
      </div>
    </div>
  );
}
