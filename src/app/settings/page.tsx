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
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);

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

  function updateRoom(idx: number, patch: Partial<RoomConfig>) {
    setConfig(prev => {
      if (!prev) return prev;
      const rooms = [...prev.rooms];
      rooms[idx] = { ...rooms[idx], ...patch };
      return { ...prev, rooms };
    });
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
        <h2 className="font-medium text-sm">Morning Boost</h2>
        <div className="grid grid-cols-3 gap-3">
          <TextInput label="Time (HH:MM)" value={config.morning_boost_time}
            onChange={v => setConfig(c => c ? { ...c, morning_boost_time: v } : c)} />
          <NumInput label="Target (°C)" value={config.morning_boost_temp_c} step={0.5} min={15} max={25}
            onChange={v => setConfig(c => c ? { ...c, morning_boost_temp_c: v } : c)} />
          <NumInput label="Duration (min)" value={config.morning_boost_duration_min} step={5} min={15} max={240}
            onChange={v => setConfig(c => c ? { ...c, morning_boost_duration_min: v } : c)} />
        </div>
      </section>

      <section className="rounded-xl border border-border/50 bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40">
          <h2 className="font-medium text-sm">Rooms ({config.rooms.length})</h2>
        </div>
        <div className="divide-y divide-border/30">
          {config.rooms.map((room, idx) => {
            const isExpanded = expandedRoom === room.name;
            return (
              <div key={room.name}>
                <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/10 transition-colors"
                  onClick={() => setExpandedRoom(isExpanded ? null : room.name)}>
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${room.enabled ? "bg-green-400" : "bg-muted-foreground/30"}`} />
                  <span className="flex-1 font-medium text-sm">{room.name}</span>
                  <Badge variant="outline" className="text-xs text-muted-foreground">{room.room_type}</Badge>
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 bg-muted/10">
                    <Toggle label="Room enabled" value={room.enabled} onChange={v => updateRoom(idx, { enabled: v })} />
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Room type
                        <select value={room.room_type} onChange={e => updateRoom(idx, { room_type: e.target.value as RoomConfig["room_type"] })}
                          className="rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none">
                          <option value="bedroom">bedroom</option>
                          <option value="living">living</option>
                          <option value="zone_only">zone_only</option>
                        </select>
                      </label>
                      <TextInput label="Nest zone name" value={room.nest_zone_name} onChange={v => updateRoom(idx, { nest_zone_name: v })} />
                    </div>
                    <Separator className="bg-border/30" />
                    <div className="grid grid-cols-2 gap-3">
                      <NumInput label="Day target (°C)" value={room.day_target_temp_c} step={0.5} min={16} max={25} onChange={v => updateRoom(idx, { day_target_temp_c: v })} />
                      <NumInput label="Night target (°C)" value={room.target_temp_c} step={0.5} min={14} max={22} onChange={v => updateRoom(idx, { target_temp_c: v })} />
                      <NumInput label="Ceiling (°C)" value={room.max_temp_c} step={0.5} min={15} max={28} onChange={v => updateRoom(idx, { max_temp_c: v })} />
                      {room.nest_idle_temp_c != null && (
                        <NumInput label="Zone idle floor (°C)" value={room.nest_idle_temp_c} step={0.5} min={14} max={24} onChange={v => updateRoom(idx, { nest_idle_temp_c: v })} />
                      )}
                    </div>
                    <Separator className="bg-border/30" />
                    <div className="grid grid-cols-2 gap-3">
                      <NumInput label="Min TRV pos (%)" value={room.min_pos_pct} step={5} min={0} max={100} onChange={v => updateRoom(idx, { min_pos_pct: v })} />
                      <NumInput label="Night park pos (%)" value={room.night_pos_pct} step={5} min={0} max={100} onChange={v => updateRoom(idx, { night_pos_pct: v })} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
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

// ── Valve Test tab ────────────────────────────────────────────────────────────
const TEST_POSITIONS = [0, 25, 50, 75, 100];

interface TrvRow {
  room: string;
  trv: TrvDetail;
}

function ValveTest() {
  const [trvs, setTrvs] = useState<TrvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<Record<string, number | null>>({});
  const [results, setResults] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
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
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setValve(trv: TrvDetail, pos: number) {
    const key = trv.device_id;
    setSending(prev => ({ ...prev, [key]: pos }));
    setResults(prev => ({ ...prev, [key]: "" }));
    try {
      await api.setValve(trv.device_id, pos, trv.name);
      setResults(prev => ({ ...prev, [key]: `✓ Set to ${pos}%` }));
      setTimeout(() => setResults(prev => ({ ...prev, [key]: "" })), 3000);
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
        <Button size="sm" variant="outline" onClick={load} className="h-8 gap-1 flex-shrink-0">
          <RefreshCw className="h-3 w-3" /> Refresh
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
                    disabled={busy || !trv.connected}
                    className={[
                      "min-w-[52px] rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      trv.valve_pct === pos
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/50 bg-background text-muted-foreground hover:border-border hover:text-foreground",
                      (busy || !trv.connected) ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
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
          <TabsTrigger value="valves">Valve Test</TabsTrigger>
          <TabsTrigger value="cameras">Cameras</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
        </TabsList>

        <TabsContent value="heating"><HeatingConfig /></TabsContent>
        <TabsContent value="valves"><ValveTest /></TabsContent>
        <TabsContent value="cameras"><CameraSettings /></TabsContent>
        <TabsContent value="ai"><AiSettings /></TabsContent>
      </Tabs>
    </div>
  );
}
