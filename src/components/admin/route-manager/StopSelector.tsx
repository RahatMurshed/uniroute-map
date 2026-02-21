import { useState, useRef, useEffect } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { StopInfo } from "@/hooks/useRouteManager";

interface StopSelectorProps {
  stops: StopInfo[];
  excludeIds: string[];
  onSelect: (stop: StopInfo) => void;
}

export default function StopSelector({ stops, excludeIds, onSelect }: StopSelectorProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = stops.filter(
    (s) => !excludeIds.includes(s.id) && s.name.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search and add stop…"
          className="pl-9"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {filtered.map((stop) => (
            <button
              key={stop.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
              onClick={() => {
                onSelect(stop);
                setQuery("");
                setOpen(false);
              }}
            >
              <span className="font-medium text-popover-foreground">{stop.name}</span>
              {stop.landmark && <span className="text-muted-foreground text-xs">({stop.landmark})</span>}
            </button>
          ))}
        </div>
      )}
      {open && query && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
          No stops found. Create a new stop below.
        </div>
      )}
    </div>
  );
}
