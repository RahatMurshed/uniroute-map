import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole: "driver" | "admin";
}

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, roles, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Role-aware redirect: send user to their correct dashboard
  if (!roles.includes(requiredRole)) {
    if (roles.includes("admin")) return <Navigate to="/admin" replace />;
    if (roles.includes("driver")) return <Navigate to="/driver" replace />;
    return <Navigate to="/map" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
