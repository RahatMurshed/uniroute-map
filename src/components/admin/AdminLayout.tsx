import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Route, CalendarClock, Users, BarChart3, FileDown, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export type AdminView = "fleet" | "routes" | "overrides" | "drivers" | "reports" | "export";

const navItems: { id: AdminView; label: string; icon: React.ReactNode }[] = [
  { id: "fleet", label: "Fleet Overview", icon: <LayoutDashboard className="h-5 w-5" /> },
  { id: "routes", label: "Route Manager", icon: <Route className="h-5 w-5" /> },
  { id: "overrides", label: "Overrides", icon: <CalendarClock className="h-5 w-5" /> },
  { id: "drivers", label: "Drivers", icon: <Users className="h-5 w-5" /> },
  { id: "reports", label: "Reports", icon: <BarChart3 className="h-5 w-5" /> },
  { id: "export", label: "PDF Export", icon: <FileDown className="h-5 w-5" /> },
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
      <aside className="hidden md:flex md:w-64 flex-col bg-sidebar shrink-0">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <img src="/uniroute-logo.png" alt="UniRoute" className="h-8 w-8 object-contain" />
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-sidebar-foreground">UniRoute</h1>
              <p className="text-xs text-sidebar-foreground/50">Admin Dashboard</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeView === item.id
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-3">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-sm font-bold text-sidebar-accent-foreground">
              {(displayName ?? "A").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{displayName}</p>
              <p className="text-xs text-sidebar-foreground/40 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground/50 hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="shrink-0 h-14 flex items-center justify-between px-5 border-b border-border bg-card shadow-sm">
          <h2 className="text-base font-bold tracking-tight text-card-foreground md:hidden flex items-center gap-2">
            <img src="/uniroute-logo.png" alt="UniRoute" className="h-6 w-6 object-contain" /> UniRoute
          </h2>
          <h2 className="text-base font-bold tracking-tight text-card-foreground hidden md:flex items-center gap-2">
            {navItems.find((n) => n.id === activeView)?.icon}
            {navItems.find((n) => n.id === activeView)?.label}
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-sm font-mono text-muted-foreground tabular-nums">{timeStr}</span>
            <span className="text-sm font-medium text-foreground hidden sm:block">{displayName}</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-background">
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden shrink-0 border-t border-border bg-card flex safe-bottom">
          {navItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold transition-all min-h-[52px] ${
                activeView === item.id ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <div className={`px-3 py-0.5 rounded-full transition-colors ${
                activeView === item.id ? "bg-primary/10" : ""
              }`}>
                {item.icon}
              </div>
              <span className="truncate max-w-[60px]">{item.label.split(" ")[0]}</span>
            </button>
          ))}
          <button
            onClick={handleLogout}
            className="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold text-muted-foreground min-h-[52px]"
          >
            <LogOut className="h-5 w-5" />
            <span>Logout</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
