import { NextRequest, NextResponse } from "next/server";

// Tailscale CGNAT range — all Tailscale nodes use addresses in this block
const TAILSCALE_CIDR_START = ip4ToInt("100.64.0.0");
const TAILSCALE_CIDR_END   = ip4ToInt("100.127.255.255"); // /10 mask

// Home public IP — allows access on mobile data without Tailscale
const HOME_IP = "94.175.81.237";

function ip4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) | parseInt(oct, 10), 0) >>> 0;
}

function isAllowed(ip: string): boolean {
  if (!ip) return false;
  if (ip === HOME_IP) return true;
  // Strip IPv6-mapped IPv4 prefix (::ffff:x.x.x.x)
  const raw = ip.replace(/^::ffff:/, "");
  try {
    const n = ip4ToInt(raw);
    return n >= TAILSCALE_CIDR_START && n <= TAILSCALE_CIDR_END;
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  // Vercel sets x-forwarded-for; leftmost value is the real client IP
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const clientIp  = forwarded.split(",")[0].trim() || req.headers.get("x-real-ip") || "";

  if (isAllowed(clientIp)) {
    return NextResponse.next();
  }

  // Block with a plain 403 — no page content served at all
  return new NextResponse(
    "Access restricted to internal network.",
    { status: 403, headers: { "Content-Type": "text/plain" } },
  );
}

export const config = {
  // Apply to all routes except Vercel internals and static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
