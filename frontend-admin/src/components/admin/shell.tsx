"use client";

import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useToast } from "../ui/toast";

type ShellProps = {
  children: React.ReactNode;
  impersonation?: { tenantName: string } | null;
  onExitImpersonation?: () => void;
};

export function AdminShell({ children, impersonation, onExitImpersonation }: ShellProps) {
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
            impersonating={impersonation ?? null}
            onExitImpersonation={onExitImpersonation}
          />
          {children}
        </div>
      </div>
    </div>
  );
}
