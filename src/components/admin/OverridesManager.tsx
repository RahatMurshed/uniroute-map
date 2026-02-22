import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useOverrides, type OverrideRecord } from "@/hooks/useOverrides";
import OverrideCard from "./overrides/OverrideCard";
import OverrideForm from "./overrides/OverrideForm";

export default function OverridesManager() {
  const {
    overrides, buses, routes, loading,
    createOverride, updateOverride, deleteOverride, notifyStudents,
  } = useOverrides();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OverrideRecord | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const todayOverrides = overrides.filter((o) => o.exceptionDate === today);
  const upcomingOverrides = overrides.filter((o) => o.exceptionDate > today);

  const handleEdit = (override: OverrideRecord) => {
    setEditing(override);
    setShowForm(true);
  };

  const handleSave = async (data: Parameters<typeof createOverride>[0]) => {
    if (editing) {
      const { notifyNow, ...rest } = data;
      return updateOverride(editing.id, rest);
    }
    return createOverride(data);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditing(null);
  };

  if (showForm) {
    return (
      <OverrideForm
        buses={buses}
        routes={routes}
        editing={editing}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Service Overrides</h2>
        <Button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold gap-1.5 shadow-md"
        >
          <Plus className="h-4 w-4" />
          New Override
        </Button>
      </div>

      <Tabs defaultValue="today">
        <TabsList className="rounded-xl bg-muted p-1">
          <TabsTrigger value="today" className="rounded-lg gap-1.5 font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm">
            📅 Today
            {todayOverrides.length > 0 && (
              <span className="ml-1 bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full font-bold">
                {todayOverrides.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="rounded-lg gap-1.5 font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm">
            📋 Upcoming
            {upcomingOverrides.length > 0 && (
              <span className="ml-1 bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full font-bold">
                {upcomingOverrides.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))
          ) : todayOverrides.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-xl border border-border shadow-sm">
              <span className="text-4xl">✅</span>
              <p className="text-base font-semibold text-foreground mt-3">No service changes today</p>
              <p className="text-sm text-muted-foreground mt-1">All routes running as scheduled.</p>
            </div>
          ) : (
            todayOverrides.map((o) => (
              <OverrideCard key={o.id} override={o} onEdit={handleEdit} onDelete={deleteOverride} onNotify={notifyStudents} />
            ))
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4 space-y-3">
          {loading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))
          ) : upcomingOverrides.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-xl border border-border shadow-sm">
              <span className="text-4xl">📋</span>
              <p className="text-base font-semibold text-foreground mt-3">No upcoming overrides</p>
              <p className="text-sm text-muted-foreground mt-1">Schedule changes will appear here</p>
            </div>
          ) : (
            upcomingOverrides.map((o) => (
              <OverrideCard key={o.id} override={o} onEdit={handleEdit} onDelete={deleteOverride} onNotify={notifyStudents} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
