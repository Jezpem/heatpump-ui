"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Zap, RefreshCw, Clock, TrendingDown, Settings2, Loader2, ArrowRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

type RateRow = {
  valid_from: string; valid_to: string;
  value_inc_vat: number; rate_type: string;
  is_current?: boolean; is_cheap?: boolean;
};

type CurrentRate = {
  rate_pence: number; rate_type: string;
  valid_from: string; valid_to: string;
  minutes_until_change: number;
  next_rate_pence: number | null;
  next_rate_type: string | null;
};

type DailyRow = {
  date: string; kwh: number; cost_pence: number;
  kwh_peak: number; kwh_offpeak: number;
};

type CostSummary = {
  total_kwh: number; total_cost_pence: number; total_cost_pounds: number;
  avg_daily_cost_pence: number; kwh_peak: number; kwh_offpeak: number;
  offpeak_pct: number; est_monthly_cost_pounds: number;
  savings_vs_peak_pence: number; savings_vs_peak_pct: number;
};

type DispatchSlot = { valid_from: string; valid_to: string; value_inc_vat: number };

type OctConfig = {
  account_number?: string; mpan?: string; serial?: string;
  product_code?: string; tariff_code?: string;
  api_key_masked?: string;
};

// ── Metric card ──────────────────────────────────────────────────────────────

