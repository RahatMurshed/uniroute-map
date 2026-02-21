import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDriverManager, type DriverRecord } from "@/hooks/useDriverManager";
import DriverCard from "./drivers/DriverCard";
import DriverForm from "./drivers/DriverForm";

export default function DriversManager() {
  const {
    drivers,
    buses,
    loading,
    createDriver,
    updateDriver,
    deactivateDriver,
    reactivateDriver,
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Driver Management</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Driver
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : drivers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">👤 No drivers added yet</p>
          <p className="text-sm mt-1">Click "+ Add Driver" to create driver accounts.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeDrivers.length > 0 && (
            <div className="space-y-3">
              {activeDrivers.map((d) => (
                <DriverCard
                  key={d.id}
                  driver={d}
                  onEdit={handleEdit}
                  onDeactivate={deactivateDriver}
                  onReactivate={reactivateDriver}
                />
              ))}
            </div>
          )}

          {inactiveDrivers.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Inactive Drivers</h3>
              {inactiveDrivers.map((d) => (
                <DriverCard
                  key={d.id}
                  driver={d}
                  onEdit={handleEdit}
                  onDeactivate={deactivateDriver}
                  onReactivate={reactivateDriver}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
