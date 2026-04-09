"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";
import { RefreshCw, Thermometer, BatteryLow, Wifi, WifiOff, LayoutGrid } from "lucide-react";

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
  enabled: boolean;
  reasoning: string;
  eta_min: number | null;
  trvs: TrvDetail[];
  shelly_zones: string[];
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
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

/** Returns true if minuteOfDay falls in the park window (park_time → night_end, wrapping midnight) */
function isInNightWindow(minuteOfDay: number, parkTime: string, nightEnd: string): boolean {
  const park = parseHHMM(parkTime);
  const end  = parseHHMM(nightEnd);
  if (park < end) return minuteOfDay >= park && minuteOfDay < end;
  // wraps midnight (most common: park 18:55 → end 06:00)
  return minuteOfDay >= park || minuteOfDay < end;
}

// ── Prediction builder ────────────────────────────────────────────────────────
interface PredPoint {
  timeMs: number;
  predictedTemp: number;
  predictedValve: number;
  isNight: boolean;
}

function buildPrediction(room: Room, startTemp: number, nowMs: number): PredPoint[] {
  const STEP_MIN = 15;
  const STEPS = 48; // 12 hours
  const points: PredPoint[] = [];
  let temp = startTemp;

  for (let i = 0; i <= STEPS; i++) {
    const ms = nowMs + i * STEP_MIN * 60_000;
    const d = new Date(ms);
    const minuteOfDay = d.getHours() * 60 + d.getMinutes();
    const night = room.park_at_night && isInNightWindow(minuteOfDay, room.park_time, room.night_end);

    const target = night ? room.night_target_temp_c : room.day_target_temp_c;
    const rate = night
      ? -0.075  // °C per 15-min step → ≈ −0.3 °C/hr drifting toward night_target
      : temp < target
        ? 0.2   // heating: +0.8 °C/hr
        : -0.05; // comfortable, slight natural cool

    temp = Math.max(
      room.night_target_temp_c - 1,
      Math.min(room.max_temp_c, temp + (temp < target ? Math.abs(rate) : rate))
    );

    const predictedValve = night
      ? room.night_pos_pct
      : temp < target
        ? Math.round(Math.min(100, 20 + ((target - temp) / (target - room.night_target_temp_c)) * 80))
        : room.min_pos_pct;

    points.push({ timeMs: ms, predictedTemp: parseFloat(temp.toFixed(2)), predictedValve, isNight: night });
  }
  return points;
}

// ── Chart data builder ────────────────────────────────────────────────────────
interface ChartPoint {
  timeMs: number;
  label: string;
  histTemp?: number;
  predTemp?: number;
  predValve?: number;
  nightBand?: number; // constant used for area fill
}

function buildChartData(
  room: Room,
  history: HistoryRow[],
  nowMs: number,
): ChartPoint[] {
  // Bucket history rows for this room's TRVs into 15-min averages
  const trvNames = new Set(room.shelly_zones.map(z => z.toLowerCase()));
  const relevant = history.filter(r => trvNames.has(r.zone_name.toLowerCase()) && r.current_temp_c != null);

  const BUCKET = 15 * 60_000;
  const buckets: Record<number, number[]> = {};
  for (const row of relevant) {
    const t = new Date(row.ts).getTime();
    const key = Math.floor(t / BUCKET) * BUCKET;
    (buckets[key] ??= []).push(row.current_temp_c!);
  }

  // Build timeline: 12h history + 12h prediction, every 15 min
  const startMs = nowMs - 12 * 60 * 60_000;
  const endMs   = nowMs + 12 * 60 * 60_000;
  const STEP    = BUCKET;

  const prediction = buildPrediction(room, room.current_temp ?? room.day_target_temp_c, nowMs);
  const predMap = new Map(prediction.map(p => [Math.floor(p.timeMs / STEP) * STEP, p]));

  const points: ChartPoint[] = [];
  for (let t = startMs; t <= endMs; t += STEP) {
    const bucket = Math.floor(t / STEP) * STEP;
    const d = new Date(t);
    const label = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const minuteOfDay = d.getHours() * 60 + d.getMinutes();
    const night = room.park_at_night && isInNightWindow(minuteOfDay, room.park_time, room.night_end);

    const avgHist = buckets[bucket]?.length
      ? buckets[bucket].reduce((a, b) => a + b, 0) / buckets[bucket].length
      : undefined;

    const pred = predMap.get(bucket);

    points.push({
      timeMs: t,
      label,
      histTemp:  t <= nowMs && avgHist != null ? parseFloat(avgHist.toFixed(2)) : undefined,
      predTemp:  t >= nowMs ? pred?.predictedTemp : undefined,
      predValve: t >= nowMs ? pred?.predictedValve : undefined,
      nightBand: night ? room.max_temp_c : undefined,
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
          {p.name.includes("alve") ? "%" : "°C"}
        </p>
      ))}
    </div>
  );
}

