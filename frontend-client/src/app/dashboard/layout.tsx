import { redirect } from "next/navigation";
import { TenantProvider } from "@/lib/tenant-context";
import { getOnboardingAccessState } from "@/lib/server/onboarding-guard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const access = await getOnboardingAccessState();
  if (!access.signedIn) {
    redirect("/sign-in?redirect=/dashboard");
  }
  if (!access.completed) {
    redirect("/onboarding");
  }

  return <TenantProvider>{children}</TenantProvider>;
}
