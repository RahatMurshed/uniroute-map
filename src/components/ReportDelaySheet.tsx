import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, X, Clock, Construction, Wrench, XCircle, AlertOctagon } from "lucide-react";

const ISSUE_OPTIONS = [
  { key: "late", label: "Running Late", delayLabel: "Running Late", icon: <Clock className="h-5 w-5" /> },
  { key: "blockage", label: "Road Blockage", delayLabel: "Road Blockage", icon: <Construction className="h-5 w-5" /> },
  { key: "vehicle", label: "Vehicle Issue", delayLabel: "Vehicle Issue", icon: <Wrench className="h-5 w-5" /> },
  { key: "cancel", label: "Cancel Trip", delayLabel: "Cancelling Trip", icon: <XCircle className="h-5 w-5" /> },
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

      {/* Bottom sheet */}
      <div className={`fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-y-0" : "translate-y-full"}`}>
        <div className="mx-auto max-w-md px-6 pb-8 pt-4 space-y-5 safe-bottom">
          {/* Handle bar */}
          <div className="mx-auto h-1 w-10 rounded-full bg-[#E5E5E5]" />

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#D97706]/10 flex items-center justify-center">
                <AlertOctagon className="h-4 w-4 text-[#D97706]" />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-[#1A1A2E]">Report an Issue</h2>
            </div>
            <button onClick={handleClose} className="text-[#A8A29E] hover:text-[#1A1A2E] p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Options */}
          <div className="space-y-2.5">
            {ISSUE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSelected(opt.key)}
                className={`w-full rounded-xl border-2 px-5 py-4 text-left transition-all min-h-[56px] active:scale-[0.98] flex items-center gap-3 ${
                  selected === opt.key
                    ? "border-primary bg-primary/5 text-[#1A1A2E] shadow-sm"
                    : "border-[#E5E5E5] bg-white text-[#1A1A2E] hover:border-[#A8A29E]"
                } ${opt.key === "cancel" && selected === opt.key ? "border-[#DC2626] bg-red-50" : ""}`}
              >
                <span className={selected === opt.key ? "text-primary" : "text-[#78716C]"}>{opt.icon}</span>
                <span className="font-semibold text-sm">{opt.label}</span>
                {selected === opt.key && (
                  <span className="ml-auto text-primary">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Notes */}
          <Textarea
            placeholder="Add details for students…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="resize-none bg-[#F8F8F8] rounded-xl border-[#E5E5E5] text-[#1A1A2E] placeholder:text-[#A8A29E] min-h-[80px] text-sm"
            rows={3}
          />

          {/* Actions */}
          <div className="space-y-2.5">
            <Button
              className="w-full h-14 rounded-xl text-base font-bold bg-primary hover:bg-[#A81515] text-white shadow-lg transition-all active:scale-[0.97]"
              disabled={!selected || submitting}
              onClick={handleSubmit}
            >
              {submitting ? (<><Loader2 className="mr-2 h-5 w-5 animate-spin" />Submitting…</>) : "Submit Report"}
            </Button>
            <Button
              className="w-full h-12 rounded-xl text-sm font-semibold bg-transparent hover:bg-[#F8F8F8] text-[#78716C] border border-[#E5E5E5]"
              onClick={handleClose}
              disabled={submitting}
            >
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
