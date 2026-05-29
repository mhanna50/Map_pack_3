"use client";

import { MobileDashboardNav, Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { LocationSelect } from "./location-select";
import { ClientReconnectBanner } from "@/components/health/client-reconnect-banner";

type DashboardShellProps = {
  children: React.ReactNode;
  onRefresh?: () => void;
};

export function DashboardShell({ children, onRefresh }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 px-3 py-3 sm:px-4 lg:flex-row lg:gap-6 lg:py-6 2xl:px-6">
        <Sidebar />
        <div className="min-w-0 flex-1 space-y-4">
          <Topbar onRefresh={onRefresh} />
          <MobileDashboardNav />
          <div className="block md:hidden">
            <LocationSelect />
          </div>
          <ClientReconnectBanner />
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
