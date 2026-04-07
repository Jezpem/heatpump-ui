/**
 * Railway Heat Engine API client.
 * All write operations go through here; reads go direct to Supabase.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const SECRET = process.env.NEXT_PUBLIC_API_SECRET ?? "";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(SECRET ? { Authorization: `Bearer ${SECRET}` } : {}),
    ...((opts.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  /** Full automation state from in-memory Python process */
  status: () => apiFetch("/api/status"),

  /** Rich rooms + boilers response */
  rooms: () => apiFetch("/api/rooms"),

  /** Recent automation log rows */
  log: (hours = 24, limit = 60, room = "") =>
    apiFetch(`/api/log?hours=${hours}&limit=${limit}${room ? `&room=${encodeURIComponent(room)}` : ""}`),

  /** Temperature history for charting */
  history: (hours = 24, zones = "") =>
    apiFetch(`/api/history?hours=${hours}${zones ? `&zones=${encodeURIComponent(zones)}` : ""}`),

  /** Current config */
  config: () => apiFetch("/api/config"),

  /** Save config */
  saveConfig: (config: object) =>
    apiFetch("/api/config", { method: "POST", body: JSON.stringify({ config }) }),

  /** Force an immediate AI cycle */
  cycle: () => apiFetch("/api/cycle", { method: "POST" }),

  /** Set a TRV valve position */
  setValve: (deviceId: string, positionPct: number, label = "", cloudId = "") =>
    apiFetch("/api/valve", {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, position_pct: positionPct, label, cloud_id: cloudId }),
    }),

  /** Set a Nest zone setpoint */
  setNest: (zoneName: string, setpointC: number) =>
    apiFetch("/api/nest", { method: "POST", body: JSON.stringify({ zone_name: zoneName, setpoint_c: setpointC }) }),

  /** Submit a user action note */
  submitAction: (action: string) =>
    apiFetch("/api/action", { method: "POST", body: JSON.stringify({ action }) }),

  /** Ask the AI why */
  askWhy: (question: string) =>
    apiFetch("/api/ask", { method: "POST", body: JSON.stringify({ question }) }),

  /** Health check */
  health: () => apiFetch("/api/health"),
};
