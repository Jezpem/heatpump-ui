"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, RefreshCw, ZoomIn, ZoomOut, ExternalLink } from "lucide-react";

// Local NVR (via Tailscale) — all Protect API calls go here
const NVR_URL = (process.env.NEXT_PUBLIC_UNIFI_NVR_URL ?? "https://tvr").replace(/\/$/, "");
const UNIFI_KEY = process.env.NEXT_PUBLIC_UNIFI_API_KEY ?? "";
const UNIFI_PTZ_ID = process.env.NEXT_PUBLIC_UNIFI_PTZ_CAMERA_ID ?? "";
const UNIFI_TURRET_ID = process.env.NEXT_PUBLIC_UNIFI_CAMERA_ID ?? "";

// Direct camera IP for live view (on local subnet / Tailscale)
const PTZ_IP = process.env.NEXT_PUBLIC_UNIFI_PTZ_IP ?? "10.10.200.81";

// UniFi Share Link for WebRTC live stream (preferred over snapshot polling)
const SHARE_URL = process.env.NEXT_PUBLIC_UNIFI_SHARE_URL ?? "";

function nvrUrl(path: string) {
  return `${NVR_URL}/proxy/protect/api/${path}`;
}

function nvrHeaders(accept = "application/json") {
  return {
    Authorization: `Bearer ${UNIFI_KEY}`,
    Accept: accept,
  };
}

