import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

function friendlyError(err: any): string {
  const msg = (err?.message ?? "").toLowerCase();
  const status = err?.status ?? err?.statusCode;
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) return "Connection error. Please check your internet and try again.";
  if (status === 429 || msg.includes("rate") || msg.includes("too many")) return "Too many failed attempts. Please wait 5 minutes before trying again.";
  if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) return "Incorrect email or password. Please try again.";
  if (msg.includes("email not confirmed")) return "Your email address has not been verified. Please check your inbox.";
  if (msg.includes("user not found")) return "No account found with this email address.";
  if (msg.includes("banned") || msg.includes("disabled")) return "Your account has been deactivated. Please contact your administrator.";
  return err?.message || "An unexpected error occurred. Please try again.";
}

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
    if (!navigator.onLine) { setError("Connection error. Please check your internet and try again."); return; }
    setSubmitting(true);
    try {
      await signIn(email, password);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication failed.");
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const roleList = (roles ?? []).map((r) => r.role);
      if (roleList.includes("admin")) { navigate("/admin", { replace: true }); }
      else if (roleList.includes("driver")) { navigate("/driver", { replace: true }); }
      else { setError("Your account has not been assigned a role. Please contact your administrator."); await supabase.auth.signOut(); }
    } catch (err: any) { setError(friendlyError(err)); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel — brand (hidden on mobile) */}
      <div className="hidden md:flex md:w-1/2 bg-secondary items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative text-center text-secondary-foreground space-y-6 px-8">
          <img src="/metropolitan-logo.png" alt="Metropolitan University" className="h-28 w-28 mx-auto object-contain" />
          <h1 className="text-3xl font-extrabold tracking-tight">MU Bus Tracker</h1>
          <p className="text-base text-secondary-foreground/70 max-w-xs mx-auto leading-relaxed">
            Metropolitan University Transport Services
          </p>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex flex-col">
        {/* Mobile header */}
        <div className="md:hidden bg-secondary px-6 py-8 text-secondary-foreground text-center safe-top">
          <img src="/metropolitan-logo.png" alt="Metropolitan University" className="h-16 w-16 mx-auto mb-3 object-contain" />
          <h1 className="text-2xl font-extrabold tracking-tight">MU Bus Tracker</h1>
          <p className="text-sm text-secondary-foreground/70 mt-1">Metropolitan University Transport Services</p>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm space-y-8">
            <div className="hidden md:block space-y-1">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h2>
              <p className="text-sm text-muted-foreground">Staff & Driver Portal</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive font-medium">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Address</label>
                <Input id="email" type="email" placeholder="you@metropolitan.edu" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} className="h-12 rounded-xl border-border bg-card text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-primary" />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</label>
                <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} className="h-12 rounded-xl border-border bg-card text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-primary" />
              </div>

              <Button type="submit" className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-md transition-all active:scale-[0.98]" disabled={submitting}>
                {submitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in…</>) : "Sign In"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                <button type="button" className="underline hover:text-foreground transition-colors" onClick={() => {}}>Forgot password?</button>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
