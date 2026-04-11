"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Settings, Save, RefreshCw, ChevronDown, ChevronRight, Thermometer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RoomStatus, TrvDetail } from "@/lib/supabase";

// ── Shared form helpers ───────────────────────────────────────────────────────
function NumInput({ label, value, onChange, step = 1, min, max }: {
  label: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input type="number" value={value} step={step} min={min} max={max}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
    </label>
  );
}

function TextInput({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <button onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-muted"}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4.5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

// ── Room interfaces ───────────────────────────────────────────────────────────
interface RoomConfig {
  name: string; room_type: "bedroom" | "living" | "zone_only"; enabled: boolean;
  nest_zone_name: string; day_target_temp_c: number; target_temp_c: number;
  max_temp_c: number; min_pos_pct: number; night_pos_pct: number;
  nest_idle_temp_c?: number; shelly_zones: string[];
}

interface Config {
  enabled: boolean; poll_interval_min: number; night_nest_c: number;
  night_start: string; morning_boost_time: string; morning_boost_temp_c: number;
  morning_boost_duration_min: number; rooms: RoomConfig[];
}

// ── Heating Config tab ────────────────────────────────────────────────────────
function HeatingConfig() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadConfig() {
    setLoading(true);
    try {
      const data = await api.config();
      setConfig(data.config ?? data);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadConfig(); }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>;
  if (!config) return <p className="text-muted-foreground text-sm">{error ?? "No config loaded."}</p>;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={loadConfig} className="h-8 gap-1"><RefreshCw className="h-3 w-3" /> Reload</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 gap-1">
          <Save className="h-3 w-3" />{saving ? "Saving…" : saved ? "Saved!" : "Save"}
        </Button>
      </div>
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</div>}

      <section className="rounded-xl border border-border/50 bg-card p-4 space-y-4">
        <h2 className="font-medium text-sm">System</h2>
        <Toggle label="Heat Engine enabled" value={config.enabled} onChange={v => setConfig(c => c ? { ...c, enabled: v } : c)} />
        <div className="grid grid-cols-2 gap-3">
          <NumInput label="Poll interval (min)" value={config.poll_interval_min} step={1} min={1} max={60}
            onChange={v => setConfig(c => c ? { ...c, poll_interval_min: v } : c)} />
          <NumInput label="Night Nest setpoint (°C)" value={config.night_nest_c} step={0.5} min={15} max={30}
            onChange={v => setConfig(c => c ? { ...c, night_nest_c: v } : c)} />
        </div>
        <TextInput label="Night start (HH:MM local)" value={config.night_start ?? "22:00"}
          onChange={v => setConfig(c => c ? { ...c, night_start: v } : c)} />
      </section>

      <section className="rounded-xl border border-border/50 bg-card p-4 space-y-4">
        <div>
          <h2 className="font-medium text-sm">Morning Boost Defaults</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Used as fallback for any room without its own boost settings. Configure per-room on the{" "}
            <a href="/rooms" className="underline hover:text-foreground">Rooms page</a>.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TextInput label="Time (HH:MM)" value={config.morning_boost_time}
            onChange={v => setConfig(c => c ? { ...c, morning_boost_time: v } : c)} />
          <NumInput label="Target (°C)" value={config.morning_boost_temp_c} step={0.5} min={15} max={25}
            onChange={v => setConfig(c => c ? { ...c, morning_boost_temp_c: v } : c)} />
          <NumInput label="Duration (min)" value={config.morning_boost_duration_min} step={5} min={15} max={240}
            onChange={v => setConfig(c => c ? { ...c, morning_boost_duration_min: v } : c)} />
        </div>
      </section>

      <div className="rounded-xl border border-border/40 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
        Room-specific settings (targets, schedule, valves, Nest zone, TRVs, morning boost) are now managed on the{" "}
        <a href="/rooms" className="underline hover:text-foreground font-medium">Rooms page</a>{" "}
        where you can see the 24h prediction update as you edit.
      </div>
    </div>
  );
}

