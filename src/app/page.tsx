"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AiBrain } from "@/components/AiBrain";
import { BoilerStatusBar } from "@/components/BoilerStatus";
import { RoomCard } from "@/components/RoomCard";
import { supabase } from "@/lib/supabase";
import type { HeatEngineStatus } from "@/lib/supabase";
import { AlertTriangle, Thermometer, Droplets, Activity } from "lucide-react";

const POLL_INTERVAL = 30_000;

// ── Heat pump summary strip ───────────────────────────────────────────────────
type HpSummary = {
  buffer_temp_c: number | null;
  dhw_temp_c: number | null;
  buffer_setpoint_c: number | null;
  dhw_setpoint_c: number | null;
  alarm_active: boolean;
  alarm_text: string | null;
};

function HpStrip({ data }: { data: HpSummary | null }) {
  if (!data) return null;
  return (
    <Link href="/heatpump" className="block mb-4">
      <div className={`flex flex-wrap gap-3 rounded-xl border px-4 py-3 text-sm transition-colors hover:bg-accent/10 ${
        data.alarm_active ? "border-red-500/40 bg-red-500/10" : "border-border/40 bg-card"
      }`}>
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-orange-400" />
          <span className="text-xs font-medium text-muted-foreground">Heat Pump</span>
        </div>
        {data.alarm_active && (
          <div className="flex items-center gap-1 text-red-300 text-xs">
            <AlertTriangle className="h-3 w-3" /> {data.alarm_text}
          </div>
        )}
        <div className="flex items-center gap-1 text-xs ml-auto sm:ml-0">
          <Thermometer className="h-3 w-3 text-orange-300" />
          <span className="text-muted-foreground">Buffer</span>
          <span className="font-medium tabular-nums">{data.buffer_temp_c?.toFixed(1) ?? "—"}°</span>
          {data.buffer_setpoint_c && <span className="text-muted-foreground/60">→{data.buffer_setpoint_c.toFixed(0)}°</span>}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <Droplets className="h-3 w-3 text-blue-300" />
          <span className="text-muted-foreground">DHW</span>
          <span className="font-medium tabular-nums">{data.dhw_temp_c?.toFixed(1) ?? "—"}°</span>
          {data.dhw_setpoint_c && <span className="text-muted-foreground/60">→{data.dhw_setpoint_c.toFixed(0)}°</span>}
        </div>
        <span className="text-xs text-muted-foreground/50 ml-auto">→ details</span>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const [status, setStatus] = useState<HeatEngineStatus | null>(null);
  const [hpSummary, setHpSummary] = useState<HpSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.rooms();
      setStatus(data);
      setLastRefresh(new Date());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load status");
    }
  }, []);

  // Fetch heat pump strip data in background — non-blocking
  const fetchHp = useCallback(async () => {
    try {
      const [rt, st] = await Promise.allSettled([api.hpRealtime(), api.hpStatus()]);
      const tank = rt.status === "fulfilled" ? (rt.value.tank as Record<string, number | null> | undefined) : undefined;
      const hpSt = st.status === "fulfilled" ? st.value : null;
      if (tank) {
        setHpSummary({
          buffer_temp_c: tank.buffer_temp_c ?? null,
          dhw_temp_c: tank.dhw_temp_c ?? null,
          buffer_setpoint_c: tank.buffer_setpoint_c ?? null,
          dhw_setpoint_c: tank.dhw_setpoint_c ?? null,
          alarm_active: Boolean(hpSt?.alarm_active),
          alarm_text: (hpSt?.alarm_text as string) ?? null,
        });
      }
    } catch { /* ignore — strip is non-critical */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchHp();
    const interval = setInterval(fetchStatus, POLL_INTERVAL);
    const hpInterval = setInterval(fetchHp, 120_000);
    return () => { clearInterval(interval); clearInterval(hpInterval); };
  }, [fetchStatus, fetchHp]);

  // Supabase Realtime — refresh when a new AI decision lands
  useEffect(() => {
    const channel = supabase
      .channel("automation_log_changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "automation_log" }, () => {
        fetchStatus();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchStatus]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
        {error}
        <button className="ml-4 underline" onClick={fetchStatus}>Retry</button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Heat pump summary strip */}
      <HpStrip data={hpSummary} />

      {/* AI Brain — the hero section */}
      <AiBrain status={status} onCycleTriggered={fetchStatus} />

      {/* Boiler zones */}
      <BoilerStatusBar boilers={status.boilers} />

      {/* Room cards */}
      <div className="space-y-3">
        {status.rooms
          .filter(r => r.enabled)
          .map(room => (
            <RoomCard
              key={room.name}
              room={room}
              isNight={status.is_night}
              onValveSet={fetchStatus}
            />
          ))}
      </div>

      {lastRefresh && (
        <p className="text-xs text-muted-foreground text-center mt-6">
          Updated {lastRefresh.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          {" · "}auto-refreshes every 30s
        </p>
      )}
    </div>
  );
}
