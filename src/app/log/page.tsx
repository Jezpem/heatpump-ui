"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { AutomationLogRow } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Brain, RefreshCw } from "lucide-react";

const PHASE_STYLES: Record<string, string> = {
  HEATING:  "bg-red-500/15 text-red-300 border-red-500/30",
  COASTING: "bg-green-500/15 text-green-300 border-green-500/30",
  IDLE:     "bg-blue-500/15 text-blue-300 border-blue-500/30",
  PARKED:   "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
};

const HOUR_OPTIONS = [6, 12, 24, 48];

export default function LogPage() {
  const [rows, setRows] = useState<AutomationLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);
  const [filterRoom, setFilterRoom] = useState("All");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [newCount, setNewCount] = useState(0);
  const isFirstLoad = useRef(true);

  const fetchLog = useCallback(async (h: number) => {
    setLoading(true);
    const cutoff = new Date(Date.now() - h * 3600_000).toISOString();
    const { data } = await supabase
      .from("automation_log")
      .select("ts,room_name,phase,room_temp_c,target_set_c,action,reason")
      .gte("ts", cutoff)
      .order("ts", { ascending: false })
      .limit(200);
    setRows((data as AutomationLogRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLog(hours); }, [hours, fetchLog]);

  // Realtime subscription — highlight new entries
  useEffect(() => {
    const ch = supabase
      .channel("log_realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "automation_log" }, payload => {
        const newRow = payload.new as AutomationLogRow;
        setRows(prev => [newRow, ...prev].slice(0, 200));
        if (!isFirstLoad.current) setNewCount(n => n + 1);
        isFirstLoad.current = false;
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const allRooms = ["All", ...Array.from(new Set(rows.map(r => r.room_name)))];
  const filtered = filterRoom === "All" ? rows : rows.filter(r => r.room_name === filterRoom);

  // Group into boiler vs room rows
  const displayed = filtered.filter(r => !r.room_name.startsWith("_trv:"));

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-400" />
          <h1 className="font-semibold text-lg">AI Decision Log</h1>
          {newCount > 0 && (
            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
              +{newCount} new
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border/50 overflow-hidden text-xs">
            {HOUR_OPTIONS.map(h => (
              <button
                key={h}
                className={`px-3 py-1.5 transition-colors ${
                  hours === h ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => { setHours(h); setNewCount(0); }}
              >
                {h}h
              </button>
            ))}
          </div>
          <button
            className="p-1.5 rounded-md border border-border/50 text-muted-foreground hover:text-foreground"
            onClick={() => fetchLog(hours)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Room filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {allRooms.map(r => (
          <button
            key={r}
            className={`rounded-full px-3 py-1 text-xs border transition-colors ${
              filterRoom === r
                ? "bg-accent text-accent-foreground border-accent"
                : "border-border/50 text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setFilterRoom(r)}
          >
            {r}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />)}
        </div>
      ) : displayed.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-12">No entries in the last {hours}h</p>
      ) : (
        <div className="space-y-1.5">
          {displayed.map((row, idx) => {
            const isBoiler = row.room_name.startsWith("_boiler:");
            const zoneName = isBoiler ? row.room_name.replace("_boiler:", "") : null;
            const localTime = new Date(row.ts).toLocaleTimeString("en-GB", {
              hour: "2-digit", minute: "2-digit", second: "2-digit",
            });
            const localDate = new Date(row.ts).toLocaleDateString("en-GB", {
              weekday: "short", day: "numeric", month: "short",
            });
            const isExpanded = expandedIdx === idx;

            return (
              <div
                key={`${row.ts}-${idx}`}
                className={`rounded-lg border transition-colors cursor-pointer ${
                  isBoiler
                    ? "border-orange-500/20 bg-orange-500/5"
                    : "border-border/40 bg-card hover:bg-accent/10"
                }`}
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              >
                <div className="flex items-start gap-3 px-4 py-2.5">
                  <div className="flex-shrink-0 text-right min-w-[80px]">
                    <div className="text-xs font-medium text-foreground/70 tabular-nums">{localTime}</div>
                    <div className="text-xs text-muted-foreground">{localDate}</div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium text-sm ${isBoiler ? "text-orange-300" : ""}`}>
                        {isBoiler ? `🔥 ${zoneName}` : row.room_name}
                      </span>
                      {row.phase && (
                        <Badge variant="outline" className={`text-xs px-1.5 py-0 ${PHASE_STYLES[row.phase] ?? ""}`}>
                          {row.phase}
                        </Badge>
                      )}
                      {row.room_temp_c != null && (
                        <span className="text-xs text-muted-foreground">{row.room_temp_c.toFixed(1)}°C</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{row.action}</p>
                  </div>
                </div>

                {/* Expanded reasoning */}
                {isExpanded && row.reason && (
                  <div className="px-4 pb-3 pt-0">
                    <div className="rounded-md bg-muted/30 px-3 py-2 text-sm leading-relaxed text-foreground/80 border-l-2 border-purple-500/40">
                      {row.reason}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