// ── Cameras settings tab ──────────────────────────────────────────────────────
function CameraSettings() {
  const fields = [
    { key: "NEXT_PUBLIC_UNIFI_SHARE_URL", label: "UniFi PTZ Share URL", hint: "Public WebRTC share link for live stream" },
    { key: "NEXT_PUBLIC_HP_TAILSCALE_URL", label: "Heat Pump Tailscale URL", hint: "e.g. http://100.x.x.x — requires Tailscale on device" },
    { key: "NEXT_PUBLIC_UNIFI_PRESET_0", label: "Preset 0 name", hint: "" },
    { key: "NEXT_PUBLIC_UNIFI_PRESET_1", label: "Preset 1 name", hint: "" },
    { key: "NEXT_PUBLIC_UNIFI_PRESET_2", label: "Preset 2 name", hint: "" },
    { key: "NEXT_PUBLIC_UNIFI_PRESET_3", label: "Preset 3 name", hint: "" },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        These are <code className="text-xs bg-muted/50 px-1 rounded">NEXT_PUBLIC_</code> environment variables.
        Update them in <code className="text-xs bg-muted/50 px-1 rounded">vercel.json</code> and redeploy to change.
      </p>
      <div className="rounded-xl border border-border/50 bg-card divide-y divide-border/30 overflow-hidden">
        {fields.map(f => {
          const val = process.env[f.key as keyof typeof process.env] ?? "";
          return (
            <div key={f.key} className="px-4 py-3">
              <p className="text-sm font-medium">{f.label}</p>
              {f.hint && <p className="text-xs text-muted-foreground mb-1">{f.hint}</p>}
              <code className="text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded block">
                {val || <span className="italic text-muted-foreground/50">not set</span>}
              </code>
            </div>
          );
        })}
      </div>
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
        With Tailscale, your browser can reach cameras and the heat pump directly.
        Set <code className="text-xs">NEXT_PUBLIC_HP_TAILSCALE_URL</code> to your heat pump&apos;s Tailscale IP (e.g.{" "}
        <code className="text-xs">http://100.x.x.x</code>) for the native UI embed.
      </div>
    </div>
  );
}

// ── AI settings tab ───────────────────────────────────────────────────────────
function AiSettings() {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
        <h2 className="font-medium text-sm">Anthropic Claude</h2>
        <p className="text-xs text-muted-foreground">
          The API key is set as <code className="text-xs bg-muted/50 px-1 rounded">ANTHROPIC_API_KEY</code> on Railway.
          Manage it via the Railway dashboard → Heat Pump project → Variables.
        </p>
        <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm text-green-300 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-400 flex-shrink-0" />
          AI is configured on Railway. The Heat Engine runs on every poll cycle.
        </div>
      </div>
      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
        <h2 className="font-medium text-sm">Current AI behaviour</h2>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• 24/7 Heat Engine — day targets 21°C, night targets 17–18°C</li>
          <li>• Bedroom TRVs parked silent during sleep window (19:00–06:40)</li>
          <li>• Living rooms valve-controlled at all times</li>
          <li>• Ceiling cutoff with 1°C hysteresis to prevent boiler cycling</li>
          <li>• Night position learning — auto-adjusts valve park position each night</li>
        </ul>
      </div>
    </div>
  );
}

// ── Diagnostics tab ───────────────────────────────────────────────────────────
interface AutoState {
  enabled?: boolean;
  last_eval?: string | null;
  next_eval?: string | null;
  last_reasoning?: string;
  last_suggestion?: string;
  room_temps?: Record<string, number | null>;
  shelly_last_error?: string | null;
  last_shelly_zones?: Array<{ zone: string; current_temp: number | null; connected?: boolean }>;
}

function fmtTs(ts: string | null | undefined) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return ts; }
}

