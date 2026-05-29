"use client";

import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useToast } from "@/components/ui/toast";

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
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 px-3 py-3 sm:px-4 lg:flex-row lg:gap-6 lg:py-6 2xl:px-6">
        <Sidebar />
        <div className="min-w-0 flex-1 space-y-4">
          <Topbar
            impersonating={impersonation ?? null}
            onExitImpersonation={onExitImpersonation}
          />
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
