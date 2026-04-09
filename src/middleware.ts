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
  // If we can't determine the IP (misconfigured proxy), fail open
  if (!ip) return true;
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
  // IP restriction temporarily disabled — fail open for all requests
  void req;
  return NextResponse.next();
}

export const config = {
  // Apply to all routes except Vercel internals and static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
