"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, RefreshCw, ZoomIn, ZoomOut, Home as HomeIcon } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const SHARE_URL = process.env.NEXT_PUBLIC_UNIFI_SHARE_URL ?? "";

// Direct UniFi API helpers (client-side — key is NEXT_PUBLIC so it's in the browser bundle)
const UNIFI_KEY = process.env.NEXT_PUBLIC_UNIFI_API_KEY ?? "";
const UNIFI_NVR = process.env.NEXT_PUBLIC_UNIFI_NVR_HOST_ID ?? "";
const UNIFI_PTZ_ID = process.env.NEXT_PUBLIC_UNIFI_PTZ_CAMERA_ID ?? "";

function unifiUrl(path: string) {
  const enc = encodeURIComponent(UNIFI_NVR);
  return `https://api.ui.com/v1/connector/consoles/${enc}/proxy/protect/api/${path}`;
}

async function unifiPost(path: string, body: object): Promise<{ ok: boolean; status: number }> {
  const r = await fetch(unifiUrl(path), {
    method: "POST",
    headers: { "X-API-Key": UNIFI_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, status: r.status };
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
    if (!UNIFI_KEY || !UNIFI_NVR || !UNIFI_PTZ_ID) {
      // Fallback: go through Railway proxy
      try {
        await api.cameraPtz(type, payload);
        setStatus("✓");
      } catch { setStatus("⚠ error"); }
      return;
    }
    const result = await unifiPost(`cameras/${UNIFI_PTZ_ID}/move`, { type, payload });
    setStatus(result.ok ? "✓" : `⚠ ${result.status}`);
  }

  async function move(panPos: number, tiltPos: number) {
    setStatus("↗ sending…");
    await ptzCall("relative", { panPos, tiltPos, panSpeed: 50, tiltSpeed: 50 });
    setTimeout(() => setStatus(""), 1800);
  }

  async function zoom(dir: number) {
    setStatus("↗ sending…");
    await ptzCall("zoom", { zoomPos: dir * s.z, zoomSpeed: 50 });
    setTimeout(() => setStatus(""), 1800);
  }

  async function center() {
    setStatus("↗ sending…");
    await ptzCall("center", {});
    setTimeout(() => setStatus(""), 1800);
  }

  async function goPreset(slot: number) {
    setStatus("↗ sending…");
    await ptzCall("preset", { slot });
    setTimeout(() => setStatus(""), 1800);
  }

  // Keyboard bindings
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
  }, [step, presets]);  // eslint-disable-line

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

const UNIFI_TURRET_ID = process.env.NEXT_PUBLIC_UNIFI_CAMERA_ID ?? "";

// ── Turret camera ─────────────────────────────────────────────────────────────
function TurretCamera() {
  const [src, setSrc] = useState<string | null>(null);
  const [ts, setTs] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);

  const fetchSnap = useCallback(async () => {
    // Prefer direct UniFi API call; fall back to Railway proxy
    let res: Response | null = null;
    if (UNIFI_KEY && UNIFI_NVR && UNIFI_TURRET_ID) {
      try {
        res = await fetch(unifiUrl(`cameras/${UNIFI_TURRET_ID}/snapshot?ts=${Date.now()}`), {
          headers: { "X-API-Key": UNIFI_KEY, Accept: "image/jpeg" },
        });
      } catch { res = null; }
    }
    if (!res || !res.ok) {
      // Railway proxy fallback
      try {
        res = await fetch(`${BASE}/api/cameras/snapshot/${UNIFI_TURRET_ID}?t=${Date.now()}`);
      } catch { return; }
    }
    if (!res || !res.ok) return;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    setSrc(objUrl);
    setTs(new Date().toLocaleTimeString("en-GB"));
    if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    prevUrl.current = objUrl;
  }, []);

  useEffect(() => {
    fetchSnap();
    const t = setInterval(fetchSnap, 5000);
    return () => { clearInterval(t); if (prevUrl.current) URL.revokeObjectURL(prevUrl.current); };
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CamerasPage() {
  const [snapshots, setSnapshots] = useState<SnapRow[]>([]);
  const [snappingAll, setSnappingAll] = useState(false);

  const PRESETS = [
    { name: process.env.NEXT_PUBLIC_UNIFI_PRESET_0 ?? "Preset 0", slot: 0 },
    { name: process.env.NEXT_PUBLIC_UNIFI_PRESET_1 ?? "Preset 1", slot: 1 },
    { name: process.env.NEXT_PUBLIC_UNIFI_PRESET_2 ?? "Preset 2", slot: 2 },
    { name: process.env.NEXT_PUBLIC_UNIFI_PRESET_3 ?? "Preset 3", slot: 3 },
  ].filter(p => !p.name.startsWith("Preset ") || snapshots.some(s => s.preset === p.slot));

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
      </div>

      {/* PTZ Live + Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {SHARE_URL ? (
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
                <span className="text-sm font-medium">G5 PTZ — Live</span>
                <Badge variant="outline" className="text-xs text-green-400 border-green-500/30">Live</Badge>
              </div>
              <iframe src={SHARE_URL} className="w-full" style={{ height: 420 }} title="PTZ Camera Live" allow="autoplay" />
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-muted/20 flex items-center justify-center text-muted-foreground text-sm" style={{ height: 420 }}>
              Set NEXT_PUBLIC_UNIFI_SHARE_URL to enable live stream
            </div>
          )}
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
