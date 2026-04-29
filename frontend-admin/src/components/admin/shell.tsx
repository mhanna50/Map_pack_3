"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { Button } from "../ui/button";
import { Sheet } from "../ui/sheet";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { useToast } from "../ui/toast";

type ShellProps = {
  children: React.ReactNode;
  onSearch?: (term: string) => void;
  impersonation?: { tenantName: string } | null;
  onExitImpersonation?: () => void;
};

export function AdminShell({ children, onSearch, impersonation, onExitImpersonation }: ShellProps) {
  const [quickOpen, setQuickOpen] = useState(false);
  const { pushToast } = useToast();

  useEffect(() => {
    if (impersonation) {
      pushToast({ title: `Impersonating ${impersonation.tenantName}`, tone: "info" });
    }
  }, [impersonation, pushToast]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:gap-6 lg:py-6">
        <Sidebar />
        <div className="flex-1 space-y-4">
          <Topbar
            onSearch={onSearch}
            impersonating={impersonation ?? null}
            onExitImpersonation={onExitImpersonation}
            quickAction={() => setQuickOpen(true)}
          />
          {children}
        </div>
      </div>

      <Sheet
        open={quickOpen}
        onOpenChange={setQuickOpen}
        title="Quick actions"
        description="Jump to tenants, billing, or run scripts"
      >
        <div className="space-y-3">
          <Input placeholder="Tenant name or email" />
          <div className="flex flex-wrap gap-2">
            <Badge variant="muted">Sync Stripe</Badge>
            <Badge variant="muted">Refresh GBP tokens</Badge>
            <Badge variant="muted">Purge cache</Badge>
          </div>
          <Button className="w-full" onClick={() => pushToast({ title: "Queued actions (placeholder)", tone: "info" })}>
            Run selected
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
