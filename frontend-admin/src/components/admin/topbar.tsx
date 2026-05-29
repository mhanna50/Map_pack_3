"use client";

import { useState } from "react";
import { ShieldCheck, LogOut } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
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
    <div className="sticky top-4 z-30 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="outline" size="sm" className={cn(refreshing && "animate-spin")} onClick={handleRefresh} aria-label="Refresh">
          <ShieldCheck className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>
      {impersonating && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <div className="flex items-center gap-2">
            <Badge variant="warning">Impersonation</Badge>
            <span>Impersonating: {impersonating.tenantName}</span>
          </div>
          <Button variant="outline" size="sm" onClick={onExitImpersonation}>
            <LogOut className="h-4 w-4" />
            Exit
          </Button>
        </div>
      )}
    </div>
  );
}
