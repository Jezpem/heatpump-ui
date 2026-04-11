"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import {
  RefreshCw, Thermometer, BatteryLow, Wifi, WifiOff,
  LayoutGrid, Settings2, Save, ChevronDown, ChevronRight, X, Plus,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TrvDetail {
  name: string;
  device_id: string;
  current_temp: number | null;
  valve_pct: number | null;
  battery: number | null;
  connected: boolean;
}

interface Room {
  name: string;
  room_type: "bedroom" | "living" | "zone_only";
  nest_zone_name: string;
  phase: "HEATING" | "COASTING" | "IDLE" | "PARKED";
  current_temp: number | null;
  day_target_temp_c: number;
  night_target_temp_c: number;
  max_temp_c: number;
  min_pos_pct: number;
  night_pos_pct: number;
  park_at_night: boolean;
  park_time: string;
  night_start: string;
  night_end: string;
  morning_boost_time: string;
  morning_boost_temp_c: number | null;
  morning_boost_duration_min: number | null;
  enabled: boolean;
  reasoning: string;
  eta_min: number | null;
  trvs: TrvDetail[];
  shelly_zones: string[];
}

/** Editable per-room config fields (mirrors backend RoomConfig) */
interface RoomCfg {
  name: string;
  enabled: boolean;
  room_type: "bedroom" | "living" | "zone_only";
  nest_zone_name: string;
  shelly_zones: string[];
  day_target_temp_c: number;
  target_temp_c: number;       // night target
  max_temp_c: number;
  min_pos_pct: number;
  night_pos_pct: number;
  park_time: string;
  night_end: string;
  nest_idle_temp_c?: number;
  morning_boost_time?: string;
  morning_boost_temp_c?: number | null;
  morning_boost_duration_min?: number | null;
  [key: string]: unknown;
}

interface FullConfig {
  rooms: RoomCfg[];
  morning_boost_time?: string;
  morning_boost_temp_c?: number;
  morning_boost_duration_min?: number;
  [key: string]: unknown;
}


// ── Phase styles ──────────────────────────────────────────────────────────────
const PHASE: Record<string, { dot: string; badge: string; label: string }> = {
  HEATING:  { dot: "bg-red-400",    badge: "bg-red-500/15 text-red-300 border-red-500/30",    label: "Heating" },
  COASTING: { dot: "bg-green-400",  badge: "bg-green-500/15 text-green-300 border-green-500/30", label: "Coasting" },
  IDLE:     { dot: "bg-blue-400",   badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",  label: "Idle" },
  PARKED:   { dot: "bg-yellow-400", badge: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30", label: "Parked" },
};

// ── Schedule helpers ──────────────────────────────────────────────────────────
function parseHHMM(s: string): number {
  const [h, m] = (s || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isInNightWindow(minuteOfDay: number, parkTime: string, nightEnd: string): boolean {
  const park = parseHHMM(parkTime);
  const end  = parseHHMM(nightEnd);
  if (park < end) return minuteOfDay >= park && minuteOfDay < end;
  return minuteOfDay >= park || minuteOfDay < end;
}

// ── 24h schedule chart builder ────────────────────────────────────────────────
// Shows what the valves and boiler will actually do over 24h based on schedule.
// No temperature prediction — schedule is deterministic; temperature is not.
interface SchedulePoint {
  timeMs: number;
  label: string;
  valvePct: number;      // Predicted valve position %
  boilerSetpoint: number; // Nest setpoint the engine will target
  nightBand?: number;    // Present during night window (for shaded area)
  boostBand?: number;    // Present during boost window (for shaded area)
}

function buildScheduleChart(room: Room, cfg: RoomCfg, nowMs: number): SchedulePoint[] {
  const STEP_MIN = 15;
  const STEPS = 24 * 60 / STEP_MIN;   // full 24 hours forward
  const points: SchedulePoint[] = [];

  const boostTime  = cfg.morning_boost_time ? parseHHMM(cfg.morning_boost_time) : null;
  const boostTemp  = cfg.morning_boost_temp_c  ?? 21;
  const boostDurMin = cfg.morning_boost_duration_min ?? 60;
  const nightEndMin = parseHHMM(cfg.night_end ?? "06:00");

  for (let i = 0; i <= STEPS; i++) {
    const ms  = nowMs + i * STEP_MIN * 60_000;
    const d   = new Date(ms);
    const min = d.getHours() * 60 + d.getMinutes();
    const night = room.park_at_night && isInNightWindow(min, cfg.park_time ?? "18:55", cfg.night_end ?? "06:00");

    // Boost window: starts at boostTime (or nightEnd if not set), lasts boostDurMin
    const boostStart = boostTime ?? nightEndMin;
    const boostEnd   = (boostStart + boostDurMin) % 1440;
    const inBoost = !night && (
      boostEnd > boostStart
        ? min >= boostStart && min < boostEnd
        : min >= boostStart || min < boostEnd
    );

    const valvePct = night
      ? (cfg.night_pos_pct ?? 5)
      : (cfg.min_pos_pct ?? 5);          // AI may open further; min is the floor

    const boilerSetpoint = night
      ? (cfg.nest_idle_temp_c ?? 15)
      : inBoost
        ? boostTemp
        : (cfg.day_target_temp_c ?? 21);

    points.push({
      timeMs: ms,
      label: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      valvePct,
      boilerSetpoint,
      nightBand: night ? 100 : undefined,
      boostBand: inBoost ? 100 : undefined,
    });
  }
  return points;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const relevant = payload.filter(p => p.name !== "Night" && p.name !== "Boost");
  if (!relevant.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs space-y-1 shadow-lg">
      <p className="font-medium text-muted-foreground">{label}</p>
      {relevant.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(p.name === "Valve" ? 0 : 1) : p.value}
          {p.name === "Valve" ? "%" : "°C"}
        </p>
      ))}
    </div>
  );
}

// ── Form helpers ──────────────────────────────────────────────────────────────
function NI({ label, value, onChange, step = 0.5, min, max }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input type="number" value={value} step={step} min={min} max={max}
        onChange={e => onChange(Number(e.target.value))}
        className="rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
    </label>
  );
}