async function nvrPost(path: string, body: object): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const r = await fetch(nvrUrl(path), {
      method: "POST",
      headers: { ...nvrHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

// ── PTZ Controls ─────────────────────────────────────────────────────────────
const STEPS = {
  sm: { p: 500, t: 300, z: 50 },
  md: { p: 1500, t: 800, z: 150 },
  lg: { p: 4000, t: 2000, z: 400 },
  xl: { p: 12000, t: 6000, z: 1200 },
};
type StepKey = keyof typeof STEPS;

function PtzControls({ presets }: { presets: Array<{ name: string; slot: number }> }) {
  const [step, setStep] = useState<StepKey>("md");
  const [status, setStatus] = useState("");
  const s = STEPS[step];

  async function ptzCall(type: string, payload: object) {
    setStatus("↗ sending…");
    let result: { ok: boolean; status: number; error?: string };

    try {
      await api.cameraPtz(type, payload);
      result = { ok: true, status: 200 };
    } catch (e) {
      result = { ok: false, status: 0, error: String(e) };
    }

    setStatus(result.ok ? "✓" : `⚠ ${result.status || result.error || "error"}`);
    setTimeout(() => setStatus(""), 2000);
  }

  async function move(panPos: number, tiltPos: number) {
    await ptzCall("relative", { panPos, tiltPos, panSpeed: 50, tiltSpeed: 50 });
  }

  async function zoom(dir: number) {
    await ptzCall("zoom", { zoomPos: dir * s.z, zoomSpeed: 50 });
  }

  async function center() {
    await ptzCall("center", {});
  }

  async function goPreset(slot: number) {
    await ptzCall("preset", { slot });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowLeft") { e.preventDefault(); move(-s.p, 0); }
      if (e.key === "ArrowRight") { e.preventDefault(); move(s.p, 0); }
      if (e.key === "ArrowUp") { e.preventDefault(); move(0, s.t); }
      if (e.key === "ArrowDown") { e.preventDefault(); move(0, -s.t); }
      if (e.key === "h" || e.key === "H") center();
      if (e.key === "+" || e.key === "=") zoom(-1);
      if (e.key === "-") zoom(1);
      if (e.key === "1" && presets[0]) goPreset(presets[0].slot);
      if (e.key === "2" && presets[1]) goPreset(presets[1].slot);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, presets]); // eslint-disable-line

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">PTZ Controls</p>
        <div className="flex items-center gap-2">
          {status && <span className="text-xs text-muted-foreground">{status}</span>}
          <select value={step} onChange={e => setStep(e.target.value as StepKey)}
            className="text-xs rounded border border-border/50 bg-background px-2 py-1 text-foreground">
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
            <option value="xl">X-Large</option>
          </select>
        </div>
      </div>

      {/* D-pad */}
      <div className="grid grid-cols-3 gap-1.5 w-32 mx-auto">
        <div />
        <button onClick={() => move(0, s.t)}
          className="rounded bg-muted/50 hover:bg-muted py-2 text-sm font-bold text-center transition-colors">▲</button>
        <div />
        <button onClick={() => move(-s.p, 0)}
          className="rounded bg-muted/50 hover:bg-muted py-2 text-sm font-bold text-center transition-colors">◀</button>
        <button onClick={center}
          className="rounded bg-muted/50 hover:bg-muted py-2 text-xs text-center transition-colors">⌂</button>
        <button onClick={() => move(s.p, 0)}
          className="rounded bg-muted/50 hover:bg-muted py-2 text-sm font-bold text-center transition-colors">▶</button>
        <div />
        <button onClick={() => move(0, -s.t)}
          className="rounded bg-muted/50 hover:bg-muted py-2 text-sm font-bold text-center transition-colors">▼</button>
        <div />
      </div>

      {/* Zoom */}
      <div className="flex gap-2 justify-center">
        <button onClick={() => zoom(1)} className="flex items-center gap-1 rounded bg-muted/50 hover:bg-muted px-3 py-1.5 text-xs transition-colors">
          <ZoomOut className="h-3 w-3" /> Zoom Out
        </button>
        <button onClick={() => zoom(-1)} className="flex items-center gap-1 rounded bg-muted/50 hover:bg-muted px-3 py-1.5 text-xs transition-colors">
          <ZoomIn className="h-3 w-3" /> Zoom In
        </button>
      </div>

      {/* Presets */}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {presets.map(p => (
            <button key={p.slot} onClick={() => goPreset(p.slot)}
              className="rounded-full border border-border/50 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
              📍 {p.name}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground text-center">Arrow keys · H = home · +/- = zoom · 1/2 = presets</p>
    </div>
  );
}

// ── Live PTZ view — WebRTC share link (preferred) or snapshot feed fallback ──
function PtzLiveView() {
  const [mode, setMode] = useState<"stream" | "snapshots">(SHARE_URL ? "stream" : "snapshots");
  const [src, setSrc] = useState<string | null>(null);
  const [ts, setTs] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);

  const fetchSnap = useCallback(async () => {
    if (mode !== "snapshots") return;
    if (NVR_URL && UNIFI_KEY && UNIFI_PTZ_ID) {
      try {
        const r = await fetch(nvrUrl(`cameras/${UNIFI_PTZ_ID}/snapshot?ts=${Date.now()}`), {
          headers: nvrHeaders("image/jpeg"),
        });
        if (r.ok) {
          const blob = await r.blob();
          const objUrl = URL.createObjectURL(blob);
          setSrc(objUrl);
          setTs(new Date().toLocaleTimeString("en-GB"));
          setErr(null);
          if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
          prevUrl.current = objUrl;
          return;
        } else {
          setErr(`NVR ${r.status}`);
        }
      } catch (e) {
        setErr(String(e));
      }
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "snapshots") return;
    fetchSnap();
    const t = setInterval(fetchSnap, 3000);
    return () => {
      clearInterval(t);
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    };
  }, [fetchSnap, mode]);

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">G5 PTZ — Live</span>
          {mode === "stream" && <Badge variant="outline" className="text-xs text-green-400 border-green-500/30">WebRTC</Badge>}
          {mode === "snapshots" && src && !err && <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30">Snapshots</Badge>}
          {mode === "snapshots" && err && <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">{err}</Badge>}
        </div>
        <div className="flex items-center gap-3">
          {SHARE_URL && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => setMode(m => m === "stream" ? "snapshots" : "stream")}
            >
              {mode === "stream" ? "Snapshots" : "Live Stream"}
            </Button>
          )}
          {mode === "snapshots" && ts && <span className="text-xs text-muted-foreground">{ts}</span>}
          <a
            href={SHARE_URL || `http://${PTZ_IP}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ExternalLink className="h-3 w-3" /> Open camera
          </a>
        </div>
      </div>
      {mode === "stream" ? (
        <iframe
          src={SHARE_URL}
          className="w-full border-0"
          style={{ height: 420 }}
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      ) : src ? (
        <img src={src} className="w-full object-cover" style={{ height: 420 }} alt="PTZ Live" />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 bg-muted/20" style={{ height: 420 }}>
          {err ? (
            <>
              <Camera className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {UNIFI_KEY ? `Cannot reach NVR (${err}) — make sure Tailscale is connected` : "Set NEXT_PUBLIC_UNIFI_API_KEY"}
              </p>
              <a href={`http://${PTZ_IP}`} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="gap-1">
                  <ExternalLink className="h-3 w-3" /> Open camera directly at {PTZ_IP}
                </Button>
              </a>
            </>
          ) : (
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground/50" />
          )}
        </div>
      )}
    </div>
  );
}

// ── Turret camera (snapshot feed from NVR) ────────────────────────────────────
function TurretCamera() {
  const [src, setSrc] = useState<string | null>(null);
  const [ts, setTs] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);

  const fetchSnap = useCallback(async () => {
    if (!UNIFI_TURRET_ID) return;

    // Try NVR via Tailscale
    if (NVR_URL && UNIFI_KEY) {
      try {
        const r = await fetch(nvrUrl(`cameras/${UNIFI_TURRET_ID}/snapshot?ts=${Date.now()}`), {
          headers: nvrHeaders("image/jpeg"),
        });
        if (r.ok) {
          const blob = await r.blob();
          const objUrl = URL.createObjectURL(blob);
          setSrc(objUrl);
          setTs(new Date().toLocaleTimeString("en-GB"));
          if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
          prevUrl.current = objUrl;
          return;
        }
      } catch { /* fall through */ }
    }

    // Railway proxy fallback
    try {
      const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
      const SEC = process.env.NEXT_PUBLIC_API_SECRET ?? "";
      const r = await fetch(`${BASE}/api/cameras/snapshot/${UNIFI_TURRET_ID}?t=${Date.now()}`, {
        headers: SEC ? { Authorization: `Bearer ${SEC}` } : {},
      });
      if (!r.ok) return;
      const blob = await r.blob();
      const objUrl = URL.createObjectURL(blob);
      setSrc(objUrl);
      setTs(new Date().toLocaleTimeString("en-GB"));
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
      prevUrl.current = objUrl;
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchSnap();
    const t = setInterval(fetchSnap, 5000);
    return () => {
      clearInterval(t);
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    };
  }, [fetchSnap]);

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
        <span className="text-sm font-medium">G5 Turret Ultra</span>
        {ts && <span className="text-xs text-muted-foreground">{ts}</span>}
      </div>
      {src ? (
        <img src={src} className="w-full" alt="G5 Turret" />
      ) : (
        <div className="flex items-center justify-center bg-muted/20" style={{ height: 200 }}>
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground/50" />
        </div>
      )}
    </div>
  );
}

