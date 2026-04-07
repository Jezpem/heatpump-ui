import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Lazy-initialise so build-time pre-rendering doesn't crash when env vars are absent.
let _client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (!_client) {
    if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
    _client = createClient(url, key);
  }
  return _client;
}

/** Convenience re-export for components that call it at mount time (client-only) */
export const supabase = {
  from: (table: string) => getSupabase().from(table),
  channel: (name: string) => getSupabase().channel(name),
  removeChannel: (ch: ReturnType<SupabaseClient["channel"]>) => getSupabase().removeChannel(ch),
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface AutomationLogRow {
  ts: string;
  room_name: string;
  phase: string | null;
  room_temp_c: number | null;
  target_set_c: number | null;
  action: string;
  reason: string | null;
}

export interface ZoneTempRow {
  ts: string;
  zone_name: string;
  source: string;
  current_temp_c: number | null;
  set_temp_c: number | null;
}

export interface TrvDetail {
  name: string;
  device_id: string;
  current_temp: number | null;
  valve_pct: number | null;
  battery: number | null;
  connected: boolean;
}

export interface BoilerStatus {
  on: boolean;
  setpoint_c: number;
  current_temp: number | null;
  hvac_status: string;
}

export interface RoomStatus {
  name: string;
  room_type: "bedroom" | "living" | "zone_only";
  nest_zone_name: string;
  phase: "HEATING" | "COASTING" | "IDLE" | "PARKED";
  current_temp: number | null;
  day_target_temp_c: number;
  night_target_temp_c: number;
  max_temp_c: number;
  min_pos_pct: number;
  night_pos_pct: number;
  enabled: boolean;
  reasoning: string;
  eta_min: number | null;
  trvs: TrvDetail[];
  shelly_zones: string[];
}

export interface HeatEngineStatus {
  rooms: RoomStatus[];
  boilers: Record<string, BoilerStatus>;
  is_night: boolean;
  enabled: boolean;
  last_eval: string | null;
  next_eval: string | null;
  last_reasoning: string;
  last_suggestion: string;
}
