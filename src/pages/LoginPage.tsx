import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { signIn } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await signIn(email, password);

      // Fetch roles to determine redirect
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication failed.");

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roleList = (roles ?? []).map((r) => r.role);

      if (roleList.includes("admin")) {
        navigate("/admin", { replace: true });
      } else if (roleList.includes("driver")) {
        navigate("/driver", { replace: true });
      } else {
        setError("Your account has not been assigned a role. Please contact your administrator.");
        await supabase.auth.signOut();
      }
    } catch (err: any) {
      if (err?.message?.toLowerCase().includes("invalid")) {
        setError("Invalid email or password. Please try again.");
      } else if (!error) {
        setError(err.message || "An unexpected error occurred.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-border shadow-lg">
        <CardHeader className="space-y-1 text-center pb-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            UniRoute
          </h1>
          <p className="text-sm text-muted-foreground">Staff &amp; Driver Portal</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@university.edu"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              <button type="button" className="underline hover:text-foreground" onClick={() => {}}>
                Forgot password?
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