// ── Schedule pills ────────────────────────────────────────────────────────────
function SchedulePills({ room }: { room: Room }) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  function nextOccurrence(hhmm: string): string {
    const target = parseHHMM(hhmm);
    const diffMin = target >= nowMin ? target - nowMin : 1440 - nowMin + target;
    if (diffMin < 60) return `in ${diffMin}min`;
    if (diffMin < 120) return `in ${Math.round(diffMin / 60)}h ${diffMin % 60}min`;
    return `at ${hhmm}`;
  }

  const events = room.park_at_night
    ? [
        { label: `Park ${room.park_time}`, sub: `→ ${room.night_pos_pct}%`, when: nextOccurrence(room.park_time), color: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
        { label: `AI control ${room.night_end}`, sub: `target ${room.day_target_temp_c}°C`, when: nextOccurrence(room.night_end), color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
      ]
    : [
        { label: "24h AI control", sub: `target ${room.day_target_temp_c}°C`, when: "", color: "bg-green-500/15 text-green-300 border-green-500/30" },
      ];

  return (
    <div className="flex flex-wrap gap-2">
      {events.map(e => (
        <span key={e.label} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${e.color}`}>
          {e.label}
          <span className="opacity-70">{e.sub}</span>
          {e.when && <span className="opacity-50">· {e.when}</span>}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground">
        Ceiling {room.max_temp_c}°C
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground">
        Night target {room.night_target_temp_c}°C
      </span>
    </div>
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
          {trv.connected
            ? <Wifi className="h-3 w-3 text-green-400/60" />
            : <WifiOff className="h-3 w-3 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

// ── Room card ─────────────────────────────────────────────────────────────────
function RoomCard({ room, history, isNight }: { room: Room; history: HistoryRow[]; isNight: boolean }) {
  const phase = PHASE[room.phase] ?? PHASE.IDLE;
  const activeTarget = isNight ? room.night_target_temp_c : room.day_target_temp_c;
  const tempDelta = room.current_temp != null ? room.current_temp - activeTarget : null;
  const tempColor =
    room.current_temp == null ? "text-muted-foreground"
    : room.current_temp >= room.max_temp_c ? "text-red-400"
    : room.current_temp >= activeTarget ? "text-green-400"
    : "text-blue-400";

  const nowMs = Date.now();
  const chartData = buildChartData(room, history, nowMs);

  // X-axis: show label every 2h (every 8 steps of 15min)
  const xTicks = chartData
    .filter((_, i) => i % 8 === 0)
    .map(p => p.timeMs);

  const yMin = Math.floor(Math.min(room.night_target_temp_c - 1, ...chartData.filter(p => p.histTemp).map(p => p.histTemp!)) - 0.5);
  const yMax = Math.ceil(room.max_temp_c + 0.5);

  // Reference line at "now"
  const nowBucket = Math.floor(nowMs / (15 * 60_000)) * (15 * 60_000);

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
        <div className="px-4 pb-3">
          <TrvStrip trvs={room.trvs} />
        </div>
      )}

      {/* Chart */}
      <div className="px-4 pb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">24h Temperature · History + Prediction</p>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 10, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="timeMs"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={xTicks}
              tickFormatter={ms => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
              tickFormatter={v => `${v}°`}
            />
            <Tooltip content={<ChartTooltip />} />

            {/* Night shading band */}
            <Area
              dataKey="nightBand"
              fill="rgba(99,179,237,0.08)"
              stroke="none"
              legendType="none"
              isAnimationActive={false}
              dot={false}
              activeDot={false}
            />

            {/* Reference lines */}
            <ReferenceLine y={room.day_target_temp_c} stroke="rgba(251,146,60,0.5)" strokeDasharray="4 3"
              label={{ value: `Day ${room.day_target_temp_c}°`, position: "insideTopRight", fontSize: 9, fill: "rgba(251,146,60,0.7)" }} />
            <ReferenceLine y={room.night_target_temp_c} stroke="rgba(96,165,250,0.5)" strokeDasharray="4 3"
              label={{ value: `Night ${room.night_target_temp_c}°`, position: "insideBottomRight", fontSize: 9, fill: "rgba(96,165,250,0.7)" }} />
            <ReferenceLine y={room.max_temp_c} stroke="rgba(248,113,113,0.4)" strokeDasharray="2 4"
              label={{ value: `Max ${room.max_temp_c}°`, position: "insideTopRight", fontSize: 9, fill: "rgba(248,113,113,0.6)" }} />

            {/* Now line */}
            <ReferenceLine x={nowBucket} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3"
              label={{ value: "Now", position: "insideTopLeft", fontSize: 9, fill: "rgba(255,255,255,0.4)" }} />

            {/* History */}
            <Line
              dataKey="histTemp"
              name="Actual temp"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />

            {/* Prediction */}
            <Line
              dataKey="predTemp"
              name="Predicted temp"
              stroke="#f97316"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              connectNulls
              isAnimationActive={false}
              opacity={0.6}
            />

            {/* Predicted valve % — right Y axis would need extra YAxis; show as thin line */}
            <Line
              dataKey="predValve"
              name="Pred valve"
              stroke="rgba(52,211,153,0.5)"
              strokeWidth={1}
              strokeDasharray="3 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
              yAxisId="right"
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: "rgba(52,211,153,0.4)" }}
              tickFormatter={v => `${v}%`}
              width={28}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-orange-400 rounded" />Actual</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-orange-400/50 rounded border-t border-dashed border-orange-400/50" />Predicted</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-teal-400/50 rounded" />Valve %</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-blue-400/10 rounded-sm border border-blue-400/20" />Night</span>
        </div>
      </div>

      {/* Schedule pills */}
      <div className="px-4 pb-4 pt-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Schedule</p>
        <SchedulePills room={room} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [isNight, setIsNight] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [roomsData, histData] = await Promise.allSettled([
        api.rooms(),
        api.history(12),
      ]);
      if (roomsData.status === "fulfilled") {
        setRooms((roomsData.value.rooms ?? []).filter((r: Room) => r.enabled));
        setIsNight(roomsData.value.is_night ?? false);
      }
      if (histData.status === "fulfilled") {
        setHistory(histData.value.rows ?? []);
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
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No rooms configured.</div>
      ) : (
        <div className="space-y-5">
          {rooms.map(room => (
            <RoomCard key={room.name} room={room} history={history} isNight={isNight} />
          ))}
        </div>
      )}
    </div>
  );
}