function Diagnostics() {
  const [state, setState] = useState<AutoState | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycling, setCycling] = useState(false);
  const [cycleMsg, setCycleMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const data: AutoState = await api.status();
      setState(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, pollCount]);

  // Auto-refresh every 10s after forcing a cycle
  useEffect(() => {
    if (!cycling) return;
    const t = setTimeout(() => { setPollCount(n => n + 1); setCycling(false); }, 10000);
    return () => clearTimeout(t);
  }, [cycling]);

  async function forceCycle() {
    setCycling(true);
    setCycleMsg(null);
    setError(null);
    try {
      const res = await api.cycle();
      setCycleMsg(res.message ?? "Cycle triggered — refreshing in 10s…");
    } catch (e: unknown) {
      setCycleMsg(null);
      setError(e instanceof Error ? e.message : "Cycle failed");
      setCycling(false);
    }
  }

  const roomTemps = state?.room_temps ?? {};
  const shellyZones = state?.last_shelly_zones ?? [];
  const noTemps = Object.values(roomTemps).every(t => t == null);
  const hasError = !!state?.shelly_last_error;

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Wake / force cycle */}
      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
        <h2 className="font-medium text-sm">Force evaluation cycle</h2>
        <p className="text-xs text-muted-foreground">
          Wakes the automation thread immediately and forces a fresh Shelly gateway poll + AI decision. Normally runs every {" "}
          {/* poll interval */} few minutes automatically.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={forceCycle}
            disabled={cycling}
            className="gap-2"
          >
            {cycling ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Running cycle…</>
            ) : (
              <><RefreshCw className="h-4 w-4" /> Wake up now</>
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPollCount(n => n + 1)} className="h-8 gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh status
          </Button>
          {cycleMsg && <span className="text-xs text-green-400">{cycleMsg}</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </div>

      {/* Cycle timing */}
      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
        <h2 className="font-medium text-sm">Cycle status</h2>
        {loading ? (
          <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Engine enabled</p>
              <span className={`font-medium ${state?.enabled ? "text-green-400" : "text-red-400"}`}>
                {state?.enabled ? "Yes" : "Disabled"}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Last eval</p>
              <span className="font-mono text-xs">{fmtTs(state?.last_eval)}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Next eval</p>
              <span className="font-mono text-xs">{fmtTs(state?.next_eval)}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Room temps</p>
              <span className={`font-medium text-xs ${noTemps ? "text-red-400" : "text-green-400"}`}>
                {noTemps ? "None received" : `${Object.values(roomTemps).filter(t => t != null).length} / ${Object.keys(roomTemps).length} rooms`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Shelly gateway */}
      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
        <h2 className="font-medium text-sm">Shelly gateway</h2>
        {hasError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300 font-mono break-all">
            {state?.shelly_last_error}
          </div>
        )}
        {!hasError && shellyZones.length === 0 && (
          <p className="text-xs text-amber-400">No TRV zones received — gateway may be unreachable.</p>
        )}
        {shellyZones.length > 0 && (
          <div className="divide-y divide-border/30 rounded-lg border border-border/40 overflow-hidden">
            {shellyZones.map(z => (
              <div key={z.zone} className="flex items-center justify-between px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${z.connected !== false ? "bg-green-400" : "bg-red-400"}`} />
                  <span>{z.zone}</span>
                </div>
                <span className={z.current_temp != null ? "text-foreground/80" : "text-muted-foreground/50"}>
                  {z.current_temp != null ? `${z.current_temp.toFixed(1)}°` : "no temp"}
                </span>
              </div>
            ))}
          </div>
        )}
        {!hasError && !loading && (
          <p className="text-xs text-muted-foreground">
            If temperatures are missing, check Tailscale is routing the gateway subnet (10.10.200.0/24) and the BluTRV devices are connected via Bluetooth.
          </p>
        )}
      </div>

      {/* Last AI reasoning */}
      {state?.last_reasoning && (
        <div className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
          <h2 className="font-medium text-sm">Last AI reasoning</h2>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{state.last_reasoning}</p>
        </div>
      )}
    </div>
  );
}

// ── Valve Test tab ────────────────────────────────────────────────────────────
const TEST_POSITIONS = [0, 25, 50, 75, 100];

interface TrvRow {
  room: string;
  trv: TrvDetail;
}

