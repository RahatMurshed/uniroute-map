import { useState } from "react";
import { useRouteManager, type RouteRecord } from "@/hooks/useRouteManager";
import RouteList from "./route-manager/RouteList";
import RouteForm from "./route-manager/RouteForm";

export type RouteManagerView = "list" | "new" | "edit";

export default function RouteManager() {
  const manager = useRouteManager();
  const [view, setView] = useState<RouteManagerView>("list");
  const [editingRoute, setEditingRoute] = useState<RouteRecord | null>(null);

  const handleEdit = (route: RouteRecord) => {
    setEditingRoute(route);
    setView("edit");
  };

  const handleFormClose = () => {
    setView("list");
    setEditingRoute(null);
  };

  if (view === "new") {
    return (
      <RouteForm
        stops={manager.stops}
        onSave={async (data) => {
          const ok = await manager.createRoute(data);
          if (ok) handleFormClose();
        }}
        onCancel={handleFormClose}
        onCreateStop={manager.createStop}
      />
    );
  }

  if (view === "edit" && editingRoute) {
    return (
      <RouteForm
        stops={manager.stops}
        initialData={editingRoute}
        onSave={async (data) => {
          const ok = await manager.updateRoute(editingRoute.id, data);
          if (ok) handleFormClose();
        }}
        onCancel={handleFormClose}
        onCreateStop={manager.createStop}
      />
    );
  }

  return (
    <RouteList
      routes={manager.routes}
      stops={manager.stops}
      loading={manager.loading}
      onNewRoute={() => setView("new")}
      onEdit={handleEdit}
      onDelete={manager.deleteRoute}
    />
  );
}
