"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";
import {
  LayoutGrid,
  Users,
  Landmark,
  Receipt,
  Link2,
  Activity,
  Shield,
  FileText,
  LifeBuoy,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutGrid },
  { href: "/admin/clients", label: "Clients", icon: Users },
  { href: "/admin/onboarding", label: "Onboarding", icon: Landmark },
  { href: "/admin/billing", label: "Billing", icon: Receipt },
  { href: "/admin/gbp", label: "GBP", icon: Link2 },
  { href: "/admin/usage", label: "Usage", icon: Activity },
  { href: "/admin/roles", label: "Roles", icon: Shield },
  { href: "/admin/audit", label: "Audit", icon: FileText },
  { href: "/admin/support", label: "Support", icon: LifeBuoy },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-[calc(100vh-2rem)] flex-col rounded-2xl border border-border bg-white/80 p-4 shadow-sm transition-all",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className="flex items-center justify-between">
        <div className={cn("text-lg font-semibold", collapsed && "hidden")}>Owner Admin</div>
        <button
          aria-label="Toggle sidebar"
          className="rounded-lg p-1 text-muted-foreground hover:bg-muted/50"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? "»" : "«"}
        </button>
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
                collapsed && "justify-center",
              )}
            >
              <Icon className="h-4 w-4" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={cn("mt-auto space-y-3 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground", collapsed && "hidden")}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billing sync</p>
        <div className="flex items-center justify-between text-xs">
          <span>Stripe events</span>
          <Badge variant="success">Healthy</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Monitor webhooks and reconcile nightly jobs.</p>
      </div>
    </aside>
  );
}
