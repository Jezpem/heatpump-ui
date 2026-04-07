"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, RefreshCw, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Info } from "lucide-react";

// ── Valve map data ────────────────────────────────────────────────────────────
const VALVES = [
  { n: 1,  desc: "Brine fill set",                           circuit: "brine",     zone: "primary" },
  { n: 2,  desc: "Brine return to heat pump",                circuit: "brine",     zone: "primary" },
  { n: 3,  desc: "Brine fill set",                           circuit: "brine",     zone: "primary" },
  { n: 4,  desc: "Brine pump valve",                         circuit: "brine",     zone: "primary" },
  { n: 5,  desc: "Brine pump valve",                         circuit: "brine",     zone: "primary" },
  { n: 6,  desc: "Brine flow to ground loops",               circuit: "brine",     zone: "primary" },
  { n: 7,  desc: "Charge pump valve",                        circuit: "primary",   zone: "primary" },
  { n: 8,  desc: "Charge pump valve",                        circuit: "primary",   zone: "primary" },
  { n: 9,  desc: "Brine fill set",                           circuit: "brine",     zone: "primary" },
  { n: 10, desc: "Common return to heat pump (filter)",      circuit: "primary",   zone: "primary" },
  { n: 11, desc: "DHW cylinder return to heat pump",         circuit: "dhw",       zone: "primary" },
  { n: 12, desc: "Heat pump flow to DHW cylinder",           circuit: "dhw",       zone: "primary" },
  { n: 13, desc: "Heat pump flow to heating buffer",         circuit: "heating",   zone: "primary" },
  { n: 14, desc: "Heating buffer return to heat pump",       circuit: "heating",   zone: "primary" },
  { n: 15, desc: "Spare",                                    circuit: "unknown",   zone: "unknown" },
  { n: 16, desc: "Main house secondary return pump valve",   circuit: "heating",   zone: "Main house" },
  { n: 17, desc: "Main house secondary return pump valve",   circuit: "heating",   zone: "Main house" },
  { n: 18, desc: "Hot water flow to main house",             circuit: "dhw",       zone: "Main house" },
  { n: 19, desc: "Heating return from main house",           circuit: "heating",   zone: "Main house" },
  { n: 20, desc: "Heating flow to main house",               circuit: "heating",   zone: "Main house" },
  { n: 21, desc: "Hot water flow to annex",                  circuit: "dhw",       zone: "Annex" },
  { n: 22, desc: "Heating return from annex",                circuit: "heating",   zone: "Annex" },
  { n: 23, desc: "Heating flow to annex",                    circuit: "heating",   zone: "Annex" },
  { n: 24, desc: "Heating return from outbuilding",          circuit: "heating",   zone: "Outbuilding" },
  { n: 25, desc: "Heating flow to outbuilding",              circuit: "heating",   zone: "Outbuilding" },
  { n: 26, desc: "Secondary return pump for outbuilding",    circuit: "heating",   zone: "Outbuilding" },
  { n: 27, desc: "Hot water flow to outbuilding",            circuit: "dhw",       zone: "Outbuilding" },
  { n: 28, desc: "Pool heating return",                      circuit: "pool",      zone: "Pool" },
  { n: 29, desc: "Heating flow to pool",                     circuit: "pool",      zone: "Pool" },
  { n: 30, desc: "Secondary return pump for annex",          circuit: "heating",   zone: "Annex" },
  { n: 31, desc: "Secondary return pump for annex",          circuit: "heating",   zone: "Annex" },
  { n: 32, desc: "Secondary return pump for outbuilding",    circuit: "heating",   zone: "Outbuilding" },
  { n: 33, desc: "Spare",                                    circuit: "unknown",   zone: "unknown" },
  { n: 34, desc: "Boosted cold water to annex",              circuit: "cold_water",zone: "Annex" },
  { n: 35, desc: "Boosted cold water to outbuilding",        circuit: "cold_water",zone: "Outbuilding" },
  { n: 36, desc: "Boosted cold water to outbuilding",        circuit: "cold_water",zone: "Outbuilding" },
  { n: 37, desc: "Boosted cold water to tack room",          circuit: "cold_water",zone: "Tack room" },
];

const CIRCUIT_COLORS: Record<string, string> = {
  brine: "text-blue-300 border-blue-500/30 bg-blue-500/10",
  primary: "text-orange-300 border-orange-500/30 bg-orange-500/10",
  heating: "text-red-300 border-red-500/30 bg-red-500/10",
  dhw: "text-cyan-300 border-cyan-500/30 bg-cyan-500/10",
  pool: "text-green-300 border-green-500/30 bg-green-500/10",
  cold_water: "text-sky-300 border-sky-500/30 bg-sky-500/10",
  unknown: "text-muted-foreground border-border/30 bg-muted/20",
};

// ── Diagnostics tab ───────────────────────────────────────────────────────────
type Issue = { severity: string; title: string; description: string; actions: string[]; fault_stage: number };

