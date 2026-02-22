import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, X } from "lucide-react";

const ISSUE_OPTIONS = [
  { key: "late", label: "🕐 Running Late", delayLabel: "Running Late" },
  { key: "blockage", label: "🚧 Road Blockage", delayLabel: "Road Blockage" },
  { key: "vehicle", label: "🔧 Vehicle Issue", delayLabel: "Vehicle Issue" },
  { key: "cancel", label: "❌ Cancelling Trip", delayLabel: "Cancelling Trip" },
] as const;

type IssueKey = (typeof ISSUE_OPTIONS)[number]["key"];

interface ReportDelaySheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (issueKey: IssueKey, notes: string) => Promise<void>;
}

const ReportDelaySheet = ({ open, onClose, onSubmit }: ReportDelaySheetProps) => {
  const [selected, setSelected] = useState<IssueKey | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await onSubmit(selected, notes);
      setSelected(null);
      setNotes("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setSelected(null);
    setNotes("");
    onClose();
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={handleClose}
      />
      <div
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card border-t border-border shadow-lg transition-transform duration-300 ease-out ${open ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="mx-auto max-w-md px-5 pb-8 pt-4 space-y-5 safe-bottom">
          <div className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/20" />

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-foreground">Report an Issue</h2>
            <button onClick={handleClose} className="text-muted-foreground hover:text-foreground p-1 min-w-[44px] min-h-[44px] flex items-center justify-center">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {ISSUE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSelected(opt.key)}
                className={`rounded-xl border-2 px-4 py-4 text-sm font-semibold text-left transition-all min-h-[60px] active:scale-[0.97] ${
                  selected === opt.key
                    ? "border-primary bg-primary/10 text-foreground shadow-sm"
                    : "border-border bg-card text-foreground hover:border-muted-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Textarea
            placeholder="Additional notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="resize-none bg-background rounded-xl border-border"
            rows={2}
          />

          <div className="space-y-3">
            <Button
              className="w-full h-12 rounded-xl text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all active:scale-[0.98]"
              disabled={!selected || submitting}
              onClick={handleSubmit}
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
              ) : (
                "Submit Report"
              )}
            </Button>
            <Button variant="ghost" className="w-full rounded-xl" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export { ReportDelaySheet, ISSUE_OPTIONS };
export type { IssueKey };
