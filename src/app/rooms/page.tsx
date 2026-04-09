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
  LayoutGrid, Settings2, Save, ChevronDown, ChevronRight,
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
  [key: string]: unknown;
}

interface HistoryRow {
  ts: string;
  zone_name: string;
  current_temp_c: number | null;
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

// ── Prediction builder ────────────────────────────────────────────────────────
interface PredPoint { timeMs: number; predictedTemp: number; predictedValve: number; isNight: boolean; }

function buildPrediction(room: Room, cfg: RoomCfg, startTemp: number, nowMs: number): PredPoint[] {
  const STEP_MIN = 15;
  const STEPS = 48;
  const points: PredPoint[] = [];
  let temp = startTemp;

  for (let i = 0; i <= STEPS; i++) {
    const ms = nowMs + i * STEP_MIN * 60_000;
    const d = new Date(ms);
    const minuteOfDay = d.getHours() * 60 + d.getMinutes();
    const night = room.park_at_night && isInNightWindow(minuteOfDay, cfg.park_time, cfg.night_end);

    const target = night ? cfg.target_temp_c : cfg.day_target_temp_c;
    const rate = night ? -0.075 : temp < target ? 0.2 : -0.05;

    temp = Math.max(
      cfg.target_temp_c - 1,
      Math.min(cfg.max_temp_c, temp + (temp < target ? Math.abs(rate) : rate))
    );

    const predictedValve = night
      ? cfg.night_pos_pct
      : temp < target
        ? Math.round(Math.min(100, 20 + ((target - temp) / Math.max(1, target - cfg.target_temp_c)) * 80))
        : cfg.min_pos_pct;

    points.push({ timeMs: ms, predictedTemp: parseFloat(temp.toFixed(2)), predictedValve, isNight: night });
  }
  return points;
}

// ── Chart data builder ────────────────────────────────────────────────────────
interface ChartPoint {
  timeMs: number; label: string;
  histTemp?: number; predTemp?: number; predValve?: number; nightBand?: number;
}

function buildChartData(room: Room, cfg: RoomCfg, history: HistoryRow[], nowMs: number): ChartPoint[] {
  const trvNames = new Set(room.shelly_zones.map(z => z.toLowerCase()));
  const relevant = history.filter(r => trvNames.has(r.zone_name.toLowerCase()) && r.current_temp_c != null);

  const BUCKET = 15 * 60_000;
  const buckets: Record<number, number[]> = {};
  for (const row of relevant) {
    const t = new Date(row.ts).getTime();
    const key = Math.floor(t / BUCKET) * BUCKET;
    (buckets[key] ??= []).push(row.current_temp_c!);
  }

  const startMs = nowMs - 12 * 60 * 60_000;
  const endMs   = nowMs + 12 * 60 * 60_000;
  const prediction = buildPrediction(room, cfg, room.current_temp ?? cfg.day_target_temp_c, nowMs);
  const predMap = new Map(prediction.map(p => [Math.floor(p.timeMs / BUCKET) * BUCKET, p]));

  const points: ChartPoint[] = [];
  for (let t = startMs; t <= endMs; t += BUCKET) {
    const bucket = Math.floor(t / BUCKET) * BUCKET;
    const d = new Date(t);
    const label = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const minuteOfDay = d.getHours() * 60 + d.getMinutes();
    const night = room.park_at_night && isInNightWindow(minuteOfDay, cfg.park_time, cfg.night_end);

    const avgHist = buckets[bucket]?.length
      ? buckets[bucket].reduce((a, b) => a + b, 0) / buckets[bucket].length
      : undefined;
    const pred = predMap.get(bucket);

    points.push({
      timeMs: t, label,
      histTemp:  t <= nowMs && avgHist != null ? parseFloat(avgHist.toFixed(2)) : undefined,
      predTemp:  t >= nowMs ? pred?.predictedTemp : undefined,
      predValve: t >= nowMs ? pred?.predictedValve : undefined,
      nightBand: night ? cfg.max_temp_c : undefined,
    });
  }
  return points;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs space-y-1 shadow-lg">
      <p className="font-medium text-muted-foreground">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(1) : p.value}
          {p.name.toLowerCase().includes("valve") ? "%" : "°C"}
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

// ── Inline settings panel ─────────────────────────────────────────────────────
function SettingsPanel({
  cfg, globalBoostTime, globalBoostTemp, globalBoostDur, onChange, onSave, saving, saved,
}: {
  cfg: RoomCfg;
  globalBoostTime: string;
  globalBoostTemp: number;
  globalBoostDur: number;
  onChange: (patch: Partial<RoomCfg>) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const shellyStr = (cfg.shelly_zones ?? []).join(", ");

  return (
    <div className="border-t border-border/40 px-4 py-4 bg-muted/5 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Room Settings</p>
        <Button size="sm" onClick={onSave} disabled={saving} className="h-7 text-xs gap-1.5">
          <Save className="h-3 w-3" />
          {saving ? "Saving…" : saved ? "Saved!" : "Save & Apply"}
        </Button>
      </div>

      {/* Identity */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Identity</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Toggle label="Room enabled" value={cfg.enabled ?? true} onChange={v => onChange({ enabled: v })} />
          <label className="flex flex-col gap-1 text-xs text-muted-foreground col-span-1">
            Room type
            <select value={cfg.room_type} onChange={e => onChange({ room_type: e.target.value as RoomCfg["room_type"] })}
              className="rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="bedroom">bedroom</option>
              <option value="living">living</option>
              <option value="zone_only">zone_only</option>
            </select>
          </label>
          <TI label="Nest zone" value={cfg.nest_zone_name ?? ""} onChange={v => onChange({ nest_zone_name: v })} />
          <label className="flex flex-col gap-1 text-xs text-muted-foreground col-span-1 sm:col-span-2">
            Shelly TRVs (comma-separated)
            <input type="text" value={shellyStr}
              onChange={e => onChange({ shelly_zones: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
              placeholder="e.g. Master Bed 1, Master Bed 2"
              className="rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </label>
        </div>
      </div>

      {/* Temperatures */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Temperatures</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <NI label="Day target (°C)" value={cfg.day_target_temp_c} min={16} max={25}
            onChange={v => onChange({ day_target_temp_c: v })} />
          <NI label="Night target (°C)" value={cfg.target_temp_c} min={14} max={22}
            onChange={v => onChange({ target_temp_c: v })} />
          <NI label="Ceiling (°C)" value={cfg.max_temp_c} min={15} max={28}
            onChange={v => onChange({ max_temp_c: v })} />
          <NI label="Zone idle floor (°C)" value={cfg.nest_idle_temp_c ?? 15} min={14} max={24}
            onChange={v => onChange({ nest_idle_temp_c: v })} />
        </div>
      </div>

      {/* Schedule & valves */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Schedule & Valves</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <TI label="Park time (HH:MM)" value={cfg.park_time} onChange={v => onChange({ park_time: v })} />
          <TI label="Night end (HH:MM)" value={cfg.night_end} onChange={v => onChange({ night_end: v })} />
          <NI label="Night valve (%)" value={cfg.night_pos_pct} step={5} min={0} max={100}
            onChange={v => onChange({ night_pos_pct: v })} />
          <NI label="Min valve (%)" value={cfg.min_pos_pct} step={5} min={0} max={100}
            onChange={v => onChange({ min_pos_pct: v })} />
        </div>
      </div>

      {/* Morning boost */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">
          Morning Boost
          <span className="ml-1.5 text-muted-foreground/50 font-normal">
            (defaults: {globalBoostTime}, {globalBoostTemp}°C, {globalBoostDur}min)
          </span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <TI label="Boost time (HH:MM — blank = global)" value={cfg.morning_boost_time ?? ""}
            onChange={v => onChange({ morning_boost_time: v || undefined })} />
          <NI label="Boost target (°C — 0 = global)" value={cfg.morning_boost_temp_c ?? 0} step={0.5} min={0} max={25}
            onChange={v => onChange({ morning_boost_temp_c: v || null })} />
          <NI label="Duration (min — 0 = global)" value={cfg.morning_boost_duration_min ?? 0} step={5} min={0} max={240}
            onChange={v => onChange({ morning_boost_duration_min: v || null })} />
        </div>
        <p className="text-xs text-muted-foreground/50">
          Leave blank / 0 to inherit global defaults from Settings. Set per-room values to override.
          The chart night band shifts as you change Park time and Night end.
        </p>
      </div>
    </div>
  );
}

// ── Room card ─────────────────────────────────────────────────────────────────
function RoomCard({
  room, cfg, history, isNight, globalBoostTime, globalBoostTemp, globalBoostDur,
  onCfgChange, onSave, saving, saved,
}: {
  room: Room;
  cfg: RoomCfg;
  history: HistoryRow[];
  isNight: boolean;
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
  const chartData = buildChartData(room, cfg, history, nowMs);

  const xTicks = chartData.filter((_, i) => i % 8 === 0).map(p => p.timeMs);
  const histTemps = chartData.filter(p => p.histTemp != null).map(p => p.histTemp!);
  const yMin = Math.floor(Math.min(cfg.target_temp_c - 1, ...(histTemps.length ? histTemps : [cfg.target_temp_c])) - 0.5);
  const yMax = Math.ceil(cfg.max_temp_c + 0.5);
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

      {/* Chart */}
      <div className="px-4 pb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          24h Temperature · History + Prediction
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 32, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="timeMs" type="number" domain={["dataMin", "dataMax"]} ticks={xTicks}
              tickFormatter={ms => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
            />
            <YAxis domain={[yMin, yMax]} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }} tickFormatter={v => `${v}°`} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]}
              tick={{ fontSize: 9, fill: "rgba(52,211,153,0.4)" }} tickFormatter={v => `${v}%`} width={28} />
            <Tooltip content={<ChartTooltip />} />

            <Area dataKey="nightBand" fill="rgba(99,179,237,0.08)" stroke="none"
              legendType="none" isAnimationActive={false} dot={false} activeDot={false} />

            <ReferenceLine y={cfg.day_target_temp_c} stroke="rgba(251,146,60,0.5)" strokeDasharray="4 3"
              label={{ value: `Day ${cfg.day_target_temp_c}°`, position: "insideTopRight", fontSize: 9, fill: "rgba(251,146,60,0.7)" }} />
            <ReferenceLine y={cfg.target_temp_c} stroke="rgba(96,165,250,0.5)" strokeDasharray="4 3"
              label={{ value: `Night ${cfg.target_temp_c}°`, position: "insideBottomRight", fontSize: 9, fill: "rgba(96,165,250,0.7)" }} />
            <ReferenceLine y={cfg.max_temp_c} stroke="rgba(248,113,113,0.4)" strokeDasharray="2 4"
              label={{ value: `Max ${cfg.max_temp_c}°`, position: "insideTopRight", fontSize: 9, fill: "rgba(248,113,113,0.6)" }} />
            <ReferenceLine x={nowBucket} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3"
              label={{ value: "Now", position: "insideTopLeft", fontSize: 9, fill: "rgba(255,255,255,0.4)" }} />

            <Line dataKey="histTemp" name="Actual" stroke="#f97316" strokeWidth={2}
              dot={false} connectNulls isAnimationActive={false} />
            <Line dataKey="predTemp" name="Predicted" stroke="#f97316" strokeWidth={1.5}
              strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} opacity={0.6} />
            <Line dataKey="predValve" name="Pred valve" stroke="rgba(52,211,153,0.5)"
              strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls isAnimationActive={false} yAxisId="right" />
          </ComposedChart>
        </ResponsiveContainer>

        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-orange-400 rounded" />Actual</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-orange-400/50 rounded" />Predicted</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-teal-400/50 rounded" />Valve %</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-blue-400/10 rounded-sm border border-blue-400/20" />Night</span>
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
  const [fullConfig, setFullConfig] = useState<FullConfig | null>(null);
  const [localCfgs, setLocalCfgs] = useState<Record<string, RoomCfg>>({});
  const [globalBoost, setGlobalBoost] = useState({ time: "07:00", temp: 21, dur: 60 });
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [isNight, setIsNight] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [savingRoom, setSavingRoom] = useState<string | null>(null);
  const [savedRoom, setSavedRoom] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [roomsData, histData, cfgData] = await Promise.allSettled([
        api.rooms(), api.history(12), api.config(),
      ]);
      if (roomsData.status === "fulfilled") {
        setRooms((roomsData.value.rooms ?? []).filter((r: Room) => r.enabled));
        setIsNight(roomsData.value.is_night ?? false);
      }
      if (histData.status === "fulfilled") setHistory(histData.value.rows ?? []);
      if (cfgData.status === "fulfilled") {
        const cfg: FullConfig = cfgData.value.config ?? cfgData.value;
        setFullConfig(cfg);
        setGlobalBoost({
          time: String(cfg.morning_boost_time ?? "07:00"),
          temp: Number(cfg.morning_boost_temp_c ?? 21),
          dur:  Number(cfg.morning_boost_duration_min ?? 60),
        });
        // Build per-room config map — only initialise if not already edited
        setLocalCfgs(prev => {
          const next: Record<string, RoomCfg> = { ...prev };
          for (const rc of (cfg.rooms ?? []) as RoomCfg[]) {
            if (!next[rc.name]) next[rc.name] = { ...rc };
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
        rooms: fullConfig.rooms.map(r =>
          r.name === roomName ? { ...r, ...localCfgs[roomName] } : r
        ),
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
                history={history}
                isNight={isNight}
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
