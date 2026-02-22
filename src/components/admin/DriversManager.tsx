import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useDriverManager, type DriverRecord } from "@/hooks/useDriverManager";
import DriverCard from "./drivers/DriverCard";
import DriverForm from "./drivers/DriverForm";

export default function DriversManager() {
  const {
    drivers, buses, loading,
    createDriver, updateDriver, deactivateDriver, reactivateDriver,
  } = useDriverManager();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DriverRecord | null>(null);

  const handleEdit = (driver: DriverRecord) => {
    setEditing(driver);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditing(null);
  };

  const activeDrivers = drivers.filter((d) => d.role === "driver");
  const inactiveDrivers = drivers.filter((d) => d.role === "inactive_driver");

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Driver Management</h2>
          {!loading && drivers.length > 0 && (
            <Badge variant="secondary" className="text-xs font-medium">
              {drivers.length} driver{drivers.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <Button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold gap-1.5 shadow-md"
        >
          <UserPlus className="h-4 w-4" />
          Add Driver
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : drivers.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-border shadow-sm">
          <Users className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-lg font-semibold text-foreground mt-4">No drivers added yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-6">Add your first driver to get started</p>
          <Button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold gap-1.5"
          >
            <UserPlus className="h-4 w-4" />
            Add Driver
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {activeDrivers.length > 0 && (
            <div className="space-y-4">
              {activeDrivers.map((d) => (
                <DriverCard key={d.id} driver={d} onEdit={handleEdit} onDeactivate={deactivateDriver} onReactivate={reactivateDriver} />
              ))}
            </div>
          )}

          {inactiveDrivers.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inactive Drivers</h3>
              {inactiveDrivers.map((d) => (
                <DriverCard key={d.id} driver={d} onEdit={handleEdit} onDeactivate={deactivateDriver} onReactivate={reactivateDriver} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Driver Form Sheet */}
      <Sheet open={showForm} onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <SheetContent className="w-full sm:max-w-[440px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Driver" : "Add Driver"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <DriverForm
              editing={editing}
              buses={buses}
              drivers={drivers}
              onCreate={createDriver}
              onUpdate={updateDriver}
              onCancel={handleCancel}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
