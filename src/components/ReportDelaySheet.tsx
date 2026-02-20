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
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={handleClose}
      />
      {/* Sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-background border-t border-border shadow-lg transition-transform duration-300 ease-out ${open ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="mx-auto max-w-md px-5 pb-8 pt-4 space-y-5">
          {/* Handle */}
          <div className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/30" />

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Report an Issue</h2>
            <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-3">
            {ISSUE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSelected(opt.key)}
                className={`rounded-xl border-2 px-3 py-3 text-sm font-medium text-left transition-colors ${
                  selected === opt.key
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-foreground hover:border-muted-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Notes */}
          <Textarea
            placeholder="Additional notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="resize-none bg-background"
            rows={2}
          />

          {/* Actions */}
          <div className="space-y-3">
            <Button
              className="w-full py-5 text-base"
              disabled={!selected || submitting}
              onClick={handleSubmit}
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
              ) : (
                "Submit Report"
              )}
            </Button>
            <Button variant="ghost" className="w-full" onClick={handleClose} disabled={submitting}>
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
