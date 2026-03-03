import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Clock, Bell, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

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

const features = [
  { icon: MapPin, title: "Real-Time Tracking", desc: "Live GPS positions updated every few seconds" },
  { icon: Clock, title: "Smart ETA", desc: "AI-powered arrival predictions for every stop" },
  { icon: Bell, title: "Push Notifications", desc: "Get alerted when your bus is approaching" },
];

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
      {/* Left panel — dark brand showcase (hidden on mobile) */}
      <div className="hidden md:flex md:w-1/2 bg-[#0F172A] items-center justify-center relative overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-[#CC1B1B]/20 rounded-full blur-[100px]" />
          <div className="absolute bottom-32 right-16 w-96 h-96 bg-[#CC1B1B]/10 rounded-full blur-[120px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/5 rounded-full blur-[80px]" />
        </div>

        <div className="relative z-10 px-12 max-w-md">
          <img src="/uniroute-logo.png" alt="UniRoute" className="h-20 w-20 mb-8 object-contain" />
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">UniRoute</h1>
          <p className="text-base text-gray-400 mb-12 leading-relaxed">
            Real-time campus bus tracking for staff and drivers.
          </p>

          <div className="space-y-6">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <f.icon className="h-5 w-5 text-[#CC1B1B]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{f.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Mobile header */}
        <div className="md:hidden bg-[#0F172A] px-6 pt-10 pb-8 text-white safe-top relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-4 right-4 w-40 h-40 bg-[#CC1B1B]/20 rounded-full blur-[60px]" />
          </div>
          <div className="relative z-10">
            <Link to="/map" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors mb-4">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to map
            </Link>
            <div className="flex items-center gap-3">
              <img src="/uniroute-logo.png" alt="UniRoute" className="h-12 w-12 object-contain" />
              <div>
                <h1 className="text-xl font-extrabold tracking-tight">UniRoute</h1>
                <p className="text-xs text-gray-400 mt-0.5">Staff & Driver Portal</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm space-y-8">
            <div className="hidden md:block space-y-1">
              <Link to="/map" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to map
              </Link>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h2>
              <p className="text-sm text-muted-foreground">Sign in to the Staff & Driver Portal</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-2xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive font-medium">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Address</label>
                <Input id="email" type="email" placeholder="you@university.edu" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} className="h-14 rounded-2xl border-border bg-gray-50 text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-[#CC1B1B] focus-visible:ring-2 focus-visible:ring-offset-0 text-base" />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</label>
                <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} className="h-14 rounded-2xl border-border bg-gray-50 text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-[#CC1B1B] focus-visible:ring-2 focus-visible:ring-offset-0 text-base" />
              </div>

              <Button type="submit" className="w-full h-14 rounded-2xl bg-[#CC1B1B] hover:bg-[#A81515] text-white font-semibold text-base shadow-lg shadow-[#CC1B1B]/20 transition-all active:scale-[0.98]" disabled={submitting}>
                {submitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in…</>) : "Sign In"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                <button type="button" className="underline hover:text-foreground transition-colors" onClick={() => {}}>Forgot password?</button>
              </p>
            </form>

            <p className="text-center text-[11px] text-muted-foreground/60 pt-4">
              Powered by <span className="font-semibold text-muted-foreground/80">UniRoute</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
