import { useState } from "react";
import { Loader2, X, Clock, Construction, Wrench, XCircle, AlertOctagon, ChevronRight } from "lucide-react";

const ISSUE_OPTIONS = [
  { key: "late", label: "Running Late", subtitle: "Inform students of delay", delayLabel: "Running Late", Icon: Clock, color: "bg-amber-500/20 text-amber-400" },
  { key: "blockage", label: "Road Blockage", subtitle: "Report road obstruction", delayLabel: "Road Blockage", Icon: Construction, color: "bg-red-500/20 text-red-400" },
  { key: "vehicle", label: "Vehicle Issue", subtitle: "Mechanical or technical problem", delayLabel: "Vehicle Issue", Icon: Wrench, color: "bg-blue-500/20 text-blue-400" },
  { key: "cancel", label: "Cancel Trip", subtitle: "End trip and notify students", delayLabel: "Cancelling Trip", Icon: XCircle, color: "bg-red-500/20 text-red-400" },
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
    try { await onSubmit(selected, notes); setSelected(null); setNotes(""); }
    finally { setSubmitting(false); }
  };

  const handleClose = () => { if (submitting) return; setSelected(null); setNotes(""); onClose(); };

  return (
    <>
      {/* Dark overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={handleClose}
      />

      {/* Bottom sheet - dark theme */}
      <div className={`fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-[#1E293B] border-t border-white/10 shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-y-0" : "translate-y-full"}`}>
        <div className="mx-auto max-w-md px-6 pb-8 pt-4 space-y-5 safe-bottom">
          {/* Handle bar */}
          <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertOctagon className="h-6 w-6 text-amber-400" />
              <h2 className="text-xl font-bold text-white">Report an Issue</h2>
            </div>
            <button onClick={handleClose} className="text-white/40 hover:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Options */}
          <div className="space-y-2.5">
            {ISSUE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSelected(opt.key)}
                className={`w-full rounded-2xl border px-4 py-4 text-left transition-all min-h-[60px] active:scale-[0.98] flex items-center gap-3 ${
                  selected === opt.key
                    ? "border-[#CC1B1B] bg-[#CC1B1B]/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${opt.color}`}>
                  <opt.Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-white block">{opt.label}</span>
                  <span className="text-xs text-white/40 block">{opt.subtitle}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-white/30 shrink-0" />
              </button>
            ))}
          </div>

          {/* Notes */}
          <textarea
            placeholder="Add details for students…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full resize-none bg-white/5 rounded-2xl border border-white/10 text-white placeholder:text-white/30 min-h-[80px] text-sm px-4 py-3 focus:border-white/30 focus:outline-none transition-colors"
            rows={3}
          />

          {/* Actions */}
          <div className="space-y-2.5">
            <button
              className="w-full h-14 rounded-2xl text-base font-semibold bg-[#CC1B1B] hover:bg-[#A81515] text-white shadow-[0_4px_15px_rgba(204,27,27,0.4)] transition-all active:scale-[0.97] disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
              disabled={!selected || submitting}
              onClick={handleSubmit}
            >
              {submitting ? (<><Loader2 className="h-5 w-5 animate-spin" />Submitting…</>) : "Submit Report"}
            </button>
            <button
              className="w-full h-12 rounded-2xl text-sm font-semibold text-white/50 hover:text-white/70 transition-colors"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export { ReportDelaySheet, ISSUE_OPTIONS };
export type { IssueKey };
