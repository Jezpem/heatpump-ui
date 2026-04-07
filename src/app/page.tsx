"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { AiBrain } from "@/components/AiBrain";
import { BoilerStatusBar } from "@/components/BoilerStatus";
import { RoomCard } from "@/components/RoomCard";
import { supabase } from "@/lib/supabase";
import type { HeatEngineStatus } from "@/lib/supabase";

const POLL_INTERVAL = 30_000;

export default function Dashboard() {
  const [status, setStatus] = useState<HeatEngineStatus | null>(null);
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

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchStatus]);

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
