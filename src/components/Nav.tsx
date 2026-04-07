"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, Activity, BarChart2, Settings, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard", icon: Flame },
  { href: "/log", label: "AI Log", icon: ScrollText },
  { href: "/history", label: "History", icon: BarChart2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-border/40 bg-background/95 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-6xl flex items-center h-14 gap-6">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Flame className="h-5 w-5 text-orange-400" />
          <span>Heat Engine</span>
        </div>
        <nav className="flex gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
                pathname === href
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
