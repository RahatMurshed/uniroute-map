import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function DriverForm({ editing, buses, drivers, onCreate, onUpdate, onCancel }: DriverFormProps) {
  const { toast } = useToast();
  const [name, setName] = useState(editing?.displayName ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [busId, setBusId] = useState(editing?.assignedBus?.id ?? "");
  const [saving, setSaving] = useState(false);

  // Available buses: unassigned + current driver's bus
  const availableBuses = buses.filter(
    (b) => !b.driverId || b.driverId === editing?.id
  );

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
        toast({ title: "✅ Driver updated successfully" });
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
        toast({ title: "✅ Driver account created successfully" });
      }
      onCancel();
    } catch (err: any) {
      toast({ title: "Failed to save driver", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-bold text-foreground">
          {editing ? "Edit Driver" : "Add Driver"}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name *</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" required />
        </div>

        {!editing && (
          <>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="driver@uniroute.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  minLength={8}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+880 1234 567890" />
        </div>

        <div className="space-y-2">
          <Label>Assign Bus</Label>
          <Select value={busId} onValueChange={setBusId}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {availableBuses.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}{b.licensePlate ? ` — ${b.licensePlate}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" disabled={saving} className="w-full">
          {saving ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{editing ? "Updating…" : "Creating…"}</>
          ) : (
            editing ? "Update Driver" : "Create Driver"
          )}
        </Button>
      </form>
    </div>
  );
}