// ── Gauge snapshot card ───────────────────────────────────────────────────────
type SnapRow = { preset?: number; camera_id?: string; snapshot_b64?: string; annotation?: string; taken_at?: string };

function GaugeCard({ snap, onRefresh }: { snap: SnapRow; onRefresh: (preset: number) => void }) {
  const [snapping, setSnapping] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const age = snap.taken_at
    ? Math.round((Date.now() - new Date(snap.taken_at).getTime()) / 60000)
    : null;

  async function handleSnap() {
    if (snap.preset == null) return;
    setSnapping(true);
    try { await onRefresh(snap.preset); } finally { setSnapping(false); }
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      {snap.snapshot_b64 ? (
        <img src={`data:image/jpeg;base64,${snap.snapshot_b64}`}
          className="w-full object-cover" style={{ height: 180 }} alt={`Preset ${snap.preset}`} />
      ) : (
        <div className="w-full bg-muted/20 flex items-center justify-center" style={{ height: 180 }}>
          <Camera className="h-8 w-8 text-muted-foreground/30" />
        </div>
      )}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Preset {snap.preset ?? snap.camera_id}</span>
          <div className="flex items-center gap-1.5">
            {age != null && <span className="text-xs text-muted-foreground">{age}min ago</span>}
            <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-0.5" onClick={handleSnap} disabled={snapping}>
              {snapping ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Snap"}
            </Button>
          </div>
        </div>
        {snap.annotation && (
          <div>
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setExpanded(e => !e)}>
              {expanded ? "Hide" : "Show"} AI reading
            </button>
            {expanded && (
              <p className="text-xs text-foreground/70 mt-1 leading-relaxed bg-muted/20 rounded px-2 py-1.5">
                {snap.annotation}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CamerasPage() {
  const [snapshots, setSnapshots] = useState<SnapRow[]>([]);
  const [snappingAll, setSnappingAll] = useState(false);

  const PRESETS = [
    { name: process.env.NEXT_PUBLIC_UNIFI_PRESET_0 ?? "Overview", slot: 0 },
    { name: process.env.NEXT_PUBLIC_UNIFI_PRESET_1 ?? "Gauges", slot: 1 },
    { name: process.env.NEXT_PUBLIC_UNIFI_PRESET_2 ?? "Pumps", slot: 2 },
    { name: process.env.NEXT_PUBLIC_UNIFI_PRESET_3 ?? "Buffer", slot: 3 },
  ];

  const fetchSnapshots = useCallback(async () => {
    try {
      const data = await api.cameraSnapshots();
      setSnapshots(data.snapshots ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  async function snapPreset(preset: number) {
    await api.cameraSnap(preset);
    await fetchSnapshots();
  }

  async function snapAll() {
    setSnappingAll(true);
    const presetNums = snapshots.map(s => s.preset).filter((p): p is number => p != null);
    for (const p of presetNums.length ? presetNums : [0, 1, 2, 3]) {
      await snapPreset(p);
    }
    setSnappingAll(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-blue-400" />
          <h1 className="font-semibold text-lg">Cameras</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          Via Tailscale → tvr
        </div>
      </div>

      {/* PTZ Live + Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PtzLiveView />
        </div>
        <div>
          <PtzControls presets={PRESETS} />
        </div>
      </div>

      {/* Gauge snapshots */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">Gauge Snapshots</p>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={snapAll} disabled={snappingAll}>
            {snappingAll ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
            {snappingAll ? "Snapping…" : "Snap All"}
          </Button>
        </div>
        {snapshots.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-muted/20 flex flex-col items-center justify-center py-12 gap-3">
            <Camera className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No snapshots yet.</p>
            <Button size="sm" onClick={snapAll}>Snap all presets now</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {snapshots.map((snap, i) => (
              <GaugeCard key={`${snap.preset}-${i}`} snap={snap} onRefresh={snapPreset} />
            ))}
          </div>
        )}
      </div>

      {/* Turret */}
      {UNIFI_TURRET_ID && (
        <div className="max-w-lg">
          <TurretCamera />
        </div>
      )}
    </div>
  );
}
