"use client";

import { useState } from "react";
import { ShieldCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type TopbarProps = {
  impersonating?: { tenantName: string } | null;
  onExitImpersonation?: () => void;
};

export function Topbar({ impersonating, onExitImpersonation }: TopbarProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    window.location.reload();
  };

  return (
    <div className="sticky top-2 z-30 flex min-w-0 flex-col gap-2 lg:top-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="outline" size="sm" className={cn(refreshing && "animate-spin")} onClick={handleRefresh} aria-label="Refresh">
          <ShieldCheck className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>
      {impersonating && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="warning">Impersonation</Badge>
            <span className="min-w-0 break-words">Impersonating: {impersonating.tenantName}</span>
          </div>
          <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={onExitImpersonation}>
            <LogOut className="h-4 w-4" />
            Exit
          </Button>
        </div>
      )}
    </div>
  );
}
