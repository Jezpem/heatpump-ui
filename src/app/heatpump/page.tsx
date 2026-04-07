"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Thermometer, Droplets, Zap, AlertTriangle, ExternalLink, RefreshCw, Activity
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";

// ── Metric card ──────────────────────────────────────────────────────────────
function Metric({ label, value, unit, sub, warn }: {
  label: string; value: string | number | null; unit?: string;
  sub?: string; warn?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${warn ? "border-red-500/40 bg-red-500/10" : "border-border/50 bg-card"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums mt-0.5 ${warn ? "text-red-400" : ""}`}>
        {value != null ? `${value}${unit ?? ""}` : "—"}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Overview tab ─────────────────────────────────────────────────────────────
type HpStatus = {
  alarm_active: boolean; alarm_text: string | null;
  heating: { enabled: boolean; setpoint_c: number | null; cutoff_c: number | null };
  dhw: { enabled: boolean; setpoint_c: number | null; recirculation_c: number | null };
  cooling: { enabled: boolean };
  ts: string;
};

type HpRealtime = {
  temperatures: Record<string, { value: number; unit: string }>;
  tank: { buffer_temp_c: number | null; buffer_setpoint_c: number | null; dhw_temp_c: number | null; dhw_setpoint_c: number | null };
  ts: string;
};

function Overview({ status }: { status: HpStatus | null }) {
  if (!status) return <p className="text-muted-foreground text-sm">Loading…</p>;
  return (
    <div className="space-y-4">
      {status.alarm_active && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{status.alarm_text}</span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div className={`rounded-xl border px-4 py-3 ${status.heating?.enabled ? "border-orange-500/30 bg-orange-500/10" : "border-border/40 bg-muted/20"}`}>
          <p className="text-xs text-muted-foreground">Heating</p>
          <p className="font-semibold mt-1">{status.heating?.enabled ? "On" : "Off"}</p>
          {status.heating?.setpoint_c != null && <p className="text-xs text-muted-foreground">Target {status.heating.setpoint_c.toFixed(1)}°C</p>}
        </div>
        <div className={`rounded-xl border px-4 py-3 ${status.dhw?.enabled ? "border-blue-500/30 bg-blue-500/10" : "border-border/40 bg-muted/20"}`}>
          <p className="text-xs text-muted-foreground">Hot Water</p>
          <p className="font-semibold mt-1">{status.dhw?.enabled ? "On" : "Off"}</p>
          {status.dhw?.setpoint_c != null && <p className="text-xs text-muted-foreground">Target {status.dhw.setpoint_c.toFixed(1)}°C</p>}
        </div>
        <div className={`rounded-xl border px-4 py-3 ${status.cooling?.enabled ? "border-cyan-500/30 bg-cyan-500/10" : "border-border/40 bg-muted/20"}`}>
          <p className="text-xs text-muted-foreground">Cooling</p>
          <p className="font-semibold mt-1">{status.cooling?.enabled ? "On" : "Off"}</p>
        </div>
      </div>
    </div>
  );
}

// ── Temperatures tab ──────────────────────────────────────────────────────────
function Temperatures({ realtime }: { realtime: HpRealtime | null }) {
  if (!realtime) return <p className="text-muted-foreground text-sm">Loading…</p>;
  const tank = realtime.tank;
  const temps = realtime.temperatures;

  const get = (key: string) => temps?.[key]?.value ?? null;

  return (
    <div className="space-y-4">
      {/* Tank temps — primary */}
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Buffer Tank" value={tank?.buffer_temp_c?.toFixed(1) ?? null} unit="°C"
          sub={tank?.buffer_setpoint_c != null ? `Setpoint ${tank.buffer_setpoint_c.toFixed(1)}°C` : undefined} />
        <Metric label="DHW Cylinder" value={tank?.dhw_temp_c?.toFixed(1) ?? null} unit="°C"
          sub={tank?.dhw_setpoint_c != null ? `Setpoint ${tank.dhw_setpoint_c.toFixed(1)}°C` : undefined} />
      </div>
      {/* Circuit temps */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Flow (T1)" value={get("Flow Temperature")?.toFixed(1) ?? null} unit="°C" />
        <Metric label="Return (T2)" value={get("Return Temperature")?.toFixed(1) ?? null} unit="°C" />
        <Metric label="Outdoor" value={get("Outdoor Temperature")?.toFixed(1) ?? null} unit="°C" />
        <Metric label="Compressor Suction" value={get("Compressor Suction Temp")?.toFixed(1) ?? null} unit="°C" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Metric label="Brine Pressure" value={get("Brine Pressure")?.toFixed(2) ?? null} unit=" bar"
          warn={get("Brine Pressure") != null && (get("Brine Pressure")! < 1.5 || get("Brine Pressure")! > 3.5)} />
        <Metric label="Heating Pressure" value={get("Heating Pressure")?.toFixed(2) ?? null} unit=" bar"
          warn={get("Heating Pressure") != null && (get("Heating Pressure")! < 1.0 || get("Heating Pressure")! > 2.5)} />
        <Metric label="Suction Pressure" value={get("Compressor Suction Pressure")?.toFixed(2) ?? null} unit=" bar" />
      </div>
    </div>
  );
}

// ── Energy tab ────────────────────────────────────────────────────────────────
type EnergyRow = Record<string, unknown>;

function Energy({ rows, onLog }: { rows: EnergyRow[]; onLog: () => void }) {
  const [logging, setLogging] = useState(false);

  async function handleLog() {
    setLogging(true);
    try { await api.hpEnergyLog(); } finally { setLogging(false); onLog(); }
  }

  if (!rows.length) return (
    <div className="text-center py-12 space-y-3">
      <p className="text-muted-foreground text-sm">No energy data yet.</p>
      <Button size="sm" onClick={handleLog} disabled={logging}>{logging ? "Logging…" : "Log Now"}</Button>
    </div>
  );

  // Detect which field is consumed/produced from actual data keys
  // Ecoforest op 2126: ECCOP = total electricity consumed, EDCOP = total heat delivered
  // Fall back to other common patterns
  function detectKeys(sample: EnergyRow): { consumed: string | null; produced: string | null } {
    const keys = Object.keys(sample);
    const consumed = keys.find(k => k === "ECCOP") ?? keys.find(k => /consumed|CONSUMED|EC$/i.test(k)) ?? null;
    const produced = keys.find(k => k === "EDCOP") ?? keys.find(k => /produced|PRODUCED|ED$/i.test(k)) ?? null;
    return { consumed, produced };
  }

  const { consumed: consumedKey, produced: producedKey } = rows.length > 0 ? detectKeys(rows[0]) : { consumed: null, produced: null };

  const chartData = rows.map((r, i) => {
    const prev = rows[i - 1];
    let cop: number | null = null;
    let producedDelta = 0;
    let consumedDelta = 0;
    if (prev && consumedKey && producedKey) {
      producedDelta = Math.max(0, Number(r[producedKey] ?? 0) - Number(prev[producedKey] ?? 0));
      consumedDelta = Math.max(0, Number(r[consumedKey] ?? 0) - Number(prev[consumedKey] ?? 0));
      if (consumedDelta > 0 && producedDelta > 0) cop = Math.min(10, producedDelta / consumedDelta);
    }
    return {
      time: new Date(String(r.timestamp ?? r.ts ?? "")).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      cop,
      produced: producedDelta,
      consumed: consumedDelta,
    };
  }).filter((_, i) => i > 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={handleLog} disabled={logging} className="h-7 text-xs gap-1">
          <Zap className="h-3 w-3" />{logging ? "Logging…" : "Log Now"}
        </Button>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">COP (Efficiency)</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
            <YAxis domain={[0, 6]} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="cop" stroke="#f97316" dot={false} strokeWidth={2} name="COP" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Energy (kWh)</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData.slice(-30)}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
            <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="produced" fill="#34d399" name="Produced" />
            <Bar dataKey="consumed" fill="#f87171" name="Consumed" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type HpAlarms = {
  alarm_active: boolean; alarm_text: string | null;
  slots: Array<{ slot: number; code: string; description: string }>;
  ts: string;
};

// ── Alarms tab ────────────────────────────────────────────────────────────────
function Alarms({ data }: { data: HpAlarms | null }) {
  if (!data) return <p className="text-muted-foreground text-sm">Loading…</p>;
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
        data.alarm_active ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-green-500/40 bg-green-500/10 text-green-300"
      }`}>
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        {data.alarm_active ? data.alarm_text : "No active alarms"}
      </div>
      {data.slots.map(s => (
        <div key={s.slot} className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="font-medium text-sm text-red-300">Slot {s.slot} — Code {s.code}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{s.description}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HeatPumpPage() {
  const [realtime, setRealtime] = useState<HpRealtime | null>(null);
  const [status, setStatus] = useState<HpStatus | null>(null);
  const [energyRows, setEnergyRows] = useState<EnergyRow[]>([]);
  const [alarms, setAlarms] = useState<HpAlarms | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const hpUrl = process.env.NEXT_PUBLIC_HP_TAILSCALE_URL;

  const fetchAll = useCallback(async () => {
    try {
      const [rt, st, en, al] = await Promise.allSettled([
        api.hpRealtime(), api.hpStatus(), api.hpEnergy(30), api.hpAlarms(),
      ]);
      if (rt.status === "fulfilled") setRealtime(rt.value);
      if (st.status === "fulfilled") setStatus(st.value);
      if (en.status === "fulfilled") setEnergyRows(en.value.rows ?? []);
      if (al.status === "fulfilled") setAlarms(al.value);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 60_000); return () => clearInterval(t); }, [fetchAll]);

  const tank = realtime?.tank;
  const temps = realtime?.temperatures;
  const flowTemp = temps?.["Flow Temperature"]?.value;
  const returnTemp = temps?.["Return Temperature"]?.value;
  const dT = flowTemp != null && returnTemp != null ? (flowTemp - returnTemp).toFixed(1) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-orange-400" />
          <h1 className="font-semibold text-lg">Heat Pump</h1>
          {Boolean(status?.alarm_active) && (
            <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs gap-1">
              <AlertTriangle className="h-3 w-3" /> Alarm
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && <span className="text-xs text-muted-foreground">Updated {lastUpdate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>}
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setRefreshing(true); fetchAll(); }} disabled={refreshing}>
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Top metrics strip */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Metric label="Buffer Tank" value={tank?.buffer_temp_c?.toFixed(1) ?? null} unit="°C"
            sub={tank?.buffer_setpoint_c != null ? `→ ${tank.buffer_setpoint_c.toFixed(1)}°C` : undefined} />
          <Metric label="DHW Cylinder" value={tank?.dhw_temp_c?.toFixed(1) ?? null} unit="°C"
            sub={tank?.dhw_setpoint_c != null ? `→ ${tank.dhw_setpoint_c.toFixed(1)}°C` : undefined} />
          <Metric label="Flow → Return ΔT" value={dT} unit="°C" />
          <Metric label="Outdoor" value={temps?.["Outdoor Temperature"]?.value?.toFixed(1) ?? null} unit="°C" />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="temperatures">Temperatures</TabsTrigger>
            <TabsTrigger value="energy">Energy</TabsTrigger>
            <TabsTrigger value="alarms">Alarms {Boolean(status?.alarm_active) && "⚠"}</TabsTrigger>
            {hpUrl && <TabsTrigger value="native">Native UI</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview"><Overview status={status} /></TabsContent>
          <TabsContent value="temperatures"><Temperatures realtime={realtime} /></TabsContent>
          <TabsContent value="energy"><Energy rows={energyRows} onLog={fetchAll} /></TabsContent>
          <TabsContent value="alarms"><Alarms data={alarms} /></TabsContent>
          {hpUrl && (
            <TabsContent value="native">
              <div className="flex items-center gap-2 mb-3">
                <a href={hpUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-3 w-3" /> Open in new tab
                </a>
                <span className="text-xs text-muted-foreground">(requires Tailscale)</span>
              </div>
              <iframe src={hpUrl} className="w-full rounded-xl border border-border/40"
                style={{ height: "calc(100vh - 280px)" }} title="Heat Pump Native UI" />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
