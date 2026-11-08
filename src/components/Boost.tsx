"use client";
import { useCallback, useEffect, useState } from "react";
import { Flame, Loader2, OctagonX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export type BoostState = {
  active: boolean;
  activated_at: string | null;
  activated_by: string | null;
  elapsed_sec: number | null;
  max_setpoint_c: number;
};

// Both the banner and the Overview card hold their own copy, so a start or
// stop in one has to tell the other rather than waiting for the next poll.
const CHANGED = "boost-changed";
const POLL_MS = 10_000;

function formatElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(r).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(r).padStart(2, "0")}s`;
  return `${r}s`;
}

export function useBoost() {
  const [boost, setBoost] = useState<BoostState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      setBoost(await api.boost());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not read boost state");
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    window.addEventListener(CHANGED, refresh);
    return () => { clearInterval(poll); window.removeEventListener(CHANGED, refresh); };
  }, [refresh]);

  // Ticks the on-screen duration between polls so the banner never looks frozen.
  useEffect(() => {
    if (!boost?.active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [boost?.active]);

  const set = useCallback(async (on: boolean) => {
    setBusy(true);
    try {
      const res = await (on ? api.startBoost() : api.stopBoost());
      setBoost(res.boost);
      setError(null);
      window.dispatchEvent(new Event(CHANGED));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Boost command failed");
    } finally { setBusy(false); }
  }, []);

  let elapsed: number | null = null;
  if (boost?.active) {
    const started = boost.activated_at ? Date.parse(boost.activated_at) : NaN;
    elapsed = Number.isNaN(started) ? (boost.elapsed_sec ?? 0) : (now - started) / 1000;
  }

  return { boost, busy, error, elapsed, start: () => set(true), stop: () => set(false) };
}

/**
 * Sticks directly under the nav on every page while boost is running. The
 * override has no expiry and no temperature ceiling, so the only thing that
 * stops the house cooking is the occupant noticing it is still on.
 */
export function BoostBanner() {
  const { boost, busy, elapsed, stop } = useBoost();
  if (!boost?.active) return null;

  return (
    <div className="sticky top-14 z-40 border-y border-orange-500/50 bg-orange-600/95 backdrop-blur shadow-lg shadow-orange-950/40">
      <div className="container mx-auto max-w-6xl px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-200 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-orange-100" />
        </span>
        <Flame className="h-4 w-4 text-orange-100 shrink-0" />
        <span className="font-semibold text-sm text-white">BOOST ACTIVE</span>
        <span className="text-sm text-orange-50/90">
          Normal heating control is suspended — all valves fully open, all zones at{" "}
          {boost.max_setpoint_c}°C. No timer and no temperature limit.
        </span>
        <span className="ml-auto text-sm font-semibold tabular-nums text-white">
          {elapsed != null ? formatElapsed(elapsed) : "—"}
        </span>
        <Button
          size="sm"
          className="h-7 gap-1.5 bg-white text-orange-700 hover:bg-orange-50 font-semibold"
          onClick={stop}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <OctagonX className="h-3 w-3" />}
          Stop boost
        </Button>
      </div>
    </div>
  );
}

/** The control itself, on the Overview page. */
export function BoostCard() {
  const { boost, busy, error, elapsed, start, stop } = useBoost();
  const active = boost?.active ?? false;

  return (
    <div
      className={`rounded-xl border mb-6 px-5 py-4 ${
        active ? "border-orange-500/60 bg-orange-500/10" : "border-border/60 bg-card"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Flame className={`h-5 w-5 shrink-0 ${active ? "text-orange-400" : "text-muted-foreground"}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${active ? "text-orange-300" : ""}`}>
            {active ? "Boost is running" : "Boost"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {active
              ? `Running for ${elapsed != null ? formatElapsed(elapsed) : "—"}.`
                + ` Every valve is held fully open and every zone at ${boost?.max_setpoint_c}°C.`
                + " It will not stop on its own."
              : "Opens every valve fully and sets every zone to maximum, ignoring night parking,"
                + " valve limits and temperature ceilings. Runs until you stop it."}
          </p>
        </div>
        {active ? (
          <Button size="sm" className="gap-1.5 bg-orange-600 text-white hover:bg-orange-500"
                  onClick={stop} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <OctagonX className="h-3.5 w-3.5" />}
            Stop boost
          </Button>
        ) : (
          <Button size="sm" className="gap-1.5" onClick={start} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
            Start boost
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
