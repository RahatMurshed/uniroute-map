import { useState, useMemo } from "react";
import { Plus, Calendar, AlertTriangle, XCircle, CheckCircle2, ClipboardList, CalendarCheck } from "lucide-react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useOverrides, type OverrideRecord } from "@/hooks/useOverrides";
import OverrideCard from "./overrides/OverrideCard";
import OverrideForm from "./overrides/OverrideForm";

export default function OverridesManager() {
  const {
    overrides, buses, routes, loading,
    createOverride, updateOverride, deleteOverride, notifyStudents,
  } = useOverrides();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<OverrideRecord | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const todayOverrides = overrides.filter((o) => o.exceptionDate === today);
  const upcomingOverrides = overrides.filter((o) => o.exceptionDate > today);

  // Stats for today
  const todayDelays = todayOverrides.filter((o) => o.type === "time_shift").length;
  const todayCancellations = todayOverrides.filter((o) => o.type === "cancellation").length;
  const todayNotified = todayOverrides.filter((o) => o.notified).length;

  // Group upcoming by date
  const groupedUpcoming = useMemo(() => {
    const groups = new Map<string, OverrideRecord[]>();
    for (const o of upcomingOverrides) {
      const existing = groups.get(o.exceptionDate) ?? [];
      existing.push(o);
      groups.set(o.exceptionDate, existing);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [upcomingOverrides]);

  const handleEdit = (override: OverrideRecord) => {
    setEditing(override);
    setSheetOpen(true);
  };

  const handleNew = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const handleSave = async (data: Parameters<typeof createOverride>[0]) => {
    if (editing) {
      const { notifyNow, ...rest } = data;
      const success = await updateOverride(editing.id, rest);
      if (success) setSheetOpen(false);
      return success;
    }
    const success = await createOverride(data);
    if (success) setSheetOpen(false);
    return success;
  };

  const handleCancel = () => {
    setSheetOpen(false);
    setEditing(null);
  };

  function formatGroupDate(dateStr: string): string {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return `Tomorrow — ${format(d, "EEEE, d MMM yyyy")}`;
    return format(d, "EEEE, d MMM yyyy");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Service Overrides</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage daily schedule changes and student notifications</p>
        </div>
        <Button
          onClick={handleNew}
          className="bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-primary-foreground rounded-xl font-semibold gap-1.5 shadow-md shrink-0"
        >
          <Plus className="h-4 w-4" />
          New Override
        </Button>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" /> Today: {todayOverrides.length} override{todayOverrides.length !== 1 ? "s" : ""}
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5" /> Delays: {todayDelays}
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <XCircle className="h-3.5 w-3.5" /> Cancellations: {todayCancellations}
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" /> Notified: {todayNotified}/{todayOverrides.length}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="today">
        <TabsList className="rounded-full bg-muted p-1 h-auto">
          <TabsTrigger value="today" className="rounded-full px-5 py-2 gap-1.5 font-semibold text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Today
            {todayOverrides.length > 0 && (
              <span className="ml-1 bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none">
                {todayOverrides.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="rounded-full px-5 py-2 gap-1.5 font-semibold text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Upcoming
            {upcomingOverrides.length > 0 && (
              <span className="ml-1 bg-muted-foreground/20 text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none">
                {upcomingOverrides.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-5 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)
          ) : todayOverrides.length === 0 ? (
            <div className="text-center py-20 bg-card rounded-2xl border border-border shadow-sm">
              <CalendarCheck className="h-12 w-12 text-primary mx-auto mb-4" />
              <p className="text-lg font-semibold text-foreground">No overrides today</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">All services running as scheduled</p>
              <p className="text-xs text-muted-foreground mt-2 max-w-xs mx-auto">Create an override if you need to notify students of any changes</p>
              <Button onClick={handleNew} className="mt-5 bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-primary-foreground rounded-xl gap-1.5">
                <Plus className="h-4 w-4" /> New Override
              </Button>
            </div>
          ) : (
            todayOverrides.map((o) => (
              <OverrideCard key={o.id} override={o} onEdit={handleEdit} onDelete={deleteOverride} onNotify={notifyStudents} />
            ))
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="mt-5">
          {loading ? (
            Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)
          ) : upcomingOverrides.length === 0 ? (
            <div className="text-center py-20 bg-card rounded-2xl border border-border shadow-sm">
              <Calendar className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-lg font-semibold text-foreground">No upcoming overrides</p>
              <p className="text-sm text-muted-foreground mt-1">Planned overrides will appear here</p>
            </div>
          ) : (
            groupedUpcoming.map(([dateStr, items]) => (
              <div key={dateStr}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 mt-6 first:mt-0">
                  {formatGroupDate(dateStr)}
                </p>
                <div className="space-y-3">
                  {items.map((o) => (
                    <OverrideCard key={o.id} override={o} onEdit={handleEdit} onDelete={deleteOverride} onNotify={notifyStudents} />
                  ))}
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Form Drawer */}
      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) handleCancel(); else setSheetOpen(true); }}>
        <SheetContent className="w-full sm:max-w-[440px] overflow-y-auto p-0">
          <SheetHeader className="px-6 pt-6 pb-2">
            <SheetTitle className="text-xl">{editing ? "Edit Override" : "Create Service Override"}</SheetTitle>
            <SheetDescription>Students will be notified of this change</SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-6">
            <OverrideForm
              buses={buses}
              routes={routes}
              editing={editing}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
