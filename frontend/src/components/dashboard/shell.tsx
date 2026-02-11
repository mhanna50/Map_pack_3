"use client";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { LocationSelect } from "./location-select";

type DashboardShellProps = {
  children: React.ReactNode;
  onRefresh?: () => void;
};

export function DashboardShell({ children, onRefresh }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 lg:flex-row lg:gap-6 lg:py-6">
        <Sidebar />
        <div className="flex-1 space-y-4">
          <Topbar onRefresh={onRefresh} />
          <div className="block md:hidden">
            <LocationSelect />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
