"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Thermometer, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { RoomCard } from "@/components/RoomCard";
import type { HeatEngineStatus, RoomStatus } from "@/lib/supabase";

type NeoZone = {
  zone: string; hub: string; source: string;
  current_temp: number | null; set_temp: number | null;
  demand: boolean; offline: boolean; low_battery: boolean;
  away: boolean; window_open: boolean;
};

type NestZone = {
  device_id?: string; zone?: string; current_temp: number | null;
  set_temp?: number; hvac_status?: string; mode?: string;
};

// ── Unified zone row ──────────────────────────────────────────────────────────
function ZoneRow({ zone, onClick, expanded }: {
  zone: { name: string; source: string; current: number | null; target: number | null; demand: boolean; offline: boolean; detail: string };
  onClick: () => void; expanded: boolean;
}) {
  return (
    <tr className="border-b border-border/30 hover:bg-accent/10 cursor-pointer" onClick={onClick}>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
            zone.offline ? "bg-muted-foreground/30" : zone.demand ? "bg-red-400" : "bg-green-400"
          }`} />
          <span className="text-sm">{zone.name}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 hidden sm:table-cell">
        <Badge variant="outline" className="text-xs">{zone.source}</Badge>
      </td>
      <td className="px-3 py-2.5 tabular-nums text-right font-medium">
        {zone.current != null ? `${zone.current.toFixed(1)}°` : "—"}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-right text-muted-foreground">
        {zone.target != null ? `${zone.target.toFixed(1)}°` : "—"}
      </td>
      <td className="px-3 py-2.5 text-right">
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground inline" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground inline" />}
      </td>
    </tr>
  );
}

// ── All Zones tab ─────────────────────────────────────────────────────────────
function AllZones({ neoZones, nestZones, rooms }: { neoZones: NeoZone[]; nestZones: NestZone[]; rooms: RoomStatus[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const unified: Array<{ name: string; source: string; current: number | null; target: number | null; demand: boolean; offline: boolean; detail: string }> = [
    ...rooms.map(r => ({
      name: r.name, source: "Shelly TRV",
      current: r.current_temp, target: r.night_target_temp_c,
      demand: r.phase === "HEATING", offline: false,
      detail: r.reasoning,
    })),
    ...nestZones.map(n => ({
      name: n.zone ?? "—", source: "Nest",
      current: n.current_temp, target: n.set_temp ?? null,
      demand: n.hvac_status === "HEATING", offline: false,
      detail: `${n.hvac_status ?? "—"} · Mode: ${n.mode ?? "—"}`,
    })),
    ...neoZones.map(n => ({
      name: n.zone, source: n.source ?? "NeoHub",
      current: n.current_temp, target: n.set_temp,
      demand: n.demand, offline: n.offline,
      detail: `${n.demand ? "Calling for heat" : "Idle"}${n.offline ? " · OFFLINE" : ""}${n.low_battery ? " · Low battery" : ""}`,
    })),
  ];

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/20">
          <tr>
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Zone</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Source</th>
            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Current</th>
            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Target</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {unified.map(z => (
            <>
              <ZoneRow key={z.name} zone={z} expanded={expanded === z.name} onClick={() => setExpanded(expanded === z.name ? null : z.name)} />
              {expanded === z.name && (
                <tr key={`${z.name}-detail`} className="bg-muted/10">
                  <td colSpan={5} className="px-4 py-2 text-xs text-muted-foreground border-b border-border/30">
                    {z.detail || "No detail available"}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Nest tab ──────────────────────────────────────────────────────────────────
function NestTab({ zones, onSetTemp }: { zones: NestZone[]; onSetTemp: (deviceId: string, temp: number) => void }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState(20);
  const [saving, setSaving] = useState(false);

  async function save(deviceId: string, zoneName: string) {
    setSaving(true);
    try { await api.setNest(zoneName, editVal); setEditId(null); } finally { setSaving(false); }
  }

  if (!zones.length) return <p className="text-muted-foreground text-sm text-center py-12">No Nest thermostats found.</p>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {zones.map(z => (
        <div key={z.device_id ?? z.zone} className="rounded-xl border border-border/50 bg-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-sm">{z.zone ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {z.hvac_status ?? "—"} · {z.mode ?? "—"}
              </p>
            </div>
            <div className={`h-2.5 w-2.5 rounded-full mt-1 ${z.hvac_status === "HEATING" ? "bg-red-400" : "bg-green-400"}`} />
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-3xl font-semibold tabular-nums">{z.current_temp?.toFixed(1) ?? "—"}°</p>
              <p className="text-xs text-muted-foreground">Target: {z.set_temp?.toFixed(1) ?? "—"}°</p>
            </div>
            <div>
              {editId === (z.device_id ?? z.zone) ? (
                <div className="flex items-center gap-1.5">
                  <input type="number" value={editVal} onChange={e => setEditVal(Number(e.target.value))}
                    className="w-16 rounded border border-border/50 bg-background px-2 py-1 text-sm focus:outline-none"
                    min={15} max={30} step={0.5} />
                  <Button size="sm" className="h-7 text-xs" onClick={() => save(z.device_id ?? "", z.zone ?? "")} disabled={saving}>
                    {saving ? "…" : "Set"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditId(null)}>✕</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditId(z.device_id ?? z.zone ?? ""); setEditVal(z.set_temp ?? 20); }}>
                  Set temp
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── NeoHub tab ────────────────────────────────────────────────────────────────
function NeoHubTab({ zones }: { zones: NeoZone[] }) {
  if (!zones.length) return <p className="text-muted-foreground text-sm text-center py-12">No NeoHub zones found. Check NEOHUB_HOST is configured.</p>;

  const byHub: Record<string, NeoZone[]> = {};
  for (const z of zones) {
    if (!byHub[z.hub]) byHub[z.hub] = [];
    byHub[z.hub].push(z);
  }

  return (
    <div className="space-y-5">
      {Object.entries(byHub).map(([hub, hubZones]) => (
        <div key={hub}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{hub}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {hubZones.map(z => (
              <div key={z.zone} className={`rounded-xl border px-3 py-2.5 ${
                z.offline ? "border-muted-foreground/20 bg-muted/10 opacity-60" : z.demand ? "border-red-500/30 bg-red-500/10" : "border-border/40 bg-card"
              }`}>
                <p className="text-xs text-muted-foreground truncate">{z.zone}</p>
                <p className="text-xl font-semibold tabular-nums mt-0.5">
                  {z.current_temp?.toFixed(1) ?? "—"}°
                </p>
                <p className="text-xs text-muted-foreground">→ {z.set_temp?.toFixed(1) ?? "—"}°</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {z.demand && <Badge variant="outline" className="text-xs px-1 py-0 text-red-300 border-red-500/30">Calling</Badge>}
                  {z.offline && <Badge variant="outline" className="text-xs px-1 py-0 text-muted-foreground">Offline</Badge>}
                  {z.low_battery && <Badge variant="outline" className="text-xs px-1 py-0 text-yellow-300 border-yellow-500/30">🔋</Badge>}
                  {z.away && <Badge variant="outline" className="text-xs px-1 py-0 text-muted-foreground">Away</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Shelly tab ────────────────────────────────────────────────────────────────
function ShellyTab({ rooms, isNight, onValveSet }: { rooms: RoomStatus[]; isNight: boolean; onValveSet: () => void }) {
  const shellyRooms = rooms.filter(r => r.trvs?.length > 0);
  if (!shellyRooms.length) return <p className="text-muted-foreground text-sm text-center py-12">No Shelly TRV rooms found.</p>;
  return (
    <div className="space-y-3">
      {shellyRooms.map(room => (
        <RoomCard key={room.name} room={room} isNight={isNight} onValveSet={onValveSet} />
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ThermostatsPage() {
  const [heatStatus, setHeatStatus] = useState<HeatEngineStatus | null>(null);
  const [neoZones, setNeoZones] = useState<NeoZone[]>([]);
  const [nestZones, setNestZones] = useState<NestZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [rooms, neo] = await Promise.allSettled([api.rooms(), api.neohubZones()]);
      if (rooms.status === "fulfilled") {
        setHeatStatus(rooms.value);
        // Extract Nest zones from boilers data
        const boilers = rooms.value.boilers as Record<string, { setpoint_c: number; current_temp: number | null; hvac_status: string }>;
        const nest: NestZone[] = Object.entries(boilers).map(([zone, b]) => ({
          zone,
          current_temp: b.current_temp,
          set_temp: b.setpoint_c,
          hvac_status: b.hvac_status,
        }));
        setNestZones(nest);
      }
      if (neo.status === "fulfilled") setNeoZones(neo.value.zones ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 60_000); return () => clearInterval(t); }, [fetchAll]);

  const rooms = heatStatus?.rooms ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Thermometer className="h-5 w-5 text-blue-400" />
          <h1 className="font-semibold text-lg">Thermostats</h1>
          {!loading && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {rooms.length + nestZones.length + neoZones.length} zones
            </Badge>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setRefreshing(true); fetchAll(); }} disabled={refreshing}>
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-muted/30 animate-pulse" />)}</div>
      ) : (
        <Tabs defaultValue="all">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All Zones</TabsTrigger>
            <TabsTrigger value="nest">Nest ({nestZones.length})</TabsTrigger>
            <TabsTrigger value="shelly">Shelly TRVs ({rooms.filter(r => r.trvs?.length > 0).length})</TabsTrigger>
            <TabsTrigger value="neohub">NeoHub ({neoZones.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <AllZones neoZones={neoZones} nestZones={nestZones} rooms={rooms} />
          </TabsContent>
          <TabsContent value="nest">
            <NestTab zones={nestZones} onSetTemp={() => fetchAll()} />
          </TabsContent>
          <TabsContent value="shelly">
            <ShellyTab rooms={rooms} isNight={heatStatus?.is_night ?? false} onValveSet={fetchAll} />
          </TabsContent>
          <TabsContent value="neohub">
            <NeoHubTab zones={neoZones} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
