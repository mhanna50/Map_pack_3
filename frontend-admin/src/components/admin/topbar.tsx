"use client";

import { useEffect, useState } from "react";
import { Search, Sparkles, ShieldCheck, LogOut } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "../ui/toast";

type TopbarProps = {
  onSearch?: (term: string) => void;
  impersonating?: { tenantName: string } | null;
  onExitImpersonation?: () => void;
  quickAction?: () => void;
};

export function Topbar({ onSearch, impersonating, onExitImpersonation, quickAction }: TopbarProps) {
  const { pushToast } = useToast();
  const [term, setTerm] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (term.trim().length >= 2) onSearch?.(term.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [term, onSearch]);

  const handleRefresh = () => {
    setRefreshing(true);
    pushToast({ title: "Refreshing data", tone: "info" });
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <header className="sticky top-4 z-30 flex flex-col gap-2 rounded-2xl border border-border bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Global search: tenants, email, domain"
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" className={cn(refreshing && "animate-spin")} onClick={handleRefresh} aria-label="Refresh">
          <ShieldCheck className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
        <Button variant="primary" size="sm" onClick={quickAction}>
          <Sparkles className="h-4 w-4" />
          Quick action
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
    </header>
  );
}
