import { useState, useMemo } from "react";
import { Eye, EyeOff, Loader2, User, Mail, Phone, Lock, Bus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { DriverRecord, BusOption } from "@/hooks/useDriverManager";

interface DriverFormProps {
  editing: DriverRecord | null;
  buses: BusOption[];
  drivers: DriverRecord[];
  onCreate: (data: { email: string; password: string; display_name: string; phone?: string; bus_id?: string }) => Promise<any>;
  onUpdate: (data: { user_id: string; display_name: string; phone?: string; bus_id?: string; old_bus_id?: string }) => Promise<any>;
  onCancel: () => void;
}

function getPasswordStrength(pw: string): { label: string; value: number; color: string } {
  if (pw.length === 0) return { label: "", value: 0, color: "bg-muted" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { label: "Weak", value: 20, color: "text-destructive" };
  if (score === 2) return { label: "Fair", value: 40, color: "text-amber-600" };
  if (score === 3) return { label: "Strong", value: 70, color: "text-green-600" };
  return { label: "Very Strong", value: 100, color: "text-green-600" };
}

export default function DriverForm({ editing, buses, drivers, onCreate, onUpdate, onCancel }: DriverFormProps) {
  const { toast } = useToast();
  const [name, setName] = useState(editing?.displayName ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [busId, setBusId] = useState(editing?.assignedBus?.id ?? "");
  const [saving, setSaving] = useState(false);

  const availableBuses = buses.filter(
    (b) => !b.driverId || b.driverId === editing?.id
  );

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Full name is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await onUpdate({
          user_id: editing.id,
          display_name: name.trim(),
          phone: phone.trim() || undefined,
          bus_id: busId || undefined,
          old_bus_id: editing.assignedBus?.id,
        });
        toast({ title: "Driver updated successfully" });
      } else {
        if (!email.trim()) {
          toast({ title: "Email is required", variant: "destructive" });
          setSaving(false);
          return;
        }
        if (password.length < 8) {
          toast({ title: "Password must be at least 8 characters", variant: "destructive" });
          setSaving(false);
          return;
        }
        await onCreate({
          email: email.trim(),
          password,
          display_name: name.trim(),
          phone: phone.trim() || undefined,
          bus_id: busId || undefined,
        });
        toast({ title: "Driver account created successfully" });
      }
      onCancel();
    } catch (err: any) {
      toast({ title: "Failed to save driver", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Section 1: Personal Information */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Personal Information</h3>
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" className="pl-10" required />
          </div>
        </div>

        {!editing && (
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="driver@mu.edu" className="pl-10" required />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+880 1234 567890" className="pl-10" />
          </div>
        </div>
      </div>

      {/* Section 2: Account Security (new only) */}
      {!editing && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account Security</h3>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="pl-10 pr-10"
                minLength={8}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </div>
            {password.length > 0 && (
              <div className="space-y-1">
                <Progress value={strength.value} className="h-1.5" />
                <p className={`text-xs font-medium ${strength.color}`}>{strength.label}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section 3: Assignment */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assignment</h3>
        <div className="space-y-2">
          <Label>Assign Bus</Label>
          <div className="relative">
            <Bus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
            <Select value={busId} onValueChange={setBusId}>
              <SelectTrigger className="pl-10 bg-background">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {availableBuses.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}{b.licensePlate ? ` (${b.licensePlate})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-4 border-t border-border">
        <Button type="submit" disabled={saving} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl h-11">
          {saving ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{editing ? "Updating…" : "Creating…"}</>
          ) : (
            editing ? "Update Driver" : "Create Driver Account"
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="w-full rounded-xl h-11">
          Cancel
        </Button>
      </div>
    </form>
  );
}