function TI({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="HH:MM"
        className="rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
    </label>
  );
}

function SI({ label, value, onChange, placeholder = "" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
    </label>
  );
}

// ── TRV strip ─────────────────────────────────────────────────────────────────
function TrvStrip({ trvs }: { trvs: TrvDetail[] }) {
  if (!trvs.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {trvs.map(trv => (
        <div key={trv.device_id} className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs">
          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${trv.connected ? "bg-green-400" : "bg-muted-foreground"}`} />
          <span className="font-medium">{trv.name}</span>
          {trv.current_temp != null && (
            <span className="text-muted-foreground flex items-center gap-0.5">
              <Thermometer className="h-3 w-3" />{trv.current_temp.toFixed(1)}°
            </span>
          )}
          <span className="tabular-nums">{trv.valve_pct ?? "—"}%</span>
          {trv.battery != null && trv.battery <= 25 && (
            <span className="text-yellow-400 flex items-center gap-0.5">
              <BatteryLow className="h-3 w-3" />{trv.battery}%
            </span>
          )}
          {trv.connected ? <Wifi className="h-3 w-3 text-green-400/60" /> : <WifiOff className="h-3 w-3 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between col-span-2 sm:col-span-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-muted"}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4.5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

// ── TRV Picker ────────────────────────────────────────────────────────────────
function TrvPicker({
  assigned, allZones, onChange,
}: {
  assigned: string[];
  allZones: string[];    // all known Shelly zone names
  onChange: (zones: string[]) => void;
}) {
  const unassigned = allZones.filter(z => !assigned.includes(z));

  function remove(zone: string) {
    onChange(assigned.filter(z => z !== zone));
  }
  function add(zone: string) {
    if (zone && !assigned.includes(zone)) onChange([...assigned, zone]);
  }

  return (
    <div className="flex flex-col gap-2 col-span-2 sm:col-span-4">
      <span className="text-xs text-muted-foreground">Shelly TRVs assigned to this room</span>

      {/* Assigned chips */}
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {assigned.length === 0 && (
          <span className="text-xs text-muted-foreground/40 italic">No TRVs assigned</span>
        )}
        {assigned.map(zone => (
          <span key={zone}
            className="inline-flex items-center gap-1 rounded-full border border-teal-500/40 bg-teal-500/10 px-2.5 py-1 text-xs font-medium text-teal-300">
            {zone}
            <button type="button" onClick={() => remove(zone)}
              className="ml-0.5 rounded-full hover:text-red-400 transition-colors">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      {/* Add from remaining list */}
      {unassigned.length > 0 && (
        <div className="flex items-center gap-2">
          <select defaultValue=""
            onChange={e => { add(e.target.value); e.target.value = ""; }}
            className="rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring flex-1">
            <option value="" disabled>Add a TRV…</option>
            {unassigned.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <span className="text-xs text-muted-foreground/40 flex items-center gap-1">
            <Plus className="h-3 w-3" />select to add
          </span>
        </div>
      )}
      {unassigned.length === 0 && allZones.length > 0 && assigned.length > 0 && (
        <p className="text-xs text-muted-foreground/40">All known TRVs assigned</p>
      )}
      {allZones.length === 0 && (
        <p className="text-xs text-muted-foreground/40">No Shelly TRVs discovered yet — check Shelly connection</p>
      )}
    </div>
  );
}

// ── Inline settings panel ─────────────────────────────────────────────────────
function SettingsPanel({
  cfg, nestZones, shellyAllZones, globalBoostTime, globalBoostTemp, globalBoostDur, onChange, onSave, saving, saved,
}: {
  cfg: RoomCfg;
  nestZones: string[];
  shellyAllZones: string[];
  globalBoostTime: string;
  globalBoostTemp: number;
  globalBoostDur: number;
  onChange: (patch: Partial<RoomCfg>) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <div className="border-t border-border/40 px-4 py-4 bg-muted/5 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Room Settings</p>
        <Button size="sm" onClick={onSave} disabled={saving} className="h-7 text-xs gap-1.5">
          <Save className="h-3 w-3" />
          {saving ? "Saving…" : saved ? "Saved!" : "Save & Apply"}
        </Button>
      </div>

      {/* 1 · Identity */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Identity</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Toggle label="Room enabled" value={cfg.enabled ?? true} onChange={v => onChange({ enabled: v })} />
          <label className="flex flex-col gap-1 text-xs text-muted-foreground col-span-1">
            Room type
            <select value={cfg.room_type ?? "bedroom"} onChange={e => onChange({ room_type: e.target.value as RoomCfg["room_type"] })}
              className="rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="bedroom">Bedroom</option>
              <option value="living">Living / Daytime</option>
              <option value="zone_only">Zone only (no TRVs)</option>
            </select>
          </label>
          {nestZones.length > 0 ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground col-span-1">
              Nest zone
              <select value={cfg.nest_zone_name ?? ""}
                onChange={e => onChange({ nest_zone_name: e.target.value })}
                className="rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="">— none —</option>
                {nestZones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
          ) : (
            <SI label="Nest zone name" value={cfg.nest_zone_name ?? ""} placeholder="e.g. Hallway"
              onChange={v => onChange({ nest_zone_name: v })} />
          )}
          <TrvPicker
            assigned={cfg.shelly_zones ?? []}
            allZones={shellyAllZones}
            onChange={zones => onChange({ shelly_zones: zones })}
          />
        </div>
      </div>

      {/* 2 · Morning — first events after night ends */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">
          Morning
          <span className="ml-1.5 text-muted-foreground/40 font-normal text-xs">AI resumes at Night end · Boost fires immediately after</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <TI label="Night end — AI resumes (HH:MM)" value={cfg.night_end ?? "06:00"}
            onChange={v => onChange({ night_end: v })} />
          <TI label="Boost time (blank = global default)" value={cfg.morning_boost_time ?? ""}
            onChange={v => onChange({ morning_boost_time: v || undefined })} />
          <NI label={`Boost target °C (0 = global ${globalBoostTemp}°C)`}
            value={cfg.morning_boost_temp_c ?? 0} step={0.5} min={0} max={25}
            onChange={v => onChange({ morning_boost_temp_c: v || null })} />
          <NI label={`Boost duration min (0 = global ${globalBoostDur}min)`}
            value={cfg.morning_boost_duration_min ?? 0} step={5} min={0} max={240}
            onChange={v => onChange({ morning_boost_duration_min: v || null })} />
        </div>
      </div>

      {/* 3 · Day operation */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">
          Day
          <span className="ml-1.5 text-muted-foreground/40 font-normal text-xs">Targets and valve limits during active hours</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <NI label="Day target (°C)" value={cfg.day_target_temp_c ?? 21} min={16} max={25}
            onChange={v => onChange({ day_target_temp_c: v })} />
          <NI label="Ceiling — max allowed (°C)" value={cfg.max_temp_c ?? 22} min={15} max={28}
            onChange={v => onChange({ max_temp_c: v })} />
          <NI label="Zone idle floor (°C)" value={cfg.nest_idle_temp_c ?? 15} min={14} max={24}
            onChange={v => onChange({ nest_idle_temp_c: v })} />
          <NI label="Min valve open (%)" value={cfg.min_pos_pct ?? 5} step={5} min={0} max={100}
            onChange={v => onChange({ min_pos_pct: v })} />
        </div>
      </div>

      {/* 4 · Night — park and overnight */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">
          Night
          <span className="ml-1.5 text-muted-foreground/40 font-normal text-xs">Valves park at Park time · stay parked until Night end</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <TI label="Park time — valves park (HH:MM)" value={cfg.park_time ?? "18:55"}
            onChange={v => onChange({ park_time: v })} />
          <NI label="Parked valve position (%)" value={cfg.night_pos_pct ?? 5} step={5} min={0} max={100}
            onChange={v => onChange({ night_pos_pct: v })} />
          <NI label="Night target (°C)" value={cfg.target_temp_c ?? 18} min={14} max={22}
            onChange={v => onChange({ target_temp_c: v })} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground/50">
        Changes preview instantly in the chart above. Click Save &amp; Apply to write to the engine.
      </p>
    </div>
  );
}

// ── Room card ─────────────────────────────────────────────────────────────────
function RoomCard({
  room, cfg, isNight, nestZones, shellyAllZones, globalBoostTime, globalBoostTemp, globalBoostDur,
  onCfgChange, onSave, saving, saved,
}: {
  room: Room;
  cfg: RoomCfg;
  isNight: boolean;
  nestZones: string[];
  shellyAllZones: string[];
  globalBoostTime: string;
  globalBoostTemp: number;
  globalBoostDur: number;
  onCfgChange: (patch: Partial<RoomCfg>) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const phase = PHASE[room.phase] ?? PHASE.IDLE;
  const activeTarget = isNight ? cfg.target_temp_c : cfg.day_target_temp_c;
  const tempDelta = room.current_temp != null ? room.current_temp - activeTarget : null;
  const tempColor =
    room.current_temp == null ? "text-muted-foreground"
    : room.current_temp >= cfg.max_temp_c ? "text-red-400"
    : room.current_temp >= activeTarget ? "text-green-400"
    : "text-blue-400";

  const nowMs = Date.now();
  const chartData = buildScheduleChart(room, cfg, nowMs);

  const xTicks = chartData.filter((_, i) => i % 8 === 0).map(p => p.timeMs);
  const nowBucket = Math.floor(nowMs / (15 * 60_000)) * (15 * 60_000);

  // Schedule pills
  function nextOccurrence(hhmm: string): string {
    const d = new Date();
    const nowMin = d.getHours() * 60 + d.getMinutes();
    const target = parseHHMM(hhmm);
    const diff = target >= nowMin ? target - nowMin : 1440 - nowMin + target;
    if (diff < 60) return `in ${diff}min`;
    const h = Math.floor(diff / 60), m = diff % 60;
    return m > 0 ? `in ${h}h ${m}min` : `in ${h}h`;
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 flex items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${phase.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{room.name}</span>
            <Badge variant="outline" className={`text-xs px-1.5 py-0 ${phase.badge}`}>{phase.label}</Badge>
            <Badge variant="outline" className="text-xs px-1.5 py-0 capitalize text-muted-foreground">{room.room_type}</Badge>
            {room.nest_zone_name && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">{room.nest_zone_name}</Badge>
            )}
          </div>
          {room.reasoning && (
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{room.reasoning}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`text-3xl font-semibold tabular-nums ${tempColor}`}>
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
            <div className="text-xs text-orange-400">~{room.eta_min} min</div>
          )}
        </div>
      </div>

      {/* TRV strip */}
      {room.trvs.length > 0 && (
        <div className="px-4 pb-3"><TrvStrip trvs={room.trvs} /></div>
      )}

      {/* 24h Schedule Chart */}
      <div className="px-4 pb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          24h Schedule · Valve position &amp; boiler demand
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 36, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="timeMs" type="number" domain={["dataMin", "dataMax"]} ticks={xTicks}
              tickFormatter={ms => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
            />
            {/* Left axis: valve % */}
            <YAxis yAxisId="valve" domain={[0, 100]}
              tick={{ fontSize: 9, fill: "rgba(52,211,153,0.6)" }} tickFormatter={v => `${v}%`} width={28} />
            {/* Right axis: boiler setpoint °C */}
            <YAxis yAxisId="boiler" orientation="right" domain={[12, 28]}
              tick={{ fontSize: 9, fill: "rgba(251,146,60,0.6)" }} tickFormatter={v => `${v}°`} width={28} />
            <Tooltip content={<ChartTooltip />} />

            {/* Night shading */}
            <Area yAxisId="valve" dataKey="nightBand" name="Night"
              fill="rgba(99,179,237,0.07)" stroke="none"
              isAnimationActive={false} dot={false} activeDot={false} />

            {/* Boost shading */}
            <Area yAxisId="valve" dataKey="boostBand" name="Boost"
              fill="rgba(251,146,60,0.08)" stroke="none"
              isAnimationActive={false} dot={false} activeDot={false} />

            {/* "Now" line */}
            <ReferenceLine yAxisId="valve" x={nowBucket} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3"
              label={{ value: "Now", position: "insideTopLeft", fontSize: 9, fill: "rgba(255,255,255,0.4)" }} />

            {/* Valve position — step line */}
            <Line yAxisId="valve" dataKey="valvePct" name="Valve"
              stroke="rgba(52,211,153,0.9)" strokeWidth={2}
              dot={false} connectNulls isAnimationActive={false}
              type="stepAfter" />

            {/* Boiler setpoint */}
            <Line yAxisId="boiler" dataKey="boilerSetpoint" name="Boiler setpoint"
              stroke="rgba(251,146,60,0.85)" strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false} connectNulls isAnimationActive={false}
              type="stepAfter" />
          </ComposedChart>
        </ResponsiveContainer>

        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-teal-400 rounded" />Valve %</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-orange-400/70 rounded border-dashed" style={{borderBottom:"1px dashed rgba(251,146,60,0.7)",height:0}} />Boiler setpoint</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-blue-400/10 rounded-sm border border-blue-400/20" />Night</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-orange-400/10 rounded-sm border border-orange-400/20" />Boost</span>
        </div>
      </div>

      {/* Schedule pills */}
      <div className="px-4 pb-3 pt-1 flex flex-wrap gap-2">
        {room.park_at_night && (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/15 px-2.5 py-1 text-xs font-medium text-yellow-300">
              Park {cfg.park_time} → {cfg.night_pos_pct}%
              <span className="opacity-50">· {nextOccurrence(cfg.park_time)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-300">
              AI control {cfg.night_end}
              <span className="opacity-50">· {nextOccurrence(cfg.night_end)}</span>
            </span>
          </>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground">
          Night target {cfg.target_temp_c}°C
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground">
          Day target {cfg.day_target_temp_c}°C
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground">
          Ceiling {cfg.max_temp_c}°C
        </span>
      </div>

      {/* Settings toggle */}
      <button
        onClick={() => setSettingsOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 border-t border-border/30 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span>Settings</span>
        {settingsOpen ? <ChevronDown className="h-3.5 w-3.5 ml-auto" /> : <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
      </button>

      {settingsOpen && (
        <SettingsPanel
          cfg={cfg}
          nestZones={nestZones}
          shellyAllZones={shellyAllZones}
          globalBoostTime={globalBoostTime}
          globalBoostTemp={globalBoostTemp}
          globalBoostDur={globalBoostDur}
          onChange={onCfgChange}
          onSave={onSave}
          saving={saving}
          saved={saved}
        />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [nestZones, setNestZones] = useState<string[]>([]);
  const [shellyAllZones, setShellyAllZones] = useState<string[]>([]);
  const [fullConfig, setFullConfig] = useState<FullConfig | null>(null);
  const [localCfgs, setLocalCfgs] = useState<Record<string, RoomCfg>>({});
  const [globalBoost, setGlobalBoost] = useState({ time: "07:00", temp: 21, dur: 60 });
  const [isNight, setIsNight] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [savingRoom, setSavingRoom] = useState<string | null>(null);
  const [savedRoom, setSavedRoom] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [roomsData, cfgData, shellyData] = await Promise.allSettled([
        api.rooms(), api.config(), api.shellyZones(),
      ]);
      if (roomsData.status === "fulfilled") {
        setRooms((roomsData.value.rooms ?? []).filter((r: Room) => r.enabled));
        setIsNight(roomsData.value.is_night ?? false);
        setNestZones(roomsData.value.nest_zones ?? []);
      }
      if (shellyData.status === "fulfilled") {
        const names: string[] = (shellyData.value.zones ?? [])
          .map((z: { zone?: string }) => z.zone).filter(Boolean).sort();
        setShellyAllZones(names);
      }
      if (cfgData.status === "fulfilled") {
        const cfg: FullConfig = cfgData.value.config ?? cfgData.value;
        setFullConfig(cfg);
        setGlobalBoost({
          time: String(cfg.morning_boost_time ?? "07:00"),
          temp: Number(cfg.morning_boost_temp_c ?? 21),
          dur:  Number(cfg.morning_boost_duration_min ?? 60),
        });
        // Build per-room config map — only initialise if not already edited
        // Backend config uses "room_name"; /api/rooms uses "name". Normalise here.
        setLocalCfgs(prev => {
          const next: Record<string, RoomCfg> = { ...prev };
          for (const rc of (cfg.rooms ?? []) as RoomCfg[]) {
            const roomName = (rc as Record<string, unknown>).room_name as string | undefined ?? rc.name;
            if (!roomName) continue;
            if (!next[roomName]) next[roomName] = {
              ...rc,
              name: roomName,
              day_target_temp_c: rc.day_target_temp_c ?? rc.target_temp_c ?? 21,
              target_temp_c: rc.target_temp_c ?? 18,
              max_temp_c: rc.max_temp_c ?? 22,
              min_pos_pct: rc.min_pos_pct ?? 5,
              night_pos_pct: rc.night_pos_pct ?? 5,
              nest_idle_temp_c: rc.nest_idle_temp_c ?? 15,
              park_time: rc.park_time ?? "18:55",
              night_end: rc.night_end ?? "06:00",
              shelly_zones: rc.shelly_zones ?? [],
            };
          }
          return next;
        });
      }
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 5 * 60_000);
    return () => clearInterval(t);
  }, [fetchAll]);

  function updateRoomCfg(roomName: string, patch: Partial<RoomCfg>) {
    setLocalCfgs(prev => ({
      ...prev,
      [roomName]: { ...prev[roomName], ...patch },
    }));
  }

  async function saveRoom(roomName: string) {
    if (!fullConfig) return;
    setSavingRoom(roomName);
    try {
      const updatedConfig: FullConfig = {
        ...fullConfig,
        rooms: fullConfig.rooms.map(r => {
          const rName = (r as Record<string, unknown>).room_name as string | undefined ?? r.name;
          if (rName !== roomName) return r;
          return { ...r, ...localCfgs[roomName], room_name: roomName };
        }),
      };
      await api.saveConfig(updatedConfig);
      setFullConfig(updatedConfig);
      setSavedRoom(roomName);
      setTimeout(() => setSavedRoom(null), 2500);
    } finally {
      setSavingRoom(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-blue-400" />
          <h1 className="font-semibold text-lg">Rooms</h1>
          {isNight && (
            <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-300 border-blue-500/30">Night</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-xs text-muted-foreground">
              Updated {lastUpdate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={() => { setRefreshing(true); fetchAll(); }} disabled={refreshing}>
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-64 rounded-xl bg-muted/30 animate-pulse" />)}
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No rooms configured.</div>
      ) : (
        <div className="space-y-5">
          {rooms.map(room => {
            const cfg = localCfgs[room.name] ?? {
              name: room.name,
              enabled: room.enabled,
              room_type: room.room_type,
              nest_zone_name: room.nest_zone_name,
              shelly_zones: room.shelly_zones,
              day_target_temp_c: room.day_target_temp_c,
              target_temp_c: room.night_target_temp_c,
              max_temp_c: room.max_temp_c,
              min_pos_pct: room.min_pos_pct,
              night_pos_pct: room.night_pos_pct,
              park_time: room.park_time,
              night_end: room.night_end,
              morning_boost_time: room.morning_boost_time || "",
              morning_boost_temp_c: room.morning_boost_temp_c,
              morning_boost_duration_min: room.morning_boost_duration_min,
            };
            return (
              <RoomCard
                key={room.name}
                room={room}
                cfg={cfg}
                isNight={isNight}
                nestZones={nestZones}
                shellyAllZones={shellyAllZones}
                globalBoostTime={globalBoost.time}
                globalBoostTemp={globalBoost.temp}
                globalBoostDur={globalBoost.dur}
                onCfgChange={patch => updateRoomCfg(room.name, patch)}
                onSave={() => saveRoom(room.name)}
                saving={savingRoom === room.name}
                saved={savedRoom === room.name}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