const SEV_STYLES: Record<string, { icon: React.ReactNode; row: string }> = {
  critical:   { icon: <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />, row: "border-red-500/30 bg-red-500/10" },
  warning:    { icon: <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />, row: "border-yellow-500/30 bg-yellow-500/10" },
  unverified: { icon: <Info className="h-4 w-4 text-blue-400 flex-shrink-0" />, row: "border-blue-500/30 bg-blue-500/10" },
  ok:         { icon: <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />, row: "border-green-500/30 bg-green-500/10" },
  producing:  { icon: <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" />, row: "border-emerald-500/30 bg-emerald-500/10" },
  standby:    { icon: <Info className="h-4 w-4 text-muted-foreground flex-shrink-0" />, row: "border-border/40 bg-muted/10" },
};

function DiagnosticsTab() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.diagnostics();
      setIssues(data.issues ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading) return <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" />)}</div>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;

  const critical = issues.filter(i => i.severity === "critical");
  const warnings = issues.filter(i => i.severity === "warning");
  const ok = issues.filter(i => ["ok","producing","standby"].includes(i.severity));
  const other = issues.filter(i => !["critical","warning","ok","producing","standby"].includes(i.severity));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={fetch}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>
      {[...critical, ...warnings, ...other, ...ok].map((issue, idx) => {
        const style = SEV_STYLES[issue.severity] ?? SEV_STYLES.standby;
        const isOpen = expanded === idx;
        return (
          <div key={idx} className={`rounded-lg border ${style.row} overflow-hidden`}>
            <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setExpanded(isOpen ? null : idx)}>
              {style.icon}
              <div className="flex-1">
                <p className="text-sm font-medium">{issue.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{issue.description}</p>
              </div>
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
            </button>
            {isOpen && issue.actions.length > 0 && (
              <div className="px-4 pb-3 pt-0 border-t border-border/20">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">What to check:</p>
                <ul className="space-y-1">
                  {issue.actions.map((a, ai) => (
                    <li key={ai} className="text-xs text-foreground/70 flex gap-1.5">
                      <span className="text-muted-foreground">•</span>{a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Valve Map tab ─────────────────────────────────────────────────────────────
const TROUBLESHOOT = [
  { label: "No heating to Main House?", valves: [16,17,19,20,13,14] },
  { label: "No hot water to Annex?",    valves: [21,11,12] },
  { label: "No heating to Outbuilding?",valves: [24,25,26,32] },
  { label: "Pool not heating?",          valves: [28,29] },
  { label: "No heating to Annex?",      valves: [22,23,30,31] },
];

function ValveMap() {
  const allZones = Array.from(new Set(VALVES.map(v => v.zone)));
  const allCircuits = Array.from(new Set(VALVES.map(v => v.circuit)));
  const [filterZone, setFilterZone] = useState("All");
  const [filterCircuit, setFilterCircuit] = useState("All");
  const [openTs, setOpenTs] = useState<string | null>(null);

  const filtered = VALVES.filter(v =>
    (filterZone === "All" || v.zone === filterZone) &&
    (filterCircuit === "All" || v.circuit === filterCircuit)
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
          className="text-xs rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-foreground focus:outline-none">
          <option value="All">All zones</option>
          {allZones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={filterCircuit} onChange={e => setFilterCircuit(e.target.value)}
          className="text-xs rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-foreground focus:outline-none">
          <option value="All">All circuits</option>
          {allCircuits.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs text-muted-foreground self-center">{filtered.length} valves</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/20">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-12">V#</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Description</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Circuit</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Zone</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {filtered.map(v => (
              <tr key={v.n} className="hover:bg-accent/10">
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">V{v.n}</td>
                <td className="px-3 py-2 text-sm">{v.desc}</td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  <Badge variant="outline" className={`text-xs px-1.5 py-0 ${CIRCUIT_COLORS[v.circuit]}`}>{v.circuit}</Badge>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">{v.zone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Troubleshoot accordions */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Troubleshooting</p>
        {TROUBLESHOOT.map(t => (
          <div key={t.label} className="rounded-lg border border-border/40 overflow-hidden">
            <button className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-accent/10 transition-colors"
              onClick={() => setOpenTs(openTs === t.label ? null : t.label)}>
              <span className="text-sm">{t.label}</span>
              {openTs === t.label ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            {openTs === t.label && (
              <div className="px-4 pb-3 border-t border-border/30">
                <p className="text-xs text-muted-foreground mb-2 mt-2">Check these valves:</p>
                <div className="flex flex-wrap gap-1.5">
                  {t.valves.map(vn => {
                    const valve = VALVES.find(v => v.n === vn);
                    return (
                      <div key={vn} className="rounded border border-border/40 px-2 py-1 text-xs">
                        <span className="font-mono text-muted-foreground mr-1.5">V{vn}</span>
                        {valve?.desc}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PlantRoomPage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Wrench className="h-5 w-5 text-muted-foreground" />
        <h1 className="font-semibold text-lg">Plant Room</h1>
      </div>

      <Tabs defaultValue="diagnostics">
        <TabsList className="mb-4">
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          <TabsTrigger value="valves">Valve Map</TabsTrigger>
          <TabsTrigger value="cameras">Cameras</TabsTrigger>
        </TabsList>

        <TabsContent value="diagnostics">
          <DiagnosticsTab />
        </TabsContent>

        <TabsContent value="valves">
          <ValveMap />
        </TabsContent>

        <TabsContent value="cameras">
          {/* Re-use the cameras page content inline */}
          <p className="text-sm text-muted-foreground mb-4">
            Full camera controls available on the <a href="/cameras" className="underline hover:text-foreground">Cameras page</a>.
          </p>
          <iframe src="/cameras" className="w-full rounded-xl border border-border/40" style={{ height: "calc(100vh - 260px)" }} title="Cameras" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
