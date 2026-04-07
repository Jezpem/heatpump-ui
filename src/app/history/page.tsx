"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { ZoneTempRow } from "@/lib/supabase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { BarChart2 } from "lucide-react";

const HOUR_OPTIONS = [6, 12, 24, 48];
const ZONE_COLORS = [
  "#f87171", "#60a5fa", "#34d399", "#a78bfa",
  "#fb923c", "#f472b6", "#4ade80", "#38bdf8",
];

type ChartPoint = { time: string; [key: string]: number | string | null };

function buildChartData(rows: ZoneTempRow[]) {
  const byMinute: Map<string, ChartPoint> = new Map();
  for (const row of rows) {
    const d = new Date(row.ts);
    const key = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    if (!byMinute.has(key)) byMinute.set(key, { time: key });
    const point = byMinute.get(key)!;
    point[row.zone_name] = row.current_temp_c;
  }
  return Array.from(byMinute.values()).sort((a, b) => (a.time as string).localeCompare(b.time as string));
}

export default function HistoryPage() {
  const [hours, setHours] = useState(12);
  const [rows, setRows] = useState<ZoneTempRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set());

  const fetch = useCallback(async (h: number) => {
    setLoading(true);
    const cutoff = new Date(Date.now() - h * 3600_000).toISOString();
    const { data } = await supabase
      .from("zone_temp_history")
      .select("ts,zone_name,source,current_temp_c,set_temp_c")
      .gte("ts", cutoff)
      .order("ts", { ascending: true })
      .limit(2000);
    setRows((data as ZoneTempRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(hours); }, [hours, fetch]);

  const allZones = Array.from(new Set(rows.map(r => r.zone_name)));
  const active = selectedZones.size > 0 ? selectedZones : new Set(allZones);
  const chartData = buildChartData(rows.filter(r => active.has(r.zone_name)));

  function toggleZone(z: string) {
    setSelectedZones(prev => {
      const next = new Set(prev);
      if (next.has(z)) next.delete(z); else next.add(z);
      return next;
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-blue-400" />
          <h1 className="font-semibold text-lg">Temperature History</h1>
        </div>
        <div className="flex rounded-lg border border-border/50 overflow-hidden text-xs">
          {HOUR_OPTIONS.map(h => (
            <button
              key={h}
              className={`px-3 py-1.5 transition-colors ${
                hours === h ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setHours(h)}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      {/* Zone toggles */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {allZones.map((z, i) => {
          const color = ZONE_COLORS[i % ZONE_COLORS.length];
          const isOn = active.has(z);
          return (
            <button
              key={z}
              className={`rounded-full px-3 py-1 text-xs border transition-all ${
                isOn ? "opacity-100" : "opacity-40"
              }`}
              style={{ borderColor: color, color: isOn ? color : undefined }}
              onClick={() => toggleZone(z)}
            >
              {z}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="h-64 rounded-xl bg-muted/30 animate-pulse" />
      ) : chartData.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-12">No data in the last {hours}h</p>
      ) : (
        <div className="rounded-xl border border-border/40 bg-card p-4">
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
                tickFormatter={v => `${v}°`}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(v) => [`${typeof v === "number" ? v.toFixed(1) : v}°C`]}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <ReferenceLine y={21} stroke="rgba(251,146,60,0.3)" strokeDasharray="4 4" label={{ value: "21° day", fill: "rgba(251,146,60,0.5)", fontSize: 10 }} />
              <ReferenceLine y={17} stroke="rgba(99,102,241,0.3)" strokeDasharray="4 4" label={{ value: "17° night", fill: "rgba(99,102,241,0.5)", fontSize: 10 }} />
              {Array.from(active).map((z, i) => (
                <Line
                  key={z}
                  type="monotone"
                  dataKey={z}
                  stroke={ZONE_COLORS[allZones.indexOf(z) % ZONE_COLORS.length]}
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