function ValveTest() {
  const [trvs, setTrvs] = useState<TrvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<Record<string, number | null>>({});
  const [results, setResults] = useState<Record<string, string>>({});

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await api.rooms();
      const rows: TrvRow[] = [];
      for (const room of (data.rooms ?? []) as RoomStatus[]) {
        for (const trv of room.trvs ?? []) {
          rows.push({ room: room.name, trv });
        }
      }
      setTrvs(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load rooms");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setValve(trv: TrvDetail, pos: number) {
    const key = trv.device_id;
    setSending(prev => ({ ...prev, [key]: pos }));
    setResults(prev => ({ ...prev, [key]: "" }));
    try {
      await api.setValve(trv.device_id, pos, trv.name);
      // Optimistically update the displayed valve position
      setTrvs(prev => prev.map(row =>
        row.trv.device_id === key
          ? { ...row, trv: { ...row.trv, valve_pct: pos } }
          : row
      ));
      setResults(prev => ({ ...prev, [key]: `✓ ${pos}%` }));
      setTimeout(() => setResults(prev => ({ ...prev, [key]: "" })), 4000);
    } catch (e: unknown) {
      setResults(prev => ({ ...prev, [key]: `✗ ${e instanceof Error ? e.message : "Error"}` }));
    } finally {
      setSending(prev => ({ ...prev, [key]: null }));
    }
  }

  if (loading) return (
    <div className="space-y-3 max-w-2xl">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />
      ))}
    </div>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Set individual TRV valve positions directly for testing. The automation will override these on the next cycle.
        </p>
        <Button size="sm" variant="outline" onClick={() => load(true)} disabled={refreshing} className="h-8 gap-1 flex-shrink-0">
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</div>
      )}

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
        ⚠ Test mode — the heat engine will override these positions on its next cycle. Use for diagnostics only.
      </div>

      {trvs.length === 0 && !error && (
        <p className="text-sm text-muted-foreground text-center py-10">No TRVs found. Check the automation is running and rooms are configured.</p>
      )}

      <div className="rounded-xl border border-border/50 bg-card overflow-hidden divide-y divide-border/30">
        {trvs.map(({ room, trv }) => {
          const key = trv.device_id;
          const busy = sending[key] != null;
          const result = results[key];
          const isOk = result?.startsWith("✓");

          return (
            <div key={key} className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${trv.connected ? "bg-green-400" : "bg-red-400"}`} />
                    <span className="font-medium text-sm">{trv.name}</span>
                    <Badge variant="outline" className="text-xs text-muted-foreground">{room}</Badge>
                    {trv.battery != null && trv.battery <= 25 && (
                      <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-500/30">🔋 {trv.battery}%</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground pl-4">
                    {trv.current_temp != null && (
                      <span className="flex items-center gap-1">
                        <Thermometer className="h-3 w-3" />{trv.current_temp.toFixed(1)}°
                      </span>
                    )}
                    <span>Valve: <span className="font-medium text-foreground/80">{trv.valve_pct ?? "—"}%</span></span>
                    {!trv.connected && <span className="text-red-400">Disconnected</span>}
                  </div>
                </div>
                {result && (
                  <span className={`text-xs font-medium flex-shrink-0 ${isOk ? "text-green-400" : "text-red-400"}`}>
                    {result}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap pl-4">
                {TEST_POSITIONS.map(pos => (
                  <button
                    key={pos}
                    onClick={() => setValve(trv, pos)}
                    disabled={busy}
                    className={[
                      "min-w-[52px] rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      trv.valve_pct === pos
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/50 bg-background text-muted-foreground hover:border-border hover:text-foreground",
                      busy ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                      busy && sending[key] === pos ? "opacity-60" : "",
                    ].join(" ")}
                  >
                    {busy && sending[key] === pos ? "…" : `${pos}%`}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Connections tab ────────────────────────────────────────────────────────────

interface NestSettings {
  project_id: string; client_id: string;
  client_secret_masked: string; refresh_token_masked: string;
  has_client_secret: boolean; has_refresh_token: boolean; has_access_token: boolean;
}

interface ShellySettings {
  gateway_ips: string[];
  trv_mapping: Record<string, unknown>;
}

function ConnectionSettings() {
  const [nest, setNest] = useState<NestSettings | null>(null);
  const [shelly, setShelly] = useState<ShellySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Nest edit state
  const [nestProjectId, setNestProjectId] = useState("");
  const [nestClientId, setNestClientId] = useState("");
  const [nestClientSecret, setNestClientSecret] = useState("");
  const [nestRefreshToken, setNestRefreshToken] = useState("");
  const [nestSaving, setNestSaving] = useState(false);
  const [nestSaved, setNestSaved] = useState(false);

  // Shelly edit state
  const [gwIps, setGwIps] = useState("");
  const [shellySaving, setShellySaving] = useState(false);
  const [shellySaved, setShellySaved] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [n, s] = await Promise.all([api.nestSettings(), api.shellySettings()]);
      setNest(n);
      setShelly(s);
      setNestProjectId(n.project_id ?? "");
      setNestClientId(n.client_id ?? "");
      setNestClientSecret("");
      setNestRefreshToken("");
      setGwIps((s.gateway_ips ?? []).join(", "));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadAll(); }, []);

  async function saveNest() {
    setNestSaving(true);
    setError(null);
    try {
      const body: Record<string, string | null> = {};
      if (nestProjectId) body.project_id = nestProjectId;
      if (nestClientId) body.client_id = nestClientId;
      if (nestClientSecret) body.client_secret = nestClientSecret;
      if (nestRefreshToken) body.refresh_token = nestRefreshToken;
      await api.saveNestSettings(body);
      setNestSaved(true);
      setTimeout(() => setNestSaved(false), 2500);
      setNestClientSecret("");
      setNestRefreshToken("");
      await loadAll();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setNestSaving(false); }
  }

  async function saveShelly() {
    setShellySaving(true);
    setError(null);
    try {
      const ips = gwIps.split(",").map(s => s.trim()).filter(Boolean);
      await api.saveShellySettings({ gateway_ips: ips });
      setShellySaved(true);
      setTimeout(() => setShellySaved(false), 2500);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setShellySaving(false); }
  }

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>;

  return (
    <div className="space-y-5 max-w-2xl">
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</div>}

      {/* Nest */}
      <section className="rounded-xl border border-border/50 bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sm">Google Nest</h2>
          <div className="flex items-center gap-2">
            {nest?.has_refresh_token ? (
              <Badge variant="outline" className="text-green-400 border-green-500/30">Connected</Badge>
            ) : (
              <Badge variant="outline" className="text-red-400 border-red-500/30">Not configured</Badge>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <TextInput label="Project ID" value={nestProjectId} onChange={setNestProjectId}
            placeholder="e.g. 1a2b3c4d-5e6f-..." />
          <TextInput label="Client ID" value={nestClientId} onChange={setNestClientId}
            placeholder="e.g. 123456789-abc.apps.googleusercontent.com" />
          <div className="space-y-1">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Client Secret {nest?.has_client_secret && <span className="text-green-400/70">(saved: {nest.client_secret_masked})</span>}
              <input type="password" value={nestClientSecret} placeholder="Leave blank to keep current"
                onChange={e => setNestClientSecret(e.target.value)}
                className="w-full rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </label>
          </div>
          <div className="space-y-1">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Refresh Token {nest?.has_refresh_token && <span className="text-green-400/70">(saved: {nest.refresh_token_masked})</span>}
              <input type="password" value={nestRefreshToken} placeholder="Leave blank to keep current"
                onChange={e => setNestRefreshToken(e.target.value)}
                className="w-full rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </label>
          </div>
        </div>

        {nest?.has_refresh_token && nestProjectId && nestClientId && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
            To re-authorize Nest, visit the{" "}
            <a href={`https://nestservices.google.com/partnerconnections/${nestProjectId}/auth?redirect_uri=https://www.google.com&access_type=offline&prompt=consent&client_id=${nestClientId}&response_type=code&scope=https://www.googleapis.com/auth/sdm.service`}
              target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-200">
              Google authorization page
            </a>, then paste the new refresh token above.
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={saveNest} disabled={nestSaving} className="h-8 gap-1">
            <Save className="h-3 w-3" />{nestSaving ? "Saving…" : nestSaved ? "Saved!" : "Save Nest"}
          </Button>
        </div>
      </section>

      {/* Shelly */}
      <section className="rounded-xl border border-border/50 bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sm">Shelly TRV Gateways</h2>
          <Badge variant="outline" className={shelly?.gateway_ips?.length ? "text-green-400 border-green-500/30" : "text-red-400 border-red-500/30"}>
            {shelly?.gateway_ips?.length ?? 0} gateway{(shelly?.gateway_ips?.length ?? 0) !== 1 ? "s" : ""}
          </Badge>
        </div>

        <TextInput label="Gateway IPs (comma-separated)" value={gwIps} onChange={setGwIps}
          placeholder="e.g. 10.10.200.105, 10.10.200.114, 10.10.200.131" />
        <p className="text-xs text-muted-foreground">
          These are the local IPs of your Shelly Pro gateways that bridge BluTRV devices via Bluetooth.
          Reached via Tailscale subnet routing from Railway.
        </p>

        {shelly?.trv_mapping && Object.keys(shelly.trv_mapping).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">TRV Mapping</p>
            <div className="rounded-lg border border-border/40 overflow-hidden divide-y divide-border/30">
              {Object.entries(shelly.trv_mapping).map(([deviceId, info]) => (
                <div key={deviceId} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="font-mono text-muted-foreground">{deviceId}</span>
                  <span>{typeof info === "string" ? info : JSON.stringify(info)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={saveShelly} disabled={shellySaving} className="h-8 gap-1">
            <Save className="h-3 w-3" />{shellySaving ? "Saving…" : shellySaved ? "Saved!" : "Save Shelly"}
          </Button>
        </div>
      </section>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="font-semibold text-lg">Settings</h1>
      </div>

      <Tabs defaultValue="heating">
        <TabsList className="mb-5">
          <TabsTrigger value="heating">Heating</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          <TabsTrigger value="valves">Valve Test</TabsTrigger>
          <TabsTrigger value="cameras">Cameras</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
        </TabsList>

        <TabsContent value="heating"><HeatingConfig /></TabsContent>
        <TabsContent value="connections"><ConnectionSettings /></TabsContent>
        <TabsContent value="diagnostics"><Diagnostics /></TabsContent>
        <TabsContent value="valves"><ValveTest /></TabsContent>
        <TabsContent value="cameras"><CameraSettings /></TabsContent>
        <TabsContent value="ai"><AiSettings /></TabsContent>
      </Tabs>
    </div>
  );
}
