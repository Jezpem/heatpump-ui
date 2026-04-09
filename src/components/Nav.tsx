"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, Activity, BarChart2, Settings, ScrollText, Camera, Wrench, Thermometer, Network, Menu, X, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const links = [
  { href: "/",            label: "Dashboard",  icon: Flame },
  { href: "/rooms",       label: "Rooms",      icon: LayoutGrid },
  { href: "/heatpump",    label: "Heat Pump",  icon: Activity },
  { href: "/plant-room",  label: "Plant Room", icon: Wrench },
  { href: "/cameras",     label: "Cameras",    icon: Camera },
  { href: "/thermostats", label: "Thermostats",icon: Thermometer },
  { href: "/network",     label: "Network",    icon: Network },
  { href: "/log",         label: "AI Log",     icon: ScrollText },
  { href: "/history",     label: "History",    icon: BarChart2 },
  { href: "/settings",    label: "Settings",   icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-b border-border/40 bg-background/95 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-7xl flex items-center h-14 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 font-semibold text-sm flex-shrink-0">
          <Flame className="h-5 w-5 text-orange-400" />
          <span className="hidden sm:inline">Heat Engine</span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex gap-0.5 flex-wrap">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors",
                pathname === href || (href !== "/" && pathname.startsWith(href))
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Mobile menu toggle */}
        <button className="ml-auto md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50"
          onClick={() => setMobileOpen(o => !o)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur px-4 py-3">
          <nav className="grid grid-cols-2 gap-1">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  pathname === href || (href !== "/" && pathname.startsWith(href))
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
