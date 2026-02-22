import { useState } from "react";
import { Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

  if (showForm) {
    return (
      <DriverForm
        editing={editing}
        buses={buses}
        drivers={drivers}
        onCreate={createDriver}
        onUpdate={updateDriver}
        onCancel={handleCancel}
      />
    );
  }

  const activeDrivers = drivers.filter((d) => d.role === "driver");
  const inactiveDrivers = drivers.filter((d) => d.role === "inactive_driver");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Driver Management</h2>
        <Button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold gap-1.5 shadow-md"
        >
          <Plus className="h-4 w-4" />
          Add Driver
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : drivers.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border shadow-sm">
          <User className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-base font-semibold text-foreground mt-3">No drivers added yet</p>
          <p className="text-sm text-muted-foreground mt-1">Click "+ Add Driver" to create driver accounts.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeDrivers.length > 0 && (
            <div className="space-y-3">
              {activeDrivers.map((d) => (
                <DriverCard key={d.id} driver={d} onEdit={handleEdit} onDeactivate={deactivateDriver} onReactivate={reactivateDriver} />
              ))}
            </div>
          )}

          {inactiveDrivers.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inactive Drivers</h3>
              {inactiveDrivers.map((d) => (
                <DriverCard key={d.id} driver={d} onEdit={handleEdit} onDeactivate={deactivateDriver} onReactivate={reactivateDriver} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
