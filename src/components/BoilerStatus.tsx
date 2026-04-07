"use client";
import { Flame } from "lucide-react";
import type { BoilerStatus } from "@/lib/supabase";

interface Props {
  boilers: Record<string, BoilerStatus>;
}

export function BoilerStatusBar({ boilers }: Props) {
  const entries = Object.entries(boilers);
  if (!entries.length) return null;

  return (
    <div className="flex flex-wrap gap-3 mb-5">
      {entries.map(([zone, b]) => (
        <div
          key={zone}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            b.on
              ? "border-orange-500/40 bg-orange-500/10 text-orange-200"
              : "border-border/40 bg-muted/20 text-muted-foreground"
          }`}
        >
          <Flame className={`h-3.5 w-3.5 ${b.on ? "text-orange-400" : "text-muted-foreground/50"}`} />
          <span className="font-medium">{zone}</span>
          <span className="text-xs opacity-70">{b.on ? `${b.setpoint_c}°C` : "OFF"}</span>
          {b.current_temp != null && (
            <span className="text-xs opacity-50">ambient {b.current_temp.toFixed(1)}°</span>
          )}
        </div>
      ))}
    </div>
  );
}
