import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/integrations/supabase/client";
import { Map, Route, CalendarDays, Users, BarChart3, FileText, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export type AdminView = "fleet" | "routes" | "overrides" | "drivers" | "reports" | "export";

const navItems: { id: AdminView; label: string; icon: React.ReactNode; emoji: string }[] = [
  { id: "fleet", label: "Fleet Overview", icon: <Map className="h-5 w-5" />, emoji: "🗺️" },
  { id: "routes", label: "Route Manager", icon: <Route className="h-5 w-5" />, emoji: "🛤️" },
  { id: "overrides", label: "Overrides", icon: <CalendarDays className="h-5 w-5" />, emoji: "📅" },
  { id: "drivers", label: "Drivers", icon: <Users className="h-5 w-5" />, emoji: "👤" },
  { id: "reports", label: "Reports", icon: <BarChart3 className="h-5 w-5" />, emoji: "📊" },
  { id: "export", label: "PDF Export", icon: <FileText className="h-5 w-5" />, emoji: "📄" },
];

interface AdminLayoutProps {
  activeView: AdminView;
  onViewChange: (view: AdminView) => void;
  children: React.ReactNode;
}

export default function AdminLayout({ activeView, onViewChange, children }: AdminLayoutProps) {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name").eq("id", user.id).single().then(({ data }) => {
      setDisplayName(data?.display_name ?? user.email ?? "Admin");
    });
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const timeStr = clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-60 flex-col border-r border-border bg-sidebar shrink-0">
        <div className="p-4 border-b border-sidebar-border">
          <h1 className="text-lg font-bold text-sidebar-foreground">🚌 UniRoute Admin</h1>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeView === item.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              <span className="text-base">{item.emoji}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-2 border-t border-sidebar-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="shrink-0 h-14 flex items-center justify-between px-4 border-b border-border bg-card">
          <h2 className="text-base font-semibold text-card-foreground md:hidden">🚌 UniRoute Admin</h2>
          <h2 className="text-base font-semibold text-card-foreground hidden md:block">
            {navItems.find((n) => n.id === activeView)?.emoji} {navItems.find((n) => n.id === activeView)?.label}
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-muted-foreground">{timeStr}</span>
            <span className="text-sm font-medium text-foreground hidden sm:block">{displayName}</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden shrink-0 border-t border-border bg-background flex">
          {navItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                activeView === item.id ? "text-primary font-semibold" : "text-muted-foreground"
              }`}
            >
              <span className="text-lg">{item.emoji}</span>
              <span className="truncate max-w-[60px]">{item.label.split(" ")[0]}</span>
            </button>
          ))}
          <button
            onClick={handleLogout}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs text-destructive"
          >
            <span className="text-lg">🚪</span>
            <span>Logout</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
