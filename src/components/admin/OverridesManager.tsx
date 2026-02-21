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
    overrides,
    buses,
    routes,
    loading,
    createOverride,
    updateOverride,
    deleteOverride,
    notifyStudents,
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Service Overrides</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="h-4 w-4 mr-1" />
          New Override
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today" className="gap-1">
            📅 Today
            {todayOverrides.length > 0 && (
              <span className="ml-1 bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full">
                {todayOverrides.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="gap-1">
            📋 Upcoming
            {upcomingOverrides.length > 0 && (
              <span className="ml-1 bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full">
                {upcomingOverrides.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))
          ) : todayOverrides.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg">✅ No service changes today</p>
              <p className="text-sm mt-1">All buses running on schedule</p>
            </div>
          ) : (
            todayOverrides.map((o) => (
              <OverrideCard
                key={o.id}
                override={o}
                onEdit={handleEdit}
                onDelete={deleteOverride}
                onNotify={notifyStudents}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4 space-y-3">
          {loading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))
          ) : upcomingOverrides.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg">📋 No upcoming overrides</p>
              <p className="text-sm mt-1">Schedule changes will appear here</p>
            </div>
          ) : (
            upcomingOverrides.map((o) => (
              <OverrideCard
                key={o.id}
                override={o}
                onEdit={handleEdit}
                onDelete={deleteOverride}
                onNotify={notifyStudents}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
