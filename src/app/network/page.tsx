"use client";
import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Network, RefreshCw, CheckCircle2, XCircle, Wifi, WifiOff,
  Activity, Server, Camera, Thermometer, Radio, Send,
} from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const SECRET = process.env.NEXT_PUBLIC_API_SECRET ?? "";
const AUTH_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  ...(SECRET ? { Authorization: `Bearer ${SECRET}` } : {}),
};

async function apiFetch(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: AUTH_HEADERS });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────
type CheckResult = {
  name: string;
  group: string;
  ok: boolean;
  ms?: number;
  status?: number;
  detail?: string;
  error?: string;
};

type GroupSummary = { total: number; ok: number };

type CheckData = {
  checks: CheckResult[];
  groups: Record<string, GroupSummary>;
  all_ok: boolean;
  ts: string;
};

type Peer = {
  hostname: string;
  dns_name: string;
  ips: string[];
  online: boolean;
  active: boolean;
  relay: string;
  rx_bytes: number;
  tx_bytes: number;
};

type TsStatus = {
  tailscale_available: boolean;
  connected: boolean;
  backend_state?: string;
  self?: { hostname: string; ips: string[]; dns_name: string; relay: string };
  peers?: Peer[];
  peer_count?: number;
  error?: string;
  plain?: string;
  ts: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBytes(b: number) {
  if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b > 1e3) return `${(b / 1e3).toFixed(0)} KB`;
  return `${b} B`;
}

const GROUP_META: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  infrastructure:  { label: "Infrastructure",   Icon: Server,      color: "text-violet-400" },
  heat_pump:       { label: "Heat Pump",         Icon: Activity,    color: "text-orange-400" },
  cameras:         { label: "Cameras / NVR",     Icon: Camera,      color: "text-blue-400"   },
  shelly:          { label: "Shelly Gateways",   Icon: Radio,       color: "text-green-400"  },
  home_assistant:  { label: "Home Assistant",    Icon: Network,     color: "text-rose-400"   },
  thermostats:     { label: "Thermostats",       Icon: Thermometer, color: "text-cyan-400"   },
};

function StatusDot({ ok, ms }: { ok: boolean; ms?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {ok
        ? <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
        : <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />}
      {ms != null && (
        <span className={`text-xs tabular-nums ${ok ? "text-muted-foreground" : "text-red-400"}`}>
          {ms}ms
        </span>
      )}
    </div>
  );
}

function GroupCard({ group, checks }: { group: string; checks: CheckResult[] }) {
  const meta = GROUP_META[group] ?? { label: group, Icon: Network, color: "text-muted-foreground" };
  const { Icon } = meta;
  const allOk = checks.every(c => c.ok);
  const okCount = checks.filter(c => c.ok).length;

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${meta.color}`} />
          <span className="text-sm font-medium">{meta.label}</span>
        </div>
        <Badge
          variant="outline"
          className={`text-xs ${allOk ? "text-green-400 border-green-500/30" : okCount === 0 ? "text-red-400 border-red-500/30" : "text-amber-400 border-amber-500/30"}`}
        >
          {okCount}/{checks.length}
        </Badge>
      </div>
      <div className="divide-y divide-border/30">
        {checks.map((c, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5 gap-3">
            <div className="min-w-0">
              <p className="text-sm truncate">{c.name}</p>
              {(c.error || c.detail) && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {c.error ?? c.detail}
                </p>
              )}
              {c.status != null && (
                <p className="text-xs text-muted-foreground mt-0.5">HTTP {c.status}</p>
              )}
            </div>
            <StatusDot ok={c.ok} ms={c.ms} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Peer card ─────────────────────────────────────────────────────────────────
function PeerRow({ peer }: { peer: Peer }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0 gap-3 px-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${peer.online ? "bg-green-500" : "bg-muted-foreground/40"}`} />
          <span className="text-sm font-medium truncate">{peer.hostname}</span>
          {peer.active && <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30 py-0">active</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 pl-4">{peer.ips.join(", ")}</p>
        {peer.relay && <p className="text-xs text-muted-foreground pl-4">via relay: {peer.relay}</p>}
      </div>
      <div className="text-right text-xs text-muted-foreground flex-shrink-0 space-y-0.5">
        <p>↑ {fmtBytes(peer.tx_bytes)}</p>
        <p>↓ {fmtBytes(peer.rx_bytes)}</p>
      </div>
    </div>
  );
}

const KNOWN_HOSTS = [
  { label: "NVR (tvr)", host: "tvr.tail985db7.ts.net" },
  { label: "PTZ Camera", host: "10.10.200.81" },
  { label: "Home Assistant", host: "10.10.200.49" },
  { label: "Shelly GW 1", host: "10.10.200.105" },
  { label: "Shelly GW 2", host: "10.10.200.114" },
  { label: "Shelly GW 3", host: "10.10.200.131" },
  { label: "Pi (Tailscale)", host: "100.69.9.65" },
];