function Metric({ label, value, sub, accent }: {
  label: string; value: string | null; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums mt-0.5 ${accent ?? ""}`}>
        {value ?? "—"}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Live Rates tab ───────────────────────────────────────────────────────────

function LiveRates({ rates, current, dispatches }: {
  rates: RateRow[]; current: CurrentRate | null; dispatches: DispatchSlot[];
}) {
  if (!current) return (
    <p className="text-muted-foreground text-sm py-8 text-center">
      No rate data yet. Connect your Octopus account in Settings, then click Sync.
    </p>
  );

  const isCurrentCheap = current.rate_type === "off_peak" || current.rate_type === "dispatch";
  const hours = Math.floor(current.minutes_until_change / 60);
  const mins = Math.round(current.minutes_until_change % 60);
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const rateColor = (type: string) =>
    type === "off_peak" ? "#22c55e" : type === "dispatch" ? "#3b82f6" : "#ef4444";

  const chartData = rates.map(r => ({
    time: new Date(r.valid_from).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    rate: r.value_inc_vat,
    type: r.rate_type,
    isCurrent: r.is_current,
  }));

  return (
    <div className="space-y-5">
      {/* Current rate hero */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className={`rounded-xl border px-4 py-3 ${
          isCurrentCheap ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10"
        }`}>
          <p className="text-xs text-muted-foreground">Current Rate</p>
          <p className={`text-3xl font-bold tabular-nums mt-0.5 ${isCurrentCheap ? "text-green-400" : "text-red-400"}`}>
            {current.rate_pence.toFixed(1)}p
          </p>
          <p className="text-xs mt-0.5">
            <Badge variant="outline" className={`text-[10px] ${
              isCurrentCheap ? "border-green-500/40 text-green-400" : "border-red-500/40 text-red-400"
            }`}>
              {current.rate_type.replace("_", "-").toUpperCase()}
            </Badge>
          </p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Rate Changes In</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <p className="text-2xl font-semibold tabular-nums">{timeStr}</p>
          </div>
        </div>
        {current.next_rate_pence != null && (
          <div className="rounded-xl border border-border/50 bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Next Rate</p>
            <div className="flex items-center gap-2 mt-0.5">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <p className="text-2xl font-semibold tabular-nums">
                {current.next_rate_pence.toFixed(1)}p
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] mt-1">
              {(current.next_rate_type ?? "").replace("_", "-").toUpperCase()}
            </Badge>
          </div>
        )}
      </div>

      {/* 24h rate chart */}
      {chartData.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Tariff Rates — Next 24 Hours
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} unit="p" />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`${Number(v).toFixed(1)}p/kWh`]}
              />
              <Bar dataKey="rate" name="Rate">
                {chartData.map((d, i) => (
                  <Cell key={i} fill={rateColor(d.type)} opacity={d.isCurrent ? 1 : 0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500" /> Off-peak</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500" /> Peak</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500" /> Dispatch</span>
          </div>
        </div>
      )}

      {/* Dispatch slots */}
      {dispatches.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Upcoming Intelligent Dispatch Slots
          </p>
          <div className="space-y-1.5">
            {dispatches.map((d, i) => {
              const from = new Date(d.valid_from).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
              const to = new Date(d.valid_to).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-sm">
                  <Zap className="h-3.5 w-3.5 text-blue-400" />
                  <span>{from} — {to}</span>
                  <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 ml-auto">
                    {d.value_inc_vat.toFixed(1)}p/kWh
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Consumption & Costs tab ──────────────────────────────────────────────────

function ConsumptionCosts({ daily, summary }: {
  daily: DailyRow[]; summary: CostSummary | null;
}) {
  if (!summary || !daily.length) return (
    <p className="text-muted-foreground text-sm py-8 text-center">
      No consumption data yet. Smart meter data usually has a 24–48 hour lag from Octopus.
    </p>
  );

  const costData = daily.map(d => ({
    date: new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    offpeak: +(d.cost_pence - (d.kwh_peak * (summary.total_cost_pence / summary.total_kwh || 0))).toFixed(1),
    peak_cost: 0,
    rawDate: d.date,
    kwh_offpeak: d.kwh_offpeak,
    kwh_peak: d.kwh_peak,
  }));

  // Recompute proper cost split per day
  const dailyCostChart = daily.map(d => {
    const total = d.cost_pence / 100;
    const offpeakFrac = d.kwh > 0 ? d.kwh_offpeak / d.kwh : 0;
    return {
      date: new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      offpeak: +(total * offpeakFrac).toFixed(2),
      peak: +(total * (1 - offpeakFrac)).toFixed(2),
    };
  });

  const dailyKwhChart = daily.map(d => ({
    date: new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    offpeak: +d.kwh_offpeak.toFixed(1),
    peak: +d.kwh_peak.toFixed(1),
  }));

  return (
    <div className="space-y-5">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Total Cost" value={`£${summary.total_cost_pounds.toFixed(2)}`} sub={`${daily.length} days`} />
        <Metric label="Avg Daily" value={`£${(summary.avg_daily_cost_pence / 100).toFixed(2)}`} />
        <Metric label="Total kWh" value={summary.total_kwh.toFixed(0)} />
        <Metric
          label="Off-Peak Usage"
          value={`${summary.offpeak_pct.toFixed(0)}%`}
          sub={summary.savings_vs_peak_pct > 1 ? `Saving ${summary.savings_vs_peak_pct.toFixed(0)}% vs flat peak` : undefined}
          accent="text-green-400"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Est. Monthly Cost" value={`£${summary.est_monthly_cost_pounds.toFixed(2)}`} />
        <Metric
          label="Saved vs Peak-Only"
          value={summary.savings_vs_peak_pence > 0 ? `£${(summary.savings_vs_peak_pence / 100).toFixed(2)}` : "£0.00"}
          accent={summary.savings_vs_peak_pence > 0 ? "text-green-400" : ""}
        />
      </div>

      {/* Daily cost chart */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Daily Cost (£)</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={dailyCostChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} unit="£" />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              formatter={(v) => [`£${Number(v).toFixed(2)}`]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="offpeak" stackId="a" fill="#22c55e" name="Off-Peak" />
            <Bar dataKey="peak" stackId="a" fill="#ef4444" name="Peak" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Daily kWh chart */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Daily Usage (kWh)</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={dailyKwhChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              formatter={(v) => [`${Number(v).toFixed(1)} kWh`]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="offpeak" stackId="a" fill="#22c55e" name="Off-Peak" />
            <Bar dataKey="peak" stackId="a" fill="#ef4444" name="Peak" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Octopus Settings tab ─────────────────────────────────────────────────────

function OctopusSettings({ config, onSaved }: { config: OctConfig | null; onSaved: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [account, setAccount] = useState(config?.account_number ?? "");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (config?.account_number) setAccount(config.account_number);
  }, [config]);

  async function handleConnect() {
    if (!apiKey || !account) { setMsg({ ok: false, text: "Both fields are required." }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await api.saveOctopusConfig(apiKey, account);
      const c = res.config ?? {};
      setMsg({ ok: true, text: `Connected! MPAN: ${c.mpan ?? "?"}, Serial: ${c.serial ?? "?"}, Tariff: ${c.tariff_code ?? "?"}` });
      onSaved();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Connection failed" });
    } finally { setSaving(false); }
  }

  async function handleSync() {
    setSyncing(true); setMsg(null);
    try {
      const res = await api.octopusSync();
      setMsg({ ok: true, text: `Synced ${res.rates_synced} rates, ${res.consumption_synced} consumption, ${res.dispatches_synced} dispatches.` });
      onSaved();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Sync failed" });
    } finally { setSyncing(false); }
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Connect Octopus Account</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={config?.api_key_masked ?? "sk_live_..."}
              className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Find at{" "}
              <a href="https://octopus.energy/dashboard/new/accounts/personal-details/api-access"
                target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                octopus.energy/dashboard
              </a>
            </p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Account Number</label>
            <input
              type="text"
              value={account}
              onChange={e => setAccount(e.target.value)}
              placeholder="A-12345678"
              className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button size="sm" onClick={handleConnect} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {saving ? "Connecting…" : "Connect"}
          </Button>
        </div>
      </div>

      {msg && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${
          msg.ok ? "border-green-500/40 bg-green-500/10 text-green-300" : "border-red-500/40 bg-red-500/10 text-red-300"
        }`}>{msg.text}</div>
      )}

      {config?.mpan && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Meter Details</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">MPAN</span><span className="font-mono">{config.mpan}</span>
            <span className="text-muted-foreground">Serial</span><span className="font-mono">{config.serial ?? "—"}</span>
            <span className="text-muted-foreground">Product</span><span className="font-mono">{config.product_code ?? "—"}</span>
            <span className="text-muted-foreground">Tariff</span><span className="font-mono">{config.tariff_code ?? "—"}</span>
          </div>
        </div>
      )}

      <div className="border-t border-border/40 pt-4">
        <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing} className="gap-1.5">
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {syncing ? "Syncing…" : "Sync Now"}
        </Button>
        <p className="text-xs text-muted-foreground mt-1">Force-fetch latest rates, consumption, and dispatch slots.</p>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function EnergyPage() {
  const [rates, setRates] = useState<RateRow[]>([]);
  const [current, setCurrent] = useState<CurrentRate | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [dispatches, setDispatches] = useState<DispatchSlot[]>([]);
  const [config, setConfig] = useState<OctConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [rr, cs, dp, cf] = await Promise.allSettled([
        api.octopusRates(24),
        api.octopusCostSummary(30),
        api.octopusDispatches(),
        api.octopusConfig(),
      ]);
      if (rr.status === "fulfilled") { setRates(rr.value.rows ?? []); setCurrent(rr.value.current ?? null); }
      if (cs.status === "fulfilled") { setDaily(cs.value.daily ?? []); setSummary(cs.value.summary ?? null); }
      if (dp.status === "fulfilled") setDispatches(dp.value.slots ?? []);
      if (cf.status === "fulfilled") setConfig(cf.value);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 120_000); return () => clearInterval(t); }, [fetchAll]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-400" />
          <h1 className="font-semibold text-lg">Energy Costs</h1>
          {current && (
            <Badge className={`text-xs gap-1 ${
              current.rate_type === "off_peak" || current.rate_type === "dispatch"
                ? "bg-green-500/20 text-green-300 border-green-500/30"
                : "bg-red-500/20 text-red-300 border-red-500/30"
            }`}>
              <Zap className="h-3 w-3" />
              {current.rate_pence.toFixed(1)}p/{current.rate_type.replace("_", "-")}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-xs text-muted-foreground">
              {lastUpdate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={() => { setRefreshing(true); fetchAll(); }} disabled={refreshing}>
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}
        </div>
      ) : (
        <Tabs defaultValue="rates">
          <TabsList className="mb-4">
            <TabsTrigger value="rates" className="gap-1"><Zap className="h-3.5 w-3.5" /> Live Rates</TabsTrigger>
            <TabsTrigger value="costs" className="gap-1"><TrendingDown className="h-3.5 w-3.5" /> Costs</TabsTrigger>
            <TabsTrigger value="settings" className="gap-1"><Settings2 className="h-3.5 w-3.5" /> Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="rates">
            <LiveRates rates={rates} current={current} dispatches={dispatches} />
          </TabsContent>
          <TabsContent value="costs">
            <ConsumptionCosts daily={daily} summary={summary} />
          </TabsContent>
          <TabsContent value="settings">
            <OctopusSettings config={config} onSaved={fetchAll} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
