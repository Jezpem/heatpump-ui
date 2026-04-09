"use client";
import { useState, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { api } from "@/lib/api";
import type { RoomStatus } from "@/lib/supabase";

const PHASE_STYLES: Record<string, { dot: string; badge: string; label: string }> = {
  HEATING:  { dot: "bg-red-400",    badge: "bg-red-500/15 text-red-300 border-red-500/30",    label: "Heating" },
  COASTING: { dot: "bg-green-400",  badge: "bg-green-500/15 text-green-300 border-green-500/30", label: "Coasting" },
  IDLE:     { dot: "bg-blue-400",   badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",  label: "Idle" },
  PARKED:   { dot: "bg-yellow-400", badge: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30", label: "Parked" },
};

interface Props {
  room: RoomStatus;
  isNight: boolean;
  onValveSet?: () => void;
}

export function RoomCard({ room, isNight, onValveSet }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const sendTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const phase = PHASE_STYLES[room.phase] ?? PHASE_STYLES.IDLE;
  const activeTarget = isNight ? room.night_target_temp_c : room.day_target_temp_c;
  const tempDelta = room.current_temp != null ? room.current_temp - activeTarget : null;

  const tempColor =
    room.current_temp == null
      ? "text-muted-foreground"
      : room.current_temp >= room.max_temp_c
      ? "text-red-400"
      : room.current_temp >= activeTarget
      ? "text-green-400"
      : "text-blue-400";

  function handleSlider(trv: RoomStatus["trvs"][0], val: number | readonly number[]) {
    const id = trv.device_id;
    const pos = Array.isArray(val) ? val[0] : (val as number);
    setSliderValues(prev => ({ ...prev, [id]: pos }));
    clearTimeout(sendTimer.current[id]);
    sendTimer.current[id] = setTimeout(async () => {
      setSending(prev => ({ ...prev, [id]: true }));
      try {
        await api.setValve(id, pos, trv.name);
        onValveSet?.();
      } finally {
        setSending(prev => ({ ...prev, [id]: false }));
      }
    }, 500);
  }

  const canMoveValves = !isNight || room.room_type !== "bedroom";

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      {/* Card header — always visible */}
      <button
        className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-accent/20 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Phase dot */}
        <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${phase.dot}`} />

        {/* Temp + name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{room.name}</span>
            <Badge variant="outline" className={`text-xs px-1.5 py-0 ${phase.badge}`}>
              {phase.label}
            </Badge>
            <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
              {room.room_type}
            </Badge>
          </div>

          {/* AI room reasoning — shown right on the card, not hidden */}
          {room.reasoning && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
              {room.reasoning}
            </p>
          )}
        </div>

        {/* Temp display */}
        <div className="text-right flex-shrink-0">
          <div className={`text-2xl font-semibold tabular-nums ${tempColor}`}>
            {room.current_temp != null ? `${room.current_temp.toFixed(1)}°` : "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            target {activeTarget}°
            {tempDelta != null && (
              <span className={tempDelta >= 0 ? " text-green-400" : " text-blue-400"}>
                {" "}{tempDelta >= 0 ? "+" : ""}{tempDelta.toFixed(1)}
              </span>
            )}
          </div>
          {room.eta_min != null && room.phase === "HEATING" && (
            <div className="text-xs text-muted-foreground">~{room.eta_min}min</div>
          )}
        </div>

        {/* Expand icon */}
        <span className="mt-1 text-muted-foreground flex-shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/40 px-4 py-3 space-y-4">
          {/* Full reasoning */}
          {room.reasoning && (
            <p className="text-sm text-foreground/80 leading-relaxed">{room.reasoning}</p>
          )}

          {/* TRV valves */}
          {room.trvs.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Valves {canMoveValves ? "" : "(parked — sleep window)"}
              </p>
              {room.trvs.map(trv => {
                const displayVal = sliderValues[trv.device_id] ?? trv.valve_pct ?? 0;
                return (
                  <div key={trv.device_id} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{trv.name}</span>
                      <div className="flex items-center gap-2">
                        {trv.current_temp != null && (
                          <span className="text-muted-foreground">{trv.current_temp.toFixed(1)}°</span>
                        )}
                        <span className={`font-medium ${sending[trv.device_id] ? "text-orange-400" : ""}`}>
                          {sending[trv.device_id] ? "Setting…" : `${displayVal}%`}
                        </span>
                        {trv.battery != null && trv.battery <= 25 && (
                          <span className="text-yellow-400">🔋 {trv.battery}%</span>
                        )}
                      </div>
                    </div>
                    <Slider
                      value={[displayVal]}
                      min={0}
                      max={100}
                      step={5}
                      disabled={!canMoveValves}
                      onValueChange={(val) => handleSlider(trv, val)}
                      className={!canMoveValves ? "opacity-40" : ""}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Stats row */}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Zone: <span className="text-foreground/70">{room.nest_zone_name || "—"}</span></span>
            <span>Ceiling: <span className="text-foreground/70">{room.max_temp_c}°</span></span>
            <span>Night park: <span className="text-foreground/70">{room.night_pos_pct}%</span></span>
          </div>
        </div>
      )}
    </div>
  );
}
