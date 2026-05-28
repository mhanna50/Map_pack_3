"use client";

import { RefreshCcw, Bell, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useTenant } from "@/features/tenants/tenant-context";
import { Button } from "@/components/ui/button";
import { LocationSelect } from "./location-select";
import { cn } from "@/lib/utils";

export function Topbar({ onRefresh }: { onRefresh?: () => void }) {
  const { tenant, profile, error } = useTenant();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!refreshing) return;
    const timer = setTimeout(() => setRefreshing(false), 900);
    return () => clearTimeout(timer);
  }, [refreshing]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh?.();
  };

  return (
    <header className="sticky top-2 z-30 flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-white/90 px-3 py-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-4 lg:top-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="rounded-xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">Map Pack 3</div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Client</p>
          <p className="truncate text-sm font-semibold">{tenant?.business_name ?? "Loading..."}</p>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
        <div className="hidden md:block">
          <LocationSelect />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Button variant="outline" size="sm" className={cn(refreshing && "animate-spin")} onClick={handleRefresh} aria-label="Refresh data">
          <RefreshCcw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-5 w-5 text-muted-foreground" />
        </Button>
        <div className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1">
          <UserRound className="h-4 w-4 text-muted-foreground" />
          <span className="max-w-24 truncate text-sm font-medium text-foreground sm:max-w-32">{profile?.role ?? "User"}</span>
        </div>
      </div>
    </header>
  );
}
