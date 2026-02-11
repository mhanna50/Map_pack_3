"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Home, Image, Settings, Star, Gauge, LifeBuoy } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: Gauge },
  { href: "/dashboard/gbp", label: "GBP Monitoring", icon: Home },
  { href: "/dashboard/reviews", label: "Reviews", icon: Star },
  { href: "/dashboard/content", label: "Content", icon: Image },
  { href: "/dashboard/settings", label: "Settings & Billing", icon: Settings },
  { href: "/dashboard/support", label: "Support", icon: LifeBuoy },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-[calc(100vh-2rem)] w-64 flex-col rounded-2xl border border-border bg-white/80 p-4 shadow-sm lg:flex">
      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/60 px-3 py-2">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Automation</p>
          <p className="text-sm font-semibold">GBP Control</p>
        </div>
        <Badge variant="success">Live</Badge>
      </div>
      <nav className="mt-6 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                active ? "bg-primary/10 text-primary shadow-inner" : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Usage</p>
        <div className="flex items-center justify-between text-xs">
          <span>Posts</span>
          <span className="font-semibold text-foreground">18 / 30</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full w-2/3 rounded-full bg-primary" />
        </div>
        <Button variant="outline" size="sm" className="w-full">
          Upgrade plan
        </Button>
      </div>
    </aside>
  );
}