// ── Manual ping tool ──────────────────────────────────────────────────────────
function PingTool() {
  const [host, setHost] = useState("tvr");
  const [useTailscale, setUseTailscale] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function doPing() {
    if (!host.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch(`${BASE}/api/network/ping`, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({ host: host.trim(), count: 3, use_tailscale: useTailscale }),
      });
      setResult(await r.json());
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  const ok = result?.ok as boolean | undefined;

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ping from Railway</p>
      <div className="flex gap-2">
        <input
          value={host}
          onChange={e => setHost(e.target.value)}
          onKeyDown={e => e.key === "Enter" && doPing()}
          placeholder="hostname or IP…"
          className="flex-1 rounded-md border border-border/50 bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button size="sm" onClick={doPing} disabled={loading || !host.trim()} className="gap-1">
          {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Ping
        </Button>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <input type="checkbox" checked={useTailscale} onChange={e => setUseTailscale(e.target.checked)}
          className="rounded" />
        Use Tailscale ping (preferred)
      </label>
      {result && (
        <div className={`rounded-lg px-3 py-2.5 text-xs font-mono space-y-1 ${ok ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
          <div className="flex items-center gap-2">
            {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}
            <span className={ok ? "text-green-400" : "text-red-400"}>
              {ok ? "reachable" : "unreachable"}
              {(result.avg_ms as number) != null ? ` · ${result.avg_ms}ms avg` : ""}
            </span>
          </div>
          {result.output != null && (
            <pre className="text-muted-foreground whitespace-pre-wrap break-all leading-relaxed">
              {String(result.output)}
            </pre>
          )}
          {result.error != null && <p className="text-red-400">{String(result.error)}</p>}
        </div>
      )}

      {/* Known hosts shortcuts */}
      <div className="space-y-1 pt-1">
        <p className="text-xs text-muted-foreground">Quick targets:</p>
        <div className="flex flex-wrap gap-1.5">
          {KNOWN_HOSTS.map(({ label, host: h }) => (
            <button
              key={h}
              onClick={() => setHost(h)}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                host === h
                  ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                  : "border-border/50 text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NetworkPage() {
  const [checks, setChecks] = useState<CheckData | null>(null);
  const [tsStatus, setTsStatus] = useState<TsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [checkData, tsData] = await Promise.allSettled([
      apiFetch("/api/network/check"),
      apiFetch("/api/network/status"),
    ]);
    if (checkData.status === "fulfilled") setChecks(checkData.value);
    if (tsData.status === "fulfilled") setTsStatus(tsData.value);
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30_000);
    return () => clearInterval(t);
  }, [fetchAll]);

  // Group checks by group key
  const grouped = checks
    ? Object.entries(
        checks.checks.reduce<Record<string, CheckResult[]>>((acc, c) => {
          (acc[c.group] ??= []).push(c);
          return acc;
        }, {})
      )
    : [];

  const groupOrder = ["infrastructure", "heat_pump", "cameras", "shelly", "home_assistant", "thermostats"];
  const sortedGroups = grouped.sort(([a], [b]) =>
    (groupOrder.indexOf(a) ?? 99) - (groupOrder.indexOf(b) ?? 99)
  );

  const tsConnected = tsStatus?.connected;
  const selfIp = tsStatus?.self?.ips?.[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-violet-400" />
          <h1 className="font-semibold text-lg">Network</h1>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-muted-foreground">
              Updated {lastUpdate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tailscale banner */}
      <div className={`rounded-xl border p-4 flex items-start gap-4 ${tsConnected ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
        {tsConnected
          ? <Wifi className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
          : <WifiOff className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">
              {tsConnected ? "Tailscale tunnel up" : tsStatus ? "Tailscale not connected" : "Checking Tailscale…"}
            </span>
            {tsStatus?.backend_state && (
              <Badge variant="outline" className={`text-xs ${tsConnected ? "text-green-400 border-green-500/30" : "text-red-400 border-red-500/30"}`}>
                {tsStatus.backend_state}
              </Badge>
            )}
          </div>
          {tsConnected && tsStatus?.self && (
            <p className="text-xs text-muted-foreground mt-1">
              Railway node: <span className="text-foreground font-mono">{tsStatus.self.hostname}</span>
              {selfIp && <> · IP <span className="font-mono">{selfIp}</span></>}
              {tsStatus.self.relay && <> · relay: {tsStatus.self.relay}</>}
            </p>
          )}
          {tsStatus?.error && <p className="text-xs text-red-400 mt-1">{tsStatus.error}</p>}
          {tsStatus?.plain && !tsConnected && (
            <pre className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{tsStatus.plain.slice(0, 200)}</pre>
          )}
        </div>
        {checks && (
          <div className="text-right flex-shrink-0">
            <p className={`text-2xl font-bold tabular-nums ${checks.all_ok ? "text-green-400" : "text-amber-400"}`}>
              {checks.checks.filter(c => c.ok).length}/{checks.checks.length}
            </p>
            <p className="text-xs text-muted-foreground">services up</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Service checks — left 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          {loading && !checks && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 rounded-xl bg-muted/30 animate-pulse" />
              ))}
            </div>
          )}
          {sortedGroups.map(([group, groupChecks]) => (
            <GroupCard key={group} group={group} checks={groupChecks} />
          ))}
        </div>

        {/* Right col — Tailscale peers + ping tool */}
        <div className="space-y-4">
          <PingTool />

          {/* Tailscale peers */}
          {tsStatus?.peers && tsStatus.peers.length > 0 && (
            <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-violet-400" />
                  <span className="text-sm font-medium">Tailscale Peers</span>
                </div>
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {tsStatus.peers.filter(p => p.online).length}/{tsStatus.peers.length} online
                </Badge>
              </div>
              <div className="divide-y divide-border/30">
                {tsStatus.peers.map((peer, i) => (
                  <PeerRow key={i} peer={peer} />
                ))}
              </div>
            </div>
          )}

          {/* Quick host shortcuts — rendered inside PingTool via prop */}
        </div>
      </div>
    </div>
  );
}
