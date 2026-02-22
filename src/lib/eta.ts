/**
 * eta.ts — Backward-compatibility shim.
 * All logic now lives in etaEngine.ts.
 */
export {
  haversineDistance,
  calculateETAsForStopLegacy as calculateETAsForStop,
  recordPing,
  type BusETA,
} from "@/lib/etaEngine";
