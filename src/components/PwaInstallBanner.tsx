import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Bus, Download } from "lucide-react";

const DISMISS_KEY = "uniroute_install_dismissed";
const VISIT_KEY = "uniroute_map_visits";
const DISMISS_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS(): boolean { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream; }
function isStandalone(): boolean { return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true; }
function isDismissed(): boolean { try { const ts = localStorage.getItem(DISMISS_KEY); if (!ts) return false; return Date.now() - parseInt(ts, 10) < DISMISS_DAYS * 86400000; } catch { return false; } }
function getVisitCount(): number { try { return parseInt(localStorage.getItem(VISIT_KEY) || "0", 10); } catch { return 0; } }
function incrementVisitCount(): number { const count = getVisitCount() + 1; try { localStorage.setItem(VISIT_KEY, String(count)); } catch {} return count; }

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [showIOS, setShowIOS] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;
    const visits = incrementVisitCount();
    if (visits < 2) return;
    if (isIOS()) { setShowIOS(true); return; }
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e as BeforeInstallPromptEvent); setShow(true); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") { setInstalled(true); setTimeout(() => setShow(false), 2000); }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setShow(false); setShowIOS(false);
  }, []);

  if (installed) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-[1100] mx-auto max-w-md rounded-2xl bg-success text-success-foreground p-4 text-center shadow-lg">
        <p className="font-semibold">MU Bus Tracker installed!</p>
      </div>
    );
  }

  if (showIOS) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-[1100] mx-auto max-w-md rounded-2xl bg-background/95 backdrop-blur-md shadow-lg border border-border p-4">
        <div className="space-y-3">
          <p className="font-semibold text-foreground flex items-center gap-2"><Bus className="h-5 w-5 text-primary" /> Add MU Bus Tracker to Home Screen</p>
          <ol className="text-sm text-muted-foreground space-y-1.5 list-inside">
            <li>1. Tap the <strong>Share</strong> button</li>
            <li>2. Select <strong>"Add to Home Screen"</strong></li>
            <li>3. Tap <strong>"Add"</strong></li>
          </ol>
          <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={handleDismiss}>Got it</Button></div>
        </div>
      </div>
    );
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[1100] mx-auto max-w-md rounded-2xl bg-background/95 backdrop-blur-md shadow-lg border border-border p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="font-semibold text-foreground flex items-center gap-2"><Bus className="h-5 w-5 text-primary" /> Install MU Bus Tracker</p>
          <p className="text-sm text-muted-foreground mt-0.5">Get instant bus alerts on your home screen — works offline too!</p>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <Button variant="ghost" size="sm" onClick={handleDismiss}>Not Now</Button>
        <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5" onClick={handleInstall}>
          <Download className="h-3.5 w-3.5" /> Install App
        </Button>
      </div>
    </div>
  );
}
