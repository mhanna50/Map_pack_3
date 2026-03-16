import { redirect } from "next/navigation";
import { TenantProvider } from "@/lib/tenant-context";
import { getOnboardingAccessState } from "@/lib/server/onboarding-guard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const access = await getOnboardingAccessState();
  if (!access.signedIn) {
    redirect("/sign-in?redirect=/dashboard");
  }
  if (access.role === "owner_admin") {
    const adminBase = (process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "http://localhost:3002").replace(/\/$/, "");
    redirect(`${adminBase}/admin`);
  }
  if (access.role !== "client") {
    redirect("/sign-in?redirect=/dashboard&error=invalid_role");
  }
  if (!access.completed) {
    const onboardingTarget = access.destination && access.destination.startsWith("/onboarding")
      ? access.destination
      : "/onboarding";
    redirect(onboardingTarget);
  }

  return <TenantProvider>{children}</TenantProvider>;
}
