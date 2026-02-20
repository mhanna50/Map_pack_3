"use client";

import { TenantProvider } from "@/lib/tenant-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <TenantProvider>{children}</TenantProvider>;
}
